import { describe, expect, it } from "vitest";

import { ZCV_LIMITS, ZCV_PRODUCT } from "../config";
import { hashClaimSecret } from "../crypto";
import { createMediaToken } from "../media";
import { ZcvError } from "../types";
import {
  createHarness,
  paidCheckoutEvent,
  signedWebhook,
  TEST_MEDIA_SECRET,
} from "./harness";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function readyPreview(
  harness: Awaited<ReturnType<typeof createHarness>>,
  userId?: string
) {
  const bot = harness.service.issueBotChallenge();
  const created = await harness.service.createPreview({
    ip: "1.1.1.1",
    file: { buffer: png, contentType: "image/jpeg", size: 1200 },
    rightsAccepted: true,
    bot,
    userId,
  });
  await harness.service.pollPreview(created.previewId, created.claimSecret);
  return created;
}

async function paidOrder(
  harness: Awaited<ReturnType<typeof createHarness>>,
  userId = "user_a"
) {
  const preview = await readyPreview(harness, userId);
  const checkout = await harness.service.createCheckout({
    userId,
    previewId: preview.previewId,
    claimSecret: preview.claimSecret,
  });
  const event = paidCheckoutEvent({
    eventId: `evt_${checkout.orderId}`,
    orderId: checkout.orderId,
    userId,
  });
  const signed = signedWebhook(harness.stripe, event);
  const result = await harness.service.handleStripeWebhook(
    signed.payload,
    signed.signature
  );
  return { preview, checkout, result };
}

describe("Zombie Couple Video product", () => {
  it("server decides amount, currency, product and owner", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const checkout = await harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });
    const order = await harness.store.getOrder(checkout.orderId);
    expect(order?.amountCents).toBe(699);
    expect(order?.currency).toBe("usd");
    expect(order?.productId).toBe(ZCV_PRODUCT.id);
    expect(order?.userId).toBe("user_a");
    expect(harness.service.publicProduct().subscription).toBe(false);
  });

  it("success page never grants", async () => {
    const harness = await createHarness();
    expect(() => harness.service.successPageGrant()).toThrowError(ZcvError);
  });

  it("rejects bad signatures and grants nothing", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const checkout = await harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });
    const event = paidCheckoutEvent({
      eventId: "evt_bad_sig",
      orderId: checkout.orderId,
      userId: "user_a",
    });
    await expect(
      harness.service.handleStripeWebhook(JSON.stringify(event), "t=1,v1=nope")
    ).rejects.toMatchObject({ code: "bad_signature" });
    const order = await harness.store.getOrder(checkout.orderId);
    expect(order?.paidAt).toBeNull();
    expect(await harness.store.getJobByOrder(checkout.orderId)).toBeNull();
  });

  it("failed or cancelled payments grant nothing", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const checkout = await harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });

    for (const [eventId, type, paymentStatus] of [
      ["evt_fail", "checkout.session.async_payment_failed", "unpaid"],
      ["evt_cancel", "checkout.session.expired", "unpaid"],
      ["evt_unpaid", "checkout.session.completed", "unpaid"],
    ] as const) {
      const event = {
        ...paidCheckoutEvent({
          eventId,
          orderId: checkout.orderId,
          userId: "user_a",
          paymentStatus,
        }),
        type,
      };
      const signed = signedWebhook(harness.stripe, event);
      const result = await harness.service.handleStripeWebhook(
        signed.payload,
        signed.signature
      );
      expect(result.granted).toBe(false);
    }

    const order = await harness.store.getOrder(checkout.orderId);
    expect(order?.paidAt).toBeNull();
    expect(await harness.store.getJobByOrder(checkout.orderId)).toBeNull();
  });

  it("same event delivered 10 times including concurrently never double-grants", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const checkout = await harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });
    const event = paidCheckoutEvent({
      eventId: "evt_repeat",
      orderId: checkout.orderId,
      userId: "user_a",
    });
    const signed = signedWebhook(harness.stripe, event);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        harness.service.handleStripeWebhook(signed.payload, signed.signature)
      )
    );
    expect(results.filter((item) => item.granted).length).toBe(1);
    const jobs = await harness.client.query("SELECT * FROM zcv_jobs");
    expect(jobs.rows).toHaveLength(1);
    const events = await harness.client.query("SELECT * FROM zcv_stripe_events");
    expect(events.rows).toHaveLength(1);
  });

  it("different events for one order never double-create jobs", async () => {
    const harness = await createHarness();
    const paid = await paidOrder(harness);
    const second = paidCheckoutEvent({
      eventId: "evt_other",
      orderId: paid.checkout.orderId,
      userId: "user_a",
    });
    const signed = signedWebhook(harness.stripe, second);
    const result = await harness.service.handleStripeWebhook(
      signed.payload,
      signed.signature
    );
    expect(result.granted).toBe(true);
    const jobs = await harness.client.query("SELECT * FROM zcv_jobs");
    expect(jobs.rows).toHaveLength(1);
  });

  it("jobs are persisted and recoverable by querying, not blind retry", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    expect(job).toBeTruthy();
    await harness.service.startOrRecoverJob(job!.id);
    expect(harness.provider.videoCalls).toBe(1);
    const submitted = await harness.store.getJob(job!.id);
    expect(submitted?.kieVideoTaskId).toBe("vid_1");
    expect(submitted?.status).toBe("video_submitted");

    await harness.service.reconcileJob(job!.id);
    expect(harness.provider.videoCalls).toBe(1);
    expect(harness.provider.queryCalls).toBeGreaterThan(0);

    harness.provider.tasks.set("vid_1", {
      status: "completed",
      resultUrl: "https://example.test/video.mp4",
      kind: "video",
    });
    await harness.service.reconcileJob(job!.id);
    const completed = await harness.store.getJob(job!.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.videoKey).toBeTruthy();
  });

  it("tracks paid and delivered separately", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const paid = await paidOrder(harness);
    const order = await harness.store.getOrder(paid.checkout.orderId);
    expect(order?.paidAt).toBeTruthy();
    expect(order?.deliveredAt).toBeNull();
    expect(order?.status).toBe("paid");
  });

  it("denies cross-user file and order access", async () => {
    const harness = await createHarness();
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    await harness.service.startOrRecoverJob(job!.id);
    await harness.service.reconcileJob(job!.id);
    await expect(
      harness.service.getOrderForUser(paid.checkout.orderId, "user_b")
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      harness.service.createDownloadLink(paid.checkout.orderId, "user_b")
    ).rejects.toMatchObject({ code: "not_found" });

    const link = await harness.service.createDownloadLink(
      paid.checkout.orderId,
      "user_a"
    );
    await expect(
      harness.service.readMedia(link.url.split("/").pop()!, "user_b")
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects upload type/size problems and missing rights checkbox", async () => {
    const harness = await createHarness();
    const bot = harness.service.issueBotChallenge();
    await expect(
      harness.service.createPreview({
        ip: "2.2.2.2",
        file: { buffer: png, contentType: "image/gif", size: 100 },
        rightsAccepted: true,
        bot,
      })
    ).rejects.toMatchObject({ code: "invalid_type" });

    await expect(
      harness.service.createPreview({
        ip: "2.2.2.2",
        file: {
          buffer: png,
          contentType: "image/jpeg",
          size: ZCV_LIMITS.maxUploadBytes + 1,
        },
        rightsAccepted: true,
        bot: harness.service.issueBotChallenge(),
      })
    ).rejects.toMatchObject({ code: "file_too_large" });

    await expect(
      harness.service.createPreview({
        ip: "2.2.2.2",
        file: { buffer: png, contentType: "image/jpeg", size: 100 },
        rightsAccepted: false,
        bot: harness.service.issueBotChallenge(),
      })
    ).rejects.toMatchObject({ code: "rights_required" });
  });

  it("free entry has bot check, rate limit and daily budget cap", async () => {
    const harness = await createHarness();
    await expect(
      harness.service.createPreview({
        ip: "3.3.3.3",
        file: { buffer: png, contentType: "image/jpeg", size: 100 },
        rightsAccepted: true,
        bot: { token: "nope", timestamp: Date.now(), nonce: "x" },
      })
    ).rejects.toMatchObject({ code: "bot_check_failed" });

    for (let i = 0; i < ZCV_LIMITS.previewRateLimitPerHour; i += 1) {
      await harness.service.createPreview({
        ip: "4.4.4.4",
        file: { buffer: png, contentType: "image/jpeg", size: 100 },
        rightsAccepted: true,
        bot: harness.service.issueBotChallenge(),
      });
    }
    await expect(
      harness.service.createPreview({
        ip: "4.4.4.4",
        file: { buffer: png, contentType: "image/jpeg", size: 100 },
        rightsAccepted: true,
        bot: harness.service.issueBotChallenge(),
      })
    ).rejects.toMatchObject({ code: "rate_limited" });

    const day = new Date().toISOString().slice(0, 10);
    await harness.client.query(
      `UPDATE zcv_daily_budget
       SET preview_count = $2, preview_cost_credits = $3
       WHERE day = $1::date`,
      [
        day,
        ZCV_LIMITS.dailyPreviewBudget,
        ZCV_LIMITS.dailyPreviewCreditBudget,
      ]
    );
    await expect(
      harness.service.createPreview({
        ip: "5.5.5.5",
        file: { buffer: png, contentType: "image/jpeg", size: 100 },
        rightsAccepted: true,
        bot: harness.service.issueBotChallenge(),
      })
    ).rejects.toMatchObject({ code: "budget_exceeded" });
  });

  it("anonymous preview is not claimable by bare id", async () => {
    const harness = await createHarness();
    const created = await readyPreview(harness);
    await expect(
      harness.service.getPreview(created.previewId, "wrong-secret")
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      harness.service.claimPreview(created.previewId, "wrong-secret", "user_b")
    ).rejects.toMatchObject({ code: "claim_denied" });
    const claimed = await harness.service.claimPreview(
      created.previewId,
      created.claimSecret,
      "user_a"
    );
    expect(claimed.ownerUserId).toBe("user_a");
    await expect(
      harness.service.claimPreview(
        created.previewId,
        created.claimSecret,
        "user_b"
      )
    ).rejects.toMatchObject({ code: "claim_denied" });
    expect(hashClaimSecret(created.claimSecret)).not.toBe(created.previewId);
  });

  it("free users never trigger Kling and every provider call is logged", async () => {
    const harness = await createHarness();
    const created = await readyPreview(harness);
    expect(harness.provider.videoCalls).toBe(0);
    expect(harness.provider.imageCalls).toBe(1);
    const logs = await harness.store.listProviderLogs();
    expect(logs.some((log) => log.purpose === "preview_image")).toBe(true);
    expect(logs.every((log) => log.model !== "kling-2.6/image-to-video")).toBe(
      true
    );
    expect(logs[0]?.taskId).toBeTruthy();
    expect(logs[0]?.costCredits).toBe(5);
    expect(logs[0]?.status).toBeTruthy();

    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    await harness.service.startOrRecoverJob(job!.id);
    expect(harness.provider.videoCalls).toBe(1);
    const later = await harness.store.listProviderLogs();
    expect(later.some((log) => log.purpose === "paid_video")).toBe(true);
    expect(later.some((log) => log.model === "kling-2.6/image-to-video")).toBe(
      true
    );
    expect(created.previewId).toBeTruthy();
  });

  it("does not treat a download token as a grant", async () => {
    const harness = await createHarness();
    const token = createMediaToken(TEST_MEDIA_SECRET, {
      key: "zcv/other/video.mp4",
      purpose: "download",
      userId: "user_a",
      orderId: "missing",
      exp: Date.now() + 60_000,
    });
    await expect(harness.service.readMedia(token, "user_a")).rejects.toMatchObject(
      { code: "forbidden" }
    );
  });
});

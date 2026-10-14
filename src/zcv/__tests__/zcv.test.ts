import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { ZCV_LIMITS, ZCV_PRODUCT } from "../config";
import { hashClaimSecret } from "../crypto";
import { createMediaToken } from "../media";
import { ZcvError } from "../types";
import { assertZcvStripeMode } from "../stripe-mode";
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
    file: { buffer: png, contentType: "image/png", size: png.length },
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
  it("rejects live Stripe keys in test mode unless live payments are explicitly enabled", () => {
    expect(() =>
      assertZcvStripeMode("sk_live_sensitive", "test", "false")
    ).toThrow("Test mode requires a Stripe test secret key");
    expect(() =>
      assertZcvStripeMode("sk_live_sensitive", "live", "false")
    ).toThrow("Live payments are not explicitly enabled");
    expect(assertZcvStripeMode("sk_test_zcv", undefined, undefined)).toBe(
      "test"
    );
  });
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

  it("rejects webhook events with a mismatched owner, amount, product, or Stripe session", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const checkout = await harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });
    const cases = [
      { eventId: "evt_wrong_owner", userId: "user_b" },
      { eventId: "evt_wrong_amount", userId: "user_a", amountCents: 1 },
      { eventId: "evt_wrong_product", userId: "user_a", productId: "other" },
      { eventId: "evt_wrong_session", userId: "user_a", sessionId: "cs_other" },
    ];
    for (const testCase of cases) {
      const event = paidCheckoutEvent({
        orderId: checkout.orderId,
        ...testCase,
      });
      const signed = signedWebhook(harness.stripe, event);
      const result = await harness.service.handleStripeWebhook(
        signed.payload,
        signed.signature
      );
      expect(result.granted).toBe(false);
    }
    expect((await harness.store.getOrder(checkout.orderId))?.paidAt).toBeNull();
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

  it("replays a paid webhook after payment and job persistence roll back", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const checkout = await harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });
    const event = paidCheckoutEvent({
      eventId: "evt_payment_recovery",
      orderId: checkout.orderId,
      userId: "user_a",
    });
    const signed = signedWebhook(harness.stripe, event);

    await harness.client.exec(
      "ALTER TABLE zcv_jobs ADD CONSTRAINT test_reject_job CHECK (status <> 'pending')"
    );
    await expect(
      harness.service.handleStripeWebhook(signed.payload, signed.signature)
    ).rejects.toThrow();
    await harness.client.exec(
      "ALTER TABLE zcv_jobs DROP CONSTRAINT test_reject_job"
    );

    const replay = await harness.service.handleStripeWebhook(
      signed.payload,
      signed.signature
    );
    const order = await harness.store.getOrder(checkout.orderId);
    const job = await harness.store.getJobByOrder(checkout.orderId);
    expect(replay.granted).toBe(true);
    expect(order?.paidAt).toBeTruthy();
    expect(job).toBeTruthy();
  });

  it("uses one idempotent checkout session for concurrent and repeated requests", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const seenKeys: Array<string | undefined> = [];
    const byKey = new Map<string, { id: string; url: string }>();
    harness.stripeGateway.createCheckoutSession = async (input) => {
      const key = (input as typeof input & { idempotencyKey?: string })
        .idempotencyKey;
      seenKeys.push(key);
      const sessionKey = key || `no-key-${seenKeys.length}`;
      let session = byKey.get(sessionKey);
      if (!session) {
        session = {
          id: `cs_${seenKeys.length}`,
          url: `https://checkout.test/${seenKeys.length}`,
        };
        byKey.set(sessionKey, session);
      }
      return session;
    };
    const input = {
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    };

    const concurrent = await Promise.allSettled([
      harness.service.createCheckout(input),
      harness.service.createCheckout(input),
    ]);
    const successful = concurrent.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    expect(successful).toHaveLength(2);
    expect(successful[0]?.orderId).toBe(successful[1]?.orderId);
    expect(successful[0]?.url).toBe(successful[1]?.url);

    const repeated = await harness.service.createCheckout(input);
    expect(repeated.orderId).toBe(successful[0]?.orderId);
    expect(repeated.url).toBe(successful[0]?.url);
    expect(seenKeys).toHaveLength(3);
    expect(seenKeys[0]).toBeTruthy();
    expect(new Set(seenKeys).size).toBe(1);
  });

  it("keeps disjoint order patches during concurrent updates", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const checkout = await harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });
    const paidAt = new Date("2026-01-01T00:00:00.000Z");
    await Promise.all([
      harness.store.updateOrder(checkout.orderId, {
        status: "paid",
        paidAt,
      }),
      harness.store.updateOrder(checkout.orderId, { jobId: "job_after_payment" }),
    ]);

    const order = await harness.store.getOrder(checkout.orderId);
    expect(order?.paidAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(order?.jobId).toBe("job_after_payment");
  });

  it("submits only one paid video task for concurrent job recovery", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const submissions: string[] = [];
    harness.provider.createVideoTask = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const taskId = `vid_race_${submissions.length + 1}`;
      submissions.push(taskId);
      harness.provider.tasks.set(taskId, { status: "processing", kind: "video" });
      return { taskId, costCredits: 55, raw: { consumeCredits: 55 } };
    };
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);

    await Promise.all([
      harness.service.startOrRecoverJob(job!.id),
      harness.service.startOrRecoverJob(job!.id),
    ]);

    expect(submissions).toHaveLength(1);
  });

  it("does not resubmit a paid job after provider submission times out ambiguously", async () => {
    const harness = await createHarness({ providerTimeoutMs: 10 });
    let calls = 0;
    harness.provider.createVideoTask = async () => {
      calls += 1;
      throw new Error("provider request timed out; task status unknown");
    };
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);

    await harness.service.startOrRecoverJob(job!.id).catch(() => null);
    await harness.service.startOrRecoverJob(job!.id).catch(() => null);

    expect(calls).toBe(1);
    expect((await harness.store.getJob(job!.id))?.status).toBe(
      "submission_unknown"
    );
  });

  it("retries one video rejected by gore review and only delivers an approved result", async () => {
    const harness = await createHarness();
    harness.provider.reviewResults = [
      { safe: false, reason: "visible blood" },
      { safe: true, reason: "no gore", costCredits: 0.0123 },
    ];
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    await harness.service.startOrRecoverJob(job!.id);
    expect(harness.provider.videoCalls).toBe(2);
    expect((await harness.store.getOrder(paid.checkout.orderId))?.deliveredAt).toBeNull();

    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    await harness.service.reconcileJob(job!.id);
    const completed = await harness.store.getJob(job!.id);
    const order = await harness.store.getOrder(paid.checkout.orderId);
    expect(harness.provider.reviewCalls).toBe(2);
    expect(completed?.moderationStatus).toBe("approved");
    expect(completed?.status).toBe("completed");
    expect(order?.deliveredAt).toBeTruthy();
    const moderationCosts = (await harness.store.listProviderLogs())
      .filter((log) => log.purpose === "moderation")
      .map((log) => log.costCredits);
    expect(moderationCosts).toEqual([null, 0.0123]);
  });

  it("marks the order refund-pending when both generated videos fail gore review", async () => {
    const harness = await createHarness();
    harness.provider.reviewResults = [
      { safe: false, reason: "visible wound" },
      { safe: false, reason: "visible blood" },
    ];
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    await harness.service.startOrRecoverJob(job!.id);
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    await harness.service.reconcileJob(job!.id);
    await harness.service.reconcileJob(job!.id);

    const failed = await harness.store.getJob(job!.id);
    const order = await harness.store.getOrder(paid.checkout.orderId);
    expect(harness.provider.videoCalls).toBe(2);
    expect(failed?.status).toBe("refund_pending");
    expect(order?.status).toBe("refund_pending");
    expect(order?.deliveredAt).toBeNull();
    expect(harness.storage.files.has(`zcv/${paid.preview.previewId}/video.mp4`)).toBe(false);
  });

  it("does not repeat a billed moderation request when its result is unknown", async () => {
    const harness = await createHarness();
    harness.provider.reviewError = new Error("moderation timed out");
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    await harness.service.startOrRecoverJob(job!.id);
    await harness.service.reconcileJob(job!.id);
    await harness.service.reconcileJob(job!.id);

    const needsCheck = await harness.store.getJob(job!.id);
    expect(harness.provider.reviewCalls).toBe(1);
    expect(harness.provider.videoCalls).toBe(1);
    expect(needsCheck?.status).toBe("needs_check");
    expect((await harness.store.getOrder(paid.checkout.orderId))?.deliveredAt).toBeNull();
    const moderationLogs = (await harness.store.listProviderLogs()).filter(
      (log) => log.purpose === "moderation"
    );
    expect(moderationLogs).toHaveLength(1);
    expect(moderationLogs[0]?.costCredits).toBeNull();
  });

  it("keeps a paid job recoverable when delivery persistence fails", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    await harness.service.startOrRecoverJob(job!.id);
    const submitted = await harness.store.getJob(job!.id);
    const task = harness.provider.tasks.get(submitted!.kieVideoTaskId!);
    task!.status = "completed";
    task!.resultUrl = "https://example.test/video.mp4";
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    await harness.client.exec(
      "ALTER TABLE zcv_orders ADD CONSTRAINT test_block_delivery CHECK (delivered_at IS NULL)"
    );

    await expect(harness.service.reconcileJob(job!.id)).rejects.toThrow();
    const interrupted = await harness.store.getJob(job!.id);
    const recoverableBeforeRetry = await harness.store.listRecoverableJobs();
    expect(interrupted?.status).toBe("video_submitted");
    expect(recoverableBeforeRetry.some((item) => item.id === job!.id)).toBe(true);

    await harness.client.exec(
      "ALTER TABLE zcv_orders DROP CONSTRAINT test_block_delivery"
    );
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    await harness.service.reconcileOpenJobs();
    const deliveredOrder = await harness.store.getOrder(paid.checkout.orderId);
    const deliveredJob = await harness.store.getJob(job!.id);
    expect(deliveredOrder?.deliveredAt).toBeTruthy();
    expect(deliveredJob?.status).toBe("completed");
  });

  it("continues reconciling later jobs after one provider query fails", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const paidA = await paidOrder(harness, "user_a");
    const paidB = await paidOrder(harness, "user_b");
    const jobA = await harness.store.getJobByOrder(paidA.checkout.orderId);
    const jobB = await harness.store.getJobByOrder(paidB.checkout.orderId);
    await harness.service.startOrRecoverJob(jobA!.id);
    await harness.service.startOrRecoverJob(jobB!.id);
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    const getTask = harness.provider.getTask.bind(harness.provider);
    let calls = 0;
    harness.provider.getTask = async (taskId) => {
      calls += 1;
      if (calls === 1) throw new Error("temporary provider timeout");
      return getTask(taskId);
    };

    const results = await harness.service.reconcileOpenJobs();

    expect(calls).toBe(2);
    expect(results).toHaveLength(2);
  });

  it("rejects a zero preview budget before inserting its first row", async () => {
    const harness = await createHarness();

    const allowed = await harness.store.consumeDailyBudget({
      day: "2026-01-01",
      maxCount: 0,
      maxCredits: 0,
      costCredits: 5,
    });

    expect(allowed).toBe(false);
  });

  it("atomically reserves the final daily preview budget slot", async () => {
    const harness = await createHarness();
    const day = "2026-01-02";
    await harness.store.consumeDailyBudget({
      day,
      maxCount: 1,
      maxCredits: 5,
      costCredits: 5,
    });
    const reservations = await Promise.all([
      harness.store.consumeDailyBudget({
        day,
        maxCount: 2,
        maxCredits: 10,
        costCredits: 5,
      }),
      harness.store.consumeDailyBudget({
        day,
        maxCount: 2,
        maxCredits: 10,
        costCredits: 5,
      }),
    ]);
    const rows = await harness.client.query(
      "SELECT preview_count, preview_cost_credits FROM zcv_daily_budget WHERE day = $1::date",
      [day]
    ) as { rows: Array<Record<string, unknown>> };

    expect(reservations.filter(Boolean)).toHaveLength(1);
    expect(rows.rows[0]?.preview_count).toBe(2);
    expect(rows.rows[0]?.preview_cost_credits).toBe(10);
  });

  it("jobs are persisted and recoverable by querying, not blind retry", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    expect(job).toBeTruthy();
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
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
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

  it("finishes paid jobs from the owner's order page with a polling cooldown", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const paid = await paidOrder(harness);
    const queriesBeforePolling = harness.provider.queryCalls;

    const simultaneousPolls = await Promise.all([
      harness.service.getOrderForUser(paid.checkout.orderId, "user_a"),
      harness.service.getOrderForUser(paid.checkout.orderId, "user_a"),
    ]);
    const firstPoll = simultaneousPolls[0]!;
    expect(harness.provider.queryCalls).toBe(queriesBeforePolling + 1);
    expect(firstPoll.job?.status).toBe("video_submitted");

    await harness.service.getOrderForUser(paid.checkout.orderId, "user_a");
    expect(harness.provider.queryCalls).toBe(queriesBeforePolling + 1);

    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    harness.provider.tasks.set("vid_1", {
      status: "completed",
      resultUrl: "https://example.test/video.mp4",
      kind: "video",
    });
    const completed = await harness.service.getOrderForUser(
      paid.checkout.orderId,
      "user_a"
    );

    expect(harness.provider.queryCalls).toBe(queriesBeforePolling + 2);
    expect(harness.provider.reviewCalls).toBe(1);
    expect(completed.job?.status).toBe("completed");
    expect(completed.order.deliveredAt).toBeTruthy();
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
          contentType: "image/png",
          size: ZCV_LIMITS.maxUploadBytes + 1,
        },
        rightsAccepted: true,
        bot: harness.service.issueBotChallenge(),
      })
    ).rejects.toMatchObject({ code: "file_too_large" });

    await expect(
      harness.service.createPreview({
        ip: "2.2.2.2",
        file: { buffer: png, contentType: "image/png", size: png.length },
        rightsAccepted: false,
        bot: harness.service.issueBotChallenge(),
      })
    ).rejects.toMatchObject({ code: "rights_required" });
  });

  it("rejects image bytes that do not match the declared image type or pixel limit", async () => {
    const harness = await createHarness();
    const input = {
      ip: "2.2.2.3",
      rightsAccepted: true,
      bot: harness.service.issueBotChallenge(),
    };
    await expect(
      harness.service.createPreview({
        ...input,
        file: { buffer: Buffer.from("not an image"), contentType: "image/png", size: 12 },
      })
    ).rejects.toMatchObject({ code: "invalid_image" });

    const tooManyPixels = await sharp({
      create: {
        width: 6000,
        height: 5000,
        channels: 3,
        background: "white",
      },
    })
      .png()
      .toBuffer();
    await expect(
      harness.service.createPreview({
        ...input,
        bot: harness.service.issueBotChallenge(),
        file: {
          buffer: tooManyPixels,
          contentType: "image/png",
          size: tooManyPixels.length,
        },
      })
    ).rejects.toMatchObject({ code: "invalid_image" });
  });

  it("atomically enforces concurrent IP preview rate limits", async () => {
    const harness = await createHarness();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        harness.store.consumeRateLimit("preview:test-ip", 3, new Date())
      )
    );
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("free entry has bot check, rate limit and daily budget cap", async () => {
    const harness = await createHarness();
    await expect(
      harness.service.createPreview({
        ip: "3.3.3.3",
        file: { buffer: png, contentType: "image/png", size: png.length },
        rightsAccepted: true,
        bot: { token: "nope", timestamp: Date.now(), nonce: "x" },
      })
    ).rejects.toMatchObject({ code: "bot_check_failed" });

    for (let i = 0; i < ZCV_LIMITS.previewRateLimitPerHour; i += 1) {
      await harness.service.createPreview({
        ip: "4.4.4.4",
        file: { buffer: png, contentType: "image/png", size: png.length },
        rightsAccepted: true,
        bot: harness.service.issueBotChallenge(),
      });
    }
    await expect(
      harness.service.createPreview({
        ip: "4.4.4.4",
        file: { buffer: png, contentType: "image/png", size: png.length },
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
        file: { buffer: png, contentType: "image/png", size: png.length },
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

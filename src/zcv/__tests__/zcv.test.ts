import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { ZCV_LIMITS, ZCV_PRODUCT } from "../config";
import { hashClaimSecret } from "../crypto";
import { createMediaToken } from "../media";
import { ZcvError } from "../types";
import { assertZcvCheckoutMode, assertZcvStripeMode } from "../stripe-mode";
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
    expect(() => assertZcvCheckoutMode("subscription")).toThrow(
      "only supports one-time payments"
    );
    expect(() => assertZcvCheckoutMode("payment")).not.toThrow();
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

  it("creates an explicitly marked, zero-cost local mock preview without provider calls", async () => {
    const harness = await createHarness({ mockPreviewMode: true });
    const preview = await readyPreview(harness);
    const displayed = await harness.service.getPreview(
      preview.previewId,
      preview.claimSecret
    );
    const logs = (await harness.store.listProviderLogs()).filter(
      (log) => log.previewId === preview.previewId
    );

    expect(displayed.status).toBe("ready");
    expect(displayed.isMock).toBe(true);
    expect(displayed.previewImageUrl).toContain("/api/zcv/media/");
    expect(harness.provider.imageCalls).toBe(0);
    expect(harness.provider.videoCalls).toBe(0);
    expect(logs).toMatchObject([
      {
        provider: "local-mock",
        model: "no-model",
        purpose: "preview_image",
        status: "mocked",
        costCredits: 0,
      },
    ]);
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
      .filter(
        (log) =>
          log.purpose === "moderation" &&
          (log.status === "approved" || log.status === "rejected")
      )
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

  it("keeps gore-refund order and job atomic and reuses a logged moderation result", async () => {
    const harness = await createHarness();
    harness.provider.reviewResults = [
      { safe: false, reason: "visible wound", costCredits: 0.02 },
      { safe: false, reason: "visible blood", costCredits: 0.02 },
    ];
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    await harness.service.reconcileJob(job!.id);

    await harness.client.exec(
      "ALTER TABLE zcv_orders ADD CONSTRAINT reject_refund_pending CHECK (status <> 'refund_pending')"
    );
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    await expect(harness.service.reconcileJob(job!.id)).rejects.toThrow();

    expect((await harness.store.getJob(job!.id))?.status).toBe("needs_check");
    expect((await harness.store.getJob(job!.id))?.moderationStatus).toBe("submitted");
    expect((await harness.store.getOrder(paid.checkout.orderId))?.status).toBe("paid");
    expect(harness.provider.reviewCalls).toBe(2);

    await harness.client.exec(
      "ALTER TABLE zcv_orders DROP CONSTRAINT reject_refund_pending"
    );
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    await harness.service.reconcileJob(job!.id);

    expect((await harness.store.getJob(job!.id))?.status).toBe("refund_pending");
    expect((await harness.store.getOrder(paid.checkout.orderId))?.status).toBe(
      "refund_pending"
    );
    expect(harness.provider.reviewCalls).toBe(2);
  });

  it("keeps generation-failure refund state atomic when the order update is rejected", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    harness.provider.tasks.get("vid_1")!.status = "failed";
    await harness.service.reconcileJob(job!.id);
    harness.provider.tasks.get("vid_2")!.status = "failed";

    await harness.client.exec(
      "ALTER TABLE zcv_orders ADD CONSTRAINT reject_refund_pending CHECK (status <> 'refund_pending')"
    );
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    await expect(harness.service.reconcileJob(job!.id)).rejects.toThrow();
    expect((await harness.store.getJob(job!.id))?.status).toBe("video_submitted");
    expect((await harness.store.getOrder(paid.checkout.orderId))?.status).toBe("paid");

    await harness.client.exec(
      "ALTER TABLE zcv_orders DROP CONSTRAINT reject_refund_pending"
    );
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    await harness.service.reconcileJob(job!.id);
    expect((await harness.store.getJob(job!.id))?.status).toBe("refund_pending");
    expect((await harness.store.getOrder(paid.checkout.orderId))?.status).toBe(
      "refund_pending"
    );
    expect(harness.provider.videoCalls).toBe(2);
  });

  it.each(["task-query", "download", "storage"] as const)(
    "bounds a hung %s operation so later paid jobs still reconcile",
    async (blockedStage) => {
      let release!: () => void;
      let signalBlockedStage!: () => void;
      const blockedStageReached = new Promise<void>((resolve) => {
        signalBlockedStage = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const harness = await createHarness({
        providerTimeoutMs: 250,
        fetchBinary: async (url) => {
          if (blockedStage === "download" && url.endsWith("/a.mp4")) {
            signalBlockedStage();
            await blocked;
            return Buffer.from("a");
          }
          return url.endsWith("/b.mp4") ? Buffer.from("b") : Buffer.from(png);
        },
      });
      const paidA = await paidOrder(harness, "user_a");
      const paidB = await paidOrder(harness, "user_b");
      const jobA = await harness.store.getJobByOrder(paidA.checkout.orderId);
      const jobB = await harness.store.getJobByOrder(paidB.checkout.orderId);
      const originalGetTask = harness.provider.getTask.bind(harness.provider);
      const originalPut = harness.storage.put.bind(harness.storage);

      harness.store.listRecoverableJobs = async () => [jobA!, jobB!];
      harness.provider.tasks.get("vid_1")!.status = "completed";
      harness.provider.tasks.get("vid_1")!.resultUrl = "https://example.test/a.mp4";
      harness.provider.tasks.get("vid_2")!.status = "completed";
      harness.provider.tasks.get("vid_2")!.resultUrl = "https://example.test/b.mp4";
      if (blockedStage === "task-query") {
        harness.provider.getTask = async (taskId) => {
          if (taskId === "vid_1") {
            signalBlockedStage();
            return blocked.then(() => ({
              status: "processing" as const,
              resultUrl: undefined,
              error: undefined,
              costCredits: 55,
              raw: { consumeCredits: 55 },
            }));
          }
          return originalGetTask(taskId);
        };
      }
      if (blockedStage === "storage") {
        harness.storage.put = async (key: string, body: Buffer) => {
          if (key === `zcv/${paidA.preview.previewId}/video.mp4`) {
            signalBlockedStage();
            return blocked.then(() => originalPut(key, body));
          }
          return originalPut(key, body);
        };
      }

      const reconciliation = harness.service.reconcileOpenJobs();
      await blockedStageReached;
      await new Promise((resolve) => setTimeout(resolve, 300));
      const orderBWhileAIsBlocked = await harness.store.getOrder(paidB.checkout.orderId);
      release();
      await reconciliation;
      expect(orderBWhileAIsBlocked?.deliveredAt).toBeTruthy();
      harness.provider.getTask = originalGetTask;
      harness.storage.put = originalPut;
    }
  );

  it("does not query a terminal failed free preview again", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteImage = false;
    const created = await readyPreview(harness);
    const task = harness.provider.tasks.get("img_1")!;
    task.status = "failed";

    const failed = await harness.service.pollPreview(created.previewId, created.claimSecret);
    const queryCount = harness.provider.queryCalls;
    const repeated = await harness.service.pollPreview(created.previewId, created.claimSecret);

    expect(failed.status).toBe("failed");
    expect(repeated.status).toBe("failed");
    expect(harness.provider.queryCalls).toBe(queryCount);
  });

  it("does not let a late Stripe checkout response overwrite a paid order", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    let releaseCheckout!: () => void;
    let checkoutStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      checkoutStarted = resolve;
    });
    const checkoutGate = new Promise<void>((resolve) => {
      releaseCheckout = resolve;
    });
    harness.stripeGateway.createCheckoutSession = async (input) => {
      checkoutStarted();
      await checkoutGate;
      return {
        id: `cs_test_${input.orderId}`,
        url: `https://checkout.stripe.test/${input.orderId}`,
      };
    };
    const checkoutRequest = harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });
    await started;
    const order = (await harness.store.listOrdersForUser("user_a"))[0]!;
    const signed = signedWebhook(
      harness.stripe,
      paidCheckoutEvent({ eventId: "evt_paid_before_checkout_return", orderId: order.id, userId: "user_a" })
    );
    await harness.service.handleStripeWebhook(signed.payload, signed.signature);
    releaseCheckout();
    await checkoutRequest;

    expect((await harness.store.getOrder(order.id))?.status).toBe("paid");
    expect((await harness.store.getOrder(order.id))?.paidAt).toBeTruthy();
  });

  it("does not let a delayed failed-payment event regress a paid order", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const checkout = await harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });
    const staleFailureRead = await harness.store.getOrder(checkout.orderId);
    expect(staleFailureRead?.paidAt).toBeNull();
    const paidSigned = signedWebhook(
      harness.stripe,
      paidCheckoutEvent({ eventId: "evt_wins_race", orderId: checkout.orderId, userId: "user_a" })
    );
    await harness.service.handleStripeWebhook(paidSigned.payload, paidSigned.signature);
    const didRegress = await harness.store.updateOrderIfUnpaid(checkout.orderId, {
      status: "cancelled",
    });
    const staleFailure = {
      ...paidCheckoutEvent({
        eventId: "evt_delayed_cancel_after_paid",
        orderId: checkout.orderId,
        userId: "user_a",
        paymentStatus: "unpaid",
      }),
      type: "checkout.session.expired",
    };
    const failedSigned = signedWebhook(harness.stripe, staleFailure);
    await harness.service.handleStripeWebhook(
      failedSigned.payload,
      failedSigned.signature
    );

    expect(didRegress).toBe(false);
    expect((await harness.store.getOrder(checkout.orderId))?.status).toBe("paid");
    expect((await harness.store.getOrder(checkout.orderId))?.paidAt).toBeTruthy();
  });

  it("rejects Stripe events from the wrong configured live/test mode", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "user_a");
    const checkout = await harness.service.createCheckout({
      userId: "user_a",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
    });
    const event = {
      ...paidCheckoutEvent({
        eventId: "evt_wrong_livemode",
        orderId: checkout.orderId,
        userId: "user_a",
      }),
      livemode: true,
    };
    const signed = signedWebhook(harness.stripe, event);

    await expect(
      harness.service.handleStripeWebhook(signed.payload, signed.signature)
    ).rejects.toMatchObject({ code: "stripe_mode_mismatch" });
    expect((await harness.store.getOrder(checkout.orderId))?.paidAt).toBeNull();
    expect(await harness.store.getJobByOrder(checkout.orderId)).toBeNull();
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
    expect(moderationLogs.map((log) => log.status)).toEqual([
      "dispatching",
      "unknown",
    ]);
  });

  it("keeps an in-flight review from being reconciled again after the old 15s cooldown", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    const task = harness.provider.tasks.get("vid_1");
    task!.status = "completed";
    task!.resultUrl = "https://example.test/video.mp4";

    let signalReviewStarted!: () => void;
    const reviewStarted = new Promise<void>((resolve) => {
      signalReviewStarted = resolve;
    });
    let releaseReview!: (result: { safe: boolean; reason: string }) => void;
    const blockedReview = new Promise<{ safe: boolean; reason: string }>(
      (resolve) => {
        releaseReview = resolve;
      }
    );
    harness.provider.reviewVideo = async () => {
      harness.provider.reviewCalls += 1;
      if (harness.provider.reviewCalls === 1) {
        signalReviewStarted();
        return blockedReview;
      }
      return { safe: false, reason: "visible blood" };
    };

    const firstReconciliation = harness.service.reconcileJob(job!.id);
    await reviewStarted;
    harness.advanceTime(15_001);
    await harness.service.reconcileJob(job!.id);

    expect(harness.provider.reviewCalls).toBe(1);
    releaseReview({ safe: false, reason: "visible blood" });
    await firstReconciliation;

    const retried = await harness.store.getJob(job!.id);
    expect(harness.provider.videoCalls).toBe(2);
    expect(retried?.attemptCount).toBe(2);
    expect(retried?.kieVideoTaskId).toBe("vid_2");
    expect(retried?.status).toBe("video_submitted");
  });

  it("keeps an in-flight review exclusive after reconciliation cooldown expires", async () => {
    const harness = await createHarness();
    harness.provider.autoCompleteVideo = false;
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    const task = harness.provider.tasks.get("vid_1");
    task!.status = "completed";
    task!.resultUrl = "https://example.test/video.mp4";

    let signalReviewStarted!: () => void;
    const reviewStarted = new Promise<void>((resolve) => {
      signalReviewStarted = resolve;
    });
    let releaseFirstReview!: (result: { safe: boolean; reason: string }) => void;
    const firstReview = new Promise<{ safe: boolean; reason: string }>(
      (resolve) => {
        releaseFirstReview = resolve;
      }
    );
    harness.provider.reviewVideo = async () => {
      harness.provider.reviewCalls += 1;
      if (harness.provider.reviewCalls === 1) {
        signalReviewStarted();
        return firstReview;
      }
      return { safe: false, reason: "visible blood" };
    };

    const firstReconciliation = harness.service.reconcileJob(job!.id);
    await reviewStarted;
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    await harness.service.reconcileJob(job!.id);

    const stillReviewing = await harness.store.getJob(job!.id);
    expect(harness.provider.reviewCalls).toBe(1);
    expect(harness.provider.videoCalls).toBe(1);
    expect(stillReviewing?.kieVideoTaskId).toBe("vid_1");
    expect(stillReviewing?.attemptCount).toBe(1);
    releaseFirstReview({ safe: false, reason: "visible blood" });
    await firstReconciliation;

    const finalJob = await harness.store.getJob(job!.id);
    expect(harness.provider.videoCalls).toBe(2);
    expect(finalJob?.attemptCount).toBe(2);
    expect(finalJob?.kieVideoTaskId).toBe("vid_2");
    expect(finalJob?.status).toBe("video_submitted");
  });

  it("prevents a second paid review when an older task query outlives the cooldown", async () => {
    const harness = await createHarness({ providerTimeoutMs: 120_000 });
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    const task = harness.provider.tasks.get("vid_1")!;
    task.status = "completed";
    task.resultUrl = "https://example.test/video.mp4";

    let releaseFirstQuery!: (
      result: Awaited<ReturnType<typeof harness.provider.getTask>>
    ) => void;
    let signalFirstQuery!: () => void;
    const firstQueryStarted = new Promise<void>((resolve) => {
      signalFirstQuery = resolve;
    });
    const blockedFirstQuery = new Promise<
      Awaited<ReturnType<typeof harness.provider.getTask>>
    >((resolve) => {
      releaseFirstQuery = resolve;
    });
    const originalGetTask = harness.provider.getTask.bind(harness.provider);
    let queryCount = 0;
    harness.provider.getTask = async (taskId) => {
      queryCount += 1;
      if (queryCount === 1) {
        signalFirstQuery();
        return blockedFirstQuery;
      }
      return originalGetTask(taskId);
    };

    let releaseReview!: (result: { safe: boolean; reason: string }) => void;
    let signalFirstReview!: () => void;
    let signalSecondReview!: () => void;
    const firstReviewStarted = new Promise<void>((resolve) => {
      signalFirstReview = resolve;
    });
    const secondReviewStarted = new Promise<void>((resolve) => {
      signalSecondReview = resolve;
    });
    const blockedReview = new Promise<{ safe: boolean; reason: string }>(
      (resolve) => {
        releaseReview = resolve;
      }
    );
    harness.provider.reviewVideo = async () => {
      harness.provider.reviewCalls += 1;
      if (harness.provider.reviewCalls === 1) signalFirstReview();
      if (harness.provider.reviewCalls === 2) signalSecondReview();
      return blockedReview;
    };

    const first = harness.service.reconcileJob(job!.id);
    await firstQueryStarted;
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    let secondSettled = false;
    const second = harness.service.reconcileJob(job!.id).finally(() => {
      secondSettled = true;
    });
    const secondProgress = await Promise.race([
      firstReviewStarted.then(() => "review_started" as const),
      second.then(() => "second_settled" as const),
    ]);

    releaseFirstQuery({
      status: "completed",
      resultUrl: "https://example.test/video.mp4",
      error: undefined,
      costCredits: 55,
      raw: { consumeCredits: 55 },
    });
    if (secondProgress === "review_started") {
      await secondReviewStarted;
    } else {
      expect(secondSettled).toBe(true);
      await firstReviewStarted;
    }
    const reviewCallsBeforeRelease = harness.provider.reviewCalls;
    releaseReview({ safe: true, reason: "No gore detected" });
    await Promise.all([first, second]);

    expect(reviewCallsBeforeRelease).toBe(1);
  });

  it("logs an external task query even when its task-ownership update loses the race", async () => {
    const harness = await createHarness();
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    const originalGetTask = harness.provider.getTask.bind(harness.provider);
    harness.provider.getTask = async (taskId) => {
      await harness.store.updateJob(job!.id, {
        kieVideoTaskId: "vid_replacement",
      });
      return originalGetTask(taskId);
    };

    const result = await harness.service.reconcileJob(job!.id);
    const queryLogs = (await harness.store.listProviderLogs()).filter(
      (log) => log.purpose === "reconcile" && log.taskId === "vid_1"
    );

    expect(result?.kieVideoTaskId).toBe("vid_replacement");
    expect(queryLogs).toHaveLength(1);
    expect(harness.provider.reviewCalls).toBe(0);
  });

  it("does not mark an unstarted review unknown when the shared provider deadline has expired", async () => {
    const harness = await createHarness({ providerTimeoutMs: 1_000 });
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    const markReviewSubmitted =
      harness.store.markModerationReviewSubmitted.bind(harness.store);
    harness.store.markModerationReviewSubmitted = async (...input) => {
      const result = await markReviewSubmitted(...input);
      expect(result).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 1_050));
      return result;
    };

    await harness.service.reconcileJob(job!.id);

    const current = await harness.store.getJob(job!.id);
    const moderationLogs = (await harness.store.listProviderLogs()).filter(
      (log) => log.purpose === "moderation"
    );
    expect(harness.provider.reviewCalls).toBe(0);
    expect(current?.status).toBe("video_submitted");
    expect(current?.moderationStatus).toBe("pending");
    expect(moderationLogs.map((log) => log.status)).toEqual(["not_dispatched"]);
  });

  it("does not give a paid generation retry a fresh provider deadline", async () => {
    const harness = await createHarness({ providerTimeoutMs: 30_000 });
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    harness.provider.getTask = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        status: "failed",
        error: "simulated generation failure",
        resultUrl: undefined,
        costCredits: 55,
        raw: { consumeCredits: 55 },
      };
    };
    let releaseSubmission!: () => void;
    let signalSubmissionStarted!: () => void;
    const submissionGate = new Promise<void>((resolve) => {
      releaseSubmission = resolve;
    });
    const submissionStarted = new Promise<void>((resolve) => {
      signalSubmissionStarted = resolve;
    });
    const createVideoTask = harness.provider.createVideoTask.bind(harness.provider);
    let submissionCalls = 0;
    harness.provider.createVideoTask = async () => {
      submissionCalls += 1;
      signalSubmissionStarted();
      await submissionGate;
      return createVideoTask();
    };

    const startedAt = Date.now();
    const deadline = startedAt + 500;
    const retryResult = harness.service.reconcileJob(job!.id, deadline).then(
      () => "resolved" as const,
      () => "rejected" as const
    );
    await submissionStarted;
    const completedWithinRouteBudget = await Promise.race([
      retryResult,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 700)),
    ]);

    expect(completedWithinRouteBudget).toBe("rejected");
    expect(Date.now() - startedAt).toBeLessThan(650);
    expect(submissionCalls).toBe(1);
    expect((await harness.store.getJob(job!.id))?.status).toBe("submission_unknown");
    releaseSubmission();
    await retryResult;
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("persists review dispatch before calling the provider and never repeats an unlogged result", async () => {
    const harness = await createHarness();
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    const insertProviderLog = harness.store.insertProviderLog.bind(harness.store);
    let failModerationLog = true;
    harness.store.insertProviderLog = async (log) => {
      if (
        failModerationLog &&
        log.purpose === "moderation" &&
        log.status !== "dispatching"
      ) {
        failModerationLog = false;
        throw new Error("moderation log insert failed");
      }
      return insertProviderLog(log);
    };
    harness.provider.reviewVideo = async () => {
      harness.provider.reviewCalls += 1;
      const duringCall = await harness.store.getJob(job!.id);
      const dispatchLogs = (await harness.store.listProviderLogs()).filter(
        (log) =>
          log.purpose === "moderation" &&
          log.taskId === "vid_1" &&
          log.status === "dispatching"
      );
      expect(duringCall?.status).toBe("needs_check");
      expect(duringCall?.moderationStatus).toBe("submitted");
      expect(dispatchLogs).toHaveLength(1);
      return { safe: true, reason: "No gore detected", costCredits: 1 };
    };

    await expect(harness.service.reconcileJob(job!.id)).rejects.toThrow(
      "moderation log insert failed"
    );
    const afterLogFailure = await harness.store.getJob(job!.id);
    const moderationLogs = (await harness.store.listProviderLogs()).filter(
      (log) => log.purpose === "moderation"
    );
    harness.store.insertProviderLog = insertProviderLog;
    harness.advanceTime(ZCV_LIMITS.reconcileCooldownMs + 1);
    const afterRetry = await harness.service.reconcileJob(job!.id);

    expect(harness.provider.reviewCalls).toBe(1);
    expect(afterLogFailure?.status).toBe("needs_check");
    expect(afterLogFailure?.moderationStatus).toBe("submitted");
    expect(moderationLogs.map((log) => log.status)).toEqual(["dispatching"]);
    expect(afterRetry?.status).toBe("needs_check");
  });

  it("keeps the newer lease when an expired reconciliation finally returns", async () => {
    const providerTimeoutMs = 1_000_000;
    const harness = await createHarness({ providerTimeoutMs });
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    let resolveFirst!: (
      result: Awaited<ReturnType<typeof harness.provider.getTask>>
    ) => void;
    let resolveSecond!: (
      result: Awaited<ReturnType<typeof harness.provider.getTask>>
    ) => void;
    const firstResult = new Promise<Awaited<ReturnType<typeof harness.provider.getTask>>>(
      (resolve) => {
        resolveFirst = resolve;
      }
    );
    const secondResult = new Promise<Awaited<ReturnType<typeof harness.provider.getTask>>>(
      (resolve) => {
        resolveSecond = resolve;
      }
    );
    let firstQueryStarted!: () => void;
    let secondQueryStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      firstQueryStarted = resolve;
    });
    const secondStarted = new Promise<void>((resolve) => {
      secondQueryStarted = resolve;
    });
    let queryCount = 0;
    harness.provider.getTask = async () => {
      queryCount += 1;
      if (queryCount === 1) {
        firstQueryStarted();
        return firstResult;
      }
      secondQueryStarted();
      return secondResult;
    };

    const first = harness.service.reconcileJob(job!.id);
    await firstStarted;
    const firstToken = (await harness.store.getJob(job!.id))?.reconciliationToken;
    harness.advanceTime(providerTimeoutMs * 2 + 1);
    const second = harness.service.reconcileJob(job!.id);
    await secondStarted;
    const secondToken = (await harness.store.getJob(job!.id))?.reconciliationToken;
    resolveFirst({
      status: "processing",
      resultUrl: undefined,
      error: undefined,
      costCredits: 55,
      raw: { consumeCredits: 55 },
    });
    await first;

    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(firstToken);
    expect((await harness.store.getJob(job!.id))?.reconciliationToken).toBe(secondToken);
    resolveSecond({
      status: "processing",
      resultUrl: undefined,
      error: undefined,
      costCredits: 55,
      raw: { consumeCredits: 55 },
    });
    await second;
  });

  it("logs an external review when the subsequent task-ownership update loses the race", async () => {
    const harness = await createHarness();
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    harness.provider.reviewVideo = async () => {
      await harness.store.updateJobForCurrentTask(
        job!.id,
        "vid_1",
        "submitted",
        { kieVideoTaskId: "vid_replacement" }
      );
      return { safe: true, reason: "No gore detected", costCredits: 0.02 };
    };

    const result = await harness.service.reconcileJob(job!.id);
    const logs = (await harness.store.listProviderLogs()).filter(
      (log) => log.purpose === "moderation" && log.taskId === "vid_1"
    );

    expect(result?.kieVideoTaskId).toBe("vid_replacement");
    expect(result?.moderationStatus).toBe("submitted");
    expect(logs.map((log) => log.status)).toEqual(["dispatching", "approved"]);
    expect(logs[1]?.costCredits).toBe(0.02);
  });

  it("logs an unknown external review before returning from a stale task CAS", async () => {
    const harness = await createHarness();
    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    harness.provider.reviewVideo = async () => {
      harness.provider.reviewCalls += 1;
      await harness.store.updateJob(job!.id, {
        kieVideoTaskId: "vid_replacement",
      });
      throw new Error("review result unknown");
    };

    const result = await harness.service.reconcileJob(job!.id);
    const unknownLogs = (await harness.store.listProviderLogs()).filter(
      (log) =>
        log.purpose === "moderation" &&
        log.taskId === "vid_1" &&
        log.status === "unknown"
    );

    expect(result?.kieVideoTaskId).toBe("vid_replacement");
    expect(unknownLogs).toHaveLength(1);
  });

  it("recovers a known provider task when submission logging fails", async () => {
    const harness = await createHarness();
    const insertProviderLog = harness.store.insertProviderLog.bind(harness.store);
    let failPaidVideoLog = true;
    harness.store.insertProviderLog = async (log) => {
      if (failPaidVideoLog && log.purpose === "paid_video") {
        failPaidVideoLog = false;
        throw new Error("provider log insert failed");
      }
      return insertProviderLog(log);
    };

    const paid = await paidOrder(harness);
    const job = await harness.store.getJobByOrder(paid.checkout.orderId);
    expect(job?.kieVideoTaskId).toBe("vid_1");
    expect(job?.status).toBe("video_submitted");

    harness.store.insertProviderLog = insertProviderLog;
    const queryCallsBeforeRecovery = harness.provider.queryCalls;
    await harness.store.updateJob(job!.id, { status: "submission_unknown" });
    await harness.service.reconcileJob(job!.id);

    const recovered = await harness.store.getJob(job!.id);
    const order = await harness.store.getOrder(paid.checkout.orderId);
    expect(harness.provider.queryCalls).toBe(queryCallsBeforeRecovery + 1);
    expect(recovered?.status).toBe("completed");
    expect(recovered?.kieVideoTaskId).toBe("vid_1");
    expect(order?.deliveredAt).toBeTruthy();
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

  it("does not let five unresolved jobs starve a recoverable job in the database batch", async () => {
    const harness = await createHarness();
    const paid = await paidOrder(harness);
    const recoverable = await harness.store.getJobByOrder(paid.checkout.orderId);
    await harness.store.updateJob(recoverable!.id, {
      status: "pending",
      kieVideoTaskId: null,
    });

    await harness.client.exec(`
      INSERT INTO zcv_jobs (
        id, order_id, preview_id, user_id, status, moderation_status,
        created_at, updated_at
      )
      SELECT
        'stuck_' || n, 'stuck_order_' || n, 'stuck_preview_' || n, 'user_stuck',
        CASE WHEN n = 5 THEN 'submission_unknown' ELSE 'needs_check' END,
        CASE WHEN n = 5 THEN 'pending' ELSE 'unknown' END,
        NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'
      FROM generate_series(1, 5) AS n
    `);

    const recovered = await harness.service.reconcileOpenJobs();

    expect(recovered.map((job) => job?.id)).toContain(recoverable?.id);
    expect(harness.provider.videoCalls).toBe(2);
    expect((await harness.store.listRecoverableJobs(10)).map((job) => job.id)).toEqual(
      [recoverable?.id]
    );
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

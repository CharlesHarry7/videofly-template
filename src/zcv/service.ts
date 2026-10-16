
import { ZCV_LIMITS, ZCV_MODELS, ZCV_PRODUCT, ZCV_PROMPTS } from "./config";
import {
  getCreditPack,
  publicCreditCatalog,
  requireCreditPack,
  type ZcvCreditPack,
} from "./product";
import { hashClaimSecret, hmacHex, randomSecret, safeEqual } from "./crypto";
import { createMediaToken, verifyMediaToken } from "./media";
import { ZcvStore } from "./store";
import type {
  GenerationProvider,
  JobRecord,
  ObjectStorage,
  OrderRecord,
  PreviewRecord,
  StripeGateway,
} from "./types";
import { ZcvError } from "./types";
import {
  createLocalMockPreview,
  createWatermarkedPreview,
  type ImagesBinding,
  readImageHeader,
} from "./watermark";

export interface ZcvServiceOptions {
  store: ZcvStore;
  provider: GenerationProvider;
  storage: ObjectStorage;
  stripe?: StripeGateway;
  stripeWebhookSecret?: string;
  stripeMode?: "test" | "live";
  botSecret: string;
  mediaSecret: string;
  appUrl?: string;
  now?: () => number;
  ids?: () => string;
  fetchBinary?: (url: string) => Promise<Buffer>;
  providerTimeoutMs?: number;
  mockPreviewMode?: boolean;
  images?: ImagesBinding;
}

interface StripeLikeEvent {
  id: string;
  type: string;
  livemode?: boolean;
  data?: {
    object?: {
      id?: string;
      mode?: string;
      payment_status?: string;
      status?: string;
      amount_total?: number;
      currency?: string;
      metadata?: Record<string, string>;
      payment_intent?: string | { id?: string };
    };
  };
}

class DeadlineExpiredBeforeDispatchError extends Error {}

export class ZcvService {
  private readonly store: ZcvStore;
  private readonly provider: GenerationProvider;
  private readonly storage: ObjectStorage;
  private readonly stripe?: StripeGateway;
  private readonly stripeWebhookSecret?: string;
  private readonly stripeMode: "test" | "live";
  private readonly botSecret: string;
  private readonly mediaSecret: string;
  private readonly appUrl: string;
  private readonly now: () => number;
  private readonly ids: () => string;
  private readonly fetchBinary: (url: string) => Promise<Buffer>;
  private readonly providerTimeoutMs: number;
  private readonly mockPreviewMode: boolean;
  private readonly images?: ImagesBinding;

  constructor(options: ZcvServiceOptions) {
    this.store = options.store;
    this.provider = options.provider;
    this.storage = options.storage;
    this.stripe = options.stripe;
    this.stripeWebhookSecret = options.stripeWebhookSecret;
    this.stripeMode = options.stripeMode ?? "test";
    this.botSecret = options.botSecret;
    this.mediaSecret = options.mediaSecret;
    this.appUrl = options.appUrl || "http://localhost:3000";
    this.now = options.now || (() => Date.now());
    this.ids = options.ids || (() => randomSecret(16));
    this.fetchBinary =
      options.fetchBinary ||
      (async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to download ${url}: ${response.status}`);
        }
        return Buffer.from(await response.arrayBuffer());
      });
    this.providerTimeoutMs =
      options.providerTimeoutMs ?? ZCV_LIMITS.providerTimeoutMs;
    this.mockPreviewMode = options.mockPreviewMode ?? false;
    this.images = options.images;
  }

  private async withDeadline<T>(
    operation: () => Promise<T>,
    deadline: number,
    description: string
  ): Promise<T> {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new DeadlineExpiredBeforeDispatchError(
        `${description} deadline expired before dispatch`
      );
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${description} timed out; status unknown`)),
            remainingMs
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  issueBotChallenge() {
    const timestamp = this.now();
    const nonce = randomSecret(16);
    const token = hmacHex(this.botSecret, `${timestamp}:${nonce}`);
    return { token, timestamp, nonce };
  }

  async assertBotChallenge(input: {
    token?: string;
    timestamp?: number;
    nonce?: string;
  }) {
    if (!input.token || !input.timestamp || !input.nonce) {
      throw new ZcvError("Bot check required", "bot_check_required", 403);
    }
    if (this.now() - input.timestamp > ZCV_LIMITS.botChallengeTtlMs) {
      throw new ZcvError("Bot check expired", "bot_check_expired", 403);
    }
    const expected = hmacHex(
      this.botSecret,
      `${input.timestamp}:${input.nonce}`
    );
    if (!safeEqual(input.token, expected)) {
      throw new ZcvError("Bot check failed", "bot_check_failed", 403);
    }
    const firstUse = await this.store.consumeBotNonce(
      input.nonce,
      new Date(input.timestamp + ZCV_LIMITS.botChallengeTtlMs)
    );
    if (!firstUse) {
      throw new ZcvError("Bot check already used", "bot_check_replay", 403);
    }
  }

  assertUpload(input: {
    contentType?: string;
    size?: number;
    rightsAccepted?: boolean;
  }) {
    if (!input.rightsAccepted) {
      throw new ZcvError(
        "You must confirm you have rights to this photo",
        "rights_required",
        400
      );
    }
    if (
      !input.contentType ||
      !ZCV_LIMITS.allowedMimeTypes.includes(
        input.contentType as (typeof ZCV_LIMITS.allowedMimeTypes)[number]
      )
    ) {
      throw new ZcvError("Unsupported image type", "invalid_type", 400);
    }
    if (!input.size || input.size > ZCV_LIMITS.maxUploadBytes) {
      throw new ZcvError("Image is too large", "file_too_large", 400);
    }
  }

  async assertFreeEntryGuards(ip: string) {
    const hourKey = `preview:${ip}:${new Date(this.now()).toISOString().slice(0, 13)}`;
    const allowed = await this.store.consumeRateLimit(
      hourKey,
      ZCV_LIMITS.previewRateLimitPerHour,
      new Date(this.now())
    );
    if (!allowed) {
      throw new ZcvError("Too many free previews", "rate_limited", 429);
    }
  }

  async createPreview(input: {
    ip: string;
    file: { buffer: Buffer; contentType: string; size: number };
    rightsAccepted: boolean;
    bot: { token?: string; timestamp?: number; nonce?: string };
    userId?: string;
  }) {
    this.assertUpload({
      contentType: input.file.contentType,
      size: input.file.size,
      rightsAccepted: input.rightsAccepted,
    });
    if (input.file.buffer.length !== input.file.size) {
      throw new ZcvError("Image is too large", "file_too_large", 400);
    }
    const metadata = readImageHeader(input.file.buffer);
    if (!metadata) {
      throw new ZcvError("Invalid image file", "invalid_image", 400);
    }
    const actualMime =
      metadata.format === "jpeg"
        ? "image/jpeg"
        : metadata.format === "png"
          ? "image/png"
          : metadata.format === "webp"
            ? "image/webp"
            : undefined;
    if (
      !actualMime ||
      actualMime !== input.file.contentType ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > ZCV_LIMITS.maxUploadPixels
    ) {
      throw new ZcvError("Invalid image file", "invalid_image", 400);
    }
    await this.assertBotChallenge(input.bot);
    await this.assertFreeEntryGuards(input.ip);

    if (!this.mockPreviewMode) {
      const day = new Date(this.now()).toISOString().slice(0, 10);
      const budgetOk = await this.store.consumeDailyBudget({
        day,
        maxCount: ZCV_LIMITS.dailyPreviewBudget,
        maxCredits: ZCV_LIMITS.dailyPreviewCreditBudget,
        costCredits: ZCV_MODELS.image.estimatedCredits,
      });
      if (!budgetOk) {
        throw new ZcvError(
          "Free preview budget for today is exhausted",
          "budget_exceeded",
          429
        );
      }
    }

    const previewId = this.ids();
    const claimSecret = randomSecret(32);
    const sourceKey = `zcv/${previewId}/source`;
    await this.storage.put(sourceKey, input.file.buffer, input.file.contentType);

    const preview: PreviewRecord = {
      id: previewId,
      claimSecretHash: hashClaimSecret(claimSecret),
      ownerUserId: input.userId ?? null,
      sourceImageKey: sourceKey,
      intermediateImageKey: null,
      previewImageKey: null,
      status: "generating",
      kieImageTaskId: null,
      imageCostCredits: 0,
      errorMessage: null,
      rightsAccepted: true,
      createdAt: new Date(this.now()),
      updatedAt: new Date(this.now()),
    };
    await this.store.insertPreview(preview);

    if (this.mockPreviewMode) {
      const previewKey = `zcv/${previewId}/preview.jpg`;
      const mockImage = await createLocalMockPreview(input.file.buffer, this.images);
      await this.storage.put(previewKey, mockImage, "image/jpeg");
      await this.store.updatePreview(previewId, {
        intermediateImageKey: sourceKey,
        previewImageKey: previewKey,
        status: "ready",
        imageCostCredits: 0,
      });
      const readyPreview = await this.store.getPreview(previewId);
      if (!readyPreview) throw new Error("Local mock preview did not persist");
      await this.store.insertProviderLog({
        provider: "local-mock",
        model: "no-model",
        purpose: "preview_image",
        status: "mocked",
        costCredits: 0,
        previewId,
        raw: { mock: true, sourceDerived: true, providerCalls: 0 },
      });
      return {
        previewId,
        claimSecret,
        status: "ready" as const,
        isMock: true,
        previewImageUrl: this.previewUrl(readyPreview),
        product: this.publicProduct(),
      };
    }

    const imageUrl = this.providerFetchUrl(sourceKey);
    const task = await this.provider.createImageTask({
      prompt: ZCV_PROMPTS.image,
      imageUrl,
    });
    await this.store.updatePreview(previewId, {
      kieImageTaskId: task.taskId,
      imageCostCredits: task.costCredits,
    });
    await this.store.insertProviderLog({
      taskId: task.taskId,
      provider: "kie",
      model: ZCV_MODELS.image.providerModelId,
      purpose: "preview_image",
      status: "submitted",
      costCredits: task.costCredits,
      previewId,
      raw: task.raw,
    });

    return {
      previewId,
      claimSecret,
      status: "generating" as const,
      isMock: false,
      previewImageUrl: null,
      product: this.publicProduct(),
    };
  }

  async getPreview(previewId: string, claimSecret: string) {
    const preview = await this.requirePreviewWithSecret(previewId, claimSecret);
    return this.serializePreview(preview);
  }

  async completeImagePreview(
    previewId: string,
    resultUrl: string,
    deadline = Date.now() + this.providerTimeoutMs
  ) {
    const preview = await this.store.getPreview(previewId);
    if (!preview) throw new ZcvError("Preview not found", "not_found", 404);
    const image = await this.withDeadline(
      () => this.fetchBinary(resultUrl),
      deadline,
      "Preview download"
    );
    const intermediateKey = `zcv/${previewId}/intermediate.png`;
    const previewKey = `zcv/${previewId}/preview.jpg`;
    await this.withDeadline(
      () => this.storage.put(intermediateKey, image, "image/png"),
      deadline,
      "Preview storage"
    );
    const watermarked = await createWatermarkedPreview(image, this.images);
    await this.withDeadline(
      () => this.storage.put(previewKey, watermarked, "image/jpeg"),
      deadline,
      "Preview storage"
    );
    await this.store.updatePreview(previewId, {
      intermediateImageKey: intermediateKey,
      previewImageKey: previewKey,
      status: "ready",
    });
    if (preview.kieImageTaskId) {
      await this.store.insertProviderLog({
        taskId: preview.kieImageTaskId,
        provider: "kie",
        model: ZCV_MODELS.image.providerModelId,
        purpose: "preview_image",
        status: "completed",
        costCredits: preview.imageCostCredits,
        previewId,
      });
    }
    return this.store.getPreview(previewId);
  }

  async pollPreview(previewId: string, claimSecret: string) {
    const preview = await this.requirePreviewWithSecret(previewId, claimSecret);
    if (
      preview.status === "ready" ||
      preview.status === "failed" ||
      !preview.kieImageTaskId
    ) {
      return this.serializePreview(preview);
    }
    const deadline = Date.now() + this.providerTimeoutMs;
    const remote = await this.withDeadline(
      () => this.provider.getTask(preview.kieImageTaskId!),
      deadline,
      "Preview task query"
    );
    await this.store.insertProviderLog({
      taskId: preview.kieImageTaskId,
      provider: "kie",
      model: ZCV_MODELS.image.providerModelId,
      purpose: "reconcile",
      status: remote.status,
      costCredits: remote.costCredits ?? preview.imageCostCredits,
      previewId,
      raw: remote.raw,
    });
    if (remote.status === "completed" && remote.resultUrl) {
      await this.completeImagePreview(previewId, remote.resultUrl, deadline);
      const ready = await this.store.getPreview(previewId);
      return this.serializePreview(ready!);
    }
    if (remote.status === "failed") {
      await this.store.updatePreview(previewId, {
        status: "failed",
        errorMessage: remote.error || "Preview generation failed",
      });
    }
    const latest = await this.store.getPreview(previewId);
    return this.serializePreview(latest!);
  }

  async claimPreview(previewId: string, claimSecret: string, userId: string) {
    const claimed = await this.store.claimPreview(
      previewId,
      hashClaimSecret(claimSecret),
      userId
    );
    if (!claimed) {
      throw new ZcvError(
        "Preview cannot be claimed",
        "claim_denied",
        403
      );
    }
    return claimed;
  }

  async createCheckout(input: {
    userId: string;
    email?: string;
    previewId: string;
    claimSecret: string;
    packId?: string;
    amountCents?: number;
    successUrl?: string;
    cancelUrl?: string;
  }) {
    if (!this.stripe) {
      throw new ZcvError("Stripe is not configured", "stripe_missing", 503);
    }
    let pack: ZcvCreditPack;
    try {
      pack = requireCreditPack(input.packId);
    } catch {
      throw new ZcvError("Unknown credit pack", "invalid_pack", 400);
    }
    // Client-supplied amounts are ignored. The server pack is the source of truth.
    void input.amountCents;
    const preview = await this.claimPreview(
      input.previewId,
      input.claimSecret,
      input.userId
    );
    if (preview.status !== "ready" || !preview.intermediateImageKey) {
      throw new ZcvError(
        "Preview image is not ready yet",
        "preview_not_ready",
        409
      );
    }

    const existing = await this.store.getOrderByPreviewUser(
      preview.id,
      input.userId
    );
    const order = existing ?? await this.store.insertOrderIfAbsent({
        id: this.ids(),
        userId: input.userId,
        previewId: preview.id,
        productId: pack.id,
        amountCents: pack.priceCents,
        currency: ZCV_PRODUCT.currency,
        status: "created",
        paidAt: null,
        deliveredAt: null,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        jobId: null,
        createdAt: new Date(this.now()),
        updatedAt: new Date(this.now()),
      } satisfies OrderRecord);
    if (order.status === "paid" || order.paidAt) {
      throw new ZcvError("This preview is already paid", "already_paid", 409);
    }
    const chargedPack = getCreditPack(order.productId) ?? pack;

    const session = await this.stripe.createCheckoutSession({
      orderId: order.id,
      userId: input.userId,
      email: input.email,
      amountCents: order.amountCents,
      currency: order.currency,
      productId: order.productId,
      productName: `${chargedPack.name} — ${chargedPack.credits} credits`,
      productDescription: `${chargedPack.credits} credits (${chargedPack.videos} zombie couple video${chargedPack.videos === 1 ? "" : "s"}). One-time credit pack, no subscription.`,
      credits: chargedPack.credits,
      idempotencyKey: `zcv-checkout-${order.id}`,
      successUrl:
        input.successUrl ||
        `${this.appUrl}/success?orderId=${order.id}`,
      cancelUrl: input.cancelUrl || `${this.appUrl}/?cancelled=1`,
    });
    await this.store.updateOrderIfUnpaid(order.id, {
      status: "checkout_created",
      stripeCheckoutSessionId: session.id,
    });
    return {
      url: session.url,
      orderId: order.id,
      packId: order.productId,
      amountCents: order.amountCents,
      credits: chargedPack.credits,
    };
  }

  publicProduct() {
    return publicCreditCatalog();
  }

  async handleStripeWebhook(rawBody: string, signature: string | null) {
    if (!this.stripe || !this.stripeWebhookSecret) {
      throw new ZcvError("Stripe webhook is not configured", "stripe_missing", 503);
    }
    if (!signature) {
      throw new ZcvError("Missing Stripe signature", "bad_signature", 400);
    }
    let event: StripeLikeEvent;
    try {
      event = this.stripe.constructEvent(
        rawBody,
        signature,
        this.stripeWebhookSecret
      ) as StripeLikeEvent;
    } catch {
      throw new ZcvError("Invalid Stripe signature", "bad_signature", 400);
    }
    return this.processStripeEvent(event);
  }

  async processStripeEvent(event: StripeLikeEvent) {
    if (event.livemode !== (this.stripeMode === "live")) {
      throw new ZcvError(
        "Stripe event mode does not match the configured account mode",
        "stripe_mode_mismatch",
        400
      );
    }
    const result = await this.store.transaction(async (store) => {
      const object = event.data?.object || {};
      const metadata = object.metadata || {};
      const orderId = metadata.orderId;
      const inserted = await store.insertStripeEventIfAbsent({
        eventId: event.id,
        eventType: event.type,
        orderId,
      });
      if (!inserted) {
        return {
          granted: false,
          reason: "duplicate_event",
          jobCreated: false,
          orderId,
        };
      }

      const grantable =
        event.type === "checkout.session.completed" &&
        object.payment_status === "paid" &&
        object.mode === ZCV_PRODUCT.mode;

      if (!grantable) {
        if (orderId) {
          if (
            event.type === "checkout.session.expired" ||
            event.type === "checkout.session.async_payment_failed" ||
            event.type === "payment_intent.payment_failed"
          ) {
            await store.updateOrderIfUnpaid(orderId, {
              status:
                event.type === "checkout.session.expired"
                  ? "cancelled"
                  : "failed",
            });
          }
        }
        return { granted: false, reason: event.type, jobCreated: false };
      }

      if (!orderId) {
        return { granted: false, reason: "missing_order", jobCreated: false };
      }

      const order = await store.getOrder(orderId);
      if (!order) {
        return { granted: false, reason: "order_not_found", jobCreated: false };
      }
      if (metadata.userId !== order.userId) {
        return { granted: false, reason: "owner_mismatch", jobCreated: false };
      }
      if (
        !object.id ||
        (order.stripeCheckoutSessionId &&
          object.id !== order.stripeCheckoutSessionId)
      ) {
        return { granted: false, reason: "session_mismatch", jobCreated: false };
      }
      const pack = getCreditPack(order.productId);
      if (
        !pack ||
        object.amount_total !== order.amountCents ||
        object.currency !== order.currency ||
        metadata.productId !== order.productId ||
        order.amountCents !== pack.priceCents
      ) {
        return { granted: false, reason: "amount_mismatch", jobCreated: false };
      }

      const paymentIntent =
        typeof object.payment_intent === "string"
          ? object.payment_intent
          : object.payment_intent?.id;

      const alreadyPaid = Boolean(order.paidAt);
      if (!alreadyPaid) {
        await store.updateOrder(order.id, {
          status: "paid",
          paidAt: new Date(this.now()),
          stripePaymentIntentId: paymentIntent ?? order.stripePaymentIntentId,
          stripeCheckoutSessionId: object.id ?? order.stripeCheckoutSessionId,
        });
      }

      const job = await this.ensureJobForOrder(order, store);
      return {
        granted: true,
        reason: alreadyPaid ? "already_paid" : "paid",
        jobCreated: true,
        jobId: job.id,
        orderId: order.id,
      };
    });

    if (
      result.orderId &&
      (result.granted || result.reason === "duplicate_event")
    ) {
      let job = result.jobId
        ? await this.store.getJob(result.jobId)
        : await this.store.getJobByOrder(result.orderId);
      if (job?.status === "pending") {
        const jobId = job.id;
        try {
          job = await this.startOrRecoverJob(jobId);
        } catch {
          // Payment and the pending/unknown job are durable; webhook retries must not regrant.
          job = await this.store.getJob(jobId);
        }
      }
      return {
        ...result,
        jobId: job?.id ?? result.jobId,
        generationStatus: job?.status,
      };
    }
    return result;
  }

  async ensureJobForOrder(
    order: OrderRecord,
    store: ZcvStore = this.store
  ): Promise<JobRecord> {
    const preview = await store.getPreview(order.previewId);
    const job = await store.insertJobIfAbsent({
      id: this.ids(),
      orderId: order.id,
      previewId: order.previewId,
      userId: order.userId,
      status: "pending",
      moderationStatus: "pending",
      phase: "video",
      kieImageTaskId: preview?.kieImageTaskId ?? null,
      kieVideoTaskId: null,
      imageCostCredits: preview?.imageCostCredits ?? 0,
      videoCostCredits: 0,
      attemptCount: 0,
      maxAttempts: ZCV_LIMITS.videoAttempts,
      videoKey: null,
      errorMessage: null,
      lastReconciledAt: null,
      reconciliationToken: null,
      reconciliationLeaseUntil: null,
      createdAt: new Date(this.now()),
      updatedAt: new Date(this.now()),
    });
    await store.updateOrder(order.id, { jobId: job.id });
    return job;
  }

  async startOrRecoverJob(
    jobId: string,
    deadline = Date.now() + this.providerTimeoutMs
  ): Promise<JobRecord | null> {
    const job = await this.store.getJob(jobId);
    if (!job) throw new ZcvError("Job not found", "not_found", 404);
    const order = await this.store.getOrder(job.orderId);
    if (!order?.paidAt) {
      throw new ZcvError("Order is not paid", "not_paid", 409);
    }
    const preview = await this.store.getPreview(job.previewId);
    if (!preview?.intermediateImageKey) {
      throw new ZcvError("Missing intermediate image", "missing_image", 409);
    }

    if (job.kieVideoTaskId) {
      return this.reconcileJob(job.id, deadline);
    }
    if (job.status !== "pending") return job;
    if (Date.now() >= deadline) return job;

    const claimed = await this.store.claimJobSubmission(job.id);
    if (!claimed) return this.store.getJob(job.id);

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      await this.store.releaseJobSubmissionClaim(job.id);
      return this.store.getJob(job.id);
    }

    const imageUrl = this.providerFetchUrl(preview.intermediateImageKey);
    let submission: ReturnType<GenerationProvider["createVideoTask"]> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      submission = this.provider.createVideoTask({
        prompt: ZCV_PROMPTS.video,
        imageUrl,
        duration: "5",
        sound: false,
      });
      const task = await Promise.race([
        submission,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error("Provider submission timed out; status unknown")
              ),
            remainingMs
          );
        }),
      ]);
      await this.recordVideoSubmission(job, task);
    } catch (error) {
      const current = await this.store.getJob(job.id);
      if (!current?.kieVideoTaskId) {
        await this.store.updateJob(job.id, {
          status: "submission_unknown",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Provider submission status unknown",
        });
      }
      // A late provider response safely recovers its task ID without another charge.
      if (submission) {
        void submission
          .then((task) => this.recordVideoSubmission(job, task))
          .catch(() => undefined);
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
    return this.store.getJob(job.id);
  }

  private async recordVideoSubmission(
    job: JobRecord,
    task: Awaited<ReturnType<GenerationProvider["createVideoTask"]>>
  ) {
    const recorded = await this.store.recordJobSubmission(job.id, {
      taskId: task.taskId,
      costCredits: task.costCredits,
    });
    if (!recorded) return;
    await this.store.insertProviderLog({
      taskId: task.taskId,
      provider: "kie",
      model: ZCV_MODELS.video.providerModelId,
      purpose: "paid_video",
      status: "submitted",
      costCredits: task.costCredits,
      orderId: job.orderId,
      previewId: job.previewId,
      jobId: job.id,
      raw: task.raw,
    });
  }

  async reconcileJob(
    jobId: string,
    deadline = Date.now() + this.providerTimeoutMs
  ): Promise<JobRecord | null> {
    const job = await this.store.getJob(jobId);
    if (!job) throw new ZcvError("Job not found", "not_found", 404);
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "refund_pending"
    ) {
      return job;
    }
    if (job.status === "submitting" && !job.kieVideoTaskId) {
      await this.store.markStaleJobSubmissionUnknown(job.id);
      return this.store.getJob(job.id);
    }
    if (job.moderationStatus === "unknown") {
      return job;
    }
    const previouslyRecordedReview =
      job.kieVideoTaskId && job.moderationStatus === "submitted"
        ? await this.store.getModerationResult(job.kieVideoTaskId)
        : null;
    if (
      job.moderationStatus === "submitted" &&
      !previouslyRecordedReview
    ) {
      return job;
    }
    if (job.status === "needs_check" && !previouslyRecordedReview) return job;
    if (!job.kieVideoTaskId) {
      return job.status === "pending"
        ? this.startOrRecoverJob(job.id, deadline)
        : job;
    }
    const taskId = job.kieVideoTaskId;

    const reconciliationStartedAt = this.now();
    const reconciliationToken = this.ids();
    const leaseMs = Math.max(
      this.providerTimeoutMs * 2,
      ZCV_LIMITS.reconcileCooldownMs + 1_000
    );
    const claimed = await this.store.claimJobReconciliation(
      job.id,
      taskId,
      new Date(reconciliationStartedAt),
      new Date(reconciliationStartedAt - ZCV_LIMITS.reconcileCooldownMs),
      reconciliationToken,
      new Date(reconciliationStartedAt + leaseMs)
    );
    if (!claimed) return this.store.getJob(job.id);

    try {
    const remote = await this.withDeadline(
      () => this.provider.getTask(taskId),
      deadline,
      "Video task query"
    );
    await this.store.insertProviderLog({
      taskId,
      provider: "kie",
      model: ZCV_MODELS.video.providerModelId,
      purpose: "reconcile",
      status: remote.status,
      costCredits: remote.costCredits ?? job.videoCostCredits,
      orderId: job.orderId,
      previewId: job.previewId,
      jobId: job.id,
      raw: remote.raw,
    });
    const stillCurrent = await this.store.updateJobForCurrentTask(
      job.id,
      taskId,
      job.moderationStatus,
      { lastReconciledAt: new Date(this.now()) },
      reconciliationToken
    );
    if (!stillCurrent) return this.store.getJob(job.id);

    if (remote.status === "completed" && remote.resultUrl) {
      if (job.moderationStatus !== "approved") {
        let review: Awaited<ReturnType<GenerationProvider["reviewVideo"]>>;
        let expectedModerationStatus = job.moderationStatus;
        const previousReview =
          previouslyRecordedReview ??
          (await this.store.getModerationResult(taskId));
        if (previousReview) {
          review = previousReview;
        } else {
          if (Date.now() >= deadline) return this.store.getJob(job.id);
          const dispatchRecorded =
            await this.store.markModerationReviewSubmitted(
              {
                id: job.id,
                taskId,
                expectedModerationStatus,
                reconciliationToken,
                provider: "kie",
                model: ZCV_MODELS.moderation.providerModelId,
                orderId: job.orderId,
                previewId: job.previewId,
              }
            );
          if (!dispatchRecorded) return this.store.getJob(job.id);
          expectedModerationStatus = "submitted";
          try {
            review = await this.withDeadline(
              () => this.provider.reviewVideo({ videoUrl: remote.resultUrl! }),
              deadline,
              "Video review"
            );
          } catch (error) {
            if (error instanceof DeadlineExpiredBeforeDispatchError) {
              const restored =
                await this.store.resetModerationReviewBeforeDispatch({
                  id: job.id,
                  taskId,
                  expectedModerationStatus: job.moderationStatus,
                  reconciliationToken,
                });
              if (!restored) return this.store.getJob(job.id);
              return this.store.getJob(job.id);
            }
            const message =
              error instanceof Error ? error.message : "Video review result unknown";
            await this.store.insertProviderLog({
              taskId,
              provider: "kie",
              model: ZCV_MODELS.moderation.providerModelId,
              purpose: "moderation",
              status: "unknown",
              costCredits: null,
              orderId: job.orderId,
              previewId: job.previewId,
              jobId: job.id,
              raw: { message },
            });
            const transitioned = await this.store.updateJobForCurrentTask(
              job.id,
              taskId,
              expectedModerationStatus,
              {
                status: "needs_check",
                moderationStatus: "unknown",
                errorMessage: "Safety review could not be confirmed",
              },
              reconciliationToken
            );
            if (!transitioned) return this.store.getJob(job.id);
            return this.store.getJob(job.id);
          }

          await this.store.insertProviderLog({
            taskId,
            provider: "kie",
            model: ZCV_MODELS.moderation.providerModelId,
            purpose: "moderation",
            status: review.safe ? "approved" : "rejected",
            costCredits: review.costCredits ?? null,
            orderId: job.orderId,
            previewId: job.previewId,
            jobId: job.id,
            raw: review.raw ?? { reason: review.reason },
          });
        }

        if (!review.safe) {
          if (job.attemptCount < job.maxAttempts) {
            const transitioned = await this.store.updateJobForCurrentTask(
              job.id,
              taskId,
              expectedModerationStatus,
              {
                status: "pending",
                moderationStatus: "rejected",
                kieVideoTaskId: null,
                errorMessage: "Video did not pass the safety review",
              },
              reconciliationToken
            );
            if (!transitioned) return this.store.getJob(job.id);
            return this.startOrRecoverJob(job.id, deadline);
          }
          const transitioned = await this.store.markRefundPending(
            { ...job, moderationStatus: expectedModerationStatus },
            "Video did not pass the safety review; refund required",
            "rejected",
            reconciliationToken
          );
          if (!transitioned) return this.store.getJob(job.id);
          return this.store.getJob(job.id);
        }
        const approved = await this.store.updateJobForCurrentTask(
          job.id,
          taskId,
          expectedModerationStatus,
          { status: "video_submitted", moderationStatus: "approved" },
          reconciliationToken
        );
        if (!approved) return this.store.getJob(job.id);
      }

      const video = await this.withDeadline(
        () => this.fetchBinary(remote.resultUrl!),
        deadline,
        "Video download"
      );
      const videoKey = `zcv/${job.previewId}/video.mp4`;
      await this.withDeadline(
        () => this.storage.put(videoKey, video, "video/mp4"),
        deadline,
        "Video storage"
      );
      const delivered = await this.store.completeDelivery(
        job.id,
        job.orderId,
        taskId,
        videoKey,
        new Date(this.now()),
        reconciliationToken
      );
      if (!delivered) return this.store.getJob(job.id);
      return this.store.getJob(job.id);
    }

    if (remote.status === "failed") {
      if (job.attemptCount < job.maxAttempts) {
        const transitioned = await this.store.updateJobForCurrentTask(
          job.id,
          taskId,
          job.moderationStatus,
          {
            kieVideoTaskId: null,
            status: "pending",
            moderationStatus: "pending",
            errorMessage: remote.error || "Video generation failed",
          },
          reconciliationToken
        );
        if (!transitioned) return this.store.getJob(job.id);
        return this.startOrRecoverJob(job.id, deadline);
      }
      const transitioned = await this.store.markRefundPending(
        job,
        remote.error || "Video generation failed",
        job.moderationStatus,
        reconciliationToken
      );
      if (!transitioned) return this.store.getJob(job.id);
    }

    return this.store.getJob(job.id);
    } finally {
      await this.store.releaseJobReconciliation(job.id, reconciliationToken);
    }
  }

  async reconcileOpenJobs() {
    const jobs = await this.store.listRecoverableJobs(4);
    const results: Array<JobRecord | null> = new Array(jobs.length).fill(null);
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        const job = jobs[index];
        if (!job) return;
        try {
          results[index] = await this.reconcileJob(job.id);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown reconciliation error";
          if (job.kieVideoTaskId) {
            await this.store.updateJobForCurrentTask(
              job.id,
              job.kieVideoTaskId,
              job.moderationStatus,
              {
                errorMessage: message,
                lastReconciledAt: new Date(this.now()),
              }
            );
          } else {
            await this.store.updateJob(job.id, {
              errorMessage: message,
              lastReconciledAt: new Date(this.now()),
            });
          }
          await this.store.insertProviderLog({
            taskId: job.kieVideoTaskId ?? undefined,
            provider: "kie",
            model: ZCV_MODELS.video.providerModelId,
            purpose: "reconcile",
            status: "query_error",
            costCredits: null,
            orderId: job.orderId,
            previewId: job.previewId,
            jobId: job.id,
            raw: { message },
          });
          results[index] = null;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, jobs.length) }, () => worker())
    );
    return results;
  }

  async listOrdersForUser(userId: string) {
    const orders = await this.store.listOrdersForUser(userId);
    return orders.map((order) => this.serializeOrder(order));
  }

  async getOrderForUser(orderId: string, userId: string) {
    const order = await this.store.getOrder(orderId);
    if (!order || order.userId !== userId) {
      throw new ZcvError("Order not found", "not_found", 404);
    }
    let job = order.jobId ? await this.store.getJob(order.jobId) : null;
    if (
      order.paidAt &&
      job &&
      !["completed", "failed", "refund_pending"].includes(job.status)
    ) {
      try {
        job = (await this.reconcileJob(job.id)) ?? job;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Order recovery failed";
        await this.store.updateJob(job.id, {
          errorMessage: message,
          lastReconciledAt: new Date(this.now()),
        });
        await this.store.insertProviderLog({
          taskId: job.kieVideoTaskId ?? undefined,
          provider: "kie",
          model: ZCV_MODELS.video.providerModelId,
          purpose: job.kieVideoTaskId ? "reconcile" : "paid_video",
          status: job.kieVideoTaskId ? "query_error" : "submission_unknown",
          costCredits: null,
          orderId: job.orderId,
          previewId: job.previewId,
          jobId: job.id,
          raw: { message },
        });
        job = await this.store.getJob(job.id);
      }
    }
    const refreshedOrder = (await this.store.getOrder(orderId)) ?? order;
    const refreshedJob = job
      ? (await this.store.getJob(job.id)) ?? job
      : null;
    const preview = await this.store.getPreview(refreshedOrder.previewId);
    return {
      order: this.serializeOrder(refreshedOrder),
      job: refreshedJob
        ? {
            id: refreshedJob.id,
            status: refreshedJob.status,
            phase: refreshedJob.phase,
            attemptCount: refreshedJob.attemptCount,
            errorMessage: refreshedJob.errorMessage,
          }
        : null,
      preview: preview
        ? {
            id: preview.id,
            status: preview.status,
            previewImageUrl: preview.previewImageKey
              ? this.previewUrl(preview)
              : null,
          }
        : null,
    };
  }

  async createDownloadLink(orderId: string, userId: string) {
    const order = await this.store.getOrder(orderId);
    if (!order || order.userId !== userId) {
      throw new ZcvError("Order not found", "not_found", 404);
    }
    if (!order.paidAt || !order.deliveredAt || !order.jobId) {
      throw new ZcvError("Video is not ready", "not_ready", 409);
    }
    const job = await this.store.getJob(order.jobId);
    if (!job?.videoKey) {
      throw new ZcvError("Video is not ready", "not_ready", 409);
    }
    const token = createMediaToken(this.mediaSecret, {
      key: job.videoKey,
      purpose: "download",
      userId,
      orderId,
      exp: this.now() + ZCV_LIMITS.mediaTokenTtlMs,
    });
    return {
      url: `${this.appUrl}/api/zcv/media/${token}`,
      expiresInSeconds: Math.floor(ZCV_LIMITS.mediaTokenTtlMs / 1000),
    };
  }

  async readMedia(token: string, userId?: string) {
    const payload = verifyMediaToken(this.mediaSecret, token, this.now());
    if (payload.purpose === "download") {
      if (!userId || !payload.userId || payload.userId !== userId) {
        throw new ZcvError("Forbidden", "forbidden", 403);
      }
      if (payload.orderId) {
        const order = await this.store.getOrder(payload.orderId);
        if (!order || order.userId !== userId) {
          throw new ZcvError("Forbidden", "forbidden", 403);
        }
      }
    }
    const body = await this.storage.get(payload.key);
    const contentType = payload.key.endsWith(".mp4")
      ? "video/mp4"
      : payload.key.endsWith(".png")
        ? "image/png"
        : "image/jpeg";
    return { body, contentType, purpose: payload.purpose };
  }

  successPageGrant(): never {
    throw new ZcvError(
      "The success page never grants payment entitlements",
      "success_page_cannot_grant",
      400
    );
  }

  private async requirePreviewWithSecret(
    previewId: string,
    claimSecret: string
  ) {
    const preview = await this.store.getPreview(previewId);
    if (!preview) {
      throw new ZcvError("Preview not found", "not_found", 404);
    }
    if (!safeEqual(preview.claimSecretHash, hashClaimSecret(claimSecret))) {
      throw new ZcvError("Preview not found", "not_found", 404);
    }
    return preview;
  }

  private serializePreview(preview: PreviewRecord) {
    return {
      id: preview.id,
      status: preview.status,
      ownerUserId: preview.ownerUserId,
      errorMessage: preview.errorMessage,
      isMock: this.mockPreviewMode,
      previewImageUrl: preview.previewImageKey
        ? this.previewUrl(preview)
        : null,
      product: this.publicProduct(),
    };
  }

  private serializeOrder(order: OrderRecord) {
    return {
      id: order.id,
      userId: order.userId,
      previewId: order.previewId,
      productId: order.productId,
      amountCents: order.amountCents,
      currency: order.currency,
      status: order.status,
      paidAt: order.paidAt,
      deliveredAt: order.deliveredAt,
      jobId: order.jobId,
    };
  }

  private previewUrl(preview: PreviewRecord) {
    const token = createMediaToken(this.mediaSecret, {
      key: preview.previewImageKey!,
      purpose: "preview",
      exp: this.now() + ZCV_LIMITS.mediaTokenTtlMs,
    });
    return `${this.appUrl}/api/zcv/media/${token}`;
  }

  private providerFetchUrl(key: string) {
    const token = createMediaToken(this.mediaSecret, {
      key,
      purpose: "provider-fetch",
      exp: this.now() + ZCV_LIMITS.providerFetchTokenTtlMs,
    });
    return `${this.appUrl}/api/zcv/media/${token}`;
  }
}

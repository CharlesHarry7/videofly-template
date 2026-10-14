import type { SqlClient } from "./sql";
import type {
  JobRecord,
  JobStatus,
  OrderRecord,
  OrderStatus,
  PreviewRecord,
  PreviewStatus,
  ProviderCallLog,
} from "./types";

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date();
}

function asString(value: unknown): string {
  return String(value ?? "");
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

function mapPreview(row: Record<string, unknown>): PreviewRecord {
  return {
    id: asString(row.id),
    claimSecretHash: asString(row.claim_secret_hash),
    ownerUserId: asNullableString(row.owner_user_id),
    sourceImageKey: asString(row.source_image_key),
    intermediateImageKey: asNullableString(row.intermediate_image_key),
    previewImageKey: asNullableString(row.preview_image_key),
    status: asString(row.status) as PreviewStatus,
    kieImageTaskId: asNullableString(row.kie_image_task_id),
    imageCostCredits: asNumber(row.image_cost_credits),
    errorMessage: asNullableString(row.error_message),
    rightsAccepted: asBoolean(row.rights_accepted),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function mapOrder(row: Record<string, unknown>): OrderRecord {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    previewId: asString(row.preview_id),
    productId: asString(row.product_id),
    amountCents: asNumber(row.amount_cents),
    currency: asString(row.currency),
    status: asString(row.status) as OrderStatus,
    paidAt: row.paid_at ? asDate(row.paid_at) : null,
    deliveredAt: row.delivered_at ? asDate(row.delivered_at) : null,
    stripeCheckoutSessionId: asNullableString(row.stripe_checkout_session_id),
    stripePaymentIntentId: asNullableString(row.stripe_payment_intent_id),
    jobId: asNullableString(row.job_id),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function mapJob(row: Record<string, unknown>): JobRecord {
  return {
    id: asString(row.id),
    orderId: asString(row.order_id),
    previewId: asString(row.preview_id),
    userId: asString(row.user_id),
    status: asString(row.status) as JobStatus,
    phase: asString(row.phase) as JobRecord["phase"],
    kieImageTaskId: asNullableString(row.kie_image_task_id),
    kieVideoTaskId: asNullableString(row.kie_video_task_id),
    imageCostCredits: asNumber(row.image_cost_credits),
    videoCostCredits: asNumber(row.video_cost_credits),
    attemptCount: asNumber(row.attempt_count),
    maxAttempts: asNumber(row.max_attempts),
    videoKey: asNullableString(row.video_key),
    errorMessage: asNullableString(row.error_message),
    lastReconciledAt: row.last_reconciled_at
      ? asDate(row.last_reconciled_at)
      : null,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

export class ZcvStore {
  constructor(private readonly sql: SqlClient) {}

  async insertPreview(preview: PreviewRecord): Promise<void> {
    await this.sql.query(
      `INSERT INTO zcv_previews (
        id, claim_secret_hash, owner_user_id, source_image_key,
        intermediate_image_key, preview_image_key, status, kie_image_task_id,
        image_cost_credits, error_message, rights_accepted, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        preview.id,
        preview.claimSecretHash,
        preview.ownerUserId,
        preview.sourceImageKey,
        preview.intermediateImageKey,
        preview.previewImageKey,
        preview.status,
        preview.kieImageTaskId,
        preview.imageCostCredits,
        preview.errorMessage,
        preview.rightsAccepted,
        preview.createdAt,
        preview.updatedAt,
      ]
    );
  }

  async getPreview(id: string): Promise<PreviewRecord | null> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_previews WHERE id = $1`,
      [id]
    );
    return rows[0] ? mapPreview(rows[0]) : null;
  }

  async updatePreview(
    id: string,
    patch: Partial<
      Pick<
        PreviewRecord,
        | "ownerUserId"
        | "intermediateImageKey"
        | "previewImageKey"
        | "status"
        | "kieImageTaskId"
        | "imageCostCredits"
        | "errorMessage"
      >
    >
  ): Promise<void> {
    const current = await this.getPreview(id);
    if (!current) return;
    const next = { ...current, ...patch, updatedAt: new Date() };
    await this.sql.query(
      `UPDATE zcv_previews SET
        owner_user_id=$2, intermediate_image_key=$3, preview_image_key=$4,
        status=$5, kie_image_task_id=$6, image_cost_credits=$7,
        error_message=$8, updated_at=$9
      WHERE id=$1`,
      [
        id,
        next.ownerUserId,
        next.intermediateImageKey,
        next.previewImageKey,
        next.status,
        next.kieImageTaskId,
        next.imageCostCredits,
        next.errorMessage,
        next.updatedAt,
      ]
    );
  }

  async claimPreview(
    previewId: string,
    claimSecretHash: string,
    userId: string
  ): Promise<PreviewRecord | null> {
    const rows = await this.sql.query(
      `UPDATE zcv_previews
       SET owner_user_id = $3, updated_at = NOW()
       WHERE id = $1
         AND claim_secret_hash = $2
         AND (owner_user_id IS NULL OR owner_user_id = $3)
       RETURNING *`,
      [previewId, claimSecretHash, userId]
    );
    return rows[0] ? mapPreview(rows[0]) : null;
  }

  async insertOrder(order: OrderRecord): Promise<void> {
    await this.sql.query(
      `INSERT INTO zcv_orders (
        id, user_id, preview_id, product_id, amount_cents, currency, status,
        paid_at, delivered_at, stripe_checkout_session_id, stripe_payment_intent_id,
        job_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        order.id,
        order.userId,
        order.previewId,
        order.productId,
        order.amountCents,
        order.currency,
        order.status,
        order.paidAt,
        order.deliveredAt,
        order.stripeCheckoutSessionId,
        order.stripePaymentIntentId,
        order.jobId,
        order.createdAt,
        order.updatedAt,
      ]
    );
  }

  async getOrder(id: string): Promise<OrderRecord | null> {
    const rows = await this.sql.query(`SELECT * FROM zcv_orders WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async getOrderBySession(sessionId: string): Promise<OrderRecord | null> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_orders WHERE stripe_checkout_session_id = $1`,
      [sessionId]
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async listOrdersForUser(userId: string): Promise<OrderRecord[]> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(mapOrder);
  }

  async getOrderByPreviewUser(
    previewId: string,
    userId: string
  ): Promise<OrderRecord | null> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_orders WHERE preview_id = $1 AND user_id = $2`,
      [previewId, userId]
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async updateOrder(
    id: string,
    patch: Partial<
      Pick<
        OrderRecord,
        | "status"
        | "paidAt"
        | "deliveredAt"
        | "stripeCheckoutSessionId"
        | "stripePaymentIntentId"
        | "jobId"
      >
    >
  ): Promise<void> {
    const current = await this.getOrder(id);
    if (!current) return;
    const next = { ...current, ...patch, updatedAt: new Date() };
    await this.sql.query(
      `UPDATE zcv_orders SET
        status=$2, paid_at=$3, delivered_at=$4,
        stripe_checkout_session_id=$5, stripe_payment_intent_id=$6,
        job_id=$7, updated_at=$8
      WHERE id=$1`,
      [
        id,
        next.status,
        next.paidAt,
        next.deliveredAt,
        next.stripeCheckoutSessionId,
        next.stripePaymentIntentId,
        next.jobId,
        next.updatedAt,
      ]
    );
  }

  async insertJobIfAbsent(job: JobRecord): Promise<JobRecord> {
    const rows = await this.sql.query(
      `INSERT INTO zcv_jobs (
        id, order_id, preview_id, user_id, status, phase, kie_image_task_id,
        kie_video_task_id, image_cost_credits, video_cost_credits, attempt_count,
        max_attempts, video_key, error_message, last_reconciled_at, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (order_id) DO NOTHING
      RETURNING *`,
      [
        job.id,
        job.orderId,
        job.previewId,
        job.userId,
        job.status,
        job.phase,
        job.kieImageTaskId,
        job.kieVideoTaskId,
        job.imageCostCredits,
        job.videoCostCredits,
        job.attemptCount,
        job.maxAttempts,
        job.videoKey,
        job.errorMessage,
        job.lastReconciledAt,
        job.createdAt,
        job.updatedAt,
      ]
    );
    if (rows[0]) return mapJob(rows[0]);
    const existing = await this.getJobByOrder(job.orderId);
    if (!existing) {
      throw new Error("Failed to persist generation job");
    }
    return existing;
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const rows = await this.sql.query(`SELECT * FROM zcv_jobs WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async getJobByOrder(orderId: string): Promise<JobRecord | null> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_jobs WHERE order_id = $1`,
      [orderId]
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async listRecoverableJobs(): Promise<JobRecord[]> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_jobs WHERE status IN ('pending', 'video_submitted')`
    );
    return rows.map(mapJob);
  }

  async updateJob(
    id: string,
    patch: Partial<
      Pick<
        JobRecord,
        | "status"
        | "phase"
        | "kieVideoTaskId"
        | "videoCostCredits"
        | "attemptCount"
        | "videoKey"
        | "errorMessage"
        | "lastReconciledAt"
      >
    >
  ): Promise<void> {
    const current = await this.getJob(id);
    if (!current) return;
    const next = { ...current, ...patch, updatedAt: new Date() };
    await this.sql.query(
      `UPDATE zcv_jobs SET
        status=$2, phase=$3, kie_video_task_id=$4, video_cost_credits=$5,
        attempt_count=$6, video_key=$7, error_message=$8,
        last_reconciled_at=$9, updated_at=$10
      WHERE id=$1`,
      [
        id,
        next.status,
        next.phase,
        next.kieVideoTaskId,
        next.videoCostCredits,
        next.attemptCount,
        next.videoKey,
        next.errorMessage,
        next.lastReconciledAt,
        next.updatedAt,
      ]
    );
  }

  async insertStripeEventIfAbsent(input: {
    eventId: string;
    eventType: string;
    orderId?: string;
  }): Promise<boolean> {
    const rows = await this.sql.query(
      `INSERT INTO zcv_stripe_events (event_id, event_type, order_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [input.eventId, input.eventType, input.orderId ?? null]
    );
    return rows.length > 0;
  }

  async insertProviderLog(log: ProviderCallLog): Promise<void> {
    await this.sql.query(
      `INSERT INTO zcv_provider_logs (
        task_id, provider, model, purpose, status, cost_credits,
        order_id, preview_id, job_id, raw
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [
        log.taskId ?? null,
        log.provider,
        log.model,
        log.purpose,
        log.status,
        log.costCredits,
        log.orderId ?? null,
        log.previewId ?? null,
        log.jobId ?? null,
        JSON.stringify(log.raw ?? {}),
      ]
    );
  }

  async listProviderLogs(): Promise<ProviderCallLog[]> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_provider_logs ORDER BY id ASC`
    );
    return rows.map((row) => ({
      taskId: asNullableString(row.task_id) ?? undefined,
      provider: asString(row.provider),
      model: asString(row.model),
      purpose: asString(row.purpose) as ProviderCallLog["purpose"],
      status: asString(row.status),
      costCredits: asNumber(row.cost_credits),
      orderId: asNullableString(row.order_id) ?? undefined,
      previewId: asNullableString(row.preview_id) ?? undefined,
      jobId: asNullableString(row.job_id) ?? undefined,
      raw: row.raw,
    }));
  }

  async consumeRateLimit(key: string, limit: number, now: Date): Promise<boolean> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_rate_limits WHERE key = $1`,
      [key]
    );
    if (!rows[0]) {
      await this.sql.query(
        `INSERT INTO zcv_rate_limits (key, count, window_start) VALUES ($1,1,$2)`,
        [key, now]
      );
      return true;
    }
    const count = asNumber(rows[0].count);
    if (count >= limit) return false;
    await this.sql.query(
      `UPDATE zcv_rate_limits SET count = count + 1 WHERE key = $1`,
      [key]
    );
    return true;
  }

  async consumeDailyBudget(input: {
    day: string;
    maxCount: number;
    maxCredits: number;
    costCredits: number;
  }): Promise<boolean> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_daily_budget WHERE day = $1::date`,
      [input.day]
    );
    if (!rows[0]) {
      await this.sql.query(
        `INSERT INTO zcv_daily_budget (day, preview_count, preview_cost_credits)
         VALUES ($1::date, 1, $2)`,
        [input.day, input.costCredits]
      );
      return true;
    }
    const count = asNumber(rows[0].preview_count);
    const credits = asNumber(rows[0].preview_cost_credits);
    if (count >= input.maxCount || credits + input.costCredits > input.maxCredits) {
      return false;
    }
    await this.sql.query(
      `UPDATE zcv_daily_budget
       SET preview_count = preview_count + 1,
           preview_cost_credits = preview_cost_credits + $2
       WHERE day = $1::date`,
      [input.day, input.costCredits]
    );
    return true;
  }

  async consumeBotNonce(nonce: string, expiresAt: Date): Promise<boolean> {
    const rows = await this.sql.query(
      `INSERT INTO zcv_bot_nonces (nonce, expires_at)
       VALUES ($1,$2)
       ON CONFLICT (nonce) DO NOTHING
       RETURNING nonce`,
      [nonce, expiresAt]
    );
    return rows.length > 0;
  }
}

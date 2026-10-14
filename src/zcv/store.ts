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

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    moderationStatus: asString(row.moderation_status) as JobRecord["moderationStatus"],
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
    reconciliationToken: asNullableString(row.reconciliation_token),
    reconciliationLeaseUntil: row.reconciliation_lease_until
      ? asDate(row.reconciliation_lease_until)
      : null,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

export class ZcvStore {
  constructor(private readonly sql: SqlClient) {}

  async transaction<T>(fn: (store: ZcvStore) => Promise<T>): Promise<T> {
    return this.sql.transaction((tx) => fn(new ZcvStore(tx)));
  }

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

  async insertOrderIfAbsent(order: OrderRecord): Promise<OrderRecord> {
    const rows = await this.sql.query(
      `INSERT INTO zcv_orders (
        id, user_id, preview_id, product_id, amount_cents, currency, status,
        paid_at, delivered_at, stripe_checkout_session_id, stripe_payment_intent_id,
        job_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (preview_id, user_id) DO NOTHING
      RETURNING *`,
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
    if (rows[0]) return mapOrder(rows[0]);

    const existing = await this.getOrderByPreviewUser(
      order.previewId,
      order.userId
    );
    if (!existing) throw new Error("Order insert conflicted without an existing order");
    return existing;
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
    const columnByField = {
      status: "status",
      paidAt: "paid_at",
      deliveredAt: "delivered_at",
      stripeCheckoutSessionId: "stripe_checkout_session_id",
      stripePaymentIntentId: "stripe_payment_intent_id",
      jobId: "job_id",
    } as const;
    const entries = Object.entries(patch).filter(
      ([field]) => field in columnByField
    ) as Array<[keyof typeof columnByField, unknown]>;
    if (entries.length === 0) return;
    const assignments = entries.map(
      ([field], index) => `${columnByField[field]}=$${index + 2}`
    );
    await this.sql.query(
      `UPDATE zcv_orders SET ${assignments.join(", ")}, updated_at=NOW() WHERE id=$1`,
      [id, ...entries.map(([, value]) => value)]
    );
  }

  async updateOrderIfUnpaid(
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
  ): Promise<boolean> {
    const columnByField = {
      status: "status",
      paidAt: "paid_at",
      deliveredAt: "delivered_at",
      stripeCheckoutSessionId: "stripe_checkout_session_id",
      stripePaymentIntentId: "stripe_payment_intent_id",
      jobId: "job_id",
    } as const;
    const entries = Object.entries(patch).filter(
      ([field]) => field in columnByField
    ) as Array<[keyof typeof columnByField, unknown]>;
    if (entries.length === 0) return false;
    const assignments = entries.map(
      ([field], index) => `${columnByField[field]}=$${index + 2}`
    );
    const rows = await this.sql.query(
      `UPDATE zcv_orders SET ${assignments.join(", ")}, updated_at=NOW()
       WHERE id=$1 AND paid_at IS NULL
       RETURNING id`,
      [id, ...entries.map(([, value]) => value)]
    );
    return rows.length > 0;
  }

  async markRefundPending(
    job: Pick<JobRecord, "id" | "orderId" | "kieVideoTaskId" | "moderationStatus">,
    errorMessage: string,
    moderationStatus: JobRecord["moderationStatus"] = job.moderationStatus,
    reconciliationToken?: string
  ): Promise<boolean> {
    if (!job.kieVideoTaskId) return false;
    return this.transaction(async (store) => {
      const tokenCondition = reconciliationToken
        ? "AND reconciliation_token=$7"
        : "";
      const params: unknown[] = [
        job.id,
        job.orderId,
        job.kieVideoTaskId,
        moderationStatus,
        errorMessage,
        job.moderationStatus,
      ];
      if (reconciliationToken) params.push(reconciliationToken);
      const jobRows = await store.sql.query(
        `UPDATE zcv_jobs
         SET status='refund_pending', moderation_status=$4,
             error_message=$5, updated_at=NOW()
         WHERE id=$1 AND order_id=$2 AND kie_video_task_id=$3
           AND status='video_submitted' AND moderation_status=$6 ${tokenCondition}
         RETURNING id`,
        params
      );
      if (jobRows.length === 0) return false;
      const orderRows = await store.sql.query(
        `UPDATE zcv_orders SET status='refund_pending', updated_at=NOW()
         WHERE id=$1 AND paid_at IS NOT NULL AND status IN ('paid','refund_pending')
         RETURNING id`,
        [job.orderId]
      );
      if (orderRows.length === 0) {
        throw new Error("Cannot mark refund pending for an unpaid or missing order");
      }
      return true;
    });
  }

  async getModerationResult(
    taskId: string
  ): Promise<{ safe: boolean; reason: string; costCredits: number | null } | null> {
    const rows = await this.sql.query(
      `SELECT status, cost_credits, raw FROM zcv_provider_logs
       WHERE task_id=$1 AND purpose='moderation' AND status IN ('approved','rejected')
       ORDER BY id DESC LIMIT 1`,
      [taskId]
    );
    if (!rows[0]) return null;
    const raw =
      typeof rows[0].raw === "string"
        ? JSON.parse(rows[0].raw)
        : rows[0].raw;
    const reason =
      raw && typeof raw === "object" && "reason" in raw
        ? String((raw as { reason?: unknown }).reason ?? "")
        : "Previously reviewed result";
    return {
      safe: rows[0].status === "approved",
      reason,
      costCredits: asNullableNumber(rows[0].cost_credits),
    };
  }

  async insertJobIfAbsent(job: JobRecord): Promise<JobRecord> {
    const rows = await this.sql.query(
      `INSERT INTO zcv_jobs (
        id, order_id, preview_id, user_id, status, moderation_status, phase, kie_image_task_id,
        kie_video_task_id, image_cost_credits, video_cost_credits, attempt_count,
        max_attempts, video_key, error_message, last_reconciled_at, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (order_id) DO NOTHING
      RETURNING *`,
      [
        job.id,
        job.orderId,
        job.previewId,
        job.userId,
        job.status,
        job.moderationStatus,
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

  async claimJobReconciliation(
    id: string,
    taskId: string,
    now: Date,
    cooldownBefore: Date,
    reconciliationToken: string,
    leaseUntil: Date
  ): Promise<boolean> {
    const rows = await this.sql.query(
      `UPDATE zcv_jobs
       SET status='video_submitted', last_reconciled_at=$3,
           reconciliation_token=$5, reconciliation_lease_until=$6,
           updated_at=NOW()
       WHERE id=$1 AND kie_video_task_id=$2
         AND status IN ('video_submitted','submission_unknown')
         AND (last_reconciled_at IS NULL OR last_reconciled_at <= $4)
         AND (reconciliation_token IS NULL OR reconciliation_lease_until <= $3)
       RETURNING id`,
      [id, taskId, now, cooldownBefore, reconciliationToken, leaseUntil]
    );
    return rows.length > 0;
  }

  async releaseJobReconciliation(
    id: string,
    reconciliationToken: string
  ): Promise<void> {
    await this.sql.query(
      `UPDATE zcv_jobs
       SET reconciliation_token=NULL, reconciliation_lease_until=NULL,
           updated_at=NOW()
       WHERE id=$1 AND reconciliation_token=$2`,
      [id, reconciliationToken]
    );
  }

  async listRecoverableJobs(limit = 4): Promise<JobRecord[]> {
    const rows = await this.sql.query(
      `SELECT * FROM zcv_jobs
       WHERE status IN ('pending', 'submitting', 'submission_unknown', 'video_submitted', 'needs_check')
         AND (status <> 'submitting' OR updated_at < NOW() - INTERVAL '2 minutes')
         AND (reconciliation_token IS NULL OR reconciliation_lease_until <= NOW())
       ORDER BY last_reconciled_at ASC NULLS FIRST, created_at ASC
       LIMIT $1`,
      [limit]
    );
    return rows.map(mapJob);
  }

  async claimJobSubmission(id: string): Promise<boolean> {
    const rows = await this.sql.query(
      `UPDATE zcv_jobs
       SET status='submitting', attempt_count=attempt_count+1, updated_at=NOW()
       WHERE id=$1 AND status='pending' AND kie_video_task_id IS NULL
       RETURNING id`,
      [id]
    );
    return rows.length > 0;
  }

  async recordJobSubmission(
    id: string,
    input: { taskId: string; costCredits: number }
  ): Promise<boolean> {
    const rows = await this.sql.query(
      `UPDATE zcv_jobs
       SET status='video_submitted', kie_video_task_id=$2,
           video_cost_credits=$3, moderation_status='pending',
           error_message=NULL, updated_at=NOW()
       WHERE id=$1 AND status IN ('submitting','submission_unknown')
         AND kie_video_task_id IS NULL
       RETURNING id`,
      [id, input.taskId, input.costCredits]
    );
    return rows.length > 0;
  }

  async markStaleJobSubmissionUnknown(id: string): Promise<boolean> {
    const rows = await this.sql.query(
      `UPDATE zcv_jobs
       SET status='submission_unknown',
           error_message='Submission was interrupted; provider status requires review',
           updated_at=NOW()
       WHERE id=$1 AND status='submitting'
         AND updated_at < NOW() - INTERVAL '2 minutes'
       RETURNING id`,
      [id]
    );
    return rows.length > 0;
  }

  async updateJob(
    id: string,
    patch: Partial<
      Pick<
        JobRecord,
        | "status"
        | "moderationStatus"
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
    const columnByField = {
      status: "status",
      moderationStatus: "moderation_status",
      phase: "phase",
      kieVideoTaskId: "kie_video_task_id",
      videoCostCredits: "video_cost_credits",
      attemptCount: "attempt_count",
      videoKey: "video_key",
      errorMessage: "error_message",
      lastReconciledAt: "last_reconciled_at",
    } as const;
    const entries = Object.entries(patch).filter(
      ([field]) => field in columnByField
    ) as Array<[keyof typeof columnByField, unknown]>;
    if (entries.length === 0) return;
    const assignments = entries.map(
      ([field], index) => `${columnByField[field]}=$${index + 2}`
    );
    await this.sql.query(
      `UPDATE zcv_jobs SET ${assignments.join(", ")}, updated_at=NOW() WHERE id=$1`,
      [id, ...entries.map(([, value]) => value)]
    );
  }

  async updateJobForCurrentTask(
    id: string,
    taskId: string,
    expectedModerationStatus: JobRecord["moderationStatus"],
    patch: Partial<
      Pick<
        JobRecord,
        | "status"
        | "moderationStatus"
        | "phase"
        | "kieVideoTaskId"
        | "videoCostCredits"
        | "attemptCount"
        | "videoKey"
        | "errorMessage"
        | "lastReconciledAt"
      >
    >,
    reconciliationToken?: string
  ): Promise<boolean> {
    const columnByField = {
      status: "status",
      moderationStatus: "moderation_status",
      phase: "phase",
      kieVideoTaskId: "kie_video_task_id",
      videoCostCredits: "video_cost_credits",
      attemptCount: "attempt_count",
      videoKey: "video_key",
      errorMessage: "error_message",
      lastReconciledAt: "last_reconciled_at",
    } as const;
    const entries = Object.entries(patch).filter(
      ([field]) => field in columnByField
    ) as Array<[keyof typeof columnByField, unknown]>;
    if (entries.length === 0) return false;
    const assignments = entries.map(
      ([field], index) => `${columnByField[field]}=$${index + 4}`
    );
    const tokenCondition = reconciliationToken
      ? `AND reconciliation_token=$${entries.length + 4}`
      : "";
    const params: unknown[] = [
      id,
      taskId,
      expectedModerationStatus,
      ...entries.map(([, value]) => value),
    ];
    if (reconciliationToken) params.push(reconciliationToken);
    const rows = await this.sql.query(
      `UPDATE zcv_jobs
       SET ${assignments.join(", ")}, updated_at=NOW()
       WHERE id=$1 AND kie_video_task_id=$2 AND status='video_submitted'
         AND moderation_status=$3 ${tokenCondition}
       RETURNING id`,
      params
    );
    return rows.length > 0;
  }

  async completeDelivery(
    jobId: string,
    orderId: string,
    expectedTaskId: string,
    videoKey: string,
    deliveredAt: Date,
    reconciliationToken?: string
  ): Promise<boolean> {
    return this.transaction(async (store) => {
      const tokenCondition = reconciliationToken
        ? "AND reconciliation_token=$4"
        : "";
      const rows = await store.sql.query(
        `UPDATE zcv_jobs
         SET status='completed', phase='done', video_key=$3,
             error_message=NULL, updated_at=NOW()
         WHERE id=$1 AND kie_video_task_id=$2 AND status='video_submitted'
           AND moderation_status='approved'
           ${tokenCondition}
         RETURNING id`,
        reconciliationToken
          ? [jobId, expectedTaskId, videoKey, reconciliationToken]
          : [jobId, expectedTaskId, videoKey]
      );
      if (rows.length === 0) return false;
      await store.updateOrder(orderId, { deliveredAt });
      return true;
    });
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
      costCredits: asNullableNumber(row.cost_credits),
      orderId: asNullableString(row.order_id) ?? undefined,
      previewId: asNullableString(row.preview_id) ?? undefined,
      jobId: asNullableString(row.job_id) ?? undefined,
      raw: row.raw,
    }));
  }

  async consumeRateLimit(key: string, limit: number, now: Date): Promise<boolean> {
    if (limit <= 0) return false;
    const rows = await this.sql.query(
      `INSERT INTO zcv_rate_limits (key, count, window_start)
       VALUES ($1,1,$3)
       ON CONFLICT (key) DO UPDATE
       SET count=zcv_rate_limits.count+1
       WHERE zcv_rate_limits.count < $2
       RETURNING key`,
      [key, limit, now]
    );
    return rows.length > 0;
  }

  async consumeDailyBudget(input: {
    day: string;
    maxCount: number;
    maxCredits: number;
    costCredits: number;
  }): Promise<boolean> {
    if (
      input.maxCount <= 0 ||
      input.costCredits <= 0 ||
      input.maxCredits < input.costCredits
    ) {
      return false;
    }
    const rows = await this.sql.query(
      `INSERT INTO zcv_daily_budget (day, preview_count, preview_cost_credits)
       VALUES ($1::date,1,$4)
       ON CONFLICT (day) DO UPDATE
       SET preview_count=zcv_daily_budget.preview_count+1,
           preview_cost_credits=zcv_daily_budget.preview_cost_credits+$4
       WHERE zcv_daily_budget.preview_count < $2
         AND zcv_daily_budget.preview_cost_credits+$4 <= $3
       RETURNING day`,
      [input.day, input.maxCount, input.maxCredits, input.costCredits]
    );
    return rows.length > 0;
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

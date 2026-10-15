export type PreviewStatus =
  | "pending"
  | "generating"
  | "ready"
  | "failed";

export type OrderStatus =
  | "created"
  | "checkout_created"
  | "paid"
  | "failed"
  | "cancelled"
  | "refund_pending";

export type JobStatus =
  | "pending"
  | "submitting"
  | "submission_unknown"
  | "video_submitted"
  | "needs_check"
  | "completed"
  | "failed"
  | "refund_pending";

export type ProviderTaskStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface PreviewRecord {
  id: string;
  claimSecretHash: string;
  ownerUserId: string | null;
  sourceImageKey: string;
  intermediateImageKey: string | null;
  previewImageKey: string | null;
  status: PreviewStatus;
  kieImageTaskId: string | null;
  imageCostCredits: number;
  errorMessage: string | null;
  rightsAccepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderRecord {
  id: string;
  userId: string;
  previewId: string;
  productId: string;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  paidAt: Date | null;
  deliveredAt: Date | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  jobId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRecord {
  id: string;
  orderId: string;
  previewId: string;
  userId: string;
  status: JobStatus;
  moderationStatus:
    | "pending"
    | "submitted"
    | "approved"
    | "rejected"
    | "unknown";
  phase: "video" | "done";
  kieImageTaskId: string | null;
  kieVideoTaskId: string | null;
  imageCostCredits: number;
  videoCostCredits: number;
  attemptCount: number;
  maxAttempts: number;
  videoKey: string | null;
  errorMessage: string | null;
  lastReconciledAt: Date | null;
  reconciliationToken: string | null;
  reconciliationLeaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderCallLog {
  taskId?: string;
  provider: string;
  model: string;
  purpose: "preview_image" | "paid_video" | "reconcile" | "moderation";
  status: string;
  costCredits: number | null;
  orderId?: string;
  previewId?: string;
  jobId?: string;
  raw?: unknown;
}

export interface GenerationProvider {
  createImageTask(input: {
    prompt: string;
    imageUrl: string;
    callbackUrl?: string;
  }): Promise<{ taskId: string; costCredits: number; raw?: unknown }>;
  createVideoTask(input: {
    prompt: string;
    imageUrl: string;
    duration: "5";
    sound: false;
    callbackUrl?: string;
  }): Promise<{ taskId: string; costCredits: number; raw?: unknown }>;
  getTask(taskId: string): Promise<{
    status: ProviderTaskStatus;
    resultUrl?: string;
    error?: string;
    costCredits?: number;
    raw?: unknown;
  }>;
  reviewVideo(input: { videoUrl: string }): Promise<{
    safe: boolean;
    reason: string;
    costCredits?: number | null;
    raw?: unknown;
  }>;
}

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export interface StripeGateway {
  constructEvent(payload: string, signature: string, secret: string): unknown;
  createCheckoutSession(input: {
    orderId: string;
    userId: string;
    email?: string;
    amountCents: number;
    currency: string;
    productId: string;
    productName: string;
    productDescription: string;
    credits: number;
    priceId?: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string }>;
}

export class ZcvError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "ZcvError";
  }
}

import { PGlite } from "@electric-sql/pglite";
import Stripe from "stripe";

import { ZCV_PRODUCT } from "../config";
import { ZcvService } from "../service";
import { fromPgLite, ZCV_SCHEMA_SQL } from "../sql";
import { ZcvStore } from "../store";
import type {
  GenerationProvider,
  ObjectStorage,
  ProviderTaskStatus,
  StripeGateway,
} from "../types";

export const TEST_WEBHOOK_SECRET = "whsec_zcv_test_secret";
export const TEST_BOT_SECRET = "bot-test-secret";
export const TEST_MEDIA_SECRET = "media-test-secret";

export class MemoryStorage implements ObjectStorage {
  files = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.files.set(key, body);
  }
  async get(key: string) {
    const value = this.files.get(key);
    if (!value) throw new Error(`missing ${key}`);
    return value;
  }
}

export class MockProvider implements GenerationProvider {
  imageCalls = 0;
  videoCalls = 0;
  queryCalls = 0;
  reviewCalls = 0;
  reviewResults: Array<{
    safe: boolean;
    reason: string;
    costCredits?: number | null;
  }> = [];
  reviewError: Error | null = null;
  tasks = new Map<
    string,
    {
      status: ProviderTaskStatus;
      resultUrl?: string;
      error?: string;
      kind: "image" | "video";
    }
  >();
  autoCompleteImage = true;
  autoCompleteVideo = true;

  async createImageTask() {
    this.imageCalls += 1;
    const taskId = `img_${this.imageCalls}`;
    this.tasks.set(taskId, {
      status: this.autoCompleteImage ? "completed" : "processing",
      resultUrl: this.autoCompleteImage
        ? "https://example.test/zombie.png"
        : undefined,
      kind: "image",
    });
    return { taskId, costCredits: 5, raw: { consumeCredits: 5 } };
  }

  async createVideoTask() {
    this.videoCalls += 1;
    const taskId = `vid_${this.videoCalls}`;
    this.tasks.set(taskId, {
      status: this.autoCompleteVideo ? "completed" : "processing",
      resultUrl: this.autoCompleteVideo
        ? "https://example.test/video.mp4"
        : undefined,
      kind: "video",
    });
    return { taskId, costCredits: 55, raw: { consumeCredits: 55 } };
  }

  async getTask(taskId: string) {
    this.queryCalls += 1;
    const task = this.tasks.get(taskId);
    if (!task) {
      return { status: "failed" as const, error: "unknown task" };
    }
    return {
      status: task.status,
      resultUrl: task.resultUrl,
      error: task.error,
      costCredits: task.kind === "image" ? 5 : 55,
      raw: { consumeCredits: task.kind === "image" ? 5 : 55 },
    };
  }

  async reviewVideo() {
    this.reviewCalls += 1;
    if (this.reviewError) throw this.reviewError;
    return this.reviewResults.shift() ?? { safe: true, reason: "No gore detected" };
  }
}

export function createStripeHelper(): Stripe {
  return new Stripe("sk_test_zcv", { typescript: true });
}

export function createStripeGateway(stripe = createStripeHelper()): StripeGateway {
  return {
    constructEvent(payload, signature, secret) {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    },
    async createCheckoutSession(input) {
      return {
        id: `cs_test_${input.orderId}`,
        url: `https://checkout.stripe.test/${input.orderId}`,
      };
    },
  };
}

export async function createHarness(options: {
  providerTimeoutMs?: number;
  fetchBinary?: (url: string) => Promise<Buffer>;
} = {}) {
  let clock = Date.now();
  const client = new PGlite();
  await client.exec(ZCV_SCHEMA_SQL);
  const store = new ZcvStore(fromPgLite(client));
  const provider = new MockProvider();
  const storage = new MemoryStorage();
  const stripe = createStripeHelper();
  const stripeGateway = createStripeGateway(stripe);
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const service = new ZcvService({
    store,
    provider,
    storage,
    stripe: stripeGateway,
    stripeWebhookSecret: TEST_WEBHOOK_SECRET,
    botSecret: TEST_BOT_SECRET,
    mediaSecret: TEST_MEDIA_SECRET,
    appUrl: "http://localhost:3000",
    now: () => clock,
    fetchBinary: options.fetchBinary || (async () => tinyPng),
    providerTimeoutMs: options.providerTimeoutMs,
  });
  return {
    client,
    store,
    provider,
    storage,
    stripe,
    stripeGateway,
    service,
    tinyPng,
    advanceTime: (milliseconds: number) => {
      clock += milliseconds;
    },
  };
}

export function signedWebhook(
  stripe: Stripe,
  event: Record<string, unknown>
) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_WEBHOOK_SECRET,
  });
  return { payload, signature };
}

export function paidCheckoutEvent(input: {
  eventId: string;
  orderId: string;
  userId: string;
  sessionId?: string;
  amountCents?: number;
  currency?: string;
  productId?: string;
  paymentStatus?: string;
  mode?: string;
}) {
  return {
    id: input.eventId,
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: input.sessionId ?? `cs_test_${input.orderId}`,
        mode: input.mode ?? "payment",
        payment_status: input.paymentStatus ?? "paid",
        amount_total: input.amountCents ?? ZCV_PRODUCT.amountCents,
        currency: input.currency ?? ZCV_PRODUCT.currency,
        payment_intent: `pi_${input.eventId}`,
        metadata: {
          orderId: input.orderId,
          userId: input.userId,
          productId: input.productId ?? ZCV_PRODUCT.id,
        },
      },
    },
  };
}

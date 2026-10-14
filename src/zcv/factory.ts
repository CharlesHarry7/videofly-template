import postgres from "postgres";
import Stripe from "stripe";

import { getProvider } from "@/ai";
import { getStorage } from "@/lib/storage";

import { ZCV_PRODUCT } from "./config";
import { ZcvService } from "./service";
import { fromPostgresJs } from "./sql";
import { ZcvStore } from "./store";
import { assertZcvStripeMode } from "./stripe-mode";
import type { GenerationProvider, ObjectStorage, StripeGateway } from "./types";

let postgresSql: ReturnType<typeof fromPostgresJs> | undefined;

function createPostgresSql() {
  if (postgresSql) return postgresSql;
  const databaseUrl =
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const sslMode = (
    process.env.DATABASE_SSL_MODE ||
    process.env.DATABASE_SSL ||
    ""
  )
    .toLowerCase()
    .trim();
  const isLocalhost =
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
  const sql = postgres(databaseUrl, {
    max: 10,
    ssl:
      sslMode === "disable" || isLocalhost
        ? undefined
        : sslMode === "require"
          ? "require"
          : "require",
  });
  postgresSql = fromPostgresJs(sql);
  return postgresSql;
}

export function createKieGenerationProvider(): GenerationProvider {
  const kie = getProvider("kie");
  return {
    async createImageTask({ prompt, imageUrl, callbackUrl }) {
      const task = await kie.createTask({
        model: "nano-banana-2",
        prompt,
        imageUrls: [imageUrl],
        quality: "1K",
        callbackUrl,
      });
      const cost =
        Number(task.raw?.data?.consumeCredits ?? task.raw?.consumeCredits) || 5;
      return { taskId: task.taskId, costCredits: cost, raw: task.raw };
    },
    async createVideoTask({ prompt, imageUrl, callbackUrl }) {
      const task = await kie.createTask({
        model: "kling-2.6-i2v",
        prompt,
        imageUrls: [imageUrl],
        duration: 5,
        generateAudio: false,
        callbackUrl,
      });
      const cost =
        Number(task.raw?.data?.consumeCredits ?? task.raw?.consumeCredits) ||
        55;
      return { taskId: task.taskId, costCredits: cost, raw: task.raw };
    },
    async getTask(taskId) {
      const task = await kie.getTaskStatus(taskId);
      return {
        status: task.status,
        resultUrl: task.videoUrl,
        error: task.error?.message,
        costCredits: Number(
          task.raw?.consumeCredits ?? task.raw?.data?.consumeCredits ?? 0
        ),
        raw: task.raw,
      };
    },
    async reviewVideo(input) {
      const reviewer = kie as typeof kie & {
        reviewVideo?: typeof kie.reviewVideo;
      };
      if (!reviewer.reviewVideo) {
        throw new Error("The configured KIE provider cannot review videos");
      }
      return reviewer.reviewVideo(input);
    },
  };
}

export function createR2ObjectStorage(): ObjectStorage {
  const storage = getStorage();
  return {
    async put(key, body, contentType) {
      await storage.uploadFile({ key, body, contentType });
    },
    async get(key) {
      return storage.getFile(key);
    },
  };
}

export function createStripeGateway(): StripeGateway {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_API_KEY is not configured");
  }
  assertZcvStripeMode(
    apiKey,
    process.env.ZCV_STRIPE_MODE,
    process.env.ZCV_ALLOW_LIVE_PAYMENTS
  );
  const stripe = new Stripe(apiKey, { typescript: true });
  return {
    constructEvent(payload, signature, secret) {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    },
    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create({
        mode: ZCV_PRODUCT.mode,
        payment_method_types: ["card"],
        customer_email: input.email,
        client_reference_id: input.userId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: {
          orderId: input.orderId,
          userId: input.userId,
          productId: ZCV_PRODUCT.id,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: ZCV_PRODUCT.currency,
              unit_amount: ZCV_PRODUCT.amountCents,
              product_data: {
                name: ZCV_PRODUCT.name,
                description: ZCV_PRODUCT.description,
              },
            },
          },
        ],
      }, {
        idempotencyKey: input.idempotencyKey,
      });
      if (!session.url) {
        throw new Error("Stripe did not return a checkout URL");
      }
      return { id: session.id, url: session.url };
    },
  };
}

export function createZcvServiceFromEnv() {
  let provider: GenerationProvider | undefined;
  let storage: ObjectStorage | undefined;
  return new ZcvService({
    store: new ZcvStore(createPostgresSql()),
    provider: {
      createImageTask: (input) => {
        provider ??= createKieGenerationProvider();
        return provider.createImageTask(input);
      },
      createVideoTask: (input) => {
        provider ??= createKieGenerationProvider();
        return provider.createVideoTask(input);
      },
      getTask: (taskId) => {
        provider ??= createKieGenerationProvider();
        return provider.getTask(taskId);
      },
      reviewVideo: (input) => {
        provider ??= createKieGenerationProvider();
        return provider.reviewVideo(input);
      },
    },
    storage: {
      put: async (key, body, contentType) => {
        storage ??= createR2ObjectStorage();
        return storage.put(key, body, contentType);
      },
      get: async (key) => {
        storage ??= createR2ObjectStorage();
        return storage.get(key);
      },
    },
    stripe: process.env.STRIPE_API_KEY ? createStripeGateway() : undefined,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    stripeMode:
      process.env.ZCV_STRIPE_MODE === "live" ? "live" : "test",
    botSecret:
      process.env.BOT_CHECK_SECRET ||
      process.env.BETTER_AUTH_SECRET ||
      "dev-bot-secret",
    mediaSecret:
      process.env.ZCV_MEDIA_TOKEN_SECRET ||
      process.env.BETTER_AUTH_SECRET ||
      "dev-media-secret",
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
}

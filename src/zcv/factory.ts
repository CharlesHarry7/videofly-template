import postgres from "postgres";
import Stripe from "stripe";
import { getHyperdriveConnectionString, getImagesBinding } from "@/lib/cloudflare-env";

import { getProvider } from "@/ai";
import { getStorage } from "@/lib/storage";

import { ZCV_PRODUCT } from "./config";
import { getCreditPack, readStripePriceId } from "./product";
import { ZcvService } from "./service";
import { fromPostgresJs, type SqlClient } from "./sql";
import { ZcvStore } from "./store";
import { assertZcvCheckoutMode, assertZcvStripeMode } from "./stripe-mode";
import type { GenerationProvider, ObjectStorage, StripeGateway } from "./types";

let postgresSql: ReturnType<typeof fromPostgresJs> | undefined;
type DevMockAdapters = Awaited<
  ReturnType<typeof import("./dev-mock-runtime")["getDevMockAdapters"]>
>;
let devMockAdaptersPromise: Promise<DevMockAdapters> | undefined;

export function isZcvLocalMockMode() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ZCV_LOCAL_MOCK === "true"
  );
}

function getDevMockAdapters() {
  devMockAdaptersPromise ??= import("./dev-mock-runtime").then((runtime) =>
    runtime.getDevMockAdapters()
  );
  return devMockAdaptersPromise;
}

function createDevMockSql(): SqlClient {
  return {
    async query(text, params) {
      return (await getDevMockAdapters()).sql.query(text, params);
    },
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
      return (await getDevMockAdapters()).sql.transaction(fn);
    },
  };
}

function createDevMockStorage(): ObjectStorage {
  return {
    async put(key, body, contentType) {
      return (await getDevMockAdapters()).storage.put(key, body, contentType);
    },
    async get(key) {
      return (await getDevMockAdapters()).storage.get(key);
    },
  };
}

function createPostgresSql() {
  if (postgresSql) return postgresSql;
  const connectionString = getHyperdriveConnectionString();
  
  if (connectionString) {
    // Hyperdrive connection
    const sql = postgres(connectionString, {
      max: 5,
      fetch_types: false
    });
    return fromPostgresJs(sql);
  } else {
    // Regular PostgreSQL connection
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
      assertZcvCheckoutMode(ZCV_PRODUCT.mode);
      const pack = getCreditPack(input.productId);
      if (!pack) {
        throw new Error("Unknown credit pack");
      }
      if (
        input.amountCents !== pack.priceCents ||
        input.currency !== ZCV_PRODUCT.currency ||
        input.credits !== pack.credits
      ) {
        throw new Error("Checkout amount must match the server credit pack");
      }
      const priceId = input.priceId || readStripePriceId(pack.slug);
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
          productId: pack.id,
          credits: String(pack.credits),
        },
        line_items: [
          priceId
            ? { quantity: 1, price: priceId }
            : {
                quantity: 1,
                price_data: {
                  currency: ZCV_PRODUCT.currency,
                  unit_amount: pack.priceCents,
                  product_data: {
                    name: input.productName,
                    description: input.productDescription,
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
  if (isZcvLocalMockMode()) {
    const disabledProvider: GenerationProvider = {
      async createImageTask() {
        throw new Error("Local mock mode blocks all model requests");
      },
      async createVideoTask() {
        throw new Error("Local mock mode blocks all model requests");
      },
      async getTask() {
        throw new Error("Local mock mode blocks all model requests");
      },
      async reviewVideo() {
        throw new Error("Local mock mode blocks all model requests");
      },
    };
    return new ZcvService({
      store: new ZcvStore(createDevMockSql()),
      provider: disabledProvider,
      storage: createDevMockStorage(),
      botSecret:
        process.env.BOT_CHECK_SECRET ||
        process.env.BETTER_AUTH_SECRET ||
        "dev-bot-secret",
      mediaSecret:
        process.env.ZCV_MEDIA_TOKEN_SECRET ||
        process.env.BETTER_AUTH_SECRET ||
        "dev-media-secret",
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      mockPreviewMode: true,
    });
  }

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

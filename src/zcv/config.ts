import { BRAND_NAME, KEYWORD, KEYWORD_H1, SUPPORT_EMAIL } from "@/lib/site";

import {
  ZCV_CREDIT_PACKS,
  ZCV_CREDITS_PER_VIDEO,
  ZCV_CURRENCY,
  ZCV_DEFAULT_PACK,
  ZCV_DURATION_SECONDS,
  ZCV_PRICE_CENTS,
  ZCV_PRODUCT_ID,
} from "./product";

export const ZCV_PRODUCT = {
  id: ZCV_PRODUCT_ID,
  name: `${ZCV_DEFAULT_PACK.name} — ${ZCV_DEFAULT_PACK.credits} credits`,
  description: `${ZCV_DEFAULT_PACK.credits} credits for one ${ZCV_DURATION_SECONDS}-second cartoon zombie couple video. One-time credit pack. No subscription.`,
  amountCents: ZCV_PRICE_CENTS,
  currency: ZCV_CURRENCY,
  durationSeconds: ZCV_DURATION_SECONDS,
  credits: ZCV_DEFAULT_PACK.credits,
  creditsPerVideo: ZCV_CREDITS_PER_VIDEO,
  packs: ZCV_CREDIT_PACKS,
  mode: "payment",
} as const;

export const ZCV_MODELS = {
  image: {
    internalId: "nano-banana-2",
    providerModelId: "nano-banana-2",
    estimatedCredits: 5,
  },
  video: {
    internalId: "kling-2.6-i2v",
    providerModelId: "kling-2.6/image-to-video",
    estimatedCredits: 55,
    duration: "5",
    sound: false,
  },
  moderation: {
    providerModelId: "gemini-4-argon-openai",
  },
} as const;

export const ZCV_LIMITS = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  maxUploadBytes: 8 * 1024 * 1024,
  maxUploadPixels: 25_000_000,
  previewRateLimitPerHour: 1,
  dailyPreviewBudget: Number.parseInt(
    process.env.ZCV_DAILY_PREVIEW_BUDGET || "80",
    10
  ),
  dailyPreviewCreditBudget: Number.parseInt(
    process.env.ZCV_DAILY_PREVIEW_CREDIT_BUDGET || "400",
    10
  ),
  botChallengeTtlMs: 5 * 60 * 1000,
  mediaTokenTtlMs: 10 * 60 * 1000,
  providerFetchTokenTtlMs: 30 * 60 * 1000,
  videoAttempts: 2,
  providerTimeoutMs: 30 * 1000,
  reconcileCooldownMs: 45 * 1000,
};

export const ZCV_PROMPTS = {
  image:
    "Edit this two-person photo into a cute Pixar-style cartoon zombie couple. Mint-green skin, friendly undead look, keep hairstyles, clothes, faces, and composition. No blood, no wounds, no gore, no horror violence.",
  video:
    "Gently animate this cartoon zombie couple portrait. Subtle natural motion, stable faces, no new plot, no hugging request, no gore, no blood.",
};

export const SITE = {
  title: "Zombie Couple Video | ZombieCoupleVideo",
  h1: KEYWORD_H1,
  keyword: KEYWORD,
  name: BRAND_NAME,
  supportEmail: SUPPORT_EMAIL,
};

export const ZCV_PRODUCT = {
  id: "zcv-video-5s",
  name: "AI Zombie Couple Video",
  description: "One 5-second cartoon zombie couple video. One-time purchase. No subscription.",
  amountCents: 699,
  currency: "usd",
  durationSeconds: 5,
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
} as const;

export const ZCV_LIMITS = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  maxUploadBytes: 8 * 1024 * 1024,
  previewRateLimitPerHour: 5,
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
  providerTimeoutMs: 8 * 60 * 1000,
};

export const ZCV_PROMPTS = {
  image:
    "Edit this two-person photo into a cute Pixar-style cartoon zombie couple. Mint-green skin, friendly undead look, keep hairstyles, clothes, faces, and composition. No blood, no wounds, no gore, no horror violence.",
  video:
    "Gently animate this cartoon zombie couple portrait. Subtle natural motion, stable faces, no new plot, no hugging request, no gore, no blood.",
};

export const SITE = {
  title: "AI Zombie Couple Video Generator",
  h1: "Create Your AI Zombie Couple Video",
  keyword: "zombie couple video",
  name: "Zombie Couple Video",
  supportEmail: process.env.ZCV_SUPPORT_EMAIL || "support@example.com",
};

export const ZCV_CREDITS_PER_VIDEO = 10;
export const ZCV_DURATION_SECONDS = 5;
export const ZCV_CURRENCY = "usd";

export type ZcvCreditPackSlug = "single" | "plus" | "bundle";

export interface ZcvCreditPack {
  id: string;
  slug: ZcvCreditPackSlug;
  name: string;
  priceCents: number;
  credits: number;
  videos: number;
  popular?: boolean;
}

export const ZCV_CREDIT_PACKS: readonly ZcvCreditPack[] = [
  {
    id: "zcv-video-5s",
    slug: "single",
    name: "Single",
    priceCents: 999,
    credits: 10,
    videos: 1,
  },
  {
    id: "zcv-plus",
    slug: "plus",
    name: "Plus",
    priceCents: 1699,
    credits: 30,
    videos: 3,
    popular: true,
  },
  {
    id: "zcv-bundle",
    slug: "bundle",
    name: "Bundle",
    priceCents: 2999,
    credits: 60,
    videos: 6,
  },
];

export const ZCV_DEFAULT_PACK = ZCV_CREDIT_PACKS[0];
export const ZCV_PRODUCT_ID = ZCV_DEFAULT_PACK.id;
export const ZCV_PRICE_CENTS = ZCV_DEFAULT_PACK.priceCents;
export const ZCV_PRICE_LABEL = formatUsd(ZCV_PRICE_CENTS);

export function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function getCreditPack(id?: string | null) {
  if (!id) return ZCV_DEFAULT_PACK;
  return (
    ZCV_CREDIT_PACKS.find((pack) => pack.id === id || pack.slug === id) ?? null
  );
}

export function requireCreditPack(id?: string | null) {
  const pack = getCreditPack(id);
  if (!pack) {
    throw new Error("Unknown credit pack");
  }
  return pack;
}

export function stripePriceIdEnvName(slug: ZcvCreditPackSlug) {
  return `STRIPE_PRICE_ID_${slug.toUpperCase()}` as const;
}

export function readStripePriceId(
  slug: ZcvCreditPackSlug,
  env: NodeJS.ProcessEnv = process.env
) {
  const value = env[stripePriceIdEnvName(slug)]?.trim();
  return value ? value : undefined;
}

export function publicCreditCatalog() {
  return {
    id: ZCV_PRODUCT_ID,
    name: `${ZCV_DEFAULT_PACK.name} — ${ZCV_DEFAULT_PACK.credits} credits`,
    amountCents: ZCV_PRICE_CENTS,
    currency: ZCV_CURRENCY,
    durationSeconds: ZCV_DURATION_SECONDS,
    credits: ZCV_DEFAULT_PACK.credits,
    creditsPerVideo: ZCV_CREDITS_PER_VIDEO,
    packs: ZCV_CREDIT_PACKS.map((pack) => ({
      id: pack.id,
      slug: pack.slug,
      name: pack.name,
      priceCents: pack.priceCents,
      priceLabel: formatUsd(pack.priceCents),
      credits: pack.credits,
      videos: pack.videos,
      popular: pack.popular === true,
    })),
    oneTime: true,
    subscription: false,
    copy: "Free preview is an image; the video is generated after payment. Credit packs start at $9.99 for 10 credits.",
  };
}

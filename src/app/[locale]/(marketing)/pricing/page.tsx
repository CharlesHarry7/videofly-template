import type { Metadata } from "next";

import { ZcvFaq, ZcvPricing } from "@/components/zcv/zcv-sections";
import { siteConfig } from "@/config/site";
import { getPublicAppUrl } from "@/lib/site";
import { formatUsd, ZCV_DEFAULT_PACK, ZCV_DURATION_SECONDS } from "@/zcv/product";

export const metadata: Metadata = {
  title: `Zombie Couple Video Pricing | ${formatUsd(ZCV_DEFAULT_PACK.priceCents)} Single`,
  description: `Credit packs start at ${formatUsd(ZCV_DEFAULT_PACK.priceCents)} Single (${ZCV_DEFAULT_PACK.credits} credits) for one ${ZCV_DURATION_SECONDS}-second zombie couple video. No subscription.`,
  keywords: ["zombie couple video", "zombie couple video pricing"],
  alternates: { canonical: `${getPublicAppUrl()}/pricing` },
  openGraph: {
    title: `Zombie Couple Video Pricing | ${formatUsd(ZCV_DEFAULT_PACK.priceCents)} Single`,
    description: siteConfig.description,
    url: `${getPublicAppUrl()}/pricing`,
    siteName: siteConfig.name,
    images: [{ url: siteConfig.ogImage }],
  },
};

export default function PricingPage() {
  return (
    <>
      <ZcvPricing />
      <ZcvFaq />
    </>
  );
}

import type { Metadata } from "next";

import { ZcvFaq, ZcvPricing } from "@/components/zcv/zcv-sections";
import { siteConfig } from "@/config/site";
import { ZCV_DURATION_SECONDS, ZCV_PRICE_LABEL } from "@/zcv/product";

export const metadata: Metadata = {
  title: `Zombie Couple Video Pricing | ${ZCV_PRICE_LABEL} One Time`,
  description:
    `One ${ZCV_PRICE_LABEL} payment for one ${ZCV_DURATION_SECONDS}-second silent cartoon zombie couple video. No subscription.`,
  alternates: { canonical: `${siteConfig.url}/pricing` },
};

export default function PricingPage() {
  return (
    <>
      <ZcvPricing />
      <ZcvFaq />
    </>
  );
}

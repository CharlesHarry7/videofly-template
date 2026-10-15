import { ZcvHero } from "./zcv-hero";
import {
  ZcvFaq,
  ZcvFreeVsPaid,
  ZcvPricing,
  ZcvSteps,
} from "./zcv-sections";

export function ZcvLanding() {
  return (
    <>
      <ZcvHero />
      <ZcvSteps />
      <ZcvFreeVsPaid />
      <ZcvPricing />
      <ZcvFaq />
    </>
  );
}

import { ZcvHero } from "@/components/zcv/zcv-hero";
import {
  ZcvFaq,
  ZcvFreeVsPaid,
  ZcvPricing,
  ZcvSteps,
} from "@/components/zcv/zcv-sections";
import { siteConfig } from "@/config/site";

export async function generateMetadata() {
  return {
    title: "AI Zombie Couple Video Generator",
    description:
      "Create Your AI Zombie Couple Video. Free preview is an image; the video is generated after payment.",
    keywords: ["zombie couple video"],
    openGraph: {
      title: "AI Zombie Couple Video Generator",
      description:
        "Upload a two-person photo and create a cartoon zombie couple video.",
      url: siteConfig.url,
      siteName: siteConfig.name,
    },
  };
}

export default function HomePage() {
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

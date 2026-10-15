import { ZcvLanding } from "@/components/zcv/zcv-landing";
import { siteConfig, siteKeywords } from "@/config/site";
import { getPublicAppUrl } from "@/lib/site";
import { SITE } from "@/zcv/config";

export async function generateMetadata() {
  const url = getPublicAppUrl();
  return {
    title: SITE.title,
    description: siteConfig.description,
    keywords: siteKeywords,
    alternates: { canonical: url },
    openGraph: {
      title: SITE.title,
      description: siteConfig.description,
      url,
      siteName: siteConfig.name,
      images: [{ url: siteConfig.ogImage }],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE.title,
      description: siteConfig.description,
      images: [siteConfig.ogImage],
    },
  };
}

export default function HomePage() {
  return <ZcvLanding />;
}

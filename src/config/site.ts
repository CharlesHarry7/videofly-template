/**
 * Site configuration
 * Central place for website settings, auth providers, and features
 */
import {
  BRAND_NAME,
  getPublicAppUrl,
  KEYWORD,
} from "@/lib/site";

export interface SiteConfig {
  name: string;
  description: string;
  url: string;
  ogImage: string;
  links: {
    github?: string;
    twitter?: string;
    discord?: string;
  };
  auth: {
    enableGoogleLogin: boolean;
    enableMagicLinkLogin: boolean;
    defaultProvider: "google" | "email";
  };
  routes: {
    defaultLoginRedirect: string;
  };
}

export const siteConfig: SiteConfig = {
  name: BRAND_NAME,
  description:
    "Turn a couple photo into a zombie couple video. Free watermarked preview, then buy credits starting at $9.99.",
  url: getPublicAppUrl(),
  ogImage: "/og.png",
  links: {},
  auth: {
    enableGoogleLogin: false,
    enableMagicLinkLogin: true,
    defaultProvider: "email",
  },
  routes: {
    defaultLoginRedirect: "/",
  },
};

export const siteKeywords = [
  KEYWORD,
  "zombie couple video generator",
  "AI zombie couple video",
  "couple photo to zombie video",
  "cartoon zombie couple",
  BRAND_NAME,
];

export function getEnabledAuthProviders() {
  const providers: string[] = [];
  if (siteConfig.auth.enableGoogleLogin) providers.push("google");
  if (siteConfig.auth.enableMagicLinkLogin) providers.push("email");
  return providers;
}

import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { crawlerPolicy } from "@/lib/crawler";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headerStore = await headers();
  const policy = crawlerPolicy(
    headerStore.get("host") || headerStore.get("x-forwarded-host"),
    process.env
  );

  if (!policy.allow) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/orders", "/success", "/login", "/admin"],
      },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "anthropic-ai", allow: "/" },
    ],
    sitemap: policy.sitemap,
  };
}

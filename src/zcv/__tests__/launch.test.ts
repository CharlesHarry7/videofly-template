import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { crawlerPolicy, isNoindexHost } from "@/lib/crawler";
import sitemap, { SITEMAP_EXCLUDED_PATHS } from "@/app/sitemap";
import {
  getCreditPack,
  publicCreditCatalog,
  stripePriceIdEnvName,
  ZCV_CREDIT_PACKS,
  ZCV_DEFAULT_PACK,
} from "@/zcv/product";

describe("ZombieCoupleVideo launch surface", () => {
  it("starts credit packs at $6.99 Single with 10 credits", () => {
    expect(ZCV_DEFAULT_PACK.name).toBe("Single");
    expect(ZCV_DEFAULT_PACK.priceCents).toBe(699);
    expect(ZCV_DEFAULT_PACK.credits).toBe(10);
    expect(publicCreditCatalog().packs[0]?.priceLabel).toBe("$6.99");
    expect(getCreditPack("single")?.id).toBe(ZCV_DEFAULT_PACK.id);
  });

  it("reads optional Stripe price ids from env names only", () => {
    expect(stripePriceIdEnvName("single")).toBe("STRIPE_PRICE_ID_SINGLE");
    expect(stripePriceIdEnvName("plus")).toBe("STRIPE_PRICE_ID_PLUS");
    expect(stripePriceIdEnvName("bundle")).toBe("STRIPE_PRICE_ID_BUNDLE");
    expect(ZCV_CREDIT_PACKS.map((pack) => pack.slug)).toEqual([
      "single",
      "plus",
      "bundle",
    ]);
  });

  it("marks workers.dev and sandbox env as noindex,nofollow with disallow-all robots", () => {
    expect(isNoindexHost("zombiecouplevideo-sandbox.workers.dev")).toBe(true);
    expect(
      crawlerPolicy("zombiecouplevideo-sandbox.workers.dev").robotsTag
    ).toBe("noindex, nofollow");
    expect(crawlerPolicy("zombiecouplevideo-sandbox.workers.dev").allow).toBe(
      false
    );
    expect(crawlerPolicy("zombiecouplevideo.com").noindex).toBe(false);
    expect(
      crawlerPolicy("unused.example", { CLOUDFLARE_ENV: "sandbox" }).allow
    ).toBe(false);
    expect(crawlerPolicy("unused.example", { ZCV_NOINDEX: "true" }).allow).toBe(
      false
    );
  });

  it("keeps pricing and the keyword route in the sitemap and omits template pages", () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://zombiecouplevideo.com";
    try {
      const urls = sitemap().map((entry) => entry.url);
      expect(urls).toContain("https://zombiecouplevideo.com");
      expect(urls).toContain("https://zombiecouplevideo.com/pricing");
      expect(urls).toContain(
        "https://zombiecouplevideo.com/zombie-couple-video"
      );
      expect(urls.some((url) => url.includes("/platform"))).toBe(false);
      expect(SITEMAP_EXCLUDED_PATHS).toContain("platform");
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(process.env, "NEXT_PUBLIC_APP_URL");
      } else {
        process.env.NEXT_PUBLIC_APP_URL = previous;
      }
    }
  });

  it("configures a Cloudflare sandbox workers.dev target without secrets", () => {
    const wrangler = readFileSync(resolve("wrangler.jsonc"), "utf8");
    expect(wrangler).toContain('"name": "zombiecouplevideo-sandbox"');
    expect(wrangler).toContain('"workers_dev": true');
    expect(wrangler).toContain('"CLOUDFLARE_ENV": "sandbox"');
    expect(wrangler).toContain('"ZCV_NOINDEX": "true"');
    expect(wrangler).toContain("zombiecouplevideo.com");
    expect(wrangler).not.toMatch(/sk_live_|sk_test_|whsec_|re_[A-Za-z0-9]/);
  });
});

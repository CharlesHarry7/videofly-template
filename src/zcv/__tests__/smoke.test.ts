import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { KEYWORD_H1 } from "@/lib/site";
import { SITE } from "@/zcv/config";
import {
  formatUsd,
  ZCV_CREDIT_PACKS,
  ZCV_DEFAULT_PACK,
} from "@/zcv/product";
import { createHarness } from "./harness";

const root = resolve(__dirname, "../../..");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function readSrc(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

async function readyPreview(
  harness: Awaited<ReturnType<typeof createHarness>>,
  userId: string
) {
  const bot = harness.service.issueBotChallenge();
  const created = await harness.service.createPreview({
    ip: "203.0.113.90",
    file: { buffer: png, contentType: "image/png", size: png.length },
    rightsAccepted: true,
    bot,
    userId,
  });
  await harness.service.pollPreview(created.previewId, created.claimSecret);
  return created;
}

describe("ZCV smoke: homepage", () => {
  it("homepage uses ZcvLanding with $9.99 SEO title and keyword H1", () => {
    const page = readSrc("src/app/[locale]/(marketing)/page.tsx");
    expect(page).toContain("ZcvLanding");
    expect(page).toContain("SITE.title");
    expect(SITE.title).toContain("$9.99");
    expect(KEYWORD_H1).toBe("Make Your Zombie Couple Video from Two Photos");
  });

  it("hero shows $9.99 CTA and static sample poster with no video element", () => {
    const hero = readSrc("src/components/zcv/zcv-hero.tsx");
    expect(hero).toContain("Get your zombie couple video - $9.99");
    expect(hero).toContain('src="/zcv-sample-poster.svg"');
    expect(hero).toContain("Sample coming soon");
    expect(hero).not.toContain("<video");
    expect(existsSync(resolve(root, "public/zcv-sample-poster.svg"))).toBe(true);
  });

  it("landing composes hero and pricing for the homepage funnel", () => {
    const landing = readSrc("src/components/zcv/zcv-landing.tsx");
    expect(landing).toContain("ZcvHero");
    expect(landing).toContain("ZcvPricing");
  });
});

describe("ZCV smoke: /pricing", () => {
  it("pricing page wires ZcvPricing and $9.99 Single pack", () => {
    const page = readSrc("src/app/[locale]/(marketing)/pricing/page.tsx");
    expect(page).toContain("ZcvPricing");
    expect(page).toContain("formatUsd(ZCV_DEFAULT_PACK.priceCents)");
    expect(ZCV_DEFAULT_PACK.priceCents).toBe(999);
    expect(formatUsd(ZCV_DEFAULT_PACK.priceCents)).toBe("$9.99");
    expect(ZCV_CREDIT_PACKS).toHaveLength(1);
  });

  it("pricing section copy exposes the $9.99 pack", () => {
    const sections = readSrc("src/components/zcv/zcv-sections.tsx");
    expect(sections).toContain("export function ZcvPricing");
    expect(sections).toMatch(/\$9\.99/);
  });
});

describe("ZCV smoke: $9.99 buy reaches mocked checkout", () => {
  it("buy button posts packId to /api/zcv/checkout with no secrets in UI", () => {
    const tool = readSrc("src/components/zcv/zcv-tool.tsx");
    expect(tool).toContain('fetch("/api/zcv/checkout"');
    expect(tool).toContain("Buy for {formatUsd(selectedPack.priceCents)}");
    expect(tool).toContain("packId");
    expect(tool).not.toMatch(/sk_live_|sk_test_|whsec_/);
  });

  it("checkout route delegates to createCheckout after auth", () => {
    const route = readSrc("src/app/api/zcv/checkout/route.ts");
    expect(route).toContain("requireAuth");
    expect(route).toContain("createCheckout");
    expect(route).not.toMatch(/sk_live_|sk_test_|whsec_/);
  });

  it("Buy for $9.99: createCheckout calls mock Stripe and returns checkout url", async () => {
    const harness = await createHarness();
    const preview = await readyPreview(harness, "smoke_user");
    let stripeCalls = 0;
    const original = harness.stripeGateway.createCheckoutSession.bind(
      harness.stripeGateway
    );
    harness.stripeGateway.createCheckoutSession = async (input) => {
      stripeCalls += 1;
      expect(input.amountCents).toBe(999);
      return original(input);
    };

    const checkout = await harness.service.createCheckout({
      userId: "smoke_user",
      previewId: preview.previewId,
      claimSecret: preview.claimSecret,
      packId: "single",
    });

    expect(stripeCalls).toBe(1);
    expect(checkout.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(checkout.credits).toBe(10);
    const order = await harness.store.getOrder(checkout.orderId);
    expect(order?.amountCents).toBe(999);
  });
});

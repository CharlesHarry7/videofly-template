import { Suspense } from "react";
import { Sparkles } from "lucide-react";

import { ZcvTool } from "./zcv-tool";
import { BRAND_NAME, KEYWORD, KEYWORD_H1 } from "@/lib/site";
import { formatUsd, ZCV_DEFAULT_PACK, ZCV_DURATION_SECONDS } from "@/zcv/product";

export function ZcvHero() {
  return (
    <section id="generator" className="relative min-h-[80vh] pb-20">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="flex flex-col items-center gap-10">
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium text-primary">{KEYWORD}</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              {KEYWORD_H1}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {BRAND_NAME} turns a couple photo into a cartoon zombie couple
              video. Upload on this screen, get one free watermarked preview
              image, then buy credits starting at {formatUsd(ZCV_DEFAULT_PACK.priceCents)}{" "}
              Single ({ZCV_DEFAULT_PACK.credits} credits) for one{" "}
              {ZCV_DURATION_SECONDS}-second video. Login is required only at
              checkout.
            </p>
          </div>
          <div className="w-full max-w-3xl">
            <Suspense fallback={<div className="h-64 rounded-3xl border" />}>
              <ZcvTool />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}

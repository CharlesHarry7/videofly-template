import { Suspense } from "react";
import { Sparkles } from "lucide-react";

import { ZcvTool } from "./zcv-tool";
import { BRAND_NAME, KEYWORD_H1 } from "@/lib/site";
import { formatUsd, ZCV_DEFAULT_PACK } from "@/zcv/product";

export function ZcvHero() {
  return (
    <section id="generator" className="relative min-h-[80vh] pb-20">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="flex flex-col items-center gap-10">
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium text-primary">{BRAND_NAME}</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              {KEYWORD_H1}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Make a zombie couple video from two photos. Free watermarked preview, then $9.99 for your AI zombie love story video. Login is required only at checkout.
            </p>
            <div className="mt-6">
              <div className="relative w-full max-w-3xl aspect-video rounded-3xl border border-muted-foreground/20 overflow-hidden">
                <img
                  src="/zcv-sample-poster.svg"
                  alt="Zombie couple video sample coming soon"
                  width={1280}
                  height={720}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 text-sm text-muted-foreground">
                  Sample coming soon
                </div>
              </div>
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <a
                href="#upload"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Get your zombie couple video - $9.99
              </a>
              <a
                href="#preview"
                className="text-sm text-primary hover:underline"
              >
                Get free preview
              </a>
            </div>
          </div>
          <div id="upload" className="w-full max-w-3xl">
            <Suspense fallback={<div className="h-64 rounded-3xl border" />}>
              <ZcvTool />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}

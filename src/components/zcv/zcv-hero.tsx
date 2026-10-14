import { Suspense } from "react";
import { Sparkles } from "lucide-react";

import { ZcvTool } from "./zcv-tool";
import { ZCV_DURATION_SECONDS, ZCV_PRICE_LABEL } from "@/zcv/product";

export function ZcvHero() {
  return (
    <section id="generator" className="relative min-h-[80vh] pb-20">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="flex flex-col items-center gap-10">
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                zombie couple video
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              Create Your AI Zombie Couple Video
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Upload a two-person photo you have rights to. Get a free low-res
              watermarked cartoon zombie preview image, then pay {ZCV_PRICE_LABEL} once for
              one {ZCV_DURATION_SECONDS}-second video. Free preview is an image; the video is
              generated after payment.
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

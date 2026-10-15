import { BRAND_NAME, KEYWORD, SUPPORT_EMAIL } from "@/lib/site";
import {
  formatUsd,
  ZCV_CREDIT_PACKS,
  ZCV_CREDITS_PER_VIDEO,
  ZCV_DURATION_SECONDS,
} from "@/zcv/product";

const steps = [
  {
    title: "Upload a couple photo",
    body: "Drop in a two-person photo you have rights to. The zombie couple video tool runs on the first screen — no account required to start.",
  },
  {
    title: "Get one free preview image",
    body: "We create a watermarked cartoon zombie couple still. This is an image, not a video, and it is limited to one free try per hour so the generation API is not left open.",
  },
  {
    title: "Buy credits, then get the video",
    body: `Sign in only at checkout, then pay via Stripe. Single is ${formatUsd(ZCV_CREDIT_PACKS[0].priceCents)} for ${ZCV_CREDIT_PACKS[0].credits} credits — enough for one ${ZCV_DURATION_SECONDS}-second zombie couple video.`,
  },
];

export function ZcvSteps() {
  return (
    <section id="steps" className="py-24 bg-background">
      <div className="container mx-auto px-4 max-w-5xl">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
          How a zombie couple video is made
        </h2>
        <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-12">
          {BRAND_NAME} is built for one job: turn a couple photo into a zombie
          couple video without a subscription.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-border p-6">
              <p className="text-sm text-primary mb-2">Step {index + 1}</p>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ZcvFreeVsPaid() {
  return (
    <section id="compare" className="py-24">
      <div className="container mx-auto px-4 max-w-5xl">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Free preview vs paid zombie couple video
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border p-6">
            <h3 className="text-xl font-semibold mb-3">Free</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>One watermarked cartoon zombie couple image</li>
              <li>No sign-up to upload or preview</li>
              <li>Rate-limited so free tries cannot burn unlimited API calls</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
            <h3 className="text-xl font-semibold mb-3">Paid</h3>
            <p className="text-2xl font-bold mb-3">
              From {formatUsd(ZCV_CREDIT_PACKS[0].priceCents)}
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                {ZCV_CREDITS_PER_VIDEO} credits = one {ZCV_DURATION_SECONDS}-second
                silent zombie couple video
              </li>
              <li>Credit packs, no subscription</li>
              <li>Private download for the buyer only</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ZcvPricing() {
  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="container mx-auto px-4 max-w-5xl">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
          Zombie couple video credit packs
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
          Prices are public and crawlable. Starting pack: Single at{" "}
          {formatUsd(ZCV_CREDIT_PACKS[0].priceCents)} for {ZCV_CREDIT_PACKS[0].credits}{" "}
          credits. Stripe Checkout runs only after login.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {ZCV_CREDIT_PACKS.map((pack) => (
            <div
              key={pack.id}
              className={`rounded-2xl border p-6 flex flex-col ${
                pack.popular
                  ? "border-primary/40 bg-primary/5"
                  : "border-border"
              }`}
            >
              {pack.popular ? (
                <p className="text-xs font-medium text-primary mb-2">Popular</p>
              ) : null}
              <h3 className="text-xl font-semibold">{pack.name}</h3>
              <p className="text-4xl font-bold mt-3">{formatUsd(pack.priceCents)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {pack.credits} credits · {pack.videos} zombie couple video
                {pack.videos === 1 ? "" : "s"}
              </p>
              <a
                href="/#generator"
                className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Start with this pack
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: "What is a zombie couple video?",
    a: "A zombie couple video is a short cartoon clip made from a two-person photo. ZombieCoupleVideo edits the photo into a cute undead couple, then animates it after you buy credits.",
  },
  {
    q: "Is the free result a video?",
    a: "No. The free preview is a watermarked image. The zombie couple video is generated after payment.",
  },
  {
    q: `What do I get for ${formatUsd(ZCV_CREDIT_PACKS[0].priceCents)}?`,
    a: `Single is ${formatUsd(ZCV_CREDIT_PACKS[0].priceCents)} for ${ZCV_CREDIT_PACKS[0].credits} credits — enough for one ${ZCV_DURATION_SECONDS}-second silent zombie couple video. It is a one-time credit pack, not a subscription.`,
  },
  {
    q: "Do I need an account to try it?",
    a: "No. You can upload a couple photo and run the free preview as a guest. Login is required only when you check out with Stripe.",
  },
  {
    q: "Will it look exactly like us or include a plot?",
    a: "No. This is a cute cartoon zombie version of your photo. We do not promise hugging, a plot, or 100% likeness.",
  },
  {
    q: "How do refunds work?",
    a: "If a paid zombie couple video cannot be delivered after retries, the order is marked for refund. See the refund page.",
  },
  {
    q: "How do I contact support?",
    a: `Email ${SUPPORT_EMAIL} with questions about your zombie couple video, privacy, or a refund.`,
  },
];

export function ZcvFaq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <section id="faq" className="py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="container mx-auto px-4 max-w-3xl">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
          Zombie couple video FAQ
        </h2>
        <p className="text-center text-muted-foreground mb-12">
          Straight answers about the {KEYWORD} workflow on {BRAND_NAME}.
        </p>
        <div className="space-y-4">
          {faqs.map((item) => (
            <details key={item.q} className="rounded-2xl border border-border p-5">
              <summary className="font-medium cursor-pointer">{item.q}</summary>
              <p className="mt-3 text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

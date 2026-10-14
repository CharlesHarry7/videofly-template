const steps = [
  {
    title: "Upload a two-person photo",
    body: "Use a photo you have rights to. Confirm the rights checkbox before the free preview starts.",
  },
  {
    title: "Get a free preview image",
    body: "We edit the photo into a cute cartoon zombie couple. The free result is a low-res watermarked image, not a video.",
  },
  {
    title: "Pay once, then get the video",
    body: "Login with email, pay $6.99 one time, and we animate the unwatermarked preview image into one 5-second silent video.",
  },
];

export function ZcvSteps() {
  return (
    <section id="steps" className="py-24 bg-background">
      <div className="container mx-auto px-4 max-w-5xl">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          How it works
        </h2>
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
          Free preview vs paid video
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border p-6">
            <h3 className="text-xl font-semibold mb-3">Free</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>Low-res watermarked cartoon zombie image</li>
              <li>No Kling video generation</li>
              <li>No hugging, plot, or likeness promise</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
            <h3 className="text-xl font-semibold mb-3">Paid</h3>
            <p className="text-2xl font-bold mb-3">$6.99 one-time</p>
            <ul className="space-y-2 text-muted-foreground">
              <li>One 5-second silent video</li>
              <li>No subscription</li>
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
      <div className="container mx-auto px-4 max-w-xl text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Public price</h2>
        <p className="text-5xl font-bold mb-3">$6.99</p>
        <p className="text-muted-foreground">
          One 5s video, one-time, no subscription. Free preview is an image; the
          video is generated after payment.
        </p>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: "Is the free result a video?",
    a: "No. Free preview is an image; the video is generated after payment.",
  },
  {
    q: "What do I get for $6.99?",
    a: "One 5-second silent cartoon zombie couple video. It is a one-time purchase, not a subscription.",
  },
  {
    q: "Will it look exactly like us or include a plot?",
    a: "No. This is a cute cartoon zombie version of your photo. We do not promise hugging, a plot, or 100% likeness.",
  },
  {
    q: "When do I need to log in?",
    a: "You can upload and preview as a guest. Login is required only when you click buy.",
  },
  {
    q: "How do refunds work?",
    a: "If a paid video cannot be delivered after retries, the order is marked for refund. See the refund page.",
  },
];

export function ZcvFaq() {
  return (
    <section id="faq" className="py-24">
      <div className="container mx-auto px-4 max-w-3xl">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">FAQ</h2>
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

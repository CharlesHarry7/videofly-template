export const metadata = {
  title: "Terms of Service - Zombie Couple Video",
};

import { ZCV_DURATION_SECONDS, ZCV_PRICE_LABEL } from "@/zcv/product";

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl py-16 prose dark:prose-invert">
      <h1>Terms of Service</h1>
      <p>
        You must have rights to any photo you upload. The free result is a
        watermarked cartoon image. The paid product is one {ZCV_DURATION_SECONDS}-second video for
        {ZCV_PRICE_LABEL}, one-time, with no subscription.
      </p>
      <p>
        We do not promise hugging, a story, or 100% likeness. Output is a cute
        cartoon zombie version of your photo.
      </p>
    </div>
  );
}

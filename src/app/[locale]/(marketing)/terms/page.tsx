import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/site";
import {
  formatUsd,
  ZCV_DEFAULT_PACK,
  ZCV_DURATION_SECONDS,
} from "@/zcv/product";

export const metadata = {
  title: `Terms of Service - ${BRAND_NAME}`,
};

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl py-16 prose dark:prose-invert">
      <h1>Terms of Service</h1>
      <p>
        You must have rights to any photo you upload. The free result is a
        watermarked cartoon image, limited to one try per hour. The paid product
        is a credit pack starting at {formatUsd(ZCV_DEFAULT_PACK.priceCents)}{" "}
        Single ({ZCV_DEFAULT_PACK.credits} credits) for one {ZCV_DURATION_SECONDS}-second
        zombie couple video, with no subscription.
      </p>
      <p>
        We do not promise hugging, a story, or 100% likeness. Output is a cute
        cartoon zombie version of your photo.
      </p>
      <p>
        Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </div>
  );
}

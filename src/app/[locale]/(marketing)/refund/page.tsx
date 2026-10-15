import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/site";
import {
  formatUsd,
  ZCV_DEFAULT_PACK,
  ZCV_DURATION_SECONDS,
} from "@/zcv/product";

export const metadata = {
  title: `Refund Policy - ${BRAND_NAME}`,
};

export default function RefundPage() {
  return (
    <div className="container mx-auto max-w-3xl py-16 prose dark:prose-invert">
      <h1>Refund Policy</h1>
      <p>
        Credit packs start at {formatUsd(ZCV_DEFAULT_PACK.priceCents)} Single (
        {ZCV_DEFAULT_PACK.credits} credits) for one {ZCV_DURATION_SECONDS}-second
        zombie couple video. There is no subscription.
      </p>
      <p>
        If payment succeeds but the video cannot be delivered after retries, the
        order is marked for refund and we will refund the one-time charge.
      </p>
      <p>
        The free preview is an image only. It is not a paid product and is not
        refundable.
      </p>
      <p>
        Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </div>
  );
}

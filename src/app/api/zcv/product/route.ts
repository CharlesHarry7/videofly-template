import { apiSuccess } from "@/lib/api/response";
import { ZCV_PRODUCT } from "@/zcv";

export async function GET() {
  return apiSuccess({
    id: ZCV_PRODUCT.id,
    name: ZCV_PRODUCT.name,
    amountCents: ZCV_PRODUCT.amountCents,
    currency: ZCV_PRODUCT.currency,
    durationSeconds: ZCV_PRODUCT.durationSeconds,
    oneTime: true,
    subscription: false,
    copy: "Free preview is an image; the video is generated after payment.",
  });
}

import { cookies } from "next/headers";

import { requireAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/error";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    const body = (await request.json().catch(() => ({}))) as {
      previewId?: string;
      claimSecret?: string;
      packId?: string;
      amountCents?: number;
    };
    const cookieStore = await cookies();
    const previewId =
      body.previewId || cookieStore.get("zcv_preview_id")?.value;
    if (previewId && !/^[a-f0-9]{32}$/.test(previewId)) {
      throw new ApiError("Preview is missing", 400);
    }
    const claimSecret =
      body.claimSecret ||
      (previewId ? cookieStore.get(`zcv_claim_${previewId}`)?.value : undefined) ||
      cookieStore.get("zcv_claim")?.value;
    if (!previewId || !claimSecret) {
      throw new ApiError("Preview is missing", 400);
    }
    const service = createZcvServiceFromEnv();
    const result = await service.createCheckout({
      userId: user.id,
      email: user.email,
      previewId,
      claimSecret,
      packId: typeof body.packId === "string" ? body.packId : undefined,
      amountCents:
        typeof body.amountCents === "number" ? body.amountCents : undefined,
    });
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

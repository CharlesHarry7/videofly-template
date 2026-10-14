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
    };
    const cookieStore = await cookies();
    const previewId =
      body.previewId || cookieStore.get("zcv_preview_id")?.value;
    const claimSecret =
      body.claimSecret || cookieStore.get("zcv_claim")?.value;
    if (!previewId || !claimSecret) {
      throw new ApiError("Preview is missing", 400);
    }
    const service = createZcvServiceFromEnv();
    const result = await service.createCheckout({
      userId: user.id,
      email: user.email,
      previewId,
      claimSecret,
    });
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

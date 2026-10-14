import { cookies } from "next/headers";

import { ApiError } from "@/lib/api/error";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const cookieStore = await cookies();
    const claimSecret =
      url.searchParams.get("claim") ||
      request.headers.get("x-zcv-claim") ||
      cookieStore.get("zcv_claim")?.value;
    if (!claimSecret) {
      throw new ApiError("Preview not found", 404);
    }
    const service = createZcvServiceFromEnv();
    const preview = await service.pollPreview(id, claimSecret);
    return apiSuccess(preview);
  } catch (error) {
    return handleApiError(error);
  }
}

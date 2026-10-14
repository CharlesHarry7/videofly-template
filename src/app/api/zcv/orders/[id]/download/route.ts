import { requireAuth } from "@/lib/api/auth";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;
    const service = createZcvServiceFromEnv();
    return apiSuccess(await service.createDownloadLink(id, user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

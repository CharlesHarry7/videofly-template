import { requireAuth } from "@/lib/api/auth";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;
    const service = createZcvServiceFromEnv();
    return apiSuccess(await service.getOrderForUser(id, user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

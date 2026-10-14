import { requireAuth } from "@/lib/api/auth";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    const service = createZcvServiceFromEnv();
    return apiSuccess(await service.listOrdersForUser(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

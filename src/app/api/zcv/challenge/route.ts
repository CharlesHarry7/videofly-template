import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

export async function GET() {
  try {
    const service = createZcvServiceFromEnv();
    return apiSuccess(service.issueBotChallenge());
  } catch (error) {
    return handleApiError(error);
  }
}

import { ApiError } from "@/lib/api/error";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

async function handler(request: Request) {
  try {
    const expected = process.env.CRON_SECRET;
    const provided =
      request.headers.get("authorization")?.replace("Bearer ", "") ||
      request.headers.get("x-cron-secret");
    if (!expected || provided !== expected) {
      throw new ApiError("Unauthorized", 401);
    }
    const service = createZcvServiceFromEnv();
    const jobs = await service.reconcileOpenJobs();
    return apiSuccess({ recovered: jobs.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export { handler as GET, handler as POST };

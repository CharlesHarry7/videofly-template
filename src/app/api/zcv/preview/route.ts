import { cookies } from "next/headers";

import { getAuthUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/error";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("Missing file", 400);
    }
    const service = createZcvServiceFromEnv();
    const user = await getAuthUser(request);
    const result = await service.createPreview({
      ip: clientIp(request),
      file: {
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
        size: file.size,
      },
      rightsAccepted: form.get("rightsAccepted") === "true",
      bot: {
        token: String(form.get("botToken") || ""),
        timestamp: Number(form.get("botTimestamp") || 0),
        nonce: String(form.get("botNonce") || ""),
      },
      userId: user?.id,
    });

    const cookieStore = await cookies();
    cookieStore.set("zcv_preview_id", result.previewId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    cookieStore.set("zcv_claim", result.claimSecret, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

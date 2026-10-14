import { getAuthUser } from "@/lib/api/auth";
import { handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const user = await getAuthUser(request);
    const service = createZcvServiceFromEnv();
    const media = await service.readMedia(token, user?.id);
    return new Response(new Uint8Array(media.body), {
      headers: {
        "Content-Type": media.contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

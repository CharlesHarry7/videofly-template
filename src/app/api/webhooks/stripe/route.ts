import { NextResponse, type NextRequest } from "next/server";

import { handleApiError } from "@/lib/api/response";
import { createZcvServiceFromEnv } from "@/zcv";

export const maxDuration = 60;

const handler = async (req: NextRequest) => {
  try {
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature");
    const service = createZcvServiceFromEnv();
    const result = await service.handleStripeWebhook(payload, signature);
    return NextResponse.json({ received: true, ...result }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
};

export { handler as POST };

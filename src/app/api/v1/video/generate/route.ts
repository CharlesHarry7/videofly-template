import { apiError } from "@/lib/api/response";

export async function POST() {
  return apiError("The legacy video generation product is disabled", 404);
}

import { apiSuccess } from "@/lib/api/response";
import { publicCreditCatalog } from "@/zcv/product";

export async function GET() {
  return apiSuccess(publicCreditCatalog());
}

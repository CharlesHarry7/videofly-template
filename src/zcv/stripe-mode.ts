export type ZcvStripeMode = "test" | "live";

export function assertZcvStripeMode(
  apiKey: string,
  mode: string | undefined,
  allowLivePayments: string | undefined
): ZcvStripeMode {
  const selectedMode = mode || "test";
  if (selectedMode !== "test" && selectedMode !== "live") {
    throw new Error("ZCV_STRIPE_MODE must be either test or live");
  }
  if (selectedMode === "test" && !apiKey.startsWith("sk_test_")) {
    throw new Error("Test mode requires a Stripe test secret key");
  }
  if (selectedMode === "live") {
    if (allowLivePayments !== "true") {
      throw new Error("Live payments are not explicitly enabled");
    }
    if (!apiKey.startsWith("sk_live_")) {
      throw new Error("Live mode requires a Stripe live secret key");
    }
  }
  return selectedMode;
}

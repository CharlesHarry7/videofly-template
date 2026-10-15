export type BillingProvider = "creem" | "stripe";

const providerEnv = process.env.NEXT_PUBLIC_BILLING_PROVIDER;

export const billingProvider: BillingProvider =
  providerEnv === "creem" ? "creem" : "stripe";

export const isCreemProvider = billingProvider === "creem";
export const isStripeProvider = billingProvider === "stripe";

"use server";

import { z } from "zod";

import { userActionClient } from "@/lib/safe-action";
import { getMySubscription, getUserPlans } from "@/services/billing";
import { assertZcvCheckoutMode } from "@/zcv/stripe-mode";

export const createStripeSessionAction = userActionClient
  .schema(z.object({ planId: z.string().min(1) }))
  .action(async () => {
    assertZcvCheckoutMode("subscription");
    return { success: false as const, url: null };
  });

export const getUserPlansAction = userActionClient
  .schema(z.object({}))
  .action(async ({ ctx }) => {
    const plan = await getUserPlans(ctx.user.id);
    return { success: true, plan };
  });

export const getMySubscriptionAction = userActionClient
  .schema(z.object({}))
  .action(async ({ ctx }) => {
    const subscription = await getMySubscription(ctx.user.id);
    return { success: true, subscription };
  });

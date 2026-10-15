"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessInner() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const [status, setStatus] = useState("Looking up your order...");

  useEffect(() => {
    if (!orderId) {
      setStatus("Payment submitted. This page does not unlock the video.");
      return;
    }
    const load = async () => {
      const response = await fetch(`/api/zcv/orders/${orderId}`);
      const json = await response.json();
      if (!response.ok) {
        setStatus(
          "We received your checkout return, but this page never grants access. Open your orders after login."
        );
        return;
      }
      const paid = Boolean(json.data.order.paidAt);
      const delivered = Boolean(json.data.order.deliveredAt);
      if (delivered) {
        setStatus("Your video is ready. Open the order page to download.");
      } else if (paid) {
        setStatus("Payment recorded. The video is still generating.");
      } else {
        setStatus(
          "Waiting for the payment webhook. This success page does not grant the video."
        );
      }
    };
    void load();
  }, [orderId]);

  return (
    <div className="container mx-auto max-w-2xl py-20 px-4 space-y-4">
      <h1 className="text-3xl font-bold">Checkout complete</h1>
      <p className="text-muted-foreground">{status}</p>
      {orderId ? (
        <Link className="text-primary underline" href={`/orders/${orderId}`}>
          Review order
        </Link>
      ) : (
        <Link className="text-primary underline" href="/orders">
          Review orders
        </Link>
      )}
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="container py-20">Loading...</div>}>
      <SuccessInner />
    </Suspense>
  );
}

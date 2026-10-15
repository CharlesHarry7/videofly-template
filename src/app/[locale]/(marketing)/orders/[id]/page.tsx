"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type OrderPayload = {
  order: {
    id: string;
    status: string;
    amountCents: number;
    currency: string;
    paidAt: string | null;
    deliveredAt: string | null;
  };
  job: { id: string; status: string; errorMessage: string | null } | null;
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<OrderPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const response = await fetch(`/api/zcv/orders/${params.id}`);
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error?.message || "Order not found");
        return;
      }
      setData(json.data);
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [params.id]);

  const download = async () => {
    const response = await fetch(`/api/zcv/orders/${params.id}/download`, {
      method: "POST",
    });
    const json = await response.json();
    if (!response.ok) {
      toast.error(json?.error?.message || "Download is not ready");
      return;
    }
    window.location.href = json.data.url;
  };

  if (error) {
    return (
      <div className="container mx-auto max-w-2xl py-16 px-4">
        <h1 className="text-3xl font-bold mb-4">Order</h1>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-16 px-4 space-y-4">
      <h1 className="text-3xl font-bold">Order {params.id}</h1>
      <p className="text-muted-foreground">
        Delivery target: within 24 hours after payment. If generation fails after retries, you receive a full refund.
      </p>
      <p className="text-muted-foreground">
        This page only shows status. Payment is granted by the verified webhook,
        not by opening this page.
      </p>
      {data ? (
        <div className="rounded-2xl border border-border p-6 space-y-2">
          <p>Status: {data.order.status}</p>
          <p>
            Paid: {data.order.paidAt ? "yes" : "no"} · Delivered:{" "}
            {data.order.deliveredAt ? "yes" : "no"}
          </p>
          <p>Job: {data.job?.status || "not created"}</p>
          {data.job?.errorMessage ? (
            <p className="text-sm text-muted-foreground">{data.job.errorMessage}</p>
          ) : null}
          <Button type="button" onClick={download} disabled={!data.order.deliveredAt}>
            Download video
          </Button>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}

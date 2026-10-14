"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function OrdersPage() {
  const [orders, setOrders] = useState<
    Array<{
      id: string;
      status: string;
      amountCents: number;
      currency: string;
      paidAt: string | null;
      deliveredAt: string | null;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/zcv/orders")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json?.error?.message || "Unable to load orders");
        }
        setOrders(json.data);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="container mx-auto max-w-3xl py-16 px-4">
      <h1 className="text-3xl font-bold mb-6">Your orders</h1>
      {error ? <p className="text-muted-foreground">{error}</p> : null}
      <div className="space-y-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="block rounded-2xl border border-border p-4 hover:border-primary/40"
          >
            <p className="font-medium">{order.id}</p>
            <p className="text-sm text-muted-foreground">
              {(order.amountCents / 100).toFixed(2)} {order.currency.toUpperCase()} ·{" "}
              {order.status}
              {order.deliveredAt ? " · delivered" : order.paidAt ? " · paid" : ""}
            </p>
          </Link>
        ))}
        {!error && orders.length === 0 ? (
          <p className="text-muted-foreground">No orders yet.</p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { useSigninModal } from "@/hooks/use-signin-modal";
import {
  formatUsd,
  ZCV_CREDIT_PACKS,
  ZCV_DEFAULT_PACK,
} from "@/zcv/product";

type PreviewState = {
  previewId: string;
  status: string;
  isMock?: boolean;
  previewImageUrl?: string | null;
};

const STORAGE_KEY = "zcv_preview";

export function ZcvTool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signInModal = useSigninModal();
  const { data: session } = authClient.useSession();
  const [file, setFile] = useState<File | null>(null);
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const [packId, setPackId] = useState(
    () => searchParams.get("packId") || ZCV_DEFAULT_PACK.id
  );
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const checkoutStartedFor = useRef<string | null>(null);
  const selectedPack =
    ZCV_CREDIT_PACKS.find((pack) => pack.id === packId) ?? ZCV_DEFAULT_PACK;

  useEffect(() => {
    let saved: PreviewState | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        saved = JSON.parse(raw) as PreviewState;
        if (saved?.previewId) setPreview(saved);
      }
    } catch {
      // ignore
    }
    const packFromQuery = searchParams.get("packId");
    if (packFromQuery) setPackId(packFromQuery);
    const previewId = searchParams.get("previewId") || saved?.previewId;
    if (!previewId) return;
    void fetch(`/api/zcv/preview/${encodeURIComponent(previewId)}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((json) => {
        if (!json?.data) return;
        const next: PreviewState = {
          previewId,
          status: json.data.status,
          isMock: json.data.isMock === true,
          previewImageUrl: json.data.previewImageUrl,
        };
        setPreview(next);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      })
      .catch(() => undefined);
  }, [searchParams]);

  useEffect(() => {
    if (!preview?.previewId) return;
    if (preview.status === "ready" || preview.status === "failed") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/zcv/preview/${preview.previewId}`
        );
        if (!response.ok) return;
        const json = await response.json();
        const next = {
          ...preview,
          status: json.data.status,
          isMock: json.data.isMock === true,
          previewImageUrl: json.data.previewImageUrl,
        };
        setPreview(next);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the last state and retry transient network errors.
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [preview]);

  useEffect(() => {
    if (
      searchParams.get("buy") === "1" &&
      session?.user &&
      preview?.status === "ready" &&
      checkoutStartedFor.current !== preview.previewId
    ) {
      checkoutStartedFor.current = preview.previewId;
      void startCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, session?.user, preview?.previewId, packId]);

  const startPreview = async () => {
    if (!file) {
      toast.error("Upload a two-person photo first.");
      return;
    }
    setBusy(true);
    try {
      const challenge = await fetch("/api/zcv/challenge").then((res) => res.json());
      const form = new FormData();
      form.set("file", file);
      form.set("rightsAccepted", rightsAccepted ? "true" : "false");
      form.set("botToken", challenge.data.token);
      form.set("botTimestamp", String(challenge.data.timestamp));
      form.set("botNonce", challenge.data.nonce);
      const response = await fetch("/api/zcv/preview", {
        method: "POST",
        body: form,
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message || "Preview failed");
      }
      const next = {
        previewId: json.data.previewId,
        status: json.data.status,
        isMock: json.data.isMock === true,
        previewImageUrl: json.data.previewImageUrl,
      };
      setPreview(next);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      toast.success("Free preview started. This is an image, not a video.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const startCheckout = async () => {
    if (!preview) return;
    if (!session?.user) {
      signInModal.onOpen();
      router.replace(
        `/?buy=1&previewId=${encodeURIComponent(preview.previewId)}&packId=${encodeURIComponent(packId)}`
      );
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/zcv/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewId: preview.previewId,
          packId,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message || "Checkout failed");
      }
      window.location.href = json.data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
      setBusy(false);
    }
  };

  return (
    <div className="w-full rounded-3xl border border-border bg-card/80 p-6 md:p-8 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="photo">Two-person photo</Label>
        <Input
          id="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <p className="text-sm text-muted-foreground">
          JPEG, PNG, or WebP. 8MB max. You must have rights to this photo.
        </p>
      </div>

      <div className="flex items-start gap-3 text-sm">
        <Checkbox
          id="rights"
          checked={rightsAccepted}
          onCheckedChange={(value) => setRightsAccepted(value === true)}
        />
        <Label htmlFor="rights">
          I have the rights to this photo and permission from everyone in it.
        </Label>
      </div>

      <div className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
        Free preview is an image; the zombie couple video is generated after
        payment. One free watermarked try per hour. Credit packs start at{" "}
        {formatUsd(ZCV_DEFAULT_PACK.priceCents)} Single ({ZCV_DEFAULT_PACK.credits}{" "}
        credits). Login is required only at Stripe Checkout.
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Credit pack</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ZCV_CREDIT_PACKS.map((pack) => (
            <label
              key={pack.id}
              className={`cursor-pointer rounded-xl border p-3 text-sm ${
                packId === pack.id
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <input
                type="radio"
                name="credit-pack"
                className="sr-only"
                checked={packId === pack.id}
                onChange={() => setPackId(pack.id)}
              />
              <span className="font-semibold">{pack.name}</span>
              <span className="block text-muted-foreground">
                {formatUsd(pack.priceCents)} · {pack.credits} credits
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button type="button" onClick={startPreview} disabled={busy}>
          {busy ? "Working..." : "Create free preview image"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={startCheckout}
          disabled={busy || preview?.status !== "ready"}
        >
          Buy {selectedPack.name} · {formatUsd(selectedPack.priceCents)}
        </Button>
      </div>

      {preview?.previewImageUrl ? (
        <div className="space-y-2">
          {preview.isMock ? (
            <output className="block text-sm font-medium text-destructive">
              Local mock preview. This shows your uploaded photo with a mock watermark; no AI model
              was called.
            </output>
          ) : (
            <p className="text-sm font-medium">Watermarked low-res preview image</p>
          )}
          <img
            src={preview.previewImageUrl}
            alt={
              preview.isMock
                ? "Local mock preview derived from the uploaded photo"
                : "Cartoon zombie couple preview"
            }
            className="w-full max-w-md rounded-xl border"
          />
        </div>
      ) : preview ? (
        preview.status === "failed" ? (
          <output className="block text-sm text-destructive">
            We could not create this preview. Please upload your photo and try again.
          </output>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generating your cartoon zombie preview image...
          </p>
        )
      ) : null}
    </div>
  );
}

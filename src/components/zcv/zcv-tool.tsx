"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { useSigninModal } from "@/hooks/use-signin-modal";

type PreviewState = {
  previewId: string;
  claimSecret: string;
  status: string;
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
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setPreview(JSON.parse(raw) as PreviewState);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!preview?.previewId || !preview.claimSecret) return;
    if (preview.status === "ready") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(
        `/api/zcv/preview/${preview.previewId}?claim=${encodeURIComponent(preview.claimSecret)}`
      );
      if (!response.ok) return;
      const json = await response.json();
      const next = {
        ...preview,
        status: json.data.status,
        previewImageUrl: json.data.previewImageUrl,
      };
      setPreview(next);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [preview]);

  useEffect(() => {
    if (searchParams.get("buy") === "1" && session?.user && preview) {
      void startCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, session?.user, preview?.previewId]);

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
        claimSecret: json.data.claimSecret,
        status: json.data.status,
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
      router.replace("/?buy=1");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/zcv/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewId: preview.previewId,
          claimSecret: preview.claimSecret,
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
        Free preview is an image; the video is generated after payment. $6.99,
        one 5s video, one-time, no subscription. We do not promise hugging, a
        plot, or 100% likeness.
      </div>

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
          Buy 5s video · $6.99
        </Button>
      </div>

      {preview?.previewImageUrl ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Watermarked low-res preview image</p>
          <img
            src={preview.previewImageUrl}
            alt="Cartoon zombie couple preview"
            className="w-full max-w-md rounded-xl border"
          />
        </div>
      ) : preview ? (
        <p className="text-sm text-muted-foreground">
          Generating your cartoon zombie preview image...
        </p>
      ) : null}
    </div>
  );
}

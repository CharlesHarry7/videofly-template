"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LocaleLink } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import type { User } from "@/lib/auth/client";
import { useSigninModal } from "@/hooks/use-signin-modal";

export function ZcvHeader({ user }: { user?: User | null }) {
  const signInModal = useSigninModal();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const activeUser = user ?? session?.user ?? null;

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <LocaleLink href="/" className="font-semibold">
          Zombie Couple Video
        </LocaleLink>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <a href="/#steps" className="text-muted-foreground hover:text-foreground">
            Steps
          </a>
          <a href="/#pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </a>
          <a href="/#faq" className="text-muted-foreground hover:text-foreground">
            FAQ
          </a>
          {activeUser ? (
            <LocaleLink href="/orders" className="text-muted-foreground hover:text-foreground">
              Orders
            </LocaleLink>
          ) : null}
        </nav>
        <div className="flex items-center gap-2">
          {activeUser ? (
            <Button type="button" variant="ghost" onClick={handleSignOut}>
              Sign out
            </Button>
          ) : (
            <Button type="button" onClick={() => signInModal.onOpen()}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

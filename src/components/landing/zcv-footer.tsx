import { LocaleLink } from "@/i18n/navigation";

export function ZcvFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-background">
      <div className="container mx-auto px-4 py-10 flex flex-col md:flex-row gap-6 justify-between">
        <div>
          <p className="font-semibold">Zombie Couple Video</p>
          <p className="text-sm text-muted-foreground mt-2">
            AI Zombie Couple Video Generator
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <LocaleLink href="/privacy">Privacy</LocaleLink>
          <LocaleLink href="/refund">Refund</LocaleLink>
          <LocaleLink href="/contact">Contact</LocaleLink>
          <LocaleLink href="/terms">Terms</LocaleLink>
        </div>
      </div>
      <div className="container mx-auto px-4 pb-8 text-sm text-muted-foreground">
        © {year} Zombie Couple Video. Based on VideoFly template (MIT).
      </div>
    </footer>
  );
}

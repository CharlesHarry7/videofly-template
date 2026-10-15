import { LocaleLink } from "@/i18n/navigation";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/site";

export function ZcvFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-background">
      <div className="container mx-auto px-4 py-10 flex flex-col md:flex-row gap-6 justify-between">
        <div>
          <p className="font-semibold">{BRAND_NAME}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Turn a couple photo into a zombie couple video.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <LocaleLink href="/pricing">Pricing</LocaleLink>
          <LocaleLink href="/privacy">Privacy</LocaleLink>
          <LocaleLink href="/refund">Refund</LocaleLink>
          <LocaleLink href="/contact">Contact</LocaleLink>
          <LocaleLink href="/terms">Terms</LocaleLink>
        </div>
      </div>
      <div className="container mx-auto px-4 pb-8 text-sm text-muted-foreground">
        © {year} {BRAND_NAME}.{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </div>
    </footer>
  );
}

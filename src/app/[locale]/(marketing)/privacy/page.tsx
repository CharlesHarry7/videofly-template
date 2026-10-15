import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata = {
  title: `Privacy Policy - ${BRAND_NAME}`,
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl py-16 prose dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p>Effective date: October 15, 2026</p>
      <p>
        {BRAND_NAME} stores the photo you upload, a cartoon preview image, and
        the paid zombie couple video for delivery. Videos are kept in a private
        bucket and are only available to the paying account through a
        short-lived download link.
      </p>
      <p>
        We use email magic-link login, Stripe for one-time credit-pack payment,
        Resend for email, and KIE to generate the preview image and paid video.
        We do not sell your photos.
      </p>
      <p>
        Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </div>
  );
}

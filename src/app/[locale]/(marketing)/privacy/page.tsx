export const metadata = {
  title: "Privacy Policy - Zombie Couple Video",
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl py-16 prose dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p>Effective date: October 14, 2026</p>
      <p>
        Zombie Couple Video stores the photo you upload, a cartoon preview
        image, and the paid video for delivery. Videos are kept in a private
        bucket and are only available to the paying account through a
        short-lived download link.
      </p>
      <p>
        We use email magic-link login, Stripe for one-time payment, Resend for
        email, and KIE to generate the preview image and paid video. We do not
        sell your photos.
      </p>
      <p>
        Contact <a href="mailto:support@example.com">support@example.com</a>.
      </p>
    </div>
  );
}

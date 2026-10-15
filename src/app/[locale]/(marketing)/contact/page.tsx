import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata = {
  title: `Contact - ${BRAND_NAME}`,
};

export default function ContactPage() {
  return (
    <div className="container mx-auto max-w-3xl py-16 prose dark:prose-invert">
      <h1>Contact</h1>
      <p>
        Questions about your zombie couple video, privacy, or a refund can be
        sent to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </div>
  );
}

export const metadata = {
  title: "Refund Policy - Zombie Couple Video",
};

export default function RefundPage() {
  return (
    <div className="container mx-auto max-w-3xl py-16 prose dark:prose-invert">
      <h1>Refund Policy</h1>
      <p>
        The $6.99 purchase is a one-time charge for one 5-second video. There is
        no subscription.
      </p>
      <p>
        If payment succeeds but the video cannot be delivered after retries, the
        order is marked for refund and we will refund the one-time charge.
      </p>
      <p>
        The free preview is an image only. It is not a paid product and is not
        refundable.
      </p>
      <p>
        Contact <a href="mailto:support@example.com">support@example.com</a>.
      </p>
    </div>
  );
}

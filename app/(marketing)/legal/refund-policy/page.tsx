export const metadata = { title: 'Refund Policy' }

export default function RefundPolicyPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p>Last updated: {new Date().toISOString().slice(0, 10)}</p>
      <p>
        This policy covers the Smart USA Visa preparation service fee only. It does not cover
        government filing fees, which are paid directly to the relevant government agency and
        are governed by that agency's own refund rules (generally non-refundable once filed).
      </p>
      <h2>1. Before you download your package</h2>
      <p>
        If you have paid but have not yet downloaded your completed filing package, you may
        request a full refund of the Smart USA Visa service fee within 14 days of payment by
        contacting support.
      </p>
      <h2>2. After you download your package</h2>
      <p>
        Once your completed forms and filing package have been generated and downloaded, the
        service has been fully delivered and the service fee is generally non-refundable, except
        where required by law.
      </p>
      <h2>3. Certified translations</h2>
      <p>
        Translation orders are non-refundable once a translator has begun work, since the service
        provider has already been engaged. If a translation has not yet started, you may cancel
        for a full refund.
      </p>
      <h2>4. Print & mail</h2>
      <p>Print & mail orders are non-refundable once your package has been sent to print.</p>
      <h2>5. How to request a refund</h2>
      <p>Contact support with your order details. We aim to respond within 2 business days.</p>
    </>
  )
}

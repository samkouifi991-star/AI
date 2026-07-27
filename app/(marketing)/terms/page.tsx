import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms governing use of Business Pilot AI.'
};

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-display font-semibold text-ink mb-2">Terms of Service</h1>
      <p className="text-sm text-slate-400 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</p>

      <div className="prose prose-slate max-w-none space-y-6 text-sm text-slate-600 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">The service</h2>
          <p>
            Business Pilot AI provides an AI receptionist, appointment and order management, and payment collection
            tools for service businesses and restaurants. Features available to your account depend on your
            subscription plan.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">Plans and usage</h2>
          <p>
            Each plan includes a set number of AI call minutes per month, as described on our
            <a href="/pricing" className="text-brand-600 font-medium"> Pricing page</a>. Usage is not unlimited on any
            plan — additional minutes, SMS messages, or phone number rental beyond your plan&apos;s included usage are
            billed at published overage rates.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">Phone numbers</h2>
          <p>
            If you forward your own existing number to your AI receptionist, that number remains yours at all times.
            If you purchase or import a number through Business Pilot AI, it is provisioned through our connected
            telephony provider on your behalf; you may request to port it to another provider if you cancel.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">Payments you collect</h2>
          <p>
            Payments from your customers are processed through Stripe, either your own connected Stripe account or our
            built-in payment processing. An order or appointment is only marked as paid after Stripe confirms the
            payment through a verified webhook.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">Acceptable use</h2>
          <p>
            You agree not to use the service to impersonate another business, to make false claims to customers, or
            to violate applicable telemarketing, messaging, or consumer-protection laws in your jurisdiction.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">Cancellation</h2>
          <p>
            You may cancel your subscription at any time from your account settings or by contacting us. Cancellation
            stops future billing; it does not retroactively refund the current billing period unless required by law.
          </p>
        </section>

        <p className="text-xs text-slate-400 pt-4 border-t border-slate-100">
          These terms describe the actual functionality of the product as built. They are not a substitute for legal
          advice — consult a qualified attorney before relying on them for a live business.
        </p>
      </div>
    </div>
  );
}

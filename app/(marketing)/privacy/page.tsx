import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Business Pilot AI collects, uses, and protects your data.'
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-display font-semibold text-ink mb-2">Privacy Policy</h1>
      <p className="text-sm text-slate-400 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</p>

      <div className="prose prose-slate max-w-none space-y-6 text-sm text-slate-600 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">What we collect</h2>
          <p>
            When you create an account, we collect your email address and the business information you provide during
            setup (business name, hours, services or menu, pricing rules). When your AI receptionist handles a call or
            order, we store the call transcript, recording, summary, and any customer details collected (name, phone,
            email, address) so they're available in your dashboard.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">How your data is isolated</h2>
          <p>
            Every business's data — calls, leads, orders, appointments, and settings — is isolated at the database
            level using row-level security. No business can query or view another business's records, regardless of
            how the request is made.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">Third-party processors</h2>
          <p>We rely on the following providers to deliver the service. Each processes only the data necessary for its function:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Voice and call handling providers, to answer and process phone calls</li>
            <li>A language-model provider, to generate responses and interpret uploaded business knowledge</li>
            <li>Stripe, to process payments — we never store your customers' full card details</li>
            <li>Google, if you connect Google Calendar, to check and book appointment availability</li>
            <li>SMS/telephony providers, to send text confirmations and reminders</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">Connected account credentials</h2>
          <p>
            If you connect your own Twilio or Stripe account, the credentials are encrypted before they are stored and
            are never displayed again after saving, including to our own support staff.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">Data retention</h2>
          <p>
            We retain call and order records for as long as your account is active, so your dashboard history stays
            complete. You can request deletion of your account and associated data at any time by contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink mb-2">Your choices</h2>
          <p>
            You can review, edit, or remove your business's knowledge base, menu, and settings at any time from your
            dashboard. To request a copy of your data or have your account deleted, contact us using the details on
            our <a href="/contact" className="text-brand-600 font-medium">Contact page</a>.
          </p>
        </section>

        <p className="text-xs text-slate-400 pt-4 border-t border-slate-100">
          This policy describes our actual data handling practices as implemented in the product. It is not a
          substitute for legal advice — consult a qualified attorney to confirm this policy meets the requirements of
          your jurisdiction before relying on it for a live business.
        </p>
      </div>
    </div>
  );
}

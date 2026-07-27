import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Features',
  description: 'Everything Business Pilot AI does for service businesses and restaurants — AI receptionist, booking, ordering, phone management, and payments.'
};

function FeatureSection({ id, title, subtitle, items }: { id: string; title: string; subtitle: string; items: string[] }) {
  return (
    <section id={id} className="py-16 border-b border-slate-100 scroll-mt-20">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-2xl md:text-3xl font-display font-semibold text-ink mb-2">{title}</h2>
        <p className="text-slate-500 mb-8 max-w-2xl">{subtitle}</p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item} className="flex items-start gap-2 text-sm text-slate-600 bg-white border border-slate-100 rounded-lg px-3 py-2.5">
              <span className="text-success mt-0.5">✓</span> {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <div>
      <section className="bg-slate-50 py-16 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-4xl font-display font-semibold text-ink mb-3">Everything in one platform</h1>
          <p className="text-slate-500">No separate tools to juggle — your AI receptionist, booking, ordering, and payments, together.</p>
        </div>
      </section>

      <FeatureSection
        id="receptionist"
        title="AI Receptionist"
        subtitle="A natural-sounding assistant that answers every call, day or night."
        items={['24/7 answering', 'Natural, human-sounding voice', 'Multilingual support', 'Transfers to your team', 'Call recordings', 'Full transcripts', 'Automatic call summaries', 'Caller history']}
      />

      <FeatureSection
        id="service-businesses"
        title="Service Businesses"
        subtitle="For contractors, plumbers, salons, dentists, and every appointment-based business."
        items={['Appointment booking', 'Instant estimates', 'Deposits before booking', 'Invoices', 'Flexible pricing rules', 'Travel fees', 'ZIP-code pricing', 'Service area limits', 'Lead capture', 'Google Calendar sync']}
      />

      <FeatureSection
        id="restaurants"
        title="Restaurants"
        subtitle="Real menu ordering by phone — pickup or delivery, start to finish."
        items={['Menu import from website, PDF, image, DOCX, or CSV', 'Easy menu editing', 'Modifiers and add-ons', 'Pickup', 'Delivery', 'Taxes and tips', 'Secure payment links', 'Live order dashboard']}
      />

      <FeatureSection
        id="knowledge"
        title="Knowledge"
        subtitle="Teach your AI once — it answers naturally from then on, no scripting required."
        items={['Import from your website', 'FAQs', 'Policies', 'Menus', 'Service lists', 'Any document', 'Natural, unscripted answers']}
      />

      <FeatureSection
        id="phone"
        title="Phone Management"
        subtitle="Full control of your phone system, without ever logging into a phone provider."
        items={['Keep your current business number', 'Buy a new number', 'Import an existing number', 'Call forwarding', 'Smart routing', 'Department transfers', 'SMS controls', 'A full test center']}
      />

      <FeatureSection
        id="payments"
        title="Payments and Automation"
        subtitle="Get paid without chasing anyone down."
        items={['Stripe-powered payments', 'Secure payment links', 'Deposits', 'Order payments', 'Automatic confirmations', 'Reminders', 'Missed-call follow-up', 'Receipts']}
      />

      <section id="integrations" className="py-16 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-display font-semibold text-ink mb-3">Connects with what you already use</h2>
          <p className="text-slate-500 mb-8">One click to connect — no technical setup required.</p>
          <div className="flex justify-center gap-6 flex-wrap text-slate-600 font-medium">
            <span className="card px-6 py-3">Google Calendar</span>
            <span className="card px-6 py-3">Stripe</span>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-16 text-center">
        <Link href="/signup" className="btn-primary text-base px-6 py-3">Start Free</Link>
      </section>
    </div>
  );
}

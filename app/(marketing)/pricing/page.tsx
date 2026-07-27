import type { Metadata } from 'next';
import Link from 'next/link';
import PricingCards from '@/components/PricingCards';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing for Business Pilot AI — Starter, Growth, and Pro plans.'
};

const COMPARISON = [
  ['AI call minutes included', '100/mo', '400/mo', '1,000/mo'],
  ['Phone numbers', '1', '1', 'Multiple'],
  ['Appointment booking', '—', '✓', '✓'],
  ['Restaurant ordering', '—', '✓', '✓'],
  ['Invoicing & online payments', '—', '—', '✓'],
  ['Advanced call routing', '—', '—', '✓'],
  ['Support', 'Standard', 'Standard', 'Priority']
];

export default function PricingPage() {
  return (
    <div>
      <section className="bg-slate-50 py-16 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h1 className="text-4xl font-display font-semibold text-ink mb-3">Simple, transparent pricing</h1>
          <p className="text-slate-500">Every plan includes a free trial. No setup fees.</p>
        </div>
      </section>

      <section className="py-16 px-6">
        <PricingCards />
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-display font-semibold text-ink mb-4 text-center">Compare plans</h2>
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Feature</th>
                <th className="px-4 py-3 font-medium">Starter</th>
                <th className="px-4 py-3 font-medium">Growth</th>
                <th className="px-4 py-3 font-medium">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COMPARISON.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i} className={i === 0 ? 'px-4 py-3 font-medium text-ink' : 'px-4 py-3 text-slate-600'}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-4 text-center max-w-xl mx-auto">
          If you buy a phone number through Business Pilot AI, its monthly rental fee is separate from your plan price
          and shown before purchase. Overage rates for extra minutes or SMS beyond your plan's included usage are
          published in your account's billing settings.
        </p>
      </section>

      <section className="bg-slate-50 py-16">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-display font-semibold text-ink mb-3">Questions about pricing?</h2>
          <Link href="/faq" className="text-brand-600 font-medium">Read the full FAQ →</Link>
        </div>
      </section>

      <section className="py-16 text-center">
        <Link href="/signup" className="btn-primary text-base px-6 py-3">Start Free</Link>
      </section>
    </div>
  );
}

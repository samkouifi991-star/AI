import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCents } from '@/lib/engine/pricing'
import { getFlatFeeCents } from '@/lib/engine/translation-package'

export const metadata = { title: 'Pricing' }

export default async function PricingPage() {
  const supabase = createClient()
  const [{ data: applicationTypes }, { data: pricingRows }, { data: feeRows }, flatFeeCents] = await Promise.all([
    supabase.from('application_types').select('id, slug, form_code, name').eq('is_active', true).order('sort_order'),
    supabase.from('pricing').select('*'),
    supabase.from('government_fees').select('*'),
    getFlatFeeCents(supabase),
  ])

  const rows = (applicationTypes ?? []).map((app) => {
    const pricing = pricingRows?.find((p) => p.application_type_id === app.id)
    const fee = feeRows?.find((f) => f.application_type_id === app.id)
    return { app, pricing, fee }
  })

  return (
    <div className="container-page py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Pricing</h1>
      <p className="mt-3 max-w-2xl text-ink-600">
        A flat Smart USA Visa preparation fee per application, shown separately from the
        government's own filing fee — which is paid directly to USCIS, not to us. Pricing is
        managed centrally so it always reflects current rates.
      </p>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-ink-100">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Application</th>
              <th className="px-5 py-3 font-semibold">Smart USA Visa fee</th>
              <th className="px-5 py-3 font-semibold">Government fee</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map(({ app, pricing, fee }) => (
              <tr key={app.id}>
                <td className="px-5 py-4">
                  <span className="badge-neutral">{app.form_code}</span>
                  <span className="ml-2 font-medium text-ink-800">{app.name}</span>
                </td>
                <td className="px-5 py-4 font-semibold text-ink-900">
                  {pricing ? formatCents(pricing.promo_active && pricing.promo_fee_cents != null ? pricing.promo_fee_cents : pricing.service_fee_cents) : '—'}
                </td>
                <td className="px-5 py-4 text-ink-600">
                  {fee ? (fee.amount_cents > 0 ? formatCents(fee.amount_cents) : 'No fee') : '—'}
                </td>
                <td className="px-5 py-4">
                  <Link href={`/applications/${app.slug}`} className="text-sm font-semibold text-harbor-700 hover:text-harbor-900">
                    View details →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-14 text-2xl font-bold">Optional Add-Ons</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <h3 className="font-heading font-semibold">Certified Document Translation Package</h3>
          <p className="mt-1 text-2xl font-bold text-ink-950">{formatCents(flatFeeCents)} <span className="text-sm font-medium text-ink-500">/ application</span></p>
          <p className="mt-2 text-sm text-ink-600">
            Includes professional English translation of required non-English supporting documents
            submitted through your Smart USA Visa application.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-ink-700">
            <li className="flex items-start gap-2"><span className="mt-0.5 text-success-600">✓</span>One flat fee</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-success-600">✓</span>Covers required translation documents for the application</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-success-600">✓</span>English translations</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-success-600">✓</span>Translator certification where included in the service</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-success-600">✓</span>Delivered directly into your Smart USA Visa document workspace</li>
          </ul>
          <Link href="/find-my-application" className="btn-primary mt-4 inline-flex">Add During Your Application</Link>
        </div>
        <div className="card">
          <h3 className="font-heading font-semibold">Print & Mail</h3>
          <p className="mt-2 text-sm text-ink-600">Optional add-on at checkout if you&apos;d rather not print your own package — priced per application, shown at checkout.</p>
        </div>
      </div>

      <div className="mt-6 card">
        <h3 className="font-heading font-semibold">No hidden fees</h3>
        <p className="mt-2 text-sm text-ink-600">Government filing fees are always shown separately and paid directly to USCIS — never bundled into Smart USA Visa pricing.</p>
      </div>

      <p className="mt-10 text-xs text-ink-500">
        Government fees change periodically. Smart USA Visa keeps this page synced to a
        centrally-managed fee table, but always confirm the current fee on USCIS's website before
        filing.
      </p>
    </div>
  )
}

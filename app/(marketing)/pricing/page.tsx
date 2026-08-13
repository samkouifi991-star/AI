import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCents } from '@/lib/engine/pricing'

export const metadata = { title: 'Pricing' }

export default async function PricingPage() {
  const supabase = createClient()
  const { data: applicationTypes } = await supabase
    .from('application_types')
    .select('id, slug, form_code, name')
    .eq('is_active', true)
    .order('sort_order')

  const { data: pricingRows } = await supabase.from('pricing').select('*')
  const { data: feeRows } = await supabase.from('government_fees').select('*')

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

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <h3 className="font-heading font-semibold">Certified translation</h3>
          <p className="mt-2 text-sm text-ink-600">Priced per page when you request a translation during document upload.</p>
        </div>
        <div className="card">
          <h3 className="font-heading font-semibold">Print & mail</h3>
          <p className="mt-2 text-sm text-ink-600">Optional add-on at checkout if you'd rather not print your own package.</p>
        </div>
        <div className="card">
          <h3 className="font-heading font-semibold">No hidden fees</h3>
          <p className="mt-2 text-sm text-ink-600">Government filing fees are always shown separately and paid directly to USCIS.</p>
        </div>
      </div>

      <p className="mt-10 text-xs text-ink-500">
        Government fees change periodically. Smart USA Visa keeps this page synced to a
        centrally-managed fee table, but always confirm the current fee on USCIS's website before
        filing.
      </p>
    </div>
  )
}

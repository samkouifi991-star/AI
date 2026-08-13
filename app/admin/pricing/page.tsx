import { requireStaff } from '@/lib/admin'
import { updatePricing } from '@/app/actions/admin'

export default async function AdminPricingPage() {
  const { supabase, profile } = await requireStaff()
  const { data: applicationTypes } = await supabase.from('application_types').select('id, form_code, name').order('sort_order')
  const { data: pricingRows } = await supabase.from('pricing').select('*')
  const canEdit = profile.role === 'admin'

  return (
    <div>
      <h1 className="text-2xl font-bold">Pricing</h1>
      <p className="mt-1 text-ink-600">The Smart USA Visa preparation fee, promo pricing, and print &amp; mail add-on — per application. Changes apply site-wide immediately.</p>

      <div className="mt-6 space-y-4">
        {(applicationTypes ?? []).map((app) => {
          const pricing = pricingRows?.find((p) => p.application_type_id === app.id)
          if (!pricing) return null
          return (
            <form key={app.id} action={updatePricing} className="card grid gap-3 sm:grid-cols-5 sm:items-end">
              <input type="hidden" name="application_type_id" value={app.id} />
              <div className="sm:col-span-1">
                <span className="badge-neutral">{app.form_code}</span>
                <p className="mt-1 text-sm font-medium">{app.name}</p>
              </div>
              <div>
                <label className="field-label">Service fee ($)</label>
                <input type="number" step="0.01" name="service_fee" defaultValue={(pricing.service_fee_cents / 100).toFixed(2)} className="field-input" disabled={!canEdit} />
              </div>
              <div>
                <label className="field-label">Promo fee ($)</label>
                <input type="number" step="0.01" name="promo_fee" defaultValue={pricing.promo_fee_cents != null ? (pricing.promo_fee_cents / 100).toFixed(2) : ''} className="field-input" disabled={!canEdit} />
              </div>
              <div>
                <label className="field-label">Print &amp; mail ($)</label>
                <input type="number" step="0.01" name="print_mail_fee" defaultValue={(pricing.print_mail_fee_cents / 100).toFixed(2)} className="field-input" disabled={!canEdit} />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="promo_active" defaultChecked={pricing.promo_active} disabled={!canEdit} />
                  Promo active
                </label>
                {canEdit && <button type="submit" className="btn-primary">Save</button>}
              </div>
            </form>
          )
        })}
      </div>
    </div>
  )
}

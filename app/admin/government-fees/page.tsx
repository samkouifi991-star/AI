import { requireStaff } from '@/lib/admin'
import { updateGovernmentFee } from '@/app/actions/admin'

export default async function AdminGovernmentFeesPage() {
  const { supabase, profile } = await requireStaff()
  const { data: fees } = await supabase
    .from('government_fees')
    .select('*, application_types(form_code, name)')
    .order('application_type_id')
  const canEdit = profile.role === 'admin'

  return (
    <div>
      <h1 className="text-2xl font-bold">Government Fees</h1>
      <p className="mt-1 text-ink-600">
        Reference figures shown to customers, kept separate from the Smart USA Visa service fee.
        Because USCIS changes these periodically, update them here rather than in code.
      </p>

      <div className="mt-6 space-y-4">
        {(fees ?? []).map((fee: any) => (
          <form key={fee.id} action={updateGovernmentFee} className="card grid gap-3 sm:grid-cols-5 sm:items-end">
            <input type="hidden" name="id" value={fee.id} />
            <div>
              <span className="badge-neutral">{fee.application_types?.form_code}</span>
            </div>
            <div>
              <label className="field-label">Label</label>
              <input name="label" defaultValue={fee.label} className="field-input" disabled={!canEdit} />
            </div>
            <div>
              <label className="field-label">Amount ($)</label>
              <input type="number" step="0.01" name="amount" defaultValue={(fee.amount_cents / 100).toFixed(2)} className="field-input" disabled={!canEdit} />
            </div>
            <div>
              <label className="field-label">Effective date</label>
              <input type="date" name="effective_date" defaultValue={fee.effective_date} className="field-input" disabled={!canEdit} />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="fee_waiver_available" defaultChecked={fee.fee_waiver_available} disabled={!canEdit} />
                Waiver available
              </label>
              {canEdit && <button type="submit" className="btn-primary">Save</button>}
            </div>
            <div className="sm:col-span-5">
              <label className="field-label">Source note</label>
              <input name="source_note" defaultValue={fee.source_note ?? ''} className="field-input" disabled={!canEdit} />
            </div>
          </form>
        ))}
      </div>
    </div>
  )
}

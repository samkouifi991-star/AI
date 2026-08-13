import { requireStaff } from '@/lib/admin'
import { updateTranslationStatus } from '@/app/actions/admin'
import { TranslationUpload } from '@/components/admin/TranslationUpload'
import { formatCents } from '@/lib/engine/pricing'

const statuses = ['requested', 'awaiting_payment', 'in_progress', 'completed', 'delivered']

export default async function AdminTranslationsPage() {
  const { supabase } = await requireStaff()
  const { data: translations } = await supabase
    .from('translations')
    .select('*, application_documents(application_id, document_requirements(label))')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-bold">Translation Orders</h1>

      <div className="mt-6 space-y-4">
        {(translations ?? []).map((t: any) => (
          <div key={t.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-heading font-semibold">{t.application_documents?.document_requirements?.label ?? 'Document'}</p>
                <p className="text-sm text-ink-500">{t.source_language} → English · {t.page_count} page(s) · {formatCents(t.price_cents)}</p>
              </div>
              <form action={updateTranslationStatus} className="flex items-center gap-2">
                <input type="hidden" name="id" value={t.id} />
                <select name="status" defaultValue={t.status} className="field-input py-1.5 text-sm">
                  {statuses.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
                <button type="submit" className="btn-outline">Update</button>
              </form>
            </div>
            <TranslationUpload translationId={t.id} />
          </div>
        ))}
        {(translations ?? []).length === 0 && <p className="text-ink-500">No translation orders yet.</p>}
      </div>
    </div>
  )
}

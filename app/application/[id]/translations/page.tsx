import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { formatCents } from '@/lib/engine/pricing'
import { TranslationPayButton } from '@/components/questionnaire/TranslationPayButton'

export default async function TranslationsPage({ params }: { params: { id: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) redirect('/sign-in')
    throw err
  }
  const { application, supabase } = accessible

  const { data: docs } = await supabase
    .from('application_documents')
    .select('id, custom_label, original_filename, translation_id, document_requirement_id, document_requirements(label)')
    .eq('application_id', application.id)
    .not('translation_id', 'is', null)

  const translationIds = (docs ?? []).map((d) => d.translation_id).filter(Boolean) as string[]
  const { data: translations } = translationIds.length
    ? await supabase.from('translations').select('*').in('id', translationIds)
    : { data: [] }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Translations</h1>
      <p className="mt-2 text-ink-600">Every certified translation you've requested for this application.</p>

      <div className="mt-8 space-y-4">
        {(docs ?? []).length === 0 && (
          <p className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500">
            No translations requested yet. You can request one from any document in your{' '}
            <Link href={`/application/${application.id}/documents`} className="font-semibold text-harbor-700">document checklist</Link>.
          </p>
        )}
        {(docs ?? []).map((doc: any) => {
          const t = translations?.find((tr) => tr.id === doc.translation_id)
          if (!t) return null
          return (
            <div key={doc.id} className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-semibold">{doc.document_requirements?.label ?? doc.custom_label ?? 'Document'}</h3>
                <span className="badge-neutral capitalize">{t.status.replace('_', ' ')}</span>
              </div>
              <p className="mt-2 text-sm text-ink-600">
                {t.source_language} → English · {t.page_count} page{t.page_count === 1 ? '' : 's'} · {formatCents(t.price_cents)}
              </p>
              {t.status === 'requested' && <TranslationPayButton translationId={t.id} />}
            </div>
          )
        })}
      </div>

      <Link href={`/application/${application.id}`} className="btn-ghost mt-8 inline-flex">← Back to application</Link>
    </div>
  )
}

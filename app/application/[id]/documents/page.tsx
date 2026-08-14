import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getApplicationTypeById, getFullSchema, getAnswersBundle } from '@/lib/engine/schema'
import { syncDocumentChecklist } from '@/lib/engine/documents'
import { getPackageForApplication, getFlatFeeCents } from '@/lib/engine/translation-package'
import { DocumentChecklist } from '@/components/questionnaire/DocumentChecklist'

export default async function DocumentsPage({ params }: { params: { id: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) redirect('/sign-in')
    throw err
  }
  const { application, supabase } = accessible
  const applicationType = await getApplicationTypeById(supabase, application.application_type_id)
  const schema = await getFullSchema(supabase, application.application_type_id)
  const answers = await getAnswersBundle(supabase, application.id, schema)
  const checklist = await syncDocumentChecklist(supabase, application.id, application.application_type_id, answers.flat)

  const translationIds = checklist.map((c) => c.applicationDocument?.translation_id).filter(Boolean) as string[]
  const { data: translations } = translationIds.length
    ? await supabase.from('translations').select('*').in('id', translationIds)
    : { data: [] }

  const [translationPackage, flatFeeCents] = await Promise.all([
    getPackageForApplication(supabase, application.id),
    getFlatFeeCents(supabase),
  ])

  const items = checklist.map((c) => ({
    id: c.applicationDocument!.id,
    label: c.requirement.label,
    category: c.requirement.category,
    description: c.requirement.description,
    status: c.applicationDocument!.status,
    originalFilename: c.applicationDocument!.original_filename,
    needsTranslation: c.applicationDocument!.needs_translation ?? false,
    translation: c.applicationDocument!.translation_id
      ? (() => {
          const t = translations?.find((tr) => tr.id === c.applicationDocument!.translation_id)
          return t
            ? {
                id: t.id,
                status: t.status,
                sourceLanguage: t.source_language,
                selfProvided: t.self_provided,
                hasTranslatedFile: Boolean(t.translated_storage_path),
                hasCertificationFile: Boolean(t.certification_storage_path),
              }
            : null
        })()
      : null,
  }))

  return (
    <div>
      <p className="text-sm font-semibold text-harbor-700">{applicationType.form_code} — {applicationType.name}</p>
      <h1 className="mt-2 text-2xl font-bold">Your document checklist</h1>
      <p className="mt-2 max-w-2xl text-ink-600">
        Personalized based on your answers. Upload PDF, JPG, or PNG files — if anything isn't in
        English, we'll help you get it translated.
      </p>

      <div className="mt-8 max-w-3xl">
        <DocumentChecklist
          applicationId={application.id}
          items={items}
          hasPackage={Boolean(translationPackage)}
          flatFeeCents={flatFeeCents}
        />
      </div>

      <div className="mt-10 flex max-w-3xl items-center justify-between">
        <Link href={`/application/${application.id}/questions`} className="btn-ghost">← Back to questionnaire</Link>
        <Link href={`/application/${application.id}/review`} className="btn-primary">Continue to Review</Link>
      </div>
    </div>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getApplicationTypeById, getFullSchema, getAnswersBundle } from '@/lib/engine/schema'
import { runValidationEngine, overallReadiness } from '@/lib/engine/validation'
import { syncDocumentChecklist } from '@/lib/engine/documents'
import type { Translation } from '@/lib/supabase/types'

const severityIcon: Record<string, string> = { complete: '✓', needs_attention: '!', potential_issue: '⚠' }
const severityClass: Record<string, string> = {
  complete: 'text-success-600',
  needs_attention: 'text-warning-500',
  potential_issue: 'text-danger-600',
}

export default async function ReviewPage({ params }: { params: { id: string } }) {
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
  const { data: rules } = await supabase.from('validation_rules').select('*').eq('application_type_id', application.application_type_id)

  const results = runValidationEngine(schema, answers, rules ?? [])
  const readiness = overallReadiness(results)

  const checklist = await syncDocumentChecklist(supabase, application.id, application.application_type_id, answers.flat)
  const missingRequired = checklist.filter((c) => c.requirement.required && c.applicationDocument?.status === 'missing')

  const { data: translationJobs } = await supabase
    .from('translations')
    .select('*')
    .eq('application_id', application.id)
    .order('created_at')
  const jobs = (translationJobs ?? []) as Translation[]

  const isReady = results.every((r) => r.severity === 'complete') && missingRequired.length === 0

  if (isReady && application.status === 'in_progress') {
    await supabase.from('applications').update({ status: 'ready_for_review' }).eq('id', application.id)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold text-harbor-700">{applicationType.form_code} — {applicationType.name}</p>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Application Readiness</h1>
        <span className="font-heading text-2xl font-bold text-harbor-800">{readiness}%</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-compass-500" style={{ width: `${readiness}%` }} />
      </div>

      <div className="mt-8 space-y-3">
        {results.map((r) => (
          <div key={r.section_key} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`font-bold ${severityClass[r.severity]}`}>{severityIcon[r.severity]}</span>
                <span className="font-heading font-semibold">{r.section_title}</span>
              </div>
              {r.severity !== 'complete' && (
                <Link href={`/application/${application.id}/questions`} className="text-sm font-semibold text-harbor-700 hover:text-harbor-900">
                  Review Issue →
                </Link>
              )}
            </div>
            {r.messages.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-ink-600">
                {r.messages.map((m, i) => (
                  <li key={i}>• {m.message}</li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`font-bold ${missingRequired.length === 0 ? 'text-success-600' : 'text-warning-500'}`}>
                {missingRequired.length === 0 ? '✓' : '!'}
              </span>
              <span className="font-heading font-semibold">Supporting Documents</span>
            </div>
            {missingRequired.length > 0 && (
              <Link href={`/application/${application.id}/documents`} className="text-sm font-semibold text-harbor-700 hover:text-harbor-900">
                Review Issue →
              </Link>
            )}
          </div>
          {missingRequired.length > 0 && (
            <p className="mt-2 text-sm text-ink-600">{missingRequired.length} required document{missingRequired.length === 1 ? '' : 's'} still missing.</p>
          )}
        </div>

        {jobs.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2">
              <span className={`font-bold ${jobs.every((j) => j.status === 'completed') ? 'text-success-600' : 'text-warning-500'}`}>
                {jobs.every((j) => j.status === 'completed') ? '✓' : '⚠'}
              </span>
              <span className="font-heading font-semibold">Document Translations</span>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-ink-700">
              {jobs.map((job) => (
                <li key={job.id}>
                  {job.status === 'completed'
                    ? `✓ ${job.document_label ?? 'Document'} + English Translation Complete`
                    : job.status === 'in_progress'
                      ? `${job.document_label ?? 'Document'} — Translation In Progress`
                      : job.status === 'needs_attention'
                        ? `⚠ ${job.document_label ?? 'Document'} — Needs Attention`
                        : `⚠ ${job.document_label ?? 'Document'} — English translation required`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <Link href={`/application/${application.id}/documents`} className="btn-ghost">← Back to documents</Link>
        {isReady ? (
          <div className="text-right">
            <p className="mb-2 text-sm font-semibold text-success-600">Your application is ready to prepare.</p>
            <Link href={`/application/${application.id}/checkout`} className="btn-primary">Prepare My Application</Link>
          </div>
        ) : (
          <button disabled className="btn-primary opacity-40">Prepare My Application</button>
        )}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getPackageForApplication, computePackageDisplayStatus, packageStatusLabel, jobStatusLabel } from '@/lib/engine/translation-package'
import { formatCents } from '@/lib/engine/pricing'
import type { Translation } from '@/lib/supabase/types'

const jobStatusClass: Record<string, string> = {
  required: 'badge-neutral',
  awaiting_upload: 'badge-neutral',
  submitted: 'badge-warning',
  in_progress: 'badge-warning',
  completed: 'badge-success',
  needs_attention: 'badge-danger',
}

export default async function TranslationsPage({ params }: { params: { id: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) redirect('/sign-in')
    throw err
  }
  const { application, supabase } = accessible

  const [translationPackage, { data: jobs }] = await Promise.all([
    getPackageForApplication(supabase, application.id),
    supabase.from('translations').select('*').eq('application_id', application.id).order('created_at'),
  ])

  const allJobs = (jobs ?? []) as Translation[]
  const paidJobs = allJobs.filter((j) => !j.self_provided)
  const selfProvidedJobs = allJobs.filter((j) => j.self_provided)
  const displayStatus = computePackageDisplayStatus(translationPackage, allJobs)
  const completedCount = paidJobs.filter((j) => j.status === 'completed').length

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Certified Translations</h1>
      <p className="mt-2 text-ink-600">Every document translation for this application, in one place.</p>

      <div className="mt-8 card">
        {translationPackage ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold">Translation Package {displayStatus !== 'not_purchased' ? 'Active' : ''}</h2>
              <span className={displayStatus === 'completed' ? 'badge-success' : 'badge-warning'}>{packageStatusLabel[displayStatus]}</span>
            </div>
            <p className="mt-2 text-sm text-ink-600">
              {formatCents(translationPackage.price_cents)} flat fee · {paidJobs.length} document{paidJobs.length === 1 ? '' : 's'} submitted · {completedCount} completed
              {paidJobs.length - completedCount > 0 ? ` · ${paidJobs.length - completedCount} in progress` : ''}
            </p>
            {translationPackage.payment_status === 'pending' && (
              <p className="mt-2 text-sm text-warning-600">
                Added to your order — pay at checkout to send this to a translator.
              </p>
            )}
          </>
        ) : (
          <div>
            <h2 className="font-heading font-semibold">No Translation Package Yet</h2>
            <p className="mt-2 text-sm text-ink-600">
              If any of your documents aren&apos;t in English, mark them from your document checklist and
              we&apos;ll offer the Certified Document Translation Package there — one flat fee covers every
              required document for this application.
            </p>
            <Link href={`/application/${application.id}/documents`} className="btn-primary mt-4 inline-flex">Go to Documents</Link>
          </div>
        )}
      </div>

      {paidJobs.length > 0 && (
        <div className="mt-6">
          <h2 className="font-heading text-lg font-semibold">Documents in your package</h2>
          <div className="mt-3 space-y-3">
            {paidJobs.map((job) => (
              <div key={job.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink-900">{job.document_label ?? 'Document'}</p>
                  <p className="text-sm text-ink-500">{job.source_language} → English</p>
                </div>
                <span className={jobStatusClass[job.status]}>{jobStatusLabel[job.status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selfProvidedJobs.length > 0 && (
        <div className="mt-6">
          <h2 className="font-heading text-lg font-semibold">Your own translations</h2>
          <div className="mt-3 space-y-3">
            {selfProvidedJobs.map((job) => (
              <div key={job.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink-900">{job.document_label ?? 'Document'}</p>
                  <p className="text-sm text-ink-500">{job.source_language} → English · self-provided</p>
                </div>
                <span className={jobStatusClass[job.status]}>{jobStatusLabel[job.status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href={`/application/${application.id}`} className="btn-ghost mt-8 inline-flex">← Back to application</Link>
    </div>
  )
}

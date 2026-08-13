import type { SupabaseClient } from '@supabase/supabase-js'
import type { Application } from '@/lib/supabase/types'
import { getApplicationTypeById, getFullSchema, getAnswersBundle } from './schema'
import { runValidationEngine } from './validation'
import { syncDocumentChecklist } from './documents'

export type ApplicationSummary = {
  applicationType: Awaited<ReturnType<typeof getApplicationTypeById>>
  progressPercent: number
  documentsUploaded: number
  documentsTotal: number
  translationsInProgress: number
  reviewIssues: number
  paymentStatus: 'not_purchased' | 'pending' | 'paid'
  packageReady: boolean
  nextStep: { label: string; href: string }
}

export async function getApplicationSummary(supabase: SupabaseClient, application: Application): Promise<ApplicationSummary> {
  const applicationType = await getApplicationTypeById(supabase, application.application_type_id)
  const schema = await getFullSchema(supabase, application.application_type_id)
  const answers = await getAnswersBundle(supabase, application.id, schema)

  const checklist = await syncDocumentChecklist(supabase, application.id, application.application_type_id, answers.flat)
  const documentsTotal = checklist.length
  const documentsUploaded = checklist.filter((c) => c.applicationDocument?.status !== 'missing').length

  const translationIds = checklist.map((c) => c.applicationDocument?.translation_id).filter(Boolean) as string[]
  const { data: translations } = translationIds.length
    ? await supabase.from('translations').select('status').in('id', translationIds)
    : { data: [] }
  const translationsInProgress = (translations ?? []).filter((t) => t.status !== 'completed' && t.status !== 'delivered').length

  const { data: rules } = await supabase.from('validation_rules').select('*').eq('application_type_id', application.application_type_id)
  const results = runValidationEngine(schema, answers, rules ?? [])
  const reviewIssues = results.filter((r) => r.severity !== 'complete').length

  const { data: payment } = await supabase
    .from('payments')
    .select('status')
    .eq('application_id', application.id)
    .eq('status', 'succeeded')
    .maybeSingle()
  const paymentStatus = payment ? 'paid' : application.status === 'ready_for_review' ? 'pending' : 'not_purchased'

  const { data: pkg } = await supabase.from('generated_packages').select('id').eq('application_id', application.id).maybeSingle()

  let nextStep = { label: 'Continue application', href: `/application/${application.id}/questions` }
  if (application.status === 'eligibility') nextStep = { label: 'Start eligibility check', href: `/application/${application.id}/eligibility` }
  else if (application.status === 'in_progress' && reviewIssues > 0) nextStep = { label: 'Continue answering questions', href: `/application/${application.id}/questions` }
  else if (application.status === 'in_progress' || application.status === 'ready_for_review') {
    nextStep = documentsUploaded < documentsTotal
      ? { label: 'Upload your documents', href: `/application/${application.id}/documents` }
      : { label: 'Review your application', href: `/application/${application.id}/review` }
  } else if (application.status === 'paid') {
    nextStep = { label: 'View your filing package', href: `/application/${application.id}/package` }
  } else if (application.status === 'package_ready') {
    nextStep = { label: 'Download your filing package', href: `/application/${application.id}/package` }
  }

  return {
    applicationType,
    progressPercent: application.progress_percent,
    documentsUploaded,
    documentsTotal,
    translationsInProgress,
    reviewIssues,
    paymentStatus,
    packageReady: Boolean(pkg),
    nextStep,
  }
}

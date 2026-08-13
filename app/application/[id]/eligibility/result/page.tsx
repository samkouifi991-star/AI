import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getApplicationTypeById, getFullSchema, getAnswersBundle } from '@/lib/engine/schema'
import { runValidationEngine } from '@/lib/engine/validation'

export default async function EligibilityResultPage({ params }: { params: { id: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) redirect('/find-my-application')
    throw err
  }
  const { application, supabase } = accessible
  const applicationType = await getApplicationTypeById(supabase, application.application_type_id)
  const schema = await getFullSchema(supabase, application.application_type_id)
  const eligibilitySection = schema.find((s) => s.key === 'eligibility')

  let flag: 'clear' | 'needs_review' = 'clear'

  if (eligibilitySection) {
    const answers = await getAnswersBundle(supabase, application.id, schema)
    const { data: rules } = await supabase
      .from('validation_rules')
      .select('*')
      .eq('application_type_id', application.application_type_id)
      .eq('section_key', 'eligibility')
    const results = runValidationEngine([eligibilitySection], answers, rules ?? [])
    flag = results.some((r) => r.severity !== 'complete') ? 'needs_review' : 'clear'
  }

  await supabase
    .from('applications')
    .update({ eligibility_flag: flag, status: 'in_progress' })
    .eq('id', application.id)

  const isSignedIn = Boolean(application.user_id)
  const continueHref = isSignedIn
    ? `/application/${application.id}/questions`
    : `/sign-up?next=${encodeURIComponent(`/application/${application.id}/questions`)}`

  return (
    <div className="mx-auto max-w-xl text-center">
      {flag === 'clear' ? (
        <>
          <span className="badge-success">Good news</span>
          <h1 className="mt-4 text-2xl font-bold">Nothing here rules you out.</h1>
          <p className="mt-3 text-ink-600">
            Based on your answers, this application looks like a reasonable fit. The rest of the
            questionnaire will collect everything needed to prepare your {applicationType.form_code}.
          </p>
        </>
      ) : (
        <>
          <span className="badge-warning">Worth a closer look</span>
          <h1 className="mt-4 text-2xl font-bold">Your situation may require additional review.</h1>
          <p className="mt-3 text-ink-600">
            One or more of your answers is the kind of thing that can add complexity to a case.
            Smart USA Visa can still help you prepare your documents, but you may want to speak
            with a qualified immigration attorney before filing. We are not a law firm and cannot
            tell you whether you are eligible.
          </p>
        </>
      )}

      {!isSignedIn && (
        <p className="mt-6 rounded-xl bg-harbor-50 p-4 text-sm text-ink-700">
          Create a free account to save your answers and continue — nothing you've entered will
          be lost.
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href={continueHref} className="btn-primary">
          {isSignedIn ? 'Continue to Full Application' : 'Create Account & Continue'}
        </Link>
        <Link href="/contact" className="btn-outline">Talk to Support</Link>
      </div>
    </div>
  )
}

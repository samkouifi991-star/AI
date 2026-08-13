import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getApplicationTypeById, getFullSchema, getAnswersBundle } from '@/lib/engine/schema'
import { QuestionnaireWizard } from '@/components/questionnaire/QuestionnaireWizard'

export default async function EligibilityPage({ params }: { params: { id: string } }) {
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

  if (!eligibilitySection || eligibilitySection.questions.length === 0) {
    redirect(`/application/${application.id}/eligibility/result`)
  }

  const answers = await getAnswersBundle(supabase, application.id, schema)

  return (
    <div>
      <p className="text-sm font-semibold text-harbor-700">{applicationType.form_code} — {applicationType.name}</p>
      <div className="mt-6">
        <QuestionnaireWizard
          applicationId={application.id}
          sections={[eligibilitySection]}
          initialAnswers={answers.rows.map((r) => ({ question_key: r.question_key, repeater_index: r.repeater_index, value: r.value }))}
          finishHref={`/application/${application.id}/eligibility/result`}
          title="Eligibility check"
        />
      </div>
    </div>
  )
}

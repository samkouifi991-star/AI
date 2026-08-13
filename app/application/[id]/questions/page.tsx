import { redirect } from 'next/navigation'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getApplicationTypeById, getFullSchema, getAnswersBundle } from '@/lib/engine/schema'
import { QuestionnaireWizard } from '@/components/questionnaire/QuestionnaireWizard'

export default async function QuestionsPage({ params }: { params: { id: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) redirect('/sign-in')
    throw err
  }
  const { application, supabase } = accessible

  if (!application.user_id) {
    redirect(`/sign-up?next=${encodeURIComponent(`/application/${application.id}/questions`)}`)
  }

  const applicationType = await getApplicationTypeById(supabase, application.application_type_id)
  const schema = await getFullSchema(supabase, application.application_type_id)
  const questionSections = schema.filter((s) => s.key !== 'eligibility')
  const answers = await getAnswersBundle(supabase, application.id, schema)

  if (questionSections.length === 0) {
    redirect(`/application/${application.id}/documents`)
  }

  return (
    <div>
      <p className="text-sm font-semibold text-harbor-700">{applicationType.form_code} — {applicationType.name}</p>
      <div className="mt-6">
        <QuestionnaireWizard
          applicationId={application.id}
          sections={questionSections}
          initialAnswers={answers.rows.map((r) => ({ question_key: r.question_key, repeater_index: r.repeater_index, value: r.value }))}
          finishHref={`/application/${application.id}/documents`}
          title="Application questionnaire"
        />
      </div>
    </div>
  )
}

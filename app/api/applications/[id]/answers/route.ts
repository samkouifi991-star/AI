import { NextResponse } from 'next/server'
import { getAccessibleApplication, recalculateProgress, AccessDeniedError } from '@/lib/applications'
import { saveAnswersBatchSchema } from '@/lib/validation-schemas'
import { rateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { getFullSchema, getAnswersBundle } from '@/lib/engine/schema'
import { syncDocumentChecklist } from '@/lib/engine/documents'

// Autosave endpoint — called on every field blur / card selection from the
// questionnaire. Accepts one or many answers in a single request so a
// repeatable group (e.g. a full address) can save atomically.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const rl = await rateLimit(clientKeyFromRequest(request, 'answers'), 120, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = saveAnswersBatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const { application, supabase } = await getAccessibleApplication(params.id)

    const rows = parsed.data.answers.map((a) => ({
      application_id: application.id,
      question_key: a.questionKey,
      repeater_index: a.repeaterIndex,
      value: a.value ?? null,
    }))

    const { error: upsertErr } = await supabase
      .from('answers')
      .upsert(rows, { onConflict: 'application_id,question_key,repeater_index' })
    if (upsertErr) throw upsertErr

    const progressPercent = await recalculateProgress(supabase, application.id)

    const schema = await getFullSchema(supabase, application.application_type_id)
    const answers = await getAnswersBundle(supabase, application.id, schema)
    await syncDocumentChecklist(supabase, application.id, application.application_type_id, answers.flat)

    return NextResponse.json({ ok: true, progressPercent })
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    console.error(err)
    return NextResponse.json({ error: 'Could not save answer' }, { status: 500 })
  }
}

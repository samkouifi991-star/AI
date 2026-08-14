import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getPackageForApplication } from '@/lib/engine/translation-package'
import { getTranslationProvider } from '@/lib/translation'
import { rateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

const bodySchema = z.object({
  languageStatus: z.enum(['english', 'needs_translation', 'self_provided']),
  sourceLanguage: z.string().min(2).max(60).optional(),
})

// Answers "Is this document in English?" for one uploaded document.
//   english          -> no translation job; clears any prior one.
//   needs_translation -> creates/reuses one job, covered by the
//                        application's translation package the moment a
//                        package exists (paid or just added to checkout) —
//                        never billed per document.
//   self_provided     -> creates/reuses a job the customer fulfills
//                        themselves (see the upload route); free, no
//                        package required.
export async function POST(request: Request, { params }: { params: { id: string; docId: string } }) {
  const rl = await rateLimit(clientKeyFromRequest(request, 'language-status'), 60, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    throw err
  }
  const { application, supabase } = accessible

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { languageStatus, sourceLanguage } = parsed.data
  if (languageStatus !== 'english' && !sourceLanguage) {
    return NextResponse.json({ error: 'sourceLanguage is required' }, { status: 400 })
  }

  const { data: docRow, error: docErr } = await supabase
    .from('application_documents')
    .select('*, document_requirements(label)')
    .eq('id', params.docId)
    .eq('application_id', application.id)
    .single()
  if (docErr || !docRow) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  if (languageStatus === 'english') {
    await supabase
      .from('application_documents')
      .update({ needs_translation: false, translation_id: null })
      .eq('id', docRow.id)
    if (docRow.translation_id) {
      await supabase.from('translations').delete().eq('id', docRow.translation_id)
    }
    return NextResponse.json({ ok: true })
  }

  const selfProvided = languageStatus === 'self_provided'
  const pkg = selfProvided ? null : await getPackageForApplication(supabase, application.id)
  const label = (docRow as any).document_requirements?.label ?? docRow.custom_label ?? 'Document'

  let translationId = docRow.translation_id as string | null
  if (translationId) {
    const { error: updateErr } = await supabase
      .from('translations')
      .update({
        source_language: sourceLanguage,
        self_provided: selfProvided,
        translation_package_id: selfProvided ? null : pkg?.id ?? null,
        status: selfProvided ? 'awaiting_upload' : pkg ? 'submitted' : 'required',
      })
      .eq('id', translationId)
    if (updateErr) throw updateErr
  } else {
    const { data: job, error: insertErr } = await supabase
      .from('translations')
      .insert({
        application_document_id: docRow.id,
        application_id: application.id,
        document_label: label,
        source_language: sourceLanguage,
        self_provided: selfProvided,
        translation_package_id: selfProvided ? null : pkg?.id ?? null,
        status: selfProvided ? 'awaiting_upload' : pkg ? 'submitted' : 'required',
        provider_name: selfProvided ? null : getTranslationProvider().name,
      })
      .select('id')
      .single()
    if (insertErr) throw insertErr
    translationId = job.id
  }

  await supabase
    .from('application_documents')
    .update({ needs_translation: true, translation_id: translationId })
    .eq('id', docRow.id)

  await logAudit({
    actorId: application.user_id,
    action: 'document.language_status_set',
    entityType: 'application_document',
    entityId: docRow.id,
    metadata: { languageStatus, sourceLanguage },
  })

  return NextResponse.json({ ok: true, translationId, coveredByPackage: Boolean(pkg) })
}

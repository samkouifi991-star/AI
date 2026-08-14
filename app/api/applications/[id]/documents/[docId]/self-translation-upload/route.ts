import { NextResponse } from 'next/server'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { documentStoragePath, uploadToBucket, DOCUMENTS_BUCKET } from '@/lib/storage'
import { rateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MAX_BYTES = 25 * 1024 * 1024

// A customer who already has their own English translation uploads it
// (plus, where applicable, the translator's certification) directly — no
// package, no charge. This is the fulfillment side of the "I already have
// an English translation" language-status option.
export async function POST(request: Request, { params }: { params: { id: string; docId: string } }) {
  const rl = await rateLimit(clientKeyFromRequest(request, 'self-translation-upload'), 30, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many uploads — try again shortly.' }, { status: 429 })

  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    throw err
  }
  const { application, supabase } = accessible

  const { data: docRow, error: docErr } = await supabase
    .from('application_documents')
    .select('id, translation_id')
    .eq('id', params.docId)
    .eq('application_id', application.id)
    .single()
  if (docErr || !docRow || !docRow.translation_id) {
    return NextResponse.json({ error: 'Mark this document as needing translation first.' }, { status: 400 })
  }

  const { data: job, error: jobErr } = await supabase
    .from('translations')
    .select('id, self_provided')
    .eq('id', docRow.translation_id)
    .single()
  if (jobErr || !job || !job.self_provided) {
    return NextResponse.json({ error: 'This document is not set up for a self-provided translation.' }, { status: 400 })
  }

  const formData = await request.formData()
  const translatedFile = formData.get('translatedFile')
  const certificationFile = formData.get('certificationFile')
  if (!(translatedFile instanceof File) || !ALLOWED_TYPES.has(translatedFile.type) || translatedFile.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Upload a PDF, JPG, or PNG under 25MB for the translation.' }, { status: 400 })
  }

  const updates: Record<string, string> = { status: 'completed' }
  const translatedPath = documentStoragePath(application.id, `selftranslation-${job.id}`, translatedFile.name)
  await uploadToBucket(DOCUMENTS_BUCKET, translatedPath, await translatedFile.arrayBuffer(), translatedFile.type)
  updates.translated_storage_path = translatedPath

  if (certificationFile instanceof File && ALLOWED_TYPES.has(certificationFile.type) && certificationFile.size <= MAX_BYTES) {
    const certPath = documentStoragePath(application.id, `selfcertification-${job.id}`, certificationFile.name)
    await uploadToBucket(DOCUMENTS_BUCKET, certPath, await certificationFile.arrayBuffer(), certificationFile.type)
    updates.certification_storage_path = certPath
  }

  const { error: updateErr } = await supabase.from('translations').update(updates).eq('id', job.id)
  if (updateErr) throw updateErr

  await logAudit({
    actorId: application.user_id,
    action: 'translation.self_provided_uploaded',
    entityType: 'translation',
    entityId: job.id,
  })

  return NextResponse.json({ ok: true })
}

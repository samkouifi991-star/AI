import { NextResponse } from 'next/server'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { documentStoragePath, uploadToBucket, DOCUMENTS_BUCKET } from '@/lib/storage'
import { rateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MAX_BYTES = 25 * 1024 * 1024

export async function POST(request: Request, { params }: { params: { id: string; docId: string } }) {
  const rl = await rateLimit(clientKeyFromRequest(request, 'upload'), 30, 60)
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
    .select('*')
    .eq('id', params.docId)
    .eq('application_id', application.id)
    .single()
  if (docErr || !docRow) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Only PDF, JPG, and PNG files are accepted.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (25MB max).' }, { status: 400 })
  }

  const path = documentStoragePath(application.id, docRow.id, file.name)
  const buffer = await file.arrayBuffer()
  await uploadToBucket(DOCUMENTS_BUCKET, path, buffer, file.type)

  const { error: updateErr } = await supabase
    .from('application_documents')
    .update({
      status: 'uploaded',
      storage_path: path,
      original_filename: file.name,
      uploaded_at: new Date().toISOString(),
    })
    .eq('id', docRow.id)
  if (updateErr) throw updateErr

  await logAudit({
    actorId: application.user_id,
    action: 'document.uploaded',
    entityType: 'application_document',
    entityId: docRow.id,
    metadata: { filename: file.name, applicationId: application.id },
  })

  return NextResponse.json({ ok: true })
}

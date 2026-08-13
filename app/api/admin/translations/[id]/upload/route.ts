import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/admin'
import { documentStoragePath, uploadToBucket, DOCUMENTS_BUCKET } from '@/lib/storage'
import { logAudit } from '@/lib/audit'
import { sendTranslationReadyEmail } from '@/lib/email'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireStaff()

  const { data: translation, error } = await supabase
    .from('translations')
    .select('*, application_documents!inner(application_id)')
    .eq('id', params.id)
    .single()
  if (error || !translation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const applicationId = translation.application_documents.application_id

  const formData = await request.formData()
  const translatedFile = formData.get('translatedFile')
  const certificationFile = formData.get('certificationFile')

  const updates: Record<string, string> = {}

  if (translatedFile instanceof File) {
    const path = documentStoragePath(applicationId, `translation-${params.id}`, translatedFile.name)
    await uploadToBucket(DOCUMENTS_BUCKET, path, await translatedFile.arrayBuffer(), translatedFile.type || 'application/pdf')
    updates.translated_storage_path = path
  }
  if (certificationFile instanceof File) {
    const path = documentStoragePath(applicationId, `certification-${params.id}`, certificationFile.name)
    await uploadToBucket(DOCUMENTS_BUCKET, path, await certificationFile.arrayBuffer(), certificationFile.type || 'application/pdf')
    updates.certification_storage_path = path
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  if (updates.translated_storage_path) updates.status = 'completed'

  const { error: updateErr } = await supabase.from('translations').update(updates).eq('id', params.id)
  if (updateErr) throw updateErr

  await logAudit({ actorId: user.id, action: 'admin.translation.files_uploaded', entityType: 'translation', entityId: params.id })

  if (updates.status === 'completed') {
    const { data: application } = await supabase.from('applications').select('user_id').eq('id', applicationId).single()
    const { data: profile } = application?.user_id
      ? await supabase.from('profiles').select('email').eq('id', application.user_id).single()
      : { data: null }
    if (profile?.email) {
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
      await sendTranslationReadyEmail(profile.email, `${origin}/application/${applicationId}/documents`)
    }
  }

  return NextResponse.json({ ok: true })
}

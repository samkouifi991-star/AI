import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/admin'
import { getSignedUrl, DOCUMENTS_BUCKET } from '@/lib/storage'

// Staff-only signed URLs for the three files that can exist on a
// translation job: the customer's original upload, the delivered
// translation, and its certification.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  await requireStaff()
  const type = new URL(request.url).searchParams.get('type')
  if (!type || !['original', 'translated', 'certification'].includes(type)) {
    return NextResponse.json({ error: 'type must be original, translated, or certification' }, { status: 400 })
  }

  const admin = (await import('@/lib/supabase/admin')).createAdminClient()

  const { data: job, error } = await admin
    .from('translations')
    .select('application_document_id, translated_storage_path, certification_storage_path')
    .eq('id', params.id)
    .single()
  if (error || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let path: string | null = null
  if (type === 'translated') path = job.translated_storage_path
  if (type === 'certification') path = job.certification_storage_path
  if (type === 'original') {
    const { data: doc } = await admin
      .from('application_documents')
      .select('storage_path')
      .eq('id', job.application_document_id)
      .single()
    path = doc?.storage_path ?? null
  }

  if (!path) return NextResponse.json({ error: 'No file uploaded' }, { status: 404 })
  const url = await getSignedUrl(DOCUMENTS_BUCKET, path, 300)
  return NextResponse.json({ url })
}

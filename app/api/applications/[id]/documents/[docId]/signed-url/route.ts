import { NextResponse } from 'next/server'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getSignedUrl, DOCUMENTS_BUCKET } from '@/lib/storage'

export async function GET(request: Request, { params }: { params: { id: string; docId: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    throw err
  }
  const { application, supabase } = accessible

  const { data: docRow, error } = await supabase
    .from('application_documents')
    .select('storage_path')
    .eq('id', params.docId)
    .eq('application_id', application.id)
    .single()

  if (error || !docRow?.storage_path) return NextResponse.json({ error: 'No file uploaded' }, { status: 404 })

  const url = await getSignedUrl(DOCUMENTS_BUCKET, docRow.storage_path, 300)
  return NextResponse.json({ url })
}

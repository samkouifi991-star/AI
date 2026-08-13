import { NextResponse } from 'next/server'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { getSignedUrl, PACKAGES_BUCKET } from '@/lib/storage'

const FIELD_BY_FILE: Record<string, string> = {
  forms: 'forms_storage_path',
  instructions: 'instructions_storage_path',
  checklist: 'checklist_storage_path',
  cover: 'cover_sheet_storage_path',
  bundle: 'bundle_storage_path',
}

export async function GET(request: Request, { params }: { params: { id: string; file: string } }) {
  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    throw err
  }
  const { application, supabase } = accessible

  const field = FIELD_BY_FILE[params.file]
  if (!field) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })

  const { data: pkg, error } = await supabase
    .from('generated_packages')
    .select(field)
    .eq('application_id', application.id)
    .single()
  // @ts-expect-error — dynamic column select
  const path = pkg?.[field] as string | undefined
  if (error || !path) return NextResponse.json({ error: 'Not available yet' }, { status: 404 })

  const url = await getSignedUrl(PACKAGES_BUCKET, path, 300)
  return NextResponse.json({ url })
}

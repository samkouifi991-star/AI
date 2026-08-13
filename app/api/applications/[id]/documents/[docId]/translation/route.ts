import { NextResponse } from 'next/server'
import { getAccessibleApplication, AccessDeniedError } from '@/lib/applications'
import { translationRequestSchema } from '@/lib/validation-schemas'
import { getTranslationProvider } from '@/lib/translation'
import { logAudit } from '@/lib/audit'
import { rateLimit, clientKeyFromRequest } from '@/lib/rate-limit'

export async function POST(request: Request, { params }: { params: { id: string; docId: string } }) {
  const rl = await rateLimit(clientKeyFromRequest(request, 'translation-request'), 20, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let accessible
  try {
    accessible = await getAccessibleApplication(params.id)
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    throw err
  }
  const { application, supabase } = accessible

  const body = await request.json().catch(() => null)
  const parsed = translationRequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { data: docRow, error: docErr } = await supabase
    .from('application_documents')
    .select('id, storage_path')
    .eq('id', params.docId)
    .eq('application_id', application.id)
    .single()
  if (docErr || !docRow) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (!docRow.storage_path) return NextResponse.json({ error: 'Upload the document before requesting a translation.' }, { status: 400 })

  const { data: pricingRow } = await supabase.from('translation_pricing').select('*').limit(1).single()
  const pricing = pricingRow ?? { per_page_cents: 2495, rush_surcharge_cents: 1500 }

  const provider = getTranslationProvider()
  const quote = provider.quote({ sourceLanguage: parsed.data.sourceLanguage, pageCount: parsed.data.pageCount }, pricing)

  const { data: translation, error: insertErr } = await supabase
    .from('translations')
    .insert({
      application_document_id: docRow.id,
      source_language: parsed.data.sourceLanguage,
      page_count: parsed.data.pageCount,
      price_cents: quote.priceCents,
      status: 'requested',
      provider_name: provider.name,
    })
    .select()
    .single()
  if (insertErr) throw insertErr

  await supabase
    .from('application_documents')
    .update({ needs_translation: true, translation_id: translation.id })
    .eq('id', docRow.id)

  await logAudit({
    actorId: application.user_id,
    action: 'translation.requested',
    entityType: 'translation',
    entityId: translation.id,
    metadata: { applicationId: application.id, priceCents: quote.priceCents },
  })

  return NextResponse.json({ translation })
}

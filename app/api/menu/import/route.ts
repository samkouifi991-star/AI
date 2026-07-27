import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import {
  extractFromUrl,
  extractFromPdf,
  extractFromDocx,
  extractFromCsv,
  extractMenuFromText,
  extractMenuFromImage
} from '@/lib/menu-import';
import { logger } from '@/lib/logger';

/**
 * POST /api/menu/import
 * Body: { businessId, sourceType: 'url'|'pdf'|'image'|'docx'|'csv', sourceRef }
 *   - sourceType 'url': sourceRef is the restaurant's website URL.
 *   - all other types: sourceRef is a Supabase Storage path for a file the
 *     owner already uploaded (same upload-then-ingest pattern as the
 *     Knowledge Base page).
 *
 * Runs real extraction (fetches the URL, or parses the uploaded
 * PDF/DOCX/CSV/image), then a structured OpenAI extraction pass, and
 * stores the result in menu_import_jobs.extracted_json — for the owner to
 * review, correct, and publish. Nothing is written to the live menu until
 * /api/menu/publish is called.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { businessId, sourceType, sourceRef } = await req.json();

  if (!businessId || !sourceType || !sourceRef) {
    return NextResponse.json({ error: 'businessId, sourceType, and sourceRef are required' }, { status: 400 });
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_user_id')
    .eq('id', businessId)
    .single();
  if (!business || business.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: job, error: jobError } = await supabase
    .from('menu_import_jobs')
    .insert({ business_id: businessId, source_type: sourceType, source_ref: sourceRef, status: 'processing' })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message ?? 'could not create import job' }, { status: 500 });
  }

  try {
    let categories;

    if (sourceType === 'url') {
      const text = await extractFromUrl(sourceRef);
      categories = await extractMenuFromText(text);
    } else if (sourceType === 'image') {
      const { data: file, error: dlError } = await supabase.storage.from('menu-uploads').download(sourceRef);
      if (dlError || !file) throw new Error('Could not download uploaded image');
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || 'image/jpeg';
      categories = await extractMenuFromImage(buffer.toString('base64'), mimeType);
    } else {
      const { data: file, error: dlError } = await supabase.storage.from('menu-uploads').download(sourceRef);
      if (dlError || !file) throw new Error('Could not download uploaded file');
      const buffer = Buffer.from(await file.arrayBuffer());

      let text: string;
      if (sourceType === 'pdf') text = await extractFromPdf(buffer);
      else if (sourceType === 'docx') text = await extractFromDocx(buffer);
      else if (sourceType === 'csv') text = extractFromCsv(buffer.toString('utf-8'));
      else throw new Error(`Unsupported sourceType: ${sourceType}`);

      categories = await extractMenuFromText(text);
    }

    await supabase
      .from('menu_import_jobs')
      .update({ status: 'ready_for_review', extracted_json: { categories } })
      .eq('id', job.id);

    return NextResponse.json({ jobId: job.id, categories });
  } catch (err: any) {
    logger.error('menu_import_failed', { businessId, sourceType, message: err.message });
    await supabase
      .from('menu_import_jobs')
      .update({ status: 'failed', error_message: err.message })
      .eq('id', job.id);
    return NextResponse.json({ error: `Import failed: ${err.message}` }, { status: 502 });
  }
}

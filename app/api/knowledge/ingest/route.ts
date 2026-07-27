import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { chunkText, embedBatch } from '@/lib/openai';

/**
 * Called after a business owner uploads a document (price sheet, policy,
 * service list) in the Knowledge Base page. Expects the file already
 * uploaded to Supabase Storage; this route reads it, chunks it, embeds it,
 * and stores the chunks for RAG retrieval during calls.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { documentId } = await req.json();

  const { data: doc, error: docError } = await supabase
    .from('knowledge_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: 'document not found' }, { status: 404 });
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from('knowledge-documents')
    .download(doc.storage_path);

  if (downloadError || !file) {
    await supabase.from('knowledge_documents').update({ status: 'failed' }).eq('id', documentId);
    return NextResponse.json({ error: 'could not download file' }, { status: 500 });
  }

  // NOTE: for PDFs, pipe `file` through a PDF text extractor here
  // (e.g. pdf-parse) before chunking. Plain text/markdown files can be
  // read directly.
  const rawText = await file.text();
  const chunks = chunkText(rawText);
  const embeddings = await embedBatch(chunks);

  const rows = chunks.map((content, i) => ({
    business_id: doc.business_id,
    document_id: doc.id,
    content,
    embedding: embeddings[i]
  }));

  const { error: insertError } = await supabase.from('knowledge_chunks').insert(rows);

  if (insertError) {
    await supabase.from('knowledge_documents').update({ status: 'failed' }).eq('id', documentId);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase.from('knowledge_documents').update({ status: 'ready' }).eq('id', documentId);

  return NextResponse.json({ ok: true, chunks: rows.length });
}

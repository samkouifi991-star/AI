import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { embedText } from '@/lib/openai';

/**
 * Handles every /teach action on a knowledge_gaps row: answering it (which
 * also teaches Ava the answer for future calls, by embedding it into
 * knowledge_chunks), editing a previous answer, dismissing it, or marking
 * it irrelevant. RLS (is_business_owner) is the actual authorization
 * boundary here — this route just uses the caller's own session, never
 * the service-role client, so it can never touch another business's gap.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { gapId, action, answer } = await req.json();
  if (!gapId || !action) {
    return NextResponse.json({ error: 'gapId and action are required' }, { status: 400 });
  }

  const { data: gap, error: gapError } = await supabase.from('knowledge_gaps').select('*').eq('id', gapId).single();
  if (gapError || !gap) return NextResponse.json({ error: 'Knowledge gap not found' }, { status: 404 });

  if (action === 'dismiss' || action === 'irrelevant') {
    const { error } = await supabase
      .from('knowledge_gaps')
      .update({ status: action === 'dismiss' ? 'dismissed' : 'irrelevant', resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('id', gapId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'answer' || action === 'edit') {
    const trimmedAnswer = String(answer ?? '').trim();
    if (!trimmedAnswer) return NextResponse.json({ error: 'answer text is required' }, { status: 400 });

    const embedding = await embedText(`${gap.question}\n\n${trimmedAnswer}`);

    // Reuse (or create) a single synthetic document to hold every answer
    // taught through /teach, so the Knowledge Base page's document list
    // shows one clear "Answers from Teach Ava" source rather than a
    // separate document per answer.
    let { data: teachDoc } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('business_id', gap.business_id)
      .eq('doc_type', 'teach_ava_answers')
      .maybeSingle();

    if (!teachDoc) {
      const { data: created, error: createDocError } = await supabase
        .from('knowledge_documents')
        .insert({
          business_id: gap.business_id,
          file_name: 'Answers from Teach Ava',
          storage_path: '',
          doc_type: 'teach_ava_answers',
          status: 'ready'
        })
        .select('id')
        .single();
      if (createDocError || !created) return NextResponse.json({ error: 'Could not create knowledge source' }, { status: 500 });
      teachDoc = created;
    }

    const { data: existingChunk } = await supabase
      .from('knowledge_chunks')
      .select('id')
      .eq('source_gap_id', gapId)
      .maybeSingle();

    const chunkContent = `Q: ${gap.question}\nA: ${trimmedAnswer}`;

    if (existingChunk) {
      const { error: updateChunkError } = await supabase
        .from('knowledge_chunks')
        .update({ content: chunkContent, embedding })
        .eq('id', existingChunk.id);
      if (updateChunkError) return NextResponse.json({ error: updateChunkError.message }, { status: 500 });
    } else {
      const { error: insertChunkError } = await supabase.from('knowledge_chunks').insert({
        business_id: gap.business_id,
        document_id: teachDoc.id,
        source_gap_id: gapId,
        content: chunkContent,
        embedding
      });
      if (insertChunkError) return NextResponse.json({ error: insertChunkError.message }, { status: 500 });
    }

    const { error: gapUpdateError } = await supabase
      .from('knowledge_gaps')
      .update({ answer: trimmedAnswer, status: 'answered', resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('id', gapId);
    if (gapUpdateError) return NextResponse.json({ error: gapUpdateError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

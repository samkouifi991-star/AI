import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { embedText } from '@/lib/openai';
import { suggestGapAnswer } from '@/lib/teach-suggestions';

/**
 * POST { gapId } — drafts a suggested answer for the owner to review.
 * Never writes anything; approving/saving still goes through the existing
 * /api/teach 'answer' action, unchanged, so a suggestion carries no more
 * authority than anything the owner typed themselves.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { gapId } = await req.json();
  if (!gapId) return NextResponse.json({ error: 'gapId is required' }, { status: 400 });

  const { data: gap, error: gapError } = await supabase.from('knowledge_gaps').select('*').eq('id', gapId).single();
  if (gapError || !gap) return NextResponse.json({ error: 'Knowledge gap not found' }, { status: 404 });

  const { data: business } = await supabase.from('businesses').select('name, business_type').eq('id', gap.business_id).single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  // Re-run the same real vector search the live call used, so the
  // suggestion is grounded in the business's actual knowledge base, not
  // a stale snapshot from when the gap was first logged.
  let contextChunks: string[] = [];
  try {
    const queryEmbedding = await embedText(gap.question);
    const { data: matches } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: queryEmbedding,
      match_business_id: gap.business_id,
      match_count: 5
    });
    contextChunks = (matches ?? []).map((m: { content: string }) => m.content);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Could not search the knowledge base' }, { status: 502 });
  }

  try {
    const { suggestion, basedOnContext } = await suggestGapAnswer({
      businessName: business.name,
      businessType: business.business_type ?? 'business',
      question: gap.question,
      contextChunks
    });
    return NextResponse.json({ suggestion, basedOnContext });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Could not generate a suggestion' }, { status: 502 });
  }
}

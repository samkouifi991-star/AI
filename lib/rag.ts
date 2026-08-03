import { supabaseServiceRole } from './supabase/admin';
import { embedText, answerFromKnowledge } from './openai';
import { recordKnowledgeGap } from './knowledge-gaps';

type RetrieveOptions = {
  callId?: string | null;
  source?: 'live' | 'practice';
  practiceSessionId?: string | null;
  topK?: number;
};

const NO_KNOWLEDGE_FALLBACK =
  "I don't have that information on hand — I can have someone from the team follow up with you.";

/**
 * Retrieves the most relevant knowledge-base chunks for a business and
 * returns a grounded answer. Used by the Vapi webhook's
 * `get_business_knowledge` function during a live call (and by
 * lib/ava-dispatcher.ts in practice mode).
 *
 * Whenever Ava genuinely doesn't have an answer — no matching chunks, or
 * the model itself reports it's not confident the context answers the
 * question — the question is logged to knowledge_gaps for later review in
 * /teach, unless it's actually a request to speak with a human.
 */
export async function retrieveAndAnswer(businessId: string, question: string, opts: RetrieveOptions = {}) {
  const supabase = supabaseServiceRole();
  const queryEmbedding = await embedText(question);

  // pgvector cosine-distance search, scoped to this business only.
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: queryEmbedding,
    match_business_id: businessId,
    match_count: opts.topK ?? 5
  });

  if (error) throw new Error(`RAG lookup failed: ${error.message}`);

  const rows = (data ?? []) as { content: string; similarity: number }[];
  const chunks = rows.map((row) => row.content);
  const topSimilarity = rows[0]?.similarity ?? null;

  if (chunks.length === 0) {
    await recordKnowledgeGap({
      businessId,
      question,
      callId: opts.callId,
      source: opts.source,
      practiceSessionId: opts.practiceSessionId,
      reason: 'no_match'
    });
    return { answer: NO_KNOWLEDGE_FALLBACK, sources: [] as string[], confident: false };
  }

  const { answer, confident } = await answerFromKnowledge(question, chunks);

  if (!confident) {
    await recordKnowledgeGap({
      businessId,
      question,
      callId: opts.callId,
      source: opts.source,
      practiceSessionId: opts.practiceSessionId,
      reason: 'low_confidence',
      confidenceScore: topSimilarity
    });
  }

  return { answer, sources: chunks, confident };
}

/*
 * Matching SQL function (add to a migration):
 *
 * create or replace function match_knowledge_chunks(
 *   query_embedding vector(1536),
 *   match_business_id uuid,
 *   match_count int default 5
 * ) returns table (id uuid, content text, similarity float)
 * language sql stable as $$
 *   select id, content, 1 - (embedding <=> query_embedding) as similarity
 *   from knowledge_chunks
 *   where business_id = match_business_id
 *   order by embedding <=> query_embedding
 *   limit match_count;
 * $$;
 */

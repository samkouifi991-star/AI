import { supabaseServiceRole } from './supabase/admin';
import { embedText, answerFromKnowledge } from './openai';

/**
 * Retrieves the most relevant knowledge-base chunks for a business and
 * returns a grounded answer. Used by the Vapi webhook's
 * `get_business_knowledge` function during a live call.
 */
export async function retrieveAndAnswer(businessId: string, question: string, topK = 5) {
  const supabase = supabaseServiceRole();
  const queryEmbedding = await embedText(question);

  // pgvector cosine-distance search, scoped to this business only.
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: queryEmbedding,
    match_business_id: businessId,
    match_count: topK
  });

  if (error) throw new Error(`RAG lookup failed: ${error.message}`);

  const chunks = (data ?? []).map((row: { content: string }) => row.content);
  if (chunks.length === 0) {
    return {
      answer:
        "I don't have that information on hand — I can have someone from the team follow up with you.",
      sources: []
    };
  }

  const answer = await answerFromKnowledge(question, chunks);
  return { answer, sources: chunks };
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

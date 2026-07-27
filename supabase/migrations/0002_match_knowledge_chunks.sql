-- RPC used by lib/rag.ts for scoped vector similarity search.
-- security definer so the service-role webhook can call it directly;
-- it still filters by match_business_id, so no cross-tenant leakage.

create or replace function match_knowledge_chunks(
  query_embedding vector(1536),
  match_business_id uuid,
  match_count int default 5
) returns table (id uuid, content text, similarity float)
language sql stable
security definer
set search_path = public
as $$
  select id, content, 1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where business_id = match_business_id
  order by embedding <=> query_embedding
  limit match_count;
$$;

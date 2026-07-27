-- Links a knowledge_chunks row back to the knowledge_gaps answer it came
-- from, so /teach's "edit" action can update the existing chunk (and its
-- embedding) in place instead of creating a duplicate every time an owner
-- refines an answer.

alter table knowledge_chunks add column if not exists source_gap_id uuid references knowledge_gaps(id) on delete set null;

create index if not exists knowledge_chunks_source_gap_idx on knowledge_chunks (source_gap_id) where source_gap_id is not null;

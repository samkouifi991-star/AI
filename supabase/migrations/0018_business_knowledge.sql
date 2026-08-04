-- Backs the consolidated "Teach Ava about the business" surface shared
-- between onboarding and the permanent /teach page: a real business
-- description/location/policies text an owner can set, plus a link from
-- knowledge_chunks back to the FAQ row that produced it (mirrors
-- source_gap_id from migration 0012) so an FAQ edit updates its chunk in
-- place instead of duplicating it.

alter table businesses add column if not exists description text;
alter table businesses add column if not exists address text;
alter table businesses add column if not exists policies_text text;

alter table knowledge_chunks add column if not exists source_faq_id uuid references faqs(id) on delete set null;
create index if not exists knowledge_chunks_source_faq_idx on knowledge_chunks (source_faq_id) where source_faq_id is not null;

-- Real, persisted website-import status — until now /api/knowledge/import-website
-- only returned pagesFetched/error in the HTTP response, so a page reload
-- lost it. The shared WebsiteImportPanel component needs both to survive
-- a reload, matching "see processing status, pages imported, failures".
alter table knowledge_documents add column if not exists error_message text;
alter table knowledge_documents add column if not exists pages_imported int;

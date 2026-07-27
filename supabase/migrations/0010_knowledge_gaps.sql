-- Unanswered-question tracking ("Teach Ava"). Every time Ava genuinely has
-- no knowledge-base answer for a caller's question, a row lands here so
-- the business owner can review and answer it later — instead of Ava
-- guessing, or the gap just disappearing when the call ends.
--
-- Deliberately NOT populated for "let me talk to a person" requests — that
-- is transfer_call, a normal request, not a knowledge gap. Only questions
-- get_business_knowledge could not answer land here (see lib/rag.ts).

create table knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  call_id uuid references calls(id) on delete set null,

  source text not null default 'live' check (source in ('live', 'practice')),

  -- The caller's question, redacted before storage if it looks like it
  -- contains card numbers, passwords, or other sensitive data (see
  -- lib/redact.ts) — 'redacted' records that redaction actually ran, so a
  -- gap is never silently un-redacted by a later code path.
  question text not null,
  redacted boolean not null default false,

  status text not null default 'open' check (status in ('open', 'answered', 'dismissed', 'irrelevant')),
  answer text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,

  created_at timestamptz default now()
);

create index knowledge_gaps_business_idx on knowledge_gaps (business_id, status, created_at desc);

alter table knowledge_gaps enable row level security;
create policy "tenant isolation" on knowledge_gaps for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- =========================================================
-- Generic webhook idempotency
-- =========================================================
-- Vapi (like most webhook senders) can redeliver the same event more than
-- once (timeouts, retries). event_hash is a hash of the raw request body;
-- the webhook handler inserts before processing and, on a conflict, replays
-- the stored response instead of re-running side effects (double-charging,
-- double-logging a knowledge gap, double-inserting a call row, etc.).

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_hash text not null unique,
  event_type text,
  business_id uuid references businesses(id) on delete cascade,
  response_json jsonb,
  created_at timestamptz default now()
);

create index webhook_events_business_idx on webhook_events (business_id, created_at desc);

alter table webhook_events enable row level security;
create policy "tenant isolation" on webhook_events for all
  using (business_id is not null and is_business_owner(business_id))
  with check (business_id is not null and is_business_owner(business_id));

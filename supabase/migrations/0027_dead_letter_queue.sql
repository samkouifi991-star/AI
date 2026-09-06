-- Reliability Phase 0, item 12 — a Postgres-backed outbox/dead-letter
-- queue so a failed asynchronous side effect (an SMS that didn't send, a
-- provider config that didn't fully sync, an embedding that didn't
-- complete) doesn't just disappear once whatever request triggered it
-- has already returned. No external queue needed at this scale — a
-- table with a due-time index and a periodic drain job is enough.

create table failed_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  business_id uuid references businesses(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  error_message text,

  attempt_count int not null default 0,
  next_retry_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'retrying', 'dead', 'resolved')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The drain job's only query: "what's due right now" — this index makes
-- that a fast index scan regardless of how many resolved/dead rows pile
-- up in the table over time.
create index failed_events_due_idx on failed_events (next_retry_at) where status = 'pending';
create index failed_events_business_idx on failed_events (business_id, created_at desc);

alter table failed_events enable row level security;
create policy "tenant isolation" on failed_events for all
  using (business_id is null or is_business_owner(business_id))
  with check (business_id is null or is_business_owner(business_id));

-- Atomically claims up to p_limit due events by flipping them to
-- 'retrying' and returning the claimed rows in one statement — two
-- concurrent drain invocations (e.g. a slow-running cron overlapping the
-- next tick) can't both claim and process the same row.
create or replace function claim_due_failed_events(p_limit int) returns setof failed_events language sql as $$
  update failed_events
  set status = 'retrying', updated_at = now()
  where id in (
    select id from failed_events
    where status = 'pending' and next_retry_at <= now()
    order by next_retry_at
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

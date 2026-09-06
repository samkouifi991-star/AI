-- Reliability Phase 0, item 11 — when a customer-facing action can't be
-- safely confirmed (an order, a booking, a payment link, a transfer),
-- the failure must be reviewable, not just swallowed into a spoken
-- apology. One row per such incident, independent of whatever ad-hoc
-- logger.error() calls already exist for developer-facing debugging —
-- this is the business-facing "what went wrong on my calls" record.

create table incidents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  call_id uuid references calls(id) on delete set null,
  practice_session_id uuid references practice_sessions(id) on delete set null,

  action_attempted text not null,
  error_detail text,

  resolution text not null default 'none' check (resolution in (
    'none', 'transferred', 'callback_offered', 'retried_and_recovered'
  )),

  created_at timestamptz not null default now()
);

create index incidents_business_idx on incidents (business_id, created_at desc);

alter table incidents enable row level security;
create policy "tenant isolation" on incidents for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- Written by the webhook/practice routes using the service-role client
-- (bypasses RLS by design, same pattern as calls/orders/appointments).

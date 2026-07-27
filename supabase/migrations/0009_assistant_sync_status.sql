-- Tracks the real outcome of every attempt to push settings to a Vapi
-- assistant, including a genuine read-back verification: after PATCHing
-- Vapi, we GET the assistant back and compare what we asked for against
-- what Vapi actually applied, field by field. An HTTP 200 from the PATCH
-- call is never treated as proof the settings took effect — this table is
-- what that verification actually looks like, and 'partial' is a real,
-- distinct outcome from 'synced', not just an error swallowed into a bool.

create table assistant_sync_status (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  vapi_assistant_id text,

  requested_at timestamptz not null default now(),
  completed_at timestamptz,

  status text not null default 'pending' check (status in ('pending', 'synced', 'partial', 'failed')),

  -- What we intended to set, what Vapi's GET actually returned afterward,
  -- and a field-by-field diff: { field: { expected, applied, match } }.
  -- Never used to fabricate success — 'field_results' is only populated
  -- from a real GET response, never assumed from the PATCH's 200 alone.
  expected_config jsonb not null default '{}'::jsonb,
  applied_config jsonb,
  field_results jsonb,

  error_message text,

  created_at timestamptz default now()
);

create index assistant_sync_status_business_idx on assistant_sync_status (business_id, requested_at desc);

alter table assistant_sync_status enable row level security;
create policy "tenant isolation" on assistant_sync_status for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

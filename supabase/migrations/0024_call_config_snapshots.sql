-- Reliability Phase 0, item 7 — an immutable configuration snapshot taken
-- once, at the start of a call (or practice session), so that call keeps
-- using the settings it started with even if the owner changes something
-- in the dashboard while the call is still in progress. New calls pick up
-- new settings; a call already underway never has its rules change out
-- from under it mid-conversation.
--
-- Keyed by the provider's own call id (Vapi's call.id), not our internal
-- calls.id — a `calls` row for a live call frequently doesn't exist yet
-- by the time the first tool call happens (it's only guaranteed to exist
-- once the end-of-call report lands), so the snapshot can't depend on it.
-- Practice sessions use practice_sessions.id instead, since there is no
-- provider call at all in that mode.

create table call_config_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,

  provider_call_id text,
  practice_session_id uuid references practice_sessions(id) on delete cascade,

  runtime text not null default 'vapi' check (runtime in ('vapi', 'direct')),
  timezone text not null,
  transfer_number text,

  -- One JSON blob rather than a wide table of typed columns — this row is
  -- read whole and never queried by individual field, and it only ever
  -- needs to be as wide as whatever lib/call-config-snapshot.ts actually
  -- captures (ai_employee_settings, business_hours, special_hours,
  -- voice_settings, restaurant_settings, menu_version).
  config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint call_config_snapshots_one_target check (
    (provider_call_id is not null and practice_session_id is null) or
    (provider_call_id is null and practice_session_id is not null)
  )
);

create unique index call_config_snapshots_provider_call_unique
  on call_config_snapshots (provider_call_id) where provider_call_id is not null;

create unique index call_config_snapshots_practice_unique
  on call_config_snapshots (practice_session_id) where practice_session_id is not null;

create index call_config_snapshots_business_idx on call_config_snapshots (business_id, created_at desc);

alter table call_config_snapshots enable row level security;
create policy "tenant isolation" on call_config_snapshots for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- Note: written by the Vapi webhook and practice-mode routes using the
-- service-role client (bypasses RLS by design, same pattern as
-- calls/orders/appointments) — RLS above governs the dashboard's
-- authenticated-user access to its own history only.

-- =========================================================
-- A genuine "menu version" needs something that actually changes when
-- the menu changes. menu_items had no such column before this migration.
-- =========================================================

alter table menu_items add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists menu_items_set_updated_at on menu_items;
create trigger menu_items_set_updated_at
  before update on menu_items
  for each row execute function set_updated_at();

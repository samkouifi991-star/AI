-- Practice mode: lets a business owner rehearse a call with Ava from the
-- dashboard (no phone, no Vapi, no real customer) while exercising the
-- exact same dispatcher logic a live call uses (see lib/ava-dispatcher.ts).
--
-- Isolation strategy: practice conversations live in their own tables
-- (practice_sessions/practice_messages) rather than the `calls` table, so
-- a practice run can never appear as a live call just by a query
-- forgetting a filter. Where the dispatcher writes to a table that IS
-- shared with live traffic (leads, appointments, orders — because the
-- point of practice is to see what Ava *would* do end-to-end), those rows
-- are tagged is_practice + practice_session_id, and every dashboard query
-- against those tables must filter is_practice = false.

create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,

  scenario_label text,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),

  started_at timestamptz default now(),
  ended_at timestamptz
);

create index practice_sessions_business_idx on practice_sessions (business_id, started_at desc);

alter table practice_sessions enable row level security;
create policy "tenant isolation" on practice_sessions for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- Full conversation trail for a practice session: both the chat turns and
-- the tool calls the dispatcher actually made (add_order_item, confirm_order,
-- etc.), including what it would have done for suppressed real-world side
-- effects (SMS, Stripe, calendar) — this is the "safe action trail".
create table practice_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,

  role text not null check (role in ('customer', 'assistant', 'tool')),
  content text,

  tool_name text,
  tool_params jsonb,
  tool_result jsonb,
  suppressed_action text, -- e.g. "would have texted payment link to (555)..." when a real side effect was skipped

  created_at timestamptz default now()
);

create index practice_messages_session_idx on practice_messages (session_id, created_at);

alter table practice_messages enable row level security;
create policy "tenant isolation" on practice_messages for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- =========================================================
-- Tag shared tables so practice-mode writes never leak into live views
-- =========================================================

alter table leads add column if not exists is_practice boolean not null default false;
alter table leads add column if not exists practice_session_id uuid references practice_sessions(id) on delete set null;

alter table appointments add column if not exists is_practice boolean not null default false;
alter table appointments add column if not exists practice_session_id uuid references practice_sessions(id) on delete set null;

alter table orders add column if not exists is_practice boolean not null default false;
alter table orders add column if not exists practice_session_id uuid references practice_sessions(id) on delete set null;

alter table knowledge_gaps add column if not exists practice_session_id uuid references practice_sessions(id) on delete set null;

create index if not exists leads_is_practice_idx on leads (business_id, is_practice);
create index if not exists appointments_is_practice_idx on appointments (business_id, is_practice);
create index if not exists orders_is_practice_idx on orders (business_id, is_practice);

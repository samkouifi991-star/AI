-- Business Pilot AI — AI Receptionist schema
-- Multi-tenant: every table has business_id, isolated via row-level security.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- =========================================================
-- Core tenancy
-- =========================================================

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  website text,
  phone_number text,             -- business's original public number
  ai_phone_number text,          -- number provisioned via Twilio, forwards here
  timezone text default 'America/New_York',
  service_area text,
  allow_ai_estimates boolean default true,   -- false = only collect info & schedule
  onboarding_step text default 'business_info', -- tracks onboarding progress
  is_live boolean default false,             -- true once approved & test call passed
  created_at timestamptz default now()
);

create table business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6), -- 0=Sunday
  open_time time,
  close_time time,
  is_closed boolean default false
);

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  base_price numeric(10,2),
  unit text,                     -- e.g. 'per linear foot', 'per hour', 'flat'
  active boolean default true,
  created_at timestamptz default now()
);

create table faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz default now()
);

create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  name text not null,                 -- e.g. "Vinyl privacy fence, 6ft"
  rule_type text not null check (rule_type in ('per_unit','flat','tiered','multiplier')),
  unit_label text,                    -- 'linear foot', 'gate', 'hour'
  base_rate numeric(10,2),            -- price per unit or flat price
  min_price numeric(10,2),
  max_price numeric(10,2),
  modifiers jsonb default '{}'::jsonb, -- e.g. {"gate": 150, "removal_existing_fence": 3.5}
  notes text,
  created_at timestamptz default now()
);

-- =========================================================
-- Knowledge base (RAG)
-- =========================================================

create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  file_name text not null,
  storage_path text not null,     -- path in Supabase Storage bucket
  doc_type text,                  -- 'price_sheet','policy','service_list','other'
  status text default 'processing', -- processing | ready | failed
  created_at timestamptz default now()
);

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  document_id uuid references knowledge_documents(id) on delete cascade,
  content text not null,
  embedding vector(1536),         -- text-embedding-3-small
  created_at timestamptz default now()
);

create index knowledge_chunks_embedding_idx on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- =========================================================
-- Calendar
-- =========================================================

create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  provider text default 'google',
  access_token text,
  refresh_token text,
  calendar_id text,
  connected_at timestamptz default now()
);

-- =========================================================
-- Calls, leads, appointments
-- =========================================================

create table calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider_call_id text,           -- Vapi/Retell call id
  from_number text,
  to_number text,
  status text default 'in_progress', -- in_progress | completed | transferred | missed
  recording_url text,
  transcript text,
  summary text,
  started_at timestamptz default now(),
  ended_at timestamptz
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  call_id uuid references calls(id) on delete set null,
  name text,
  phone text,
  email text,
  address text,
  project_details jsonb default '{}'::jsonb, -- structured answers (fence height, gates, etc.)
  status text default 'new',        -- new | qualified | scheduled | won | lost
  created_at timestamptz default now()
);

create table estimates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  line_items jsonb not null default '[]'::jsonb,
  low_estimate numeric(10,2),
  high_estimate numeric(10,2),
  is_estimate_only boolean default true, -- vs. firm quote
  created_at timestamptz default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  calendar_event_id text,
  scheduled_at timestamptz not null,
  duration_minutes int default 60,
  appointment_type text default 'estimate_visit', -- estimate_visit | service_call
  status text default 'scheduled', -- scheduled | confirmed | completed | cancelled
  confirmation_sent boolean default false,
  created_at timestamptz default now()
);

-- =========================================================
-- Row Level Security
-- =========================================================

alter table businesses enable row level security;
alter table business_hours enable row level security;
alter table services enable row level security;
alter table faqs enable row level security;
alter table pricing_rules enable row level security;
alter table knowledge_documents enable row level security;
alter table knowledge_chunks enable row level security;
alter table calendar_connections enable row level security;
alter table calls enable row level security;
alter table leads enable row level security;
alter table estimates enable row level security;
alter table appointments enable row level security;

-- Owner can manage their own business row
create policy "owner manages own business" on businesses
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Generic pattern for every child table: access allowed only if the row's
-- business_id belongs to a business owned by the current user.
create or replace function is_business_owner(target_business_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from businesses
    where id = target_business_id and owner_user_id = auth.uid()
  );
$$;

create policy "tenant isolation" on business_hours for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on services for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on faqs for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on pricing_rules for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on knowledge_documents for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on knowledge_chunks for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on calendar_connections for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on calls for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on leads for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on estimates for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on appointments for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- Note: the /api/vapi/webhook route runs server-side with the Supabase
-- service role key (bypasses RLS by design), since it's authenticated by a
-- webhook secret rather than a logged-in user. See lib/supabase/admin.ts.

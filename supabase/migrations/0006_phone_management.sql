-- Phone Management module: lets a business fully manage its phone system
-- (existing-number forwarding, buying a new Twilio number, or importing a
-- BYO Twilio account) without ever logging into Twilio or Vapi directly.
--
-- Two account models, tracked explicitly rather than mixed:
--   'platform' — Business Pilot AI's own Twilio/Vapi accounts. Numbers are
--                bought/assigned through the app; usage is metered against
--                the business's subscription.
--   'byo'      — the business's own Twilio account. Credentials are
--                encrypted at rest (see lib/crypto.ts) and provider charges
--                are billed directly by Twilio, tracked separately.

-- =========================================================
-- Provider connections (BYO credentials, encrypted)
-- =========================================================

create table provider_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null check (provider in ('twilio', 'vapi')),
  mode text not null default 'platform' check (mode in ('platform', 'byo')),

  -- BYO only. Account SID is not secret (it's meant to be public-ish, used
  -- in webhook signature validation), so it's stored in the clear; the
  -- auth token is the actual secret and is ALWAYS encrypted before it
  -- reaches this table — see lib/crypto.ts encryptSecret(). Never select
  -- this column into anything returned to the browser.
  account_sid text,
  encrypted_auth_token text,

  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected', 'error')),
  last_verified_at timestamptz,
  error_message text,

  created_at timestamptz default now(),
  unique (business_id, provider)
);

-- =========================================================
-- Phone numbers
-- =========================================================

create table phone_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,

  source text not null check (source in ('forwarded_existing', 'purchased', 'imported_byo')),
  phone_number text not null,          -- E.164, e.g. +14125550100
  friendly_name text,                  -- customer-editable label ("Main line")

  provider text not null default 'twilio' check (provider in ('twilio', 'none')), -- 'none' for forwarded_existing (it's the customer's own carrier number, not a Twilio resource)
  twilio_sid text,                     -- null for forwarded_existing
  number_type text check (number_type in ('local', 'toll_free')),
  capabilities jsonb default '{"voice": true, "sms": false, "mms": false}'::jsonb,
  monthly_price numeric(10,2),

  vapi_phone_number_id text,           -- Vapi's id for this number, once imported
  vapi_assistant_id text,              -- which assistant answers this number

  status text not null default 'pending' check (status in ('pending', 'active', 'releasing', 'released', 'error')),
  error_message text,

  created_at timestamptz default now(),
  released_at timestamptz
);

-- Audit trail of assignment changes (assign/unassign/reassign to a
-- different assistant), separate from phone_numbers' current state so
-- reassignment history is never lost.
create table phone_number_assignments (
  id uuid primary key default gen_random_uuid(),
  phone_number_id uuid not null references phone_numbers(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  vapi_assistant_id text,
  action text not null check (action in ('assigned', 'unassigned', 'reassigned')),
  performed_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- =========================================================
-- Existing-number forwarding (Option A)
-- =========================================================

create table forwarding_setups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,

  existing_number text not null,       -- the business's real, publicly-advertised number
  ai_destination_number text,          -- the Business Pilot AI number calls get forwarded to
  carrier text,                        -- e.g. 'att', 'verizon', 'tmobile', 'other' — drives which instructions are shown

  forward_all_calls boolean not null default false,
  forward_missed_calls boolean not null default true,
  forward_when_busy boolean not null default true,
  forward_after_hours boolean not null default false,

  fallback_transfer_number text,

  last_test_status text check (last_test_status in ('untested', 'pass', 'fail')),
  last_tested_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Static reference data for carrier-specific dial codes shown to the
-- customer — not a live lookup, just accurate published forwarding codes.
create table carrier_forwarding_codes (
  id uuid primary key default gen_random_uuid(),
  carrier text not null unique,
  display_name text not null,
  forward_all_code text,       -- e.g. '*72' + number, '*73' to cancel
  forward_all_cancel_code text,
  forward_busy_code text,
  forward_no_answer_code text,
  notes text
);

insert into carrier_forwarding_codes (carrier, display_name, forward_all_code, forward_all_cancel_code, forward_busy_code, forward_no_answer_code, notes) values
  ('att', 'AT&T', '*21*{number}#', '#21#', '*67*{number}#', '*61*{number}#', 'Dial the code, then the AI destination number, then send/call.'),
  ('verizon', 'Verizon', '*72{number}', '*73', '*90{number}', '*92{number}', 'Wait for confirmation tone before hanging up.'),
  ('tmobile', 'T-Mobile', '**21*{number}#', '##21#', '**67*{number}#', '**61*{number}#', 'Some T-Mobile plans require calling support to enable conditional forwarding.'),
  ('other', 'Other / landline / VoIP', null, null, null, null, 'Forwarding codes vary — check your carrier or PBX provider''s documentation, or contact them directly.');

-- =========================================================
-- Call routing, business hours, transfer destinations
-- =========================================================

create table call_routing_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,

  mode text not null default 'ai_first' check (mode in (
    'ai_answers_all', 'ai_after_no_answer', 'ai_after_hours',
    'ring_business_first', 'ring_ai_first_then_transfer', 'simultaneous_ring'
  )),
  ring_seconds_before_ai int default 15,       -- for ring_business_first / ring_ai_first modes

  fallback_transfer_number text,
  emergency_transfer_number text,

  transfer_on_low_confidence boolean not null default true,
  transfer_on_customer_request boolean not null default true,

  -- Department routing (restaurant orders / reservations / service
  -- appointments / general inquiries) — kept flexible as jsonb rather than
  -- one column per department, since which departments exist varies by
  -- business type.
  department_routing jsonb default '{}'::jsonb,

  voicemail_fallback_enabled boolean not null default true,

  updated_at timestamptz default now()
);

create table transfer_destinations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  label text not null,                 -- 'Owner cell', 'Front desk', 'Kitchen', ...
  department text,                     -- optional tag used by department_routing
  phone_number text not null,
  priority int not null default 0,
  is_emergency_contact boolean not null default false,
  created_at timestamptz default now()
);

-- =========================================================
-- Assistant (Vapi) settings, customer-facing subset
-- =========================================================

create table assistant_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  vapi_assistant_id text,

  name text not null default 'AI Receptionist',
  greeting text,
  first_message text,
  system_prompt_override text,         -- if set, appended to the generated base prompt rather than replacing it

  language text not null default 'en',
  fallback_language text,

  speaking_speed numeric(3,2) not null default 1.0,   -- 0.5–2.0
  interruption_sensitivity text not null default 'medium' check (interruption_sensitivity in ('low', 'medium', 'high')),
  silence_timeout_seconds int not null default 10,
  call_timeout_seconds int not null default 1800,

  voicemail_behavior text not null default 'leave_message' check (voicemail_behavior in ('leave_message', 'hang_up', 'transfer')),
  record_calls boolean not null default true,
  collect_transcripts boolean not null default true,
  generate_summaries boolean not null default true,

  advanced_mode_enabled boolean not null default false, -- gates raw JSON editing in the UI

  updated_at timestamptz default now()
);

-- =========================================================
-- SMS settings
-- =========================================================

create table sms_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,

  payment_link_messages boolean not null default true,
  appointment_confirmations boolean not null default true,
  order_confirmations boolean not null default true,
  missed_call_followup boolean not null default false,

  custom_templates jsonb default '{}'::jsonb, -- { "payment_link": "...", "confirmation": "..." }
  opt_out_text text not null default 'Reply STOP to unsubscribe.',
  business_display_name text,
  default_sender_number text,

  messaging_registration_status text not null default 'unregistered' check (messaging_registration_status in ('unregistered', 'pending', 'registered', 'restricted')),

  updated_at timestamptz default now()
);

-- =========================================================
-- Provisioning workflow tracking
-- =========================================================

create table provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  workflow_type text not null check (workflow_type in ('buy_number', 'import_byo_number', 'forwarding_setup')),

  status text not null default 'in_progress' check (status in ('in_progress', 'succeeded', 'failed', 'rolled_back')),
  current_step text,
  steps_completed jsonb not null default '[]'::jsonb, -- [{ step, ok, at }]

  phone_number_id uuid references phone_numbers(id) on delete set null,
  error_message text,
  failed_step text,

  created_at timestamptz default now(),
  completed_at timestamptz
);

-- =========================================================
-- Usage, cost, and billing tracking
-- =========================================================

create table provider_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null check (provider in ('twilio', 'vapi')),
  usage_type text not null check (usage_type in ('voice_minutes', 'sms_count', 'number_rental')),
  quantity numeric(12,4) not null default 0,
  period_start date not null,
  period_end date not null,
  created_at timestamptz default now()
);

create table provider_costs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  provider_cost numeric(10,2) not null default 0,   -- what Business Pilot AI was actually charged
  customer_price numeric(10,2) not null default 0,  -- what the customer is billed (platform mode only)
  markup numeric(10,2) generated always as (customer_price - provider_cost) stored,
  created_at timestamptz default now()
);

create table customer_usage_summary (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  included_minutes int not null default 0,
  used_minutes numeric(10,2) not null default 0,
  included_sms int not null default 0,
  used_sms int not null default 0,
  overage_cost numeric(10,2) not null default 0,
  unique (business_id, period_start, period_end)
);

-- =========================================================
-- Webhook health and test results
-- =========================================================

create table webhook_status (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  webhook_type text not null check (webhook_type in ('twilio_voice', 'twilio_sms', 'vapi')),
  last_received_at timestamptz,
  last_status text check (last_status in ('ok', 'signature_invalid', 'error')),
  failure_count int not null default 0,
  unique (business_id, webhook_type)
);

create table phone_test_results (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  test_type text not null check (test_type in (
    'forwarding_check', 'inbound_call', 'transfer', 'sms', 'webhook', 'voice_preview', 'assistant_tools'
  )),
  status text not null check (status in ('pass', 'fail', 'pending')),
  details jsonb default '{}'::jsonb,
  run_at timestamptz default now()
);

-- =========================================================
-- Row Level Security — every table scoped to the owning business,
-- following the same is_business_owner() pattern as the rest of the app.
-- =========================================================

alter table provider_connections enable row level security;
alter table phone_numbers enable row level security;
alter table phone_number_assignments enable row level security;
alter table forwarding_setups enable row level security;
alter table call_routing_rules enable row level security;
alter table transfer_destinations enable row level security;
alter table assistant_settings enable row level security;
alter table sms_settings enable row level security;
alter table provisioning_jobs enable row level security;
alter table provider_usage enable row level security;
alter table provider_costs enable row level security;
alter table customer_usage_summary enable row level security;
alter table webhook_status enable row level security;
alter table phone_test_results enable row level security;
-- carrier_forwarding_codes is shared reference data, not per-business.
alter table carrier_forwarding_codes enable row level security;
create policy "anyone can read carrier codes" on carrier_forwarding_codes for select using (true);

create policy "tenant isolation" on provider_connections for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on phone_numbers for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on phone_number_assignments for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on forwarding_setups for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on call_routing_rules for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on transfer_destinations for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on assistant_settings for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on sms_settings for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on provisioning_jobs for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on provider_usage for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on provider_costs for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on customer_usage_summary for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on webhook_status for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on phone_test_results for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- Note: encrypted_auth_token in provider_connections is application-layer
-- encrypted (see lib/crypto.ts) before it ever reaches this table — RLS
-- controls *who* can query the row, encryption controls what they'd see
-- even with direct database access. Only server-side code (service role,
-- via lib/supabase/admin.ts) ever calls decryptSecret() on it; it is never
-- selected into a response returned to the browser.

create index phone_numbers_business_id_idx on phone_numbers (business_id);
create index provisioning_jobs_business_id_idx on provisioning_jobs (business_id);
create index provider_usage_business_period_idx on provider_usage (business_id, period_start, period_end);

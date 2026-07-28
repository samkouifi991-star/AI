-- Per-business Twilio subaccount isolation, a plain-language provisioning
-- state vocabulary, DB-level idempotency for the provisioning workflow, and
-- a billing/legal retention archive for deleted accounts.

-- =========================================================
-- Per-business Twilio subaccounts
-- =========================================================
-- Every business gets its own Twilio subaccount (created under the
-- platform master account) rather than sharing the master account's
-- number pool. This is what makes "never reuse one customer's number for
-- another" a provider-level guarantee, not just an app-level convention.

alter table businesses add column if not exists twilio_subaccount_sid text;
alter table businesses add column if not exists twilio_subaccount_auth_token_encrypted text;

alter table businesses
  add constraint businesses_twilio_subaccount_sid_unique unique (twilio_subaccount_sid);

-- =========================================================
-- Provisioning state — the plain-language, single source of truth for
-- "where is this business in getting a working AI phone line". Distinct
-- from onboarding_progress.current_stage (which tracks the *wizard UI*
-- step) and provisioning_jobs.status (which tracks one workflow run) —
-- this is the durable, business-level status shown in the dashboard.
-- =========================================================

alter table businesses add column if not exists provisioning_state text not null default 'account_created'
  check (provisioning_state in (
    'account_created',
    'profile_incomplete',
    'waiting_for_phone_selection',
    'purchasing_number',
    'creating_ai_employee',
    'connecting_phone',
    'syncing_settings',
    'processing_knowledge',
    'ready_for_test',
    'live',
    'failed'
  ));

alter table businesses add column if not exists provisioning_failed_step text;
alter table businesses add column if not exists provisioning_error_message text;

-- =========================================================
-- Idempotency: at most one in-progress provisioning job per
-- (business, workflow_type) at the database level. A retry that races a
-- still-running attempt is rejected by the unique index itself, not just
-- by application-layer checking-then-inserting (which has a TOCTOU gap).
-- =========================================================

create unique index if not exists provisioning_jobs_one_active_per_business_workflow
  on provisioning_jobs (business_id, workflow_type)
  where status = 'in_progress';

-- =========================================================
-- Billing/legal retention archive
-- =========================================================
-- Account deletion cascades away businesses.id (and everything that
-- references it, including provider_usage/provider_costs/customer_usage_
-- summary). Before that cascade runs, the delete flow copies the minimum
-- needed for billing/legal retention here. Deliberately NOT a foreign key
-- to businesses(id) — it must survive the business being deleted. No RLS
-- policies are defined, so only the service role (which bypasses RLS) can
-- ever read it; no customer or business-owner session can see this table.

create table if not exists deleted_account_billing_archive (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  business_name text,
  owner_email text,
  twilio_subaccount_sid text,
  number_disposition text not null check (number_disposition in ('kept', 'released', 'released_and_subaccount_closed')),
  usage_records jsonb not null default '[]'::jsonb,
  cost_records jsonb not null default '[]'::jsonb,
  archived_at timestamptz not null default now()
);

alter table deleted_account_billing_archive enable row level security;
-- Intentionally no policies: service-role only.

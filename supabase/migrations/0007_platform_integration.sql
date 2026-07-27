-- Ties the platform together: audit logging for every sensitive action,
-- persistent onboarding wizard progress (survives refresh/logout/nav), a
-- lightweight Postgres-backed rate limiter (no Redis dependency), and
-- extending provider_connections to cover Stripe Connect (BYO payments)
-- alongside the existing Twilio/Vapi rows.

alter table provider_connections drop constraint if exists provider_connections_provider_check;
alter table provider_connections add constraint provider_connections_provider_check
  check (provider in ('twilio', 'vapi', 'stripe', 'google_calendar'));

-- =========================================================
-- Audit log
-- =========================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,              -- 'number_purchased' | 'number_released' | 'credential_saved' |
                                      -- 'credential_disconnected' | 'routing_changed' | 'refund_issued' | ...
  resource_type text,                -- 'phone_number' | 'provider_connection' | 'call_routing_rules' | ...
  resource_id text,
  metadata jsonb default '{}'::jsonb, -- never store secrets here — see lib/audit.ts
  created_at timestamptz default now()
);

alter table audit_log enable row level security;
create policy "tenant isolation" on audit_log for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
-- Audit rows are written by trusted server code (service role) alongside
-- the action being audited, same pattern as calls/orders/provisioning_jobs.

create index audit_log_business_id_idx on audit_log (business_id, created_at desc);

-- =========================================================
-- Onboarding wizard progress
-- =========================================================

create table onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  current_stage text not null default 'business' check (current_stage in (
    'business', 'phone', 'voice', 'knowledge', 'calendar', 'payments', 'test', 'go_live', 'complete'
  )),
  completed_stages jsonb not null default '[]'::jsonb, -- ['business', 'phone', ...]
  updated_at timestamptz default now()
);

alter table onboarding_progress enable row level security;
create policy "tenant isolation" on onboarding_progress for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- =========================================================
-- Rate limiting (Postgres-backed sliding window, no Redis dependency)
-- =========================================================

create table rate_limit_buckets (
  bucket_key text primary key,   -- e.g. 'phone-purchase:{businessId}' or 'twilio-connect:{ip}'
  window_start timestamptz not null default now(),
  request_count int not null default 0
);

-- Atomically increments a bucket's count, resetting it if the current
-- window has expired. Returns the count AFTER this request, so the caller
-- can compare it against their own limit. security definer so this can be
-- called from server code as the anon/authenticated role without needing
-- direct table grants — the function itself is the only thing that can
-- write to this table.
create or replace function increment_rate_limit(p_key text, p_window_seconds int)
returns int language plpgsql security definer as $$
declare
  v_count int;
begin
  insert into rate_limit_buckets (bucket_key, window_start, request_count)
  values (p_key, now(), 1)
  on conflict (bucket_key) do update
    set request_count = case
      when rate_limit_buckets.window_start < now() - (p_window_seconds || ' seconds')::interval
        then 1
      else rate_limit_buckets.request_count + 1
    end,
    window_start = case
      when rate_limit_buckets.window_start < now() - (p_window_seconds || ' seconds')::interval
        then now()
      else rate_limit_buckets.window_start
    end
  returning request_count into v_count;
  return v_count;
end;
$$;

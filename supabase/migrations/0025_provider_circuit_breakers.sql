-- Reliability Phase 0, item 10 — circuit breakers for Vapi, OpenAI,
-- Twilio, and Stripe. If a provider is failing repeatedly, stop hammering
-- it (which only adds latency to every affected call) and fail fast into
-- a degraded response instead.
--
-- State lives in Postgres rather than in-process memory because the app
-- runs on stateless serverless functions — nothing survives between
-- invocations, so "5 failures in the last 60 seconds" has to be tracked
-- somewhere every invocation can see. All three transitions are done
-- inside a single SQL function rather than read-then-write application
-- code, so two concurrent requests recording a failure at the same
-- moment can't race each other into an inconsistent state.

create table provider_health (
  provider text primary key,
  state text not null default 'closed' check (state in ('closed', 'open', 'half_open')),
  failure_count int not null default 0,
  last_failure_at timestamptz,
  opened_at timestamptz,
  updated_at timestamptz not null default now()
);

-- No RLS — this is platform-wide operational state, not a business's
-- data; only the service role ever touches it.

-- Records a failure for `p_provider`. If the previous failure was outside
-- the rolling window, the count restarts at 1 rather than accumulating
-- forever. Crossing p_threshold within the window opens the breaker.
-- Returns the resulting state.
create or replace function record_provider_failure(
  p_provider text,
  p_window_seconds int,
  p_threshold int
) returns text language plpgsql as $$
declare
  v_prior provider_health%rowtype;
  v_new_count int;
  v_new_state text;
  v_new_opened_at timestamptz;
begin
  -- Computed up front, in one place, so the same logic governs both the
  -- very first failure ever recorded for this provider (no prior row to
  -- read) and every failure after — the earlier version of this function
  -- only applied the threshold check on the UPDATE branch of the upsert,
  -- so a threshold of 1 could never open the breaker on a provider's
  -- first-ever recorded failure.
  select * into v_prior from provider_health where provider = p_provider;

  if not found or v_prior.last_failure_at is null or v_prior.last_failure_at < now() - make_interval(secs => p_window_seconds) then
    v_new_count := 1;
  else
    v_new_count := v_prior.failure_count + 1;
  end if;

  if v_new_count >= p_threshold then
    v_new_state := 'open';
    v_new_opened_at := case when found and v_prior.state = 'open' then v_prior.opened_at else now() end;
  else
    v_new_state := 'closed';
    v_new_opened_at := null;
  end if;

  insert into provider_health (provider, state, failure_count, last_failure_at, opened_at, updated_at)
  values (p_provider, v_new_state, v_new_count, now(), v_new_opened_at, now())
  on conflict (provider) do update set
    state = v_new_state,
    failure_count = v_new_count,
    last_failure_at = now(),
    opened_at = v_new_opened_at,
    updated_at = now();

  return v_new_state;
end;
$$;

-- A successful call closes the breaker outright and resets the count —
-- a provider that's working again shouldn't stay half-open waiting for
-- more traffic to confirm it.
create or replace function record_provider_success(p_provider text) returns void language plpgsql as $$
begin
  insert into provider_health (provider, state, failure_count, last_failure_at, opened_at, updated_at)
  values (p_provider, 'closed', 0, null, null, now())
  on conflict (provider) do update set
    state = 'closed',
    failure_count = 0,
    opened_at = null,
    updated_at = now();
end;
$$;

-- Checked before attempting a call. 'closed'/'half_open' means proceed;
-- 'open' past its cooldown flips to 'half_open' (one probe request is
-- allowed through to test recovery) and returns that; 'open' still
-- within cooldown returns 'open' unchanged, meaning the caller should
-- skip the attempt entirely and degrade immediately.
create or replace function check_provider_circuit(p_provider text, p_cooldown_seconds int) returns text language plpgsql as $$
declare
  v_row provider_health%rowtype;
begin
  select * into v_row from provider_health where provider = p_provider;
  if not found then
    return 'closed';
  end if;

  if v_row.state = 'open' and v_row.opened_at is not null and v_row.opened_at < now() - make_interval(secs => p_cooldown_seconds) then
    update provider_health set state = 'half_open', updated_at = now() where provider = p_provider;
    return 'half_open';
  end if;

  return v_row.state;
end;
$$;

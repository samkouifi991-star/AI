-- Records every Stripe payment event this app receives, so the webhook has
-- something real to write to and the dashboard/health-check can report on
-- payment activity. is_test is set from whether the event was created
-- under a Stripe test-mode key, so staging traffic is always distinguishable
-- from real customer payments (see HOSTINGER_DEPLOYMENT.md "Staging mode").

create table payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  stripe_event_id text not null unique,
  stripe_object_id text,             -- payment_intent id, checkout session id, etc.
  type text not null,                -- 'checkout.session.completed', 'payment_intent.succeeded', ...
  amount numeric(10,2),
  currency text default 'usd',
  status text not null default 'received', -- received | processed | failed
  is_test boolean not null default false,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

alter table payments enable row level security;
create policy "tenant isolation" on payments for all
  using (business_id is null or is_business_owner(business_id))
  with check (business_id is null or is_business_owner(business_id));

-- The webhook writes with the service-role client (bypasses RLS by design,
-- same pattern as the Vapi webhook — see lib/supabase/admin.ts).
create index payments_business_id_idx on payments (business_id);
create index payments_stripe_event_id_idx on payments (stripe_event_id);

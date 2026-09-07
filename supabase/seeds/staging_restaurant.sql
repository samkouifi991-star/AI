-- Staging restaurant for the direct-runtime prototype's first controlled
-- test call (Phase 1, step 10's prerequisite). NOT a migration — never
-- applied automatically by whatever runs supabase/migrations/*.sql, and
-- written as plain portable SQL (no psql meta-commands like \gset or
-- :'var' substitution) since this is meant to be pasted directly into
-- Supabase's web SQL editor, not run via psql.
--
-- Usage:
--   1. Sign up a new account at /signup with a throwaway/test email you
--      actually control — this is what makes it a genuinely separate
--      business, isolated by the same tenant-scoped RLS every other
--      business already relies on (business_id foreign keys +
--      is_business_owner()), not a special case. Nothing about
--      "staging" needs new isolation machinery.
--   2. Find that account's businesses.id (Table Editor -> businesses,
--      or the onboarding flow's result) and replace every occurrence of
--      the literal text REPLACE_WITH_BUSINESS_ID below with that real
--      uuid (as a plain find-and-replace across this whole file).
--   3. Run the edited file in the Supabase SQL editor.
--   4. Continue with what this script cannot do: buying a dedicated
--      Twilio number for this business specifically (the existing
--      /phone provisioning flow only supports voice_runtime='vapi' —
--      lib/provisioning.ts explicitly refuses to provision Vapi under a
--      'direct'-flagged business — so for 'direct' the number's Voice
--      URL needs to be pointed at app/api/twilio/voice by hand until a
--      'direct'-aware provisioning path exists), and setting
--      VOICE_WORKER_URL once the Railway worker is deployed.

-- Sanity check this is being pointed at a real, already-existing business
-- (created by the real signup in step 1) rather than accidentally
-- creating a phantom row with no real owner. If this raises, you forgot
-- step 2's find-and-replace.
do $$
begin
  if not exists (select 1 from businesses where id = 'REPLACE_WITH_BUSINESS_ID'::uuid) then
    raise exception 'No business with id REPLACE_WITH_BUSINESS_ID — sign up a real test account first (see the comment at the top of this file), then replace that placeholder with its real business id.';
  end if;
end $$;

update businesses set
  name = 'Business Pilot Staging Restaurant (test only)',
  business_type = 'restaurant',
  timezone = 'America/New_York',
  voice_runtime = 'direct',
  is_live = true
where id = 'REPLACE_WITH_BUSINESS_ID'::uuid;

insert into ai_employee_settings (business_id, employee_name, employee_title, tone, can_take_orders, can_quote_prices, can_book_appointments, can_offer_discounts, escalation_phone_number)
values ('REPLACE_WITH_BUSINESS_ID'::uuid, 'Ava', 'Virtual Receptionist', 'friendly', true, true, false, false, null)
on conflict (business_id) do update set tone = excluded.tone;

insert into restaurant_settings (business_id, pickup_enabled, pickup_prep_minutes, pay_at_pickup, delivery_enabled, tax_rate, tip_presets)
values ('REPLACE_WITH_BUSINESS_ID'::uuid, true, 15, true, false, 8.0, '15,18,20')
on conflict (business_id) do nothing;

insert into call_routing_rules (business_id, mode, fallback_transfer_number, transfer_on_customer_request, voicemail_fallback_enabled)
values ('REPLACE_WITH_BUSINESS_ID'::uuid, 'ai_answers_all', null, true, true)
on conflict (business_id) do nothing;

-- Every day open 11:00-21:00 — good enough for a controlled test call;
-- change later from the real Restaurant Settings UI same as any business.
insert into business_hours (business_id, day_of_week, open_time, close_time, is_closed)
select 'REPLACE_WITH_BUSINESS_ID'::uuid, d, '11:00', '21:00', false
from generate_series(0, 6) as d;

-- A small, real menu — enough to genuinely exercise find_menu_item (a
-- name match, a sold-out item, an item with sizes) rather than an empty
-- menu that would make every test call trivially "not found". The
-- category insert and the item inserts that reference it are one CTE
-- chain rather than a captured psql variable, so this stays plain,
-- portable SQL.
with new_category as (
  insert into menu_categories (business_id, name, sort_order)
  values ('REPLACE_WITH_BUSINESS_ID'::uuid, 'Burgers', 1)
  returning id
),
new_items as (
  insert into menu_items (business_id, category_id, name, description, base_price, sold_out, sort_order)
  select 'REPLACE_WITH_BUSINESS_ID'::uuid, new_category.id, v.name, v.description, v.base_price, v.sold_out, v.sort_order
  from new_category, (values
    ('Cheeseburger', 'Beef patty, cheddar, lettuce, tomato, house sauce', 9.99, false, 1),
    ('Veggie Burger', 'Black bean patty, avocado, sprouts', 10.49, false, 2),
    ('Bacon Deluxe Burger', 'Double patty, bacon, cheddar, onion rings', 12.99, true, 3)
  ) as v(name, description, base_price, sold_out, sort_order)
  returning id, name
),
fries_item as (
  insert into menu_items (business_id, category_id, name, description, base_price, sold_out, sort_order)
  select 'REPLACE_WITH_BUSINESS_ID'::uuid, new_category.id, 'Loaded Fries', 'Cheese, bacon bits, scallions', 6.49, false, 4
  from new_category
  returning id
)
insert into menu_item_sizes (menu_item_id, label, price, sort_order)
select fries_item.id, v.label, v.price, v.sort_order
from fries_item, (values ('Regular', 6.49, 1), ('Large', 8.49, 2)) as v(label, price, sort_order);

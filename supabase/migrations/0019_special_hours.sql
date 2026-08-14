-- Simple one-off exceptions to the regular weekly business_hours — a
-- specific closed holiday, a one-day early close, etc. Deliberately
-- minimal (single dates, no recurrence rules) rather than a general
-- scheduling system: business_hours (migration 0001) already covers the
-- normal weekly pattern, including multiple time ranges per day (nothing
-- stops more than one row sharing a day_of_week — that was never
-- constrained to one row per day).

create table if not exists special_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  open_time time,
  close_time time,
  note text,
  created_at timestamptz default now(),
  unique (business_id, date)
);

alter table special_hours enable row level security;
create policy "tenant isolation" on special_hours for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

create index special_hours_business_date_idx on special_hours (business_id, date);

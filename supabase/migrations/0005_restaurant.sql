-- Restaurant backend: business_type distinction, full menu structure,
-- restaurant operational settings, and the order lifecycle. Mirrors the
-- RLS pattern already used throughout (tenant isolation via
-- is_business_owner()), and reuses the existing business_hours,
-- knowledge_documents/knowledge_chunks, and payments tables rather than
-- duplicating them.

alter table businesses add column if not exists business_type text not null default 'service'
  check (business_type in ('service', 'restaurant'));

-- =========================================================
-- Menu structure
-- =========================================================

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid references menu_categories(id) on delete set null,
  name text not null,
  description text,
  base_price numeric(10,2) not null default 0,
  sold_out boolean not null default false,
  -- Simple day/time availability window; null means "always available
  -- during business hours". e.g. {"days": [1,2,3,4,5], "start": "11:00", "end": "14:00"}
  -- for a lunch-only item.
  availability jsonb,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Sizes are mutually exclusive options with their own price (e.g. Small
-- $11.99 / Medium $15.99 / Large $18.99) — selecting one replaces base_price.
create table menu_item_sizes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  label text not null,
  price numeric(10,2) not null,
  sort_order int not null default 0
);

-- Modifier groups are things like "Toppings" or "Add-ons" — each group has
-- its own options and its own single-select/multi-select + required rule,
-- so the AI knows whether it must ask ("choose a size") or may skip it
-- ("any extra toppings?").
create table menu_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,                 -- 'Toppings', 'Add-ons', 'Choice of side'
  selection_type text not null default 'multi' check (selection_type in ('single', 'multi')),
  required boolean not null default false,
  created_at timestamptz default now()
);

create table menu_modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references menu_modifier_groups(id) on delete cascade,
  label text not null,                -- 'Extra cheese', 'Mushrooms'
  price_delta numeric(10,2) not null default 0,
  sort_order int not null default 0
);

-- Tracks a menu import from upload through review to publish, so the owner
-- can correct extraction mistakes before anything goes live. The raw
-- extracted draft lives in extracted_json until "Publish menu" writes it
-- into menu_categories/menu_items/etc.
create table menu_import_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  source_type text not null check (source_type in ('url', 'pdf', 'image', 'docx', 'csv')),
  source_ref text,                    -- URL, or Supabase Storage path for uploaded files
  status text not null default 'processing' check (status in ('processing', 'ready_for_review', 'published', 'failed')),
  extracted_json jsonb,                -- draft categories/items, editable before publish
  error_message text,
  created_at timestamptz default now(),
  published_at timestamptz
);

-- =========================================================
-- Restaurant operational settings
-- =========================================================

create table restaurant_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,

  pickup_enabled boolean not null default true,
  pickup_prep_minutes int not null default 20,
  pay_at_pickup boolean not null default true,

  delivery_enabled boolean not null default false,
  delivery_radius_miles numeric(5,1) default 5,
  delivery_fee numeric(10,2) default 3.99,
  delivery_min_order numeric(10,2) default 15,
  delivery_prep_minutes int not null default 25,
  pay_at_delivery boolean not null default false,

  order_cutoff_time time,              -- stop taking same-day orders after this time
  staff_approval_required boolean not null default false,

  tax_rate numeric(5,2) not null default 0,     -- percent
  tip_presets text not null default '15,18,20', -- comma-separated percentages
  discount_code text,
  discount_percent numeric(5,2),

  -- How long a Pending Payment order holds its slot before being
  -- automatically released/cancelled. Checked lazily (see lib/orders.ts
  -- releaseExpiredHolds()) rather than requiring a cron job, since a
  -- background scheduler isn't guaranteed on all Node hosts.
  payment_hold_minutes int not null default 30,

  updated_at timestamptz default now()
);

-- =========================================================
-- Orders
-- =========================================================

create table orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  call_id uuid references calls(id) on delete set null,

  customer_name text,
  customer_phone text,
  customer_email text,

  order_type text not null default 'pickup' check (order_type in ('pickup', 'delivery')),
  delivery_address text,

  -- Full lifecycle exactly as specified: Draft is an in-progress order
  -- being built live during the call; Pending Confirmation is the AI
  -- repeating it back; Pending Payment through Refunded are post-payment-
  -- link states.
  status text not null default 'draft' check (status in (
    'draft', 'pending_confirmation', 'pending_payment', 'paid',
    'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery',
    'completed', 'cancelled', 'refunded'
  )),

  subtotal numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  tip numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,

  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  payment_hold_expires_at timestamptz,

  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,

  -- Snapshot the name/price at time of order so later menu edits never
  -- change the price of an already-placed order.
  name_snapshot text not null,
  size_label text,
  unit_price numeric(10,2) not null,
  quantity int not null default 1,
  modifiers jsonb not null default '[]'::jsonb, -- [{ label, price_delta }]
  special_instructions text,
  line_total numeric(10,2) not null,

  created_at timestamptz default now()
);

-- =========================================================
-- Row Level Security
-- =========================================================

alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table menu_item_sizes enable row level security;
alter table menu_modifier_groups enable row level security;
alter table menu_modifier_options enable row level security;
alter table menu_import_jobs enable row level security;
alter table restaurant_settings enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "tenant isolation" on menu_categories for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on menu_items for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on menu_import_jobs for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on restaurant_settings for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy "tenant isolation" on orders for all
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- Sizes/modifiers/order_items are keyed off their parent, not business_id
-- directly, so isolate through the parent's business ownership.
create policy "tenant isolation" on menu_item_sizes for all
  using (exists (select 1 from menu_items mi where mi.id = menu_item_sizes.menu_item_id and is_business_owner(mi.business_id)))
  with check (exists (select 1 from menu_items mi where mi.id = menu_item_sizes.menu_item_id and is_business_owner(mi.business_id)));

create policy "tenant isolation" on menu_modifier_groups for all
  using (exists (select 1 from menu_items mi where mi.id = menu_modifier_groups.menu_item_id and is_business_owner(mi.business_id)))
  with check (exists (select 1 from menu_items mi where mi.id = menu_modifier_groups.menu_item_id and is_business_owner(mi.business_id)));

create policy "tenant isolation" on menu_modifier_options for all
  using (exists (select 1 from menu_modifier_groups g join menu_items mi on mi.id = g.menu_item_id where g.id = menu_modifier_options.group_id and is_business_owner(mi.business_id)))
  with check (exists (select 1 from menu_modifier_groups g join menu_items mi on mi.id = g.menu_item_id where g.id = menu_modifier_options.group_id and is_business_owner(mi.business_id)));

create policy "tenant isolation" on order_items for all
  using (exists (select 1 from orders o where o.id = order_items.order_id and is_business_owner(o.business_id)))
  with check (exists (select 1 from orders o where o.id = order_items.order_id and is_business_owner(o.business_id)));

-- Note: the Vapi webhook and Stripe webhook write orders/order_items and
-- menu_import_jobs using the service-role client (bypasses RLS by design,
-- same pattern as calls/leads/appointments — see lib/supabase/admin.ts). RLS
-- above governs the dashboard's authenticated-user access only.

create index orders_business_id_idx on orders (business_id);
create index orders_status_idx on orders (status);
create index menu_items_business_id_idx on menu_items (business_id);

-- =========================================================
-- Storage buckets
-- =========================================================
-- Both the Knowledge Base page and the Menu import flow upload files to
-- Supabase Storage before a server route reads and processes them (see
-- app/api/knowledge/ingest and app/api/menu/import). Neither bucket was
-- ever created in an earlier migration — creating both here so a fresh
-- deployment actually has everywhere the app expects to upload to.

insert into storage.buckets (id, name, public)
values ('knowledge-documents', 'knowledge-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('menu-uploads', 'menu-uploads', false)
on conflict (id) do nothing;

-- Owners can upload/read/delete only within their own business_id-prefixed
-- folder (both routes upload to `${businessId}/...`), enforced by checking
-- that the folder name (first path segment) is a business the caller owns.
create policy "owners manage their menu uploads" on storage.objects for all
  using (bucket_id = 'menu-uploads' and is_business_owner((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'menu-uploads' and is_business_owner((storage.foldername(name))[1]::uuid));

create policy "owners manage their knowledge documents" on storage.objects for all
  using (bucket_id = 'knowledge-documents' and is_business_owner((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'knowledge-documents' and is_business_owner((storage.foldername(name))[1]::uuid));

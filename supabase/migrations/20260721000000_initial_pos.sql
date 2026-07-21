-- FlashPOS initial database schema
-- Run with the Supabase CLI or paste into the Supabase SQL editor.

create extension if not exists pgcrypto;

create type public.app_role as enum ('employee', 'super_admin');
create type public.stock_movement_type as enum ('opening', 'purchase', 'sale', 'return', 'damage', 'adjustment');
create type public.sale_status as enum ('draft', 'completed', 'voided', 'refunded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  sku text not null unique,
  barcode text unique,
  name text not null,
  description text,
  cost_per_piece numeric(12,2) not null default 0 check (cost_per_piece >= 0),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  conversion_to_piece integer not null check (conversion_to_piece > 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  barcode text unique,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, name),
  unique (product_id, conversion_to_piece)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  cashier_id uuid not null references public.profiles(id),
  status public.sale_status not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  amount_tendered numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  payment_method text not null default 'cash',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  product_id uuid not null references public.products(id),
  product_unit_id uuid not null references public.product_units(id),
  product_name text not null,
  unit_name text not null,
  quantity integer not null check (quantity > 0),
  conversion_to_piece integer not null check (conversion_to_piece > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type public.stock_movement_type not null,
  quantity_pieces integer not null check (quantity_pieces <> 0),
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index products_category_id_idx on public.products(category_id);
create index product_units_product_id_idx on public.product_units(product_id);
create index sales_created_at_idx on public.sales(created_at desc);
create index sales_cashier_id_idx on public.sales(cashier_id);
create index sale_items_sale_id_idx on public.sale_items(sale_id);
create index stock_movements_product_id_created_at_idx on public.stock_movements(product_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active = true
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active = true and role = 'super_admin'
  );
$$;

grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_units enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;

create policy "users view own profile or admins view all"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.is_super_admin());

create policy "admins update profiles"
on public.profiles for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy "staff view categories" on public.categories for select to authenticated using (public.is_active_staff());
create policy "staff add categories" on public.categories for insert to authenticated with check (public.is_active_staff());
create policy "staff update categories" on public.categories for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy "admins delete categories" on public.categories for delete to authenticated using (public.is_super_admin());

create policy "staff view products" on public.products for select to authenticated using (public.is_active_staff());
create policy "staff add products" on public.products for insert to authenticated with check (public.is_active_staff() and created_by = (select auth.uid()));
create policy "staff update products" on public.products for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy "admins delete products" on public.products for delete to authenticated using (public.is_super_admin());

create policy "staff view units" on public.product_units for select to authenticated using (public.is_active_staff());
create policy "staff add units" on public.product_units for insert to authenticated with check (public.is_active_staff());
create policy "staff update units" on public.product_units for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy "admins delete units" on public.product_units for delete to authenticated using (public.is_super_admin());

create policy "staff view sales" on public.sales for select to authenticated using (public.is_active_staff());
create policy "staff create own sales" on public.sales for insert to authenticated with check (public.is_active_staff() and cashier_id = (select auth.uid()));
create policy "staff update own draft sales" on public.sales for update to authenticated using (public.is_active_staff() and cashier_id = (select auth.uid()) and status = 'draft') with check (public.is_active_staff() and cashier_id = (select auth.uid()));
create policy "admins update sales" on public.sales for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "staff view sale items" on public.sale_items for select to authenticated using (public.is_active_staff());
create policy "staff create sale items" on public.sale_items for insert to authenticated with check (
  public.is_active_staff() and exists (
    select 1 from public.sales where sales.id = sale_id and sales.cashier_id = (select auth.uid()) and sales.status = 'draft'
  )
);

create policy "staff view stock ledger" on public.stock_movements for select to authenticated using (public.is_active_staff());
create policy "staff append stock ledger" on public.stock_movements for insert to authenticated with check (public.is_active_staff() and created_by = (select auth.uid()));
create policy "admins correct stock ledger" on public.stock_movements for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "admins delete stock ledger entries" on public.stock_movements for delete to authenticated using (public.is_super_admin());

create or replace view public.product_stock
with (security_invoker = true)
as
select
  p.id,
  p.sku,
  p.barcode,
  p.name,
  p.low_stock_threshold,
  p.is_active,
  c.name as category_name,
  coalesce(sum(sm.quantity_pieces), 0)::integer as stock_on_hand
from public.products p
left join public.categories c on c.id = p.category_id
left join public.stock_movements sm on sm.product_id = p.id
group by p.id, c.name;

grant select on public.product_stock to authenticated;

-- After creating the first account in Authentication > Users, promote it once:
-- update public.profiles set role = 'super_admin' where id = '<AUTH_USER_UUID>';

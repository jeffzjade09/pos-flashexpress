-- Adds suppliers, stock receiving, cashier closing, and marketplace fulfillment.
-- Run after 20260721070000_refunds_expenses_profit.sql.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_name text,
  phone text,
  email text,
  address text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  supplier_id uuid not null references public.suppliers(id),
  supplier_reference text,
  status text not null default 'ordered' check (status in ('ordered', 'partially_received', 'received', 'cancelled')),
  total_cost numeric(12,2) not null default 0 check (total_cost >= 0),
  ordered_by uuid not null references public.profiles(id),
  ordered_at timestamptz not null default now(),
  received_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity_pieces integer not null check (quantity_pieces > 0),
  received_pieces integer not null default 0 check (received_pieces >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_cost numeric(12,2) not null check (line_cost >= 0),
  unique (purchase_order_id, product_id),
  check (received_pieces <= quantity_pieces)
);

create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id, ordered_at desc);
create index if not exists purchase_order_items_order_idx on public.purchase_order_items(purchase_order_id);
drop trigger if exists suppliers_set_updated_at on public.suppliers;
drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger purchase_orders_set_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
drop policy if exists "staff view suppliers" on public.suppliers;
drop policy if exists "admins manage suppliers" on public.suppliers;
drop policy if exists "staff view purchase orders" on public.purchase_orders;
drop policy if exists "admins create purchase orders" on public.purchase_orders;
drop policy if exists "staff update purchase orders" on public.purchase_orders;
drop policy if exists "staff view purchase items" on public.purchase_order_items;
drop policy if exists "admins create purchase items" on public.purchase_order_items;
drop policy if exists "staff update purchase items" on public.purchase_order_items;
create policy "staff view suppliers" on public.suppliers for select to authenticated using (public.is_active_staff());
create policy "admins manage suppliers" on public.suppliers for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "staff view purchase orders" on public.purchase_orders for select to authenticated using (public.is_active_staff());
create policy "admins create purchase orders" on public.purchase_orders for insert to authenticated with check (public.is_super_admin());
create policy "staff view purchase items" on public.purchase_order_items for select to authenticated using (public.is_active_staff());
create policy "admins create purchase items" on public.purchase_order_items for insert to authenticated with check (public.is_super_admin());

create or replace function public.create_purchase_order(p_supplier_id uuid, p_supplier_reference text, p_notes text, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_po_id uuid;
  v_po_number text;
  v_item jsonb;
  v_product public.products;
  v_quantity integer;
  v_cost numeric(12,2);
  v_total numeric(12,2) := 0;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can create purchase orders.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product.'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and is_active) then raise exception 'Choose an active supplier.'; end if;
  v_po_number := 'PO-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  insert into public.purchase_orders (po_number, supplier_id, supplier_reference, ordered_by, notes)
  values (v_po_number, p_supplier_id, nullif(trim(p_supplier_reference), ''), v_user_id, nullif(trim(p_notes), '')) returning id into v_po_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid and is_active;
    v_quantity := (v_item ->> 'quantity_pieces')::integer;
    v_cost := (v_item ->> 'unit_cost')::numeric;
    if not found or v_quantity <= 0 or v_cost < 0 then raise exception 'A purchase-order item is invalid.'; end if;
    insert into public.purchase_order_items (purchase_order_id, product_id, product_name, quantity_pieces, unit_cost, line_cost)
    values (v_po_id, v_product.id, v_product.name, v_quantity, v_cost, round(v_quantity * v_cost, 2));
    v_total := v_total + round(v_quantity * v_cost, 2);
  end loop;
  update public.purchase_orders set total_cost = v_total where id = v_po_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'purchase.created', 'purchase_order', v_po_id, v_po_number, jsonb_build_object('total_cost', v_total));
  return v_po_id;
end; $$;

create or replace function public.receive_purchase_order(p_purchase_order_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_po public.purchase_orders;
  v_item jsonb;
  v_po_item public.purchase_order_items;
  v_quantity integer;
  v_all_received boolean;
  v_received_total integer := 0;
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to receive inventory.'; end if;
  select * into v_po from public.purchase_orders where id = p_purchase_order_id for update;
  if not found or v_po.status not in ('ordered', 'partially_received') then raise exception 'This purchase order cannot be received.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Enter at least one received quantity.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_po_item from public.purchase_order_items where id = (v_item ->> 'purchase_order_item_id')::uuid and purchase_order_id = p_purchase_order_id for update;
    v_quantity := (v_item ->> 'quantity_pieces')::integer;
    if not found or v_quantity <= 0 or v_quantity > (v_po_item.quantity_pieces - v_po_item.received_pieces) then raise exception 'A received quantity is invalid.'; end if;
    update public.purchase_order_items set received_pieces = received_pieces + v_quantity where id = v_po_item.id;
    update public.products set cost_per_piece = v_po_item.unit_cost where id = v_po_item.product_id;
    insert into public.stock_movements (product_id, movement_type, quantity_pieces, reference_type, reference_id, note, created_by)
    values (v_po_item.product_id, 'purchase', v_quantity, 'purchase_order', p_purchase_order_id, 'Received ' || v_po.po_number, v_user_id);
    v_received_total := v_received_total + v_quantity;
  end loop;
  select bool_and(received_pieces = quantity_pieces) into v_all_received from public.purchase_order_items where purchase_order_id = p_purchase_order_id;
  update public.purchase_orders set status = case when v_all_received then 'received' else 'partially_received' end, received_at = case when v_all_received then now() else received_at end where id = p_purchase_order_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'purchase.received', 'purchase_order', p_purchase_order_id, v_po.po_number, jsonb_build_object('pieces_received', v_received_total, 'completed', v_all_received));
  return jsonb_build_object('pieces_received', v_received_total, 'completed', v_all_received);
end; $$;

revoke all on function public.create_purchase_order(uuid, text, text, jsonb) from public;
grant execute on function public.create_purchase_order(uuid, text, text, jsonb) to authenticated;
revoke all on function public.receive_purchase_order(uuid, jsonb) from public;
grant execute on function public.receive_purchase_order(uuid, jsonb) to authenticated;

create table if not exists public.cashier_closings (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  cashier_id uuid not null references public.profiles(id),
  expected_cash numeric(12,2) not null,
  actual_cash numeric(12,2) not null,
  cash_variance numeric(12,2) not null,
  expected_gcash numeric(12,2) not null,
  actual_gcash numeric(12,2) not null,
  gcash_variance numeric(12,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (business_date, cashier_id)
);

alter table public.cashier_closings enable row level security;
drop policy if exists "cashiers view own closings and admins view all" on public.cashier_closings;
drop policy if exists "cashiers create own closing" on public.cashier_closings;
create policy "cashiers view own closings and admins view all" on public.cashier_closings for select to authenticated using (cashier_id = (select auth.uid()) or public.is_super_admin());
create policy "cashiers create own closing" on public.cashier_closings for insert to authenticated with check (public.is_active_staff() and cashier_id = (select auth.uid()));

create or replace function public.close_cashier_day(p_business_date date, p_actual_cash numeric, p_actual_gcash numeric, p_notes text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_expected_cash numeric(12,2);
  v_expected_gcash numeric(12,2);
  v_id uuid;
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to close a cashier day.'; end if;
  if p_actual_cash < 0 or p_actual_gcash < 0 then raise exception 'Actual totals cannot be negative.'; end if;
  select coalesce(sum(total_amount - refunded_amount), 0) into v_expected_cash from public.sales
  where cashier_id = v_user_id and payment_method = 'cash' and status in ('completed', 'partially_refunded', 'refunded') and (completed_at at time zone 'Asia/Manila')::date = p_business_date;
  select coalesce(sum(total_amount - refunded_amount), 0) into v_expected_gcash from public.sales
  where cashier_id = v_user_id and payment_method = 'gcash' and status in ('completed', 'partially_refunded', 'refunded') and (completed_at at time zone 'Asia/Manila')::date = p_business_date;
  insert into public.cashier_closings (business_date, cashier_id, expected_cash, actual_cash, cash_variance, expected_gcash, actual_gcash, gcash_variance, notes)
  values (p_business_date, v_user_id, v_expected_cash, p_actual_cash, p_actual_cash - v_expected_cash, v_expected_gcash, p_actual_gcash, p_actual_gcash - v_expected_gcash, nullif(trim(p_notes), '')) returning id into v_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'closing.created', 'cashier_closing', v_id, p_business_date::text, jsonb_build_object('cash_variance', p_actual_cash - v_expected_cash, 'gcash_variance', p_actual_gcash - v_expected_gcash));
  return v_id;
end; $$;
revoke all on function public.close_cashier_day(date, numeric, numeric, text) from public;
grant execute on function public.close_cashier_day(date, numeric, numeric, text) to authenticated;

alter table public.sales add column if not exists fulfillment_status text not null default 'completed'
check (fulfillment_status in ('pending', 'packed', 'shipped', 'delivered', 'completed', 'cancelled'));

create or replace function public.set_initial_fulfillment_status()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.fulfillment_status := case when new.sales_channel = 'walk_in' then 'completed' else 'pending' end;
  return new;
end; $$;
drop trigger if exists sales_set_initial_fulfillment on public.sales;
create trigger sales_set_initial_fulfillment before insert on public.sales for each row execute function public.set_initial_fulfillment_status();

create or replace function public.update_fulfillment_status(p_sale_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sale public.sales;
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to update fulfillment.'; end if;
  if p_status not in ('pending', 'packed', 'shipped', 'delivered', 'completed') then raise exception 'Choose a valid fulfillment status.'; end if;
  select * into v_sale from public.sales where id = p_sale_id and sales_channel <> 'walk_in';
  if not found then raise exception 'Marketplace sale was not found.'; end if;
  update public.sales set fulfillment_status = p_status where id = p_sale_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (auth.uid(), 'sale.fulfillment_updated', 'sale', p_sale_id, v_sale.receipt_number, jsonb_build_object('from', v_sale.fulfillment_status, 'to', p_status));
end; $$;
revoke all on function public.update_fulfillment_status(uuid, text) from public;
grant execute on function public.update_fulfillment_status(uuid, text) to authenticated;

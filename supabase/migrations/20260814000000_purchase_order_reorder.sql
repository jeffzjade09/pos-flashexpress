-- Adds smart reorder recommendations on top of the existing purchase-order system
-- (public.suppliers / public.purchase_orders / public.purchase_order_items /
-- create_purchase_order / receive_purchase_order, all added in
-- 20260721080000_purchases_closing_fulfillment.sql). No new PO tables are added; the
-- reorder-review flow ends by calling the existing create_purchase_order RPC.
--
-- Three additions:
-- 1. store_settings: single-row company letterhead info (name/address/phone/sales
--    officer) for the supplier-facing PO export, which has no pricing on it by design.
-- 2. po_number_counters: backs a switch to sequential-per-day PO numbers
--    (PO-YYYYMMDD-NNN) instead of the previous random-suffix scheme. Only affects
--    numbers generated after this migration runs -- every existing po_number is
--    untouched.
-- 3. purchase_order_items.variant_label: snapshotted at creation (like the existing
--    product_name snapshot), because product_variant_attributes rows can be edited
--    later (update_inventory_product_v2 deletes and re-inserts them), so a live join
--    at print time could show a different label than what was true when a PO was
--    created and likely already matched against a paper supplier invoice.
--
-- Run after 20260813000000_notifications.sql.

create table public.store_settings (
  id boolean primary key default true,
  company_name text not null default '',
  contact_number text,
  store_address text,
  sales_officer_name text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint store_settings_singleton check (id)
);

create trigger store_settings_set_updated_at before update on public.store_settings
  for each row execute function public.set_updated_at();

alter table public.store_settings enable row level security;
create policy "staff view store settings" on public.store_settings
  for select to authenticated using (public.is_active_staff());
create policy "admins manage store settings" on public.store_settings
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

insert into public.store_settings (id, company_name, contact_number, sales_officer_name)
values (true, 'NMR Consumer Goods Trading', '09399728632', 'Renzo Fronda');

create table public.po_number_counters (
  business_date date primary key,
  last_number integer not null default 0
);

alter table public.po_number_counters enable row level security;
create policy "admins view po counters" on public.po_number_counters
  for select to authenticated using (public.is_super_admin());
create policy "admins update po counters" on public.po_number_counters
  for insert to authenticated with check (public.is_super_admin());
create policy "admins increment po counters" on public.po_number_counters
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

alter table public.purchase_order_items add column if not exists variant_label text;

create or replace function public.create_purchase_order(p_supplier_id uuid, p_supplier_reference text, p_notes text, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_po_id uuid;
  v_po_number text;
  v_sequence integer;
  v_item jsonb;
  v_product public.products;
  v_variant_label text;
  v_quantity integer;
  v_cost numeric(12,2);
  v_total numeric(12,2) := 0;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can create purchase orders.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product.'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and is_active) then raise exception 'Choose an active supplier.'; end if;

  insert into public.po_number_counters (business_date, last_number)
  values ((now() at time zone 'Asia/Manila')::date, 1)
  on conflict (business_date) do update set last_number = po_number_counters.last_number + 1
  returning last_number into v_sequence;
  v_po_number := 'PO-' || to_char((now() at time zone 'Asia/Manila')::date, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 3, '0');

  insert into public.purchase_orders (po_number, supplier_id, supplier_reference, ordered_by, notes)
  values (v_po_number, p_supplier_id, nullif(trim(p_supplier_reference), ''), v_user_id, nullif(trim(p_notes), '')) returning id into v_po_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid and is_active;
    v_quantity := (v_item ->> 'quantity_pieces')::integer;
    v_cost := (v_item ->> 'unit_cost')::numeric;
    if not found or v_quantity <= 0 or v_cost < 0 then raise exception 'A purchase-order item is invalid.'; end if;
    select string_agg(pva.variant_value, ' / ' order by pva.position) into v_variant_label
    from public.product_variant_attributes pva where pva.product_id = v_product.id;
    insert into public.purchase_order_items (purchase_order_id, product_id, product_name, variant_label, quantity_pieces, unit_cost, line_cost)
    values (v_po_id, v_product.id, v_product.name, v_variant_label, v_quantity, v_cost, round(v_quantity * v_cost, 2));
    v_total := v_total + round(v_quantity * v_cost, 2);
  end loop;
  update public.purchase_orders set total_cost = v_total where id = v_po_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'purchase.created', 'purchase_order', v_po_id, v_po_number, jsonb_build_object('total_cost', v_total));
  return v_po_id;
end; $$;

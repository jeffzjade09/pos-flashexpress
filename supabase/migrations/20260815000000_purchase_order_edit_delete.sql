-- Adds Edit and soft-Delete to the existing purchase-order system
-- (public.suppliers / public.purchase_orders / public.purchase_order_items /
-- create_purchase_order / receive_purchase_order, from
-- 20260721080000_purchases_closing_fulfillment.sql). Both new RPCs are security invoker
-- and admin-gated, mirroring update_inventory_product_v2's shape exactly (invoker,
-- explicit is_super_admin() check, delete-then-reinsert of a child table, before/after
-- audit snapshot) -- so this needs matching RLS policies, not a security definer bypass.
--
-- Editing/deleting is only allowed while status = 'ordered'. This is airtight, not just
-- convenient: receive_purchase_order unconditionally flips status away from 'ordered' the
-- instant any receiving happens, so status = 'ordered' and a nonzero received_pieces on
-- any item can never coexist -- deleting and reinserting items at that point can never
-- lose real receiving data.
--
-- Deleting a PO also flips status to 'cancelled' (an existing enum value with no RPC that
-- ever set it before now), so receive_purchase_order's own existing
-- `status not in ('ordered', 'partially_received')` check automatically blocks anyone from
-- later receiving a deleted PO -- no change needed to that function.
--
-- Run after 20260814000000_purchase_order_reorder.sql.

alter table public.purchase_orders add column if not exists updated_by uuid references public.profiles(id);
alter table public.purchase_orders add column if not exists deleted_at timestamptz;
alter table public.purchase_orders add column if not exists deleted_by uuid references public.profiles(id);
alter table public.purchase_orders add column if not exists deletion_reason text;

-- Multiple permissive policies for the same command OR together, so hiding deleted rows
-- from staff requires replacing the existing unrestricted select policy, not adding
-- beside it -- otherwise staff would still see everything through the old policy.
drop policy if exists "staff view purchase orders" on public.purchase_orders;
create policy "staff view active purchase orders" on public.purchase_orders
  for select to authenticated using (public.is_active_staff() and deleted_at is null);
create policy "admins view all purchase orders" on public.purchase_orders
  for select to authenticated using (public.is_super_admin());
create policy "admins update purchase orders" on public.purchase_orders
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "staff view purchase items" on public.purchase_order_items;
create policy "staff view active purchase items" on public.purchase_order_items
  for select to authenticated using (
    public.is_active_staff() and exists (
      select 1 from public.purchase_orders po where po.id = purchase_order_id and po.deleted_at is null
    )
  );
create policy "admins view all purchase items" on public.purchase_order_items
  for select to authenticated using (public.is_super_admin());
create policy "admins update purchase items" on public.purchase_order_items
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "admins delete purchase items" on public.purchase_order_items
  for delete to authenticated using (public.is_super_admin());

create function public.update_purchase_order(
  p_purchase_order_id uuid,
  p_supplier_id uuid,
  p_supplier_reference text,
  p_notes text,
  p_items jsonb
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_po public.purchase_orders;
  v_before_items jsonb;
  v_item jsonb;
  v_product public.products;
  v_variant_label text;
  v_quantity integer;
  v_cost numeric(12,2);
  v_total numeric(12,2) := 0;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can edit purchase orders.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product.'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and is_active) then raise exception 'Choose an active supplier.'; end if;

  select * into v_po from public.purchase_orders where id = p_purchase_order_id for update;
  if not found or v_po.deleted_at is not null then raise exception 'Purchase order was not found.'; end if;
  if v_po.status <> 'ordered' then raise exception 'This purchase order can no longer be edited.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_name', product_name, 'variant_label', variant_label, 'quantity_pieces', quantity_pieces, 'unit_cost', unit_cost)), '[]'::jsonb)
  into v_before_items from public.purchase_order_items where purchase_order_id = p_purchase_order_id;

  delete from public.purchase_order_items where purchase_order_id = p_purchase_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid and is_active;
    v_quantity := (v_item ->> 'quantity_pieces')::integer;
    v_cost := (v_item ->> 'unit_cost')::numeric;
    if not found or v_quantity <= 0 or v_cost < 0 then raise exception 'A purchase-order item is invalid.'; end if;
    select string_agg(pva.variant_value, ' / ' order by pva.position) into v_variant_label
    from public.product_variant_attributes pva where pva.product_id = v_product.id;
    insert into public.purchase_order_items (purchase_order_id, product_id, product_name, variant_label, quantity_pieces, unit_cost, line_cost)
    values (p_purchase_order_id, v_product.id, v_product.name, v_variant_label, v_quantity, v_cost, round(v_quantity * v_cost, 2));
    v_total := v_total + round(v_quantity * v_cost, 2);
  end loop;

  update public.purchase_orders
  set supplier_id = p_supplier_id,
      supplier_reference = nullif(trim(p_supplier_reference), ''),
      notes = nullif(trim(p_notes), ''),
      total_cost = v_total,
      updated_by = v_user_id
  where id = p_purchase_order_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (
    v_user_id, 'purchase.updated', 'purchase_order', p_purchase_order_id, v_po.po_number,
    jsonb_build_object(
      'before', jsonb_build_object('supplier_id', v_po.supplier_id, 'supplier_reference', v_po.supplier_reference, 'notes', v_po.notes, 'total_cost', v_po.total_cost, 'items', v_before_items),
      'after', jsonb_build_object('supplier_id', p_supplier_id, 'supplier_reference', nullif(trim(p_supplier_reference), ''), 'notes', nullif(trim(p_notes), ''), 'total_cost', v_total, 'items', p_items)
    )
  );
end; $$;

revoke all on function public.update_purchase_order(uuid, uuid, text, text, jsonb) from public;
grant execute on function public.update_purchase_order(uuid, uuid, text, text, jsonb) to authenticated;

create function public.delete_purchase_order(p_purchase_order_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_po public.purchase_orders;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can delete purchase orders.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A deletion reason is required.'; end if;

  select * into v_po from public.purchase_orders where id = p_purchase_order_id for update;
  if not found or v_po.deleted_at is not null then raise exception 'Purchase order was not found.'; end if;
  if v_po.status <> 'ordered' then raise exception 'This purchase order can no longer be deleted.'; end if;

  update public.purchase_orders
  set status = 'cancelled', deleted_at = now(), deleted_by = v_user_id, deletion_reason = trim(p_reason)
  where id = p_purchase_order_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'purchase.deleted', 'purchase_order', p_purchase_order_id, v_po.po_number, jsonb_build_object('reason', trim(p_reason), 'total_cost', v_po.total_cost));
end; $$;

revoke all on function public.delete_purchase_order(uuid, text) from public;
grant execute on function public.delete_purchase_order(uuid, text) to authenticated;

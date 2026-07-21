-- Adds a separately tracked 3% non-VAT percentage charge to new POS sales.
-- Existing sales keep a zero tax rate and are not changed.
-- Run after 20260721080000_purchases_closing_fulfillment.sql.

alter table public.sales add column if not exists tax_rate numeric(6,5);
alter table public.sales add column if not exists tax_amount numeric(12,2) not null default 0;
update public.sales set tax_rate = 0 where tax_rate is null;
alter table public.sales alter column tax_rate set default 0.03;
alter table public.sales alter column tax_rate set not null;
alter table public.sales drop constraint if exists sales_tax_rate_check;
alter table public.sales add constraint sales_tax_rate_check check (tax_rate >= 0 and tax_rate <= 1);
alter table public.sales drop constraint if exists sales_tax_amount_check;
alter table public.sales add constraint sales_tax_amount_check check (tax_amount >= 0);

alter table public.sale_items add column if not exists tax_amount numeric(12,2) not null default 0;
alter table public.sale_items add column if not exists refunded_tax_amount numeric(12,2) not null default 0;
alter table public.sale_items drop constraint if exists sale_items_tax_amount_check;
alter table public.sale_items add constraint sale_items_tax_amount_check check (tax_amount >= 0);
alter table public.sale_items drop constraint if exists sale_items_refunded_tax_amount_check;
alter table public.sale_items add constraint sale_items_refunded_tax_amount_check check (refunded_tax_amount >= 0 and refunded_tax_amount <= tax_amount);

alter table public.sale_refund_items add column if not exists tax_refund_amount numeric(12,2) not null default 0;
alter table public.sale_refund_items drop constraint if exists sale_refund_items_tax_refund_amount_check;
alter table public.sale_refund_items add constraint sale_refund_items_tax_refund_amount_check check (tax_refund_amount >= 0);

create or replace function public.complete_pos_sale(
  p_channel text,
  p_external_order_id text,
  p_amount_tendered numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sale_id uuid;
  v_receipt_number text;
  v_item jsonb;
  v_unit_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_unit_name text;
  v_conversion integer;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_line_tax numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2);
  v_tax_rate numeric(6,5) := 0.03;
  v_tendered numeric(12,2);
  v_change numeric(12,2);
  v_current_stock integer;
  v_requested_pieces integer;
  v_line_count integer := 0;
  v_is_gcash boolean := p_channel = 'walk_in' and nullif(trim(p_external_order_id), '') is not null;
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to complete sales.'; end if;
  if p_channel not in ('walk_in', 'tiktok', 'lazada', 'shopee') then raise exception 'Choose a valid sales channel.'; end if;
  if p_channel <> 'walk_in' and nullif(trim(p_external_order_id), '') is null then raise exception 'Enter the marketplace order ID.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item to the cart.'; end if;

  v_receipt_number := 'FP-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.sales (receipt_number, cashier_id, status, payment_method, sales_channel, external_order_id, payment_reference, tax_rate)
  values (
    v_receipt_number, v_user_id, 'draft',
    case when p_channel <> 'walk_in' then 'marketplace' when v_is_gcash then 'gcash' else 'cash' end,
    p_channel,
    case when p_channel = 'walk_in' then null else trim(p_external_order_id) end,
    case when v_is_gcash then trim(p_external_order_id) else null end,
    v_tax_rate
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_unit_id := (v_item ->> 'product_unit_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'One of the cart items is invalid.';
    end;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Item quantities must be positive whole numbers.'; end if;

    select p.id, p.name, u.name, u.conversion_to_piece, u.selling_price
    into v_product_id, v_product_name, v_unit_name, v_conversion, v_unit_price
    from public.product_units u join public.products p on p.id = u.product_id
    where u.id = v_unit_id and p.is_active = true for update of p;
    if not found then raise exception 'A cart product is no longer available.'; end if;

    v_requested_pieces := v_quantity * v_conversion;
    select coalesce(sum(quantity_pieces), 0)::integer into v_current_stock
    from public.stock_movements where product_id = v_product_id;
    if v_current_stock < v_requested_pieces then raise exception 'Not enough stock for %. Available: % pieces.', v_product_name, v_current_stock; end if;

    v_line_total := round(v_unit_price * v_quantity, 2);
    v_line_tax := round(v_line_total * v_tax_rate, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_tax := v_tax + v_line_tax;
    v_line_count := v_line_count + 1;

    insert into public.sale_items (sale_id, product_id, product_unit_id, product_name, unit_name, quantity, conversion_to_piece, unit_price, line_total, tax_amount)
    values (v_sale_id, v_product_id, v_unit_id, v_product_name, v_unit_name, v_quantity, v_conversion, v_unit_price, v_line_total, v_line_tax);
    insert into public.stock_movements (product_id, movement_type, quantity_pieces, reference_type, reference_id, note, created_by)
    values (
      v_product_id, 'sale', -v_requested_pieces, 'sale', v_sale_id,
      case when v_is_gcash then 'Walk-in GCash sale ' || v_receipt_number when p_channel = 'walk_in' then 'Walk-in cash sale ' || v_receipt_number else initcap(p_channel) || ' order ' || trim(p_external_order_id) end,
      v_user_id
    );
  end loop;

  v_total := v_subtotal + v_tax;
  if p_channel = 'walk_in' and not v_is_gcash then
    v_tendered := round(coalesce(p_amount_tendered, 0), 2);
    if v_tendered < v_total then raise exception 'Cash tendered is less than the order total of %.', v_total; end if;
  else
    v_tendered := v_total;
  end if;
  v_change := v_tendered - v_total;

  update public.sales set status = 'completed', subtotal = v_subtotal, tax_rate = v_tax_rate, tax_amount = v_tax,
    total_amount = v_total, amount_tendered = v_tendered, change_amount = v_change, completed_at = now()
  where id = v_sale_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'sale.completed', 'sale', v_sale_id, v_receipt_number, jsonb_build_object(
    'channel', p_channel,
    'payment_method', case when p_channel <> 'walk_in' then 'marketplace' when v_is_gcash then 'gcash' else 'cash' end,
    'external_order_id', case when p_channel = 'walk_in' then null else trim(p_external_order_id) end,
    'payment_reference', case when v_is_gcash then trim(p_external_order_id) else null end,
    'subtotal', v_subtotal, 'tax_rate', v_tax_rate, 'tax_amount', v_tax, 'total_amount', v_total,
    'amount_tendered', v_tendered, 'change_amount', v_change, 'line_count', v_line_count
  ));

  return jsonb_build_object('sale_id', v_sale_id, 'receipt_number', v_receipt_number, 'subtotal', v_subtotal,
    'tax_rate', v_tax_rate, 'tax_amount', v_tax, 'total_amount', v_total, 'amount_tendered', v_tendered,
    'change_amount', v_change, 'payment_method', case when p_channel <> 'walk_in' then 'marketplace' when v_is_gcash then 'gcash' else 'cash' end,
    'completed_at', now());
end;
$$;

revoke all on function public.complete_pos_sale(text, text, numeric, jsonb) from public;
grant execute on function public.complete_pos_sale(text, text, numeric, jsonb) to authenticated;

create or replace function public.refund_sale_items(p_sale_id uuid, p_reason text, p_restock boolean, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_sale public.sales;
  v_refund_id uuid;
  v_item jsonb;
  v_sale_item public.sale_items;
  v_quantity integer;
  v_base_refund numeric(12,2);
  v_tax_refund numeric(12,2);
  v_refund_amount numeric(12,2);
  v_reversed_cost numeric(12,2);
  v_total_refund numeric(12,2) := 0;
  v_total_tax_refund numeric(12,2) := 0;
  v_all_refunded boolean;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can process refunds.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a reason for this refund.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Select at least one item to refund.'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found or v_sale.status not in ('completed', 'partially_refunded') then raise exception 'This sale is not available for refund.'; end if;

  insert into public.sale_refunds (sale_id, processed_by, refund_amount, reason, restock_items)
  values (p_sale_id, v_user_id, 0, trim(p_reason), p_restock) returning id into v_refund_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_quantity := (v_item ->> 'quantity')::integer;
      select * into v_sale_item from public.sale_items
      where id = (v_item ->> 'sale_item_id')::uuid and sale_id = p_sale_id for update;
    exception when others then raise exception 'One of the refund items is invalid.'; end;
    if not found then raise exception 'A refund item was not found.'; end if;
    if v_quantity <= 0 or v_quantity > (v_sale_item.quantity - v_sale_item.refunded_quantity) then raise exception 'Refund quantity is invalid for %.', v_sale_item.product_name; end if;

    v_base_refund := round(v_sale_item.unit_price * v_quantity, 2);
    if v_sale_item.refunded_quantity + v_quantity = v_sale_item.quantity then
      v_tax_refund := v_sale_item.tax_amount - v_sale_item.refunded_tax_amount;
    else
      v_tax_refund := least(v_sale_item.tax_amount - v_sale_item.refunded_tax_amount, round(v_sale_item.tax_amount * v_quantity / v_sale_item.quantity, 2));
    end if;
    v_refund_amount := v_base_refund + v_tax_refund;
    v_reversed_cost := case when p_restock then round(v_sale_item.cost_per_piece * v_sale_item.conversion_to_piece * v_quantity, 2) else 0 end;
    v_total_refund := v_total_refund + v_refund_amount;
    v_total_tax_refund := v_total_tax_refund + v_tax_refund;

    update public.sale_items set refunded_quantity = refunded_quantity + v_quantity,
      refunded_tax_amount = refunded_tax_amount + v_tax_refund where id = v_sale_item.id;
    insert into public.sale_refund_items (refund_id, sale_item_id, quantity, refund_amount, tax_refund_amount, reversed_cost, restocked)
    values (v_refund_id, v_sale_item.id, v_quantity, v_refund_amount, v_tax_refund, v_reversed_cost, p_restock);

    if p_restock then
      insert into public.stock_movements (product_id, movement_type, quantity_pieces, reference_type, reference_id, note, created_by)
      values (v_sale_item.product_id, 'return', v_quantity * v_sale_item.conversion_to_piece, 'sale_refund', v_refund_id, 'Refund: ' || trim(p_reason), v_user_id);
    end if;
  end loop;

  update public.sale_refunds set refund_amount = v_total_refund where id = v_refund_id;
  select bool_and(refunded_quantity = quantity) into v_all_refunded from public.sale_items where sale_id = p_sale_id;
  update public.sales set refunded_amount = refunded_amount + v_total_refund,
    status = case when v_all_refunded then 'refunded'::public.sale_status else 'partially_refunded'::public.sale_status end
  where id = p_sale_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'sale.refunded', 'sale', p_sale_id, v_sale.receipt_number,
    jsonb_build_object('refund_id', v_refund_id, 'amount', v_total_refund, 'tax_refund', v_total_tax_refund, 'reason', trim(p_reason), 'restocked', p_restock));
  return jsonb_build_object('refund_id', v_refund_id, 'refund_amount', v_total_refund, 'tax_refund', v_total_tax_refund, 'fully_refunded', v_all_refunded);
end;
$$;

revoke all on function public.refund_sale_items(uuid, text, boolean, jsonb) from public;
grant execute on function public.refund_sale_items(uuid, text, boolean, jsonb) to authenticated;

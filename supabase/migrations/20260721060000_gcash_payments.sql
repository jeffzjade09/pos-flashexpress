-- Adds GCash references to walk-in checkout.
-- Run after 20260721050000_walk_in_pos.sql.

alter table public.sales add column payment_reference text;

create unique index sales_gcash_payment_reference_uidx
on public.sales (lower(payment_reference))
where payment_method = 'gcash' and payment_reference is not null;

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
  v_total numeric(12,2) := 0;
  v_tendered numeric(12,2);
  v_change numeric(12,2);
  v_current_stock integer;
  v_requested_pieces integer;
  v_line_count integer := 0;
  v_is_gcash boolean := p_channel = 'walk_in' and nullif(trim(p_external_order_id), '') is not null;
begin
  if not public.is_active_staff() then
    raise exception 'You do not have permission to complete sales.';
  end if;

  if p_channel not in ('walk_in', 'tiktok', 'lazada', 'shopee') then
    raise exception 'Choose a valid sales channel.';
  end if;

  if p_channel <> 'walk_in' and nullif(trim(p_external_order_id), '') is null then
    raise exception 'Enter the marketplace order ID.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the cart.';
  end if;

  v_receipt_number := 'FP-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.sales (
    receipt_number, cashier_id, status, payment_method, sales_channel,
    external_order_id, payment_reference
  ) values (
    v_receipt_number,
    v_user_id,
    'draft',
    case when p_channel <> 'walk_in' then 'marketplace' when v_is_gcash then 'gcash' else 'cash' end,
    p_channel,
    case when p_channel = 'walk_in' then null else trim(p_external_order_id) end,
    case when v_is_gcash then trim(p_external_order_id) else null end
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_unit_id := (v_item ->> 'product_unit_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'One of the cart items is invalid.';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Item quantities must be positive whole numbers.';
    end if;

    select p.id, p.name, u.name, u.conversion_to_piece, u.selling_price
    into v_product_id, v_product_name, v_unit_name, v_conversion, v_unit_price
    from public.product_units u
    join public.products p on p.id = u.product_id
    where u.id = v_unit_id and p.is_active = true
    for update of p;

    if not found then
      raise exception 'A cart product is no longer available.';
    end if;

    v_requested_pieces := v_quantity * v_conversion;
    select coalesce(sum(quantity_pieces), 0)::integer into v_current_stock
    from public.stock_movements where product_id = v_product_id;

    if v_current_stock < v_requested_pieces then
      raise exception 'Not enough stock for %. Available: % pieces.', v_product_name, v_current_stock;
    end if;

    v_line_total := round(v_unit_price * v_quantity, 2);
    v_total := v_total + v_line_total;
    v_line_count := v_line_count + 1;

    insert into public.sale_items (
      sale_id, product_id, product_unit_id, product_name, unit_name,
      quantity, conversion_to_piece, unit_price, line_total
    ) values (
      v_sale_id, v_product_id, v_unit_id, v_product_name, v_unit_name,
      v_quantity, v_conversion, v_unit_price, v_line_total
    );

    insert into public.stock_movements (
      product_id, movement_type, quantity_pieces, reference_type,
      reference_id, note, created_by
    ) values (
      v_product_id,
      'sale',
      -v_requested_pieces,
      'sale',
      v_sale_id,
      case
        when v_is_gcash then 'Walk-in GCash sale ' || v_receipt_number
        when p_channel = 'walk_in' then 'Walk-in cash sale ' || v_receipt_number
        else initcap(p_channel) || ' order ' || trim(p_external_order_id)
      end,
      v_user_id
    );
  end loop;

  if p_channel = 'walk_in' and not v_is_gcash then
    v_tendered := round(coalesce(p_amount_tendered, 0), 2);
    if v_tendered < v_total then
      raise exception 'Cash tendered is less than the order total of %.', v_total;
    end if;
  else
    v_tendered := v_total;
  end if;
  v_change := v_tendered - v_total;

  update public.sales
  set status = 'completed', subtotal = v_total, total_amount = v_total,
      amount_tendered = v_tendered, change_amount = v_change, completed_at = now()
  where id = v_sale_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, entity_name, details
  ) values (
    v_user_id, 'sale.completed', 'sale', v_sale_id, v_receipt_number,
    jsonb_build_object(
      'channel', p_channel,
      'payment_method', case when p_channel <> 'walk_in' then 'marketplace' when v_is_gcash then 'gcash' else 'cash' end,
      'external_order_id', case when p_channel = 'walk_in' then null else trim(p_external_order_id) end,
      'payment_reference', case when v_is_gcash then trim(p_external_order_id) else null end,
      'total_amount', v_total,
      'amount_tendered', v_tendered,
      'change_amount', v_change,
      'line_count', v_line_count
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'total_amount', v_total,
    'amount_tendered', v_tendered,
    'change_amount', v_change,
    'payment_method', case when p_channel <> 'walk_in' then 'marketplace' when v_is_gcash then 'gcash' else 'cash' end,
    'completed_at', now()
  );
end;
$$;

revoke all on function public.complete_pos_sale(text, text, numeric, jsonb) from public;
grant execute on function public.complete_pos_sale(text, text, numeric, jsonb) to authenticated;

-- Adds Credit Card as a third walk-in payment method alongside Cash and GCash.
-- GCash was previously inferred purely from whether a reference string was supplied
-- (p_external_order_id non-blank); a third method can't be distinguished that way, so
-- complete_pos_sale now takes an explicit p_payment_method instead. The bank name for a
-- credit-card sale is stored in the same payment_reference column GCash already uses.
-- payment_method itself is unconstrained text (no enum/check), so no column changes
-- are needed for the new value.
-- Run after 20260808000000_product_variant_families.sql.

drop function if exists public.complete_pos_sale(text, text, numeric, text, numeric, jsonb);

create function public.complete_pos_sale(
  p_channel text,
  p_external_order_id text,
  p_payment_method text,
  p_amount_tendered numeric,
  p_discount_type text,
  p_discount_value numeric,
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
  v_payment_method text;
  v_item jsonb;
  v_unit_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_unit_name text;
  v_conversion integer;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_line_discount numeric(12,2);
  v_line_tax numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount_type text := coalesce(p_discount_type, 'none');
  v_discount_value numeric(12,2) := round(coalesce(p_discount_value, 0), 2);
  v_discount numeric(12,2) := 0;
  v_taxable_subtotal numeric(12,2);
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2);
  v_tax_rate numeric(6,5) := 0.03;
  v_tendered numeric(12,2);
  v_change numeric(12,2);
  v_current_stock integer;
  v_requested_pieces integer;
  v_line_count integer := 0;
  v_line_index integer := 0;
  v_remaining_discount numeric(12,2);
  v_remaining_tax numeric(12,2);
  v_sale_item record;
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to complete sales.'; end if;
  if p_channel not in ('walk_in', 'tiktok', 'lazada', 'shopee') then raise exception 'Choose a valid sales channel.'; end if;
  if p_channel <> 'walk_in' and nullif(trim(p_external_order_id), '') is null then raise exception 'Enter the marketplace order ID.'; end if;
  if p_channel = 'walk_in' and coalesce(p_payment_method, '') not in ('cash', 'gcash', 'credit_card') then
    raise exception 'Choose a valid payment method.';
  end if;
  if p_channel = 'walk_in' and p_payment_method = 'gcash' and nullif(trim(p_external_order_id), '') is null then
    raise exception 'Enter the GCash reference ID.';
  end if;
  if p_channel = 'walk_in' and p_payment_method = 'credit_card' and nullif(trim(p_external_order_id), '') is null then
    raise exception 'Enter the bank name.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item to the cart.'; end if;
  if v_discount_type not in ('none', 'percentage', 'fixed') or v_discount_value < 0 then raise exception 'Enter a valid discount.'; end if;
  if v_discount_type = 'percentage' and v_discount_value > 100 then raise exception 'Discount percentage cannot exceed 100%%.'; end if;

  v_payment_method := case when p_channel <> 'walk_in' then 'marketplace' else p_payment_method end;
  v_receipt_number := 'FP-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.sales (receipt_number, cashier_id, status, payment_method, sales_channel, external_order_id, payment_reference, tax_rate)
  values (
    v_receipt_number, v_user_id, 'draft',
    v_payment_method,
    p_channel,
    case when p_channel = 'walk_in' then null else trim(p_external_order_id) end,
    case when p_channel = 'walk_in' and p_payment_method in ('gcash', 'credit_card') then trim(p_external_order_id) else null end,
    v_tax_rate
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_unit_id := (v_item ->> 'product_unit_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then raise exception 'One of the cart items is invalid.'; end;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Item quantities must be positive whole numbers.'; end if;

    select p.id,
           p.name || coalesce(' — ' || (
             select string_agg(pva.variant_value, ' / ' order by pva.position)
             from public.product_variant_attributes pva
             where pva.product_id = p.id
           ), ''),
           u.name, u.conversion_to_piece, u.selling_price
    into v_product_id, v_product_name, v_unit_name, v_conversion, v_unit_price
    from public.product_units u join public.products p on p.id = u.product_id
    where u.id = v_unit_id and u.is_active = true and p.is_active = true for update of p;
    if not found then raise exception 'A cart product is no longer available.'; end if;

    v_requested_pieces := v_quantity * v_conversion;
    select coalesce(sum(quantity_pieces), 0)::integer into v_current_stock
    from public.stock_movements where product_id = v_product_id;
    if v_current_stock < v_requested_pieces then raise exception 'Not enough stock for %. Available: % pieces.', v_product_name, v_current_stock; end if;

    v_line_total := round(v_unit_price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_line_count := v_line_count + 1;

    insert into public.sale_items (sale_id, product_id, product_unit_id, product_name, unit_name, quantity, conversion_to_piece, unit_price, line_total, tax_amount)
    values (v_sale_id, v_product_id, v_unit_id, v_product_name, v_unit_name, v_quantity, v_conversion, v_unit_price, v_line_total, 0);
    insert into public.stock_movements (product_id, movement_type, quantity_pieces, reference_type, reference_id, note, created_by)
    values (
      v_product_id, 'sale', -v_requested_pieces, 'sale', v_sale_id,
      case
        when p_channel = 'walk_in' and v_payment_method = 'gcash' then 'Walk-in GCash sale ' || v_receipt_number
        when p_channel = 'walk_in' and v_payment_method = 'credit_card' then 'Walk-in card sale ' || v_receipt_number
        when p_channel = 'walk_in' then 'Walk-in cash sale ' || v_receipt_number
        else initcap(p_channel) || ' order ' || trim(p_external_order_id)
      end,
      v_user_id
    );
  end loop;

  if v_discount_type = 'none' then
    v_discount_value := 0;
    v_discount := 0;
  elsif v_discount_type = 'percentage' then
    v_discount := round(v_subtotal * v_discount_value / 100, 2);
  else
    v_discount := v_discount_value;
  end if;
  if v_discount > v_subtotal then raise exception 'Discount cannot exceed the merchandise subtotal of %.', v_subtotal; end if;

  v_taxable_subtotal := v_subtotal - v_discount;
  v_tax := round(v_taxable_subtotal * v_tax_rate, 2);
  v_remaining_discount := v_discount;
  v_remaining_tax := v_tax;

  for v_sale_item in
    select id, line_total from public.sale_items where sale_id = v_sale_id order by created_at, id
  loop
    v_line_index := v_line_index + 1;
    if v_line_index = v_line_count then
      v_line_discount := v_remaining_discount;
      v_line_tax := v_remaining_tax;
    else
      v_line_discount := least(v_remaining_discount, round(v_discount * v_sale_item.line_total / nullif(v_subtotal, 0), 2));
      v_line_tax := case when v_taxable_subtotal = 0 then 0 else least(v_remaining_tax, round(v_tax * (v_sale_item.line_total - v_line_discount) / v_taxable_subtotal, 2)) end;
    end if;
    update public.sale_items set discount_amount = v_line_discount, tax_amount = v_line_tax where id = v_sale_item.id;
    v_remaining_discount := v_remaining_discount - v_line_discount;
    v_remaining_tax := v_remaining_tax - v_line_tax;
  end loop;

  v_total := v_taxable_subtotal + v_tax;
  if p_channel = 'walk_in' and v_payment_method = 'cash' then
    v_tendered := round(coalesce(p_amount_tendered, 0), 2);
    if v_tendered < v_total then raise exception 'Cash tendered is less than the order total of %.', v_total; end if;
  else
    v_tendered := v_total;
  end if;
  v_change := v_tendered - v_total;

  update public.sales set status = 'completed', subtotal = v_subtotal, discount_type = v_discount_type,
    discount_value = v_discount_value, discount_amount = v_discount, tax_rate = v_tax_rate, tax_amount = v_tax,
    total_amount = v_total, amount_tendered = v_tendered, change_amount = v_change, completed_at = now()
  where id = v_sale_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'sale.completed', 'sale', v_sale_id, v_receipt_number, jsonb_build_object(
    'channel', p_channel,
    'payment_method', v_payment_method,
    'external_order_id', case when p_channel = 'walk_in' then null else trim(p_external_order_id) end,
    'payment_reference', case when p_channel = 'walk_in' and v_payment_method in ('gcash', 'credit_card') then trim(p_external_order_id) else null end,
    'subtotal', v_subtotal, 'discount_type', v_discount_type, 'discount_value', v_discount_value,
    'discount_amount', v_discount, 'tax_rate', v_tax_rate, 'tax_amount', v_tax, 'total_amount', v_total,
    'amount_tendered', v_tendered, 'change_amount', v_change, 'line_count', v_line_count
  ));

  return jsonb_build_object('sale_id', v_sale_id, 'receipt_number', v_receipt_number, 'subtotal', v_subtotal,
    'discount_type', v_discount_type, 'discount_value', v_discount_value, 'discount_amount', v_discount,
    'tax_rate', v_tax_rate, 'tax_amount', v_tax, 'total_amount', v_total, 'amount_tendered', v_tendered,
    'change_amount', v_change, 'payment_method', v_payment_method,
    'completed_at', now());
end;
$$;

revoke all on function public.complete_pos_sale(text, text, text, numeric, text, numeric, jsonb) from public;
grant execute on function public.complete_pos_sale(text, text, text, numeric, text, numeric, jsonb) to authenticated;

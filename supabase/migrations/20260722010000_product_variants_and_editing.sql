-- Adds product variants and a safe full product-master editing workflow.
-- Stock quantities remain separate and must still be changed through stock movements.
-- Run after 20260721090000_non_vat_percentage_tax.sql.

alter table public.products add column if not exists variant text;
alter table public.product_units add column if not exists is_active boolean not null default true;

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
  coalesce(sum(sm.quantity_pieces), 0)::integer as stock_on_hand,
  p.variant,
  p.cost_per_piece
from public.products p
left join public.categories c on c.id = p.category_id
left join public.stock_movements sm on sm.product_id = p.id
group by p.id, c.name;

grant select on public.product_stock to authenticated;

create or replace function public.audit_product_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
    values (
      new.created_by,
      'product.created',
      'product',
      new.id,
      new.name,
      jsonb_build_object('sku', new.sku, 'variant', new.variant, 'barcode', new.barcode)
    );
  elsif tg_op = 'UPDATE' and old.is_active is distinct from new.is_active then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
    values (
      auth.uid(),
      case when new.is_active then 'product.restored' else 'product.deleted' end,
      'product',
      new.id,
      new.name,
      jsonb_build_object('sku', new.sku, 'variant', new.variant)
    );
  end if;
  return new;
end;
$$;

create or replace function public.create_inventory_product_v2(
  p_name text,
  p_variant text,
  p_sku text,
  p_barcode text,
  p_category_name text,
  p_cost_per_piece numeric,
  p_piece_price numeric,
  p_pieces_per_box integer,
  p_box_price numeric,
  p_opening_boxes integer,
  p_opening_loose_pieces integer,
  p_low_stock_threshold integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_category_id uuid;
  v_product_id uuid;
  v_opening_quantity integer;
begin
  if not public.is_active_staff() then
    raise exception 'You do not have permission to create products.';
  end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required.'; end if;
  if nullif(trim(p_sku), '') is null then raise exception 'SKU is required.'; end if;
  if p_cost_per_piece < 0 or p_piece_price < 0 or p_box_price < 0 then raise exception 'Prices cannot be negative.'; end if;
  if p_pieces_per_box < 1 or p_opening_boxes < 0 or p_opening_loose_pieces < 0 or p_low_stock_threshold < 0 then
    raise exception 'Stock quantities must be valid positive numbers.';
  end if;
  if p_pieces_per_box > 1 and p_box_price <= 0 then raise exception 'Box price is required when a box contains multiple pieces.'; end if;

  if nullif(trim(p_category_name), '') is not null then
    insert into public.categories (name)
    values (initcap(trim(p_category_name)))
    on conflict (name) do update set is_active = true
    returning id into v_category_id;
  end if;

  insert into public.products (
    category_id, sku, barcode, name, variant, cost_per_piece, low_stock_threshold, created_by
  ) values (
    v_category_id,
    upper(trim(p_sku)),
    nullif(trim(p_barcode), ''),
    trim(p_name),
    nullif(trim(p_variant), ''),
    p_cost_per_piece,
    p_low_stock_threshold,
    v_user_id
  ) returning id into v_product_id;

  insert into public.product_units (product_id, name, conversion_to_piece, selling_price, barcode, is_default, is_active)
  values (v_product_id, 'Piece', 1, p_piece_price, null, true, true);

  if p_pieces_per_box > 1 then
    insert into public.product_units (product_id, name, conversion_to_piece, selling_price, barcode, is_default, is_active)
    values (v_product_id, 'Box', p_pieces_per_box, p_box_price, null, false, true);
  end if;

  v_opening_quantity := (p_opening_boxes * p_pieces_per_box) + p_opening_loose_pieces;
  if v_opening_quantity > 0 then
    insert into public.stock_movements (
      product_id, movement_type, quantity_pieces, reference_type, note, created_by
    ) values (
      v_product_id, 'opening', v_opening_quantity, 'product_setup', 'Opening inventory', v_user_id
    );
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.create_inventory_product_v2(text, text, text, text, text, numeric, numeric, integer, numeric, integer, integer, integer) from public;
grant execute on function public.create_inventory_product_v2(text, text, text, text, text, numeric, numeric, integer, numeric, integer, integer, integer) to authenticated;

create or replace function public.update_inventory_product(
  p_product_id uuid,
  p_name text,
  p_variant text,
  p_sku text,
  p_barcode text,
  p_category_name text,
  p_cost_per_piece numeric,
  p_piece_price numeric,
  p_pieces_per_box integer,
  p_box_price numeric,
  p_low_stock_threshold integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.products;
  v_category_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can edit product details.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required.'; end if;
  if nullif(trim(p_sku), '') is null then raise exception 'SKU is required.'; end if;
  if p_cost_per_piece < 0 or p_piece_price < 0 or p_box_price < 0 then raise exception 'Prices cannot be negative.'; end if;
  if p_pieces_per_box < 1 or p_low_stock_threshold < 0 then raise exception 'Packaging and stock-alert values must be valid.'; end if;
  if p_pieces_per_box > 1 and p_box_price <= 0 then raise exception 'Box price is required when a box contains multiple pieces.'; end if;

  select * into v_product
  from public.products
  where id = p_product_id and is_active = true
  for update;
  if not found then raise exception 'Product was not found or is inactive.'; end if;

  if nullif(trim(p_category_name), '') is not null then
    insert into public.categories (name)
    values (initcap(trim(p_category_name)))
    on conflict (name) do update set is_active = true
    returning id into v_category_id;
  end if;

  update public.products
  set category_id = v_category_id,
      sku = upper(trim(p_sku)),
      barcode = nullif(trim(p_barcode), ''),
      name = trim(p_name),
      variant = nullif(trim(p_variant), ''),
      cost_per_piece = p_cost_per_piece,
      low_stock_threshold = p_low_stock_threshold
  where id = p_product_id;

  update public.product_units
  set selling_price = p_piece_price, conversion_to_piece = 1, is_default = true, is_active = true
  where product_id = p_product_id and name = 'Piece';
  if not found then
    insert into public.product_units (product_id, name, conversion_to_piece, selling_price, is_default, is_active)
    values (p_product_id, 'Piece', 1, p_piece_price, true, true);
  end if;

  if p_pieces_per_box > 1 then
    update public.product_units
    set conversion_to_piece = p_pieces_per_box, selling_price = p_box_price, is_default = false, is_active = true
    where product_id = p_product_id and name = 'Box';
    if not found then
      insert into public.product_units (product_id, name, conversion_to_piece, selling_price, is_default, is_active)
      values (p_product_id, 'Box', p_pieces_per_box, p_box_price, false, true);
    end if;
  else
    update public.product_units set is_active = false
    where product_id = p_product_id and name = 'Box';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (
    v_user_id,
    'product.updated',
    'product',
    p_product_id,
    trim(p_name),
    jsonb_build_object(
      'before', jsonb_build_object('name', v_product.name, 'variant', v_product.variant, 'sku', v_product.sku, 'barcode', v_product.barcode),
      'after', jsonb_build_object(
        'name', trim(p_name), 'variant', nullif(trim(p_variant), ''), 'sku', upper(trim(p_sku)),
        'barcode', nullif(trim(p_barcode), ''), 'category', nullif(trim(p_category_name), ''),
        'cost_per_piece', p_cost_per_piece, 'piece_price', p_piece_price,
        'pieces_per_box', p_pieces_per_box, 'box_price', case when p_pieces_per_box > 1 then p_box_price else null end,
        'low_stock_threshold', p_low_stock_threshold
      )
    )
  );
end;
$$;

revoke all on function public.update_inventory_product(uuid, text, text, text, text, text, numeric, numeric, integer, numeric, integer) from public;
grant execute on function public.update_inventory_product(uuid, text, text, text, text, text, numeric, numeric, integer, numeric, integer) to authenticated;

-- Keep future receipt snapshots variant-aware and reject units disabled by an edit.
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
    exception when others then raise exception 'One of the cart items is invalid.'; end;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Item quantities must be positive whole numbers.'; end if;

    select p.id, p.name || coalesce(' — ' || nullif(trim(p.variant), ''), ''), u.name, u.conversion_to_piece, u.selling_price
    into v_product_id, v_product_name, v_unit_name, v_conversion, v_unit_price
    from public.product_units u join public.products p on p.id = u.product_id
    where u.id = v_unit_id and u.is_active = true and p.is_active = true for update of p;
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

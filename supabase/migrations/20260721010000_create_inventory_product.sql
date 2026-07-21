-- Atomically creates a product, its sale units, category, and opening stock.
-- Run this migration after 20260721000000_initial_pos.sql.

create or replace function public.create_inventory_product(
  p_name text,
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

  if nullif(trim(p_name), '') is null then
    raise exception 'Product name is required.';
  end if;

  if nullif(trim(p_sku), '') is null then
    raise exception 'SKU is required.';
  end if;

  if p_cost_per_piece < 0 or p_piece_price < 0 then
    raise exception 'Prices cannot be negative.';
  end if;

  if p_pieces_per_box < 1 or p_opening_boxes < 0 or p_opening_loose_pieces < 0 then
    raise exception 'Stock quantities must be valid positive numbers.';
  end if;

  if nullif(trim(p_category_name), '') is not null then
    insert into public.categories (name)
    values (initcap(trim(p_category_name)))
    on conflict (name) do update set is_active = true
    returning id into v_category_id;
  end if;

  insert into public.products (
    category_id,
    sku,
    barcode,
    name,
    cost_per_piece,
    low_stock_threshold,
    created_by
  ) values (
    v_category_id,
    upper(trim(p_sku)),
    nullif(trim(p_barcode), ''),
    trim(p_name),
    p_cost_per_piece,
    p_low_stock_threshold,
    v_user_id
  )
  returning id into v_product_id;

  insert into public.product_units (
    product_id,
    name,
    conversion_to_piece,
    selling_price,
    barcode,
    is_default
  ) values (
    v_product_id,
    'Piece',
    1,
    p_piece_price,
    null,
    true
  );

  if p_pieces_per_box > 1 then
    if p_box_price is null or p_box_price < 0 then
      raise exception 'Box price is required when a box contains multiple pieces.';
    end if;

    insert into public.product_units (
      product_id,
      name,
      conversion_to_piece,
      selling_price,
      barcode,
      is_default
    ) values (
      v_product_id,
      'Box',
      p_pieces_per_box,
      p_box_price,
      null,
      false
    );
  end if;

  v_opening_quantity := (p_opening_boxes * p_pieces_per_box) + p_opening_loose_pieces;

  if v_opening_quantity > 0 then
    insert into public.stock_movements (
      product_id,
      movement_type,
      quantity_pieces,
      reference_type,
      note,
      created_by
    ) values (
      v_product_id,
      'opening',
      v_opening_quantity,
      'product_setup',
      'Opening inventory',
      v_user_id
    );
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.create_inventory_product(text, text, text, text, numeric, numeric, integer, numeric, integer, integer, integer) from public;
grant execute on function public.create_inventory_product(text, text, text, text, numeric, numeric, integer, numeric, integer, integer, integer) to authenticated;

-- Safely adjusts stock while preserving a complete movement history.
-- Run after 20260721010000_create_inventory_product.sql.

create or replace function public.adjust_inventory_stock(
  p_product_id uuid,
  p_mode text,
  p_quantity integer,
  p_note text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_stock integer;
  v_delta integer;
begin
  if not public.is_active_staff() then
    raise exception 'You do not have permission to adjust stock.';
  end if;

  if nullif(trim(p_note), '') is null then
    raise exception 'A reason is required for every stock adjustment.';
  end if;

  if p_quantity < 0 then
    raise exception 'Quantity cannot be negative.';
  end if;

  -- Lock the product so simultaneous adjustments are serialized.
  perform id
  from public.products
  where id = p_product_id and is_active = true
  for update;

  if not found then
    raise exception 'Product was not found or is inactive.';
  end if;

  select coalesce(sum(quantity_pieces), 0)::integer
  into v_current_stock
  from public.stock_movements
  where product_id = p_product_id;

  case p_mode
    when 'add' then
      if p_quantity = 0 then raise exception 'Enter a quantity greater than zero.'; end if;
      v_delta := p_quantity;
    when 'remove' then
      if p_quantity = 0 then raise exception 'Enter a quantity greater than zero.'; end if;
      v_delta := -p_quantity;
    when 'set' then
      v_delta := p_quantity - v_current_stock;
    else
      raise exception 'Invalid stock adjustment mode.';
  end case;

  if v_current_stock + v_delta < 0 then
    raise exception 'Cannot remove more than the current stock of % pieces.', v_current_stock;
  end if;

  if v_delta <> 0 then
    insert into public.stock_movements (
      product_id,
      movement_type,
      quantity_pieces,
      reference_type,
      note,
      created_by
    ) values (
      p_product_id,
      'adjustment',
      v_delta,
      'manual_adjustment',
      trim(p_note),
      v_user_id
    );
  end if;

  return v_current_stock + v_delta;
end;
$$;

revoke all on function public.adjust_inventory_stock(uuid, text, integer, text) from public;
grant execute on function public.adjust_inventory_stock(uuid, text, integer, text) to authenticated;

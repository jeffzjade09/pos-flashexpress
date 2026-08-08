-- Adds "Supplies" — packaging consumables (cartons, tape, bubble wrap), tracked
-- separately from the existing public.suppliers table (which represents vendor
-- companies used on the Purchases page, a different concept despite the similar
-- name). Permissions mirror public.categories: staff can create and update, only a
-- super admin can delete. Qty is a plain mutable column, not an append-only ledger —
-- this is a lightweight CRUD resource, not a full inventory system.
-- Run after 20260811000000_variant_value_colors.sql.

create table public.supplies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  qty integer not null default 0 check (qty >= 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  low_stock_threshold integer not null default 10 check (low_stock_threshold >= 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger supplies_set_updated_at before update on public.supplies
  for each row execute function public.set_updated_at();

alter table public.supplies enable row level security;
create policy "staff view supplies" on public.supplies
  for select to authenticated using (public.is_active_staff());
create policy "staff add supplies" on public.supplies
  for insert to authenticated with check (public.is_active_staff() and created_by = (select auth.uid()));
create policy "staff update supplies" on public.supplies
  for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy "admins delete supplies" on public.supplies
  for delete to authenticated using (public.is_super_admin());

create function public.create_supply(
  p_name text,
  p_description text,
  p_qty integer,
  p_price numeric,
  p_low_stock_threshold integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_supply_id uuid;
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to add supplies.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Supply name is required.'; end if;
  if p_qty < 0 then raise exception 'Quantity cannot be negative.'; end if;
  if p_price < 0 then raise exception 'Price cannot be negative.'; end if;
  if p_low_stock_threshold < 0 then raise exception 'The low-stock alert must be a non-negative whole number.'; end if;

  insert into public.supplies (name, description, qty, price, low_stock_threshold, created_by)
  values (trim(p_name), nullif(trim(p_description), ''), p_qty, p_price, p_low_stock_threshold, v_user_id)
  returning id into v_supply_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'supply.created', 'supply', v_supply_id, trim(p_name), jsonb_build_object('qty', p_qty, 'price', p_price, 'low_stock_threshold', p_low_stock_threshold));

  return v_supply_id;
end;
$$;

revoke all on function public.create_supply(text, text, integer, numeric, integer) from public;
grant execute on function public.create_supply(text, text, integer, numeric, integer) to authenticated;

create function public.update_supply(
  p_supply_id uuid,
  p_name text,
  p_description text,
  p_qty integer,
  p_price numeric,
  p_low_stock_threshold integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_supply public.supplies;
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to update supplies.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Supply name is required.'; end if;
  if p_qty < 0 then raise exception 'Quantity cannot be negative.'; end if;
  if p_price < 0 then raise exception 'Price cannot be negative.'; end if;
  if p_low_stock_threshold < 0 then raise exception 'The low-stock alert must be a non-negative whole number.'; end if;

  select * into v_supply from public.supplies where id = p_supply_id for update;
  if not found then raise exception 'Supply was not found.'; end if;

  update public.supplies
  set name = trim(p_name),
      description = nullif(trim(p_description), ''),
      qty = p_qty,
      price = p_price,
      low_stock_threshold = p_low_stock_threshold
  where id = p_supply_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (
    v_user_id, 'supply.updated', 'supply', p_supply_id, trim(p_name),
    jsonb_build_object(
      'before', jsonb_build_object('qty', v_supply.qty, 'price', v_supply.price),
      'after', jsonb_build_object('qty', p_qty, 'price', p_price, 'low_stock_threshold', p_low_stock_threshold)
    )
  );
end;
$$;

revoke all on function public.update_supply(uuid, text, text, integer, numeric, integer) from public;
grant execute on function public.update_supply(uuid, text, text, integer, numeric, integer) to authenticated;

create function public.delete_supply(p_supply_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_supply public.supplies;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can delete supplies.'; end if;

  delete from public.supplies where id = p_supply_id returning * into v_supply;
  if v_supply.id is null then raise exception 'Supply was not found.'; end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'supply.deleted', 'supply', p_supply_id, v_supply.name, jsonb_build_object('qty', v_supply.qty, 'price', v_supply.price));
end;
$$;

revoke all on function public.delete_supply(uuid) from public;
grant execute on function public.delete_supply(uuid) to authenticated;

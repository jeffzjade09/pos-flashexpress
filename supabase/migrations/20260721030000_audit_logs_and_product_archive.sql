-- Adds immutable user activity logs and safe product archiving.
-- Run after 20260721020000_adjust_inventory_stock.sql.

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_name text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index audit_logs_actor_id_idx on public.audit_logs(actor_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

alter table public.audit_logs enable row level security;

create policy "users view own audit logs and admins view all"
on public.audit_logs for select to authenticated
using (actor_id = (select auth.uid()) or public.is_super_admin());

create policy "active users append own audit logs"
on public.audit_logs for insert to authenticated
with check (public.is_active_staff() and actor_id = (select auth.uid()));

-- Audit records are intentionally immutable: there are no update or delete policies.

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
      jsonb_build_object('sku', new.sku, 'barcode', new.barcode)
    );
  elsif tg_op = 'UPDATE' and old.is_active is distinct from new.is_active then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
    values (
      auth.uid(),
      case when new.is_active then 'product.restored' else 'product.deleted' end,
      'product',
      new.id,
      new.name,
      jsonb_build_object('sku', new.sku)
    );
  end if;
  return new;
end;
$$;

create trigger products_write_audit_log
after insert or update on public.products
for each row execute function public.audit_product_change();

create or replace function public.audit_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_name text;
begin
  select name into v_product_name from public.products where id = new.product_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (
    new.created_by,
    'stock.' || new.movement_type::text,
    'product',
    new.product_id,
    v_product_name,
    jsonb_build_object(
      'quantity_pieces', new.quantity_pieces,
      'note', new.note,
      'reference_type', new.reference_type
    )
  );
  return new;
end;
$$;

create trigger stock_movements_write_audit_log
after insert on public.stock_movements
for each row execute function public.audit_stock_movement();

create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;

  if old.role is distinct from new.role then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
    values (
      auth.uid(),
      'user.role_changed',
      'user',
      new.id,
      new.full_name,
      jsonb_build_object('from', old.role, 'to', new.role)
    );
  end if;

  if old.is_active is distinct from new.is_active then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
    values (
      auth.uid(),
      case when new.is_active then 'user.activated' else 'user.deactivated' end,
      'user',
      new.id,
      new.full_name,
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

create trigger profiles_write_audit_log
after update on public.profiles
for each row execute function public.audit_profile_change();

-- Only super admins can change product master records. Employees adjust stock
-- through the append-only stock movement workflow instead.
drop policy if exists "staff update products" on public.products;
create policy "admins update products"
on public.products for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.archive_inventory_product(p_product_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can delete products.';
  end if;

  update public.products
  set is_active = false
  where id = p_product_id and is_active = true;

  if not found then
    raise exception 'Product was not found or is already deleted.';
  end if;
end;
$$;

revoke all on function public.archive_inventory_product(uuid) from public;
grant execute on function public.archive_inventory_product(uuid) to authenticated;

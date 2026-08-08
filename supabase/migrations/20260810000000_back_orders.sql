-- Adds an independent return-inspection workflow, decoupled from the existing money
-- refund flow (refund_sale_items is not modified). Returned units are classified Good
-- (restocked to regular sellable inventory, reusing the exact mechanism refunds
-- already use) or Bad (routed into a new, wholly separate Back Orders stock pool).
-- A separate table is used for the Back Orders ledger rather than a new
-- stock_movements movement type, because product_stock and at least nine RPCs sum
-- stock_movements.quantity_pieces with no movement_type filter — reusing that table
-- would silently pollute regular sellable-stock counts everywhere.
-- Run after 20260809000000_credit_card_payment.sql.

create index if not exists sales_external_order_id_lower_idx on public.sales (lower(external_order_id)) where external_order_id is not null;
create index if not exists sales_payment_reference_lower_idx on public.sales (lower(payment_reference)) where payment_reference is not null;

alter table public.sale_items add column if not exists inspected_quantity integer not null default 0;
alter table public.sale_items drop constraint if exists sale_items_inspected_quantity_check;
alter table public.sale_items add constraint sale_items_inspected_quantity_check check (inspected_quantity >= 0 and inspected_quantity <= quantity);

create table public.return_classifications (
  id uuid primary key default gen_random_uuid(),
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  classification text not null check (classification in ('good', 'bad')),
  quantity integer not null check (quantity > 0),
  reason text not null,
  inspected_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index return_classifications_sale_item_id_idx on public.return_classifications(sale_item_id);

create table public.return_classification_photos (
  id uuid primary key default gen_random_uuid(),
  return_classification_id uuid not null references public.return_classifications(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index return_classification_photos_classification_id_idx on public.return_classification_photos(return_classification_id);

create table public.back_order_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('inspection_in', 'adjustment', 'disposed')),
  quantity_pieces integer not null check (quantity_pieces <> 0),
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index back_order_movements_product_id_created_at_idx on public.back_order_movements(product_id, created_at desc);

create table public.back_order_listings (
  product_id uuid primary key references public.products(id) on delete cascade,
  resale_price numeric(12,2) check (resale_price is null or resale_price >= 0),
  condition_notes text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.return_classifications enable row level security;
create policy "admins view return classifications" on public.return_classifications
  for select to authenticated using (public.is_super_admin());
create policy "admins create return classifications" on public.return_classifications
  for insert to authenticated with check (public.is_super_admin() and inspected_by = (select auth.uid()));

alter table public.return_classification_photos enable row level security;
create policy "admins view return classification photos" on public.return_classification_photos
  for select to authenticated using (public.is_super_admin());
create policy "admins create return classification photos" on public.return_classification_photos
  for insert to authenticated with check (public.is_super_admin());

alter table public.back_order_movements enable row level security;
create policy "admins view back order movements" on public.back_order_movements
  for select to authenticated using (public.is_super_admin());
create policy "admins create back order movements" on public.back_order_movements
  for insert to authenticated with check (public.is_super_admin() and created_by = (select auth.uid()));

alter table public.back_order_listings enable row level security;
create policy "admins view back order listings" on public.back_order_listings
  for select to authenticated using (public.is_super_admin());
create policy "admins create back order listings" on public.back_order_listings
  for insert to authenticated with check (public.is_super_admin());
create policy "admins update back order listings" on public.back_order_listings
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- Self-auditing, exactly like stock_movements_write_audit_log / audit_stock_movement().
create or replace function public.audit_back_order_movement()
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
    'back_order.' || new.movement_type,
    'product',
    new.product_id,
    v_product_name,
    jsonb_build_object('quantity_pieces', new.quantity_pieces, 'note', new.note, 'reference_type', new.reference_type)
  );
  return new;
end;
$$;

create trigger back_order_movements_write_audit_log
after insert on public.back_order_movements
for each row execute function public.audit_back_order_movement();

-- Mirrors product_stock's shape, but for the separate Back Orders pool. The whole
-- module is super-admin-only, so this view filters itself rather than relying only on
-- the joined tables' RLS — products/categories are broadly staff-readable, and without
-- this filter the join would still return one (mostly-null) row per product to any
-- staff member.
create view public.back_order_stock
with (security_invoker = true)
as
select
  p.id,
  p.sku,
  p.barcode,
  p.name,
  c.name as category_name,
  p.family_id,
  pf.name as family_name,
  (
    select string_agg(pva.variant_value, ' / ' order by pva.position)
    from public.product_variant_attributes pva
    where pva.product_id = p.id
  ) as variant_label,
  coalesce(sum(bom.quantity_pieces), 0)::integer as stock_on_hand,
  bl.resale_price,
  bl.condition_notes,
  bl.updated_at as listing_updated_at
from public.products p
left join public.categories c on c.id = p.category_id
left join public.product_families pf on pf.id = p.family_id
left join public.back_order_movements bom on bom.product_id = p.id
left join public.back_order_listings bl on bl.product_id = p.id
where public.is_super_admin()
group by p.id, c.name, pf.name, bl.resale_price, bl.condition_notes, bl.updated_at
having count(bom.id) > 0;

grant select on public.back_order_stock to authenticated;

insert into storage.buckets (id, name, public)
values ('return-photos', 'return-photos', false)
on conflict (id) do nothing;

create policy "super admins upload return photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'return-photos' and public.is_super_admin());
create policy "super admins view return photos" on storage.objects
  for select to authenticated using (bucket_id = 'return-photos' and public.is_super_admin());

create function public.classify_returned_units(
  p_sale_item_id uuid,
  p_classification text,
  p_quantity integer,
  p_reason text,
  p_photo_paths text[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sale_item public.sale_items;
  v_classification_id uuid;
  v_photo_path text;
  v_remaining integer;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can classify returned items.'; end if;
  if p_classification not in ('good', 'bad') then raise exception 'Choose a valid classification.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Enter a valid quantity.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a reason for this classification.'; end if;
  if p_classification = 'bad' and coalesce(array_length(p_photo_paths, 1), 0) = 0 then
    raise exception 'Attach at least one photo for a bad classification.';
  end if;

  select * into v_sale_item from public.sale_items where id = p_sale_item_id for update;
  if not found then raise exception 'The returned item was not found.'; end if;

  v_remaining := v_sale_item.quantity - v_sale_item.inspected_quantity;
  if p_quantity > v_remaining then
    raise exception 'Only % unit(s) of % remain to be inspected.', v_remaining, v_sale_item.product_name;
  end if;

  insert into public.return_classifications (sale_item_id, classification, quantity, reason, inspected_by)
  values (p_sale_item_id, p_classification, p_quantity, trim(p_reason), v_user_id)
  returning id into v_classification_id;

  if p_photo_paths is not null then
    foreach v_photo_path in array p_photo_paths loop
      insert into public.return_classification_photos (return_classification_id, storage_path)
      values (v_classification_id, v_photo_path);
    end loop;
  end if;

  update public.sale_items set inspected_quantity = inspected_quantity + p_quantity where id = p_sale_item_id;

  if p_classification = 'good' then
    insert into public.stock_movements (product_id, movement_type, quantity_pieces, reference_type, reference_id, note, created_by)
    values (
      v_sale_item.product_id, 'return', p_quantity * v_sale_item.conversion_to_piece,
      'return_classification', v_classification_id, 'Return inspection: ' || trim(p_reason), v_user_id
    );
  else
    insert into public.back_order_movements (product_id, movement_type, quantity_pieces, reference_type, reference_id, note, created_by)
    values (
      v_sale_item.product_id, 'inspection_in', p_quantity * v_sale_item.conversion_to_piece,
      'return_classification', v_classification_id, 'Return inspection: ' || trim(p_reason), v_user_id
    );

    insert into public.back_order_listings (product_id, updated_by)
    values (v_sale_item.product_id, v_user_id)
    on conflict (product_id) do nothing;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (
    v_user_id, 'return.classified', 'sale_item', p_sale_item_id, v_sale_item.product_name,
    jsonb_build_object('classification', p_classification, 'quantity', p_quantity, 'reason', trim(p_reason), 'classification_id', v_classification_id)
  );

  return v_classification_id;
end;
$$;

revoke all on function public.classify_returned_units(uuid, text, integer, text, text[]) from public;
grant execute on function public.classify_returned_units(uuid, text, integer, text, text[]) to authenticated;

create function public.update_back_order_listing(
  p_product_id uuid,
  p_resale_price numeric,
  p_condition_notes text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can update back order listings.'; end if;
  if p_resale_price is not null and p_resale_price < 0 then raise exception 'Resale price cannot be negative.'; end if;

  insert into public.back_order_listings (product_id, resale_price, condition_notes, updated_by, updated_at)
  values (p_product_id, p_resale_price, nullif(trim(coalesce(p_condition_notes, '')), ''), v_user_id, now())
  on conflict (product_id) do update set
    resale_price = excluded.resale_price,
    condition_notes = excluded.condition_notes,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

revoke all on function public.update_back_order_listing(uuid, numeric, text) from public;
grant execute on function public.update_back_order_listing(uuid, numeric, text) to authenticated;

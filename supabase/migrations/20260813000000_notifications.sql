-- Centralized notification system: system update announcements, low-stock alerts for
-- products and supplies, and a reserved "inventory" category for future use.
--
-- Content is broadcast (one shared row per event, since every category here is store-wide
-- rather than addressed to a specific person); read state is per-user via a join table.
-- All writes to public.notifications go through security definer trigger functions (same
-- shape as the existing audit_product_change()/audit_stock_movement() triggers) or the
-- mark_all_notifications_read() RPC below — there is deliberately no insert/update/delete
-- policy for `authenticated` on public.notifications itself.
--
-- Low-stock generation hooks into public.stock_movements (every stock-affecting RPC in
-- this codebase inserts into this one append-only ledger, and product_stock.stock_on_hand
-- is literally sum(quantity_pieces) grouped by product) and public.supplies.qty, using an
-- atomic `insert ... on conflict ... do update` against a partial unique index instead of
-- select-then-insert, so two concurrent stock-affecting operations on the same product can
-- never raise a unique-violation and abort the sale/purchase/refund transaction that fired
-- the trigger. Each evaluator function also wraps its own body in an exception handler so a
-- bug in notification generation can never take down a real business transaction.
--
-- Run after 20260812000000_supplies.sql.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('system_update', 'low_stock', 'supplies', 'inventory')),
  title text not null,
  body text not null,
  link_href text,
  dedupe_key text,
  resolved_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Predicate must syntactically match the `on conflict (dedupe_key) where resolved_at is
-- null` clauses below for Postgres to infer this index as their arbiter. NULL dedupe_key
-- values (the one-off system_update seed row) never collide with each other under a
-- unique index regardless, since NULL <> NULL for uniqueness purposes.
create unique index notifications_active_dedupe_key_idx on public.notifications (dedupe_key)
  where resolved_at is null;
create index notifications_created_at_idx on public.notifications (created_at desc);

create trigger notifications_set_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index notification_reads_user_id_idx on public.notification_reads(user_id);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

create policy "staff view notifications" on public.notifications
  for select to authenticated using (public.is_active_staff());

create policy "staff view own notification reads" on public.notification_reads
  for select to authenticated using (public.is_active_staff() and user_id = (select auth.uid()));
create policy "staff mark own notifications read" on public.notification_reads
  for insert to authenticated with check (public.is_active_staff() and user_id = (select auth.uid()));

-- Products: recompute stock_on_hand from stock_movements and compare to low_stock_threshold,
-- using the same `<=` semantics already used identically in the Inventory and Overview pages.
create function public.evaluate_product_low_stock(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_stock integer;
  v_dedupe text;
  v_id uuid;
begin
  select p.name, p.low_stock_threshold,
    (select string_agg(pva.variant_value, ' / ' order by pva.position)
     from public.product_variant_attributes pva where pva.product_id = p.id) as variant_label
  into v_product
  from public.products p
  where p.id = p_product_id;

  if not found then
    return;
  end if;

  select coalesce(sum(quantity_pieces), 0)::integer into v_stock
  from public.stock_movements where product_id = p_product_id;

  v_dedupe := 'low_stock:product:' || p_product_id::text;

  if v_stock <= v_product.low_stock_threshold then
    insert into public.notifications (category, title, body, link_href, dedupe_key)
    values (
      'low_stock',
      'Low Stock Alert',
      v_product.name || coalesce(' – ' || v_product.variant_label, '') || ' has only ' || v_stock ||
        ' unit' || case when v_stock = 1 then '' else 's' end || ' remaining.',
      '/dashboard/inventory',
      v_dedupe
    )
    on conflict (dedupe_key) where resolved_at is null
    do update set title = excluded.title, body = excluded.body, updated_at = now()
    returning id into v_id;

    delete from public.notification_reads where notification_id = v_id;
  else
    update public.notifications set resolved_at = now()
    where dedupe_key = v_dedupe and resolved_at is null;
  end if;
exception when others then
  raise warning 'evaluate_product_low_stock failed for %: %', p_product_id, sqlerrm;
end;
$$;

create function public.trg_evaluate_product_low_stock_on_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.evaluate_product_low_stock(new.product_id);
  return new;
end;
$$;

create trigger stock_movements_check_low_stock
  after insert on public.stock_movements
  for each row execute function public.trg_evaluate_product_low_stock_on_movement();

-- Also re-evaluate when a super admin edits a product's threshold directly (no stock
-- movement involved), so raising/lowering the alert line takes effect immediately rather
-- than waiting for the next unrelated sale/adjustment.
create function public.trg_evaluate_product_low_stock_on_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.evaluate_product_low_stock(new.id);
  return new;
end;
$$;

create trigger products_check_low_stock_threshold
  after update of low_stock_threshold on public.products
  for each row
  when (old.low_stock_threshold is distinct from new.low_stock_threshold)
  execute function public.trg_evaluate_product_low_stock_on_threshold();

-- Supplies: qty lives directly on the row, so one trigger covers both a real quantity
-- change and a threshold-only edit (update_supply() always includes qty in its SET clause).
create function public.evaluate_supply_low_stock(p_supply_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supply record;
  v_dedupe text;
  v_id uuid;
begin
  select name, qty, low_stock_threshold into v_supply
  from public.supplies where id = p_supply_id;

  if not found then
    return;
  end if;

  v_dedupe := 'low_stock:supply:' || p_supply_id::text;

  if v_supply.qty <= v_supply.low_stock_threshold then
    insert into public.notifications (category, title, body, link_href, dedupe_key)
    values (
      'supplies',
      case when v_supply.qty = 0 then 'Supply Out of Stock' else 'Supply Running Low' end,
      v_supply.name || ' has ' || v_supply.qty || ' unit' || case when v_supply.qty = 1 then '' else 's' end ||
        ' left (reorder at ' || v_supply.low_stock_threshold || ').',
      '/dashboard/supplies?status=low',
      v_dedupe
    )
    on conflict (dedupe_key) where resolved_at is null
    do update set title = excluded.title, body = excluded.body, updated_at = now()
    returning id into v_id;

    delete from public.notification_reads where notification_id = v_id;
  else
    update public.notifications set resolved_at = now()
    where dedupe_key = v_dedupe and resolved_at is null;
  end if;
exception when others then
  raise warning 'evaluate_supply_low_stock failed for %: %', p_supply_id, sqlerrm;
end;
$$;

create function public.trg_evaluate_supply_low_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.evaluate_supply_low_stock(new.id);
  return new;
end;
$$;

create trigger supplies_check_low_stock
  after insert or update of qty on public.supplies
  for each row execute function public.trg_evaluate_supply_low_stock();

create function public.mark_all_notifications_read()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_active_staff() then
    raise exception 'You do not have permission to view notifications.';
  end if;

  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid()
  from public.notifications n
  where not exists (
    select 1 from public.notification_reads r
    where r.notification_id = n.id and r.user_id = auth.uid()
  );
end;
$$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Demonstrates the system_update category with the already-shipped Back Orders feature.
-- One-off announcement: no dedupe_key, not auto-resolvable. Future announcements would be
-- inserted the same way; no admin composer UI is built for this pass.
insert into public.notifications (category, title, body, link_href)
values (
  'system_update',
  'New Feature Available',
  'A new Returned Products / Back Orders feature has been added to the Inventory module.',
  '/dashboard/back-orders'
);

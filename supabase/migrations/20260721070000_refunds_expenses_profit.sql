-- Adds item-level refunds, historical cost snapshots, and adjustable expenses.
-- Run after 20260721060000_gcash_payments.sql.

alter type public.sale_status add value if not exists 'partially_refunded';

alter table public.sales
add column if not exists refunded_amount numeric(12,2) not null default 0 check (refunded_amount >= 0);

alter table public.sale_items
add column if not exists cost_per_piece numeric(12,2) not null default 0 check (cost_per_piece >= 0),
add column if not exists line_cost numeric(12,2) not null default 0 check (line_cost >= 0),
add column if not exists refunded_quantity integer not null default 0 check (refunded_quantity >= 0);

update public.sale_items si
set cost_per_piece = p.cost_per_piece,
    line_cost = round(p.cost_per_piece * si.conversion_to_piece * si.quantity, 2)
from public.products p
where p.id = si.product_id;

alter table public.sale_items drop constraint if exists sale_items_refunded_quantity_check;
alter table public.sale_items
add constraint sale_items_refunded_quantity_check check (refunded_quantity <= quantity);

create or replace function public.snapshot_sale_item_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select cost_per_piece into new.cost_per_piece
  from public.products where id = new.product_id;
  new.line_cost := round(new.cost_per_piece * new.conversion_to_piece * new.quantity, 2);
  return new;
end;
$$;

drop trigger if exists sale_items_snapshot_cost on public.sale_items;
create trigger sale_items_snapshot_cost
before insert on public.sale_items
for each row execute function public.snapshot_sale_item_cost();

create table if not exists public.sale_refunds (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  processed_by uuid not null references public.profiles(id),
  refund_amount numeric(12,2) not null check (refund_amount >= 0),
  reason text not null,
  restock_items boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.sale_refunds(id) on delete restrict,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  refund_amount numeric(12,2) not null check (refund_amount >= 0),
  reversed_cost numeric(12,2) not null default 0 check (reversed_cost >= 0),
  restocked boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists sale_refunds_sale_id_idx on public.sale_refunds(sale_id, created_at desc);
create index if not exists sale_refund_items_refund_id_idx on public.sale_refund_items(refund_id);
create index if not exists sale_refund_items_sale_item_id_idx on public.sale_refund_items(sale_item_id);

alter table public.sale_refunds enable row level security;
alter table public.sale_refund_items enable row level security;

drop policy if exists "staff view refunds" on public.sale_refunds;
drop policy if exists "admins create refunds" on public.sale_refunds;
drop policy if exists "staff view refund items" on public.sale_refund_items;
drop policy if exists "admins create refund items" on public.sale_refund_items;
drop policy if exists "admins update refunded item quantities" on public.sale_items;
create policy "staff view refunds" on public.sale_refunds
for select to authenticated using (public.is_active_staff());
create policy "admins create refunds" on public.sale_refunds
for insert to authenticated with check (public.is_super_admin() and processed_by = (select auth.uid()));
create policy "staff view refund items" on public.sale_refund_items
for select to authenticated using (public.is_active_staff());
create policy "admins create refund items" on public.sale_refund_items
for insert to authenticated with check (public.is_super_admin());
create policy "admins update refunded item quantities" on public.sale_items
for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('electricity', 'manpower_labor', 'packaging_materials', 'rent', 'tax_3_percent', 'gas_delivery', 'other')),
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses(expense_date desc);
create index if not exists expenses_category_date_idx on public.expenses(category, expense_date desc);
drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses
for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;
drop policy if exists "admins view expenses" on public.expenses;
drop policy if exists "admins create expenses" on public.expenses;
drop policy if exists "admins update expenses" on public.expenses;
drop policy if exists "admins delete expenses" on public.expenses;
create policy "admins view expenses" on public.expenses
for select to authenticated using (public.is_super_admin());
create policy "admins create expenses" on public.expenses
for insert to authenticated with check (public.is_super_admin() and created_by = (select auth.uid()));
create policy "admins update expenses" on public.expenses
for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "admins delete expenses" on public.expenses
for delete to authenticated using (public.is_super_admin());

create or replace function public.audit_expense_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
    values (auth.uid(), 'expense.deleted', 'expense', old.id, replace(initcap(old.category), '_', ' '), jsonb_build_object('amount', old.amount, 'expense_date', old.expense_date, 'note', old.note));
    return old;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (auth.uid(), case when tg_op = 'INSERT' then 'expense.created' else 'expense.updated' end, 'expense', new.id, replace(initcap(new.category), '_', ' '), jsonb_build_object('amount', new.amount, 'expense_date', new.expense_date, 'note', new.note));
  return new;
end;
$$;

drop trigger if exists expenses_write_audit_log on public.expenses;
create trigger expenses_write_audit_log
after insert or update or delete on public.expenses
for each row execute function public.audit_expense_change();

create or replace function public.refund_sale_items(
  p_sale_id uuid,
  p_reason text,
  p_restock boolean,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sale public.sales;
  v_refund_id uuid;
  v_item jsonb;
  v_sale_item public.sale_items;
  v_quantity integer;
  v_refund_amount numeric(12,2);
  v_reversed_cost numeric(12,2);
  v_total_refund numeric(12,2) := 0;
  v_all_refunded boolean;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can process refunds.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Enter a reason for this refund.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one item to refund.';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found or v_sale.status not in ('completed', 'partially_refunded') then
    raise exception 'This sale is not available for refund.';
  end if;

  insert into public.sale_refunds (sale_id, processed_by, refund_amount, reason, restock_items)
  values (p_sale_id, v_user_id, 0, trim(p_reason), p_restock)
  returning id into v_refund_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_quantity := (v_item ->> 'quantity')::integer;
      select * into v_sale_item
      from public.sale_items
      where id = (v_item ->> 'sale_item_id')::uuid and sale_id = p_sale_id
      for update;
    exception when others then
      raise exception 'One of the refund items is invalid.';
    end;

    if not found then raise exception 'A refund item was not found.'; end if;
    if v_quantity <= 0 or v_quantity > (v_sale_item.quantity - v_sale_item.refunded_quantity) then
      raise exception 'Refund quantity is invalid for %.', v_sale_item.product_name;
    end if;

    v_refund_amount := round(v_sale_item.unit_price * v_quantity, 2);
    v_reversed_cost := case when p_restock then round(v_sale_item.cost_per_piece * v_sale_item.conversion_to_piece * v_quantity, 2) else 0 end;
    v_total_refund := v_total_refund + v_refund_amount;

    update public.sale_items
    set refunded_quantity = refunded_quantity + v_quantity
    where id = v_sale_item.id;

    insert into public.sale_refund_items (refund_id, sale_item_id, quantity, refund_amount, reversed_cost, restocked)
    values (v_refund_id, v_sale_item.id, v_quantity, v_refund_amount, v_reversed_cost, p_restock);

    if p_restock then
      insert into public.stock_movements (
        product_id, movement_type, quantity_pieces, reference_type,
        reference_id, note, created_by
      ) values (
        v_sale_item.product_id,
        'return',
        v_quantity * v_sale_item.conversion_to_piece,
        'sale_refund',
        v_refund_id,
        'Refund: ' || trim(p_reason),
        v_user_id
      );
    end if;
  end loop;

  update public.sale_refunds set refund_amount = v_total_refund where id = v_refund_id;

  select bool_and(refunded_quantity = quantity) into v_all_refunded
  from public.sale_items where sale_id = p_sale_id;

  update public.sales
  set refunded_amount = refunded_amount + v_total_refund,
      status = case when v_all_refunded then 'refunded'::public.sale_status else 'partially_refunded'::public.sale_status end
  where id = p_sale_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (
    v_user_id,
    'sale.refunded',
    'sale',
    p_sale_id,
    v_sale.receipt_number,
    jsonb_build_object('refund_id', v_refund_id, 'amount', v_total_refund, 'reason', trim(p_reason), 'restocked', p_restock)
  );

  return jsonb_build_object('refund_id', v_refund_id, 'refund_amount', v_total_refund, 'fully_refunded', v_all_refunded);
end;
$$;

revoke all on function public.refund_sale_items(uuid, text, boolean, jsonb) from public;
grant execute on function public.refund_sale_items(uuid, text, boolean, jsonb) to authenticated;

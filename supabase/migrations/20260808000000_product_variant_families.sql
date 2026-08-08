-- Replaces the single free-text products.variant column with a structured multi-type
-- variant system: a product_families parent groups the products rows that represent
-- each combination (e.g. Black/Small, Black/Medium), and product_variant_attributes
-- describes the type/value pairs (Color: Black, Size: Small) for each combination.
-- Run after 20260723010000_order_discounts.sql.

create table public.product_families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger product_families_set_updated_at before update on public.product_families
  for each row execute function public.set_updated_at();

alter table public.products add column if not exists family_id uuid;
alter table public.products add column if not exists variant_signature text;

create table public.product_variant_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_type text not null,
  variant_value text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, variant_type)
);

create index product_variant_attributes_product_id_idx on public.product_variant_attributes(product_id);

-- Auto-wrap every existing product in its own single-member family, and turn its old
-- free-text variant (if any) into one "Variant" attribute pair.
with product_family_ids as materialized (
  select id as product_id, gen_random_uuid() as family_id
  from public.products
),
inserted_families as materialized (
  insert into public.product_families (id, name, is_active, created_by, created_at, updated_at)
  select pfi.family_id, p.name, p.is_active, p.created_by, p.created_at, p.updated_at
  from public.products p
  join product_family_ids pfi on pfi.product_id = p.id
  returning id
)
update public.products p
set family_id = pfi.family_id
from product_family_ids pfi
join inserted_families f on f.id = pfi.family_id
where pfi.product_id = p.id;

insert into public.product_variant_attributes (product_id, variant_type, variant_value, position)
select id, 'Variant', trim(variant), 0
from public.products
where nullif(trim(variant), '') is not null;

update public.products
set variant_signature = 'Variant:' || trim(variant)
where nullif(trim(variant), '') is not null;

alter table public.products alter column family_id set not null;
alter table public.products add constraint products_family_id_fkey
  foreign key (family_id) references public.product_families(id) on delete restrict;
create index products_family_id_idx on public.products(family_id);
create unique index products_family_variant_signature_idx on public.products(family_id, variant_signature)
  where variant_signature is not null;

drop view if exists public.product_stock;

create view public.product_stock
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
  p.cost_per_piece,
  p.family_id,
  pf.name as family_name,
  (
    select string_agg(pva.variant_value, ' / ' order by pva.position)
    from public.product_variant_attributes pva
    where pva.product_id = p.id
  ) as variant_label,
  (
    select coalesce(jsonb_agg(jsonb_build_object('type', pva.variant_type, 'value', pva.variant_value) order by pva.position), '[]'::jsonb)
    from public.product_variant_attributes pva
    where pva.product_id = p.id
  ) as variant_attributes
from public.products p
left join public.categories c on c.id = p.category_id
left join public.product_families pf on pf.id = p.family_id
left join public.stock_movements sm on sm.product_id = p.id
group by p.id, c.name, pf.name;

grant select on public.product_stock to authenticated;

alter table public.products drop column variant;

alter table public.product_families enable row level security;
create policy "staff view product families" on public.product_families
  for select to authenticated using (public.is_active_staff());
create policy "staff add product families" on public.product_families
  for insert to authenticated with check (public.is_active_staff() and created_by = (select auth.uid()));
create policy "admins update product families" on public.product_families
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

alter table public.product_variant_attributes enable row level security;
create policy "staff view variant attributes" on public.product_variant_attributes
  for select to authenticated using (public.is_active_staff());
create policy "staff add variant attributes" on public.product_variant_attributes
  for insert to authenticated with check (public.is_active_staff());
create policy "staff remove variant attributes" on public.product_variant_attributes
  for delete to authenticated using (public.is_active_staff());

-- The insert branch used to embed the row's own `variant` column, which no longer
-- exists; attributes for a newly-created combination are written by the calling RPC
-- (create_product_family_batch / add_product_variant) after this trigger already fired,
-- so it can no longer report them synchronously. Those RPCs log their own
-- `product.created` audit entry instead. The is_active toggle branch is unchanged.
create or replace function public.audit_product_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.is_active is distinct from new.is_active then
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

drop function if exists public.create_inventory_product_v2(text, text, text, text, text, numeric, numeric, integer, numeric, integer, integer, integer);
drop function if exists public.update_inventory_product(uuid, text, text, text, text, text, numeric, numeric, integer, numeric, integer);

create function public.create_product_family_batch(
  p_category_name text,
  p_family_name text,
  p_combinations jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_category_id uuid;
  v_family_id uuid;
  v_combo jsonb;
  v_product_id uuid;
  v_attribute_count integer;
  v_opening_quantity integer;
  v_combo_count integer;
  v_seen_signatures text[] := array[]::text[];
  v_signature text;
  v_attr_row record;
begin
  if not public.is_active_staff() then
    raise exception 'You do not have permission to create products.';
  end if;
  if nullif(trim(p_family_name), '') is null then raise exception 'Product name is required.'; end if;
  if jsonb_typeof(p_combinations) <> 'array' or jsonb_array_length(p_combinations) = 0 then
    raise exception 'Add at least one product combination.';
  end if;
  v_combo_count := jsonb_array_length(p_combinations);

  if nullif(trim(p_category_name), '') is not null then
    insert into public.categories (name)
    values (initcap(trim(p_category_name)))
    on conflict (name) do update set is_active = true
    returning id into v_category_id;
  end if;

  insert into public.product_families (name, created_by)
  values (trim(p_family_name), v_user_id)
  returning id into v_family_id;

  for v_combo in select value from jsonb_array_elements(p_combinations) loop
    v_attribute_count := case when jsonb_typeof(v_combo -> 'variant_attributes') = 'array' then jsonb_array_length(v_combo -> 'variant_attributes') else 0 end;
    if v_combo_count > 1 and v_attribute_count = 0 then
      raise exception 'Each combination needs at least one variant attribute when a product has more than one combination.';
    end if;

    select string_agg(attr ->> 'type' || ':' || (attr ->> 'value'), '|' order by attr ->> 'type')
    into v_signature
    from jsonb_array_elements(coalesce(v_combo -> 'variant_attributes', '[]'::jsonb)) attr;

    if v_signature is not null then
      if v_signature = any(v_seen_signatures) then
        raise exception 'Duplicate variant combination submitted for this product.';
      end if;
      v_seen_signatures := array_append(v_seen_signatures, v_signature);
    end if;

    if nullif(trim(v_combo ->> 'sku'), '') is null then raise exception 'SKU is required for every combination.'; end if;
    if (v_combo ->> 'cost_per_piece')::numeric < 0 or (v_combo ->> 'piece_price')::numeric < 0 or (v_combo ->> 'box_price')::numeric < 0 then
      raise exception 'Prices cannot be negative.';
    end if;
    if (v_combo ->> 'pieces_per_box')::integer < 1
       or (v_combo ->> 'opening_boxes')::integer < 0
       or (v_combo ->> 'opening_loose_pieces')::integer < 0
       or (v_combo ->> 'low_stock_threshold')::integer < 0 then
      raise exception 'Stock quantities must be valid positive numbers.';
    end if;
    if (v_combo ->> 'pieces_per_box')::integer > 1 and (v_combo ->> 'box_price')::numeric <= 0 then
      raise exception 'Box price is required when a box contains multiple pieces.';
    end if;

    insert into public.products (
      family_id, category_id, sku, barcode, name, cost_per_piece, low_stock_threshold, created_by, variant_signature
    ) values (
      v_family_id,
      v_category_id,
      upper(trim(v_combo ->> 'sku')),
      nullif(trim(v_combo ->> 'barcode'), ''),
      trim(p_family_name),
      (v_combo ->> 'cost_per_piece')::numeric,
      (v_combo ->> 'low_stock_threshold')::integer,
      v_user_id,
      v_signature
    ) returning id into v_product_id;

    insert into public.product_units (product_id, name, conversion_to_piece, selling_price, barcode, is_default, is_active)
    values (v_product_id, 'Piece', 1, (v_combo ->> 'piece_price')::numeric, null, true, true);

    if (v_combo ->> 'pieces_per_box')::integer > 1 then
      insert into public.product_units (product_id, name, conversion_to_piece, selling_price, barcode, is_default, is_active)
      values (v_product_id, 'Box', (v_combo ->> 'pieces_per_box')::integer, (v_combo ->> 'box_price')::numeric, null, false, true);
    end if;

    v_opening_quantity := (coalesce((v_combo ->> 'opening_boxes')::integer, 0) * (v_combo ->> 'pieces_per_box')::integer) + coalesce((v_combo ->> 'opening_loose_pieces')::integer, 0);
    if v_opening_quantity > 0 then
      insert into public.stock_movements (product_id, movement_type, quantity_pieces, reference_type, note, created_by)
      values (v_product_id, 'opening', v_opening_quantity, 'product_setup', 'Opening inventory', v_user_id);
    end if;

    for v_attr_row in
      select value, (ordinality - 1)::smallint as position
      from jsonb_array_elements(coalesce(v_combo -> 'variant_attributes', '[]'::jsonb)) with ordinality
    loop
      if nullif(trim(v_attr_row.value ->> 'type'), '') is null or nullif(trim(v_attr_row.value ->> 'value'), '') is null then
        raise exception 'Each variant attribute needs a type and a value.';
      end if;
      insert into public.product_variant_attributes (product_id, variant_type, variant_value, position)
      values (v_product_id, trim(v_attr_row.value ->> 'type'), trim(v_attr_row.value ->> 'value'), v_attr_row.position);
    end loop;

    insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
    values (
      v_user_id, 'product.created', 'product', v_product_id, trim(p_family_name),
      jsonb_build_object('sku', upper(trim(v_combo ->> 'sku')), 'barcode', nullif(trim(v_combo ->> 'barcode'), ''), 'family_id', v_family_id, 'variant_attributes', coalesce(v_combo -> 'variant_attributes', '[]'::jsonb))
    );
  end loop;

  return v_family_id;
end;
$$;

revoke all on function public.create_product_family_batch(text, text, jsonb) from public;
grant execute on function public.create_product_family_batch(text, text, jsonb) to authenticated;

create function public.add_product_variant(
  p_family_id uuid,
  p_sku text,
  p_barcode text,
  p_cost_per_piece numeric,
  p_piece_price numeric,
  p_pieces_per_box integer,
  p_box_price numeric,
  p_opening_boxes integer,
  p_opening_loose_pieces integer,
  p_low_stock_threshold integer,
  p_variant_attributes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_family public.product_families;
  v_sibling public.products;
  v_product_id uuid;
  v_opening_quantity integer;
  v_attr_row record;
  v_signature text;
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to create products.'; end if;

  select * into v_family from public.product_families where id = p_family_id and is_active = true;
  if not found then raise exception 'Product was not found or is inactive.'; end if;
  if nullif(trim(p_sku), '') is null then raise exception 'SKU is required.'; end if;
  if jsonb_typeof(p_variant_attributes) <> 'array' or jsonb_array_length(p_variant_attributes) = 0 then
    raise exception 'Give this combination at least one variant attribute.';
  end if;
  if p_cost_per_piece < 0 or p_piece_price < 0 or p_box_price < 0 then raise exception 'Prices cannot be negative.'; end if;
  if p_pieces_per_box < 1 or p_opening_boxes < 0 or p_opening_loose_pieces < 0 or p_low_stock_threshold < 0 then
    raise exception 'Stock quantities must be valid positive numbers.';
  end if;
  if p_pieces_per_box > 1 and p_box_price <= 0 then raise exception 'Box price is required when a box contains multiple pieces.'; end if;

  select string_agg(attr ->> 'type' || ':' || (attr ->> 'value'), '|' order by attr ->> 'type')
  into v_signature
  from jsonb_array_elements(p_variant_attributes) attr;

  if exists (select 1 from public.products where family_id = p_family_id and variant_signature = v_signature) then
    raise exception 'This product already has a combination with those variant attributes.';
  end if;

  select * into v_sibling from public.products where family_id = p_family_id order by created_at limit 1;

  insert into public.products (
    family_id, category_id, sku, barcode, name, cost_per_piece, low_stock_threshold, created_by, variant_signature
  ) values (
    p_family_id,
    v_sibling.category_id,
    upper(trim(p_sku)),
    nullif(trim(p_barcode), ''),
    v_family.name,
    p_cost_per_piece,
    p_low_stock_threshold,
    v_user_id,
    v_signature
  ) returning id into v_product_id;

  insert into public.product_units (product_id, name, conversion_to_piece, selling_price, barcode, is_default, is_active)
  values (v_product_id, 'Piece', 1, p_piece_price, null, true, true);

  if p_pieces_per_box > 1 then
    insert into public.product_units (product_id, name, conversion_to_piece, selling_price, barcode, is_default, is_active)
    values (v_product_id, 'Box', p_pieces_per_box, p_box_price, null, false, true);
  end if;

  v_opening_quantity := (p_opening_boxes * p_pieces_per_box) + p_opening_loose_pieces;
  if v_opening_quantity > 0 then
    insert into public.stock_movements (product_id, movement_type, quantity_pieces, reference_type, note, created_by)
    values (v_product_id, 'opening', v_opening_quantity, 'product_setup', 'Opening inventory', v_user_id);
  end if;

  for v_attr_row in
    select value, (ordinality - 1)::smallint as position
    from jsonb_array_elements(p_variant_attributes) with ordinality
  loop
    if nullif(trim(v_attr_row.value ->> 'type'), '') is null or nullif(trim(v_attr_row.value ->> 'value'), '') is null then
      raise exception 'Each variant attribute needs a type and a value.';
    end if;
    insert into public.product_variant_attributes (product_id, variant_type, variant_value, position)
    values (v_product_id, trim(v_attr_row.value ->> 'type'), trim(v_attr_row.value ->> 'value'), v_attr_row.position);
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (
    v_user_id, 'product.created', 'product', v_product_id, v_family.name,
    jsonb_build_object('sku', upper(trim(p_sku)), 'barcode', nullif(trim(p_barcode), ''), 'family_id', p_family_id, 'variant_attributes', p_variant_attributes)
  );

  return v_product_id;
end;
$$;

revoke all on function public.add_product_variant(uuid, text, text, numeric, numeric, integer, numeric, integer, integer, integer, jsonb) from public;
grant execute on function public.add_product_variant(uuid, text, text, numeric, numeric, integer, numeric, integer, integer, integer, jsonb) to authenticated;

create function public.update_inventory_product_v2(
  p_product_id uuid,
  p_sku text,
  p_barcode text,
  p_category_name text,
  p_cost_per_piece numeric,
  p_piece_price numeric,
  p_pieces_per_box integer,
  p_box_price numeric,
  p_low_stock_threshold integer,
  p_variant_attributes jsonb
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
  v_attr_row record;
  v_before_attributes jsonb;
  v_signature text;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can edit product details.'; end if;
  if nullif(trim(p_sku), '') is null then raise exception 'SKU is required.'; end if;
  if p_cost_per_piece < 0 or p_piece_price < 0 or p_box_price < 0 then raise exception 'Prices cannot be negative.'; end if;
  if p_pieces_per_box < 1 or p_low_stock_threshold < 0 then raise exception 'Packaging and stock-alert values must be valid.'; end if;
  if p_pieces_per_box > 1 and p_box_price <= 0 then raise exception 'Box price is required when a box contains multiple pieces.'; end if;

  select * into v_product from public.products where id = p_product_id and is_active = true for update;
  if not found then raise exception 'Product was not found or is inactive.'; end if;

  if jsonb_typeof(p_variant_attributes) = 'array' then
    select string_agg(attr ->> 'type' || ':' || (attr ->> 'value'), '|' order by attr ->> 'type')
    into v_signature
    from jsonb_array_elements(p_variant_attributes) attr;
  end if;

  if v_signature is not null and exists (
    select 1 from public.products
    where family_id = v_product.family_id and id <> p_product_id and variant_signature = v_signature
  ) then
    raise exception 'Another combination in this product already uses those variant attributes.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('type', variant_type, 'value', variant_value) order by position), '[]'::jsonb)
  into v_before_attributes
  from public.product_variant_attributes where product_id = p_product_id;

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
      cost_per_piece = p_cost_per_piece,
      low_stock_threshold = p_low_stock_threshold,
      variant_signature = v_signature
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

  delete from public.product_variant_attributes where product_id = p_product_id;
  if jsonb_typeof(p_variant_attributes) = 'array' then
    for v_attr_row in
      select value, (ordinality - 1)::smallint as position
      from jsonb_array_elements(p_variant_attributes) with ordinality
    loop
      if nullif(trim(v_attr_row.value ->> 'type'), '') is null or nullif(trim(v_attr_row.value ->> 'value'), '') is null then
        raise exception 'Each variant attribute needs a type and a value.';
      end if;
      insert into public.product_variant_attributes (product_id, variant_type, variant_value, position)
      values (p_product_id, trim(v_attr_row.value ->> 'type'), trim(v_attr_row.value ->> 'value'), v_attr_row.position);
    end loop;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (
    v_user_id,
    'product.updated',
    'product',
    p_product_id,
    v_product.name,
    jsonb_build_object(
      'before', jsonb_build_object('sku', v_product.sku, 'barcode', v_product.barcode, 'variant_attributes', v_before_attributes),
      'after', jsonb_build_object(
        'sku', upper(trim(p_sku)), 'barcode', nullif(trim(p_barcode), ''), 'category', nullif(trim(p_category_name), ''),
        'cost_per_piece', p_cost_per_piece, 'piece_price', p_piece_price,
        'pieces_per_box', p_pieces_per_box, 'box_price', case when p_pieces_per_box > 1 then p_box_price else null end,
        'low_stock_threshold', p_low_stock_threshold, 'variant_attributes', coalesce(p_variant_attributes, '[]'::jsonb)
      )
    )
  );
end;
$$;

revoke all on function public.update_inventory_product_v2(uuid, text, text, text, numeric, numeric, integer, numeric, integer, jsonb) from public;
grant execute on function public.update_inventory_product_v2(uuid, text, text, text, numeric, numeric, integer, numeric, integer, jsonb) to authenticated;

create function public.rename_product_family(p_family_id uuid, p_name text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(p_name);
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can rename products.'; end if;
  if nullif(v_name, '') is null then raise exception 'Product name is required.'; end if;

  update public.product_families set name = v_name where id = p_family_id and is_active = true;
  if not found then raise exception 'Product was not found or is inactive.'; end if;

  update public.products set name = v_name where family_id = p_family_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, entity_name, details)
  values (v_user_id, 'product.renamed', 'product_family', p_family_id, v_name, jsonb_build_object('name', v_name));
end;
$$;

revoke all on function public.rename_product_family(uuid, text) from public;
grant execute on function public.rename_product_family(uuid, text) to authenticated;

-- Keep receipt snapshots variant-aware now that the label comes from attributes, not a column.
create or replace function public.complete_pos_sale(
  p_channel text,
  p_external_order_id text,
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
  v_is_gcash boolean := p_channel = 'walk_in' and nullif(trim(p_external_order_id), '') is not null;
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to complete sales.'; end if;
  if p_channel not in ('walk_in', 'tiktok', 'lazada', 'shopee') then raise exception 'Choose a valid sales channel.'; end if;
  if p_channel <> 'walk_in' and nullif(trim(p_external_order_id), '') is null then raise exception 'Enter the marketplace order ID.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item to the cart.'; end if;
  if v_discount_type not in ('none', 'percentage', 'fixed') or v_discount_value < 0 then raise exception 'Enter a valid discount.'; end if;
  if v_discount_type = 'percentage' and v_discount_value > 100 then raise exception 'Discount percentage cannot exceed 100%%.'; end if;

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
      case when v_is_gcash then 'Walk-in GCash sale ' || v_receipt_number when p_channel = 'walk_in' then 'Walk-in cash sale ' || v_receipt_number else initcap(p_channel) || ' order ' || trim(p_external_order_id) end,
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
  if p_channel = 'walk_in' and not v_is_gcash then
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
    'payment_method', case when p_channel <> 'walk_in' then 'marketplace' when v_is_gcash then 'gcash' else 'cash' end,
    'external_order_id', case when p_channel = 'walk_in' then null else trim(p_external_order_id) end,
    'payment_reference', case when v_is_gcash then trim(p_external_order_id) else null end,
    'subtotal', v_subtotal, 'discount_type', v_discount_type, 'discount_value', v_discount_value,
    'discount_amount', v_discount, 'tax_rate', v_tax_rate, 'tax_amount', v_tax, 'total_amount', v_total,
    'amount_tendered', v_tendered, 'change_amount', v_change, 'line_count', v_line_count
  ));

  return jsonb_build_object('sale_id', v_sale_id, 'receipt_number', v_receipt_number, 'subtotal', v_subtotal,
    'discount_type', v_discount_type, 'discount_value', v_discount_value, 'discount_amount', v_discount,
    'tax_rate', v_tax_rate, 'tax_amount', v_tax, 'total_amount', v_total, 'amount_tendered', v_tendered,
    'change_amount', v_change, 'payment_method', case when p_channel <> 'walk_in' then 'marketplace' when v_is_gcash then 'gcash' else 'cash' end,
    'completed_at', now());
end;
$$;

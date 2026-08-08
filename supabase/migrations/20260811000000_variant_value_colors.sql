-- Lets staff tag a variant type/value pair (e.g. Flavor: Crunch) with a color, reused
-- everywhere that value appears across every product family — matching the Notion/
-- Trello tag-color model, not a per-product-row color. Cosmetic/organizational only
-- (no financial or inventory effect), so it's staff-level like other low-risk
-- operational actions, not super_admin-only.
-- Run after 20260810000000_back_orders.sql.

create table public.variant_value_colors (
  variant_type text not null,
  variant_value text not null,
  color text not null check (color in ('red', 'orange', 'amber', 'lime', 'emerald', 'teal', 'sky', 'indigo', 'violet', 'pink', 'slate')),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (variant_type, variant_value)
);

alter table public.variant_value_colors enable row level security;
create policy "staff view variant colors" on public.variant_value_colors
  for select to authenticated using (public.is_active_staff());
create policy "staff set variant colors" on public.variant_value_colors
  for insert to authenticated with check (public.is_active_staff());
create policy "staff update variant colors" on public.variant_value_colors
  for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());

create function public.set_variant_value_color(
  p_variant_type text,
  p_variant_value text,
  p_color text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.is_active_staff() then raise exception 'You do not have permission to tag variants.'; end if;
  if nullif(trim(p_variant_type), '') is null or nullif(trim(p_variant_value), '') is null then
    raise exception 'A variant type and value are required.';
  end if;
  if p_color not in ('red', 'orange', 'amber', 'lime', 'emerald', 'teal', 'sky', 'indigo', 'violet', 'pink', 'slate') then
    raise exception 'Choose a valid color.';
  end if;

  insert into public.variant_value_colors (variant_type, variant_value, color, updated_by, updated_at)
  values (trim(p_variant_type), trim(p_variant_value), p_color, v_user_id, now())
  on conflict (variant_type, variant_value) do update set
    color = excluded.color,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

revoke all on function public.set_variant_value_color(text, text, text) from public;
grant execute on function public.set_variant_value_color(text, text, text) to authenticated;

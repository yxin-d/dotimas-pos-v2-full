-- ============================================================================
-- Price-change history: one row per product per business day.
--
-- Several edits to the same product on the same (Manila) day are merged into
-- that day's row: old_cost/old_price stay as they were at the start of the
-- day, new_cost/new_price follow the latest edit. A day where the product
-- ends up back where it started keeps its row (old = new); the report hides
-- those, since nothing actually changed.
-- ============================================================================

create or replace function public.log_product_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_today_id uuid;
begin
  select id into v_today_id
  from public.product_price_changes
  where product_id = new.id
    -- start of today in Manila, as a timestamptz
    and changed_at >= (public.business_date()::timestamp at time zone 'Asia/Manila')
  order by changed_at desc
  limit 1
  for update;

  if v_today_id is not null then
    update public.product_price_changes
    set new_cost = new.cost,
        new_price = new.price,
        product_name = new.name,
        volume = new.volume,
        category_id = new.category_id,
        changed_at = now()
    where id = v_today_id;
  else
    insert into public.product_price_changes
      (product_id, product_name, volume, category_id, old_cost, new_cost, old_price, new_price)
    values
      (new.id, new.name, new.volume, new.category_id, old.cost, new.cost, old.price, new.price);
  end if;
  return new;
end;
$$;

revoke execute on function public.log_product_price_change() from public, anon, authenticated;

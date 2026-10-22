-- ============================================================================
-- "Mark as reviewed" for price changes.
--
-- reviewed_at is set when someone has checked a flagged change and decided
-- the price is fine. Staff may set or clear ONLY that column — the history
-- values themselves stay read-only. If the same product changes again on the
-- same day (the row gets merged), the review is cleared, because that's a new
-- change nobody has checked yet.
-- ============================================================================

alter table public.product_price_changes add column reviewed_at timestamptz;

create policy "product_price_changes review" on public.product_price_changes
  for update to authenticated using (true) with check (true);
grant update (reviewed_at) on public.product_price_changes to authenticated;

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
        changed_at = now(),
        reviewed_at = null
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

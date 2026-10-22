-- ============================================================================
-- Price-change history
--
-- Every time a product's cost or selling price changes — from the edit pane,
-- bulk edit, an import, anywhere — one row is recorded here with the before
-- and after values. Done with a trigger so no code path can skip it.
-- Read by the "Price changes" report, mainly to catch "cost went up but the
-- selling price didn't".
-- ============================================================================

create table public.product_price_changes (
  id uuid primary key default gen_random_uuid(),
  -- kept (set null) if the product is later deleted; the name is snapshotted
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  volume text,
  category_id uuid references public.product_categories(id) on delete set null,
  old_cost numeric not null,
  new_cost numeric not null,
  old_price numeric not null,
  new_price numeric not null,
  changed_at timestamptz not null default now()
);
create index product_price_changes_changed_idx on public.product_price_changes (changed_at desc);
create index product_price_changes_product_idx on public.product_price_changes (product_id, changed_at desc);

create function public.log_product_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.product_price_changes
    (product_id, product_name, volume, category_id, old_cost, new_cost, old_price, new_price)
  values
    (new.id, new.name, new.volume, new.category_id, old.cost, new.cost, old.price, new.price);
  return new;
end;
$$;

create trigger trg_log_product_price_change
  after update of cost, price on public.products
  for each row
  when (old.cost is distinct from new.cost or old.price is distinct from new.price)
  execute function public.log_product_price_change();

revoke execute on function public.log_product_price_change() from public, anon, authenticated;

-- History is written only by the trigger; staff can read it, nobody can
-- edit or delete it through the API.
alter table public.product_price_changes enable row level security;
create policy "product_price_changes read" on public.product_price_changes
  for select to authenticated using (true);
grant select on public.product_price_changes to authenticated;
grant all on public.product_price_changes to service_role;

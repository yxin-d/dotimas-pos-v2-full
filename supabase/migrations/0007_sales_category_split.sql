-- ============================================================================
-- 0007 — Meals vs Store sales
--
-- Each sale line now remembers the category its product was in WHEN it was
-- sold (sales.category_name), the same way it already snapshots the product
-- name and price. Moving a product to another category later — or deleting
-- it — doesn't rewrite past days' Meals/Store totals.
--
-- "Meals" = lines whose category is Meals (any capitalisation).
-- "Store" = everything else, including custom items and uncategorised ones.
-- A sale with both is split line by line.
-- ============================================================================

alter table public.sales add column if not exists category_name text;

create or replace function public.set_sale_category()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_name is null and new.product_id is not null then
    select pc.name into new.category_name
    from public.products p
    join public.product_categories pc on pc.id = p.category_id
    where p.id = new.product_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_set_sale_category on public.sales;
create trigger trg_set_sale_category
  before insert on public.sales
  for each row execute function public.set_sale_category();

revoke execute on function public.set_sale_category() from public, anon, authenticated;

-- Backfill the sales already recorded, from today's categories.
update public.sales s
set category_name = pc.name
from public.products p
join public.product_categories pc on pc.id = p.category_id
where p.id = s.product_id
  and s.category_name is null;

-- Per business day: Meals and Store totals (completed sales only).
create or replace view public.daily_category_sales with (security_invoker = true) as
select
  public.business_date(si.created_at)                                              as sale_date,
  coalesce(sum(s.subtotal) filter (where lower(s.category_name) = 'meals'), 0)     as meals_sales,
  coalesce(sum(s.subtotal) filter (where lower(coalesce(s.category_name, '')) <> 'meals'), 0) as store_sales,
  count(distinct si.id) filter (where lower(s.category_name) = 'meals')           as meals_invoices,
  count(distinct si.id) filter (where lower(coalesce(s.category_name, '')) <> 'meals') as store_invoices
from public.sale_invoice si
join public.sales s on s.invoice_id = si.id
where si.status = 'completed'
group by public.business_date(si.created_at);

grant select on public.daily_category_sales to authenticated;

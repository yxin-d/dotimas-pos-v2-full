-- RLS policies only filter rows once a role is already allowed to touch a
-- table at all — that permission is a separate, base-level GRANT, which was
-- missing here entirely. This restores it, matching exactly what each
-- table's RLS policies already assume.

-- staff: read for all, update own row only (no client insert/delete)
grant select, update on public.staff to authenticated;

-- Shared reference/operational data: full access for authenticated
grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select, insert, update, delete on public.gcash_log to authenticated;

-- Transactional/audit tables: read + write, no delete (matches RLS — corrections
-- go through void_sale / new ledger entries, not row deletion)
grant select, insert on public.ledger to authenticated;
grant select, insert, update on public.pos_sessions to authenticated;
grant select, insert, update on public.staff_shifts to authenticated;
grant select, insert, update on public.sale_invoice to authenticated;
grant select, insert on public.invoice_payments to authenticated;
grant select, insert on public.sales to authenticated;
grant select, insert on public.expenses to authenticated;

-- gcash_submissions: the deliberately asymmetric table — anon can only insert
-- (the kiosk), authenticated can read and review
grant insert on public.gcash_submissions to anon;
grant select, update on public.gcash_submissions to authenticated;

-- ============================================================================
-- ONE-TIME RESET — wipes every Dotimas POS object in the public schema.
-- Run this ONCE, right before applying migrations/0001_baseline.sql.
--
-- Keeps: auth.users (your logins). Logins still gate the app; there is no
--        separate staff table any more.
-- Drops: every table, view, function and enum below, and ALL their data
--        (products, categories, customers, sales, ledger, sessions, ...).
--        Export anything you want to keep (e.g. Products → Export CSV) first.
-- ============================================================================

begin;

drop trigger if exists on_auth_user_created on auth.users;

drop view if exists public.daily_summary;
drop view if exists public.credit_summary;

drop table if exists
  public.product_price_changes,
  public.ledger,
  public.invoice_payments,
  public.sales,
  public.sale_invoice,
  public.expenses,
  public.staff_shifts,
  public.pos_sessions,
  public.gcash_submissions,
  public.gcash_log,
  public.products,
  public.product_categories,
  public.customers,
  public.app_settings,
  public.staff
cascade;

drop function if exists public.complete_sale(uuid, jsonb, boolean, jsonb) cascade;
drop function if exists public.complete_sale(uuid, jsonb, boolean, jsonb, uuid, timestamptz, uuid) cascade;
drop function if exists public.record_credit_change(uuid, uuid, ledger_entry_type, numeric, text) cascade;
drop function if exists public.record_credit_change(uuid, uuid, ledger_entry_type, numeric, text, timestamptz) cascade;
drop function if exists public.start_shift(numeric) cascade;
drop function if exists public.open_day(numeric) cascade;
drop function if exists public.close_day(numeric, text) cascade;
drop function if exists public.void_sale(uuid, text) cascade;
drop function if exists public.confirm_gcash_submission(uuid) cascade;
drop function if exists public.reject_gcash_submission(uuid, text) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.refresh_invoice_payment_method() cascade;
drop function if exists public.deduct_stock_on_sale() cascade;
drop function if exists public.business_date(timestamptz) cascade;
drop function if exists public.delete_customer(uuid) cascade;
drop function if exists public.log_product_price_change() cascade;

drop type if exists payment_method_type cascade;
drop type if exists ledger_entry_type cascade;
drop type if exists invoice_status cascade;
drop type if exists gcash_direction cascade;
drop type if exists gcash_submission_status cascade;

-- Clear the old migration history (0001–0009 + two July leftovers) so it
-- doesn't claim objects that no longer exist. Only bookkeeping — skipped if
-- the table isn't there.
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations;
  end if;
end $$;

commit;

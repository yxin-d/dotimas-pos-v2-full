-- Trigger functions must never be callable directly via the REST API — only
-- ever fire automatically through their table triggers. Revoking EXECUTE here
-- does not affect trigger firing (Postgres invokes trigger functions through
-- the table's DML machinery, not the caller's EXECUTE privilege).
revoke execute on function public.deduct_stock_on_sale() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.refresh_invoice_payment_method() from public;
revoke execute on function public.touch_updated_at() from public;

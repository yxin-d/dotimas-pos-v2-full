-- Enable RLS everywhere. No table goes live without it this time.
alter table public.staff enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.ledger enable row level security;
alter table public.pos_sessions enable row level security;
alter table public.staff_shifts enable row level security;
alter table public.sale_invoice enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.gcash_log enable row level security;
alter table public.gcash_submissions enable row level security;
alter table public.app_settings enable row level security;

-- staff: everyone authenticated can read (needed for attribution displays),
-- a staff member can only update their own row. No client-side insert/delete —
-- rows are created only by the auth.users trigger.
create policy "staff read" on public.staff for select to authenticated using (true);
create policy "staff update own" on public.staff for update to authenticated using (auth.uid() = id);

-- Shared reference/operational data: full access for any authenticated staff,
-- nothing for anon. This matches the explicit single-owner, shared-data model.
create policy "product_categories full access" on public.product_categories for all to authenticated using (true) with check (true);
create policy "products full access" on public.products for all to authenticated using (true) with check (true);
create policy "customers full access" on public.customers for all to authenticated using (true) with check (true);
create policy "app_settings full access" on public.app_settings for all to authenticated using (true) with check (true);
create policy "gcash_log full access" on public.gcash_log for all to authenticated using (true) with check (true);

-- Transactional/audit tables: read + write, but no delete via the API —
-- corrections go through void_sale / new ledger entries, not row deletion.
create policy "ledger rw" on public.ledger for select to authenticated using (true);
create policy "ledger insert" on public.ledger for insert to authenticated with check (true);
create policy "pos_sessions rw" on public.pos_sessions for select to authenticated using (true);
create policy "pos_sessions insert" on public.pos_sessions for insert to authenticated with check (true);
create policy "pos_sessions update" on public.pos_sessions for update to authenticated using (true);
create policy "staff_shifts rw" on public.staff_shifts for select to authenticated using (true);
create policy "staff_shifts insert" on public.staff_shifts for insert to authenticated with check (true);
create policy "staff_shifts update" on public.staff_shifts for update to authenticated using (true);
create policy "sale_invoice rw" on public.sale_invoice for select to authenticated using (true);
create policy "sale_invoice insert" on public.sale_invoice for insert to authenticated with check (true);
create policy "sale_invoice update" on public.sale_invoice for update to authenticated using (true);
create policy "invoice_payments rw" on public.invoice_payments for select to authenticated using (true);
create policy "invoice_payments insert" on public.invoice_payments for insert to authenticated with check (true);
create policy "sales rw" on public.sales for select to authenticated using (true);
create policy "sales insert" on public.sales for insert to authenticated with check (true);
create policy "expenses rw" on public.expenses for select to authenticated using (true);
create policy "expenses insert" on public.expenses for insert to authenticated with check (true);

-- gcash_submissions: the one deliberately asymmetric table. anon can create
-- (the kiosk), but can never read anything back — including its own
-- submission. Only authenticated staff can view the queue and review it.
create policy "gcash_submissions kiosk insert" on public.gcash_submissions for insert to anon with check (true);
create policy "gcash_submissions staff read" on public.gcash_submissions for select to authenticated using (true);
create policy "gcash_submissions staff review" on public.gcash_submissions for update to authenticated using (true);

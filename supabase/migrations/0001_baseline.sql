-- ============================================================================
-- Dotimas POS — V2 baseline schema (consolidates old 0001–0009)
--
-- Changes vs. the old migrations:
--   * Business dates use Asia/Manila (public.business_date), not the server's
--     UTC clock. Before, 00:00–08:00 Manila counted as the previous day.
--   * complete_sale is offline-ready: the device can supply the invoice id,
--     the time the sale happened and the day (session) it belongs to. Re-sending the
--     same invoice id is a no-op, so a sync queue can retry safely.
--   * close_day totals the day by session instead of by UTC date,
--     so sales synced later still land on the right day.
--   * products.srp restored (it was dropped from V2 by mistake).
--   * daily_summary / credit_summary views — the dashboard reads these, but
--     they never existed in V2, so its stats always came back empty.
--   * No staff/shift tracking. Login (Supabase Auth) still gates the whole
--     app, but sales aren't attributed to a person. The day is still opened
--     with starting cash and closed with a drawer count (pos_sessions).
--   * Indexes on the common lookups; explicit grants for service_role too.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type payment_method_type as enum ('cash','gcash','maya','mixed','credit');
create type ledger_entry_type as enum ('credit_given','payment_made','opening_balance');
create type invoice_status as enum ('completed','voided');
create type gcash_direction as enum ('received','sent');
create type gcash_submission_status as enum ('pending','confirmed','rejected');

-- ---------------------------------------------------------------------------
-- Business date: the store runs on Manila time, the database clock is UTC.
-- Use this everywhere a "day" matters.
-- ---------------------------------------------------------------------------
create function public.business_date(p_ts timestamptz default now())
returns date
language sql stable
set search_path = ''
as $$
  select (p_ts at time zone 'Asia/Manila')::date
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- stocks is advisory only — never blocks a sale
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  barcode text unique,
  volume text,
  category_id uuid references public.product_categories(id) on delete set null,
  price numeric not null default 0,
  cost numeric not null default 0,
  srp numeric,                       -- suggested retail price (reference only)
  stocks numeric not null default 0,
  low_stock_threshold numeric not null default 5,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);

create function public.touch_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Customers & settings
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  credit_balance numeric not null default 0,
  credit_warning_threshold numeric,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('default_credit_warning_threshold', '1000'),
  ('store_name', '"Dotimas Store"'),
  ('receipt_footer_text', '"Salamat po!"');

-- ---------------------------------------------------------------------------
-- Days & sales
-- ---------------------------------------------------------------------------
-- pos_sessions: one row per business day (Manila)
create table public.pos_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null unique default public.business_date(),
  status text not null default 'open' check (status in ('open','closed')),
  starting_cash numeric not null,
  closing_cash numeric,
  expected_cash numeric,
  variance numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text
);

-- sale_invoice. created_at = when the sale happened (on the device, for
-- offline sales); synced_at = when it reached the server.
create table public.sale_invoice (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  session_id uuid not null references public.pos_sessions(id),
  payment_method payment_method_type,
  is_credit boolean not null default false,
  amount_received numeric not null default 0,
  change numeric not null default 0,
  total_amount numeric not null default 0,
  status invoice_status not null default 'completed',
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index sale_invoice_session_idx on public.sale_invoice (session_id);
create index sale_invoice_created_idx on public.sale_invoice (created_at desc);
create index sale_invoice_customer_idx on public.sale_invoice (customer_id);

-- ledger: single source of truth for credit balance history
create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  invoice_id uuid references public.sale_invoice(id),
  entry_type ledger_entry_type not null,
  amount numeric not null check (amount > 0),
  running_balance numeric not null,
  description text,
  created_at timestamptz not null default now()
);
create index ledger_customer_idx on public.ledger (customer_id, created_at desc);

-- invoice_payments: real tender breakdown
create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sale_invoice(id) on delete cascade,
  method payment_method_type not null,
  amount numeric not null check (amount > 0)
);
create index invoice_payments_invoice_idx on public.invoice_payments (invoice_id);

create function public.refresh_invoice_payment_method()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_methods payment_method_type[];
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  select array_agg(distinct method) into v_methods
  from public.invoice_payments where invoice_id = v_invoice_id;

  update public.sale_invoice
  set payment_method = case
    when array_length(v_methods, 1) > 1 then 'mixed'::payment_method_type
    when array_length(v_methods, 1) = 1 then v_methods[1]
    else payment_method
  end
  where id = v_invoice_id;
  return new;
end;
$$;

create trigger trg_refresh_payment_method
  after insert or update or delete on public.invoice_payments
  for each row execute function public.refresh_invoice_payment_method();

-- sales (line items). product_name is snapshotted, so a deleted product
-- doesn't erase history.
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sale_invoice(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  qty numeric not null check (qty > 0),
  unit_price numeric not null,
  unit_cost numeric not null default 0,
  subtotal numeric not null,
  net_profit numeric not null default 0,
  created_at timestamptz not null default now()
);
create index sales_invoice_idx on public.sales (invoice_id);
create index sales_product_idx on public.sales (product_id);

-- Stock deduction on sale — advisory only, no floor at zero, never blocks a sale
create function public.deduct_stock_on_sale()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null then
    update public.products set stocks = stocks - new.qty, updated_at = now()
    where id = new.product_id;
  end if;
  return new;
end;
$$;

create trigger trg_deduct_stock_on_sale
  after insert on public.sales
  for each row execute function public.deduct_stock_on_sale();

-- expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text,
  amount numeric not null check (amount > 0),
  expense_date date not null default public.business_date(),
  notes text,
  created_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (expense_date);

-- ---------------------------------------------------------------------------
-- GCash
-- ---------------------------------------------------------------------------
create table public.gcash_log (
  id uuid primary key default gen_random_uuid(),
  direction gcash_direction not null,
  amount numeric not null check (amount > 0),
  sender text,
  ref_number text,
  notes text,
  txn_date date not null default public.business_date(),
  created_at timestamptz not null default now()
);

-- customer-facing kiosk, write-only from the customer's side
create table public.gcash_submissions (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  direction gcash_direction not null,
  amount numeric not null check (amount > 0),
  reference_number text not null,
  transaction_date date not null,
  notes text,
  status gcash_submission_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_notes text
);

-- Once a reference number is confirmed it can never be confirmed again.
create unique index gcash_submissions_confirmed_ref_uidx
  on public.gcash_submissions (reference_number)
  where status = 'confirmed';

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- record_credit_change: atomic balance update. p_created_at lets a synced
-- offline sale keep its real time in the ledger.
create function public.record_credit_change(
  p_customer_id uuid,
  p_invoice_id uuid,
  p_entry_type ledger_entry_type,
  p_amount numeric,
  p_description text default null,
  p_created_at timestamptz default null
)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_new_balance numeric;
  v_delta numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  v_delta := case when p_entry_type in ('credit_given','opening_balance') then p_amount else -p_amount end;

  update public.customers
  set credit_balance = credit_balance + v_delta
  where id = p_customer_id
  returning credit_balance into v_new_balance;

  if not found then
    raise exception 'Customer % not found', p_customer_id;
  end if;

  if p_entry_type = 'payment_made' and v_new_balance < 0 then
    raise exception 'Payment of % exceeds current balance', p_amount;
  end if;

  insert into public.ledger (customer_id, invoice_id, entry_type, amount, running_balance, description, created_at)
  values (p_customer_id, p_invoice_id, p_entry_type, p_amount, v_new_balance, p_description,
          least(coalesce(p_created_at, now()), now()));

  return v_new_balance;
end;
$$;

-- open_day: opens today's business day with the starting drawer cash.
-- Online only. Calling it again on an already-open day is harmless.
create function public.open_day(p_starting_cash numeric)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := public.business_date();
  v_session public.pos_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- A previous day that was never closed is still the live drawer: the cash
  -- in it hasn't been counted yet. Close that one first.
  select * into v_session from public.pos_sessions
  where status = 'open' order by session_date desc limit 1;

  if found then
    if v_session.session_date < v_today then
      raise exception 'The day % was never closed. Close it before opening today', v_session.session_date;
    end if;
    return jsonb_build_object('session_id', v_session.id, 'mode', 'already_open');
  end if;

  if exists (select 1 from public.pos_sessions where session_date = v_today) then
    raise exception 'Today''s day has already been closed';
  end if;

  if p_starting_cash is null or p_starting_cash < 0 then
    raise exception 'Starting cash is required to open the day';
  end if;

  insert into public.pos_sessions (session_date, status, starting_cash, opened_at)
  values (v_today, 'open', p_starting_cash, now())
  returning * into v_session;

  return jsonb_build_object('session_id', v_session.id, 'mode', 'day_opened');
end;
$$;

-- close_day: server-computed reconciliation, never trusts client totals.
-- Closes the open day (even if it's now past midnight) and counts every sale
-- recorded against it, whenever it was synced. The app must sync any offline
-- sales BEFORE calling this — complete_sale rejects sales for a closed day.
create function public.close_day(p_closing_cash numeric, p_notes text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_session_id uuid;
  v_session_date date;
  v_starting numeric;
  v_cash_collected numeric;
  v_change_given numeric;
  v_expenses numeric;
  v_expected numeric;
  v_variance numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'Enter the counted cash';
  end if;

  select id, session_date, starting_cash into v_session_id, v_session_date, v_starting
  from public.pos_sessions
  where status = 'open'
  order by session_date desc
  limit 1
  for update;

  if v_session_id is null then
    raise exception 'There is no open day to close';
  end if;

  select coalesce(sum(ip.amount), 0) into v_cash_collected
  from public.invoice_payments ip
  join public.sale_invoice si on si.id = ip.invoice_id
  where si.session_id = v_session_id and si.status = 'completed' and ip.method = 'cash';

  select coalesce(sum(change), 0) into v_change_given
  from public.sale_invoice
  where session_id = v_session_id and status = 'completed';

  select coalesce(sum(amount), 0) into v_expenses
  from public.expenses where expense_date = v_session_date;

  v_expected := v_starting + v_cash_collected - v_change_given - v_expenses;
  v_variance := p_closing_cash - v_expected;

  update public.pos_sessions
  set status = 'closed', closing_cash = p_closing_cash, expected_cash = v_expected,
      variance = v_variance, closed_at = now(),
      notes = coalesce(p_notes, notes)
  where id = v_session_id;

  return jsonb_build_object(
    'session_date', v_session_date,
    'expected_cash', v_expected,
    'variance', v_variance,
    'closing_cash', p_closing_cash
  );
end;
$$;

-- complete_sale: re-derives cost server-side, supports real mixed tender, no
-- stock gating. Offline-ready:
--   p_invoice_id  id generated on the device. Re-sending an id that already
--                 exists returns it without doing anything (safe retries).
--   p_sold_at     when the sale happened on the device (default now()).
--                 Clamped so it can't be in the future or before the day opened.
--   p_session_id  the day that was open on the device (default: the open
--                 day). It must not be closed yet.
-- Item price: "custom_price" overrides the catalog price. For offline/queued
-- sales the device should send the price it actually charged, so a price
-- edit made before the sync can't change what the customer paid.
create function public.complete_sale(
  p_customer_id uuid,
  p_payments jsonb,      -- [{ "method": "cash", "amount": 100 }, ...]
  p_is_credit boolean,
  p_items jsonb,         -- [{ "product_id": uuid|null, "product_name": text, "qty": n, "custom_price": numeric|null }]
  p_invoice_id uuid default null,
  p_sold_at timestamptz default null,
  p_session_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_sold_at timestamptz;
  v_invoice_id uuid;
  v_item jsonb;
  v_pay jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_unit_cost numeric;
  v_subtotal numeric;
  v_net_profit numeric;
  v_total numeric := 0;
  v_total_paid numeric := 0;
  v_change numeric;
  v_pname text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Already synced? Then this is a retry: report success, change nothing.
  if p_invoice_id is not null and exists (select 1 from public.sale_invoice where id = p_invoice_id) then
    return p_invoice_id;
  end if;

  if p_session_id is not null then
    select * into v_session from public.pos_sessions where id = p_session_id;
    if not found then
      raise exception 'That day was not found';
    end if;
  else
    select * into v_session from public.pos_sessions
    where status = 'open' order by session_date desc limit 1;
    if not found then
      raise exception 'Open the day before making a sale';
    end if;
  end if;

  if v_session.status = 'closed' then
    raise exception 'The day % is already closed, so this sale can no longer be added', v_session.session_date;
  end if;

  -- When did it happen? Trust the device, but not before the day opened and
  -- not in the future.
  v_sold_at := coalesce(p_sold_at, now());
  v_sold_at := least(v_sold_at, now());
  v_sold_at := greatest(v_sold_at, v_session.opened_at);

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  insert into public.sale_invoice (id, customer_id, session_id, is_credit, total_amount, created_at)
  values (coalesce(p_invoice_id, gen_random_uuid()), p_customer_id, v_session.id, p_is_credit, 0, v_sold_at)
  on conflict (id) do nothing
  returning id into v_invoice_id;

  -- Lost a race with an identical retry that committed first.
  if v_invoice_id is null then
    return p_invoice_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty        := (v_item->>'qty')::numeric;
    v_pname      := v_item->>'product_name';

    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity for %', coalesce(v_pname, 'item');
    end if;

    if v_product_id is not null then
      select price, cost, coalesce(v_pname, name) into v_unit_price, v_unit_cost, v_pname
      from public.products where id = v_product_id;
      if not found then
        raise exception 'Product % no longer exists', v_product_id;
      end if;
      -- is_active never blocks a sale (staff can opt in to sell inactive stock)
      if v_item->>'custom_price' is not null then
        v_unit_price := greatest((v_item->>'custom_price')::numeric, 0);
      end if;
    else
      v_unit_price := (v_item->>'custom_price')::numeric;
      v_unit_cost := 0;
      if v_unit_price is null or v_unit_price < 0 then
        raise exception 'Custom item % needs a valid price', coalesce(v_pname, '(unnamed)');
      end if;
      if v_pname is null or trim(v_pname) = '' then
        raise exception 'Custom item needs a name';
      end if;
    end if;

    v_unit_cost  := coalesce(v_unit_cost, 0);
    v_subtotal   := v_unit_price * v_qty;
    v_net_profit := (v_unit_price - v_unit_cost) * v_qty;
    v_total      := v_total + v_subtotal;

    insert into public.sales (invoice_id, product_id, product_name, qty, unit_price, unit_cost, subtotal, net_profit, created_at)
    values (v_invoice_id, v_product_id, v_pname, v_qty, v_unit_price, v_unit_cost, v_subtotal, v_net_profit, v_sold_at);
  end loop;

  if p_is_credit then
    if p_customer_id is null then
      raise exception 'Credit sale requires a customer';
    end if;
    insert into public.invoice_payments (invoice_id, method, amount) values (v_invoice_id, 'credit', v_total);
    perform public.record_credit_change(
      p_customer_id, v_invoice_id, 'credit_given'::ledger_entry_type, v_total,
      'Credit from invoice #' || upper(left(v_invoice_id::text, 8)),
      v_sold_at
    );
    update public.sale_invoice set amount_received = 0, change = 0, total_amount = v_total where id = v_invoice_id;
  else
    if p_payments is null or jsonb_array_length(p_payments) = 0 then
      raise exception 'Payment breakdown is required';
    end if;
    for v_pay in select * from jsonb_array_elements(p_payments) loop
      if (v_pay->>'method') = 'credit' then
        raise exception 'Use a credit sale instead of a credit payment line';
      end if;
      v_total_paid := v_total_paid + (v_pay->>'amount')::numeric;
      insert into public.invoice_payments (invoice_id, method, amount)
      values (v_invoice_id, (v_pay->>'method')::payment_method_type, (v_pay->>'amount')::numeric);
    end loop;

    if v_total_paid < v_total then
      raise exception 'Amount received (%) is less than the total (%)', v_total_paid, v_total;
    end if;
    v_change := v_total_paid - v_total;

    update public.sale_invoice
    set amount_received = v_total_paid, change = v_change, total_amount = v_total
    where id = v_invoice_id;
  end if;

  return v_invoice_id;
end;
$$;

-- void_sale: reverses stock and any credit ledger entry atomically
create function public.void_sale(p_invoice_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_invoice public.sale_invoice%rowtype;
  v_line record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to void a sale';
  end if;

  select * into v_invoice from public.sale_invoice where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'voided' then raise exception 'This sale is already voided'; end if;

  for v_line in select * from public.sales where invoice_id = p_invoice_id loop
    if v_line.product_id is not null then
      update public.products set stocks = stocks + v_line.qty where id = v_line.product_id;
    end if;
  end loop;

  if v_invoice.is_credit and v_invoice.customer_id is not null then
    perform public.record_credit_change(
      v_invoice.customer_id, v_invoice.id, 'payment_made'::ledger_entry_type,
      v_invoice.total_amount, 'Reversed — sale voided: ' || p_reason
    );
  end if;

  update public.sale_invoice
  set status = 'voided', voided_at = now(), void_reason = p_reason
  where id = p_invoice_id;
end;
$$;

-- confirm/reject GCash kiosk submissions
create function public.confirm_gcash_submission(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ref text;
  v_status gcash_submission_status;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select reference_number, status into v_ref, v_status from public.gcash_submissions where id = p_id;
  if not found then raise exception 'Submission not found'; end if;
  if v_status <> 'pending' then raise exception 'This submission has already been reviewed'; end if;

  if exists (
    select 1 from public.gcash_submissions
    where reference_number = v_ref and status = 'confirmed' and id <> p_id
  ) then
    raise exception 'Reference number % has already been confirmed on another entry', v_ref;
  end if;

  update public.gcash_submissions
  set status = 'confirmed', reviewed_at = now()
  where id = p_id;
end;
$$;

create function public.reject_gcash_submission(p_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.gcash_submissions
  set status = 'rejected', reviewed_at = now(), review_notes = p_notes
  where id = p_id and status = 'pending';
  if not found then raise exception 'Submission not found or already reviewed'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Views (dashboard). security_invoker so they respect RLS like the tables.
-- ---------------------------------------------------------------------------
create view public.daily_summary with (security_invoker = true) as
select
  public.business_date(si.created_at)                                   as sale_date,
  coalesce(sum(si.total_amount), 0)                                     as gross_sales,
  count(*)                                                              as invoice_count,
  coalesce(sum(si.total_amount) filter (where si.is_credit), 0)         as credit_given,
  coalesce(sum(s.profit), 0)                                            as net_profit
from public.sale_invoice si
left join (
  select invoice_id, sum(net_profit) as profit from public.sales group by invoice_id
) s on s.invoice_id = si.id
where si.status = 'completed'
group by public.business_date(si.created_at);

create view public.credit_summary with (security_invoker = true) as
select id, name, phone, credit_balance, credit_warning_threshold
from public.customers
where credit_balance > 0;

-- ---------------------------------------------------------------------------
-- Row level security — on for every table
-- ---------------------------------------------------------------------------
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.ledger enable row level security;
alter table public.pos_sessions enable row level security;
alter table public.sale_invoice enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.gcash_log enable row level security;
alter table public.gcash_submissions enable row level security;
alter table public.app_settings enable row level security;

-- Shared reference/operational data: full access for any signed-in user
create policy "product_categories full access" on public.product_categories for all to authenticated using (true) with check (true);
create policy "products full access" on public.products for all to authenticated using (true) with check (true);
create policy "customers full access" on public.customers for all to authenticated using (true) with check (true);
create policy "app_settings full access" on public.app_settings for all to authenticated using (true) with check (true);
create policy "gcash_log full access" on public.gcash_log for all to authenticated using (true) with check (true);

-- Transactional/audit tables: read + write, no delete via the API —
-- corrections go through void_sale / new ledger entries.
create policy "ledger read" on public.ledger for select to authenticated using (true);
create policy "ledger insert" on public.ledger for insert to authenticated with check (true);
create policy "pos_sessions read" on public.pos_sessions for select to authenticated using (true);
create policy "pos_sessions insert" on public.pos_sessions for insert to authenticated with check (true);
create policy "pos_sessions update" on public.pos_sessions for update to authenticated using (true);
create policy "sale_invoice read" on public.sale_invoice for select to authenticated using (true);
create policy "sale_invoice insert" on public.sale_invoice for insert to authenticated with check (true);
create policy "sale_invoice update" on public.sale_invoice for update to authenticated using (true);
create policy "invoice_payments read" on public.invoice_payments for select to authenticated using (true);
create policy "invoice_payments insert" on public.invoice_payments for insert to authenticated with check (true);
create policy "sales read" on public.sales for select to authenticated using (true);
create policy "sales insert" on public.sales for insert to authenticated with check (true);
create policy "expenses read" on public.expenses for select to authenticated using (true);
create policy "expenses insert" on public.expenses for insert to authenticated with check (true);

-- gcash_submissions: anon (the kiosk) can create but never read anything back
create policy "gcash_submissions kiosk insert" on public.gcash_submissions for insert to anon with check (true);
create policy "gcash_submissions staff read" on public.gcash_submissions for select to authenticated using (true);
create policy "gcash_submissions staff review" on public.gcash_submissions for update to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Table privileges. This project does NOT auto-grant new tables, and RLS only
-- filters rows a role is already allowed to touch — so every grant is explicit.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select, insert, update, delete on public.gcash_log to authenticated;

grant select, insert on public.ledger to authenticated;
grant select, insert, update on public.pos_sessions to authenticated;
grant select, insert, update on public.sale_invoice to authenticated;
grant select, insert on public.invoice_payments to authenticated;
grant select, insert on public.sales to authenticated;
grant select, insert on public.expenses to authenticated;

grant insert on public.gcash_submissions to anon;
grant select, update on public.gcash_submissions to authenticated;

grant select on public.daily_summary to authenticated;
grant select on public.credit_summary to authenticated;

-- service_role (server-side admin key only; bypasses RLS) — full access
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Function privileges: RPCs for signed-in staff only; trigger functions are
-- never callable directly.
-- ---------------------------------------------------------------------------
revoke execute on function public.record_credit_change(uuid, uuid, ledger_entry_type, numeric, text, timestamptz) from public, anon;
revoke execute on function public.open_day(numeric) from public, anon;
revoke execute on function public.close_day(numeric, text) from public, anon;
revoke execute on function public.complete_sale(uuid, jsonb, boolean, jsonb, uuid, timestamptz, uuid) from public, anon;
revoke execute on function public.void_sale(uuid, text) from public, anon;
revoke execute on function public.confirm_gcash_submission(uuid) from public, anon;
revoke execute on function public.reject_gcash_submission(uuid, text) from public, anon;

grant execute on function public.record_credit_change(uuid, uuid, ledger_entry_type, numeric, text, timestamptz) to authenticated, service_role;
grant execute on function public.open_day(numeric) to authenticated, service_role;
grant execute on function public.close_day(numeric, text) to authenticated, service_role;
grant execute on function public.complete_sale(uuid, jsonb, boolean, jsonb, uuid, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.void_sale(uuid, text) to authenticated, service_role;
grant execute on function public.confirm_gcash_submission(uuid) to authenticated, service_role;
grant execute on function public.reject_gcash_submission(uuid, text) to authenticated, service_role;

revoke execute on function public.deduct_stock_on_sale() from public, anon, authenticated;
revoke execute on function public.refresh_invoice_payment_method() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- business_date is harmless and used by the views, so signed-in staff need it
revoke execute on function public.business_date(timestamptz) from public, anon;
grant execute on function public.business_date(timestamptz) to authenticated, service_role;

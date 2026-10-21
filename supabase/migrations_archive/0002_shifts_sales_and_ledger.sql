-- ledger: single source of truth for credit balance history
create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  invoice_id uuid, -- FK added after sale_invoice exists
  entry_type ledger_entry_type not null,
  amount numeric not null check (amount > 0),
  running_balance numeric not null,
  description text,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now()
);

-- pos_sessions: one row per calendar day
create table public.pos_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null unique default current_date,
  status text not null default 'open' check (status in ('open','closed')),
  starting_cash numeric not null,
  closing_cash numeric,
  expected_cash numeric,
  variance numeric,
  opened_by uuid references public.staff(id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.staff(id),
  closed_at timestamptz,
  notes text
);

-- staff_shifts: one row per staff clock-in within a day; a staff member can
-- have more than one row per session (e.g. covers lunch, leaves, returns to close)
create table public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pos_sessions(id),
  staff_id uuid not null references public.staff(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index staff_shifts_active_idx on public.staff_shifts (session_id) where ended_at is null;

-- sale_invoice
create table public.sale_invoice (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  staff_id uuid references public.staff(id),
  shift_id uuid references public.staff_shifts(id),
  payment_method payment_method_type,
  is_credit boolean not null default false,
  amount_received numeric not null default 0,
  change numeric not null default 0,
  total_amount numeric not null default 0,
  status invoice_status not null default 'completed',
  voided_at timestamptz,
  voided_by uuid references public.staff(id),
  void_reason text,
  created_at timestamptz not null default now()
);

alter table public.ledger
  add constraint ledger_invoice_id_fkey foreign key (invoice_id) references public.sale_invoice(id);

-- invoice_payments: real tender breakdown, replaces the old fake "mixed" label
create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sale_invoice(id) on delete cascade,
  method payment_method_type not null,
  amount numeric not null check (amount > 0)
);

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

-- sales (line items) — product_id kept nullable & ON DELETE SET NULL so a
-- deleted product doesn't erase historical line items (product_name is snapshotted)
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
  staff_id uuid references public.staff(id),
  shift_id uuid references public.staff_shifts(id),
  description text not null,
  category text,
  amount numeric not null check (amount > 0),
  expense_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

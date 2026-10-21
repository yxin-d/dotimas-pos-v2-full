-- gcash_log: your own manual admin-side entries
create table public.gcash_log (
  id uuid primary key default gen_random_uuid(),
  direction gcash_direction not null,
  amount numeric not null check (amount > 0),
  sender text,
  ref_number text,
  notes text,
  txn_date date not null default current_date,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now()
);

-- gcash_submissions: the customer-facing kiosk, write-only from the customer's side
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
  reviewed_by uuid references public.staff(id),
  reviewed_at timestamptz,
  review_notes text
);

-- Duplicate protection: once a reference number has been confirmed and paid
-- out, it can never be confirmed again on a different entry.
create unique index gcash_submissions_confirmed_ref_uidx
  on public.gcash_submissions (reference_number)
  where status = 'confirmed';

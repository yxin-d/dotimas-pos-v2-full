-- Enums
create type payment_method_type as enum ('cash','gcash','maya','mixed','credit');
create type ledger_entry_type as enum ('credit_given','payment_made','opening_balance');
create type invoice_status as enum ('completed','voided');
create type gcash_direction as enum ('received','sent');
create type gcash_submission_status as enum ('pending','confirmed','rejected');

-- staff: one row per login, 1:1 with auth.users
create table public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  initials text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create a staff row whenever the owner adds a new login via Supabase Auth
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  insert into public.staff (id, name, initials)
  values (new.id, v_name, upper(left(v_name, 2)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- product_categories
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- products (stocks is advisory only — never blocks a sale)
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  barcode text unique,
  volume text,
  category_id uuid references public.product_categories(id) on delete set null,
  price numeric not null default 0,
  cost numeric not null default 0,
  stocks numeric not null default 0,
  low_stock_threshold numeric not null default 5,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  credit_balance numeric not null default 0,
  credit_warning_threshold numeric,
  created_at timestamptz not null default now()
);

-- app_settings: small key-value config table
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('default_credit_warning_threshold', '1000'),
  ('store_name', '"Dotimas Store"'),
  ('receipt_footer_text', '"Salamat po!"');

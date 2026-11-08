-- ============================================================================
-- Credit: "remove credit" adjustments + correct balances for back-dated entries
--
-- 1. New ledger entry type 'credit_removed': takes credit off a customer's
--    balance WITHOUT it being a payment (e.g. utang that was already paid
--    before it was logged, or logged by mistake). The ledger keeps the entry,
--    so the history still explains why the balance changed.
-- 2. Ledger entries can already carry a chosen date (p_created_at). A back-dated
--    entry lands in the middle of the history, so after every change the
--    "balance after" column is recomputed in date order for that customer.
--    entry_seq breaks ties between entries with the same timestamp.
--
-- NOTE: ADD VALUE can't be used in the same transaction that adds it; nothing
-- below uses 'credit_removed' at run time, so this file is safe to run as-is.
-- ============================================================================

alter type ledger_entry_type add value if not exists 'credit_removed';

alter table public.ledger add column if not exists entry_seq bigint generated always as identity;
create index if not exists ledger_customer_order_idx on public.ledger (customer_id, created_at, entry_seq);

create or replace function public.record_credit_change(
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
  v_is_add boolean;
  v_offset numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  v_is_add := p_entry_type::text in ('credit_given', 'opening_balance');

  if v_is_add
     and exists (select 1 from public.customers where id = p_customer_id and archived_at is not null) then
    raise exception 'This customer is archived. Restore them before adding credit';
  end if;

  v_delta := case when v_is_add then p_amount else -p_amount end;

  update public.customers
  set credit_balance = credit_balance + v_delta
  where id = p_customer_id
  returning credit_balance into v_new_balance;

  if not found then
    raise exception 'Customer % not found', p_customer_id;
  end if;

  if not v_is_add and v_new_balance < 0 then
    if p_entry_type::text = 'credit_removed' then
      raise exception 'Can''t remove % — it is more than the current balance', p_amount;
    end if;
    raise exception 'Payment of % exceeds current balance', p_amount;
  end if;

  insert into public.ledger (customer_id, invoice_id, entry_type, amount, running_balance, description, created_at)
  values (p_customer_id, p_invoice_id, p_entry_type, p_amount, v_new_balance, p_description,
          least(coalesce(p_created_at, now()), now()));

  -- Recompute "balance after" in date order so back-dated entries read correctly.
  -- The offset anchors the last row to the customer's real balance, so any
  -- balance that predates the ledger is preserved rather than lost.
  select v_new_balance - coalesce(sum(case when entry_type::text in ('credit_given', 'opening_balance') then amount else -amount end), 0)
  into v_offset
  from public.ledger where customer_id = p_customer_id;

  update public.ledger l
  set running_balance = x.bal
  from (
    select id,
           v_offset + sum(case when entry_type::text in ('credit_given', 'opening_balance') then amount else -amount end)
                      over (order by created_at, entry_seq) as bal
    from public.ledger
    where customer_id = p_customer_id
  ) x
  where l.id = x.id and l.running_balance is distinct from x.bal;

  return v_new_balance;
end;
$$;

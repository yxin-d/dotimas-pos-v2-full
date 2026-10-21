-- ============================================================================
-- Customer delete / archive
--
-- A customer with credit or sales history can't be hard-deleted: their ledger
-- entries and invoices point at them, and that history is the record of who
-- owed what. delete_customer() therefore:
--   * refuses while they still owe something (balance must be settled first),
--   * deletes them outright if they have no history at all,
--   * otherwise ARCHIVES them (archived_at set): hidden from lists and the
--     POS picker, history intact, restorable.
-- Archived customers can't be given new credit until they are restored.
-- ============================================================================

alter table public.customers add column archived_at timestamptz;

create function public.delete_customer(p_customer_id uuid)
returns text            -- 'deleted' | 'archived'
language plpgsql security definer set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;

  if v_customer.credit_balance <> 0 then
    raise exception '% still has a balance of %. Settle it before removing them', v_customer.name, v_customer.credit_balance;
  end if;

  if exists (select 1 from public.ledger where customer_id = p_customer_id)
     or exists (select 1 from public.sale_invoice where customer_id = p_customer_id) then
    update public.customers set archived_at = now() where id = p_customer_id;
    return 'archived';
  end if;

  delete from public.customers where id = p_customer_id;
  return 'deleted';
end;
$$;

revoke execute on function public.delete_customer(uuid) from public, anon;
grant execute on function public.delete_customer(uuid) to authenticated, service_role;

-- Block new credit for an archived customer (they'd vanish from the lists
-- while owing money). Same function as the baseline plus that one check.
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_entry_type in ('credit_given','opening_balance')
     and exists (select 1 from public.customers where id = p_customer_id and archived_at is not null) then
    raise exception 'This customer is archived. Restore them before adding credit';
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

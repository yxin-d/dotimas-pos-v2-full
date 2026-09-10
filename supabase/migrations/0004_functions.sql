-- record_credit_change: atomic balance update (fixes the V1 read-then-write race)
create function public.record_credit_change(
  p_customer_id uuid,
  p_invoice_id uuid,
  p_entry_type ledger_entry_type,
  p_amount numeric,
  p_description text default null
)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_new_balance numeric;
  v_delta numeric;
  v_staff_id uuid := auth.uid();
begin
  if p_amount <= 0 then
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

  insert into public.ledger (customer_id, invoice_id, entry_type, amount, running_balance, description, created_by)
  values (p_customer_id, p_invoice_id, p_entry_type, p_amount, v_new_balance, p_description, v_staff_id);

  return v_new_balance;
end;
$$;

-- start_shift: implements the open-day / shift-change logic in one atomic call
create function public.start_shift(p_starting_cash numeric default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_staff_id uuid := auth.uid();
  v_session_id uuid;
  v_session_status text;
  v_shift_id uuid;
begin
  if v_staff_id is null then
    raise exception 'Not authenticated';
  end if;

  select id, status into v_session_id, v_session_status
  from public.pos_sessions where session_date = current_date;

  if v_session_id is null then
    if p_starting_cash is null then
      raise exception 'Starting cash is required to open the day';
    end if;
    insert into public.pos_sessions (session_date, status, starting_cash, opened_by, opened_at)
    values (current_date, 'open', p_starting_cash, v_staff_id, now())
    returning id into v_session_id;

    insert into public.staff_shifts (session_id, staff_id, started_at)
    values (v_session_id, v_staff_id, now())
    returning id into v_shift_id;

    return jsonb_build_object('session_id', v_session_id, 'shift_id', v_shift_id, 'mode', 'day_opened');
  end if;

  if v_session_status = 'closed' then
    raise exception 'Today''s day has already been closed';
  end if;

  select id into v_shift_id from public.staff_shifts
  where session_id = v_session_id and staff_id = v_staff_id and ended_at is null;

  if v_shift_id is not null then
    return jsonb_build_object('session_id', v_session_id, 'shift_id', v_shift_id, 'mode', 'already_active');
  end if;

  update public.staff_shifts set ended_at = now()
  where session_id = v_session_id and ended_at is null;

  insert into public.staff_shifts (session_id, staff_id, started_at)
  values (v_session_id, v_staff_id, now())
  returning id into v_shift_id;

  return jsonb_build_object('session_id', v_session_id, 'shift_id', v_shift_id, 'mode', 'shift_started');
end;
$$;

-- close_day: server-computed reconciliation, never trusts client-side totals
create function public.close_day(p_closing_cash numeric, p_notes text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_staff_id uuid := auth.uid();
  v_session_id uuid;
  v_status text;
  v_starting numeric;
  v_cash_collected numeric;
  v_change_given numeric;
  v_expenses numeric;
  v_expected numeric;
  v_variance numeric;
begin
  if v_staff_id is null then raise exception 'Not authenticated'; end if;

  select id, status, starting_cash into v_session_id, v_status, v_starting
  from public.pos_sessions where session_date = current_date;

  if v_session_id is null then raise exception 'The day has not been opened yet'; end if;
  if v_status = 'closed' then raise exception 'The day is already closed'; end if;

  select coalesce(sum(ip.amount), 0) into v_cash_collected
  from public.invoice_payments ip
  join public.sale_invoice si on si.id = ip.invoice_id
  where ip.method = 'cash' and si.status = 'completed' and si.created_at::date = current_date;

  select coalesce(sum(change), 0) into v_change_given
  from public.sale_invoice
  where status = 'completed' and created_at::date = current_date;

  select coalesce(sum(amount), 0) into v_expenses
  from public.expenses where expense_date = current_date;

  v_expected := v_starting + v_cash_collected - v_change_given - v_expenses;
  v_variance := p_closing_cash - v_expected;

  update public.pos_sessions
  set status = 'closed', closing_cash = p_closing_cash, expected_cash = v_expected,
      variance = v_variance, closed_by = v_staff_id, closed_at = now(),
      notes = coalesce(p_notes, notes)
  where id = v_session_id;

  update public.staff_shifts set ended_at = now()
  where session_id = v_session_id and ended_at is null;

  return jsonb_build_object('expected_cash', v_expected, 'variance', v_variance, 'closing_cash', p_closing_cash);
end;
$$;

-- complete_sale: re-derives price/cost server-side, stamps staff/shift from
-- the session (never trusted from the client), supports real mixed-tender,
-- no stock gating.
create function public.complete_sale(
  p_customer_id uuid,
  p_payments jsonb,      -- [{ "method": "cash", "amount": 100 }, ...]  (or a single "credit" row)
  p_is_credit boolean,
  p_items jsonb          -- [{ "product_id": uuid|null, "product_name": text, "qty": int, "custom_price": numeric|null }]
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_staff_id uuid := auth.uid();
  v_shift_id uuid;
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
  v_active boolean;
  v_pname text;
begin
  if v_staff_id is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_shift_id from public.staff_shifts
  where staff_id = v_staff_id and ended_at is null
  order by started_at desc limit 1;

  if v_shift_id is null then
    raise exception 'Start your shift before making a sale';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  insert into public.sale_invoice (customer_id, staff_id, shift_id, is_credit, total_amount)
  values (p_customer_id, v_staff_id, v_shift_id, p_is_credit, 0)
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty        := (v_item->>'qty')::numeric;
    v_pname      := v_item->>'product_name';

    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity for %', coalesce(v_pname, 'item');
    end if;

    if v_product_id is not null then
      select price, cost, is_active into v_unit_price, v_unit_cost, v_active
      from public.products where id = v_product_id;
      if not found then
        raise exception 'Product % no longer exists', v_product_id;
      end if;
      if v_active is false then
        raise exception '% is no longer active', v_pname;
      end if;
      if v_item->>'custom_price' is not null then
        v_unit_price := greatest((v_item->>'custom_price')::numeric, 0);
      end if;
    else
      v_unit_price := (v_item->>'custom_price')::numeric;
      v_unit_cost := 0;
      if v_unit_price is null or v_unit_price < 0 then
        raise exception 'Custom item % needs a valid price', coalesce(v_pname, '(unnamed)');
      end if;
    end if;

    v_unit_cost  := coalesce(v_unit_cost, 0);
    v_subtotal   := v_unit_price * v_qty;
    v_net_profit := (v_unit_price - v_unit_cost) * v_qty;
    v_total      := v_total + v_subtotal;

    insert into public.sales (invoice_id, product_id, product_name, qty, unit_price, unit_cost, subtotal, net_profit)
    values (v_invoice_id, v_product_id, v_pname, v_qty, v_unit_price, v_unit_cost, v_subtotal, v_net_profit);
  end loop;

  if p_is_credit then
    if p_customer_id is null then
      raise exception 'Credit sale requires a customer';
    end if;
    insert into public.invoice_payments (invoice_id, method, amount) values (v_invoice_id, 'credit', v_total);
    perform public.record_credit_change(
      p_customer_id, v_invoice_id, 'credit_given'::ledger_entry_type, v_total,
      'Credit from invoice #' || upper(left(v_invoice_id::text, 8))
    );
    update public.sale_invoice set amount_received = 0, change = 0, total_amount = v_total where id = v_invoice_id;
  else
    if p_payments is null or jsonb_array_length(p_payments) = 0 then
      raise exception 'Payment breakdown is required';
    end if;
    for v_pay in select * from jsonb_array_elements(p_payments) loop
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
  v_staff_id uuid := auth.uid();
  v_invoice public.sale_invoice%rowtype;
  v_line record;
begin
  if v_staff_id is null then raise exception 'Not authenticated'; end if;
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
  set status = 'voided', voided_at = now(), voided_by = v_staff_id, void_reason = p_reason
  where id = p_invoice_id;
end;
$$;

-- confirm/reject GCash kiosk submissions
create function public.confirm_gcash_submission(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid := auth.uid();
  v_ref text;
  v_status gcash_submission_status;
begin
  if v_staff_id is null then raise exception 'Not authenticated'; end if;

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
  set status = 'confirmed', reviewed_by = v_staff_id, reviewed_at = now()
  where id = p_id;
end;
$$;

create function public.reject_gcash_submission(p_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid := auth.uid();
begin
  if v_staff_id is null then raise exception 'Not authenticated'; end if;
  update public.gcash_submissions
  set status = 'rejected', reviewed_by = v_staff_id, reviewed_at = now(), review_notes = p_notes
  where id = p_id and status = 'pending';
  if not found then raise exception 'Submission not found or already reviewed'; end if;
end;
$$;

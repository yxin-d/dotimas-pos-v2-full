-- Staff can now optionally show + sell inactive products from the POS (toggle
-- in the UI). is_active still controls default visibility everywhere else
-- (product picker, low-stock reports, etc.) — this only removes the hard
-- block that stopped an inactive product from ever being rung up.
create or replace function public.complete_sale(
  p_customer_id uuid,
  p_payments jsonb,
  p_is_credit boolean,
  p_items jsonb
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
      select price, cost into v_unit_price, v_unit_cost
      from public.products where id = v_product_id;
      if not found then
        raise exception 'Product % no longer exists', v_product_id;
      end if;
      -- is_active no longer blocks a sale — staff can opt in to sell
      -- inactive/discontinued stock from the POS toggle.
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
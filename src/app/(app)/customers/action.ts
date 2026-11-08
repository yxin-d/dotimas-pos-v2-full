'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { todayPH } from '@/lib/utils/currency'

// Routes every manual credit ledger change through the same atomic
// record_credit_change() RPC the POS checkout uses for credit sales. The
// customer credit page used to insert into `ledger` directly with a
// client-computed running_balance — that never touched customers.credit_balance
// at all, so the "Outstanding credit" figure silently went stale after every
// "payment". Going through the RPC keeps the balance and the ledger in sync
// in one atomic step, same as everywhere else in the app.
//
// Errors are returned, not thrown — see the NOTE in pos/action.ts for why.
//
// `occurredOn` (YYYY-MM-DD, Manila) is when the transaction really happened.
// Omit it, or pass today, to stamp it with the current time. A past date is
// stored at noon Manila time so it can't slip across midnight into the wrong
// day. Future dates are rejected.
//
// 'credit_removed' takes credit off the balance without counting as a payment
// (utang that was already paid, or logged by mistake).
export type CreditEntryType = 'payment_made' | 'credit_given' | 'credit_removed'

export async function recordCreditChange(
  customerId: string,
  entryType: CreditEntryType,
  amount: number,
  description?: string,
  occurredOn?: string
): Promise<{ balance: number | null; error: string | null }> {
  let createdAt: string | null = null
  if (occurredOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return { balance: null, error: 'Invalid date' }
    const today = todayPH()
    if (occurredOn > today) return { balance: null, error: 'The date can\'t be in the future' }
    if (occurredOn < today) {
      const d = new Date(`${occurredOn}T12:00:00+08:00`)
      if (isNaN(d.getTime())) return { balance: null, error: 'Invalid date' }
      createdAt = d.toISOString()
    }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('record_credit_change', {
    p_customer_id: customerId,
    p_invoice_id: null,
    p_entry_type: entryType,
    p_amount: amount,
    p_description: description?.trim() || null,
    p_created_at: createdAt,
  })

  if (error) return { balance: null, error: error.message }

  revalidatePath(`/customers/${customerId}/credit`)
  revalidatePath('/customers')
  return { balance: data as number, error: null }
}
export interface CustomerDetails {
  name: string
  phone: string | null
  credit_warning_threshold: number | null
}

export async function updateCustomer(
  customerId: string,
  details: CustomerDetails
): Promise<{ error: string | null }> {
  const name = details.name.trim()
  if (!name) return { error: 'Name is required' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('customers')
    .update({
      name,
      phone: details.phone?.trim() || null,
      credit_warning_threshold: details.credit_warning_threshold,
    })
    .eq('id', customerId)
  if (error) return { error: error.message }
  revalidatePath(`/customers/${customerId}/credit`)
  revalidatePath('/customers')
  return { error: null }
}

// delete_customer() deletes a customer with no history, archives one that
// has credit/sales history (so the record of who owed what survives), and
// refuses while they still owe anything.
export async function deleteCustomer(
  customerId: string
): Promise<{ result: 'deleted' | 'archived' | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_customer', { p_customer_id: customerId })
  if (error) return { result: null, error: error.message }
  revalidatePath('/customers')
  return { result: data as 'deleted' | 'archived', error: null }
}

export async function restoreCustomer(customerId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.from('customers').update({ archived_at: null }).eq('id', customerId)
  if (error) return { error: error.message }
  revalidatePath(`/customers/${customerId}/credit`)
  revalidatePath('/customers')
  return { error: null }
}

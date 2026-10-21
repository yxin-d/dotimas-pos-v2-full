'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Routes every manual credit ledger change through the same atomic
// record_credit_change() RPC the POS checkout uses for credit sales. The
// customer credit page used to insert into `ledger` directly with a
// client-computed running_balance — that never touched customers.credit_balance
// at all, so the "Outstanding credit" figure silently went stale after every
// "payment". Going through the RPC keeps the balance and the ledger in sync
// in one atomic step, same as everywhere else in the app.
//
// Errors are returned, not thrown — see the NOTE in pos/action.ts for why.
export async function recordCreditChange(
  customerId: string,
  entryType: 'payment_made' | 'credit_given',
  amount: number,
  description?: string
): Promise<{ balance: number | null; error: string | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('record_credit_change', {
    p_customer_id: customerId,
    p_invoice_id: null,
    p_entry_type: entryType,
    p_amount: amount,
    p_description: description?.trim() || null,
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

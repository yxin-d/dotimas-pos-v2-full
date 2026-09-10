'use server'

import { createClient } from '@/lib/supabase/server'

interface CheckoutItem {
  product_id: string | null
  product_name: string
  qty: number
  custom_price: number | null
}

interface CheckoutPayment {
  method: 'cash' | 'gcash' | 'maya'
  amount: number
}

interface CheckoutPayload {
  customerId: string | null
  isCredit: boolean
  payments: CheckoutPayment[]
  items: CheckoutItem[]
}

export async function completeSale(payload: CheckoutPayload) {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('complete_sale', {
    p_customer_id: payload.customerId,
    p_payments: payload.payments,
    p_is_credit: payload.isCredit,
    p_items: payload.items,
  })

  if (error) throw new Error(error.message)
  return { invoiceId: data as string }
}

// Accepts either a full invoice UUID or the short receipt number shown on the
// printed slip (first 8 chars) — resolves to the real invoice before voiding.
export async function voidSale(receiptNoOrId: string, reason: string) {
  const supabase = await createClient()

  let invoiceId = receiptNoOrId
  if (receiptNoOrId.length < 32) {
    const { data, error } = await supabase
      .from('sale_invoice')
      .select('id')
      .ilike('id', `${receiptNoOrId}%`)
      .limit(2)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('No sale found with that receipt number')
    if (data.length > 1) throw new Error('That receipt number matches more than one sale — use the full receipt number')
    invoiceId = data[0].id
  }

  const { error } = await supabase.rpc('void_sale', {
    p_invoice_id: invoiceId,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
}

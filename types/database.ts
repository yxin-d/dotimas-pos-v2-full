// Types mirror the live V2 schema (supabase/migrations/0001-0007). Keep these
// in sync with the DB — if a migration changes a column, update it here too.

export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'mixed' | 'credit'
export type LedgerEntryType = 'credit_given' | 'payment_made' | 'opening_balance'
export type InvoiceStatus = 'completed' | 'voided'
export type GcashDirection = 'received' | 'sent'
export type GcashSubmissionStatus = 'pending' | 'confirmed' | 'rejected'
export type SessionStatus = 'open' | 'closed'

export interface Staff {
  id: string
  name: string
  initials: string
  is_active: boolean
  created_at: string
}

export interface ProductCategory {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface Product {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  volume: string | null
  category_id: string | null
  price: number
  cost: number
  stocks: number
  low_stock_threshold: number
  is_active: boolean
  created_at: string
  updated_at: string
  // present when joined with product_categories(name)
  product_categories?: { name: string } | null
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  credit_balance: number
  credit_warning_threshold: number | null
  created_at: string
}

export interface LedgerEntry {
  id: string
  customer_id: string
  invoice_id: string | null
  entry_type: LedgerEntryType
  amount: number
  running_balance: number
  description: string | null
  created_by: string | null
  created_at: string
}

export interface PosSession {
  id: string
  session_date: string
  status: SessionStatus
  starting_cash: number
  closing_cash: number | null
  expected_cash: number | null
  variance: number | null
  opened_by: string | null
  opened_at: string
  closed_by: string | null
  closed_at: string | null
  notes: string | null
}

export interface StaffShift {
  id: string
  session_id: string
  staff_id: string
  started_at: string
  ended_at: string | null
}

export interface SaleInvoice {
  id: string
  customer_id: string | null
  staff_id: string | null
  shift_id: string | null
  payment_method: PaymentMethod | null
  is_credit: boolean
  amount_received: number
  change: number
  total_amount: number
  status: InvoiceStatus
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  created_at: string
}

export interface InvoicePayment {
  id: string
  invoice_id: string
  method: PaymentMethod
  amount: number
}

export interface SaleLine {
  id: string
  invoice_id: string
  product_id: string | null
  product_name: string
  qty: number
  unit_price: number
  unit_cost: number
  subtotal: number
  net_profit: number
  created_at: string
}

export interface Expense {
  id: string
  staff_id: string | null
  shift_id: string | null
  description: string
  category: string | null
  amount: number
  expense_date: string
  notes: string | null
  created_at: string
}

export interface GcashLogEntry {
  id: string
  direction: GcashDirection
  amount: number
  sender: string | null
  ref_number: string | null
  notes: string | null
  txn_date: string
  created_by: string | null
  created_at: string
}

export interface GcashSubmission {
  id: string
  customer_name: string
  direction: GcashDirection
  amount: number
  reference_number: string
  transaction_date: string
  notes: string | null
  status: GcashSubmissionStatus
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
}

// ---- POS-side cart types (client-only, not a DB table) ----

// Prefix used to flag a cart line as a fully custom/ad-hoc item (no product record)
export const CUSTOM_ITEM_PREFIX = '__custom__'

export interface CartItem {
  product: Product
  qty: number
  customPrice?: number | null
  subtotal: number
}

export interface PaymentSplit {
  method: Exclude<PaymentMethod, 'mixed' | 'credit'>
  amount: number
}

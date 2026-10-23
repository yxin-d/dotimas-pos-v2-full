'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Plus, Trash2, UserCircle2 } from 'lucide-react'
import { useCart } from '@/hooks/use-cart'
import { formatPeso } from '@/lib/utils/currency'
import { completeSale } from '@/src/app/(app)/pos/action'
import type { Customer, PaymentMethod } from '@/types/database'
import CustomerPicker from './customer-picker'
import { DecimalInput } from '@/src/components/ui/number-input'

type SimpleMethod = Exclude<PaymentMethod, 'mixed' | 'credit'>
type TenderMode = SimpleMethod | 'mixed' | 'credit'

interface Row {
  method: SimpleMethod
  amount: string
}

interface Props {
  onClose: () => void
  onComplete: (invoiceId: string) => void
}

const METHOD_LABEL: Record<TenderMode, string> = {
  cash: 'Cash', gcash: 'GCash', maya: 'Maya', mixed: 'Mixed', credit: 'Credit',
}

// The bills a customer is likely to hand over for this total: the next
// round amount at each common note (₱20, ₱50, ₱100, ₱500, ₱1000).
// e.g. ₱115 -> 120, 150, 200, 500.
function quickCashAmounts(total: number): number[] {
  if (total <= 0) return []
  const picks = new Set<number>()
  for (const note of [20, 50, 100, 500, 1000]) {
    const amount = Math.ceil(total / note) * note
    if (amount > total) picks.add(amount)
  }
  return [...picks].sort((a, b) => a - b).slice(0, 4)
}

export default function CheckoutModal({ onClose, onComplete }: Props) {
  const { items, total, customer, setCustomer, clearCart } = useCart()
  const cartTotal = total()

  const [mode, setMode] = useState<TenderMode>('cash')
  // Empty = paid the exact amount. The total is only shown as a placeholder,
  // so typing "150" gives 150 — not "115150" like when it was pre-filled.
  const [singleAmount, setSingleAmount] = useState('')
  const [rows, setRows] = useState<Row[]>([{ method: 'cash', amount: '' }, { method: 'gcash', amount: '' }])
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  // One id per checkout attempt. If the request times out and the cashier
  // taps Complete again, the server sees the same id and won't record the
  // sale twice.
  const [invoiceId] = useState(() => crypto.randomUUID())

  const isCredit = mode === 'credit'
  const isMixed = mode === 'mixed'

  const mixedPaid = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const singleReceived = singleAmount === '' ? cartTotal : (parseFloat(singleAmount) || 0)
  const change = mode === 'cash' ? Math.max(singleReceived - cartTotal, 0) : 0

  const overThreshold = isCredit && customer?.credit_warning_threshold != null
    && customer.credit_balance + cartTotal > customer.credit_warning_threshold

  function buildItemsPayload() {
    return items.map(i => {
      const isCustom = i.product.id.startsWith('__custom__')
      return {
        product_id: isCustom ? null : i.product.id,
        product_name: i.product.name,
        qty: i.qty,
        custom_price: isCustom ? (i.customPrice ?? 0) : (i.customPrice ?? null),
      }
    })
  }

  async function handleSubmit() {
    if (isCredit && !customer) {
      toast.error('Select a customer for a credit sale')
      return
    }
    if (isMixed && mixedPaid < cartTotal) {
      toast.error(`Payments (${formatPeso(mixedPaid)}) don't cover the total (${formatPeso(cartTotal)})`)
      return
    }
    if (!isCredit && !isMixed && singleReceived < cartTotal) {
      toast.error('Amount received is less than the total')
      return
    }

    const payments = isCredit
      ? []
      : isMixed
        ? rows.filter(r => parseFloat(r.amount) > 0).map(r => ({ method: r.method, amount: parseFloat(r.amount) }))
        : [{ method: mode as SimpleMethod, amount: singleReceived }]

    setLoading(true)
    try {
      const { invoiceId: savedId, error } = await completeSale({
        customerId: customer?.id ?? null,
        isCredit,
        payments,
        items: buildItemsPayload(),
        invoiceId,
      })
      if (error || !savedId) {
        toast.error(error ?? 'Checkout failed')
        return
      }
      toast.success('Sale complete')
      clearCart()
      onComplete(savedId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-border flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-bold text-ink">Charge {formatPeso(cartTotal)}</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Tender mode pills */}
          <div className="flex gap-1.5 flex-wrap">
            {(['cash', 'gcash', 'maya', 'mixed', 'credit'] as TenderMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setSingleAmount('') }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  mode === m ? 'bg-primary text-white border-primary' : 'bg-surface text-ink-soft border-border hover:border-primary'
                }`}
              >
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>

          {/* Customer (optional unless credit) */}
          <div className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <UserCircle2 size={18} className="text-ink-faint shrink-0" />
              {customer ? (
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{customer.name}</p>
                  {customer.credit_balance > 0 && (
                    <p className="text-xs text-gold tabular">Utang: {formatPeso(customer.credit_balance)}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-faint">{isCredit ? 'Select a customer' : 'No customer (optional)'}</p>
              )}
            </div>
            <button onClick={() => setShowPicker(true)} className="text-xs font-semibold text-primary shrink-0">
              {customer ? 'Change' : 'Select'}
            </button>
          </div>

          {overThreshold && (
            <div className="rounded-xl bg-warning-soft border border-warning/30 px-3.5 py-2.5 text-xs text-warning font-semibold">
              This will put {customer?.name} over their usual credit line — still allowed, just flagging it.
            </div>
          )}

          {/* Tender-specific input */}
          {isCredit ? null : isMixed ? (
            <div className="flex flex-col gap-2">
              {rows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={row.method}
                    onChange={e => setRows(rs => rs.map((r, i) => i === idx ? { ...r, method: e.target.value as SimpleMethod } : r))}
                    className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-sm font-semibold text-ink-soft"
                  >
                    <option value="cash">Cash</option>
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                  </select>
                  <DecimalInput
                    value={row.amount}
                    onChange={v => setRows(rs => rs.map((r, i) => i === idx ? { ...r, amount: v } : r))}
                    placeholder={mixedPaid < cartTotal ? `${(cartTotal - mixedPaid).toFixed(2)} left` : '0.00'}
                    className="tabular flex-1 rounded-lg border border-border bg-canvas px-3 py-2 text-sm font-bold text-ink outline-none focus-visible:border-primary"
                  />
                  {rows.length > 1 && (
                    <button onClick={() => setRows(rs => rs.filter((_, i) => i !== idx))} className="text-ink-faint hover:text-danger">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setRows(rs => [...rs, { method: 'cash', amount: '' }])}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary self-start"
              >
                <Plus size={13} /> Add tender
              </button>
              <div className="flex justify-between text-xs pt-1 border-t border-border">
                <span className="text-ink-faint">Paid so far</span>
                <span className={`tabular font-bold ${mixedPaid < cartTotal ? 'text-danger' : 'text-primary'}`}>
                  {formatPeso(mixedPaid)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-soft">
                {mode === 'cash' ? 'Amount received' : `Amount sent via ${METHOD_LABEL[mode]}`}
              </label>
              <DecimalInput
                autoFocus
                value={singleAmount}
                onChange={setSingleAmount}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                placeholder={`${cartTotal.toFixed(2)} (exact)`}
                className="tabular w-full rounded-xl border border-border bg-canvas px-4 py-3 text-xl font-bold text-ink outline-none focus-visible:border-primary placeholder:text-ink-faint/60 placeholder:font-semibold"
              />
              {mode === 'cash' && (
                <div className="flex flex-wrap gap-1.5">
                  <QuickButton active={singleAmount === ''} onClick={() => setSingleAmount('')}>Exact</QuickButton>
                  {quickCashAmounts(cartTotal).map(a => (
                    <QuickButton key={a} active={parseFloat(singleAmount) === a} onClick={() => setSingleAmount(String(a))}>
                      {formatPeso(a).replace('.00', '')}
                    </QuickButton>
                  ))}
                </div>
              )}
              {mode === 'cash' && singleAmount !== '' && singleReceived < cartTotal && (
                <p className="text-sm text-danger">Short by <span className="tabular font-bold">{formatPeso(cartTotal - singleReceived)}</span></p>
              )}
              {mode === 'cash' && change > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-gold-soft px-4 py-3">
                  <span className="text-sm font-semibold text-ink-soft">Change</span>
                  <span className="tabular text-2xl font-extrabold text-gold">{formatPeso(change)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-xl bg-primary text-white font-bold py-3.5 disabled:opacity-60"
          >
            {loading ? 'Processing…' : isCredit ? 'Charge to credit' : `Confirm ${formatPeso(cartTotal)}`}
          </button>
        </div>
      </div>

      {showPicker && (
        <CustomerPicker
          onSelect={(c: Customer) => { setCustomer(c); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}

function QuickButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[64px] px-3.5 py-2.5 rounded-xl border text-sm font-bold tabular transition-colors active:scale-95 ${
        active ? 'bg-primary text-white border-primary' : 'bg-surface text-ink-soft border-border hover:border-primary'
      }`}
    >
      {children}
    </button>
  )
}

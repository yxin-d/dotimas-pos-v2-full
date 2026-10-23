'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils/currency'
import { expenseCategoryLabels, type ExpenseCategory } from '@/lib/expense-categories'
import { DecimalInput } from '@/src/components/ui/number-input'

interface Props {
  // The business day the expense belongs to. When a day is open this is that
  // day's date (even if it was opened yesterday and not yet closed), so
  // close-day subtracts it from the drawer it actually came out of.
  expenseDate: string
  onClose: () => void
}

export default function ExpenseModal({ expenseDate, onClose }: Props) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('supplies')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const value = parseFloat(amount)
    if (!description.trim()) {
      toast.error('What was it for?')
      return
    }
    if (isNaN(value) || value <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('expenses').insert({
      description: description.trim(),
      category,
      amount: value,
      expense_date: expenseDate,
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (error) {
      toast.error(`Couldn't save the expense: ${error.message}`)
      return
    }
    toast.success('Expense recorded')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold-soft text-gold flex items-center justify-center">
            <Wallet size={18} />
          </div>
          <div>
            <h2 className="font-bold text-ink">Add expense</h2>
            <p className="text-xs text-ink-faint">Paid from the drawer · counted for {formatDate(expenseDate)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">What was it for?</label>
          <input
            autoFocus
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Ice, LPG, delivery"
            className="w-full rounded-xl border border-border bg-canvas px-4 py-2.5 text-sm text-ink outline-none focus-visible:border-primary"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-soft">Amount</label>
            <DecimalInput
              value={amount}
              onChange={setAmount}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="0.00"
              className="tabular w-full rounded-xl border border-border bg-canvas px-4 py-2.5 text-lg font-bold text-ink outline-none focus-visible:border-primary"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-soft">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as ExpenseCategory)}
              className="w-full rounded-xl border border-border bg-canvas px-3 py-3 text-sm text-ink outline-none focus-visible:border-primary"
            >
              {Object.entries(expenseCategoryLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">Notes (optional)</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full rounded-xl border border-border bg-canvas px-4 py-2.5 text-sm text-ink outline-none focus-visible:border-primary"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-xl border border-border text-ink-soft font-semibold py-3">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl bg-primary text-white font-bold py-3 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

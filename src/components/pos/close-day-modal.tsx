'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PowerOff } from 'lucide-react'
import { closeDay } from '@/src/app/(app)/shift-actions'
import { formatPeso } from '@/lib/utils/currency'

interface CloseDayModalProps {
  onClose: () => void
  onDone: () => void
}

export default function CloseDayModal({ onClose, onDone }: CloseDayModalProps) {
  const [cash, setCash] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ expected_cash: number; variance: number } | null>(null)

  async function handleSubmit() {
    const amount = parseFloat(cash)
    if (isNaN(amount) || amount < 0) {
      toast.error('Enter the actual counted cash')
      return
    }
    setLoading(true)
    try {
      const res = await closeDay(amount, notes || undefined)
      setResult(res)
      toast.success('Day closed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not close the day')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-danger-soft text-danger flex items-center justify-center">
            <PowerOff size={18} />
          </div>
          <h2 className="font-bold text-ink">Close the day</h2>
        </div>

        {result ? (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Expected in drawer</span>
              <span className="tabular font-bold text-gold">{formatPeso(result.expected_cash)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Variance</span>
              <span className={`tabular font-bold ${result.variance < 0 ? 'text-danger' : 'text-primary'}`}>
                {result.variance >= 0 ? '+' : ''}{formatPeso(result.variance)}
              </span>
            </div>
            <button onClick={onDone} className="w-full rounded-xl bg-primary text-white font-bold py-3">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-soft">Actual cash counted</label>
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="0.00"
                className="tabular w-full rounded-xl border border-border bg-canvas px-4 py-3 text-lg font-bold text-ink outline-none focus-visible:border-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-soft">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-border bg-canvas px-4 py-2.5 text-sm text-ink outline-none focus-visible:border-primary resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-border text-ink-soft font-semibold py-3">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 rounded-xl bg-danger text-white font-bold py-3 disabled:opacity-60"
              >
                {loading ? 'Closing…' : 'Close day'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

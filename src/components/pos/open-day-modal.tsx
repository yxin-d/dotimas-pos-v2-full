'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Wallet } from 'lucide-react'
import { openDay } from '@/src/app/(app)/day-actions'

interface OpenDayModalProps {
  onDone: () => void
  onDismiss?: () => void
}

export default function OpenDayModal({ onDone, onDismiss }: OpenDayModalProps) {
  const [cash, setCash] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    const amount = parseFloat(cash)
    if (isNaN(amount) || amount < 0) {
      toast.error('Enter a valid starting cash amount')
      return
    }
    setLoading(true)
    try {
      const { error } = await openDay(amount)
      if (error) {
        toast.error(error)
        return
      }
      toast.success('Day started')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the day')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-soft text-primary-dark flex items-center justify-center">
            <Wallet size={18} />
          </div>
          <h2 className="font-bold text-ink">Start the day</h2>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">Starting cash in the drawer</label>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="0.00"
            className="tabular w-full rounded-xl border border-border bg-canvas px-4 py-3 text-lg font-bold text-ink outline-none focus-visible:border-primary"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded-xl bg-primary text-white font-bold py-3 disabled:opacity-60"
        >
          {loading ? 'Starting…' : 'Open the day'}
        </button>

        {onDismiss && (
          <button
            onClick={onDismiss}
            disabled={loading}
            className="w-full text-center text-xs font-semibold text-ink-faint hover:text-ink-soft py-1 disabled:opacity-60"
          >
            I&apos;ll open the day later
          </button>
        )}
      </div>
    </div>
  )
}

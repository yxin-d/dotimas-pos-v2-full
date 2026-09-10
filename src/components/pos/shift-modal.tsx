'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { LogIn, Wallet } from 'lucide-react'
import { startShift } from '@/src/app/(app)/shift-actions'

interface ShiftModalProps {
  mode: 'open_day' | 'start_shift'
  staffName: string
  onDone: () => void
}

export default function ShiftModal({ mode, staffName, onDone }: ShiftModalProps) {
  const [cash, setCash] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (mode === 'open_day') {
      const amount = parseFloat(cash)
      if (isNaN(amount) || amount < 0) {
        toast.error('Enter a valid starting cash amount')
        return
      }
      setLoading(true)
      try {
        await startShift(amount)
        toast.success('Day started')
        onDone()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not start the day')
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      await startShift()
      toast.success('Shift started')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start your shift')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-soft text-primary-dark flex items-center justify-center">
            {mode === 'open_day' ? <Wallet size={18} /> : <LogIn size={18} />}
          </div>
          <div>
            <h2 className="font-bold text-ink">
              {mode === 'open_day' ? 'Start the day' : 'Start your shift'}
            </h2>
            <p className="text-xs text-ink-faint">{staffName}</p>
          </div>
        </div>

        {mode === 'open_day' ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-soft">Starting cash in the drawer</label>
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
        ) : (
          <p className="text-sm text-ink-soft">
            The day&apos;s already open. Starting your shift will note the handoff time —
            no starting cash needed since the drawer&apos;s already funded.
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded-xl bg-primary text-white font-bold py-3 disabled:opacity-60"
        >
          {loading ? 'Starting…' : mode === 'open_day' ? 'Open the day' : 'Start shift'}
        </button>
      </div>
    </div>
  )
}

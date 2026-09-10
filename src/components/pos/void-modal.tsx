'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Ban } from 'lucide-react'
import { voidSale } from '@/src/app/(app)/pos/action'

interface Props {
  onClose: () => void
  onDone: () => void
}

export default function VoidModal({ onClose, onDone }: Props) {
  const [receiptNo, setReceiptNo] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (receiptNo.trim().length < 4) {
      toast.error('Enter the receipt number shown on the printed slip')
      return
    }
    if (!reason.trim()) {
      toast.error('A reason is required to void a sale')
      return
    }
    setLoading(true)
    try {
      await voidSale(receiptNo.trim(), reason.trim())
      toast.success('Sale voided — stock and any credit have been reversed')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not void that sale')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-danger-soft text-danger flex items-center justify-center">
              <Ban size={18} />
            </div>
            <h2 className="font-bold text-ink">Void a sale</h2>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">Receipt number</label>
          <input
            autoFocus
            value={receiptNo}
            onChange={e => setReceiptNo(e.target.value)}
            placeholder="e.g. 4F2A9C1B"
            className="rounded-xl border border-border bg-canvas px-4 py-2.5 text-sm font-bold uppercase text-ink outline-none focus-visible:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">Reason</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. rang up the wrong item"
            className="rounded-xl border border-border bg-canvas px-4 py-2.5 text-sm text-ink outline-none focus-visible:border-primary resize-none"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded-xl bg-danger text-white font-bold py-3 disabled:opacity-60"
        >
          {loading ? 'Voiding…' : 'Void sale'}
        </button>
      </div>
    </div>
  )
}

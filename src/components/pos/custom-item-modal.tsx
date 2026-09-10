'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { X, Zap } from 'lucide-react'
import { useCart } from '@/hooks/use-cart'

interface Props {
  onClose: () => void
}

export default function CustomItemModal({ onClose }: Props) {
  const { addCustomItem } = useCart()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  function handleAdd() {
    const trimmed = name.trim()
    const amount = parseFloat(price)
    if (!trimmed) {
      toast.error('Enter a name for the item')
      return
    }
    if (isNaN(amount) || amount < 0) {
      toast.error('Enter a valid price')
      return
    }
    addCustomItem(trimmed, amount)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onKeyDown={e => e.key === 'Enter' && handleAdd()}>
      <div className="w-full max-w-xs bg-surface rounded-2xl border border-border p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-gold" />
            <h2 className="font-bold text-ink text-sm">Quick custom item</h2>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink"><X size={16} /></button>
        </div>

        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Item name"
          className="rounded-xl border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink outline-none focus-visible:border-primary"
        />
        <input
          type="number"
          inputMode="decimal"
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="Price"
          className="tabular rounded-xl border border-border bg-canvas px-3.5 py-2.5 text-sm font-bold text-ink outline-none focus-visible:border-primary"
        />

        <button onClick={handleAdd} className="w-full rounded-xl bg-primary text-white font-bold py-2.5 text-sm">
          Add to cart
        </button>
        <p className="text-[11px] text-ink-faint text-center">Shortcut: press <kbd className="px-1 py-0.5 rounded bg-surface-sunken border border-border">F2</kbd> anytime on the POS screen</p>
      </div>
    </div>
  )
}

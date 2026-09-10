'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Layers } from 'lucide-react'
import { bulkUpdateProducts } from '@/src/app/(app)/products/action'
import type { ProductCategory } from '@/types/database'

interface Props {
  selectedIds: string[]
  categories: ProductCategory[]
  onClose: () => void
  onDone: () => void
}

export default function BulkEditModal({ selectedIds, categories, onClose, onDone }: Props) {
  const [applyCategory, setApplyCategory] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [applyPrice, setApplyPrice] = useState(false)
  const [price, setPrice] = useState('')
  const [applyActive, setApplyActive] = useState(false)
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  async function handleApply() {
    const changes: Record<string, unknown> = {}
    if (applyCategory) changes.category_id = categoryId || null
    if (applyPrice) {
      const p = parseFloat(price)
      if (isNaN(p) || p < 0) { toast.error('Enter a valid price'); return }
      changes.price = p
    }
    if (applyActive) changes.is_active = active

    if (Object.keys(changes).length === 0) {
      toast.error('Turn on at least one field to apply')
      return
    }

    setSaving(true)
    try {
      await bulkUpdateProducts(selectedIds, changes)
      toast.success(`Updated ${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'}`)
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={17} className="text-primary" />
            <h2 className="font-bold text-ink">Bulk edit {selectedIds.length} product{selectedIds.length === 1 ? '' : 's'}</h2>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink"><X size={18} /></button>
        </div>

        <ToggleRow label="Set category" checked={applyCategory} onChange={setApplyCategory}>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm w-full">
            <option value="">Uncategorized</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </ToggleRow>

        <ToggleRow label="Set price" checked={applyPrice} onChange={setApplyPrice}>
          <input
            type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)}
            placeholder="0.00"
            className="tabular rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm font-bold w-full"
          />
        </ToggleRow>

        <ToggleRow label="Set active status" checked={applyActive} onChange={setApplyActive}>
          <div className="flex gap-2">
            <button
              onClick={() => setActive(true)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${active ? 'bg-primary text-white' : 'bg-canvas border border-border text-ink-soft'}`}
            >Active</button>
            <button
              onClick={() => setActive(false)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${!active ? 'bg-danger text-white' : 'bg-canvas border border-border text-ink-soft'}`}
            >Inactive</button>
          </div>
        </ToggleRow>

        <button
          onClick={handleApply}
          disabled={saving}
          className="w-full rounded-xl bg-primary text-white font-bold py-3 mt-1 disabled:opacity-60"
        >
          {saving ? 'Applying…' : `Apply to ${selectedIds.length}`}
        </button>
      </div>
    </div>
  )
}

function ToggleRow({ label, checked, onChange, children }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-primary" />
        {label}
      </label>
      {checked && <div className="pl-6">{children}</div>}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Layers, Check } from 'lucide-react'
import { batchEditProducts, type RowEdit } from '@/src/app/(app)/products/action'
import type { Product, ProductCategory } from '@/types/database'

interface Props {
  products: Product[]        // the full records for whatever's currently selected
  categories: ProductCategory[]
  onClose: () => void
  onDone: () => void
}

// Each selected product gets its own row and its own values — this is a
// batch of individual edits happening in one place, not one value stamped
// across everything selected.
export default function BulkEditModal({ products, categories, onClose, onDone }: Props) {
  const [rows, setRows] = useState<RowEdit[]>(() =>
    products.map(p => ({
      id: p.id,
      price: p.price,
      cost: p.cost,
      barcode: p.barcode,
      category_id: p.category_id,
      is_active: p.is_active,
    }))
  )
  const [saving, setSaving] = useState(false)

  function updateRow<K extends keyof RowEdit>(id: string, key: K, value: RowEdit[K]) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [key]: value } : r))
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      const result = await batchEditProducts(rows)
      if (result.failed > 0) {
        toast.error(`${result.updated} saved, ${result.failed} failed`)
      } else {
        toast.success(`Saved ${result.updated} product${result.updated === 1 ? '' : 's'}`)
      }
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Batch save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-3xl bg-surface rounded-2xl border border-border flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Layers size={17} className="text-primary" />
            <h2 className="font-bold text-ink">Edit {rows.length} product{rows.length === 1 ? '' : 's'}</h2>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[1.6fr_0.9fr_0.9fr_1fr_1.1fr_0.6fr] gap-2 px-5 py-2 text-[10px] font-bold text-ink-faint uppercase tracking-wide sticky top-0 bg-surface border-b border-border">
            <span>Product</span>
            <span>Price</span>
            <span>Cost</span>
            <span>Barcode</span>
            <span>Category</span>
            <span>Active</span>
          </div>

          {products.map(product => {
            const row = rows.find(r => r.id === product.id)!
            return (
              <div key={product.id} className="grid grid-cols-[1.6fr_0.9fr_0.9fr_1fr_1.1fr_0.6fr] gap-2 px-5 py-2.5 items-center border-b border-border last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{product.name}</p>
                  <p className="text-[11px] text-ink-faint">{product.volume ?? '\u00A0'}</p>
                </div>
                <input
                  type="number" inputMode="decimal" value={row.price}
                  onChange={e => updateRow(product.id, 'price', parseFloat(e.target.value) || 0)}
                  className="tabular rounded-lg border border-border bg-canvas px-2 py-1.5 text-sm font-bold text-ink w-full outline-none focus-visible:border-primary"
                />
                <input
                  type="number" inputMode="decimal" value={row.cost}
                  onChange={e => updateRow(product.id, 'cost', parseFloat(e.target.value) || 0)}
                  className="tabular rounded-lg border border-border bg-canvas px-2 py-1.5 text-sm text-ink w-full outline-none focus-visible:border-primary"
                />
                <input
                  value={row.barcode ?? ''} placeholder="Optional"
                  onChange={e => updateRow(product.id, 'barcode', e.target.value || null)}
                  className="rounded-lg border border-border bg-canvas px-2 py-1.5 text-xs text-ink w-full outline-none focus-visible:border-primary"
                />
                <select
                  value={row.category_id ?? ''}
                  onChange={e => updateRow(product.id, 'category_id', e.target.value || null)}
                  className="rounded-lg border border-border bg-canvas px-2 py-1.5 text-xs text-ink-soft w-full outline-none focus-visible:border-primary"
                >
                  <option value="">Uncategorized</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <label className="flex items-center justify-center">
                  <input
                    type="checkbox" checked={row.is_active}
                    onChange={e => updateRow(product.id, 'is_active', e.target.checked)}
                    className="accent-primary w-4 h-4"
                  />
                </label>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-bold py-3 disabled:opacity-60"
          >
            <Check size={16} />
            {saving ? 'Saving…' : `Save all ${rows.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
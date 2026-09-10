'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Circle, CircleCheck } from 'lucide-react'
import { createProduct, updateProduct, type ProductPayload } from '@/src/app/(app)/products/action'
import type { Product, ProductCategory } from '@/types/database'

interface Props {
  mode: 'edit' | 'create'
  product: Product | null
  categories: ProductCategory[]
  prefillBarcode?: string
  onSaved: (product: Product) => void
}

const emptyForm = (barcode?: string): ProductPayload => ({
  name: '', sku: null, barcode: barcode ?? null, volume: null, category_id: null,
  price: 0, cost: 0, stocks: 0, low_stock_threshold: 5, is_active: true,
})

export default function ProductPreviewPane({ mode, product, categories, prefillBarcode, onSaved }: Props) {
  const [form, setForm] = useState<ProductPayload>(() =>
    product
      ? {
          name: product.name, sku: product.sku, barcode: product.barcode, volume: product.volume,
          category_id: product.category_id, price: product.price, cost: product.cost,
          stocks: product.stocks, low_stock_threshold: product.low_stock_threshold, is_active: product.is_active,
        }
      : emptyForm(prefillBarcode)
  )
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ProductPayload>(key: K, value: ProductPayload[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      const categoryName = categories.find(c => c.id === form.category_id)?.name
      const saved = mode === 'create'
        ? await createProduct(form, categoryName)
        : await updateProduct(product!.id, form)
      toast.success(mode === 'create' ? 'Product created' : 'Saved')
      onSaved(saved as unknown as Product)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full lg:w-[300px] shrink-0 bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4 h-fit lg:sticky lg:top-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => set('is_active', !form.is_active)}
          className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
            form.is_active ? 'bg-primary-soft text-primary-dark' : 'bg-surface-sunken text-ink-faint'
          }`}
        >
          {form.is_active ? <CircleCheck size={13} /> : <Circle size={13} />}
          {form.is_active ? 'Active' : 'Inactive'}
        </button>
        {mode === 'create' && <span className="text-xs font-semibold text-gold">New product</span>}
      </div>

      <Field label="Name">
        <input value={form.name} onChange={e => set('name', e.target.value)} className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-[13px] font-semibold text-ink w-full outline-none focus-visible:border-primary" autoFocus />
      </Field>

      <div className="flex gap-3">
        <Field label="Volume">
          <input value={form.volume ?? ''} onChange={e => set('volume', e.target.value || null)} className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-[13px] font-semibold text-ink w-full outline-none focus-visible:border-primary" />
        </Field>
        <Field label="Category">
          <select
            value={form.category_id ?? ''}
            onChange={e => set('category_id', e.target.value || null)}
            className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-[13px] font-semibold text-ink w-full outline-none focus-visible:border-primary"
          >
            <option value="">Uncategorized</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="flex gap-3">
        <Field label="Price">
          <input type="number" inputMode="decimal" value={form.price} onChange={e => set('price', parseFloat(e.target.value) || 0)} className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-[13px] font-semibold text-ink w-full outline-none focus-visible:border-primary tabular" />
        </Field>
        <Field label="Cost">
          <input type="number" inputMode="decimal" value={form.cost} onChange={e => set('cost', parseFloat(e.target.value) || 0)} className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-[13px] font-semibold text-ink w-full outline-none focus-visible:border-primary tabular" />
        </Field>
      </div>

      <div className="flex gap-3">
        <Field label="Stocks">
          <input type="number" inputMode="numeric" value={form.stocks} onChange={e => set('stocks', parseFloat(e.target.value) || 0)} className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-[13px] font-semibold text-ink w-full outline-none focus-visible:border-primary tabular" />
        </Field>
        <Field label="Low stock at">
          <input type="number" inputMode="numeric" value={form.low_stock_threshold} onChange={e => set('low_stock_threshold', parseFloat(e.target.value) || 0)} className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-[13px] font-semibold text-ink w-full outline-none focus-visible:border-primary tabular" />
        </Field>
      </div>

      <div className="flex gap-3">
        <Field label="Barcode (optional)">
          <input value={form.barcode ?? ''} onChange={e => set('barcode', e.target.value || null)} className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-[13px] font-semibold text-ink w-full outline-none focus-visible:border-primary" placeholder="Optional" />
        </Field>
        <Field label="SKU">
          <input value={form.sku ?? ''} onChange={e => set('sku', e.target.value || null)} className="rounded-lg border border-border bg-canvas px-2.5 py-2 text-[13px] font-semibold text-ink w-full outline-none focus-visible:border-primary" placeholder="Auto-generated" />
        </Field>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-bold py-3 mt-1 disabled:opacity-60"
      >
        <Check size={16} />
        {saving ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col gap-1 min-w-0">
      <label className="text-[10px] font-bold text-ink-faint uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Search, Plus, FileDown, FileUp, Tag, Layers, Scan, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner'
import { formatPeso } from '@/lib/utils/currency'
import { exportProducts } from '@/src/app/(app)/products/action'
import ProductPreviewPane from './product-preview-pane'
import BulkEditModal from './bulk-edit-modal'
import type { Product, ProductCategory } from '@/types/database'

interface Props {
  initialProducts: Product[]
  categories: ProductCategory[]
}

export default function ProductsClient({ initialProducts, categories }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [previewMode, setPreviewMode] = useState<'edit' | 'create' | null>(null)
  const [prefillBarcode, setPrefillBarcode] = useState<string | undefined>()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkEdit, setShowBulkEdit] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    let query = supabase.from('products').select('*, product_categories(name)').order('name')
    if (categoryFilter) query = query.eq('category_id', categoryFilter)
    if (search.trim()) query = query.or(`name.ilike.%${search}%,barcode.ilike.%${search}%,sku.ilike.%${search}%`)
    const { data, error } = await query
    if (error) toast.error('Failed to load products: ' + error.message)
    setProducts(data ?? [])
    setLoading(false)
  }, [search, categoryFilter])

  useEffect(() => {
    const t = setTimeout(refresh, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [refresh, search])

  // Barcode scan: exact match selects it into the preview pane; no match routes
  // straight to creation with the barcode already filled in.
  const handleScan = useCallback(async (barcode: string) => {
    const supabase = createClient()
    const { data } = await supabase.from('products').select('*, product_categories(name)').eq('barcode', barcode).maybeSingle()
    if (data) {
      setSelectedProduct(data)
      setPreviewMode('edit')
      toast.success(`Found: ${data.name}`)
    } else {
      setSelectedProduct(null)
      setPreviewMode('create')
      setPrefillBarcode(barcode)
      toast.message(`No product with barcode ${barcode} — creating new`)
    }
  }, [])
  useBarcodeScanner(handleScan)

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCreate() {
    setSelectedProduct(null)
    setPrefillBarcode(undefined)
    setPreviewMode('create')
  }

  function openEdit(p: Product) {
    setSelectedProduct(p)
    setPrefillBarcode(undefined)
    setPreviewMode('edit')
  }

  function handleSaved(saved: Product) {
    setSelectedProduct(saved)
    setPreviewMode('edit')
    refresh()
  }

  async function handleExport() {
    try {
      const csv = await exportProducts()
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    }
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-extrabold text-ink">Products</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/products/categories" className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-ink-soft hover:border-primary transition-colors">
            <Tag size={13} /> Categories
          </Link>
          <button
            onClick={() => selectedIds.size > 0 ? setShowBulkEdit(true) : toast.error('Select products first')}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-ink-soft hover:border-primary transition-colors disabled:opacity-40"
          >
            <Layers size={13} /> Bulk edit{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-ink-soft hover:border-primary transition-colors">
            <FileDown size={13} /> Export
          </button>
          <Link href="/products/import" className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-ink-soft hover:border-primary transition-colors">
            <FileUp size={13} /> Import
          </Link>
          <button onClick={openCreate} className="flex items-center gap-1.5 rounded-xl bg-primary text-white px-3.5 py-2 text-xs font-bold">
            <Plus size={13} /> New product
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2 flex-1 min-w-[200px]">
          <Search size={15} className="text-ink-faint" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, barcode, SKU…" className="flex-1 text-sm bg-transparent outline-none" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2 text-sm text-ink-soft">
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex items-center gap-2 bg-primary-soft border border-dashed border-primary rounded-xl px-3 py-2 text-xs font-bold text-primary-dark">
          <Scan size={14} /> Scan to find
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 border border-border rounded-2xl overflow-hidden bg-border w-full">
          {loading ? (
            <div className="bg-surface p-8 text-center text-sm text-ink-faint">Loading…</div>
          ) : products.length === 0 ? (
            <div className="bg-surface p-10 flex flex-col items-center gap-2 text-ink-faint">
              <Package size={28} strokeWidth={1.5} />
              <p className="text-sm">No products found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-px max-h-[70vh] overflow-y-auto">
              {products.map(p => (
                <button
                  key={p.id}
                  onClick={() => openEdit(p)}
                  className={`flex items-center gap-3 px-4 py-3 text-left bg-surface hover:bg-primary-soft/40 transition-colors ${
                    selectedProduct?.id === p.id ? 'bg-primary-soft' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={e => { e.stopPropagation(); toggleSelect(p.id) }}
                    onClick={e => e.stopPropagation()}
                    className="accent-primary shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{p.name}</p>
                    <p className="text-xs text-ink-faint">{p.product_categories?.name ?? 'Uncategorized'}{p.volume ? ` · ${p.volume}` : ''}</p>
                  </div>
                  {!p.is_active && <span className="text-[10px] font-bold text-ink-faint bg-surface-sunken px-2 py-0.5 rounded-full shrink-0">Inactive</span>}
                  <span className="text-xs text-ink-faint tabular shrink-0 w-16 text-right">{p.stocks} left</span>
                  <span className="text-sm font-bold text-gold tabular shrink-0 w-20 text-right">{formatPeso(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {previewMode && (
          <ProductPreviewPane
            key={selectedProduct?.id ?? `create-${prefillBarcode ?? ''}`}
            mode={previewMode}
            product={selectedProduct}
            categories={categories}
            prefillBarcode={prefillBarcode}
            onSaved={handleSaved}
          />
        )}
      </div>

      {showBulkEdit && (
        <BulkEditModal
          selectedIds={Array.from(selectedIds)}
          categories={categories}
          onClose={() => setShowBulkEdit(false)}
          onDone={() => { setShowBulkEdit(false); setSelectedIds(new Set()); refresh() }}
        />
      )}
    </div>
  )
}

'use client'

import type { Product } from '@/types/database'
import { formatPeso } from '@/lib/utils/currency'
import { Package } from 'lucide-react'
import Badge from '@/src/components/ui/badge'
import { useCart } from '@/hooks/use-cart'

interface Props {
  products: Product[]
  loading: boolean
  onAdd: (product: Product) => void
}

export default function ProductGrid({ products, loading, onAdd }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="h-28 bg-surface-sunken rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-ink-faint gap-3">
        <Package size={40} strokeWidth={1.5} />
        <p className="text-sm">No products found</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
      {products.map(product => (
        <ProductTile key={product.id} product={product} onAdd={onAdd} />
      ))}
    </div>
  )
}

// Stock is advisory only in V2 — low/out badges are informational, they never
// block adding the item to the cart. Inventory counts aren't precise enough
// to gate a sale on. Inactive products only ever appear here when the
// "Inactive" toggle is on — they're still fully sellable, just flagged.
function ProductTile({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const outOfStock = product.stocks <= 0
  const lowStock = product.stocks > 0 && product.stocks <= product.low_stock_threshold
  // how many of this product are already in the current sale
  const inCart = useCart(s => s.items.reduce((n, i) => (i.product.id === product.id ? n + i.qty : n), 0))

  return (
    <button
      onClick={() => onAdd(product)}
      className={`relative flex flex-col items-start text-left p-3.5 min-h-[7.5rem] rounded-xl border-2 bg-surface hover:border-primary hover:shadow-sm active:scale-95 cursor-pointer transition-all ${
        inCart > 0 ? 'border-primary bg-primary-soft/40' : 'border-border'
      } ${product.is_active ? '' : 'opacity-60'}`}
    >
      {!product.is_active && <Badge tone="neutral" className="absolute top-2 right-2">Inactive</Badge>}
      {product.is_active && outOfStock && <Badge tone="danger" className="absolute top-2 right-2">Out</Badge>}
      {product.is_active && lowStock && <Badge tone="warning" className="absolute top-2 right-2">Low</Badge>}

      {inCart > 0 && (
        <span className="absolute -top-2 -left-2 min-w-7 h-7 px-1.5 rounded-full bg-primary text-white text-sm font-bold tabular flex items-center justify-center shadow">
          {inCart}
        </span>
      )}

      <span className={`text-base font-semibold text-ink leading-snug line-clamp-3 mb-1 ${product.is_active && !outOfStock && !lowStock ? '' : 'pr-9'}`}>
        {product.name}
      </span>
      <span className="text-sm text-ink-soft mb-2 tabular">
        {product.volume ?? '\u00A0'}
      </span>
      {product.price > 0 ? (
        <span className="text-lg font-extrabold text-gold mt-auto tabular">
          {formatPeso(product.price)}
        </span>
      ) : (
        <span className="text-sm font-bold text-danger mt-auto">No price</span>
      )}
    </button>
  )
}
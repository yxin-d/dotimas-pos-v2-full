'use client'

import { useCart } from '@/hooks/use-cart'
import { formatPeso } from '@/lib/utils/currency'
import { Minus, Plus, X } from 'lucide-react'
import type { CartItem as CartItemType } from '@/types/database'

interface Props {
  item: CartItemType
}

// Sized for fingers on the store tablet: the +/− buttons are 44px squares
// (they were 24px), and the name, size and amounts are large enough to read
// at arm's length.
export default function CartItem({ item }: Props) {
  const { updateQty, removeItem } = useCart()
  const { product, qty, subtotal, customPrice } = item

  return (
    <div className="py-2.5 border-b border-border last:border-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-ink leading-snug line-clamp-2">{product.name}</p>
          <p className="text-sm text-ink-soft tabular">
            {product.volume ? `${product.volume} · ` : ''}{formatPeso(customPrice ?? product.price)} each
          </p>
        </div>
        <button
          onClick={() => removeItem(product.id)}
          aria-label={`Remove ${product.name}`}
          className="w-9 h-9 -mt-1 -mr-1 rounded-lg text-ink-faint hover:text-danger hover:bg-danger-soft flex items-center justify-center transition-colors shrink-0"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between mt-2">
        {/* Qty controls — no stock ceiling; stock is advisory only in V2 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => updateQty(product.id, qty - 1)}
            aria-label="One less"
            className="w-11 h-11 rounded-xl bg-surface-sunken hover:bg-border active:scale-95 flex items-center justify-center transition-all"
          >
            <Minus size={18} />
          </button>
          <span className="min-w-10 text-center text-lg font-bold text-ink tabular">{qty}</span>
          <button
            onClick={() => updateQty(product.id, qty + 1)}
            aria-label="One more"
            className="w-11 h-11 rounded-xl bg-surface-sunken hover:bg-border active:scale-95 flex items-center justify-center transition-all"
          >
            <Plus size={18} />
          </button>
        </div>
        <span className="text-lg font-bold text-ink tabular">{formatPeso(subtotal)}</span>
      </div>
    </div>
  )
}

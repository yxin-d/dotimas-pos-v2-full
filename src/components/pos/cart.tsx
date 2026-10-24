'use client'

import { useEffect, useState } from 'react'
import { useCart } from '@/hooks/use-cart'
import { formatPeso } from '@/lib/utils/currency'
import { ShoppingCart, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils/utils'
import CartItem from './cart-item'

interface Props {
  onCheckout: () => void
  /** Mobile only: whether the cart sheet is open (ignored on lg+, where it's always visible) */
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

export default function Cart({ onCheckout, isMobileOpen = false, onMobileClose }: Props) {
  const { items, clearCart, total, itemCount } = useCart()
  const hasItems = items.length > 0
  // Clearing the whole sale takes two taps, so a stray tap can't wipe it.
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => {
    if (!confirmClear) return
    const t = setTimeout(() => setConfirmClear(false), 3000)
    return () => clearTimeout(t)
  }, [confirmClear])

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex flex-col bg-surface border-t border-border rounded-t-2xl max-h-[85vh] transition-transform duration-300 ease-in-out',
          isMobileOpen ? 'translate-y-0' : 'translate-y-full',
          'lg:static lg:translate-y-0 lg:z-auto lg:w-96 lg:shrink-0 lg:h-full lg:max-h-none lg:rounded-none lg:border-t-0 lg:border-l'
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-ink-faint" />
            <span className="font-semibold text-ink text-base">Current sale</span>
            {hasItems && (
              <span className="text-sm bg-primary text-white rounded-full px-2 py-0.5 font-bold tabular">
                {itemCount()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasItems && (
              <button
                onClick={() => {
                  if (confirmClear) { clearCart(); setConfirmClear(false) }
                  else setConfirmClear(true)
                }}
                className={`flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  confirmClear ? 'bg-danger text-white' : 'text-ink-faint hover:text-danger hover:bg-danger-soft'
                }`}
                title="Clear cart"
              >
                <Trash2 size={16} />
                {confirmClear && 'Tap again to clear'}
              </button>
            )}
            <button onClick={onMobileClose} className="text-ink-faint hover:text-ink transition-colors lg:hidden" title="Close cart">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {!hasItems ? (
            <div className="flex flex-col items-center justify-center h-48 text-ink-faint/40 gap-2">
              <ShoppingCart size={36} strokeWidth={1.2} />
              <p className="text-sm">Cart is empty</p>
            </div>
          ) : (
            items.map(item => <CartItem key={item.product.id} item={item} />)
          )}
        </div>

        <div className="border-t border-border px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-ink-soft">Total</span>
            <span className="text-3xl font-extrabold text-gold tabular">{formatPeso(total())}</span>
          </div>

          <button
            onClick={onCheckout}
            disabled={!hasItems}
            className="w-full py-4 rounded-xl bg-primary text-white text-lg font-bold
              hover:bg-primary-dark active:scale-[0.98] transition-all
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Charge {formatPeso(total())}
          </button>
        </div>
      </div>
    </>
  )
}

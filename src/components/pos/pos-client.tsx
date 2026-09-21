'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/hooks/use-cart'
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner'
import Cart from './cart'
import ProductGrid from './product-grid'
import CheckoutModal from './checkout-modal'
import CustomItemModal from './custom-item-modal'
import VoidModal from './void-modal'
import PriceCheckerModal from './price-checker-modal'
import CloseDayModal from './close-day-modal'
import ShiftModal from './shift-modal'
import Receipt from './receipt'
import { formatPeso } from '@/lib/utils/currency'
import { Search, PowerOff, Scan, Ban, User, Menu, EyeOff, Lock, Receipt as ReceiptIcon } from 'lucide-react'
import { toast } from 'sonner'
import PosNavDrawer from './pos-nav-drawer'
import type { Product, ProductCategory, Staff, PosSession, StaffShift } from '@/types/database'

type ActiveModal = 'checkout' | 'customItem' | 'void' | 'priceChecker' | 'closeDay' | null

interface Props {
  staff: Staff | null
  session: PosSession | null
  activeShift: StaffShift | null
  categories: ProductCategory[]
}

export default function PosClient({ staff, session, activeShift, categories }: Props) {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  // Whether the receipt pops up automatically right after a sale completes.
  // The receipt itself is never optional — it's restored and always
  // reachable via "View last receipt" below — but forcing it open on every
  // single sale isn't always wanted (e.g. quick repeat snack sales), so this
  // makes the auto-popup itself a per-device preference. Persisted the same
  // way the sidebar-collapsed preference is (see AppLayout), since this is a
  // per-cashier/per-device UI setting, not data that needs to live in Supabase.
  // Lazy initializer (read once on mount, no effect) — same pattern
  // AppLayout uses for sidebar-collapsed. Defaults to true (matches
  // "restored"); only an explicit 'false' in storage turns it off.
  const [autoShowReceipt, setAutoShowReceipt] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('pos-auto-receipt') !== 'false'
  })
  const [lastInvoiceId, setLastInvoiceId] = useState<string | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  function toggleAutoShowReceipt() {
    setAutoShowReceipt(v => {
      const next = !v
      localStorage.setItem('pos-auto-receipt', String(next))
      return next
    })
  }

  const { addItem, items: cartItems, total: cartTotal, itemCount: cartItemCount } = useCart()

  useEffect(() => {
    supabaseRef.current = createClient()
  }, [])

  useEffect(() => {
    async function load() {
      if (!supabaseRef.current) return
      setLoading(true)
      let query = supabaseRef.current
        .from('products')
        .select('*, product_categories(name)')
        .order('name')

      if (!showInactive) query = query.eq('is_active', true)
      if (activeCategory) query = query.eq('category_id', activeCategory)
      if (search.trim()) query = query.or(`name.ilike.%${search}%,barcode.ilike.%${search}%`)

      const { data, error } = await query
      if (error) {
        console.error(error)
      } else {
        setProducts(data ?? [])
      }
      setLoading(false)
    }
    const t = setTimeout(load, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [activeCategory, search, showInactive])

  // Barcode scanner: exact match on barcode adds straight to cart
  const handleScan = useCallback((barcode: string) => {
    const match = products.find(p => p.barcode === barcode)
    if (match) {
      addItem(match)
      toast.success(`Added ${match.name}`)
    } else {
      toast.error(`No product with barcode ${barcode}`)
    }
  }, [products, addItem])
  useBarcodeScanner(handleScan)

  // F2 shortcut for the custom-item quick-add
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault()
        setActiveModal('customItem')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // "needsShift" covers two very different situations that used to be
  // treated the same: (1) the day/shift genuinely needs opening — actionable
  // — vs (2) today's day has already been closed, which the close_day/
  // start_shift RPCs treat as final for the rest of the calendar day (see
  // "Today's day has already been closed" in start_shift). Previously, right
  // after closing the day, this would immediately re-show the ShiftModal in
  // "open_day" mode — a modal that could never actually succeed, since a
  // session already exists for today. Now a closed day gets its own locked
  // state instead of a modal that's doomed to fail.
  const needsShift = !activeShift
  const dayClosed = session?.status === 'closed'
  const shiftMode = session && session.status === 'open' ? 'start_shift' : 'open_day'

  // Reset the dismissal whenever the underlying session/shift identity
  // changes (day closed and reopened tomorrow, shift started elsewhere,
  // etc.) so a stale dismissal doesn't carry over. Adjusting state directly
  // during render (guarded by comparing against the last-seen key) is the
  // pattern React recommends for "reset this when that identity changes" —
  // it avoids the extra render pass a useEffect here would cause.
  const shiftKey = `${session?.id ?? 'none'}:${activeShift?.id ?? 'none'}`
  const [shiftPromptDismissed, setShiftPromptDismissed] = useState(false)
  const [lastShiftKey, setLastShiftKey] = useState(shiftKey)
  if (shiftKey !== lastShiftKey) {
    setLastShiftKey(shiftKey)
    setShiftPromptDismissed(false)
  }

  return (
    <div className="flex flex-col h-screen bg-canvas">
      {/* Top bar — POS runs full-screen, no sidebar, per the V2 design direction */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNavOpen(true)}
            title="Menu"
            className="p-1.5 -ml-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-sunken transition-colors"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2 font-extrabold text-ink">
            <span className="text-primary">Dotimas</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-faint hidden sm:block">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
          {staff && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
              <User size={13} />
              {staff.name}
            </div>
          )}
          {lastInvoiceId && (
            <button
              onClick={() => setReceiptId(lastInvoiceId)}
              title="View last receipt"
              className="p-2 rounded-xl border border-border text-ink-faint hover:text-primary hover:border-primary/40 transition-colors"
            >
              <ReceiptIcon size={16} />
            </button>
          )}
          <button
            onClick={toggleAutoShowReceipt}
            title={autoShowReceipt ? 'Receipt pops up automatically after each sale — click to turn off' : 'Receipt stays closed after a sale — click to auto-show it again'}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
              autoShowReceipt
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-faint border-border hover:border-primary hover:text-primary'
            }`}
          >
            <ReceiptIcon size={14} />
            <span className="hidden sm:inline">Auto-receipt</span>
          </button>
          <button
            onClick={() => setActiveModal('priceChecker')}
            title="Price checker"
            className="p-2 rounded-xl border border-border text-ink-faint hover:text-primary hover:border-primary/40 transition-colors"
          >
            <Scan size={16} />
          </button>
          <button
            onClick={() => setActiveModal('void')}
            title="Void a sale"
            className="p-2 rounded-xl border border-border text-ink-faint hover:text-danger hover:border-danger/40 transition-colors"
          >
            <Ban size={16} />
          </button>
          {activeShift && (
            <button
              onClick={() => setActiveModal('closeDay')}
              title="Close day"
              className="p-2 rounded-xl border border-border text-ink-faint hover:text-danger hover:border-danger/40 transition-colors"
            >
              <PowerOff size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="px-4 py-2.5 border-b border-border shrink-0 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-canvas border border-border rounded-xl px-3 py-2">
              <Search size={15} className="text-ink-faint" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search or scan barcode…"
                className="flex-1 text-sm bg-transparent outline-none"
              />
            </div>
            <button
              onClick={() => setShowInactive(v => !v)}
              title="Show inactive products"
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                showInactive
                  ? 'bg-primary text-white border-primary'
                  : 'bg-canvas text-ink-faint border-border hover:border-primary hover:text-primary'
              }`}
            >
              <EyeOff size={14} />
              <span className="hidden sm:inline">Inactive</span>
            </button>
          </div>

          {/* Category pills */}
          {categories.length > 0 && (
            <div className="flex gap-1.5 px-4 py-2 border-b border-border overflow-x-auto shrink-0">
              <CategoryTab label="All" active={activeCategory === null} onClick={() => setActiveCategory(null)} />
              {categories.map(cat => (
                <CategoryTab key={cat.id} label={cat.name} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} />
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            <ProductGrid products={products} loading={loading} onAdd={addItem} />
          </div>
        </div>

        {cartItems.length > 0 && !mobileCartOpen && (
          <button
            onClick={() => setMobileCartOpen(true)}
            className="lg:hidden fixed bottom-4 inset-x-4 z-30 flex items-center justify-between bg-primary text-white rounded-xl px-4 py-3 shadow-lg active:scale-[0.98] transition-transform"
          >
            <span className="text-sm font-semibold">View cart · {cartItemCount()} item{cartItemCount() === 1 ? '' : 's'}</span>
            <span className="text-sm font-bold tabular">{formatPeso(cartTotal())}</span>
          </button>
        )}

        <Cart
          onCheckout={() => setActiveModal('checkout')}
          isMobileOpen={mobileCartOpen}
          onMobileClose={() => setMobileCartOpen(false)}
        />

        {needsShift && staff && (dayClosed || shiftPromptDismissed) && (
          <ShiftLockedOverlay
            dayClosed={dayClosed}
            mode={shiftMode}
            onOpen={dayClosed ? undefined : () => setShiftPromptDismissed(false)}
          />
        )}
      </div>

      {activeModal === 'checkout' && (
        <CheckoutModal
          onClose={() => setActiveModal(null)}
          onComplete={id => {
            // CheckoutModal already toasts "Sale complete" itself — this
            // only adds a pointer to the receipt when auto-show is off,
            // rather than repeating that message.
            setActiveModal(null)
            setLastInvoiceId(id)
            if (autoShowReceipt) setReceiptId(id)
            else toast.info('Tap the receipt icon up top to view or print it.')
          }}
        />
      )}
      {activeModal === 'customItem' && <CustomItemModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'void' && <VoidModal onClose={() => setActiveModal(null)} onDone={() => setActiveModal(null)} />}
      {activeModal === 'priceChecker' && <PriceCheckerModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'closeDay' && (
        <CloseDayModal onClose={() => setActiveModal(null)} onDone={() => { setActiveModal(null); router.refresh() }} />
      )}
      {receiptId && <Receipt invoiceId={receiptId} onClose={() => setReceiptId(null)} />}
      {navOpen && <PosNavDrawer onClose={() => setNavOpen(false)} />}

      {needsShift && staff && !dayClosed && !shiftPromptDismissed && (
        <ShiftModal
          mode={shiftMode}
          staffName={staff.name}
          onDone={() => router.refresh()}
          onDismiss={() => setShiftPromptDismissed(true)}
        />
      )}
    </div>
  )
}

function CategoryTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
        active ? 'bg-primary text-white border-primary' : 'bg-surface text-ink-soft border-border hover:border-primary'
      }`}
    >
      {label}
    </button>
  )
}

// Covers the product grid + cart (not the top bar) while sales are locked —
// either because today's day is already closed for good, or because the
// cashier chose "I'll open later" / "I'll start my shift later" from the
// ShiftModal. dayClosed gets no action button since there's genuinely
// nothing to do until the date rolls over; the dismissed case gets a button
// that brings the ShiftModal back.
function ShiftLockedOverlay({
  dayClosed,
  mode,
  onOpen,
}: {
  dayClosed: boolean
  mode: 'open_day' | 'start_shift'
  onOpen?: () => void
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-canvas/95 backdrop-blur-sm p-6">
      <div className="text-center max-w-xs flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-surface-sunken text-ink-faint flex items-center justify-center">
          <Lock size={20} />
        </div>
        {dayClosed ? (
          <>
            <h3 className="font-bold text-ink">Day closed</h3>
            <p className="text-sm text-ink-faint">
              Today&apos;s books are already closed and can&apos;t be reopened. Sales are locked until a new day is opened.
            </p>
          </>
        ) : (
          <>
            <h3 className="font-bold text-ink">
              {mode === 'open_day' ? 'Day not started' : 'Shift not started'}
            </h3>
            <p className="text-sm text-ink-faint">
              {mode === 'open_day'
                ? "You chose to open the day later. Sales are locked until you open it."
                : "You chose to start your shift later. Sales are locked until you clock in."}
            </p>
            <button
              onClick={onOpen}
              className="mt-1 rounded-xl bg-primary text-white font-bold px-5 py-2.5 text-sm"
            >
              {mode === 'open_day' ? 'Open the day' : 'Start shift'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
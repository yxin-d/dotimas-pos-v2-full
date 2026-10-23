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
import OpenDayModal from './open-day-modal'
import ExpenseModal from './expense-modal'
import Receipt from './receipt'
import { formatPeso, formatDate } from '@/lib/utils/currency'
import { manilaDate } from '@/lib/utils/date'
import { wordsFilter } from '@/lib/utils/search'
import CategoryGrid, { ALL_PRODUCTS, UNCATEGORIZED } from './category-grid'
import { Search, PowerOff, Scan, Ban, Menu, EyeOff, Lock, ArrowLeft, AlertTriangle, Wallet, X, Receipt as ReceiptIcon } from 'lucide-react'
import { toast } from 'sonner'
import PosNavDrawer from './pos-nav-drawer'
import type { Product, ProductCategory, PosSession } from '@/types/database'

type ActiveModal = 'checkout' | 'customItem' | 'void' | 'priceChecker' | 'closeDay' | 'expense' | null

interface Props {
  // The day the POS is working in — see getCurrentSession(). No staff/shift
  // tracking: being logged in is enough to sell once the day is open.
  session: PosSession | null
  categories: ProductCategory[]
}

export default function PosClient({ session, categories }: Props) {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  // null = category screen (kiosk-style landing). Otherwise a category id,
  // or one of the ALL_PRODUCTS / UNCATEGORIZED sentinels.
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number> | null>(null)
  const [uncategorizedCount, setUncategorizedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const searching = search.trim().length > 0
  const searchRef = useRef<HTMLInputElement>(null)
  // One tap clears the box and keeps the cursor there for the next search.
  function clearSearch() {
    setSearch('')
    searchRef.current?.focus()
  }
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

  // Per-category product counts for the category cards. One light query
  // (category_id only) rather than a count per category.
  useEffect(() => {
    async function loadCounts() {
      if (!supabaseRef.current) return
      let query = supabaseRef.current.from('products').select('category_id')
      if (!showInactive) query = query.eq('is_active', true)
      const { data, error } = await query
      if (error) {
        console.error(error)
        return
      }
      const next: Record<string, number> = {}
      let none = 0
      for (const row of data ?? []) {
        if (row.category_id) next[row.category_id] = (next[row.category_id] ?? 0) + 1
        else none += 1
      }
      setCategoryCounts(next)
      setUncategorizedCount(none)
      setTotalCount((data ?? []).length)
    }
    loadCounts()
  }, [showInactive])

  useEffect(() => {
    async function load() {
      if (!supabaseRef.current) return
      // On the category screen with nothing typed there is nothing to list.
      if (!searching && activeCategory === null) {
        setProducts([])
        setLoading(false)
        return
      }
      setLoading(true)
      let query = supabaseRef.current
        .from('products')
        .select('*, product_categories(name)')
        .order('name')

      if (!showInactive) query = query.eq('is_active', true)
      if (searching) {
        // Searching always spans every category, whatever screen you're on.
        // Every typed word must match the name, size or barcode, in any order.
        const filter = wordsFilter(search, ['name', 'volume', 'barcode'])
        if (filter) query = query.or(filter)
      } else if (activeCategory === UNCATEGORIZED) {
        query = query.is('category_id', null)
      } else if (activeCategory !== ALL_PRODUCTS) {
        query = query.eq('category_id', activeCategory)
      }

      const { data, error } = await query
      if (error) {
        console.error(error)
      } else {
        setProducts(data ?? [])
      }
      setLoading(false)
    }
    const t = setTimeout(load, searching ? 250 : 0)
    return () => clearTimeout(t)
  }, [activeCategory, search, searching, showInactive])

  // Barcode scanner: exact match on barcode adds straight to cart. The
  // category screen doesn't keep a product list loaded, so a scan that isn't
  // in the visible list is looked up directly instead of failing.
  const handleScan = useCallback(async (barcode: string) => {
    let match: Product | null | undefined = products.find(p => p.barcode === barcode)
    if (!match && supabaseRef.current) {
      let query = supabaseRef.current.from('products').select('*').eq('barcode', barcode)
      if (!showInactive) query = query.eq('is_active', true)
      const { data, error } = await query.limit(1).maybeSingle()
      if (error) console.error(error)
      match = data as Product | null
    }
    if (match) {
      addItem(match)
      toast.success(`Added ${match.name}`)
    } else {
      toast.error(`No product with barcode ${barcode}`)
    }
  }, [products, addItem, showInactive])
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

  // Sales are locked until a day is open. Two locked states:
  // (1) today hasn't been opened yet — actionable, show the OpenDayModal;
  // (2) today's day was already closed — final for the rest of the date, so
  //     no modal (open_day would just refuse), only a locked overlay.
  const dayOpen = session?.status === 'open'
  const dayClosed = session?.status === 'closed'
  // An open day from an earlier date means nobody closed it. Sales still go
  // into it (its drawer hasn't been counted), but nag to close it.
  const staleDay = dayOpen && session.session_date < manilaDate()

  const categoryTitle =
    activeCategory === ALL_PRODUCTS ? 'All products'
    : activeCategory === UNCATEGORIZED ? 'Uncategorized'
    : categories.find(c => c.id === activeCategory)?.name ?? ''

  // "I'll open the day later" — resets whenever the session changes (e.g.
  // the day gets opened from another device). Adjusting state during render,
  // guarded by the last-seen key, is React's recommended pattern for "reset
  // this when that identity changes" and avoids an extra effect pass.
  const sessionKey = session ? `${session.id}:${session.status}` : 'none'
  const [openPromptDismissed, setOpenPromptDismissed] = useState(false)
  const [lastSessionKey, setLastSessionKey] = useState(sessionKey)
  if (sessionKey !== lastSessionKey) {
    setLastSessionKey(sessionKey)
    setOpenPromptDismissed(false)
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
            onClick={() => setActiveModal('expense')}
            title="Add expense (paid from the drawer)"
            className="p-2 rounded-xl border border-border text-ink-faint hover:text-gold hover:border-gold/40 transition-colors"
          >
            <Wallet size={16} />
          </button>
          <button
            onClick={() => setActiveModal('void')}
            title="Void a sale"
            className="p-2 rounded-xl border border-border text-ink-faint hover:text-danger hover:border-danger/40 transition-colors"
          >
            <Ban size={16} />
          </button>
          {dayOpen && (
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
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') clearSearch() }}
                placeholder="Search or scan barcode…"
                className="flex-1 min-w-0 text-sm bg-transparent outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="-my-1 -mr-1.5 p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-sunken"
                >
                  <X size={16} />
                </button>
              )}
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

          {staleDay && (
            <div className="flex items-center gap-2 px-4 py-2 bg-warning-soft border-b border-border text-xs text-ink-soft shrink-0">
              <AlertTriangle size={14} className="text-warning shrink-0" />
              <span className="flex-1">
                {formatDate(session.session_date)} was never closed. Sales are still going into that day.
              </span>
              <button
                onClick={() => setActiveModal('closeDay')}
                className="font-semibold text-ink underline underline-offset-2"
              >
                Close it
              </button>
            </div>
          )}

          {/* Context bar: back to categories + where you are */}
          {(searching || activeCategory !== null) && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
              <button
                onClick={() => { setSearch(''); setActiveCategory(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-semibold text-ink-soft hover:border-primary hover:text-primary transition-colors"
              >
                <ArrowLeft size={14} />
                Categories
              </button>
              <span className="text-sm font-bold text-ink truncate">
                {searching ? `Results for “${search.trim()}”` : categoryTitle}
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {!searching && activeCategory === null ? (
              <CategoryGrid
                categories={categories}
                counts={categoryCounts}
                uncategorizedCount={uncategorizedCount}
                totalCount={totalCount}
                onSelect={setActiveCategory}
              />
            ) : (
              <ProductGrid products={products} loading={loading} onAdd={addItem} />
            )}
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

        {!dayOpen && (dayClosed || openPromptDismissed) && (
          <DayLockedOverlay
            dayClosed={dayClosed}
            onOpen={dayClosed ? undefined : () => setOpenPromptDismissed(false)}
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
      {activeModal === 'expense' && (
        <ExpenseModal
          expenseDate={dayOpen ? session.session_date : manilaDate()}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'closeDay' && (
        <CloseDayModal onClose={() => setActiveModal(null)} onDone={() => { setActiveModal(null); router.refresh() }} />
      )}
      {receiptId && <Receipt invoiceId={receiptId} onClose={() => setReceiptId(null)} />}
      {navOpen && <PosNavDrawer onClose={() => setNavOpen(false)} />}

      {!dayOpen && !dayClosed && !openPromptDismissed && (
        <OpenDayModal
          onDone={() => router.refresh()}
          onDismiss={() => setOpenPromptDismissed(true)}
        />
      )}
    </div>
  )
}

// Covers the product grid + cart (not the top bar) while sales are locked —
// either because today's day is already closed for good, or because the
// cashier chose "I'll open the day later". dayClosed gets no action button
// since there's nothing to do until the date rolls over; the dismissed case
// gets a button that brings the OpenDayModal back.
function DayLockedOverlay({
  dayClosed,
  onOpen,
}: {
  dayClosed: boolean
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
              Today&apos;s books are already closed and can&apos;t be reopened. Sales are locked until tomorrow.
            </p>
          </>
        ) : (
          <>
            <h3 className="font-bold text-ink">Day not started</h3>
            <p className="text-sm text-ink-faint">
              You chose to open the day later. Sales are locked until you open it.
            </p>
            <button
              onClick={onOpen}
              className="mt-1 rounded-xl bg-primary text-white font-bold px-5 py-2.5 text-sm"
            >
              Open the day
            </button>
          </>
        )}
      </div>
    </div>
  )
}

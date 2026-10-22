'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPeso, formatDate } from '@/lib/utils/currency'
import { manilaDate } from '@/lib/utils/date'
import { toast } from 'sonner'
import { Search, TrendingUp, TrendingDown, AlertTriangle, ArrowRight, Check, Undo2 } from 'lucide-react'

interface ChangeRow {
  id: string
  product_id: string | null
  product_name: string
  volume: string | null
  old_cost: number
  new_cost: number
  old_price: number
  new_price: number
  changed_at: string
  reviewed_at: string | null
  // the database rows this displayed row stands for (several when older
  // same-day rows are merged); reviewing marks all of them
  ids?: string[]
  products: { price: number; cost: number; name: string } | null
  product_categories: { name: string } | null
}

type Filter = 'all' | 'review' | 'reviewed' | 'cost_up' | 'cost_down'

function daysAgo(n: number): string {
  return manilaDate(new Date(Date.now() - n * 86_400_000))
}

// Keep the product's old markup on the new cost, rounded UP to the whole peso.
function suggestedPrice(r: ChangeRow): number | null {
  if (r.old_cost <= 0 || r.old_price <= 0 || r.new_cost <= 0) return null
  return Math.ceil(r.new_cost * (r.old_price / r.old_cost))
}

function analyse(r: ChangeRow) {
  const costDelta = r.new_cost - r.old_cost
  const priceDelta = r.new_price - r.old_price
  const now = r.products
  const costPct = r.old_cost > 0 ? (costDelta / r.old_cost) * 100 : null
  const marginNow = now ? now.price - now.cost : null
  const marginPctNow = now && now.price > 0 ? ((now.price - now.cost) / now.price) * 100 : null
  // Cost went up, the price didn't move with it, and it still hasn't been
  // raised since. Deleted products can't be reviewed, so they're excluded.
  const flagged = costDelta > 0 && priceDelta <= 0 && !!now && now.price <= r.new_price
  const atLoss = !!now && now.price > 0 && now.price <= now.cost
  // Someone checked it and decided the price is fine: no more warning.
  const reviewed = !!r.reviewed_at && (flagged || atLoss)
  const needsReview = flagged && !reviewed
  return { costDelta, priceDelta, costPct, marginNow, marginPctNow, needsReview, atLoss, reviewed }
}

export default function PriceChangesPage() {
  const [rows, setRows] = useState<ChangeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo] = useState(manilaDate())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      // Dates are Manila days, so give the database the +08:00 offset —
      // a bare "T00:00:00" would be read as UTC and shift the range 8 hours.
      const { data, error } = await supabase
        .from('product_price_changes')
        .select('*, products(price, cost, name), product_categories(name)')
        .gte('changed_at', `${dateFrom}T00:00:00+08:00`)
        .lte('changed_at', `${dateTo}T23:59:59.999+08:00`)
        .order('changed_at', { ascending: false })
        .limit(1000)
      if (cancelled) return
      if (error) setError(error.message)
      else {
        setError(null)
        setRows((data ?? []) as ChangeRow[])
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [dateFrom, dateTo])

  // One row per product per Manila day: the database already merges edits
  // made on the same day, and this also folds any older duplicates together.
  // A day that ends where it started (old = new) isn't a change, so it's hidden.
  const merged = useMemo(() => {
    const byKey = new Map<string, ChangeRow>()
    // rows arrive newest first; walk oldest first so "old" = start of day
    for (const r of [...rows].reverse()) {
      const key = `${r.product_id ?? r.product_name}|${manilaDate(new Date(r.changed_at))}`
      const prev = byKey.get(key)
      byKey.set(key, prev
        ? {
            ...r,
            old_cost: prev.old_cost,
            old_price: prev.old_price,
            ids: [...(prev.ids ?? [prev.id]), r.id],
            // reviewed only if every underlying row was
            reviewed_at: prev.reviewed_at && r.reviewed_at ? r.reviewed_at : null,
          }
        : { ...r, ids: [r.id] })
    }
    return [...byKey.values()]
      .filter(r => r.old_cost !== r.new_cost || r.old_price !== r.new_price)
      .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
  }, [rows])

  const analysed = useMemo(() => merged.map(r => ({ r, a: analyse(r) })), [merged])

  const counts = useMemo(() => ({
    all: analysed.length,
    review: analysed.filter(x => x.a.needsReview).length,
    reviewed: analysed.filter(x => x.a.reviewed).length,
    cost_up: analysed.filter(x => x.a.costDelta > 0).length,
    cost_down: analysed.filter(x => x.a.costDelta < 0).length,
  }), [analysed])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return analysed.filter(({ r, a }) => {
      if (q && !r.product_name.toLowerCase().includes(q)) return false
      if (filter === 'review') return a.needsReview
      if (filter === 'reviewed') return a.reviewed
      if (filter === 'cost_up') return a.costDelta > 0
      if (filter === 'cost_down') return a.costDelta < 0
      return true
    })
  }, [analysed, search, filter])

  // Mark (or un-mark) a flagged change as checked. Updated on screen right
  // away; put back if the save fails.
  async function setReviewed(row: ChangeRow, reviewed: boolean) {
    const ids = row.ids ?? [row.id]
    const stamp = reviewed ? new Date().toISOString() : null
    const before = rows
    setRows(rs => rs.map(r => (ids.includes(r.id) ? { ...r, reviewed_at: stamp } : r)))
    const supabase = createClient()
    const { error } = await supabase.from('product_price_changes').update({ reviewed_at: stamp }).in('id', ids)
    if (error) {
      setRows(before)
      toast.error(`Couldn't save: ${error.message}`)
    } else {
      toast.success(reviewed ? `${row.product_name} marked as reviewed` : 'Review undone')
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">Price changes</h1>
        <p className="text-xs text-ink-faint mt-0.5">
          Changes to a product&apos;s cost or selling price — from editing, bulk edit or an import. One row per product per day, showing where it started and where it ended up.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} label="All changes" count={counts.all} />
        <Chip active={filter === 'review'} onClick={() => setFilter('review')} label="Needs a price review" count={counts.review} tone="warning" />
        <Chip active={filter === 'reviewed'} onClick={() => setFilter('reviewed')} label="Reviewed" count={counts.reviewed} />
        <Chip active={filter === 'cost_up'} onClick={() => setFilter('cost_up')} label="Cost went up" count={counts.cost_up} />
        <Chip active={filter === 'cost_down'} onClick={() => setFilter('cost_down')} label="Cost went down" count={counts.cost_down} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product…"
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-faint">
          From
          <input type="date" value={dateFrom} max={dateTo} onChange={e => { setLoading(true); setDateFrom(e.target.value) }} className="bg-surface border border-border rounded-xl px-3 py-2 text-sm text-ink" />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-faint">
          To
          <input type="date" value={dateTo} min={dateFrom} onChange={e => { setLoading(true); setDateTo(e.target.value) }} className="bg-surface border border-border rounded-xl px-3 py-2 text-sm text-ink" />
        </label>
      </div>

      <div className="bg-surface rounded-2xl border border-border overflow-x-auto">
        {loading ? (
          <div className="py-10 text-center text-sm text-ink-faint">Loading…</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-danger">Couldn&apos;t load price changes: {error}</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-faint">
            {merged.length === 0 ? 'No cost or price changes in this period.' : 'Nothing matches this filter.'}
          </div>
        ) : (
          <table className="w-full text-left min-w-[760px]">
            <thead className="bg-surface-sunken">
              <tr>
                <Th>Date</Th>
                <Th>Product</Th>
                <Th>Cost</Th>
                <Th>Selling price</Th>
                <Th>Now</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map(({ r, a }) => {
                const suggestion = a.needsReview ? suggestedPrice(r) : null
                return (
                  <tr key={r.id} className={a.needsReview ? 'bg-warning-soft/40' : undefined}>
                    <td className="px-4 py-3 text-xs text-ink-soft tabular whitespace-nowrap">{formatDate(r.changed_at, true)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-ink">{r.product_name}</p>
                      <p className="text-xs text-ink-faint">
                        {r.product_categories?.name ?? 'Uncategorized'}{r.volume ? ` · ${r.volume}` : ''}
                        {!r.products && ' · deleted'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Delta from={r.old_cost} to={r.new_cost} pct={a.costPct} upIsBad />
                    </td>
                    <td className="px-4 py-3">
                      <Delta from={r.old_price} to={r.new_price} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-soft tabular whitespace-nowrap">
                      {r.products ? (
                        <>
                          <span className="font-semibold text-ink">{formatPeso(r.products.price)}</span>
                          {a.marginNow !== null && (
                            <span className={a.atLoss ? 'text-danger' : ''}>
                              {' '}· margin {formatPeso(a.marginNow)}
                              {a.marginPctNow !== null && ` (${a.marginPctNow.toFixed(0)}%)`}
                            </span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.reviewed ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary-dark whitespace-nowrap">
                            <Check size={11} /> Reviewed
                          </span>
                          <button onClick={() => setReviewed(r, false)} className="inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink">
                            <Undo2 size={11} /> Undo
                          </button>
                        </div>
                      ) : a.atLoss || a.needsReview ? (
                        <div className="flex flex-col items-end gap-1">
                          {a.atLoss ? <Badge tone="danger">Selling at a loss</Badge> : <Badge tone="warning">Raise price?</Badge>}
                          {!a.atLoss && suggestion !== null && suggestion > (r.products?.price ?? 0) && (
                            <span className="text-[11px] text-ink-faint whitespace-nowrap">
                              same margin ≈ {formatPeso(suggestion)}
                            </span>
                          )}
                          <button
                            onClick={() => setReviewed(r, true)}
                            title="I've checked this — the price is fine as it is"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline whitespace-nowrap"
                          >
                            <Check size={11} /> Mark as reviewed
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {rows.length === 1000 && (
        <p className="text-xs text-ink-faint mt-2">Showing the latest 1000 changes — narrow the dates to see older ones.</p>
      )}
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">{children}</th>
}

function Chip({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone?: 'warning' }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active
          ? 'bg-primary text-white border-primary'
          : tone === 'warning' && count > 0
            ? 'bg-warning-soft text-warning border-warning/30 hover:border-warning'
            : 'bg-surface text-ink-soft border-border hover:border-primary'
      }`}
    >
      {tone === 'warning' && <AlertTriangle size={12} />}
      {label}
      <span className={`tabular ${active ? 'text-white/80' : 'text-ink-faint'}`}>{count}</span>
    </button>
  )
}

function Badge({ tone, children }: { tone: 'warning' | 'danger'; children: React.ReactNode }) {
  return (
    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
      tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
    }`}>
      {children}
    </span>
  )
}

// old → new, with an arrow and % change. For cost, going up is the bad
// direction (shown in red/warning); for price it's shown neutrally.
function Delta({ from, to, pct, upIsBad }: { from: number; to: number; pct?: number | null; upIsBad?: boolean }) {
  if (from === to) return <span className="text-sm text-ink-faint tabular">{formatPeso(to)}</span>
  const up = to > from
  const color = upIsBad ? (up ? 'text-danger' : 'text-primary') : 'text-ink'
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <div className="flex items-center gap-1.5 text-sm tabular whitespace-nowrap">
      <span className="text-ink-faint">{formatPeso(from)}</span>
      <ArrowRight size={12} className="text-ink-faint" />
      <span className={`font-semibold ${color}`}>{formatPeso(to)}</span>
      <Icon size={13} className={color} />
      {pct != null && <span className={`text-xs ${color}`}>{pct > 0 ? '+' : ''}{pct.toFixed(0)}%</span>}
    </div>
  )
}

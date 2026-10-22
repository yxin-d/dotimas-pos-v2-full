'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPeso, formatDate } from '@/lib/utils/currency'
import { manilaDate } from '@/lib/utils/date'
import { Search, TrendingUp, TrendingDown, AlertTriangle, ArrowRight } from 'lucide-react'

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
  products: { price: number; cost: number; name: string } | null
  product_categories: { name: string } | null
}

type Filter = 'all' | 'review' | 'cost_up' | 'cost_down'

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
  const needsReview = costDelta > 0 && priceDelta <= 0 && !!now && now.price <= r.new_price
  const atLoss = !!now && now.price > 0 && now.price <= now.cost
  return { costDelta, priceDelta, costPct, marginNow, marginPctNow, needsReview, atLoss }
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

  const analysed = useMemo(() => rows.map(r => ({ r, a: analyse(r) })), [rows])

  const counts = useMemo(() => ({
    all: analysed.length,
    review: analysed.filter(x => x.a.needsReview).length,
    cost_up: analysed.filter(x => x.a.costDelta > 0).length,
    cost_down: analysed.filter(x => x.a.costDelta < 0).length,
  }), [analysed])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return analysed.filter(({ r, a }) => {
      if (q && !r.product_name.toLowerCase().includes(q)) return false
      if (filter === 'review') return a.needsReview
      if (filter === 'cost_up') return a.costDelta > 0
      if (filter === 'cost_down') return a.costDelta < 0
      return true
    })
  }, [analysed, search, filter])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">Price changes</h1>
        <p className="text-xs text-ink-faint mt-0.5">
          Every change to a product&apos;s cost or selling price — from editing, bulk edit or an import.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} label="All changes" count={counts.all} />
        <Chip active={filter === 'review'} onClick={() => setFilter('review')} label="Needs a price review" count={counts.review} tone="warning" />
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
            {rows.length === 0 ? 'No cost or price changes in this period.' : 'Nothing matches this filter.'}
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
                      {a.atLoss ? (
                        <Badge tone="danger">Selling at a loss</Badge>
                      ) : a.needsReview ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge tone="warning">Raise price?</Badge>
                          {suggestion !== null && suggestion > (r.products?.price ?? 0) && (
                            <span className="text-[11px] text-ink-faint whitespace-nowrap">
                              same margin ≈ {formatPeso(suggestion)}
                            </span>
                          )}
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

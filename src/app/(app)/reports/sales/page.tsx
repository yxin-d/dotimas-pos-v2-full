'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPeso, formatDate, todayPH } from '@/lib/utils/currency'
import { Search, ChevronDown, ChevronUp, Receipt } from 'lucide-react'

interface InvoiceRow {
  id: string
  created_at: string
  total_amount: number
  amount_received: number
  change: number
  payment_method: string
  is_credit: boolean
  customers: { name: string } | null
  sales: { subtotal: number; category_name: string | null }[] | null
}

type Kind = 'all' | 'meals' | 'store'

// Meals = lines from the Meals category; Store = everything else (including
// custom items). A sale with both is split line by line.
const isMeal = (category: string | null) => category?.toLowerCase() === 'meals'

function splitOf(inv: InvoiceRow) {
  let meals = 0
  let store = 0
  for (const l of inv.sales ?? []) {
    if (isMeal(l.category_name)) meals += Number(l.subtotal)
    else store += Number(l.subtotal)
  }
  return { meals, store }
}

interface SaleLine {
  id: string
  product_name: string
  qty: number
  unit_price: number
  subtotal: number
}

export default function SalesPage() {
  const [invoices, setInvoices]     = useState<InvoiceRow[]>([])
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [lines, setLines]           = useState<Record<string, SaleLine[]>>({})
  const [loading, setLoading]       = useState(true)
  const [dateFrom, setDateFrom]     = useState(todayPH())
  const [dateTo, setDateTo]         = useState(todayPH())
  const [search, setSearch]         = useState('')
  const [kind, setKind]             = useState<Kind>('all')
  const [clientReady, setClientReady] = useState(false) // 👈 new state
  const supabaseRef = useRef<any>(null)

  // ── Initialize Supabase client ──────────────────────────
  useEffect(() => {
    supabaseRef.current = createClient()
    setClientReady(true)
  }, [])

  // ── Fetch invoices ──────────────────────────────────────
  useEffect(() => {
    if (!clientReady) return

    const fetchInvoices = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabaseRef.current
          .from('sale_invoice')
          .select('*, customers(name), sales(subtotal, category_name)')
          .gte('created_at', `${dateFrom}T00:00:00+08:00`)
          .lte('created_at', `${dateTo}T23:59:59.999+08:00`)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Invoice fetch error:', error.message)
          // Optionally toast error
        } else {
          setInvoices((data ?? []) as InvoiceRow[])
        }
      } catch (err) {
        console.error('Invoice fetch exception:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchInvoices()
  }, [dateFrom, dateTo, clientReady])

  // ── Toggle expand + fetch line items ────────────────────
  async function toggleExpand(invoiceId: string) {
    if (expanded === invoiceId) {
      setExpanded(null)
      return
    }
    setExpanded(invoiceId)

    // Only fetch if we haven't already
    if (!lines[invoiceId] && clientReady) {
      try {
        const { data, error } = await supabaseRef.current
          .from('sales')
          .select('*')
          .eq('invoice_id', invoiceId)

        if (!error && data) {
          setLines(prev => ({ ...prev, [invoiceId]: data ?? [] }))
        }
      } catch (err) {
        console.error('Failed to fetch line items:', err)
      }
    }
  }

  // Client-side filter by customer name or invoice ID
  const searched = search.trim()
    ? invoices.filter(i =>
        i.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
        i.id.toLowerCase().includes(search.toLowerCase())
      )
    : invoices

  const splits = new Map(searched.map(i => [i.id, splitOf(i)]))
  const mealsTotal = searched.reduce((s, i) => s + splits.get(i.id)!.meals, 0)
  const storeTotal = searched.reduce((s, i) => s + splits.get(i.id)!.store, 0)

  // Meals / Store filter: sales that include at least one line of that kind
  const filtered = kind === 'all'
    ? searched
    : searched.filter(i => splits.get(i.id)![kind] > 0)

  const totalSales  = kind === 'meals' ? mealsTotal
                    : kind === 'store' ? storeTotal
                    : filtered.reduce((s, i) => s + i.total_amount, 0)
  const creditCount = filtered.filter(i => i.is_credit).length

  return (
    <div className="p-6 max-w-5xl mx-auto">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink">Sales history</h1>
          <p className="text-xs text-ink-faint mt-0.5">
            {filtered.length} invoices · {formatPeso(totalSales)} {kind === 'all' ? 'total' : kind === 'meals' ? 'from meals' : 'from store items'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-ink-soft">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm text-ink bg-surface
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-ink-soft">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm text-ink bg-surface
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <div className="flex rounded-xl border border-border bg-surface p-0.5">
          {(['all', 'meals', 'store'] as Kind[]).map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                kind === k ? 'bg-primary text-white' : 'text-ink-soft hover:bg-surface-sunken'
              }`}
            >
              {k === 'all' ? 'All' : k === 'meals' ? 'Meals' : 'Store'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input type="text" placeholder="Search customer or invoice ID…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-xl text-sm bg-surface
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
      </div>

      {/* Summary chips */}
      {!loading && (
        <div className="flex flex-wrap gap-3 mb-5">
          <Chip label="Total sales" value={formatPeso(mealsTotal + storeTotal)} />
          <Chip label="Meals" value={formatPeso(mealsTotal)} highlight={kind === 'meals'} />
          <Chip label="Store items" value={formatPeso(storeTotal)} highlight={kind === 'store'} />
          <Chip label="Transactions" value={String(filtered.length)} />
          {creditCount > 0 && <Chip label="On credit" value={String(creditCount)} accent />}
        </div>
      )}

      {/* Invoice list */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-ink-faint">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Receipt size={28} className="mx-auto text-ink-faint/40 mb-2" />
            <p className="text-sm text-ink-faint">No sales for this period</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(inv => (
              <div key={inv.id}>
                {/* Invoice row */}
                <button
                  onClick={() => toggleExpand(inv.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-sunken/60 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs tabular font-mono text-ink-faint">
                        #{inv.id.slice(0, 8).toUpperCase()}
                      </span>
                      <KindTag split={splits.get(inv.id)!} />
                      {inv.is_credit && (
                        <span className="text-[0.625rem] font-bold bg-gold-soft text-gold px-1.5 py-0.5 rounded-full">
                          UTANG
                        </span>
                      )}
                      <span className={`text-[0.625rem] font-semibold px-1.5 py-0.5 rounded-full uppercase
                        ${inv.payment_method === 'cash' ? 'bg-surface-sunken text-ink-soft' :
                          inv.payment_method === 'gcash' ? 'bg-primary-soft text-primary' :
                          'bg-surface-sunken text-ink-soft'}`}
                      >
                        {inv.payment_method}
                      </span>
                    </div>
                    <p className="text-xs text-ink-faint">
                      {formatDate(inv.created_at, true)}
                      {inv.customers?.name && ` · ${inv.customers.name}`}
                    </p>
                  </div>
                  <span className="tabular font-bold text-ink text-sm shrink-0">
                    {formatPeso(inv.total_amount)}
                  </span>
                  {expanded === inv.id ? <ChevronUp size={14} className="text-ink-faint shrink-0" /> : <ChevronDown size={14} className="text-ink-faint shrink-0" />}
                </button>

                {/* Expanded line items */}
                {expanded === inv.id && (
                  <div className="px-5 pb-3 bg-surface-sunken/40 border-t border-border">
                    <div className="pt-3 space-y-1">
                      {(lines[inv.id] ?? []).map(line => (
                        <div key={line.id} className="flex justify-between text-sm">
                          <span className="text-ink-soft">{line.product_name} × {line.qty}</span>
                          <span className="tabular text-ink">{formatPeso(line.subtotal)}</span>
                        </div>
                      ))}
                      {!lines[inv.id] && (
                        <p className="text-xs text-ink-faint">Loading items…</p>
                      )}
                    </div>
                    {!inv.is_credit && (
                      <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs text-ink-faint">
                        <span>Received: {formatPeso(inv.amount_received)} · Change: {formatPeso(inv.change)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function KindTag({ split }: { split: { meals: number; store: number } }) {
  if (split.meals > 0 && split.store > 0) {
    return (
      <span className="text-[0.625rem] font-bold bg-surface-sunken text-ink-soft px-1.5 py-0.5 rounded-full">
        MEALS {formatPeso(split.meals)} + STORE {formatPeso(split.store)}
      </span>
    )
  }
  if (split.meals > 0) {
    return <span className="text-[0.625rem] font-bold bg-primary-soft text-primary px-1.5 py-0.5 rounded-full">MEALS</span>
  }
  return null
}

function Chip({ label, value, accent, highlight }: { label: string; value: string; accent?: boolean; highlight?: boolean }) {
  return (
    <div className={`px-3 py-2 rounded-xl border text-sm ${
      accent ? 'bg-gold-soft border-gold/20' : highlight ? 'bg-primary-soft border-primary/30' : 'bg-surface border-border'
    }`}>
      <span className="text-ink-faint text-xs">{label} </span>
      <span className={`font-bold tabular ${accent ? 'text-gold' : 'text-ink'}`}>{value}</span>
    </div>
  )
}
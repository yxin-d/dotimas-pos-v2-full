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
          .select('*, customers(name)')
          .gte('created_at', `${dateFrom}T00:00:00`)
          .lte('created_at', `${dateTo}T23:59:59`)
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
  const filtered = search.trim()
    ? invoices.filter(i =>
        i.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
        i.id.toLowerCase().includes(search.toLowerCase())
      )
    : invoices

  const totalSales  = filtered.reduce((s, i) => s + i.total_amount, 0)
  const creditCount = filtered.filter(i => i.is_credit).length

  return (
    <div className="p-6 max-w-5xl mx-auto">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink">Sales history</h1>
          <p className="text-xs text-ink-faint mt-0.5">{filtered.length} invoices · {formatPeso(totalSales)} total</p>
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
        <div className="flex gap-3 mb-5">
          <Chip label="Total sales" value={formatPeso(totalSales)} />
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
                      {inv.is_credit && (
                        <span className="text-[10px] font-bold bg-gold-soft text-gold px-1.5 py-0.5 rounded-full">
                          UTANG
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase
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

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`px-3 py-2 rounded-xl border text-sm ${accent ? 'bg-gold-soft border-gold/20' : 'bg-surface border-border'}`}>
      <span className="text-ink-faint text-xs">{label} </span>
      <span className={`font-bold tabular ${accent ? 'text-gold' : 'text-ink'}`}>{value}</span>
    </div>
  )
}
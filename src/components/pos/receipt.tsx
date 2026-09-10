'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPeso, formatDate } from '@/lib/utils/currency'
import { Printer, X } from 'lucide-react'
import type { SaleInvoice, SaleLine, InvoicePayment } from '@/types/database'

interface Props {
  invoiceId: string
  onClose: () => void
}

interface ReceiptData {
  invoice: SaleInvoice & { customers: { name: string } | null; staff: { name: string } | null }
  lines: SaleLine[]
  payments: InvoicePayment[]
}

export default function Receipt({ invoiceId, onClose }: Props) {
  const [data, setData] = useState<ReceiptData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [invoiceRes, linesRes, paymentsRes] = await Promise.all([
        supabase.from('sale_invoice').select('*, customers(name), staff(name)').eq('id', invoiceId).single(),
        supabase.from('sales').select('*').eq('invoice_id', invoiceId),
        supabase.from('invoice_payments').select('*').eq('invoice_id', invoiceId),
      ])
      if (invoiceRes.data && linesRes.data) {
        setData({
          invoice: invoiceRes.data as ReceiptData['invoice'],
          lines: linesRes.data,
          payments: paymentsRes.data ?? [],
        })
      }
      setLoading(false)
    }
    load()
  }, [invoiceId])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
        <div className="bg-surface rounded-2xl p-8 text-sm text-ink-faint">Loading receipt…</div>
      </div>
    )
  }

  if (!data) return null

  const { invoice, lines, payments } = data
  const receiptNo = invoiceId.slice(0, 8).toUpperCase()

  return (
    <>
      <div data-print-hide className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm">
        <div className="bg-surface rounded-2xl shadow-xl w-full max-w-xs mx-4 overflow-hidden">
          <div data-print-hide className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-ink">Sale complete</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-sunken hover:bg-border rounded-lg text-xs font-medium text-ink-soft transition-colors"
              >
                <Printer size={13} />
                Print
              </button>
              <button onClick={onClose} className="text-ink-faint hover:text-ink">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="px-4 py-4 max-h-[70vh] overflow-y-auto">
            <ReceiptContent invoice={invoice} lines={lines} payments={payments} receiptNo={receiptNo} />
          </div>
        </div>
      </div>

      <div data-print-receipt style={{ display: 'none' }}>
        <ReceiptContent invoice={invoice} lines={lines} payments={payments} receiptNo={receiptNo} />
      </div>
    </>
  )
}

function ReceiptContent({ invoice, lines, payments, receiptNo }: {
  invoice: ReceiptData['invoice']
  lines: SaleLine[]
  payments: InvoicePayment[]
  receiptNo: string
}) {
  return (
    <div style={{ fontFamily: "'Courier New', monospace", fontSize: '12px', lineHeight: '1.5', color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <p style={{ fontWeight: 'bold', fontSize: '14px' }}>DOTIMAS STORE</p>
        <p style={{ color: '#555' }}>Cauringan, Sison, Pangasinan</p>
        <p style={{ color: '#555' }}>0954-099-6331</p>
      </div>

      <p style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ color: '#555' }}>No:</span>
        <span style={{ fontWeight: 'bold' }}>{receiptNo}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ color: '#555' }}>Date:</span>
        <span>{formatDate(invoice.created_at, true)}</span>
      </div>
      {invoice.staff?.name && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span style={{ color: '#555' }}>Served by:</span>
          <span>{invoice.staff.name}</span>
        </div>
      )}
      {invoice.customers?.name && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span style={{ color: '#555' }}>Customer:</span>
          <span>{invoice.customers.name}</span>
        </div>
      )}

      <p style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

      {lines.map(line => (
        <div key={line.id} style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ flex: 1, overflow: 'hidden', paddingRight: '4px' }}>{line.product_name}</span>
            <span style={{ whiteSpace: 'nowrap' }}>{formatPeso(line.subtotal)}</span>
          </div>
          <div style={{ color: '#777', paddingLeft: '4px' }}>
            {line.qty} × {formatPeso(line.unit_price)}
          </div>
        </div>
      ))}

      <p style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '2px' }}>
        <span>TOTAL</span>
        <span>{formatPeso(invoice.total_amount)}</span>
      </div>

      {invoice.is_credit ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8a6200' }}>
          <span>CREDIT (utang)</span>
          <span>{formatPeso(invoice.total_amount)}</span>
        </div>
      ) : (
        <>
          {payments.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', color: '#555' }}>
              <span>{p.method.toUpperCase()}</span>
              <span>{formatPeso(p.amount)}</span>
            </div>
          ))}
          {invoice.change > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555' }}>
              <span>Change</span>
              <span>{formatPeso(invoice.change)}</span>
            </div>
          )}
        </>
      )}

      <p style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

      <p style={{ textAlign: 'center', color: '#555', fontSize: '10px' }}>
        {invoice.is_credit ? 'Credited to account. Thank you!' : 'Thank you! Come again!'}
      </p>
      <p style={{ textAlign: 'center', color: '#777', fontSize: '10px', marginTop: '2px' }}>
        Payment: {(invoice.payment_method ?? 'cash').toUpperCase()}
      </p>
    </div>
  )
}

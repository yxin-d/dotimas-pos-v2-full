// Customer credit statement — a copy of a customer's ledger to hand over or
// send them. Two formats:
//   * printStatement: opens a self-contained A4 page and the print dialog
//     ("Save as PDF" works there too). It's a separate window on purpose, so
//     it isn't affected by the app's receipt-printer (80mm) print styles.
//   * downloadStatementXlsx: an Excel file of the same rows.

import { formatPeso, formatDate, todayPH } from '@/lib/utils/currency'

export interface StatementCustomer {
  name: string
  phone: string | null
  credit_balance: number
}

export interface StatementEntry {
  entry_type: string
  amount: number
  running_balance: number
  description: string | null
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  credit_given: 'Credit (utang)',
  payment_made: 'Payment',
  opening_balance: 'Opening balance',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** Oldest first, the way a statement reads. */
function chronological(entries: StatementEntry[]): StatementEntry[] {
  return [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

function fileSafe(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'customer'
}

export function printStatement(customer: StatementCustomer, entries: StatementEntry[], storeName: string): boolean {
  const rows = chronological(entries)
  const totalCredit = rows.filter(r => r.entry_type !== 'payment_made').reduce((s, r) => s + r.amount, 0)
  const totalPaid = rows.filter(r => r.entry_type === 'payment_made').reduce((s, r) => s + r.amount, 0)

  const body = rows.length === 0
    ? `<tr><td colspan="5" class="empty">No transactions yet.</td></tr>`
    : rows.map(r => `
        <tr>
          <td>${escapeHtml(formatDate(r.created_at, true))}</td>
          <td>${escapeHtml(TYPE_LABEL[r.entry_type] ?? r.entry_type)}</td>
          <td class="num ${r.entry_type === 'payment_made' ? 'paid' : 'owed'}">${r.entry_type === 'payment_made' ? '−' : '+'}${escapeHtml(formatPeso(r.amount))}</td>
          <td class="num">${escapeHtml(formatPeso(r.running_balance))}</td>
          <td>${escapeHtml(r.description ?? '')}</td>
        </tr>`).join('')

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<title>Statement — ${escapeHtml(customer.name)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0; }
  .muted { color: #666; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B6B57; padding-bottom: 12px; margin-bottom: 16px; }
  .summary { display: flex; gap: 24px; margin-bottom: 16px; }
  .summary div { border: 1px solid #ddd; border-radius: 8px; padding: 8px 12px; }
  .summary b { display: block; font-size: 15px; margin-top: 2px; }
  .balance b { color: #A97328; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #666; border-bottom: 1px solid #ccc; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.num { text-align: right; }
  .paid { color: #0B6B57; }
  .owed { color: #A97328; }
  .empty { text-align: center; color: #888; padding: 24px; }
  footer { margin-top: 24px; font-size: 10px; color: #888; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(storeName)}</h1>
      <div class="muted">Customer credit statement</div>
    </div>
    <div style="text-align:right">
      <div><b>${escapeHtml(customer.name)}</b></div>
      ${customer.phone ? `<div class="muted">${escapeHtml(customer.phone)}</div>` : ''}
      <div class="muted">As of ${escapeHtml(formatDate(new Date().toISOString(), true))}</div>
    </div>
  </header>
  <div class="summary">
    <div>Total credit<b>${escapeHtml(formatPeso(totalCredit))}</b></div>
    <div>Total paid<b>${escapeHtml(formatPeso(totalPaid))}</b></div>
    <div class="balance">Balance due<b>${escapeHtml(formatPeso(customer.credit_balance))}</b></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th class="num">Amount</th><th class="num">Balance after</th><th>Note</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <footer>Please check this statement and let us know if anything looks wrong.</footer>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) return false // pop-up blocked
  win.document.open()
  win.document.write(html)
  win.document.close()
  return true
}

export async function downloadStatementXlsx(customer: StatementCustomer, entries: StatementEntry[], storeName: string) {
  const XLSX = await import('xlsx')
  const rows = chronological(entries)
  const aoa: (string | number)[][] = [
    [storeName],
    ['Customer credit statement'],
    ['Customer', customer.name],
    ['Phone', customer.phone ?? ''],
    ['As of', formatDate(new Date().toISOString(), true)],
    ['Balance due', customer.credit_balance],
    [],
    ['Date', 'Type', 'Amount', 'Balance after', 'Note'],
    ...rows.map(r => [
      formatDate(r.created_at, true),
      TYPE_LABEL[r.entry_type] ?? r.entry_type,
      r.entry_type === 'payment_made' ? -r.amount : r.amount,
      r.running_balance,
      r.description ?? '',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 36 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Statement')
  XLSX.writeFile(wb, `statement-${fileSafe(customer.name)}-${todayPH()}.xlsx`)
}

'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPeso, formatDate, todayPH } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { Smartphone, Plus, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { GcashLogEntry, GcashDirection } from '@/types/database'

export default function GcashPage() {
  const [entries, setEntries]     = useState<GcashLogEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [filterDate, setFilterDate] = useState(todayPH())
  const supabaseRef = useRef<any>(null)

  useEffect(() => {
    supabaseRef.current = createClient()
  }, []);

  async function fetchEntries() {
    const { data } = await supabaseRef.current
      .from('gcash_log')
      .select('*')
      .eq('txn_date', filterDate)
      .order('created_at', { ascending: false })
    setEntries(data ?? [])
    setLoading(false)
  }

  useEffect(() => { setLoading(true); fetchEntries() }, [filterDate])

  const totalReceived = entries.filter(e => e.direction === 'received').reduce((s, e) => s + e.amount, 0)
  const totalSent     = entries.filter(e => e.direction === 'sent').reduce((s, e) => s + e.amount, 0)
  const net           = totalReceived - totalSent

  return (
    <div className="p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2">
            <Smartphone size={20} className="text-primary" />
            GCash Tracker
          </h1>
          <p className="text-xs text-ink-faint mt-0.5">Manual record of GCash transactions</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold
            hover:bg-primary-dark transition-colors"
        >
          <Plus size={15} />
          Add entry
        </button>
      </div>

      {/* Date filter */}
      <input
        type="date"
        value={filterDate}
        onChange={e => setFilterDate(e.target.value)}
        className="mb-4 border border-border rounded-xl px-3.5 py-2 text-sm text-ink bg-surface
          focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <SummaryCard
          label="Received" value={formatPeso(totalReceived)}
          icon={<ArrowDownLeft size={14} className="text-success" />} color="success"
        />
        <SummaryCard
          label="Sent" value={formatPeso(totalSent)}
          icon={<ArrowUpRight size={14} className="text-danger" />} color="danger"
        />
        <SummaryCard
          label="Net" value={formatPeso(net)}
          icon={<Smartphone size={14} className={net >= 0 ? 'text-primary' : 'text-danger'} />}
          color={net >= 0 ? 'primary' : 'danger'}
        />
      </div>

      {/* Entries list */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-ink-faint">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-faint">No entries for this date</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Sender / Receiver</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Ref #</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide text-right">Amount</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map(entry => (
                <tr key={entry.id} className="hover:bg-surface-sunken/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full
                      ${entry.direction === 'received'
                        ? 'bg-success-soft text-success'
                        : 'bg-danger-soft text-danger'
                      }`}
                    >
                      {entry.direction === 'received'
                        ? <ArrowDownLeft size={11} />
                        : <ArrowUpRight size={11} />
                      }
                      {entry.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink">{entry.sender || '—'}</td>
                  <td className="px-4 py-3 text-sm tabular text-ink-soft">{entry.ref_number || '—'}</td>
                  <td className="px-4 py-3 text-sm tabular font-semibold text-right
                    ${entry.direction === 'received' ? 'text-success' : 'text-danger'}">
                    {entry.direction === 'sent' ? '-' : '+'}{formatPeso(entry.amount)}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(entry.created_at, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add entry modal */}
      {showForm && (
        <AddGcashModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchEntries() }}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, icon, color }: {
  label: string; value: string; icon: React.ReactNode; color: string
}) {
  const bg: Record<string, string> = {
    success: 'bg-success-soft', danger: 'bg-danger-soft', primary: 'bg-primary-soft'
  }
  return (
    <div className="bg-surface border border-border rounded-xl p-3.5">
      <div className={`w-6 h-6 ${bg[color]} rounded-lg flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-sm font-bold tabular text-ink">{value}</p>
      <p className="text-xs text-ink-faint mt-0.5">{label}</p>
    </div>
  )
}

function AddGcashModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    direction: 'received' as GcashDirection,
    amount: '',
    sender: '',
    ref_number: '',
    notes: '',
    txn_date: todayPH(),
  })
  const [saving, setSaving] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSave() {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)

    const supabase = createClient()
    const { error } = await supabase.from('gcash_log').insert({
      direction:  form.direction,
      amount,
      sender:     form.sender.trim() || null,
      ref_number: form.ref_number.trim() || null,
      notes:      form.notes.trim() || null,
      txn_date:   form.txn_date,
    })

    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Entry saved')
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-ink text-sm">Add GCash entry</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Direction */}
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['received', 'sent'] as GcashDirection[]).map(d => (
                <button
                  key={d}
                  onClick={() => setForm(prev => ({ ...prev, direction: d }))}
                  className={`py-2.5 rounded-xl text-sm font-semibold border capitalize transition-colors
                    ${form.direction === d
                      ? d === 'received'
                        ? 'bg-success text-white border-success'
                        : 'bg-danger text-white border-danger'
                      : 'bg-surface border-border text-ink-soft hover:border-primary/40'
                    }`}
                >
                  {d === 'received' ? '↙ Received' : '↗ Sent'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">Amount (₱)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">₱</span>
              <input type="number" name="amount" min={0} step="0.01" placeholder="0.00"
                value={form.amount} onChange={handleChange} autoFocus
                className="w-full pl-8 pr-4 py-2.5 border border-border rounded-xl text-sm tabular
                  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">
              {form.direction === 'received' ? 'Sender name' : 'Recipient name'}
            </label>
            <input type="text" name="sender" placeholder="e.g. Maria Santos"
              value={form.sender} onChange={handleChange}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm
                placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">Reference number</label>
            <input type="text" name="ref_number" placeholder="GCash ref #"
              value={form.ref_number} onChange={handleChange}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm tabular
                placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">Date</label>
            <input type="date" name="txn_date" value={form.txn_date} onChange={handleChange}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-primary text-white py-2.5 rounded-xl text-sm font-semibold
              hover:bg-primary-dark active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
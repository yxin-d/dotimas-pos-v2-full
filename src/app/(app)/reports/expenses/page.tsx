'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPeso, formatDate } from '@/lib/utils/currency'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Calendar,
  Filter,
} from 'lucide-react'

type ExpenseCategory =
  | 'supplies'
  | 'utilities'
  | 'salary'
  | 'maintenance'
  | 'food'
  | 'other'

interface Expense {
  id: string
  description: string
  category: ExpenseCategory
  amount: number
  expense_date: string
  notes: string | null
  created_at: string
}

const categoryLabels: Record<ExpenseCategory, string> = {
  supplies: 'Supplies',
  utilities: 'Utilities',
  salary: 'Salary',
  maintenance: 'Maintenance',
  food: 'Food',
  other: 'Other',
}

const categoryColors: Record<ExpenseCategory, string> = {
  supplies: 'bg-blue-100 text-blue-800',
  utilities: 'bg-yellow-100 text-yellow-800',
  salary: 'bg-green-100 text-green-800',
  maintenance: 'bg-orange-100 text-orange-800',
  food: 'bg-purple-100 text-purple-800',
  other: 'bg-gray-100 text-gray-800',
}

export default function ExpensesPage() {
  const supabaseRef = useRef<any>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Filters
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().setDate(1)).toISOString().slice(0, 10) // first day of current month
  )
  const [dateTo, setDateTo] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    description: '',
    category: 'other' as ExpenseCategory,
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  // ─── Initialize Supabase ──────────────────────────────────
  useEffect(() => {
    supabaseRef.current = createClient()
    fetchExpenses()
  }, [])

  // ─── Fetch expenses with filters ──────────────────────────
  const fetchExpenses = async () => {
    if (!supabaseRef.current) return
    setLoading(true)

    let query = supabaseRef.current
      .from('expenses')
      .select('*')
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
      .order('expense_date', { ascending: false })

    if (categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter)
    }

    const { data, error } = await query

    if (error) {
    toast.error('Failed to load expenses: ' + error.message)
    setLoading(false)
    return
    }

    setExpenses(data || [])
    const sum = (data || []).reduce((acc: number, e: Expense) => acc + e.amount, 0)
    setTotal(sum)
    setLoading(false)
  }

  // ─── Apply filters (trigger refetch) ──────────────────────
  useEffect(() => {
    if (supabaseRef.current) fetchExpenses()
  }, [dateFrom, dateTo, categoryFilter])

  // ─── Open modal for add/edit ──────────────────────────────
  const openModal = (expense?: Expense) => {
    if (expense) {
      setEditingId(expense.id)
      setFormData({
        description: expense.description,
        category: expense.category,
        amount: String(expense.amount),
        expense_date: expense.expense_date,
        notes: expense.notes || '',
      })
    } else {
      setEditingId(null)
      setFormData({
        description: '',
        category: 'other',
        amount: '',
        expense_date: new Date().toISOString().slice(0, 10),
        notes: '',
      })
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
  }

  // ─── Submit add/edit ──────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(formData.amount)
    if (!formData.description.trim() || isNaN(amount) || amount <= 0) {
      toast.error('Please fill in all required fields correctly')
      return
    }

    setSubmitting(true)
    const payload = {
      description: formData.description.trim(),
      category: formData.category,
      amount,
      expense_date: formData.expense_date,
      notes: formData.notes.trim() || null,
    }

    let error = null
    if (editingId) {
      const { error: updateError } = await supabaseRef.current
        .from('expenses')
        .update(payload)
        .eq('id', editingId)
      error = updateError
    } else {
      const { error: insertError } = await supabaseRef.current
        .from('expenses')
        .insert(payload)
      error = insertError
    }

    if (error) {
      toast.error('Failed to save expense: ' + error.message)
    } else {
      toast.success(editingId ? 'Expense updated' : 'Expense added')
      closeModal()
      fetchExpenses()
    }
    setSubmitting(false)
  }

  // ─── Delete expense ──────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    const { error } = await supabaseRef.current
      .from('expenses')
      .delete()
      .eq('id', id)
    if (error) {
      toast.error('Delete failed: ' + error.message)
    } else {
      toast.success('Expense deleted')
      fetchExpenses()
    }
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-ink">Expenses</h1>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors"
        >
          <Plus size={16} />
          Add expense
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-ink-faint" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-surface"
          />
          <span className="text-ink-faint text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-surface"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={16} className="text-ink-faint" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | 'all')}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-surface"
          >
            <option value="all">All categories</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1" />

        {/* Total summary */}
        <div className="bg-surface border border-border rounded-xl px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-ink-faint">Total:</span>
          <span className="text-lg font-bold text-ink tabular">
            {formatPeso(total)}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">
                  Date
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">
                  Description
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">
                  Category
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide text-right">
                  Amount
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">
                  Notes
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 bg-surface-sunken rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-faint">
                    No expenses found for this period.
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-surface-sunken/60 transition-colors">
                    <td className="px-4 py-3 text-sm tabular text-ink-soft">
                      {formatDate(exp.expense_date)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-ink">
                      {exp.description}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          categoryColors[exp.category]
                        }`}
                      >
                        {categoryLabels[exp.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm tabular font-semibold text-ink text-right">
                      {formatPeso(exp.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-faint max-w-xs truncate">
                      {exp.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openModal(exp)}
                          className="p-1.5 rounded hover:bg-surface-sunken text-ink-faint hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id)}
                          className="p-1.5 rounded hover:bg-surface-sunken text-ink-faint hover:text-danger transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add/Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-ink">
                {editingId ? 'Edit expense' : 'Add expense'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 rounded hover:bg-surface-sunken text-ink-faint hover:text-ink transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, description: e.target.value }))
                  }
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  placeholder="e.g., Electricity bill"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData((f) => ({
                      ...f,
                      category: e.target.value as ExpenseCategory,
                    }))
                  }
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">
                  Amount (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, amount: e.target.value }))
                  }
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={formData.expense_date}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, expense_date: e.target.value }))
                  }
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={2}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  placeholder="Any additional details..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 border border-border rounded-lg px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-sunken transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-primary text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {submitting
                    ? 'Saving...'
                    : editingId
                    ? 'Update expense'
                    : 'Add expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
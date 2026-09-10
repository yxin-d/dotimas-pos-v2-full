'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createCategory, updateCategory, deleteCategory } from './actions'
import type { ProductCategory } from '@/types/database'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('product_categories').select('*').order('sort_order').order('name')
    if (error) toast.error('Failed to load categories: ' + error.message)
    setCategories(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [])

  async function handleAdd() {
    if (!newName.trim()) return
    try {
      await createCategory(newName)
      setNewName('')
      toast.success('Category added')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add category')
    }
  }

  async function handleSaveEdit(id: string) {
    try {
      await updateCategory(id, editingName)
      setEditingId(null)
      toast.success('Category updated')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update category')
    }
  }

  async function handleDelete(cat: ProductCategory) {
    if (!confirm(`Delete "${cat.name}"? Products in this category will become uncategorized, not deleted.`)) return
    try {
      await deleteCategory(cat.id)
      toast.success('Category deleted')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete category')
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <Link href="/products" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-4 transition-colors">
        <ArrowLeft size={14} /> Back to products
      </Link>
      <h1 className="text-2xl font-bold text-ink mb-6">Categories</h1>

      <div className="flex gap-2 mb-6">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="New category name"
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus-visible:border-primary"
        />
        <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-xl bg-primary text-white font-semibold px-4 py-2.5 text-sm">
          <Plus size={15} /> Add
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-ink-faint">No categories yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between bg-surface border border-border rounded-xl px-4 py-2.5">
              {editingId === cat.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveEdit(cat.id)}
                  className="flex-1 bg-canvas border border-border rounded-lg px-2.5 py-1 text-sm mr-2"
                />
              ) : (
                <span className="text-sm font-medium text-ink">{cat.name}</span>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                {editingId === cat.id ? (
                  <>
                    <button onClick={() => handleSaveEdit(cat.id)} className="p-1.5 text-primary hover:bg-primary-soft rounded-lg"><Check size={15} /></button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-ink-faint hover:bg-surface-sunken rounded-lg"><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }} className="p-1.5 text-ink-faint hover:text-ink hover:bg-surface-sunken rounded-lg"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(cat)} className="p-1.5 text-ink-faint hover:text-danger hover:bg-danger-soft rounded-lg"><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

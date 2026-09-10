'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Input from '@/src/components/ui/input'
import Button from '@/src/components/ui/button'
import { toast } from 'sonner'
import { ArrowLeft, UserPlus } from 'lucide-react'
import Link from 'next/link'

interface FormState {
  name: string
  phone: string
  notes: string
}

export default function NewCustomerPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>({ name: '', phone: '', notes: '' })
  const [saving, setSaving] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)

    const supabase = createClient()
    const { error } = await supabase.from('customers').insert({
      name:  form.name.trim(),
      phone: form.phone.trim() || null,
    })

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    toast.success(`${form.name} added`)
    router.push('/customers')
    router.refresh()
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/customers"
          className="p-2 rounded-xl hover:bg-surface-sunken text-ink-faint hover:text-ink transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-ink">New customer</h1>
          <p className="text-xs text-ink-faint mt-0.5">Add a suki or regular customer</p>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
        <Input
          label="Full name *"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="e.g. Juan dela Cruz"
          autoFocus
        />
        <Input
          label="Phone number"
          name="phone"
          value={form.phone}
          onChange={handleChange}
          placeholder="09XX-XXX-XXXX"
          type="tel"
        />

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1.5">Notes</label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="e.g. Anak ni Mang Isko, usually pays on Friday…"
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint resize-none
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>

        <div className="pt-1 flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => router.push('/customers')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            <UserPlus size={15} />
            {saving ? 'Saving…' : 'Add customer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
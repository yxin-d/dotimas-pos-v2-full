'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatPeso } from '@/lib/utils/currency'
import type { Customer } from '@/types/database'
import { UserPlus, Search } from 'lucide-react'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const supabaseRef = useRef<any>(null);

  useEffect(() => {
    supabaseRef.current = createClient();
  }, []);

  // useEffect(() => {
  //   setLoading(true)
  //   const client = supabaseRef.current || createClient()
  //   let query = client.from('customers').select('*').order('name')
  //   if (search.trim()) query = query.ilike('name', `%${search}%`)
  //   query.then(({ data }) => { setCustomers(data ?? []); setLoading(false) })
  // }, [])

  useEffect(() => {
    async function fetchCustomers() {
      if (!supabaseRef.current) return;

      const [{ data: customersData }, { data: filteredCustomersData }] = await Promise.all([
        supabaseRef.current.from('customers').select('*').order('name'),
        supabaseRef.current.from('customers').select('*').ilike('name', `%${search}%`).order('name')
      ]);
      setCustomers(filteredCustomersData ?? customersData ?? []);
      setLoading(false);
    }
    fetchCustomers();
  }, [search]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink">Customers</h1>
          <p className="text-xs text-ink-faint mt-0.5">{customers.length} registered</p>
        </div>
        <Link
          href="/customers/new"
          className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold
            hover:bg-primary-dark transition-colors"
        >
          <UserPlus size={15} />
          Add customer
        </Link>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm
            focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-ink-faint">Loading…</div>
        ) : customers.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-faint">
            {search ? 'No customers match your search' : 'No customers yet'}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-5 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Name</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Phone</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide text-right">Credit</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.map(c => (
                <tr key={c.id} className="hover:bg-surface-sunken/60 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-ink">{c.name}</td>
                  <td className="px-5 py-3 text-sm text-ink-soft">{c.phone || '—'}</td>
                  <td className="px-5 py-3 text-right">
                    {c.credit_balance > 0 ? (
                      <span className="text-sm tabular font-semibold text-gold">{formatPeso(c.credit_balance)}</span>
                    ) : (
                      <span className="text-sm text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/customers/${c.id}/credit`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View credit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
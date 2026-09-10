'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatPeso, formatDate } from '@/lib/utils/currency';
import { toast } from 'sonner';
import Input from '@/src/components/ui/input';
import Button from '@/src/components/ui/button';
import { recordCreditChange } from '../../action';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  credit_balance: number;
}

interface LedgerRow {
  id: string;
  entry_type: string;
  amount: number;
  running_balance: number;
  description: string | null;
  created_at: string;
}

type Mode = 'payment_made' | 'credit_given';

export default function CustomerCreditPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [mode, setMode] = useState<Mode>('payment_made');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Fetch data ───────────────────────────────────────────
  async function fetchData() {
    if (!id) return;
    const supabase = createClient();

    const { data: cust } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();
    setCustomer(cust);

    const { data: entries } = await supabase
      .from('ledger')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false });
    if (entries) setLedger(entries);
  }

  // ── Trigger fetch when id changes ───────────────────────
  useEffect(() => {
    async function load() {
      if (!id) return;
      const supabase = createClient();

      const { data: cust } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
      setCustomer(cust);

      const { data: entries } = await supabase
        .from('ledger')
        .select('*')
        .eq('customer_id', id)
        .order('created_at', { ascending: false });
      if (entries) setLedger(entries);
    }
    load();
  }, [id]);

  // ── Handle payment / add-balance ────────────────────────
  // Routed through the record_credit_change RPC via a server action, same as
  // every other credit mutation in the app — this used to insert into
  // `ledger` directly with a client-computed running_balance, which never
  // actually updated customers.credit_balance, so "Outstanding credit" went
  // stale after every "payment". The RPC updates both atomically.
  const handleSubmit = async () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!id || Array.isArray(id)) return;

    setSaving(true);
    const { error } = await recordCreditChange(
      id,
      mode,
      value,
      note || (mode === 'payment_made' ? 'Payment received' : 'Credit added')
    );

    if (error) {
      toast.error(error);
    } else {
      toast.success(mode === 'payment_made' ? 'Payment recorded' : 'Balance added');
      setAmount('');
      setNote('');
      fetchData(); // refresh the list
    }
    setSaving(false);
  };

  if (!customer) {
    return <div className="p-8 text-sm text-ink-faint">Loading…</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-ink">{customer.name}</h1>
      <p className="text-sm text-ink-faint mt-1">
        Phone: {customer.phone || 'N/A'}
      </p>
      <p className="text-xl font-bold text-gold mt-2 tabular">
        Outstanding credit: {formatPeso(customer.credit_balance)}
      </p>

      {/* Payment / Add balance form */}
      <div className="bg-gold-soft border border-gold/20 p-4 rounded-2xl my-6">
        {/* Mode toggle */}
        <div className="flex gap-1.5 mb-3">
          <button
            onClick={() => setMode('payment_made')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              mode === 'payment_made'
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-soft border-border hover:border-primary'
            }`}
          >
            Record payment
          </button>
          <button
            onClick={() => setMode('credit_given')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              mode === 'credit_given'
                ? 'bg-gold text-white border-gold'
                : 'bg-surface text-ink-soft border-border hover:border-gold'
            }`}
          >
            Add balance
          </button>
        </div>
        <p className="text-xs text-ink-faint mb-3">
          {mode === 'payment_made'
            ? 'Customer paid down some or all of their outstanding credit.'
            : "Add to what the customer owes — for utang made outside the POS (e.g. logged after the fact)."}
        </p>

        <div className="flex flex-wrap gap-3 items-start">
          <div className="w-40">
            <Input
              type="number"
              placeholder={mode === 'payment_made' ? 'Amount paid' : 'Amount to add'}
              prefix="₱"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <Input
              type="text"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : mode === 'payment_made' ? 'Confirm payment' : 'Add balance'}
          </Button>
        </div>
      </div>

      {/* Ledger Table */}
      <h2 className="text-lg font-bold text-ink mb-3">Transaction history</h2>
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-sunken">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Amount</th>
              <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Balance after</th>
              <th className="px-4 py-3 text-xs font-semibold text-ink-soft uppercase tracking-wide">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ledger.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-faint">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              ledger.map((row) => (
                <tr key={row.id} className="hover:bg-surface-sunken/60 transition-colors">
                  <td className="px-4 py-3 text-sm text-ink-soft tabular">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3 text-sm capitalize text-ink">{row.entry_type.replace('_', ' ')}</td>
                  <td className={`px-4 py-3 text-sm font-medium tabular ${row.entry_type === 'payment_made' ? 'text-primary' : 'text-gold'}`}>
                    {formatPeso(row.amount)}
                  </td>
                  <td className="px-4 py-3 text-sm tabular text-ink">{formatPeso(row.running_balance)}</td>
                  <td className="px-4 py-3 text-sm text-ink-faint">{row.description || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
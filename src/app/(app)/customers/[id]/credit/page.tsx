'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatPeso, formatDate } from '@/lib/utils/currency';
import { toast } from 'sonner';
import Input from '@/src/components/ui/input';
import Button from '@/src/components/ui/button';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  loyalty_pts: number;
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

export default function CustomerCreditPage() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const supabaseRef = useRef<any>(null);
  const [clientReady, setClientReady] = useState(false);

  // ── Initialize Supabase client ──────────────────────────
  useEffect(() => {
    supabaseRef.current = createClient();
    setClientReady(true);
  }, []);

  // ── Fetch data ───────────────────────────────────────────
  const fetchData = async () => {
    // ✅ Guard: ensure client exists
    if (!supabaseRef.current) return;

    const { data: cust } = await supabaseRef.current
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();
    setCustomer(cust);

    const { data: entries } = await supabaseRef.current
      .from('ledger')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false });
    if (entries) setLedger(entries);
  };

  // ── Trigger fetch when id changes or client becomes ready ──
  useEffect(() => {
    if (id && clientReady) {
      fetchData();
    }
  }, [id, clientReady]);

  // ── Handle payment ───────────────────────────────────────
  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    // ✅ Guard: ensure client exists
    if (!supabaseRef.current) {
      toast.error('Client not ready');
      return;
    }

    setSaving(true);
    const currentBalance = customer?.credit_balance || 0;
    const newBalance = currentBalance - amount;

    const { error } = await supabaseRef.current.from('ledger').insert({
      customer_id: id,
      entry_type: 'payment_made',
      amount,
      running_balance: newBalance,
      description: note || 'Payment received',
    });

    if (error) {
      toast.error('Error recording payment: ' + error.message);
    } else {
      toast.success('Payment recorded');
      setPaymentAmount('');
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
        Phone: {customer.phone || 'N/A'} · Loyalty: {customer.loyalty_pts} pts
      </p>
      <p className="text-xl font-bold text-gold mt-2 tabular">
        Outstanding credit: {formatPeso(customer.credit_balance)}
      </p>

      {/* Payment Form */}
      <div className="bg-gold-soft border border-gold/20 p-4 rounded-2xl my-6">
        <h2 className="font-semibold text-ink mb-3">Record payment</h2>
        <div className="flex flex-wrap gap-3 items-start">
          <div className="w-40">
            <Input
              type="number"
              placeholder="Amount paid"
              prefix="₱"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
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
          <Button onClick={handlePayment} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm payment'}
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
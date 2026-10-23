'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatPeso, formatDate } from '@/lib/utils/currency';
import { printStatement, downloadStatementXlsx } from '@/lib/utils/statement';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Trash2, Printer, FileDown, Archive, RotateCcw } from 'lucide-react';
import Input from '@/src/components/ui/input';
import Button from '@/src/components/ui/button';
import Modal from '@/src/components/ui/modal';
import { recordCreditChange, updateCustomer, deleteCustomer, restoreCustomer } from '../../action';
import type { Customer } from '@/types/database';

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
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [storeName, setStoreName] = useState('Dotimas Store');
  const [mode, setMode] = useState<Mode>('payment_made');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editThreshold, setEditThreshold] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const archived = !!customer?.archived_at;
  const hasHistory = ledger.length > 0;

  // ── Fetch data ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!id) return;
    const supabase = createClient();
    const [{ data: cust }, { data: entries }, { data: setting }] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).maybeSingle(),
      supabase.from('ledger').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('app_settings').select('value').eq('key', 'store_name').maybeSingle(),
    ]);
    if (!cust) {
      setNotFound(true);
      return;
    }
    setCustomer(cust);
    setLedger(entries ?? []);
    if (typeof setting?.value === 'string' && setting.value.trim()) setStoreName(setting.value);
  }, [id]);

  useEffect(() => {
    async function load() {
      await fetchData();
    }
    load();
  }, [fetchData]);

  // ── Handle payment / add-balance ────────────────────────
  // Routed through the record_credit_change RPC via a server action, so the
  // balance and the ledger always update together.
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
      fetchData();
    }
    setSaving(false);
  };

  // ── Edit details ─────────────────────────────────────────
  function openEdit() {
    if (!customer) return;
    setEditName(customer.name);
    setEditPhone(customer.phone ?? '');
    setEditThreshold(customer.credit_warning_threshold?.toString() ?? '');
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!customer) return;
    const threshold = editThreshold.trim() === '' ? null : parseFloat(editThreshold);
    if (threshold !== null && (isNaN(threshold) || threshold < 0)) {
      toast.error('Credit limit must be a positive number, or leave it blank');
      return;
    }
    setEditSaving(true);
    const { error } = await updateCustomer(customer.id, {
      name: editName,
      phone: editPhone,
      credit_warning_threshold: threshold,
    });
    setEditSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Customer updated');
    setEditOpen(false);
    fetchData();
  }

  // ── Delete / archive / restore ───────────────────────────
  async function handleDelete() {
    if (!customer) return;
    setDeleting(true);
    const { result, error } = await deleteCustomer(customer.id);
    setDeleting(false);
    if (error) {
      toast.error(error);
      return;
    }
    setDeleteOpen(false);
    if (result === 'deleted') {
      toast.success(`${customer.name} deleted`);
      router.push('/customers');
    } else {
      toast.success(`${customer.name} archived — their history is kept`);
      fetchData();
    }
  }

  async function handleRestore() {
    if (!customer) return;
    const { error } = await restoreCustomer(customer.id);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`${customer.name} restored`);
    fetchData();
  }

  // ── Statement (copy for the customer) ────────────────────
  function handlePrint() {
    if (!customer) return;
    if (!printStatement(customer, ledger, storeName)) {
      toast.error('Your browser blocked the pop-up. Allow pop-ups for this site and try again.');
    }
  }

  async function handleDownload() {
    if (!customer) return;
    try {
      await downloadStatementXlsx(customer, ledger, storeName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the file');
    }
  }

  if (notFound) {
    return (
      <div className="p-8 text-sm text-ink-faint">
        This customer no longer exists. <Link href="/customers" className="text-primary hover:underline">Back to customers</Link>
      </div>
    );
  }

  if (!customer) {
    return <div className="p-8 text-sm text-ink-faint">Loading…</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-4 transition-colors">
        <ArrowLeft size={14} />
        Back to customers
      </Link>

      {archived && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-sunken px-4 py-3 mb-4 text-sm text-ink-soft">
          <Archive size={16} className="text-ink-faint shrink-0" />
          <span className="flex-1">
            Archived on {formatDate(customer.archived_at!)}. Hidden from the customer list and the POS; history is kept.
          </span>
          <Button size="sm" variant="secondary" onClick={handleRestore}>
            <RotateCcw size={13} /> Restore
          </Button>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">{customer.name}</h1>
          <p className="text-sm text-ink-faint mt-1">
            Phone: {customer.phone || 'N/A'}
            {customer.credit_warning_threshold != null && (
              <> · Credit limit warning at {formatPeso(customer.credit_warning_threshold)}</>
            )}
          </p>
          <p className="text-xl font-bold text-gold mt-2 tabular">
            Outstanding credit: {formatPeso(customer.credit_balance)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={handlePrint}>
            <Printer size={13} /> Print statement
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDownload}>
            <FileDown size={13} /> Excel
          </Button>
          <Button size="sm" variant="secondary" onClick={openEdit}>
            <Pencil size={13} /> Edit
          </Button>
          {!archived && (
            <Button size="sm" variant="ghost" onClick={() => setDeleteOpen(true)} className="text-danger hover:text-danger">
              <Trash2 size={13} /> {hasHistory ? 'Archive' : 'Delete'}
            </Button>
          )}
        </div>
      </div>

      {/* Payment / Add balance form */}
      <div className="bg-gold-soft border border-gold/20 p-4 rounded-2xl my-6">
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
            disabled={archived}
            title={archived ? 'Restore this customer before adding credit' : undefined}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={mode === 'payment_made' ? 'Amount paid' : 'Amount to add'}
              prefix="₱"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              onFocus={(e) => e.currentTarget.select()}
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

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => !editSaving && setEditOpen(false)} title="Edit customer">
        <div className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Name
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Phone
            <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Optional" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Credit limit warning
            <Input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              prefix="₱"
              value={editThreshold}
              onChange={(e) => setEditThreshold(e.target.value.replace(/[^0-9.]/g, ''))}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="Blank = use the default"
              className="tabular"
            />
          </label>
          <div className="flex gap-2 mt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete / archive confirm */}
      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title={hasHistory ? `Archive ${customer.name}?` : `Delete ${customer.name}?`}
      >
        <div className="p-5 flex flex-col gap-4">
          {customer.credit_balance !== 0 ? (
            <p className="text-sm text-ink-soft">
              {customer.name} still owes <span className="font-bold text-gold">{formatPeso(customer.credit_balance)}</span>.
              Record their payment first — a customer can&apos;t be removed while they have a balance.
            </p>
          ) : hasHistory ? (
            <p className="text-sm text-ink-soft">
              They have credit history, so they&apos;ll be <span className="font-semibold text-ink">archived</span> instead of
              deleted: hidden from the customer list and the POS, with their history kept. You can restore them any time
              from the Archived filter.
            </p>
          ) : (
            <p className="text-sm text-ink-soft">They have no history, so they&apos;ll be removed permanently.</p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleDelete}
              disabled={deleting || customer.credit_balance !== 0}
            >
              {deleting ? 'Working…' : hasHistory ? 'Archive' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

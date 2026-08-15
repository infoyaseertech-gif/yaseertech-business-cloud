'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ApiError, InvoiceDetail } from '@/lib/types';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { StatusBadge } from '@/components/StatusBadge';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [recordingPayment, setRecordingPayment] = useState(false);

  function load() {
    apiFetch<InvoiceDetail>(`/invoices/${id}`)
      .then(setInvoice)
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load this invoice.');
      });
  }

  useEffect(load, [id]);

  async function handleSend() {
    setActionError(null);
    setSending(true);
    try {
      const updated = await apiFetch<InvoiceDetail>(`/invoices/${id}/send`, { method: 'POST' });
      setInvoice(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not send invoice.');
    } finally {
      setSending(false);
    }
  }

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setRecordingPayment(true);
    try {
      const updated = await apiFetch<InvoiceDetail>(`/invoices/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amountNgn: Number(paymentAmount), method: paymentMethod }),
      });
      setInvoice(updated);
      setPaymentAmount('');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not record payment.');
    } finally {
      setRecordingPayment(false);
    }
  }

  if (loadError) {
    return (
      <div className="max-w-2xl">
        <ErrorBanner message={loadError} />
        <button onClick={() => router.push('/dashboard/invoices')} className="mt-4 text-sm text-indigo underline">
          Back to invoices
        </button>
      </div>
    );
  }

  if (!invoice) return null;

  const balanceDue = Number(invoice.total_ngn) - Number(invoice.amount_paid_ngn);
  const canRecordPayment = invoice.status === 'sent' || invoice.status === 'partially_paid';

  return (
    <div className="max-w-2xl">
      <Link href="/dashboard/invoices" className="text-sm text-indigo underline underline-offset-2">
        &larr; All invoices
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-ink-soft">{invoice.invoice_number}</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
            {invoice.customer_name}
          </h1>
        </div>
        <StatusBadge status={invoice.status} isOverdue={invoice.isOverdue} />
      </div>

      {actionError && (
        <div className="mt-4">
          <ErrorBanner message={actionError} />
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-white px-6 py-2">
        {invoice.items.map((item, i) => (
          <div key={i} className="ledger-row text-sm">
            <span className="text-ink">
              {item.description} &times; {item.quantity}
            </span>
            <span className="font-mono text-ink">
              &#8358;{Number(item.line_total_ngn).toLocaleString()}
            </span>
          </div>
        ))}
        <div className="ledger-row">
          <span className="font-medium text-ink">Total</span>
          <span className="font-mono font-semibold text-ink">
            &#8358;{Number(invoice.total_ngn).toLocaleString()}
          </span>
        </div>
        <div className="ledger-row">
          <span className="text-ink-soft text-sm">Paid so far</span>
          <span className="font-mono text-success">
            &#8358;{Number(invoice.amount_paid_ngn).toLocaleString()}
          </span>
        </div>
        {balanceDue > 0 && invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
          <div className="ledger-row">
            <span className="text-ink-soft text-sm">Balance due</span>
            <span className="font-mono text-danger font-medium">
              &#8358;{balanceDue.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {invoice.payments.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-mono uppercase tracking-wider text-ink-soft mb-2">
            Payment history
          </p>
          <div className="rounded-xl border border-border bg-white px-5 py-1">
            {invoice.payments.map((p, i) => (
              <div key={i} className="ledger-row text-sm">
                <span className="text-ink-soft">
                  {new Date(p.paid_at).toLocaleDateString('en-NG')} &middot; {p.method ?? 'unspecified'}
                </span>
                <span className="font-mono text-ink">&#8358;{Number(p.amount_ngn).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {invoice.status === 'draft' && (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-gold-100/30 px-5 py-4">
          <p className="text-sm text-ink-soft mb-3">
            This invoice is still a draft &mdash; no accounting entry has been posted yet.
            Sending it posts the revenue to your books.
          </p>
          <div className="w-40">
            <Button onClick={handleSend} loading={sending}>
              Send invoice
            </Button>
          </div>
        </div>
      )}

      {canRecordPayment && (
        <form
          onSubmit={handleRecordPayment}
          className="mt-6 rounded-xl border border-border bg-white p-5 flex items-end gap-3"
        >
          <div className="flex-1">
            <label className="block text-sm font-medium text-ink mb-1.5">Record a payment (₦)</label>
            <input
              type="number"
              min="0"
              step="any"
              required
              max={balanceDue}
              className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-ink"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Method</label>
            <select
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-ink"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          <div className="w-32">
            <Button type="submit" loading={recordingPayment}>
              Record
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

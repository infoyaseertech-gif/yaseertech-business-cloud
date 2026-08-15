'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ApiError, Branch, Customer, InvoiceListItem } from '@/lib/types';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { StatusBadge } from '@/components/StatusBadge';

interface DraftItem {
  description: string;
  quantity: string;
  unitPriceNgn: string;
}

const emptyItem: DraftItem = { description: '', quantity: '1', unitPriceNgn: '' };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [branchId, setBranchId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ ...emptyItem }]);

  const [newCustomerName, setNewCustomerName] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function loadAll() {
    Promise.all([
      apiFetch<InvoiceListItem[]>('/invoices'),
      apiFetch<Branch[]>('/branches'),
      apiFetch<Customer[]>('/customers'),
    ])
      .then(([invoiceList, branchList, customerList]) => {
        setInvoices(invoiceList);
        setBranches(branchList);
        setCustomers(customerList);
        const main = branchList.find((b) => b.is_main_branch) ?? branchList[0];
        if (main) setBranchId(main.id);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load invoices.');
      });
  }

  useEffect(loadAll, []);

  function updateItem(index: number, field: keyof DraftItem) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, [field]: e.target.value } : item)),
      );
    };
  }

  function addItemRow() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAddCustomer() {
    if (!newCustomerName.trim()) return;
    setAddingCustomer(true);
    try {
      const created = await apiFetch<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify({ fullName: newCustomerName.trim() }),
      });
      setCustomers((c) => [...c, created]);
      setCustomerId(created.id);
      setNewCustomerName('');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not add customer.');
    } finally {
      setAddingCustomer(false);
    }
  }

  const total = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPriceNgn) || 0),
    0,
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!customerId) {
      setFormError('Choose or add a customer first.');
      return;
    }
    const validItems = items.filter((i) => i.description && i.quantity && i.unitPriceNgn);
    if (validItems.length === 0) {
      setFormError('Add at least one line item.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          customerId,
          dueDate: new Date(dueDate).toISOString(),
          items: validItems.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            unitPriceNgn: Number(i.unitPriceNgn),
          })),
        }),
      });
      setItems([{ ...emptyItem }]);
      setDueDate('');
      setShowForm(false);
      loadAll();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create invoice.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">Invoices</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
            Bill your customers
          </h1>
        </div>
        <Button type="button" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New invoice'}
        </Button>
      </div>

      {loadError && (
        <div className="mt-6">
          <ErrorBanner message={loadError} />
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-border bg-white p-6 space-y-5">
          <ErrorBanner message={formError} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Customer</label>
              <select
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-ink"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select a customer&hellip;</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  placeholder="Or add a new customer by name"
                  className="flex-1 rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-ink"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleAddCustomer}
                  disabled={addingCustomer || !newCustomerName.trim()}
                  className="rounded-lg bg-indigo-100 px-3 py-1.5 text-sm text-indigo font-medium disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            <Field
              id="dueDate"
              label="Due date"
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {branches.length > 1 && (
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-ink mb-1.5">Branch</label>
              <select
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-ink"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-ink mb-2">Line items</label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Description"
                    className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink"
                    value={item.description}
                    onChange={updateItem(i, 'description')}
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Qty"
                    className="w-20 rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink"
                    value={item.quantity}
                    onChange={updateItem(i, 'quantity')}
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Unit price (₦)"
                    className="w-32 rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink"
                    value={item.unitPriceNgn}
                    onChange={updateItem(i, 'unitPriceNgn')}
                  />
                  <button
                    type="button"
                    onClick={() => removeItemRow(i)}
                    disabled={items.length === 1}
                    className="text-ink-soft hover:text-danger disabled:opacity-30 px-1"
                    aria-label="Remove line item"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItemRow}
              className="mt-2 text-sm text-indigo font-medium underline underline-offset-2"
            >
              + Add another line
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-ink-soft">
              Total: <span className="font-mono text-ink font-medium">&#8358;{total.toLocaleString()}</span>
            </span>
            <div className="w-40">
              <Button type="submit" loading={saving}>
                Save draft
              </Button>
            </div>
          </div>
        </form>
      )}

      <div className="mt-8 rounded-2xl border border-border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-indigo-100/40 text-left">
              <th className="px-5 py-3 font-medium text-ink-soft">Invoice</th>
              <th className="px-5 py-3 font-medium text-ink-soft">Customer</th>
              <th className="px-5 py-3 font-medium text-ink-soft">Due</th>
              <th className="px-5 py-3 font-medium text-ink-soft">Total</th>
              <th className="px-5 py-3 font-medium text-ink-soft">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-ink-soft text-sm">
                  No invoices yet.
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-dashed border-border last:border-none hover:bg-paper/60">
                <td className="px-5 py-3.5">
                  <Link
                    href={`/dashboard/invoices/${inv.id}`}
                    className="font-mono text-xs text-indigo underline underline-offset-2"
                  >
                    {inv.invoice_number}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-ink">{inv.customer_name}</td>
                <td className="px-5 py-3.5 text-ink-soft font-mono text-xs">
                  {new Date(inv.due_date).toLocaleDateString('en-NG')}
                </td>
                <td className="px-5 py-3.5 font-mono text-ink">
                  &#8358;{Number(inv.total_ngn).toLocaleString()}
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={inv.status} isOverdue={inv.isOverdue} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

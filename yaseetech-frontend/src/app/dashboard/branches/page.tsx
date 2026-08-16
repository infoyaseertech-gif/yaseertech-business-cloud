'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import { ApiError, Branch } from '@/lib/types';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<Branch[]>('/branches')
      .then(setBranches)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load branches.'));
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await apiFetch('/branches', {
        method: 'POST',
        body: JSON.stringify({ name, address: address || undefined, phone: phone || undefined }),
      });
      setName('');
      setAddress('');
      setPhone('');
      setShowForm(false);
      load();
    } catch (err) {
      // A Branch Manager (branches.manage_own only, not manage_all) will
      // get a real 403 here -- that's the RBAC guard working correctly,
      // matching the same pattern as the Team page's forbidden state.
      setFormError(err instanceof ApiError ? err.message : 'Could not create branch.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">Branches</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Your locations</h1>
        </div>
        <Button type="button" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add branch'}
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
          <Field id="branchName" label="Branch name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Field id="branchAddress" label="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Field id="branchPhone" label="Phone (optional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button type="submit" loading={saving}>
            Save branch
          </Button>
        </form>
      )}

      <div className="mt-8 rounded-2xl border border-border bg-white px-6 py-2">
        {branches.map((b) => (
          <div key={b.id} className="ledger-row">
            <div>
              <p className="text-ink font-medium">
                {b.name}
                {b.is_main_branch && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo">
                    Main
                  </span>
                )}
              </p>
              {b.address && <p className="text-xs text-ink-soft mt-0.5">{b.address}</p>}
            </div>
          </div>
        ))}
        {branches.length === 0 && (
          <p className="text-sm text-ink-soft py-6 text-center">No branches yet.</p>
        )}
      </div>
    </div>
  );
}

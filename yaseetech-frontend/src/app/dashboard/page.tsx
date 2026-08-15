'use client';

import { useAuth } from '@/lib/auth-context';

export default function DashboardOverviewPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">
        Overview
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        Welcome, {user.full_name.split(' ')[0]}
      </h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        This is your account, fetched from your own tenant only — the
        RLS + JWT pattern from Phase 3, proven end to end.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-white px-6 py-2">
        <div className="ledger-row">
          <span className="font-mono text-xs text-ink-soft">Full name</span>
          <span className="font-medium text-ink">{user.full_name}</span>
        </div>
        <div className="ledger-row">
          <span className="font-mono text-xs text-ink-soft">Email</span>
          <span className="text-ink">{user.email}</span>
        </div>
        <div className="ledger-row">
          <span className="font-mono text-xs text-ink-soft">Phone</span>
          <span className="text-ink">{user.phone ?? '—'}</span>
        </div>
        <div className="ledger-row">
          <span className="font-mono text-xs text-ink-soft">Status</span>
          <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
            {user.status}
          </span>
        </div>
        <div className="ledger-row">
          <span className="font-mono text-xs text-ink-soft">Role(s)</span>
          <span className="text-ink">
            {user.roles.map((r) => r.name).join(', ') || '—'}
          </span>
        </div>
        <div className="ledger-row">
          <span className="font-mono text-xs text-ink-soft">Member since</span>
          <span className="font-mono text-sm text-ink">
            {new Date(user.created_at).toLocaleDateString('en-NG', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-border bg-gold-100/30 px-5 py-4">
        <p className="text-sm text-ink-soft">
          Point of Sale, Inventory, and Invoicing land in Phase 4. This
          dashboard grows phase by phase, matching what the backend
          actually supports — nothing here is a placeholder for data
          that doesn&apos;t exist yet.
        </p>
      </div>
    </div>
  );
}

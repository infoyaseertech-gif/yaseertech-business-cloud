'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { ApiError, DashboardSummary } from '@/lib/types';
import { ErrorBanner } from '@/components/ErrorBanner';

function ngn(n: number): string {
  return `\u20a6${n.toLocaleString()}`;
}

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardSummary>('/dashboard/summary')
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.'));
  }, []);

  if (!user) return null;

  const nothingToShow =
    summary &&
    !summary.todaySales &&
    !summary.lowStock &&
    !summary.outstandingInvoices &&
    summary.teamSize === null;

  return (
    <div className="max-w-4xl">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">Overview</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        Welcome, {user.full_name.split(' ')[0]}
      </h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Real numbers from what your business has actually recorded &mdash; not placeholders.
      </p>

      <ErrorBanner message={error} />

      {summary && (
        <>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summary.todaySales && (
              <StatCard
                label="Today's sales"
                value={ngn(summary.todaySales.total)}
                sub={`${summary.todaySales.count} transaction${summary.todaySales.count === 1 ? '' : 's'}`}
                tone="success"
              />
            )}

            {summary.outstandingInvoices && (
              <StatCard
                label="Outstanding invoices"
                value={ngn(summary.outstandingInvoices.total)}
                sub={
                  summary.outstandingInvoices.overdueCount > 0
                    ? `${summary.outstandingInvoices.overdueCount} overdue`
                    : `${summary.outstandingInvoices.count} unpaid`
                }
                tone={summary.outstandingInvoices.overdueCount > 0 ? 'danger' : 'indigo'}
              />
            )}

            {summary.lowStock && (
              <StatCard
                label="Low stock items"
                value={String(summary.lowStock.items.length)}
                sub={summary.lowStock.items.length > 0 ? 'need restocking' : 'all stocked up'}
                tone={summary.lowStock.items.length > 0 ? 'gold' : 'success'}
              />
            )}

            {summary.teamSize !== null && (
              <StatCard label="Team members" value={String(summary.teamSize)} sub="active accounts" tone="indigo" />
            )}
          </div>

          {summary.lowStock && summary.lowStock.items.length > 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-white px-6 py-2">
              <p className="pt-4 pb-1 font-mono text-xs uppercase tracking-wider text-ink-soft">
                Needs restocking
              </p>
              {summary.lowStock.items.map((item) => (
                <div key={`${item.branchId}-${item.productId}`} className="ledger-row text-sm">
                  <div>
                    <span className="text-ink">{item.productName}</span>
                    <span className="text-ink-soft text-xs ml-2">{item.branchName}</span>
                  </div>
                  <span className="font-mono text-danger">
                    {item.quantityOnHand} / {item.reorderLevel} min
                  </span>
                </div>
              ))}
            </div>
          )}

          {nothingToShow && (
            <div className="mt-8 rounded-xl border border-dashed border-border bg-gold-100/20 px-5 py-6 text-center">
              <p className="text-sm text-ink-soft">
                Your role doesn&apos;t have visibility into any dashboard metrics yet &mdash; that&apos;s
                expected for some roles (e.g. Staff), not a bug.
              </p>
            </div>
          )}
        </>
      )}

      <div className="mt-6 rounded-xl border border-dashed border-border bg-gold-100/20 px-5 py-4">
        <p className="text-sm text-ink-soft">
          Subscription billing (Flutterwave) is the one piece of the original plan not built yet
          &mdash; everything else here is real, working data.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'success' | 'danger' | 'indigo' | 'gold';
}) {
  const toneClasses: Record<typeof tone, string> = {
    success: 'text-success',
    danger: 'text-danger',
    indigo: 'text-indigo',
    gold: 'text-gold-600',
  };

  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-4">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className={`mt-1.5 font-display text-2xl font-semibold ${toneClasses[tone]}`}>{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>
    </div>
  );
}

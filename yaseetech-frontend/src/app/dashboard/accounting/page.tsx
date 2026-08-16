'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ApiError, BalanceSheet, CashFlow, JournalEntry, ProfitAndLoss } from '@/lib/types';
import { ErrorBanner } from '@/components/ErrorBanner';

type Tab = 'pnl' | 'balance-sheet' | 'cash-flow' | 'journal';

function firstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function ngn(n: number): string {
  return `\u20a6${n.toLocaleString()}`;
}

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('pnl');

  return (
    <div className="max-w-3xl">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">Accounting</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Your books</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Every figure here is read directly from the journal entries POS and Invoicing already posted &mdash; nothing is entered manually.
      </p>

      <div className="mt-6 flex gap-1 border-b border-border">
        {(
          [
            ['pnl', 'Profit & Loss'],
            ['balance-sheet', 'Balance Sheet'],
            ['cash-flow', 'Cash Flow'],
            ['journal', 'Journal'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-indigo text-indigo' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'pnl' && <ProfitAndLossTab />}
        {tab === 'balance-sheet' && <BalanceSheetTab />}
        {tab === 'cash-flow' && <CashFlowTab />}
        {tab === 'journal' && <JournalTab />}
      </div>
    </div>
  );
}

function DateRangeControls({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <div className="flex gap-3 items-end mb-6">
      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">From</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-ink"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">To</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-ink"
        />
      </div>
    </div>
  );
}

function ProfitAndLossTab() {
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [data, setData] = useState<ProfitAndLoss | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ProfitAndLoss>(`/accounting/profit-and-loss?startDate=${startDate}&endDate=${endDate}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load report.'));
  }, [startDate, endDate]);

  return (
    <div>
      <DateRangeControls startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
      <ErrorBanner message={error} />
      {data && (
        <div className="rounded-2xl border border-border bg-white px-6 py-2">
          <p className="pt-4 pb-1 font-mono text-xs uppercase tracking-wider text-ink-soft">Revenue</p>
          {data.revenue.length === 0 && <p className="text-sm text-ink-soft py-2">No revenue in this period.</p>}
          {data.revenue.map((r) => (
            <div key={r.code} className="ledger-row text-sm">
              <span className="text-ink">{r.name}</span>
              <span className="font-mono text-ink">{ngn(r.amount)}</span>
            </div>
          ))}
          <div className="ledger-row">
            <span className="font-medium text-ink">Total revenue</span>
            <span className="font-mono font-medium text-success">{ngn(data.totalRevenue)}</span>
          </div>

          <p className="pt-4 pb-1 font-mono text-xs uppercase tracking-wider text-ink-soft">Expenses</p>
          {data.expenses.length === 0 && <p className="text-sm text-ink-soft py-2">No expenses in this period.</p>}
          {data.expenses.map((r) => (
            <div key={r.code} className="ledger-row text-sm">
              <span className="text-ink">{r.name}</span>
              <span className="font-mono text-ink">{ngn(r.amount)}</span>
            </div>
          ))}
          <div className="ledger-row">
            <span className="font-medium text-ink">Total expenses</span>
            <span className="font-mono font-medium text-danger">{ngn(data.totalExpenses)}</span>
          </div>

          <div className="ledger-row border-t-2 border-ink/10 mt-2">
            <span className="font-semibold text-ink">Net income</span>
            <span className={`font-mono font-semibold text-lg ${data.netIncome >= 0 ? 'text-success' : 'text-danger'}`}>
              {ngn(data.netIncome)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceSheetTab() {
  const [asOfDate, setAsOfDate] = useState(today());
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<BalanceSheet>(`/accounting/balance-sheet?asOfDate=${asOfDate}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load report.'));
  }, [asOfDate]);

  return (
    <div>
      <div className="mb-6">
        <label className="block text-xs font-medium text-ink-soft mb-1">As of</label>
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-ink"
        />
      </div>
      <ErrorBanner message={error} />
      {data && (
        <div className="rounded-2xl border border-border bg-white px-6 py-2">
          <p className="pt-4 pb-1 font-mono text-xs uppercase tracking-wider text-ink-soft">Assets</p>
          {data.assets.map((a) => (
            <div key={a.code} className="ledger-row text-sm">
              <span className="text-ink">{a.name}</span>
              <span className="font-mono text-ink">{ngn(a.balance)}</span>
            </div>
          ))}
          <div className="ledger-row">
            <span className="font-medium text-ink">Total assets</span>
            <span className="font-mono font-medium text-ink">{ngn(data.totalAssets)}</span>
          </div>

          <p className="pt-4 pb-1 font-mono text-xs uppercase tracking-wider text-ink-soft">Liabilities</p>
          {data.liabilities.length === 0 && <p className="text-sm text-ink-soft py-2">No liabilities recorded.</p>}
          {data.liabilities.map((l) => (
            <div key={l.code} className="ledger-row text-sm">
              <span className="text-ink">{l.name}</span>
              <span className="font-mono text-ink">{ngn(l.balance)}</span>
            </div>
          ))}
          <div className="ledger-row">
            <span className="font-medium text-ink">Total liabilities</span>
            <span className="font-mono font-medium text-ink">{ngn(data.totalLiabilities)}</span>
          </div>

          <p className="pt-4 pb-1 font-mono text-xs uppercase tracking-wider text-ink-soft">Equity</p>
          {data.equity.map((e) => (
            <div key={e.code} className="ledger-row text-sm">
              <span className="text-ink">{e.name}</span>
              <span className="font-mono text-ink">{ngn(e.balance)}</span>
            </div>
          ))}
          <div className="ledger-row border-t-2 border-ink/10 mt-2">
            <span className="font-semibold text-ink">Total liabilities + equity</span>
            <span className="font-mono font-semibold text-lg text-ink">
              {ngn(data.totalLiabilities + data.totalEquity)}
            </span>
          </div>

          {!data.isBalanced && (
            <div className="my-4 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
              Assets don&apos;t equal Liabilities + Equity. This should never happen given how the
              database enforces double-entry &mdash; if you see this, it&apos;s a real bug worth reporting immediately.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CashFlowTab() {
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [data, setData] = useState<CashFlow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CashFlow>(`/accounting/cash-flow?startDate=${startDate}&endDate=${endDate}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load report.'));
  }, [startDate, endDate]);

  const categoryLabels: Record<string, string> = {
    sale: 'POS sales',
    invoice: 'Invoice payments',
    manual: 'Manual entries',
  };

  return (
    <div>
      <DateRangeControls startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
      <ErrorBanner message={error} />
      <div className="mb-4 rounded-lg border border-dashed border-border bg-gold-100/20 px-4 py-3 text-xs text-ink-soft">
        This shows cash movement by source, not a full GAAP cash flow statement &mdash; simple and
        direct enough to answer &quot;where did cash come from and go this period.&quot;
      </div>
      {data && (
        <div className="rounded-2xl border border-border bg-white px-6 py-2">
          {data.byCategory.length === 0 && <p className="text-sm text-ink-soft py-6 text-center">No cash movement in this period.</p>}
          {data.byCategory.map((c) => (
            <div key={c.category} className="ledger-row text-sm">
              <span className="text-ink">{categoryLabels[c.category] ?? c.category}</span>
              <span className="font-mono text-ink">
                <span className="text-success">+{ngn(c.cashIn)}</span>
                {c.cashOut > 0 && <span className="text-danger ml-2">&minus;{ngn(c.cashOut)}</span>}
              </span>
            </div>
          ))}
          <div className="ledger-row border-t-2 border-ink/10 mt-2">
            <span className="font-semibold text-ink">Net cash movement</span>
            <span className={`font-mono font-semibold text-lg ${data.netCashMovement >= 0 ? 'text-success' : 'text-danger'}`}>
              {ngn(data.netCashMovement)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function JournalTab() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<JournalEntry[]>('/accounting/journal?limit=50')
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load journal.'));
  }, []);

  return (
    <div>
      <ErrorBanner message={error} />
      <div className="space-y-3">
        {entries?.length === 0 && <p className="text-sm text-ink-soft py-6 text-center">No journal entries yet.</p>}
        {entries?.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-border bg-white px-5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{entry.description}</span>
              <span className="font-mono text-xs text-ink-soft">
                {new Date(entry.entry_date).toLocaleDateString('en-NG')}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {entry.lines.map((line, i) => (
                <div key={i} className="flex justify-between text-xs font-mono">
                  <span className="text-ink-soft">{line.account}</span>
                  <span className="text-ink">
                    {Number(line.debit) > 0 ? `Dr ${ngn(Number(line.debit))}` : `Cr ${ngn(Number(line.credit))}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

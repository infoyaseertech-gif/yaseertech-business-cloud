const SAMPLE_LINES: { label: string; amount: string; tone: 'in' | 'out' }[] = [
  { label: 'Rice, 50kg bag', amount: '+₦48,000', tone: 'in' },
  { label: 'Vegetable Oil, 5L', amount: '+₦8,500', tone: 'in' },
  { label: 'Stock: rice, 50kg', amount: '\u201248 units', tone: 'out' },
  { label: 'Invoice INV-0142 paid', amount: '+₦120,000', tone: 'in' },
  { label: 'Supplier restock', amount: '\u2212₦210,000', tone: 'out' },
  { label: 'Budget Android Phone', amount: '+₦79,000', tone: 'in' },
];

// The design's signature element: a receipt/ledger tape, since that's
// literally what this product manages. Static (not live data -- Phase 3
// has no POS yet), but grounded in the same product vocabulary the app
// will show for real once Phase 4 ships.
export function LedgerTape() {
  return (
    <div className="ledger-tape-edge rounded-l-2xl bg-indigo px-8 py-10 text-paper h-full flex flex-col">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-100/70">
          Today&apos;s ledger
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold italic text-paper">
          Every sale,
          <br />
          every naira, tracked.
        </h1>
      </div>

      <div className="mt-10 flex-1 space-y-0">
        {SAMPLE_LINES.map((line, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between border-b border-dashed border-white/15 py-3 text-sm"
          >
            <span className="text-paper/80">{line.label}</span>
            <span
              className={`font-mono ${
                line.tone === 'in' ? 'text-gold-100' : 'text-paper/50'
              }`}
            >
              {line.amount}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-paper/50">
        YaseeTech Business Cloud &mdash; POS, inventory, invoicing and
        bookkeeping built for Nigerian SMEs.
      </p>
    </div>
  );
}

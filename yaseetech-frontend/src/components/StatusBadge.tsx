const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-ink-soft/10 text-ink-soft',
  sent: 'bg-indigo-100 text-indigo',
  partially_paid: 'bg-gold-100 text-gold-600',
  paid: 'bg-success/10 text-success',
  overdue: 'bg-danger/10 text-danger',
  cancelled: 'bg-ink-soft/10 text-ink-soft line-through',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export function StatusBadge({ status, isOverdue }: { status: string; isOverdue?: boolean }) {
  const effective = isOverdue && (status === 'sent' || status === 'partially_paid') ? 'overdue' : status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLES[effective] ?? 'bg-ink-soft/10 text-ink-soft'
      }`}
    >
      {STATUS_LABELS[effective] ?? effective}
    </span>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const AVAILABLE_NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/pos', label: 'Point of Sale' },
  { href: '/dashboard/inventory', label: 'Inventory' },
  { href: '/dashboard/invoices', label: 'Invoices' },
  { href: '/dashboard/team', label: 'Team' },
];

// Named and shown, not hidden -- so it's honest about product scope rather
// than implying a full app that isn't built yet. Each is tied to the phase
// that will implement it, matching the master build plan.
const COMING_SOON_NAV = [{ label: 'Accounting reports', phase: 'Phase 6' }];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 shrink-0 bg-indigo text-paper flex flex-col min-h-screen">
      <div className="px-6 py-6 border-b border-white/10">
        <p className="font-display text-lg font-semibold italic">YaseeTech</p>
        <p className="font-mono text-xs text-paper/50 mt-0.5">Business Cloud</p>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-0.5">
        {AVAILABLE_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? 'bg-white/10 text-paper font-medium' : 'text-paper/70 hover:bg-white/5 hover:text-paper'
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        <p className="px-3 pt-5 pb-1 font-mono text-[10px] uppercase tracking-wider text-paper/35">
          Coming soon
        </p>
        {COMING_SOON_NAV.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-paper/35 cursor-not-allowed"
            title={`Planned for ${item.phase}`}
          >
            <span>{item.label}</span>
            <span className="font-mono text-[10px]">{item.phase}</span>
          </div>
        ))}
      </nav>

      <div className="px-6 py-5 border-t border-white/10">
        <p className="text-sm font-medium truncate">{user?.full_name}</p>
        <p className="text-xs text-paper/50 truncate">{user?.email}</p>
        <button
          onClick={() => logout()}
          className="mt-3 text-sm text-gold-100 hover:text-gold underline underline-offset-2"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}

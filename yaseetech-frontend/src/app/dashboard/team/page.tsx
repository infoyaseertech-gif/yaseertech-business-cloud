'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ApiError, TeamMember } from '@/lib/types';

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TeamMember[]>('/users')
      .then(setTeam)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
        } else {
          setError(
            err instanceof ApiError ? err.message : 'Could not load the team list.',
          );
        }
      });
  }, []);

  return (
    <div className="max-w-3xl">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">Team</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        People on your account
      </h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Requires the <code className="font-mono text-xs">users.manage</code> permission
        &mdash; this page is the RBAC guard from Phase 3, exercised for real.
      </p>

      {forbidden && (
        <div className="mt-8 rounded-xl border border-border bg-white px-6 py-10 text-center">
          <p className="text-ink font-medium">You don&apos;t have access to this page.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Viewing the team list needs the <code className="font-mono text-xs">users.manage</code> permission,
            which your role doesn&apos;t currently have. This is the RBAC guard working correctly, not a bug.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-xl border border-danger/30 bg-danger/5 px-6 py-4 text-sm text-danger">
          {error}
        </div>
      )}

      {team && (
        <div className="mt-8 rounded-2xl border border-border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-indigo-100/40 text-left">
                <th className="px-5 py-3 font-medium text-ink-soft">Name</th>
                <th className="px-5 py-3 font-medium text-ink-soft">Email</th>
                <th className="px-5 py-3 font-medium text-ink-soft">Status</th>
                <th className="px-5 py-3 font-medium text-ink-soft">Joined</th>
              </tr>
            </thead>
            <tbody>
              {team.map((member) => (
                <tr key={member.id} className="border-b border-dashed border-border last:border-none">
                  <td className="px-5 py-3.5 text-ink font-medium">{member.full_name}</td>
                  <td className="px-5 py-3.5 text-ink-soft font-mono text-xs">{member.email}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                      {member.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-ink-soft font-mono text-xs">
                    {new Date(member.created_at).toLocaleDateString('en-NG')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

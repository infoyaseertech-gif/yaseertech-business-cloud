'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import { ApiError, AssignableRole, Branch, TeamMemberWithRole } from '@/lib/types';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

const ROLES: AssignableRole[] = ['Branch Manager', 'Accountant', 'Cashier', 'Staff'];
const BRANCH_SCOPED_ROLES = new Set<AssignableRole>(['Branch Manager', 'Cashier', 'Staff']);

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMemberWithRole[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AssignableRole>('Cashier');
  const [branchId, setBranchId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function loadTeam() {
    apiFetch<TeamMemberWithRole[]>('/users')
      .then(setTeam)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
        } else {
          setLoadError(err instanceof ApiError ? err.message : 'Could not load the team list.');
        }
      });
  }

  useEffect(() => {
    loadTeam();
    apiFetch<Branch[]>('/branches')
      .then((list) => {
        setBranches(list);
        const main = list.find((b) => b.is_main_branch) ?? list[0];
        if (main) setBranchId(main.id);
      })
      .catch(() => {
        // Branches load failure doesn't block the team list itself --
        // the invite form just won't have branch options populated.
      });
  }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (BRANCH_SCOPED_ROLES.has(role) && !branchId) {
      setFormError(`The "${role}" role needs a branch selected.`);
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
          branchId: role === 'Accountant' ? undefined : branchId,
        }),
      });
      setFullName('');
      setEmail('');
      setPassword('');
      setShowForm(false);
      loadTeam();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not add team member.');
    } finally {
      setSaving(false);
    }
  }

  function branchName(id: string | null): string {
    if (!id) return 'All branches';
    return branches.find((b) => b.id === id)?.name ?? '\u2014';
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">Team</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
            People on your account
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Requires the <code className="font-mono text-xs">users.manage</code> permission.
          </p>
        </div>
        {!forbidden && (
          <Button type="button" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Add team member'}
          </Button>
        )}
      </div>

      {forbidden && (
        <div className="mt-8 rounded-xl border border-border bg-white px-6 py-10 text-center">
          <p className="text-ink font-medium">You don&apos;t have access to this page.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Viewing the team list needs the <code className="font-mono text-xs">users.manage</code> permission,
            which your role doesn&apos;t currently have. This is the RBAC guard working correctly, not a bug.
          </p>
        </div>
      )}

      {loadError && (
        <div className="mt-6">
          <ErrorBanner message={loadError} />
        </div>
      )}

      {showForm && (
        <form onSubmit={handleInvite} className="mt-6 rounded-2xl border border-border bg-white p-6 space-y-5">
          <ErrorBanner message={formError} />
          <div className="rounded-lg border border-dashed border-border bg-gold-100/20 px-4 py-3 text-xs text-ink-soft">
            There&apos;s no email-invite system yet &mdash; set a password here and share it with
            your teammate directly. They can log in with it right away.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field id="fullName" label="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Field id="email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field
              id="password"
              label="Temporary password"
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Role</label>
              <select
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-ink"
                value={role}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {BRANCH_SCOPED_ROLES.has(role) && (
              <div>
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
            {role === 'Accountant' && (
              <div className="flex items-end pb-2.5">
                <p className="text-xs text-ink-soft">Accountants see all branches &mdash; no branch selection needed.</p>
              </div>
            )}
          </div>

          <Button type="submit" loading={saving}>
            Add to team
          </Button>
        </form>
      )}

      {team && (
        <div className="mt-8 rounded-2xl border border-border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-indigo-100/40 text-left">
                <th className="px-5 py-3 font-medium text-ink-soft">Name</th>
                <th className="px-5 py-3 font-medium text-ink-soft">Role</th>
                <th className="px-5 py-3 font-medium text-ink-soft">Branch</th>
                <th className="px-5 py-3 font-medium text-ink-soft">Status</th>
                <th className="px-5 py-3 font-medium text-ink-soft">Joined</th>
              </tr>
            </thead>
            <tbody>
              {team.map((member) => (
                <tr key={member.id} className="border-b border-dashed border-border last:border-none">
                  <td className="px-5 py-3.5">
                    <p className="text-ink font-medium">{member.full_name}</p>
                    <p className="text-xs text-ink-soft font-mono">{member.email}</p>
                  </td>
                  <td className="px-5 py-3.5 text-ink">{member.role_name ?? '\u2014'}</td>
                  <td className="px-5 py-3.5 text-ink-soft text-xs">{branchName(member.branch_id)}</td>
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

'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { setStoredTokens } from '@/lib/token-storage';
import { ApiError } from '@/lib/types';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function SettingsPage() {
  const { user, refetchProfile } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  if (!user) return null;

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    setSavingProfile(true);
    try {
      await apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, phone: phone || undefined }),
      });
      await refetchProfile();
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation don\u2019t match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    setSavingPassword(true);
    try {
      // The backend revokes every OTHER session's refresh token as part of
      // this change (a password change is exactly when you'd want a lost
      // device logged out) and issues a fresh pair for this one -- store
      // it immediately so this session keeps working without a re-login.
      const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>(
        '/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword }),
        },
      );
      setStoredTokens(tokens);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="max-w-xl">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">Settings</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Your account</h1>

      <form onSubmit={handleSaveProfile} className="mt-8 rounded-2xl border border-border bg-white p-6 space-y-5">
        <h2 className="font-display text-lg font-semibold text-ink">Profile</h2>
        <ErrorBanner message={profileError} />
        {profileSaved && (
          <p className="text-sm text-success">Profile updated.</p>
        )}

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Email</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full rounded-lg border border-border bg-paper px-3.5 py-2.5 text-ink-soft cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-ink-soft">Email can&apos;t be changed here.</p>
        </div>

        <Field
          id="fullName"
          label="Full name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Field
          id="phone"
          label="Phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <Button type="submit" loading={savingProfile}>
          Save profile
        </Button>
      </form>

      <form onSubmit={handleChangePassword} className="mt-6 rounded-2xl border border-border bg-white p-6 space-y-5">
        <h2 className="font-display text-lg font-semibold text-ink">Change password</h2>
        <ErrorBanner message={passwordError} />
        {passwordSaved && (
          <p className="text-sm text-success">
            Password changed. Any other devices you were logged in on have been signed out.
          </p>
        )}

        <Field
          id="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Field
          id="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Field
          id="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <Button type="submit" loading={savingPassword}>
          Change password
        </Button>
      </form>
    </div>
  );
}

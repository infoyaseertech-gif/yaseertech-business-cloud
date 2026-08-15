'use client';

import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/types';
import { LedgerTape } from '@/components/LedgerTape';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: '',
    ownerFullName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({
        businessName: form.businessName,
        ownerFullName: form.ownerFullName,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
      });
      router.push('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the server. Is the backend running?',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-stretch justify-center p-4 sm:p-8">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 rounded-2xl overflow-hidden shadow-sm border border-border">
        <div className="hidden md:block">
          <LedgerTape />
        </div>

        <div className="bg-white px-8 py-10 sm:px-12 flex flex-col justify-center">
          <h2 className="font-display text-2xl font-semibold text-ink">
            Set up your business
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            Creates your workspace and signs you in as the business owner.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <ErrorBanner message={error} />
            <Field
              id="businessName"
              label="Business name"
              required
              value={form.businessName}
              onChange={update('businessName')}
            />
            <Field
              id="ownerFullName"
              label="Your full name"
              required
              value={form.ownerFullName}
              onChange={update('ownerFullName')}
            />
            <Field
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={update('email')}
            />
            <Field
              id="phone"
              label="Phone (optional)"
              type="tel"
              value={form.phone}
              onChange={update('phone')}
            />
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={form.password}
              onChange={update('password')}
            />
            <Button type="submit" loading={loading}>
              Create workspace
            </Button>
          </form>

          <p className="mt-6 text-sm text-ink-soft">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-indigo underline underline-offset-2">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

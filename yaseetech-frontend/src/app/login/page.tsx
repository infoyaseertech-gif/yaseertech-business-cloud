'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/types';
import { LedgerTape } from '@/components/LedgerTape';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
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
          <h2 className="font-display text-2xl font-semibold text-ink">Welcome back</h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            Log in to your business dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <ErrorBanner message={error} />
            <Field
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" loading={loading}>
              Log in
            </Button>
          </form>

          <p className="mt-6 text-sm text-ink-soft">
            New to YaseeTech?{' '}
            <Link href="/register" className="font-medium text-indigo underline underline-offset-2">
              Register your business
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

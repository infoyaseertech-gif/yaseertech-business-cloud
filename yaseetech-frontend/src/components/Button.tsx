import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export function Button({ loading, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className="w-full rounded-lg bg-indigo px-4 py-2.5 font-medium text-paper transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? 'Please wait\u2026' : children}
    </button>
  );
}

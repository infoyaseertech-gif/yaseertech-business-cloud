import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Field({ label, error, id, ...rest }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink mb-1.5">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-ink placeholder:text-ink-soft/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus:border-indigo-500 transition-colors"
        {...rest}
      />
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

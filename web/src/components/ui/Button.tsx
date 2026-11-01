import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost';

const VARIANT: Record<Variant, string> = {
  primary:
    'btn-shine bg-accent text-white shadow-[0_12px_28px_-14px_rgba(27,94,32,0.9)] hover:bg-accent-strong hover:shadow-[0_18px_34px_-14px_rgba(27,94,32,0.95)]',
  gold: 'btn-shine bg-gold text-[#3A3113] shadow-[0_12px_28px_-14px_rgba(211,190,109,0.95)] hover:brightness-95 hover:shadow-[0_18px_34px_-14px_rgba(211,190,109,1)]',
  secondary: 'border border-line-strong bg-surface text-ink hover:border-mint hover:bg-surface-muted',
  ghost: 'text-accent hover:bg-accent-soft',
};

const base = 'btn inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50';

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button type="button" className={`${base} ${VARIANT[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = 'primary',
  className = '',
  children,
}: {
  to: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`${base} ${VARIANT[variant]} ${className}`}>
      {children}
    </Link>
  );
}

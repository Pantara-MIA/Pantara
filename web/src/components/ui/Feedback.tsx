import { CircleAlert, Info, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

/** Inline callout for context the reader must not miss (e.g. synthetic data). */
export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning';
  title?: string;
  children: ReactNode;
}) {
  const cls = tone === 'warning' ? 'border-gold/60 bg-gold-soft text-gold-ink' : 'border-line-strong bg-accent-soft text-accent-strong';
  const Icon = tone === 'warning' ? CircleAlert : Info;
  return (
    <div className={`flex gap-2.5 rounded-2xl border px-4 py-3 text-sm ${cls}`} role="note">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="anim-rise flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="anim-float grid h-14 w-14 place-items-center rounded-2xl bg-surface-muted">
        <Inbox className="h-7 w-7 text-ink-3" aria-hidden="true" />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="max-w-sm text-sm text-ink-2">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="anim-rise flex flex-col items-center justify-center gap-2 px-6 py-12 text-center" role="alert">
      <span className="anim-shake grid h-14 w-14 place-items-center rounded-2xl bg-critical-soft">
        <CircleAlert className="h-7 w-7 text-critical" aria-hidden="true" />
      </span>
      <p className="font-semibold text-ink">Data gagal dimuat</p>
      <p className="max-w-sm text-sm text-ink-2">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn mt-1 rounded-full border border-line-strong px-4 py-1.5 text-sm font-medium text-ink hover:border-mint hover:bg-surface-muted">
          Coba lagi
        </button>
      )}
    </div>
  );
}

/** Placeholder block for the very first load only; refetches keep the old frame dimmed. */
export function Placeholder({ className = 'h-40' }: { className?: string }) {
  return <div className={`shimmer rounded-2xl ${className}`} aria-hidden="true" />;
}

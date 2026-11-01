import type { ReactNode } from 'react';
import { SURFACE_IN_VIEW, useInView } from '../motion/hooks';

/**
 * White panel with a hairline border — the base container of the civic UI.
 * It fades in the first time it scrolls into view and glows under the pointer.
 */
export function Card({
  children,
  className = '',
  as: Tag = 'section',
  reveal = true,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
  /** Fade in on first view; off for cards that mount inside an animated parent. */
  reveal?: boolean;
}) {
  const { ref, inView } = useInView<HTMLElement>(SURFACE_IN_VIEW);
  const motion = reveal ? `reveal ${inView ? 'is-visible' : ''}` : '';
  return (
    <Tag
      ref={ref as never}
      className={`spotlight ${motion} rounded-2xl border border-line bg-surface shadow-[0_10px_30px_-24px_rgba(13,51,17,0.45)] hover:border-line-strong hover:shadow-[0_18px_40px_-28px_rgba(13,51,17,0.55)] ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-wrap items-start justify-between gap-3 px-5 pt-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

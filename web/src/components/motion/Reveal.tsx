import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { prefersReducedMotion, useInView } from './hooks';

type Dir = 'up' | 'left' | 'right' | 'scale';

/** Fades and slides its children in the first time they scroll into view. */
export function Reveal({
  children,
  dir = 'up',
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  dir?: Dir;
  /** Stagger in milliseconds. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const { ref, inView } = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref as never}
      data-dir={dir === 'up' ? undefined : dir}
      className={`reveal ${inView ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Counts from 0 to `to` once visible; `format` renders each frame. */
export function CountUp({ to, format = (v) => Math.round(v).toLocaleString('id-ID'), duration = 1100 }: { to: number; format?: (v: number) => string; duration?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const still = prefersReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView || still) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, to, duration, still]);

  return (
    <span ref={ref} className="tabular-nums">
      {format(still ? to : value)}
    </span>
  );
}

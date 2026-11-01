import { useEffect, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion, useInView } from './hooks';

interface Figure {
  prefix: string;
  value: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
}

// Indonesian-formatted figures only: "73,2", "Rp 157.650", "−4,8", "18,6%", "12 ton".
const FIGURE = /^(Rp\s?|[+\-−]|)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(\s?[^\d\s][^\d]{0,7})?$/;

function parseFigure(text: string): Figure | null {
  const m = FIGURE.exec(text.trim());
  if (!m) return null;
  const [, prefix, int, dec = '', suffix = ''] = m;
  const negative = prefix === '-' || prefix === '−';
  const value = Number(int.replace(/\./g, '') + (dec ? `.${dec}` : '')) * (negative ? -1 : 1);
  if (!Number.isFinite(value)) return null;
  return { prefix: negative ? '' : prefix, value, decimals: dec.length, grouped: int.includes('.') || int.length <= 3, suffix };
}

function render(f: Figure, v: number) {
  const body = Math.abs(v).toLocaleString('id-ID', { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals, useGrouping: f.grouped });
  const sign = v < 0 && Number(body.replace(/\./g, '').replace(',', '.')) !== 0 ? '−' : '';
  return `${sign}${f.prefix}${body}${f.suffix}`;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A formatted figure that counts up the first time it scrolls into view and
 * tweens to each new value afterwards. Text that is not a plain figure is
 * rendered unchanged; screen readers always get the final text.
 */
export function AnimatedFigure({ text }: { text: string }) {
  const fig = useMemo(() => parseFigure(text), [text]);
  const { ref, inView } = useInView<HTMLSpanElement>();
  const still = prefersReducedMotion();
  const [shown, setShown] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const current = useRef(0);
  const started = useRef(false);
  const target = fig?.value;

  useEffect(() => {
    if (target === undefined || !inView || still) return;
    const from = started.current ? current.current : 0;
    const duration = started.current ? 600 : 1000;
    started.current = true;
    if (from === target) return;
    const t0 = performance.now();
    let frame = 0;
    setMoving(true);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      current.current = from + (target - from) * ease(t);
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setMoving(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, inView, still]);

  if (!fig) return <>{text}</>;
  // Before the first count: zero. While tweening: the frame. At rest: the exact text.
  const display = still ? text : shown === null ? (fig.value === 0 ? text : render(fig, 0)) : moving ? render(fig, shown) : text;
  return (
    <span ref={ref}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className={moving ? 'tabular-nums' : undefined}>
        {display}
      </span>
    </span>
  );
}

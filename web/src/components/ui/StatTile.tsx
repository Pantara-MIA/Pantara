import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { SURFACE_IN_VIEW, useInView } from '../motion/hooks';
import { AnimatedFigure } from '../motion/AnimatedFigure';
import { InfoTip } from './InfoTip';
import { Verdict } from './Badge';
import type { VerdictTone } from './Badge';

export interface Delta {
  /** Signed change, already formatted by the caller (e.g. "+3,2 poin"). */
  text: string;
  direction: 'up' | 'down' | 'flat';
  /** Whether "up" is the good direction for this metric. */
  upIsGood: boolean;
  /** Named comparison period, e.g. "vs Juli 2026". */
  versus: string;
}

/** The next step a reader should take because of a figure. */
export function ActionLine({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-start gap-1.5 text-sm font-semibold text-ink">
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * Stat tile: label (+ ⓘ) · value + verdict · optional delta · optional hint/trend/action.
 * Values use proportional figures (no tabular-nums) per the figure contract.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  hint,
  trend,
  info,
  verdict,
  action,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: Delta;
  hint?: ReactNode;
  trend?: ReactNode;
  /** Short explanation behind an ⓘ next to the label. */
  info?: ReactNode;
  /** One-word judgement shown after the value: is this good or bad? */
  verdict?: { label: string; tone: VerdictTone };
  /** What to do about this figure. */
  action?: ReactNode;
  emphasis?: boolean;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(SURFACE_IN_VIEW);
  return (
    <div
      ref={ref}
      className={`spotlight reveal ${inView ? 'is-visible' : ''} flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-[0_10px_30px_-24px_rgba(13,51,17,0.45)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_20px_40px_-28px_rgba(13,51,17,0.6)]`}
    >
      <span className="flex items-center gap-1 text-sm text-ink-2">
        {label}
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className={`${emphasis ? 'text-4xl' : 'text-2xl'} font-semibold leading-tight text-ink`}>
          {typeof value === 'string' || typeof value === 'number' ? <AnimatedFigure text={typeof value === 'number' ? value.toLocaleString('id-ID') : value} /> : value}
        </span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
        {verdict && (
          <span className="ml-1 self-center">
            <Verdict {...verdict} />
          </span>
        )}
      </span>
      {delta && <DeltaLine delta={delta} />}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
      {trend && <div className="mt-1">{trend}</div>}
      {action && (
        <span className="mt-1.5">
          <ActionLine>{action}</ActionLine>
        </span>
      )}
    </div>
  );
}

function DeltaLine({ delta }: { delta: Delta }) {
  const good = delta.direction === 'flat' ? null : (delta.direction === 'up') === delta.upIsGood;
  const Icon = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : Minus;
  const color = good === null ? 'text-ink-3' : good ? 'text-good-ink' : 'text-critical-ink';
  return (
    <span className="flex items-center gap-1 text-xs">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${color}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {delta.text}
      </span>
      <span className="text-ink-3">{delta.versus}</span>
    </span>
  );
}

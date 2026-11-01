import { CircleAlert, CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AlertStatus, Grade } from '../../lib/regional';
import { GRADE_META, STATUS_META } from '../../lib/scorecard';

const STATUS_ICON: Record<AlertStatus, typeof CircleCheck> = {
  above_reference: CircleAlert,
  watch: TriangleAlert,
  normal: CircleCheck,
  no_data: CircleDashed,
};

/** Grade letter in its diverging-scale fill; the label makes it readable without color. */
export function GradeBadge({
  grade,
  showLabel = false,
  size = 'md',
}: {
  grade: Grade;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const meta = GRADE_META[grade];
  const box = { sm: 'h-5 w-5 text-xs', md: 'h-7 w-7 text-sm', lg: 'h-11 w-11 text-xl' }[size];
  return (
    <span className="inline-flex items-center gap-2" title={`Predikat ${grade} — ${meta.label}`}>
      <span
        className={`inline-flex ${box} items-center justify-center rounded-md font-bold`}
        style={{ background: meta.fill, color: meta.onFill }}
        aria-label={`Predikat ${grade}`}
      >
        {grade}
      </span>
      {showLabel && <span className="text-sm text-ink-2">{meta.label}</span>}
    </span>
  );
}

/** Early-warning status: icon + label on a soft wash, never color alone. */
export function StatusBadge({ status, children }: { status: AlertStatus; children?: ReactNode }) {
  const meta = STATUS_META[status];
  const Icon = STATUS_ICON[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: meta.soft, color: meta.ink }}
      title={meta.description}
    >
      <span className="relative inline-flex">
        {status === 'above_reference' && <span className="anim-ping absolute inset-0 rounded-full" style={{ background: meta.color }} aria-hidden="true" />}
        <Icon className="relative h-3.5 w-3.5" style={{ color: meta.color }} aria-hidden="true" />
      </span>
      {children ?? meta.label}
    </span>
  );
}

export type VerdictTone = 'good' | 'warning' | 'critical' | 'neutral';

const VERDICT_CLS: Record<VerdictTone, string> = {
  good: 'bg-good-soft text-good-ink',
  warning: 'bg-warning-soft text-warning-ink',
  critical: 'bg-critical-soft text-critical-ink',
  neutral: 'bg-surface-muted text-ink-2',
};

const VERDICT_DOT: Record<VerdictTone, string> = {
  good: 'bg-good',
  warning: 'bg-warning',
  critical: 'bg-critical',
  neutral: 'bg-ink-3',
};

/** One-word judgement next to a figure ("Stabil", "Rendah"), so the reader knows if it is good or bad. */
export function Verdict({ label, tone }: { label: string; tone: VerdictTone }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${VERDICT_CLS[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${VERDICT_DOT[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Neutral tag for metadata such as "HET", "Indikatif", "Kota". */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warning' }) {
  const cls = {
    neutral: 'bg-surface-muted text-ink-2',
    accent: 'bg-accent text-white',
    warning: 'bg-gold-soft text-gold-ink',
  }[tone];
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>{children}</span>;
}

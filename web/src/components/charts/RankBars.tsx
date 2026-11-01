import type { CSSProperties, ReactNode } from 'react';
import { useInView } from '../motion/hooks';
import { CHART } from './theme';

export interface RankBarRow {
  id: string;
  label: string;
  sublabel?: string;
  value: number;
  /** Formatted value at the bar tip. */
  valueText: string;
  /** Extra mark after the label (e.g. a grade badge). */
  badge?: ReactNode;
}

/**
 * Horizontal ranking bars. One series, so every bar wears series-1 and the
 * title names the measure; length is the only encoding of magnitude.
 */
export function RankBars({
  rows,
  max,
  selectedId,
  onSelect,
  label,
}: {
  rows: RankBarRow[];
  max: number;
  selectedId?: string;
  onSelect?: (id: string) => void;
  label: string;
}) {
  const { ref, inView } = useInView<HTMLOListElement>();
  return (
    <ol ref={ref} aria-label={label} className={`space-y-0.5 ${inView ? 'in-view' : ''}`}>
      {rows.map((r, i) => {
        const pct = Math.max(0, Math.min(1, r.value / max)) * 100;
        const selected = r.id === selectedId;
        const content = (
          <>
            <span className="w-6 shrink-0 text-right text-xs text-ink-3 tabular-nums">{i + 1}</span>
            <span className="flex w-36 shrink-0 items-center gap-2 sm:w-44">
              {r.badge}
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{r.label}</span>
                {r.sublabel && <span className="block truncate text-xs text-ink-3">{r.sublabel}</span>}
              </span>
            </span>
            <span className="relative flex h-5 min-w-0 flex-1 items-center">
              <span
                className="bar-grow h-3 rounded-r-[4px]"
                style={{ width: `${pct}%`, background: CHART.series1, minWidth: r.value > 0 ? 2 : 0, '--bar-delay': `${Math.min(i, 20) * 35}ms` } as CSSProperties}
                aria-hidden="true"
              />
              <span className="ml-2 shrink-0 text-xs font-semibold text-ink tabular-nums">{r.valueText}</span>
            </span>
          </>
        );
        return (
          <li key={r.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted ${selected ? 'bg-accent-soft' : ''}`}
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

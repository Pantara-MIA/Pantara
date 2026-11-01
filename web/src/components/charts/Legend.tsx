export type LegendKind = 'line' | 'dashed' | 'dotted' | 'band' | 'rect';

export interface LegendItem {
  label: string;
  color: string;
  kind?: LegendKind;
}

/** Legend keys mirror the mark: a stroke for lines, a wash for bands, a box for fills. */
export function LegendKey({ color, kind = 'line' }: { color: string; kind?: LegendKind }) {
  if (kind === 'band') {
    return <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: color, opacity: 0.18 }} aria-hidden="true" />;
  }
  if (kind === 'rect') {
    return <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} aria-hidden="true" />;
  }
  return (
    <svg width="18" height="8" aria-hidden="true" className="shrink-0">
      <line
        x1="1"
        y1="4"
        x2="17"
        y2="4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={kind === 'dashed' ? '4 3' : kind === 'dotted' ? '1 3' : undefined}
      />
    </svg>
  );
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <LegendKey color={it.color} kind={it.kind} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

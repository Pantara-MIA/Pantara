import { useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { Region } from '../../lib/regional';
import { regionTypeLabel } from '../../lib/scorecard';
import type { GeoData, GeoShape } from '../../lib/geo';

export interface GeoValue {
  fill: string;
  /** Plain-text value for the accessible name, e.g. "Predikat B, skor 78". */
  description: string;
  /** Rows shown in the hover/focus tooltip. */
  details?: { label: string; value: string }[];
}

/**
 * Choropleth of one scope: the 34 provinces of Indonesia or the 27
 * regencies/cities of West Java, from boundaries pre-projected to SVG paths
 * (see lib/geo.ts). Areas outside the scope are drawn as grey context; cities
 * are drawn last so the small enclaves stay on top; every region is focusable
 * and clickable.
 */
export function GeoMap({
  geo,
  regions,
  valueOf,
  selectedId,
  onSelect,
  label,
  hint,
}: {
  geo: GeoData;
  regions: Region[];
  valueOf: (r: Region) => GeoValue | null;
  selectedId?: string;
  onSelect?: (r: Region) => void;
  label: string;
  /** Extra tooltip line for a region, e.g. a drill-down hint. */
  hint?: (r: Region) => string | undefined;
}) {
  const SHAPES = geo.regions;
  const CONTEXT = geo.context;
  const WATER = geo.water;
  const wrap = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const byId = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  // Regencies first, cities on top; the selected/hovered shape is redrawn last.
  const ordered = useMemo(() => {
    const rank = (s: GeoShape) => (byId.get(s.id)?.type === 'city' ? 1 : 0);
    return [...SHAPES].sort((a, b) => rank(a) - rank(b));
  }, [byId, SHAPES]);

  const place = (id: string, clientX: number, clientY: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (box) setHover({ id, x: clientX - box.left, y: clientY - box.top });
  };

  const placeAtShape = (id: string, el: SVGPathElement) => {
    const r = el.getBoundingClientRect();
    place(id, r.left + r.width / 2, r.top + r.height / 2);
  };

  const onKey = (e: KeyboardEvent<SVGPathElement>, r: Region) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(r);
    }
  };

  const hovered = hover ? byId.get(hover.id) : undefined;
  const hoveredValue = hovered ? valueOf(hovered) : null;
  const highlight = [selectedId, hover?.id].filter(Boolean) as string[];

  return (
    <div ref={wrap} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox={geo.viewBox} role="group" aria-label={label} className="block h-auto w-full overflow-hidden rounded-xl bg-[#E2EEF3]">
        {CONTEXT.map((d, i) => (
          <path key={`ctx-${i}`} d={d} fill="#FAFBFA" stroke="#D3DDD3" strokeWidth={0.75} vectorEffect="non-scaling-stroke" aria-hidden="true" />
        ))}
        {ordered.map((s, i) => {
          const r = byId.get(s.id);
          if (!r) return null;
          const v = valueOf(r);
          return (
            <path
              key={s.id}
              d={s.d}
              fill={v?.fill ?? 'var(--color-surface-muted)'}
              stroke="#ffffff"
              strokeWidth={1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              tabIndex={0}
              role={onSelect ? 'button' : 'img'}
              aria-pressed={onSelect ? r.id === selectedId : undefined}
              aria-label={`${r.name}: ${v?.description ?? 'tidak ada data'}`}
              className="geo-region cursor-pointer outline-none"
              style={{ '--i': i } as CSSProperties}
              onMouseMove={(e) => place(s.id, e.clientX, e.clientY)}
              onFocus={(e) => placeAtShape(s.id, e.currentTarget)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(r)}
              onKeyDown={(e) => onKey(e, r)}
            />
          );
        })}
        {WATER.map((d, i) => (
          <path key={`water-${i}`} d={d} fill="#BFD9E5" stroke="none" aria-hidden="true" pointerEvents="none" />
        ))}
        {/* Outline layer for the selected and hovered regions, drawn above all fills. */}
        {highlight.map((id, i) => {
          const s = SHAPES.find((x) => x.id === id);
          if (!s) return null;
          const selected = id === selectedId;
          return (
            <path
              key={`${id}-${i}`}
              d={s.d}
              fill="none"
              stroke={selected ? 'var(--color-ink)' : 'var(--color-ink-2)'}
              strokeWidth={selected ? 2.5 : 1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          );
        })}
      </svg>

      {hover && hovered && (
        <div
          key={hover.id}
          role="tooltip"
          className="pointer-events-none absolute z-10 w-max max-w-64 -translate-x-1/2 rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-[0_18px_40px_-20px_rgba(13,51,17,0.55)] backdrop-blur-sm"
          style={{ left: hover.x, top: hover.y + 16, transition: 'left 0.12s ease-out, top 0.12s ease-out' }}
        >
          <div className="anim-pop-in">
            <p className="font-semibold text-ink">{hovered.name}</p>
            <p className="text-ink-3">{regionTypeLabel(hovered)}</p>
            {hint?.(hovered) && <p className="mt-1.5 font-semibold text-accent">{hint(hovered)}</p>}
            {hoveredValue?.details && (
              <dl className="mt-1.5 space-y-0.5">
                {hoveredValue.details.map((d) => (
                  <div key={d.label} className="flex justify-between gap-4">
                    <dt className="text-ink-3">{d.label}</dt>
                    <dd className="font-semibold text-ink tabular-nums">{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

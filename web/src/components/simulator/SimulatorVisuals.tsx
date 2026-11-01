import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Commodity } from '../../data/types';
import { formatNumber } from '../../lib/format';
import CommodityArt from '../CommodityArt';
import { useAnimatedNumber } from '../motion/hooks';
import { CHART } from '../charts/theme';

/** A number that rolls smoothly to each new value. */
export function AnimatedValue({ value, format }: { value: number; format: (v: number) => string }) {
  const v = useAnimatedNumber(value);
  return <>{format(v)}</>;
}

/**
 * Stock tube: the purchase as a container — usable weight fills from the
 * bottom, the rotted share sits on top in a hatched warning fill.
 */
export function StockTube({ initial, usable, pastShelfLife = false }: { initial: number; usable: number; pastShelfLife?: boolean }) {
  const usableShare = initial > 0 ? Math.max(0, Math.min(1, usable / initial)) : 0;
  const waste = initial - usable;
  return (
    <figure className="m-0 flex items-stretch gap-4" aria-label={`Dari ${formatNumber(initial, 1)} kg, ${formatNumber(usable, 2)} kg layak pakai dan ${formatNumber(waste, 2)} kg terbuang`}>
      <div className="relative h-60 w-20 shrink-0 overflow-hidden rounded-b-[28px] rounded-t-xl border-2 border-line-strong bg-surface">
        {/* Rotted share: hatched, fills the space the usable stock no longer occupies. */}
        <div
          className="absolute inset-x-0 top-0 transition-[height] duration-700 ease-out"
          style={{
            height: `${(1 - usableShare) * 100}%`,
            background: `repeating-linear-gradient(135deg, var(--color-critical-soft) 0 6px, color-mix(in srgb, var(--color-critical) 35%, transparent) 6px 8px)`,
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
          style={{ height: `${usableShare * 100}%`, background: 'linear-gradient(180deg, var(--color-leaf), var(--color-accent))' }}
        >
          <span className="absolute inset-x-2 top-1.5 h-1 rounded-full bg-white/40" aria-hidden="true" />
        </div>
        {[0.25, 0.5, 0.75].map((t) => (
          <span key={t} className="absolute right-0 h-px w-3 bg-ink-3/40" style={{ bottom: `${t * 100}%` }} aria-hidden="true" />
        ))}
      </div>
      <figcaption className="flex flex-col justify-between py-1 text-sm">
        <span>
          <span className="flex items-center gap-1.5 text-xs text-ink-3">
            <span className="h-2.5 w-2.5 rounded-sm bg-critical/60" aria-hidden="true" /> Terbuang
          </span>
          <span className="text-xl font-semibold text-critical-ink">
            <AnimatedValue value={waste} format={(v) => `${formatNumber(v, 2)} kg`} />
          </span>
          {pastShelfLife && (
            <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-critical-ink">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> lewat batas simpan
            </span>
          )}
        </span>
        <span>
          <span className="flex items-center gap-1.5 text-xs text-ink-3">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden="true" /> Layak pakai
          </span>
          <span className="text-xl font-semibold text-ink">
            <AnimatedValue value={usable} format={(v) => `${formatNumber(v, 2)} kg`} />
          </span>
          <span className="block text-xs text-ink-3">dari {formatNumber(initial, 1)} kg dibeli</span>
        </span>
      </figcaption>
    </figure>
  );
}

export interface DecaySeries {
  key: string;
  label: string;
  values: number[];
}

/**
 * Decay curves for every storage method; the active one draws itself in again
 * whenever the scenario changes, with a pulsing marker on the last day.
 */
export function DecayCurve({ series, activeKey, weight, shelfLife }: { series: DecaySeries[]; activeKey: string; weight: number; shelfLife: number }) {
  const W = 560;
  const H = 220;
  const pad = { l: 40, r: 16, t: 14, b: 26 };
  const days = Math.max(1, (series[0]?.values.length ?? 2) - 1);
  const x = (d: number) => pad.l + (d / days) * (W - pad.l - pad.r);
  const y = (kg: number) => pad.t + (1 - kg / Math.max(weight, 1e-9)) * (H - pad.t - pad.b);
  const pathOf = (vals: number[]) => vals.map((v, d) => `${d ? 'L' : 'M'}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const active = series.find((s) => s.key === activeKey) ?? series[0];
  const last = active.values[active.values.length - 1];
  const dayTicks = [...new Set([0, Math.round(days / 2), days])];

  // Restart the draw-in whenever the scenario changes.
  const lineRef = useRef<SVGPathElement | null>(null);
  const signature = `${activeKey}|${days}|${weight}`;
  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    el.classList.remove('draw-in');
    void el.getBoundingClientRect();
    el.classList.add('draw-in');
  }, [signature]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Kurva susut: sisa ${formatNumber(last, 2)} kg pada hari ke-${days}`}>
      <defs>
        <linearGradient id="decay-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CHART.series1} stopOpacity="0.22" />
          <stop offset="100%" stopColor={CHART.series1} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(weight * t)} y2={y(weight * t)} stroke={CHART.grid} />
          <text x={pad.l - 6} y={y(weight * t) + 4} textAnchor="end" fontSize="11" fill={CHART.ink3}>
            {formatNumber(weight * t, Number.isInteger(weight * t) ? 0 : 1)}
          </text>
        </g>
      ))}
      {dayTicks.map((d) => (
        <text key={d} x={x(d)} y={H - 6} textAnchor="middle" fontSize="11" fill={CHART.ink3}>
          {d === 0 ? 'hari 0' : `h${d}`}
        </text>
      ))}
      {shelfLife <= days && (
        <g>
          <line x1={x(shelfLife)} x2={x(shelfLife)} y1={pad.t} y2={H - pad.b} stroke={CHART.ink3} strokeDasharray="4 3" />
          <text x={x(shelfLife) + 4} y={pad.t + 10} fontSize="10" fill={CHART.ink3}>
            batas simpan
          </text>
        </g>
      )}
      {series
        .filter((s) => s.key !== active.key)
        .map((s) => (
          <path key={s.key} d={pathOf(s.values)} fill="none" stroke={CHART.axis} strokeWidth="1.5" strokeLinecap="round" />
        ))}
      <path d={`${pathOf(active.values)} L${x(days)} ${H - pad.b} L${x(0)} ${H - pad.b} Z`} fill="url(#decay-area)" style={{ transition: 'd 0.6s ease' }} />
      <path
        ref={lineRef}
        d={pathOf(active.values)}
        pathLength={1}
        fill="none"
        stroke={CHART.series1}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-in"
        style={{ '--len': 1 } as CSSProperties}
      />
      <circle cx={x(days)} cy={y(last)} r="5" fill={CHART.series1} className="pulse-dot" opacity="0.5" />
      <circle cx={x(days)} cy={y(last)} r="5" fill={CHART.series1} stroke={CHART.surface} strokeWidth="2" />
    </svg>
  );
}

/** Spike-probability meter against the "worth stockpiling" threshold. */
export function SpikeMeter({ probabilityPct, thresholdPct }: { probabilityPct: number; thresholdPct: number }) {
  const worth = probabilityPct > thresholdPct;
  const pct = Math.max(0, Math.min(100, probabilityPct));
  return (
    <div>
      <div className="relative h-3 rounded-full bg-surface-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Peluang lonjakan">
        <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out ${worth ? 'bg-good' : 'bg-critical'}`} style={{ width: `${Math.max(pct, 1.5)}%` }} />
        <span className="absolute -top-1.5 h-6 w-0.5 rounded bg-ink" style={{ left: `${thresholdPct}%` }} aria-hidden="true" />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-ink-3">
        <span>0%</span>
        <span style={{ marginLeft: `${thresholdPct - 10}%` }}>ambang layak timbun {thresholdPct}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/** Horizontal strip of commodity illustrations to pick from. */
export function CommodityPicker({ items, value, onChange }: { items: Commodity[]; value: string; onChange: (id: string) => void }) {
  const selected = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selected.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [value]);
  return (
    <div role="radiogroup" aria-label="Pilih komoditas" className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {items.map((c) => {
        const on = c.id === value;
        return (
          <button
            key={c.id}
            ref={on ? selected : undefined}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c.id)}
            className={`group w-24 shrink-0 overflow-hidden rounded-2xl border bg-surface text-left transition-all ${on ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:-translate-y-0.5 hover:border-mint'}`}
          >
            <CommodityArt art={c.art} photo={c.photo} alt="" className="h-16 w-full transition-transform duration-500 group-hover:scale-105" />
            <span className={`block truncate px-2 py-1.5 text-xs font-semibold ${on ? 'bg-accent text-white' : 'text-ink'}`}>{c.shortName}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface StorageOption {
  key: string;
  icon: string;
  label: string;
  decayPerDay: number;
  shelfLifeDays: number;
  warning?: boolean;
  best?: boolean;
}

/** Storage methods as selectable cards (icon, decay and shelf life at a glance). */
export function StorageCards({ options, value, onChange }: { options: StorageOption[]; value: string; onChange: (key: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Metode simpan" className="grid grid-cols-2 gap-2">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`rounded-2xl border p-3 text-left transition-all duration-300 ${on ? 'border-accent bg-accent text-white shadow-[0_14px_30px_-18px_rgba(27,94,32,1)]' : 'border-line bg-surface hover:-translate-y-0.5 hover:border-mint'}`}
          >
            <span className="flex items-start justify-between gap-1">
              <span className="text-xl leading-none" aria-hidden="true">
                {o.icon}
              </span>
              {o.best && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? 'bg-white/20' : 'bg-accent-soft text-accent'}`}>terbaik</span>}
              {o.warning && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? 'bg-white/20' : 'bg-gold-soft text-gold-ink'}`}>hindari</span>}
            </span>
            <span className="mt-1.5 block text-sm font-semibold">{o.label}</span>
            <span className={`block text-xs ${on ? 'text-mint' : 'text-ink-3'}`}>
              {formatNumber(o.decayPerDay * 100, 1)}%/hari · {o.shelfLifeDays} hari
            </span>
          </button>
        );
      })}
    </div>
  );
}

import { ABOVE_COUNT_BINS, COMPLIANCE_BINS, GRADES, GRADE_META, GRADE_THRESHOLDS, STATUS_META } from '../../lib/scorecard';
import type { AlertStatus } from '../../lib/regional';
import { StatusBadge } from '../ui/Badge';
import { RAIN_BINS } from '../../lib/climate';

/** Diverging grade scale: swatch + letter + meaning + score range. */
export function GradeScaleLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2" aria-label="Skala predikat">
      {GRADES.map((g, i) => {
        const min = GRADE_THRESHOLDS[i].min;
        const upper = i === 0 ? 100 : GRADE_THRESHOLDS[i - 1].min;
        return (
          <li key={g} className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-bold"
              style={{ background: GRADE_META[g].fill, color: GRADE_META[g].onFill }}
              aria-hidden="true"
            >
              {g}
            </span>
            <span>
              {GRADE_META[g].label} <span className="text-ink-3 tabular-nums">({min}–{upper})</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Legend for the all-commodities alert map (count of commodities above reference). */
export function AboveCountLegend() {
  return (
    <div className="text-xs text-ink-2">
      <p className="mb-1.5 font-semibold text-ink">Jumlah komoditas di atas acuan</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Jumlah komoditas di atas acuan">
        {ABOVE_COUNT_BINS.map((b) => (
          <li key={b.min} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-line-strong" style={{ background: b.fill }} aria-hidden="true" />
            {b.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Diverging dry↔wet legend for the 90-day rain map. */
export function RainLegend() {
  return (
    <div className="text-xs text-ink-2">
      <p className="mb-1.5 font-semibold text-ink">Curah hujan 90 hari terhadap normal 2018–2025</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Curah hujan terhadap normal">
        {RAIN_BINS.map((b) => (
          <li key={b.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-line-strong" style={{ background: b.fill }} aria-hidden="true" />
            {b.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ComplianceLegend() {
  return (
    <div className="text-xs text-ink-2">
      <p className="mb-1.5 font-semibold text-ink">Hari-komoditas pada atau di bawah HET/HAP</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Kepatuhan HET/HAP">
        {COMPLIANCE_BINS.map((b) => (
          <li key={b.min} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-line-strong" style={{ background: b.fill }} aria-hidden="true" />
            {b.label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-line-strong bg-surface-muted" aria-hidden="true" />
          Tanpa HET/HAP
        </li>
      </ul>
    </div>
  );
}

/** Status legend: badges by default, or map-fill swatches when `map` is set. */
export function StatusLegend({ map = false }: { map?: boolean }) {
  const order: AlertStatus[] = ['above_reference', 'watch', 'normal'];
  if (map) {
    return (
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2" aria-label="Status peringatan dini">
        {order.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5" title={STATUS_META[s].description}>
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-line-strong" style={{ background: STATUS_META[s].mapFill }} aria-hidden="true" />
            {STATUS_META[s].label}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Status peringatan dini">
      {order.map((s) => (
        <li key={s} title={STATUS_META[s].description}>
          <StatusBadge status={s} />
        </li>
      ))}
    </ul>
  );
}

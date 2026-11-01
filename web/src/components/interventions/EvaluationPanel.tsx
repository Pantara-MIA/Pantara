import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Info } from 'lucide-react';
import type { Evaluation, Intervention } from '../../lib/interventions';
import { VERDICT_META, verdictOf } from '../../lib/interventions';
import { formatDate, formatDateShort, formatIDR, formatIDRShort, formatNumber } from '../../lib/format';
import { AXIS_TICK, CHART } from '../charts/theme';
import { Legend, LegendKey } from '../charts/Legend';
import { DataTable } from '../ui/DataTable';

interface Row {
  date: string;
  actual?: number;
  p50: number;
  band: [number, number];
  reference: number;
}

const signed = (v: number, unit: string) => `${v > 0 ? '+' : ''}${formatNumber(v)}${unit}`;

function rowsOf(it: Intervention): Row[] {
  const ev = it.evaluation!;
  const base = ev.price_at_baseline;
  return [
    { date: it.baseline_date, actual: base, p50: base, band: [base, base], reference: it.trigger.forecast.reference },
    ...ev.series.map((p) => ({ date: p.date, actual: p.actual || undefined, p50: p.p50, band: [p.p10, p.p90] as [number, number], reference: p.reference })),
  ];
}

function EvalTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Row }[] }) {
  const r = active ? payload?.[0]?.payload : undefined;
  if (!r) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink-2">{formatDate(r.date)}</p>
      <ul className="space-y-0.5">
        {r.actual !== undefined && (
          <li className="flex items-center gap-2">
            <LegendKey color={CHART.series1} />
            <span className="font-semibold tabular-nums">{formatIDR(r.actual)}</span>
            <span className="text-ink-3">Harga aktual</span>
          </li>
        )}
        <li className="flex items-center gap-2">
          <LegendKey color={CHART.ink2} kind="dashed" />
          <span className="font-semibold tabular-nums">{formatIDR(r.p50)}</span>
          <span className="text-ink-3">Prakiraan P50 (tanpa intervensi)</span>
        </li>
        <li className="flex items-center gap-2">
          <LegendKey color={CHART.ink2} kind="band" />
          <span className="font-semibold tabular-nums">
            {formatIDRShort(r.band[0])} – {formatIDRShort(r.band[1])}
          </span>
          <span className="text-ink-3">P10–P90</span>
        </li>
      </ul>
    </div>
  );
}

/** Actual price after the baseline vs the forecast frozen when the intervention was recorded. */
export function EvaluationChart({ intervention, height = 200 }: { intervention: Intervention; height?: number }) {
  const rows = useMemo(() => rowsOf(intervention), [intervention]);
  return (
    <div className="space-y-2">
      <Legend
        items={[
          { label: 'Harga aktual', color: CHART.series1 },
          { label: 'Prakiraan P50 saat dicatat', color: CHART.ink2, kind: 'dashed' },
          { label: 'Rentang P10–P90', color: CHART.ink2, kind: 'band' },
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="date" tickFormatter={formatDateShort} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} minTickGap={18} />
            <YAxis tickFormatter={formatIDRShort} tick={AXIS_TICK} tickLine={false} axisLine={false} width={76} domain={['auto', 'auto']} />
            <Tooltip cursor={{ stroke: CHART.ink3, strokeWidth: 1 }} content={(p) => <EvalTooltip active={p.active} payload={p.payload as never} />} isAnimationActive={false} />
            <Area dataKey="band" stroke="none" fill={CHART.ink2} fillOpacity={0.1} isAnimationActive={false} activeDot={false} />
            <Line dataKey="p50" stroke={CHART.ink2} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
            <Line
              dataKey="actual"
              stroke={CHART.series1}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function EvaluationTable({ intervention }: { intervention: Intervention }) {
  const rows = useMemo(() => rowsOf(intervention), [intervention]);
  return (
    <DataTable<Row>
      caption="Harga aktual dan prakiraan setelah intervensi"
      dense
      rows={rows}
      rowKey={(r) => r.date}
      columns={[
        { key: 'date', header: 'Tanggal', render: (r) => formatDate(r.date) },
        { key: 'actual', header: 'Aktual', align: 'right', render: (r) => (r.actual !== undefined ? formatIDR(r.actual) : '—') },
        { key: 'p50', header: 'Prakiraan P50', align: 'right', render: (r) => formatIDR(r.p50) },
        { key: 'band', header: 'P10–P90', align: 'right', render: (r) => `${formatIDRShort(r.band[0])} – ${formatIDRShort(r.band[1])}` },
      ]}
    />
  );
}

const TONE_CLS = {
  neutral: 'bg-surface-muted text-ink-2',
  good: 'bg-good-soft text-good-ink',
  warning: 'bg-warning-soft text-warning-ink',
};

export function VerdictBadge({ ev }: { ev?: Evaluation }) {
  const v = VERDICT_META[verdictOf(ev)];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_CLS[v.tone]}`}>{v.label}</span>;
}

/** Evaluation summary: verdict, the two signals, before/after days, chart, caveat. */
export function EvaluationPanel({ intervention }: { intervention: Intervention }) {
  const ev = intervention.evaluation;
  if (!ev || ev.status === 'pending') {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-surface-muted p-3 text-sm text-ink-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Evaluasi muncul setelah ada data harga sesudah {formatDate(intervention.baseline_date)}.
      </p>
    );
  }
  const metrics: [string, string, string][] = [
    ['Harga vs prakiraan', signed(ev.gap_vs_forecast_pct, '%'), 'Rata-rata selisih harga aktual terhadap P50 saat dicatat'],
    ['Perubahan vs tetangga', signed(ev.relative_change_pct, ' poin'), `Daerah ${signed(ev.region_change_pct, '%')} · tetangga ${signed(ev.neighbor_change_pct, '%')}`],
    ['Hari di atas acuan', `${ev.days_above_before} → ${ev.days_above_after}`, `${ev.window_days} hari sebelum → ${ev.observed_days} hari sesudah`],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge ev={ev} />
        <span className="text-xs text-ink-3">
          {ev.status === 'partial' ? `${ev.observed_days} dari ${ev.window_days} hari teramati` : `${ev.window_days} hari setelah ${formatDate(intervention.baseline_date)}`}
        </span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        {metrics.map(([k, v, hint]) => (
          <div key={k} className="rounded-xl bg-surface-muted px-3 py-2.5">
            <dt className="text-xs text-ink-2">{k}</dt>
            <dd className="text-lg font-semibold text-ink">{v}</dd>
            <dd className="text-xs text-ink-3">{hint}</dd>
          </div>
        ))}
      </dl>
      <EvaluationChart intervention={intervention} />
      <p className="text-xs text-ink-3">
        Indikatif, bukan bukti sebab-akibat: harga juga dipengaruhi cuaca, panen, dan distribusi. Dampak baru disebut terindikasi bila harga di bawah prakiraan
        <em> dan </em>turun dibanding daerah tetangga.
      </p>
    </div>
  );
}

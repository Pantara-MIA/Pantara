import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Forecast, PricePoint } from '../../lib/regional';
import { formatDate, formatDateShort, formatIDR, formatIDRShort } from '../../lib/format';
import { CHART, AXIS_TICK } from './theme';
import { Legend, LegendKey } from './Legend';
import type { LegendItem } from './Legend';
import { DataTable } from '../ui/DataTable';

interface Row {
  date: string;
  price?: number;
  neighbor?: number;
  scope?: number;
  reference: number;
  normal?: number;
  p50?: number;
  band?: [number, number];
}

export interface PriceChartProps {
  series: PricePoint[];
  forecast?: Forecast;
  regionLabel: string;
  referenceLabel: string;
  showNeighbors?: boolean;
  /** Label of the normal-band line (for commodities whose reference is HET/HAP); omitted = hidden. */
  normalLabel?: string;
  /** Label of the scope-median line (e.g. "Median Jawa Barat"); omitted = hidden. */
  scopeLabel?: string;
  height?: number;
}

function buildRows({ series, forecast, showNeighbors, scopeLabel, normalLabel }: PriceChartProps): Row[] {
  const rows: Row[] = series.map((p) => ({
    date: p.date,
    price: p.price,
    neighbor: showNeighbors ? p.neighbor_median || undefined : undefined,
    scope: scopeLabel ? p.scope_median : undefined,
    reference: p.reference,
    normal: normalLabel ? p.normal : undefined,
  }));
  if (forecast && rows.length) {
    // Anchor the forecast to the last observed price so the band starts at "today".
    const last = rows[rows.length - 1];
    last.p50 = last.price;
    last.band = [last.price ?? 0, last.price ?? 0];
    for (const f of forecast.points) {
      rows.push({ date: f.date, reference: forecast.reference, p50: f.p50, band: [f.p10, f.p90] });
    }
  }
  return rows;
}

function priceLegendItems(p: Pick<PriceChartProps, 'regionLabel' | 'referenceLabel' | 'showNeighbors' | 'scopeLabel' | 'normalLabel' | 'forecast'>): LegendItem[] {
  const items: LegendItem[] = [{ label: p.regionLabel, color: CHART.series1 }];
  if (p.showNeighbors) items.push({ label: 'Median daerah tetangga', color: CHART.series2 });
  if (p.scopeLabel) items.push({ label: p.scopeLabel, color: CHART.series3 });
  items.push({ label: p.referenceLabel, color: CHART.ink2, kind: 'dashed' });
  if (p.normalLabel) items.push({ label: p.normalLabel, color: CHART.ink3, kind: 'dotted' });
  if (p.forecast) {
    items.push({ label: 'Perkiraan harga', color: CHART.series1, kind: 'dashed' });
    items.push({ label: 'Rentang kemungkinan (80%)', color: CHART.series1, kind: 'band' });
  }
  return items;
}

interface TooltipEntry {
  dataKey?: string | number;
  payload?: Row;
}

function PriceTooltip({ active, payload, label, props }: { active?: boolean; payload?: TooltipEntry[]; label?: string; props: PriceChartProps }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  if (!row) return null;
  const lines: { key: string; label: string; value: string; color: string; kind?: 'dashed' | 'dotted' | 'band' }[] = [];
  if (row.price !== undefined) lines.push({ key: 'price', label: props.regionLabel, value: formatIDR(row.price), color: CHART.series1 });
  if (row.price === undefined && row.p50 !== undefined) {
    lines.push({ key: 'p50', label: 'Perkiraan harga', value: formatIDR(row.p50), color: CHART.series1, kind: 'dashed' });
    if (row.band) lines.push({ key: 'band', label: 'Rentang kemungkinan (80%)', value: `${formatIDRShort(row.band[0])} – ${formatIDRShort(row.band[1])}`, color: CHART.series1, kind: 'band' });
  }
  if (row.neighbor !== undefined) lines.push({ key: 'neighbor', label: 'Median tetangga', value: formatIDR(row.neighbor), color: CHART.series2 });
  if (row.scope !== undefined) lines.push({ key: 'scope', label: props.scopeLabel ?? 'Median', value: formatIDR(row.scope), color: CHART.series3 });
  lines.push({ key: 'reference', label: props.referenceLabel, value: formatIDR(row.reference), color: CHART.ink2, kind: 'dashed' });
  if (row.normal !== undefined) lines.push({ key: 'normal', label: props.normalLabel ?? 'Batas wajar', value: formatIDR(row.normal), color: CHART.ink3, kind: 'dotted' });

  return (
    <div className="min-w-48 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-ink-2">{formatDate(String(label))}</p>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2">
            <LegendKey color={l.color} kind={l.kind} />
            <span className="font-semibold text-ink tabular-nums">{l.value}</span>
            <span className="text-ink-3">{l.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Daily price of one region vs its reference ceiling, with optional neighbour
 * and provincial medians and the FHS forecast (P50 line + P10–P90 band).
 */
export function PriceChart(props: PriceChartProps) {
  const { height = 300 } = props;
  const rows = useMemo(() => buildRows(props), [props]);
  const tickEvery = Math.max(1, Math.round(rows.length / 6));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            interval={tickEvery - 1}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            minTickGap={16}
          />
          <YAxis
            tickFormatter={formatIDRShort}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={68}
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ stroke: CHART.ink3, strokeWidth: 1 }}
            content={(p) => <PriceTooltip active={p.active} payload={p.payload as unknown as TooltipEntry[]} label={p.label as string} props={props} />}
            isAnimationActive={false}
          />
          <Area dataKey="band" stroke="none" fill={CHART.series1} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />
          {props.normalLabel && (
            <Line dataKey="normal" stroke={CHART.ink3} strokeWidth={1.5} strokeDasharray="1 3" strokeLinecap="round" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          )}
          <Line dataKey="reference" type="stepAfter" stroke={CHART.ink2} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
          {props.scopeLabel && (
            <Line dataKey="scope" stroke={CHART.series3} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          )}
          {props.showNeighbors && (
            <Line dataKey="neighbor" stroke={CHART.series2} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          )}
          <Line dataKey="p50" stroke={CHART.series1} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
          <Line
            dataKey="price"
            stroke={CHART.series1}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Legend for a PriceChart, rendered by the ChartFrame above the plot. */
export function PriceChartLegend(props: Pick<PriceChartProps, 'regionLabel' | 'referenceLabel' | 'showNeighbors' | 'scopeLabel' | 'normalLabel' | 'forecast'>) {
  return <Legend items={priceLegendItems(props)} />;
}

/** Table twin of a PriceChart: every value the chart shows, newest first. */
export function PriceTable(props: PriceChartProps) {
  const rows = useMemo(() => [...buildRows(props)].reverse(), [props]);
  return (
    <DataTable<Row>
      caption={`Harga harian ${props.regionLabel}`}
      dense
      rows={rows}
      rowKey={(r) => r.date}
      columns={[
        { key: 'date', header: 'Tanggal', render: (r) => formatDate(r.date) },
        {
          key: 'price',
          header: 'Harga',
          align: 'right',
          render: (r) => (r.price !== undefined ? formatIDR(r.price) : <span className="text-ink-3">perkiraan {formatIDR(r.p50 ?? 0)}</span>),
        },
        {
          key: 'band',
          header: 'Rentang kemungkinan',
          align: 'right',
          hideOnMobile: true,
          render: (r) => (r.band && r.price === undefined ? `${formatIDRShort(r.band[0])} – ${formatIDRShort(r.band[1])}` : '—'),
        },
        ...(props.showNeighbors
          ? [{ key: 'neighbor', header: 'Median tetangga', align: 'right' as const, hideOnMobile: true, render: (r: Row) => (r.neighbor ? formatIDR(r.neighbor) : '—') }]
          : []),
        { key: 'reference', header: props.referenceLabel, align: 'right', render: (r) => formatIDR(r.reference) },
      ]}
    />
  );
}

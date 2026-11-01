import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Grade } from '../../lib/regional';
import { GRADE_META, GRADE_THRESHOLDS, formatMonth, formatMonthShort } from '../../lib/scorecard';
import { formatNumber } from '../../lib/format';
import { AXIS_TICK, CHART } from '../charts/theme';
import { DataTable } from '../ui/DataTable';
import { GradeBadge } from '../ui/Badge';

export interface MonthScore {
  month: string;
  score: number;
  grade: Grade;
  rank: number;
}

interface TooltipArgs {
  active?: boolean;
  payload?: readonly { payload?: MonthScore }[];
}

function TrendTooltip({ active, payload }: TooltipArgs) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink-2">{formatMonth(row.month)}</p>
      <p className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink tabular-nums">{formatNumber(row.score)}</span>
        <span className="text-ink-3">
          predikat {row.grade} · {GRADE_META[row.grade].label} · peringkat {row.rank}
        </span>
      </p>
    </div>
  );
}

/** Monthly score of one region, with the grade thresholds as labelled guides. */
export function ScoreTrendChart({ data, height = 220 }: { data: MonthScore[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 28, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
          {GRADE_THRESHOLDS.filter((t) => t.min > 0).map((t) => (
            <ReferenceLine
              key={t.grade}
              y={t.min}
              stroke={CHART.axis}
              strokeDasharray="4 3"
              label={{ value: t.grade, position: 'right', fill: CHART.ink3, fontSize: 10 }}
            />
          ))}
          <Tooltip cursor={{ stroke: CHART.ink3, strokeWidth: 1 }} content={(p) => <TrendTooltip active={p.active} payload={p.payload as TooltipArgs['payload']} />} isAnimationActive={false} />
          <Line
            dataKey="score"
            stroke={CHART.series1}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreTrendTable({ data }: { data: MonthScore[] }) {
  return (
    <DataTable<MonthScore>
      caption="Skor bulanan"
      dense
      rows={[...data].reverse()}
      rowKey={(r) => r.month}
      columns={[
        { key: 'month', header: 'Bulan', render: (r) => formatMonth(r.month) },
        { key: 'score', header: 'Skor', align: 'right', render: (r) => formatNumber(r.score) },
        { key: 'grade', header: 'Predikat', render: (r) => <GradeBadge grade={r.grade} size="sm" showLabel /> },
        { key: 'rank', header: 'Peringkat', align: 'right', render: (r) => String(r.rank) },
      ]}
    />
  );
}

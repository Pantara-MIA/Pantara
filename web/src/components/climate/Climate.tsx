import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CloudRain, CloudSun, Sun, Waves } from 'lucide-react';
import type { ClimateEffect, ClimateLevel, ENSO, MonthRain, ProvinceClimate } from '../../lib/climate';
import { DRIVER_LABEL, LEVEL_META, RAIN_CLASS_LABEL, ensoLabel } from '../../lib/climate';
import type { RegionalCommodity } from '../../lib/regional';
import { formatMonth, formatMonthShort } from '../../lib/scorecard';
import { formatDate, formatNumber } from '../../lib/format';
import { AXIS_TICK, CHART } from '../charts/theme';
import { ChartFrame } from '../charts/ChartFrame';
import { Legend } from '../charts/Legend';
import { DataTable } from '../ui/DataTable';
import { InfoTip, TitleWithInfo } from '../ui/InfoTip';

const TONE = {
  critical: 'bg-critical-soft text-critical-ink',
  warning: 'bg-warning-soft text-warning-ink',
  good: 'bg-good-soft text-good-ink',
} as const;

const LEVEL_ICON = { high: Sun, watch: CloudSun, low: CloudRain } as const;

/** Climate risk level with icon and label (never color alone). */
export function ClimateLevelBadge({ level, short = false }: { level: ClimateLevel; short?: boolean }) {
  const meta = LEVEL_META[level];
  const Icon = LEVEL_ICON[level];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE[meta.tone]}`} title={meta.description}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {short ? meta.label.replace('Risiko iklim ', '') : meta.label}
    </span>
  );
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** NOAA season code ("JAS") → "Jul–Sep". */
function seasonLabel(code: string) {
  const i = 'JFMAMJJASONDJF'.indexOf(code);
  return i < 0 ? code : `${MONTHS_SHORT[i % 12]}–${MONTHS_SHORT[(i + 2) % 12]}`;
}

/** ENSO status in a line; during El Niño, the price rises it has historically been followed by. */
export function EnsoStrip({ enso, effects, commodityName, className = '' }: { enso: ENSO; effects: ClimateEffect[]; commodityName: (id: string) => string; className?: string }) {
  if (!enso.season) return null;
  const active = enso.phase === 'el_nino';
  const top = effects
    .filter((e) => e.driver === 'el_nino' && e.significant && e.effect_pct >= 1)
    .sort((a, b) => b.effect_pct - a.effect_pct)
    .slice(0, 3);
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-3 text-sm ${active ? 'border-gold/60 bg-gold-soft text-gold-ink' : 'border-line bg-surface text-ink-2'} ${className}`}
    >
      <Waves className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="inline-flex items-center gap-1">
        <strong>{ensoLabel(enso)}</strong>
        {active && top.length > 0 && <span>· harga ini biasanya naik 2 bulan lagi:</span>}
        <InfoTip label={ensoLabel(enso)}>
          Indeks El Niño/La Niña (RONI, NOAA) {enso.anom > 0 ? '+' : ''}
          {formatNumber(enso.anom, 2)} untuk {seasonLabel(enso.season)} {enso.year}; ≥ +0,5 berarti El Niño.
          {active && ' Kenaikan = rata-rata saat El Niño 2023–2026, di luar pola musiman biasa.'}
        </InfoTip>
      </p>
      {active && top.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {top.map((e) => (
            <li key={e.commodity_id} className="rounded-full bg-white/70 px-2.5 py-0.5 font-semibold text-ink">
              {commodityName(e.commodity_id)} <span className="text-critical-ink">+{formatNumber(e.effect_pct)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Historical price effects of the active climate conditions, strongest first. */
export function ClimateEffects({ climate, commodityName, limit = 6 }: { climate: ProvinceClimate; commodityName: (id: string) => string; limit?: number }) {
  // One row per commodity: its strongest active effect.
  const best = new Map<string, ClimateEffect>();
  for (const e of climate.effects) {
    const cur = best.get(e.commodity_id);
    if (!cur || e.effect_pct > cur.effect_pct) best.set(e.commodity_id, e);
  }
  const rows = [...best.values()].sort((a, b) => b.effect_pct - a.effect_pct).slice(0, limit);
  if (!rows.length) {
    return <p className="text-sm text-ink-2">Kondisi iklim saat ini secara historis tidak diikuti kenaikan harga yang berarti.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((e) => (
        <li key={e.commodity_id} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="font-semibold text-ink">{commodityName(e.commodity_id)}</span>
            <span className="block text-xs text-ink-3">setelah {DRIVER_LABEL[e.driver]}</span>
          </span>
          <span className="shrink-0 font-semibold text-critical-ink tabular-nums">+{formatNumber(e.effect_pct)}%</span>
        </li>
      ))}
    </ul>
  );
}

interface RainTooltipArgs {
  active?: boolean;
  payload?: readonly { payload?: MonthRain }[];
}

function RainTooltip({ active, payload }: RainTooltipArgs) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink-2">{formatMonth(row.month)}</p>
      <p className="font-semibold text-ink tabular-nums">{formatNumber(row.rain_mm, 0)} mm</p>
      <p className="text-ink-3 tabular-nums">
        normal {formatNumber(row.normal_mm, 0)} mm · {formatNumber(row.pct, 0)}% dari normal
      </p>
    </div>
  );
}

const RAIN_LEGEND = [
  { label: 'Curah hujan bulan itu', color: CHART.series3, kind: 'rect' as const },
  { label: 'Normal 2018–2025', color: CHART.ink2, kind: 'dashed' as const },
];

/** Monthly rain against the province's 2018–2025 normal. */
export function RainChart({ history, provinceName, weatherAsOf }: { history: MonthRain[]; provinceName: string; weatherAsOf: string }) {
  return (
    <ChartFrame
      title={
        <TitleWithInfo
          text={`Curah hujan bulanan · ${provinceName}`}
          info={`Milimeter per bulan sampai ${formatDate(weatherAsOf)}; bulan berjalan baru terhitung sebagian. Garis putus-putus = rata-rata 2018–2025.`}
        />
      }
      subtitle="Batang di bawah garis berarti lebih kering dari biasanya."
      legend={<Legend items={RAIN_LEGEND} />}
      table={
        <DataTable<MonthRain>
          caption="Curah hujan bulanan"
          dense
          rows={[...history].reverse()}
          rowKey={(r) => r.month}
          columns={[
            { key: 'm', header: 'Bulan', render: (r) => formatMonth(r.month) },
            { key: 'r', header: 'Hujan (mm)', align: 'right', render: (r) => formatNumber(r.rain_mm, 0) },
            { key: 'n', header: 'Normal (mm)', align: 'right', render: (r) => formatNumber(r.normal_mm, 0) },
            { key: 'p', header: '% normal', align: 'right', render: (r) => `${formatNumber(r.pct, 0)}%` },
          ]}
        />
      }
      footnote="Sumber: Open-Meteo (ERA5)."
    >
      <div style={{ height: 220 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
            <Tooltip cursor={{ fill: CHART.grid }} content={(p) => <RainTooltip active={p.active} payload={p.payload as RainTooltipArgs['payload']} />} isAnimationActive={false} />
            <Bar dataKey="rain_mm" fill={CHART.series3} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={700} />
            <Line dataKey="normal_mm" stroke={CHART.ink2} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Rain vs normal, level and drivers for one province (used by its regencies too). */
export function ClimateSummary({
  climate,
  enso,
  provinceName,
  commodities,
}: {
  climate: ProvinceClimate;
  enso: ENSO;
  provinceName: string;
  commodities: RegionalCommodity[];
}) {
  const name = (id: string) => commodities.find((c) => c.id === id)?.name ?? id;
  const facts: [string, string][] = [
    ['Hujan 3 bulan terakhir', `${formatNumber(climate.rain90_pct, 0)}% dari biasanya · ${RAIN_CLASS_LABEL[climate.rain90_class].toLowerCase()}`],
    ['El Niño / La Niña', ensoLabel(enso)],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ClimateLevelBadge level={climate.level} />
        <span className="text-xs text-ink-3">Iklim {provinceName}</span>
      </div>
      <dl className="divide-y divide-line text-sm">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-2">
            <dt className="text-ink-2">{k}</dt>
            <dd className="text-right font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="mb-2 flex items-center gap-1 text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">
          Harga yang biasanya naik
          <InfoTip label="Harga yang biasanya naik">
            Rata-rata kenaikan harga 2 bulan setelah kondisi iklim serupa, di luar pola musiman, dari data 2020–2026. Hanya dampak yang konsisten secara statistik
            yang ditampilkan.
          </InfoTip>
        </p>
        <ClimateEffects climate={climate} commodityName={name} />
      </div>
    </div>
  );
}

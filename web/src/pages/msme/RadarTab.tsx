import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { StatTile } from '../../components/ui/StatTile';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { Legend } from '../../components/charts/Legend';
import { DataTable } from '../../components/ui/DataTable';
import { AXIS_TICK, CHART } from '../../components/charts/theme';
import { storageOf, weeklyUsage } from '../../lib/profile';
import { addDays, formatDate, formatDateShort, formatIDR, formatIDRShort, formatPct } from '../../lib/format';
import { Disclosure, NoData, Row } from './shared';
import type { MsmeTabProps } from './shared';

/** Seasonal pattern of fresh produce in Java; tone is the price pressure. */
const SEASON: { month: string; tone: 'high' | 'watch' | 'low'; note: string }[] = [
  { month: 'Jan', tone: 'high', note: 'Puncak paceklik & curah hujan tinggi' },
  { month: 'Feb', tone: 'high', note: 'Pasokan tersendat, harga puncak' },
  { month: 'Mar', tone: 'low', note: 'Awal panen raya, harga mulai turun' },
  { month: 'Apr', tone: 'low', note: 'Panen raya, harga terendah tahunan' },
  { month: 'Mei', tone: 'watch', note: 'Permintaan naik jelang hari raya' },
  { month: 'Jun', tone: 'low', note: 'Pasokan stabil' },
  { month: 'Jul', tone: 'watch', note: 'Musim hajatan, permintaan meningkat' },
  { month: 'Agu', tone: 'low', note: 'Pasokan stabil' },
  { month: 'Sep', tone: 'watch', note: 'Peralihan musim, pasokan mulai turun' },
  { month: 'Okt', tone: 'watch', note: 'Awal musim hujan di sentra tani' },
  { month: 'Nov', tone: 'high', note: 'Curah hujan puncak, panen rusak' },
  { month: 'Des', tone: 'high', note: 'Nataru, permintaan & harga melonjak' },
];

const SEASON_CLS = { high: 'bg-critical-soft text-critical-ink', watch: 'bg-warning-soft text-warning-ink', low: 'bg-good-soft text-good-ink' };
const SEASON_LABEL = { high: 'Rawan lonjakan', watch: 'Waspada', low: 'Panen / stabil' };

interface Row7 {
  date: string;
  price?: number;
  p50?: number;
  band?: [number, number];
}

/** Price radar: 90-day history, 7/14-day forecast range, monthly cash budget, season. */
export default function RadarTab({ profile, data, loading, commodity, asOf }: MsmeTabProps) {
  const rows = useMemo<Row7[]>(() => {
    if (!data) return [];
    const out: Row7[] = data.history.map((h) => ({ date: h.date, price: h.price }));
    const last = out[out.length - 1];
    if (last) {
      last.p50 = last.price;
      last.band = [last.price!, last.price!];
    }
    out.push({ date: addDays(asOf, 7), p50: data.p7_50, band: [data.p7_10, data.p7_90] });
    out.push({ date: addDays(asOf, 14), p50: data.p14_50, band: [data.p14_10, data.p14_90] });
    return out;
  }, [data, asOf]);

  if (!data) return <NoData loading={loading} />;

  const storage = storageOf(profile.storage_method);
  const monthlyKg = (weeklyUsage(profile, commodity) / Math.pow(1 - storage.decay, 3.5)) * 4;
  const move7 = ((data.p7_50 - data.current_price) / data.current_price) * 100;
  const width7 = ((data.p7_90 - data.p7_10) / data.p7_50) * 100;
  const width14 = ((data.p14_90 - data.p14_10) / data.p14_50) * 100;
  const thisMonth = new Date(`${asOf}T00:00:00`).getMonth();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          emphasis
          label="Arah harga 7 hari (P50)"
          value={Math.abs(move7) < 0.5 ? 'Datar' : `${move7 > 0 ? '+' : ''}${formatPct(move7)}`}
          hint={`${formatIDR(data.current_price)} → ${formatIDR(data.p7_50)}`}
        />
        <StatTile label="Rentang 7 hari (P10–P90)" value={`±${formatPct(width7 / 2)}`} hint={`${formatIDRShort(data.p7_10)} – ${formatIDRShort(data.p7_90)}`} />
        <StatTile label="Rentang 14 hari (P10–P90)" value={`±${formatPct(width14 / 2)}`} hint={`${formatIDRShort(data.p14_10)} – ${formatIDRShort(data.p14_90)}`} />
      </div>

      <ChartFrame
        title={`Harga ${commodity}: 90 hari terakhir & prakiraan`}
        subtitle={`Harga ${data.region_name} · ${data.source_label}${data.source === 'synthetic' ? ' (data simulasi)' : ''} · per ${formatDate(asOf)}`}
        legend={
          <Legend
            items={[
              { label: 'Harga pasar', color: CHART.series1 },
              { label: 'Prakiraan P50', color: CHART.series1, kind: 'dashed' },
              { label: 'Rentang P10–P90', color: CHART.series1, kind: 'band' },
            ]}
          />
        }
        table={
          <DataTable<Row7>
            caption="Riwayat dan prakiraan harga"
            dense
            rows={[...rows].reverse()}
            rowKey={(r) => r.date}
            columns={[
              { key: 'd', header: 'Tanggal', render: (r) => formatDate(r.date) },
              { key: 'p', header: 'Harga', align: 'right', render: (r) => (r.price !== undefined ? formatIDR(r.price) : `P50 ${formatIDR(r.p50 ?? 0)}`) },
              { key: 'b', header: 'P10–P90', align: 'right', render: (r) => (r.band && r.price === undefined ? `${formatIDRShort(r.band[0])} – ${formatIDRShort(r.band[1])}` : '—') },
            ]}
          />
        }
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="date" tickFormatter={formatDateShort} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} minTickGap={24} />
              <YAxis tickFormatter={formatIDRShort} tick={AXIS_TICK} tickLine={false} axisLine={false} width={76} domain={['auto', 'auto']} />
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: CHART.ink3, strokeWidth: 1 }}
                content={(p) => {
                  const r = p.active ? (p.payload?.[0]?.payload as Row7 | undefined) : undefined;
                  if (!r) return null;
                  return (
                    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                      <p className="font-medium text-ink-2">{formatDate(r.date)}</p>
                      {r.price !== undefined ? (
                        <p className="font-semibold">{formatIDR(r.price)}</p>
                      ) : (
                        <>
                          <p className="font-semibold">P50 {formatIDR(r.p50 ?? 0)}</p>
                          <p className="text-ink-3">{r.band && `${formatIDRShort(r.band[0])} – ${formatIDRShort(r.band[1])}`}</p>
                        </>
                      )}
                    </div>
                  );
                }}
              />
              <Area dataKey="band" stroke="none" fill={CHART.series1} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />
              <Line dataKey="p50" stroke={CHART.series1} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
              <Line dataKey="price" stroke={CHART.series1} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>

      <Card>
        <CardHeader title={`Kas untuk ${commodity.toLowerCase()} sebulan`} subtitle={`± ${monthlyKg.toLocaleString('id-ID', { maximumFractionDigits: 1 })} kg (4 minggu, termasuk cadangan susut)`} />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Skenario murah (P10)', value: monthlyKg * data.p14_10, cls: 'bg-surface-muted' },
            { label: 'Anggaran disarankan (P50)', value: monthlyKg * data.p14_50, cls: 'bg-accent text-white' },
            { label: 'Cadangan aman (P90)', value: monthlyKg * data.p14_90, cls: 'bg-gold-soft text-gold-ink' },
          ].map((b) => (
            <div key={b.label} className={`rounded-2xl px-4 py-3 ${b.cls}`}>
              <p className="text-xs opacity-80">{b.label}</p>
              <p className="mt-1 text-xl font-semibold">{formatIDR(b.value)}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Kalender musiman" subtitle="Pola tahunan harga pangan segar — untuk merencanakan kas beberapa bulan ke depan." />
        <CardBody>
          <ol className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {SEASON.map((m, i) => (
              <li key={m.month} title={m.note} className={`rounded-xl px-2 py-2 text-center ${SEASON_CLS[m.tone]} ${i === thisMonth ? 'ring-2 ring-ink ring-offset-2' : ''}`}>
                <span className="block text-sm font-bold">{m.month}</span>
                <span className="block text-[10px] font-medium">{SEASON_LABEL[m.tone]}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-ink-2">
            Bulan ini ({SEASON[thisMonth].month}): {SEASON[thisMonth].note.toLowerCase()}.
          </p>
        </CardBody>
      </Card>

      <Disclosure label="Cara membaca radar">
        <dl className="divide-y divide-line">
          <Row label="P50" value="harga tengah" formula="Separuh skenario di atasnya, separuh di bawahnya." />
          <Row label="P10–P90" value="rentang 80%" formula="Delapan dari sepuluh kemungkinan harga jatuh di rentang ini." />
          <Row label="Anggaran" value="kg bulanan × harga 14 hari" formula="Siapkan P50; pegang selisih ke P90 sebagai cadangan." />
        </dl>
      </Disclosure>
    </div>
  );
}

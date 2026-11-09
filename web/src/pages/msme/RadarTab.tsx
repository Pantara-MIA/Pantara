import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatTile } from '../../components/ui/StatTile';
import { TitleWithInfo } from '../../components/ui/InfoTip';
import type { VerdictTone } from '../../components/ui/Badge';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { Legend } from '../../components/charts/Legend';
import { DataTable } from '../../components/ui/DataTable';
import { AXIS_TICK, CHART } from '../../components/charts/theme';
import { storageOf, weeklyUsage } from '../../lib/profile';
import { addDays, formatDate, formatDateShort, formatIDR, formatIDRShort, formatPct } from '../../lib/format';
import { DecisionBanner, NoData } from './shared';
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
const SEASON_TONE: Record<'high' | 'watch' | 'low', VerdictTone> = { high: 'critical', watch: 'warning', low: 'good' };
const SEASON_ACTION = { high: 'Siapkan kas lebih dan cek harga tiap minggu.', watch: 'Cek harga sebelum belanja besar.', low: 'Waktu yang baik untuk menyisihkan kas.' };

/** Shown history: long enough for context, short enough to keep the forecast readable. */
const HISTORY_DAYS = 30;

/** Where next week's price is heading and how to act on it. */
function readTrend(movePct: number, bulk: boolean): { tone: VerdictTone; verdict: string; phrase: string; action: string } {
  const change = formatPct(Math.abs(movePct));
  if (movePct >= 10) return { tone: 'critical', verdict: 'Naik tajam', phrase: `naik ${change}`, action: bulk ? 'Borong hari ini sesuai rekomendasi.' : 'Belanja hari ini, jangan ditunda.' };
  if (movePct >= 3) return { tone: 'warning', verdict: 'Naik', phrase: `naik ${change}`, action: bulk ? 'Borong hari ini sesuai rekomendasi.' : 'Belanja hari ini, jangan ditunda.' };
  if (movePct <= -3) return { tone: 'good', verdict: 'Turun', phrase: `turun ${change}`, action: bulk ? 'Ikuti rekomendasi belanja hari ini.' : 'Beli secukupnya, jangan menimbun stok.' };
  return { tone: 'good', verdict: 'Stabil', phrase: 'stabil', action: 'Belanja seperti biasa.' };
}

/** How much the budget could still move before the month is over. */
function readBudget(cushionPct: number): { label: string; tone: VerdictTone } {
  if (cushionPct < 10) return { label: 'Stabil', tone: 'good' };
  if (cushionPct < 25) return { label: 'Perlu cadangan', tone: 'warning' };
  return { label: 'Tidak menentu', tone: 'critical' };
}

interface Row7 {
  date: string;
  price?: number;
  p50?: number;
  band?: [number, number];
}

/** Price outlook: where the price is heading, how much cash to set aside, and the season. */
export default function RadarTab({ profile, data, loading, commodity, asOf }: MsmeTabProps) {
  const rows = useMemo<Row7[]>(() => {
    if (!data) return [];
    const out: Row7[] = data.history.slice(-HISTORY_DAYS).map((h) => ({ date: h.date, price: h.price }));
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
  const budget = monthlyKg * data.p14_50;
  const reserve = monthlyKg * (data.p14_90 - data.p14_50);
  const trend = readTrend(((data.p7_50 - data.current_price) / data.current_price) * 100, data.decision.weeks_covered === 2);
  const budgetReading = readBudget(((data.p14_90 - data.p14_50) / data.p14_50) * 100);
  const thisMonth = new Date(`${asOf}T00:00:00`).getMonth();
  const season = SEASON[thisMonth];
  const monthName = new Date(`${asOf}T00:00:00`).toLocaleDateString('id-ID', { month: 'long' });
  const nextMonths = [SEASON[(thisMonth + 1) % 12], SEASON[(thisMonth + 2) % 12]];

  return (
    <div className="space-y-6">
      <DecisionBanner
        tone={trend.tone}
        verdict={`${trend.verdict} · 7 hari ke depan`}
        title={`Harga ${commodity.toLowerCase()} diperkirakan ${trend.phrase}`}
        info={`Perkiraan harga 7 hari lagi. 8 dari 10 kemungkinan harga berada di ${formatIDR(data.p7_10)} – ${formatIDR(data.p7_90)} per kg.`}
        action={trend.action}
      >
        {formatIDR(data.current_price)} → {formatIDR(data.p7_50)} per kg
      </DecisionBanner>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Anggaran sebulan"
          value={formatIDR(budget)}
          verdict={budgetReading}
          action={`Sisihkan angka ini, ditambah cadangan ${formatIDR(reserve)}.`}
          info={`Perkiraan biaya ${monthlyKg.toLocaleString('id-ID', { maximumFractionDigits: 1 })} kg untuk 4 minggu, sudah termasuk bahan yang menyusut. Cadangan menutup kenaikan bila harga mencapai batas atas perkiraan.`}
        />
        <StatTile
          label="Musim bulan ini"
          value={monthName}
          verdict={{ label: SEASON_LABEL[season.tone], tone: SEASON_TONE[season.tone] }}
          action={SEASON_ACTION[season.tone]}
          info={`${season.note}. Ini pola umum harga pangan segar tiap tahun di Jawa, bukan perkiraan khusus bahan ini.`}
          trend={
            <span className="flex flex-wrap gap-1.5">
              {nextMonths.map((m) => (
                <span key={m.month} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEASON_CLS[m.tone]}`}>
                  {m.month}: {SEASON_LABEL[m.tone]}
                </span>
              ))}
            </span>
          }
        />
      </div>

      <ChartFrame
        title={<TitleWithInfo text={`Harga ${commodity}`} info={`Harga ${data.region_name}, sumber ${data.source_label}. Area hijau muda adalah rentang tempat 8 dari 10 kemungkinan harga berada.`} />}
        subtitle={`${HISTORY_DAYS} hari terakhir dan perkiraan 14 hari`}
        legend={
          <Legend
            items={[
              { label: 'Harga pasar', color: CHART.series1 },
              { label: 'Perkiraan', color: CHART.series1, kind: 'dashed' },
              { label: 'Kemungkinan harga', color: CHART.series1, kind: 'band' },
            ]}
          />
        }
        table={
          <DataTable<Row7>
            caption="Riwayat dan perkiraan harga"
            dense
            rows={[...rows].reverse()}
            rowKey={(r) => r.date}
            columns={[
              { key: 'd', header: 'Tanggal', render: (r) => formatDate(r.date) },
              { key: 'p', header: 'Harga', align: 'right', render: (r) => (r.price !== undefined ? formatIDR(r.price) : `Perkiraan ${formatIDR(r.p50 ?? 0)}`) },
              { key: 'b', header: 'Kemungkinan harga', align: 'right', render: (r) => (r.band && r.price === undefined ? `${formatIDRShort(r.band[0])} – ${formatIDRShort(r.band[1])}` : '—') },
            ]}
          />
        }
      >
        <div className="h-60">
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
                          <p className="font-semibold">Perkiraan {formatIDR(r.p50 ?? 0)}</p>
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
    </div>
  );
}

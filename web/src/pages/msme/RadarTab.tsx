import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { StatTile } from '../../components/ui/StatTile';
import { TitleWithInfo } from '../../components/ui/InfoTip';
import type { VerdictTone } from '../../components/ui/Badge';
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

/** Shown history: long enough for context, short enough to keep the forecast readable. */
const HISTORY_DAYS = 30;

/** Moves smaller than this, in either direction, count as stable. */
const STABLE_PCT = 3;
/** A range reaching this far against its direction still counts as one-way. */
const ONE_WAY_SLACK_PCT = 1;
const SHARP_RISE_PCT = 10;

const signedPct = (v: number) => {
  const rounded = Math.round(v * 10) / 10 || 0;
  return `${rounded > 0 ? '+' : ''}${formatPct(rounded)}`;
};

/** Reads a forecast range against today's price: the range, a verdict and the step to take. */
function readRange(today: number, low: number, high: number, steps: { up: string; down: string; flat: string; mixed: string }): { value: string; verdict: { label: string; tone: VerdictTone }; action: string } {
  const lowPct = today > 0 ? ((low - today) / today) * 100 : 0;
  const highPct = today > 0 ? ((high - today) / today) * 100 : 0;
  const value = `${signedPct(lowPct)} s.d. ${signedPct(highPct)}`;
  if (Math.max(Math.abs(lowPct), Math.abs(highPct)) < STABLE_PCT) return { value, verdict: { label: 'Stabil', tone: 'good' }, action: steps.flat };
  if (lowPct >= -ONE_WAY_SLACK_PCT) return { value, verdict: highPct >= SHARP_RISE_PCT ? { label: 'Naik tajam', tone: 'critical' } : { label: 'Cenderung naik', tone: 'warning' }, action: steps.up };
  if (highPct <= ONE_WAY_SLACK_PCT) return { value, verdict: { label: 'Cenderung turun', tone: 'good' }, action: steps.down };
  return { value, verdict: { label: 'Bisa naik-turun', tone: 'warning' }, action: steps.mixed };
}

interface Row7 {
  date: string;
  price?: number;
  p50?: number;
  band?: [number, number];
}

/** Price radar: where the price is heading, how much cash to set aside, and the season. */
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
  const bulk = data.decision.weeks_covered === 2;
  const range7 = readRange(data.current_price, data.p7_10, data.p7_90, {
    up: bulk ? 'Borong hari ini sesuai rekomendasi.' : 'Belanja hari ini, jangan ditunda.',
    down: bulk ? 'Ikuti rekomendasi belanja hari ini.' : 'Beli secukupnya, jangan menimbun stok.',
    flat: 'Belanja seperti biasa.',
    mixed: bulk ? 'Borong sesuai rekomendasi hari ini.' : 'Beli sesuai rekomendasi, jangan menimbun stok.',
  });
  const range14 = readRange(data.current_price, data.p14_10, data.p14_90, {
    up: 'Siapkan kas lebih untuk 2 minggu ke depan.',
    down: 'Tidak perlu menambah stok.',
    flat: 'Anggaran tetap seperti biasa.',
    mixed: 'Pegang dana cadangan sesuai kas sebulan di bawah.',
  });
  const thisMonth = new Date(`${asOf}T00:00:00`).getMonth();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Kemungkinan harga 7 hari ke depan"
          value={range7.value}
          verdict={range7.verdict}
          hint={`${formatIDR(data.p7_10)} – ${formatIDR(data.p7_90)} per kg, dari ${formatIDR(data.current_price)} hari ini`}
          action={range7.action}
          info="Dibanding harga hari ini. 8 dari 10 kemungkinan harga 7 hari lagi berada di rentang ini."
        />
        <StatTile
          label="Kemungkinan harga 14 hari ke depan"
          value={range14.value}
          verdict={range14.verdict}
          hint={`${formatIDR(data.p14_10)} – ${formatIDR(data.p14_90)} per kg, dari ${formatIDR(data.current_price)} hari ini`}
          action={range14.action}
          info="Dibanding harga hari ini. 8 dari 10 kemungkinan harga 14 hari lagi berada di rentang ini."
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

      <Card className="mt-6">
        <CardHeader title={`Kas untuk ${commodity.toLowerCase()} sebulan`} subtitle={`± ${monthlyKg.toLocaleString('id-ID', { maximumFractionDigits: 1 })} kg (4 minggu, termasuk cadangan susut)`} />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Skenario murah', value: monthlyKg * data.p14_10, cls: 'bg-surface-muted' },
            { label: 'Anggaran disarankan', value: monthlyKg * data.p14_50, cls: 'bg-accent text-white' },
            { label: 'Cadangan aman', value: monthlyKg * data.p14_90, cls: 'bg-gold-soft text-gold-ink' },
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
          <Row label="Persentase 7 dan 14 hari" value="rentang perubahan dari harga hari ini" note="Delapan dari sepuluh kemungkinan harga berada di rentang ini." />
          <Row label="Status" value="dibaca dari rentang tersebut" note="Stabil: naik dan turunnya sama-sama di bawah 3%. Cenderung naik atau turun: hampir seluruh rentang mengarah ke satu sisi. Bisa naik-turun: harga bisa bergerak ke dua arah." />
          <Row label="Area hijau muda di grafik" value="kemungkinan harga" note="Delapan dari sepuluh kemungkinan harga berada di dalam area ini. Makin lebar, makin tidak pasti." />
          <Row label="Skenario murah" value="harga turun ke batas bawah" note="Kebutuhan sebulan dikali perkiraan harga terendah 14 hari ke depan." />
          <Row label="Anggaran disarankan" value="harga tengah" note="Kebutuhan sebulan dikali perkiraan harga tengah. Inilah yang sebaiknya disiapkan." />
          <Row label="Cadangan aman" value="harga naik ke batas atas" note="Kebutuhan sebulan dikali perkiraan harga tertinggi. Simpan selisihnya dari anggaran untuk jaga-jaga." />
          <Row label="Kalender musiman" value="pola umum tiap tahun" note="Berdasarkan pola harga pangan segar di Jawa, bukan perkiraan khusus bahan ini." />
        </dl>
      </Disclosure>
    </div>
  );
}

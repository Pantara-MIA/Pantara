import { CalendarClock, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { InfoTip } from '../../components/ui/InfoTip';
import { StatTile } from '../../components/ui/StatTile';
import type { VerdictTone } from '../../components/ui/Badge';
import type { DecisionResult, ProcurementResponse } from '../../lib/api';
import { storageOf, weeklyUsage } from '../../lib/profile';
import { addDays, formatDate, formatIDR, formatNumber, formatPct } from '../../lib/format';
import { NoData } from './shared';
import type { MsmeTabProps } from './shared';

interface Reading {
  label: string;
  tone: VerdictTone;
  action: string;
}

/** Prices within this distance of the 90-day median count as normal. */
const NORMAL_PRICE_BAND_PCT = 5;

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Is today's price cheap or expensive for this market? */
function readPrice(data: ProcurementResponse): Reading & { typical: number; gapPct: number } {
  const typical = data.history.length > 0 ? median(data.history.map((h) => h.price)) : data.current_price;
  const gapPct = typical > 0 ? ((data.current_price - typical) / typical) * 100 : 0;
  if (gapPct <= -NORMAL_PRICE_BAND_PCT) return { typical, gapPct, label: 'Murah', tone: 'good', action: 'Waktu yang baik untuk belanja.' };
  if (gapPct >= NORMAL_PRICE_BAND_PCT) return { typical, gapPct, label: 'Mahal', tone: 'critical', action: 'Beli sesuai jumlah di atas, jangan lebih.' };
  return { typical, gapPct, label: 'Wajar', tone: 'good', action: 'Belanja sesuai jumlah di atas.' };
}

/** How likely is the advice to miss, and what to do about it. */
function readRisk(d: DecisionResult): Reading {
  const bulk = d.weeks_covered === 2;
  const hedge = bulk ? `Bila ragu, beli ${formatNumber(d.kg_week1, 1)} kg untuk 1 minggu saja.` : `Sisihkan cadangan ${formatIDR(d.max_loss)} bila harga naik.`;
  if (d.loss_probability > 0.35) return { label: 'Tinggi', tone: 'critical', action: hedge };
  if (d.loss_probability > 0.2) return { label: 'Sedang', tone: 'warning', action: hedge };
  return { label: 'Rendah', tone: 'good', action: 'Aman, ikuti rekomendasi.' };
}

function HeroFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
      {icon}
      <div>
        <dt className="text-xs text-[#8FBF8F]">{label}</dt>
        <dd className="text-lg font-semibold">{value}</dd>
      </div>
    </div>
  );
}

/** "When do I buy, and how much?" — answered in the first line. */
export default function RecommendationTab({ profile, data, loading, commodity, asOf }: MsmeTabProps) {
  if (!data) return <NoData loading={loading} />;

  const d = data.decision;
  const storage = storageOf(profile.storage_method);
  const usage = weeklyUsage(profile, commodity);
  const bulk = d.weeks_covered === 2;
  // With bulk ruled out there is no real alternative to have saved against.
  const saving = d.bulk_locked ? 0 : d.potential_savings;
  const buffer = Math.max(0, d.kg_to_buy - usage * d.weeks_covered);
  const price = readPrice(data);
  const risk = readRisk(d);
  const lossPct = d.loss_probability < 0.001 ? '< 0,1%' : formatPct(d.loss_probability * 100);
  const gapText = Math.abs(price.gapPct) < 0.5 ? 'Sama dengan biasanya' : `${formatPct(Math.abs(price.gapPct))} ${price.gapPct > 0 ? 'di atas' : 'di bawah'} biasanya`;

  const coverageInfo = d.bulk_locked
    ? `Cara simpan ${storage.short} hanya tahan ${storage.shelfLife} hari. Borong 2 minggu butuh cara simpan yang tahan minimal 14 hari.`
    : bulk
      ? 'Stok aman disimpan 2 minggu dan total biayanya lebih rendah daripada belanja tiap minggu.'
      : 'Belanja tiap minggu lebih murah daripada borong 2 minggu, setelah bahan yang menyusut ikut dihitung.';

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-[#0D3311] text-white">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-gold uppercase">Rekomendasi hari ini · {formatDate(asOf)}</p>
            <p className="mt-3 font-display text-4xl leading-tight font-bold sm:text-5xl">
              Beli {formatNumber(d.kg_to_buy, 1)} kg {commodity.toLowerCase()}{' '}
              <InfoTip inverse label="Jumlah yang dibeli">
                Sudah termasuk cadangan {formatNumber(buffer, 1)} kg untuk bahan yang menyusut, sehingga kebutuhan {formatNumber(usage, 1)} kg per minggu tetap terpenuhi.
              </InfoTip>
            </p>
            <p className="mt-2 inline-flex items-center gap-1 text-lg text-[#C8E6C9]">
              {bulk ? 'Borong untuk 2 minggu' : 'Cukup untuk 1 minggu'}
              <InfoTip inverse label="Lama stok">
                {coverageInfo}
              </InfoTip>
            </p>
            {saving > 0 && (
              <p className="mt-4 flex items-center gap-1">
                <span className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-[#3A3113]">
                  Hemat {formatIDR(saving)} dibanding {bulk ? 'belanja mingguan' : 'borong 2 minggu'}
                </span>
                <InfoTip inverse label="Perhitungan hemat">
                  Perkiraan biaya untuk 2 minggu: belanja mingguan {formatIDR(d.weekly_cost)}, borong {formatIDR(d.bulk_cost)}.
                </InfoTip>
              </p>
            )}
          </div>
          <dl className="grid content-center gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <HeroFact icon={<Wallet className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />} label="Siapkan uang" value={formatIDR(d.kg_to_buy * data.current_price)} />
            <HeroFact icon={<CalendarClock className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />} label="Belanja lagi" value={formatDate(addDays(asOf, 7 * d.weeks_covered))} />
          </dl>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Harga hari ini"
          value={formatIDR(data.current_price)}
          unit="/kg"
          verdict={{ label: price.label, tone: price.tone }}
          hint={gapText}
          action={price.action}
          info={`Dibandingkan harga umum 90 hari terakhir di ${data.region_name}, yaitu ${formatIDR(price.typical)}/kg. Selisih kurang dari ${NORMAL_PRICE_BAND_PCT}% dianggap wajar.`}
        />
        <StatTile
          label="Risiko salah langkah"
          value={lossPct}
          verdict={{ label: risk.label, tone: risk.tone }}
          action={risk.action}
          info={
            bulk
              ? `Peluang harga pekan depan turun di bawah ${formatIDR(d.breakeven_price)}/kg, sehingga borong ternyata lebih mahal. Paling buruk, selisihnya ${formatIDR(d.max_loss)}.`
              : `Peluang harga pekan depan naik melewati ${formatIDR(d.breakeven_price)}/kg, sehingga belanja mingguan jadi lebih mahal. Paling buruk, biaya bertambah ${formatIDR(d.max_loss)}.`
          }
        />
      </div>
    </div>
  );
}

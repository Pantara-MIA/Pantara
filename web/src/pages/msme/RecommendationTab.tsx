import { CalendarClock, ShieldAlert, Wallet } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Tag } from '../../components/ui/Badge';
import { Notice } from '../../components/ui/Feedback';
import { TitleWithInfo } from '../../components/ui/InfoTip';
import { storageOf, weeklyUsage } from '../../lib/profile';
import { addDays, formatDate, formatIDR, formatIDRShort, formatNumber, formatPct } from '../../lib/format';
import { Disclosure, NoData, Row } from './shared';
import type { MsmeTabProps } from './shared';

/** "How many kg do I buy today?" — one decision, with the reasoning folded away. */
export default function RecommendationTab({ profile, data, loading, commodity, asOf }: MsmeTabProps) {
  if (!data) return <NoData loading={loading} />;

  const d = data.decision;
  const storage = storageOf(profile.storage_method);
  const usage = weeklyUsage(profile, commodity);
  const spend = d.kg_to_buy * data.current_price;
  const nextBuy = addDays(asOf, 7 * d.weeks_covered);
  const bulk = d.weeks_covered === 2;
  // With bulk ruled out there is no real alternative to have saved against.
  const saving = d.bulk_locked ? 0 : d.potential_savings;
  const lossPct = d.loss_probability < 0.001 ? '< 0,1%' : formatPct(d.loss_probability * 100);
  const riskTone = d.loss_probability > 0.35 ? 'text-critical-ink' : d.loss_probability > 0.2 ? 'text-warning-ink' : 'text-good-ink';

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-[#0D3311] text-white">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-gold uppercase">Rekomendasi hari ini · {formatDate(asOf)}</p>
            <p className="mt-3 font-display text-4xl leading-tight font-bold sm:text-5xl">
              Beli {formatNumber(d.kg_to_buy, 1)} kg {commodity.toLowerCase()}
            </p>
            <p className="mt-2 text-lg text-[#C8E6C9]">
              {bulk ? 'Borong untuk 2 minggu' : 'Cukup untuk 1 minggu'} — belanja lagi {formatDate(nextBuy)}.
            </p>
            {saving > 0 && (
              <p className="mt-4 inline-flex rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-[#3A3113]">
                Hemat {formatIDR(saving)} dibanding {bulk ? 'belanja mingguan' : 'borong 2 minggu'}
              </p>
            )}
          </div>
          <dl className="grid content-center gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
              <Wallet className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <div>
                <dt className="text-xs text-[#8FBF8F]">Uang yang disiapkan</dt>
                <dd className="text-lg font-semibold">{formatIDR(spend)}</dd>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
              <CalendarClock className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <div>
                <dt className="text-xs text-[#8FBF8F]">Harga pasar hari ini</dt>
                <dd className="text-lg font-semibold">{formatIDR(data.current_price)}/kg</dd>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <div>
                <dt className="text-xs text-[#8FBF8F]">Peluang keputusan meleset</dt>
                <dd className="text-lg font-semibold">{lossPct}</dd>
              </div>
            </div>
          </dl>
        </div>
      </section>

      {d.bulk_locked && (
        <Notice
          title={
            <TitleWithInfo
              text="Borong 2 minggu tidak disarankan"
              info="Agar bisa disarankan, bahan harus tahan disimpan minimal 14 hari. Ganti cara simpan menjadi Chiller atau Kedap Udara di menu Profil usaha."
            />
          }
        >
          {d.lock_reason}
        </Notice>
      )}

      <Card>
        <CardHeader title="Dua cara belanja, dibandingkan" subtitle="Sistem memilih perkiraan biaya terendah setelah memperhitungkan susut." />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {[
            { key: 1, title: 'Belanja mingguan', cost: d.weekly_cost, kg: `${formatNumber(d.kg_week1, 1)} kg sekarang + ${formatNumber(d.kg_week1, 1)} kg minggu depan` },
            { key: 2, title: 'Borong 2 minggu', cost: d.bulk_cost, kg: `${formatNumber(d.kg_bulk, 1)} kg sekarang`, locked: d.bulk_locked },
          ].map((s) => {
            const chosen = s.key === d.weeks_covered;
            return (
              <div key={s.key} className={`rounded-2xl border p-4 ${chosen ? 'border-accent bg-accent-soft' : 'border-line'} ${s.locked ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{s.title}</p>
                  {chosen ? <Tag tone="accent">Dipilih</Tag> : s.locked ? <Tag tone="warning">Tidak disarankan</Tag> : null}
                </div>
                <p className="mt-2 text-2xl font-semibold text-ink">{formatIDR(s.cost)}</p>
                <p className="mt-1 text-xs text-ink-3">{s.kg}</p>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Disclosure label="Lihat alasan & perhitungan">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">Harga yang dipakai</p>
            <dl className="mt-1 divide-y divide-line">
              <Row label="Harga hari ini" value={formatIDR(data.current_price)} />
              <Row
                label="Perkiraan harga pekan depan"
                value={formatIDR(d.expected_next_price)}
                note={`Rata-rata dari perkiraan terendah ${formatIDRShort(data.p7_10)}, tengah ${formatIDRShort(data.p7_50)}, dan tertinggi ${formatIDRShort(data.p7_90)}.`}
              />
              <Row
                label="Batas harga agar borong untung"
                value={formatIDR(d.breakeven_price)}
                note={`Borong baru untung bila harga pekan depan di atas angka ini (naik ${formatPct(d.breakeven_rise_pct)}). Perkiraan saat ini ${d.expected_next_price > d.breakeven_price ? 'sudah melewati' : 'masih di bawah'} batas tersebut.`}
              />
              <Row label="Kerugian terburuk bila meleset" value={<span className={riskTone}>{formatIDR(d.max_loss)}</span>} note={`Peluang meleset ${lossPct}, dilihat dari kemungkinan harga 7 hari ke depan.`} />
            </dl>
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">Data usaha Anda</p>
            <dl className="mt-1 divide-y divide-line">
              <Row label="Pemakaian rutin" value={`${formatNumber(usage, 1)} kg/minggu`} />
              <Row label="Metode simpan" value={storage.short} note={`Susut ${formatPct(storage.decay * 100, 1)} per hari, tahan ${storage.shelfLife} hari.`} />
              <Row label="Jumlah beli minggu pertama" value={`${formatNumber(d.kg_week1, 2)} kg`} note={`Pemakaian rutin ditambah cadangan ${formatNumber(d.margin_kg, 2)} kg untuk bahan yang menyusut.`} />
              <Row label="Jumlah beli minggu kedua" value={`${formatNumber(d.kg_week2, 2)} kg`} note="Cadangannya lebih besar karena stok menunggu lebih lama." />
              <Row label="Pasar acuan" value={profile.reference_market} note={`Harga ${data.region_name}, sumber ${data.source_label}${data.source === 'synthetic' ? ' (simulasi)' : ''}.`} />
            </dl>
          </div>
        </div>
      </Disclosure>
    </div>
  );
}

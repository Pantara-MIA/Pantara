import { Shuffle, Sparkles } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Tag } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { formatDate, formatIDR, formatNumber } from '../../lib/format';
import { Disclosure, NoData, Row } from './shared';
import type { MsmeTabProps } from './shared';

/** Historical dates known to trigger the signal, for a live demonstration. */
const DEMO_TRIGGERS = [
  { date: '2024-09-09', note: 'Rawit merah melonjak jauh di atas dua varian lain.' },
  { date: '2025-04-23', note: 'Rasio rawit merah vs rawit hijau menyimpang 2,4 simpangan baku.' },
];

/** Variant-switch signal: when a functionally equivalent variant is unusually cheaper. */
export default function SubstitutionTab({ data, loading, commodity, asOf, onPickDate }: MsmeTabProps & { onPickDate: (d: string) => void }) {
  if (!data) return <NoData loading={loading} />;
  const active = data.substitution ?? null;
  const candidates = data.substitution_candidates ?? [];

  return (
    <div className="space-y-6">
      {active ? (
        <section className="rounded-3xl bg-gold-soft p-6 sm:p-8">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.16em] text-gold-ink uppercase">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Sinyal aktif · {formatDate(active.date)}
          </p>
          <p className="mt-2 font-display text-3xl leading-tight font-bold text-gold-ink sm:text-4xl">
            Ganti sebagian {commodity.toLowerCase()} dengan {active.recommendation.toLowerCase()}
          </p>
          <p className="mt-2 text-gold-ink">
            Lebih murah {formatIDR(active.diff_per_kg)}/kg — hemat sekitar <strong>{formatIDR(active.savings)}</strong> untuk {formatNumber(active.kg_used, 1)} kg belanja ini.
          </p>
        </section>
      ) : (
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.16em] text-ink-3 uppercase">
            <Shuffle className="h-4 w-4" aria-hidden="true" /> Pemantauan berjalan · {formatDate(asOf)}
          </p>
          <p className="mt-2 font-display text-3xl leading-tight font-bold text-ink">Tetap pakai {commodity.toLowerCase()}</p>
          <p className="mt-2 text-ink-2">Tidak ada varian setara yang sedang jauh lebih murah dari biasanya. Sinyal menyala bila ada penyimpangan harga yang tidak wajar.</p>
        </section>
      )}

      <Card>
        <CardHeader title="Posisi setiap varian" subtitle="Sinyal menyala bila penyimpangan rasio harga ≥ ambang dan varian itu memang lebih murah." />
        <CardBody>
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-2">Komoditas ini belum memiliki varian setara yang dipantau.</p>
          ) : (
            <ul className="space-y-4">
              {candidates.map((c) => {
                const z = c.detail?.z ?? 0;
                const threshold = c.detail?.threshold ?? 2.4;
                const pct = Math.max(0, Math.min(1, (z + threshold) / (threshold * 2))) * 100;
                return (
                  <li key={c.commodity}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{c.commodity}</span>
                      {c.active ? <Tag tone="accent">Sinyal aktif</Tag> : <Tag>Diam</Tag>}
                    </div>
                    <div className="relative mt-2 h-2 rounded-full bg-surface-muted" aria-hidden="true">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-mint" style={{ width: `${pct}%` }} />
                      <span className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: '100%' }} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-3">
                      Penyimpangan z = {formatNumber(z, 2)} (ambang {formatNumber(threshold, 1)}) · {c.detail?.reason}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Lihat sinyal ini menyala" subtitle="Lompat ke tanggal historis yang terbukti memicu sinyal." />
        <CardBody className="space-y-2">
          {DEMO_TRIGGERS.map((t) => (
            <div key={t.date} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-ink">{formatDate(t.date)}</span>
                <span className="block text-xs text-ink-3">{t.note}</span>
              </span>
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => onPickDate(t.date)}>
                Pakai tanggal ini
              </Button>
            </div>
          ))}
          <p className="text-xs text-ink-3">Peragaan memakai Cabai Rawit Merah; pilih komoditas itu di atas.</p>
        </CardBody>
      </Card>

      <Disclosure label="Bagaimana sinyal dihitung">
        <dl className="divide-y divide-line">
          <Row label="Rasio harga" value="harga varian ini ÷ varian setara" formula="Dipantau setiap hari untuk setiap pasangan varian sepadan mutu." />
          <Row label="Penyimpangan (z)" value="(rasio hari ini − median 90 hari) ÷ simpangan baku" />
          <Row label="Syarat menyala" value="z ≥ 2,4 dan varian setara lebih murah" formula="Varian sepadan mutu saja — sistem tidak menyarankan menurunkan grade bahan pokok." />
        </dl>
      </Disclosure>
    </div>
  );
}

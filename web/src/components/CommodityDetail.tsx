import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, ChevronRight, Droplets, Thermometer, XCircle } from 'lucide-react';
import type { Commodity, StorageKey } from '../data/types';
import { STORAGE_META } from '../data/types';
import { VOLATILITY_META, getStorage, simulateWaste } from '../data/commodities';
import { formatIDR, formatNumber } from '../lib/format';
import { Dialog } from './ui/Dialog';
import { Tabs } from './ui/Tabs';
import { SegmentedControl } from './ui/SegmentedControl';
import CommodityArt from './CommodityArt';
import { AXIS_TICK, CHART } from './charts/theme';

type TabKey = 'profile' | 'impact' | 'decay' | 'storage';

const TABS: { value: TabKey; label: string }[] = [
  { value: 'profile', label: 'Profil' },
  { value: 'impact', label: 'Dampak harga' },
  { value: 'decay', label: 'Laju susut' },
  { value: 'storage', label: 'Cara simpan' },
];

/** Commodity knowledge sheet in a dialog: profile, price impact, decay and storage. */
export default function CommodityDetail({ commodity, onClose }: { commodity: Commodity | null; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('profile');
  const c = commodity;
  return (
    <Dialog open={!!c} onClose={onClose} size="lg" title={c?.name ?? ''} description={c?.tagline}>
      {c && (
        <div key={c.id} className="space-y-5">
          <Header c={c} />
          <Tabs<TabKey> label="Bagian detail komoditas" idPrefix="commodity" items={TABS} value={tab} onChange={setTab} />
          <div role="tabpanel" id={`commodity-panel-${tab}`} aria-labelledby={`commodity-tab-${tab}`}>
            {tab === 'profile' && <ProfileTab c={c} />}
            {tab === 'impact' && <ImpactTab c={c} />}
            {tab === 'decay' && <DecayTab c={c} />}
            {tab === 'storage' && <StorageTab c={c} />}
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
            <Link
              to={`/simulator?komoditas=${c.id}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              Simulasikan susut {c.shortName} <ChevronRight className="h-4 w-4" />
            </Link>
            <Link to="/rapor-daerah" className="inline-flex items-center justify-center rounded-full border border-line-strong px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted">
              Lihat harga per daerah
            </Link>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Header({ c }: { c: Commodity }) {
  const vol = VOLATILITY_META[c.volatility];
  const up = c.yoy >= 0;
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <CommodityArt art={c.art} photo={c.photo} alt="" className="h-28 w-full shrink-0 overflow-hidden rounded-2xl sm:w-40" />
      <dl className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
        <Fact label="Harga acuan" value={`${formatIDR(c.price)}/${c.unit}`} />
        <Fact label="vs tahun lalu" value={`${up ? '+' : ''}${formatNumber(c.yoy)}%`} tone={up ? 'bad' : 'good'} />
        <Fact label="Gejolak 30 hari" value={`CV ${formatNumber(c.cv)}%`} badge={<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${vol.cls}`}>{vol.label}</span>} />
      </dl>
    </div>
  );
}

function Fact({ label, value, tone, badge }: { label: string; value: string; tone?: 'good' | 'bad'; badge?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2.5">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className={`mt-0.5 text-base font-semibold ${tone === 'bad' ? 'text-critical-ink' : tone === 'good' ? 'text-good-ink' : 'text-ink'}`}>{value}</dd>
      {badge && <dd className="mt-1">{badge}</dd>}
    </div>
  );
}

function Paragraphs({ items }: { items: string[] }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-2">
      {items.map((p) => (
        <p key={p.slice(0, 40)}>{p}</p>
      ))}
    </div>
  );
}

function ProfileTab({ c }: { c: Commodity }) {
  const best = getStorage(c, c.storage.best);
  return (
    <div className="space-y-4">
      <Paragraphs items={c.description} />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="Simpan terbaik" value={`${STORAGE_META[c.storage.best].short} · ${best.shelfLifeDays} hr`} />
        <Fact label="Susut terendah" value={`${formatNumber(best.decayPerDay * 100, 2)}%/hari`} />
        <Fact label="Suhu ideal" value={c.storage.idealTemp} />
        <Fact label="Kelembapan" value={c.storage.idealHumidity} />
      </dl>
      <p className="rounded-xl border border-gold/60 bg-gold-soft px-4 py-3 text-sm text-gold-ink">
        <strong>Waspadai:</strong> {c.impact.peakMonths}
      </p>
    </div>
  );
}

function ImpactTab({ c }: { c: Commodity }) {
  return (
    <div className="space-y-4">
      <Paragraphs items={c.impact.narrative} />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Fact label="Bobot dalam IHK nasional" value={`${formatNumber(c.impact.weightCpi, 2)}%`} />
        <Fact label="Andil inflasi bulan puncak" value={`${formatNumber(c.impact.andil, 2)} poin`} />
        <Fact label="Ayunan harga setahun" value={`±${c.impact.swingPct}%`} />
      </dl>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {c.impact.facts.map((f) => (
          <li key={f.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span>
              <span className="block text-sm font-semibold text-ink">{f.label}</span>
              <span className="block text-xs text-ink-3">{f.hint}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{f.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecayTab({ c }: { c: Commodity }) {
  const [storage, setStorage] = useState<StorageKey>(c.storage.best);
  const [days, setDays] = useState(7);
  const profile = getStorage(c, storage);
  const sim = useMemo(() => simulateWaste(c, 10, storage, days), [c, storage, days]);
  const rows = sim.curve.map((kg, day) => ({ day, kg }));

  return (
    <div className="space-y-4">
      <SegmentedControl
        label="Metode simpan"
        size="sm"
        value={storage}
        onChange={setStorage}
        options={c.decay.map((d) => ({ value: d.key, label: `${STORAGE_META[d.key].short}${d.warning ? ' ⚠' : ''}` }))}
      />
      {profile.warning && (
        <p className="flex items-start gap-2 rounded-xl bg-critical-soft px-4 py-3 text-sm text-critical-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {profile.warning}
        </p>
      )}

      <figure className="m-0 rounded-2xl border border-line p-4">
        <figcaption className="mb-2 flex justify-between text-sm">
          <span className="font-semibold text-ink">Sisa bobot layak dari 10 kg</span>
          <span className="text-ink-3">
            {formatNumber(profile.decayPerDay * 100, 2)}%/hari · batas {profile.shelfLifeDays} hari
          </span>
        </figcaption>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} tickFormatter={(d) => `h${d}`} />
              <YAxis domain={[0, 10]} ticks={[0, 2.5, 5, 7.5, 10]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
              {profile.shelfLifeDays <= days && (
                <ReferenceLine x={profile.shelfLifeDays} stroke={CHART.ink3} strokeDasharray="4 3" label={{ value: 'batas simpan', position: 'insideTopRight', fill: CHART.ink3, fontSize: 10 }} />
              )}
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: CHART.ink3, strokeWidth: 1 }}
                content={(p) => {
                  const r = p.active ? (p.payload?.[0]?.payload as { day: number; kg: number } | undefined) : undefined;
                  return r ? (
                    <div className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs shadow-lg">
                      <span className="font-semibold">{formatNumber(r.kg, 2)} kg</span> <span className="text-ink-3">hari ke-{r.day}</span>
                    </div>
                  ) : null;
                }}
              />
              <Line dataKey="kg" stroke={CHART.series1} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <label className="mt-3 block text-sm text-ink-2">
          Lama simpan: <strong className="text-ink">{days} hari</strong>
          <input type="range" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-accent)]" />
        </label>
      </figure>

      <dl className="grid grid-cols-3 gap-2">
        <Fact label="Sisa layak" value={`${formatNumber(sim.usableKg, 2)} kg`} />
        <Fact label="Terbuang" value={`${formatNumber(sim.wasteKg, 2)} kg`} tone="bad" />
        <Fact label="Kerugian" value={formatIDR(sim.cashLoss)} tone="bad" />
      </dl>
      {sim.beyondShelfLife && (
        <p className="rounded-xl bg-critical-soft px-4 py-2.5 text-sm text-critical-ink">
          Melewati batas {profile.shelfLifeDays} hari — bahan sudah tidak layak jual meski bobotnya masih tersisa.
        </p>
      )}
      <p className="text-xs text-ink-3">{profile.note}</p>
    </div>
  );
}

function StorageTab({ c }: { c: Commodity }) {
  const best = STORAGE_META[c.storage.best];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-accent px-4 py-3 text-white">
        <p className="text-xs font-semibold text-mint">Tempat simpan terbaik</p>
        <p className="mt-0.5 text-lg font-semibold">
          {best.icon} {best.label}
        </p>
        <p className="mt-1 text-sm text-[#C8E6C9]">{best.desc}</p>
        <p className="mt-2 flex flex-wrap gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <Thermometer className="h-3.5 w-3.5" /> {c.storage.idealTemp}
          </span>
          <span className="inline-flex items-center gap-1">
            <Droplets className="h-3.5 w-3.5" /> {c.storage.idealHumidity}
          </span>
        </p>
      </div>

      <ol className="space-y-2">
        {c.storage.steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border border-line px-4 py-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
            <span>
              <span className="block text-sm font-semibold text-ink">{s.title}</span>
              <span className="block text-sm text-ink-2">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <ListBox title="Lakukan" icon={<CheckCircle2 className="h-4 w-4 text-good" />} items={c.storage.dos} />
        <ListBox title="Hindari" icon={<XCircle className="h-4 w-4 text-critical" />} items={c.storage.donts} />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Olahan bila stok berlebih</p>
        <ul className="space-y-2">
          {c.storage.processing.map((p) => (
            <li key={p.name} className="rounded-xl bg-gold-soft px-4 py-2.5">
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-gold-ink">
                {p.name}
                <span className="shrink-0 text-xs font-medium">{p.life}</span>
              </span>
              <span className="block text-sm text-gold-ink/90">{p.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ListBox({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        {icon} {title}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
        {items.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </div>
  );
}

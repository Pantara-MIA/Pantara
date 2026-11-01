import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Lock, RotateCcw, Sparkles } from 'lucide-react';
import type { StorageKey } from '../data/types';
import { STORAGE_META } from '../data/types';
import { COMMODITIES, DATA_DISCLAIMER, getCommodity, getStorage, simulateWaste } from '../data/commodities';
import { SiteShell, PageHeader } from '../components/layout/SiteShell';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Tag } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Reveal } from '../components/motion/Reveal';
import { AnimatedValue, CommodityPicker, DecayCurve, SpikeMeter, StockTube, StorageCards } from '../components/simulator/SimulatorVisuals';
import { formatIDR, formatNumber } from '../lib/format';

/** Probability above which stockpiling is worth considering. */
const STOCKPILE_PROB_THRESHOLD = 25;

function Slider({ label, value, min, max, step = 1, unit, onChange, hint }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void; hint?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-ink-2">{label}</span>
        <span className="text-lg font-semibold text-ink">
          {value} <span className="text-sm font-normal text-ink-3">{unit}</span>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-2 w-full cursor-grab appearance-none rounded-full accent-[var(--color-accent)] active:cursor-grabbing"
        style={{ background: `linear-gradient(90deg, var(--color-accent) ${pct}%, var(--color-mint) ${pct}%)` }}
      />
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

/** Public waste simulator: what a kitchen loses by storing produce too long. */
export default function Simulator() {
  const [params, setParams] = useSearchParams();
  const commodity = getCommodity(params.get('komoditas') ?? '') ?? COMMODITIES[0];
  const [weight, setWeight] = useState(10);
  const [days, setDays] = useState(7);
  const [pickedStorage, setPickedStorage] = useState<StorageKey>('room');

  // Derived during render: a commodity without the picked method falls back to room temperature.
  const storage: StorageKey = commodity.decay.some((d) => d.key === pickedStorage) ? pickedStorage : 'room';
  const sim = useMemo(() => simulateWaste(commodity, weight, storage, days), [commodity, weight, storage, days]);
  const profile = getStorage(commodity, storage);

  // Suggest the curated best method, not just the lowest decay: freezing saves weight
  // but ruins some produce (whole onions, potatoes), so it is not always advisable.
  const bestAlt = sim.alternatives.find((a) => a.key === commodity.storage.best) ?? sim.alternatives[0];
  const saving = sim.cashLoss - bestAlt.cashLoss;
  const worthStockpiling = sim.spikeProbabilityPct > STOCKPILE_PROB_THRESHOLD;
  const worstLoss = Math.max(...sim.alternatives.map((a) => a.cashLoss), 1);
  const curves = useMemo(
    () =>
      commodity.decay.map((d) => ({
        key: d.key,
        label: STORAGE_META[d.key].short,
        values: Array.from({ length: days + 1 }, (_, i) => weight * Math.pow(1 - d.decayPerDay, i)),
      })),
    [commodity, weight, days],
  );

  const pick = (id: string) =>
    setParams(
      (p) => {
        p.set('komoditas', id);
        return p;
      },
      { replace: true },
    );

  const reset = () => {
    setWeight(10);
    setDays(7);
    setPickedStorage('room');
  };

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Simulator susut dapur"
        title="Berapa yang membusuk sebelum terpakai?"
        description="Pilih bahan, geser bobot dan lama simpan, ganti metode simpan — lihat stok Anda menyusut, berapa rupiah yang hilang, dan apakah menimbun masih masuk akal."
      />

      <Reveal className="mb-6">
        <Card>
          <CardBody>
            <CommodityPicker items={COMMODITIES} value={commodity.id} onChange={pick} />
          </CardBody>
        </Card>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Reveal dir="left" className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader
              title="Parameter dapur"
              subtitle={`${commodity.name} · ${formatIDR(commodity.price)}/${commodity.unit}`}
              actions={
                <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5" /> Atur ulang
                </Button>
              }
            />
            <CardBody className="space-y-5">
              <Slider label="Bobot belanja" value={weight} min={1} max={50} unit="kg" onChange={setWeight} />
              <Slider label="Lama simpan" value={days} min={1} max={30} unit="hari" onChange={setDays} hint={`Batas aman metode ini ${profile.shelfLifeDays} hari`} />
              <div className="space-y-2">
                <span className="text-sm font-semibold text-ink-2">Metode simpan</span>
                <StorageCards
                  value={storage}
                  onChange={(k) => setPickedStorage(k as StorageKey)}
                  options={commodity.decay.map((d) => ({
                    key: d.key,
                    icon: STORAGE_META[d.key].icon,
                    label: STORAGE_META[d.key].short,
                    decayPerDay: d.decayPerDay,
                    shelfLifeDays: d.shelfLifeDays,
                    warning: !!d.warning,
                    best: d.key === commodity.storage.best,
                  }))}
                />
                <p className="text-xs text-ink-3">{profile.warning ?? STORAGE_META[storage].desc}</p>
              </div>
            </CardBody>
          </Card>
        </Reveal>

        <div className="space-y-6">
          <Reveal dir="right">
            <section className="grid gap-6 rounded-3xl bg-[#0D3311] p-6 text-white sm:grid-cols-[minmax(0,1fr)_auto] sm:p-8">
              <div className="flex flex-col justify-between gap-6">
                <div>
                  <p className="text-xs font-bold tracking-[0.16em] text-gold uppercase">Kerugian</p>
                  <p className="mt-2 font-display text-4xl font-bold sm:text-5xl">
                    <AnimatedValue value={sim.cashLoss} format={formatIDR} />
                  </p>
                  <p className="mt-1 text-sm text-[#C8E6C9]">
                    dari belanja {formatIDR(weight * commodity.price)} · {days} hari di {STORAGE_META[storage].short.toLowerCase()}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs text-[#8FBF8F]">Bila pola belanja ini berulang</p>
                  <p className="text-xl font-semibold">
                    <AnimatedValue value={sim.cashLoss * (30 / Math.max(1, days))} format={formatIDR} /> <span className="text-sm font-normal text-[#C8E6C9]">/ bulan</span>
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-4 text-ink">
                <StockTube initial={weight} usable={sim.usableKg} pastShelfLife={sim.beyondShelfLife} />
              </div>
            </section>
          </Reveal>

          <Reveal>
            <Card>
              <CardHeader title="Kurva bobot layak pakai" subtitle={`${STORAGE_META[storage].label} (hijau) dibanding metode lain (abu-abu)`} />
              <CardBody>
                <DecayCurve series={curves} activeKey={storage} weight={weight} shelfLife={profile.shelfLifeDays} />
              </CardBody>
            </Card>
          </Reveal>

          <Reveal>
            <Card>
              <CardHeader title={`Apakah menimbun ${days} hari masuk akal?`} />
              <CardBody className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-gold-soft px-4 py-3">
                    <p className="text-xs text-gold-ink">Kenaikan harga yang dibutuhkan agar impas</p>
                    <p className="text-2xl font-semibold text-gold-ink">
                      +<AnimatedValue value={sim.breakevenHikePct} format={(v) => `${formatNumber(v, 1)}%`} />
                    </p>
                  </div>
                  <div className={`rounded-xl px-4 py-3 transition-colors ${worthStockpiling ? 'bg-good-soft' : 'bg-critical-soft'}`}>
                    <p className={`text-xs ${worthStockpiling ? 'text-good-ink' : 'text-critical-ink'}`}>Peluang lonjakan sebesar itu terjadi</p>
                    <p className={`text-2xl font-semibold ${worthStockpiling ? 'text-good-ink' : 'text-critical-ink'}`}>
                      <AnimatedValue value={sim.spikeProbabilityPct} format={(v) => `${formatNumber(v, 1)}%`} />
                    </p>
                  </div>
                </div>
                <SpikeMeter probabilityPct={sim.spikeProbabilityPct} thresholdPct={STOCKPILE_PROB_THRESHOLD} />
                <p className="text-sm text-ink-2">
                  {worthStockpiling
                    ? `Menimbun ${weight} kg selama ${days} hari layak dipertimbangkan — peluang harga naik cukup besar untuk menutup susut. Pastikan metode simpannya benar.`
                    : `Kemungkinan besar merugi: lonjakan +${formatNumber(sim.breakevenHikePct, 1)}% jarang terjadi dalam ${days} hari. Belanja lebih sering dengan bobot lebih kecil.`}
                </p>
              </CardBody>
            </Card>
          </Reveal>

          <Reveal>
            <Card>
              <CardHeader title="Bandingkan metode simpan" subtitle="Bobot dan lama simpan sama; pilih untuk menerapkan." />
              <CardBody>
                <ul className="space-y-2">
                  {sim.alternatives.map((alt) => {
                    const p = getStorage(commodity, alt.key);
                    const on = alt.key === storage;
                    return (
                      <li key={alt.key}>
                        <button
                          type="button"
                          onClick={() => setPickedStorage(alt.key)}
                          aria-pressed={on}
                          className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-line hover:border-mint'}`}
                        >
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                              {STORAGE_META[alt.key].icon} {STORAGE_META[alt.key].short}
                              {alt.key === commodity.storage.best && <Tag tone="accent">terbaik</Tag>}
                              {p.warning && <Tag tone="warning">hindari</Tag>}
                            </span>
                            <span className="text-sm font-semibold text-ink tabular-nums">
                              <AnimatedValue value={alt.cashLoss} format={formatIDR} />
                            </span>
                          </span>
                          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-muted">
                            <span className="block h-full rounded-full bg-critical transition-[width] duration-700 ease-out" style={{ width: `${(alt.cashLoss / worstLoss) * 100}%` }} />
                          </span>
                          <span className="mt-1 block text-xs text-ink-3">
                            sisa {formatNumber(alt.usableKg, 2)} kg · batas {p.shelfLifeDays} hari
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {saving > 500 && (
                  <p className="mt-4 flex items-start gap-2 rounded-xl bg-gold-soft px-4 py-3 text-sm text-gold-ink">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Pindah ke {STORAGE_META[bestAlt.key].short} menyelamatkan {formatIDR(saving)} pada belanja ini — sekitar {formatIDR(saving * (30 / Math.max(1, days)))} per bulan
                    bila polanya berulang.
                  </p>
                )}
              </CardBody>
            </Card>
          </Reveal>

          <Reveal dir="scale">
            <div className="rounded-3xl bg-gradient-to-br from-[#1B5E20] to-[#2E7D32] p-6 text-white">
              <h2 className="font-display text-2xl font-bold">Hitung untuk dapur Anda sendiri</h2>
              <p className="mt-2 max-w-lg text-sm text-[#C8E6C9]">
                Daftarkan usaha, masukkan pemakaian mingguan dan fasilitas simpan, lalu Pantara menghitung berapa kilogram yang sebaiknya dibeli hari ini.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  to={`/login?komoditas=${commodity.id}&kg=${weight}&simpan=${storage}&hari=${days}`}
                  className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-[#3A3113] hover:brightness-95"
                >
                  <Lock className="h-4 w-4" /> Kunci parameter &amp; daftar
                </Link>
                <Link to={`/ensiklopedia?komoditas=${commodity.id}`} className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-bold hover:bg-white/10">
                  Cara menyimpan {commodity.shortName} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>

          <p className="text-xs text-ink-3">
            {DATA_DISCLAIMER} Peluang lonjakan diperkirakan dari sebaran lognormal dengan volatilitas historis komoditas.
          </p>
        </div>
      </div>
    </SiteShell>
  );
}

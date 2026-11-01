import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ClipboardCheck,
  Eye,
  FileCheck2,
  Landmark,
  LineChart,
  Scale,
  ShoppingBasket,
  Snowflake,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { Commodity } from '../data/types';
import { COMMODITIES } from '../data/commodities';
import { SiteShell } from '../components/layout/SiteShell';
import { StatusBadge } from '../components/ui/Badge';
import { GeoMap } from '../components/charts/GeoMap';
import { GradeScaleLegend } from '../components/charts/ScaleLegend';
import CommodityCard from '../components/CommodityCard';
import { API_BASE } from '../lib/api';
import { NATIONAL_SCOPE, fetchRegions, fetchScorecard } from '../lib/regional';
import { useGeo } from '../lib/geo';
import type { AlertStatus } from '../lib/regional';
import { GRADE_META, formatMonth } from '../lib/scorecard';
import { formatDate, formatIDR, formatNumber, formatPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { CountUp, Reveal } from '../components/motion/Reveal';

// The detail sheet pulls in the chart library; load it only when a commodity is opened.
const CommodityDetail = lazy(() => import('../components/CommodityDetail'));

/** Home: what Pantara is, who it serves, and a live slice of the data. */
export default function Landing() {
  const [active, setActive] = useState<Commodity | null>(null);
  const wide = useMediaQuery('(min-width: 1024px)');
  return (
    <SiteShell fullBleed>
      <FirstScreen>
        <Hero wide={wide} />
        <PriceTicker onOpen={setActive} />
      </FirstScreen>
      {!wide && (
        <section className="bg-[#0D3311] py-8">
          <div className={container}>
            <HeroMapCard />
          </div>
        </section>
      )}
      <Audiences />
      <AccountabilityLoop />
      <LiveAlerts />
      <MsmeRisks />
      <EncyclopediaPreview onOpen={setActive} />
      <Trust />
      <FinalCta />
      {active && (
        <Suspense fallback={null}>
          <CommodityDetail key={active.id} commodity={active} onClose={() => setActive(null)} />
        </Suspense>
      )}
    </SiteShell>
  );
}

const container = 'mx-auto w-full max-w-7xl px-4 sm:px-6';

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <Reveal className="mb-8 max-w-3xl">
      <p className="text-xs font-bold tracking-[0.16em] text-ink-3 uppercase">{eyebrow}</p>
      <h2 className="mt-1.5 font-display text-3xl leading-tight font-bold text-ink sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-base text-ink-2">{children}</p>}
    </Reveal>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/**
 * Fills exactly the visible viewport below the banner and header (measured, as
 * the banner wraps on narrow screens), so the price ticker sits on the bottom
 * edge. On short viewports it grows with its content instead of clipping.
 */
function FirstScreen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (ref.current) setTop(ref.current.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div ref={ref} className="flex flex-col" style={{ minHeight: `calc(100svh - ${top}px)` }}>
      {children}
    </div>
  );
}

function Hero({ wide }: { wide: boolean }) {
  return (
    <section className="relative flex flex-1 items-center overflow-hidden bg-[#0D3311] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{ backgroundImage: 'linear-gradient(rgba(165,214,167,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(165,214,167,.5) 1px,transparent 1px)', backgroundSize: '56px 56px' }}
        aria-hidden="true"
      />
      <div className={`${container} relative grid items-center gap-10 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-20`}>
        <div className="anim-rise">
          <p className="text-xs font-bold tracking-[0.18em] text-gold uppercase">Transparansi harga pangan · Indonesia</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.08] font-bold sm:text-5xl lg:text-6xl">
            Harga pangan terbuka, <span className="text-gold">keputusan berbasis data.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-[#C8E6C9]">
            Pantara memantau harga pangan di 34 provinsi dari data PIHPS hingga ke kabupaten/kota, memberi rapor stabilitas harga setiap daerah,
            memperingatkan lonjakan sebelum terjadi, dan membuka setiap intervensi pemerintah untuk dinilai publik.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/rapor-daerah"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-bold text-[#3A3113] shadow-[0_12px_28px_-14px_rgba(211,190,109,0.95)] hover:brightness-95"
            >
              Lihat Rapor Daerah <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#peran" className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">
              Untuk siapa Pantara?
            </a>
          </div>
        </div>

        {wide && <HeroMapCard />}
      </div>
    </section>
  );
}

/** National stability map snapshot: beside the hero on wide screens, below the ticker on narrow ones. */
function HeroMapCard() {
  const meta = useApi((s) => fetchRegions({ scope: NATIONAL_SCOPE }, s), []);
  const geo = useGeo(NATIONAL_SCOPE);
  const month = meta.data?.months.at(-1);
  const scorecard = useApi((s) => (month ? fetchScorecard(NATIONAL_SCOPE, month, undefined, s) : Promise.resolve(null)), [month]);
  const rows = useMemo(() => new Map(scorecard.data?.rows.map((r) => [r.region_id, r]) ?? []), [scorecard.data]);
  const avg = scorecard.data ? scorecard.data.rows.reduce((s, r) => s + r.score, 0) / scorecard.data.rows.length : undefined;
  const weak = scorecard.data?.rows.filter((r) => r.grade === 'D' || r.grade === 'E').length;

  return (
    <div className="anim-rise rounded-3xl bg-white p-4 text-ink shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] sm:p-5" style={{ '--rise-delay': '180ms' } as CSSProperties}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Predikat stabilitas harga {month ? `· ${formatMonth(month)}` : ''}</p>
        <Link to="/rapor-daerah" className="text-xs font-semibold text-accent hover:underline">
          Buka peta lengkap →
        </Link>
      </div>
      {meta.data && scorecard.data && geo ? (
        <GeoMap
          geo={geo}
          label="Cuplikan peta predikat stabilitas harga 34 provinsi"
          regions={meta.data.regions}
          valueOf={(r) => {
            const row = rows.get(r.id);
            return row
              ? {
                  fill: GRADE_META[row.grade].fill,
                  description: `predikat ${row.grade}, skor ${formatNumber(row.score)}`,
                  details: [
                    { label: 'Predikat', value: `${row.grade} · ${GRADE_META[row.grade].label}` },
                    { label: 'Skor', value: formatNumber(row.score) },
                  ],
                }
              : null;
          }}
        />
      ) : (
        <div className="aspect-[4/3] animate-pulse rounded-xl bg-surface-muted" />
      )}
      <div className="mt-3">
        <GradeScaleLegend />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-muted px-3 py-2">
          <dt className="text-xs text-ink-2">Skor stabilitas rata-rata</dt>
          <dd className="text-xl font-semibold">{avg !== undefined ? <CountUp to={avg} format={(v) => formatNumber(v)} /> : '–'}</dd>
        </div>
        <div className="rounded-xl bg-surface-muted px-3 py-2">
          <dt className="text-xs text-ink-2">Daerah rawan (D–E)</dt>
          <dd className="text-xl font-semibold">{weak !== undefined ? <CountUp to={weak} /> : '–'} <span className="text-sm font-normal text-ink-3">dari {scorecard.data?.rows.length ?? 34}</span></dd>
        </div>
      </dl>
    </div>
  );
}

// ─── Price ticker ────────────────────────────────────────────────────────────

function PriceTicker({ onOpen }: { onOpen: (c: Commodity) => void }) {
  const items = [...COMMODITIES, ...COMMODITIES];
  return (
    <section aria-label="Harga acuan komoditas" className="relative border-b border-line bg-surface py-3">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent" />
      <div className="group flex overflow-hidden">
        <div className="marquee flex shrink-0 gap-2 pr-2 group-hover:[animation-play-state:paused]">
          {items.map((c, i) => {
            const up = c.yoy >= 0;
            return (
              <button
                key={`${c.id}-${i}`}
                type="button"
                tabIndex={i < COMMODITIES.length ? 0 : -1}
                aria-hidden={i >= COMMODITIES.length}
                onClick={() => onOpen(c)}
                className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-page px-3.5 py-1.5 text-xs hover:border-mint"
              >
                <span aria-hidden="true">{c.emoji}</span>
                <span className="font-semibold text-ink">{c.shortName}</span>
                <span className="text-ink-2 tabular-nums">{formatIDR(c.price)}</span>
                <span className={`inline-flex items-center font-semibold ${up ? 'text-critical-ink' : 'text-good-ink'}`}>
                  {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {formatNumber(Math.abs(c.yoy))}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Audiences ───────────────────────────────────────────────────────────────

function Audiences() {
  const cards = [
    {
      icon: Users,
      who: 'Masyarakat',
      title: 'Pantau harga & kinerja daerah',
      points: ['Rapor stabilitas harga 34 provinsi & kab/kota', 'Peringatan dini 14 hari ke depan', 'Intervensi pemerintah & hasilnya'],
      to: '/rapor-daerah',
      cta: 'Buka Rapor Daerah',
    },
    {
      icon: Landmark,
      who: 'Pemerintah daerah',
      title: 'Bertindak sebelum harga memuncak',
      points: ['Daftar komoditas yang perlu tindakan', 'Rencana operasi pasar & alokasi anggaran', 'Catat dan publikasikan intervensi'],
      to: '/login',
      cta: 'Masuk sebagai pemerintah',
    },
    {
      icon: Store,
      who: 'UMKM kuliner',
      title: 'Belanja bahan dengan tepat',
      points: ['Berapa kg dibeli hari ini', 'Kapan sebaiknya borong', 'Varian pengganti saat harga melonjak'],
      to: '/login',
      cta: 'Daftarkan usaha',
    },
  ];
  return (
    <section id="peran" className="scroll-mt-20 py-16 sm:py-20">
      <div className={container}>
        <SectionHeading eyebrow="Tiga peran, satu data" title="Data yang sama, dipakai untuk keputusan yang berbeda">
          Publik, pemerintah daerah, dan pelaku usaha melihat harga dan prakiraan yang sama — sehingga keputusan siapa pun dapat diperiksa siapa pun.
        </SectionHeading>
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map(({ icon: Icon, who, title, points, to, cta }, i) => (
            <Reveal key={who} delay={i * 110} className="h-full">
            <article className="lift flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-[0_10px_30px_-24px_rgba(13,51,17,0.45)]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-4 text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">{who}</p>
              <h3 className="mt-1 text-lg font-semibold text-ink">{title}</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                {points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              <Link to={to} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                {cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Accountability loop ─────────────────────────────────────────────────────

function AccountabilityLoop() {
  const steps = [
    { icon: BarChart3, title: 'Data harga', body: 'Harga harian per provinsi dan kab/kota dibandingkan dengan HET/HAP.' },
    { icon: LineChart, title: 'Prakiraan', body: 'Rentang harga & peluang melampaui acuan 14 hari ke depan.' },
    { icon: ClipboardCheck, title: 'Intervensi', body: 'Pemerintah merencanakan operasi pasar sebelum puncak.' },
    { icon: Eye, title: 'Publikasi', body: 'Keputusan & dasar datanya terbuka, tidak bisa diubah diam-diam.' },
    { icon: Scale, title: 'Evaluasi', body: 'Harga sesudahnya dibandingkan prakiraan & daerah tetangga.' },
  ];
  return (
    <section className="bg-surface py-16 sm:py-20">
      <div className={container}>
        <SectionHeading eyebrow="Putaran akuntabilitas" title="Dari angka, ke keputusan, ke hasil yang bisa dinilai" />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <Reveal as="li" key={title} delay={i * 90} className="relative rounded-2xl border border-line bg-page p-4">
              <span className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-xs font-bold text-ink-3 tabular-nums">0{i + 1}</span>
              </span>
              <p className="mt-3 font-semibold text-ink">{title}</p>
              <p className="mt-1 text-sm text-ink-2">{body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─── Live alerts ─────────────────────────────────────────────────────────────

interface WatchItem {
  region_id: string;
  region_name: string;
  commodity_id: string;
  commodity_name: string;
  current_price: number;
  reference: number;
  status: AlertStatus;
  max_breach_prob: number;
}

function LiveAlerts() {
  const watch = useApi(async (s) => {
    const res = await fetch(`${API_BASE}/api/v1/public/watchlist`, { signal: s });
    if (!res.ok) throw new Error(`Server menjawab ${res.status}.`);
    return (await res.json()) as { as_of: string; items: WatchItem[] };
  }, []);
  if (watch.error) return null;
  const items = watch.data?.items ?? [];
  const above = items.filter((i) => i.status === 'above_reference').length;

  return (
    <section className="py-16 sm:py-20">
      <div className={`${container} grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]`}>
        <div>
          <SectionHeading eyebrow="Peringatan dini" title="Yang perlu diwaspadai hari ini">
            {watch.data
              ? `Per ${formatDate(watch.data.as_of)}: ${above} kombinasi daerah × komoditas sudah di atas acuan dan ${items.length - above} lainnya berstatus waspada.`
              : 'Memuat data terbaru…'}
          </SectionHeading>
          <Link to="/rapor-daerah?peta=peringatan" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
            Lihat peta peringatan <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {(watch.data ? items.slice(0, 6) : []).map((i, n) => (
            <Reveal as="li" dir="right" delay={n * 70} key={`${i.region_id}|${i.commodity_id}`}>
              <Link to={`/rapor-daerah/${i.region_id}?komoditas=${i.commodity_id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted">
                <span>
                  <span className="block text-sm font-semibold text-ink">{i.commodity_name}</span>
                  <span className="block text-xs text-ink-3">{i.region_name}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-right text-xs text-ink-2 tabular-nums">
                    {formatIDR(i.current_price)}
                    <span className="block text-ink-3">acuan {formatIDR(i.reference)}</span>
                  </span>
                  <StatusBadge status={i.status} />
                </span>
              </Link>
            </Reveal>
          ))}
          {!watch.data && <li className="h-72 animate-pulse bg-surface-muted" />}
        </ul>
      </div>
    </section>
  );
}

// ─── MSME ────────────────────────────────────────────────────────────────────

function MsmeRisks() {
  return (
    <section className="bg-[#0D3311] py-16 text-white sm:py-20">
      <div className={`${container} grid items-center gap-10 lg:grid-cols-2`}>
        <Reveal dir="left">
          <p className="text-xs font-bold tracking-[0.16em] text-gold uppercase">Untuk UMKM kuliner</p>
          <h2 className="mt-1.5 font-display text-3xl leading-tight font-bold sm:text-4xl">Dua risiko yang selalu bertabrakan di dapur</h2>
          <p className="mt-3 text-[#C8E6C9]">
            Belanja sedikit, harga bisa naik. Belanja banyak, stok membusuk. Pantara menghitung keduanya sekaligus dan memberi satu jawaban: berapa kilogram yang
            dibeli hari ini.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/simulator" className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-[#3A3113] hover:brightness-95">
              Coba simulator susut <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-bold hover:bg-white/10">
              Daftarkan usaha
            </Link>
          </div>
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { icon: TrendingUp, title: 'Harga naik', body: 'Cabai bisa naik lebih dari 200% dalam satu musim. Belanja tiap minggu berarti ikut membayar lonjakannya.' },
            { icon: Snowflake, title: 'Stok susut', body: 'Bahan segar kehilangan 1,5–3% bobot per hari. Memborong tanpa pendingin berarti membayar bahan yang dibuang.' },
            { icon: ShoppingBasket, title: 'Rekomendasi belanja', body: 'Beli 1 minggu atau borong 2 minggu — dipilih dari ekspektasi biaya terendah.' },
            { icon: FileCheck2, title: 'Alasan terbuka', body: 'Setiap rekomendasi menunjukkan angka di baliknya: harga impas, peluang rugi, dan susut.' },
          ].map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} dir="scale" delay={i * 90} className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <Icon className="h-5 w-5 text-gold" aria-hidden="true" />
              <p className="mt-3 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-[#C8E6C9]">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Encyclopedia preview ────────────────────────────────────────────────────

function EncyclopediaPreview({ onOpen }: { onOpen: (c: Commodity) => void }) {
  const picks = useMemo(() => [...COMMODITIES].sort((a, b) => b.cv - a.cv).slice(0, 4), []);
  return (
    <section className="py-16 sm:py-20">
      <div className={container}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow="Ensiklopedia komoditas" title="Setiap bahan punya watak harga dan watak busuknya sendiri" />
          <Link to="/ensiklopedia" className="mb-8 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
            Semua {COMMODITIES.length} komoditas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {picks.map((c, i) => (
            <Reveal key={c.id} dir="scale" delay={i * 80}>
              <CommodityCard c={c} onOpen={onOpen} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Trust ───────────────────────────────────────────────────────────────────

function Trust() {
  const metrics = useApi(async (s) => {
    const res = await fetch(`${API_BASE}/api/v1/public/model-metrics`, { signal: s });
    if (!res.ok) throw new Error(`Server menjawab ${res.status}.`);
    const reports = (await res.json()) as { synthetic: boolean; rows: { coverage: number; samples: number }[] }[];
    // Headline the backtest on real data when there is one.
    return reports.find((r) => !r.synthetic && r.rows.length) ?? reports[0];
  }, []);
  const rows = metrics.data?.rows ?? [];
  const coverage = rows.length ? rows.reduce((s, r) => s + r.coverage, 0) / rows.length : undefined;
  const samples = rows.reduce((s, r) => s + r.samples, 0);

  const items = [
    {
      value: coverage !== undefined ? <CountUp to={coverage * 100} format={(v) => formatPct(v)} /> : '–',
      label: 'harga aktual jatuh di rentang P10–P90',
      hint: `Target 80% · backtest ${samples ? samples.toLocaleString('id-ID') : '…'} prakiraan${metrics.data && !metrics.data.synthetic ? ' pada data PIHPS' : ''}`,
    },
    { value: 'CSV', label: 'data terbuka di setiap halaman', hint: 'Harga, prakiraan, rapor, dan intervensi' },
    { value: '100%', label: 'rumus dijelaskan', hint: 'Skor, peringatan, evaluasi, dan perencanaan' },
  ];
  return (
    <section className="bg-surface py-16 sm:py-20">
      <div className={container}>
        <SectionHeading eyebrow="Metode terbuka" title="Angka yang bisa diperiksa, bukan sekadar dipercaya">
          Akurasi prakiraan diuji ulang secara otomatis, keterbatasannya ditulis terang-terangan, dan datanya bisa diunduh siapa saja.
        </SectionHeading>
        <dl className="grid gap-4 sm:grid-cols-3">
          {items.map((i, n) => (
            <Reveal key={i.label} delay={n * 100} className="rounded-2xl border border-line bg-page p-5">
              <dt className="sr-only">{i.label}</dt>
              <dd className="font-display text-4xl font-bold text-accent">{i.value}</dd>
              <dd className="mt-1 font-semibold text-ink">{i.label}</dd>
              <dd className="mt-1 text-sm text-ink-3">{i.hint}</dd>
            </Reveal>
          ))}
        </dl>
        <Link to="/metodologi" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
          Baca metodologi lengkap <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-16 sm:py-20">
      <div className={container}>
        <Reveal dir="scale" className="rounded-3xl bg-gradient-to-br from-[#1B5E20] to-[#2E7D32] px-6 py-12 text-center text-white sm:px-12">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Lihat bagaimana daerah Anda mengendalikan harga</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[#C8E6C9]">Rapor bulanan, peringatan dini, dan intervensi pemerintah — terbuka untuk semua.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/rapor-daerah" className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-bold text-[#3A3113] hover:brightness-95">
              Buka Rapor Daerah <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/intervensi" className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-bold hover:bg-white/10">
              Lihat intervensi
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

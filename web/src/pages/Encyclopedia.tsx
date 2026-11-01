import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import type { CategoryKey, Commodity } from '../data/types';
import { CATEGORY_META } from '../data/types';
import { COMMODITIES, DATA_DISCLAIMER, getCommodity } from '../data/commodities';
import { SiteShell, PageHeader } from '../components/layout/SiteShell';
import { NativeSelect } from '../components/ui/NativeSelect';
import { EmptyState } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';
import CommodityCard from '../components/CommodityCard';
import CommodityDetail from '../components/CommodityDetail';
import { Reveal } from '../components/motion/Reveal';

type SortKey = 'volatile' | 'perishable' | 'price' | 'name';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'volatile', label: 'Paling bergejolak' },
  { value: 'perishable', label: 'Tercepat busuk' },
  { value: 'price', label: 'Harga tertinggi' },
  { value: 'name', label: 'Nama A–Z' },
];

const CATEGORY_ORDER: CategoryKey[] = ['chili', 'rice', 'spice', 'protein', 'vegetable', 'pantry'];

const roomShelfLife = (c: Commodity) => c.decay.find((d) => d.key === 'room')?.shelfLifeDays ?? 999;

/** Knowledge base of the 21 volatile food commodities. */
export default function Encyclopedia() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<CategoryKey[]>([]);
  const [sort, setSort] = useState<SortKey>('volatile');
  // Deep link: /ensiklopedia?komoditas=cabai-rawit-merah opens the detail directly.
  const active = getCommodity(params.get('komoditas') ?? '') ?? null;

  const open = (c: Commodity | null) =>
    setParams(
      (p) => {
        if (c) p.set('komoditas', c.id);
        else p.delete('komoditas');
        return p;
      },
      { replace: true },
    );

  const toggleCat = (c: CategoryKey) => setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = COMMODITIES.filter(
      (c) =>
        (cats.length === 0 || cats.includes(c.category)) &&
        (!q || c.name.toLowerCase().includes(q) || c.tagline.toLowerCase().includes(q) || CATEGORY_META[c.category].label.toLowerCase().includes(q)),
    );
    const by: Record<SortKey, (a: Commodity, b: Commodity) => number> = {
      volatile: (a, b) => b.cv - a.cv,
      price: (a, b) => b.price - a.price,
      perishable: (a, b) => roomShelfLife(a) - roomShelfLife(b),
      name: (a, b) => a.name.localeCompare(b.name, 'id'),
    };
    return [...list].sort(by[sort]);
  }, [query, cats, sort]);

  const chip = (on: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${on ? 'bg-accent text-white' : 'border border-line-strong bg-surface text-ink-2 hover:text-ink'}`;

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Ensiklopedia komoditas"
        title="Kenali bahan pangan yang paling bergejolak"
        description={`${COMMODITIES.length} komoditas: dampaknya terhadap inflasi, laju susut per metode simpan, dan cara menyimpan agar bertahan lebih lama.`}
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="relative flex-1">
            <span className="sr-only">Cari komoditas</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari komoditas — cabai, beras, bawang…"
              className="w-full rounded-full border border-line-strong bg-surface py-2.5 pr-10 pl-10 text-sm text-ink placeholder:text-ink-3"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Bersihkan pencarian" className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-ink-3 hover:bg-surface-muted">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <NativeSelect label="Urutkan" hideLabel value={sort} onChange={(v) => setSort(v as SortKey)} options={SORTS} className="sm:w-56" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Filter kategori">
          <button type="button" onClick={() => setCats([])} aria-pressed={cats.length === 0} className={chip(cats.length === 0)}>
            Semua ({COMMODITIES.length})
          </button>
          {CATEGORY_ORDER.map((k) => (
            <button key={k} type="button" onClick={() => toggleCat(k)} aria-pressed={cats.includes(k)} title={CATEGORY_META[k].blurb} className={chip(cats.includes(k))}>
              {CATEGORY_META[k].emoji} {CATEGORY_META[k].label} ({COMMODITIES.filter((c) => c.category === k).length})
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-sm text-ink-2" aria-live="polite">
        {results.length} komoditas{query && ` untuk “${query}”`}
      </p>

      {results.length === 0 ? (
        <EmptyState
          title="Tidak ada komoditas yang cocok"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setCats([]);
              }}
            >
              Tampilkan semua
            </Button>
          }
        >
          Coba kata kunci lain atau bersihkan filter kategori.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((c, i) => (
            <Reveal key={c.id} dir="scale" delay={(i % 4) * 70}>
              <CommodityCard c={c} onOpen={open} />
            </Reveal>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-ink-3">{DATA_DISCLAIMER}</p>

      <CommodityDetail key={active?.id} commodity={active} onClose={() => open(null)} />
    </SiteShell>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import { SiteShell, PageHeader } from '../components/layout/SiteShell';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { GradeBadge, StatusBadge, Tag } from '../components/ui/Badge';
import { StatTile } from '../components/ui/StatTile';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { NativeSelect } from '../components/ui/NativeSelect';
import { DataTable } from '../components/ui/DataTable';
import { EmptyState, ErrorState, Notice, Placeholder } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';
import { ChartFrame } from '../components/charts/ChartFrame';
import { PriceChart, PriceChartLegend, PriceTable } from '../components/charts/PriceChart';
import { RegionMap } from '../components/regional/RegionMap';
import type { MapMode } from '../components/regional/RegionMap';
import { RankBars } from '../components/charts/RankBars';
import { TrendSparkline } from '../components/charts/TrendSparkline';
import { fetchAlerts, fetchPrices, fetchRegions, fetchScorecard } from '../lib/regional';
import type { AlertsResponse, PricesResponse, RegionsResponse, ScorecardResponse, ScorecardRow } from '../lib/regional';
import { REFERENCE_TYPE_LABEL, commodityGroups, formatMonth } from '../lib/scorecard';
import { formatIDR, formatNumber, formatPct } from '../lib/format';

/** Developer-only gallery of the civic design system, fed by the live regional API. */
export default function ComponentCatalog() {
  const [meta, setMeta] = useState<RegionsResponse | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [prices, setPrices] = useState<PricesResponse | null>(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [mapMode, setMapMode] = useState<MapMode>('grade');
  const [region, setRegion] = useState('kota-bandung');
  const [commodity, setCommodity] = useState('cabai-rawit-merah');
  const [range, setRange] = useState<'90' | '180' | '365'>('180');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRegions({ scope: 'jawa-barat' })
      .then((m) => {
        setMeta(m);
        setMonth(m.months[m.months.length - 1]);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!month) return;
    const ctrl = new AbortController();
    setLoading(true);
    Promise.all([fetchScorecard('jawa-barat', month, undefined, ctrl.signal), fetchAlerts('jawa-barat', commodity, undefined, ctrl.signal)])
      .then(([s, a]) => {
        setScorecard(s);
        setAlerts(a);
      })
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [month, commodity]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchPrices(region, commodity, Number(range), undefined, ctrl.signal)
      .then(setPrices)
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [region, commodity, range]);

  const regionById = useMemo(() => new Map(meta?.regions.map((r) => [r.id, r]) ?? []), [meta]);
  const rowById = useMemo(() => new Map(scorecard?.rows.map((r) => [r.region_id, r]) ?? []), [scorecard]);
  const alertById = useMemo(() => new Map(alerts?.regions.map((r) => [r.region_id, r]) ?? []), [alerts]);
  const selectedCommodity = meta?.commodities.find((c) => c.id === commodity);
  const selectedRegion = regionById.get(region);
  const referenceLabel = selectedCommodity ? `${REFERENCE_TYPE_LABEL[selectedCommodity.reference.type]}${selectedCommodity.reference.type === 'baseline' ? '' : ' (acuan)'}` : 'Acuan';

  if (error && !meta) {
    return (
      <SiteShell>
        <ErrorState message={`${error} Pastikan server Go berjalan di port 8080.`} onRetry={() => window.location.reload()} />
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Sistem desain"
        title="Katalog komponen civic"
        description="Halaman pengembang (hanya muncul saat mode dev). Semua komponen di bawah memakai data asli dari API regional."
      />

      <div className="space-y-10">
        <Section title="Warna" note="Token di src/index.css. Grafik divalidasi dengan validator palet dataviz.">
          <div className="grid gap-4 lg:grid-cols-2">
            <SwatchGroup
              title="Permukaan & tinta"
              items={[
                ['page', '--color-page'],
                ['surface', '--color-surface'],
                ['surface-muted', '--color-surface-muted'],
                ['line', '--color-line'],
                ['ink', '--color-ink'],
                ['ink-2', '--color-ink-2'],
                ['ink-3', '--color-ink-3'],
                ['accent', '--color-accent'],
              ]}
            />
            <SwatchGroup
              title="Seri grafik · predikat · status"
              items={[
                ['series-1', '--color-series-1'],
                ['series-2', '--color-series-2'],
                ['series-3', '--color-series-3'],
                ['grade-a', '--color-grade-a'],
                ['grade-c', '--color-grade-c'],
                ['grade-e', '--color-grade-e'],
                ['good', '--color-good'],
                ['warning', '--color-warning'],
                ['critical', '--color-critical'],
              ]}
            />
          </div>
        </Section>

        <Section title="Tipografi" note="Public Sans untuk semua teks, termasuk angka utama.">
          <Card>
            <CardBody className="space-y-2">
              <p className="text-3xl font-bold tracking-tight">Rapor Stabilitas Harga Daerah</p>
              <p className="text-xl font-semibold">Judul bagian · 20/semibold</p>
              <p className="text-base">Teks isi 16px untuk paragraf penjelasan yang dibaca publik.</p>
              <p className="text-sm text-ink-2">Teks sekunder 14px untuk keterangan.</p>
              <p className="text-xs text-ink-3">Teks keterangan kecil 12px — sumber data, catatan kaki.</p>
              <p className="text-5xl font-semibold">78,4</p>
            </CardBody>
          </Card>
        </Section>

        <Section title="Tombol, tag, lencana">
          <Card>
            <CardBody className="flex flex-wrap items-center gap-3">
              <Button>Simpan intervensi</Button>
              <Button variant="secondary">
                <Download className="h-4 w-4" /> Ekspor CSV
              </Button>
              <Button variant="ghost">Lihat metodologi</Button>
              <Button disabled>Nonaktif</Button>
              <span className="mx-2 h-6 w-px bg-line" />
              <Tag>Kota</Tag>
              <Tag tone="accent">HET</Tag>
              <Tag tone="warning">Indikatif</Tag>
              <span className="mx-2 h-6 w-px bg-line" />
              {(['A', 'B', 'C', 'D', 'E'] as const).map((g) => (
                <GradeBadge key={g} grade={g} showLabel />
              ))}
              <span className="mx-2 h-6 w-px bg-line" />
              <StatusBadge status="above_reference" />
              <StatusBadge status="watch" />
              <StatusBadge status="normal" />
            </CardBody>
          </Card>
        </Section>

        <Section title="Kontrol filter" note="Satu baris di atas konten yang dipengaruhinya.">
          <div className="flex flex-wrap items-end gap-3">
            {meta && (
              <NativeSelect
                label="Bulan"
                value={month}
                onChange={setMonth}
                options={[...meta.months].reverse().map((m) => ({ value: m, label: formatMonth(m) }))}
              />
            )}
            {meta && (
              <NativeSelect
                label="Komoditas"
                value={commodity}
                onChange={setCommodity}
                groups={commodityGroups(meta.commodities)}
                className="min-w-56"
              />
            )}
            {meta && (
              <NativeSelect
                label="Daerah"
                value={region}
                onChange={setRegion}
                options={meta.regions.map((r) => ({ value: r.id, label: r.name }))}
              />
            )}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-2">Rentang</span>
              <SegmentedControl
                label="Rentang waktu"
                value={range}
                onChange={setRange}
                options={[
                  { value: '90', label: '90 hari' },
                  { value: '180', label: '6 bulan' },
                  { value: '365', label: '1 tahun' },
                ]}
              />
            </div>
          </div>
        </Section>

        <Section title="Stat tile">
          {scorecard && selectedRegion ? (
            <StatTiles row={rowById.get(region)} regionName={selectedRegion.name} prices={prices} />
          ) : (
            <Placeholder className="h-28" />
          )}
        </Section>

        <Section title="Peta wilayah" note="Batas kab/kota BPS. Klik untuk memilih; arahkan atau fokus untuk detail.">
          <Card>
            <CardHeader
              title={mapMode === 'grade' ? `Predikat stabilitas harga · ${formatMonth(month)}` : `Peringatan dini · ${selectedCommodity?.name ?? ''}`}
              actions={
                <SegmentedControl
                  label="Mode peta"
                  size="sm"
                  value={mapMode}
                  onChange={setMapMode}
                  options={[
                    { value: 'grade', label: 'Predikat' },
                    { value: 'alert', label: 'Peringatan' },
                  ]}
                />
              }
            />
            <CardBody className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
              {meta && scorecard ? (
                <RegionMap
                  scope={meta.scope}
                  mode={mapMode}
                  regions={meta.regions}
                  rows={rowById}
                  alerts={alertById}
                  singleCommodity
                  selectedId={region}
                  onSelect={(r) => setRegion(r.id)}
                />
              ) : (
                <Placeholder className="h-72" />
              )}
            </CardBody>
          </Card>
        </Section>

        <Section title="Batang peringkat">
          <Card>
            <CardHeader title={`Skor stabilitas harga · ${formatMonth(month)}`} subtitle="0–100, makin tinggi makin stabil" />
            <CardBody>
              {scorecard && meta ? (
                <RankBars
                  label="Peringkat skor daerah"
                  max={100}
                  selectedId={region}
                  onSelect={setRegion}
                  rows={scorecard.rows.slice(0, 10).map((r) => ({
                    id: r.region_id,
                    label: regionById.get(r.region_id)?.name ?? r.region_id,
                    value: r.score,
                    valueText: formatNumber(r.score),
                    badge: <GradeBadge grade={r.grade} size="sm" />,
                  }))}
                />
              ) : (
                <Placeholder className="h-64" />
              )}
            </CardBody>
          </Card>
        </Section>

        <Section title="Grafik harga + prakiraan" note="Garis 2px, grid rambut, kursor silang, tooltip semua seri, dan tampilan tabel.">
          {prices && selectedRegion && selectedCommodity ? (
            <ChartFrame
              title={`${selectedCommodity.name} di ${selectedRegion.name}`}
              subtitle={`Rp per ${selectedCommodity.unit} · ${referenceLabel} ${selectedCommodity.reference.value ? formatIDR(selectedCommodity.reference.value) : 'bergerak harian'}`}
              legend={<PriceChartLegend regionLabel={selectedRegion.name} referenceLabel={referenceLabel} showNeighbors forecast={prices.forecast} />}
              table={<PriceTable series={prices.series} forecast={prices.forecast} regionLabel={selectedRegion.name} referenceLabel={referenceLabel} showNeighbors />}
              actions={<StatusBadge status={prices.alert.status} />}
              footnote={`Sumber: data simulasi Pantara · prakiraan Filtered Historical Simulation per ${prices.forecast.as_of}`}
            >
              <PriceChart series={prices.series} forecast={prices.forecast} regionLabel={selectedRegion.name} referenceLabel={referenceLabel} showNeighbors />
            </ChartFrame>
          ) : (
            <Placeholder className="h-80" />
          )}
        </Section>

        <Section title="Tabel data">
          <Card>
            {scorecard && meta ? (
              <DataTable<ScorecardRow>
                caption="Rapor seluruh daerah"
                rows={scorecard.rows}
                rowKey={(r) => r.region_id}
                selectedKey={region}
                onRowClick={(r) => setRegion(r.region_id)}
                initialSort={{ key: 'rank', dir: 'asc' }}
                columns={[
                  { key: 'rank', header: '#', align: 'right', sortValue: (r) => r.rank },
                  { key: 'name', header: 'Daerah', sortValue: (r) => regionById.get(r.region_id)?.name ?? '', render: (r) => regionById.get(r.region_id)?.name },
                  { key: 'grade', header: 'Predikat', render: (r) => <GradeBadge grade={r.grade} size="sm" showLabel /> , sortValue: (r) => r.score },
                  { key: 'score', header: 'Skor', align: 'right', sortValue: (r) => r.score, render: (r) => formatNumber(r.score) },
                  { key: 'days', header: 'Hari di atas acuan', align: 'right', hideOnMobile: true, sortValue: (r) => r.days_above_normal_total },
                  { key: 'episodes', header: 'Episode lonjakan', align: 'right', hideOnMobile: true, sortValue: (r) => r.episodes_total },
                ]}
              />
            ) : (
              <Placeholder className="h-64" />
            )}
          </Card>
        </Section>

        <Section title="Umpan balik">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3">
              <Notice title="Data simulasi">Angka kab/kota dibangkitkan untuk demonstrasi.</Notice>
              <Notice tone="warning" title="Acuan indikatif">Nilai HET/HAP belum diverifikasi ke regulasi terbaru.</Notice>
            </div>
            <Card>
              <EmptyState title="Belum ada intervensi">Intervensi yang dicatat pemerintah daerah akan muncul di sini.</EmptyState>
            </Card>
            <Card>
              <ErrorState message="Server menjawab 503." onRetry={() => undefined} />
            </Card>
          </div>
        </Section>
      </div>
    </SiteShell>
  );
}

function StatTiles({ row, regionName, prices }: { row?: ScorecardRow; regionName: string; prices: PricesResponse | null }) {
  if (!row) return null;
  const last = prices?.series.at(-1);
  const weekAgo = prices?.series.at(-8);
  const change = last && weekAgo ? (last.price / weekAgo.price - 1) * 100 : 0;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile emphasis label={`Skor ${regionName}`} value={formatNumber(row.score)} hint={`Peringkat ${row.rank} dari 27`} />
      <StatTile label="Hari-komoditas di atas acuan" value={row.days_above_normal_total} hint={`${row.commodities_affected} komoditas terdampak`} />
      <StatTile label="Episode lonjakan" value={row.episodes_total} hint="≥ 3 hari berturut-turut di atas acuan" />
      {last && (
        <StatTile
          label="Harga komoditas terpilih"
          value={formatIDR(last.price)}
          delta={{
            text: `${change >= 0 ? '+' : ''}${formatPct(change)}`,
            direction: Math.abs(change) < 0.05 ? 'flat' : change > 0 ? 'up' : 'down',
            upIsGood: false,
            versus: 'vs 7 hari lalu',
          }}
          trend={<TrendSparkline values={prices!.series.slice(-30).map((p) => p.price)} />}
        />
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <p className="text-sm text-ink-3">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function SwatchGroup({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {items.map(([name, token]) => (
          <div key={name} className="text-xs">
            <div className="h-10 rounded-md border border-line" style={{ background: `var(${token})` }} />
            <p className="mt-1 font-medium">{name}</p>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

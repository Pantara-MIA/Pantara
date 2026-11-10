import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronDown, Layers, MapPinned } from 'lucide-react';
import { SiteShell, PageHeader } from '../../components/layout/SiteShell';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { GradeBadge, StatusBadge, Verdict } from '../../components/ui/Badge';
import { InfoTip, TitleWithInfo } from '../../components/ui/InfoTip';
import { StatTile } from '../../components/ui/StatTile';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { NativeSelect } from '../../components/ui/NativeSelect';
import { DataTable } from '../../components/ui/DataTable';
import { ErrorState, Placeholder } from '../../components/ui/Feedback';
import { ButtonLink } from '../../components/ui/Button';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { RankBars } from '../../components/charts/RankBars';
import { RegionMap } from '../../components/regional/RegionMap';
import type { MapMode } from '../../components/regional/RegionMap';
import { NATIONAL_SCOPE, fetchAlerts, fetchRegions, fetchScorecard, memberNoun, scopeCommodities, scopeHref } from '../../lib/regional';
import type { Region, RegionAlert, RegionsResponse, Scope, ScorecardRow } from '../../lib/regional';
import { ScopeBreadcrumb } from '../../components/regional/ScopeNav';
import { ClimateLevelBadge, EnsoStrip } from '../../components/climate/Climate';
import { fetchClimate } from '../../lib/climate';
import type { ProvinceClimate } from '../../lib/climate';
import {
  GRADE_META,
  commodityGroups,
  complianceVerdict,
  countVerdict,
  formatMonth,
  monthAsOf,
  previousMonth,
  regionTypeLabel,
  scoreVerdict,
} from '../../lib/scorecard';
import { formatNumber, formatPct } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { Reveal } from '../../components/motion/Reveal';
import { RollingNumber } from '../../components/motion/RollingNumber';

const ALL = 'semua';

/** Public scorecard: map + ranking of the regions of one scope for one month. */
export default function ScorecardOverview() {
  const [params] = useSearchParams();
  const scopeId = params.get('cakupan') || NATIONAL_SCOPE;
  const meta = useApi((s) => fetchRegions({ scope: scopeId }, s), [scopeId]);

  if (meta.error) {
    return (
      <SiteShell>
        <ErrorState message={meta.error} onRetry={meta.reload} />
      </SiteShell>
    );
  }
  return <SiteShell>{meta.data?.scope.id === scopeId ? <Overview key={scopeId} meta={meta.data} /> : <OverviewSkeleton />}</SiteShell>;
}

function Overview({ meta }: { meta: RegionsResponse }) {
  const [params, setParams] = useSearchParams();
  const scope = meta.scope;
  const commodities = scopeCommodities(meta);
  const latest = meta.months[meta.months.length - 1];
  const month = meta.months.includes(params.get('bulan') ?? '') ? params.get('bulan')! : latest;
  const commodity = commodities.some((c) => c.id === params.get('komoditas')) ? params.get('komoditas')! : ALL;
  const national = meta.scope.id === NATIONAL_SCOPE;
  const MODE_PARAM: Record<string, MapMode> = { peringatan: 'alert', kepatuhan: 'compliance', iklim: 'climate' };
  const picked = MODE_PARAM[params.get('peta') ?? ''] ?? 'grade';
  // Climate is per province, so its map only makes sense at the national level.
  const mode: MapMode = picked === 'climate' && !national ? 'grade' : picked;
  const selectedId = meta.regions.some((r) => r.id === params.get('daerah')) ? params.get('daerah')! : undefined;
  const commodityParam = commodity === ALL ? undefined : commodity;
  const prev = previousMonth(meta.months, month);
  const asOf = monthAsOf(month, meta.date_range.end);

  const set = (key: string, value: string | undefined) =>
    setParams(
      (p) => {
        if (value === undefined) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );

  const scorecard = useApi((s) => fetchScorecard(scope.id, month, commodityParam, s), [scope.id, month, commodityParam]);
  const prevScorecard = useApi((s) => (prev ? fetchScorecard(scope.id, prev, commodityParam, s) : Promise.resolve(null)), [scope.id, prev, commodityParam]);
  const alerts = useApi((s) => fetchAlerts(scope.id, commodityParam, asOf, s), [scope.id, commodityParam, asOf]);
  const climate = useApi((s) => fetchClimate(asOf, s), [asOf]);
  const climateById = useMemo(() => new Map(climate.data?.provinces.map((p) => [p.region_id, p]) ?? []), [climate.data]);
  // Regencies/cities use their province's climate.
  const climateOf = (r: Region) => climateById.get(r.type === 'province' ? r.id : (scope.region ?? ''));

  const regionById = useMemo(() => new Map(meta.regions.map((r) => [r.id, r])), [meta]);
  const rowById = useMemo(() => new Map(scorecard.data?.rows.map((r) => [r.region_id, r]) ?? []), [scorecard.data]);
  const alertById = useMemo(() => new Map(alerts.data?.regions.map((a) => [a.region_id, a]) ?? []), [alerts.data]);
  const commodityName = meta.commodities.find((c) => c.id === commodity)?.name;
  const subject = commodityName ?? `${commodities.length} komoditas`;
  const noun = memberNoun(scope);

  const onSelect = (r: Region) => set('daerah', r.id === selectedId ? undefined : r.id);

  return (
    <>
      <ScopeBreadcrumb trail={meta.breadcrumb} month={month} />
      <PageHeader
        eyebrow={`Rapor Daerah · ${scope.name}`}
        title="Rapor Stabilitas Harga Pangan"
        description={
          <span className="inline-flex flex-wrap items-center gap-1">
            Seberapa stabil harga pangan di tiap {noun}, dihitung dari harga harian.
            <InfoTip label="Rapor daerah">
              Tiap {noun} dinilai dari dua hal: <b>stabilitas</b> (seberapa sering, lama, dan parah harga melonjak di atas batas wajarnya) dan{' '}
              <b>kepatuhan batas harga</b> (seberapa sering harga di bawah HET/HAP, batas harga dari pemerintah).
            </InfoTip>
          </span>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <NativeSelect
          label="Bulan"
          value={month}
          onChange={(v) => set('bulan', v === latest ? undefined : v)}
          options={[...meta.months].reverse().map((m) => ({ value: m, label: formatMonth(m) }))}
        />
        <NativeSelect
          label="Komoditas"
          value={commodity}
          onChange={(v) => set('komoditas', v === ALL ? undefined : v)}
          options={[{ value: ALL, label: 'Semua komoditas' }]}
          groups={commodityGroups(commodities)}
          className="min-w-64"
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">Tampilkan di peta</span>
          <SegmentedControl
            label="Tampilkan di peta"
            value={mode}
            onChange={(v) => set('peta', v === 'alert' ? 'peringatan' : v === 'compliance' ? 'kepatuhan' : v === 'climate' ? 'iklim' : undefined)}
            options={[
              { value: 'grade', label: 'Stabilitas' },
              { value: 'compliance', label: 'Batas harga' },
              { value: 'alert', label: 'Peringatan' },
              ...(national ? [{ value: 'climate' as const, label: 'Iklim' }] : []),
            ]}
          />
        </div>
      </div>

      {scorecard.error ? (
        <Card>
          <ErrorState message={scorecard.error} onRetry={scorecard.reload} />
        </Card>
      ) : !scorecard.data ? (
        <OverviewSkeleton bare />
      ) : (
        <div className={`space-y-6 transition-opacity ${scorecard.loading ? 'opacity-60' : ''}`}>
          <SummaryTiles
            rows={scorecard.data.rows}
            prevRows={prevScorecard.data?.rows}
            prevMonth={prev}
            alerts={alerts.data?.regions}
            singleCommodity={!!commodityParam}
            asOf={asOf}
            scope={scope}
          />

          {climate.data?.available && (
            <EnsoStrip
              enso={climate.data.enso}
              effects={climate.data.effects}
              commodityName={(id) => meta.commodities.find((c) => c.id === id)?.name ?? id}
            />
          )}

          <Reveal className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardHeader
                title={
                  mode === 'grade' ? (
                    <TitleWithInfo text={`Stabilitas harga · ${formatMonth(month)}`} info={`Skor stabilitas ${subject}, 0–100. Makin hijau tua, makin stabil.`} />
                  ) : mode === 'compliance' ? (
                    <TitleWithInfo
                      text={`Kepatuhan batas harga · ${formatMonth(month)}`}
                      info="Porsi hari harga berada di bawah HET/HAP (batas harga dari pemerintah), dibobot menurut besarnya belanja warga untuk tiap bahan. ≥ 80% dianggap patuh."
                    />
                  ) : mode === 'climate' ? (
                    <TitleWithInfo
                      text={`Risiko iklim · per ${formatDateId(climate.data?.weather_as_of ?? asOf)}`}
                      info="Hujan di bawah normal, apalagi saat El Niño, biasanya diikuti kenaikan harga cabai, bawang merah, gula, dan beras. Sumber cuaca: Open-Meteo (ERA5)."
                    />
                  ) : (
                    <TitleWithInfo
                      text={`Peringatan dini · per ${formatDateId(asOf)}`}
                      info="Acuan = HET/HAP, atau batas wajar (median harga 90 hari + 10%) untuk bahan tanpa HET/HAP. Waspada = peluang ≥ 40% melewati acuan dalam 14 hari."
                    />
                  )
                }
                subtitle={
                  mode === 'grade'
                    ? 'Klik daerah untuk melihat rapornya.'
                    : mode === 'compliance'
                      ? compliantSubtitle(commodityParam ? meta.commodities.find((c) => c.id === commodityParam) : undefined)
                      : mode === 'climate'
                        ? 'Hujan 3 bulan terakhir dibanding biasanya.'
                        : commodityName
                          ? `Apakah harga ${commodityName.toLowerCase()} sudah, atau akan segera, melewati acuan.`
                          : 'Jumlah bahan pangan yang harganya sudah di atas acuan.'
                }
              />
              <CardBody className={alerts.loading && mode === 'alert' ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                <RegionMap
                  scope={scope}
                  mode={mode}
                  regions={meta.regions}
                  rows={rowById}
                  alerts={alertById}
                  climate={climateById}
                  singleCommodity={!!commodityParam}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              </CardBody>
            </Card>

            <aside aria-live="polite">
              {selectedId ? (
                <RegionQuickCard
                  key={selectedId}
                  region={regionById.get(selectedId)!}
                  row={rowById.get(selectedId)}
                  alert={alertById.get(selectedId)}
                  total={scorecard.data.rows.length}
                  commodityCount={commodities.length}
                  climate={climateOf(regionById.get(selectedId)!)}
                  month={month}
                  singleCommodity={!!commodityParam}
                  onClose={() => set('daerah', undefined)}
                />
              ) : mode === 'climate' && climate.data ? (
                <ClimateList provinces={climate.data.provinces} regionById={regionById} onSelect={(id) => set('daerah', id)} />
              ) : (
                <Extremes rows={scorecard.data.rows} regionById={regionById} onSelect={(id) => set('daerah', id)} />
              )}
            </aside>
          </Reveal>

          <Reveal>
            <Ranking
              rows={scorecard.data.rows}
              regionById={regionById}
              selectedId={selectedId}
              onSelect={(id) => set('daerah', id === selectedId ? undefined : id)}
              title={`Peringkat stabilitas ${scorecard.data.rows.length} ${noun} · ${formatMonth(month)}`}
              table={<RankingTable rows={scorecard.data.rows} regionById={regionById} month={month} noun={noun} />}
              noun={noun}
            />
          </Reveal>
        </div>
      )}
    </>
  );
}

const compliantSubtitle = (c?: { name: string; reference: { type: string } }) =>
  c && c.reference.type === 'baseline'
    ? `${c.name} tidak punya batas harga dari pemerintah, jadi tidak dinilai.`
    : 'Makin gelap, makin sering harga melewati batas harga pemerintah.';

const formatDateId = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

function SummaryTiles({
  rows,
  prevRows,
  prevMonth,
  alerts,
  singleCommodity,
  asOf,
  scope,
}: {
  rows: ScorecardRow[];
  prevRows?: ScorecardRow[];
  prevMonth?: string;
  alerts?: RegionAlert[];
  singleCommodity: boolean;
  asOf: string;
  scope: Scope;
}) {
  const mean = (rs: ScorecardRow[]) => rs.reduce((s, r) => s + r.score, 0) / rs.length;
  const avg = mean(rows);
  const prevAvg = prevRows?.length ? mean(prevRows) : undefined;
  const diff = prevAvg === undefined ? undefined : avg - prevAvg;
  const weak = rows.filter((r) => r.grade === 'D' || r.grade === 'E').length;
  const regulated = rows.filter((r) => r.compliance !== null);
  const compliance = regulated.length ? regulated.reduce((s, r) => s + (r.compliance ?? 0), 0) / regulated.length : undefined;
  const breached = regulated.filter((r) => r.days_above_ceiling_total > 0).length;
  // One commodity: regions not "normal". All commodities: regions with >= 3 above reference.
  const flagged = alerts?.filter((a) => (singleCommodity ? a.status !== 'normal' : a.above_count >= 3)).length;
  const withData = alerts?.filter((a) => a.status !== 'no_data').length ?? rows.length;
  const noun = memberNoun(scope);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        emphasis
        label={`Stabilitas harga ${scope.name}`}
        value={formatNumber(avg)}
        unit="/100"
        verdict={scoreVerdict(avg)}
        info={`Rata-rata skor semua ${noun}. Makin tinggi makin stabil: ≥ 85 sangat stabil, 70–85 stabil, 55–70 cukup, di bawah 55 rawan.`}
        delta={
          diff !== undefined && prevMonth
            ? {
                text: `${diff >= 0 ? '+' : ''}${formatNumber(diff)} poin`,
                direction: Math.abs(diff) < 0.05 ? 'flat' : diff > 0 ? 'up' : 'down',
                upIsGood: true,
                versus: `vs ${formatMonth(prevMonth)}`,
              }
            : undefined
        }
      />
      <StatTile
        label="Daerah rawan"
        value={weak}
        unit={`dari ${rows.length}`}
        verdict={countVerdict(weak, rows.length)}
        info={`${noun[0].toUpperCase()}${noun.slice(1)} dengan predikat D atau E (skor stabilitas di bawah 55) yang perlu pengendalian harga.`}
      />
      <StatTile
        label="Kepatuhan batas harga"
        value={compliance !== undefined ? formatPct(compliance) : '–'}
        verdict={compliance !== undefined ? complianceVerdict(compliance) : undefined}
        info={
          compliance !== undefined
            ? `Porsi hari harga berada di bawah HET/HAP (batas harga dari pemerintah). Makin tinggi makin baik; ≥ 80% dianggap patuh. ${breached} dari ${regulated.length} ${noun} pernah melewatinya bulan ini.`
            : 'Bahan ini tidak punya batas harga dari pemerintah (HET/HAP), jadi tidak dinilai.'
        }
      />
      <StatTile
        label={singleCommodity ? 'Daerah perlu waspada' : 'Daerah dengan ≥ 3 bahan di atas acuan'}
        value={flagged ?? '–'}
        unit={`dari ${withData}`}
        verdict={flagged !== undefined ? countVerdict(flagged, withData) : undefined}
        info={
          singleCommodity
            ? `Per ${formatDateId(asOf)}: harga sudah di atas acuan, atau berpeluang ≥ 40% melewatinya dalam 14 hari.`
            : `Per ${formatDateId(asOf)}: ${noun} yang menjual setidaknya 3 bahan pangan di atas acuan (HET/HAP, atau batas wajar bila tidak ada).`
        }
      />
    </div>
  );
}

function RegionQuickCard({
  region,
  row,
  alert,
  total,
  commodityCount,
  climate,
  month,
  singleCommodity,
  onClose,
}: {
  region: Region;
  row?: ScorecardRow;
  alert?: RegionAlert;
  total: number;
  commodityCount: number;
  climate?: ProvinceClimate;
  month: string;
  singleCommodity: boolean;
  onClose: () => void;
}) {
  if (!row) {
    return (
      <Card className="h-full">
        <CardBody className="space-y-3">
          <h2 className="font-display text-2xl font-bold text-ink">{region.name}</h2>
          <p className="text-sm text-ink-2">Belum ada data harga untuk pilihan ini.</p>
          <DrillDown region={region} month={month} />
        </CardBody>
      </Card>
    );
  }
  const facts: { label: string; value: ReactNode }[] = [
    { label: 'Peringkat', value: <RollingNumber text={`${row.rank} dari ${total}`} /> },
    {
      label: 'Kepatuhan batas harga',
      value:
        row.compliance !== null ? (
          <span className="inline-flex items-center gap-2">
            <RollingNumber text={formatPct(row.compliance)} /> <Verdict {...complianceVerdict(row.compliance)} />
          </span>
        ) : (
          'Tanpa HET/HAP'
        ),
    },
  ];
  if (alert && !singleCommodity) {
    facts.push({
      label: 'Bahan di atas acuan',
      value: (
        <span className="inline-flex items-center gap-2">
          <RollingNumber text={`${alert.above_count} dari ${commodityCount}`} /> <Verdict {...countVerdict(alert.above_count, commodityCount, 'Tidak ada')} />
        </span>
      ),
    });
  }
  if (alert && singleCommodity) facts.push({ label: 'Status hari ini', value: <StatusBadge status={alert.status} /> });
  if (climate) facts.push({ label: 'Risiko iklim', value: <ClimateLevelBadge level={climate.level} short /> });

  return (
    <Card className="h-full">
      <CardBody className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-3">{regionTypeLabel(region)}</p>
            <h2 className="font-display text-2xl font-bold text-ink">{region.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-xs font-semibold text-ink-3 hover:bg-surface-muted hover:text-ink">
            Tutup
          </button>
        </div>
        <div className="flex items-center gap-4 rounded-2xl bg-surface-muted p-4">
          <span className="anim-pop">
            <GradeBadge grade={row.grade} size="lg" />
          </span>
          <div>
            <p className="text-3xl leading-none font-semibold text-ink"><RollingNumber text={formatNumber(row.score)} /></p>
            <p className="mt-1 text-sm text-ink-2">{GRADE_META[row.grade].label}</p>
          </div>
        </div>
        <dl className="divide-y divide-line text-sm">
          {facts.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-ink-2">{f.label}</dt>
              <dd className="text-right font-semibold text-ink tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto space-y-2">
          <ButtonLink to={`/rapor-daerah/${region.id}?bulan=${month}`} className="w-full">
            Buka rapor lengkap <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <DrillDown region={region} month={month} />
        </div>
      </CardBody>
    </Card>
  );
}

/** Link into the sub-scope of a region (e.g. Jawa Barat → its 27 regencies/cities). */
function DrillDown({ region, month }: { region: Region; month: string }) {
  if (!region.child_scope) return null;
  return (
    <ButtonLink to={scopeHref(region.child_scope, month)} variant="secondary" className="w-full">
      <Layers className="h-4 w-4" /> Rincian kabupaten/kota
    </ButtonLink>
  );
}

/** Climate-mode side panel: every province, driest first (doubles as the map's table view). */
function ClimateList({ provinces, regionById, onSelect }: { provinces: ProvinceClimate[]; regionById: Map<string, Region>; onSelect: (id: string) => void }) {
  const rows = [...provinces].sort((a, b) => a.rain90_pct - b.rain90_pct);
  return (
    <Card className="h-full">
      <CardBody className="space-y-3">
        <p className="text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">Paling kering lebih dulu</p>
        <ul className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
          {rows.map((p) => (
            <li key={p.region_id}>
              <button type="button" onClick={() => onSelect(p.region_id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-surface-muted">
                <span className="flex-1 truncate text-sm text-ink">{regionById.get(p.region_id)?.name}</span>
                <span className="text-sm font-semibold text-ink tabular-nums">{formatNumber(p.rain90_pct, 0)}%</span>
                <ClimateLevelBadge level={p.level} short />
              </button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function Extremes({ rows, regionById, onSelect }: { rows: ScorecardRow[]; regionById: Map<string, Region>; onSelect: (id: string) => void }) {
  const list = (title: string, items: ScorecardRow[]) => (
    <div>
      <p className="mb-1.5 text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">{title}</p>
      <ul className="space-y-1">
        {items.map((r) => (
          <li key={r.region_id}>
            <button type="button" onClick={() => onSelect(r.region_id)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-muted">
              <GradeBadge grade={r.grade} size="sm" />
              <span className="flex-1 truncate text-sm text-ink">{regionById.get(r.region_id)?.name}</span>
              <span className="text-sm font-semibold text-ink tabular-nums">{formatNumber(r.score)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Card className="h-full">
      <CardBody className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl bg-surface-muted p-3 text-sm text-ink-2">
          <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          Pilih daerah di peta atau di peringkat untuk melihat rapornya.
        </div>
        {list('Paling stabil', rows.slice(0, 3))}
        {list('Paling rawan', rows.slice(-3).reverse())}
      </CardBody>
    </Card>
  );
}

const RANKING_PREVIEW = 10;

/** Ranking bars: the top ten first, the rest on request (or when the selection is further down). */
function Ranking({
  rows,
  regionById,
  selectedId,
  onSelect,
  title,
  table,
  noun,
}: {
  rows: ScorecardRow[];
  regionById: Map<string, Region>;
  selectedId?: string;
  onSelect: (id: string) => void;
  title: string;
  table: ReactNode;
  noun: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // Selecting a region below the preview opens the full list (once per selection).
  const [openedFor, setOpenedFor] = useState<string | undefined>();
  if (selectedId !== openedFor) {
    setOpenedFor(selectedId);
    if (rows.findIndex((r) => r.region_id === selectedId) >= RANKING_PREVIEW) setExpanded(true);
  }
  const collapsible = rows.length > RANKING_PREVIEW + 2;
  const shown = expanded || !collapsible ? rows : rows.slice(0, RANKING_PREVIEW);
  return (
    <ChartFrame
      title={
        <TitleWithInfo
          text={title}
          info="Skor 100 dikurangi penalti: hari harga di atas batas wajar, lamanya lonjakan, lamanya pulih, dan selisih dengan daerah tetangga. Rincian ada di halaman Metodologi."
        />
      }
      subtitle="Makin panjang batang, makin stabil harganya."
      table={table}
    >
      <RankBars
        label="Peringkat skor stabilitas harga"
        max={100}
        selectedId={selectedId}
        onSelect={onSelect}
        rows={shown.map((r) => ({
          id: r.region_id,
          label: regionById.get(r.region_id)?.name ?? r.region_id,
          value: r.score,
          valueText: formatNumber(r.score),
          badge: <GradeBadge grade={r.grade} size="sm" />,
        }))}
      />
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="btn mx-auto mt-3 flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold text-accent hover:border-mint hover:bg-accent-soft"
        >
          {expanded ? `Tampilkan ${RANKING_PREVIEW} ${noun} teratas` : `Tampilkan semua ${rows.length} ${noun}`}
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}
    </ChartFrame>
  );
}

function RankingTable({ rows, regionById, month, noun }: { rows: ScorecardRow[]; regionById: Map<string, Region>; month: string; noun: string }) {
  return (
    <DataTable<ScorecardRow>
      caption={`Rapor seluruh ${noun}`}
      rows={rows}
      rowKey={(r) => r.region_id}
      initialSort={{ key: 'rank', dir: 'asc' }}
      columns={[
        { key: 'rank', header: '#', align: 'right', sortValue: (r) => r.rank },
        {
          key: 'name',
          header: 'Daerah',
          sortValue: (r) => regionById.get(r.region_id)?.name ?? '',
          render: (r) => (
            <Link to={`/rapor-daerah/${r.region_id}?bulan=${month}`} className="font-semibold text-accent hover:underline">
              {regionById.get(r.region_id)?.name}
            </Link>
          ),
        },
        { key: 'score', header: 'Stabilitas', sortValue: (r) => r.score, render: (r) => <span className="inline-flex items-center gap-2 tabular-nums">{formatNumber(r.score)} <GradeBadge grade={r.grade} size="sm" showLabel /></span> },
        {
          key: 'compliance',
          header: 'Kepatuhan batas harga',
          sortValue: (r) => r.compliance ?? -1,
          render: (r) =>
            r.compliance !== null ? (
              <span className="inline-flex items-center gap-2 tabular-nums">
                {formatPct(r.compliance)} <Verdict {...complianceVerdict(r.compliance)} />
              </span>
            ) : (
              <span className="text-ink-3">–</span>
            ),
        },
      ]}
    />
  );
}

function OverviewSkeleton({ bare = false }: { bare?: boolean }) {
  return (
    <div className="space-y-6" aria-busy="true">
      {!bare && <Placeholder className="h-24" />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Placeholder key={i} className="h-28" />
        ))}
      </div>
      <Placeholder className="h-[480px]" />
    </div>
  );
}

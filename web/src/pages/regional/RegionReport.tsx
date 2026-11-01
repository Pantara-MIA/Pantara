import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Layers, TrendingUp } from 'lucide-react';
import { SiteShell } from '../../components/layout/SiteShell';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { GradeBadge, StatusBadge, Tag } from '../../components/ui/Badge';
import { InfoTip, TitleWithInfo } from '../../components/ui/InfoTip';
import { StatTile } from '../../components/ui/StatTile';
import { NativeSelect } from '../../components/ui/NativeSelect';
import { DataTable } from '../../components/ui/DataTable';
import { EmptyState, ErrorState, Notice, Placeholder } from '../../components/ui/Feedback';
import { ButtonLink } from '../../components/ui/Button';
import { ScopeBreadcrumb, SourceNote } from '../../components/regional/ScopeNav';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { RankBars } from '../../components/charts/RankBars';
import { PriceChart, PriceChartLegend, PriceTable } from '../../components/charts/PriceChart';
import { ScoreTrendChart, ScoreTrendTable } from '../../components/regional/ScoreTrendChart';
import { MODEL_LABEL, fetchPrices, fetchRegionScorecard, fetchRegions, referenceFor, scopeHref } from '../../lib/regional';
import type { Alert, CommodityMetrics, Episode, RegionalCommodity, RegionsResponse, RegionScorecardResponse } from '../../lib/regional';
import {
  GRADE_META,
  REFERENCE_TYPE_LABEL,
  complianceVerdict,
  countVerdict,
  formatMonth,
  monthAsOf,
  recoveryVerdict,
  regionTypeLabel,
  scoreVerdict,
  shortRegionName,
} from '../../lib/scorecard';
import { formatDate, formatIDR, formatNumber, formatPct } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { fetchPublicInterventions } from '../../lib/interventions';
import { InterventionCard } from '../../components/interventions/InterventionCard';
import { Reveal } from '../../components/motion/Reveal';
import { ClimateSummary, RainChart } from '../../components/climate/Climate';
import { fetchRegionClimate } from '../../lib/climate';

/** Full scorecard of one province or regency/city for one month. */
export default function RegionReport() {
  const { regionId = '' } = useParams();
  const meta = useApi((s) => fetchRegions({ region: regionId }, s), [regionId]);

  if (meta.error === 'unknown region') {
    return (
      <SiteShell>
        <EmptyState title="Daerah tidak ditemukan" action={<Link to="/rapor-daerah" className="font-semibold text-accent underline">Kembali ke Rapor Daerah</Link>}>
          Tautan ini tidak cocok dengan provinsi atau kabupaten/kota mana pun.
        </EmptyState>
      </SiteShell>
    );
  }
  if (meta.error) {
    return (
      <SiteShell>
        <ErrorState message={meta.error} onRetry={meta.reload} />
      </SiteShell>
    );
  }
  if (!meta.data || !meta.data.regions.some((r) => r.id === regionId)) {
    return (
      <SiteShell>
        <Placeholder className="h-[600px]" />
      </SiteShell>
    );
  }
  return (
    <SiteShell>
      <Report key={regionId} meta={meta.data} regionId={regionId} />
    </SiteShell>
  );
}

function Report({ meta, regionId }: { meta: RegionsResponse; regionId: string }) {
  const [params, setParams] = useSearchParams();
  const latest = meta.months[meta.months.length - 1];
  const month = meta.months.includes(params.get('bulan') ?? '') ? params.get('bulan')! : latest;
  const report = useApi((s) => fetchRegionScorecard(regionId, month, undefined, s), [regionId, month]);

  const set = (key: string, value: string | undefined) =>
    setParams(
      (p) => {
        if (value === undefined) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );

  const region = meta.regions.find((r) => r.id === regionId)!;
  const commodityById = useMemo(() => new Map(meta.commodities.map((c) => [c.id, c])), [meta]);

  return (
    <>
      <ScopeBreadcrumb trail={meta.breadcrumb} month={month} current={region.name} />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {report.data && <GradeBadge grade={report.data.scorecard.grade} size="lg" />}
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-ink-3 uppercase">
              {regionTypeLabel(region)} · {meta.scope.name}
            </p>
            <h1 className="font-display text-3xl leading-tight font-bold text-ink sm:text-4xl">{region.name}</h1>
            {report.data && (
              <p className="mt-1 text-sm text-ink-2">
                Predikat {report.data.scorecard.grade} · {GRADE_META[report.data.scorecard.grade].label} · peringkat {report.data.scorecard.rank} dari {meta.regions.length}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {region.child_scope && (
            <ButtonLink to={scopeHref(region.child_scope, month)} variant="secondary">
              <Layers className="h-4 w-4" /> Rincian kabupaten/kota
            </ButtonLink>
          )}
          <NativeSelect
            label="Bulan"
            value={month}
            onChange={(v) => set('bulan', v === latest ? undefined : v)}
            options={[...meta.months].reverse().map((m) => ({ value: m, label: formatMonth(m) }))}
          />
        </div>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SourceNote scope={meta.scope} />
        {region.type !== 'province' && (
          <span className="inline-flex items-center gap-1 text-xs text-ink-2">
            Data asli untuk {region.real_commodities} dari {meta.commodities.length} bahan
            {region.real_commodities < meta.commodities.length && (
              <InfoTip label="Data simulasi">Bahan lain belum dipantau di daerah ini, jadi harganya disimulasikan dan diberi tanda “Simulasi” di tabel.</InfoTip>
            )}
          </span>
        )}
      </div>

      {report.error ? (
        <Card>
          <ErrorState message={report.error} onRetry={report.reload} />
        </Card>
      ) : !report.data ? (
        <Placeholder className="h-[600px]" />
      ) : (
        <div className={`space-y-6 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
          <ReportBody
            data={report.data}
            meta={meta}
            commodityById={commodityById}
            selectedCommodity={params.get('komoditas') ?? undefined}
            onSelectCommodity={(id) => set('komoditas', id)}
          />
        </div>
      )}
    </>
  );
}

function ReportBody({
  data,
  meta,
  commodityById,
  selectedCommodity,
  onSelectCommodity,
}: {
  data: RegionScorecardResponse;
  meta: RegionsResponse;
  commodityById: Map<string, RegionalCommodity>;
  selectedCommodity?: string;
  onSelectCommodity: (id: string) => void;
}) {
  const sc = data.scorecard;
  const regionById = new Map(meta.regions.map((r) => [r.id, r]));
  const alertById = new Map(data.alerts.map((a) => [a.commodity_id, a]));
  const prev = data.history.length > 1 ? data.history[data.history.length - 2] : undefined;
  const diff = prev ? sc.score - prev.score : undefined;

  // Recovery time is only meaningful for episodes that actually recovered;
  // ongoing ones are reported separately instead of inflating the mean.
  const recovered = sc.commodities.flatMap((c) => c.episodes.filter((e) => !e.ongoing));
  const ongoing = sc.commodities.reduce((n, c) => n + c.episodes.filter((e) => e.ongoing).length, 0);
  const recovery = recovered.length ? recovered.reduce((n, e) => n + e.recovery_days, 0) / recovered.length : 0;
  const neighborMean = data.neighbors.length ? data.neighbors.reduce((s, n) => s + n.score, 0) / data.neighbors.length : undefined;

  // Default chart commodity: the worst-scoring one this month.
  const worst = [...sc.commodities].sort((a, b) => a.score - b.score)[0];
  const focusId = sc.commodities.some((c) => c.commodity_id === selectedCommodity) ? selectedCommodity! : worst.commodity_id;
  const focus = sc.commodities.find((c) => c.commodity_id === focusId)!;

  const comparison = [{ region_id: sc.region_id, score: sc.score, grade: sc.grade }, ...data.neighbors].sort((a, b) => b.score - a.score);
  const above = data.alerts.filter((a) => a.status === 'above_reference').length;
  const tracked = data.alerts.filter((a) => a.status !== 'no_data').length;
  const regulatedCount = sc.commodities.filter((c) => c.regulated).length;
  const spikes = recovered.length + ongoing;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          emphasis
          label={`Stabilitas harga · ${formatMonth(data.month)}`}
          value={formatNumber(sc.score)}
          unit="/100"
          verdict={scoreVerdict(sc.score)}
          info="Makin tinggi makin stabil: ≥ 85 sangat stabil, 70–85 stabil, 55–70 cukup, di bawah 55 rawan. Turun bila harga sering, lama, atau parah melonjak di atas batas wajarnya."
          delta={
            diff !== undefined && prev
              ? {
                  text: `${diff >= 0 ? '+' : ''}${formatNumber(diff)} poin`,
                  direction: Math.abs(diff) < 0.05 ? 'flat' : diff > 0 ? 'up' : 'down',
                  upIsGood: true,
                  versus: `vs ${formatMonth(prev.month)}`,
                }
              : undefined
          }
        />
        <StatTile
          label="Kepatuhan batas harga"
          value={sc.compliance !== null ? formatPct(sc.compliance) : '–'}
          verdict={sc.compliance !== null ? complianceVerdict(sc.compliance) : undefined}
          info={
            sc.compliance !== null
              ? `Porsi hari harga berada di bawah HET/HAP (batas harga dari pemerintah). ≥ 80% dianggap patuh. ${sc.ceiling_breached} dari ${regulatedCount} bahan berbatas harga pernah melewatinya bulan ini.`
              : 'Tidak ada bahan dengan batas harga dari pemerintah (HET/HAP) di daerah ini.'
          }
        />
        <StatTile
          label="Bahan di atas acuan"
          value={above}
          unit={`dari ${tracked}`}
          verdict={countVerdict(above, tracked, 'Tidak ada')}
          info="Bahan yang harganya di akhir periode ini sudah melewati HET/HAP, atau batas wajarnya bila tidak punya HET/HAP."
        />
        <StatTile
          label="Lama harga pulih"
          value={recovered.length ? formatNumber(recovery) : '–'}
          unit={recovered.length ? 'hari' : undefined}
          verdict={
            recovered.length
              ? recoveryVerdict(recovery)
              : spikes
                ? { label: 'Belum pulih', tone: 'critical' }
                : { label: 'Tidak ada lonjakan', tone: 'good' }
          }
          info={`Rata-rata waktu dari puncak lonjakan sampai harga kembali normal; ≥ 10 hari dianggap lambat. Bulan ini: ${spikes} lonjakan${ongoing ? `, ${ongoing} belum pulih` : ''}.`}
        />
      </div>

      <Reveal className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title={<TitleWithInfo text="Tren 12 bulan" info="Garis putus-putus menandai batas predikat: A (85), B (70), C (55), D (40)." />}
          subtitle="Makin tinggi makin stabil."
          table={<ScoreTrendTable data={data.history} />}
        >
          <ScoreTrendChart data={data.history} />
        </ChartFrame>
        <ChartFrame
          title="Dibanding daerah tetangga"
          subtitle={
            neighborMean !== undefined
              ? `${shortRegionName(regionById.get(sc.region_id)!)} ${sc.score >= neighborMean ? 'lebih stabil' : 'kurang stabil'} dari rata-rata tetangganya (${formatNumber(neighborMean)}).`
              : `Tidak bertetangga dengan daerah lain di ${meta.scope.name}.`
          }
        >
          <RankBars
            label="Skor daerah ini dan tetangganya"
            max={100}
            selectedId={sc.region_id}
            rows={comparison.map((n) => ({
              id: n.region_id,
              label: regionById.get(n.region_id)?.name ?? n.region_id,
              sublabel: n.region_id === sc.region_id ? 'Daerah ini' : undefined,
              value: n.score,
              valueText: formatNumber(n.score),
              badge: <GradeBadge grade={n.grade} size="sm" />,
            }))}
          />
        </ChartFrame>
      </Reveal>

      <Reveal>
      <Card>
        <CardHeader
          title={
            <TitleWithInfo
              text="Rapor per bahan pangan"
              info="Hari melonjak = hari harga di atas batas wajarnya (median 90 hari + 10%). Selisih batas harga = rata-rata harga dibanding HET/HAP bulan ini."
            />
          }
          subtitle="Dari yang paling tidak stabil. Klik baris untuk melihat grafik harganya."
        />
        <CommodityTable
          metrics={sc.commodities}
          alertById={alertById}
          commodityById={commodityById}
          selectedId={focusId}
          onSelect={onSelectCommodity}
        />
      </Card>
      </Reveal>

      <RegionClimate
        regionId={sc.region_id}
        asOf={monthAsOf(data.month, meta.date_range.end)}
        provinceName={data.region.type === 'province' ? data.region.name : meta.scope.name}
        commodities={meta.commodities}
      />

      <RegionInterventions regionId={sc.region_id} regionName={regionById.get(sc.region_id)!.name} />

      <FocusCommodity
        regionId={sc.region_id}
        regionName={regionById.get(sc.region_id)!.name}
        month={data.month}
        dataEnd={meta.date_range.end}
        metrics={focus}
        commodity={commodityById.get(focusId)!}
      />
    </>
  );
}

function CommodityTable({
  metrics,
  alertById,
  commodityById,
  selectedId,
  onSelect,
}: {
  metrics: CommodityMetrics[];
  alertById: Map<string, Alert>;
  commodityById: Map<string, RegionalCommodity>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <DataTable<CommodityMetrics>
      caption="Rapor per komoditas"
      rows={metrics}
      rowKey={(m) => m.commodity_id}
      selectedKey={selectedId}
      onRowClick={(m) => onSelect(m.commodity_id)}
      initialSort={{ key: 'score', dir: 'asc' }}
      columns={[
        {
          key: 'name',
          header: 'Komoditas',
          sortValue: (m) => commodityById.get(m.commodity_id)?.name ?? '',
          render: (m) => {
            const c = commodityById.get(m.commodity_id);
            return (
              <span className="flex flex-col">
                <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                  {c?.name}
                  {m.source === 'synthetic' && <Tag tone="warning">Simulasi</Tag>}
                </span>
                <span className="text-xs text-ink-3">
                  {m.regulated ? `Batas ${REFERENCE_TYPE_LABEL[m.reference_type]} ${formatIDR(m.mean_ceiling ?? 0)}` : 'Tanpa batas harga'}
                </span>
              </span>
            );
          },
        },
        {
          key: 'score',
          header: 'Stabilitas',
          sortValue: (m) => m.score,
          render: (m) => (
            <span className="inline-flex items-center gap-2 tabular-nums">
              {formatNumber(m.score)} <GradeBadge grade={m.grade} size="sm" />
            </span>
          ),
        },
        {
          key: 'days',
          header: 'Hari melonjak',
          align: 'right',
          hideOnMobile: true,
          sortValue: (m) => m.days_above_normal,
          render: (m) => (
            <span className={m.days_above_normal === 0 ? 'text-ink-3' : ''}>
              {m.days_above_normal} dari {m.observed_days}
            </span>
          ),
        },
        {
          key: 'ceiling',
          header: 'Selisih batas harga',
          align: 'right',
          sortValue: (m) => (m.regulated ? m.ceiling_gap_pct : -999),
          render: (m) =>
            m.regulated ? (
              <span className={`font-semibold ${m.ceiling_gap_pct > 0 ? 'text-critical-ink' : 'text-good-ink'}`}>
                {m.ceiling_gap_pct > 0 ? `${formatPct(m.ceiling_gap_pct)} di atas` : `${formatPct(Math.abs(m.ceiling_gap_pct))} di bawah`}
              </span>
            ) : (
              <span className="text-ink-3">–</span>
            ),
        },
        {
          key: 'alert',
          header: 'Status',
          sortValue: (m) => ({ above_reference: 2, watch: 1, normal: 0, no_data: -1 })[alertById.get(m.commodity_id)?.status ?? 'no_data'],
          render: (m) => {
            const a = alertById.get(m.commodity_id);
            return a ? <StatusBadge status={a.status} /> : null;
          },
        },
      ]}
    />
  );
}

/** Climate of the region's province on the report date: rain vs normal, ENSO and what they meant for prices. */
function RegionClimate({ regionId, asOf, provinceName, commodities }: { regionId: string; asOf: string; provinceName: string; commodities: RegionalCommodity[] }) {
  const climate = useApi((s) => fetchRegionClimate(regionId, asOf, s), [regionId, asOf]);
  if (climate.error || !climate.data?.climate) return null;
  const c = climate.data;
  return (
    <Reveal className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader
          title={<TitleWithInfo text="Kondisi iklim" info="Cuaca dari Open-Meteo (ERA5), status El Niño/La Niña dari NOAA. Hujan di bawah biasanya, apalagi saat El Niño, sering diikuti kenaikan harga." />}
          subtitle={`Per ${formatDate(c.weather_as_of)}`}
        />
        <CardBody>
          <ClimateSummary climate={c.climate!} enso={c.enso} provinceName={provinceName} commodities={commodities} />
        </CardBody>
      </Card>
      <RainChart history={c.history} provinceName={provinceName} weatherAsOf={c.weather_as_of} />
    </Reveal>
  );
}

/** Published interventions in this region (latest three), linking to the full log. */
function RegionInterventions({ regionId, regionName }: { regionId: string; regionName: string }) {
  const list = useApi((s) => fetchPublicInterventions({ region: regionId, limit: 3 }, s), [regionId]);
  if (list.error || !list.data) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Intervensi pemerintah di {regionName}</h2>
        <Link to={`/intervensi?daerah=${regionId}`} className="text-sm font-semibold text-accent hover:underline">
          Lihat semua intervensi
        </Link>
      </div>
      {list.data.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-2">Belum ada intervensi yang dipublikasikan untuk daerah ini.</p>
          </CardBody>
        </Card>
      ) : (
        list.data.map((it) => (
          <Reveal key={it.id}>
            <InterventionCard it={it} />
          </Reveal>
        ))
      )}
    </section>
  );
}

function FocusCommodity({
  regionId,
  regionName,
  month,
  dataEnd,
  metrics,
  commodity,
}: {
  regionId: string;
  regionName: string;
  month: string;
  dataEnd: string;
  metrics: CommodityMetrics;
  commodity: RegionalCommodity;
}) {
  // Show the selected month plus the two before it, so episodes have context.
  const [y, m] = month.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const asOf = monthEnd < dataEnd ? monthEnd : dataEnd;
  const prices = useApi((s) => fetchPrices(regionId, commodity.id, 120, asOf, s), [regionId, commodity.id, asOf]);
  const reference = referenceFor(commodity, metrics.source);
  const regulated = metrics.reference_type !== 'baseline';
  const refLabel = regulated ? REFERENCE_TYPE_LABEL[metrics.reference_type] : 'Batas wajar (acuan statistik)';
  const normalLabel = regulated ? 'Batas wajar (stabilitas)' : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {prices.data ? (
        <ChartFrame
          title={
            <TitleWithInfo
              text={`${commodity.name} di ${regionName}`}
              info={`Rp per ${commodity.unit}, 120 hari sampai ${formatDate(asOf)}. Perkiraan 14 hari dari model ${MODEL_LABEL[prices.data.forecast.model]}; harga punya peluang 80% berada di dalam rentang hijau muda.`}
            />
          }
          subtitle="Harga 4 bulan terakhir dan perkiraan 2 minggu ke depan."
          legend={<PriceChartLegend regionLabel={regionName} referenceLabel={refLabel} normalLabel={normalLabel} showNeighbors forecast={prices.data.forecast} />}
          table={<PriceTable series={prices.data.series} forecast={prices.data.forecast} regionLabel={regionName} referenceLabel={refLabel} showNeighbors />}
          actions={<StatusBadge status={prices.data.alert.status} />}
          dimmed={prices.loading}
          footnote={
            <span className="inline-flex flex-wrap items-center gap-1">
              Sumber: {prices.data.source_label}
              {prices.data.source === 'synthetic' && ' (data simulasi)'}
              <InfoTip label="Batas harga">
                {reference.basis}
                {reference.status === 'indicative' && ' Nilai indikatif, belum diverifikasi ke regulasi terbaru.'}
              </InfoTip>
            </span>
          }
        >
          <PriceChart series={prices.data.series} forecast={prices.data.forecast} regionLabel={regionName} referenceLabel={refLabel} normalLabel={normalLabel} showNeighbors />
        </ChartFrame>
      ) : prices.error ? (
        <Card>
          <ErrorState message={prices.error} onRetry={prices.reload} />
        </Card>
      ) : (
        <Placeholder className="h-[420px]" />
      )}

      <Card>
        <CardHeader
          title={
            <TitleWithInfo
              text="Lonjakan harga"
              info="Lonjakan = harga di atas batas wajarnya (median 90 hari + 10%) minimal 3 hari berturut-turut. Puncak = seberapa jauh harga melewati batas wajar itu."
            />
          }
          subtitle={`${commodity.name} · ${formatMonth(month)}`}
        />
        <CardBody>
          {metrics.episodes.length === 0 ? (
            <p className="text-sm text-ink-2">Tidak ada lonjakan harga bulan ini.</p>
          ) : (
            <ol className="space-y-3">
              {metrics.episodes.map((e) => (
                <EpisodeItem key={e.start} e={e} />
              ))}
            </ol>
          )}
          {prices.data?.alert.status === 'watch' && prices.data.alert.days_to_breach ? (
            <div className="mt-4">
              <Notice tone="warning" title="Perkiraan">
                Harga kemungkinan besar melewati acuan dalam {prices.data.alert.days_to_breach} hari ke depan.
              </Notice>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function EpisodeItem({ e }: { e: Episode }) {
  return (
    <li className="rounded-2xl border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {formatDate(e.start)} – {formatDate(e.end)}
        </p>
        {e.ongoing && <Tag tone="warning">Belum pulih</Tag>}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink-3">Durasi</dt>
          <dd className="font-semibold text-ink">{e.duration_days} hari</dd>
        </div>
        <div>
          <dt className="text-ink-3">Puncak</dt>
          <dd className="inline-flex items-center gap-1 font-semibold text-ink">
            <TrendingUp className="h-3 w-3 text-critical" aria-hidden="true" />+{formatPct(e.peak_pct)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">{e.ongoing ? 'Sejak puncak' : 'Pulih dalam'}</dt>
          <dd className="font-semibold text-ink">{e.recovery_days} hari</dd>
        </div>
      </dl>
      <p className="mt-1.5 text-xs text-ink-3">
        Puncak {formatIDR(e.peak_price)} pada {formatDate(e.peak)}
      </p>
    </li>
  );
}

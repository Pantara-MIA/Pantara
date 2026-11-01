import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BellRing, Calculator, ClipboardList, Download, FilePlus2, LineChart, LogOut, Pencil, Send, Trash2 } from 'lucide-react';
import { SiteShell, PageHeader } from '../../components/layout/SiteShell';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import { StatTile } from '../../components/ui/StatTile';
import { Tabs } from '../../components/ui/Tabs';
import { NativeSelect } from '../../components/ui/NativeSelect';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { TextField } from '../../components/ui/Field';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Notice, Placeholder } from '../../components/ui/Feedback';
import { ChartFrame } from '../../components/charts/ChartFrame';
import { PriceChart, PriceChartLegend, PriceTable } from '../../components/charts/PriceChart';
import { InterventionCard } from '../../components/interventions/InterventionCard';
import { InterventionForm } from '../../components/interventions/InterventionForm';
import type { InterventionDraft } from '../../components/interventions/InterventionForm';
import { PlanningTab } from '../../components/government/PlanningTab';
import { auth } from '../../lib/auth';
import { API_BASE } from '../../lib/api';
import { exportUrl, gov } from '../../lib/interventions';
import type { GovernmentProfile, Intervention } from '../../lib/interventions';
import { MODEL_LABEL, NATIONAL_SCOPE, fetchPrices, fetchRegions, referenceFor, scopeCommodities } from '../../lib/regional';
import type { AlertStatus, RegionsResponse } from '../../lib/regional';
import { SourceNote } from '../../components/regional/ScopeNav';
import { REFERENCE_TYPE_LABEL, commodityGroups } from '../../lib/scorecard';
import { formatDate, formatIDR, formatPct } from '../../lib/format';
import { useApi } from '../../lib/useApi';

type Tab = 'tindakan' | 'prakiraan' | 'perencanaan' | 'intervensi';

const GOV_NAV = [
  { to: '/pemerintah', label: 'Dashboard' },
  { to: '/rapor-daerah', label: 'Rapor Daerah' },
  { to: '/intervensi', label: 'Intervensi Publik' },
];

/** Government workspace: watchlist, forecasts & exports, and the intervention log. */
export default function GovernmentDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<GovernmentProfile | null>(null);
  const [authError, setAuthError] = useState('');
  const scope = profile?.scope;
  const meta = useApi((s) => (scope ? fetchRegions({ scope }, s) : Promise.resolve(null)), [scope]);

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      navigate('/login', { replace: true });
      return;
    }
    gov
      .me()
      .then((me) => {
        if (me.role !== 'government') navigate(auth.homeFor(me.role), { replace: true });
        else setProfile(me);
      })
      .catch((e: Error) => setAuthError(e.message));
  }, [navigate]);

  const logout = () => {
    auth.clearToken();
    navigate('/login');
  };

  return (
    <SiteShell
      nav={GOV_NAV}
      headerActions={
        profile && (
          <button
            type="button"
            onClick={logout}
            className="hidden items-center gap-1.5 rounded-full border border-mint px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent-soft sm:inline-flex"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Keluar
          </button>
        )
      }
    >
      {authError ? (
        <ErrorState message={authError} onRetry={() => window.location.reload()} />
      ) : meta.error ? (
        <ErrorState message={meta.error} onRetry={meta.reload} />
      ) : !profile || !meta.data ? (
        <Placeholder className="h-[600px]" />
      ) : (
        <Workspace profile={profile} meta={meta.data} onLogout={logout} />
      )}
    </SiteShell>
  );
}

function Workspace({ profile, meta, onLogout }: { profile: GovernmentProfile; meta: RegionsResponse; onLogout: () => void }) {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (['tindakan', 'prakiraan', 'perencanaan', 'intervensi'] as Tab[]).includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'tindakan';
  const asOfParam = params.get('per') ?? '';
  const asOf = asOfParam >= meta.date_range.start && asOfParam <= meta.date_range.end ? asOfParam : meta.date_range.end;

  const set = (patch: Record<string, string | undefined>) =>
    setParams(
      (p) => {
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace: true },
    );

  const regions = useMemo(() => meta.regions.filter((r) => profile.regions.includes(r.id)), [meta, profile.regions]);
  const commodities = useMemo(() => scopeCommodities(meta), [meta]);
  const defaultCommodity = commodities.some((c) => c.id === 'cabai-rawit-merah') ? 'cabai-rawit-merah' : commodities[0].id;
  const interventions = useApi(() => gov.list(), []);
  const [form, setForm] = useState<Intervention | InterventionDraft | null>(null);

  const openNew = (region_id = regions[0].id, commodity_id = defaultCommodity) => setForm({ region_id, commodity_id, baseline_date: asOf });
  const drafts = interventions.data?.filter((i) => i.status === 'draft') ?? [];

  return (
    <>
      <PageHeader
        eyebrow={`Dashboard Pemerintah · ${profile.agency_name}`}
        title={`Pengendalian Harga ${profile.region_name}`}
        description="Pantau komoditas yang melampaui atau berisiko melampaui acuan, catat intervensi, lalu publikasikan agar masyarakat dapat menilai hasilnya."
        actions={
          <>
            <TextField
              label="Data per tanggal"
              type="date"
              min={meta.date_range.start}
              max={meta.date_range.end}
              value={asOf}
              onChange={(e) => set({ per: e.target.value && e.target.value !== meta.date_range.end ? e.target.value : undefined })}
            />
            <Button variant="primary" onClick={() => openNew()}>
              <FilePlus2 className="h-4 w-4" /> Catat intervensi
            </Button>
            <Button variant="secondary" onClick={onLogout} className="sm:hidden">
              <LogOut className="h-4 w-4" /> Keluar
            </Button>
          </>
        }
      />
      <SourceNote scope={meta.scope} className="-mt-4 mb-6" />

      <Tabs<Tab>
        label="Bagian dashboard"
        idPrefix="gov"
        value={tab}
        onChange={(v) => set({ tab: v === 'tindakan' ? undefined : v })}
        items={[
          { value: 'tindakan', label: 'Perlu tindakan', icon: BellRing },
          { value: 'prakiraan', label: 'Prakiraan & riwayat', icon: LineChart },
          { value: 'perencanaan', label: 'Perencanaan operasi pasar', icon: Calculator },
          { value: 'intervensi', label: 'Intervensi', icon: ClipboardList, count: drafts.length },
        ]}
      />

      <div key={tab} role="tabpanel" id={`gov-panel-${tab}`} aria-labelledby={`gov-tab-${tab}`} className="anim-rise pt-6">
        {tab === 'tindakan' && (
          <WatchlistTab
            profile={profile}
            asOf={asOf}
            interventions={interventions.data ?? []}
            onRecord={(r, c) => setForm({ region_id: r, commodity_id: c, baseline_date: asOf })}
            onChart={(r, c) => set({ tab: 'prakiraan', daerah: r, komoditas: c })}
          />
        )}
        {tab === 'prakiraan' && (
          <ForecastTab
            meta={meta}
            regions={regions}
            asOf={asOf}
            region={regions.some((r) => r.id === params.get('daerah')) ? params.get('daerah')! : regions[0].id}
            commodity={commodities.some((c) => c.id === params.get('komoditas')) ? params.get('komoditas')! : defaultCommodity}
            onChange={(daerah, komoditas) => set({ daerah, komoditas })}
            onRecord={openNew}
          />
        )}
        {tab === 'perencanaan' && <PlanningTab asOf={asOf} meta={meta} onDraft={setForm} />}
        {tab === 'intervensi' && <InterventionsTab state={interventions} onEdit={setForm} onNew={() => openNew()} />}
      </div>

      {form && (
        <InterventionForm
          key={'id' in form ? form.id : `${form.region_id}|${form.commodity_id}|${form.baseline_date}|${form.title ?? ''}`}
          open
          source={form}
          regions={regions}
          commodities={commodities}
          dateRange={meta.date_range}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            interventions.reload();
            set({ tab: 'intervensi' });
          }}
        />
      )}
    </>
  );
}

// ─── Perlu tindakan ──────────────────────────────────────────────────────────

interface WatchItem {
  region_id: string;
  region_name: string;
  commodity_id: string;
  commodity_name: string;
  current_price: number;
  reference: number;
  status: AlertStatus;
  max_breach_prob: number;
  days_to_breach: number;
}

function WatchlistTab({
  profile,
  asOf,
  interventions,
  onRecord,
  onChart,
}: {
  profile: GovernmentProfile;
  asOf: string;
  interventions: Intervention[];
  onRecord: (region: string, commodity: string) => void;
  onChart: (region: string, commodity: string) => void;
}) {
  const watch = useApi(
    async (s) => {
      const res = await fetch(`${API_BASE}/api/v1/public/watchlist?region=${profile.region_id}&as_of=${asOf}`, { signal: s });
      if (!res.ok) throw new Error(`Server menjawab ${res.status}.`);
      return (await res.json()) as { as_of: string; items: WatchItem[] };
    },
    [profile.region_id, asOf],
  );
  const multi = profile.regions.length > 1;
  const items = watch.data?.items ?? [];
  const above = items.filter((i) => i.status === 'above_reference').length;
  const watching = items.length - above;
  const published = interventions.filter((i) => i.status === 'published').length;

  return (
    <div className={`space-y-6 transition-opacity ${watch.loading ? 'opacity-60' : ''}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile emphasis label="Di atas acuan" value={above} hint={`kombinasi ${multi ? 'daerah × ' : ''}komoditas per ${formatDate(asOf)}`} />
        <StatTile label="Waspada" value={watching} hint="Peluang melampaui acuan ≥ 40% dalam 14 hari" />
        <StatTile label="Draf intervensi" value={interventions.length - published} hint="Belum terlihat publik" />
        <StatTile label="Intervensi dipublikasikan" value={published} hint="Terbuka di halaman Intervensi Publik" />
      </div>

      <Card>
        <CardHeader
          title="Komoditas yang perlu perhatian"
          subtitle="Diurutkan dari yang paling mendesak: sudah di atas acuan, lalu peluang melampaui tertinggi."
        />
        {watch.error ? (
          <ErrorState message={watch.error} onRetry={watch.reload} />
        ) : !watch.data ? (
          <CardBody>
            <Placeholder className="h-48" />
          </CardBody>
        ) : items.length === 0 ? (
          <EmptyState title="Semua harga terkendali">Tidak ada komoditas di atas acuan atau berstatus waspada per {formatDate(asOf)}.</EmptyState>
        ) : (
          <DataTable<WatchItem>
            caption="Komoditas yang perlu perhatian"
            rows={items}
            rowKey={(i) => `${i.region_id}|${i.commodity_id}`}
            columns={[
              {
                key: 'commodity',
                header: multi ? 'Komoditas · daerah' : 'Komoditas',
                render: (i) => (
                  <span className="flex flex-col">
                    <span className="font-semibold">{i.commodity_name}</span>
                    {multi && <span className="text-xs text-ink-3">{i.region_name}</span>}
                  </span>
                ),
              },
              { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
              {
                key: 'price',
                header: 'Harga vs acuan',
                align: 'right',
                render: (i) => (
                  <span className="flex flex-col items-end">
                    <span className="font-semibold">{formatIDR(i.current_price)}</span>
                    <span className="text-xs text-ink-3">
                      acuan {formatIDR(i.reference)} ({i.current_price >= i.reference ? '+' : ''}
                      {formatPct((i.current_price / i.reference - 1) * 100)})
                    </span>
                  </span>
                ),
              },
              { key: 'prob', header: 'Peluang lampaui (14 hr)', align: 'right', hideOnMobile: true, render: (i) => formatPct(i.max_breach_prob * 100, 0) },
              {
                key: 'actions',
                header: 'Tindakan',
                align: 'right',
                render: (i) => (
                  <span className="inline-flex gap-1.5">
                    <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => onChart(i.region_id, i.commodity_id)}>
                      <LineChart className="h-3.5 w-3.5" /> Grafik
                    </Button>
                    <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => onRecord(i.region_id, i.commodity_id)}>
                      <FilePlus2 className="h-3.5 w-3.5" /> Catat
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

// ─── Prakiraan & riwayat ─────────────────────────────────────────────────────

function ForecastTab({
  meta,
  regions,
  asOf,
  region,
  commodity,
  onChange,
  onRecord,
}: {
  meta: RegionsResponse;
  regions: RegionsResponse['regions'];
  asOf: string;
  region: string;
  commodity: string;
  onChange: (region: string, commodity: string) => void;
  onRecord: (region: string, commodity: string) => void;
}) {
  const [range, setRange] = useState<'90' | '180' | '365'>('180');
  const prices = useApi((s) => fetchPrices(region, commodity, Number(range), asOf, s), [region, commodity, range, asOf]);
  const reg = meta.regions.find((r) => r.id === region)!;
  const com = meta.commodities.find((c) => c.id === commodity)!;
  const refType = prices.data?.reference_type ?? com.reference.type;
  const refLabel = `${REFERENCE_TYPE_LABEL[refType]}${refType === 'baseline' ? '' : ' (acuan)'}`;
  const reference = referenceFor(com, prices.data?.source);
  const scopeLabel = meta.scope.id === NATIONAL_SCOPE ? 'Median nasional' : `Median ${meta.scope.name}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {regions.length > 1 && (
          <NativeSelect label="Daerah" value={region} onChange={(v) => onChange(v, commodity)} options={regions.map((r) => ({ value: r.id, label: r.name }))} />
        )}
        <NativeSelect label="Komoditas" value={commodity} onChange={(v) => onChange(region, v)} groups={commodityGroups(scopeCommodities(meta))} className="min-w-60" />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">Rentang riwayat</span>
          <SegmentedControl
            label="Rentang riwayat"
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

      {prices.error ? (
        <Card>
          <ErrorState message={prices.error} onRetry={prices.reload} />
        </Card>
      ) : !prices.data ? (
        <Placeholder className="h-[420px]" />
      ) : (
        <ChartFrame
          title={`${com.name} di ${reg.name}`}
          subtitle={`Riwayat ${range} hari s/d ${formatDate(asOf)} + prakiraan 14 hari (${MODEL_LABEL[prices.data.forecast.model]})`}
          legend={<PriceChartLegend regionLabel={reg.name} referenceLabel={refLabel} showNeighbors scopeLabel={scopeLabel} forecast={prices.data.forecast} />}
          table={<PriceTable series={prices.data.series} forecast={prices.data.forecast} regionLabel={reg.name} referenceLabel={refLabel} showNeighbors />}
          actions={<StatusBadge status={prices.data.alert.status} />}
          dimmed={prices.loading}
          footnote={`Sumber harga: ${prices.data.source_label}${prices.data.source === 'synthetic' ? ' (data simulasi)' : ''} · Acuan: ${reference.basis}`}
        >
          <PriceChart series={prices.data.series} forecast={prices.data.forecast} regionLabel={reg.name} referenceLabel={refLabel} showNeighbors scopeLabel={scopeLabel} height={340} />
        </ChartFrame>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Unduh data terbuka</p>
            <p className="text-sm text-ink-2">CSV (UTF-8) — bisa dibuka di Excel, Google Sheets, atau alat analisis lain.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={exportUrl.prices(region, commodity, Number(range), asOf)} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-surface-muted">
              <Download className="h-4 w-4" /> Riwayat + prakiraan
            </a>
            <a href={exportUrl.scorecard(meta.scope.id, asOf.slice(0, 7))} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-surface-muted">
              <Download className="h-4 w-4" /> Rapor bulan ini
            </a>
            <Button onClick={() => onRecord(region, commodity)}>
              <FilePlus2 className="h-4 w-4" /> Catat intervensi
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ─── Intervensi ──────────────────────────────────────────────────────────────

function InterventionsTab({
  state,
  onEdit,
  onNew,
}: {
  state: { data: Intervention[] | null; error: string; loading: boolean; reload: () => void };
  onEdit: (it: Intervention) => void;
  onNew: () => void;
}) {
  const [confirm, setConfirm] = useState<{ kind: 'publish' | 'delete'; it: Intervention } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    setError('');
    try {
      if (confirm.kind === 'publish') await gov.publish(confirm.it.id);
      else await gov.remove(confirm.it.id);
      setConfirm(null);
      state.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (!state.data) return <Placeholder className="h-64" />;
  const drafts = state.data.filter((i) => i.status === 'draft');
  const published = state.data.filter((i) => i.status === 'published');

  return (
    <div className="space-y-8">
      {state.data.length === 0 && (
        <Card>
          <EmptyState title="Belum ada intervensi" action={<Button onClick={onNew}>Catat intervensi pertama</Button>}>
            Intervensi yang dicatat tersimpan sebagai draf, lalu dapat dipublikasikan ke halaman publik.
          </EmptyState>
        </Card>
      )}

      {drafts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Draf ({drafts.length})</h2>
          {drafts.map((it) => (
            <InterventionCard
              key={it.id}
              it={it}
              showStatus
              actions={
                <>
                  <Button variant="ghost" onClick={() => onEdit(it)}>
                    <Pencil className="h-4 w-4" /> Ubah
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirm({ kind: 'delete', it })}>
                    <Trash2 className="h-4 w-4" /> Hapus
                  </Button>
                  <Button onClick={() => setConfirm({ kind: 'publish', it })}>
                    <Send className="h-4 w-4" /> Publikasikan
                  </Button>
                </>
              }
            />
          ))}
        </section>
      )}

      {published.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Dipublikasikan ({published.length})</h2>
            <a href={exportUrl.interventions()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              <Download className="h-4 w-4" /> Unduh CSV
            </a>
          </div>
          {published.map((it) => (
            <InterventionCard key={it.id} it={it} showStatus />
          ))}
        </section>
      )}

      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm?.kind === 'publish' ? 'Publikasikan intervensi?' : 'Hapus draf?'}
        description={confirm?.it.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Batal
            </Button>
            <Button onClick={run} disabled={busy}>
              {confirm?.kind === 'publish' ? 'Ya, publikasikan' : 'Ya, hapus'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          {confirm?.kind === 'publish'
            ? 'Setelah dipublikasikan, intervensi beserta dasar keputusannya terlihat oleh publik dan tidak dapat diubah atau dihapus lagi.'
            : 'Draf ini akan dihapus permanen.'}
        </p>
        {error && (
          <div className="mt-3">
            <Notice tone="warning">{error}</Notice>
          </div>
        )}
      </Dialog>
    </div>
  );
}

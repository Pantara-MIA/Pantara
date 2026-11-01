import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calculator, ChevronDown, FilePlus2, RotateCcw } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import { StatTile } from '../ui/StatTile';
import { SegmentedControl } from '../ui/SegmentedControl';
import { TextField } from '../ui/Field';
import { DataTable } from '../ui/DataTable';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, Notice, Placeholder } from '../ui/Feedback';
import { ChartFrame } from '../charts/ChartFrame';
import { AXIS_TICK, CHART } from '../charts/theme';
import type { InterventionDraft } from '../interventions/InterventionForm';
import { EFFECTIVENESS_PRESETS, fetchPlan, formatVolume } from '../../lib/planning';
import type { Plan, PlanAllocation, PlanParams } from '../../lib/planning';
import type { RegionsResponse } from '../../lib/regional';
import { addDays, formatDate, formatDateShort, formatIDR, formatIDRShort, formatNumber, formatPct } from '../../lib/format';
import { useApi } from '../../lib/useApi';

/** Starting values; the server's own defaults come back with every plan. */
const DEFAULTS: PlanParams = {
  budget_idr: 2_000_000_000,
  lead_time_days: 3,
  package_share: 0.1,
  effectiveness: 3,
  distribution_rate: 0.03,
  operational_cost: 15_000_000,
  max_coverage: 0.6,
};

interface FormState {
  budget: string;
  lead: string;
  effectiveness: string;
  share: string; // percent
  distribution: string; // percent
  opCost: string;
  coverage: string; // percent
}

const toForm = (p: PlanParams): FormState => ({
  budget: String(p.budget_idr),
  lead: String(p.lead_time_days),
  effectiveness: String(p.effectiveness),
  share: String(p.package_share * 100),
  distribution: String(p.distribution_rate * 100),
  opCost: String(p.operational_cost),
  coverage: String(p.max_coverage * 100),
});

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

const fromForm = (f: FormState): PlanParams => ({
  budget_idr: num(f.budget),
  lead_time_days: Math.round(num(f.lead)),
  effectiveness: num(f.effectiveness),
  package_share: num(f.share) / 100,
  distribution_rate: num(f.distribution) / 100,
  operational_cost: num(f.opCost),
  max_coverage: num(f.coverage) / 100,
});

/** Budget allocation and timing for market operations in the caller's jurisdiction. */
export function PlanningTab({
  asOf,
  meta,
  onDraft,
}: {
  asOf: string;
  meta: RegionsResponse;
  onDraft: (d: InterventionDraft) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(DEFAULTS));
  const [params, setParams] = useState<PlanParams>(DEFAULTS);
  const [advanced, setAdvanced] = useState(false);
  const plan = useApi(() => fetchPlan(asOf, params), [asOf, params]);

  const regionName = useMemo(() => new Map(meta.regions.map((r) => [r.id, r.name])), [meta]);
  const commodity = useMemo(() => new Map(meta.commodities.map((c) => [c.id, c])), [meta]);
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams(fromForm(form));
  };

  const draftFrom = (a: PlanAllocation, p: Plan): InterventionDraft => {
    const c = commodity.get(a.commodity_id)!;
    const ton = c.unit === 'kg' && a.volume_units >= 1000;
    const end = a.window.peak_date > a.window.start_date ? a.window.peak_date : addDays(a.window.start_date, 6);
    return {
      region_id: a.region_id,
      commodity_id: a.commodity_id,
      baseline_date: p.as_of,
      type: 'market_operation',
      title: `Operasi pasar ${c.name.toLowerCase()} — ${regionName.get(a.region_id)}`,
      description: `Disusun dari Perencanaan Operasi Pasar per ${formatDate(p.as_of)}: ${a.packages} paket (${formatVolume(a.volume_units, c.unit)}), dijual di harga acuan ${formatIDR(a.reference)} saat harga pasar melampauinya. Perkiraan kelebihan bayar warga yang dicegah ${formatIDR(a.avoided)}.`,
      start_date: a.window.start_date,
      end_date: end,
      volume: ton ? Math.round(a.volume_units / 100) / 10 : Math.round(a.volume_units),
      volume_unit: ton ? 'ton' : c.unit,
      budget_idr: Math.round(a.cost),
    };
  };

  const budgetHint = Number.isFinite(num(form.budget)) && form.budget ? formatIDR(num(form.budget)) : undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Parameter rencana" subtitle="Ubah anggaran atau asumsi, lalu hitung ulang. Hasilnya dioptimalkan untuk wilayah kewenangan Anda." />
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
              <TextField label="Anggaran" inputMode="numeric" suffix="Rp" hint={budgetHint} value={form.budget} onChange={(e) => set('budget', e.target.value)} />
              <TextField
                label="Waktu persiapan logistik"
                type="number"
                min={0}
                max={10}
                suffix="hari"
                value={form.lead}
                onChange={(e) => set('lead', e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink-2">Efektivitas operasi pasar</span>
                <SegmentedControl
                  label="Efektivitas operasi pasar"
                  value={(['2', '3', '4'].includes(form.effectiveness) ? form.effectiveness : '3') as '2' | '3' | '4'}
                  onChange={(v) => set('effectiveness', v)}
                  options={[...EFFECTIVENESS_PRESETS]}
                />
              </div>
              <Button type="submit" disabled={plan.loading}>
                <Calculator className="h-4 w-4" /> Hitung rencana
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              aria-expanded={advanced}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-accent hover:bg-accent-soft"
            >
              Asumsi lanjutan
              <ChevronDown className={`h-4 w-4 transition-transform ${advanced ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {advanced && (
              <div className="grid gap-4 rounded-2xl bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-4">
                <TextField label="Ukuran 1 paket" hint="% kebutuhan daerah selama 14 hari" type="number" min={1} max={50} suffix="%" value={form.share} onChange={(e) => set('share', e.target.value)} />
                <TextField label="Batas cakupan" hint="Maksimum total paket, % kebutuhan" type="number" min={1} max={100} suffix="%" value={form.coverage} onChange={(e) => set('coverage', e.target.value)} />
                <TextField label="Biaya distribusi" hint="% harga acuan per kg/liter" type="number" min={0} max={50} step="0.5" suffix="%" value={form.distribution} onChange={(e) => set('distribution', e.target.value)} />
                <TextField label="Biaya operasional" hint="Rp tetap per paket" inputMode="numeric" suffix="Rp" value={form.opCost} onChange={(e) => set('opCost', e.target.value)} />
                <div className="sm:col-span-2 lg:col-span-4">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setForm(toForm(DEFAULTS));
                      setParams(DEFAULTS);
                    }}
                  >
                    <RotateCcw className="h-4 w-4" /> Kembalikan ke asumsi bawaan
                  </Button>
                </div>
              </div>
            )}
          </form>
        </CardBody>
      </Card>

      {plan.error ? (
        <Card>
          <ErrorState message={plan.error} onRetry={plan.reload} />
        </Card>
      ) : !plan.data ? (
        <Placeholder className="h-96" />
      ) : (
        <PlanResult plan={plan.data} loading={plan.loading} regionName={regionName} commodity={commodity} onDraft={(a) => onDraft(draftFrom(a, plan.data!))} />
      )}
    </div>
  );
}

function PlanResult({
  plan,
  loading,
  regionName,
  commodity,
  onDraft,
}: {
  plan: Plan;
  loading: boolean;
  regionName: Map<string, string>;
  commodity: Map<string, RegionsResponse['commodities'][number]>;
  onDraft: (a: PlanAllocation) => void;
}) {
  const ratio = plan.spent > 0 ? plan.avoided / plan.spent : 0;
  const share = plan.overpayment > 0 ? plan.avoided / plan.overpayment : 0;

  return (
    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile emphasis label="Kelebihan bayar warga yang dicegah" value={formatIDRShort(plan.avoided)} hint={`${formatPct(share * 100)} dari total potensi dalam 14 hari`} />
        <StatTile label="Potensi kelebihan bayar tanpa intervensi" value={formatIDRShort(plan.overpayment)} hint={`Di atas HET/HAP, ${plan.candidate_count} kombinasi daerah × komoditas`} />
        <StatTile label="Anggaran terpakai" value={formatIDRShort(plan.spent)} hint={`dari ${formatIDRShort(plan.params.budget_idr)} · sisa ${formatIDRShort(plan.params.budget_idr - plan.spent)}`} />
        <StatTile label="Manfaat per Rp 1" value={ratio ? `Rp ${formatNumber(ratio, 2)}` : '–'} hint="Kelebihan bayar dicegah ÷ anggaran terpakai" />
      </div>

      <Card>
        <CardHeader
          title={`Rencana alokasi · per ${formatDate(plan.as_of)}`}
          subtitle="Diurutkan dari dampak terbesar. Jendela waktu = perkiraan harga menembus acuan dikurangi waktu persiapan."
        />
        {plan.allocations.length === 0 ? (
          <EmptyState title="Tidak ada alokasi">
            {plan.candidate_count === 0
              ? `Tidak ada komoditas dengan potensi kelebihan bayar berarti per ${formatDate(plan.as_of)}.`
              : 'Anggaran belum cukup untuk satu paket pun. Naikkan anggaran atau perkecil ukuran paket.'}
          </EmptyState>
        ) : (
          <DataTable<PlanAllocation>
            caption="Rencana alokasi anggaran operasi pasar"
            rows={plan.allocations}
            rowKey={(a) => `${a.region_id}|${a.commodity_id}`}
            columns={[
              {
                key: 'what',
                header: 'Daerah · komoditas',
                render: (a) => (
                  <span className="flex flex-col">
                    <span className="font-semibold">{commodity.get(a.commodity_id)?.name}</span>
                    <span className="text-xs text-ink-3">{regionName.get(a.region_id)}</span>
                  </span>
                ),
              },
              { key: 'status', header: 'Status', hideOnMobile: true, render: (a) => <StatusBadge status={a.status} /> },
              {
                key: 'window',
                header: 'Jendela waktu',
                render: (a) => (
                  <span className="flex flex-col">
                    <span className="font-semibold">{a.window.urgent ? 'Segera' : `Mulai ${formatDateShort(a.window.start_date)}`}</span>
                    <span className="text-xs text-ink-3">puncak ±{formatDateShort(a.window.peak_date)}</span>
                  </span>
                ),
              },
              {
                key: 'volume',
                header: 'Paket · volume',
                align: 'right',
                render: (a) => (
                  <span className="flex flex-col items-end">
                    <span className="font-semibold">{a.packages} paket</span>
                    <span className="text-xs text-ink-3">{formatVolume(a.volume_units, commodity.get(a.commodity_id)?.unit ?? 'kg')}</span>
                  </span>
                ),
              },
              { key: 'cost', header: 'Biaya', align: 'right', sortValue: (a) => a.cost, render: (a) => formatIDRShort(a.cost) },
              {
                key: 'avoided',
                header: 'Dicegah',
                align: 'right',
                sortValue: (a) => a.avoided,
                render: (a) => (
                  <span className="flex flex-col items-end">
                    <span className="font-semibold">{formatIDRShort(a.avoided)}</span>
                    <span className="text-xs text-ink-3">{formatPct(a.avoided_share * 100, 0)} potensi</span>
                  </span>
                ),
              },
              {
                key: 'act',
                header: '',
                align: 'right',
                render: (a) => (
                  <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => onDraft(a)}>
                    <FilePlus2 className="h-3.5 w-3.5" /> Jadikan draf
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {plan.frontier.length > 1 && (
        <ChartFrame
          title="Berapa banyak yang bisa dicegah per tingkat anggaran"
          subtitle="Alokasi optimal untuk setiap besaran anggaran. Kurva yang mendatar berarti tambahan anggaran makin kecil manfaatnya."
          table={<FrontierTable plan={plan} />}
        >
          <FrontierChart plan={plan} />
        </ChartFrame>
      )}

      {plan.unfunded.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Kandidat yang belum terdanai ({plan.unfunded.length})</summary>
          <ul className="mt-3 divide-y divide-line text-sm">
            {plan.unfunded.slice(0, 15).map((c) => (
              <li key={`${c.region_id}|${c.commodity_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{commodity.get(c.commodity_id)?.name}</span>
                  <span className="text-ink-3"> · {regionName.get(c.region_id)}</span>
                </span>
                <span className="text-xs text-ink-2">
                  potensi {formatIDRShort(c.overpayment)} · biaya per paket {formatIDRShort(c.package_cost)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Notice tone="warning" title="Asumsi model, bukan kepastian">
        Efek operasi pasar terhadap harga diasumsikan (efektivitas {formatNumber(plan.params.effectiveness, 0)}, satu paket ={' '}
        {formatPct(plan.params.package_share * 100, 0)} kebutuhan 14 hari). Jumlah penduduk dan konsumsi per kapita adalah angka indikatif. Gunakan sebagai bahan
        diskusi perencanaan, lalu sesuaikan dengan kapasitas stok dan logistik nyata.
      </Notice>
    </div>
  );
}

function FrontierChart({ plan }: { plan: Plan }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={plan.frontier} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="budget" type="number" domain={[0, 'dataMax']} tickFormatter={formatIDRShort} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} />
          <YAxis tickFormatter={formatIDRShort} tick={AXIS_TICK} tickLine={false} axisLine={false} width={84} />
          <ReferenceLine x={plan.spent} stroke={CHART.ink3} strokeDasharray="4 3" label={{ value: 'Rencana ini', position: 'insideTopRight', fill: CHART.ink3, fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: CHART.ink3, strokeWidth: 1 }}
            isAnimationActive={false}
            content={(p) => {
              const row = p.active ? (p.payload?.[0]?.payload as Plan['frontier'][number] | undefined) : undefined;
              if (!row) return null;
              return (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="font-semibold text-ink">{formatIDR(row.avoided)} dicegah</p>
                  <p className="text-ink-3">dengan anggaran {formatIDR(row.budget)}</p>
                </div>
              );
            }}
          />
          <Line dataKey="avoided" stroke={CHART.series1} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FrontierTable({ plan }: { plan: Plan }) {
  return (
    <DataTable<Plan['frontier'][number]>
      caption="Kelebihan bayar dicegah per tingkat anggaran"
      dense
      rows={plan.frontier}
      rowKey={(r) => String(r.budget)}
      columns={[
        { key: 'budget', header: 'Anggaran', align: 'right', render: (r) => formatIDR(r.budget) },
        { key: 'avoided', header: 'Dicegah', align: 'right', render: (r) => formatIDR(r.avoided) },
      ]}
    />
  );
}

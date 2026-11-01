import { useMemo, useState } from 'react';
import { CircleCheck, Loader2, ShoppingCart, Snowflake, Sparkles, TriangleAlert } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Tag } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Feedback';
import { getCommodity } from '../../data/commodities';
import { STORAGE_METHODS, encyclopediaId } from '../../lib/profile';
import type { StorageMethod } from '../../lib/profile';
import { fetchAiSolution } from '../../lib/api';
import type { AiSolutionResponse } from '../../lib/api';
import { formatIDR, formatNumber } from '../../lib/format';
import { NoData } from './shared';
import { AnimatedValue, DecayCurve, StockTube, StorageCards } from '../../components/simulator/SimulatorVisuals';
import type { MsmeTabProps } from './shared';

type Severity = 'light' | 'moderate' | 'heavy' | 'critical';

const SEVERITY: Record<Severity, { label: string; cls: string; summary: string }> = {
  light: { label: 'Kerugian ringan', cls: 'bg-good-soft text-good-ink', summary: 'Masih wajar. Perbaikan kebiasaan kecil sudah cukup.' },
  moderate: { label: 'Kerugian sedang', cls: 'bg-warning-soft text-warning-ink', summary: 'Mulai terasa di kas. Perbaiki cara simpan dan olah kelebihan stok.' },
  heavy: { label: 'Kerugian berat', cls: 'bg-critical-soft text-critical-ink', summary: 'Memakan margin harian. Ubah siklus belanja dan naikkan kelas penyimpanan.' },
  critical: { label: 'Kerugian kritis', cls: 'bg-critical text-white', summary: 'Tidak berkelanjutan. Hentikan penimbunan dan pecah belanja.' },
};

function severityOf(loss: number, spend: number): Severity {
  const pct = spend > 0 ? (loss / spend) * 100 : 0;
  if (loss < 25_000 && pct < 8) return 'light';
  if (loss < 100_000 && pct < 16) return 'moderate';
  if (loss < 300_000) return 'heavy';
  return 'critical';
}

const TONE_CLS = { green: 'bg-good-soft text-good-ink', gold: 'bg-gold-soft text-gold-ink', red: 'bg-critical-soft text-critical-ink' } as const;
const ICONS = { check: CircleCheck, snowflake: Snowflake, cart: ShoppingCart, alert: TriangleAlert } as const;

interface Step {
  title: string;
  body: string;
  tone: keyof typeof TONE_CLS;
  icon: keyof typeof ICONS;
}

/** What the kitchen loses by storing this purchase, and how to lose less. */
export default function WasteTab({ profile, data, loading, commodity }: MsmeTabProps) {
  const price = data?.current_price ?? 0;
  const [weight, setWeight] = useState(() => Math.round((data?.decision.kg_to_buy ?? 10) * 10) / 10);
  const [days, setDays] = useState(7);
  const [method, setMethod] = useState<StorageMethod>(profile.storage_method);
  const [ai, setAi] = useState<AiSolutionResponse | null>(null);
  const [aiKey, setAiKey] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const sim = useMemo(() => {
    const m = STORAGE_METHODS[method];
    const remaining = weight * Math.pow(1 - m.decay, days);
    const loss = (weight - remaining) * price;
    const byMethod = (Object.keys(STORAGE_METHODS) as StorageMethod[]).map((key) => {
      const r = weight * Math.pow(1 - STORAGE_METHODS[key].decay, days);
      return { key, remaining: r, loss: (weight - r) * price };
    });
    return { m, remaining, decayKg: weight - remaining, loss, monthly: loss * (30 / Math.max(1, days)), pastShelfLife: days > m.shelfLife, byMethod };
  }, [weight, days, method, price]);

  const curves = useMemo(
    () =>
      (Object.keys(STORAGE_METHODS) as StorageMethod[]).map((k) => ({
        key: k,
        label: STORAGE_METHODS[k].short,
        values: Array.from({ length: days + 1 }, (_, i) => weight * Math.pow(1 - STORAGE_METHODS[k].decay, i)),
      })),
    [weight, days],
  );

  if (!data) return <NoData loading={loading} />;

  const spend = weight * price;
  const severity = severityOf(sim.loss, spend);
  const best = [...sim.byMethod].sort((a, b) => a.loss - b.loss)[0];
  const switchSaving = sim.loss - best.loss;
  const monthlySaving = switchSaving * (30 / Math.max(1, days));
  const knowledge = getCommodity(encyclopediaId(commodity) ?? '');
  const key = `${commodity}|${weight}|${days}|${method}|${price}`;
  const aiFresh = ai && aiKey === key;

  // Rule-based steps; replaced by the AI answer once requested.
  const ruleSteps: Step[] = [
    ...(knowledge?.storage.steps.slice(0, 2).map((s) => ({ title: s.title, body: s.detail, tone: 'green' as const, icon: 'check' as const })) ?? []),
    ...(severity !== 'light' && switchSaving > 0
      ? [{ title: `Pindahkan stok ke ${STORAGE_METHODS[best.key].short}`, body: `Kerugian turun dari ${formatIDR(sim.loss)} menjadi ${formatIDR(best.loss)} — sekitar ${formatIDR(monthlySaving)} sebulan.`, tone: 'gold' as const, icon: 'snowflake' as const }]
      : []),
    ...(severity === 'heavy' || severity === 'critical'
      ? [{ title: `Pecah belanja menjadi tiap ${Math.max(2, Math.round(sim.m.shelfLife / 2))} hari`, body: `Menyimpan ${formatNumber(weight, 1)} kg selama ${days} hari membuat stok menunggu terlalu lama.`, tone: 'gold' as const, icon: 'cart' as const }]
      : []),
    ...(severity === 'critical' ? [{ title: 'Hentikan pola penimbunan ini', body: `Bila diteruskan, kerugiannya mencapai ${formatIDR(sim.monthly)} sebulan.`, tone: 'red' as const, icon: 'alert' as const }] : []),
  ];
  const steps: Step[] = aiFresh ? ai.steps.map((s) => ({ title: s.title, body: s.body, tone: s.tone, icon: s.icon })) : ruleSteps;

  const askAi = () => {
    setAiLoading(true);
    setAiError('');
    fetchAiSolution({
      commodity,
      price_per_kg: price,
      weight_kg: weight,
      days,
      method: sim.m.short,
      remaining_kg: sim.remaining,
      decay_kg: sim.decayKg,
      loss: sim.loss,
      monthly_loss: sim.monthly,
      past_shelf_life: sim.pastShelfLife,
      shelf_life: sim.m.shelfLife,
      decay: sim.m.decay,
      by_method: sim.byMethod.map((m) => ({ key: m.key, label: STORAGE_METHODS[m.key].short, remaining_kg: m.remaining, loss: m.loss })),
      business_name: profile.business_name,
      business_category: profile.fnb_category,
    })
      .then((res) => {
        setAi(res);
        setAiKey(key);
      })
      .catch((e: Error) => setAiError(e.message))
      .finally(() => setAiLoading(false));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="lg:sticky lg:top-24 lg:self-start">
        <CardHeader title="Atur skenario" subtitle={`${commodity} · ${formatIDR(price)}/kg`} />
        <CardBody className="space-y-5">
          <label className="block text-sm">
            <span className="flex justify-between font-semibold text-ink-2">
              Bobot belanja <span className="text-ink">{formatNumber(weight, 1)} kg</span>
            </span>
            <input type="range" min={0.5} max={Math.max(50, Math.ceil(weight))} step={0.5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-accent)]" />
          </label>
          <label className="block text-sm">
            <span className="flex justify-between font-semibold text-ink-2">
              Lama simpan <span className="text-ink">{days} hari</span>
            </span>
            <input type="range" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-accent)]" />
          </label>
          <div className="space-y-1.5">
            <span className="text-sm font-semibold text-ink-2">Metode simpan</span>
            <StorageCards
              value={method}
              onChange={(k) => setMethod(k as StorageMethod)}
              options={(Object.keys(STORAGE_METHODS) as StorageMethod[]).map((k) => ({
                key: k,
                icon: STORAGE_METHODS[k].icon,
                label: STORAGE_METHODS[k].short,
                decayPerDay: STORAGE_METHODS[k].decay,
                shelfLifeDays: STORAGE_METHODS[k].shelfLife,
                best: k === best.key,
              }))}
            />
            <p className="text-xs text-ink-3">{sim.m.desc}</p>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-6">
        <section className="grid gap-6 rounded-3xl border border-line bg-surface p-6 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${SEVERITY[severity].cls}`}>{SEVERITY[severity].label}</span>
            {sim.pastShelfLife && <Tag tone="warning">Melewati batas simpan</Tag>}
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-ink">
            Rugi <AnimatedValue value={sim.loss} format={formatIDR} />
          </p>
          <p className="mt-1 text-ink-2">{SEVERITY[severity].summary}</p>
          <dl className="mt-5 grid gap-3">
            <div className="rounded-xl bg-surface-muted px-4 py-3">
              <dt className="text-xs text-ink-2">Bila berulang sebulan</dt>
              <dd className="text-lg font-semibold">
                <AnimatedValue value={sim.monthly} format={formatIDR} />
              </dd>
            </div>
          </dl>
          </div>
          <StockTube initial={weight} usable={sim.remaining} pastShelfLife={sim.pastShelfLife} />
        </section>

        <Card>
          <CardHeader title="Kurva bobot layak pakai" subtitle={`${sim.m.label} (hijau) dibanding metode lain (abu-abu)`} />
          <CardBody>
            <DecayCurve series={curves} activeKey={method} weight={weight} shelfLife={sim.m.shelfLife} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Metode simpan lain" subtitle="Bobot dan lama simpan sama." />
          <CardBody>
            <ul className="divide-y divide-line">
              {sim.byMethod.map((m) => (
                <li key={m.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {STORAGE_METHODS[m.key].icon} {STORAGE_METHODS[m.key].short}
                    {m.key === method && <Tag>dipakai</Tag>}
                    {m.key === best.key && <Tag tone="accent">terhemat</Tag>}
                  </span>
                  <span className="text-sm tabular-nums">
                    <span className="font-semibold">{formatIDR(m.loss)}</span> <span className="text-ink-3">· sisa {formatNumber(m.remaining, 2)} kg</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Langkah menekan susut"
            subtitle={aiFresh ? ai.summary : 'Saran berbasis aturan. Minta AI untuk langkah yang dipersonalisasi.'}
            actions={
              <Button variant={aiFresh ? 'secondary' : 'primary'} onClick={askAi} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {aiFresh ? 'Tanya ulang AI' : 'Minta solusi AI'}
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {aiError && <Notice tone="warning">Solusi AI belum tersedia: {aiError}</Notice>}
            <ol className="space-y-2">
              {steps.map((s) => {
                const Icon = ICONS[s.icon] ?? CircleCheck;
                return (
                  <li key={s.title} className="flex gap-3 rounded-xl border border-line px-4 py-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${TONE_CLS[s.tone] ?? TONE_CLS.green}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{s.title}</span>
                      <span className="block text-sm text-ink-2">{s.body}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {aiFresh && ai.products.length > 0 && (
              <div>
                <p className="mt-2 mb-2 text-sm font-semibold text-ink">Olahan untuk kelebihan stok</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {ai.products.map((p) => (
                    <li key={p.name} className="rounded-xl bg-gold-soft px-4 py-2.5 text-sm text-gold-ink">
                      <span className="flex justify-between gap-2 font-semibold">
                        {p.name} <span className="text-xs font-medium">{p.shelf_life}</span>
                      </span>
                      <span className="block">{p.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

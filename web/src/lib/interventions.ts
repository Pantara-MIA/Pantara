/** Intervention types, API clients and the plain-language reading of an evaluation. */
import { API_BASE } from './api';
import { auth } from './auth';
import type { Alert, Forecast } from './regional';

export type InterventionType =
  | 'market_operation'
  | 'cheap_food_market'
  | 'supply_distribution'
  | 'market_inspection'
  | 'stock_release'
  | 'other';

export const INTERVENTION_TYPES: { value: InterventionType; label: string }[] = [
  { value: 'market_operation', label: 'Operasi pasar / SPHP' },
  { value: 'cheap_food_market', label: 'Gerakan Pangan Murah' },
  { value: 'supply_distribution', label: 'Distribusi / mobilisasi pasokan' },
  { value: 'market_inspection', label: 'Sidak & pengawasan pasar' },
  { value: 'stock_release', label: 'Pelepasan cadangan pangan' },
  { value: 'other', label: 'Lainnya' },
];

export const interventionTypeLabel = (t: string) => INTERVENTION_TYPES.find((x) => x.value === t)?.label ?? t;

export interface EvaluationPoint {
  date: string;
  actual?: number;
  p10: number;
  p50: number;
  p90: number;
  reference: number;
}

export interface Evaluation {
  status: 'pending' | 'partial' | 'complete';
  observed_days: number;
  window_days: number;
  price_at_baseline: number;
  price_at_latest?: number;
  gap_vs_forecast_pct: number;
  within_band_share: number;
  region_change_pct: number;
  neighbor_change_pct: number;
  relative_change_pct: number;
  days_above_before: number;
  days_above_after: number;
  series: EvaluationPoint[];
}

export interface Intervention {
  id: string;
  region_id: string;
  region_name: string;
  commodity_id: string;
  commodity_name: string;
  type: InterventionType;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  volume: number | null;
  volume_unit: string;
  budget_idr: number | null;
  status: 'draft' | 'published';
  baseline_date: string;
  trigger: { forecast: Forecast; alert: Alert };
  agency_name: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  evaluation?: Evaluation;
}

export interface InterventionInput {
  region_id: string;
  commodity_id: string;
  type: InterventionType;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  volume: number | null;
  volume_unit: string;
  budget_idr: number | null;
  baseline_date: string;
}

export interface GovernmentProfile {
  role: 'government';
  id: string;
  email: string;
  agency_name: string;
  /** Jurisdiction: a region ID, or a scope ID ("indonesia", "jawa-barat") covering every region inside it. */
  region_id: string;
  region_name: string;
  level: 'national' | 'province' | 'regency';
  /** Scope the dashboard opens in. */
  scope: string;
  /** Regions this account monitors, plans and records interventions for. */
  regions: string[];
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const fetchPublicInterventions = async (params: { region?: string; commodity?: string; limit?: number }, signal?: AbortSignal) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`${API_BASE}/api/v1/public/interventions?${qs}`, { signal });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Server menjawab ${res.status}.`);
  return (await res.json()) as Intervention[];
};

export const gov = {
  me: () => auth.fetchAuth('/auth/me') as Promise<GovernmentProfile | { role: 'msme' }>,
  list: () => auth.fetchAuth('/gov/interventions') as Promise<Intervention[]>,
  create: (input: InterventionInput) => auth.fetchAuth('/gov/interventions', { method: 'POST', body: JSON.stringify(input) }) as Promise<Intervention>,
  update: (id: string, input: InterventionInput) =>
    auth.fetchAuth(`/gov/interventions/${id}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<Intervention>,
  publish: (id: string) => auth.fetchAuth(`/gov/interventions/${id}/publish`, { method: 'POST' }) as Promise<Intervention>,
  remove: (id: string) => auth.fetchAuth(`/gov/interventions/${id}`, { method: 'DELETE' }),
};

/** Open-data CSV download URLs. */
export const exportUrl = {
  prices: (region: string, commodity: string, days: number, asOf?: string) =>
    `${API_BASE}/api/v1/public/export/prices.csv?${new URLSearchParams({ region, commodity, days: String(days), ...(asOf ? { as_of: asOf } : {}) })}`,
  scorecard: (scope: string, month: string) => `${API_BASE}/api/v1/public/export/scorecard.csv?${new URLSearchParams({ scope, month })}`,
  interventions: () => `${API_BASE}/api/v1/public/export/interventions.csv`,
};

// ─── Reading an evaluation ───────────────────────────────────────────────────

export type Verdict = 'pending' | 'indicated' | 'unclear' | 'not_seen';

export const VERDICT_META: Record<Verdict, { label: string; tone: 'neutral' | 'good' | 'warning' }> = {
  pending: { label: 'Menunggu data', tone: 'neutral' },
  indicated: { label: 'Ada indikasi dampak', tone: 'good' },
  unclear: { label: 'Belum jelas', tone: 'neutral' },
  not_seen: { label: 'Dampak belum terlihat', tone: 'warning' },
};

/**
 * Indicative verdict: both signals must agree — prices below the frozen
 * forecast AND falling relative to neighbours — before suggesting an effect.
 */
export function verdictOf(ev?: Evaluation): Verdict {
  if (!ev || ev.status === 'pending') return 'pending';
  if (ev.gap_vs_forecast_pct <= -3 && ev.relative_change_pct <= -2) return 'indicated';
  if (ev.gap_vs_forecast_pct >= 3 || ev.relative_change_pct >= 2) return 'not_seen';
  return 'unclear';
}

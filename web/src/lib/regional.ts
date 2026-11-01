/** Client for the public regional-scorecard API (internal/api/regional.go). */
import { API_BASE } from './api';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
/** "no_data": the region has no price data for the selected commodity. */
export type AlertStatus = 'above_reference' | 'watch' | 'normal' | 'no_data';

export interface Region {
  id: string;
  name: string;
  type: 'province' | 'regency' | 'city';
  /** BPS area code (provinces). */
  code?: string;
  neighbors: string[];
  population: number;
  /** Commodities with real (not synthetic) prices in this region. */
  real_commodities: number;
  /** Scope this region is ranked in. */
  scope: string;
  /** Scope that breaks this region down further (drill-down), if any. */
  child_scope?: string;
}

/** One level of the regional hierarchy (internal/regional/scope.go). */
export interface Scope {
  id: string;
  name: string;
  level: 'province' | 'regency';
  parent?: string;
  /** Region (in the parent scope) this scope breaks down. */
  region?: string;
  source: string;
  /** True when any series in the scope is synthetic. */
  synthetic: boolean;
  /** Share of region × commodity series with real data (0–1). */
  real_share: number;
  /** Commodity IDs with data in this scope. */
  commodities: string[];
}

export interface ScopeRef {
  id: string;
  name: string;
  region?: string;
}

export const NATIONAL_SCOPE = 'indonesia';

/** Scorecard overview URL of a scope, keeping the selected month. */
export const scopeHref = (scopeId: string, month?: string) => {
  const q = new URLSearchParams();
  if (scopeId !== NATIONAL_SCOPE) q.set('cakupan', scopeId);
  if (month) q.set('bulan', month);
  const s = q.toString();
  return `/rapor-daerah${s ? `?${s}` : ''}`;
};

export interface Reference {
  type: 'HET' | 'HAP' | 'baseline';
  value?: number;
  /** Zone → value, when the ceiling differs per price zone. */
  zones?: Record<string, number>;
  basis: string;
  status: 'verified' | 'indicative';
}

export interface RegionalCommodity {
  id: string;
  name: string;
  unit: string;
  category: string;
  cpi_weight: number;
  reference: Reference;
  /** Overrides per series source, e.g. the MinyaKita HET for SP2KP. */
  source_references?: Record<string, Reference>;
}

export type SeriesSource = 'pihps' | 'sp2kp' | 'synthetic';

/** The reference that applies to a series from `source`. */
export const referenceFor = (c: RegionalCommodity, source?: string) => (source && c.source_references?.[source]) || c.reference;

export interface RegionsResponse {
  scope: Scope;
  breadcrumb: ScopeRef[];
  scopes: Scope[];
  regions: Region[];
  commodities: RegionalCommodity[];
  date_range: { start: string; end: string };
  months: string[];
  synthetic: boolean;
}

export interface ScorecardRow {
  region_id: string;
  score: number;
  grade: Grade;
  rank: number;
  /** Days above the statistical normal band (stability). */
  days_above_normal_total: number;
  commodities_affected: number;
  episodes_total: number;
  /** % of regulated commodity-days at or below HET/HAP (CPI-weighted); null without regulated commodities. */
  compliance: number | null;
  days_above_ceiling_total: number;
  ceiling_breached: number;
  mean_duration?: number;
  mean_recovery?: number;
  neighbor_gap_pct?: number;
}

export interface ScorecardResponse {
  scope: string;
  month: string;
  commodity_id: string;
  rows: ScorecardRow[];
}

export interface Episode {
  start: string;
  peak: string;
  end: string;
  peak_price: number;
  peak_pct: number;
  duration_days: number;
  recovery_days: number;
  ongoing: boolean;
}

export interface CommodityMetrics {
  commodity_id: string;
  observed_days: number;
  days_above_normal: number;
  episodes: Episode[];
  mean_duration: number;
  mean_recovery: number;
  mean_price: number;
  mean_normal: number;
  source: SeriesSource;
  reference_type: Reference['type'];
  regulated: boolean;
  mean_ceiling?: number;
  days_above_ceiling: number;
  ceiling_gap_pct: number;
  neighbor_gap_pct: number;
  scope_gap_pct: number;
  score: number;
  grade: Grade;
}

export interface RegionScore {
  region_id: string;
  score: number;
  grade: Grade;
  rank: number;
  days_above_normal_total: number;
  commodities_affected: number;
  episodes_total: number;
  compliance: number | null;
  days_above_ceiling_total: number;
  ceiling_breached: number;
  commodities: CommodityMetrics[];
}

export interface Alert {
  status: AlertStatus;
  max_breach_prob: number;
  days_to_breach: number;
}

export interface RegionScorecardResponse {
  month: string;
  region: Region;
  scope: Scope;
  breadcrumb: ScopeRef[];
  scorecard: RegionScore;
  neighbors: ScorecardRow[];
  history: { month: string; score: number; grade: Grade; rank: number }[];
  alerts: (Alert & { commodity_id: string })[];
}

export interface ForecastPoint {
  horizon: number;
  date: string;
  p10: number;
  p50: number;
  p90: number;
  breach_prob: number;
}

export interface Forecast {
  as_of: string;
  current_price: number;
  reference: number;
  points: ForecastPoint[];
  /** "v2" = LightGBM quantile models reshaping FHS; "fhs" = FHS alone. */
  model: 'fhs' | 'v2';
}

export const MODEL_LABEL: Record<Forecast['model'], string> = {
  fhs: 'model FHS',
  v2: 'model v2 (LightGBM + FHS)',
};

export interface PricePoint {
  date: string;
  price: number;
  reference: number;
  /** Statistical normal band behind the stability score. */
  normal: number;
  neighbor_median?: number;
  scope_median: number;
}

export interface PricesResponse {
  region_id: string;
  commodity_id: string;
  source: SeriesSource;
  source_label: string;
  reference_type: Reference['type'];
  series: PricePoint[];
  forecast: Forecast;
  alert: Alert;
}

export interface RegionAlert extends Alert {
  region_id: string;
  /** Single-commodity view only. */
  current_price?: number;
  reference?: number;
  /** Commodities currently above the reference / on watch. */
  above_count: number;
  watch_count: number;
}

export interface AlertsResponse {
  scope: string;
  as_of: string;
  commodity_id: string;
  regions: RegionAlert[];
}

async function getJSON<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const q = qs.toString();
  const res = await fetch(`${API_BASE}/api/v1/public/${path}${q ? `?${q}` : ''}`, { signal });
  if (!res.ok) {
    let msg = `Server menjawab ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** Regions of a scope; pass `region` instead to get the scope that region is ranked in. */
export const fetchRegions = (q: { scope?: string; region?: string } = {}, signal?: AbortSignal) =>
  getJSON<RegionsResponse>('regions', q, signal);

export const fetchScorecard = (scope: string, month?: string, commodity?: string, signal?: AbortSignal) =>
  getJSON<ScorecardResponse>('scorecard', { scope, month, commodity }, signal);

export const fetchRegionScorecard = (regionId: string, month?: string, commodity?: string, signal?: AbortSignal) =>
  getJSON<RegionScorecardResponse>(`scorecard/${encodeURIComponent(regionId)}`, { month, commodity }, signal);

export const fetchPrices = (region: string, commodity: string, days = 180, asOf?: string, signal?: AbortSignal) =>
  getJSON<PricesResponse>('prices', { region, commodity, days, as_of: asOf }, signal);

/** Omit the commodity for a worst-status summary across all commodities. */
export const fetchAlerts = (scope: string, commodity?: string, asOf?: string, signal?: AbortSignal) =>
  getJSON<AlertsResponse>('alerts', { scope, commodity, as_of: asOf }, signal);

/** Every scope with its regions, national first (for pickers spanning levels). */
export async function fetchAllScopes(signal?: AbortSignal) {
  const national = await fetchRegions({}, signal);
  const rest = await Promise.all(national.scopes.filter((s) => s.id !== national.scope.id).map((s) => fetchRegions({ scope: s.id }, signal)));
  return [national, ...rest];
}

/** <optgroup>s of regions per scope: "Provinsi", "Kabupaten/kota Jawa Barat". */
export const regionGroups = (scopes: RegionsResponse[], keep: (r: Region) => boolean = () => true) =>
  scopes
    .map((m) => ({
      label: m.scope.level === 'province' ? 'Provinsi' : `Kabupaten/kota ${m.scope.name}`,
      options: m.regions.filter(keep).map((r) => ({ value: r.id, label: r.name })),
    }))
    .filter((g) => g.options.length > 0);

/** Commodities with data in a scope, in master order. */
export const scopeCommodities = (meta: Pick<RegionsResponse, 'scope' | 'commodities'>) =>
  meta.commodities.filter((c) => meta.scope.commodities.includes(c.id));

/** "provinsi" or "kabupaten/kota": what the members of a scope are called. */
export const memberNoun = (scope: Pick<Scope, 'level'>) => (scope.level === 'province' ? 'provinsi' : 'kabupaten/kota');

/** "34 provinsi di Indonesia", "27 kabupaten/kota di Jawa Barat". */
export const scopeSummary = (scope: Pick<Scope, 'level' | 'name'>, count: number) => `${count} ${memberNoun(scope)} di ${scope.name}`;

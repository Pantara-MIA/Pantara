/** Pantara API client and the data shapes returned by the backend. */

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.DEV ? 'http://localhost:8080' : '');

export interface MasterCommodity {
  id: string;
  name: string;
}

export interface MasterCategory {
  id: string;
  name: string;
}

export interface MasterMarket {
  id: string;
  name: string;
  region: string;
}

export interface MasterStorageMethod {
  id: string;
  label: string;
  short_label: string;
  icon: string;
  daily_decay_rate: number;
  shelf_life_days: number;
  description: string;
  form_label: string;
}

export interface MetadataResponse {
  commodities: MasterCommodity[];
  categories: MasterCategory[];
  markets: MasterMarket[];
  storage_methods: MasterStorageMethod[];
}

export async function fetchMetadata(signal?: AbortSignal): Promise<MetadataResponse> {
  const res = await fetch(`${API_BASE}/api/v1/public/metadata`, {
    signal,
  });
  if (!res.ok) throw new Error('Gagal memuat data master.');
  return res.json();
}

export interface SubstitutionDetail {
  /** The signal fires only when the ratio deviates AND the alternative is actually cheaper. */
  active: boolean;
  recommendation: string;
  savings: number;
  reason: string;
  z: number;
  threshold: number;
  source_price: number;
  alt_price: number;
  diff_per_kg: number;
  ratio: number;
  ratio_median: number;
  ratio_sd: number;
  kg_used: number;
  date: string;
}

export interface DecisionResult {
  kg_to_buy: number;
  weeks_covered: number;
  potential_savings: number;
  loss_probability: number;
  max_loss: number;

  weekly_usage_kg: number;
  daily_decay_rate: number;
  shelf_life_days: number;

  kg_week1: number;
  kg_week2: number;
  kg_bulk: number;
  margin_kg: number;

  current_price: number;
  expected_next_price: number;

  weekly_cost: number;
  bulk_cost: number;

  breakeven_price: number;
  breakeven_rise_pct: number;

  bulk_locked: boolean;
  lock_reason: string;
}

export interface PriceAt {
  date: string;
  price: number;
}

export interface ProcurementResponse {
  commodity: string;
  commodity_id: string;
  region_id: string;
  region_name: string;
  /** Kept for older services; holds the region name. */
  province: string;
  source: 'pihps' | 'sp2kp' | 'synthetic';
  source_label: string;
  model: 'fhs' | 'v2';
  date_range: { start: string; end: string };
  as_of: string;
  current_price: number;
  reference: number;
  reference_type: 'HET' | 'HAP' | 'baseline';
  breach_prob_14: number;
  p7_10: number;
  p7_50: number;
  p7_90: number;
  p14_10: number;
  p14_50: number;
  p14_90: number;
  decision: DecisionResult;
  substitution?: SubstitutionDetail | null;
  substitution_candidates: { commodity: string; active: boolean; detail?: SubstitutionDetail }[];
  history: PriceAt[];
}

export interface ProcurementRequest {
  commodity: string;
  region_id: string;
  weekly_usage_kg: number;
  daily_decay_rate: number;
  shelf_life_days: number;
  /** Empty = the last day with data. */
  as_of: string;
}

export async function fetchProcurementCard(
  req: ProcurementRequest,
  signal?: AbortSignal
): Promise<ProcurementResponse> {
  const res = await fetch(`${API_BASE}/api/v1/msme/procurement-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Server menjawab ${res.status}. Pastikan layanan Pantara berjalan.`);
  }
  const json = (await res.json()) as ProcurementResponse;
  if (!json?.decision) {
    throw new Error('Respons server tidak lengkap.');
  }
  // The open breakdown (kg_week1, breakeven_price, ...) only exists in newer
  // services. Without this guard the dashboard would show zeros everywhere
  // instead of saying the service needs a restart.
  if (json.decision.kg_week1 === undefined || json.decision.breakeven_price === undefined) {
    throw new Error(
      'Layanan Pantara yang berjalan masih versi lama dan belum mengirim rincian perhitungan. Hentikan proses lama lalu jalankan ulang: go run ./cmd/server'
    );
  }
  return json;
}

// ─── AI solution ──────────────────────────────────────────────────────────────

export interface AiStep {
  title: string;
  body: string;
  tone: 'green' | 'gold' | 'red';
  icon: 'check' | 'snowflake' | 'cart' | 'alert';
}

export interface AiProcessedProduct {
  name: string;
  shelf_life: string;
  note: string;
}

export interface AiSolutionResponse {
  steps: AiStep[];
  summary: string;
  monthly_savings_potential: number;
  products: AiProcessedProduct[];
}

export interface AiSolutionByMethod {
  key: string;
  label: string;
  remaining_kg: number;
  loss: number;
}

export interface AiSolutionRequest {
  commodity: string;
  price_per_kg: number;
  weight_kg: number;
  days: number;
  method: string;
  remaining_kg: number;
  decay_kg: number;
  loss: number;
  monthly_loss: number;
  past_shelf_life: boolean;
  shelf_life: number;
  decay: number;
  by_method: AiSolutionByMethod[];
  business_name: string;
  business_category: string;
}

export async function fetchAiSolution(
  req: AiSolutionRequest,
  signal?: AbortSignal
): Promise<AiSolutionResponse> {
  const res = await fetch(`${API_BASE}/api/v1/msme/ai-solution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Solusi AI gagal dimuat (${res.status})`);
  }
  return res.json() as Promise<AiSolutionResponse>;
}


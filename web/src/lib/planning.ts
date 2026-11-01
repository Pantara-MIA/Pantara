/** Client and types for the market-operation planner (internal/regional/planning.go). */
import { auth } from './auth';
import type { AlertStatus } from './regional';

export interface PlanParams {
  budget_idr: number;
  lead_time_days: number;
  /** Package size as a share of the region's 14-day demand, e.g. 0.1. */
  package_share: number;
  /** γ in 1 − exp(−γ · share · n). */
  effectiveness: number;
  distribution_rate: number;
  operational_cost: number;
  max_coverage: number;
}

export interface PlanWindow {
  urgent: boolean;
  days_to_breach: number;
  start_date: string;
  peak_date: string;
}

export interface PlanCandidate {
  region_id: string;
  commodity_id: string;
  status: AlertStatus;
  current_price: number;
  reference: number;
  overpayment: number;
  demand_units: number;
  package_units: number;
  package_cost: number;
  max_packages: number;
  subsidy_per_unit: number;
  window: PlanWindow;
}

export interface PlanAllocation extends PlanCandidate {
  packages: number;
  volume_units: number;
  cost: number;
  avoided: number;
  avoided_share: number;
  marginal_ratio: number;
}

export interface Plan {
  as_of: string;
  params: PlanParams;
  defaults: PlanParams;
  spent: number;
  overpayment: number;
  avoided: number;
  allocations: PlanAllocation[];
  unfunded: PlanCandidate[];
  frontier: { budget: number; avoided: number }[];
  candidate_count: number;
}

export const fetchPlan = (asOf: string, params: Partial<PlanParams>) =>
  auth.fetchAuth('/gov/plan', { method: 'POST', body: JSON.stringify({ as_of: asOf, ...params }) }) as Promise<Plan>;

/** Effectiveness presets shown to users instead of the raw γ. */
export const EFFECTIVENESS_PRESETS = [
  { value: '2', label: 'Rendah' },
  { value: '3', label: 'Sedang' },
  { value: '4', label: 'Tinggi' },
] as const;

/** "16.800 kg" → "16,8 ton"; liters stay liters. */
export const formatVolume = (units: number, unit: string) =>
  unit === 'kg' && units >= 1000
    ? `${(units / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} ton`
    : `${Math.round(units).toLocaleString('id-ID')} ${unit}`;

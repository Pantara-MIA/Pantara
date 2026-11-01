/** Client and presentation metadata for climate risk (internal/regional/climate.go). */
import { API_BASE } from './api';

export type ClimateLevel = 'low' | 'watch' | 'high';
export type ClimateDriver = 'dry' | 'wet' | 'el_nino' | 'la_nina';
export type RainClass = 'below' | 'normal' | 'above';

export interface ENSO {
  season: string;
  year: number;
  anom: number;
  phase: 'el_nino' | 'la_nina' | 'neutral';
  strength: '' | 'lemah' | 'sedang' | 'kuat';
}

export interface ClimateEffect {
  commodity_id: string;
  driver: ClimateDriver;
  lead_months: number;
  effect_pct: number;
  lo_pct: number;
  hi_pct: number;
  n: number;
  significant: boolean;
}

export interface ProvinceClimate {
  region_id: string;
  rain30_pct: number;
  rain90_pct: number;
  rain30_class: RainClass;
  rain90_class: RainClass;
  level: ClimateLevel;
  drivers: ClimateDriver[];
  effects: ClimateEffect[];
}

export interface ClimateSnapshot {
  as_of: string;
  weather_as_of: string;
  enso: ENSO;
  provinces: ProvinceClimate[];
  available: boolean;
  effects: ClimateEffect[];
}

export interface MonthRain {
  month: string;
  rain_mm: number;
  normal_mm: number;
  pct: number;
}

export interface RegionClimate {
  region_id: string;
  province_id: string;
  as_of: string;
  weather_as_of: string;
  enso: ENSO;
  climate: ProvinceClimate | null;
  history: MonthRain[];
}

async function get<T>(path: string, asOf?: string, signal?: AbortSignal): Promise<T> {
  const q = asOf ? `?as_of=${asOf}` : '';
  const res = await fetch(`${API_BASE}/api/v1/public/${path}${q}`, { signal });
  if (!res.ok) throw new Error(`Server menjawab ${res.status}.`);
  return res.json() as Promise<T>;
}

export const fetchClimate = (asOf?: string, signal?: AbortSignal) => get<ClimateSnapshot>('climate', asOf, signal);

export const fetchRegionClimate = (regionId: string, asOf?: string, signal?: AbortSignal) =>
  get<RegionClimate>(`climate/${encodeURIComponent(regionId)}`, asOf, signal);

/** Map bins for 90-day rain as % of normal (BMKG classes split into two steps per side). */
export const RAIN_BINS: { max: number; label: string; fill: string }[] = [
  { max: 50, label: '< 50% (sangat kering)', fill: 'var(--color-rain-dry-2)' },
  { max: 85, label: '50–85% (bawah normal)', fill: 'var(--color-rain-dry-1)' },
  { max: 115, label: '85–115% (normal)', fill: 'var(--color-rain-normal)' },
  { max: 150, label: '115–150% (atas normal)', fill: 'var(--color-rain-wet-1)' },
  { max: Infinity, label: '> 150% (sangat basah)', fill: 'var(--color-rain-wet-2)' },
];

export const rainBin = (pct: number) => RAIN_BINS.find((b) => pct < b.max)!;

export const RAIN_CLASS_LABEL: Record<RainClass, string> = {
  below: 'Bawah normal',
  normal: 'Normal',
  above: 'Atas normal',
};

export const LEVEL_META: Record<ClimateLevel, { label: string; tone: 'critical' | 'warning' | 'good'; description: string }> = {
  high: { label: 'Risiko iklim tinggi', tone: 'critical', description: 'Hujan 90 hari di bawah normal saat El Niño, atau hujan kurang dari separuh normal.' },
  watch: { label: 'Risiko iklim waspada', tone: 'warning', description: 'Hujan 90 hari di bawah normal, atau El Niño sedang berlangsung.' },
  low: { label: 'Risiko iklim rendah', tone: 'good', description: 'Hujan tidak di bawah normal dan tidak ada El Niño.' },
};

export const DRIVER_LABEL: Record<ClimateDriver, string> = {
  dry: 'hujan 3 bulan di bawah normal',
  wet: 'hujan 3 bulan di atas normal',
  el_nino: 'El Niño',
  la_nina: 'La Niña',
};

/** "El Niño kuat", "La Niña lemah", "Netral". */
export const ensoLabel = (e: ENSO) =>
  e.phase === 'neutral' ? 'ENSO netral' : `${e.phase === 'el_nino' ? 'El Niño' : 'La Niña'}${e.strength ? ` ${e.strength}` : ''}`;

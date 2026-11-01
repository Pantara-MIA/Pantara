/** Shared presentation metadata for scorecard grades, alert statuses and regions. */
import type { AlertStatus, Grade, Region, RegionalCommodity } from './regional';

export interface GradeMeta {
  label: string;
  /** Tile/badge fill. */
  fill: string;
  /** Text color inside the fill (picked by APCA: white on A/E, ink on B/C/D). */
  onFill: string;
}

export const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'E'];

export const GRADE_META: Record<Grade, GradeMeta> = {
  A: { label: 'Sangat stabil', fill: 'var(--color-grade-a)', onFill: '#ffffff' },
  B: { label: 'Stabil', fill: 'var(--color-grade-b)', onFill: 'var(--color-ink)' },
  C: { label: 'Cukup', fill: 'var(--color-grade-c)', onFill: 'var(--color-ink)' },
  D: { label: 'Rawan', fill: 'var(--color-grade-d)', onFill: 'var(--color-ink)' },
  E: { label: 'Sangat rawan', fill: 'var(--color-grade-e)', onFill: '#ffffff' },
};

/** Score thresholds, mirrored from internal/regional/scorecard.go. */
export const GRADE_THRESHOLDS: { grade: Grade; min: number }[] = [
  { grade: 'A', min: 85 },
  { grade: 'B', min: 70 },
  { grade: 'C', min: 55 },
  { grade: 'D', min: 40 },
  { grade: 'E', min: 0 },
];

export interface StatusMeta {
  label: string;
  description: string;
  /** Saturated mark color (icon, dot). */
  color: string;
  /** Text color that clears 4.5:1 on its soft background. */
  ink: string;
  soft: string;
  /** Map fill; lightness-separated so the map never relies on green vs red. */
  mapFill: string;
}

export const STATUS_META: Record<AlertStatus, StatusMeta> = {
  above_reference: {
    label: 'Di atas acuan',
    description: 'Harga hari ini sudah melampaui HET/HAP atau batas acuan.',
    color: 'var(--color-critical)',
    ink: 'var(--color-critical-ink)',
    soft: 'var(--color-critical-soft)',
    mapFill: 'var(--color-map-above)',
  },
  watch: {
    label: 'Waspada',
    description: 'Peluang melampaui acuan dalam 14 hari ke depan ≥ 40%.',
    color: 'var(--color-warning)',
    ink: 'var(--color-warning-ink)',
    soft: 'var(--color-warning-soft)',
    mapFill: 'var(--color-map-watch)',
  },
  normal: {
    label: 'Normal',
    description: 'Harga di bawah acuan dan peluang melampauinya rendah.',
    color: 'var(--color-good)',
    ink: 'var(--color-good-ink)',
    soft: 'var(--color-good-soft)',
    mapFill: 'var(--color-map-normal)',
  },
  no_data: {
    label: 'Tidak ada data',
    description: 'Belum ada data harga komoditas ini untuk daerah tersebut.',
    color: 'var(--color-ink-3)',
    ink: 'var(--color-ink-2)',
    soft: 'var(--color-surface-muted)',
    mapFill: 'var(--color-surface-muted)',
  },
};

export const REFERENCE_TYPE_LABEL: Record<string, string> = {
  HET: 'HET',
  HAP: 'HAP',
  baseline: 'Acuan statistik',
};

/** "Kab. Bandung Barat" → "Bandung Barat"; the type is shown separately. */
export const shortRegionName = (r: Pick<Region, 'name'>) => r.name.replace(/^(Kab\.|Kota)\s+/, '');

export const regionTypeLabel = (r: Pick<Region, 'type'>) => (r.type === 'province' ? 'Provinsi' : r.type === 'city' ? 'Kota' : 'Kabupaten');

/** "2026-08" → "Agustus 2026" */
export const formatMonth = (month: string) => {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

/** "2026-08" → "Agu 26" */
export const formatMonthShort = (month: string) => {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
};

const CATEGORY_LABEL: Record<string, string> = {
  chili: 'Cabai',
  rice: 'Beras',
  pantry: 'Bahan dapur',
  spice: 'Bumbu',
  protein: 'Protein',
  vegetable: 'Sayur',
};

/** Commodities grouped by category for <optgroup> filters, in API order. */
export function commodityGroups(commodities: RegionalCommodity[]) {
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const c of commodities) {
    const g = CATEGORY_LABEL[c.category] ?? c.category;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ value: c.id, label: c.name });
  }
  return [...groups].map(([label, options]) => ({ label, options }));
}

/** Previous "YYYY-MM", or undefined when outside the list of available months. */
export function previousMonth(months: string[], month: string) {
  const i = months.indexOf(month);
  return i > 0 ? months[i - 1] : undefined;
}

/** Last day of a month clamped to the data range, for as-of queries. */
export function monthAsOf(month: string, dataEnd: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return last < dataEnd ? last : dataEnd;
}

/** Bins for the all-commodities alert map: how many commodities are above reference. */
export const ABOVE_COUNT_BINS: { min: number; label: string; fill: string }[] = [
  { min: 0, label: 'Tidak ada', fill: 'var(--color-map-normal)' },
  { min: 1, label: '1–2 komoditas', fill: 'var(--color-count-1)' },
  { min: 3, label: '3–4 komoditas', fill: 'var(--color-count-2)' },
  { min: 5, label: '≥ 5 komoditas', fill: 'var(--color-count-3)' },
];

export const aboveCountBin = (n: number) => [...ABOVE_COUNT_BINS].reverse().find((b) => n >= b.min)!;

/** Bins for the compliance map: share of regulated commodity-days at or below HET/HAP (reuses the count ramp, darker = worse). */
export const COMPLIANCE_BINS: { min: number; label: string; fill: string }[] = [
  { min: 80, label: '≥ 80% patuh', fill: 'var(--color-map-normal)' },
  { min: 50, label: '50–80%', fill: 'var(--color-count-1)' },
  { min: 20, label: '20–50%', fill: 'var(--color-count-2)' },
  { min: 0, label: '< 20%', fill: 'var(--color-count-3)' },
];

export const complianceBin = (pct: number) => COMPLIANCE_BINS.find((b) => pct >= b.min)!;

type Tone = 'good' | 'warning' | 'critical' | 'neutral';

export const gradeOf = (score: number): Grade => GRADE_THRESHOLDS.find((t) => score >= t.min)!.grade;

export const gradeTone = (g: Grade): Tone => (g === 'A' || g === 'B' ? 'good' : g === 'C' ? 'warning' : 'critical');

/** Plain-word judgement of a stability score, from the A–E thresholds. */
export const scoreVerdict = (score: number) => {
  const g = gradeOf(score);
  return { label: `${g} · ${GRADE_META[g].label}`, tone: gradeTone(g) };
};

/** Judgement of HET/HAP compliance, on the same bins as the compliance map. */
export const complianceVerdict = (pct: number): { label: string; tone: Tone } =>
  pct >= 80
    ? { label: 'Patuh', tone: 'good' }
    : pct >= 50
      ? { label: 'Cukup', tone: 'warning' }
      : pct >= 20
        ? { label: 'Rendah', tone: 'critical' }
        : { label: 'Sangat rendah', tone: 'critical' };

/** Recovery after a spike; the score treats 10 days or more as fully slow. */
export const recoveryVerdict = (days: number): { label: string; tone: Tone } =>
  days < 5 ? { label: 'Cepat', tone: 'good' } : days < 10 ? { label: 'Sedang', tone: 'warning' } : { label: 'Lambat', tone: 'critical' };

/** How many of `total` items are in trouble: none is good, up to half a warning, more is critical. */
export const countVerdict = (n: number, total: number, none = 'Aman'): { label: string; tone: Tone } =>
  n === 0 ? { label: none, tone: 'good' } : n <= total / 2 ? { label: 'Waspada', tone: 'warning' } : { label: 'Meluas', tone: 'critical' };

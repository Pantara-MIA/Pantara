import type { Commodity, StorageKey, StorageProfile } from './types';
import { CHILI } from './commodities.chili';
import { STAPLES } from './commodities.staples';
import { FRESH } from './commodities.fresh';

export * from './types';

/**
 * Knowledge base of volatile food commodities.
 *
 * Reference prices, CPI weights and inflation contributions come from public
 * PIHPS (Bank Indonesia) and BPS releases, rounded as educational figures.
 * Daily decay rates are operational estimates for MSME kitchens derived from
 * post-harvest shelf-life ranges — not laboratory results.
 */
export const COMMODITIES: Commodity[] = [...CHILI, ...FRESH, ...STAPLES];

export const DATA_DISCLAIMER =
  'Harga acuan dan bobot inflasi merujuk pada publikasi PIHPS Bank Indonesia dan BPS, dibulatkan untuk keperluan edukasi. Laju susut merupakan estimasi operasional dapur, bukan hasil uji laboratorium.';

export function getCommodity(id: string): Commodity | undefined {
  return COMMODITIES.find((c) => c.id === id);
}

export function getStorage(c: Commodity, key: StorageKey): StorageProfile {
  return c.decay.find((d) => d.key === key) ?? c.decay[0];
}

// ───────────────────────────── Synthetic series ─────────────────────────────

/** Deterministic PRNG (mulberry32) so sparklines are stable across renders. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a 30-day price path consistent with the commodity's coefficient
 * of variation: a cv-sized random walk pulled back toward the reference price.
 */
export function priceSeries(c: Commodity, days = 30): number[] {
  const rand = rng(c.seed);
  const sigma = (c.cv / 100) * 0.42;
  const out: number[] = [];
  let level = 1 - sigma * 0.6;
  for (let i = 0; i < days; i++) {
    const shock = (rand() - 0.5) * 2 * sigma;
    const pull = (1 - level) * 0.18;
    level = level + shock * 0.55 + pull;
    out.push(Math.max(0.55, level) * c.price);
  }
  // Pin the last point to the reference price so sparkline and card agree.
  out[out.length - 1] = c.price;
  return out;
}

/** Turns a series into a smooth SVG path (Catmull–Rom to Bézier). */
export function sparkPath(values: number[], w: number, h: number, pad = 2): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * (w - pad * 2) + pad,
    y: h - pad - ((v - min) / span) * (h - pad * 2),
  }));

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

// ─────────────────────────────── Waste model ────────────────────────────────

export interface WasteResult {
  initialKg: number;
  usableKg: number;
  wasteKg: number;
  cashLoss: number;
  /** Price rise (%) needed for stockpiling to offset the decay loss. */
  breakevenHikePct: number;
  /** Historical frequency of a spike that large over the same horizon (%). */
  spikeProbabilityPct: number;
  /** Usable weight from day 0 to day n. */
  curve: number[];
  /** Day the stock passes this method's shelf life. */
  shelfLifeDays: number;
  beyondShelfLife: boolean;
  /** Comparison against every other storage method. */
  alternatives: { key: StorageKey; usableKg: number; cashLoss: number }[];
}

/**
 * Weight decay as daily geometric loss, as in the L3 model:
 * usable weight on day n = W0 × (1 − s)^n.
 */
export function simulateWaste(
  c: Commodity,
  weightKg: number,
  storage: StorageKey,
  days: number
): WasteResult {
  const profile = getStorage(c, storage);
  const s = profile.decayPerDay;

  const curve: number[] = [];
  for (let d = 0; d <= days; d++) curve.push(weightKg * Math.pow(1 - s, d));

  const usableKg = curve[days];
  const wasteKg = weightKg - usableKg;
  const cashLoss = wasteKg * c.price;

  // To break even on stockpiling, the price must rise enough to cover the lost weight.
  const breakevenHikePct = usableKg > 0 ? (wasteKg / usableKg) * 100 : Infinity;

  // Historical chance of a spike that large, scaled by the commodity's volatility.
  // Lognormal approximation: daily sigma ≈ (cv/100) / √30.
  const sigmaDaily = c.cv / 100 / Math.sqrt(30);
  const sigmaH = sigmaDaily * Math.sqrt(Math.max(1, days));
  const z = Math.log(1 + breakevenHikePct / 100) / (sigmaH || 1e-6);
  const spikeProbabilityPct = Math.max(0.05, normalTail(z) * 100);

  const alternatives = c.decay.map((p) => {
    const u = weightKg * Math.pow(1 - p.decayPerDay, days);
    return { key: p.key, usableKg: u, cashLoss: (weightKg - u) * c.price };
  });

  return {
    initialKg: weightKg,
    usableKg,
    wasteKg,
    cashLoss,
    breakevenHikePct,
    spikeProbabilityPct,
    curve,
    shelfLifeDays: profile.shelfLifeDays,
    beyondShelfLife: days > profile.shelfLifeDays,
    alternatives,
  };
}

/** P(Z > z) for the standard normal — Zelen & Severo approximation. */
function normalTail(z: number): number {
  if (z < 0) return 1 - normalTail(-z);
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return p;
}

// ─────────────────────────────── Presentation ───────────────────────────────

export { formatIDR, formatNumber } from '../lib/format';

/** Label and tokens for each volatility level (status-like: always shown with text). */
export const VOLATILITY_META: Record<Commodity['volatility'], { label: string; cls: string; dot: string }> = {
  stable: { label: 'Stabil', cls: 'bg-good-soft text-good-ink', dot: 'bg-good' },
  watch: { label: 'Waspada', cls: 'bg-warning-soft text-warning-ink', dot: 'bg-warning' },
  volatile: { label: 'Bergejolak', cls: 'bg-critical-soft text-critical-ink', dot: 'bg-critical' },
};

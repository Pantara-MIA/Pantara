/** Pre-projected boundary maps per scope, loaded on demand (model/build_*_map.py). */
import { useEffect, useState } from 'react';

export interface GeoShape {
  id: string;
  d: string;
  cx: number;
  cy: number;
}

export interface GeoData {
  source: string;
  license: string;
  viewBox: string;
  regions: GeoShape[];
  /** Areas outside the scope, drawn as grey context. */
  context: string[];
  water: string[];
}

// One file per scope: the province map, then one regency map per province
// (each becomes its own lazily loaded chunk).
const REGENCY_MAPS = import.meta.glob<{ default: unknown }>('../data/geo/regencies/*.json');

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  indonesia: () => import('../data/geo/indonesia-provinces.json'),
  ...Object.fromEntries(Object.entries(REGENCY_MAPS).map(([path, load]) => [path.split('/').pop()!.replace('.json', ''), load])),
};

const cache = new Map<string, GeoData>();

/** The map of a scope, or undefined while it loads (or when none exists). */
export function useGeo(scopeId: string) {
  // Bumped when a map finishes loading; the map itself is read from the cache.
  const [, setLoaded] = useState(0);

  useEffect(() => {
    const load = LOADERS[scopeId];
    if (cache.has(scopeId) || !load) return;
    let live = true;
    load().then((m) => {
      cache.set(scopeId, m.default as GeoData);
      if (live) setLoaded((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [scopeId]);

  return cache.get(scopeId);
}

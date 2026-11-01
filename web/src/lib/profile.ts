/** MSME kitchen profile: data shape, defaults and derived rules. */
import { COMMODITIES } from '../data/commodities';

/** Region used for profiles created before businesses chose one (Go: defaultMSMERegion). */
export const DEFAULT_MSME_REGION = 'kota-jakarta-selatan';

export type StorageMethod = 'room' | 'chiller' | 'airtight';

export interface CommodityConsumption {
  name: string;
  weekly_consumption_kg: number;
}

export interface MsmeProfile {
  id?: string;
  business_name: string;
  fnb_category: string;
  reference_market: string;
  /** Regency/city the business buys in; prices and forecasts come from here. */
  region_id: string;
  region_name?: string;
  /** Commodities the business uses regularly, with weekly volume. */
  commodities: CommodityConsumption[];
  storage_method: StorageMethod;
  /** s — daily decay rate, derived from the storage method at sign-up. */
  daily_decay_rate: number;
}

/**
 * Parameters of each storage method, as in the sign-up form.
 *
 * `decay` and `shelfLife` feed the decision engine, so they are shown to users
 * as-is to keep every recommendation traceable.
 */
export const STORAGE_METHODS: Record<
  StorageMethod,
  {
    label: string;
    short: string;
    icon: string;
    decay: number;
    shelfLife: number;
    desc: string;
    /** What users see when picking this option in the sign-up form. */
    formLabel: string;
  }
> = {
  room: {
    label: 'Suhu Ruang / Keranjang Terbuka',
    short: 'Suhu Ruang',
    icon: '🧺',
    decay: 0.03,
    shelfLife: 7,
    desc: 'Bahan ditaruh di keranjang atau kantong di sudut dapur, tanpa pendingin.',
    formLabel: 'Suhu Ruang / Keranjang Terbuka — susut ±3–4%/hari, batas simpan 5–7 hari',
  },
  chiller: {
    label: 'Chiller / Kulkas Rumah Tangga',
    short: 'Chiller',
    icon: '❄️',
    decay: 0.015,
    shelfLife: 14,
    desc: 'Rak bawah kulkas 4–8 °C; memperlambat respirasi dan pertumbuhan jamur.',
    formLabel: 'Chiller / Kulkas Rumah Tangga — susut ±1,5–2%/hari, batas simpan 10–14 hari',
  },
  airtight: {
    label: 'Kotak Kedap Udara + Tisu Alas',
    short: 'Kedap Udara',
    icon: '🥡',
    decay: 0.005,
    shelfLife: 21,
    desc: 'Wadah tertutup beralas tisu penyerap embun, disimpan di dalam chiller.',
    formLabel: 'Kotak Kedap Udara + Tisu Alas — susut ±0,5%/hari, batas simpan hingga 21 hari',
  },
};

export function storageOf(method: string) {
  return STORAGE_METHODS[(method as StorageMethod) in STORAGE_METHODS ? (method as StorageMethod) : 'room'];
}

/** Shelf life the decision engine uses as the limit L. */
export function shelfLifeOf(method: string): number {
  return storageOf(method).shelfLife;
}


/**
 * Completes a profile from the database so newer fields are never empty.
 * `storage_method` is accepted as a free string because the database column
 * is not strictly typed.
 */
type RawProfile = Partial<Omit<MsmeProfile, 'storage_method'>> & { storage_method?: string };

export function normalizeProfile(raw: RawProfile | null): MsmeProfile {
  const key = (raw?.storage_method ?? 'room') as StorageMethod;
  const method: StorageMethod = key in STORAGE_METHODS ? key : 'room';
  const meta = STORAGE_METHODS[method];
  return {
    id: raw?.id,
    business_name: raw?.business_name || 'Usaha Anda',
    fnb_category: raw?.fnb_category || 'Warteg',
    reference_market: raw?.reference_market || 'Pasar Tradisional',
    region_id: raw?.region_id || DEFAULT_MSME_REGION,
    region_name: raw?.region_name,
    commodities: raw?.commodities && raw.commodities.length > 0 ? raw.commodities : [],
    storage_method: method,
    daily_decay_rate: raw?.daily_decay_rate ?? meta.decay,
  };
}

/**
 * Maps a profile commodity name to its encyclopedia ID so the signed-in area
 * uses the same storage knowledge base as the public pages. "Cabai Merah
 * Besar" matches "Cabai Merah Besar (TW)".
 */
export function encyclopediaId(commodity: string): string | undefined {
  const want = commodity.trim().toLowerCase();
  return COMMODITIES.find((c) => {
    const full = c.name.toLowerCase();
    return full === want || full.split(' (')[0] === want;
  })?.id;
}

/** Weekly usage D of a commodity in the profile (falls back to 10 kg). */
export function weeklyUsage(profile: MsmeProfile, commodity: string): number {
  return profile.commodities.find((c) => c.name === commodity)?.weekly_consumption_kg ?? 10;
}

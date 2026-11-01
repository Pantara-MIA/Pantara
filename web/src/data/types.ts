export type StorageKey = 'room' | 'chiller' | 'airtight' | 'freezer';
export type CategoryKey = 'chili' | 'rice' | 'spice' | 'protein' | 'vegetable' | 'pantry';
export type VolatilityLevel = 'stable' | 'watch' | 'volatile';

/** One storage method profile for one commodity. */
export interface StorageProfile {
  key: StorageKey;
  /** Daily decay rate (share of usable weight lost per day). */
  decayPerDay: number;
  /** Days the commodity stays fit to sell/cook with this method. */
  shelfLifeDays: number;
  /** Practical note for this commodity + method. */
  note: string;
  /** Set when this method actually harms the commodity (e.g. shallots in a fridge). */
  warning?: string;
}

export interface ImpactFact {
  label: string;
  value: string;
  hint: string;
}

export interface Commodity {
  id: string;
  name: string;
  shortName: string;
  category: CategoryKey;
  emoji: string;
  /** Built-in vector illustration key (see CommodityArt). */
  art: string;
  /** Optional photo; the vector illustration shows if it fails to load. */
  photo?: string;
  unit: string;
  /** National reference price (Rp per unit). */
  price: number;
  /** Change vs the same period last year (%). */
  yoy: number;
  volatility: VolatilityLevel;
  /** 30-day price coefficient of variation (%) — how noisy the price is. */
  cv: number;
  /** Seed for the deterministic sparkline. */
  seed: number;
  tagline: string;
  /** Commodity description — paragraphs. */
  description: string[];
  impact: {
    /** Weight in the national CPI basket (%). */
    weightCpi: number;
    /** Contribution to monthly inflation in its peak month (percentage points). */
    andil: number;
    /** Low→high price swing within a year (%). */
    swingPct: number;
    peakMonths: string;
    narrative: string[];
    facts: ImpactFact[];
  };
  decay: StorageProfile[];
  storage: {
    best: StorageKey;
    idealTemp: string;
    idealHumidity: string;
    steps: { title: string; detail: string }[];
    dos: string[];
    donts: string[];
    processing: { name: string; life: string; note: string }[];
  };
}

export const CATEGORY_META: Record<CategoryKey, { label: string; blurb: string; emoji: string }> = {
  chili: { label: 'Cabai', blurb: 'Penyumbang gejolak harga terbesar', emoji: '🌶️' },
  rice: { label: 'Beras', blurb: 'Bobot inflasi terbesar, ayunan pelan', emoji: '🌾' },
  spice: { label: 'Bumbu Umbi', blurb: 'Musiman & sangat tergantung panen', emoji: '🧅' },
  protein: { label: 'Protein', blurb: 'Mahal, cepat rusak, rantai dingin wajib', emoji: '🥚' },
  vegetable: { label: 'Sayur & Buah', blurb: 'Umur simpan terpendek', emoji: '🥬' },
  pantry: { label: 'Pantry Dapur', blurb: 'Stabil, aman untuk stok panjang', emoji: '🫗' },
};

export const STORAGE_META: Record<StorageKey, { label: string; short: string; icon: string; desc: string }> = {
  room: {
    label: 'Suhu Ruang / Keranjang Terbuka',
    short: 'Suhu Ruang',
    icon: '🧺',
    desc: 'Ditaruh di keranjang atau kantong plastik di sudut dapur. Termurah, paling boros.',
  },
  chiller: {
    label: 'Chiller / Kulkas Rumah Tangga',
    short: 'Chiller',
    icon: '❄️',
    desc: 'Rak bawah kulkas 4–8 °C. Memperlambat respirasi dan pertumbuhan jamur.',
  },
  airtight: {
    label: 'Kotak Kedap Udara + Tisu Alas',
    short: 'Kedap Udara',
    icon: '🥡',
    desc: 'Wadah tertutup dengan tisu penyerap embun, disimpan di chiller. Metode paling hemat.',
  },
  freezer: {
    label: 'Freezer / Beku',
    short: 'Freezer',
    icon: '🧊',
    desc: 'Di bawah −15 °C. Bobot terkunci, tetapi tekstur berubah setelah dicairkan.',
  },
};

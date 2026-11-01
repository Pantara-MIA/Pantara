/** Number and date formatting for the Indonesian-language UI. */

export const formatIDR = (v: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.round(v || 0));

/** Compact rupiah for chart labels: Rp 62,4rb / Rp 1,84jt / Rp 4,53 M (miliar). */
export const formatIDRShort = (v: number) => {
  const n = Math.abs(v);
  if (n >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (n >= 1_000_000) return `Rp ${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })}jt`;
  if (n >= 1_000) return `Rp ${(v / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}rb`;
  return `Rp ${Math.round(v)}`;
};

export const formatNumber = (v: number, decimals = 1) =>
  (v || 0).toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export const formatPct = (v: number, decimals = 1) => `${formatNumber(v, decimals)}%`;

/** 2026-08-28 → 28 Agustus 2026 */
export const formatDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** 2026-08-28 → 28 Agu */
export const formatDateShort = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

/**
 * Adds n days to an ISO date and returns it as ISO. Works in UTC on purpose:
 * mixing local midnight with toISOString() shifts the date back a day east of
 * UTC (e.g. WIB, UTC+7).
 */
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ProcurementResponse } from '../../lib/api';
import type { MsmeProfile } from '../../lib/profile';

/** Props every MSME dashboard tab receives from the shell. */
export interface MsmeTabProps {
  profile: MsmeProfile;
  data: ProcurementResponse | null;
  loading: boolean;
  commodity: string;
  asOf: string;
}

/** Progressive disclosure: the reasoning stays one click away, not on screen by default. */
export function Disclosure({ label = 'Lihat alasan', children, defaultOpen = false }: { label?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left text-sm font-semibold text-accent hover:bg-accent-soft/50"
      >
        {label}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div className="border-t border-line px-5 py-4">{children}</div>}
    </div>
  );
}

export function NoData({ loading, children }: { loading: boolean; children?: ReactNode }) {
  return (
    <div className="grid min-h-[40vh] place-items-center rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center">
      {loading ? (
        <span className="flex flex-col items-center gap-2 text-sm text-ink-2">
          <Loader2 className="h-6 w-6 animate-spin text-accent" /> Menghitung…
        </span>
      ) : (
        <span className="text-sm text-ink-2">{children ?? 'Belum ada data untuk tanggal ini.'}</span>
      )}
    </div>
  );
}

/** Label · value row for reasoning lists; `formula` shows the arithmetic behind it. */
export function Row({ label, value, formula }: { label: string; value: ReactNode; formula?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="text-sm font-semibold text-ink tabular-nums">{value}</dd>
      {formula && <dd className="w-full text-xs text-ink-3 tabular-nums">{formula}</dd>}
    </div>
  );
}

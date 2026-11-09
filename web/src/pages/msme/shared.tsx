import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { InfoTip } from '../../components/ui/InfoTip';
import { ActionLine } from '../../components/ui/StatTile';
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

type BannerTone = 'good' | 'neutral' | 'alert';

const BANNER: Record<BannerTone, { box: string; eyebrow: string; title: string; body: string }> = {
  good: { box: 'bg-good-soft', eyebrow: 'text-good-ink', title: 'text-ink', body: 'text-ink-2' },
  neutral: { box: 'border border-line bg-surface', eyebrow: 'text-ink-2', title: 'text-ink', body: 'text-ink-2' },
  alert: { box: 'border border-gold bg-gold/30', eyebrow: 'text-critical-ink', title: 'text-critical-ink', body: 'text-critical-ink' },
};

/** The answer of a tab: verdict, one sentence, and the step to take. */
export function DecisionBanner({
  tone,
  verdict,
  title,
  info,
  action,
  children,
}: {
  tone: BannerTone;
  verdict: string;
  title: string;
  info?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`rounded-3xl p-6 sm:p-8 ${BANNER[tone].box}`}>
      <p className={`text-xs font-bold tracking-[0.16em] uppercase ${BANNER[tone].eyebrow}`}>{verdict}</p>
      <p className={`mt-2 font-display text-3xl leading-tight font-bold sm:text-4xl ${BANNER[tone].title}`}>
        {title} {info && <InfoTip label={title}>{info}</InfoTip>}
      </p>
      {children && <p className={`mt-2 ${BANNER[tone].body}`}>{children}</p>}
      {action && (
        <div className="mt-4">
          <ActionLine alert={tone === 'alert'}>{action}</ActionLine>
        </div>
      )}
    </section>
  );
}

/** Progressive disclosure: the reasoning stays one click away, not on screen by default. */
export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
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

/** Label · value row; `info` explains the label behind an ⓘ, `note` adds a plain line below. */
export function Row({ label, value, info, note }: { label: string; value: ReactNode; info?: ReactNode; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="inline-flex items-center gap-1 text-sm text-ink-2">
        {label}
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </dt>
      <dd className="text-sm font-semibold text-ink tabular-nums">{value}</dd>
      {note && <dd className="w-full text-xs text-ink-3">{note}</dd>}
    </div>
  );
}

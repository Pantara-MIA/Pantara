import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { InfoTip } from '../../components/ui/InfoTip';
import { ActionLine } from '../../components/ui/StatTile';
import type { VerdictTone } from '../../components/ui/Badge';
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

const BANNER: Record<VerdictTone, { box: string; eyebrow: string }> = {
  good: { box: 'bg-good-soft', eyebrow: 'text-good-ink' },
  warning: { box: 'bg-warning-soft', eyebrow: 'text-warning-ink' },
  critical: { box: 'bg-critical-soft', eyebrow: 'text-critical-ink' },
  neutral: { box: 'border border-line bg-surface', eyebrow: 'text-ink-2' },
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
  tone: VerdictTone;
  verdict: string;
  title: string;
  info?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`rounded-3xl p-6 sm:p-8 ${BANNER[tone].box}`}>
      <p className={`text-xs font-bold tracking-[0.16em] uppercase ${BANNER[tone].eyebrow}`}>{verdict}</p>
      <p className="mt-2 font-display text-3xl leading-tight font-bold text-ink sm:text-4xl">
        {title} {info && <InfoTip label={title}>{info}</InfoTip>}
      </p>
      {children && <p className="mt-2 text-ink-2">{children}</p>}
      {action && (
        <div className="mt-4">
          <ActionLine>{action}</ActionLine>
        </div>
      )}
    </section>
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

/** Label · value row for profile facts; `info` explains the label behind an ⓘ. */
export function Row({ label, value, info }: { label: string; value: ReactNode; info?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="inline-flex items-center gap-1 text-sm text-ink-2">
        {label}
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </dt>
      <dd className="text-sm font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}

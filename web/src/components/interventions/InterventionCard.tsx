import { useState } from 'react';
import type { ReactNode } from 'react';
import { SURFACE_IN_VIEW, useInView } from '../motion/hooks';
import { CalendarRange, ChevronDown, Landmark, Package, Wallet } from 'lucide-react';
import type { Intervention } from '../../lib/interventions';
import { interventionTypeLabel } from '../../lib/interventions';
import { formatDate, formatIDR, formatNumber } from '../../lib/format';
import { StatusBadge, Tag } from '../ui/Badge';
import { EvaluationPanel, VerdictBadge } from './EvaluationPanel';

/** One intervention: what, where, when, how much, why (trigger), and its indicative impact. */
export function InterventionCard({
  it,
  actions,
  showStatus = false,
  defaultOpen = false,
}: {
  it: Intervention;
  actions?: ReactNode;
  /** Show draft/published state (government view). */
  showStatus?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { ref, inView } = useInView<HTMLElement>(SURFACE_IN_VIEW);
  const trig = it.trigger.forecast;
  const facts: { icon: typeof CalendarRange; text: string }[] = [
    { icon: CalendarRange, text: it.start_date === it.end_date ? formatDate(it.start_date) : `${formatDate(it.start_date)} – ${formatDate(it.end_date)}` },
  ];
  if (it.volume !== null) facts.push({ icon: Package, text: `${formatNumber(it.volume, it.volume % 1 ? 1 : 0)} ${it.volume_unit}`.trim() });
  if (it.budget_idr !== null) facts.push({ icon: Wallet, text: formatIDR(it.budget_idr) });
  if (it.agency_name) facts.push({ icon: Landmark, text: it.agency_name });

  return (
    <article
      ref={ref}
      className={`spotlight reveal ${inView ? 'is-visible' : ''} rounded-2xl border border-line bg-surface p-4 shadow-[0_10px_30px_-24px_rgba(13,51,17,0.45)] hover:border-line-strong hover:shadow-[0_22px_44px_-30px_rgba(13,51,17,0.6)] sm:p-5`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="accent">{interventionTypeLabel(it.type)}</Tag>
        {showStatus && (it.status === 'draft' ? <Tag tone="warning">Draf</Tag> : <Tag>Dipublikasikan</Tag>)}
        {it.status === 'published' && <VerdictBadge ev={it.evaluation} />}
        <span className="text-xs text-ink-3">
          {it.region_name} · {it.commodity_name}
        </span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-ink">{it.title}</h3>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {facts.map(({ icon: Icon, text }) => (
          <li key={text} className="inline-flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-2">
        <span className="font-semibold text-ink">Dasar keputusan ({formatDate(it.baseline_date)}):</span>
        harga {formatIDR(trig.current_price)} vs acuan {formatIDR(trig.reference)}
        <StatusBadge status={it.trigger.alert.status} />
      </div>

      {it.description && <p className="mt-3 text-sm whitespace-pre-line text-ink-2">{it.description}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="btn inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold text-accent hover:bg-accent-soft"
        >
          Evaluasi dampak
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {open && (
        <div className="anim-rise mt-3 border-t border-line pt-4">
          <EvaluationPanel intervention={it} />
        </div>
      )}
    </article>
  );
}

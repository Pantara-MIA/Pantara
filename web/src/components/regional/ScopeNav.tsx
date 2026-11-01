import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Database, FlaskConical } from 'lucide-react';
import { scopeHref } from '../../lib/regional';
import type { Scope, ScopeRef } from '../../lib/regional';

/**
 * Drill-down path: Indonesia › Jawa Barat › (current page). Hidden on the
 * national overview, where there is nothing above.
 */
export function ScopeBreadcrumb({ trail, month, current }: { trail: ScopeRef[]; month?: string; current?: string }) {
  if (trail.length <= 1 && !current) return null;
  return (
    <nav aria-label="Jejak wilayah" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-ink-3">
      {trail.map((s, i) => {
        const last = i === trail.length - 1 && !current;
        return (
          <Fragment key={s.id}>
            {i > 0 && <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            {last ? (
              <span className="text-ink-2" aria-current="page">
                {s.name}
              </span>
            ) : (
              <Link to={scopeHref(s.id, month)} className="font-semibold text-accent hover:underline">
                {s.name}
              </Link>
            )}
          </Fragment>
        );
      })}
      {current && (
        <>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span className="text-ink-2" aria-current="page">
            {current}
          </span>
        </>
      )}
    </nav>
  );
}

/**
 * One-line data provenance for a scope: real data, mostly real with synthetic
 * gaps (marked per commodity on the region page), or synthetic sample data.
 */
export function SourceNote({ scope, className = '' }: { scope: Scope; className?: string }) {
  const real = !scope.synthetic || scope.real_share >= 0.5;
  const Icon = real ? Database : FlaskConical;
  const label = !scope.synthetic ? 'Data nyata' : scope.real_share >= 0.5 ? 'Sebagian besar data nyata' : 'Data contoh, bukan data resmi';
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        real ? 'bg-accent-soft text-accent-strong' : 'bg-gold-soft text-gold-ink'
      } ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label} · {scope.source}
    </p>
  );
}

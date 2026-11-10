import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { scopeHref } from '../../lib/regional';
import type { ScopeRef } from '../../lib/regional';

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

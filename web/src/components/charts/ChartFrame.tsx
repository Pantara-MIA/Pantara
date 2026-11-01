import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

/**
 * Chart container: title, subtitle, legend, and the table-view toggle that is
 * the accessible twin of every chart (tooltips enhance, the table never gates).
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  actions,
  table,
  footnote,
  children,
  dimmed = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  legend?: ReactNode;
  actions?: ReactNode;
  /** Table equivalent of the chart; when given, a toggle is shown. */
  table?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
  /** Refetch in progress: keep the previous render, dimmed, no layout jump. */
  dimmed?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  return (
    <figure aria-labelledby={titleId} className="m-0 rounded-2xl border border-line bg-surface shadow-[0_10px_30px_-24px_rgba(13,51,17,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h3 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-xs font-medium text-ink-2 hover:bg-surface-muted hover:text-ink"
            >
              {showTable ? <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> : <Table2 className="h-3.5 w-3.5" aria-hidden="true" />}
              {showTable ? 'Lihat grafik' : 'Lihat tabel'}
            </button>
          )}
        </div>
      </div>
      {legend && !showTable && <div className="px-5 pt-3">{legend}</div>}
      <div className={`px-3 pt-2 pb-3 transition-opacity sm:px-5 ${dimmed ? 'opacity-50' : ''}`}>
        {showTable ? <div className="max-h-[420px] overflow-y-auto">{table}</div> : children}
      </div>
      {footnote && <figcaption className="border-t border-line px-5 py-2.5 text-xs text-ink-3">{footnote}</figcaption>}
    </figure>
  );
}

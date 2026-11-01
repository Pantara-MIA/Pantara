import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  /** Cell content; defaults to String(sortValue(row)). */
  render?: (row: T) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => number | string;
  /** Hidden below the sm breakpoint to keep narrow screens readable. */
  hideOnMobile?: boolean;
}

/**
 * Accessible data table: sortable headers (aria-sort), tabular figures for
 * aligned numbers, optional row click. Also the "table view" twin of charts.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  initialSort,
  onRowClick,
  selectedKey,
  dense = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  dense?: boolean;
}) {
  const [sort, setSort] = useState(initialSort);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sortValue || !sort) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, columns, sort]);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const alignCls = (a?: Column<T>['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  const cellPad = dense ? 'px-3 py-1.5' : 'px-3 py-2.5';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none';
              const Icon = !active ? ArrowUpDown : sort?.dir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={c.sortValue ? ariaSort : undefined}
                  className={`${cellPad} ${alignCls(c.align)} text-xs font-semibold whitespace-nowrap text-ink-2 ${c.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-ink ${c.align === 'right' ? 'flex-row-reverse' : ''}`}
                    >
                      {c.header}
                      <Icon className={`h-3 w-3 ${active ? 'text-ink' : 'text-ink-3'}`} aria-hidden="true" />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            const selected = key === selectedKey;
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-line last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-surface-muted' : ''} ${
                  selected ? 'bg-accent-soft' : ''
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`${cellPad} ${alignCls(c.align)} text-ink tabular-nums ${c.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                  >
                    {c.render ? c.render(row) : c.sortValue ? String(c.sortValue(row)) : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

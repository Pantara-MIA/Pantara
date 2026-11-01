import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useSlidingIndicator } from '../motion/hooks';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Small count shown next to the label, e.g. pending items. */
  count?: number;
}

/** Page-level tab bar (tablist semantics, arrow-key navigation). */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  idPrefix,
}: {
  label: string;
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Panels should use id `${idPrefix}-panel-${value}`. */
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, items.findIndex((i) => i.value === value));
  const [tablistRef, indicatorStyle] = useSlidingIndicator<HTMLDivElement>('[aria-selected="true"]', value);

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className="relative flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]"
    >
      <span aria-hidden="true" className="slide-indicator rounded-t-xl bg-accent-soft/70" style={indicatorStyle}>
        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />
      </span>
      {items.map((it, i) => {
        const active = it.value === value;
        const Icon = it.icon;
        return (
          <button
            key={it.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-tab-${it.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${it.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.value)}
            className={`group relative z-10 inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-300 ${
              active ? 'text-accent' : 'text-ink-2 hover:bg-surface-muted/60 hover:text-ink'
            }`}
          >
            {Icon && <Icon className={`h-4 w-4 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:-translate-y-px'}`} aria-hidden="true" />}
            {it.label}
            {it.count !== undefined && it.count > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-accent text-white' : 'bg-surface-muted text-ink-2'}`}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useSlidingIndicator } from '../motion/hooks';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Single-choice toggle group (radiogroup semantics, arrow-key navigation). */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const [groupRef, thumbStyle] = useSlidingIndicator<HTMLDivElement>('[aria-checked="true"]', value);
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} onKeyDown={onKey} className="relative inline-flex rounded-full border border-line bg-surface-muted p-0.5">
      <span aria-hidden="true" className="slide-indicator rounded-full bg-accent shadow-[0_6px_16px_-8px_rgba(27,94,32,0.9)]" style={thumbStyle} />
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`${pad} relative z-10 rounded-full font-semibold transition-colors duration-300 ${
              active ? 'text-white' : 'text-ink-2 hover:bg-white/60 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

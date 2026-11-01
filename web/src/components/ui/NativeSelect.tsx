import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

/**
 * Filter dropdown built on the native <select>: keyboard, screen-reader and
 * mobile pickers work for free. Accepts flat options or labelled groups.
 */
export function NativeSelect({
  label,
  value,
  onChange,
  options,
  groups,
  hideLabel = false,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  hideLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-xs font-medium text-ink-2'}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="peer field-control w-full cursor-pointer appearance-none rounded-xl border border-line-strong bg-surface py-2 pr-9 pl-3 text-sm text-ink hover:border-ink-3"
        >
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {groups?.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-3 transition-[color,translate] duration-300 peer-hover:text-ink peer-focus:text-accent"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

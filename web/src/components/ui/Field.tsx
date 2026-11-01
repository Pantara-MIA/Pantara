import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const control =
  'field-control w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 hover:border-ink-3 disabled:bg-surface-muted';

function Label({ id, label, hint, required }: { id: string; label: string; hint?: ReactNode; required?: boolean }) {
  return (
    <span className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-xs font-semibold text-ink-2">
        {label}
        {required && <span className="text-critical-ink"> *</span>}
      </label>
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </span>
  );
}

/** Labelled text/number/date input. */
export function TextField({
  label,
  hint,
  suffix,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; suffix?: string }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label id={id} label={label} hint={hint} required={rest.required} />
      <div className="relative">
        <input id={id} className={`${control} ${suffix ? 'pr-14' : ''}`} {...rest} />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">{suffix}</span>}
      </div>
    </div>
  );
}

export function TextArea({
  label,
  hint,
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label id={id} label={label} hint={hint} required={rest.required} />
      <textarea id={id} rows={3} className={control} {...rest} />
    </div>
  );
}

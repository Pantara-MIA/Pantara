import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Modal dialog on the native <dialog> element: focus trap, Esc to close and
 * backdrop come from the browser. Used for forms and confirmations.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-[#0D3311]/40 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <div className="mt-0.5 text-sm text-ink-2">{description}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-full p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </header>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

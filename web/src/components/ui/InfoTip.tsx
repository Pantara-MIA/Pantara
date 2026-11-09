import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

const WIDTH = 272;

/** A heading text followed by its ⓘ. */
export function TitleWithInfo({ text, info }: { text: string; info: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {text}
      <InfoTip label={text}>{info}</InfoTip>
    </span>
  );
}

/**
 * Small ⓘ that explains a figure in a sentence or two. Opens on hover or
 * keyboard focus, toggles on tap; Esc, an outside tap or scrolling closes it.
 * Rendered in a portal so cards and animated parents never clip it.
 */
export function InfoTip({ children, label, inverse = false }: { children: ReactNode; label: string; /** For dark surfaces. */ inverse?: boolean }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const pinned = useRef(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(WIDTH, window.innerWidth - 16);
    const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, 8), window.innerWidth - width - 8);
    const above = r.bottom + 160 > window.innerHeight && r.top > 160;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left, width, above });
  };
  const hide = () => {
    pinned.current = false;
    setPos(null);
  };

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    const onDown = (e: PointerEvent) => !btn.current?.contains(e.target as Node) && hide();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('resize', hide);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`Penjelasan: ${label}`}
        aria-describedby={pos ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={() => !pinned.current && setPos(null)}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          if (pos && pinned.current) hide();
          else {
            pinned.current = true;
            show();
          }
        }}
        className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded-full align-middle transition-colors ${inverse ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-ink-3 hover:bg-surface-muted hover:text-accent'}`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="anim-pop-in pointer-events-none fixed z-60 rounded-xl bg-ink px-3 py-2 text-xs leading-relaxed font-normal text-white shadow-[0_18px_40px_-16px_rgba(13,51,17,0.7)]"
            style={{ top: pos.top, left: pos.left, width: pos.width, translate: pos.above ? '0 -100%' : undefined }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

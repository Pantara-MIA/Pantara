/**
 * One pointer listener for the whole app: the `.spotlight` surface under the
 * cursor gets --mx/--my so its glow follows the pointer (see index.css).
 */
export function installSpotlight() {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return () => {};
  let frame = 0;
  let last: PointerEvent | null = null;
  const apply = () => {
    frame = 0;
    const el = (last?.target as Element | null)?.closest?.<HTMLElement>('.spotlight');
    if (!el || !last) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${last.clientX - r.left}px`);
    el.style.setProperty('--my', `${last.clientY - r.top}px`);
  };
  const onMove = (e: PointerEvent) => {
    last = e;
    if (!frame) frame = requestAnimationFrame(apply);
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    window.removeEventListener('pointermove', onMove);
    cancelAnimationFrame(frame);
  };
}

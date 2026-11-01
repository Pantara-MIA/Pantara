import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * True once the element has scrolled into view (and stays true). Without
 * IntersectionObserver, or with reduced motion, it is true immediately so
 * content is never left hidden.
 */
export function useInView<T extends Element>(options: IntersectionObserverInit = { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined' || prefersReducedMotion());

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        io.disconnect();
      }
    }, options);
    io.observe(el);
    return () => io.disconnect();
    // Options are static per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  return { ref, inView };
}

/** For surfaces of any height: reveal as soon as their top edge is on screen. */
export const SURFACE_IN_VIEW: IntersectionObserverInit = { threshold: 0, rootMargin: '0px 0px -40px 0px' };

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Tweens a number toward `target` whenever it changes (for live simulators). */
export function useAnimatedNumber(target: number, duration = 650) {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  const still = prefersReducedMotion() || !Number.isFinite(target);

  useEffect(() => {
    if (still) {
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = origin + (target - origin) * easeOutCubic(t);
      setValue(v);
      from.current = v;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, still]);

  return still ? target : value;
}

/**
 * Position of a sliding indicator under the active child of `container`
 * (matched by `activeSelector`); re-measured on resize and whenever `key`
 * changes. Hidden until the first measurement so it never flies in from 0.
 */
export function useSlidingIndicator<T extends HTMLElement>(activeSelector: string, key: unknown) {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>(activeSelector);
    if (!el || !active) {
      setBox(null);
      return;
    }
    setBox({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight });
  }, [activeSelector]);

  useLayoutEffect(measure, [measure, key]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  const style: CSSProperties = box
    ? { width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)`, top: 0, left: 0, opacity: 1 }
    : { opacity: 0, top: 0, left: 0 };
  return [ref, style] as const;
}

/** 0–1 scroll progress of the page, written straight to an element's transform. */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (ref.current) ref.current.style.transform = `scaleX(${p})`;
      setScrolled(window.scrollY > 8);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return [ref, scrolled] as const;
}

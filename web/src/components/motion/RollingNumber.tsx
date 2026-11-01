import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './hooks';

const SPINS = 2;

/**
 * Odometer: every digit spins through 0–9 a couple of times and lands on its
 * value, left to right. Plays once per mount; key the parent to replay it.
 * Non-digits (",", "%", " dari ") stay put; screen readers get the plain text.
 */
export function RollingNumber({ text }: { text: string }) {
  const [rolled, setRolled] = useState(false);

  useEffect(() => {
    let inner = 0;
    // Two frames: the first paints the start position, the second triggers the transition.
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setRolled(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  if (prefersReducedMotion()) return <>{text}</>;

  let digitIndex = 0;
  return (
    <span className="tabular-nums">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex whitespace-pre">
        {[...text].map((ch, i) =>
          /\d/.test(ch) ? <Digit key={i} value={Number(ch)} rolled={rolled} delay={digitIndex++ * 80} /> : <span key={i}>{ch}</span>,
        )}
      </span>
    </span>
  );
}

function Digit({ value, rolled, delay }: { value: number; rolled: boolean; delay: number }) {
  const stack = Array.from({ length: SPINS * 10 + value + 1 }, (_, n) => n % 10);
  const target = rolled ? stack.length - 1 : 0;
  return (
    <span className="relative inline-block overflow-hidden">
      <span className="invisible">{value}</span>
      <span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translateY(${(-target * 100) / stack.length}%)`,
          transition: `transform 1.1s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        }}
      >
        {stack.map((d, n) => (
          <span key={n}>{d}</span>
        ))}
      </span>
    </span>
  );
}

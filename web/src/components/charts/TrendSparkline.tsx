import { CHART } from './theme';

/**
 * Micro trend line for stat tiles: history in a de-emphasis gray, the current
 * point marked in the accent. Decorative — the tile states the value in text.
 */
export function TrendSparkline({ values, width = 120, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), height - pad - ((v - min) / span) * (height - pad * 2)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={CHART.axis} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="4" fill={CHART.series1} stroke={CHART.surface} strokeWidth="2" />
    </svg>
  );
}

/**
 * Chart colors as literal hex for SVG attributes (Recharts). Mirrors the
 * tokens in src/index.css — change both together.
 */
export const CHART = {
  surface: '#ffffff',
  ink: '#0d3311',
  ink2: '#4b6149',
  ink3: '#5b6f59',
  grid: '#e6f0e7',
  axis: '#c3dcc5',
  series1: '#2e7d32',
  series2: '#d08a1e',
  series3: '#2a78d6',
} as const;

/** Shared axis tick style: muted ink, tabular figures so ticks align. */
export const AXIS_TICK = { fill: CHART.ink3, fontSize: 11, fontVariantNumeric: 'tabular-nums' } as const;

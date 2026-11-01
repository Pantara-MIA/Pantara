import { GeoMap } from '../charts/GeoMap';
import { AboveCountLegend, ComplianceLegend, GradeScaleLegend, RainLegend, StatusLegend } from '../charts/ScaleLegend';
import { LEVEL_META, RAIN_CLASS_LABEL, rainBin } from '../../lib/climate';
import type { ProvinceClimate } from '../../lib/climate';
import { Placeholder } from '../ui/Feedback';
import { memberNoun } from '../../lib/regional';
import type { RegionAlert, Region, Scope, ScorecardRow } from '../../lib/regional';
import { useGeo } from '../../lib/geo';
import { GRADE_META, STATUS_META, aboveCountBin, complianceBin } from '../../lib/scorecard';
import { formatIDR, formatNumber, formatPct } from '../../lib/format';

export type MapMode = 'grade' | 'compliance' | 'alert' | 'climate';

const MAP_TITLE: Record<MapMode, string> = {
  grade: 'Peta predikat stabilitas harga',
  compliance: 'Peta kepatuhan HET/HAP',
  alert: 'Peta peringatan dini harga',
  climate: 'Peta curah hujan 90 hari terhadap normal',
};

/**
 * Choropleth of one scope for the scorecard: colors regions by grade, by the
 * early-warning status of one commodity, or — across all commodities — by how
 * many commodities are above their reference (a worst-status summary would
 * paint almost every region red and say nothing).
 */
export function RegionMap({
  scope,
  mode,
  regions,
  rows,
  alerts,
  singleCommodity,
  selectedId,
  onSelect,
  climate,
}: {
  climate?: Map<string, ProvinceClimate>;
  scope: Scope;
  mode: MapMode;
  regions: Region[];
  rows: Map<string, ScorecardRow>;
  alerts: Map<string, RegionAlert>;
  /** Whether alerts are for one commodity (prices shown) or a summary of all. */
  singleCommodity: boolean;
  selectedId?: string;
  onSelect: (r: Region) => void;
}) {
  const geo = useGeo(scope.id);
  const where = `${memberNoun(scope)} ${scope.name}`;
  if (!geo) return <Placeholder className="aspect-[2/1] w-full" />;
  return (
    <div className="space-y-4">
      <GeoMap
        geo={geo}
        label={`${MAP_TITLE[mode]} ${where}`}
        hint={(r) => (r.child_scope ? 'Punya rincian kabupaten/kota' : undefined)}
        regions={regions}
        selectedId={selectedId}
        onSelect={onSelect}
        valueOf={(r) => {
          const row = rows.get(r.id);
          if (mode === 'climate') {
            const c = climate?.get(r.id);
            if (!c) return null;
            return {
              fill: rainBin(c.rain90_pct).fill,
              description: `hujan 90 hari ${formatNumber(c.rain90_pct, 0)}% dari normal, ${LEVEL_META[c.level].label.toLowerCase()}`,
              details: [
                { label: 'Hujan 90 hari', value: `${formatNumber(c.rain90_pct, 0)}% · ${RAIN_CLASS_LABEL[c.rain90_class]}` },
                { label: 'Hujan 30 hari', value: `${formatNumber(c.rain30_pct, 0)}%` },
                { label: 'Risiko', value: LEVEL_META[c.level].label.replace('Risiko iklim ', '') },
              ],
            };
          }
          if (mode === 'compliance') {
            if (!row || row.compliance === null) return null;
            return {
              fill: complianceBin(row.compliance).fill,
              description: `${formatPct(row.compliance)} hari-komoditas pada atau di bawah HET/HAP`,
              details: [
                { label: 'Patuh HET/HAP', value: formatPct(row.compliance) },
                { label: 'Komoditas pernah melampaui', value: String(row.ceiling_breached) },
                { label: 'Hari di atas HET/HAP', value: String(row.days_above_ceiling_total) },
              ],
            };
          }
          if (mode === 'grade') {
            if (!row) return null;
            return {
              fill: GRADE_META[row.grade].fill,
              description: `predikat ${row.grade} (${GRADE_META[row.grade].label}), skor ${formatNumber(row.score)}, peringkat ${row.rank}`,
              details: [
                { label: 'Predikat', value: `${row.grade} · ${GRADE_META[row.grade].label}` },
                { label: 'Skor', value: formatNumber(row.score) },
                { label: 'Peringkat', value: `${row.rank} dari ${rows.size}` },
              ],
            };
          }
          const a = alerts.get(r.id);
          if (!a || a.status === 'no_data') return null;
          const sm = STATUS_META[a.status];
          const details = singleCommodity
            ? [
                { label: 'Status', value: sm.label },
                { label: 'Harga hari ini', value: formatIDR(a.current_price ?? 0) },
                { label: 'Acuan', value: formatIDR(a.reference ?? 0) },
                { label: 'Peluang lampaui (14 hari)', value: formatPct(a.max_breach_prob * 100, 0) },
              ]
            : [
                { label: 'Komoditas di atas acuan', value: String(a.above_count) },
                { label: 'Komoditas waspada', value: String(a.watch_count) },
              ];
          return {
            fill: singleCommodity ? sm.mapFill : aboveCountBin(a.above_count).fill,
            description: singleCommodity
              ? `${sm.label}, peluang lampaui acuan ${formatPct(a.max_breach_prob * 100, 0)}`
              : `${a.above_count} komoditas di atas acuan, ${a.watch_count} waspada`,
            details,
          };
        }}
      />
      {mode === 'grade' ? <GradeScaleLegend /> : mode === 'compliance' ? <ComplianceLegend /> : mode === 'climate' ? <RainLegend /> : singleCommodity ? <StatusLegend map /> : <AboveCountLegend />}
    </div>
  );
}

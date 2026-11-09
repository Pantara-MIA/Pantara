import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Verdict } from '../../components/ui/Badge';
import type { VerdictTone } from '../../components/ui/Badge';
import { TitleWithInfo } from '../../components/ui/InfoTip';
import type { SubstitutionDetail } from '../../lib/api';
import { formatIDR, formatNumber } from '../../lib/format';
import { DecisionBanner, NoData } from './shared';
import type { MsmeTabProps } from './shared';

function variantVerdict(c: { active: boolean; detail?: SubstitutionDetail }): { label: string; tone: VerdictTone } {
  if (c.active) return { label: 'Layak diganti', tone: 'good' };
  if ((c.detail?.diff_per_kg ?? 0) > 0) return { label: 'Selisih masih biasa', tone: 'neutral' };
  return { label: 'Tidak lebih murah', tone: 'neutral' };
}

function variantGap(detail: SubstitutionDetail) {
  const diff = detail.diff_per_kg;
  if (Math.abs(diff) < 1) return `${formatIDR(detail.alt_price)}/kg · harga sama`;
  return `${formatIDR(detail.alt_price)}/kg · ${diff > 0 ? 'lebih murah' : 'lebih mahal'} ${formatIDR(Math.abs(diff))}`;
}

/** "Should I switch to another variant today?" */
export default function SubstitutionTab({ data, loading, commodity }: MsmeTabProps) {
  if (!data) return <NoData loading={loading} />;
  const active = data.substitution ?? null;
  const candidates = data.substitution_candidates ?? [];
  const name = commodity.toLowerCase();

  return (
    <div className="space-y-6">
      {active ? (
        <DecisionBanner
          tone="good"
          verdict="Ada pengganti lebih murah"
          title={`Ganti sebagian ${name} dengan ${active.recommendation.toLowerCase()}`}
          info={`Harga ${name} sedang jauh lebih mahal dari biasanya dibanding varian ini. Hanya varian setara mutu yang disarankan.`}
          action={`Beli ${active.recommendation.toLowerCase()} untuk sebagian kebutuhan hari ini.`}
        >
          Hemat hingga <strong>{formatIDR(active.savings)}</strong> bila seluruh {formatNumber(active.kg_used, 1)} kg diganti.
        </DecisionBanner>
      ) : (
        <DecisionBanner
          tone={candidates.length > 0 ? 'good' : 'neutral'}
          verdict="Tidak perlu ganti"
          title={`Tetap pakai ${name}`}
          info="Pengganti hanya disarankan bila varian setara mutu sedang jauh lebih murah dari biasanya."
          action={candidates.length > 0 ? 'Belanja bahan yang biasa Anda pakai.' : undefined}
        >
          {candidates.length > 0 ? 'Belum ada varian setara yang harganya jauh lebih murah dari biasanya.' : 'Belum ada varian setara yang dipantau untuk bahan ini.'}
        </DecisionBanner>
      )}

      {candidates.length > 0 && (
        <Card>
          <CardHeader
            title={
              <TitleWithInfo
                text="Varian setara hari ini"
                info={`Harga tiap varian dibanding ${name}. "Layak diganti" hanya muncul bila selisihnya jauh lebih besar dari kebiasaan 90 hari terakhir.`}
              />
            }
          />
          <CardBody className="pt-2">
            <ul className="divide-y divide-line">
              {candidates.map((c) => (
                <li key={c.commodity} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{c.commodity}</span>
                    {c.detail && <span className="block text-sm text-ink-2">{variantGap(c.detail)}</span>}
                  </span>
                  <Verdict {...variantVerdict(c)} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

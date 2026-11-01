import { useSearchParams } from 'react-router-dom';
import { Download, Eye, FileCheck2, Scale } from 'lucide-react';
import { SiteShell, PageHeader } from '../../components/layout/SiteShell';
import { Card } from '../../components/ui/Card';
import { NativeSelect } from '../../components/ui/NativeSelect';
import { EmptyState, ErrorState, Placeholder } from '../../components/ui/Feedback';
import { InterventionCard } from '../../components/interventions/InterventionCard';
import { exportUrl, fetchPublicInterventions } from '../../lib/interventions';
import { fetchAllScopes, regionGroups } from '../../lib/regional';
import { commodityGroups } from '../../lib/scorecard';
import { useApi } from '../../lib/useApi';
import { Reveal } from '../../components/motion/Reveal';

const ALL = 'semua';

/** Public log of published government interventions with their indicative impact. */
export default function InterventionsFeed() {
  const [params, setParams] = useSearchParams();
  const region = params.get('daerah') ?? ALL;
  const commodity = params.get('komoditas') ?? ALL;
  const meta = useApi((s) => fetchAllScopes(s), []);
  const list = useApi(
    (s) => fetchPublicInterventions({ region: region === ALL ? undefined : region, commodity: commodity === ALL ? undefined : commodity }, s),
    [region, commodity],
  );

  const set = (key: string, v: string) =>
    setParams(
      (p) => {
        if (v === ALL) p.delete(key);
        else p.set(key, v);
        return p;
      },
      { replace: true },
    );

  const steps = [
    { icon: Eye, title: 'Prakiraan terbuka', body: 'Pemerintah melihat prakiraan dan peringatan dini yang sama dengan publik.' },
    { icon: FileCheck2, title: 'Keputusan tercatat', body: 'Setiap intervensi menyimpan harga, acuan, dan prakiraan saat keputusan diambil.' },
    { icon: Scale, title: 'Hasil dapat dinilai', body: 'Harga sesudahnya dibandingkan dengan prakiraan tersebut dan daerah tetangga.' },
  ];

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Transparansi kebijakan"
        title="Intervensi Pengendalian Harga"
        description="Daftar intervensi yang dipublikasikan pemerintah daerah — apa yang dilakukan, atas dasar data apa, dan bagaimana harga bergerak sesudahnya."
        actions={
          <a href={exportUrl.interventions()} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-muted">
            <Download className="h-4 w-4" /> Unduh CSV
          </a>
        }
      />

      <ol className="mb-6 grid gap-3 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">
                {i + 1}. {title}
              </span>
              <span className="block text-xs text-ink-2">{body}</span>
            </span>
          </li>
        ))}
      </ol>

      {meta.data && (
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <NativeSelect
            label="Daerah"
            value={region}
            onChange={(v) => set('daerah', v)}
            options={[{ value: ALL, label: 'Semua daerah' }]}
            groups={regionGroups(meta.data)}
          />
          <NativeSelect
            label="Komoditas"
            value={commodity}
            onChange={(v) => set('komoditas', v)}
            options={[{ value: ALL, label: 'Semua komoditas' }]}
            groups={commodityGroups(meta.data[0].commodities)}
            className="min-w-60"
          />
        </div>
      )}

      {list.error ? (
        <Card>
          <ErrorState message={list.error} onRetry={list.reload} />
        </Card>
      ) : !list.data ? (
        <Placeholder className="h-64" />
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada intervensi yang dipublikasikan">
            Intervensi akan muncul di sini setelah pemerintah daerah mencatat dan mempublikasikannya.
          </EmptyState>
        </Card>
      ) : (
        <div className={`space-y-4 transition-opacity ${list.loading ? 'opacity-60' : ''}`}>
          {list.data.map((it) => (
            <Reveal key={it.id}>
              <InterventionCard it={it} />
            </Reveal>
          ))}
        </div>
      )}
    </SiteShell>
  );
}

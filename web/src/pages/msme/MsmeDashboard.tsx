import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, FlaskConical, Radar, RefreshCw, ShoppingBasket, Shuffle, Store } from 'lucide-react';
import { SiteShell, PageHeader } from '../../components/layout/SiteShell';
import { Tabs } from '../../components/ui/Tabs';
import { NativeSelect } from '../../components/ui/NativeSelect';
import { TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { ErrorState, Placeholder } from '../../components/ui/Feedback';
import { auth } from '../../lib/auth';
import { fetchProcurementCard } from '../../lib/api';
import type { ProcurementResponse } from '../../lib/api';
import { normalizeProfile, shelfLifeOf } from '../../lib/profile';
import type { MsmeProfile } from '../../lib/profile';
import RecommendationTab from './RecommendationTab';
import RadarTab from './RadarTab';
import SubstitutionTab from './SubstitutionTab';
import WasteTab from './WasteTab';
import ProfileTab from './ProfileTab';


type Tab = 'rekomendasi' | 'radar' | 'substitusi' | 'susut' | 'profil';

const TABS = [
  { value: 'rekomendasi' as Tab, label: 'Rekomendasi belanja', icon: ShoppingBasket },
  { value: 'radar' as Tab, label: 'Radar harga & anggaran', icon: Radar },
  { value: 'substitusi' as Tab, label: 'Sinyal substitusi', icon: Shuffle },
  { value: 'susut' as Tab, label: 'Simulasi susut', icon: FlaskConical },
  { value: 'profil' as Tab, label: 'Profil usaha', icon: Store },
];

/** MSME workspace: one decision per tab, computed from the business profile. */
export default function MsmeDashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.value === params.get('menu')) ? (params.get('menu') as Tab) : 'rekomendasi';

  const [profile, setProfile] = useState<MsmeProfile | null>(null);
  const [data, setData] = useState<ProcurementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // '' = the latest day with data; the server reports the range it has.
  const [asOf, setAsOf] = useState('');
  const [commodity, setCommodity] = useState('');

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      navigate('/login');
      return;
    }
    // A failed session never falls back to a default profile: back to sign-in.
    auth
      .fetchAuth('/auth/me')
      .then((prof) => {
        if (prof?.role === 'government') {
          navigate(auth.homeFor('government'), { replace: true });
          return;
        }
        setProfile(normalizeProfile(prof));
      })
      .catch(() => {
        auth.clearToken();
        navigate('/login');
      });
  }, [navigate]);

  // The active commodity always comes from the business's own list.
  const activeCommodity = profile && profile.commodities.some((c) => c.name === commodity) ? commodity : (profile?.commodities[0]?.name ?? '');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!profile || !activeCommodity) return;
      setLoading(true);
      setError('');
      try {
        const usage = profile.commodities.find((c) => c.name === activeCommodity)?.weekly_consumption_kg ?? 10;
        setData(
          await fetchProcurementCard(
            {
              commodity: activeCommodity,
              region_id: profile.region_id,
              weekly_usage_kg: usage,
              daily_decay_rate: profile.daily_decay_rate,
              shelf_life_days: shelfLifeOf(profile.storage_method),
              as_of: asOf,
            },
            signal,
          ),
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [profile, activeCommodity, asOf],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        if (t === 'rekomendasi') p.delete('menu');
        else p.set('menu', t);
        return p;
      },
      { replace: true },
    );

  if (!profile) {
    return (
      <SiteShell>
        <Placeholder className="h-[600px]" />
      </SiteShell>
    );
  }

  const effectiveAsOf = data?.as_of ?? asOf;
  const tabProps = { profile, data, loading, commodity: activeCommodity, asOf: effectiveAsOf };

  return (
    <SiteShell>
      <PageHeader
        eyebrow={`Ruang kerja UMKM · ${profile.fnb_category}`}
        title={profile.business_name}
        actions={
          tab !== 'profil' && (
            <>
              <NativeSelect
                label="Komoditas"
                value={activeCommodity}
                onChange={setCommodity}
                options={profile.commodities.map((c) => ({ value: c.name, label: `${c.name} · ${c.weekly_consumption_kg.toLocaleString('id-ID')} kg/mg` }))}
              />
              <TextField label="Tanggal data" type="date" min={data?.date_range.start} max={data?.date_range.end} value={effectiveAsOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
              <Button variant="secondary" onClick={() => load()} disabled={loading} aria-label="Muat ulang">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </>
          )
        }
      />

      <Tabs<Tab> label="Menu UMKM" idPrefix="msme" items={TABS} value={tab} onChange={setTab} />

      <div key={tab} role="tabpanel" id={`msme-panel-${tab}`} aria-labelledby={`msme-tab-${tab}`} className={`anim-rise pt-6 transition-opacity ${loading && data ? 'opacity-60' : ''}`}>
        {error && tab !== 'profil' ? (
          <ErrorState message={`${error} Pastikan server Pantara berjalan.`} onRetry={() => load()} />
        ) : (
          <>
            {tab === 'rekomendasi' && <RecommendationTab {...tabProps} />}
            {tab === 'radar' && <RadarTab {...tabProps} />}
            {tab === 'substitusi' && <SubstitutionTab {...tabProps} onPickDate={setAsOf} />}
            {tab === 'susut' && <WasteTab key={`${activeCommodity}|${data?.current_price}`} {...tabProps} />}
            {tab === 'profil' && <ProfileTab profile={profile} onChange={setProfile} />}
          </>
        )}
      </div>

      <p className="mt-10 flex items-center gap-2 text-sm text-ink-2">
        <BookOpen className="h-4 w-4 text-ink-3" aria-hidden="true" />
        Ingin tahu cara angka-angka ini dihitung?{' '}
        <Link to="/metodologi#umkm" className="font-semibold text-accent hover:underline">
          Baca metodologi
        </Link>
      </p>
    </SiteShell>
  );
}

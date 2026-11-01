import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Eye, EyeOff, Landmark, Loader2, Minus, Plus, Search, ShieldCheck, ShoppingBasket, Store } from 'lucide-react';
import { auth } from '../lib/auth';
import { fetchMetadata } from '../lib/api';
import type { MetadataResponse } from '../lib/api';
import { COMMODITIES } from '../data/commodities';
import { BrandWordmark } from '../components/layout/BrandMark';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { NativeSelect } from '../components/ui/NativeSelect';
import { TextField } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Notice } from '../components/ui/Feedback';
import { RegionPicker } from '../components/regional/RegionPicker';
import { DEFAULT_MSME_REGION } from '../lib/profile';

type Mode = 'login' | 'register';

const STEPS = [
  { num: 1, title: 'Akun', heading: 'Buat akun usaha', sub: 'Email dan sandi untuk masuk ke dashboard UMKM.' },
  { num: 2, title: 'Profil', heading: 'Profil usaha', sub: 'Kategori dan pasar acuan menentukan harga yang dipakai mesin keputusan.' },
  { num: 3, title: 'Operasional', heading: 'Detail operasional', sub: 'Pemakaian mingguan dan cara simpan menentukan berapa kilogram yang aman dibeli.' },
] as const;

interface CommodityUse {
  name: string;
  weekly_consumption_kg: number;
}

/** Simple password score: length and character variety, no extra library. */
function passwordStrength(pw: string) {
  if (!pw) return { score: 0, label: 'Belum diisi', cls: 'bg-line' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const table = [
    { label: 'Terlalu pendek', cls: 'bg-critical' },
    { label: 'Lemah', cls: 'bg-critical' },
    { label: 'Cukup', cls: 'bg-warning' },
    { label: 'Baik', cls: 'bg-leaf' },
    { label: 'Kuat', cls: 'bg-good' },
    { label: 'Sangat kuat', cls: 'bg-accent' },
  ];
  return { score, ...table[score] };
}

/** Sign-in for every role, and the three-step MSME registration. */
export default function Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('komoditas') ? 'register' : 'login');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [fnbCategory, setFnbCategory] = useState('');
  const [referenceMarket, setReferenceMarket] = useState('');
  const [regionId, setRegionId] = useState(DEFAULT_MSME_REGION);
  const [storageMethod, setStorageMethod] = useState('');
  const [commodities, setCommodities] = useState<CommodityUse[]>([]);
  const [commodityQuery, setCommodityQuery] = useState('');
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);

  useEffect(() => {
    fetchMetadata()
      .then((res) => {
        setMetadata(res);
        if (res.categories.length) setFnbCategory(res.categories[0].name);
        if (res.markets.length) setReferenceMarket(res.markets[0].name);
        // Prefill from the simulator's "lock parameters" link when it matches master data.
        const fromSim = COMMODITIES.find((c) => c.id === params.get('komoditas'));
        const match = fromSim && res.commodities.find((m) => m.name.toLowerCase() === fromSim.name.toLowerCase());
        if (match) setCommodities([{ name: match.name, weekly_consumption_kg: Math.max(0.5, Number(params.get('kg')) || 5) }]);
        const storage = params.get('simpan');
        setStorageMethod(res.storage_methods.some((s) => s.id === storage) ? storage! : (res.storage_methods[0]?.id ?? ''));
      })
      .catch(() => setError('Data master gagal dimuat. Pastikan server Pantara berjalan.'));
  }, [params]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep(1);
    setError('');
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { token, role } = await auth.fetchAuth('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      auth.setToken(token);
      auth.setRole(role);
      navigate(auth.homeFor(role));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { token } = await auth.fetchAuth('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          business_name: businessName,
          fnb_category: fnbCategory,
          reference_market: referenceMarket,
          region_id: regionId,
          commodities: commodities.length > 0 ? commodities : metadata?.commodities.length ? [{ name: metadata.commodities[0].name, weekly_consumption_kg: 5 }] : [],
          storage_method: storageMethod,
        }),
      });
      auth.setToken(token);
      auth.setRole('msme');
      setSuccess('Registrasi berhasil! Anda akan dialihkan…');
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCommodity = (name: string) =>
    setCommodities((prev) => (prev.some((x) => x.name === name) ? prev.filter((x) => x.name !== name) : [...prev, { name, weekly_consumption_kg: 5 }]));

  const setVolume = (name: string, value: number) =>
    setCommodities((prev) => prev.map((x) => (x.name === name ? { ...x, weekly_consumption_kg: Math.max(0.1, Number(value.toFixed(1))) } : x)));

  const visibleCommodities = useMemo(() => {
    const q = commodityQuery.trim().toLowerCase();
    const all = metadata?.commodities ?? [];
    return q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
  }, [metadata, commodityQuery]);

  const strength = passwordStrength(password);
  const totalKg = commodities.reduce((a, c) => a + (Number(c.weekly_consumption_kg) || 0), 0);
  const current = STEPS[step - 1];

  return (
    <div className="civic min-h-screen lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <aside className="relative hidden overflow-hidden bg-[#0D3311] p-10 text-white lg:flex lg:flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="anim-drift absolute -top-24 -left-20 h-80 w-80 rounded-full bg-[#2E7D32]/45 blur-3xl" />
          <span className="anim-drift-slow absolute -right-24 -bottom-20 h-96 w-96 rounded-full bg-gold/20 blur-3xl" />
          <span className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-size-[44px_44px] mask-[radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        </div>
        <Link to="/" aria-label="Pantara — beranda" className="relative transition-transform duration-300 hover:scale-[1.02]">
          <BrandWordmark onDark />
        </Link>
        <div className="relative my-auto max-w-md">
          <h1 key={mode} className="anim-rise font-display text-4xl leading-tight font-bold">
            {mode === 'login' ? 'Selamat datang kembali.' : 'Belanja bahan dengan angka, bukan tebakan.'}
          </h1>
          <ul className="mt-8 space-y-4">
            {[
              { icon: ShoppingBasket, title: 'Satu angka yang bisa dieksekusi', body: 'Berapa kilogram yang dibeli hari ini — bukan sekadar grafik harga.' },
              { icon: ShieldCheck, title: 'Setiap angka bisa ditelusuri', body: 'Rumus, sumber, dan asumsi terbuka di setiap kartu dashboard.' },
              { icon: Landmark, title: 'Akun pemerintah daerah', body: 'Dibuat oleh admin Pantara. Masuk dengan email dinas di formulir yang sama.' },
            ].map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                className="spotlight spotlight-dark anim-rise group -mx-3 flex gap-3 rounded-2xl px-3 py-2 transition-colors duration-300 hover:bg-white/5"
                style={{ '--rise-delay': `${200 + i * 110}ms` } as CSSProperties}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-gold transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-[#C8E6C9]">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          {mode === 'register' && (
            <dl className="anim-rise mt-10 grid grid-cols-2 gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm backdrop-blur-sm">
              <div>
                <dt className="text-[#8FBF8F]">Usaha</dt>
                <dd className="font-semibold">{businessName || '—'}</dd>
              </div>
              <div>
                <dt className="text-[#8FBF8F]">Kategori</dt>
                <dd className="font-semibold">{fnbCategory || '—'}</dd>
              </div>
              <div>
                <dt className="text-[#8FBF8F]">Komoditas rutin</dt>
                <dd className="font-semibold">
                  {commodities.length} · {totalKg.toLocaleString('id-ID')} kg/minggu
                </dd>
              </div>
              <div>
                <dt className="text-[#8FBF8F]">Metode simpan</dt>
                <dd className="font-semibold">{metadata?.storage_methods.find((s) => s.id === storageMethod)?.short_label ?? '—'}</dd>
              </div>
            </dl>
          )}
        </div>
      </aside>

      <main className="flex min-h-screen flex-col px-4 py-8 sm:px-8">
        <div className="mb-8 flex items-center justify-between lg:hidden">
          <Link to="/" aria-label="Pantara — beranda">
            <BrandWordmark />
          </Link>
        </div>

        <div className="anim-rise mx-auto my-auto w-full max-w-lg">
          <SegmentedControl
            label="Masuk atau daftar"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'login', label: 'Masuk' },
              { value: 'register', label: 'Daftar usaha' },
            ]}
          />

          <div className="mt-6 rounded-3xl border border-line bg-surface p-6 shadow-[0_30px_60px_-40px_rgba(13,51,17,0.5)] transition-shadow duration-500 focus-within:shadow-[0_34px_70px_-38px_rgba(13,51,17,0.6)] sm:p-8">
            {mode === 'login' ? (
              <form key="login" onSubmit={handleLogin} className="anim-rise space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-ink">Masuk ke Pantara</h2>
                  <p className="mt-1 text-sm text-ink-2">Untuk UMKM dan pemerintah daerah — Anda akan diarahkan ke dashboard yang sesuai.</p>
                </div>
                <TextField label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@usaha.com" />
                <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((v) => !v)} autoComplete="current-password" />
                {error && <Notice tone="warning">{error}</Notice>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />} Masuk
                </Button>
                <p className="text-center text-sm text-ink-2">
                  Belum punya akun usaha?{' '}
                  <button type="button" onClick={() => switchMode('register')} className="font-semibold text-accent hover:underline">
                    Daftar sekarang
                  </button>
                </p>
              </form>
            ) : (
              <form key="register" onSubmit={handleRegister} className="anim-rise space-y-5">
                <Stepper step={step} onGoTo={setStep} />
                <div key={`heading-${step}`} className="anim-rise">
                  <h2 className="font-display text-2xl font-bold text-ink">{current.heading}</h2>
                  <p className="mt-1 text-sm text-ink-2">{current.sub}</p>
                </div>

                {step === 1 && (
                  <div className="anim-rise space-y-4">
                    <TextField label="Email pemilik usaha" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@usaha.com" />
                    <div>
                      <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((v) => !v)} autoComplete="new-password" minLength={6} />
                      <div className="mt-2 flex items-center gap-2" aria-live="polite">
                        <span className="flex flex-1 gap-1" aria-hidden="true">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength.score ? strength.cls : 'bg-line'}`} />
                          ))}
                        </span>
                        <span className="text-xs text-ink-3">{strength.label}</span>
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="anim-rise space-y-4">
                    <TextField label="Nama usaha / warung" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Cth: Ayam Geprek Bu Siti" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <NativeSelect label="Kategori F&B" value={fnbCategory} onChange={setFnbCategory} options={(metadata?.categories ?? []).map((c) => ({ value: c.name, label: c.name }))} />
                      <NativeSelect
                        label="Pasar acuan belanja"
                        value={referenceMarket}
                        onChange={setReferenceMarket}
                        options={(metadata?.markets ?? []).map((m) => ({ value: m.name, label: `${m.name}${m.region ? ` · ${m.region}` : ''}` }))}
                      />
                    </div>
                    <RegionPicker value={regionId} onChange={setRegionId} />
                    <p className="text-xs text-ink-3">Harga dan prakiraan untuk rekomendasi belanja diambil dari kabupaten/kota ini.</p>
                  </div>
                )}

                {step === 3 && (
                  <div className="anim-rise space-y-5">
                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-semibold text-ink-2">Kebutuhan rutin per komoditas</span>
                        <span className="text-xs text-ink-3">
                          {commodities.length} dipilih · {totalKg.toLocaleString('id-ID')} kg/minggu
                        </span>
                      </div>
                      <label className="relative mt-2 block">
                        <span className="sr-only">Cari komoditas</span>
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                        <input
                          value={commodityQuery}
                          onChange={(e) => setCommodityQuery(e.target.value)}
                          placeholder="Cari komoditas…"
                          className="w-full rounded-xl border border-line-strong bg-surface py-2 pr-3 pl-9 text-sm placeholder:text-ink-3"
                        />
                      </label>
                      <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                        {visibleCommodities.map((c) => {
                          const picked = commodities.find((x) => x.name === c.name);
                          return (
                            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                              <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
                                <input type="checkbox" checked={!!picked} onChange={() => toggleCommodity(c.name)} className="h-4 w-4 accent-[var(--color-accent)]" />
                                {c.name}
                              </label>
                              {picked && (
                                <span className="flex items-center gap-1">
                                  <button type="button" aria-label={`Kurangi ${c.name}`} onClick={() => setVolume(c.name, picked.weekly_consumption_kg - 0.5)} className="rounded-full p-1 text-ink-2 hover:bg-surface-muted">
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    aria-label={`Kebutuhan ${c.name} per minggu (kg)`}
                                    value={picked.weekly_consumption_kg}
                                    onChange={(e) => setVolume(c.name, Number(e.target.value))}
                                    className="w-16 rounded-lg border border-line-strong px-2 py-1 text-right text-sm tabular-nums"
                                  />
                                  <span className="text-xs text-ink-3">kg/mg</span>
                                  <button type="button" aria-label={`Tambah ${c.name}`} onClick={() => setVolume(c.name, picked.weekly_consumption_kg + 0.5)} className="rounded-full p-1 text-ink-2 hover:bg-surface-muted">
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <fieldset>
                      <legend className="text-xs font-semibold text-ink-2">Metode penyimpanan dapur</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {metadata?.storage_methods.map((sm) => {
                          const on = storageMethod === sm.id;
                          return (
                            <button
                              key={sm.id}
                              type="button"
                              onClick={() => setStorageMethod(sm.id)}
                              aria-pressed={on}
                              className={`rounded-xl border p-3 text-left ${on ? 'border-accent bg-accent-soft' : 'border-line hover:border-mint'}`}
                            >
                              <span className="flex items-center justify-between">
                                <span className="text-xl" aria-hidden="true">{sm.icon}</span>
                                {on && <Check className="h-4 w-4 text-accent" />}
                              </span>
                              <span className="mt-1 block text-sm font-semibold text-ink">{sm.short_label}</span>
                              <span className="block text-xs text-ink-3">
                                susut {(sm.daily_decay_rate * 100).toLocaleString('id-ID')}%/hari · {sm.shelf_life_days} hari
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                )}

                {error && <Notice tone="warning">{error}</Notice>}
                {success && <Notice>{success}</Notice>}
                <div className="flex gap-2">
                  {step > 1 && (
                    <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                      Kembali
                    </Button>
                  )}
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {step < 3 ? 'Lanjut' : (
                      <>
                        <Store className="h-4 w-4" /> Daftarkan usaha
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  minLength,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <div className="relative">
      <TextField label="Password" type={show ? 'text' : 'password'} required minLength={minLength} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Minimal 6 karakter" />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
        className="absolute right-2 bottom-1.5 rounded-full p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Stepper({ step, onGoTo }: { step: number; onGoTo: (n: number) => void }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Langkah pendaftaran">
      {STEPS.map((s) => {
        const done = s.num < step;
        const active = s.num === step;
        return (
          <li key={s.num} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!done}
              onClick={() => onGoTo(s.num)}
              aria-current={active ? 'step' : undefined}
              className="group flex items-center gap-2 text-sm disabled:cursor-default"
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-[background-color,color,box-shadow,scale] duration-300 ${
                  active
                    ? 'scale-110 bg-accent text-white shadow-[0_0_0_4px_rgba(102,187,106,0.25)]'
                    : done
                      ? 'bg-accent-soft text-accent group-hover:scale-110'
                      : 'bg-surface-muted text-ink-3'
                }`}
              >
                {done ? <Check className="anim-pop h-3.5 w-3.5" /> : s.num}
              </span>
              <span className={`hidden font-semibold transition-colors duration-300 sm:inline ${active ? 'text-ink' : 'text-ink-3'}`}>{s.title}</span>
            </button>
            {s.num < STEPS.length && (
              <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <span
                  className="absolute inset-0 origin-left rounded-full bg-accent transition-transform duration-500"
                  style={{ transform: `scaleX(${done ? 1 : 0})`, transitionTimingFunction: 'var(--ease-out-soft)' }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

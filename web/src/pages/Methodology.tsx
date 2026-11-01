import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SiteShell, PageHeader } from '../components/layout/SiteShell';
import { Card } from '../components/ui/Card';
import { GradeBadge, StatusBadge, Tag } from '../components/ui/Badge';
import { DataTable } from '../components/ui/DataTable';
import { Notice, Placeholder } from '../components/ui/Feedback';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { API_BASE } from '../lib/api';
import { fetchRegions } from '../lib/regional';
import type { RegionalCommodity } from '../lib/regional';
import { GRADES, GRADE_META, GRADE_THRESHOLDS, REFERENCE_TYPE_LABEL } from '../lib/scorecard';
import { formatDate, formatIDR, formatNumber, formatPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { Reveal } from '../components/motion/Reveal';
import { fetchClimate } from '../lib/climate';
import type { ClimateEffect } from '../lib/climate';

interface BacktestRow {
  commodity_id: string;
  horizon: number;
  samples: number;
  mase: number;
  coverage: number;
  band_width: number;
}

interface V2Row {
  level: 'province' | 'regency';
  commodity_id: string;
  horizon: number;
  samples: number;
  v2_pinball: number;
  fhs_pinball: number;
  v2_coverage: number;
  fhs_coverage: number;
  v2_mase: number;
  fhs_mase: number;
}

interface V2Report {
  selection: Record<string, Record<string, 'v2' | 'fhs'>>;
  metrics: Record<string, { test_start: string; test_end: string; rows: V2Row[] }>;
}

interface BacktestReport {
  scope: string;
  source: string;
  synthetic: boolean;
  from: string;
  to: string;
  step_days: number;
  regions: number;
  rows: BacktestRow[];
}

const SECTIONS = [
  { id: 'data', title: 'Sumber & status data' },
  { id: 'prakiraan', title: 'Prakiraan harga' },
  { id: 'akurasi', title: 'Akurasi prakiraan' },
  { id: 'acuan', title: 'Harga acuan' },
  { id: 'rapor', title: 'Rapor Daerah' },
  { id: 'peringatan', title: 'Peringatan dini' },
  { id: 'iklim', title: 'Risiko iklim' },
  { id: 'intervensi', title: 'Intervensi & evaluasi' },
  { id: 'perencanaan', title: 'Perencanaan operasi pasar' },
  { id: 'umkm', title: 'Rekomendasi UMKM' },
  { id: 'batasan', title: 'Batasan' },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Reveal as="section" className="scroll-mt-24">
      <span id={id} className="block scroll-mt-24" />
      <h2 className="mb-3 font-display text-2xl font-bold text-ink">{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed text-ink-2 sm:text-base">{children}</div>
    </Reveal>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink tabular-nums">{children}</div>;
}

/** Open methodology: every number on the site can be traced back to a rule here. */
export default function Methodology() {
  const meta = useApi((s) => fetchRegions({}, s), []);
  const reports = useApi(async (s) => {
    const res = await fetch(`${API_BASE}/api/v1/public/model-metrics`, { signal: s });
    if (!res.ok) throw new Error(`Server menjawab ${res.status}.`);
    return (await res.json()) as BacktestReport[];
  }, []);
  const [picked, setPicked] = useState<string>();
  const backtest = reports.data ? (reports.data.find((r) => r.scope === picked) ?? reports.data.find((r) => !r.synthetic) ?? reports.data[0]) : undefined;
  const commodityName = new Map(meta.data?.commodities.map((c) => [c.id, c.name]) ?? []);
  const scopeName = new Map(meta.data?.scopes.map((s) => [s.id, s.name]) ?? []);
  const range = meta.data ? `${formatDate(meta.data.date_range.start)} – ${formatDate(meta.data.date_range.end)}` : '';
  const national = meta.data?.scopes.find((s) => s.id === 'indonesia');
  const climate = useApi((s) => fetchClimate(undefined, s), []);
  const v2 = useApi(async (s) => {
    const res = await fetch(`${API_BASE}/api/v1/public/model-metrics/v2`, { signal: s });
    if (!res.ok) throw new Error(`Server menjawab ${res.status}.`);
    return (await res.json()) as V2Report;
  }, []);
  const [v2Level, setV2Level] = useState<'province' | 'regency'>('province');
  const v2Metrics = v2.data?.metrics[v2Level];

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Metode terbuka"
        title="Metodologi Pantara"
        description="Setiap angka di Pantara — prakiraan, skor rapor, peringatan, evaluasi intervensi, dan rencana anggaran — dapat ditelusuri ke aturan di halaman ini."
      />

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Daftar isi" className="lg:sticky lg:top-24 lg:self-start">
          <ol className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-full px-3 py-1.5 text-sm text-ink-2 hover:bg-accent-soft hover:text-accent lg:rounded-xl">
                  <span className="text-ink-3 tabular-nums">{i + 1}.</span> {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-12">
          <Section id="data" title="Sumber & status data">
            <p>
              Rapor bertingkat: <strong>34 provinsi</strong> dinilai dengan harga harian asli dari PIHPS Bank Indonesia, lalu setiap provinsi dapat dirinci ke
              kabupaten/kotanya — <strong>514 kabupaten/kota</strong> seluruhnya. PIHPS masih melaporkan empat provinsi baru di Papua (2022) di bawah Papua dan Papua Barat, sehingga peta memakai 34
              provinsi.
            </p>
            <Notice tone="warning" title="Sebagian kecil data kab/kota masih simulasi">
              Harga kabupaten/kota berasal dari SP2KP Kemendag. Seri harga dipakai bila dilaporkan pada sedikitnya separuh hari kerja; komoditas yang tidak
              dipantau di suatu kab/kota (atau terlalu jarang dilaporkan) diisi data simulasi yang mengikuti pola harga PIHPS provinsinya, dan diberi tanda{' '}
              <strong>Simulasi</strong> di rapor daerah. Laporan SP2KP yang menyimpang lebih dari 2,5× dari laporan di sekitarnya (salah input) dibuang.
            </Notice>
            <Card>
              <DataTable<[string, string, string, 'asli' | 'simulasi' | 'indikatif']>
                caption="Sumber data"
                rows={[
                  [
                    `Harga harian 34 provinsi × ${national?.commodities.length ?? 13} komoditas`,
                    'PIHPS Bank Indonesia — pasar tradisional, rata-rata provinsi. Hari tanpa laporan (akhir pekan, libur) memakai harga terakhir.',
                    range,
                    'asli',
                  ],
                  ['Harga harian 514 kab/kota × 18 komoditas', 'SP2KP Kemendag — rata-rata pasar per kab/kota', range, 'asli'],
                  ['Seri kab/kota yang tidak dipantau SP2KP (termasuk ketan putih, cabai hijau besar, wortel)', 'Dibangkitkan Pantara, mengikuti pola PIHPS provinsinya', range, 'simulasi'],
                  ['Batas wilayah provinsi', 'geoBoundaries ADM1, © kontributor OpenStreetMap (ODbL 1.0)', '2017 · 34 provinsi', 'asli'],
                  ['Batas wilayah kab/kota', 'BPS via geoBoundaries (CC BY 3.0 IGO)', '2020', 'asli'],
                  ['HET / HAP', 'Bapanas, Kemendag; HET beras berbeda per zona', 'Perlu verifikasi ke regulasi terbaru', 'indikatif'],
                  ['Bobot IHK komoditas', 'BPS', 'Dibulatkan', 'indikatif'],
                  ['Jumlah penduduk provinsi & kab/kota Jawa Barat', 'Setara proyeksi BPS 2023–2024', 'Dibulatkan', 'indikatif'],
                  ['Jumlah penduduk kab/kota di luar Jawa Barat', 'Perkiraan kasar: penduduk provinsi dibagi menurut luas wilayah', 'Hanya untuk simulasi perencanaan', 'simulasi'],
                  ['Konsumsi per kapita', 'Setara besaran Susenas', 'Dibulatkan', 'indikatif'],
                  ['Curah hujan harian 34 provinsi', 'Open-Meteo (reanalisis ERA5), satu titik per provinsi', 'Jan 2018 – kini (tertinggal ±1 minggu)', 'asli'],
                  ['Indeks El Niño/La Niña (RONI)', 'NOAA Climate Prediction Center', 'Bulanan sejak 1950', 'asli'],
                  ['Kalender libur nasional & cuti bersama', 'Pustaka Python holidays, dicocokkan dengan SKB 3 Menteri', '2018–2028; hari besar Islam yang belum ditetapkan ditandai perkiraan', 'asli'],
                ]}
                rowKey={(r) => r[0]}
                columns={[
                  { key: 'data', header: 'Data', render: (r) => <span className="font-semibold">{r[0]}</span> },
                  { key: 'src', header: 'Sumber', render: (r) => r[1] },
                  { key: 'note', header: 'Keterangan', hideOnMobile: true, render: (r) => r[2] },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (r) => <Tag tone={r[3] === 'asli' ? 'accent' : r[3] === 'simulasi' ? 'warning' : 'neutral'}>{r[3] === 'asli' ? 'Asli' : r[3] === 'simulasi' ? 'Simulasi' : 'Indikatif'}</Tag>,
                  },
                ]}
              />
            </Card>
          </Section>

          <Section id="prakiraan" title="Prakiraan harga">
            <p>
              Pantara memakai <strong>Filtered Historical Simulation (FHS)</strong>: gejolak harga masa lalu distandarkan dengan volatilitasnya saat itu, lalu
              diskalakan ulang ke volatilitas hari ini. Hasilnya bukan satu angka, melainkan rentang: P10 (skenario rendah), P50 (tengah), P90 (skenario tinggi)
              untuk 1–14 hari ke depan.
            </p>
            <Formula>
              <p>σₜ = simpangan baku log-return harian 30 hari s/d hari t</p>
              <p>zₜ,ₕ = ln(pₜ₊ₕ / pₜ) ÷ (max(σₜ, 0,3%) √h), dibatasi ±8 — hanya dari data sebelum hari prakiraan</p>
              <p>Pₑ = p_hari-ini × exp(Qₑ(z) × σ_hari-ini × √h), untuk q = 10%, 50%, 90%</p>
              <p>Peluang lampaui acuan = porsi z historis yang membawa harga di atas acuan</p>
            </Formula>
            <p>
              <strong>Model v2</strong> menyempurnakan FHS. Tiga model LightGBM (P10, P50, P90) per tingkat — provinsi dari PIHPS 2020–2026 dan
              kabupaten/kota dari SP2KP 2024–2026 — memprakirakan z dari: volatilitas 30/90 hari, perubahan harga 1–90 hari, jarak ke median 90 hari,
              ke HET/HAP, ke daerah tetangga, dan ke median cakupan; musim; jarak ke Idulfitri dan Iduladha serta jumlah hari libur dan cuti bersama dalam
              14 hari ke depan; curah hujan 30/90 hari vs normal dan RONI; serta momentum harga
              provinsi. Distribusi z historis FHS lalu dipetakan agar kuantil 10/50/90-nya sama dengan prakiraan v2, sehingga peluang lampaui acuan tetap
              dihitung dari seluruh distribusi. v2 hanya dipakai untuk komoditas yang terbukti lebih akurat daripada FHS di data uji; selebihnya tetap FHS.
            </p>
          </Section>

          <Section id="akurasi" title="Akurasi prakiraan">
            <p>
              Diuji secara <em>walk-forward</em>: pada titik-titik waktu lampau, prakiraan dibuat hanya dari data sebelum titik itu, lalu dibandingkan dengan harga
              yang benar-benar terjadi.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Cakupan (coverage)</strong> — porsi harga aktual yang jatuh di dalam rentang P10–P90. Rentang yang terkalibrasi mendekati <strong>80%</strong>.
              </li>
              <li>
                <strong>MASE</strong> — galat P50 dibagi galat tebakan naif "harga tetap". Di bawah 1 berarti lebih baik dari tebakan naif.
              </li>
            </ul>
            <h3 className="pt-2 font-semibold text-ink">Model v2 vs FHS — uji di luar sampel</h3>
            <p>
              Model v2 dilatih hanya dengan data sebelum periode uji, lalu kedua model diuji pada titik yang sama setiap 7 hari. <strong>Pinball</strong> =
              galat rata-rata ketiga kuantil (makin kecil makin baik); kolom "lebih baik" menunjukkan penurunannya dibanding FHS.
            </p>
            {v2.data && v2Metrics ? (
              <>
                <SegmentedControl
                  label="Tingkat"
                  value={v2Level}
                  onChange={setV2Level}
                  options={[
                    { value: 'province', label: 'Provinsi · PIHPS' },
                    ...(v2.data.metrics.regency ? [{ value: 'regency' as const, label: 'Kab/kota · SP2KP' }] : []),
                  ]}
                />
                <Card>
                  <DataTable<V2Row>
                    caption="Perbandingan model v2 dan FHS"
                    dense
                    rows={v2Metrics.rows}
                    rowKey={(r) => `${r.commodity_id}|${r.horizon}`}
                    columns={[
                      { key: 'c', header: 'Komoditas', sortValue: (r) => commodityName.get(r.commodity_id) ?? r.commodity_id, render: (r) => commodityName.get(r.commodity_id) ?? r.commodity_id },
                      { key: 'h', header: 'Horizon', align: 'right', sortValue: (r) => r.horizon, render: (r) => `${r.horizon} hari` },
                      {
                        key: 'gain',
                        header: 'Pinball lebih baik',
                        align: 'right',
                        sortValue: (r) => 1 - r.v2_pinball / r.fhs_pinball,
                        render: (r) => formatPct((1 - r.v2_pinball / r.fhs_pinball) * 100),
                      },
                      { key: 'cov', header: 'Cakupan v2 (FHS)', align: 'right', sortValue: (r) => r.v2_coverage, render: (r) => `${formatPct(r.v2_coverage * 100, 0)} (${formatPct(r.fhs_coverage * 100, 0)})` },
                      { key: 'mase', header: 'MASE v2 (FHS)', align: 'right', hideOnMobile: true, sortValue: (r) => r.v2_mase, render: (r) => `${formatNumber(r.v2_mase, 3)} (${formatNumber(r.fhs_mase, 3)})` },
                      {
                        key: 'use',
                        header: 'Dipakai',
                        render: (r) => (v2.data!.selection[v2Level]?.[r.commodity_id] === 'v2' ? <Tag tone="accent">v2</Tag> : <Tag>FHS</Tag>),
                      },
                    ]}
                  />
                </Card>
                <p className="text-sm">
                  Periode uji {formatDate(v2Metrics.test_start)} – {formatDate(v2Metrics.test_end)}. Syarat dipakai: pinball lebih kecil setidaknya 1% dari FHS, dan
                  cakupan P10–P90 tidak lebih jauh dari 80% dibanding FHS lebih dari 5 poin — rentang yang terlalu sempit akan meremehkan peluang harga
                  melampaui HET/HAP.
                </p>
              </>
            ) : (
              <Placeholder className="h-48" />
            )}

            <h3 className="pt-2 font-semibold text-ink">Backtest FHS — dihitung ulang setiap server berjalan</h3>
            {backtest && reports.data ? (
              <>
                {reports.data.length > 1 && (
                  <SegmentedControl
                    label="Data uji"
                    value={backtest.scope}
                    onChange={setPicked}
                    options={reports.data.map((r) => ({
                      value: r.scope,
                      label: `${scopeName.get(r.scope) ?? r.scope} · ${r.synthetic ? 'simulasi' : 'PIHPS'}`,
                    }))}
                  />
                )}
                <Card>
                  <DataTable<BacktestRow>
                    caption="Hasil backtest walk-forward"
                    dense
                    rows={backtest.rows}
                    rowKey={(r) => `${r.commodity_id}|${r.horizon}`}
                    columns={[
                      { key: 'c', header: 'Komoditas', sortValue: (r) => commodityName.get(r.commodity_id) ?? r.commodity_id, render: (r) => commodityName.get(r.commodity_id) ?? r.commodity_id },
                      { key: 'h', header: 'Horizon', align: 'right', sortValue: (r) => r.horizon, render: (r) => `${r.horizon} hari` },
                      {
                        key: 'cov',
                        header: 'Cakupan P10–P90',
                        align: 'right',
                        sortValue: (r) => r.coverage,
                        render: (r) => <span className={Math.abs(r.coverage - 0.8) <= 0.05 ? 'text-good-ink font-semibold' : 'text-warning-ink font-semibold'}>{formatPct(r.coverage * 100)}</span>,
                      },
                      { key: 'mase', header: 'MASE', align: 'right', sortValue: (r) => r.mase, render: (r) => formatNumber(r.mase, 3) },
                      { key: 'w', header: 'Lebar rentang', align: 'right', hideOnMobile: true, sortValue: (r) => r.band_width, render: (r) => formatPct(r.band_width * 100) },
                      { key: 'n', header: 'Sampel', align: 'right', hideOnMobile: true, sortValue: (r) => r.samples, render: (r) => r.samples.toLocaleString('id-ID') },
                    ]}
                  />
                </Card>
                <p className="text-sm">
                  Periode uji {formatDate(backtest.from)} – {formatDate(backtest.to)}, setiap {backtest.step_days} hari di {backtest.regions} daerah,
                  dihitung ulang setiap server berjalan. <strong>Cara membaca:</strong> cakupan yang dekat 80% berarti rentang dan peluang lampaui dapat dipercaya. MASE
                  sekitar 1 berarti titik tengah P50 tidak lebih baik dari "harga tetap" — wajar untuk harga pangan harian yang bergerak acak. Karena itu Pantara
                  memakai rentang dan peluang, bukan satu angka tebakan.{' '}
                  {backtest.synthetic ? 'Angka ini dihitung pada data simulasi.' : `Angka ini dihitung pada data asli (${backtest.source}).`}
                </p>
              </>
            ) : (
              <Placeholder className="h-64" />
            )}
          </Section>

          <Section id="acuan" title="Harga acuan">
            <p>
              Komoditas yang memiliki batas regulasi memakai HET atau HAP; HET beras mengikuti zona (Zona 1: Jawa, Lampung, Sumatera Selatan, Bali, NTB,
              Sulawesi; Zona 2: Sumatera lainnya, NTT, Kalimantan; Zona 3: Maluku dan Papua). Komoditas tanpa batas regulasi memakai{' '}
              <strong>acuan statistik</strong>: median harga 90 hari sebelumnya ditambah 10%. Di dalam satu provinsi, mediannya adalah median seluruh
              kabupaten/kota sehingga semua daerah dinilai dengan batas yang sama; antarprovinsi, mediannya adalah harga provinsi itu sendiri karena tingkat harga
              antarpulau berbeda secara struktural. Di tingkat provinsi, minyak goreng memakai acuan statistik karena PIHPS memantau minyak goreng kemasan bermerek; di tingkat kab/kota, SP2KP
              memantau MinyaKita sehingga dibandingkan dengan HET MinyaKita.
            </p>
            {meta.data ? (
              <Card>
                <DataTable<RegionalCommodity>
                  caption="Harga acuan per komoditas"
                  dense
                  rows={meta.data.commodities}
                  rowKey={(c) => c.id}
                  columns={[
                    { key: 'n', header: 'Komoditas', render: (c) => <span className="font-semibold">{c.name}</span> },
                    { key: 't', header: 'Jenis', render: (c) => REFERENCE_TYPE_LABEL[c.reference.type] },
                    {
                      key: 'v',
                      header: 'Nilai',
                      align: 'right',
                      render: (c) =>
                        !c.reference.value
                          ? 'bergerak harian'
                          : c.reference.zones
                            ? `${formatIDR(c.reference.value)} – ${formatIDR(Math.max(...Object.values(c.reference.zones)))}/${c.unit}`
                            : `${formatIDR(c.reference.value)}/${c.unit}`,
                    },
                    { key: 'b', header: 'Dasar', hideOnMobile: true, render: (c) => c.reference.basis },
                    { key: 's', header: 'Status', render: (c) => (c.reference.status === 'indicative' ? <Tag tone="warning">Indikatif</Tag> : <Tag>Terverifikasi</Tag>) },
                  ]}
                />
              </Card>
            ) : (
              <Placeholder className="h-64" />
            )}
          </Section>

          <Section id="rapor" title="Rapor Daerah">
            <p>
              Rapor memisahkan dua pertanyaan, dihitung per daerah × komoditas × bulan. <strong>Stabilitas</strong> (skor dan predikat A–E): seberapa sering
              harga melonjak di atas <em>batas wajar</em>-nya sendiri, yaitu median harga 90 hari sebelumnya + 10%. <strong>Kepatuhan HET/HAP</strong>: seberapa
              sering harga berada di atas batas regulasi, dinilai apa adanya tanpa penyesuaian.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Hari lonjakan</strong> — jumlah hari dengan harga di atas batas wajar.</li>
              <li><strong>Episode lonjakan</strong> — minimal 3 hari berturut-turut di atas batas wajar; dihitung utuh walau melewati batas bulan.</li>
              <li><strong>Durasi</strong> — panjang episode, dari hari pertama sampai hari terakhir di atas batas wajar.</li>
              <li><strong>Waktu pemulihan</strong> — dari puncak episode sampai harga kembali ≤ batas wajar. Episode yang belum pulih ditandai tersendiri.</li>
              <li><strong>Selisih tetangga</strong> — rata-rata harian (harga daerah ÷ median daerah tetangga − 1).</li>
              <li><strong>Hari di atas HET/HAP</strong> dan <strong>selisih HET/HAP</strong> — hanya untuk komoditas yang memiliki batas regulasi.</li>
            </ul>
            <Formula>
              <p>Skor stabilitas = 100 − 40 × porsi hari lonjakan − 20 × min(durasi ÷ 14, 1) − 20 × min(pemulihan ÷ 10, 1) − 20 × min(selisih tetangga⁺ ÷ 10%, 1)</p>
              <p>Skor daerah = rata-rata skor komoditas (bobot setara, agar pangan pokok yang stabil tidak menutupi komoditas yang bergejolak)</p>
              <p>Kepatuhan daerah = porsi hari-komoditas dengan harga ≤ HET/HAP, dibobot dengan bobot IHK (mengukur beban belanja warga)</p>
            </Formula>
            <p>
              Mengapa dipisah: harga beras di atas HET hampir setiap hari di hampir semua provinsi. Bila digabung, satu masalah nasional itu membuat hampir semua
              daerah mendapat predikat rendah sehingga rapor tidak lagi membedakan daerah yang mampu meredam lonjakan. Dengan dipisah, pelanggaran HET/HAP tetap
              terlihat penuh di ukuran kepatuhan, peringatan dini, dan perencanaan operasi pasar, yang tetap memakai HET/HAP sebagai acuan.
            </p>
            <ul className="flex flex-wrap gap-3">
              {GRADES.map((g, i) => (
                <li key={g} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                  <GradeBadge grade={g} size="sm" />
                  <span className="text-sm">
                    {GRADE_META[g].label} · {GRADE_THRESHOLDS[i].min}–{i === 0 ? 100 : GRADE_THRESHOLDS[i - 1].min}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              Membandingkan dengan tetangga penting: harga pangan sering naik serentak se-provinsi, sehingga rapor tidak menghukum daerah yang hanya terkena guncangan
              bersama. Rapor adalah <em>indikator stabilitas harga dan kepatuhan</em>, bukan penilaian kinerja pemerintah daerah secara utuh.
            </p>
          </Section>

          <Section id="peringatan" title="Peringatan dini">
            <ul className="space-y-2">
              <li className="flex flex-wrap items-center gap-2"><StatusBadge status="above_reference" /> harga hari ini sudah melampaui acuan.</li>
              <li className="flex flex-wrap items-center gap-2"><StatusBadge status="watch" /> peluang melampaui acuan dalam 14 hari ke depan ≥ 40%.</li>
              <li className="flex flex-wrap items-center gap-2"><StatusBadge status="normal" /> di bawah acuan dan peluang melampauinya rendah.</li>
            </ul>
          </Section>

          <Section id="iklim" title="Risiko iklim">
            <p>
              Risiko iklim dinilai per provinsi; kabupaten/kota memakai iklim provinsinya. Dua sinyal dipakai: <strong>curah hujan 90 hari</strong>{' '}
              dibanding normal 2018–2025 provinsi itu (kelas BMKG: di bawah 85% = bawah normal, di atas 115% = atas normal), dan fase{' '}
              <strong>El Niño/La Niña</strong> dari indeks RONI terbaru yang sudah terbit.
            </p>
            <Formula>
              <p>Tinggi = hujan 90 hari bawah normal saat El Niño, atau hujan &lt; 50% dari normal</p>
              <p>Waspada = hujan 90 hari bawah normal, atau El Niño berlangsung</p>
              <p>Rendah = selain itu</p>
            </Formula>
            <p>
              Aturan ini mengikuti data, bukan anggapan umum. Pada data PIHPS 2020–2026, hujan di bawah normal dan El Niño diikuti{' '}
              <strong>kenaikan</strong> harga dua bulan kemudian (di luar pola musiman), sedangkan hujan di atas normal dan La Niña justru diikuti harga cabai
              dan bawang yang <strong>turun</strong>, sehingga keduanya tidak menaikkan risiko.
            </p>
            {climate.data ? (
              <Card>
                <DataTable<ClimateEffect>
                  caption="Perubahan harga dua bulan kemudian, di luar pola musiman"
                  dense
                  rows={climate.data.effects.filter((e) => e.driver === 'dry' || e.driver === 'el_nino')}
                  rowKey={(e) => `${e.commodity_id}|${e.driver}`}
                  initialSort={{ key: 'e', dir: 'desc' }}
                  columns={[
                    { key: 'c', header: 'Komoditas', sortValue: (e) => commodityName.get(e.commodity_id) ?? e.commodity_id, render: (e) => commodityName.get(e.commodity_id) ?? e.commodity_id },
                    { key: 'd', header: 'Kondisi', sortValue: (e) => e.driver, render: (e) => (e.driver === 'dry' ? 'Hujan 3 bln bawah normal' : 'El Niño') },
                    {
                      key: 'e',
                      header: 'Perubahan',
                      align: 'right',
                      sortValue: (e) => e.effect_pct,
                      render: (e) => (
                        <span className={e.significant ? 'font-semibold text-ink' : 'text-ink-3'}>
                          {e.effect_pct > 0 ? '+' : ''}
                          {formatNumber(e.effect_pct)}%
                        </span>
                      ),
                    },
                    { key: 'ci', header: 'Rentang 95%', align: 'right', hideOnMobile: true, render: (e) => `${formatNumber(e.lo_pct)} … ${formatNumber(e.hi_pct)}%` },
                    { key: 'n', header: 'Bulan-provinsi', align: 'right', hideOnMobile: true, sortValue: (e) => e.n, render: (e) => e.n.toLocaleString('id-ID') },
                  ]}
                />
              </Card>
            ) : (
              <Placeholder className="h-48" />
            )}
            <Notice tone="warning" title="Batasan bukti El Niño">
              Data 2020–2026 hanya memuat 1–2 episode El Niño (2023–2024 dan 2026), yang juga bertepatan dengan krisis beras 2023–2024. Angka El Niño
              karenanya lebih lemah daripada angka curah hujan, yang bervariasi antarprovinsi dan antarwaktu. Ini korelasi, bukan bukti sebab-akibat.
            </Notice>
          </Section>

          <Section id="intervensi" title="Intervensi & evaluasi dampak">
            <p>
              Saat pemerintah daerah mencatat intervensi, Pantara <strong>membekukan</strong> prakiraan pada tanggal acuan sebagai pembanding: "apa yang diperkirakan
              terjadi tanpa intervensi". Setelah intervensi dipublikasikan, catatan dan dasar keputusannya tidak dapat diubah atau dihapus.
            </p>
            <Formula>
              <p>Harga vs prakiraan = rata-rata (harga aktual ÷ P50 beku − 1) selama 14 hari setelah tanggal acuan</p>
              <p>Perubahan vs tetangga = perubahan harga daerah − perubahan median daerah tetangga, pada periode yang sama</p>
            </Formula>
            <p>
              <strong>Ada indikasi dampak</strong> hanya bila keduanya sepakat: harga ≥ 3% di bawah prakiraan <em>dan</em> turun ≥ 2 poin dibanding tetangga.
              Bila harga ≥ 3% di atas prakiraan atau naik ≥ 2 poin dibanding tetangga: <strong>dampak belum terlihat</strong>. Selain itu: <strong>belum jelas</strong>.
              Evaluasi ini indikatif, bukan bukti sebab-akibat.
            </p>
          </Section>

          <Section id="perencanaan" title="Perencanaan operasi pasar">
            <p>Membantu menjawab: kapan, di mana, dan bagaimana membagi anggaran agar kelebihan bayar warga di atas acuan paling banyak tercegah.</p>
            <Formula>
              <p>Kelebihan bayar = Σₕ E[maks(Pₕ − acuan, 0)] × penduduk × konsumsi per kapita, selama 14 hari</p>
              <p>1 paket = 10% kebutuhan daerah 14 hari, dijual di harga acuan saat harga pasar melampauinya</p>
              <p>Biaya paket = volume × (E[P − acuan | P &gt; acuan] + 3% acuan) + Rp 15 juta operasional</p>
              <p>Bagian yang dicegah oleh n paket = 1 − exp(−efektivitas × 10% × n), maksimum 60% kebutuhan</p>
              <p>Mulai = hari prakiraan menembus acuan (peluang ≥ 50%) − waktu persiapan logistik</p>
            </Formula>
            <p>
              Alokasi dipilih dengan <em>multiple-choice knapsack</em> yang diselesaikan secara eksak (pemrograman dinamis), dengan biaya dibulatkan ke atas sehingga
              rencana tidak pernah melebihi anggaran. Semua angka di atas adalah asumsi bawaan yang dapat diubah di dashboard pemerintah; efektivitas paling layak
              dikalibrasi dari evaluasi intervensi nyata.
            </p>
          </Section>

          <Section id="umkm" title="Rekomendasi belanja UMKM">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Beli mingguan atau borong 2 minggu</strong> — membandingkan ekspektasi biaya kedua skenario: bobot kotor dikoreksi susut harian (kg = kebutuhan ÷
                (1 − s)<sup>umur stok</sup>), harga pekan depan dari rentang prakiraan. Borong hanya dinilai bila umur simpan metode dapur ≥ 14 hari.
              </li>
              <li>
                <strong>Sinyal alih varian</strong> — aktif bila rasio harga dua varian setara fungsi menyimpang ≥ 2,4 simpangan baku di atas median 90 hari dan varian
                alternatif benar-benar lebih murah.
              </li>
              <li>
                <strong>Simulasi susut</strong> — bobot layak pakai = bobot × (1 − laju susut)<sup>hari</sup> sesuai metode simpan.
              </li>
            </ul>
          </Section>

          <Section id="batasan" title="Batasan">
            <ul className="list-disc space-y-1 pl-5">
              <li>Komoditas yang tidak dipantau SP2KP di suatu kab/kota memakai harga simulasi (ditandai «Simulasi»); kesimpulan untuk deret itu belum mencerminkan kondisi nyata.</li>
              <li>HET/HAP, bobot IHK, penduduk, dan konsumsi per kapita adalah angka indikatif yang perlu diverifikasi.</li>
              <li>Prakiraan menganggap acuan masa depan sama dengan acuan hari ini.</li>
            </ul>
            <p>
              Ada pertanyaan atau temuan? Lihat datanya langsung di <Link to="/rapor-daerah" className="font-semibold text-accent underline">Rapor Daerah</Link> atau unduh
              CSV dari setiap halaman.
            </p>
          </Section>
        </div>
      </div>
    </SiteShell>
  );
}

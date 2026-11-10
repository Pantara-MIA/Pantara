# Pantara 🌿

**Pantara — *Pangan Terbuka dan Terarah*.** Data harga pangan terbuka dan pendukung keputusan berbasis data. Dirancang untuk publik, pemerintah daerah, dan UMKM.

> Tema: *Designing Digital Futures — Powering Public Transparency* · Subtema: *Data-Driven Decision Support*

Pantara memantau harga pangan di **34 provinsi** (data harian PIHPS Bank Indonesia) hingga **514 kabupaten/kota** (data harian SP2KP Kemendag), memberi **rapor stabilitas harga** setiap daerah, **memperingatkan lonjakan** sebelum terjadi, membantu pemerintah **merencanakan operasi pasar**, dan **membuka setiap intervensi** beserta dasar datanya untuk dinilai publik. UMKM kuliner memakai data yang sama untuk memutuskan berapa kilogram bahan yang dibeli hari ini.

> ⚠️ **Versi demonstrasi.** Harga provinsi dari PIHPS dan kab/kota dari SP2KP adalah data asli; komoditas yang tidak dipantau di suatu kab/kota masih **data simulasi** dan ditandai. HET/HAP, jumlah penduduk, dan konsumsi per kapita adalah angka **indikatif** yang perlu diverifikasi. Lihat [Status data](#status-data).

---

## Putaran akuntabilitas

```
Data harga ──► Prakiraan & peringatan ──► Pemerintah merencanakan & mencatat intervensi
    ▲                                                     │
    └── Rapor Daerah ◄── Publik menilai hasilnya ◄── Intervensi dipublikasikan (terkunci)
```

## Fitur

| Untuk | Halaman | Isi |
|---|---|---|
| **Publik** | `/rapor-daerah` | Peta & peringkat 34 provinsi, setiap provinsi dapat dirinci ke kab/kotanya (`?cakupan=<id-provinsi>`): predikat A–E, hari di atas acuan, episode lonjakan, waktu pemulihan, selisih vs daerah tetangga. Mode peta *Peringatan dini*. |
| | `/rapor-daerah/:id` | Rapor lengkap satu provinsi atau kab/kota: tren 12 bulan, perbandingan tetangga, rapor per komoditas, grafik harga + prakiraan, daftar episode, intervensi di daerah itu. |
| | `/intervensi` | Semua intervensi yang dipublikasikan: dasar keputusan (harga, acuan, prakiraan saat dicatat) dan evaluasi dampak indikatif. |
| | `/ensiklopedia`, `/simulator` | Profil 21 komoditas (dampak inflasi, laju susut, cara simpan) dan simulator susut dapur. |
| | `/metodologi` | Semua rumus, hasil backtest yang dihitung langsung, dan batasan. |
| **Pemerintah daerah** | `/pemerintah` | *Perlu tindakan* (komoditas di atas/berisiko melampaui acuan), *Prakiraan & riwayat* (+ ekspor CSV), *Perencanaan operasi pasar* (jendela waktu & alokasi anggaran optimal), *Intervensi* (draf → publikasi). |
| **UMKM** | `/dashboard` | Rekomendasi belanja (berapa kg hari ini), radar harga & anggaran kas, sinyal substitusi varian, simulasi susut (+ saran olahan opsional), profil usaha. Harga & prakiraan diambil dari kab/kota yang dipilih UMKM (21 komoditas). |

Setiap filter tersimpan di URL sehingga tampilan apa pun dapat dibagikan. Data dapat diunduh sebagai CSV di halaman terkait.

## Status data

| Data | Sumber | Status |
|---|---|---|
| Harga harian 34 provinsi × 13 komoditas (Sep 2024 – Okt 2026) | PIHPS Bank Indonesia, pasar tradisional ([`model/fetch_pihps.py`](model/fetch_pihps.py) → [`data/pihps/`](data/pihps)) | Asli |
| Harga harian 514 kab/kota × 18 komoditas (Feb 2024 – kini) | SP2KP Kemendag ([`model/fetch_sp2kp.py`](model/fetch_sp2kp.py) → [`model/build_app_data.py`](model/build_app_data.py) → [`data/sp2kp/`](data/sp2kp)) | Asli |
| Seri kab/kota yang tidak dipantau SP2KP | Dibangkitkan Pantara, mengikuti pola PIHPS provinsinya ([`internal/regional/synthetic.go`](internal/regional/synthetic.go)) | **Simulasi** (ditandai) |
| Curah hujan harian 34 provinsi (2018 – kini) | Open-Meteo, reanalisis ERA5 ([`model/fetch_openmeteo.py`](model/fetch_openmeteo.py) → [`data/climate/province_rain.csv.gz`](data/climate/province_rain.csv.gz)) | Asli |
| Indeks El Niño/La Niña bulanan (RONI) | NOAA Climate Prediction Center ([`model/fetch_roni.py`](model/fetch_roni.py) → [`data/climate/roni.csv`](data/climate/roni.csv)) | Asli |
| Kalender libur nasional & cuti bersama 2018–2028 | Pustaka Python `holidays` ([`model/fetch_holidays.py`](model/fetch_holidays.py) → [`data/calendar/holidays.csv`](data/calendar/holidays.csv)) | Asli; hari besar Islam yang belum ditetapkan pemerintah ditandai **perkiraan** |
| Daftar & tetangga kab/kota di luar Jawa Barat, penduduk kab/kota (perkiraan kasar menurut luas) | Diturunkan dari batas BPS ([`model/build_regency_maps.py`](model/build_regency_maps.py) → [`data/regions/regencies.json`](data/regions/regencies.json)) | Batas asli; penduduk **simulasi** |
| Batas wilayah provinsi (34, sesuai cakupan PIHPS) | geoBoundaries ADM1, © kontributor OpenStreetMap (ODbL 1.0) | Asli |
| Batas wilayah kab/kota | BPS via geoBoundaries (CC BY 3.0 IGO) | Asli |
| HET/HAP (HET beras per zona 1–3) | Bapanas, Kemendag ([`data/reference_prices.csv`](data/reference_prices.csv)) | Indikatif |
| Bobot IHK, penduduk, konsumsi per kapita | BPS, Susenas (dibulatkan) | Indikatif |

Wilayah tersusun bertingkat ([`internal/regional/scope.go`](internal/regional/scope.go)): cakupan `indonesia` (34 provinsi), lalu satu cakupan kab/kota per provinsi (`jawa-barat` dikurasi manual; 33 lainnya dibangkitkan saat pertama dibuka agar memori tetap kecil). Setiap cakupan punya sumber harganya sendiri; saat data kab/kota asli tersedia, cukup isi harga cakupan itu dari pemuat data asli seperti [`pihps.go`](internal/regional/pihps.go). Perbarui data provinsi dengan `cd model && python fetch_pihps.py --end <tanggal>`.

## Model & metode

Ringkasan — rinciannya ada di halaman **Metodologi** aplikasi.

- **Prakiraan harga — Filtered Historical Simulation (FHS).** Return historis distandarkan dengan volatilitas 30 harinya, lalu diskalakan ke volatilitas hari ini → P10/P50/P90 untuk 1–14 hari dan peluang melampaui acuan.
- **Prakiraan v2 — LightGBM kuantil + FHS.** Tiga model (P10/P50/P90) per tingkat, dari provinsi (PIHPS 2020–2026) dan kab/kota (SP2KP 2024–2026) meyang mprakirakan return terstandar dari volatilitas, momentum, jarak ke median/HET-HAP/tetangga, musim, kalender hari besar (jarak ke Idulfitri dan Iduladha, jumlah hari libur & cuti bersama 14 hari ke depan, dari [`data/calendar/holidays.csv`](data/calendar/holidays.csv)), curah hujan vs normal, RONI, dan momentum provinsi ([`model/train_forecast.py`](model/train_forecast.py), fitur di [`forecast_features.py`](model/forecast_features.py) yang dicerminkan persis oleh [`features.go`](internal/regional/features.go) dan [`calendar.go`](internal/regional/calendar.go); paritas diuji). Distribusi FHS dipetakan agar kuantilnya mengikuti v2. Dipakai hanya untuk komoditas yang lebih akurat dari FHS pada uji di luar sampel Okt 2025 – Okt 2026. Isi [`data/models/`](data/models): `forecast_<provinsi|kab/kota>_q<10|50|90>.json` (pohon keputusan untuk evaluator Go), `selection.json` (v2 atau FHS per komoditas), `metrics.json` (hasil uji, juga di `GET /api/v1/public/model-metrics/v2`), `parity.json` (baris uji kesamaan Python–Go).
- **Kalender hari besar** ([`data/calendar/holidays.csv`](data/calendar/holidays.csv)) juga menentukan kenaikan harga menjelang Lebaran pada seri kab/kota simulasi.
- **Akurasi** diuji ulang setiap server berjalan dengan backtest *walk-forward* per cakupan (`GET /api/v1/public/model-metrics`). Pada data asli PIHPS (provinsi): cakupan rentang P10–P90 rata-rata **≈ 79%** (target 80%), MASE ≈ 1,0; pada kab/kota Jawa Barat (sebagian besar SP2KP) cakupan ≈ 83% dengan rentang dan peluang terkalibrasi, titik tengahnya setara tebakan naif, sehingga keputusan memakai rentang, bukan satu angka.
- **Rapor Daerah — dua ukuran terpisah.** *Stabilitas*: skor 0–100 = 100 − penalti (hari di atas batas wajar = median 90 hari + 10%, durasi lonjakan, waktu pemulihan, selisih vs tetangga), rata-rata setara antarkomoditas; predikat A ≥ 85 · B ≥ 70 · C ≥ 55 · D ≥ 40 · E. *Kepatuhan HET/HAP*: porsi hari-komoditas dengan harga ≤ HET/HAP, dibobot IHK, dinilai apa adanya. Dipisah agar pelanggaran nasional (mis. beras di atas HET di hampir semua provinsi) tetap terlihat tanpa meratakan semua predikat.
- **Risiko iklim (per provinsi).** Curah hujan 90 hari vs normal 2018–2025 (kelas BMKG) dan fase El Niño/La Niña (RONI). *Tinggi* = hujan bawah normal saat El Niño atau < 50% normal; *Waspada* = salah satunya. Daftar komoditas terdampak dan besar dampaknya diambil dari analisis data PIHPS 2020–2026 ([`model/analyze_climate.py`](model/analyze_climate.py) → [`data/climate/effects.csv`](data/climate/effects.csv)): hujan bawah normal diikuti cabai merah +6–8%, bawang merah +4–5%, gula +2–3% dua bulan kemudian; hujan atas normal dan La Niña justru diikuti penurunan. Bukti El Niño (1–2 episode) lebih lemah.
- **Evaluasi intervensi.** Prakiraan pada tanggal acuan dibekukan sebagai pembanding; harga aktual 14 hari sesudahnya dibandingkan dengan prakiraan itu dan dengan median daerah tetangga. Indikatif, bukan bukti sebab-akibat.
- **Perencanaan operasi pasar.** Memaksimalkan *kelebihan bayar warga* di atas acuan yang tercegah dengan *multiple-choice knapsack* (pemrograman dinamis eksak, diuji terhadap brute force). Asumsi efektivitas, ukuran paket, dan biaya dapat diubah di dashboard.
- **Rekomendasi UMKM.** Memakai harga dan prakiraan 7 hari (v2/FHS) kab/kota lokasi usaha; membandingkan ekspektasi biaya belanja mingguan vs borong 2 minggu setelah koreksi susut harian; sinyal substitusi aktif bila rasio harga dua varian cabai menyimpang ≥ 2,4 simpangan baku.

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Recharts |
| Backend | Go, chi, `database/sql` + `lib/pq` |
| Basis data | PostgreSQL (Supabase), migrasi otomatis saat server berjalan |
| **Model prakiraan (dilatih sendiri)** | **6 model *machine learning* LightGBM kuantil (P10/P50/P90)** yang kami latih sendiri dari data harga harian PIHPS & SP2KP, ditambah fitur iklim (curah hujan, El Niño/La Niña) dan kalender hari besar; dievaluasi *walk-forward* terhadap model statistik FHS, lalu dijalankan langsung di server Go tanpa layanan AI eksternal. Lihat [Model & metode](#model--metode). |
| Analitik & keputusan | Go: FHS regional, rapor stabilitas, peringatan dini, evaluasi intervensi, optimisasi operasi pasar (*knapsack*), rekomendasi belanja UMKM |
| Pipeline data | Python: pengambil data (PIHPS, SP2KP, Open-Meteo, RONI), analisis iklim, pelatihan & seleksi model, pembuat peta |
| Integrasi tambahan | Google Gemini, opsional, hanya untuk saran olahan bahan berlebih di Simulasi Susut |

Frontend dibangun menjadi file statis dan disajikan langsung oleh satu binary Go. Semua prakiraan, peringatan, dan rekomendasi dihitung oleh model dan algoritma Pantara sendiri; Gemini tidak dipakai di dalamnya.

## Menjalankan

### Prasyarat
Go 1.26+, Node.js 20+.

### 1. Konfigurasi
```bash
cp .env.example .env
```
Isi `.env`:
- `DATABASE_URL` — URI **Session pooler** Supabase (Dashboard → Connect → Session pooler). Host *direct connection* `db.<project>.supabase.co` hanya IPv6 dan sering tidak terjangkau.
- `JWT_SECRET` — **wajib**, string acak minimal 32 karakter, misalnya `openssl rand -hex 32`. Server menolak berjalan tanpa ini.
- `GEMINI_API_KEY`, `GEMINI_MODEL` — opsional, untuk solusi AI di Simulasi Susut.

Tanpa basis data, halaman publik (Rapor Daerah, Ensiklopedia, Simulator, Metodologi) tetap berjalan; login, dashboard, dan intervensi membutuhkannya.

### 2. Build & jalankan
```bash
cd web && npm install && npm run build && cd ..
go run ./cmd/server          # http://localhost:8080
```
Skema basis data dibuat otomatis dari [`db/migrations/`](db/migrations/) saat server pertama kali terhubung; migrasi yang sudah berjalan dicatat dan tidak diulang.

### 3. Akun pemerintah daerah
Akun pemerintah tidak dapat didaftarkan dari website. Buat lewat CLI:
```bash
go run ./cmd/admin create-government \
  -email dinas@contoh.go.id -password "minimal10karakter" \
  -agency "Dinas Ketahanan Pangan Kab. Bandung" -region kab-bandung
```
`-region` adalah ID kab/kota atau provinsi (lihat [`internal/regional/`](internal/regional/)), `jawa-barat` untuk kewenangan atas seluruh kab/kota Jawa Barat, atau `indonesia` untuk kewenangan nasional (34 provinsi). Akun UMKM mendaftar sendiri di `/login`.

### Mode pengembangan
```bash
go run ./cmd/server               # terminal 1 — API di :8080
cd web && npm run dev             # terminal 2 — http://localhost:5173
```
Katalog komponen sistem desain tersedia di `/katalog-komponen` (hanya mode dev).

### Pembaruan data harian

```bash
cd model
python refresh.py            # PIHPS, SP2KP, Open-Meteo, RONI: ±10 hari terakhir, lalu data server
python refresh.py --build    # ... lalu build ulang binary ke bin/ (data di-embed, jadi restart server)
python refresh.py --retrain  # sesekali (mingguan/bulanan): latih ulang & pilih ulang model v2 (±12 menit)
python refresh.py --climate  # sesekali (bulanan): perbarui tabel bukti iklim
```

Jadwalkan `python refresh.py --build` sekali sehari (mis. pukul 18.00 WIB, setelah PIHPS dan SP2KP terbit) lewat cron, Windows Task Scheduler, atau CI, lalu restart layanan. Setiap pengambil memakai cache, jadi menjalankan ulang setelah gagal tidak mengunduh ulang dari nol.

Kalender hari besar tidak ikut `refresh.py`. Perbarui setahun sekali setelah SKB 3 Menteri tentang libur nasional & cuti bersama terbit: `python fetch_holidays.py`, cocokkan tanggal yang ditandai perkiraan, lalu latih ulang model (`refresh.py --retrain`) bila tanggal Idulfitri berubah (tanggal yang dipakai saat pelatihan disimpan di `EID_TRAINED` dalam skrip itu).

### Docker
```bash
docker build -t pantara .
docker run -p 8080:8080 --env-file .env pantara
```

### Data untuk model (`model/`)

Pasang dependensi Python sekali: `pip install -r model/requirements.txt` (antara lain `pandas`, `lightgbm` untuk pelatihan model, dan `holidays` untuk kalender). Pengambil data harga dan cuaca sendiri hanya memakai pustaka standar Python (ditambah `certifi` bila ada, untuk sertifikat HTTPS). Hasilnya ditulis ke `model/data/` (tidak ikut dibundel ke server) dengan cache per permintaan di `model/.cache/`, sehingga bisa dilanjutkan bila terputus.

| Skrip | Sumber | Hasil |
|---|---|---|
| `fetch_pihps.py --start 2020-01-01 --merge-with ../data/pihps/province_prices.csv --out data/pihps/province_prices.csv` | PIHPS Bank Indonesia | Harga harian 34 provinsi × 13 komoditas |
| `fetch_sp2kp.py` (`--merge` untuk menambah periode) | SP2KP Kemendag (API laporan publik) | Harga harian 38 provinsi & 514 kab/kota × 18 komoditas, sejak Feb 2024 |
| `match_regions.py` | — | Kode kab/kota SP2KP → ID wilayah Pantara |
| `build_app_data.py` | — | Membersihkan SP2KP kab/kota dan menulis `data/sp2kp/regency_prices.csv.gz` untuk server |
| `fetch_openmeteo.py --adm1 <ADM1.geojson>` | Open-Meteo (ERA5), kuota gratis dijaga otomatis | Cuaca harian 34 titik provinsi sejak 2018 |
| `fetch_roni.py` | NOAA CPC (RONI) | Indeks El Niño/La Niña bulanan sejak 1950 |
| `fetch_holidays.py` | Pustaka Python `holidays` (luring, tanpa API key) | Libur nasional & cuti bersama 2018–2028 → `data/calendar/holidays.csv` |
| `fetch_bmkg.py <kode adm4 ...>` | API prakiraan cuaca BMKG | Prakiraan 3 hari per desa |
| `coverage_report.py` | — | Ringkasan cakupan di `model/data/COVERAGE.md` |
| `analyze_climate.py --lead 2` | — | Bukti dampak hujan/ENSO terhadap harga → `data/climate/effects.csv` |
| `build_app_data.py` (juga) | — | Hujan harian provinsi & RONI → `data/climate/` untuk server |
| `train_forecast.py --level all` | — | Melatih & menguji model v2 (±12 menit, 8 inti), menulis `data/models/` |

## Struktur

```
cmd/server         server HTTP (API + frontend statis)
cmd/admin          CLI pembuatan akun pemerintah
db/migrations      skema basis data berurutan
internal/regional  hierarki wilayah, data PIHPS/SP2KP/iklim, prakiraan FHS + v2, rapor, evaluasi, perencanaan, backtest
internal/api       handler HTTP (publik, auth, pemerintah, UMKM, ekspor CSV)
internal/decision  mesin rekomendasi belanja UMKM
internal/substitution  sinyal substitusi varian
data/              data server: harga, iklim, kalender hari besar, wilayah, model v2, harga acuan (di-embed ke binary)
model/             pengambil data, analisis iklim, training model v2, pembuat peta, pembaruan harian
web/src            frontend (pages/, components/, lib/, data/)
```

## API ringkas

| Metode | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/v1/public/regions?scope=` | Wilayah satu cakupan (`indonesia`, `jawa-barat`; atau `region=` untuk cakupan suatu daerah), jejak cakupan, komoditas, acuan, rentang data |
| GET | `/api/v1/public/scorecard?scope=&month=&commodity=` | Peringkat rapor seluruh daerah dalam satu cakupan |
| GET | `/api/v1/public/scorecard/{regionID}?month=` | Rapor lengkap satu daerah |
| GET | `/api/v1/public/prices?region=&commodity=&days=&as_of=` | Riwayat harga + prakiraan |
| GET | `/api/v1/public/alerts?scope=&commodity=&as_of=` | Peringatan dini per daerah dalam satu cakupan |
| GET | `/api/v1/public/watchlist?region=&as_of=` (region: ID daerah atau cakupan) | Daftar daerah × komoditas yang perlu perhatian |
| GET | `/api/v1/public/interventions` | Intervensi yang dipublikasikan |
| GET | `/api/v1/public/model-metrics` | Hasil backtest walk-forward |
| GET | `/api/v1/public/climate?as_of=` | Risiko iklim 34 provinsi, fase ENSO, tabel bukti |
| GET | `/api/v1/public/climate/{regionID}?as_of=` | Iklim provinsi suatu daerah + hujan bulanan vs normal |
| GET | `/api/v1/public/export/{prices,scorecard,interventions}.csv` | Data terbuka (CSV UTF-8) |
| POST | `/api/v1/msme/procurement-card` | Rekomendasi belanja UMKM (`commodity`, `region_id`, kebutuhan & cara simpan) |
| — | `/api/v1/gov/*` | Intervensi & perencanaan (akun pemerintah) |

## Pengujian
```bash
go test ./...                 # metrik rapor, FHS, evaluasi, knapsack vs brute force, backtest
cd web && npx tsc -b && npx oxlint src
```

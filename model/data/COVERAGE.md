# Laporan cakupan data Fase 1

## PIHPS (provinsi)
- 744,762 baris, 2020-01-02 s/d 2026-10-28, 13 komoditas

| Komoditas | Provinsi berdata | Rata-rata hari lapor per provinsi |
|---|---|---|
| bawang-merah | 34 | 1729 |
| bawang-putih | 34 | 1729 |
| beras-medium | 34 | 1729 |
| beras-premium | 34 | 1729 |
| cabai-merah-besar | 31 | 1531 |
| cabai-merah-keriting | 34 | 1728 |
| cabai-rawit-hijau | 34 | 1642 |
| cabai-rawit-merah | 33 | 1630 |
| daging-ayam-ras | 34 | 1729 |
| daging-sapi | 34 | 1728 |
| gula-pasir | 34 | 1729 |
| minyak-goreng | 34 | 1728 |
| telur-ayam-ras | 34 | 1729 |

## SP2KP (provinsi)
- 25,108 baris area-hari, 38 area, 2024-02-01 s/d 2026-10-29

| Komoditas | Area berdata | Kelengkapan (area-hari terisi) | Nilai janggal (>3× median area) |
|---|---|---|---|
| bawang-bombay | 38 | 97% | 0 |
| bawang-merah | 38 | 97% | 0 |
| bawang-putih | 38 | 97% | 0 |
| beras-medium | 38 | 97% | 0 |
| beras-premium | 38 | 94% | 0 |
| beras-sphp | 38 | 85% | 3 |
| cabai-merah-besar | 38 | 94% | 8 |
| cabai-merah-keriting | 38 | 97% | 12 |
| cabai-rawit-hijau | 37 | 96% | 0 |
| cabai-rawit-merah | 38 | 97% | 15 |
| daging-ayam-ras | 38 | 97% | 0 |
| daging-sapi | 38 | 97% | 0 |
| gula-pasir | 38 | 97% | 0 |
| kentang | 38 | 97% | 0 |
| minyak-goreng | 38 | 97% | 0 |
| sawi-hijau | 38 | 97% | 12 |
| telur-ayam-ras | 38 | 97% | 0 |
| tomat | 38 | 97% | 68 |

## SP2KP (kab/kota)
- 333,495 baris area-hari, 514 area, 2024-02-01 s/d 2026-10-29

| Komoditas | Area berdata | Kelengkapan (area-hari terisi) | Nilai janggal (>3× median area) |
|---|---|---|---|
| bawang-bombay | 461 | 95% | 17 |
| bawang-merah | 512 | 95% | 9 |
| bawang-putih | 488 | 95% | 0 |
| beras-medium | 484 | 92% | 0 |
| beras-premium | 489 | 93% | 0 |
| beras-sphp | 490 | 72% | 76 |
| cabai-merah-besar | 413 | 89% | 132 |
| cabai-merah-keriting | 494 | 94% | 371 |
| cabai-rawit-hijau | 425 | 93% | 120 |
| cabai-rawit-merah | 462 | 94% | 340 |
| daging-ayam-ras | 511 | 95% | 0 |
| daging-sapi | 451 | 93% | 0 |
| gula-pasir | 500 | 94% | 0 |
| kentang | 506 | 94% | 7 |
| minyak-goreng | 508 | 92% | 0 |
| sawi-hijau | 501 | 92% | 254 |
| telur-ayam-ras | 513 | 95% | 0 |
| tomat | 508 | 93% | 1762 |

## Pencocokan kab/kota SP2KP → Pantara
- exact: 507, fuzzy: 4, override: 3

## SP2KP vs PIHPS (provinsi, hari yang sama)

| Komoditas | Pasangan data | Median SP2KP ÷ PIHPS | 10%–90% |
|---|---|---|---|
| bawang-merah | 20,962 | 0.948 | 0.87–1.05 |
| bawang-putih | 20,959 | 0.965 | 0.87–1.04 |
| beras-medium | 20,957 | 0.913 | 0.84–0.99 |
| beras-premium | 20,311 | 0.958 | 0.87–1.02 |
| cabai-merah-besar | 16,336 | 0.982 | 0.82–1.20 |
| cabai-merah-keriting | 20,957 | 0.959 | 0.83–1.13 |
| cabai-rawit-hijau | 20,136 | 0.939 | 0.74–1.26 |
| cabai-rawit-merah | 19,190 | 0.950 | 0.78–1.17 |
| daging-ayam-ras | 20,961 | 1.017 | 0.90–1.15 |
| daging-sapi | 20,952 | 0.978 | 0.91–1.02 |
| gula-pasir | 20,960 | 0.987 | 0.95–1.03 |
| minyak-goreng | 20,961 | 0.803 | 0.67–0.90 |
| telur-ayam-ras | 20,962 | 0.991 | 0.93–1.07 |

## Open-Meteo (cuaca harian per provinsi)
- 109,412 baris, 34 provinsi, 2018-01-01 s/d 2026-10-23, curah hujan kosong: 0

## RONI (ENSO)
- 920 musim, 1950–2026, terbaru JAS 2026 = +1.69 (el_nino)

## BMKG (prakiraan 3 hari)
- Sampel: forecast_2026-10-30.csv. Butuh daftar kode desa (adm4) per kab/kota untuk cakupan penuh.

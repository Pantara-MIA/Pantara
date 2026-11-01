"""Summarise the Phase 1 datasets into model/data/COVERAGE.md.

Reads what the fetchers wrote under model/data/ and reports, per source: date
range, rows, and coverage by commodity and area; plus a cross-check of SP2KP
province prices against PIHPS (same province, commodity and day).

Usage: python coverage_report.py
"""
import csv
import gzip
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"


def read_wide(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        r = csv.reader(f)
        header = next(r)
        return header, list(r)


def pct(a, b):
    return f"{a / b * 100:.0f}%" if b else "–"


def main():
    out = ["# Laporan cakupan data Fase 1", ""]

    # PIHPS (province, long history).
    pihps = defaultdict(lambda: defaultdict(int))
    pihps_range = [None, None]
    pihps_prices = {}
    with (DATA / "pihps/province_prices.csv").open(encoding="utf-8") as f:
        n = 0
        for row in csv.DictReader(f):
            n += 1
            pihps[row["commodity_id"]][row["province_id"]] += 1
            d = row["date"]
            pihps_range = [min(pihps_range[0] or d, d), max(pihps_range[1] or d, d)]
            pihps_prices[(d, row["province_id"], row["commodity_id"])] = float(row["price"])
    out += [f"## PIHPS (provinsi)", f"- {n:,} baris, {pihps_range[0]} s/d {pihps_range[1]}, {len(pihps)} komoditas", "",
            "| Komoditas | Provinsi berdata | Rata-rata hari lapor per provinsi |", "|---|---|---|"]
    for cid in sorted(pihps):
        counts = pihps[cid]
        out.append(f"| {cid} | {len(counts)} | {statistics.mean(counts.values()):.0f} |")

    # SP2KP (province + regency).
    for level, key in (("province", "province_code"), ("regency", "regency_code")):
        header, rows = read_wide(DATA / f"sp2kp/{level}_prices.csv.gz")
        commodities = header[2:]
        areas = {r[1] for r in rows}
        dates = sorted({r[0] for r in rows})
        per_com = defaultdict(set)
        cells = defaultdict(int)
        series = defaultdict(list)
        for r in rows:
            for c, v in zip(commodities, r[2:]):
                if v:
                    per_com[c].add(r[1])
                    cells[c] += 1
                    series[(r[1], c)].append(float(v))
        # Likely entry errors: reports more than 3x away from that area's median.
        odd = defaultdict(int)
        for (area, c), vals in series.items():
            mid = statistics.median(vals)
            odd[c] += sum(1 for v in vals if v > mid * 3 or v < mid / 3)
        days = len(dates)
        out += ["", f"## SP2KP ({'provinsi' if level == 'province' else 'kab/kota'})",
                f"- {len(rows):,} baris area-hari, {len(areas)} area, {dates[0] if dates else '–'} s/d {dates[-1] if dates else '–'}", "",
                "| Komoditas | Area berdata | Kelengkapan (area-hari terisi) | Nilai janggal (>3× median area) |", "|---|---|---|---|"]
        for c in commodities:
            out.append(f"| {c} | {len(per_com[c])} | {pct(cells[c], len(per_com[c]) * days)} | {odd[c]} |")

    # SP2KP regency -> Pantara region mapping.
    with (DATA / "sp2kp/region_map.csv").open(encoding="utf-8") as f:
        mapping = list(csv.DictReader(f))
    methods = defaultdict(int)
    for m in mapping:
        methods[m["method"].split()[0]] += 1
    out += ["", "## Pencocokan kab/kota SP2KP → Pantara", "- " + ", ".join(f"{k}: {v}" for k, v in sorted(methods.items()))]

    # Cross-check SP2KP province vs PIHPS.
    header, rows = read_wide(DATA / "sp2kp/province_prices.csv.gz")
    ratios = defaultdict(list)
    for r in rows:
        prov = r[1]
        if prov.startswith("9"):
            continue  # SP2KP uses the post-2022 Papua codes; PIHPS the old ones
        for c, v in zip(header[2:], r[2:]):
            p = pihps_prices.get((r[0], prov, c))
            if v and p:
                ratios[c].append(float(v) / p)
    out += ["", "## SP2KP vs PIHPS (provinsi, hari yang sama)", "",
            "| Komoditas | Pasangan data | Median SP2KP ÷ PIHPS | 10%–90% |", "|---|---|---|---|"]
    for c in sorted(ratios):
        v = sorted(ratios[c])
        out.append(f"| {c} | {len(v):,} | {statistics.median(v):.3f} | {v[len(v) // 10]:.2f}–{v[len(v) * 9 // 10]:.2f} |")

    # Weather and climate.
    w = DATA / "weather/province_daily.csv"
    if w.exists():
        with w.open(encoding="utf-8") as f:
            wr = list(csv.DictReader(f))
        nulls = sum(1 for r in wr if r["precipitation_sum"] in ("", "None"))
        out += ["", "## Open-Meteo (cuaca harian per provinsi)",
                f"- {len(wr):,} baris, {len({r['province_id'] for r in wr})} provinsi, {wr[0]['date']} s/d {wr[-1]['date']}, curah hujan kosong: {nulls}"]
    roni = DATA / "climate/roni.csv"
    if roni.exists():
        with roni.open(encoding="utf-8") as f:
            rr = list(csv.DictReader(f))
        out += ["", "## RONI (ENSO)", f"- {len(rr)} musim, {rr[0]['year']}–{rr[-1]['year']}, terbaru {rr[-1]['season']} {rr[-1]['year']} = {float(rr[-1]['anom']):+.2f} ({rr[-1]['phase']})"]
    bmkg = sorted((DATA / "bmkg").glob("forecast_*.csv"))
    if bmkg:
        out += ["", "## BMKG (prakiraan 3 hari)", f"- Sampel: {bmkg[-1].name}. Butuh daftar kode desa (adm4) per kab/kota untuk cakupan penuh."]

    path = DATA / "COVERAGE.md"
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()

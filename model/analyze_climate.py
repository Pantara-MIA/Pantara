"""Does rain or ENSO move food prices? Evidence for the climate-risk index.

Inputs : model/data/pihps/province_prices.csv (2020–2026), model/data/weather/
         province_daily.csv (2018–2026), model/data/climate/roni.csv
Output : model/data/climate/analysis.md (readable) and data/climate/effects.csv —
         commodity_id,driver,lead_months,effect_pct,lo_pct,hi_pct,n,significant —
         which the server uses to explain climate risk per commodity.

Per province × commodity × month (2020-04 .. last full month):
  rain90  = rain over the last 3 months ÷ normal for those calendar months
            (normal = 2018–2025 mean for the province), BMKG classes:
            < 85% below normal, 85–115% normal, > 115% above normal
  fwd     = log change of the monthly mean price over the NEXT `lead` months
  roni    = RONI of the season centred on the month
Reported, pooled over provinces: mean forward change by rain class, its
difference vs normal (with a rough 95% interval from a province bootstrap),
and the same by ENSO phase. Correlation is not causation; seasonality is
removed by comparing each month with the same calendar month's average change.

Usage: python analyze_climate.py [--lead 2]
"""
import argparse
import csv
import math
import random
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"


def month_key(d):
    return d[:7]


def add_months(m, k):
    y, mo = int(m[:4]), int(m[5:]) + k
    y += (mo - 1) // 12
    mo = (mo - 1) % 12 + 1
    return f"{y:04d}-{mo:02d}"


def rain_class(pct):
    return "bawah normal" if pct < 0.85 else "atas normal" if pct > 1.15 else "normal"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lead", type=int, default=2)
    args = ap.parse_args()

    # Monthly rain per province and its 2018–2025 normal per calendar month.
    rain = defaultdict(float)
    with (DATA / "weather/province_daily.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["precipitation_sum"] not in ("", "None"):
                rain[(r["province_id"], month_key(r["date"]))] += float(r["precipitation_sum"])
    normal = defaultdict(list)
    for (prov, m), v in rain.items():
        if "2018" <= m[:4] <= "2025":
            normal[(prov, m[5:])].append(v)
    normal = {k: statistics.mean(v) for k, v in normal.items()}

    def rain90(prov, m):
        months = [add_months(m, -i) for i in range(3)]
        if any((prov, x) not in rain for x in months):
            return None
        got = sum(rain[(prov, x)] for x in months)
        norm = sum(normal[(prov, x[5:])] for x in months)
        return got / norm if norm else None

    roni = {}
    with (DATA / "climate/roni.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            roni[f"{int(r['year']):04d}-{int(r['month']):02d}"] = float(r["anom"])

    # Monthly mean prices.
    sums = defaultdict(lambda: [0.0, 0])
    with (DATA / "pihps/province_prices.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            s = sums[(r["commodity_id"], r["province_id"], month_key(r["date"]))]
            s[0] += float(r["price"])
            s[1] += 1
    price = {k: v[0] / v[1] for k, v in sums.items() if v[1] >= 10}

    rows = []  # (commodity, province, month, fwd, rain_pct, roni)
    for (c, prov, m), p in price.items():
        later = price.get((c, prov, add_months(m, args.lead)))
        r90 = rain90(prov, m)
        if later is None or r90 is None or m not in roni:
            continue
        rows.append((c, prov, m, math.log(later / p), r90, roni[m]))

    # Remove seasonality: subtract the commodity × province × calendar-month mean change.
    seas = defaultdict(list)
    for c, prov, m, fwd, _, _ in rows:
        seas[(c, prov, m[5:])].append(fwd)
    seas = {k: statistics.mean(v) for k, v in seas.items()}
    rows = [(c, prov, m, fwd - seas[(c, prov, m[5:])], r, e) for c, prov, m, fwd, r, e in rows]

    def effect(sub, test):
        """Mean deseasonalised change when test(row) minus when not, bootstrap over provinces."""
        provs = sorted({r[1] for r in sub})
        def diff(sample):
            a = [r[3] for r in sample if test(r)]
            b = [r[3] for r in sample if not test(r)]
            return (statistics.mean(a) - statistics.mean(b)) if len(a) > 5 and len(b) > 5 else None
        point = diff(sub)
        by_prov = defaultdict(list)
        for r in sub:
            by_prov[r[1]].append(r)
        rng = random.Random(7)
        boots = []
        for _ in range(300):
            sample = [r for p in (rng.choice(provs) for _ in provs) for r in by_prov[p]]
            d = diff(sample)
            if d is not None:
                boots.append(d)
        boots.sort()
        lo, hi = (boots[int(len(boots) * 0.025)], boots[int(len(boots) * 0.975)]) if boots else (None, None)
        n = sum(1 for r in sub if test(r))
        return point, lo, hi, n

    def fmt(e):
        point, lo, hi, n = e
        if point is None:
            return "–"
        sig = " **" if lo is not None and (lo > 0 or hi < 0) else ""
        return f"{point * 100:+.1f}% ({lo * 100:+.1f}…{hi * 100:+.1f}) n={n}{sig}"

    out = [
        "# Analisis iklim vs harga (PIHPS provinsi)",
        "",
        f"Perubahan harga {args.lead} bulan ke depan setelah musim dihilangkan, dibandingkan dengan bulan lain. "
        "Interval = 95% bootstrap antarprovinsi; ** = tidak memotong nol. Korelasi, bukan sebab-akibat.",
        "",
        f"Data: {len(rows):,} provinsi-komoditas-bulan, {min(r[2] for r in rows)} s/d {max(r[2] for r in rows)}.",
        "",
        "| Komoditas | Hujan 3 bln bawah normal (<85%) | Hujan 3 bln atas normal (>115%) | El Niño (RONI ≥ 0,5) | La Niña (RONI ≤ −0,5) |",
        "|---|---|---|---|---|",
    ]
    drivers = {
        "dry": lambda r: r[4] < 0.85,
        "wet": lambda r: r[4] > 1.15,
        "el_nino": lambda r: r[5] >= 0.5,
        "la_nina": lambda r: r[5] <= -0.5,
    }
    csv_rows = []
    for c in sorted({r[0] for r in rows}):
        sub = [r for r in rows if r[0] == c]
        eff = {k: effect(sub, t) for k, t in drivers.items()}
        out.append(f"| {c} | {fmt(eff['dry'])} | {fmt(eff['wet'])} | {fmt(eff['el_nino'])} | {fmt(eff['la_nina'])} |")
        for k, (point, lo, hi, n) in eff.items():
            if point is not None:
                sig = lo is not None and (lo > 0 or hi < 0)
                csv_rows.append([c, k, args.lead, round(point * 100, 1), round(lo * 100, 1), round(hi * 100, 1), n, int(sig)])
    elnino_months = sorted({r[2] for r in rows if r[5] >= 0.5})
    out += ["", f"Catatan: bulan berstatus El Niño dalam data hanya {len(elnino_months)} ({elnino_months[0]} s/d {elnino_months[-1]}), "
            "yakni 1–2 episode, dan intervalnya dihitung antarprovinsi sehingga terlalu sempit untuk guncangan nasional yang terjadi "
            "bersamaan. Bukti El Niño lebih lemah daripada bukti anomali hujan, yang bervariasi antarprovinsi dan antarwaktu."]
    effects = HERE.parent / "data/climate/effects.csv"
    effects.parent.mkdir(parents=True, exist_ok=True)
    with effects.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["commodity_id", "driver", "lead_months", "effect_pct", "lo_pct", "hi_pct", "n", "significant"])
        w.writerows(csv_rows)
    path = DATA / "climate/analysis.md"
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()

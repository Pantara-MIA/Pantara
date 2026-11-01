"""Turn the fetched datasets into the files the Go server embeds.

Inputs : model/data/sp2kp/regency_prices.csv.gz (fetch_sp2kp.py, keyed by SP2KP code)
         model/data/sp2kp/region_map.csv (match_regions.py)
         model/data/weather/province_daily.csv (fetch_openmeteo.py)
         model/data/climate/roni.csv (fetch_roni.py)
Outputs: data/sp2kp/regency_prices.csv.gz — date,region_id,<commodity columns>,
         keyed by Pantara region ID, sorted by region then date.
         data/climate/province_rain.csv.gz — date,province_id,precipitation_mm
         data/climate/roni.csv — season,year,month,anom,phase

Cleaning: a report is treated as an entry error and dropped when it is more
than CLEAN_FACTOR away from the median of its NEIGHBOURS reports on each side
(e.g. one day at Rp150.000 between days at Rp50.000). Sustained moves — real
spikes, where the neighbours agree — are kept.

Usage: python build_app_data.py
"""
import csv
import gzip
import math
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CLEAN_FACTOR = 2.5
NEIGHBOURS = 5


def main():
    with (HERE / "data/sp2kp/region_map.csv").open(encoding="utf-8") as f:
        code_to_id = {r["regency_code"]: r["region_id"] for r in csv.DictReader(f) if r["region_id"]}

    with gzip.open(HERE / "data/sp2kp/regency_prices.csv.gz", "rt", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        commodities = header[2:]
        series = defaultdict(list)  # (region_id, commodity) -> [(date, price)]
        unmapped = set()
        for row in reader:
            rid = code_to_id.get(row[1])
            if not rid:
                unmapped.add(row[1])
                continue
            for c, v in zip(commodities, row[2:]):
                if v:
                    series[(rid, c)].append((row[0], float(v)))

    kept = defaultdict(dict)  # (region_id, date) -> {commodity: price}
    dropped = total = 0
    limit = math.log(CLEAN_FACTOR)
    for (rid, c), vals in series.items():
        vals.sort()
        for i, (d, v) in enumerate(vals):
            total += 1
            near = [x for _, x in vals[max(0, i - NEIGHBOURS) : i] + vals[i + 1 : i + 1 + NEIGHBOURS]]
            if len(near) >= 4 and abs(math.log(v / statistics.median(near))) > limit:
                dropped += 1
                continue
            kept[(rid, d)][c] = round(v)

    out = ROOT / "data/sp2kp/regency_prices.csv.gz"
    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "region_id"] + commodities)
        for (rid, d) in sorted(kept, key=lambda k: (k[0], k[1])):
            cell = kept[(rid, d)]
            w.writerow([d, rid] + [cell.get(c, "") for c in commodities])
    print(
        f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB): {len(kept):,} region-days, "
        f"{len({k[0] for k in kept})} regions; dropped {dropped} of {total:,} reports as entry errors"
        + (f"; unmapped codes: {sorted(unmapped)}" if unmapped else "")
    )


def climate():
    rows = []
    with (HERE / "data/weather/province_daily.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["precipitation_sum"] not in ("", "None"):
                rows.append([r["date"], r["province_id"], round(float(r["precipitation_sum"]), 1)])
    out = ROOT / "data/climate/province_rain.csv.gz"
    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "province_id", "precipitation_mm"])
        w.writerows(rows)
    (ROOT / "data/climate/roni.csv").write_text((HERE / "data/climate/roni.csv").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB, {len(rows):,} province-days) and data/climate/roni.csv")


if __name__ == "__main__":
    main()
    climate()

"""Fetch the Relative Oceanic Niño Index (RONI) from NOAA CPC.

Source : https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt
Output : model/data/climate/roni.csv — season,year,month,anom,phase
         `month` is the centre month of the 3-month season (DJF -> 1).
         `phase` follows the usual ±0.5 °C threshold: el_nino | la_nina | neutral
         (a single season; official episodes need 5 consecutive seasons).

Usage: python fetch_roni.py [--out model/data/climate/roni.csv]
"""
import argparse
import csv
import urllib.request
from pathlib import Path

URL = "https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt"
SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "data" / "climate" / "roni.csv"))
    args = ap.parse_args()

    req = urllib.request.Request(URL, headers={"User-Agent": "Pantara research fetcher"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8")

    rows = []
    for line in text.splitlines()[1:]:
        parts = line.split()
        if len(parts) != 3 or parts[0] not in SEASONS:
            continue
        season, year, anom = parts[0], int(parts[1]), float(parts[2])
        phase = "el_nino" if anom >= 0.5 else "la_nina" if anom <= -0.5 else "neutral"
        rows.append([season, year, SEASONS.index(season) + 1, anom, phase])

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["season", "year", "month", "anom", "phase"])
        w.writerows(rows)
    print(f"wrote {len(rows)} seasons ({rows[0][1]}–{rows[-1][1]}) to {out}; latest {rows[-1][0]} {rows[-1][1]} = {rows[-1][3]:+.2f}")


if __name__ == "__main__":
    main()

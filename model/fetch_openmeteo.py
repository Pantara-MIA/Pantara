"""Fetch daily historical weather per province from the Open-Meteo archive API.

Source : https://archive-api.open-meteo.com/v1/archive (ERA5 reanalysis, CC BY 4.0)
Output : model/data/weather/province_daily.csv —
         date,province_id,<one column per variable>
         model/data/weather/points.csv — the point used for each province
         (centre of its main landmass, checked to be on land).

The free tier weighs a request by its length (one call per 14 days of data per
location) and allows 5,000 calls per hour, so requests are paced: one province
covering 2018–today weighs ~230 calls. Responses are cached per province.

Usage: python fetch_openmeteo.py --adm1 <geoBoundaries ADM1 geojson>
                                 [--start 2018-01-01] [--end <today-7d>] [--per-hour 4500] [--merge]
       --merge keeps the rows already in province_daily.csv (new ones win), so a
       daily refresh only fetches the last few days; --adm1 can then be omitted
       (the points in points.csv are reused).
"""
import argparse
import csv
import json
import math
import ssl
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from build_province_map import NAME_TO_ID
from build_regency_maps import largest_ring, point_in_ring
from build_region_map import ring_centroid, rings_of

API = "https://archive-api.open-meteo.com/v1/archive"
VARIABLES = [
    "precipitation_sum",
    "precipitation_hours",
    "temperature_2m_mean",
    "temperature_2m_max",
    "relative_humidity_2m_mean",
    "et0_fao_evapotranspiration",
    "wind_speed_10m_max",
]
HERE = Path(__file__).resolve().parent

# Prefer certifi's CA bundle: some Windows root stores carry an expired root
# that breaks verification for this host.
try:
    import certifi

    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()


def province_codes():
    """Pantara province ID -> BPS code, from internal/regional/province.go."""
    import re

    src = (HERE.parent / "internal/regional/province.go").read_text(encoding="utf-8")
    return dict(re.findall(r'ID: "([a-z-]+)", Name: "[^"]+", Code: "(\d+)"', src))


def land_point(geom):
    ring = [p[:2] for p in largest_ring(geom)]
    cx, cy = ring_centroid(ring)
    if point_in_ring(cx, cy, ring):
        return cx, cy
    # Concave shapes (e.g. Sulawesi arms): nearest vertex pulled 5% inward.
    vx, vy = min(ring, key=lambda p: math.dist(p, (cx, cy)))
    return vx + (cx - vx) * 0.05, vy + (cy - vy) * 0.05


def weight(start, end, n_vars):
    days = (end - start).days + 1
    return max(1.0, days / 14) * max(1.0, n_vars / 10)


def fetch(pid, lat, lon, start, end, cache):
    path = cache / f"{pid}_{start}_{end}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8")), False
    q = urllib.parse.urlencode(
        {
            "latitude": f"{lat:.4f}",
            "longitude": f"{lon:.4f}",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": ",".join(VARIABLES),
            "timezone": "Asia/Jakarta",
        }
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(f"{API}?{q}", timeout=120, context=SSL_CONTEXT) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            path.write_text(json.dumps(body), encoding="utf-8")
            return body, True
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:200]
            wait = 120 if exc.code == 429 else 20
            print(f"  {pid}: HTTP {exc.code} {detail} — retry in {wait}s", flush=True)
            time.sleep(wait)
        except Exception as exc:
            print(f"  {pid}: {exc} — retry in 20s", flush=True)
            time.sleep(20)
    raise RuntimeError(f"giving up on {pid}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--adm1")
    ap.add_argument("--merge", action="store_true")
    ap.add_argument("--start", default="2018-01-01")
    ap.add_argument("--end", default=(date.today() - timedelta(days=7)).isoformat())
    ap.add_argument("--per-hour", type=float, default=4500, help="call budget per hour (free tier: 5000)")
    ap.add_argument("--cache", default=str(HERE / ".cache" / "openmeteo"))
    ap.add_argument("--out", default=str(HERE / "data" / "weather"))
    args = ap.parse_args()

    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    cache, out = Path(args.cache), Path(args.out)
    cache.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)

    codes = province_codes()
    points = []
    if args.adm1:
        features = json.loads(Path(args.adm1).read_text(encoding="utf-8"))["features"]
        for f in features:
            pid = NAME_TO_ID[f["properties"]["shapeName"]]
            lon, lat = land_point(f["geometry"])
            points.append((pid, codes[pid], lat, lon))
        points.sort()
        with (out / "points.csv").open("w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["province", "province_id", "latitude", "longitude"])
            for pid, code, lat, lon in points:
                w.writerow([pid, code, f"{lat:.4f}", f"{lon:.4f}"])
    else:
        with (out / "points.csv").open(encoding="utf-8") as fh:
            points = [(r["province"], r["province_id"], float(r["latitude"]), float(r["longitude"])) for r in csv.DictReader(fh)]

    cost = weight(start, end, len(VARIABLES))
    pause = cost / args.per_hour * 3600
    print(f"{len(points)} provinces, {start}..{end}, ~{cost:.0f} calls each, pacing {pause:.0f}s", flush=True)

    rows = []
    for i, (pid, code, lat, lon) in enumerate(points, 1):
        body, fresh = fetch(pid, lat, lon, start, end, cache)
        daily = body["daily"]
        for t, d in enumerate(daily["time"]):
            rows.append([d, code] + [daily[v][t] for v in VARIABLES])
        print(f"[{i}/{len(points)}] {pid} ({len(daily['time'])} days){'' if fresh else ' cached'}", flush=True)
        if fresh and i < len(points):
            time.sleep(pause)

    if args.merge and (out / "province_daily.csv").exists():
        fresh = {(r[0], r[1]) for r in rows}
        with (out / "province_daily.csv").open(encoding="utf-8") as fh:
            reader = csv.reader(fh)
            next(reader)
            rows += [r for r in reader if (r[0], r[1]) not in fresh]
    rows.sort()
    with (out / "province_daily.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "province_id"] + VARIABLES)
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {out / 'province_daily.csv'}")


if __name__ == "__main__":
    sys.exit(main())

"""Features for the v2 price forecaster — mirrored exactly in internal/regional/features.go.

Every feature at origin day t uses data up to t only (rain and ENSO with their
publication lag), so training rows never see the future. The holiday features
look ahead, but only at the calendar, which is decreed in advance.

Target: z = ln(p[t+h] / p[t]) / (max(sigma30_t, SIGMA_FLOOR) · √h), the same
standardised return the FHS forecaster uses; the models predict its 10/50/90%
quantiles, which then reshape the FHS distribution (see forecast.go).

Series are rebuilt from the data files the same way the Go loader does
(forward fill over a daily calendar, back fill before the first report).
"""
import csv
import gzip
import json
import math
import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

SIGMA_FLOOR = 0.003
APP_START = "2024-09-01"  # dataStart in internal/regional/data.go
RAIN_LAG_DAYS = 7  # the weather archive trails by about a week
HOLIDAY_CAP = 120
OFF_WINDOW = 14
MIN_HISTORY = 91  # first origin index with full 90-day lookbacks
HOLIDAYS_FILE = ROOT / "data/calendar/holidays.csv"  # built by fetch_holidays.py

with HOLIDAYS_FILE.open(encoding="utf-8") as _f:
    HOLIDAYS = list(csv.DictReader(_f))


def holiday_dates(holiday_id, category="libur_nasional"):
    """Sorted dates of one holiday from the calendar file (as holidayDates in Go)."""
    return sorted({r["date"] for r in HOLIDAYS if r["holiday_id"] == holiday_id and r["category"] == category})


EID_DATES = holiday_dates("idul-fitri")
ADHA_DATES = holiday_dates("idul-adha")
OFF_DAYS = {r["date"] for r in HOLIDAYS}  # libur nasional and cuti bersama


def commodity_order():
    """Commodity IDs in the order of internal/regional/commodity.go."""
    src = (ROOT / "internal/regional/commodity.go").read_text(encoding="utf-8")
    return re.findall(r'\{ID: "([a-z-]+)", Name:', src)


COMMODITIES = commodity_order()
BASE_FEATURES = [
    "h", "sigma30", "sigma90", "r1", "r7", "r30", "r90", "dev_med90",
    "gap_ref", "regulated", "gap_neighbor", "gap_scope", "doy_sin", "doy_cos",
    "days_to_eid", "days_since_eid", "days_to_adha", "days_since_adha", "off_days_next14",
    "rain30", "rain90", "roni", "parent_r30",
]
FEATURES = BASE_FEATURES + [f"is_{c}" for c in COMMODITIES]


# ── Master data parsed from the Go sources ──────────────────────────────────

def _go(path):
    return (ROOT / path).read_text(encoding="utf-8")


def province_codes():
    return dict(re.findall(r'ID: "([a-z-]+)", Name: "[^"]+", Code: "(\d+)"', _go("internal/regional/province.go")))


def _borders(src, var):
    block = src[src.index(f"var {var} = map[string][]string{{"):]
    block = block[: block.index("\n}\n")]
    adj = defaultdict(set)
    for a, rest in re.findall(r'"([a-z-]+)":\s*\{([^}]*)\}', block):
        for b in re.findall(r'"([a-z-]+)"', rest):
            adj[a].add(b)
            adj[b].add(a)
    return adj


def province_neighbors():
    return _borders(_go("internal/regional/province.go"), "provinceBorders")


def price_zones():
    src = _go("internal/regional/province.go")
    block = src[src.index("var priceZone"):]
    block = block[: block.index("\n}\n")]
    return {k: int(v) for k, v in re.findall(r'"([a-z-]+)":\s*(\d)', block)}


def regency_scopes():
    """province id -> ([region ids], {region: set(neighbors)}), West Java included."""
    out = {}
    for p in json.loads((ROOT / "data/regions/regencies.json").read_text(encoding="utf-8")):
        out[p["province"]] = ([r["id"] for r in p["regions"]], {r["id"]: set(r["neighbors"]) for r in p["regions"]})
    src = _go("internal/regional/region.go")
    ids = re.findall(r'\{ID: "([a-z-]+)", Name: "[^"]+", Type: "(?:regency|city)"', src)
    out["jawa-barat"] = (ids, _borders(src, "jabarBorders"))
    return out


def references():
    """{(commodity, source or ''): {'type', 'value', 'zones'}} from data/reference_prices.csv."""
    refs = {}
    with (ROOT / "data/reference_prices.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            key = (r["commodity_id"], r.get("source") or "")
            ref = refs.setdefault(key, {"type": r["type"], "value": None, "zones": {}})
            if r["zone"]:
                ref["zones"][int(r["zone"])] = float(r["value"])
            else:
                ref["type"], ref["value"] = r["type"], float(r["value"])
    return refs


# ── Series ──────────────────────────────────────────────────────────────────

def calendar(start, end):
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    return [(d0 + timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]


def fill_series(raw, days, outlier, coverage=None):
    """Mirror of fillSeries in internal/regional/pihps.go (None when too sparse).
    coverage = (first, last) day of the window the completeness rule is judged
    on; default the whole calendar. Use the server's calendar so both sides keep
    the same series."""
    window = calendar(*coverage) if coverage else days
    weekdays = sum(1 for d in window if date.fromisoformat(d).weekday() < 5)
    in_cal = sum(1 for d in raw if window[0] <= d <= window[-1])
    if in_cal < 0.5 * weekdays:
        return None
    mid = float(np.median(list(raw.values()))) if outlier > 0 else 0.0
    out = np.zeros(len(days))
    prev, first = 0.0, -1
    for t, d in enumerate(days):
        v = raw.get(d)
        if v is not None and (outlier <= 0 or (mid / outlier < v < mid * outlier)):
            prev = v
            if first < 0:
                first = t
        out[t] = prev
    if first < 0:
        return None
    out[:first] = out[first]
    return out


def load_province_series(path=HERE / "data/pihps/province_prices.csv"):
    """(days, {commodity: {province_id: series}}) from the long PIHPS file."""
    code_to_id = {v: k for k, v in province_codes().items()}
    raw = defaultdict(dict)
    last = ""
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pid = code_to_id.get(r["province_id"])
            if pid and r["commodity_id"] in COMMODITIES:
                raw[(r["commodity_id"], pid)][r["date"]] = float(r["price"])
                last = max(last, r["date"])
    days = calendar(min(d for v in raw.values() for d in v), last)
    series = defaultdict(dict)
    for (c, pid), obs in raw.items():
        s = fill_series(obs, days, 3)
        if s is not None:
            series[c][pid] = s
    return days, series


def load_regency_series(path=ROOT / "data/sp2kp/regency_prices.csv.gz", coverage=None):
    """(days, {commodity: {region_id: series}}) from the cleaned SP2KP app file;
    coverage is passed to fill_series."""
    raw = defaultdict(dict)
    with gzip.open(path, "rt", encoding="utf-8") as f:
        r = csv.reader(f)
        header = next(r)
        cols = header[2:]
        for row in r:
            for c, v in zip(cols, row[2:]):
                if v:
                    raw[(c, row[1])][row[0]] = float(v)
    first = min(d for v in raw.values() for d in v)
    last = max(d for v in raw.values() for d in v)
    days = calendar(first, last)
    series = defaultdict(dict)
    for (c, rid), obs in raw.items():
        s = fill_series(obs, days, 0, coverage)
        if s is not None:
            series[c][rid] = s
    return days, series


# ── Climate ─────────────────────────────────────────────────────────────────

class Climate:
    """Rain vs normal (app file, as the server sees it) and RONI with its lag."""

    def __init__(self):
        rain = defaultdict(dict)
        with gzip.open(ROOT / "data/climate/province_rain.csv.gz", "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                rain[r["province_id"]][r["date"]] = float(r["precipitation_mm"])
        self.rain = rain
        self.normal = {}
        for code, obs in rain.items():
            monthly = defaultdict(float)
            for d, v in obs.items():
                monthly[d[:7]] += v
            sums, counts = defaultdict(float), defaultdict(int)
            for m, v in monthly.items():
                if "2018" <= m[:4] <= "2025":
                    sums[int(m[5:])] += v
                    counts[int(m[5:])] += 1
            self.normal[code] = {mo: sums[mo] / counts[mo] for mo in counts}
        self.roni = []
        with (ROOT / "data/climate/roni.csv").open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                self.roni.append((int(r["year"]) * 12 + int(r["month"]), float(r["anom"])))
        self.roni.sort()
        self._cache = {}

    def ratio(self, code, end, days):
        """Rain over `days` days ending at `end` ÷ normal; 1.0 when unknown (as in Go)."""
        key = (code, end, days)
        if key in self._cache:
            return self._cache[key]
        obs, normal = self.rain.get(code), self.normal.get(code)
        val = 1.0
        if obs and normal:
            d_end = date.fromisoformat(end)
            got = want = 0.0
            ok = True
            for i in range(days):
                d = d_end - timedelta(days=i)
                v = obs.get(d.isoformat())
                if v is None:
                    ok = False
                    break
                got += v
                nxt = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
                want += normal.get(d.month, 0) / (nxt - timedelta(days=1)).day
            if ok and want > 0:
                val = got / want
        self._cache[key] = val
        return val

    def roni_at(self, d):
        limit = date.fromisoformat(d)
        limit = limit.year * 12 + limit.month
        best = 0.0
        for key, anom in self.roni:
            if key + 2 <= limit:
                best = anom
        return best


def holiday_distances(d, holiday_list):
    """(days to the next, days since the last) holiday in the list, capped."""
    day = date.fromisoformat(d)
    to = since = HOLIDAY_CAP
    for e in holiday_list:
        diff = (date.fromisoformat(e) - day).days
        if diff >= 0:
            to = min(to, diff)
        else:
            since = min(since, -diff)
    return min(to, HOLIDAY_CAP), min(since, HOLIDAY_CAP)


def off_days_ahead(d, n=OFF_WINDOW):
    """Holidays and collective leave days in (d, d+n]."""
    day = date.fromisoformat(d)
    return float(sum((day + timedelta(days=i)).isoformat() in OFF_DAYS for i in range(1, n + 1)))


# ── Feature matrix ──────────────────────────────────────────────────────────

def calendar_features(days, climate):
    """Features shared by every series on one calendar."""
    doy = np.array([date.fromisoformat(d).timetuple().tm_yday for d in days], dtype=float)
    eid = np.array([holiday_distances(d, EID_DATES) for d in days], dtype=float)
    adha = np.array([holiday_distances(d, ADHA_DATES) for d in days], dtype=float)
    return {
        "doy_sin": np.sin(2 * math.pi * doy / 365.25),
        "doy_cos": np.cos(2 * math.pi * doy / 365.25),
        "days_to_eid": eid[:, 0],
        "days_since_eid": eid[:, 1],
        "days_to_adha": adha[:, 0],
        "days_since_adha": adha[:, 1],
        "off_days_next14": np.array([off_days_ahead(d) for d in days]),
        "roni": np.array([climate.roni_at(d) for d in days]),
    }


def rain_features(days, code, climate):
    """(rain30, rain90) per day for one province, lagged by RAIN_LAG_DAYS."""
    lagged = [(date.fromisoformat(d) - timedelta(days=RAIN_LAG_DAYS)).isoformat() for d in days]
    return (np.array([climate.ratio(code, d, 30) for d in lagged]), np.array([climate.ratio(code, d, 90) for d in lagged]))


def series_features(p, nb, sm, ceiling, parent, cal, rain, commodity):
    """Per-day base features (except h) for one series; rows before MIN_HISTORY are NaN."""
    n = len(p)
    lp = np.log(p)
    ret = np.diff(lp, prepend=lp[0])
    s = pd.Series(ret)
    sigma30 = s.rolling(30).std(ddof=1).to_numpy()
    sigma90 = s.rolling(90).std(ddof=1).to_numpy()
    med90 = pd.Series(p).rolling(90).median().shift(1).to_numpy()

    def lag(a, k):
        out = np.full(n, np.nan)
        out[k:] = a[k:] - a[:-k]
        return out

    f = {
        "sigma30": sigma30,
        "sigma90": sigma90,
        "r1": lag(lp, 1),
        "r7": lag(lp, 7),
        "r30": lag(lp, 30),
        "r90": lag(lp, 90),
        "dev_med90": lp - np.log(med90),
        "gap_ref": (lp - np.log(ceiling)) if ceiling is not None else np.zeros(n),
        "regulated": np.full(n, 1.0 if ceiling is not None else 0.0),
        "gap_neighbor": (lp - np.log(nb)) if nb is not None else np.zeros(n),
        "gap_scope": lp - np.log(sm),
        "parent_r30": lag(np.log(parent), 30) if parent is not None else np.zeros(n),
        "rain30": rain[0],
        "rain90": rain[1],
    }
    f.update({k: v.copy() for k, v in cal.items()})
    for c in COMMODITIES:
        f[f"is_{c}"] = np.full(n, 1.0 if c == commodity else 0.0)
    for k in f:
        f[k][:MIN_HISTORY] = np.nan
    return f


def ceiling_series(refs, commodity, source, zone, n):
    ref = refs.get((commodity, source)) or refs.get((commodity, ""))
    if not ref or ref["type"] == "baseline" or ref["value"] is None:
        return None
    return np.full(n, ref["zones"].get(zone, ref["value"]))


def scope_medians(by_region):
    """Daily median across the regions with data (as Scope.median in Go)."""
    return np.median(np.vstack(list(by_region.values())), axis=0)


def neighbor_median(by_region, neighbors, rid):
    rows = [by_region[o] for o in neighbors.get(rid, ()) if o in by_region]
    return np.median(np.vstack(rows), axis=0) if rows else None

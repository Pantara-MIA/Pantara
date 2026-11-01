"""Fetch daily traditional-market prices per province from PIHPS (Bank Indonesia).

Source : https://www.bi.go.id/hargapangan (Tabel Harga > Pasar Tradisional > Daerah)
Output : data/pihps/province_prices.csv — date,province_id,commodity_id,price
         (one row per reported day; weekends/holidays are absent and are
         forward-filled by the Go loader).

Raw responses are cached per (province, chunk) so an interrupted run resumes.
Only the standard library is used.

Usage: python fetch_pihps.py [--start 2024-09-01] [--end 2026-10-28]
                             [--cache .cache/pihps] [--out ../data/pihps/province_prices.csv]
                             [--workers 2] [--merge-with existing.csv ...]

--merge-with unions earlier output files into --out (newly fetched rows win),
so a history backfill can be added without refetching what is cached.
"""
import argparse
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

BASE = "https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah"

# PIHPS province id -> Pantara province id (BPS code based, see region.go).
PROVINCES = {
    1: "11", 2: "12", 3: "13", 4: "14", 5: "21", 6: "15", 7: "17", 8: "16",
    9: "19", 10: "18", 11: "36", 12: "32", 13: "31", 14: "33", 15: "34",
    16: "35", 17: "51", 18: "52", 19: "53", 20: "61", 21: "63", 22: "62",
    23: "64", 24: "65", 25: "75", 26: "73", 27: "74", 28: "72", 29: "71",
    30: "76", 31: "81", 32: "82", 33: "94", 34: "91",
}

# Pantara commodity id -> PIHPS commodity ids (averaged when several).
COMMODITIES = {
    "beras-medium": ["com_3", "com_4"],
    "beras-premium": ["com_5", "com_6"],
    "daging-ayam-ras": ["com_7"],
    "daging-sapi": ["com_8"],
    "telur-ayam-ras": ["com_10"],
    "bawang-merah": ["com_11"],
    "bawang-putih": ["com_12"],
    "cabai-merah-besar": ["com_13"],
    "cabai-merah-keriting": ["com_14"],
    "cabai-rawit-hijau": ["com_15"],
    "cabai-rawit-merah": ["com_16"],
    "minyak-goreng": ["com_19"],
    "gula-pasir": ["com_21"],
}

# PIHPS row names for each commodity id, used to read the grid response.
PIHPS_NAMES = {
    "com_3": "Beras Kualitas Medium I", "com_4": "Beras Kualitas Medium II",
    "com_5": "Beras Kualitas Super I", "com_6": "Beras Kualitas Super II",
    "com_7": "Daging Ayam Ras Segar", "com_8": "Daging Sapi Kualitas 1",
    "com_10": "Telur Ayam Ras Segar", "com_11": "Bawang Merah Ukuran Sedang",
    "com_12": "Bawang Putih Ukuran Sedang", "com_13": "Cabai Merah Besar",
    "com_14": "Cabai Merah Keriting", "com_15": "Cabai Rawit Hijau",
    "com_16": "Cabai Rawit Merah", "com_19": "Minyak Goreng Kemasan Bermerk 2",
    "com_21": "Gula Pasir Lokal",
}


def chunks(start: date, end: date, months: int = 6):
    cur = start
    while cur <= end:
        nxt = date(cur.year + (cur.month - 1 + months) // 12, (cur.month - 1 + months) % 12 + 1, 1)
        yield cur, min(end, nxt - timedelta(days=1))
        cur = nxt


def fetch(pihps_prov: int, start: date, end: date, cache: Path) -> dict:
    path = cache / f"p{pihps_prov}_{start:%Y%m%d}_{end:%Y%m%d}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    ids = sorted({i for v in COMMODITIES.values() for i in v}, key=lambda s: int(s[4:]))
    params = {
        "price_type_id": "1", "comcat_id": ",".join(ids), "province_id": str(pihps_prov),
        "regency_id": "", "market_id": "", "tipe_laporan": "1",
        "start_date": start.isoformat(), "end_date": end.isoformat(),
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Pantara research fetcher"})
            with urllib.request.urlopen(req, timeout=300) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            path.write_text(json.dumps(body), encoding="utf-8")
            return body
        except Exception as exc:  # network hiccups and timeouts: back off and retry
            print(f"  province {pihps_prov} {start}..{end}: {exc} (attempt {attempt + 1})", flush=True)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"giving up on province {pihps_prov} {start}..{end}")


def parse_price(s):
    if s in (None, "", "-"):
        return None
    v = float(str(s).replace(",", ""))
    return v if v > 0 else None


def rows_from(body: dict, province_id: str):
    by_name = {r["name"].strip(): r for r in body.get("data", []) if r.get("level") == 2}
    for cid, pids in COMMODITIES.items():
        series = [by_name.get(PIHPS_NAMES[p]) for p in pids]
        series = [s for s in series if s]
        if not series:
            continue
        days = sorted({k for s in series for k in s if "/" in k})
        for d in days:
            vals = [v for v in (parse_price(s.get(d)) for s in series) if v is not None]
            if not vals:
                continue
            dd, mm, yyyy = d.split("/")
            yield f"{yyyy}-{mm}-{dd}", province_id, cid, round(sum(vals) / len(vals))


def main():
    ap = argparse.ArgumentParser()
    here = Path(__file__).resolve().parent
    ap.add_argument("--start", default="2024-09-01")
    ap.add_argument("--end", default=date.today().isoformat())
    ap.add_argument("--cache", default=str(here / ".cache" / "pihps"))
    ap.add_argument("--out", default=str(here.parent / "data" / "pihps" / "province_prices.csv"))
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--merge-with", nargs="*", default=[])
    args = ap.parse_args()

    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    spans = list(chunks(date.fromisoformat(args.start), date.fromisoformat(args.end)))
    jobs = [(p, s, e) for p in PROVINCES for s, e in spans]
    print(f"{len(jobs)} requests ({len(PROVINCES)} provinces × {len(spans)} chunks)", flush=True)

    done = 0

    def run(job):
        nonlocal done
        body = fetch(*job, cache)
        done += 1
        print(f"[{done}/{len(jobs)}] province {job[0]} {job[1]}..{job[2]}", flush=True)
        return job[0], body

    out_rows = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for pihps_prov, body in pool.map(run, jobs):
            out_rows.extend(rows_from(body, PROVINCES[pihps_prov]))

    merged = {}
    for path in args.merge_with:
        with open(path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                merged[(r["date"], r["province_id"], r["commodity_id"])] = int(float(r["price"]))
    for d, prov, cid, price in out_rows:
        merged[(d, prov, cid)] = price
    out_rows = sorted((d, prov, cid, price) for (d, prov, cid), price in merged.items())
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "province_id", "commodity_id", "price"])
        w.writerows(out_rows)
    print(f"wrote {len(out_rows)} rows to {out}")


if __name__ == "__main__":
    sys.exit(main())

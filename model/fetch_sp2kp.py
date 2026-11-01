"""Fetch daily average prices per province and regency/city from SP2KP (Kemendag).

Source : https://sp2kp.kemendag.go.id/statistik/area — the public report API
         behind it (no login): master/api/wilayah/* and
         report/api/average-price/export-area-daily-json.
Output : model/data/sp2kp/regions.csv — kode_provinsi,nama_provinsi,kode_kab_kota,nama_kab_kota
         model/data/sp2kp/regency_prices.csv.gz  — date,regency_code,<commodity columns>
         model/data/sp2kp/province_prices.csv.gz — date,province_code,<commodity columns>
         Wide format (one row per area and day); an empty cell means no report.
         SP2KP reports 0 on days without a survey, which is stored as empty.

Only the 18 SP2KP variants matching Pantara commodities are requested (a
filtered request is ~3× faster). Responses are cached per area.

History starts around February 2024.

Usage: python fetch_sp2kp.py [--start 2024-02-01] [--end today] [--workers 4] [--merge]
       --merge keeps the rows already in the output files (new reports win),
       so another period can be added without refetching.
"""
import argparse
import csv
import gzip
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

MASTER = "https://api-sp2kp.kemendag.go.id/master/api"
REPORT = "https://api-sp2kp.kemendag.go.id/report/api/average-price/export-area-daily-json"
HERE = Path(__file__).resolve().parent

# SP2KP variant id -> Pantara commodity id.
VARIANTS = {
    52: "beras-medium",
    51: "beras-premium",
    1: "beras-sphp",
    2: "cabai-merah-keriting",
    9: "cabai-merah-besar",
    10: "cabai-rawit-merah",
    11: "cabai-rawit-hijau",
    13: "bawang-merah",
    38: "bawang-putih",  # Bawang Putih Honan
    37: "bawang-bombay",
    14: "gula-pasir",  # Gula Pasir Curah
    18: "minyak-goreng",  # Minyakita
    27: "daging-ayam-ras",
    25: "telur-ayam-ras",
    19: "daging-sapi",  # Paha Belakang
    56: "tomat",
    57: "kentang",  # Kentang Sedang
    5: "sawi-hijau",
}
COMMODITIES = sorted(set(VARIANTS.values()))
UA = {"User-Agent": "Pantara research fetcher"}


def get_json(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            print(f"  GET {url}: {exc} (attempt {attempt + 1})", flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"giving up on {url}")


def post_form(url, fields):
    boundary = uuid.uuid4().hex
    body = b"".join(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode("utf-8") for k, v in fields.items()
    ) + f"--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={**UA, "Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_area(level, prov, kab, start, end, cache):
    path = cache / f"l{level}_{prov}_{kab or 'all'}_{start}_{end}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    fields = {
        "start_date": start, "end_date": end, "level": level,
        "variant_ids": ",".join(str(v) for v in VARIANTS),
        "kode_provinsi": prov, "kode_kab_kota": kab, "pasar_id": "",
        "skip_sat_sun": 0, "tipe_komoditas": 1,
    }
    for attempt in range(4):
        try:
            body = post_form(REPORT, fields)
            path.write_text(json.dumps(body), encoding="utf-8")
            return body
        except Exception as exc:
            print(f"  level {level} {prov}/{kab}: {exc} (attempt {attempt + 1})", flush=True)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"giving up on {prov}/{kab}")


def wide_rows(code, body):
    """{date: {commodity: price}} for one area, prices > 0 only."""
    by_day = {}
    for v in body.get("data") or []:
        cid = VARIANTS.get(v.get("variant_id"))
        if not cid:
            continue
        for p in v.get("daftarHarga") or []:
            if p.get("harga"):
                by_day.setdefault(p["date"], {})[cid] = round(p["harga"])
    return [[d, code] + [day.get(c, "") for c in COMMODITIES] for d, day in sorted(by_day.items())]


def read_gz(path):
    if not path.exists():
        return {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        r = csv.reader(f)
        header = next(r)
        return {(row[0], row[1]): dict(zip(header[2:], row[2:])) for row in r}


def merge_rows(path, rows):
    merged = read_gz(path)
    for row in rows:
        cell = merged.setdefault((row[0], row[1]), {})
        for c, v in zip(COMMODITIES, row[2:]):
            if v != "":
                cell[c] = v
    return [[d, code] + [cell.get(c, "") for c in COMMODITIES] for (d, code), cell in merged.items()]


def write_gz(path, key, rows):
    with gzip.open(path, "wt", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", key] + COMMODITIES)
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2024-02-01")
    ap.add_argument("--end", default=date.today().isoformat())
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--cache", default=str(HERE / ".cache" / "sp2kp"))
    ap.add_argument("--out", default=str(HERE / "data" / "sp2kp"))
    ap.add_argument("--merge", action="store_true")
    args = ap.parse_args()
    cache, out = Path(args.cache), Path(args.out)
    cache.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)

    provinces = get_json(f"{MASTER}/wilayah/provinsi")["data"]
    regions = []
    for p in provinces:
        for k in get_json(f"{MASTER}/wilayah/kab-kota/{p['kode_provinsi']}")["data"] or []:
            regions.append((p["kode_provinsi"], p["nama_provinsi"], k["kode_kab_kota"], k["nama_kab_kota"]))
    with (out / "regions.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["kode_provinsi", "nama_provinsi", "kode_kab_kota", "nama_kab_kota"])
        w.writerows(regions)
    print(f"{len(provinces)} provinces, {len(regions)} regencies/cities", flush=True)

    jobs = [(1, p["kode_provinsi"], "") for p in provinces] + [(2, prov, kab) for prov, _, kab, _ in regions]
    done = 0
    t0 = time.time()

    def run(job):
        nonlocal done
        body = fetch_area(*job, args.start, args.end, cache)
        done += 1
        if done % 20 == 0 or done == len(jobs):
            print(f"[{done}/{len(jobs)}] {time.time() - t0:.0f}s", flush=True)
        return job, body

    prov_rows, kab_rows, empty = [], [], []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for (level, prov, kab), body in pool.map(run, jobs):
            rows = wide_rows(prov if level == 1 else kab, body)
            if not rows:
                empty.append(prov if level == 1 else kab)
            (prov_rows if level == 1 else kab_rows).extend(rows)

    if args.merge:
        prov_rows = merge_rows(out / "province_prices.csv.gz", prov_rows)
        kab_rows = merge_rows(out / "regency_prices.csv.gz", kab_rows)
    write_gz(out / "province_prices.csv.gz", "province_code", sorted(prov_rows))
    write_gz(out / "regency_prices.csv.gz", "regency_code", sorted(kab_rows, key=lambda r: (r[1], r[0])))
    print(f"wrote {len(prov_rows)} province-days and {len(kab_rows)} regency-days; {len(empty)} areas without data: {empty[:20]}")


if __name__ == "__main__":
    sys.exit(main())

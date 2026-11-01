"""Fetch the 3-day BMKG weather forecast for a list of villages (adm4 codes).

Source : https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=<kode> (BMKG open
         data; cite BMKG as the source). 3-hourly steps for 3 days; adm4 is the
         Kemendagri village code, e.g. 31.71.03.1001 (Kemayoran, Jakarta Pusat).
         Only adm4 is accepted, and the API allows 60 requests/minute per IP.
Output : model/data/bmkg/forecast_<analysis date>.csv —
         adm4,adm2,kotkab,local_datetime,t,hu,tp,tcc,ws,wd,weather_desc

Not used: publik.bmkg.go.id/event/dwt (Digital Weather for Traffic) only
nowcasts 0–18 h along transport routes, keeps no history and sits behind a
bot challenge, so it cannot train or feed the models.

Usage: python fetch_bmkg.py 31.71.03.1001 [more codes...]  |  --codes-file codes.txt
"""
import argparse
import csv
import json
import sys
import time
import urllib.request
from pathlib import Path

API = "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4="
FIELDS = ["t", "hu", "tp", "tcc", "ws", "wd", "weather_desc"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codes", nargs="*")
    ap.add_argument("--codes-file")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "data" / "bmkg"))
    args = ap.parse_args()
    codes = list(args.codes)
    if args.codes_file:
        codes += [c.strip() for c in Path(args.codes_file).read_text(encoding="utf-8").split() if c.strip()]
    if not codes:
        ap.error("give at least one adm4 code")

    rows, analysis = [], ""
    for i, code in enumerate(codes):
        req = urllib.request.Request(API + code, headers={"User-Agent": "Pantara research fetcher"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            print(f"  {code}: {exc}", flush=True)
            continue
        loc = body.get("lokasi", {})
        for day in (body.get("data") or [{}])[0].get("cuaca", []):
            for step in day:
                analysis = analysis or step.get("analysis_date", "")[:10]
                rows.append([code, loc.get("adm2"), loc.get("kotkab"), step.get("local_datetime")] + [step.get(f) for f in FIELDS])
        if i < len(codes) - 1:
            time.sleep(1.1)  # stay under 60 requests/minute

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"forecast_{analysis or 'unknown'}.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["adm4", "adm2", "kotkab", "local_datetime"] + FIELDS)
        w.writerows(rows)
    print(f"wrote {len(rows)} forecast steps for {len(codes)} locations to {path}")


if __name__ == "__main__":
    sys.exit(main())

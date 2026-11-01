"""Daily data refresh: fetch what is new from every source and rebuild the app data.

Steps (each fetcher keeps its cache, so a rerun after a failure is cheap):
  1. PIHPS      — the last OVERLAP_DAYS up to today, merged into the long file;
                  data/pihps/province_prices.csv (the server's copy) is rewritten
                  from APP_START onwards.
  2. SP2KP      — the last OVERLAP_DAYS, merged.
  3. Open-Meteo — the last OVERLAP_DAYS of the archive (it trails by ~7 days), merged.
  4. RONI       — refetched whole (one small file).
  5. build_app_data.py — cleaned SP2KP, rain and RONI for the server.
  6. train_forecast.py --parity-only — rebuild the feature rows the Go parity
     test checks against the new data (skipped with --retrain, which redoes them).
  Optional:
  --climate  analyze_climate.py: refresh the climate evidence table (monthly is plenty).
  --retrain  train_forecast.py --level all: retrain and re-select the v2 models
             (~12 min; weekly or monthly is plenty).
  --build    go build the server binary to OUT_BINARY (the data is embedded, so a
             rebuild + restart is what makes it live).

Usage: python refresh.py [--climate] [--retrain] [--build]
"""
import argparse
import csv
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
APP_START = "2024-09-01"  # dataStart in internal/regional/data.go
OVERLAP_DAYS = 10  # refetch a little history: late reports and corrections
OUT_BINARY = ROOT / "bin" / ("pantara.exe" if sys.platform == "win32" else "pantara")


def run(*args, cwd=HERE):
    t0 = time.time()
    print(f"$ {' '.join(str(a) for a in args)}", flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)
    print(f"  done in {time.time() - t0:.0f}s", flush=True)


def last_date(path, column="date"):
    with open(path, encoding="utf-8") as f:
        return max(r[column] for r in csv.DictReader(f))


def since(last):
    return (date.fromisoformat(last) - timedelta(days=OVERLAP_DAYS)).isoformat()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--climate", action="store_true")
    ap.add_argument("--retrain", action="store_true")
    ap.add_argument("--build", action="store_true")
    args = ap.parse_args()
    py = sys.executable
    today = date.today().isoformat()

    # 1. PIHPS.
    long_file = HERE / "data/pihps/province_prices.csv"
    run(py, "fetch_pihps.py", "--start", since(last_date(long_file)), "--end", today, "--workers", "3",
        "--out", long_file, "--merge-with", long_file)
    app_file = ROOT / "data/pihps/province_prices.csv"
    with open(long_file, encoding="utf-8") as src, open(app_file, "w", newline="", encoding="utf-8") as dst:
        reader, writer = csv.reader(src), csv.writer(dst)
        writer.writerow(next(reader))
        writer.writerows(r for r in reader if r[0] >= APP_START)
    print(f"  wrote {app_file} from {APP_START}", flush=True)

    # 2. SP2KP (its own last date lives in the gzip; the PIHPS date is close enough).
    run(py, "fetch_sp2kp.py", "--start", since(last_date(long_file)), "--end", today, "--merge")

    # 3. Open-Meteo, up to a week ago.
    weather = HERE / "data/weather/province_daily.csv"
    end = (date.today() - timedelta(days=7)).isoformat()
    start = since(last_date(weather))
    if start <= end:
        run(py, "fetch_openmeteo.py", "--start", start, "--end", end, "--merge")

    # 4. RONI.
    run(py, "fetch_roni.py")

    # 5. Server data.
    run(py, "match_regions.py")
    run(py, "build_app_data.py")

    if args.climate:
        run(py, "analyze_climate.py", "--lead", "2")
    if args.retrain:
        run(py, "train_forecast.py", "--level", "all")
    else:
        # New data shifts the Go/Python feature check; the models stay as they are.
        run(py, "train_forecast.py", "--parity-only")
    if args.build:
        OUT_BINARY.parent.mkdir(exist_ok=True)
        run("go", "build", "-o", OUT_BINARY, "./cmd/server", cwd=ROOT)
        print(f"Restart the server to serve the new data: {OUT_BINARY}")
    else:
        print("Data refreshed. Rebuild and restart the server to serve it (or rerun with --build).")


if __name__ == "__main__":
    main()

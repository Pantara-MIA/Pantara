"""Indonesian holiday calendar for the forecaster and the server.

Source : the `holidays` library (offline, no API key): public holidays (libur
         nasional) and collective leave (cuti bersama, "government" category).
         Islamic dates are computed by the library and marked "(perkiraan)" when
         not yet decreed; check them against the SKB 3 Menteri each year.
Output : data/calendar/holidays.csv — date,holiday_id,name,category,estimated
         category = libur_nasional | cuti_bersama; a cuti bersama row carries the
         holiday_id of the holiday it belongs to.

EID_TRAINED pins the first day of Idul Fitri to the dates the current v2 models
were trained with (days_to_eid / days_since_eid); a library date that differs is
reported, not used. Update it together with a retrain (train_forecast.py).

Usage: python fetch_holidays.py [--start 2018] [--end 2028]
"""
import argparse
import csv
from datetime import date, timedelta
from pathlib import Path

import holidays

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "data/calendar/holidays.csv"

EID_TRAINED = {
    2020: "2020-05-24", 2021: "2021-05-13", 2022: "2022-05-02", 2023: "2023-04-22",
    2024: "2024-04-10", 2025: "2025-03-31", 2026: "2026-03-20", 2027: "2027-03-10",
}

IDS = {
    "Tahun Baru Masehi": "tahun-baru",
    "Isra Mikraj Nabi Muhammad": "isra-mikraj",
    "Tahun Baru Imlek": "imlek",
    "Hari Suci Nyepi": "nyepi",
    "Hari Raya Idul Fitri": "idul-fitri",
    "Hari kedua dari Hari Raya Idul Fitri": "idul-fitri-2",
    "Wafat Yesus Kristus": "wafat-yesus",
    "Kebangkitan Yesus Kristus": "paskah",
    "Hari Buruh Internasional": "hari-buruh",
    "Hari Raya Waisak": "waisak",
    "Kenaikan Yesus Kristus": "kenaikan-yesus",
    "Hari Lahir Pancasila": "pancasila",
    "Hari Raya Idul Adha": "idul-adha",
    "Tahun Baru Islam": "tahun-baru-islam",
    "Hari Kemerdekaan Republik Indonesia": "kemerdekaan",
    "Maulid Nabi Muhammad": "maulid",
    "Hari Raya Natal": "natal",
    "Hari Pemilihan Umum": "pemilu",
    "Hari Pemilihan Kepala Daerah": "pilkada",
}
LEAVE_PREFIXES = ("Cuti Bersama ", "Pegangti Cuti Bersama ")  # the second is a typo in the library
ESTIMATED = " (perkiraan)"


def holiday_id(name):
    if name not in IDS:
        raise SystemExit(f"unknown holiday name {name!r}: add it to IDS")
    return IDS[name]


def collect(years):
    rows = []
    for category, lib_category in (("libur_nasional", "public"), ("cuti_bersama", "government")):
        cal = holidays.country_holidays("ID", years=years, categories=(lib_category,), language="id")
        for day, names in cal.items():
            for name in names.split("; "):
                estimated = name.endswith(ESTIMATED)
                name = name.removesuffix(ESTIMATED)
                base = name
                for prefix in LEAVE_PREFIXES:
                    base = base.removeprefix(prefix)
                rows.append({"date": day.isoformat(), "holiday_id": holiday_id(base), "name": name,
                             "category": category, "estimated": int(estimated)})
    return rows


def pin_eid(rows):
    """Replace the library's Idul Fitri days with EID_TRAINED (day 2 = day 1 + 1)."""
    for year, pinned in EID_TRAINED.items():
        first = date.fromisoformat(pinned)
        for r in rows:
            if r["category"] != "libur_nasional" or not r["date"].startswith(str(year)):
                continue
            if r["holiday_id"] == "idul-fitri" and r["date"] != pinned:
                print(f"WARNING: Idul Fitri {year}: library {r['date']}, kept {pinned} (trained models)")
                r["date"] = pinned
            elif r["holiday_id"] == "idul-fitri-2":
                r["date"] = (first + timedelta(days=1)).isoformat()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=2018)
    ap.add_argument("--end", type=int, default=2028)
    args = ap.parse_args()
    rows = collect(range(args.start, args.end + 1))
    pin_eid(rows)
    rows.sort(key=lambda r: (r["date"], r["category"], r["holiday_id"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date", "holiday_id", "name", "category", "estimated"], lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    eid = sum(1 for r in rows if r["holiday_id"] == "idul-fitri" and r["category"] == "libur_nasional")
    print(f"{len(rows)} rows ({eid} Idul Fitri), {args.start}-{args.end} -> {OUT}")


if __name__ == "__main__":
    main()

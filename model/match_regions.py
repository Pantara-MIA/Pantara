"""Match SP2KP regency/city codes to Pantara region IDs.

Inputs : model/data/sp2kp/regions.csv (from fetch_sp2kp.py),
         data/regions/regencies.json and the West Java list in
         internal/regional/region.go (Pantara regions, BPS 2020 boundaries).
Output : model/data/sp2kp/region_map.csv — regency_code,sp2kp_name,region_id,method
         method: exact | fuzzy (similarity shown) | override | unmatched

Matching is done within the province (the four 2022 Papua provinces map back
to Papua / Papua Barat, as in PIHPS and the boundaries), on the regency/city
type plus a normalised name.

Usage: python match_regions.py
"""
import csv
import difflib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# SP2KP uses the post-2022 Papua codes (91 Papua, 92 Papua Barat, 93 Papua
# Selatan, 94 Papua Tengah, 95 Papua Pegunungan, 96 Papua Barat Daya); Pantara
# keeps the old two provinces (BPS 94 Papua, 91 Papua Barat), like PIHPS.
PAPUA_FOLD = {"91": "94", "92": "91", "93": "94", "94": "94", "95": "94", "96": "91"}

# SP2KP code -> Pantara region id, for regencies renamed after the 2020 boundaries.
OVERRIDES = {
    "1212": "kab-toba-samosir",  # renamed Kab. Toba (2020)
    "7601": "kab-mamuju-utara",  # renamed Kab. Pasangkayu (2017)
    "8103": "kab-maluku-tenggara-barat",  # renamed Kab. Kepulauan Tanimbar (2019)
}


def province_ids():
    src = (ROOT / "internal/regional/province.go").read_text(encoding="utf-8")
    return {code: pid for pid, code in re.findall(r'ID: "([a-z-]+)", Name: "[^"]+", Code: "(\d+)"', src)}


def pantara_regions():
    out = {}
    for p in json.loads((ROOT / "data/regions/regencies.json").read_text(encoding="utf-8")):
        out[p["province"]] = [(r["id"], r["name"], r["type"]) for r in p["regions"]]
    src = (ROOT / "internal/regional/region.go").read_text(encoding="utf-8")
    out["jawa-barat"] = [(i, n, t) for i, n, t in re.findall(r'\{ID: "([a-z-]+)", Name: "([^"]+)", Type: "(regency|city)"', src)]
    return out


def split(name):
    """('city'|'regency', normalised core name)."""
    n = name.lower().replace("administrasi", "").replace("adm.", "").replace("kep.", "kepulauan ")
    kind = "city" if re.match(r"\s*kota\b", n) and not re.match(r"\s*kota\s*(baru|waringin)", n) else "regency"
    n = re.sub(r"^\s*(kabupaten|kab\.?|kota)\s+", "", n)
    n = re.sub(r"[^a-z0-9]+", "", n)
    return kind, n


def main():
    provinces = province_ids()
    regions = pantara_regions()
    rows, used = [], set()
    with (HERE / "data/sp2kp/regions.csv").open(encoding="utf-8") as f:
        sp = list(csv.DictReader(f))
    for r in sp:
        code, name = r["kode_kab_kota"], r["nama_kab_kota"]
        pid = provinces.get(PAPUA_FOLD.get(r["kode_provinsi"], r["kode_provinsi"]))
        if code in OVERRIDES:
            rows.append([code, name, OVERRIDES[code], "override"])
            used.add(OVERRIDES[code])
            continue
        kind, core = split(name)
        cands = [(rid, rname) for rid, rname, rtype in regions.get(pid, []) if rtype == kind]
        exact = [rid for rid, rname in cands if split(rname)[1] == core]
        if len(exact) == 1:
            rows.append([code, name, exact[0], "exact"])
            used.add(exact[0])
            continue
        scored = sorted(((difflib.SequenceMatcher(None, core, split(rname)[1]).ratio(), rid) for rid, rname in cands), reverse=True)
        if scored and scored[0][0] >= 0.8 and (len(scored) == 1 or scored[0][0] - scored[1][0] > 0.05):
            rows.append([code, name, scored[0][1], f"fuzzy {scored[0][0]:.2f}"])
            used.add(scored[0][1])
        else:
            hint = f" (closest: {scored[0][1]} {scored[0][0]:.2f})" if scored else ""
            rows.append([code, name, "", f"unmatched{hint}"])

    out = HERE / "data/sp2kp/region_map.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["regency_code", "sp2kp_name", "region_id", "method"])
        w.writerows(rows)
    all_ids = {rid for lst in regions.values() for rid, _, _ in lst}
    methods = {}
    for row in rows:
        methods[row[3].split()[0]] = methods.get(row[3].split()[0], 0) + 1
    print(f"{len(rows)} SP2KP areas: {methods}")
    for row in rows:
        if not row[3].startswith("exact"):
            print("  ", row)
    print("Pantara regions without an SP2KP match:", sorted(all_ids - used))


if __name__ == "__main__":
    main()

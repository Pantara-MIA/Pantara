"""Build the Indonesia province map used by the web choropleth.

Input : geoBoundaries IDN ADM1 GeoJSON (34 provinces, 2017; OpenStreetMap
        contributors, ODbL 1.0) — the province set PIHPS still reports on.
        https://www.geoboundaries.org/api/current/gbOpen/IDN/ADM1/
Output: web/src/data/geo/indonesia-provinces.json — one pre-projected SVG path
        per province, keyed by the province IDs in internal/regional/province.go.

Usage: python build_province_map.py <adm1.geojson> [<output.json>]
"""
import json
import math
import sys
from pathlib import Path

from build_region_map import ring_area, ring_centroid, rings_of, simplify

NAME_TO_ID = {
    "Aceh": "aceh",
    "North Sumatra": "sumatera-utara",
    "West Sumatra": "sumatera-barat",
    "Riau": "riau",
    "Jambi": "jambi",
    "South Sumatra": "sumatera-selatan",
    "Bengkulu": "bengkulu",
    "Lampung": "lampung",
    "Bangka-Belitung Islands": "kepulauan-bangka-belitung",
    "Riau Islands": "kepulauan-riau",
    "Jakarta Special Capital Region": "dki-jakarta",
    "West Java": "jawa-barat",
    "Central Java": "jawa-tengah",
    "Special Region of Yogyakarta": "di-yogyakarta",
    "East Java": "jawa-timur",
    "Banten": "banten",
    "Bali": "bali",
    "West Nusa Tenggara": "nusa-tenggara-barat",
    "East Nusa Tenggara": "nusa-tenggara-timur",
    "West Kalimantan": "kalimantan-barat",
    "Central Kalimantan": "kalimantan-tengah",
    "South Kalimantan": "kalimantan-selatan",
    "East Kalimantan": "kalimantan-timur",
    "North Kalimantan": "kalimantan-utara",
    "North Sulawesi": "sulawesi-utara",
    "Central Sulawesi": "sulawesi-tengah",
    "South Sulawesi": "sulawesi-selatan",
    "Southeast Sulawesi": "sulawesi-tenggara",
    "Gorontalo": "gorontalo",
    "West Sulawesi": "sulawesi-barat",
    "Maluku": "maluku",
    "North Maluku": "maluku-utara",
    "West Papua": "papua-barat",
    "Papua": "papua",
}

WIDTH = 1000.0
SIMPLIFY_PX = 0.35  # Douglas–Peucker tolerance in output pixels
MIN_RING_AREA_PX = 0.8  # drop specks; the largest ring of a province is always kept


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "web/src/data/geo/indonesia-provinces.json"
    data = json.loads(src.read_text(encoding="utf-8"))

    picked = {}
    for f in data["features"]:
        name = f["properties"]["shapeName"]
        rid = NAME_TO_ID.get(name)
        if rid is None:
            raise SystemExit(f"unmapped province: {name}")
        picked[rid] = f["geometry"]
    missing = sorted(set(NAME_TO_ID.values()) - set(picked))
    if missing:
        raise SystemExit(f"missing provinces: {missing}")

    # Equirectangular projection; Indonesia straddles the equator, so cos(lat) ≈ 1.
    lons = [x for g in picked.values() for poly in rings_of(g) for ring in poly for x, _ in ring]
    lats = [y for g in picked.values() for poly in rings_of(g) for ring in poly for _, y in ring]
    lon0, lon1, lat0, lat1 = min(lons), max(lons), min(lats), max(lats)
    k = math.cos(math.radians((lat0 + lat1) / 2))
    scale = WIDTH / ((lon1 - lon0) * k)
    height = (lat1 - lat0) * scale

    def project(lon, lat):
        return ((lon - lon0) * k * scale, (lat1 - lat) * scale)

    regions = []
    for rid in sorted(picked):
        rings = []
        for poly in rings_of(picked[rid]):
            for ring in poly[:1]:  # outer rings only; holes are lakes at this scale
                pts = [project(x, y) for x, y in ring]
                if pts[0] == pts[-1]:
                    pts = pts[:-1]
                rings.append(pts)
        largest = max(rings, key=lambda r: abs(ring_area(r)))
        parts, best_ring, best_area = [], None, 0.0
        for pts in rings:
            if pts is not largest and abs(ring_area(pts)) < MIN_RING_AREA_PX:
                continue
            pts = simplify(pts + [pts[0]], SIMPLIFY_PX)[:-1]
            if len(pts) < 3:
                continue
            area = abs(ring_area(pts))
            if area > best_area:
                best_area, best_ring = area, pts
            parts.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z")
        cx, cy = ring_centroid(best_ring)
        regions.append({"id": rid, "d": "".join(parts), "cx": round(cx, 1), "cy": round(cy, 1)})

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "source": "geoBoundaries gbOpen IDN ADM1 (2017), © kontributor OpenStreetMap",
                "license": "ODbL 1.0",
                "viewBox": f"0 0 {WIDTH:.0f} {height:.0f}",
                "regions": regions,
                "context": [],
                "water": [],
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB, {len(regions)} regions)")


if __name__ == "__main__":
    main()

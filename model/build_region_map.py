"""Build the West Java regency/city map used by the web choropleth.

Input : geoBoundaries IDN ADM2 GeoJSON (BPS boundaries, CC BY 3.0 IGO)
        https://www.geoboundaries.org/api/current/gbOpen/IDN/ADM2/
Output: web/src/data/geo/regencies/jawa-barat.json — one pre-projected SVG path per
        region, keyed by the region IDs in internal/regional/region.go.

Usage: python build_region_map.py <adm2.geojson> [<output.json>]
"""
import json
import math
import sys
from pathlib import Path

# geoBoundaries shapeName -> Pantara region ID. Filled in after inspecting the
# source names; anything unmatched inside the West Java bounding box is reported.
NAME_TO_ID = {
    "Bogor": "kab-bogor",
    "Sukabumi": "kab-sukabumi",
    "Cianjur": "kab-cianjur",
    "Bandung": "kab-bandung",
    "Garut": "kab-garut",
    "Tasikmalaya": "kab-tasikmalaya",
    "Ciamis": "kab-ciamis",
    "Kuningan": "kab-kuningan",
    "Cirebon": "kab-cirebon",
    "Majalengka": "kab-majalengka",
    "Sumedang": "kab-sumedang",
    "Indramayu": "kab-indramayu",
    "Subang": "kab-subang",
    "Purwakarta": "kab-purwakarta",
    "Karawang": "kab-karawang",
    "Bekasi": "kab-bekasi",
    "Bandung Barat": "kab-bandung-barat",
    "Pangandaran": "kab-pangandaran",
    "Kota Bogor": "kota-bogor",
    "Kota Sukabumi": "kota-sukabumi",
    "Kota Bandung": "kota-bandung",
    "Kota Cirebon": "kota-cirebon",
    "Kota Bekasi": "kota-bekasi",
    "Kota Depok": "kota-depok",
    "Kota Cimahi": "kota-cimahi",
    "Kota Tasikmalaya": "kota-tasikmalaya",
    "Kota Banjar": "kota-banjar",
}

# Water bodies drawn as context (they are separate polygons in the source).
WATER = {"Waduk Cirata"}

# West Java bounding box (lon/lat), with a margin.
BBOX = (106.0, -8.0, 109.0, -5.8)
WIDTH = 1000.0
SIMPLIFY_PX = 0.6  # Douglas–Peucker tolerance in output pixels
MIN_RING_AREA_PX = 6.0  # drop specks (tiny islands) smaller than this


def rings_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def bbox_center(geom):
    xs, ys = [], []
    for poly in rings_of(geom):
        for ring in poly:
            for x, y in ring:
                xs.append(x)
                ys.append(y)
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2


def ring_area(pts):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        a += x1 * y2 - x2 * y1
    return a / 2


def ring_centroid(pts):
    a = ring_area(pts)
    if a == 0:
        return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        f = x1 * y2 - x2 * y1
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    return cx / (6 * a), cy / (6 * a)


def perp_dist(p, a, b):
    if a == b:
        return math.dist(p, a)
    (x, y), (x1, y1), (x2, y2) = p, a, b
    return abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / math.dist(a, b)


def simplify(pts, tol):
    """Iterative Douglas–Peucker on an open polyline."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, idx = 0.0, -1
        for k in range(i + 1, j):
            d = perp_dist(pts[k], pts[i], pts[j])
            if d > best:
                best, idx = d, k
        if best > tol and idx > 0:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "web/src/data/geo/regencies/jawa-barat.json"
    data = json.loads(src.read_text(encoding="utf-8"))

    picked, unmatched, context, water = {}, [], [], []
    for f in data["features"]:
        cx, cy = bbox_center(f["geometry"])
        if not (BBOX[0] < cx < BBOX[2] and BBOX[1] < cy < BBOX[3]):
            continue
        name = f["properties"]["shapeName"]
        rid = NAME_TO_ID.get(name)
        if name in WATER:
            water.append(f["geometry"])
            continue
        if rid is None:
            unmatched.append(name)
            context.append(f["geometry"])
            continue
        if rid in picked:
            raise SystemExit(f"duplicate match for {rid}: {name}")
        picked[rid] = f["geometry"]

    missing = sorted(set(NAME_TO_ID.values()) - set(picked))
    if unmatched:
        print("outside West Java, drawn as grey context:", sorted(unmatched))
    if missing:
        raise SystemExit(f"missing regions: {missing}")

    # Equirectangular projection scaled by cos(latitude) at the map centre.
    lons = [x for g in picked.values() for poly in rings_of(g) for ring in poly for x, _ in ring]
    lats = [y for g in picked.values() for poly in rings_of(g) for ring in poly for _, y in ring]
    lon0, lon1, lat0, lat1 = min(lons), max(lons), min(lats), max(lats)
    k = math.cos(math.radians((lat0 + lat1) / 2))
    scale = WIDTH / ((lon1 - lon0) * k)
    height = (lat1 - lat0) * scale

    def project(lon, lat):
        return ((lon - lon0) * k * scale, (lat1 - lat) * scale)

    def to_path(geom, tol):
        """SVG path of a geometry plus its largest ring (for the label centroid)."""
        parts, best_ring, best_area = [], None, 0.0
        for poly in rings_of(geom):
            for ring in poly:
                pts = [project(x, y) for x, y in ring]
                if pts[0] == pts[-1]:
                    pts = pts[:-1]
                if abs(ring_area(pts)) < MIN_RING_AREA_PX:
                    continue
                pts = simplify(pts + [pts[0]], tol)[:-1]
                if len(pts) < 3:
                    continue
                area = abs(ring_area(pts))
                if area > best_area:
                    best_area, best_ring = area, pts
                parts.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z")
        return "".join(parts), best_ring

    regions = []
    for rid in sorted(picked):
        d, best_ring = to_path(picked[rid], SIMPLIFY_PX)
        cx, cy = ring_centroid(best_ring)
        regions.append({"id": rid, "d": d, "cx": round(cx, 1), "cy": round(cy, 1)})
    # Context outside the province only needs a coarse outline.
    context_paths = [p for p in (to_path(g, SIMPLIFY_PX * 3)[0] for g in context) if p]
    water_paths = [p for p in (to_path(g, SIMPLIFY_PX)[0] for g in water) if p]

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "source": "BPS via geoBoundaries gbOpen IDN ADM2 (2020)",
                "license": "CC BY 3.0 IGO",
                "viewBox": f"0 0 {WIDTH:.0f} {height:.0f}",
                "regions": regions,
                "context": context_paths,
                "water": water_paths,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB, {len(regions)} regions)")


if __name__ == "__main__":
    main()

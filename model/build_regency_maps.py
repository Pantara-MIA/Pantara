"""Build regency/city master data and maps for every province except West Java.

Inputs : geoBoundaries IDN ADM2 GeoJSON (BPS 2020, CC BY 3.0 IGO) and
         geoBoundaries IDN ADM1 GeoJSON (34 provinces, OSM, ODbL) — ADM2 has no
         parent code, so each regency is assigned to the province containing it.
Outputs: data/regions/regencies.json — per province: regencies/cities with
           type, indicative population and neighbours (shared border, or the
           nearest regions when a region has no land neighbour, e.g. islands)
         web/src/data/geo/regencies/<province-id>.json — pre-projected SVG map.
West Java keeps its curated data (internal/regional/region.go, build_region_map.py).

Populations are a ROUGH indicative split of the province population
(∝ √area, cities ×2.5), only used to size demand in the simulated planner.

Usage: python build_regency_maps.py <adm2.geojson> <adm1.geojson>
"""
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

from build_province_map import NAME_TO_ID as PROVINCE_NAME_TO_ID
from build_region_map import ring_area, ring_centroid, rings_of, simplify

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
WATER = {"Danau", "Danau Toba", "Waduk Cirata", "Wadung Kedungombo"}
# Polygons in ADM2 that are not regencies/cities.
NOT_REGENCY = {"Hutan"}
# Regencies the point-in-province test gets wrong (coastline mismatch between sources).
PROVINCE_OVERRIDE = {"Kepulauan Seribu": "dki-jakarta", "Mahakam Hulu": "kalimantan-timur"}
SKIP_PROVINCE = "jawa-barat"
WIDTH, MAX_HEIGHT = 1000.0, 760.0
SIMPLIFY_PX = 0.6
MIN_RING_AREA_PX = 3.0
GRID = 1e-4  # degrees, for shared-vertex adjacency

# Indicative provincial populations, mirrored from internal/regional/province.go.
def province_population():
    src = (ROOT / "internal/regional/province.go").read_text(encoding="utf-8")
    return {m[0]: int(m[1].replace("_", "")) for m in re.findall(r'ID: "([a-z-]+)".*?Population: ([0-9_]+)', src)}


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][:2]
        x2, y2 = ring[(i + 1) % n][:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def bbox(geom):
    xs = [p[0] for poly in rings_of(geom) for ring in poly for p in ring]
    ys = [p[1] for poly in rings_of(geom) for ring in poly for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def largest_ring(geom):
    return max((poly[0] for poly in rings_of(geom)), key=lambda r: abs(ring_area(r)))


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def area_km2(geom):
    total = 0.0
    for poly in rings_of(geom):
        ring = poly[0]
        lat = sum(p[1] for p in ring) / len(ring)
        k = math.cos(math.radians(lat))
        total += abs(ring_area([(p[0] * 111.32 * k, p[1] * 110.57) for p in ring]))
    return total


def main():
    adm2 = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["features"]
    adm1 = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))["features"]
    provinces = [(PROVINCE_NAME_TO_ID[f["properties"]["shapeName"]], f["geometry"], bbox(f["geometry"])) for f in adm1]
    pops = province_population()

    def province_of(geom):
        ring = largest_ring(geom)
        candidates = [ring_centroid([p[:2] for p in ring])] + [p[:2] for p in ring[:: max(1, len(ring) // 12)]]
        for x, y in candidates:
            for pid, pg, (x0, y0, x1, y1) in provinces:
                if x0 <= x <= x1 and y0 <= y <= y1 and any(point_in_ring(x, y, poly[0]) for poly in rings_of(pg)):
                    return pid
        # Coastline mismatch between the two sources: nearest province vertex.
        cx, cy = candidates[0]
        best = min(
            ((math.dist((cx, cy), p[:2]), pid) for pid, pg, _ in provinces for poly in rings_of(pg) for p in poly[0][::5]),
        )
        return best[1]

    by_province = defaultdict(list)
    water = []
    for f in adm2:
        name = f["properties"]["shapeName"]
        if name in WATER:
            water.append(f["geometry"])
            continue
        if name in NOT_REGENCY:
            continue
        pid = PROVINCE_OVERRIDE.get(name) or province_of(f["geometry"])
        by_province[pid].append((name, f["geometry"]))

    print("regencies per province:", {k: len(v) for k, v in sorted(by_province.items())})
    used_ids = set()
    master = []
    out_dir = ROOT / "web/src/data/geo/regencies"
    out_dir.mkdir(parents=True, exist_ok=True)

    for pid in sorted(by_province):
        if pid == SKIP_PROVINCE:
            continue
        items = by_province[pid]
        regions = []
        for name, geom in sorted(items):
            # "Kota Baru" in the source is Kotabaru regency (South Kalimantan).
            if name == "Kota Baru":
                name = "Kotabaru"
            city = name.startswith("Kota ")
            base = name[5:] if city else name
            rid = f"{'kota' if city else 'kab'}-{slug(base)}"
            if rid in used_ids or rid in {"kab-bandung"}:
                rid = f"{rid}-{pid}"
            used_ids.add(rid)
            regions.append({"id": rid, "name": f"Kota {base}" if city else f"Kab. {base}", "type": "city" if city else "regency", "geom": geom})

        # Adjacency: regions sharing at least two (rounded) boundary vertices.
        owners = defaultdict(set)
        for i, r in enumerate(regions):
            for poly in rings_of(r["geom"]):
                for ring in poly:
                    for p in ring:
                        owners[(round(p[0] / GRID), round(p[1] / GRID))].add(i)
        shared = defaultdict(int)
        for s in owners.values():
            for a in s:
                for b in s:
                    if a < b:
                        shared[(a, b)] += 1
        adj = defaultdict(set)
        for (a, b), n in shared.items():
            if n >= 2:
                adj[a].add(b)
                adj[b].add(a)
        cents = [ring_centroid([p[:2] for p in largest_ring(r["geom"])]) for r in regions]
        for i in range(len(regions)):
            if not adj[i] and len(regions) > 1:
                near = sorted((math.dist(cents[i], cents[j]), j) for j in range(len(regions)) if j != i)[:2]
                for _, j in near:
                    adj[i].add(j)
                    adj[j].add(i)

        # Indicative population split.
        weights = [math.sqrt(area_km2(r["geom"])) * (2.5 if r["type"] == "city" else 1) for r in regions]
        total = sum(weights)
        for r, w in zip(regions, weights):
            r["population"] = max(20_000, round(pops[pid] * w / total / 10_000) * 10_000)

        master.append(
            {
                "province": pid,
                "regions": [
                    {"id": r["id"], "name": r["name"], "type": r["type"], "population": r["population"], "neighbors": sorted(regions[j]["id"] for j in adj[i])}
                    for i, r in enumerate(regions)
                ],
            }
        )

        # Map: projection fitted to each regency's main landmass, so remote
        # specks (e.g. Masalembu) do not shrink the map; they are clipped.
        mains = [{"type": "Polygon", "coordinates": [largest_ring(r["geom"])]} for r in regions]
        x0 = min(bbox(g)[0] for g in mains)
        y0 = min(bbox(g)[1] for g in mains)
        x1 = max(bbox(g)[2] for g in mains)
        y1 = max(bbox(g)[3] for g in mains)
        pad = 0.03 * max(x1 - x0, y1 - y0)
        x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
        k = math.cos(math.radians((y0 + y1) / 2))
        scale = min(WIDTH / ((x1 - x0) * k), MAX_HEIGHT / (y1 - y0))
        w, h = (x1 - x0) * k * scale, (y1 - y0) * scale

        def project(lon, lat):
            return ((lon - x0) * k * scale, (y1 - lat) * scale)

        def to_path(geom, tol, keep_largest=True):
            rings = []
            for poly in rings_of(geom):
                pts = [project(p[0], p[1]) for p in poly[0]]
                if pts[0] == pts[-1]:
                    pts = pts[:-1]
                rings.append(pts)
            if not rings:
                return "", None
            biggest = max(rings, key=lambda r: abs(ring_area(r)))
            parts, best_ring, best_area = [], None, 0.0
            for pts in rings:
                if abs(ring_area(pts)) < MIN_RING_AREA_PX and not (keep_largest and pts is biggest):
                    continue
                pts = simplify(pts + [pts[0]], tol)[:-1]
                if len(pts) < 3:
                    continue
                a = abs(ring_area(pts))
                if a > best_area:
                    best_area, best_ring = a, pts
                parts.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z")
            return "".join(parts), best_ring

        shapes = []
        for r in regions:
            d, ring = to_path(r["geom"], SIMPLIFY_PX)
            cx, cy = ring_centroid(ring)
            shapes.append({"id": r["id"], "d": d, "cx": round(cx, 1), "cy": round(cy, 1)})
        margin = 0.6
        context = []
        for opid, pg, (bx0, by0, bx1, by1) in provinces:
            if opid == pid or bx1 < x0 - margin or bx0 > x1 + margin or by1 < y0 - margin or by0 > y1 + margin:
                continue
            d, _ = to_path(pg, SIMPLIFY_PX * 3, keep_largest=False)
            if d:
                context.append(d)
        lakes = []
        for g in water:
            gx0, gy0, gx1, gy1 = bbox(g)
            if x0 <= (gx0 + gx1) / 2 <= x1 and y0 <= (gy0 + gy1) / 2 <= y1:
                d, _ = to_path(g, SIMPLIFY_PX)
                if d:
                    lakes.append(d)
        (out_dir / f"{pid}.json").write_text(
            json.dumps(
                {
                    "source": "BPS via geoBoundaries gbOpen IDN ADM2 (2020)",
                    "license": "CC BY 3.0 IGO",
                    "viewBox": f"0 0 {w:.0f} {h:.0f}",
                    "regions": shapes,
                    "context": context,
                    "water": lakes,
                },
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )

    out = ROOT / "data/regions/regencies.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(master, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {out}: {sum(len(p['regions']) for p in master)} regencies in {len(master)} provinces")


if __name__ == "__main__":
    main()

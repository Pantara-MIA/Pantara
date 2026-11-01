"""Train, evaluate and export the v2 price forecaster (LightGBM quantile models).

Two levels, three quantile models each (P10, P50, P90), pooled over commodities:
  province — PIHPS 2020–2026, 34 provinces
  regency  — SP2KP Feb 2024–2026, real series only

Evaluation is walk-forward and honest: models are fitted on targets dated
before TEST_START (early stopping on the last VALIDATION_DAYS of that period)
and scored on origins every 7 days from TEST_START to TEST_END at horizons 7
and 14, against the FHS forecaster on exactly the same origins. v2 is selected
per level × commodity only where it beats FHS on pinball loss while keeping the
P10–P90 coverage near 80%. Production models are refitted on all data with the
early-stopped tree counts.

Outputs (data/models/):
  forecast_<level>_q<10|50|90>.json — trees in a compact form for the Go evaluator
  selection.json — {level: {commodity: "v2" | "fhs"}}
  metrics.json   — per level × commodity × horizon: coverage, MASE, pinball, both models
  parity.json    — sample feature rows + predictions for the Go tests. "features"
                   and "pred" are frozen at training time (tree evaluator check);
                   "data_features" are rebuilt from the current data by
                   --parity-only (feature check), because a data refresh shifts
                   which series pass the completeness rule and so the medians.

Usage: python train_forecast.py [--level province|regency|all] [--parity-only]
"""
import argparse
import json
import math
import time
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

import forecast_features as ff

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "data/models"
TEST_START = "2025-10-15"
TEST_END = "2026-10-14"
VALIDATION_DAYS = 60
EVAL_HORIZONS = (7, 14)
QUANTILES = (0.1, 0.5, 0.9)
Z_CLIP = 8.0
PARAMS = {
    "objective": "quantile",
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_data_in_leaf": 400,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    "num_threads": 8,
    "verbose": -1,
    "seed": 7,
}
SAMPLING = {"province": (2, 4), "regency": (7, 2)}  # (origin step days, horizons per origin)
PARITY_SERIES = 12


# ── Series with features ────────────────────────────────────────────────────

def iter_series(level, climate, only=None):
    """Yields dicts: scope, region, commodity, days, p, feats (base features);
    only = optional set of (region, commodity) to yield."""
    refs = ff.references()
    zones = ff.price_zones()
    codes = ff.province_codes()
    if level == "province":
        days, series = ff.load_province_series()
        cal = ff.calendar_features(days, climate)
        rain = {pid: ff.rain_features(days, code, climate) for pid, code in codes.items()}
        neighbors = ff.province_neighbors()
        for c, by_region in series.items():
            sm = ff.scope_medians(by_region)
            for pid, p in by_region.items():
                if only is not None and (pid, c) not in only:
                    continue
                feats = ff.series_features(
                    p, ff.neighbor_median(by_region, neighbors, pid), sm,
                    ff.ceiling_series(refs, c, "pihps", zones.get(pid, 1), len(p)), sm, cal, rain[pid], c)
                yield {"scope": "indonesia", "region": pid, "commodity": c, "days": days, "p": p, "feats": feats}
        return

    pdays, pseries = ff.load_province_series()
    # Keep exactly the series the server keeps: completeness judged on its calendar.
    days, series = ff.load_regency_series(coverage=(ff.APP_START, pdays[-1]))
    cal = ff.calendar_features(days, climate)
    # Regency days -> PIHPS day index; days past the PIHPS end carry its last day
    # (the server's calendar ends at the PIHPS end anyway).
    pindex = {d: i for i, d in enumerate(pdays)}
    align = np.array([pindex.get(d, len(pdays) - 1 if d > pdays[-1] else -1) for d in days])
    scopes = ff.regency_scopes()
    home = {rid: prov for prov, (ids, _) in scopes.items() for rid in ids}
    rain = {prov: ff.rain_features(days, codes[prov], climate) for prov in scopes}
    for c, by_region in series.items():
        groups = defaultdict(dict)
        for rid, p in by_region.items():
            if rid in home:
                groups[home[rid]][rid] = p
        for prov, members in groups.items():
            sm = ff.scope_medians(members)
            parent = pseries.get(c, {}).get(prov)
            parent = parent[align] if parent is not None and (align >= 0).all() else None
            for rid, p in members.items():
                if only is not None and (rid, c) not in only:
                    continue
                feats = ff.series_features(
                    p, ff.neighbor_median(members, scopes[prov][1], rid), sm,
                    ff.ceiling_series(refs, c, "sp2kp", zones.get(prov, 1), len(p)), parent, cal, rain[prov], c)
                yield {"scope": prov, "region": rid, "commodity": c, "days": days, "p": p, "feats": feats}


def feature_row(s, t, h):
    f = s["feats"]
    return [h] + [f[k][t] for k in ff.BASE_FEATURES[1:]] + [1.0 if c == s["commodity"] else 0.0 for c in ff.COMMODITIES]


def go_sigma(lp):
    """sigmaAt in Go: 30-day std of daily log returns; 0 before day 30 or when flat."""
    ret = pd.Series(np.diff(lp, prepend=lp[0]))
    s = np.sqrt(np.clip(ret.rolling(30).var(ddof=1).to_numpy(), 0, None))
    s[:30] = 0
    return np.nan_to_num(s)


def fhs_quantiles(lp, sigma, now, h):
    """Mirror of forecastAt in Go: z with the σ floor and clip; flat forecast
    when history is short."""
    t = np.arange(30, now - h + 1)
    t = t[sigma[t] > 0] if len(t) else t
    if len(t) < 60 or sigma[now] <= 0:
        return np.array([lp[now]] * 3)
    z = np.clip((lp[t + h] - lp[t]) / (np.maximum(sigma[t], ff.SIGMA_FLOOR) * math.sqrt(h)), -Z_CLIP, Z_CLIP)
    return lp[now] + np.quantile(z, QUANTILES) * sigma[now] * math.sqrt(h)


def collect(level, climate):
    """One pass: sampled training rows, test rows (with FHS), parity candidates."""
    step, per = SAMPLING[level]
    rng = np.random.default_rng(7)
    Xs, ys, days_out = [], [], []
    test = []  # (commodity, h, x, lp_t, sigma_t, actual, fhs_q[3])
    parity_pool = []
    n_series = 0
    onehot_of = {c: np.eye(len(ff.COMMODITIES), dtype=np.float32)[i] for i, c in enumerate(ff.COMMODITIES)}
    for s in iter_series(level, climate):
        n_series += 1
        days, p = s["days"], s["p"]
        lp = np.log(p)
        f = s["feats"]
        base = np.column_stack([f[k] for k in ff.BASE_FEATURES[1:]]).astype(np.float32)
        onehot = onehot_of[s["commodity"]]
        sig = np.maximum(np.nan_to_num(f["sigma30"]), ff.SIGMA_FLOOR)
        last = len(days) - 1
        origins = np.arange(ff.MIN_HISTORY, last, step)
        origins = origins[~np.isnan(f["sigma30"][origins])]
        if len(origins):
            hs = np.stack([rng.choice(np.arange(1, 15), size=per, replace=False) for _ in origins])
            t = np.repeat(origins, per)
            h = hs.reshape(-1)
            keep = t + h <= last
            t, h = t[keep], h[keep]
            z = np.clip((lp[t + h] - lp[t]) / (sig[t] * np.sqrt(h)), -Z_CLIP, Z_CLIP)
            Xs.append(np.column_stack([h.astype(np.float32), base[t], np.tile(onehot, (len(t), 1))]))
            ys.append(z.astype(np.float32))
            days_out.append(np.asarray(days)[t + h])
        if TEST_START in days:
            sg = go_sigma(lp)
            start = days.index(TEST_START)
            for t0 in range(start, last, 7):
                if days[t0] > TEST_END:
                    break
                for hh in EVAL_HORIZONS:
                    if t0 + hh <= last:
                        test.append((s["commodity"], hh, feature_row(s, t0, hh), lp[t0], sig[t0], lp[t0 + hh], fhs_quantiles(lp, sg, t0, hh)))
        if rng.random() < 0.05 and len(parity_pool) < 200:
            t0 = last - int(rng.integers(0, 120))
            parity_pool.append({"scope": s["scope"], "region": s["region"], "commodity": s["commodity"], "date": days[t0],
                                "rows": {hh: feature_row(s, t0, hh) for hh in (1, 7, 14)}})
    return n_series, np.vstack(Xs), np.concatenate(ys), np.concatenate(days_out), test, parity_pool


# ── Train / evaluate ────────────────────────────────────────────────────────

def fit(X, y, rounds=None, Xv=None, yv=None):
    models, best = {}, {}
    for a in QUANTILES:
        params = {**PARAMS, "alpha": a}
        dtrain = lgb.Dataset(X, y, feature_name=ff.FEATURES, free_raw_data=False)
        if rounds is None:
            m = lgb.train(params, dtrain, num_boost_round=800, valid_sets=[lgb.Dataset(Xv, yv, reference=dtrain)],
                          callbacks=[lgb.early_stopping(50, verbose=False)])
            best[a] = max(50, m.best_iteration)
        else:
            m = lgb.train(params, dtrain, num_boost_round=rounds[a])
            best[a] = rounds[a]
        models[a] = m
    return models, best


def pinball(y, q, alpha):
    d = y - q
    return max(alpha * d, (alpha - 1) * d)


def evaluate(test, models, level):
    if not test:
        return []
    Xt = np.asarray([r[2] for r in test], dtype=np.float32)
    pred = np.column_stack([models[a].predict(Xt) for a in QUANTILES])
    pred.sort(axis=1)
    acc = defaultdict(lambda: defaultdict(list))
    for (c, h, _, lp_t, sig_t, actual, fhs), zq in zip(test, pred):
        v2 = lp_t + zq * sig_t * math.sqrt(h)
        a = acc[(c, h)]
        for name, q in (("v2", v2), ("fhs", fhs)):
            a[f"{name}_pin"].append(np.mean([pinball(actual, q[i], al) for i, al in enumerate(QUANTILES)]))
            a[f"{name}_in"].append(float(q[0] <= actual <= q[2]))
            a[f"{name}_err"].append(abs(math.exp(actual) - math.exp(q[1])))
        a["naive"].append(abs(math.exp(actual) - math.exp(lp_t)))
    rows = []
    for (c, h), a in sorted(acc.items()):
        naive = sum(a["naive"]) or 1.0
        row = {"level": level, "commodity_id": c, "horizon": h, "samples": len(a["naive"])}
        for m in ("v2", "fhs"):
            row[f"{m}_pinball"] = round(float(np.mean(a[f"{m}_pin"])), 5)
            row[f"{m}_coverage"] = round(float(np.mean(a[f"{m}_in"])), 3)
            row[f"{m}_mase"] = round(sum(a[f"{m}_err"]) / naive, 3)
        rows.append(row)
    return rows


def select(rows):
    """v2 where it beats FHS on pinball (both horizons) by at least 1% and its
    P10–P90 coverage is no more than 5 points further from 80% than FHS's
    (too narrow a band would understate the risk of breaching HET/HAP)."""
    by_c = defaultdict(list)
    for r in rows:
        by_c[r["commodity_id"]].append(r)
    out = {}
    for c, rs in sorted(by_c.items()):
        v2 = np.mean([r["v2_pinball"] for r in rs])
        fhs = np.mean([r["fhs_pinball"] for r in rs])
        miss_v2 = abs(np.mean([r["v2_coverage"] for r in rs]) - 0.8)
        miss_fhs = abs(np.mean([r["fhs_coverage"] for r in rs]) - 0.8)
        out[c] = "v2" if v2 < fhs * 0.99 and miss_v2 <= miss_fhs + 0.05 else "fhs"
    return out


# ── Export ──────────────────────────────────────────────────────────────────

def compact(model):
    """Trees as flat arrays for the Go evaluator: per internal node the feature,
    threshold (go left when x <= threshold), children (~i marks leaf i) and the
    direction for NaN; plus leaf values. Prediction = sum of the trees' leaves."""
    trees = []
    for info in model.dump_model()["tree_info"]:
        f, thr, left, right, dl, leaves = [], [], [], [], [], []

        def walk(node):
            if "leaf_value" in node:
                leaves.append(node["leaf_value"])
                return ~(len(leaves) - 1)
            assert node["decision_type"] == "<=", node["decision_type"]
            i = len(f)
            f.append(node["split_feature"])
            thr.append(node["threshold"])
            dl.append(bool(node["default_left"]))
            left.append(0)
            right.append(0)
            left[i] = walk(node["left_child"])
            right[i] = walk(node["right_child"])
            return i

        root = walk(info["tree_structure"])
        trees.append({"f": f, "t": thr, "l": left, "r": right, "d": dl, "v": leaves, "root": root})
    return {"features": ff.FEATURES, "trees": trees}


def refresh_parity(parity, levels, climate):
    """Rebuild data_features of the parity rows from the current data (no training)."""
    for level in levels:
        rows = parity.get(level, [])
        for r in rows:
            r.pop("data_features", None)
        rebuilt = 0
        for s in iter_series(level, climate, only={(r["region"], r["commodity"]) for r in rows}):
            for r in rows:
                if (r["region"], r["commodity"]) == (s["region"], s["commodity"]) and r["date"] in s["days"]:
                    r["data_features"] = [float(v) for v in feature_row(s, s["days"].index(r["date"]), r["h"])]
                    rebuilt += 1
        print(f"[{level}] parity: {rebuilt} of {len(rows)} feature rows rebuilt from the current data", flush=True)
    (OUT / "parity.json").write_text(json.dumps(parity), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", default="all", choices=["province", "regency", "all"])
    ap.add_argument("--parity-only", action="store_true", help="only rebuild parity.json data_features from the current data")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    climate = ff.Climate()
    levels = ["province", "regency"] if args.level == "all" else [args.level]
    load = lambda name: json.loads((OUT / name).read_text(encoding="utf-8")) if (OUT / name).exists() else {}
    selection, metrics, parity = load("selection.json"), load("metrics.json"), load("parity.json")
    if args.parity_only:
        refresh_parity(parity, levels, climate)
        return
    val_start = (date.fromisoformat(TEST_START) - timedelta(days=VALIDATION_DAYS)).isoformat()

    for level in levels:
        t0 = time.time()
        n_series, X, y, tday, test, pool = collect(level, climate)
        before_test = tday < TEST_START
        train = tday < val_start
        val = before_test & ~train
        print(f"[{level}] {n_series} series; rows: train {train.sum():,}, validation {val.sum():,}, all {len(y):,}; "
              f"test origins {len(test):,} ({time.time() - t0:.0f}s)", flush=True)

        _, best = fit(X[train], y[train], Xv=X[val], yv=y[val])
        eval_models, _ = fit(X[before_test], y[before_test], rounds=best)
        rows = evaluate(test, eval_models, level)
        sel = select(rows)
        print(f"[{level}] trees {best}; v2 chosen for {sum(v == 'v2' for v in sel.values())}/{len(sel)} commodities", flush=True)
        for r in rows:
            print(f"   {r['commodity_id']:22} h={r['horizon']:2} n={r['samples']:5}  pinball v2 {r['v2_pinball']:.4f} fhs {r['fhs_pinball']:.4f}  "
                  f"cov v2 {r['v2_coverage']:.2f} fhs {r['fhs_coverage']:.2f}  MASE v2 {r['v2_mase']:.3f} fhs {r['fhs_mase']:.3f}  -> {sel[r['commodity_id']]}",
                  flush=True)

        prod, _ = fit(X, y, rounds=best)
        for a in QUANTILES:
            (OUT / f"forecast_{level}_q{int(a * 100)}.json").write_text(json.dumps(compact(prod[a]), separators=(",", ":")), encoding="utf-8")

        prng = np.random.default_rng(11)
        sample = []
        for item in [pool[i] for i in prng.choice(len(pool), size=min(PARITY_SERIES, len(pool)), replace=False)]:
            for h, row in item["rows"].items():
                x = np.asarray([row], dtype=np.float64)
                sample.append({"scope": item["scope"], "region": item["region"], "commodity": item["commodity"], "date": item["date"], "h": h,
                               "features": [float(v) for v in row], "pred": [float(prod[a].predict(x)[0]) for a in QUANTILES]})
        parity[level] = sample
        selection[level] = sel
        metrics[level] = {"test_start": TEST_START, "test_end": TEST_END, "trees": {str(k): v for k, v in best.items()}, "rows": rows}
        print(f"[{level}] done in {time.time() - t0:.0f}s", flush=True)

        (OUT / "selection.json").write_text(json.dumps(selection, indent=1), encoding="utf-8")
        (OUT / "metrics.json").write_text(json.dumps(metrics, indent=1), encoding="utf-8")
        (OUT / "parity.json").write_text(json.dumps(parity), encoding="utf-8")


if __name__ == "__main__":
    main()

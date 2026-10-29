#!/usr/bin/env python3
"""
Precompute the static data used by /dreaming/.

  * letters  : 26 capital letters rasterised on a 24x24 grid (DejaVu Sans Bold, shipped with
               matplotlib) and binarised to +-1. Used by the structured-data chapter, which is
               a demonstration outside the paper's theory (random archetypes).
  * simplex  : joint disentanglement success on the cue-weight simplex, t = 0 and t = 64,
               40 Monte Carlo runs per point: the data behind Fig. 2 of the paper
               (A. Barra, F. Durante, A. Ladiana, M. Marra Solazzo, Neural Networks 206, 109729).
  * saving   : critical number of examples M_c(t) for r = 0.7 and r = 0.3: the data behind Fig. 3a.

The Monte Carlo files live in the paper's working folder, not in this repository:

    python tools/dreaming/precompute.py [path/to/DLAM]      # writes dreaming/assets/data/dreaming.json
"""
import json
import sys
from pathlib import Path

import matplotlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DLAM = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop" / "DLAM"
MC = DLAM / "Simulazioni" / "Monte Carlo" / "v4"
SIMPLEX = MC / "results_dis" / "coop" / "panel5c_simplex_20260306_171217.npz"
SAVING = MC / "results_auto" / "dataset_saving" / "minimal_examples_multi_r_N300_K30_20251212_135303.npz"
OUT = ROOT / "dreaming" / "assets" / "data" / "dreaming.json"

SIDE = 24


def letters():
    font = ImageFont.truetype(str(Path(matplotlib.get_data_path()) / "fonts" / "ttf" / "DejaVuSans-Bold.ttf"), 22)
    out = {}
    for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        im = Image.new("L", (SIDE, SIDE), 0)
        d = ImageDraw.Draw(im)
        x0, y0, x1, y1 = d.textbbox((0, 0), c, font=font)
        d.text(((SIDE - (x1 - x0)) / 2 - x0, (SIDE - (y1 - y0)) / 2 - y0), c, fill=255, font=font)
        out[c] = "".join("1" if v > 110 else "0" for v in np.asarray(im).ravel())
    pats = np.array([[1 if ch == "1" else -1 for ch in s] for s in out.values()], float)
    ov = pats @ pats.T / pats.shape[1]
    off = ov[~np.eye(len(ov), dtype=bool)]
    print(f"letters: mean overlap {off.mean():.3f}, max {off.max():.3f}")
    return {"side": SIDE, "glyphs": out}


def simplex():
    d = np.load(SIMPLEX, allow_pickle=True)
    cfg = json.loads(str(d["config"]))
    n = cfg["n_simplex"]
    rows = d["data"]
    grids = {}
    for t in sorted(set(rows["t"])):
        sel = rows[rows["t"] == t]
        cell = {(round(a * n), round(b * n)): s for a, b, s in zip(sel["a"], sel["b"], sel["success_rate"])}
        # same order as the paper's simplex_grid: i over a, then j over b
        grids[f"t{int(t)}"] = [round(float(cell[(i, j)]), 4) for i in range(n + 1) for j in range(n + 1 - i)]
    print(f"simplex: n = {n}, points = {len(next(iter(grids.values())))}, grids = {list(grids)}")
    theta = np.radians(cfg["theta_deg"])
    params = {
        "N": cfg["N"], "K": round(cfg["gamma"] * cfg["N"]), "M": cfg["M"], "r": cfg["r"],
        "beta": cfg["beta"], "steps": cfg["steps"], "eps": cfg["cue_noise"], "mth": cfg["m_th"],
        "gAuto": round(float(np.cos(theta)), 6), "gHetero": round(float(np.sin(theta) / np.sqrt(2)), 6),
        "runs": cfg["replicates"],
    }
    return {"n": n, "params": params, **grids}


def saving():
    d = np.load(SAVING, allow_pickle=True)
    cfg = json.loads(str(d["config"]))
    out = {"N": cfg["N"], "K": cfg["K"], "runs": cfg["n_experiments"], "series": []}
    for key, r in (("r0p7", 0.7), ("r0p3", 0.3)):
        t, mc, sd = d[key + "_t_values"], d[key + "_Mc_mean"], d[key + "_Mc_std"]
        out["series"].append({"r": r, "t": [round(float(x), 4) for x in t],
                              "Mc": [round(float(x), 2) for x in mc], "sd": [round(float(x), 2) for x in sd]})
        print(f"saving r = {r}: M_c {mc[0]:.1f} -> {mc[-1]:.1f}  (S = {1 - mc[-1] / mc[0]:.0%})")
    return out


def main():
    data = {"letters": letters(), "simplex": simplex(), "saving": saving()}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()

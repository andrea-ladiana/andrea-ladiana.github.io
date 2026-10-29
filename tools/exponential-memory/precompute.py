#!/usr/bin/env python3
"""
Precompute the static data used by /exponential-memory/.

  * glyphs    : capital and small letters, digits and "?" on a 20x20 grid (DejaVu Sans Bold,
                shipped with matplotlib), binarised to +-1. Used by the live demos of
                chapters 1 and 4, which are illustrations outside the paper's random-pattern theory.
  * capacity  : the i.i.d. Monte Carlo behind Fig. 1a (L = 2, N = 8..12).
  * basins    : the L = 3, N = 30, P = 35224 basin sweep behind Fig. 2a.
  * receptors : the 1,052 clean VDJdb triples (alpha CDR3, beta CDR3, epitope), split and
                encoded exactly as in the paper's generalisation experiment (exp05, seed 0),
                as 128-bit codes per layer.
  * clinc     : CLINC150 utterances and intents, split and encoded as in exp05 (seed 0), plus
                the frozen text encoder (TF-IDF vocabularies and idf, the PCA-whitening and the
                SimHash projection) so that the page can encode a sentence typed by the reader.

The experiment code and data live in the paper's working folder, not in this repository:

    python tools/exponential-memory/precompute.py [path/to/TAM-EASY]
        -> exponential-memory/assets/data/exponential.json  (small, loaded at once)
        -> exponential-memory/assets/data/receptors.json
        -> exponential-memory/assets/data/clinc.json        (loaded when chapter 6 comes near)

Each part runs in its own process because the VDJdb and CLINC batteries ship modules with the
same names (config, encoder, exp_utils, tam_engine).
"""
import base64
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
TAM = Path(next((a for a in sys.argv[1:] if not a.startswith("--")),
                Path.home() / "Desktop" / "Exponential TAM" / "TAM-EASY"))
OUT = ROOT / "exponential-memory" / "assets" / "data"
SIDE = 20


def bits(B):
    """+-1 array (..., N) -> base64 of its bits, little-endian per byte, 1 = +1."""
    return base64.b64encode(np.packbits((np.asarray(B) > 0).astype(np.uint8), axis=-1,
                                        bitorder="little").tobytes()).decode()


def f32(a):
    return base64.b64encode(np.ascontiguousarray(a, dtype="<f4").tobytes()).decode()


def f16(a):
    return base64.b64encode(np.ascontiguousarray(a, dtype="<f2").tobytes()).decode()


def r(x, d=4):
    return [round(float(v), d) for v in x]


# ---------------------------------------------------------------------------
def part_small():
    import matplotlib
    import pandas as pd
    from PIL import Image, ImageDraw, ImageFont

    font = ImageFont.truetype(str(Path(matplotlib.get_data_path()) / "fonts" / "ttf" / "DejaVuSans-Bold.ttf"), 18)
    glyphs = {}
    for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz123456789?":
        im = Image.new("L", (SIDE, SIDE), 0)
        d = ImageDraw.Draw(im)
        # centre the ink box; small letters sit on a common baseline so x-height shows
        x0, y0, x1, y1 = d.textbbox((0, 0), c, font=font)
        if c.islower():
            _, Y0, _, Y1 = d.textbbox((0, 0), "dg", font=font)
            y0, y1 = Y0, Y1
        d.text(((SIDE - (x1 - x0)) / 2 - x0, (SIDE - (y1 - y0)) / 2 - y0), c, fill=255, font=font)
        glyphs[c] = "".join("1" if v > 110 else "0" for v in np.asarray(im).ravel())

    cap = pd.read_csv(TAM / "paper" / "v1" / "simulations" / "figure1" / "figure1_capacity.csv")
    capacity = {}
    for N, g in cap.groupby("N"):
        g = g.sort_values("P")
        capacity[str(int(N))] = {"P": [int(p) for p in g.P], "m": r(g.m_mean), "sd": r(g.m_std)}

    bas = pd.read_csv(TAM / "sim" / "basins" / "basin_data.csv")
    basins = {"L": 3, "N": 30, "P": 35224, "r": r(bas.m1_0, 3), "m": r(bas.m1_1_mean), "sem": r(bas.m1_1_sem)}

    out = {"side": SIDE, "glyphs": glyphs,
           "capacity": {"L": 2, "steps": 5, "seeds": 6, "evals": 200, "byN": capacity},
           "basins": basins}
    (OUT / "exponential.json").write_text(json.dumps(out, separators=(",", ":")))
    print("exponential.json", (OUT / "exponential.json").stat().st_size, "bytes")


# ---------------------------------------------------------------------------
def part_receptors():
    import pandas as pd
    d = TAM / "datasets" / "2. VDJDB"
    sys.path.insert(0, str(d))
    import config
    from data_loader import VDJdbLoader
    from exp_utils import fit_encoders, build_xi, split_by_receptor, run_retrieval

    df = VDJdbLoader(db_path=config.DB_PATH, min_score=config.MIN_SCORE, drop_10x=config.DROP_10X).load()
    slim = pd.read_csv(config.DB_PATH, sep="\t", usecols=["antigen.epitope", "antigen.species", "antigen.gene"],
                       dtype=str).fillna("")
    mode = lambda s: s.value_counts().index[0] if len(s) else ""
    species = slim.groupby("antigen.epitope")["antigen.species"].agg(mode)
    gene = slim.groupby("antigen.epitope")["antigen.gene"].agg(mode)

    df_tr, in_dist, _ = split_by_receptor(df, config.GEN_TEST_FRAC, seed=5000, min_epi_count=2)
    enc = fit_encoders(df_tr, config.DEFAULT_N, config.DEFAULT_PCA_CAP, config.DEFAULT_FEATURE, seed=500)
    xi = build_xi(df_tr, enc)
    xq = build_xi(in_dist, enc)
    epis = sorted(df_tr["epitope"].unique())
    E = enc[2].transform(epis)
    eidx = {e: i for i, e in enumerate(epis)}

    # reference rates with the paper's own engine, for checking the page's engine
    rng = np.random.default_rng(1)
    idx = rng.choice(len(df_tr), 300, replace=False)
    ref = {}
    for name, known in [("ab", [0, 1]), ("a", [0]), ("b", [1])]:
        res = run_retrieval(xi, known, 2, xi[idx][:, known, :], xi[idx][:, 2, :], config.DEFAULT_N_STEPS)
        ref["mem_" + name] = res["rate"]
    res = run_retrieval(xi, [0, 1], 2, xq[:, [0, 1], :], xq[:, 2, :], config.DEFAULT_N_STEPS)
    ref["gen_ab"] = res["rate"]
    print("receptors reference:", ref)

    out = {
        "N": int(config.DEFAULT_N), "steps": int(config.DEFAULT_N_STEPS),
        "funnel": {"raw": 137484, "clean": int(len(df)), "epitopes": int(df["epitope"].nunique())},
        "epitopes": [{"seq": e, "species": str(species.get(e, "")), "gene": str(gene.get(e, ""))} for e in epis],
        "epiCodes": bits(E),
        "stored": {"a": df_tr["cdr3a"].tolist(), "b": df_tr["cdr3b"].tolist(),
                   "e": [eidx[e] for e in df_tr["epitope"]], "codes": bits(xi)},
        "unseen": {"a": in_dist["cdr3a"].tolist(), "b": in_dist["cdr3b"].tolist(),
                   "e": [eidx[e] for e in in_dist["epitope"]], "codes": bits(xq)},
        "reference": ref,
    }
    (OUT / "receptors.json").write_text(json.dumps(out, separators=(",", ":")))
    print("receptors.json", (OUT / "receptors.json").stat().st_size, "bytes;",
          len(df_tr), "stored,", len(in_dist), "unseen,", len(epis), "epitopes")


# ---------------------------------------------------------------------------
def part_clinc():
    d = TAM / "datasets" / "3. CLINC150"
    sys.path.insert(0, str(d))
    import config
    from clinc_loader import CLINCLoader
    from encoder import intent_to_text
    from exp_utils import fit_encoders, split_by_utterance, run_retrieval
    from scipy.sparse import hstack

    df = CLINCLoader(config.DB_PATH).load()
    df_tr, in_dist, _ = split_by_utterance(df, config.GEN_TEST_FRAC, seed=5000, min_intent_count=2)
    enc_u, enc_i = fit_encoders(df_tr, config.DEFAULT_N, config.DEFAULT_PCA_CAP, config.DEFAULT_FEATURE, seed=500)

    # Fold standardise -> PCA-whiten into one (d', F) matrix and a bias. The matrix is stored
    # as float16 (half the download); every code below is recomputed from the stored numbers,
    # exactly as the page does, so stored and typed sentences go through the same map.
    b = enc_u._bin
    sqrt_ev = np.sqrt(b._pca.explained_variance_)
    W = (b._pca.components_ / b._std[None, :]) / sqrt_ev[:, None]
    bias = -((b._mean / b._std + b._pca.mean_) @ b._pca.components_.T) / sqrt_ev
    W = W.astype(np.float16); bias = bias.astype(np.float32); R = b._R.astype(np.float32)

    def feats(texts):
        return hstack([enc_u._word_vec.transform(texts), enc_u._char_vec.transform(texts)]).tocsr()

    def encode(texts):
        X = feats(texts)
        Z = X @ W.astype(np.float64).T + bias.astype(np.float64)
        B = np.sign(Z @ R.astype(np.float64)); B[B == 0] = 1
        return B.astype(np.int8)

    U = encode(df_tr["utterance"].tolist())
    sk = enc_u.transform(df_tr["utterance"].tolist())
    print("codes vs scikit-learn pipeline: bit agreement", float((U == sk).mean()))

    intents = sorted(df_tr["intent"].unique())
    I = enc_i.transform([intent_to_text(y) for y in intents]).astype(np.int8)
    iidx = {y: k for k, y in enumerate(intents)}
    xi = np.stack([U, I[[iidx[y] for y in df_tr["intent"]]]], axis=1)

    rng = np.random.default_rng(1)
    test = in_dist.sample(n=600, random_state=7).reset_index(drop=True)
    Uq = encode(test["utterance"].tolist())
    Iq = I[[iidx[y] for y in test["intent"]]]
    idx = rng.choice(len(df_tr), 400, replace=False)
    ref = {
        "mem": run_retrieval(xi, [0], 1, xi[idx][:, [0], :], xi[idx][:, 1, :], config.DEFAULT_N_STEPS)["rate"],
        "gen": run_retrieval(xi, [0], 1, Uq[:, None, :], Iq, config.DEFAULT_N_STEPS)["rate"],
    }
    print("clinc reference:", ref)

    wv, cv = enc_u._word_vec, enc_u._char_vec
    word_terms = sorted(wv.vocabulary_, key=wv.vocabulary_.get)
    char_terms = sorted(cv.vocabulary_, key=cv.vocabulary_.get)
    out = {
        "N": int(config.DEFAULT_N), "steps": int(config.DEFAULT_N_STEPS),
        "intents": [intent_to_text(y) for y in intents],
        "intentCodes": bits(I),
        "stored": {"text": df_tr["utterance"].tolist(), "intent": [iidx[y] for y in df_tr["intent"]], "codes": bits(U)},
        "unseen": {"text": test["utterance"].tolist(), "intent": [iidx[y] for y in test["intent"]], "codes": bits(Uq)},
        "encoder": {
            "word": {"terms": word_terms, "idf": r(wv.idf_, 6)},
            "char": {"terms": char_terms, "idf": r(cv.idf_, 6)},
            "dims": [int(W.shape[0]), int(W.shape[1]), int(R.shape[1])],
            "W": f16(W), "bias": f32(bias), "R": f32(R),
        },
        "reference": ref,
    }
    (OUT / "clinc.json").write_text(json.dumps(out, separators=(",", ":")))
    print("clinc.json", (OUT / "clinc.json").stat().st_size, "bytes;", len(df_tr), "stored,", len(intents), "intents")


PARTS = {"small": part_small, "receptors": part_receptors, "clinc": part_clinc}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    part = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--part=")), None)
    if part:
        PARTS[part]()
    else:
        for name in PARTS:
            subprocess.run([sys.executable, __file__, f"--part={name}", str(TAM)], check=True)

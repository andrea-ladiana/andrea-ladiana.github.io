#!/usr/bin/env python3
"""
Precompute the exact spectral data used by /diamond-spectrum/.

Everything comes from the product formula of the paper
(A. Ladiana, J. Phys. A, doi:10.1088/1751-8121/aea3c9):

  * singular polynomials  Q_k = 2a_k - b_k,  (a_k, b_k) = Phi^k(1, lambda)       [eq. (19)]
  * localized multiplicity  V_l - 2V_{l-1} + nu_l                               [eqs. (32)-(34)]
  * extended eigenvalues = roots of P+P- that are not on the ladder             [section 4.5]

Real roots are isolated in exact rational arithmetic (sympy) and refined to
30 digits, because some roots on different rungs agree to ~20 digits.
The full spectra are cross-checked against numpy diagonalization of the
explicit lattice whenever V_L is small enough.

    python tools/diamond/precompute.py          # writes diamond-spectrum/assets/data/spectrum.json
"""
import json
import sys
from fractions import Fraction
from pathlib import Path

import mpmath as mp
import numpy as np
import sympy as sp

mp.mp.dps = 40
LAM = sp.Symbol("lam")
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "diamond-spectrum" / "assets" / "data" / "spectrum.json"


def V(b, l):
    return 2 + b * ((2 * b) ** l - 1) // (2 * b - 1)


def E(b, l):
    return (2 * b) ** l


def phi(a, be, b):
    s = 2 * a - be
    return sp.expand(a * s - 1), sp.expand(be * s / b)


_orbit_cache = {}


def orbit(b, k):
    """[(a_0,b_0), ..., (a_k,b_k)] starting from (1, lambda), as polynomials."""
    key = (b, k)
    if key not in _orbit_cache:
        pts = [(sp.Integer(1), LAM)]
        for _ in range(k):
            pts.append(phi(*pts[-1], sp.Rational(b)))
        _orbit_cache[key] = pts
    return _orbit_cache[key]


def Q(b, k):
    a, be = orbit(b, k)[k]
    return sp.Poly(2 * a - be, LAM, domain="QQ")


def real_roots(poly, digits=30):
    """Exact isolation + refinement. Returns list of mpf (sorted)."""
    eps = sp.Rational(1, 10 ** digits)
    roots = []
    for (lo, hi), mult in poly.intervals():
        if lo != hi:
            lo, hi = poly.refine_root(lo, hi, eps=eps)
        roots.append(mp.mpf(sp.Rational(lo + hi, 2).p) / mp.mpf(sp.Rational(lo + hi, 2).q))
    return sorted(roots)


def refine_near(poly, x, digits=75):
    """The root of poly closest to x, re-isolated exactly to `digits` decimals."""
    with mp.workdps(digits + 10):
        for (lo, hi), _ in poly.intervals(eps=sp.Rational(1, 10 ** 32)):
            if lo - sp.Rational(1, 10 ** 25) <= sp.Rational(str(x)) <= hi + sp.Rational(1, 10 ** 25):
                lo, hi = poly.refine_root(lo, hi, eps=sp.Rational(1, 10 ** digits))
                mid = sp.Rational(lo + hi, 2)
                return mp.mpf(mid.p) / mid.q
    raise ValueError(f"no root near {x}")


def nu(b, l):
    if l == 1:
        return 2 if b == 2 else 1
    return 1


def spectrum(b, L, ladder):
    """Distinct eigenvalues of L^(L) with multiplicity and origin (k = depth on the ladder, or 'ext')."""
    out = []
    for l in range(1, L + 1):
        k = L - l
        m = V(b, l) - 2 * V(b, l - 1) + nu(b, l)
        for r in ladder[k]:
            out.append({"lam": r, "mult": m, "k": k})

    a0, b0 = orbit(b, L)[L]
    p_plus = sp.Poly(b0 - a0 - 1, LAM, domain="QQ")
    p_minus = sp.Poly(b0 - a0 + 1, LAM, domain="QQ")
    pp = (p_plus * p_minus).sqf_part()
    for l in range(1, L + 1):
        g = sp.gcd(pp, Q(b, L - l))
        if g.degree() > 0:
            pp = sp.div(pp, g)[0]
    for r in real_roots(pp):
        out.append({"lam": r, "mult": 1, "k": "ext"})

    total = sum(e["mult"] for e in out)
    assert total == V(b, L), f"dimension audit failed for b={b}, L={L}: {total} != {V(b, L)}"
    out.sort(key=lambda e: e["lam"])
    return out


def build_lattice(b, L):
    edges = [(0, 1)]
    n = 2
    for _ in range(L):
        new = []
        for u, v in edges:
            for _ in range(b):
                m = n
                n += 1
                new += [(u, m), (m, v)]
        edges = new
    A = np.zeros((n, n))
    for u, v in edges:
        A[u, v] = A[v, u] = 1
    return np.diag(A.sum(1)) - A


def check_numerically(b, L, spec):
    ev = np.sort(np.linalg.eigvalsh(build_lattice(b, L)))
    predicted = np.sort(np.concatenate([[float(e["lam"])] * e["mult"] for e in spec]))
    err = np.max(np.abs(ev - predicted) / np.maximum(1, np.abs(ev)))
    assert err < 1e-8, f"numeric mismatch b={b} L={L}: {err}"
    return err


def f(x):
    return float(x)


def main():
    data = {"source": "Ladiana, J. Phys. A (2026), doi:10.1088/1751-8121/aea3c9", "ladder": {}, "spectra": {}, "butterfly": {}}

    ladder_k = {2: 7, 3: 6, 4: 5}
    spectra_L = {2: 6, 3: 5, 4: 4}
    ladders = {}

    for b in range(2, 13):
        kmax = max(ladder_k.get(b, 2), spectra_L.get(b, 3) - 1)
        ladders[b] = []
        for k in range(kmax + 1):
            rts = real_roots(Q(b, k))
            assert len(rts) == 2 ** k, f"Q_{k} for b={b} should have {2**k} real roots, got {len(rts)}"
            ladders[b].append(rts)
        print(f"b={b}: ladder up to k={kmax}", file=sys.stderr)

    for b, kmax in ladder_k.items():
        data["ladder"][str(b)] = [[f(r) for r in ladders[b][k]] for k in range(kmax + 1)]

    for b, Lmax in spectra_L.items():
        data["spectra"][str(b)] = {}
        for L in range(1, Lmax + 1):
            spec = spectrum(b, L, ladders[b])
            if V(b, L) <= 2000:
                check_numerically(b, L, spec)
            data["spectra"][str(b)][str(L)] = [[f(e["lam"]), e["mult"], e["k"]] for e in spec]
            print(f"b={b} L={L}: V={V(b, L)}, {len(spec)} distinct", file=sys.stderr)

    for b in range(2, 13):
        spec = spectrum(b, 3, ladders[b])
        if V(b, 3) <= 2000:
            check_numerically(b, 3, spec)
        data["butterfly"][str(b)] = [[f(e["lam"]), e["mult"], e["k"]] for e in spec]

    # near-collisions between consecutive rungs (b = 3): the "twins" of the paper's figure 4.
    # The closest pair of rungs k, k+1 agrees to ~20, ~56, ~150 digits for k = 3, 4, 5,
    # so each pair is re-isolated exactly at 300 digits.
    b = 3
    twins = []
    for k in (3, 4, 5):
        r1, r2 = min(((x, y) for x in ladders[b][k] for y in ladders[b][k + 1]), key=lambda p: abs(p[0] - p[1]))
        x1, x2 = refine_near(Q(b, k), r1, 300), refine_near(Q(b, k + 1), r2, 300)
        with mp.workdps(320):
            gap = abs(x2 - x1) / x2
        twins.append({
            "k1": k, "d1": mp.nstr(x1, 295, strip_zeros=False),
            "k2": k + 1, "d2": mp.nstr(x2, 295, strip_zeros=False),
            "relgap": mp.nstr(gap, 3),
        })
    data["twins"] = {"b": b, "pairs": twins}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)
    for t in twins:
        print(f"  twins Q_{t['k1']}/Q_{t['k2']} near {t['d1'][:12]}: relgap {t['relgap']}", file=sys.stderr)
    for b, kmax in ladder_k.items():
        print(f"  b={b}: max |roots| on rung {kmax} = {float(max(abs(r) for r in ladders[b][kmax])):.4g}", file=sys.stderr)


if __name__ == "__main__":
    main()

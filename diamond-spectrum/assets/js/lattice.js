/*
 * The Berker–Ostlund diamond lattice D_L^(b) and the maths the page needs.
 * Paper: A. Ladiana, "The Exact Laplacian Spectrum of the Berker–Ostlund Diamond Lattice",
 * J. Phys. A (2026). Equation numbers below refer to the published version.
 */

/** Counts, eqs. (1)–(2). */
export const V = (b, l) => 2 + (b * ((2 * b) ** l - 1)) / (2 * b - 1);
export const E = (b, l) => (2 * b) ** l;
/** Cyclomatic number of D_l: independent loops. */
export const loops = (b, l) => E(b, l) - V(b, l) + 1;

/**
 * Build D_L^(b) by inflation: every edge {u,v} becomes b paths u–m–v.
 * Vertices 0 = A and 1 = B are the roots. gen[i] is the level at which i was born.
 * diamonds[l] lists the motifs created at level l: {u, v, mids}.
 */
export function buildLattice(b, L) {
    let edges = [[0, 1]];
    let n = 2;
    const gen = [0, 0];
    const parent = [null, null];
    const diamonds = [null];
    const edgesAt = [edges];

    for (let l = 1; l <= L; l++) {
        const next = [];
        const motifs = [];
        for (const [u, v] of edges) {
            const mids = [];
            for (let k = 0; k < b; k++) {
                const m = n++;
                gen.push(l);
                parent.push({ u, v, k });
                mids.push(m);
                next.push([u, m], [m, v]);
            }
            motifs.push({ u, v, mids });
        }
        edges = next;
        diamonds.push(motifs);
        edgesAt.push(next);
    }

    const deg = new Array(n).fill(0);
    const nbrs = Array.from({ length: n }, () => []);
    for (const [u, v] of edges) {
        deg[u]++; deg[v]++;
        nbrs[u].push(v); nbrs[v].push(u);
    }
    return { b, L, n, edges, gen, parent, diamonds, edgesAt, deg, nbrs };
}

/**
 * Recursive layout: A=(0,0), B=(1,0); intermediates of {u,v} are spread across the
 * perpendicular bisector. Older vertices never move, so decimation = fading out the newest.
 * Spread and its decay per level were tuned to keep distinct vertices apart.
 */
const SPREAD = { 2: [0.4, 0.8], 3: [0.42, 0.7], 4: [0.56, 0.7], 5: [0.58, 0.8] };

export function layout(g) {
    const [spread, decay] = SPREAD[g.b] ?? [0.5, 0.75];
    const x = new Float64Array(g.n), y = new Float64Array(g.n);
    x[1] = 1;
    for (let l = 1; l <= g.L; l++) {
        const sp = spread * decay ** (l - 1);
        for (const { u, v, mids } of g.diamonds[l]) {
            const dx = x[v] - x[u], dy = y[v] - y[u];
            const mx = (x[u] + x[v]) / 2, my = (y[u] + y[v]) / 2;
            mids.forEach((m, k) => {
                const t = g.b === 1 ? 0 : (2 * k) / (g.b - 1) - 1;
                x[m] = mx - dy * sp * t;
                y[m] = my + dx * sp * t;
            });
        }
    }
    return { x, y };
}

/** Dense combinatorial Laplacian D − A (row-major Float64Array). */
export function laplacian(g) {
    const n = g.n;
    const M = new Float64Array(n * n);
    for (let i = 0; i < n; i++) M[i * n + i] = g.deg[i];
    for (const [u, v] of g.edges) {
        M[u * n + v] -= 1;
        M[v * n + u] -= 1;
    }
    return M;
}

/** ‖Lψ − λψ‖ / ‖ψ‖ using the adjacency lists (works for any size). */
export function residual(g, psi, lambda) {
    let r = 0, s = 0;
    for (let i = 0; i < g.n; i++) {
        let lp = g.deg[i] * psi[i];
        for (const j of g.nbrs[i]) lp -= psi[j];
        r += (lp - lambda * psi[i]) ** 2;
        s += psi[i] ** 2;
    }
    return Math.sqrt(r / (s || 1));
}

/**
 * Cyclic Jacobi eigensolver for a symmetric matrix (row-major). Returns eigenvalues
 * and column eigenvectors, sorted ascending. Fine up to a few hundred rows.
 */
export function jacobiEigen(Min, n, maxSweeps = 60) {
    const a = Float64Array.from(Min);
    const v = new Float64Array(n * n);
    for (let i = 0; i < n; i++) v[i * n + i] = 1;

    let scale = 0;
    for (let i = 0; i < n * n; i++) scale += a[i] * a[i];

    for (let sweep = 0; sweep < maxSweeps; sweep++) {
        let off = 0;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
        if (off < 1e-26 * scale) break;

        for (let p = 0; p < n; p++) {
            for (let q = p + 1; q < n; q++) {
                const apq = a[p * n + q];
                if (Math.abs(apq) < 1e-300) continue;
                const app = a[p * n + p], aqq = a[q * n + q];
                const theta = (aqq - app) / (2 * apq);
                const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(t * t + 1), s = t * c;

                for (let k = 0; k < n; k++) {
                    if (k === p || k === q) continue;
                    const akp = a[k * n + p], akq = a[k * n + q];
                    const np = c * akp - s * akq, nq = s * akp + c * akq;
                    a[k * n + p] = a[p * n + k] = np;
                    a[k * n + q] = a[q * n + k] = nq;
                }
                a[p * n + p] = app - t * apq;
                a[q * n + q] = aqq + t * apq;
                a[p * n + q] = a[q * n + p] = 0;

                for (let k = 0; k < n; k++) {
                    const vkp = v[k * n + p], vkq = v[k * n + q];
                    v[k * n + p] = c * vkp - s * vkq;
                    v[k * n + q] = s * vkp + c * vkq;
                }
            }
        }
    }

    const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i * n + i] - a[j * n + j]);
    const values = order.map(i => a[i * n + i]);
    const vectors = order.map(j => {
        const col = new Float64Array(n);
        for (let k = 0; k < n; k++) col[k] = v[k * n + j];
        return col;
    });
    return { values, vectors };
}

/**
 * Replace a basis of a degenerate eigenspace by its reduced row-echelon form.
 * Each new vector vanishes on the other vectors' pivot vertices, which makes
 * the basis as local as the eigenspace allows (here: single diamonds and loops).
 */
export function sparsify(vectors) {
    const m = vectors.length;
    if (m < 2) return vectors;
    const n = vectors[0].length;
    const R = vectors.map(v => Float64Array.from(v));
    let row = 0;
    for (let col = 0; col < n && row < m; col++) {
        let p = row;
        for (let i = row + 1; i < m; i++) if (Math.abs(R[i][col]) > Math.abs(R[p][col])) p = i;
        if (Math.abs(R[p][col]) < 1e-9) continue;
        [R[row], R[p]] = [R[p], R[row]];
        const piv = R[row][col];
        for (let j = 0; j < n; j++) R[row][j] /= piv;
        for (let i = 0; i < m; i++) {
            if (i === row) continue;
            const f = R[i][col];
            if (f !== 0) for (let j = 0; j < n; j++) R[i][j] -= f * R[row][j];
        }
        row++;
    }
    return R.map(v => {
        let s = 0;
        for (let j = 0; j < n; j++) { if (Math.abs(v[j]) < 1e-9) v[j] = 0; s += v[j] * v[j]; }
        s = Math.sqrt(s) || 1;
        for (let j = 0; j < n; j++) v[j] /= s;
        return v;
    });
}

/** Group sorted eigenvalues into distinct levels: [{lambda, indices}]. */
export function groupLevels(values, tol = 1e-7) {
    const levels = [];
    values.forEach((val, i) => {
        const last = levels[levels.length - 1];
        if (last && Math.abs(val - last.lambda) <= tol * Math.max(1, Math.abs(val))) last.indices.push(i);
        else levels.push({ lambda: val, indices: [i] });
    });
    levels.forEach(l => { l.lambda = l.indices.reduce((s, i) => s + values[i], 0) / l.indices.length; });
    return levels;
}

/** The renormalization map Φ of eq. (17)/(49). */
export function phi(a, be, b) {
    const s = 2 * a - be;
    return [a * s - 1, (be * s) / b];
}

/** Orbit of (1, λ) under Φ: [[α0, β0], [α1, β1], ...]. */
export function orbit(lambda, b, steps) {
    const pts = [[1, lambda]];
    for (let i = 0; i < steps; i++) {
        const [a, be] = pts[pts.length - 1];
        if (!Number.isFinite(a) || Math.abs(a) > 1e12) break;
        pts.push(phi(a, be, b));
    }
    return pts;
}

/** Q_k(λ) = 2α_k − β_k evaluated by iterating Φ (eq. 19). */
export function Qk(lambda, b, k) {
    let a = 1, be = lambda;
    for (let i = 0; i < k; i++) [a, be] = phi(a, be, b);
    return 2 * a - be;
}

/** All real roots of Q_k in [lo, hi] by sign changes + bisection (good for small k). */
export function rootsOfQ(b, k, lo, hi, samples = 4000) {
    const roots = [];
    let x0 = lo, f0 = Qk(lo, b, k);
    for (let i = 1; i <= samples; i++) {
        const x1 = lo + ((hi - lo) * i) / samples, f1 = Qk(x1, b, k);
        if (f0 === 0) roots.push(x0);
        else if (f0 * f1 < 0) {
            let a = x0, c = x1, fa = f0;
            for (let it = 0; it < 80; it++) {
                const m = (a + c) / 2, fm = Qk(m, b, k);
                if (fa * fm <= 0) c = m; else { a = m; fa = fm; }
            }
            roots.push((a + c) / 2);
        }
        x0 = x1; f0 = f1;
    }
    return roots;
}

/** Symmetric-log axis helper: linear near 0, logarithmic far away. */
export const symlog = (x, c = 1) => Math.sign(x) * Math.log10(1 + Math.abs(x) / c);
export const symlogInv = (y, c = 1) => Math.sign(y) * c * (10 ** Math.abs(y) - 1);

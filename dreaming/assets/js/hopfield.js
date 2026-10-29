/*
 * The dreaming network in pattern space (Algorithm 1 of the paper), with the normalisation of
 * the reference code github.com/andrea-ladiana/dlam-mc-core:
 *   examples   eta = chi * xi,  P(chi = +1) = (1 + r)/2                                eq. (1)
 *   entropy    rho = (1 - r^2) / (M r^2)                                               eq. (2)
 *   stored     hat = mean(eta) / (r (1 + rho)),   C = hat hat^T / N
 *   kernel     A(t) = (1 + t)(I + tC)^-1                                               eq. (3)
 *   field      h_l = hat_l^T [ f_l A_l (hat_l s_l) + sum_{m != l} c_lm (hat_m s_m) ]
 *              f_l = g_auto (1 + rho_l) / N,   c_lm = g_hetero sqrt((1 + rho_l)(1 + rho_m)) / N
 *   update     s_i = +1 with probability (1 + tanh(beta h_i)) / 2 (synchronous)
 */

/** Small seeded generator (mulberry32), so a "run again" is reproducible when it should be. */
export function rng(seed = (Math.random() * 2 ** 32) >>> 0) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const entropy = (M, r) => (1 - r * r) / (M * r * r);

export function randomPatterns(K, N, R) {
    const xi = new Int8Array(K * N);
    for (let i = 0; i < xi.length; i++) xi[i] = R() < 0.5 ? 1 : -1;
    return xi;
}

/** One noisy example of a ±1 pattern: each entry kept with probability (1 + r)/2. */
export function example(x, r, R, out = new Int8Array(x.length)) {
    const keep = (1 + r) / 2;
    for (let i = 0; i < x.length; i++) out[i] = R() < keep ? x[i] : -x[i];
    return out;
}

/** Learn K patterns (K×N, row-major) from M examples each. Returns the stored layer. */
export function learn(xi, K, N, M, r, R) {
    const rho = entropy(M, r);
    const hat = new Float64Array(K * N);
    const norm = 1 / (M * r * (1 + rho));
    const keep = (1 + r) / 2;
    for (let mu = 0; mu < K; mu++) {
        const o = mu * N;
        for (let a = 0; a < M; a++)
            for (let i = 0; i < N; i++) hat[o + i] += R() < keep ? xi[o + i] : -xi[o + i];
        for (let i = 0; i < N; i++) hat[o + i] *= norm;
    }
    return { xi, hat, K, N, M, r, rho, C: gram(hat, K, N) };
}

/** C = hat hat^T / N. */
export function gram(hat, K, N) {
    const C = new Float64Array(K * K);
    for (let a = 0; a < K; a++)
        for (let b = a; b < K; b++) {
            let s = 0;
            const oa = a * N, ob = b * N;
            for (let i = 0; i < N; i++) s += hat[oa + i] * hat[ob + i];
            C[a * K + b] = C[b * K + a] = s / N;
        }
    return C;
}

/** The leading k×k block of a K×K matrix (the first k memories of a larger pool). */
export function block(C, K, k) {
    const B = new Float64Array(k * k);
    for (let a = 0; a < k; a++) B.set(C.subarray(a * K, a * K + k), a * k);
    return B;
}

/** Dreaming kernel A(t) = (1 + t)(I + tC)^-1 by Cholesky; A(0) = I. */
export function kernel(C, K, t) {
    const A = new Float64Array(K * K);
    if (t <= 0) { for (let a = 0; a < K; a++) A[a * K + a] = 1; return A; }
    const L = new Float64Array(K * K);
    for (let i = 0; i < K; i++)
        for (let j = 0; j <= i; j++) {
            let s = (i === j ? 1 : 0) + t * C[i * K + j];
            for (let k = 0; k < j; k++) s -= L[i * K + k] * L[j * K + k];
            L[i * K + j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j * K + j];
        }
    // invert column by column: L y = e_c, L^T x = y
    const y = new Float64Array(K);
    for (let c = 0; c < K; c++) {
        for (let i = 0; i < K; i++) {
            let s = i === c ? 1 : 0;
            for (let k = 0; k < i; k++) s -= L[i * K + k] * y[k];
            y[i] = s / L[i * K + i];
        }
        for (let i = K - 1; i >= 0; i--) {
            let s = y[i];
            for (let k = i + 1; k < K; k++) s -= L[k * K + i] * A[k * K + c];
            A[i * K + c] = s / L[i * K + i];
        }
    }
    for (let i = 0; i < A.length; i++) A[i] *= 1 + t;
    return A;
}

/** Eigenvalues of a symmetric n×n matrix (Householder tridiagonalisation + implicit QL). */
export function eigenvalues(M, n) {
    const a = Float64Array.from(M), d = new Float64Array(n), e = new Float64Array(n);
    for (let i = n - 1; i > 0; i--) {
        const l = i - 1;
        let h = 0;
        if (l > 0) {
            let scale = 0;
            for (let k = 0; k <= l; k++) scale += Math.abs(a[i * n + k]);
            if (scale === 0) e[i] = a[i * n + l];
            else {
                for (let k = 0; k <= l; k++) { a[i * n + k] /= scale; h += a[i * n + k] ** 2; }
                let f = a[i * n + l];
                let g = f >= 0 ? -Math.sqrt(h) : Math.sqrt(h);
                e[i] = scale * g; h -= f * g; a[i * n + l] = f - g; f = 0;
                for (let j = 0; j <= l; j++) {
                    g = 0;
                    for (let k = 0; k <= j; k++) g += a[j * n + k] * a[i * n + k];
                    for (let k = j + 1; k <= l; k++) g += a[k * n + j] * a[i * n + k];
                    e[j] = g / h; f += e[j] * a[i * n + j];
                }
                const hh = f / (h + h);
                for (let j = 0; j <= l; j++) {
                    f = a[i * n + j]; e[j] = g = e[j] - hh * f;
                    for (let k = 0; k <= j; k++) a[j * n + k] -= f * e[k] + g * a[i * n + k];
                }
            }
        } else e[i] = a[i * n + l];
    }
    for (let i = 0; i < n; i++) d[i] = a[i * n + i];
    for (let i = 1; i < n; i++) e[i - 1] = e[i];
    e[n - 1] = 0;
    for (let l = 0; l < n; l++) {
        let iter = 0, m;
        do {
            for (m = l; m < n - 1; m++) {
                const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
                if (Math.abs(e[m]) <= 1e-14 * dd) break;
            }
            if (m !== l) {
                if (iter++ === 60) break;
                let g = (d[l + 1] - d[l]) / (2 * e[l]);
                let r = Math.hypot(g, 1);
                g = d[m] - d[l] + e[l] / (g + (g >= 0 ? r : -r));
                let s = 1, c = 1, p = 0, i;
                for (i = m - 1; i >= l; i--) {
                    const f = s * e[i], b = c * e[i];
                    e[i + 1] = r = Math.hypot(f, g);
                    if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
                    s = f / r; c = g / r; g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * b;
                    d[i + 1] = g + (p = s * r); g = c * r - b;
                }
                if (r === 0 && i >= l) continue;
                d[l] -= p; e[l] = g; e[m] = 0;
            }
        } while (m !== l);
    }
    return d.sort();
}

/* ---------- dynamics ---------- */

/** p = hat s  (K-vector of raw overlaps with the stored patterns). */
export function project(hat, K, N, s, p = new Float64Array(K)) {
    for (let mu = 0; mu < K; mu++) {
        let acc = 0;
        const o = mu * N;
        for (let i = 0; i < N; i++) acc += hat[o + i] * s[i];
        p[mu] = acc;
    }
    return p;
}

/** h = hat^T v. */
export function spread(hat, K, N, v, h = new Float64Array(N)) {
    h.fill(0);
    for (let mu = 0; mu < K; mu++) {
        const w = v[mu], o = mu * N;
        if (w !== 0) for (let i = 0; i < N; i++) h[i] += hat[o + i] * w;
    }
    return h;
}

/** Synchronous Glauber update in place; beta = Infinity is the deterministic sign rule. */
export function glauber(s, h, beta, R) {
    for (let i = 0; i < s.length; i++) {
        if (beta === Infinity) s[i] = h[i] > 0 ? 1 : h[i] < 0 ? -1 : (R() < 0.5 ? 1 : -1);
        else s[i] = R() < 0.5 * (1 + Math.tanh(beta * h[i])) ? 1 : -1;
    }
}

export function overlap(s, x, o, N) {
    let acc = 0;
    for (let i = 0; i < N; i++) acc += s[i] * x[o + i];
    return acc / N;
}

/**
 * Multi-layer network. layers: [{hat, K, N, rho}], A: kernel per layer.
 * step(states) updates every layer synchronously from the same old states.
 */
export function network(layers, A, { gAuto = 1, gHetero = 0, beta = 10, R = Math.random } = {}) {
    const L = layers.length, K = layers[0].K;
    const p = layers.map(() => new Float64Array(K)), v = new Float64Array(K), Av = new Float64Array(K);
    const h = layers.map(l => new Float64Array(l.N));
    const f = layers.map(l => (gAuto * (1 + l.rho)) / l.N);
    const c = (a, b) => (gHetero * Math.sqrt((1 + layers[a].rho) * (1 + layers[b].rho))) / Math.sqrt(layers[a].N * layers[b].N);
    return {
        step(states) {
            for (let l = 0; l < L; l++) project(layers[l].hat, K, layers[l].N, states[l], p[l]);
            for (let l = 0; l < L; l++) {
                const Al = A[l];
                for (let a = 0; a < K; a++) {
                    let acc = 0;
                    for (let b = 0; b < K; b++) acc += Al[a * K + b] * p[l][b];
                    Av[a] = f[l] * acc;
                }
                for (let m = 0; m < L; m++) if (m !== l && gHetero) {
                    const cl = c(l, m);
                    for (let a = 0; a < K; a++) Av[a] += cl * p[m][a];
                }
                v.set(Av);
                spread(layers[l].hat, K, layers[l].N, v, h[l]);
            }
            for (let l = 0; l < L; l++) glauber(states[l], h[l], beta, R);
        },
    };
}

/** Run a single layer from s until it stops changing (or maxSteps). Returns the number of steps. */
export function relax(net, s, maxSteps = 60) {
    const prev = new Int8Array(s.length);
    for (let n = 1; n <= maxSteps; n++) {
        prev.set(s);
        net.step([s]);
        let same = true;
        for (let i = 0; i < s.length; i++) if (s[i] !== prev[i]) { same = false; break; }
        if (same) return n;
    }
    return maxSteps;
}

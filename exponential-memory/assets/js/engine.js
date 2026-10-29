/*
 * The exponential hetero-associative network of the paper, two ways.
 *
 * Memory: P stored items, each one pattern per layer, as an Int8Array laid out
 *   [item][layer][neuron]. Its update is the zero-temperature rule
 *   sigma_i^a <- sign h_i^a, with h_i^a = sum_mu exp(Ê_mu) sinh(xi_i^{mu,a} F_mu^a) Phi_mu^(\a),
 *   every site seeing the cavity of the current state (one parallel sweep), as in
 *   the reference code (tam_engine_torch.one_step_parallel_batched).
 *
 * oneStepTrial: the paper's capacity and basin experiments, where P fresh random
 *   items are drawn for every trial. Layers of up to 32 neurons are packed in one
 *   integer each, so overlaps are popcounts and a million items cost a few MB.
 */

export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** 32 random bits from a uniform generator. */
const bits32 = R => (R() * 4294967296) >>> 0;

const binom2 = L => (L * (L - 1)) / 2;
/**
 * Items whose weight is this far (in log units) below the leader cannot change a
 * sign: e^-40 of headroom beyond the largest shift the cavity and on-site terms allow.
 */
const margin = L => 40 + L * (L - 1) + (L - 1) * (L + 1);

/* ------------------------------------------------------------------ */
/*  Stored memory                                                      */
/* ------------------------------------------------------------------ */
export class Memory {
    constructor(xi, P, L, N) {
        Object.assign(this, { xi, P, L, N });
        this.m = new Float64Array(P * L);
        this.E = new Float64Array(P);
        this.keep = new Int32Array(P);
    }

    /**
     * Mattis overlaps m[mu*L + a] of every item with the state. Layers in `skip`
     * keep the values of the previous call (a clamped cue does not change).
     */
    overlaps(state, skip = []) {
        const { xi, P, L, N, m } = this;
        const layers = [];
        for (let a = 0; a < L; a++) if (!skip.includes(a)) layers.push(a);
        for (let mu = 0; mu < P; mu++)
            for (const a of layers) {
                let s = 0;
                const o = (mu * L + a) * N, so = a * N;
                for (let i = 0; i < N; i++) s += xi[o + i] * state[so + i];
                m[mu * L + a] = s / N;
            }
        return m;
    }

    /** Ê of every item at the full overlaps (no cavity): its log-weight in the vote. */
    energies(state, skip = []) {
        const { P, L, N, m, E } = this;
        this.overlaps(state, skip);
        const c = N * binom2(L);
        for (let mu = 0; mu < P; mu++) {
            let s = 0, s2 = 0;
            for (let a = 0; a < L; a++) { const v = m[mu * L + a]; s += v; s2 += v * v; }
            E[mu] = 0.5 * N * (s * s - s2) - c;
        }
        return E;
    }

    /**
     * Feed-forward seed of the unknown layers from the known ones (cue_seed in the
     * reference code): unknown overlaps are set to zero, so each item weighs in by
     * how well the known layers alone agree with it.
     */
    seed(cue, known) {
        const { xi, P, L, N, m, E } = this;
        const isKnown = new Uint8Array(L);
        known.forEach(a => (isKnown[a] = 1));
        this.overlaps(cue);
        const c = N * binom2(L);
        let Emax = -Infinity;
        for (let mu = 0; mu < P; mu++) {
            let s = 0, s2 = 0;
            for (let a = 0; a < L; a++) if (isKnown[a]) { const v = m[mu * L + a]; s += v; s2 += v * v; }
            E[mu] = 0.5 * N * (s * s - s2) - c;
            if (E[mu] > Emax) Emax = E[mu];
        }
        const out = Int8Array.from(cue);
        const H = new Float64Array(N);
        for (let a = 0; a < L; a++) {
            if (isKnown[a]) continue;
            H.fill(0);
            for (let mu = 0; mu < P; mu++) {
                if (E[mu] < Emax - margin(L)) continue;
                let F = 0;
                for (let b = 0; b < L; b++) if (isKnown[b]) F += m[mu * L + b];
                const w = Math.exp(E[mu] - Emax) * Math.sinh(F);
                if (w === 0) continue;
                const o = (mu * L + a) * N;
                for (let i = 0; i < N; i++) H[i] += w * xi[o + i];
            }
            for (let i = 0; i < N; i++) out[a * N + i] = H[i] >= 0 ? 1 : -1;
        }
        return out;
    }

    /**
     * One parallel sweep. Layers listed in `clamp` keep their values. Votes are
     * summed relative to the leading Ê, which the cavity can shift by O(L^2) only.
     */
    step(state, clamp = [], cached = false) {
        const { xi, P, L, N, m, E, keep } = this;
        this.energies(state, cached ? clamp : []);
        let Emax = -Infinity;
        for (let mu = 0; mu < P; mu++) if (E[mu] > Emax) Emax = E[mu];
        let K = 0;
        for (let mu = 0; mu < P; mu++) if (E[mu] >= Emax - margin(L)) keep[K++] = mu;

        const free = [];
        for (let a = 0; a < L; a++) if (!clamp.includes(a)) free.push(a);
        const h = new Float64Array(L * N);
        const c = N * binom2(L) + Emax;
        const x = new Float64Array(L), mh = new Float64Array(L), F = new Float64Array(L);
        for (let k = 0; k < K; k++) {
            const mu = keep[k], o = mu * L * N;
            for (let i = 0; i < N; i++) {
                let s = 0, s2 = 0;
                for (let b = 0; b < L; b++) {
                    x[b] = xi[o + b * N + i] * state[b * N + i];
                    mh[b] = m[mu * L + b] - x[b] / N;
                    s += mh[b]; s2 += mh[b] * mh[b];
                }
                let S = 0;
                for (let b = 0; b < L; b++) { F[b] = s - mh[b]; S += x[b] * F[b]; }
                const base = 0.5 * N * (s * s - s2) - c + S;
                for (const a of free)
                    h[a * N + i] += Math.exp(base - x[a] * F[a]) * Math.sinh(xi[o + a * N + i] * F[a]);
            }
        }
        const out = Int8Array.from(state);
        for (const a of free) for (let i = 0; i < N; i++) out[a * N + i] = h[a * N + i] >= 0 ? 1 : -1;
        return out;
    }

    /** Cue-driven recall: seed the unknown layers, then sweep with the cue clamped. */
    recall(cue, known, steps = 5) {
        let s = this.seed(cue, known);
        const path = [s];
        for (let t = 0; t < steps; t++) {
            // the seed already measured the cue layers, and they stay clamped
            const n = this.step(s, known, true);
            path.push(n);
            if (n.every((v, i) => v === s[i])) { s = n; break; }
            s = n;
        }
        return { state: s, path };
    }

    /** Vote share of every item at a state: softmax of its log-weight Ê. */
    shares(state) {
        const E = this.energies(state);
        let mx = -Infinity;
        for (const e of E) if (e > mx) mx = e;
        const w = new Float64Array(this.P);
        let z = 0;
        for (let mu = 0; mu < this.P; mu++) { w[mu] = Math.exp(E[mu] - mx); z += w[mu]; }
        for (let mu = 0; mu < this.P; mu++) w[mu] /= z;
        return w;
    }
}

/** Overlap between two ±1 vectors (or slices). */
export function overlap(a, b, ao = 0, bo = 0, n = a.length - ao) {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[ao + i] * b[bo + i];
    return s / n;
}

/* ------------------------------------------------------------------ */
/*  Packed random memories (N <= 32): one integer per item and layer   */
/* ------------------------------------------------------------------ */
const pop = v => {
    v -= (v >>> 1) & 0x55555555;
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return (Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
};
const maskOf = N => (N === 32 ? 0xffffffff : ((1 << N) >>> 0) - 1);

/** P random items of L layers of N <= 32 neurons. Bit set = neuron at -1. */
export function packedItems(P, L, N, R) {
    const w = new Uint32Array(P * L), mask = maskOf(N);
    for (let k = 0; k < w.length; k++) w[k] = bits32(R) & mask;
    return w;
}

/** A copy of item mu with every neuron kept with probability (1 + r)/2. */
export function corruptPacked(words, mu, L, N, r, R) {
    const s = new Uint32Array(L);
    for (let a = 0; a < L; a++) {
        let flip = 0;
        for (let i = 0; i < N; i++) if (R() < (1 - r) / 2) flip |= 1 << i;
        s[a] = (words[mu * L + a] ^ flip) & maskOf(N);
    }
    return s;
}

/**
 * One parallel sweep of the packed network. Every item's vote is accumulated
 * relative to the best Ê seen so far, rescaling when a better one turns up.
 */
export function sweepPacked(words, P, L, N, state) {
    const c = N * binom2(L), M = margin(L);
    const acc = new Float64Array(L * N);
    const d = new Uint32Array(L), m = new Float64Array(L);
    const x = new Float64Array(L), mh = new Float64Array(L), F = new Float64Array(L);
    let ref = -Infinity;
    for (let mu = 0, o = 0; mu < P; mu++, o += L) {
        let s = 0, s2 = 0;
        for (let a = 0; a < L; a++) {
            d[a] = (words[o + a] ^ state[a]) >>> 0;
            m[a] = 1 - (2 * pop(d[a])) / N;
            s += m[a]; s2 += m[a] * m[a];
        }
        const E = 0.5 * N * (s * s - s2) - c;
        if (E < ref - M) continue;
        if (E > ref) {
            const f = Math.exp(ref - E);
            for (let k = 0; k < acc.length; k++) acc[k] *= f;
            ref = E;
        }
        for (let i = 0; i < N; i++) {
            let ss = 0, ss2 = 0;
            for (let a = 0; a < L; a++) {
                x[a] = (d[a] >>> i) & 1 ? -1 : 1;
                mh[a] = m[a] - x[a] / N;
                ss += mh[a]; ss2 += mh[a] * mh[a];
            }
            let S = 0;
            for (let a = 0; a < L; a++) { F[a] = ss - mh[a]; S += x[a] * F[a]; }
            const base = 0.5 * N * (ss * ss - ss2) - c - ref + S;
            for (let a = 0; a < L; a++) {
                const xiF = (words[o + a] >>> i) & 1 ? -F[a] : F[a];
                acc[a * N + i] += Math.exp(base - x[a] * F[a]) * Math.sinh(xiF);
            }
        }
    }
    const out = new Uint32Array(L);
    for (let a = 0; a < L; a++) {
        let v = 0;
        for (let i = 0; i < N; i++) if (acc[a * N + i] < 0) v |= 1 << i;
        out[a] = v >>> 0;
    }
    return out;
}

/** Overlap of a packed state with item mu, averaged over layers. */
export function packedOverlap(words, mu, L, N, state) {
    let s = 0;
    for (let a = 0; a < L; a++) s += 1 - (2 * pop((words[mu * L + a] ^ state[a]) >>> 0)) / N;
    return s / L;
}

/**
 * The paper's experiment in one call: draw P random items, start from item 0
 * at overlap r, apply `steps` sweeps, return the final overlap with item 0.
 */
export function freshTrial({ N, L, P, r = 1, steps = 1, R }) {
    const words = packedItems(P, L, N, R);
    let s = corruptPacked(words, 0, L, N, r, R);
    for (let t = 0; t < steps; t++) s = sweepPacked(words, P, L, N, s);
    return packedOverlap(words, 0, L, N, s);
}

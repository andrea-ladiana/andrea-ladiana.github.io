/* Closed forms of the paper: saddle point, noise rate rho_L, one-step overlaps, basins. */

export function erf(x) {
    // Abramowitz–Stegun 7.1.26 is too coarse near 1; use a series / continued fraction split
    const s = Math.sign(x), a = Math.abs(x);
    if (a < 2.5) {
        let sum = a, term = a;
        for (let n = 1; n < 80; n++) {
            term *= -a * a / n;
            const add = term / (2 * n + 1);
            sum += add;
            if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
        }
        return s * (2 / Math.sqrt(Math.PI)) * sum;
    }
    // erfc continued fraction (Lentz)
    let f = a, C = a, D = 0;
    for (let n = 1; n < 200; n++) {
        const an = n / 2;
        D = a + an * D; D = 1 / D;
        C = a + an / C;
        const d = C * D;
        f *= d;
        if (Math.abs(d - 1) < 1e-16) break;
    }
    const erfc = Math.exp(-a * a) / Math.sqrt(Math.PI) / f;
    return s * (1 - erfc);
}

export const logcosh = x => { x = Math.abs(x); return x + Math.log1p(Math.exp(-2 * x)) - Math.LN2; };
const binom2 = L => (L * (L - 1)) / 2;

function bisect(f, lo, hi, it = 200) {
    let flo = f(lo);
    for (let k = 0; k < it; k++) {
        const mid = 0.5 * (lo + hi), fm = f(mid);
        if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return 0.5 * (lo + hi);
}

/** Positive root of tanh x = x / [2(L-1)]. */
export const xStar = L => bisect(x => Math.tanh(x) - x / (2 * (L - 1)), 1, 4 * (L - 1) + 40);
export const phi = (L, x) => -x * x / (4 * (L - 1)) + logcosh(x);
/** Noise rate: P_c ~ exp(N rho_L). */
export const rho = L => L * ((L - 1) - phi(L, xStar(L)));
export const mStar = L => xStar(L) / (2 * (L - 1));

/** Gaussian prefactor K_L of the per-pattern noise variance. */
export function KL(L) {
    const xs = xStar(L), ms = xs / (2 * (L - 1));
    const cosh2 = Math.cosh(xs) ** 2;
    const det = (cosh2 - 2 * (L - 1)) * (cosh2 + 2) ** (L - 1);
    return (2 * Math.PI) ** (L / 2) / Math.sqrt(det) * Math.sinh((L - 1) * ms) ** 2 * Math.cosh(2 * (L - 1) * ms) ** (L - 1);
}
/** One-step signal at the stored state. */
export const mu1 = L => Math.exp(-(L - 1)) * Math.sinh(L - 1);

/** Reduced load gamma = noise variance / signal^2. */
export const gamma = (L, N, P) => (P - 1) * KL(L) * Math.exp(-N * rho(L)) / mu1(L) ** 2;
/** Load at which gamma = g. */
export const loadAt = (L, N, g = 1) => 1 + g * mu1(L) ** 2 / (KL(L) * Math.exp(-N * rho(L)));
/** One-step overlap after one sweep from the stored state, eq. (m1step). */
export const m1step = (L, N, P) => erf(1 / Math.sqrt(2 * Math.max(gamma(L, N, P), 1e-300)));

/* ---------- corrupted cue ---------- */
export function mSaddleR(L, r) {
    const a = Math.atanh(Math.min(r, 1 - 1e-12));
    let m = Math.max(r, 0.5);
    for (let k = 0; k < 2000; k++) {
        const mn = Math.tanh((L - 1) * m + a);
        if (Math.abs(mn - m) < 1e-14) return mn;
        m = mn;
    }
    return m;
}
/** Annealed signal rate Sigma_L(r). */
export function Sigma(L, r) {
    const a = Math.atanh(Math.min(r, 1 - 1e-12)), ms = mSaddleR(L, r);
    return binom2(L) * (1 + ms * ms) - L * (logcosh((L - 1) * ms + a) - logcosh(a));
}
export const epsAnn = (L, r) => rho(L) - 2 * Sigma(L, r);
export const epsTyp = (L, r) => rho(L) - L * (L - 1) * (1 - r * r);
export const rcTyp = L => Math.sqrt(1 - rho(L) / (L * (L - 1)));
export const rcAnn = L => bisect(r => Sigma(L, r) - rho(L) / 2, 0.05, 0.95);

function CLhat(L, r) {
    const ms = mSaddleR(L, r), F = (L - 1) * ms, c2 = 1 / (1 - ms * ms);
    const det = (c2 - (L - 1)) * (c2 + 1) ** (L - 1);
    const pref = Math.sinh(F) * (Math.cosh(F) + r * Math.sinh(F)) ** (L - 1);
    return pref * (1 - ms * ms) ** (-L / 2) / Math.sqrt(det) * Math.exp(Sigma(L, r) - binom2(L) * (1 + ms * ms));
}
/** One-step overlap from a cue at overlap r, annealed signal. */
export function m1basinAnn(L, N, P, r) {
    if (r >= 1) return m1step(L, N, P);
    const lmu = Math.log(CLhat(L, r)) - N * Sigma(L, r);
    const lvar = Math.log(P - 1) + Math.log(KL(L)) - N * rho(L);
    return erf(Math.exp(lmu - 0.5 * lvar) / Math.SQRT2);
}
/** Same, with the typical signal. */
export function m1basinTyp(L, N, P, r) {
    const lmu = -N * binom2(L) * (1 - r * r);
    const lvar = Math.log(P - 1) + Math.log(KL(L)) - N * rho(L);
    return erf(Math.exp(lmu - 0.5 * lvar) / Math.SQRT2);
}

/**
 * Overlap of the componentwise majority of q independent targets with any one of them
 * (ties go to +1, as in the update rule). For odd q it is C(q-1, (q-1)/2) 2^-(q-1).
 */
export function majorityOverlap(q) {
    const sgn = v => (v >= 0 ? 1 : -1);
    let m = 0, p = 2 ** -(q - 1), c = 1;
    for (let k = 0; k < q; k++) {
        const S = 2 * k - (q - 1);
        m += p * c * 0.5 * (sgn(1 + S) - sgn(-1 + S));
        c = (c * (q - 1 - k)) / (k + 1);
    }
    return m;
}

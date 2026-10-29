/*
 * One-step signal-to-noise theory of a single dreaming layer (paper, §5 and Appendix, eqs. (35)–(38)).
 * Marchenko–Pastur bulk plus a rank-one signal spike:
 *   t m (m + α − 1) = 1 − m,   q = m (1 + tδm)/(1 + tm),   δ = ρ/(1 + ρ),   q2 = d(t q)/dt
 *   SNR² = (m − q)² / (q2 − q²)
 * with closed endpoints SNR²(0) = 1/(α(1+ρ)² + ρ) and SNR²(∞) = (1 − α)/(ρ(1 + αρ)).
 */

function mMP(alpha, t) {
    if (t === 0) return 1;
    const D = Math.sqrt(1 + 2 * (1 + alpha) * t + (1 - alpha) ** 2 * t * t);
    return (D - 1 + (1 - alpha) * t) / (2 * t);
}

function q(alpha, rho, t) {
    const d = rho / (1 + rho), m = mMP(alpha, t);
    return (m * (1 + t * d * m)) / (1 + t * m);
}

export function snr2(alpha, rho, t) {
    if (t <= 0) return hebb(alpha, rho);
    if (!isFinite(t)) return projector(alpha, rho);
    const m = mMP(alpha, t), qq = q(alpha, rho, t);
    const h = Math.max(1e-7, t * 1e-5);
    const q2 = ((t + h) * q(alpha, rho, t + h) - (t - h) * q(alpha, rho, t - h)) / (2 * h);
    return (m - qq) ** 2 / (q2 - qq * qq);
}

export const hebb = (alpha, rho) => 1 / (alpha * (1 + rho) ** 2 + rho);
export const projector = (alpha, rho) => (1 - alpha) / (rho * (1 + alpha * rho));

/** One-step overlap reached from the archetype: m(2) = erf(SNR / √2). */
export const oneStep = s2 => erf(Math.sqrt(s2 / 2));

/** The sleep time that maximises SNR² (golden search on log t), and the maximum. */
export function optimum(alpha, rho, lo = 1e-2, hi = 1e6) {
    let a = Math.log(lo), b = Math.log(hi);
    const g = (Math.sqrt(5) - 1) / 2;
    const f = x => -snr2(alpha, rho, Math.exp(x));
    let c = b - g * (b - a), d = a + g * (b - a);
    for (let i = 0; i < 80; i++) {
        if (f(c) < f(d)) b = d; else a = c;
        c = b - g * (b - a); d = a + g * (b - a);
    }
    const t = Math.exp((a + b) / 2);
    return { t, s2: snr2(alpha, rho, t) };
}

/** Abramowitz–Stegun 7.1.26, enough for a curve on screen. */
export function erf(x) {
    const s = Math.sign(x);
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
}

/*
 * core.js — the Lenia engine of the page, a line-by-line port of code/lenia.
 *
 *   A ← clip( A + dt [G(K∗A) + h] + √(2ϑ dt) ξ , 0, 1 ),     dt = 1/T
 *
 * With ϑ = 0 and h = 0 this is Chan's rule (2019); the noise temperature ϑ and the probe
 * field h are the extension studied in the project. Everything is float64, as in the
 * campaigns. Conventions follow the Python package exactly:
 *   kernels.py    shell kernel on the torus, origin at cell (0, 0), distances from the cell
 *                 centre, normalised to unit sum; four cores, three growth functions
 *   model.py      the step (growth, then field, then noise, then clip) and the tangent map
 *   observables   circular centroid, 8-connected components on the torus (threshold 0.1,
 *                 at least 5 cells), gyration radius
 *   lifetimes     the death criterion of E4 (split / mass / shape, tolerances 0.25)
 *   patterns      bilinear rescaling (scipy.ndimage.zoom, order 1), Voronoi noise patches
 *   catalogue     Chan's run-length encoding
 * The random numbers are not numpy's (xoshiro128** here): a seed gives the same run in
 * the page, not the same run as in Python. The noise is statistically the same.
 *
 * Works as a browser script (global LeniaCore), inside a Web Worker, and in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LeniaCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TAU = 2 * Math.PI;

  // ===================================================================== numbers
  /** Python's round(): halves go to the even neighbour. */
  function roundHalfEven(x) {
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
  }
  /** common.even: the nearest even integer (Python rounding). */
  function even(x) { return 2 * roundHalfEven(x / 2); }
  function minImage(d, N) { return d - N * roundHalfEven(d / N); }
  function largestPrimeFactor(n) {
    let p = 1;
    for (let d = 2; d * d <= n; d++) while (n % d === 0) { p = d; n /= d; }
    return n > 1 ? n : p;
  }
  /** Smallest size ≥ n whose prime factors are all ≤ 7 (fast for the FFT), or n itself
   *  when it is one of the protocol sizes. */
  function fastSize(n) {
    if (n === 104 || n === 208) return n;
    let m = Math.max(8, Math.ceil(n));
    while (largestPrimeFactor(m) > 7) m++;
    return m;
  }

  // ===================================================================== FFT
  // Complex FFT of any length, Stockham autosort, decimation in frequency.
  // Stage with radix r on a sequence of length L = r·m, stride s (L·s = n):
  //   y[q + s(r p + u)] = w_L^{p u} · Σ_t x[q + s(p + t m)] ω_r^{t u}
  // which leaves the transform in natural order after the last stage.
  function factorize(n) {
    const f = [];
    while (n % 4 === 0) { f.push(4); n /= 4; }
    while (n % 2 === 0) { f.push(2); n /= 2; }
    for (let p = 3; p * p <= n; p += 2) while (n % p === 0) { f.push(p); n /= p; }
    if (n > 1) f.push(n);
    return f;
  }

  class FFT1 {
    constructor(n) {
      this.n = n;
      this.radices = n > 1 ? factorize(n) : [];
      this.cos = new Float64Array(n);
      this.sin = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        const a = -TAU * j / n;
        this.cos[j] = Math.cos(a);
        this.sin[j] = Math.sin(a);
      }
      this.xr = new Float64Array(n); this.xi = new Float64Array(n);
      this.yr = new Float64Array(n); this.yi = new Float64Array(n);
      const rmax = Math.max(2, ...this.radices);
      this.tr = new Float64Array(rmax); this.ti = new Float64Array(rmax);
      // odd radices > 3: cos and sin of 2πk/r, and buffers for the pair sums and differences
      this.odd = {};
      for (const r of this.radices) if (r > 4 && !this.odd[r]) {
        const c = new Float64Array(r), s = new Float64Array(r);
        for (let k = 0; k < r; k++) { c[k] = Math.cos(TAU * k / r); s[k] = Math.sin(TAU * k / r); }
        this.odd[r] = { c, s };
      }
      this.pr = new Float64Array(rmax); this.pi = new Float64Array(rmax);
      this.mr = new Float64Array(rmax); this.mi = new Float64Array(rmax);
    }

    /** Forward DFT of (xr, xi); returns [re, im] (one of the two internal buffer pairs). */
    run() {
      const n = this.n, C = this.cos, S = this.sin;
      let ar = this.xr, ai = this.xi, br = this.yr, bi = this.yi;
      let s = 1, L = n;
      const c3 = Math.sqrt(3) / 2;
      for (const r of this.radices) {
        const m = L / r, sm = s * m;
        if (r === 4) {
          for (let p = 0; p < m; p++) {
            const w1 = p * s, c1 = C[w1], s1 = S[w1], c2 = C[2 * w1], s2 = S[2 * w1], cc3 = C[3 * w1], ss3 = S[3 * w1];
            for (let q = 0; q < s; q++) {
              const i0 = q + s * p, i1 = i0 + sm, i2 = i1 + sm, i3 = i2 + sm;
              const t0r = ar[i0] + ar[i2], t0i = ai[i0] + ai[i2];
              const t1r = ar[i0] - ar[i2], t1i = ai[i0] - ai[i2];
              const t2r = ar[i1] + ar[i3], t2i = ai[i1] + ai[i3];
              const t3r = ar[i1] - ar[i3], t3i = ai[i1] - ai[i3];
              const o = q + 4 * s * p;
              br[o] = t0r + t2r; bi[o] = t0i + t2i;
              let xr = t1r + t3i, xi = t1i - t3r;                 // t1 − i t3
              br[o + s] = xr * c1 - xi * s1; bi[o + s] = xr * s1 + xi * c1;
              xr = t0r - t2r; xi = t0i - t2i;                     // t0 − t2
              br[o + 2 * s] = xr * c2 - xi * s2; bi[o + 2 * s] = xr * s2 + xi * c2;
              xr = t1r - t3i; xi = t1i + t3r;                     // t1 + i t3
              br[o + 3 * s] = xr * cc3 - xi * ss3; bi[o + 3 * s] = xr * ss3 + xi * cc3;
            }
          }
        } else if (r === 2) {
          for (let p = 0; p < m; p++) {
            const w = p * s, c = C[w], sn = S[w];
            for (let q = 0; q < s; q++) {
              const i0 = q + s * p, i1 = i0 + sm, o = q + 2 * s * p;
              const ar0 = ar[i0], ai0 = ai[i0], ar1 = ar[i1], ai1 = ai[i1];
              br[o] = ar0 + ar1; bi[o] = ai0 + ai1;
              const xr = ar0 - ar1, xi = ai0 - ai1;
              br[o + s] = xr * c - xi * sn; bi[o + s] = xr * sn + xi * c;
            }
          }
        } else if (r === 3) {
          for (let p = 0; p < m; p++) {
            const w1 = p * s, c1 = C[w1], s1 = S[w1], c2 = C[2 * w1], s2 = S[2 * w1];
            for (let q = 0; q < s; q++) {
              const i0 = q + s * p, i1 = i0 + sm, i2 = i1 + sm, o = q + 3 * s * p;
              const sr = ar[i1] + ar[i2], si = ai[i1] + ai[i2];
              const dr = ar[i1] - ar[i2], di = ai[i1] - ai[i2];
              const mr = ar[i0] - 0.5 * sr, mi = ai[i0] - 0.5 * si;
              br[o] = ar[i0] + sr; bi[o] = ai[i0] + si;
              let xr = mr + c3 * di, xi = mi - c3 * dr;           // m − i(√3/2) d
              br[o + s] = xr * c1 - xi * s1; bi[o + s] = xr * s1 + xi * c1;
              xr = mr - c3 * di; xi = mi + c3 * dr;               // m + i(√3/2) d
              br[o + 2 * s] = xr * c2 - xi * s2; bi[o + 2 * s] = xr * s2 + xi * c2;
            }
          }
        } else {
          // odd radix r = 2h + 1: with P_t = a_t + a_{r−t}, M_t = a_t − a_{r−t} (t = 1..h),
          //   b_u     = X_u − i Y_u,   b_{r−u} = X_u + i Y_u,
          //   X_u = a_0 + Σ_t P_t cos(2π t u / r),   Y_u = Σ_t M_t sin(2π t u / r)
          const { c: cr, s: sr } = this.odd[r], h = (r - 1) >> 1;
          const Pr = this.pr, Pi = this.pi, Mr = this.mr, Mi = this.mi;
          for (let p = 0; p < m; p++) {
            for (let q = 0; q < s; q++) {
              const i0 = q + s * p, o = q + r * s * p;
              const a0r = ar[i0], a0i = ai[i0];
              let sr0 = a0r, si0 = a0i;
              for (let t = 1; t <= h; t++) {
                const ia = i0 + t * sm, ib = i0 + (r - t) * sm;
                Pr[t] = ar[ia] + ar[ib]; Pi[t] = ai[ia] + ai[ib];
                Mr[t] = ar[ia] - ar[ib]; Mi[t] = ai[ia] - ai[ib];
                sr0 += Pr[t]; si0 += Pi[t];
              }
              br[o] = sr0; bi[o] = si0;
              for (let u = 1; u <= h; u++) {
                let xr = a0r, xi = a0i, yr = 0, yi = 0, k = 0;
                for (let t = 1; t <= h; t++) {
                  k += u; if (k >= r) k -= r;                     // k = t·u mod r
                  const c = cr[k], sn = sr[k];
                  xr += Pr[t] * c; xi += Pi[t] * c;
                  yr += Mr[t] * sn; yi += Mi[t] * sn;
                }
                // b_u = X − iY, b_{r−u} = X + iY, then the twiddles w^{p u}, w^{p (r−u)}
                let vr = xr + yi, vi = xi - yr, w = p * u * s;
                br[o + u * s] = vr * C[w] - vi * S[w]; bi[o + u * s] = vr * S[w] + vi * C[w];
                vr = xr - yi; vi = xi + yr; w = p * (r - u) * s;
                br[o + (r - u) * s] = vr * C[w] - vi * S[w]; bi[o + (r - u) * s] = vr * S[w] + vi * C[w];
              }
            }
          }
        }
        let t = ar; ar = br; br = t;
        t = ai; ai = bi; bi = t;
        s *= r; L = m;
      }
      return [ar, ai];
    }
  }

  /** 2D forward FFT in place on N×N row-major (re, im). */
  class FFT2 {
    constructor(N) { this.N = N; this.f = new FFT1(N); }
    forward(re, im) {
      const N = this.N, f = this.f;
      for (let i = 0; i < N; i++) {
        const o = i * N;
        f.xr.set(re.subarray(o, o + N)); f.xi.set(im.subarray(o, o + N));
        const [rr, ri] = f.run();
        re.set(rr, o); im.set(ri, o);
      }
      for (let j = 0; j < N; j++) {
        const xr = f.xr, xi = f.xi;
        for (let i = 0, k = j; i < N; i++, k += N) { xr[i] = re[k]; xi[i] = im[k]; }
        const [rr, ri] = f.run();
        for (let i = 0, k = j; i < N; i++, k += N) { re[k] = rr[i]; im[k] = ri[i]; }
      }
    }
  }

  // ===================================================================== random numbers
  function splitmix32(a) {
    return function () {
      a = (a + 0x9e3779b9) | 0;
      let t = a ^ (a >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15;
      t = Math.imul(t, 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    };
  }
  const rotl = (x, k) => (x << k) | (x >>> (32 - k));

  /** xoshiro128** seeded by splitmix32; uniform() has 53 bits, normal() is Marsaglia's
   *  polar method. Streams: new RNG(seed, stream) gives independent sequences. */
  class RNG {
    constructor(seed = 1, stream = 0) {
      const sm = splitmix32((seed >>> 0) ^ Math.imul(stream + 1, 0x85ebca6b));
      for (let k = 0; k < (stream & 7); k++) sm();
      this.s0 = sm(); this.s1 = sm(); this.s2 = sm(); this.s3 = sm();
      if (!(this.s0 | this.s1 | this.s2 | this.s3)) this.s0 = 1;
      this.spare = 0; this.hasSpare = false;
    }
    u32() {
      const r = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
      const t = this.s1 << 9;
      this.s2 ^= this.s0; this.s3 ^= this.s1; this.s1 ^= this.s2; this.s0 ^= this.s3;
      this.s2 ^= t; this.s3 = rotl(this.s3, 11);
      return r;
    }
    uniform() { return ((this.u32() >>> 5) * 67108864 + (this.u32() >>> 6)) / 9007199254740992; }
    normal() {
      if (this.hasSpare) { this.hasSpare = false; return this.spare; }
      let u, v, s;
      do {
        u = this.uniform() * 2 - 1; v = this.uniform() * 2 - 1; s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const f = Math.sqrt(-2 * Math.log(s) / s);
      this.spare = v * f; this.hasSpare = true;
      return u * f;
    }
    fillNormal(a) {
      // polar method in 32-bit resolution (tails to ≈ 9σ), two numbers per accepted pair
      const n = a.length, k32 = 1 / 2147483648;
      let i = 0;
      while (i < n) {
        const u = (this.u32() | 0) * k32, v = (this.u32() | 0) * k32, s = u * u + v * v;
        if (s >= 1 || s === 0) continue;
        const f = Math.sqrt(-2 * Math.log(s) / s);
        a[i++] = u * f;
        if (i < n) a[i++] = v * f;
      }
    }
  }

  // ===================================================================== kernels.py
  const ALPHA = 4.0;
  const CORES = ["exponential", "polynomial", "rectangular", "gaussian"];
  const GROWTHS = ["gaussian", "polynomial", "step"];

  function kernelCore(r, core) {
    if (!(r > 0 && r < 1)) return 0;
    switch (core) {
      case "exponential": return Math.exp(ALPHA - ALPHA / (4.0 * r * (1.0 - r)));
      case "polynomial": return Math.pow(4.0 * r * (1.0 - r), ALPHA);
      case "rectangular": return (r >= 0.25 && r <= 0.75) ? 1 : 0;
      case "gaussian": return Math.exp(-0.5 * Math.pow((r - 0.5) / 0.15, 2));
      default: throw new Error("unknown kernel core " + core);
    }
  }
  function kernelShell(r, peaks, core) {
    if (r >= 1) return 0;
    const B = peaks.length, Br = B * r, idx = Math.min(Math.floor(Br), B - 1);
    return peaks[idx] * kernelCore(Br - idx, core);
  }
  /** numpy's pairwise summation (blocks of 8 accumulators, split in halves above 128). */
  function pairwise(a, lo, n) {
    if (n < 8) { let r = 0; for (let i = 0; i < n; i++) r += a[lo + i]; return r; }
    if (n <= 128) {
      let r0 = a[lo], r1 = a[lo + 1], r2 = a[lo + 2], r3 = a[lo + 3], r4 = a[lo + 4], r5 = a[lo + 5], r6 = a[lo + 6], r7 = a[lo + 7];
      let i = 8;
      for (; i < n - (n % 8); i += 8) {
        const o = lo + i;
        r0 += a[o]; r1 += a[o + 1]; r2 += a[o + 2]; r3 += a[o + 3]; r4 += a[o + 4]; r5 += a[o + 5]; r6 += a[o + 6]; r7 += a[o + 7];
      }
      let res = ((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7));
      for (; i < n; i++) res += a[lo + i];
      return res;
    }
    let n2 = Math.floor(n / 2); n2 -= n2 % 8;
    return pairwise(a, lo, n2) + pairwise(a, lo + n2, n - n2);
  }
  /** Sum of an array as numpy usually does it: pairwise within buffers of 8192. */
  function npSum(a) {
    let s = 0;
    for (let o = 0; o < a.length; o += 8192) s += pairwise(a, o, Math.min(8192, a.length - o));
    return s;
  }

  /** Normalised kernel on the N×N torus, origin at (0, 0); requires 2R < N. */
  function kernelGrid(N, R, peaks, core) {
    if (!(2 * R < N)) throw new Error(`2R < N is required (R=${R}, N=${N})`);
    const K = new Float64Array(N * N);
    for (let i = 0; i < N; i++) {
      const di = Math.min(i, N - i);
      for (let j = 0; j < N; j++) {
        const dj = Math.min(j, N - j);
        K[i * N + j] = kernelShell(Math.sqrt(di * di + dj * dj) / R, peaks, core);
      }
    }
    const sum = npSum(K);
    if (!(sum > 0)) throw new Error("kernel is identically zero: R is too small for the lattice");
    for (let k = 0; k < K.length; k++) K[k] /= sum;
    return K;
  }
  function growthFn(kind, mu, sigma) {
    const s2 = sigma * sigma;
    if (kind === "gaussian") return u => 2.0 * Math.exp(-((u - mu) * (u - mu)) / (2.0 * s2)) - 1.0;
    if (kind === "polynomial") return u => 2.0 * Math.pow(Math.max(0.0, 1.0 - (u - mu) * (u - mu) / (9.0 * s2)), ALPHA) - 1.0;
    if (kind === "step") return u => (Math.abs(u - mu) <= sigma ? 1.0 : -1.0);
    throw new Error("unknown growth " + kind);
  }
  function growthPrimeFn(kind, mu, sigma) {
    const s2 = sigma * sigma;
    if (kind === "gaussian") return u => -2.0 * (u - mu) / s2 * Math.exp(-((u - mu) * (u - mu)) / (2.0 * s2));
    if (kind === "polynomial") return u => {
      const base = Math.max(0.0, 1.0 - (u - mu) * (u - mu) / (9.0 * s2));
      return 2.0 * ALPHA * Math.pow(base, ALPHA - 1) * (-2.0 * (u - mu) / (9.0 * s2));
    };
    if (kind === "step") return () => 0.0;
    throw new Error("unknown growth " + kind);
  }

  // ===================================================================== the rule
  /** Kernel transform and convolution for one (N, R, peaks, core). The convolution with a
   *  real kernel is complex-linear, so two real fields are convolved at once by putting
   *  them in the real and imaginary parts (a state and its tangent vector, or two replicas). */
  class Convolver {
    constructor(N, R, peaks, core) {
      this.N = N; this.R = R; this.peaks = peaks.slice(); this.core = core;
      this.fft = new FFT2(N);
      this.K = kernelGrid(N, R, peaks, core);
      this.Kr = Float64Array.from(this.K);
      this.Ki = new Float64Array(N * N);
      this.fft.forward(this.Kr, this.Ki);
    }
    matches(N, R, peaks, core) {
      return N === this.N && R === this.R && core === this.core &&
        peaks.length === this.peaks.length && peaks.every((b, i) => b === this.peaks[i]);
    }
    /** (re + i im) ← K ∗ (re + i im), in place. */
    convolve(re, im) {
      const n = re.length, Kr = this.Kr, Ki = this.Ki, inv = 1 / n;
      this.fft.forward(re, im);
      for (let k = 0; k < n; k++) {
        const a = re[k], b = im[k];
        re[k] = a * Kr[k] - b * Ki[k];
        im[k] = -(a * Ki[k] + b * Kr[k]);           // conjugate, for the inverse
      }
      this.fft.forward(re, im);
      for (let k = 0; k < n; k++) { re[k] *= inv; im[k] = -im[k] * inv; }
    }
  }

  const DEFAULT_RULE = { mu: 0.15, sigma: 0.015, R: 13, T: 10, peaks: [1], core: "exponential", growth: "gaussian" };

  function normRule(r) {
    const o = Object.assign({}, DEFAULT_RULE, r || {});
    o.peaks = (o.peaks || [1]).map(Number);
    o.mu = +o.mu; o.sigma = +o.sigma; o.R = +o.R; o.T = +o.T;
    return o;
  }

  /**
   * The simulation of one field A on the N×N torus. Optional tangent vector V (exact
   * linearised map of one deterministic step, as model.tangent), used for Lyapunov
   * exponents. After each step the fields of that step stay available for display:
   *   U = K∗A (before the step), G = G(U), dA = A_new − A_old.
   */
  class Lenia {
    constructor(N, rule, opts = {}) {
      this.temp = 0; this.h = 0;
      this.seed = opts.seed ?? 1;
      this.rng = new RNG(this.seed);
      this.resize(N, rule);
      this.setTemp(opts.temp || 0);
      this.h = opts.h || 0;
    }
    resize(N, rule) {
      this.N = N | 0;
      const n = this.N * this.N;
      this.A = new Float64Array(n);
      this.U = new Float64Array(n); this.G = new Float64Array(n); this.dA = new Float64Array(n);
      this.re = new Float64Array(n); this.im = new Float64Array(n);
      this.xi = new Float64Array(n);
      this.V = null;
      this.rowSum = new Float64Array(this.N); this.colSum = new Float64Array(this.N);
      this.cosN = new Float64Array(this.N); this.sinN = new Float64Array(this.N);
      for (let i = 0; i < this.N; i++) { this.cosN[i] = Math.cos(TAU * i / this.N); this.sinN[i] = Math.sin(TAU * i / this.N); }
      this.conv = null;
      this.setRule(rule || this.rule || DEFAULT_RULE);
      this.steps = 0;
    }
    setRule(rule) {
      const r = normRule(rule);
      if (!this.conv || !this.conv.matches(this.N, r.R, r.peaks, r.core)) this.conv = new Convolver(this.N, r.R, r.peaks, r.core);
      this.rule = r;
      this.dt = 1.0 / r.T;
      this.g = growthFn(r.growth, r.mu, r.sigma);
      this.gp = growthPrimeFn(r.growth, r.mu, r.sigma);
      this.setTemp(this.temp);
    }
    setTemp(temp) {
      if (!(temp >= 0)) throw new Error("the noise temperature must be ≥ 0");
      this.temp = +temp;
      this.noiseAmp = Math.sqrt(2.0 * this.temp * this.dt);
    }
    setSeed(seed) { this.seed = seed >>> 0; this.rng = new RNG(this.seed); }
    get time() { return this.steps * this.dt; }

    /** Start the tangent dynamics from a normalised Gaussian vector. */
    enableTangent(seed = 12345) {
      const V = new Float64Array(this.N * this.N), rng = new RNG(seed, 7);
      let s = 0;
      for (let k = 0; k < V.length; k++) { V[k] = rng.normal(); s += V[k] * V[k]; }
      s = Math.sqrt(s);
      for (let k = 0; k < V.length; k++) V[k] /= s;
      this.V = V;
    }
    disableTangent() { this.V = null; }

    /**
     * One step. `xi` (optional): the N(0, 1) noise to use instead of the generator (for
     * validation against Python). Returns the norm of the tangent vector after the step
     * (before renormalisation), or NaN without tangent.
     */
    step(xi) {
      const N = this.N, A = this.A, re = this.re, im = this.im, U = this.U, G = this.G, dA = this.dA;
      const V = this.V, dt = this.dt, h = this.h, amp = this.noiseAmp, g = this.g, gp = this.gp;
      re.set(A);
      if (V) im.set(V); else im.fill(0);
      this.conv.convolve(re, im);
      const noisy = this.temp > 0;
      if (noisy) { if (xi) this.xi.set(xi); else this.rng.fillNormal(this.xi); }
      const X = this.xi, rs = this.rowSum, cs = this.colSum;
      cs.fill(0);
      let vnorm2 = 0;
      for (let i = 0; i < N; i++) {
        let rsum = 0;
        for (let j = 0, k = i * N; j < N; j++, k++) {
          const u = re[k], a = A[k];
          const gu = g(u);
          U[k] = u; G[k] = gu;
          if (V) {
            const pre = a + dt * gu;
            const v = (pre > 0.0 && pre < 1.0) ? V[k] + dt * gp(u) * im[k] : 0.0;
            V[k] = v; vnorm2 += v * v;
          }
          let nv = a + dt * (h !== 0 ? gu + h : gu);
          if (noisy) nv = nv + amp * X[k];
          nv = nv < 0.0 ? 0.0 : (nv > 1.0 ? 1.0 : nv);
          dA[k] = nv - a; A[k] = nv;
          rsum += nv; cs[j] += nv;
        }
        rs[i] = rsum;
      }
      this.steps++;
      return V ? Math.sqrt(vnorm2) : NaN;
    }

    /** Circular centroid (cy, cx) and resultant lengths from the profiles of the last step. */
    centroidFast() { return profileCentroid(this.rowSum, this.colSum, this.cosN, this.sinN); }

    /** Recompute the row and column profiles from A (after loading or editing a state,
     *  when no step has produced them yet). */
    updateProfiles() {
      const N = this.N, A = this.A, rs = this.rowSum, cs = this.colSum;
      cs.fill(0);
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let j = 0, k = i * N; j < N; j++, k++) { s += A[k]; cs[j] += A[k]; }
        rs[i] = s;
      }
    }

    /** Deterministic relaxation (ϑ = 0, h = 0) for n steps, keeping the settings. */
    relax(n) {
      const t = this.temp, h = this.h, V = this.V;
      this.setTemp(0); this.h = 0; this.V = null;
      for (let k = 0; k < n; k++) this.step();
      this.setTemp(t); this.h = h; this.V = V;
    }
  }

  // ===================================================================== observables
  function profileCentroid(py, px, cosN, sinN) {
    const N = py.length;
    let w = 0, zyr = 0, zyi = 0, zxr = 0, zxi = 0;
    for (let i = 0; i < N; i++) {
      w += py[i];
      zyr += py[i] * cosN[i]; zyi += py[i] * sinN[i];
      zxr += px[i] * cosN[i]; zxi += px[i] * sinN[i];
    }
    if (!(w > 0)) return { cy: 0, cx: 0, rho: 0, ry: 0, rx: 0, mass: 0 };
    const mod = (x) => ((x % N) + N) % N;
    const cy = mod(Math.atan2(zyi, zyr) * N / TAU), cx = mod(Math.atan2(zxi, zxr) * N / TAU);
    const ry = Math.hypot(zyr, zyi) / w, rx = Math.hypot(zxr, zxi) / w;
    return { cy, cx, rho: Math.min(ry, rx), ry, rx, mass: w };
  }

  /** observables.centroid on a field (N×N): circular mean per axis and ρ = min(ρy, ρx). */
  function centroid(A, N) {
    const py = new Float64Array(N), px = new Float64Array(N), c = new Float64Array(N), s = new Float64Array(N);
    for (let i = 0; i < N; i++) { c[i] = Math.cos(TAU * i / N); s[i] = Math.sin(TAU * i / N); }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const v = A[i * N + j]; py[i] += v; px[j] += v; }
    return profileCentroid(py, px, c, s);
  }

  function mass(A) { let m = 0; for (let k = 0; k < A.length; k++) m += A[k]; return m; }

  /**
   * 8-connected components of {A > threshold} on the torus (observables.label_periodic),
   * keeping those with at least `minSize` cells, sorted by mass. For each: mass, size,
   * circular centroid; for the most massive also the gyration radius and the label map.
   */
  function components(A, N, threshold = 0.1, minSize = 5, opts = {}) {
    const n = N * N;
    const parent = opts.parent && opts.parent.length === n ? opts.parent : new Int32Array(n);
    for (let k = 0; k < n; k++) parent[k] = A[k] > threshold ? k : -1;
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
    for (let i = 0; i < N; i++) {
      const id = (i + 1) % N;
      for (let j = 0; j < N; j++) {
        const k = i * N + j;
        if (parent[k] < 0) continue;
        const jr = (j + 1) % N, jl = (j - 1 + N) % N;
        // forward half of the 8-neighbourhood (right, down-left, down, down-right): the
        // other half is reached from the neighbours themselves; indices wrap (torus)
        let q = i * N + jr; if (parent[q] >= 0) unite(k, q);
        q = id * N + jl; if (parent[q] >= 0) unite(k, q);
        q = id * N + j; if (parent[q] >= 0) unite(k, q);
        q = id * N + jr; if (parent[q] >= 0) unite(k, q);
      }
    }
    const cosN = new Float64Array(N), sinN = new Float64Array(N);
    for (let i = 0; i < N; i++) { cosN[i] = Math.cos(TAU * i / N); sinN[i] = Math.sin(TAU * i / N); }
    const acc = new Map();
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const k = i * N + j;
        if (parent[k] < 0) continue;
        const r = find(k);
        let c = acc.get(r);
        if (!c) { c = { root: r, size: 0, mass: 0, yr: 0, yi: 0, xr: 0, xi: 0 }; acc.set(r, c); }
        const v = A[k];
        c.size++; c.mass += v;
        c.yr += v * cosN[i]; c.yi += v * sinN[i]; c.xr += v * cosN[j]; c.xi += v * sinN[j];
      }
    }
    const mod = (x) => ((x % N) + N) % N;
    const list = [];
    for (const c of acc.values()) {
      if (c.size < minSize) continue;
      c.cy = mod(Math.atan2(c.yi, c.yr) * N / TAU);
      c.cx = mod(Math.atan2(c.xi, c.xr) * N / TAU);
      list.push(c);
    }
    list.sort((a, b) => b.mass - a.mass);
    if (list.length) {
      const top = list[0];
      let r2 = 0;
      for (let i = 0; i < N; i++) {
        const dy = minImage(i - top.cy, N);
        for (let j = 0; j < N; j++) {
          const k = i * N + j;
          if (parent[k] < 0 || find(k) !== top.root) continue;
          const dx = minImage(j - top.cx, N);
          r2 += A[k] * (dy * dy + dx * dx);
        }
      }
      top.rg = Math.sqrt(r2 / top.mass);
      if (opts.withMask) {
        const mask = new Uint8Array(n);
        for (let k = 0; k < n; k++) if (parent[k] >= 0 && find(k) === top.root) mask[k] = 1;
        top.mask = mask;
      }
    }
    return list;
  }

  /** lifetimes.features: (mass, R_g, number of components) of the most massive component. */
  function features(A, N, threshold = 0.1, parent) {
    const comps = components(A, N, threshold, 5, { parent });
    return comps.length ? { mass: comps[0].mass, rg: comps[0].rg, nc: comps.length } : { mass: 0, rg: 0, nc: 0 };
  }

  const CAUSES = ["alive", "split", "mass", "shape"];
  /** The E4 death criterion against a reference: 0 alive, 1 split, 2 mass, 3 shape. */
  function deathCause(f, ref, massTol = 0.25, rgTol = 0.25) {
    if (f.nc !== 1) return 1;
    if (Math.abs(f.mass / ref.mass - 1) > massTol) return 2;
    if (Math.abs(f.rg / ref.rg - 1) > rgTol) return 3;
    return 0;
  }

  /** shapes.shape_category without motion: dead, several, texture, belt, segment, compact. */
  function shapeCategory(A, N, threshold = 0.1, aspectMin = 3.0) {
    const comps = components(A, N, threshold, 5, { withMask: true });
    if (!comps.length) return { category: "dead", n: 0 };
    const top = comps[0], m = top.mask;
    const rowHas = new Uint8Array(N), colHas = new Uint8Array(N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (m[i * N + j]) { rowHas[i] = 1; colHas[j] = 1; }
    const spanY = rowHas.every(Boolean), spanX = colHas.every(Boolean);
    let category;
    if (comps.length > 1) category = "several";
    else if (spanX && spanY) category = "texture";
    else if (spanX || spanY) category = "belt";
    else {
      let syy = 0, sxx = 0, sxy = 0, w = 0;
      for (let i = 0; i < N; i++) {
        const dy = minImage(i - top.cy, N);
        for (let j = 0; j < N; j++) {
          const k = i * N + j;
          if (!m[k]) continue;
          const dx = minImage(j - top.cx, N), v = A[k];
          syy += v * dy * dy; sxx += v * dx * dx; sxy += v * dy * dx; w += v;
        }
      }
      syy /= w; sxx /= w; sxy /= w;
      const tr = syy + sxx, det = syy * sxx - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const e1 = tr / 2 + disc, e0 = Math.max(tr / 2 - disc, 1e-12);
      top.aspect = Math.sqrt(e1 / e0);
      category = top.aspect >= aspectMin ? "segment" : "compact";
    }
    return { category, n: comps.length, spanX, spanY, top, comps };
  }

  // ===================================================================== patterns
  /** scipy.ndimage.zoom(c, f, order=1) followed by clip to [0, 1] (patterns.rescale). */
  function rescale(cells, factor) {
    const h = cells.length, w = cells[0].length;
    if (factor === 1) return cells.map(r => r.slice());
    const H = roundHalfEven(h * factor), W = roundHalfEven(w * factor);
    const zy = H > 1 ? (h - 1) / (H - 1) : 0, zx = W > 1 ? (w - 1) / (W - 1) : 0;
    const out = [];
    for (let I = 0; I < H; I++) {
      const y = I * zy, y0 = Math.min(Math.floor(y), h - 1), y1 = Math.min(y0 + 1, h - 1), fy = y - y0;
      const row = new Array(W);
      for (let J = 0; J < W; J++) {
        const x = J * zx, x0 = Math.min(Math.floor(x), w - 1), x1 = Math.min(x0 + 1, w - 1), fx = x - x0;
        const v = (1 - fy) * ((1 - fx) * cells[y0][x0] + fx * cells[y0][x1]) + fy * ((1 - fx) * cells[y1][x0] + fx * cells[y1][x1]);
        row[J] = Math.min(1, Math.max(0, v));
      }
      out.push(row);
    }
    return out;
  }

  /** patterns.place: the pattern on an empty N×N torus, centred at (N//2, N//2). */
  function place(N, cells, A = new Float64Array(N * N), center = null, add = false) {
    const h = cells.length, w = cells[0].length;
    if (h >= N || w >= N) throw new Error(`pattern ${h}×${w} too large for N=${N}`);
    if (!add) A.fill(0);
    const cy = center ? center[0] : Math.floor(N / 2), cx = center ? center[1] : Math.floor(N / 2);
    const oy = cy - Math.floor(h / 2), ox = cx - Math.floor(w / 2);
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
      const v = cells[i][j];
      if (v === 0) continue;
      const k = (((i + oy) % N + N) % N) * N + (((j + ox) % N + N) % N);
      A[k] = add ? Math.min(1, A[k] + v) : v;
    }
    return A;
  }

  /** A lossless crop from build_data.py back onto its torus (bit-identical). */
  function decodeF64(b64) {
    let bin;
    if (typeof atob === "function") bin = atob(b64);
    else bin = Buffer.from(b64, "base64").toString("binary");
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Float64Array(u8.buffer);
  }
  function unpackState(st, A = new Float64Array(st.N * st.N), shift = [0, 0]) {
    const N = st.N, c = st.crop, B = decodeF64(c.f64);
    A.fill(0);
    for (let i = 0; i < c.h; i++) for (let j = 0; j < c.w; j++) {
      const y = (((c.y0 + i + shift[0]) % N) + N) % N, x = (((c.x0 + j + shift[1]) % N) + N) % N;
      A[y * N + x] = B[i * c.w + j];
    }
    return A;
  }
  /** The crop as a 2D array (to place it on another torus). */
  function cropCells(st) {
    const c = st.crop, B = decodeF64(c.f64), out = [];
    for (let i = 0; i < c.h; i++) out.push(Array.from(B.subarray(i * c.w, (i + 1) * c.w)));
    return out;
  }

  /** patterns.noise_patch (Hudcová et al. 2026): U(0,1) noise in a random Voronoi cell of
   *  expected area side², the one whose seed is closest to the centre (minimum image). */
  function noisePatch(N, side, rng, A = new Float64Array(N * N)) {
    const n = Math.max(1, roundHalfEven(N * N / (side * side)));
    const sy = new Float64Array(n), sx = new Float64Array(n);
    for (let k = 0; k < n; k++) { sy[k] = rng.uniform() * N; sx[k] = rng.uniform() * N; }
    let k0 = 0, best = Infinity;
    for (let k = 0; k < n; k++) {
      const dy = minImage(sy[k] - N / 2, N), dx = minImage(sx[k] - N / 2, N), d2 = dy * dy + dx * dx;
      if (d2 < best) { best = d2; k0 = k; }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const y = i + 0.5, x = j + 0.5;
      let bk = 0, bd = Infinity;
      for (let k = 0; k < n; k++) {
        const dy = minImage(y - sy[k], N), dx = minImage(x - sx[k], N), d2 = dy * dy + dx * dx;
        if (d2 < bd) { bd = d2; bk = k; }
      }
      A[i * N + j] = bk === k0 ? rng.uniform() : 0;
    }
    return A;
  }

  // ===================================================================== catalogue.py
  function rleValue(sym) {
    if (sym === "." || sym === "b") return 0;
    if (sym === "o") return 255;
    if (sym.length === 1) return sym.charCodeAt(0) - 65 + 1;
    return (sym.charCodeAt(0) - 112) * 24 + (sym.charCodeAt(1) - 65) + 25;
  }
  /** Chan's 2D run-length encoding → array of rows with values in [0, 1]. */
  function decodeRLE(st) {
    const rows = [];
    let row = [], count = "", prefix = "";
    const s = st.replace(/!+$/, "") + "$";
    for (const ch of s) {
      if (ch >= "0" && ch <= "9") count += ch;
      else if ("pqrstuvwxy".includes(ch)) prefix = ch;
      else if (ch === "$") {
        const n = count ? parseInt(count, 10) : 1;
        rows.push(row);
        for (let k = 1; k < n; k++) rows.push([]);
        row = []; count = ""; prefix = "";
      } else {
        const n = count ? parseInt(count, 10) : 1, v = rleValue(prefix + ch);
        for (let k = 0; k < n; k++) row.push(v);
        count = ""; prefix = "";
      }
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    const width = Math.max(...rows.map(r => r.length));
    return rows.map(r => { const o = new Array(width).fill(0); r.forEach((v, i) => { o[i] = v / 255; }); return o; });
  }

  // ===================================================================== two frames
  /**
   * Overlaps of a state with an anchor state, in the laboratory and in the co-moving frame
   * (observables.overlap, observables.comoving_overlap):
   *   q_lab = ⟨A, W⟩ / (‖A‖ ‖W‖),      q_cm = max_d ⟨A(· + d), W⟩ / (‖A‖ ‖W‖),
   * with the maximum refined below the cell as in observables.best_shift: the
   * cross-correlation c(d) = N⁻² Re Σ_k P(k) e^{2πi k·d/N}, P = Â · conj(Ŵ), is a
   * band-limited Fourier series in d (signed frequencies), and four Newton steps with exact
   * gradient and Hessian start from the integer peak, confined within ±0.5 cells of it.
   * The null is the same maximum against a random-phase surrogate S of the anchor (same
   * spectrum, no structure; observables.phase_randomize): the maximum over translations of
   * two unrelated fields is not zero but an extreme value. c and c_null are both real, so
   * one inverse transform of P + i P_null gives both.
   */
  class FrameMeter {
    constructor(N) {
      this.N = N;
      const n = N * N;
      this.fft = new FFT2(N);
      this.Wr = new Float64Array(n); this.Wi = new Float64Array(n);     // Ŵ
      this.Sr = new Float64Array(n); this.Si = new Float64Array(n);     // Ŝ (surrogate)
      this.Pr = new Float64Array(n); this.Pi = new Float64Array(n);
      this.Qr = new Float64Array(n); this.Qi = new Float64Array(n);
      this.zr = new Float64Array(n); this.zi = new Float64Array(n);
      this.W = new Float64Array(n);
      this.om = new Float64Array(N);                                     // 2π · fftfreq(N)
      for (let k = 0; k < N; k++) this.om[k] = TAU * (k < Math.ceil(N / 2) ? k : k - N) / N;
      this.ey = [new Float64Array(N), new Float64Array(N)]; this.ex = [new Float64Array(N), new Float64Array(N)];
      this.r = Array.from({ length: 6 }, () => new Float64Array(N));
      this.normW = 0; this.anchored = false;
    }

    /** Take W as the anchor; `rng` draws the phases of its surrogate. */
    anchor(W, rng) {
      const N = this.N, n = N * N;
      this.W.set(W);
      let s = 0; for (let k = 0; k < n; k++) s += W[k] * W[k];
      this.normW = Math.sqrt(s);
      this.Wr.set(W); this.Wi.fill(0);
      this.fft.forward(this.Wr, this.Wi);
      // surrogate: |Ŵ| e^{iφ} with φ(−k) = −φ(k), so that S is real; the mean (k = 0) is kept,
      // self-conjugate modes (Nyquist) get φ ∈ {0, π}
      for (let ky = 0; ky < N; ky++) for (let kx = 0; kx < N; kx++) {
        const k = ky * N + kx, my = (N - ky) % N, mx = (N - kx) % N, m = my * N + mx;
        if (m < k) continue;                                  // set with its mirror
        const a = Math.hypot(this.Wr[k], this.Wi[k]);
        if (m === k) { const sg = k === 0 ? 1 : (rng.uniform() < 0.5 ? -1 : 1); this.Sr[k] = sg * a; this.Si[k] = 0; continue; }
        const ph = TAU * rng.uniform(), c = Math.cos(ph), sn = Math.sin(ph);
        this.Sr[k] = a * c; this.Si[k] = a * sn;
        const b = Math.hypot(this.Wr[m], this.Wi[m]);            // equal to a for a real W
        this.Sr[m] = b * c; this.Si[m] = -b * sn;
      }
      this.anchored = true;
    }

    /** The overlaps of A with the anchor, normalised (cosines). */
    measure(A) {
      const r = this.raw(A), den = Math.sqrt(r.sa) * this.normW;
      if (!(den > 0)) return { q_lab: 0, q_cm: 0, q_null: 0, shift: [0, 0] };
      return { q_lab: r.dot / den, q_cm: r.best / den, q_null: r.bestNull / den, shift: r.shift };
    }

    /** Unnormalised: dot = ⟨A, W⟩, best = max_d ⟨A(·+d), W⟩, bestNull = the same against the
     *  surrogate, sa = ⟨A, A⟩ (observables.best_shift returns `best`). */
    raw(A) {
      const N = this.N, n = N * N, Pr = this.Pr, Pi = this.Pi, Qr = this.Qr, Qi = this.Qi, zr = this.zr, zi = this.zi;
      let sa = 0, lab = 0;
      for (let k = 0; k < n; k++) { const a = A[k]; sa += a * a; lab += a * this.W[k]; zr[k] = a; zi[k] = 0; }
      this.fft.forward(zr, zi);                                       // Â
      for (let k = 0; k < n; k++) {
        const ar = zr[k], ai = zi[k];
        Pr[k] = ar * this.Wr[k] + ai * this.Wi[k]; Pi[k] = ai * this.Wr[k] - ar * this.Wi[k];   // Â conj(Ŵ)
        Qr[k] = ar * this.Sr[k] + ai * this.Si[k]; Qi[k] = ai * this.Sr[k] - ar * this.Si[k];   // Â conj(Ŝ)
        // Z = P + i Q, conjugated for the inverse
        zr[k] = Pr[k] - Qi[k]; zi[k] = -(Pi[k] + Qr[k]);
      }
      this.fft.forward(zr, zi);
      let bc = -Infinity, kc = 0, bn = -Infinity, kn = 0;
      for (let k = 0; k < n; k++) {
        const c = zr[k] / n, cn = -zi[k] / n;                           // conj back: imag part flips
        if (c > bc) { bc = c; kc = k; }
        if (cn > bn) { bn = cn; kn = k; }
      }
      const pc = this.refine(Pr, Pi, Math.floor(kc / N), kc % N, bc);
      const pn = this.refine(Qr, Qi, Math.floor(kn / N), kn % N, bn);
      return { dot: lab, sa, best: pc.best, bestNull: pn.best, shift: [minImage(pc.dy, N), minImage(pc.dx, N)] };
    }

    /** The six terms Re Σ P ey ex w^oy w^ox / N² at (dy, dx), with w = i·om. */
    terms(Pr, Pi, dy, dx) {
      const N = this.N, om = this.om, [eyc, eys] = this.ey, [exc, exs] = this.ex, [r0r, r0i, r1r, r1i, r2r, r2i] = this.r;
      for (let k = 0; k < N; k++) { eyc[k] = Math.cos(om[k] * dy); eys[k] = Math.sin(om[k] * dy); exc[k] = Math.cos(om[k] * dx); exs[k] = Math.sin(om[k] * dx); }
      for (let y = 0; y < N; y++) {
        let a0r = 0, a0i = 0, a1r = 0, a1i = 0, a2r = 0, a2i = 0;
        for (let x = 0, k = y * N; x < N; x++, k++) {
          const pr = Pr[k], pi = Pi[k], c = exc[x], s = exs[x], o = om[x];
          const qr = pr * c - pi * s, qi = pr * s + pi * c;            // P ex
          a0r += qr; a0i += qi;
          a1r -= o * qi; a1i += o * qr;                                // · (i om)
          a2r -= o * o * qr; a2i -= o * o * qi;                        // · (i om)² = −om²
        }
        r0r[y] = a0r; r0i[y] = a0i; r1r[y] = a1r; r1i[y] = a1i; r2r[y] = a2r; r2i[y] = a2i;
      }
      let t00 = 0, t10 = 0, t01 = 0, t20 = 0, t02 = 0, t11 = 0;
      for (let y = 0; y < N; y++) {
        const c = eyc[y], s = eys[y], o = om[y];
        // Re(e · r) with e = c + i s
        const re0 = c * r0r[y] - s * r0i[y], im0 = c * r0i[y] + s * r0r[y];
        const re1 = c * r1r[y] - s * r1i[y], im1 = c * r1i[y] + s * r1r[y];
        const re2 = c * r2r[y] - s * r2i[y];
        t00 += re0; t01 += re1; t02 += re2;
        t10 -= o * im0;                                                // Re(i om · z) = −om · Im z
        t20 -= o * o * re0;
        t11 -= o * im1;
      }
      const s2 = 1 / (N * N);
      return { t00: t00 * s2, t10: t10 * s2, t01: t01 * s2, t20: t20 * s2, t02: t02 * s2, t11: t11 * s2 };
    }

    /** observables.best_shift's refinement: Newton from the integer peak (k0y, k0x). */
    refine(Pr, Pi, k0y, k0x, best) {
      let dy = k0y, dx = k0x;
      for (let it = 0; it < 4; it++) {
        const t = this.terms(Pr, Pi, dy, dx);
        const gy = t.t10, gx = t.t01, hyy = t.t20, hxx = t.t02, hxy = t.t11, det = hyy * hxx - hxy * hxy;
        if (hyy < 0 && det > 0) {
          dy = Math.min(k0y + 0.5, Math.max(k0y - 0.5, dy - (hxx * gy - hxy * gx) / det));
          dx = Math.min(k0x + 0.5, Math.max(k0x - 0.5, dx - (hyy * gx - hxy * gy) / det));
        }
      }
      const refined = this.terms(Pr, Pi, dy, dx).t00;
      return refined > best ? { best: refined, dy, dx } : { best, dy: k0y, dx: k0x };
    }
  }

  /** observables.comoving_overlap(A, B) (not connected, sub-cell): { q, shift }. */
  function comovingOverlap(A, B, N, meter) {
    const m = meter && meter.N === N ? meter : new FrameMeter(N);
    m.anchor(B, new RNG(1));
    const r = m.measure(A);
    return { q: r.q_cm, shift: r.shift, q_lab: r.q_lab };
  }

  // ===================================================================== lifetimes.py
  /** Wilson–Hilferty approximation of the χ² quantile (accurate to ≈1% for k ≥ 2). */
  function chi2ppf(p, k) {
    if (k <= 0) return 0;
    const z = normPpf(p), a = 2 / (9 * k);
    return k * Math.pow(Math.max(0, 1 - a + z * Math.sqrt(a)), 3);
  }
  /** Acklam's rational approximation of the standard normal quantile. */
  function normPpf(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  /** lifetimes.exponential_mle: λ̂ = d / Σ (t_i − t₀)⁺ with a Poisson interval. */
  function exponentialMLE(times, censored, t0 = 0, alpha = 0.05) {
    let exposure = 0, d = 0, early = 0;
    for (let i = 0; i < times.length; i++) {
      exposure += Math.max(0, times[i] - t0);
      if (!censored[i]) { if (times[i] > t0) d++; else early++; }
    }
    if (!(exposure > 0)) return { lam: NaN, tau: NaN, d, early, exposure: 0 };
    const lam = d / exposure;
    const lo = d > 0 ? chi2ppf(alpha / 2, 2 * d) / (2 * exposure) : 0;
    const hi = chi2ppf(1 - alpha / 2, 2 * d + 2) / (2 * exposure);
    return { lam, lam_lo: lo, lam_hi: hi, tau: lam > 0 ? 1 / lam : Infinity, tau_lo: 1 / hi,
             tau_hi: lo > 0 ? 1 / lo : Infinity, d, early, exposure };
  }
  /** Kaplan–Meier survival: [[t, S(t)], ...] at the event times. */
  function kaplanMeier(times, censored) {
    const idx = times.map((t, i) => i).sort((a, b) => times[a] - times[b] || (censored[a] - censored[b]));
    let atRisk = times.length, S = 1;
    const out = [[0, 1]];
    let i = 0;
    while (i < idx.length) {
      const t = times[idx[i]];
      let deaths = 0, leave = 0;
      while (i < idx.length && times[idx[i]] === t) { if (!censored[idx[i]]) deaths++; leave++; i++; }
      if (deaths) { S *= 1 - deaths / atRisk; out.push([t, S]); }
      atRisk -= leave;
    }
    return out;
  }

  return {
    TAU, CORES, GROWTHS, CAUSES, DEFAULT_RULE,
    roundHalfEven, even, minImage, fastSize, factorize,
    FFT1, FFT2, RNG, Convolver, Lenia,
    kernelCore, kernelShell, kernelGrid, growthFn, growthPrimeFn, normRule,
    profileCentroid, centroid, mass, components, features, deathCause, shapeCategory,
    rescale, place, decodeF64, unpackState, cropCells, noisePatch, decodeRLE, FrameMeter, comovingOverlap,
    chi2ppf, normPpf, exponentialMLE, kaplanMeier,
  };
});

/*
 * lab.js — the Kramers lab: n independent replicas of one creature in the bath, and the
 * death criterion of experiment E4 (lifetimes.death_times):
 *   checked every `checkEvery` steps on the most massive component above 0.1,
 *   'split'  number of components ≠ 1,
 *   'mass'   |m / m_ref − 1| > 0.25,
 *   'shape'  |R_g / R_g,ref − 1| > 0.25;
 * a dead replica leaves the batch; the others run to tMax and are censored there.
 * Replicas are stepped two at a time: the kernel is real, so one complex FFT convolves
 * replica a (real part) and replica b (imaginary part) together. Each replica has its own
 * noise stream. Used by lab-worker.js, or directly on the main thread when workers are
 * unavailable (pages opened from the disk).
 */
(function (root) {
  "use strict";
  const C = root.LeniaCore;

  class KramersRun {
    constructor(o) {
      this.N = o.N; this.rule = C.normRule(o.rule); this.temp = +o.temp;
      this.n = o.n | 0; this.tMax = o.tMax | 0; this.checkEvery = o.checkEvery || 10;
      this.seed = o.seed >>> 0; this.relaxSteps = o.relaxSteps | 0;
      this.conv = new C.Convolver(this.N, this.rule.R, this.rule.peaks, this.rule.core);
      this.g = C.growthFn(this.rule.growth, this.rule.mu, this.rule.sigma);
      this.dt = 1 / this.rule.T;
      this.amp = Math.sqrt(2.0 * this.temp * this.dt);
      const n2 = this.N * this.N;
      this.re = new Float64Array(n2); this.im = new Float64Array(n2);
      this.xa = new Float64Array(n2); this.xb = new Float64Array(n2);
      this.parent = new Int32Array(n2);
      let A0 = Float64Array.from(o.A0);
      if (this.relaxSteps > 0) A0 = this.relax(A0, this.relaxSteps);
      this.A0 = A0;
      this.ref = C.features(A0, this.N, 0.1, this.parent);
      if (this.ref.nc !== 1) throw new Error(`the reference has ${this.ref.nc} components, not 1`);
      this.X = Array.from({ length: this.n }, () => Float64Array.from(A0));
      this.rng = Array.from({ length: this.n }, (_, k) => new C.RNG(mix(this.seed, k), k));
      this.alive = Array.from({ length: this.n }, (_, k) => k);
      this.steps = new Array(this.n).fill(this.tMax);
      this.cause = new Array(this.n).fill(0);
      this.deathAt = [];             // [replica, step, cause] in order of death
      this.t = 0;
      this.done = false;
    }

    relax(A, steps) {
      const X = Float64Array.from(A), re = this.re, im = this.im, g = this.g, dt = this.dt;
      for (let s = 0; s < steps; s++) {
        re.set(X); im.fill(0);
        this.conv.convolve(re, im);
        for (let k = 0; k < X.length; k++) {
          const v = X[k] + dt * g(re[k]);
          X[k] = v < 0 ? 0 : v > 1 ? 1 : v;
        }
      }
      return X;
    }

    /** One step for every living replica. */
    stepAll() {
      const al = this.alive, re = this.re, im = this.im, g = this.g, dt = this.dt, amp = this.amp, h = this.rule.h || 0;
      for (let p = 0; p < al.length; p += 2) {
        const a = this.X[al[p]], b = p + 1 < al.length ? this.X[al[p + 1]] : null;
        re.set(a); if (b) im.set(b); else im.fill(0);
        this.conv.convolve(re, im);
        this.rng[al[p]].fillNormal(this.xa);
        if (b) this.rng[al[p + 1]].fillNormal(this.xb);
        const xa = this.xa, xb = this.xb;
        for (let k = 0; k < a.length; k++) {
          let v = a[k] + dt * (h !== 0 ? g(re[k]) + h : g(re[k])) + amp * xa[k];
          a[k] = v < 0 ? 0 : v > 1 ? 1 : v;
          if (b) {
            v = b[k] + dt * (h !== 0 ? g(im[k]) + h : g(im[k])) + amp * xb[k];
            b[k] = v < 0 ? 0 : v > 1 ? 1 : v;
          }
        }
      }
      this.t++;
    }

    check() {
      const keep = [];
      for (const k of this.alive) {
        const f = C.features(this.X[k], this.N, 0.1, this.parent);
        const c = C.deathCause(f, this.ref);
        if (c) { this.steps[k] = this.t; this.cause[k] = c; this.deathAt.push([k, this.t, c]); }
        else keep.push(k);
      }
      this.alive = keep;
    }

    /** Advance for at most `ms` milliseconds (to a check boundary). */
    run(ms) {
      const t0 = Date.now();
      while (!this.done && Date.now() - t0 < ms) {
        const n = Math.min(this.checkEvery, this.tMax - this.t);
        for (let s = 0; s < n; s++) this.stepAll();
        this.check();
        if (this.t >= this.tMax || !this.alive.length) this.done = true;
      }
      return this.done;
    }

    summary() {
      return { t: this.t, tMax: this.tMax, n: this.n, alive: this.alive.slice(), steps: this.steps.slice(),
               cause: this.cause.slice(), deathAt: this.deathAt.slice(), done: this.done,
               ref: { mass: this.ref.mass, rg: this.ref.rg } };
    }

    /** One byte per cell per replica (A·255), for the thumbnails. */
    thumbs() {
      const n2 = this.N * this.N, out = new Uint8Array(this.n * n2);
      for (let k = 0; k < this.n; k++) {
        const X = this.X[k], o = k * n2;
        for (let i = 0; i < n2; i++) out[o + i] = Math.round(X[i] * 255);
      }
      return out;
    }
  }

  function mix(seed, k) {
    let h = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  root.KramersRun = KramersRun;
})(typeof self !== "undefined" ? self : this);

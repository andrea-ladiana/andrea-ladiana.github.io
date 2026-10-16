/*
 * experiments.js — the experiments of the project that the page can run, as faithful ports
 * of the Python code (line references are to code/):
 *
 *   prepareOrbium   common.orbium_state: rescaled seed, 1000 relaxation steps, 100 more,
 *                   recentred; orbium_offsets: copies at other sub-cell positions
 *   FDRun           E2, lenia.response.fd_curve: fixed final time t*, backward grid of t_w,
 *                   three replicas per t_w with shared noise and static fields 0, ∓(h/2) ε;
 *                   with exp_fdt.initial for the initial states
 *   reading         lenia.fdplot: normalised curve, plateau q_EA, a₁, A, X̄, labels, bootstrap
 *   RheoRun         E5, lenia.response.oscillatory_response
 *   EdgeRun         E6, exp_continuum: Π(μ) by phase.classify_batch's `moving_soliton`,
 *                   bisection with confirmation, branch m(μ), optional monotonicity grid
 *
 * Every run advances in slices (run(ms)) so that it can live in a Web Worker or, when the
 * page is opened from the disk, on the page's own thread. Fields that share the kernel are
 * convolved two at a time (real and imaginary parts of one complex FFT).
 * The random numbers are xoshiro128**, not numpy's: same statistics, different draws.
 */
(function (root) {
  "use strict";
  const C = root.LeniaCore;
  const PROTO = { mu: 0.15, sigma: 0.015, R: 13, T: 10, peaks: [1], core: "exponential", growth: "gaussian" };

  function mix(seed, k) {
    let h = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  /**
   * Many fields on one torus with one kernel: step them all, two per FFT. Each field has
   * its own μ (growth), an optional static field f (array) times a scalar, and a noise
   * buffer (shared between the fields that point to the same one).
   */
  class Batch {
    constructor(N, rule) {
      this.N = N; this.rule = C.normRule(rule);
      this.conv = new C.Convolver(N, this.rule.R, this.rule.peaks, this.rule.core);
      this.dt = 1 / this.rule.T;
      this.re = new Float64Array(N * N); this.im = new Float64Array(N * N);
      this.gcache = new Map();
    }
    g(mu) {
      let f = this.gcache.get(mu);
      if (!f) { f = C.growthFn(this.rule.growth, mu, this.rule.sigma); this.gcache.set(mu, f); }
      return f;
    }
    /** fields: [{ A, mu, f (array or null), fs (scalar multiplying f), xi (array or null), amp }] */
    step(fields) {
      const re = this.re, im = this.im, dt = this.dt, n = re.length;
      for (let p = 0; p < fields.length; p += 2) {
        const a = fields[p], b = p + 1 < fields.length ? fields[p + 1] : null;
        re.set(a.A); if (b) im.set(b.A); else im.fill(0);
        this.conv.convolve(re, im);
        this.update(a, re, dt, n);
        if (b) this.update(b, im, dt, n);
      }
    }
    update(F, U, dt, n) {
      const A = F.A, g = this.g(F.mu), f = F.f, fs = F.fs || 0, xi = F.xi, amp = F.amp || 0;
      for (let k = 0; k < n; k++) {
        // model.step: G = growth(U) (+ field); new = A + dt·G (+ amp·ξ); clip
        let G = g(U[k]);
        if (f) G = G + fs * f[k];
        let v = A[k] + dt * G;
        if (xi) v = v + amp * xi[k];
        A[k] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
    }
  }

  // ===================================================================== preparation
  /** common.orbium_state(N, R): the Orbium seed rescaled to R, relaxed 1000 steps at the
   *  protocol rule, 100 more steps, recentred. `cells` is the 20×20 seed. */
  function prepareOrbium(N, R, cells, rule) {
    const r = Object.assign({}, PROTO, rule || {}, { R });
    const L = new C.Lenia(N, r);
    C.place(N, C.rescale(cells, R / 13), L.A);
    for (let k = 0; k < 1100; k++) L.step();
    return recenter(L.A, N);
  }
  /** patterns.recenter: integer roll that puts the circular centroid in the middle. */
  function recenter(A, N) {
    const c = C.centroid(A, N);
    const sy = C.roundHalfEven(N / 2 - c.cy), sx = C.roundHalfEven(N / 2 - c.cx), B = new Float64Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      B[(((i + sy) % N) + N) % N * N + ((((j + sx) % N) + N) % N)] = A[i * N + j];
    }
    return B;
  }
  /** common.orbium_offsets: copies of the relaxed state a few protocol steps apart. */
  function orbiumOffsets(A, N, R, n) {
    const extra = [0, 3, 7, 11, 13, 17, 19, 23].slice(0, n), out = [];
    const L = new C.Lenia(N, Object.assign({}, PROTO, { R }));
    for (const k of extra) { L.A.set(A); for (let s = 0; s < k; s++) L.step(); out.push(Float64Array.from(L.A)); }
    return out;
  }

  // ===================================================================== E2: fd_curve
  /** response.backward_grid(t*): t_w = t* − τ with τ geometric (6 per decade), an auxiliary
   *  ladder on small t_w (4 per decade), and 0. */
  function backwardGrid(tStar, perDecade = 6, auxPerDecade = 4) {
    const dec = Math.log10(tStar);
    // np.logspace(0, dec, n): 10 ** (i · step), step = dec / (n − 1); then np.round (half to even)
    const geo = (k) => { const n = Math.ceil(k * dec) + 1, step = dec / (n - 1), out = []; for (let i = 0; i < n; i++) out.push(C.roundHalfEven(Math.pow(10, i * step))); return out; };
    const set = new Set([0]);
    for (const t of geo(perDecade)) set.add(tStar - t);
    for (const t of geo(auxPerDecade)) set.add(t);
    return [...set].filter(t => t >= 0 && t < tStar).sort((a, b) => a - b);
  }

  /**
   * One FD curve (fd_curve). Samples run one after the other; inside a sample the mother
   * chain and all the branches advance together (a branch is born at its t_w from the
   * mother's state and runs to t*), which is the same computation as the Python loop.
   * o: { N, rule, temp, h, tStar, B, seed, ic: 'empty'|'soliton'|'patch', burn (empty),
   *      base (soliton: the protocol Orbium state), patchSide, T }
   */
  class FDRun {
    constructor(o) {
      this.o = o; this.N = o.N; this.rule = C.normRule(o.rule);
      this.batch = new Batch(this.N, this.rule);
      this.amp = Math.sqrt(2.0 * o.temp * this.batch.dt);
      this.tws = backwardGrid(o.tStar);
      this.nt = this.tws.length;
      const keys = ["C", "C_star", "chi", "C_cm", "C_cm_null", "C_star_null", "q_lab", "q_cm", "n_comp"];
      this.raw = { t_w: this.tws.slice(), tau: this.tws.map(t => o.tStar - t), t_star: o.tStar, h: o.h, temp: o.temp, dt: this.batch.dt };
      for (const k of keys) this.raw[k] = [];
      this.b = 0; this.phase = "init"; this.done = false;
      this.meterW = new C.FrameMeter(this.N); this.meter0 = new C.FrameMeter(this.N); this.meterU = new C.FrameMeter(this.N);
      this.progressSteps = 0;
      this.totalSteps = o.B * (this.tws.reduce((s, t) => s + 3 * (o.tStar - t), 0) + o.tStar + (o.ic === "empty" ? o.burn : o.ic === "soliton" ? 200 : 0));
      this.initStates();
    }

    /** exp_fdt.initial: the B initial states. */
    initStates() {
      const o = this.o, N = this.N, n2 = N * N;
      this.A0 = [];
      if (o.ic === "patch") {
        const rng = new C.RNG(mix(o.seed, 9001), 1);
        for (let b = 0; b < o.B; b++) this.A0.push(C.noisePatch(N, o.patchSide || 50, rng));
        this.initPending = [];
      } else if (o.ic === "soliton") {
        const copies = orbiumOffsets(o.base, N, 13, 8);
        for (let b = 0; b < o.B; b++) this.A0.push(Float64Array.from(copies[b % copies.length]));
        this.initPending = this.A0.map((A, b) => ({ A, steps: 200, rng: new C.RNG(mix(o.seed, 7000 + b), 2), xi: new Float64Array(n2) }));
      } else {
        for (let b = 0; b < o.B; b++) this.A0.push(new Float64Array(n2));
        this.initPending = this.A0.map((A, b) => ({ A, steps: o.burn, rng: new C.RNG(mix(o.seed, 7000 + b), 2), xi: new Float64Array(n2) }));
      }
    }

    startSample() {
      const o = this.o, N = this.N, n2 = N * N, b = this.b;
      this.t = 0;
      this.mother = { A: Float64Array.from(this.A0[b]), mu: this.rule.mu, f: null, fs: 0, xi: new Float64Array(n2), amp: this.amp };
      this.mrng = new C.RNG(mix(o.seed, 100 + b), 3);
      const er = new C.RNG(mix(o.seed, 5000 + b), 4);
      this.eps = new Float64Array(n2);
      for (let k = 0; k < n2; k++) this.eps[k] = er.uniform() < 0.5 ? -1.0 : 1.0;   // response.random_cut
      this.branches = [];
      this.nextTw = 0;
    }

    /** Spawn the branches whose t_w is the present time. */
    spawn() {
      const N = this.N, n2 = N * N, o = this.o;
      while (this.nextTw < this.nt && this.tws[this.nextTw] === this.t) {
        const j = this.nextTw++, xi = new Float64Array(n2), A = this.mother.A;
        const br = { j, Atw: Float64Array.from(A), rng: new C.RNG(mix(o.seed, 10000 + 1000 * this.b + j), 5), xi,
                     reps: [0, -0.5, 0.5].map(s => ({ A: Float64Array.from(A), mu: this.rule.mu, f: s ? this.eps : null, fs: s * o.h, xi, amp: this.amp })) };
        this.branches.push(br);
      }
    }

    stepSample() {
      this.spawn();
      const fields = [];
      const needMother = this.nextTw < this.nt;            // the mother is needed until the last t_w
      if (needMother) { this.mrng.fillNormal(this.mother.xi); fields.push(this.mother); }
      for (const br of this.branches) { br.rng.fillNormal(br.xi); fields.push(...br.reps); }
      if (this.amp === 0) for (const f of fields) f.xi = null;
      this.batch.step(fields);
      this.progressSteps += fields.length;
      this.t++;
    }

    /** Observables at t* for every branch of the sample (fd_curve, steps 2–4). */
    finishSample() {
      const N = this.N, n2 = N * N, rows = { C: [], C_star: [], chi: [], C_cm: [], C_cm_null: [], C_star_null: [], q_lab: [], q_cm: [], n_comp: [] };
      const nullRng = new C.RNG(mix(this.o.seed, 20000 + this.b), 6);
      const d0 = new Float64Array(n2), dw = new Float64Array(n2);
      for (const br of this.branches.sort((a, b) => a.j - b.j)) {
        const x0 = br.reps[0].A, xm = br.reps[1].A, xp = br.reps[2].A, Atw = br.Atw;
        let m0 = 0, mw = 0;
        for (let k = 0; k < n2; k++) { m0 += x0[k]; mw += Atw[k]; }
        m0 /= n2; mw /= n2;
        let c = 0, cs = 0, ch = 0;
        for (let k = 0; k < n2; k++) {
          d0[k] = x0[k] - m0; dw[k] = Atw[k] - mw;
          c += d0[k] * dw[k]; cs += d0[k] * d0[k]; ch += this.eps[k] * (xp[k] - xm[k]);
        }
        rows.C.push(c / n2); rows.C_star.push(cs / n2); rows.chi.push(ch / n2 / this.o.h);
        this.meterW.anchor(dw, nullRng);
        const rw = this.meterW.raw(d0);
        rows.C_cm.push(rw.best / n2); rows.C_cm_null.push(rw.bestNull / n2);
        this.meter0.anchor(d0, nullRng);
        rows.C_star_null.push(this.meter0.raw(d0).bestNull / n2);
        this.meterU.anchor(Atw, nullRng);
        const q = this.meterU.measure(x0);
        rows.q_lab.push(q.q_lab); rows.q_cm.push(q.q_cm);
        rows.n_comp.push(C.components(x0, N).length);
      }
      for (const k of Object.keys(rows)) this.raw[k].push(rows[k]);
    }

    run(ms) {
      const t0 = Date.now();
      while (!this.done && Date.now() - t0 < ms) {
        if (this.phase === "init") {
          // burn-in (empty) or the 200 noisy steps at the cell's μ (soliton), two at a time
          const live = this.initPending.filter(x => x.steps > 0);
          if (!live.length) { this.phase = "sample"; this.startSample(); continue; }
          const fields = live.slice(0, 16).map(x => { x.rng.fillNormal(x.xi); x.steps--; return { A: x.A, mu: this.rule.mu, f: null, fs: 0, xi: this.amp ? x.xi : null, amp: this.amp }; });
          this.batch.step(fields);
          this.progressSteps += fields.length;
        } else {
          if (this.t < this.o.tStar) this.stepSample();
          else {
            this.finishSample();
            this.b++;
            if (this.b >= this.o.B) { this.done = true; break; }
            this.startSample();
          }
        }
      }
      return this.done;
    }
    summary() {
      return { done: this.done, b: this.b, B: this.o.B, progress: Math.min(1, this.progressSteps / this.totalSteps), raw: this.done ? this.raw : null };
    }
  }

  // ===================================================================== E2: reading (fdplot)
  const Q_ERGODIC = 0.05, R_RETAINED = 0.70;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  /** response.normalized_curve on the samples `idx` (default all), sorted by increasing τ. */
  function normalizedCurve(raw, idx) {
    const sel = idx || raw.C.map((_, i) => i);
    const pick = (k) => sel.map(i => raw[k][i]);
    const cstar = mean(pick("C_star").map(mean));
    const order = raw.tau.map((t, i) => i).sort((a, b) => raw.tau[a] - raw.tau[b]);
    const tau = order.map(i => raw.tau[i]);
    if (!(cstar > 0)) {
      const nan = tau.map(() => NaN);
      return { tau: [0, ...tau], C: [NaN, ...nan], Tchi: [NaN, ...nan], C_cm: [NaN, ...nan], q_lab: [NaN, ...nan], q_cm: [NaN, ...nan], C_star: 0 };
    }
    const colMean = (k) => order.map(j => mean(sel.map(i => raw[k][i][j])));
    const C = colMean("C").map(v => v / cstar);
    const Tchi = colMean("chi").map(v => raw.temp * v / cstar);
    const cstarEx = mean(sel.map(i => mean(raw.C_star[i].map((v, j) => v - raw.C_star_null[i][j]))));
    const Ccm = order.map(j => mean(sel.map(i => raw.C_cm[i][j] - raw.C_cm_null[i][j])) / cstarEx);
    return { tau: [0, ...tau], C: [1, ...C], Tchi: [0, ...Tchi], C_cm: [1, ...Ccm],
             q_lab: [1, ...colMean("q_lab")], q_cm: [1, ...colMean("q_cm")], C_star: cstar };
  }
  /** numpy.gradient(f, x) with non-uniform x (second order inside, first order at the ends). */
  function gradient(f, x) {
    const n = f.length, g = new Array(n);
    g[0] = (f[1] - f[0]) / (x[1] - x[0]);
    g[n - 1] = (f[n - 1] - f[n - 2]) / (x[n - 1] - x[n - 2]);
    for (let i = 1; i < n - 1; i++) {
      const d1 = x[i] - x[i - 1], d2 = x[i + 1] - x[i];
      const a = -d2 / (d1 * (d1 + d2)), b = (d2 - d1) / (d1 * d2), c = d1 / (d2 * (d1 + d2));
      g[i] = a * f[i - 1] + b * f[i] + c * f[i + 1];
    }
    return g;
  }
  /** fdplot.plateau_qea: Ĉ at the first internal minimum of |dĈ/d ln τ| (τ > 0). */
  function plateauQea(tau, Cc) {
    const t = [], c = [], idx = [];
    tau.forEach((v, i) => { if (v > 0) { t.push(v); c.push(Cc[i]); idx.push(i); } });
    if (t.length < 3) return { q: NaN, i: -1 };
    const d = gradient(c, t.map(Math.log)).map(Math.abs);
    for (let i = 1; i < d.length - 1; i++) if (d[i] < d[i - 1] && d[i] <= d[i + 1]) return { q: c[i], i: idx[i] };
    return { q: NaN, i: -1 };
  }
  /** fdplot.calibrate_a1: ϑχ̂ = a₁ (1 − Ĉ) on the points with q_EA ≤ Ĉ < 1. */
  function calibrateA1(Cc, Tchi, qea) {
    let num = 0, den = 0, any = false;
    for (let i = 0; i < Cc.length; i++) if (Cc[i] >= qea && Cc[i] < 1) { const x = 1 - Cc[i]; num += Tchi[i] * x; den += x * x; any = true; }
    return any && den !== 0 ? num / den : NaN;
  }
  /** fdplot.read_curve. */
  function readCurve(curve) {
    const { tau, C: Cc, Tchi } = curve;
    if (!Cc.every(Number.isFinite)) return { q_ea: NaN, C_min: NaN, Tchi_end: NaN, a1: NaN, A: NaN, X_bar: NaN, R: NaN };
    const { q } = plateauQea(tau, Cc);
    let im = 0; for (let i = 1; i < tau.length; i++) if (tau[i] > tau[im]) im = i;
    const cmin = Cc[im], tend = Tchi[im];
    const res = { q_ea: q, C_min: cmin, Tchi_end: tend };
    if (Number.isNaN(q)) return Object.assign(res, { a1: NaN, A: NaN, X_bar: NaN, R: NaN });
    const A = tend - (1 - q), span = q - cmin;
    return Object.assign(res, { a1: calibrateA1(Cc, Tchi, q), A, X_bar: span > 1e-6 ? A / span : NaN, R: q > 0 ? cmin / q : NaN });
  }
  /** fdplot.label_from. */
  function labelFrom(lab, com, alive = true) {
    if (!alive) return "dead";
    const q = lab.q_ea, R = lab.R, cmin = lab.C_min;
    let base;
    if (Number.isNaN(q)) base = cmin < Q_ERGODIC ? "ergodic" : "indeterminate";
    else if (q < Q_ERGODIC) base = "ergodic";
    else if (R > R_RETAINED) base = "frozen";
    else base = "ageing";
    if (com && (base === "ergodic" || base === "ageing")) {
      if (!Number.isNaN(com.q_ea) && com.q_ea >= Q_ERGODIC && com.R > R_RETAINED) return "soliton";
    }
    return base;
  }
  /** fdplot.classify. */
  function classifyFD(raw, alive = true, idx = null) {
    const curve = normalizedCurve(raw, idx);
    const lab = readCurve(curve);
    const com = readCurve({ tau: curve.tau, C: curve.C_cm, Tchi: curve.Tchi });
    lab.temp_eff = Number.isFinite(lab.X_bar) && lab.X_bar !== 0 ? raw.temp / lab.X_bar : NaN;
    return { lab, comoving: com, label: labelFrom(lab, com, alive), curve };
  }
  /** fdplot.bootstrap_labels: the label distribution by resampling the samples. */
  function bootstrapLabels(raw, alive = true, nBoot = 200, seed = 0) {
    const rng = new C.RNG(seed, 8), B = raw.C.length, counts = {}, As = [], Xs = [];
    for (let k = 0; k < nBoot; k++) {
      const idx = Array.from({ length: B }, () => Math.min(B - 1, Math.floor(rng.uniform() * B)));
      const r = classifyFD(raw, alive, idx);
      counts[r.label] = (counts[r.label] || 0) + 1;
      As.push(r.lab.A); Xs.push(r.lab.X_bar);
    }
    const full = classifyFD(raw, alive);
    const nanstd = (a) => { const v = a.filter(Number.isFinite); if (!v.length) return NaN; const m = mean(v); return Math.sqrt(mean(v.map(x => (x - m) * (x - m)))); };
    const sA = nanstd(As), span = full.lab.q_ea - full.lab.C_min;
    const Z = sA > 0 && Number.isFinite(span) ? (span - full.lab.A) / sA : NaN;
    const P = {}; for (const [k, v] of Object.entries(counts)) P[k] = v / nBoot;
    return { P_label: P, sigma_A: sA, sigma_X: nanstd(Xs), Z, full };
  }
  /** exp_fdt.one_curve: alive unless the median of the components at the largest τ is 0. */
  function fdAlive(raw, ic) {
    if (ic === "empty") return true;
    const tau = raw.tau; let im = 0; for (let i = 1; i < tau.length; i++) if (tau[i] > tau[im]) im = i;
    const v = raw.n_comp.map(r => r[im]).sort((a, b) => a - b), n = v.length;
    const med = n % 2 ? v[(n - 1) / 2] : 0.5 * (v[n / 2 - 1] + v[n / 2]);
    return med >= 1;
  }

  // ===================================================================== E5: rheology
  /**
   * oscillatory_response at several periods: the ± replicas with the field (h₀/2) sin(ωt) ε
   * and shared noise; the zero-field replica of the Python code does not enter χ and is not
   * simulated. o: { N, rule, temp, h0, periods, nCycles, nSkip, B, seed, A0 (array of states) }
   */
  class RheoRun {
    constructor(o) {
      this.o = o; this.N = o.N; this.rule = C.normRule(o.rule);
      this.batch = new Batch(this.N, this.rule);
      this.dt = this.batch.dt; this.amp = Math.sqrt(2.0 * o.temp * this.dt);
      this.p = 0; this.b = 0; this.rows = [];
      this.total = o.periods.reduce((s, P) => s + (o.nSkip + o.nCycles) * P, 0) * o.B;
      this.doneSteps = 0; this.done = false;
      this.cur = null;
      // the states of exp_fdt.initial, unless they are given (E5 uses the same as E2)
      if (o.A0) { this.A0 = o.A0; this.initPending = []; }
      else FDRun.prototype.initStates.call(this);
      this.phase = this.initPending.length ? "init" : "run";
    }
    startOne() {
      const o = this.o, N = this.N, n2 = N * N, P = o.periods[this.p];
      const er = new C.RNG(mix(o.seed, 3000 + 100 * this.p + this.b), 4), eps = new Float64Array(n2);
      for (let k = 0; k < n2; k++) eps[k] = er.uniform() < 0.5 ? -1 : 1;
      const xi = new Float64Array(n2);
      this.cur = { P, k: 0, n: (o.nSkip + o.nCycles) * P, start: o.nSkip * P, omega: 2 * Math.PI / (P * this.dt), eps, xi,
                   rng: new C.RNG(mix(o.seed, 4000 + 100 * this.p + this.b), 5), s: 0, c: 0,
                   reps: [-0.5, 0.5].map(sg => ({ A: Float64Array.from(this.A0[this.b % this.A0.length]), mu: this.rule.mu, f: eps, fs: 0, sg, xi, amp: this.amp })) };
      if (this.b === 0) this.acc = { chi1: [], chi2: [] };
    }
    run(ms) {
      const t0 = Date.now(), o = this.o, n2 = this.N * this.N;
      while (!this.done && Date.now() - t0 < ms) {
        if (this.phase === "init") {
          const live = this.initPending.filter(x => x.steps > 0);
          if (!live.length) { this.phase = "run"; continue; }
          const fields = live.slice(0, 16).map(x => { x.rng.fillNormal(x.xi); x.steps--; return { A: x.A, mu: this.rule.mu, f: null, fs: 0, xi: this.amp ? x.xi : null, amp: this.amp }; });
          this.batch.step(fields);
          continue;
        }
        if (!this.cur) this.startOne();
        const c = this.cur;
        if (c.k < c.n) {
          const hk = o.h0 * Math.sin(c.omega * c.k * this.dt);
          for (const r of c.reps) r.fs = r.sg * hk;
          c.rng.fillNormal(c.xi);
          if (this.amp === 0) for (const r of c.reps) r.xi = null;
          this.batch.step(c.reps);
          if (c.k >= c.start) {
            const t = (c.k + 1) * this.dt, xm = c.reps[0].A, xp = c.reps[1].A;
            let m = 0; for (let q = 0; q < n2; q++) m += c.eps[q] * (xp[q] - xm[q]);
            m = m / n2 / o.h0;
            c.s += m * Math.sin(c.omega * t); c.c += m * Math.cos(c.omega * t);
          }
          c.k++; this.doneSteps++;
          continue;
        }
        const L = c.n - c.start;
        this.acc.chi1.push(2 * c.s / L); this.acc.chi2.push(-2 * c.c / L);
        this.cur = null; this.b++;
        if (this.b >= o.B) {
          const m1 = mean(this.acc.chi1), m2 = mean(this.acc.chi2), mm = m1 * m1 + m2 * m2;
          this.rows.push({ period_steps: c.P, omega: c.omega, chi1: this.acc.chi1, chi2: this.acc.chi2, chi1_mean: m1, chi2_mean: m2,
                           G1_of_mean: m1 / mm, G2_of_mean: m2 / mm });
          this.b = 0; this.p++;
          if (this.p >= o.periods.length) this.done = true;
        }
      }
      return this.done;
    }
    summary() { return { done: this.done, progress: Math.min(1, this.doneSteps / this.total), rows: this.rows.slice(), p: this.p, b: this.b }; }
  }

  // ===================================================================== E6: edges
  /**
   * Π(μ) of exp_continuum.probe: from a copy of the relaxed Orbium (variant = sub-cell
   * position), n steps without noise at μ; `moving_soliton` of classify_batch on the final
   * state and the last window (n/5 steps): one component, ρ > 0.8, speed > 0.05, mass spread
   * below 5%. (classify_batch also stops at an exact cycle: for the Orbium that only happens
   * when it dies or stops, where Π is false either way.)
   */
  class EdgeRun {
    constructor(o) {
      this.o = o; this.N = o.N; this.R = o.R;
      this.batch = new Batch(this.N, Object.assign({}, PROTO, { R: o.R, sigma: o.sigma ?? PROTO.sigma }));
      this.copies = orbiumOffsets(o.base, this.N, o.R, 3);
      this.queue = [];             // probes waiting
      this.running = [];           // probes being simulated (two at a time)
      this.results = new Map();    // key → result
      this.done = false; this.nProbes = 0; this.nDone = 0;
      this.state = { lo: { inside: 0.15, outside: o.lo, log: [] }, hi: { inside: 0.15, outside: o.hi, log: [] } };
      this.stage = "ends";
      this.request([[0.15, 0], [o.lo, 0], [o.hi, 0]]);
    }
    key(mu, v) { return `${mu.toFixed(10)}|${v}`; }
    request(list) {
      for (const [mu, v] of list) {
        const k = this.key(mu, v);
        if (this.results.has(k) || this.queue.some(q => q.k === k) || this.running.some(q => q.k === k)) continue;
        this.queue.push({ k, mu, v }); this.nProbes++;
      }
    }
    has(mu, v) { return this.results.has(this.key(mu, v)); }
    get(mu, v) { return this.results.get(this.key(mu, v)); }
    startProbe(q) {
      const W = Math.max(2, Math.floor(this.o.nSteps / 5));
      const A = Float64Array.from(this.copies[q.v]);
      q.field = { A, mu: q.mu, f: null, fs: 0, xi: null, amp: 0 };
      q.t = 0; q.W = W; q.tWin = this.o.nSteps - W;
      q.cy = []; q.cx = []; q.m = [];
      q.cos = new Float64Array(this.N); q.sin = new Float64Array(this.N);
      for (let i = 0; i < this.N; i++) { q.cos[i] = Math.cos(2 * Math.PI * i / this.N); q.sin[i] = Math.sin(2 * Math.PI * i / this.N); }
      q.py = new Float64Array(this.N); q.px = new Float64Array(this.N);
    }
    recordWindow(q) {
      const N = this.N, A = q.field.A, py = q.py, px = q.px;
      py.fill(0); px.fill(0);
      for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) { const v = A[i * N + j]; s += v; px[j] += v; } py[i] = s; }
      const c = C.profileCentroid(py, px, q.cos, q.sin);
      q.cy.push(c.cy); q.cx.push(c.cx); q.m.push(c.mass);
    }
    finishProbe(q) {
      const N = this.N, A = q.field.A, dt = this.batch.dt;
      const nc = C.components(A, N).length, rho = C.centroid(A, N).rho;
      let py = 0, px = 0;
      for (let i = 1; i < q.cy.length; i++) { py += C.minImage(q.cy[i] - q.cy[i - 1], N); px += C.minImage(q.cx[i] - q.cx[i - 1], N); }
      const speed = q.cy.length > 1 ? Math.hypot(py, px) / ((q.cy.length - 1) * dt) : 0;
      const mm = mean(q.m), cv = q.m.length > 1 && mm > 0 ? Math.sqrt(mean(q.m.map(x => (x - mm) * (x - mm)))) / mm : NaN;
      const steady = Number.isFinite(cv) && cv < 0.05;
      const ok = nc === 1 && rho > 0.8 && speed > 0.05 && steady;
      this.results.set(q.k, { mu: q.mu, v: q.v, pi: ok, mass: C.mass(A), speed, mass_cv: cv, n_components: nc, rho });
      this.nDone++;
    }
    /** What the protocol asks for next, given the results so far. */
    plan() {
      const o = this.o, s = this.state, tol = o.tol;
      if (this.stage === "ends") {
        if (!this.has(0.15, 0) || !this.has(o.lo, 0) || !this.has(o.hi, 0)) return;
        for (const side of ["lo", "hi"]) {
          const S = s[side], pin = this.get(0.15, 0).pi, pout = this.get(S.outside, 0).pi;
          S.log.push([0.15, pin], [S.outside, pout]);
          S.status = !pin ? "none-in-range" : pout ? "beyond-range" : "bisect";
          S.a = 0.15; S.b = S.outside;
        }
        this.stage = "bisect";
      }
      if (this.stage === "bisect") {
        const need = [];
        for (const side of ["lo", "hi"]) {
          const S = s[side];
          if (S.status !== "bisect") continue;
          if (S.pending !== undefined) {
            if (!this.has(S.pending, 0)) { need.push([S.pending, 0]); continue; }
            const pc = this.get(S.pending, 0).pi;
            S.log.push([S.pending, pc]);
            if (pc) S.a = S.pending; else S.b = S.pending;
            S.pending = undefined;
          }
          if (Math.abs(S.b - S.a) > tol) { S.pending = 0.5 * (S.a + S.b); need.push([S.pending, 0]); }
          else S.status = "confirm";
        }
        if (need.length) { this.request(need); return; }
        if (["lo", "hi"].every(k => s[k].status !== "bisect")) this.stage = "confirm";
      }
      if (this.stage === "confirm") {
        const need = [];
        for (const side of ["lo", "hi"]) { const S = s[side]; if (S.status === "confirm") need.push([S.a, 1], [S.b, 1]); }
        if (need.some(([m, v]) => !this.has(m, v))) { this.request(need); return; }
        for (const side of ["lo", "hi"]) {
          const S = s[side];
          if (S.status !== "confirm") continue;
          const ca = this.get(S.a, 1).pi, cb = this.get(S.b, 1).pi;
          Object.assign(S, { status: ca && !cb ? "confirmed" : "unconfirmed", inside: S.a, outside: S.b, edge: 0.5 * (S.a + S.b),
                             halfwidth: 0.5 * Math.abs(S.b - S.a), confirm_inside: ca, confirm_outside: cb });
        }
        this.stage = "branch";
      }
      if (this.stage === "branch") {
        const edges = ["lo", "hi"].filter(k => s[k].edge !== undefined).map(k => ({ k, d: Math.abs(0.15 - s[k].edge), edge: s[k].edge, side: k === "lo" ? -1 : 1 }));
        if (!edges.length || !o.branch) { this.stage = "grid"; return this.plan(); }
        edges.sort((a, b) => a.d - b.d);
        const e = edges[0];
        this.near = { edge: e.edge, side: e.side };
        const pts = o.offsets.map(d => [e.edge - e.side * d, 0]);
        if (pts.some(([m, v]) => !this.has(m, v))) { this.request(pts); return; }
        this.near.branch = o.offsets.map(d => { const mu = e.edge - e.side * d, r = this.get(mu, 0); return { delta: d, mu, alive: r.pi, mass: r.mass, speed: r.speed, mass_cv: r.mass_cv }; });
        this.stage = "grid";
      }
      if (this.stage === "grid") {
        if (!o.grid) { this.done = true; return; }
        const mus = []; for (let m = o.lo; m <= o.hi + 1e-9; m += 0.01) mus.push(+m.toFixed(6));
        if (mus.some(m => !this.has(m, 2))) { this.request(mus.map(m => [m, 2])); return; }
        const vals = mus.map(m => this.get(m, 2).pi), idx = vals.map((v, i) => v ? i : -1).filter(i => i >= 0);
        this.gridRes = { mu: mus, pi: vals, contiguous: idx.every((v, i) => i === 0 || v - idx[i - 1] === 1) };
        this.done = true;
      }
    }
    run(ms) {
      const t0 = Date.now();
      while (!this.done && Date.now() - t0 < ms) {
        while (this.running.length < 2 && this.queue.length) { const q = this.queue.shift(); this.startProbe(q); this.running.push(q); }
        if (!this.running.length) { this.plan(); if (!this.running.length && !this.queue.length && !this.done) this.plan(); continue; }
        this.batch.step(this.running.map(q => q.field));
        for (const q of this.running) { q.t++; if (q.t > q.tWin) this.recordWindow(q); }
        const fin = this.running.filter(q => q.t >= this.o.nSteps);
        for (const q of fin) this.finishProbe(q);
        this.running = this.running.filter(q => q.t < this.o.nSteps);
        if (fin.length) this.plan();
      }
      return this.done;
    }
    summary() {
      const probes = [...this.results.values()];
      return { done: this.done, stage: this.stage, nDone: this.nDone, nProbes: this.nProbes, probes,
               lower: this.state.lo, upper: this.state.hi, near: this.near || null, grid: this.gridRes || null,
               progress: this.nProbes ? (this.nDone + this.running.reduce((s, q) => s + q.t / this.o.nSteps, 0)) / Math.max(this.nProbes, this.nDone + 1) : 0 };
    }
  }

  /** verdicts.v_P6b's fit m = m_c + b δ^γ (unweighted least squares), with the standard error
   *  of curve_fit (covariance scaled by the residual variance). */
  function branchFit(d, m) {
    const n = d.length;
    if (n < 4) return null;
    const lin = (g) => {                       // best m_c, b for a given γ, and the residual sum
      const x = d.map(v => Math.pow(v, g)), mx = mean(x), mm = mean(m);
      let sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (m[i] - mm); }
      const b = sxy / sxx, mc = mm - b * mx;
      let sse = 0; for (let i = 0; i < n; i++) sse += (m[i] - mc - b * x[i]) ** 2;
      return { mc, b, sse };
    };
    let best = { g: 0.5, sse: Infinity };
    for (let g = 0.02; g <= 3.0001; g += 0.002) { const r = lin(g); if (r.sse < best.sse) best = { g, sse: r.sse }; }
    let lo = Math.max(0.005, best.g - 0.004), hi = best.g + 0.004;       // golden section to refine
    for (let k = 0; k < 60; k++) { const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618; if (lin(a).sse < lin(b).sse) hi = b; else lo = a; }
    const g = 0.5 * (lo + hi), { mc, b, sse } = lin(g);
    // Jacobian of mc + b δ^γ in (mc, b, γ), then (JᵀJ)⁻¹ · sse / (n − 3)
    const J = d.map(v => [1, Math.pow(v, g), b * Math.pow(v, g) * Math.log(v)]);
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const r of J) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += r[i] * r[j];
    const inv = inv3(M), s2 = sse / Math.max(1, n - 3);
    return { m_c: mc, b, gamma: g, se_gamma: inv ? Math.sqrt(Math.max(0, inv[2][2] * s2)) : NaN };
  }
  function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
    const A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g, det = a * A + b * B + c * Cc;
    if (!det) return null;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
            [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
            [Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }

  root.Experiments = { Batch, prepareOrbium, recenter, orbiumOffsets, backwardGrid, FDRun, normalizedCurve, gradient, plateauQea,
                       calibrateA1, readCurve, labelFrom, classifyFD, bootstrapLabels, fdAlive, RheoRun, EdgeRun, branchFit, PROTO, mix };
})(typeof self !== "undefined" ? self : this);

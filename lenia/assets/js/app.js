/*
 * app.js — the simulator: loop, rendering, controls, and the four instruments
 * (creature, lifetime, chaos, lattice). Sections below the simulator (scenarios, Kramers
 * lab, phase map, species) live in sections.js and talk to this file through
 * window.App.
 */
(function () {
  "use strict";
  const C = window.LeniaCore, D = window.LENIA_DATA, Charts = window.Charts;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ================================================================== formatting
  const MINUS = "−";
  function fx(x, d = 3) {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    if (!Number.isFinite(x)) return x > 0 ? "∞" : MINUS + "∞";
    const s = Math.abs(x).toFixed(d);
    return (x < 0 && +s !== 0 ? MINUS : "") + s;
  }
  function sci(x, sig = 2) {
    if (x === 0) return "0";
    if (!Number.isFinite(x)) return fx(x);
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e <= 3) return fx(x, Math.max(0, sig - 1 - e));
    const m = x / Math.pow(10, e);
    const ms = (+m.toFixed(sig - 1)).toString();
    return (ms === "1" ? "" : ms.replace("-", MINUS) + "·") + "10" + Charts.sup(e);
  }
  function trim(x, d = 4) { return (+(+x).toFixed(d)).toString().replace("-", MINUS); }
  const fmt = { fx, sci, trim };

  // ================================================================== colour maps
  function parseLut(hex) {
    const n = hex.length / 6, a = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) a[i * 3 + c] = parseInt(hex.substr(i * 6 + c * 2, 2), 16);
    return a;
  }
  const LUT = {
    light: { field: parseLut(D.palette.lut.field), signed: parseLut(D.palette.lut.signed), grey: parseLut(D.palette.lut.grey) },
    dark: { field: parseLut(D.palette.lut.field_dark), signed: parseLut(D.palette.lut.signed_dark), grey: parseLut(D.palette.lut.grey_dark) },
  };
  const mqDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function isDark() {
    const t = document.documentElement.dataset.theme;
    return t === "dark" || (t !== "light" && !!(mqDark && mqDark.matches));
  }

  // ================================================================== state
  const PROTO = D.protocol;
  const PROTO_RULE = { mu: PROTO.orbium.mu, sigma: PROTO.orbium.sigma, R: PROTO.rule.R, T: PROTO.rule.T,
                       peaks: PROTO.rule.peaks, core: PROTO.rule.core, growth: PROTO.rule.growth };
  const S = {
    running: true, speed: 10, view: "A", follow: true, overlay: true, grid: false,
    brush: "off", temp: 0, h: 0, seed: 20261016, dirty: true,
  };
  const sim = new C.Lenia(128, PROTO_RULE, { seed: S.seed });
  const listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, arg) { for (const fn of listeners[ev] || []) try { fn(arg); } catch (e) { console.error(e); } }

  // ================================================================== tracking (every step)
  const CAP = 1 << 14;
  const Tr = {
    n: 0, t: new Float64Array(CAP), m: new Float64Array(CAP), y: new Float64Array(CAP), x: new Float64Array(CAP),
    ry: new Float64Array(CAP), rx: new Float64Array(CAP), uy: 0, ux: 0, py: NaN, px: NaN, base: 0,
  };
  /** Start a new track; the profiles are recomputed from A, since the state may have been
   *  loaded or edited without a step. */
  function trackReset() { sim.updateProfiles(); Tr.n = 0; Tr.py = NaN; Tr.px = NaN; Tr.uy = 0; Tr.ux = 0; }
  function trackPush() {
    const c = sim.centroidFast(), N = sim.N;
    if (c.mass > 0) {
      if (Number.isFinite(Tr.py)) { Tr.uy += C.minImage(c.cy - Tr.py, N); Tr.ux += C.minImage(c.cx - Tr.px, N); }
      else { Tr.uy = c.cy; Tr.ux = c.cx; }
      Tr.py = c.cy; Tr.px = c.cx;
    } else { Tr.py = NaN; Tr.px = NaN; }
    const k = Tr.n % CAP;
    Tr.t[k] = sim.time; Tr.m[k] = c.mass; Tr.y[k] = c.mass > 0 ? Tr.uy : NaN; Tr.x[k] = c.mass > 0 ? Tr.ux : NaN;
    Tr.ry[k] = c.ry; Tr.rx[k] = c.rx;
    Tr.n++;
    Tr.last = c;
  }
  const at = (arr, back) => arr[(Tr.n - 1 - back + CAP * 4) % CAP];   // back = 0 is the latest
  /** Mean displacement per step over the last w steps (needs a continuous track). */
  function advance(w) {
    w = Math.min(w, Tr.n - 1, CAP - 1);
    if (w < 1) return null;
    const y1 = at(Tr.y, 0), x1 = at(Tr.x, 0), y0 = at(Tr.y, w), x0 = at(Tr.x, w);
    if (![y1, x1, y0, x0].every(Number.isFinite)) return null;
    return { dy: (y1 - y0) / w, dx: (x1 - x0) / w, w };
  }

  // ================================================================== components (every 10 steps)
  const Comp = { nc: 0, top: null, shape: "—", lastShapeStep: -1, parent: null };
  function checkComponents(withShape) {
    const N = sim.N;
    if (!Comp.parent || Comp.parent.length !== N * N) Comp.parent = new Int32Array(N * N);
    const list = C.components(sim.A, N, 0.1, 5, { parent: Comp.parent });
    const changed = (list.length === 0) !== (Comp.nc === 0) || (list.length > 1) !== (Comp.nc > 1);
    Comp.nc = list.length; Comp.top = list[0] || null;
    if (withShape || changed) { Comp.shape = C.shapeCategory(sim.A, N).category; Comp.lastShapeStep = sim.steps; }
    lifeCheck();
  }

  // ================================================================== lifetime (E4 criterion)
  const Life = { ref: null, state: "off", tRef: 0, sRef: 0, tDeath: 0, sDeath: 0, cause: 0, verdict: "", note: "" };
  function lifeArm(quiet) {
    const f = C.features(sim.A, sim.N);
    if (f.nc === 1) {
      Life.ref = { mass: f.mass, rg: f.rg }; Life.state = "alive"; Life.tRef = sim.time; Life.sRef = sim.steps; Life.note = "";
      Life.series = { t: [0], m: [1], rg: [1] };
      if (!quiet) toast("Reference taken: the present creature");
    } else { Life.ref = null; Life.state = "none"; Life.series = { t: [], m: [], rg: [] }; }
  }
  function lifeCheck() {
    if (!Life.ref) return;
    const top = Comp.top, f = top ? { mass: top.mass, rg: top.rg, nc: Comp.nc } : { mass: 0, rg: 0, nc: 0 };
    Life.f = f;
    const L = Life.series;
    if (L) {
      L.t.push(sim.time - Life.tRef); L.m.push(f.mass / Life.ref.mass); L.rg.push(f.nc ? f.rg / Life.ref.rg : NaN);
      if (L.t.length > 1500) for (const k of ["t", "m", "rg"]) L[k] = L[k].filter((_, i) => i % 2 === 0);
    }
    if (Life.state === "alive") {
      const c = C.deathCause(f, Life.ref);
      if (c) { Life.state = "dead"; Life.cause = c; Life.tDeath = sim.time; Life.sDeath = sim.steps; Life.fDeath = f; emit("death", Life); }
    } else if (Life.state === "dead" && sim.time >= Life.tDeath + 30 - 1e-9) {
      const back = f.nc === 1 && Math.abs(f.mass / Life.ref.mass - 1) <= 0.25;
      Life.state = back ? "reversible" : "confirmed";
    }
  }

  // ================================================================== Lyapunov meter
  const Ly = { on: false, k: 0, sum: 0, n: 0, dead: false, series: { t: [], v: [] }, warm: 600 };
  function lyapReset(keepVector) {
    Ly.k = 0; Ly.sum = 0; Ly.n = 0; Ly.dead = false; Ly.series = { t: [], v: [] };
    Ly.warm = Math.round(60 * sim.rule.T);
    if (Ly.on && (!keepVector || !sim.V)) sim.enableTangent((S.seed ^ 0x5bd1e995) >>> 0);
  }
  function setLyap(onOff) {
    Ly.on = !!onOff; $("#opt-lyap").checked = Ly.on;
    if (Ly.on) lyapReset(false); else { sim.disableTangent(); if (S.view === "V") setView("A"); }
    $('#view-tabs [data-view="V"]').disabled = !Ly.on;
    S.dirty = true;
    changed();
  }
  function lyapStep(nv) {
    if (!Ly.on || !sim.V) return;
    Ly.k++;
    if (!(nv > 0)) { Ly.dead = true; return; }
    const V = sim.V, s = 1 / nv;
    for (let q = 0; q < V.length; q++) V[q] *= s;
    if (Ly.k > Ly.warm) {
      Ly.sum += Math.log(nv); Ly.n++;
      if (Ly.n % 10 === 0) { Ly.series.t.push(Ly.n * sim.dt); Ly.series.v.push(Ly.sum / (Ly.n * sim.dt)); }
    }
  }
  function sameRule(a, b, tol = 1e-9) {
    return Math.abs(a.mu - b.mu) < tol && Math.abs(a.sigma - b.sigma) < tol && Math.abs(a.R - b.R) < tol && a.T === b.T &&
      a.core === b.core && a.growth === b.growth && a.peaks.length === b.peaks.length && a.peaks.every((x, i) => Math.abs(x - b.peaks[i]) < 1e-9);
  }
  function isOrbiumRule(r) {
    return Math.abs(r.mu - 0.15) < 1e-9 && Math.abs(r.sigma - 0.015) < 1e-9 && r.T === 10 && r.core === "exponential" &&
      r.growth === "gaussian" && r.peaks.length === 1 && r.peaks[0] === 1;
  }
  /** What we measured for the present creature and rule, if anything. */
  function measuredLambda() {
    const r = sim.rule, cur = App.current || {};
    // E3, E9, E10, E12 measured the deterministic dynamics; with noise the tangent map along a
    // noisy trajectory gives another exponent (frozen noise), not comparable with them
    if (S.temp > 0 || S.h !== 0) return null;
    if (cur.species && sameRule(r, cur.species.rule)) {
      const sp = cur.species;
      if (sp.lam_mean !== null && sp.lam_mean !== undefined) return { v: sp.lam_mean, src: `E9, four copies, N = ${sp.N_e9}` };
      if (sp.died_in_lyap) return { v: -Infinity, src: "E9: died during the run" };
      return null;
    }
    if (!isOrbiumRule(r) || !cur.orbium) return null;
    const e3 = D.lattice.e3.find(x => Math.abs(x.R - r.R) < 1e-9 && x.N === sim.N);
    if (e3) return { v: e3.lam_mean, src: `E3, four copies, N = ${e3.N}` };
    for (const [rows, tag] of [[D.lattice.scan, "E10"], [D.lattice.test, "E10"], [D.lattice.lock, "E12"]]) {
      const x = rows.find(q => Math.abs(q.R - r.R) < 1e-6 && Number.isFinite(q.lam_mean));
      if (x) return { v: x.lam_mean, src: `${tag}, four copies, N = ${x.N}` };
    }
    return null;
  }

  // ================================================================== two frames (E2's sliding solid)
  // Overlap of the state with an anchor state A(t_w), in the laboratory and in the co-moving
  // frame, and the surrogate null of the maximum over translations (core.FrameMeter).
  const Fr = { meter: null, s0: 0, t0: 0, every: 5, n: 0, t: [], cm: [], lab: [], nul: [], last: null, y0: 0, x0: 0 };
  const FR_RETAINED = 0.70;      // fdplot.R_RETAINED: the share of the correlation that counts as kept
  function frameAnchor() {
    if (!Fr.meter || Fr.meter.N !== sim.N) Fr.meter = new C.FrameMeter(sim.N);
    Fr.n++;
    Fr.meter.anchor(sim.A, new C.RNG(S.seed, 20 + Fr.n));
    Fr.s0 = sim.steps; Fr.t0 = sim.time;
    // about two measurements per time unit on 128², fewer on larger tori
    Fr.every = Math.max(1, Math.round(sim.rule.T / 2 * Math.max(1, sim.N * sim.N / 16384)));
    Fr.t = []; Fr.cm = []; Fr.lab = []; Fr.nul = []; Fr.last = null;
    Fr.y0 = Tr.uy; Fr.x0 = Tr.ux;
    if (Fr.meter.normW > 0) frameMeasure();
  }
  function frameMeasure() {
    if (!(Fr.meter.normW > 0)) return;
    const r = Fr.meter.measure(sim.A);
    Fr.last = r;
    Fr.t.push(sim.time - Fr.t0); Fr.cm.push(r.q_cm); Fr.lab.push(r.q_lab); Fr.nul.push(r.q_null);
    if (Fr.t.length > 1200) {                       // keep the curve light: halve it, measure half as often
      for (const k of ["t", "cm", "lab", "nul"]) Fr[k] = Fr[k].filter((_, i) => i % 2 === 0);
      Fr.every *= 2;
    }
  }
  /** A reading of the two curves, after 10 time units (fdplot's 0.70 rule). */
  function frameReading() {
    const r = Fr.last;
    if (!Fr.meter || !(Fr.meter.normW > 0) || !r) return { tag: "—", cls: "", text: "There was no matter at the anchor." };
    const lag = sim.time - Fr.t0;
    if (lag < 10) return { tag: "measuring", cls: "", text: `A reading after 10 time units (${fx(10 - lag, 1)} to go).` };
    const kept = (r.q_cm - r.q_null) / Math.max(1e-9, 1 - r.q_null);
    if (r.q_lab >= FR_RETAINED) return { tag: "frozen", cls: "bath", text: "Shape and place are both kept: a frozen state, or a creature that does not travel." };
    if (kept >= FR_RETAINED) return { tag: "sliding solid", cls: "ok", text: "The shape is kept, the place is not: a sliding solid, the mark of a travelling creature." };
    // one creature whose shape no translation brings back: it turns, or it pulsates
    if (Comp.nc === 1 && (Comp.shape === "compact" || Comp.shape === "segment"))
      return { tag: "changing shape", cls: "lab", text: "Still one creature, but no translation brings its shape back: it rotates or pulsates. The moving frame here follows translations only." };
    return { tag: "liquid", cls: "bad", text: "The shape itself is forgotten: the state has decorrelated in both frames, like a liquid or a texture." };
  }
  /** m / m_ref and R_g / R_g,ref since the reference, with the ±25% band of the criterion. */
  function drawLife() {
    const L = Life.series || { t: [], m: [], rg: [] };
    const tmax = Math.max(10, L.t.length ? L.t[L.t.length - 1] : 10);
    let lo = 0.7, hi = 1.3;
    for (const arr of [L.m, L.rg]) for (const v of arr) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    lo = Math.max(0, lo - 0.03); hi = Math.min(3, hi + 0.03);
    Charts.plot($("#c-life"), {
      x: [0, tmax], y: [lo, hi], yticks: [0.75, 1, 1.25].filter(v => v >= lo && v <= hi),
      series: [{ x: L.t, y: L.rg, color: "--muted", width: 1.2 }, { x: L.t, y: L.m, color: "--creature", width: 1.4 }],
      bands: [{ y0: 0.75, y1: 1.25, color: "--creature", alpha: 0.07 }],
      hlines: [{ y: 1, color: "--axis", dash: [] }],
      ylabel: "÷ ref", xlabel: "time since the reference", empty: Life.ref ? "" : "no reference",
    });
  }
  function drawFrames() {
    const tmax = Math.max(10, Fr.t.length ? Fr.t[Fr.t.length - 1] : 10);
    Charts.plot($("#c-frame"), {
      x: [0, tmax], y: [0, 1.04], yticks: [0, 0.5, 0.7, 1],
      series: [{ x: Fr.t, y: Fr.nul, color: "--muted", dash: [4, 3], width: 1.2 }, { x: Fr.t, y: Fr.lab, color: "--lab" }, { x: Fr.t, y: Fr.cm, color: "--creature" }],
      hlines: [{ y: FR_RETAINED, color: "--axis", dash: [2, 3] }],
      xlabel: "time since the anchor", ylabel: "overlap",
      empty: Fr.meter && Fr.meter.normW > 0 ? "" : "no matter at the anchor",
    });
  }

  // ================================================================== links
  // The state of the simulator in the query string (?c=sp:OG2g&theta=0.001&view=G): the hash
  // is left to the section anchors. Only what differs from what the key alone gives is written.
  const DEFAULT_SEED = 20261016;
  const enc = (v) => encodeURIComponent(String(v)).replace(/%3A/gi, ":").replace(/%2C/gi, ",").replace(/%2F/gi, "/");
  const short = (x) => String(+(+x).toPrecision(10));
  function stateQuery() {
    if (App.scenarioSlug) return `try=${enc(App.scenarioSlug)}`;
    const cur = App.current;
    if (!cur || !cur.key) return "";
    const r = sim.rule, b = cur.base, q = [["c", cur.key]];
    const pk = (x) => x.map(fraction).join(",");
    if (Math.abs(r.mu - b.rule.mu) > 1e-12) q.push(["mu", short(r.mu)]);
    if (Math.abs(r.sigma - b.rule.sigma) > 1e-12) q.push(["sigma", short(r.sigma)]);
    if (Math.abs(r.R - b.rule.R) > 1e-12) q.push(["R", short(r.R)]);
    if (r.T !== b.rule.T) q.push(["T", r.T]);
    if (pk(r.peaks) !== pk(b.rule.peaks)) q.push(["b", pk(r.peaks)]);
    if (r.core !== b.rule.core) q.push(["core", r.core]);
    if (r.growth !== b.rule.growth) q.push(["growth", r.growth]);
    if (sim.N !== b.N) q.push(["N", sim.N]);
    if (Math.abs(S.temp - (b.temp || 0)) > 1e-15) q.push(["theta", short(S.temp)]);
    if (S.h !== 0) q.push(["h", short(S.h)]);
    if (cur.kind === "patch" || S.seed !== DEFAULT_SEED) q.push(["seed", S.seed]);
    if (S.view !== "A") q.push(["view", S.view]);
    if (Ly.on) q.push(["lyap", 1]);
    if (S.speed !== 10) q.push(["speed", S.speed]);
    if (!S.follow) q.push(["follow", 0]);
    if (q.length === 1 && cur.key === "orbium") return "";             // the page as it opens
    return q.map(([k, v]) => `${k}=${enc(v)}`).join("&");
  }
  function linkUrl() { const q = stateQuery(); return location.href.split(/[?#]/)[0] + (q ? "?" + q : ""); }
  let urlTimer = 0;
  /** Something a link can carry has changed: forget the scenario, refresh the address bar. */
  function changed() {
    if (!App.applying) App.scenarioSlug = null;
    if (!App.urlLive) return;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      try { const q = stateQuery(); history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash); }
      catch (e) { /* pages opened from the disk may refuse */ }
    }, 350);
  }
  function specFromKey(key, ruleQ, Nq) {
    const [kind, ...rest] = key.split(":"), arg = rest.join(":");
    const custom = () => C.normRule(Object.assign({}, PROTO_RULE, ruleQ));
    switch (kind) {
      case "orbium": return orbiumSpec();
      case "sp": { const sp = D.species.find(x => x.code === arg); return sp ? speciesSpec(sp) : null; }
      case "lat": return latticeSpec(+arg);
      case "e4": { const [mu, row] = arg.split(":"); return e4Spec(+mu, +row); }
      case "patch": { const r = custom(), N = Nq || 128; return 2 * r.R < N ? patchSpec(+arg || 50, r, N) : null; }
      case "empty": { const sp = emptySpec(); sp.rule = custom(); sp.N = Nq || 128; return 2 * sp.rule.R < sp.N ? sp : null; }
      default: return exampleByKey(key);
    }
  }
  /** Put the simulator in the state a link describes. */
  function applyState(P) {
    App.applying = true;
    try {
      const get = (k) => P.get(k), has = (k) => P.get(k) !== null;
      if (has("seed") && Number.isFinite(+get("seed"))) S.seed = (+get("seed")) >>> 0;
      const ruleQ = {};
      for (const k of ["mu", "sigma", "R", "T"]) if (has(k) && Number.isFinite(+get(k)) && +get(k) > 0) ruleQ[k] = +get(k);
      if (has("b")) { const pk = parsePeaks(get("b")); if (pk) ruleQ.peaks = pk; }
      if (has("core") && C.CORES.includes(get("core"))) ruleQ.core = get("core");
      if (has("growth") && C.GROWTHS.includes(get("growth"))) ruleQ.growth = get("growth");
      const Nq = has("N") ? Math.round(+get("N")) : null;
      let spec = null;
      try { spec = specFromKey(get("c") || "orbium", ruleQ, Nq); } catch (e) { spec = null; }
      if (!spec) { toast("This link names a creature the page does not know; here is the Orbium"); spec = orbiumSpec(); }
      if (has("theta") && +get("theta") >= 0) spec.temp = +get("theta"); else if (spec.temp === undefined) spec.temp = 0;
      spec.h = has("h") ? (+get("h") || 0) : 0;
      spec.lyap = get("lyap") === "1";
      spec.view = ["A", "U", "G", "dA", "V", "K"].includes(get("view")) ? get("view") : "A";
      load(spec, { quiet: true });
      if (ruleQ.R !== undefined && Math.abs(ruleQ.R - sim.rule.R) > 1e-12 && ruleQ.R >= 2 && ruleQ.R <= 120) rescaleWorld(ruleQ.R);
      if (Nq && Nq !== sim.N && Nq >= 16 && Nq <= 600) resizeWorld(Nq);
      const rest = Object.assign({}, ruleQ); delete rest.R;
      if (Object.keys(rest).length) setRule(rest, "link");
      if (has("speed") && [0, 1, 3, 10, 30].includes(+get("speed"))) { S.speed = +get("speed"); $("#speed").value = String(S.speed); }
      if (get("follow") === "0") { S.follow = false; $("#opt-follow").checked = false; }
      syncControls();
    } finally { App.applying = false; }
  }
  /** At start: a scenario (?try=slug) or a state (?c=…); then keep the address bar in step. */
  function applyQuery(scenarioBySlug) {
    let applied = false;
    try {
      const P = new URLSearchParams(location.search);
      if (P.get("try") && scenarioBySlug) {
        const sc = scenarioBySlug(P.get("try"));
        if (sc) { App.applying = true; try { sc.apply(); } finally { App.applying = false; } App.scenarioSlug = sc.slug; applied = true; }
      } else if ([...P.keys()].length) { applyState(P); applied = true; }
    } catch (e) { console.error(e); }
    App.urlLive = true;
    return applied;
  }

  // ================================================================== loading
  const App = window.App = {
    D, C, sim, S, fmt, on, emit, isDark, LUT, current: null, Ly, Life, Tr, Comp,
  };
  Object.assign(App, { scenarioSlug: null, applying: false, urlLive: false, changed, linkUrl, stateQuery, applyState, applyQuery });
  function cloneRule(r) { return Object.assign({}, r, { peaks: r.peaks.slice() }); }

  /**
   * Load a state. spec: { label, latin, meta, kind, rule, N, A | cells, window, temp, h,
   *   lyap, view, species, orbium, note }
   */
  function load(spec, opts = {}) {
    const rule = C.normRule(spec.rule);
    const N = spec.N || sim.N;
    if (2 * rule.R >= N) throw new Error(`the kernel needs 2R < N (R = ${rule.R}, N = ${N})`);
    if (N !== sim.N) sim.resize(N, rule); else sim.setRule(rule);
    if (spec.A) sim.A.set(spec.A);
    else if (spec.cells) C.place(N, spec.cells, sim.A);
    else sim.A.fill(0);
    sim.steps = 0;
    if (spec.temp !== undefined) S.temp = spec.temp;
    if (spec.h !== undefined) S.h = spec.h;
    sim.setTemp(S.temp); sim.h = S.h;
    sim.setSeed(S.seed);
    spec.A0 = Float64Array.from(sim.A);
    App.current = spec;
    trackReset(); trackPush();
    Comp.shape = "—"; checkComponents(true);
    lifeArm(true);
    frameAnchor();
    if (spec.lyap !== undefined) setLyap(spec.lyap); else if (Ly.on) lyapReset(false);
    if (spec.view) setView(spec.view);
    syncControls();
    updateCreatureCard();
    S.dirty = true;
    if (!opts.quiet && spec.toast !== false) toast(spec.label + (spec.note ? " — " + spec.note : ""));
    emit("load", spec);
    changed();
    return spec;
  }
  function reset() {
    const cur = App.current;
    if (!cur) return;
    load(Object.assign({}, cur, { A: cur.A0, cells: null, temp: undefined, h: undefined, lyap: undefined, view: undefined, toast: false }), { quiet: true });
    toast("Reset to the loaded state");
  }

  /** A spec remembers the key that recreates it and what that key alone gives (for links). */
  function keyed(spec, key, baseRule, baseN) {
    spec.key = key;
    spec.base = { rule: C.normRule(baseRule || spec.rule), N: baseN || spec.N, temp: spec.temp || 0 };
    return spec;
  }
  function orbiumSpec() {
    const st = D.orbium.relaxed;
    return keyed({ kind: "orbium", orbium: true, label: "Orbium unicaudatus", latin: true, rule: st.rule, N: st.N, A: C.unpackState(st),
             meta: "the protocol's Orbium · relaxed 1000 steps on 128²", window: e6Window(st.rule.R) }, "orbium");
  }
  /** The protocol Orbium relaxed 1000 more steps at one μ of the E4 ladder, at that row's ϑ. */
  function e4Spec(mu, row) {
    const st = D.orbium.e4_refs.find(s => Math.abs(s.rule.mu - mu) < 1e-5), m = D.kramers.mus.find(x => Math.abs(x.mu - mu) < 1e-5);
    if (!st || !m || !m.rows[row]) return null;
    const w = D.windows.E6["13"];
    return keyed({ kind: "orbium", orbium: true, label: `Orbium at μ = ${trim(st.rule.mu, 4)}`, latin: false, rule: st.rule, N: st.N, A: C.unpackState(st),
      meta: "E4 reference: the protocol Orbium relaxed 1000 steps at this μ", temp: m.rows[row].temp,
      window: { lo: w.lo, hi: w.hi, src: "E6, R = 13", fateLo: "multiplies", fateHi: "fades", caveat: "Close to an edge the outcome can also depend on where the creature sits on the grid." } },
      `e4:${st.rule.mu}:${row}`);
  }
  function e6Window(R) {
    const w = D.windows.E6[String(Math.round(R))];
    return w && Math.abs(Math.round(R) - R) < 1e-9 ? { lo: w.lo, hi: w.hi, src: `E6, R = ${Math.round(R)}`, fateLo: "multiplies", fateHi: "fades", caveat: "Close to an edge the outcome can also depend on where the creature sits on the grid." } : null;
  }
  function speciesSpec(sp) {
    const cells = C.decodeRLE(sp.cells);
    const N = C.fastSize(Math.max(sp.N_e9, C.even(2 * Math.max(cells.length, cells[0].length) + 2 * sp.rule.R)));
    const win = sp.lower && sp.upper ? { lo: sp.lower.edge, hi: sp.upper.edge, src: "E9", fateLo: sp.lower.fate, fateHi: sp.upper.fate } : null;
    const isOrb = sp.code === "O2u";
    return keyed({ kind: "species", species: sp, orbium: isOrb, label: sp.name, latin: true, rule: sp.rule, N, cells,
             meta: `${sp.code} · Chan's catalogue pattern${N !== sp.N_e9 ? ` · N = ${N} (E9: ${sp.N_e9})` : ""}`, window: win }, `sp:${sp.code}`);
  }
  function latticeSpec(R) {
    const st = D.lattice.states.find(s => Math.abs(s.rule.R - R) < 1e-9);
    if (!st) {
      // not among the stored states: prepare it here (a link to any R; a few seconds)
      if (!window.Experiments || !(R >= 4 && R <= 70)) return null;
      const N = C.even(8 * R);
      return preparedSpec(R, N, window.Experiments.prepareOrbium(N, R, D.orbium.cells));
    }
    return keyed({ kind: "orbium", orbium: true, label: `Orbium at R = ${trim(R, 2)}`, latin: false, rule: st.rule, N: st.N, A: C.unpackState(st),
             meta: `rescaled seed, relaxed 1000 steps, N = 8R = ${st.N}`, window: e6Window(R) }, `lat:${st.rule.R}`);
  }
  /** The protocol Orbium prepared on this page at R (seed rescaled, 1100 steps, recentred). */
  function preparedSpec(R, N, A) {
    return keyed({ kind: "orbium", orbium: true, label: `Orbium at R = ${trim(R, 2)}`, latin: false, rule: Object.assign({}, PROTO_RULE, { R }), N, A,
                   meta: `rescaled seed, relaxed 1100 steps on this page, N = 8R = ${N}`, window: e6Window(R) }, `lat:${R}`);
  }
  function exampleSpec(st, label, meta, key) {
    return keyed({ kind: "example", label, latin: false, rule: st.rule, N: st.N, A: C.unpackState(st), meta, window: null }, key);
  }
  /** The census examples by key: belt, belt-open, mover:<i>. */
  function exampleByKey(key) {
    const E = D.examples;
    if (key === "belt") return exampleSpec(E.belt_closed, "Travelling belt", "E7 source belt on the 100² torus", "belt");
    if (key === "belt-open") return exampleSpec(E.belt_open, "Open belt", "E7 open arm on the 300² torus", "belt-open");
    const m = /^mover:(\d+)$/.exec(key);
    if (m && E.movers[+m[1]]) {
      const mv = E.movers[+m[1]];
      return exampleSpec(mv, `Unclassified mover ${+m[1] + 1}`, `E1b, patch side ${mv.side}, final state after 7000 steps`, key);
    }
    return null;
  }
  function patchSpec(side, rule, N) {
    const rng = new C.RNG(S.seed, 3);
    rule = rule || sim.rule; N = N || sim.N;
    const A = C.noisePatch(N, side, rng);
    return keyed({ kind: "patch", label: `Noise patch, side ${side}`, latin: false, rule, N, A,
             meta: `U(0,1) in a random Voronoi cell of area ≈ ${side}² (seed ${S.seed})`, window: null }, `patch:${side}`, PROTO_RULE, 128);
  }
  function emptySpec() {
    return keyed({ kind: "empty", label: "Empty world", latin: false, rule: sim.rule, N: sim.N, A: null, meta: "the void: a fixed point of the deterministic rule", window: null }, "empty", PROTO_RULE, 128);
  }
  Object.assign(App, { load, reset, orbiumSpec, e4Spec, speciesSpec, latticeSpec, preparedSpec, exampleSpec, exampleByKey, patchSpec, emptySpec, setLyap, measuredLambda, sameRule, isOrbiumRule });

  // ================================================================== world transforms
  /** The field rolled so that the creature's centroid is at the centre (integer shift). */
  function centredShift() {
    const c = Tr.last && Tr.last.mass > 0 ? Tr.last : C.centroid(sim.A, sim.N);
    const N = sim.N;
    if (!(c.mass > 0) || c.rho < 0.3) return [0, 0];
    return [Math.round(N / 2 - c.cy), Math.round(N / 2 - c.cx)];
  }
  function resizeWorld(Nn) {
    const N = sim.N;
    if (Nn === N) return;
    if (2 * sim.rule.R >= Nn) { toast(`N = ${Nn} is too small for R = ${trim(sim.rule.R, 2)} (2R < N)`); syncControls(); return; }
    const [sy, sx] = centredShift(), A = sim.A, B = new Float64Array(Nn * Nn);
    const h = Math.min(N, Nn), oN = Math.floor((N - h) / 2), oM = Math.floor((Nn - h) / 2);
    for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) {
      const si = ((oN + i - sy) % N + N) % N, sj = ((oN + j - sx) % N + N) % N;
      B[(oM + i) * Nn + oM + j] = A[si * N + sj];
    }
    sim.resize(Nn, sim.rule); sim.A.set(B); afterTransform();
  }
  function rescaleWorld(Rn) {
    const N = sim.N, f = Rn / sim.rule.R;
    const [sy, sx] = centredShift(), A = sim.A, rows = [];
    for (let i = 0; i < N; i++) { const r = new Array(N); for (let j = 0; j < N; j++) r[j] = A[(((i - sy) % N + N) % N) * N + (((j - sx) % N + N) % N)]; rows.push(r); }
    const Z = C.rescale(rows, f);
    let Nn = C.fastSize(Z.length);
    while (2 * Rn >= Nn) Nn = C.fastSize(Nn + 1);
    const rule = Object.assign({}, sim.rule, { R: Rn });
    sim.resize(Nn, rule);
    const o = Math.floor((Nn - Z.length) / 2);
    for (let i = 0; i < Z.length; i++) for (let j = 0; j < Z[0].length; j++) sim.A[(o + i) * Nn + o + j] = Z[i][j];
    afterTransform();
    toast(`R = ${trim(Rn, 2)}: world rescaled by ${trim(f, 3)}, N = ${Nn}`);
  }
  function afterTransform() {
    sim.setTemp(S.temp); sim.h = S.h; sim.setSeed(S.seed);
    trackReset(); trackPush(); checkComponents(true);
    frameAnchor();
    if (Ly.on) lyapReset(false);
    syncControls(); updateCreatureCard(); S.dirty = true;
    changed();
  }

  // ================================================================== rule changes
  function setRule(partial, why) {
    const r = Object.assign(cloneRule(sim.rule), partial);
    if (2 * r.R >= sim.N) {
      // grow the torus first (with the present kernel, which fits), then change the rule
      const Nn = C.fastSize(Math.max(sim.N + 1, C.even(8 * r.R)));
      resizeWorld(Nn);
      toast(`N raised to ${Nn}: the kernel needs 2R < N`);
    }
    sim.setRule(r);
    sim.setTemp(S.temp);
    if (Ly.on) lyapReset(true);
    syncControls(); updateCreatureCard(); S.dirty = true;
    emit("rule", { rule: sim.rule, why });
    changed();
  }
  function setTemp(t) {
    S.temp = Math.max(0, +t);
    sim.setTemp(S.temp);
    syncBath();
    emit("temp", S.temp);
    changed();
  }
  Object.assign(App, { setRule, setTemp, resizeWorld, rescaleWorld });

  // ================================================================== rendering
  const world = $("#world"), wctx = world.getContext("2d");
  const over = $("#overlay"), octx = over.getContext("2d");
  let img = null;
  function render() {
    const N = sim.N;
    if (world.width !== N) { world.width = N; world.height = N; img = null; }
    if (!img) img = wctx.createImageData(N, N);
    const lut = isDark() ? LUT.dark : LUT.light, px = img.data;
    const [sy, sx] = S.follow ? centredShift() : [0, 0];
    S.shift = [sy, sx];
    let src, map, lo = 0, hi = 1;
    switch (S.view) {
      case "U": src = sim.U; map = lut.grey; hi = Math.max(2 * sim.rule.mu, 1e-6); break;   // grey: what each cell sees
      case "G": src = sim.G; map = lut.signed; lo = -1; hi = 1; break;
      case "dA": src = sim.dA; map = lut.signed; lo = -sim.dt; hi = sim.dt; break;   // ±1 per time unit
      case "V": {
        src = sim.V || sim.dA; map = lut.signed;
        let m = 0; if (sim.V) for (let k = 0; k < src.length; k++) { const a = Math.abs(src[k]); if (a > m) m = a; }
        lo = -(m || 1); hi = m || 1; break;
      }
      case "K": {
        src = sim.conv.K; map = lut.grey; let m = 0; for (let k = 0; k < src.length; k++) if (src[k] > m) m = src[k];
        hi = m || 1; break;
      }
      default: src = sim.A; map = lut.field;
    }
    const kshift = S.view === "K" ? Math.floor(N / 2) : 0;
    const inv = 255 / (hi - lo), sqrtV = S.view === "V" && sim.V;   // the tangent vector on a √ scale
    for (let i = 0; i < N; i++) {
      const si = S.view === "K" ? ((i - kshift + N) % N) : ((i - sy) % N + N) % N;
      for (let j = 0; j < N; j++) {
        const sj = S.view === "K" ? ((j - kshift + N) % N) : ((j - sx) % N + N) % N;
        let x = src[si * N + sj];
        if (sqrtV) x = (x < 0 ? -1 : 1) * Math.sqrt(Math.abs(x) * hi);
        let v = (x - lo) * inv;
        v = v < 0 ? 0 : v > 255 ? 255 : v | 0;
        const o = (i * N + j) * 4, c = v * 3;
        px[o] = map[c]; px[o + 1] = map[c + 1]; px[o + 2] = map[c + 2]; px[o + 3] = 255;
      }
    }
    wctx.putImageData(img, 0, 0);
    drawOverlay(sy, sx);
    $("#hud-t").textContent = `t = ${fx(sim.time, 1)} · ${sim.steps} steps`;
    S.dirty = false;
  }

  function drawOverlay(sy, sx) {
    const dpr = Math.min(3, window.devicePixelRatio || 1), W = over.clientWidth, H = over.clientHeight;
    if (over.width !== Math.round(W * dpr)) { over.width = Math.round(W * dpr); over.height = Math.round(H * dpr); }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, W, H);
    const N = sim.N, cs = W / N;
    if (S.grid && cs >= 5) {
      octx.strokeStyle = isDark() ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.06)"; octx.lineWidth = 1;
      octx.beginPath();
      for (let k = 0; k <= N; k++) { const p = Math.round(k * cs) + 0.5; octx.moveTo(p, 0); octx.lineTo(p, H); octx.moveTo(0, p); octx.lineTo(W, p); }
      octx.stroke();
    }
    if (!S.overlay || S.view === "K") { scaleBar(cs, W, H); return; }
    const c = Tr.last;
    if (c && c.mass > 0 && c.rho >= 0.6) {
      const y = (((c.cy + sy) % N + N) % N + 0.5) * cs, x = (((c.cx + sx) % N + N) % N + 0.5) * cs;
      const lab = Charts.cssVar("--lab", "#eb6834");
      octx.strokeStyle = lab; octx.fillStyle = lab; octx.lineWidth = 1.2;
      octx.setLineDash([4, 4]);
      octx.beginPath(); octx.arc(x, y, sim.rule.R * cs, 0, 2 * Math.PI); octx.globalAlpha = 0.55; octx.stroke(); octx.globalAlpha = 1;
      octx.setLineDash([]);
      octx.beginPath(); octx.arc(x, y, 2.6, 0, 2 * Math.PI); octx.fill();
      const a = advance(Math.round(sim.rule.T));
      if (a && Math.hypot(a.dy, a.dx) * sim.rule.T > 0.05) {
        const v = Math.hypot(a.dy, a.dx), L = Math.min(sim.rule.R * 1.6, 0.9 * sim.rule.R + 2) * cs;
        const ux = a.dx / v, uy = a.dy / v, ex = x + ux * L, ey = y + uy * L;
        octx.lineWidth = 1.8; octx.beginPath(); octx.moveTo(x, y); octx.lineTo(ex, ey); octx.stroke();
        const hw = 5;
        octx.beginPath(); octx.moveTo(ex, ey); octx.lineTo(ex - ux * 8 - uy * hw, ey - uy * 8 + ux * hw); octx.lineTo(ex - ux * 8 + uy * hw, ey - uy * 8 - ux * hw); octx.closePath(); octx.fill();
      }
    }
    scaleBar(cs, W, H);
  }
  function scaleBar(cs, W, H) {
    const R = sim.rule.R, len = R * cs;
    if (len < 12 || len > W * 0.6) return;
    const x1 = W - 14, x0 = x1 - len, y = H - 16;
    octx.strokeStyle = Charts.cssVar("--ink-2", "#555"); octx.fillStyle = octx.strokeStyle; octx.lineWidth = 1.5;
    octx.beginPath(); octx.moveTo(x0, y); octx.lineTo(x1, y); octx.moveTo(x0, y - 4); octx.lineTo(x0, y + 4); octx.moveTo(x1, y - 4); octx.lineTo(x1, y + 4); octx.stroke();
    octx.font = `12px ${Charts.cssVar("--font-ui", "sans-serif")}`; octx.textAlign = "center"; octx.textBaseline = "bottom";
    octx.fillText(`R = ${trim(R, 2)} cells`, (x0 + x1) / 2, y - 5);
  }

  // ================================================================== loop
  let last = performance.now(), acc = 0, rate = { steps: 0, t0: performance.now(), value: 0 };
  function doStep() {
    const nv = sim.step();
    trackPush();
    lyapStep(nv);
    if (sim.steps % 10 === 0) checkComponents(sim.steps - Comp.lastShapeStep >= 50);
    if (Fr.meter && Fr.meter.normW > 0 && (sim.steps - Fr.s0) % Fr.every === 0) frameMeasure();
  }
  function frame(now) {
    const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.running) {
      const t0 = performance.now(), budget = 13;
      let target = S.speed > 0 ? acc + S.speed * sim.rule.T * dtReal : Infinity, k = 0;
      const n = Math.floor(target);
      while (k < n && performance.now() - t0 < budget) { doStep(); k++; }
      acc = (S.speed > 0 && k === n) ? target - n : 0;
      rate.steps += k;
      if (k) S.dirty = true;
    }
    if (now - rate.t0 > 700) { rate.value = rate.steps / ((now - rate.t0) / 1000); rate.steps = 0; rate.t0 = now; updateRate(); }
    if (S.dirty) render();
    instruments(now);
    requestAnimationFrame(frame);
  }
  function updateRate() {
    const tu = rate.value / sim.rule.T;
    $("#hud-rate").textContent = S.running ? `${Math.round(rate.value)} steps/s · ${fx(tu, tu < 10 ? 1 : 0)} t/s` : "paused";
  }
  function setRunning(r) {
    S.running = r;
    const b = $("#btn-run");
    b.classList.toggle("running", r); b.querySelector(".lbl").textContent = r ? "Pause" : "Run";
    updateRate();
  }

  // ================================================================== instruments
  let lastText = 0, lastCharts = 0;
  function instruments(now) {
    if (now - lastText > 120) { lastText = now; instText(); }
    if (now - lastCharts > 260) { lastCharts = now; instCharts(); }
  }
  function instText() {
    const c = Tr.last || { mass: 0 };
    $("#i-mass").textContent = fx(c.mass, 2);
    $("#i-nc").textContent = String(Comp.nc);
    const tag = $("#i-shape"); tag.textContent = Comp.shape; tag.className = "tag" + (Comp.shape === "compact" ? " ok" : Comp.shape === "dead" ? " bad" : "");
    // speed over the last 10 time units: the lattice makes it oscillate by about 1% within
    // one time unit (the chart shows that), the number is the average
    const a = advance(Math.round(10 * sim.rule.T));
    if (a && c.mass > 0 && Comp.nc >= 1 && Math.min(c.ry, c.rx) >= 0.6) {
      const v = Math.hypot(a.dy, a.dx) * sim.rule.T;
      $("#i-speed").textContent = `${fx(v, 3)} c/t`;
      $("#i-speed").title = `cells per time unit, averaged over ${fx(a.w / sim.rule.T, 1)} time units; v/R = ${fx(v / sim.rule.R, 4)}`;
      $("#i-heading").textContent = v > 0.05 ? `${fx(Math.atan2(-a.dy, a.dx) * 180 / Math.PI, 1)}°` : "at rest";
    } else if (a && c.mass > 0 && Comp.nc >= 1 && Math.max(c.ry, c.rx) >= 0.6) {
      const along = c.ry >= c.rx ? "y" : "x", v = Math.abs(along === "y" ? a.dy : a.dx) * sim.rule.T;
      $("#i-speed").textContent = `${fx(v, 3)} c/t`; $("#i-heading").textContent = `along ${along}`;
    } else { $("#i-speed").textContent = "—"; $("#i-heading").textContent = "—"; }

    // lifetime
    const lt = $("#i-life-tag"), st = $("#i-life");
    const f = Life.f, ref = Life.ref;
    const setBar = (el, out, ratio) => {
      const ok = Number.isFinite(ratio);
      const p = ok ? Math.max(0, Math.min(1, 0.5 + (ratio - 1) / 1.0)) : 0.5;
      el.style.left = (p * 100) + "%"; el.classList.toggle("out", ok && Math.abs(ratio - 1) > 0.25);
      out.textContent = ok ? fx(ratio, 3) : "—";
    };
    if (ref && f) { setBar($("#m-mass"), $("#o-mass"), f.mass / ref.mass); setBar($("#m-rg"), $("#o-rg"), f.nc ? f.rg / ref.rg : NaN); }
    else { setBar($("#m-mass"), $("#o-mass"), NaN); setBar($("#m-rg"), $("#o-rg"), NaN); }
    const cause = ["", "it split", "its mass left ±25%", "its shape (R_g) left ±25%"][Life.cause];
    const detail = Life.fDeath ? (Life.cause === 1 ? ` (${Life.fDeath.nc} component${Life.fDeath.nc === 1 ? "" : "s"})` : Life.cause === 2 ? ` (m/m_ref = ${fx(Life.fDeath.mass / ref.mass, 2)})` : ` (R_g/R_g,ref = ${fx(Life.fDeath.rg / ref.rg, 2)})`) : "";
    switch (Life.state) {
      case "alive": lt.textContent = "alive"; lt.className = "tag alive";
        st.textContent = `Alive for ${fx(sim.time - Life.tRef, 1)} time units (${sim.steps - Life.sRef} steps) since the reference.`; break;
      case "dead": lt.textContent = "died"; lt.className = "tag dead";
        st.textContent = `Died at t = ${fx(Life.tDeath, 1)}, ${Life.sDeath - Life.sRef} steps after the reference: ${cause}${detail}. Watching 30 more time units to tell a real death from a passing one…`; break;
      case "reversible": lt.textContent = "reversible"; lt.className = "tag ok";
        st.textContent = `Recorded as dead at t = ${fx(Life.tDeath, 1)} (${cause}), but 30 time units later it is one creature again with its mass within 25%: a fragment broke off and dissolved. Near the lower edge of the Orbium window, 23 of 23 recorded deaths were of this kind.`; break;
      case "confirmed": lt.textContent = "dead"; lt.className = "tag dead";
        st.textContent = `Died at t = ${fx(Life.tDeath, 1)}, ${Life.sDeath - Life.sRef} steps after the reference: ${cause}${detail}. Still not one creature 30 time units later: a real death.`; break;
      case "none": lt.textContent = "no creature"; lt.className = "tag";
        st.textContent = "The reference needs exactly one component above 0.1 (at least 5 cells)."; break;
      default: lt.textContent = "—"; lt.className = "tag"; st.textContent = "—";
    }
    $("#i-kramers").innerHTML = kramersHint();

    // chaos
    const li = $("#i-lam");
    if (!Ly.on) li.textContent = "off";
    else if (Ly.dead) li.textContent = MINUS + "∞ (died)";
    else if (Ly.k <= Ly.warm) li.textContent = `warm-up ${Math.round(100 * Ly.k / Ly.warm)}%`;
    else li.textContent = `${fx(Ly.sum / (Ly.n * sim.dt), 4)}`;
    const ref2 = measuredLambda();
    $("#i-lam-ref").textContent = ref2 ? (Number.isFinite(ref2.v) ? fx(ref2.v, 4) : MINUS + "∞") : "—";
    $("#i-lam-ref").title = ref2 ? ref2.src : (S.temp > 0 ? "our measurements are at ϑ = 0: with noise this is the exponent of the dynamics with frozen noise" : "no measurement for this creature and rule");
    if (!ref2 && S.temp > 0) $("#i-lam-ref").textContent = "at ϑ = 0 only";

    // two frames
    if (Fr.last) {
      $("#i-qcm").textContent = fx(Fr.last.q_cm, 3); $("#i-qlab").textContent = fx(Fr.last.q_lab, 3);
      const moved = Math.hypot(Tr.uy - Fr.y0, Tr.ux - Fr.x0);
      $("#i-moved").textContent = Number.isFinite(moved) ? `${fx(moved, 1)} cells` : "—";
    } else { $("#i-qcm").textContent = "—"; $("#i-qlab").textContent = "—"; $("#i-moved").textContent = "—"; }
    const fr = frameReading(), ft = $("#i-frame-tag");
    ft.textContent = fr.tag; ft.className = "tag" + (fr.cls ? " " + fr.cls : "");
    $("#i-frame-read").textContent = fr.text;

    // lattice
    const w = Math.min(4000, Tr.n - 1), d = advance(w);
    const single = c.mass > 0 && Math.min(c.ry, c.rx) >= 0.8 && Comp.nc === 1;
    if (d && single && w >= 50) {
      const dig = w >= 1000 ? 6 : 4;
      $("#i-dy").textContent = fx(d.dy, dig); $("#i-dx").textContent = fx(d.dx, dig);
      $("#i-dwin").textContent = `${w} steps`;
      const lk = lockOf(d, w), tg = $("#i-lock");
      tg.textContent = lk ? `locked: ${lk}` : (w >= 1000 ? "unlocked" : "measuring");
      tg.className = "tag" + (lk ? " lock" : "");
    } else {
      $("#i-dy").textContent = "—"; $("#i-dx").textContent = "—"; $("#i-dwin").textContent = single ? "measuring" : "needs one compact creature";
      $("#i-lock").textContent = "—"; $("#i-lock").className = "tag";
    }
  }
  function lockOf(d, w) {
    if (w < 1000) return null;
    const out = [];
    for (const [name, v] of [["δy", d.dy], ["δx", d.dx]]) {
      const a = Math.abs(v);
      for (let q = 1; q <= 3; q++) {
        const p = Math.round(a * q);
        if (p > 0 && Math.abs(a - p / q) <= 1e-4 && gcd(p, q) === 1) { out.push(`|${name}| = ${q === 1 ? p : p + "/" + q}`); break; }
      }
    }
    return out.length ? out.join(", ") : null;
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  /** E4's Arrhenius fit, when the present rule is one of the E4 points. */
  function e4Point() {
    const r = sim.rule, K = D.kramers;
    if (!(Math.abs(r.sigma - K.sigma) < 1e-9 && Math.abs(r.R - K.R) < 1e-9 && r.T === 10 && sim.N === K.N &&
          r.core === "exponential" && r.growth === "gaussian" && r.peaks.length === 1 && r.peaks[0] === 1)) return null;
    return K.mus.find(m => Math.abs(m.mu - r.mu) < 2e-6) || null;
  }
  function kramersHint() {
    const m = e4Point();
    if (!m) return "";
    if (!(S.temp > 0)) return `E4 measured lifetimes at μ = ${trim(m.mu, 6)} for ϑ between ${sci(m.rows[0].temp)} and ${sci(m.rows[m.rows.length - 1].temp)}: set a temperature.`;
    const tau = Math.exp(m.ln_tau0 + m.dPhi / S.temp);   // time units
    const lo = m.rows[0].temp, hi = m.rows[m.rows.length - 1].temp, inside = S.temp >= lo * 0.98 && S.temp <= hi * 1.02;
    const pt = m.rows.find(x => Math.abs(x.temp / S.temp - 1) < 0.01);
    let s = `E4 at μ = ${trim(m.mu, 6)}: Arrhenius fit ⟨τ⟩ ≈ <b>${fx(tau, tau < 100 ? 1 : 0)}</b> time units at this ϑ${inside ? "" : " (extrapolated outside the measured range)"}`;
    if (pt) s += `; measured ${fx(pt.tau / 10, 1)} [${fx(pt.tau_lo / 10, 1)}, ${fx(pt.tau_hi / 10, 1)}] with ${pt.n} replicas`;
    return s + ".";
  }
  App.e4Point = e4Point;

  function instCharts() {
    const T = sim.rule.T, span = Math.round(100 * T), n = Math.min(Tr.n, span, CAP - 1);
    const step = Math.max(1, Math.floor(n / 400));
    const ts = [], ms = [], vs = [];
    const W = Math.max(1, Math.round(T));
    for (let b = n - 1; b >= 0; b -= step) {
      ts.push(at(Tr.t, b)); ms.push(at(Tr.m, b));
      if (b + W < Tr.n && b + W < CAP) {
        const y1 = at(Tr.y, b), x1 = at(Tr.x, b), y0 = at(Tr.y, b + W), x0 = at(Tr.x, b + W);
        const ok = [y1, x1, y0, x0].every(Number.isFinite) && Math.min(at(Tr.ry, b), at(Tr.rx, b)) >= 0.6;
        vs.push(ok ? Math.hypot(y1 - y0, x1 - x0) / W * T : NaN);
      } else vs.push(NaN);
    }
    const t1 = sim.time, t0 = Math.max(0, t1 - 100);
    Charts.plot($("#c-mass"), { x: [t0, Math.max(t1, t0 + 1)], series: [{ x: ts, y: ms, color: "--creature" }], ylabel: "mass", padB: 18, xfmt: () => "" });
    Charts.plot($("#c-speed"), { x: [t0, Math.max(t1, t0 + 1)], series: [{ x: ts, y: vs, color: "--lab", width: 1.3 }], ylabel: "speed", xlabel: "time (units of T steps)" });
    // λ
    const ref = measuredLambda();
    const hl = [{ y: 0, color: "--axis", dash: [] }];
    if (ref && Number.isFinite(ref.v)) hl.push({ y: ref.v, color: "--lab", dash: [5, 3], label: "measured" });
    Charts.plot($("#c-lam"), {
      x: Ly.series.t.length ? [0, Math.max(10, Ly.series.t[Ly.series.t.length - 1])] : [0, 100],
      y: lamRange(ref), series: [{ x: Ly.series.t, y: Ly.series.v, color: "--creature" }],
      bands: [{ y0: -0.05, y1: 0.05, color: "--creature", alpha: 0.08 }], hlines: hl,
      ylabel: "λ", xlabel: "time after warm-up", empty: Ly.on ? (Ly.k <= Ly.warm ? "warming up the tangent vector…" : "") : "tick “measure λ”",
    });
    drawPhase();
    drawRule();
    drawFrames();
    drawLife();
  }
  function lamRange(ref) {
    const v = Ly.series.v; let lo = -0.06, hi = 0.06;
    for (let i = Math.floor(v.length / 3); i < v.length; i++) if (Number.isFinite(v[i])) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); }
    if (ref && Number.isFinite(ref.v)) { lo = Math.min(lo, ref.v); hi = Math.max(hi, ref.v); }
    const pad = (hi - lo) * 0.1; return [lo - pad, hi + pad];
  }

  const phaseCanvas = $("#c-phase");
  function drawPhase() {
    const { ctx, w, h } = Charts.setup(phaseCanvas);
    const c = Tr.last || { mass: 0 };
    ctx.strokeStyle = Charts.cssVar("--axis", "#ccc"); ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    const single = c.mass > 0 && Math.min(c.ry, c.rx) >= 0.8 && Comp.nc === 1;
    const n = Math.min(Tr.n, 6000, CAP - 1);
    ctx.font = `11px ${Charts.cssVar("--font-ui", "sans-serif")}`; ctx.fillStyle = Charts.cssVar("--muted", "#888");
    ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("x mod 1 →", 4, h - 15);
    ctx.save(); ctx.translate(12, 4); ctx.rotate(Math.PI / 2); ctx.textBaseline = "bottom"; ctx.fillText("y mod 1 →", 0, 0); ctx.restore();
    if (!single || n < 20) return;
    let mlo = Infinity, mhi = -Infinity;
    for (let b = 0; b < n; b++) { const m = at(Tr.m, b); if (m < mlo) mlo = m; if (m > mhi) mhi = m; }
    const lut = isDark() ? LUT.dark.field : LUT.light.field, span = mhi - mlo || 1, pad = 6;
    for (let b = n - 1; b >= 0; b--) {
      const y = at(Tr.y, b), x = at(Tr.x, b);
      if (!Number.isFinite(y) || !Number.isFinite(x)) continue;
      const fy = y - Math.floor(y), fxp = x - Math.floor(x);
      const k = Math.round(60 + 195 * (at(Tr.m, b) - mlo) / span) * 3;
      ctx.fillStyle = `rgb(${lut[k]},${lut[k + 1]},${lut[k + 2]})`;
      ctx.fillRect(pad + fxp * (w - 2 * pad) - 0.9, pad + fy * (h - 2 * pad) - 0.9, 1.8, 1.8);
    }
  }

  function drawRule() {
    const r = sim.rule;
    // kernel radial profile, normalised to its maximum
    const xs = [], ks = [];
    let km = 0;
    for (let i = 0; i <= 200; i++) { const x = i / 180; xs.push(x); const v = C.kernelShell(x, r.peaks, r.core); ks.push(v); if (v > km) km = v; }
    for (let i = 0; i < ks.length; i++) ks[i] /= km || 1;
    Charts.plot($("#c-kernel"), { x: [0, 1.1], y: [0, 1.08], series: [{ x: xs, y: ks, color: "--ink-2", width: 1.4 }], xlabel: "kernel profile, r / R", ylabel: "K", yticks: [0, 1], padB: 30 });
    // growth function and the distribution of K∗A on cells with matter
    const umax = Math.min(1, Math.max(2.2 * r.mu, r.mu + 6 * r.sigma, 0.05));
    const us = [], gs = [], g = C.growthFn(r.growth, r.mu, r.sigma);
    for (let i = 0; i <= 300; i++) { const u = umax * i / 300; us.push(u); gs.push(g(u)); }
    const nb = 60, hist = new Float64Array(nb), U = sim.U, A = sim.A;
    let tot = 0;
    for (let k = 0; k < A.length; k++) if (A[k] > 0.01) { const b = Math.floor(U[k] / umax * nb); if (b >= 0 && b < nb) { hist[b]++; tot++; } }
    let hm = 0; for (const v of hist) hm = Math.max(hm, v);
    const hx = [], hy = [];
    for (let b = 0; b < nb; b++) { const x0 = b / nb * umax, x1 = (b + 1) / nb * umax, y = hm ? -1 + 1.0 * hist[b] / hm : -1; hx.push(x0, x0, x1, x1); hy.push(-1, y, y, -1); }
    Charts.plot($("#c-growth"), {
      x: [0, umax], y: [-1.08, 1.08], yticks: [-1, 0, 1],
      series: [{ x: hx, y: hy, color: "--bath", width: 1, alpha: 0.55 }, { x: us, y: gs, color: "--creature" }],
      xbands: [{ x0: r.mu - r.sigma, x1: r.mu + r.sigma, color: "--creature", alpha: 0.08 }],
      vlines: [{ x: r.mu, color: "--creature", dash: [3, 3] }], hlines: [{ y: 0, color: "--axis", dash: [] }],
      xlabel: "u = K∗A", ylabel: "G(u)", padB: 30,
    });
    $("#i-rule-hint").innerHTML = tot ? `The bell G, and in <span class="c-bath">blue</span> what the ${tot} cells with A > 0.01 see: K∗A.` : "The bell G(K∗A): cells grow where it is positive.";
  }

  // ================================================================== controls
  const el = {
    mu: $("#mu"), muN: $("#mu-num"), sg: $("#sigma"), sgN: $("#sigma-num"), R: $("#R"), Rres: $("#R-rescale"), T: $("#T"),
    peaks: $("#peaks"), N: $("#N"), core: $("#core"), growth: $("#growth"), temp: $("#temp"), h: $("#h"), seed: $("#seed"),
  };
  const N_LIST = [64, 80, 96, 100, 104, 112, 128, 144, 160, 176, 182, 192, 200, 208, 216, 240, 256, 288, 300, 320, 360, 384, 400, 432, 480];
  function syncControls() {
    const r = sim.rule;
    el.mu.value = r.mu; el.muN.value = trim(r.mu, 6);
    el.sg.value = r.sigma; el.sgN.value = trim(r.sigma, 6);
    el.R.value = trim(r.R, 3);
    if (![...el.T.options].some(o => +o.value === r.T)) el.T.add(new Option(String(r.T), String(r.T)));
    el.T.value = String(r.T);
    el.peaks.value = r.peaks.map(fraction).join(", ");
    el.core.value = r.core; el.growth.value = r.growth;
    const list = N_LIST.includes(sim.N) ? N_LIST : N_LIST.concat([sim.N]).sort((a, b) => a - b);
    el.N.innerHTML = list.filter(n => 2 * r.R < n).map(n => `<option value="${n}"${n === sim.N ? " selected" : ""}>${n}</option>`).join("");
    syncWindow(); syncBath();
    $("#hud-view").textContent = `${sim.N}² · ${viewName()}`;
  }
  function viewName() { return { A: "A", U: "K∗A (0 to 2μ)", G: "G(K∗A)", dA: "ΔA per time unit", V: "tangent vector, √ scale", K: "kernel" }[S.view]; }
  function fraction(x) {
    for (const q of [1, 2, 3, 4, 6, 12]) { const p = Math.round(x * q); if (Math.abs(x - p / q) < 1e-9) return q === 1 ? String(p) : `${p}/${q}`; }
    return trim(x, 4);
  }
  function parsePeaks(s) {
    const out = s.split(/[,;\s]+/).filter(Boolean).map(t => { const m = t.split("/"); return m.length === 2 ? +m[0] / +m[1] : +t; });
    if (!out.length || out.some(v => !Number.isFinite(v) || v < 0 || v > 4) || !out.some(v => v > 0)) return null;
    return out;
  }
  function syncWindow() {
    const cur = App.current, band = $("#mu-band"), note = $("#mu-note");
    let w = null;
    if (cur && cur.window) {
      const r = sim.rule, base = cur.rule;
      const sameShape = Math.abs(r.sigma - base.sigma) < 1e-9 && Math.abs(r.R - base.R) < 1e-9 && r.T === base.T && r.core === base.core && r.growth === base.growth &&
        r.peaks.length === base.peaks.length && r.peaks.every((x, i) => Math.abs(x - base.peaks[i]) < 1e-9);
      if (sameShape) w = cur.window;
    }
    if (!w) { band.style.display = "none"; note.textContent = ""; return; }
    const lo = +el.mu.min, hi = +el.mu.max, f0 = (w.lo - lo) / (hi - lo), f1 = (w.hi - lo) / (hi - lo);
    band.style.display = "block";
    band.style.left = `calc(8px + (100% - 16px) * ${f0})`; band.style.width = `calc((100% - 16px) * ${Math.max(0.002, f1 - f0)})`;
    const mu = sim.rule.mu, where = mu < w.lo ? "below the window" : mu > w.hi ? "above the window" : "inside the window";
    note.innerHTML = `Window (${w.src}): ${trim(w.lo, 4)} &lt; μ &lt; ${trim(w.hi, 4)}; below it the creature ${verb(w.fateLo)}, above it ${verb(w.fateHi)}. Now <b>${where}</b>.${w.caveat && where !== "inside the window" ? " " + w.caveat : ""}`;
  }
  function verb(f) { return { grew: "proliferates", faded: "fades", other: "becomes something else", multiplies: "multiplies", fades: "fades" }[f] || f || "?"; }
  function syncBath() {
    const t = S.temp, v = t > 0 ? Math.log10(t) : +el.temp.min;
    if (document.activeElement !== el.temp) el.temp.value = v;
    $("#temp-out").textContent = t > 0 ? `ϑ = ${sci(t, 3)}` : "ϑ = 0 (deterministic)";
    const dt = sim.dt, kick = Math.sqrt(2 * t * dt);
    let msg;
    if (!(t > 0)) msg = `No noise: Chan's rule. Decay of an empty cell: dt = ${fx(dt, 3)} per step.`;
    else {
      const z = dt / kick;
      const verdict = z >= 3.5 ? "the void stays exactly empty" : z >= 2 ? "rare sparks in the void" : "the void comes alive";
      msg = `Kick √(2ϑ dt) = ${fx(kick, 4)} per step against a decay of dt = ${fx(dt, 3)}: beating it is a ${fx(z, 1)}σ event, so ${verdict}.`;
    }
    $("#temp-note").textContent = msg;
    // marks: ϑ_s and the void control; the E4 ladder for this μ
    const lo = +el.temp.min, hi = +el.temp.max, pos = (x) => `calc(8px + (100% - 16px) * ${(Math.log10(x) - lo) / (hi - lo)})`;
    let marks = `<i style="left:${pos(D.kramers.temp_s)}" title="ϑ_s = 10⁻³: the temperature of the FDT measurements (E2)"></i>` +
      `<i style="left:${pos(0.05)}" title="ϑ = 0.05: the empty-world control of the thermometer (E2)"></i>`;
    const m = e4Point();
    if (m) {
      const a = m.rows[0].temp, b = m.rows[m.rows.length - 1].temp;
      marks += `<i class="e4" style="left:${pos(a)};width:calc((100% - 16px) * ${(Math.log10(b) - Math.log10(a)) / (hi - lo)})" title="E4 ladder at this μ"></i>`;
    }
    $("#temp-marks").innerHTML = marks;
    $("#h-out").textContent = `h = ${fx(S.h, 3)}`;
    if (document.activeElement !== el.h) el.h.value = S.h;
    if (document.activeElement !== el.seed) el.seed.value = S.seed;
  }
  function updateCreatureCard() {
    const cur = App.current || {}, r = sim.rule;
    const nm = $("#cr-name");
    nm.textContent = cur.label || "—"; nm.style.fontStyle = cur.latin ? "italic" : "normal";
    const rule = `R ${trim(r.R, 2)} · T ${r.T} · β ${r.peaks.map(fraction).join(",")} · μ ${trim(r.mu, 4)} · σ ${trim(r.sigma, 4)} · N ${sim.N}`;
    $("#cr-meta").innerHTML = `${escapeHtml(cur.meta || "")}<br>${rule}`;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  App.escapeHtml = escapeHtml;

  /** A decimal typed with a dot or a comma (the page is English, keyboards may not be). */
  const num = (s) => { const t = String(s).trim().replace(",", ".").replace(/[−–]/g, "-"); return t === "" ? NaN : Number(t); };
  el.mu.addEventListener("input", () => setRule({ mu: +el.mu.value }, "mu"));
  el.muN.addEventListener("change", () => { const v = num(el.muN.value); if (v > 0 && v < 1) setRule({ mu: v }, "mu"); else syncControls(); });
  el.sg.addEventListener("input", () => setRule({ sigma: +el.sg.value }, "sigma"));
  el.sgN.addEventListener("change", () => { const v = num(el.sgN.value); if (v > 0 && v < 1) setRule({ sigma: v }, "sigma"); else syncControls(); });
  el.R.addEventListener("change", () => {
    const v = num(el.R.value);
    if (!(v >= 2 && v <= 120) || Math.abs(v - sim.rule.R) < 1e-12) { syncControls(); return; }
    if (el.Rres.checked) rescaleWorld(v); else setRule({ R: v }, "R");
  });
  el.T.addEventListener("change", () => setRule({ T: +el.T.value }, "T"));
  el.peaks.addEventListener("change", () => { const p = parsePeaks(el.peaks.value); if (p) setRule({ peaks: p }, "peaks"); else { toast("β: positive numbers or fractions, e.g. 1, 1/3"); syncControls(); } });
  el.core.addEventListener("change", () => setRule({ core: el.core.value }, "core"));
  el.growth.addEventListener("change", () => setRule({ growth: el.growth.value }, "growth"));
  el.N.addEventListener("change", () => resizeWorld(+el.N.value));
  el.temp.addEventListener("input", () => {
    const v = +el.temp.value;
    setTemp(v <= +el.temp.min + 0.05 ? 0 : +Math.pow(10, v).toPrecision(3));
  });
  el.h.addEventListener("input", () => { S.h = +el.h.value; sim.h = S.h; syncBath(); changed(); });
  el.seed.addEventListener("change", () => { const v = num(el.seed.value); if (Number.isFinite(v) && v >= 0) { S.seed = (v >>> 0); sim.setSeed(S.seed); } syncBath(); changed(); });
  $("#btn-seed").addEventListener("click", () => { S.seed = (Math.random() * 2 ** 31) >>> 0; sim.setSeed(S.seed); syncBath(); toast(`seed ${S.seed}`); });

  // transport
  $("#btn-run").addEventListener("click", () => setRunning(!S.running));
  $("#btn-step").addEventListener("click", () => { setRunning(false); doStep(); App.refresh(); });
  $("#btn-reset").addEventListener("click", reset);
  $("#speed").addEventListener("change", (e) => { S.speed = +e.target.value; acc = 0; changed(); });
  $("#opt-follow").addEventListener("change", (e) => { S.follow = e.target.checked; S.dirty = true; changed(); });
  $("#btn-anchor").addEventListener("click", () => { frameAnchor(); App.refresh(); });
  $("#btn-share").addEventListener("click", async () => {
    const url = linkUrl();
    try { await navigator.clipboard.writeText(url); toast("Link copied: it reopens this creature, rule and bath"); }
    catch (e) { window.prompt("Copy this link:", url); }
  });
  $("#opt-overlay").addEventListener("change", (e) => { S.overlay = e.target.checked; S.dirty = true; });
  $("#opt-grid").addEventListener("change", (e) => { S.grid = e.target.checked; S.dirty = true; });
  $("#opt-lyap").addEventListener("change", (e) => setLyap(e.target.checked));
  $("#btn-rearm").addEventListener("click", () => { checkComponents(false); lifeArm(false); });
  function setView(v) {
    if (v === "V" && !Ly.on) setLyap(true);
    S.view = v; S.dirty = true;
    $$("#view-tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === v)));
    $("#hud-view").textContent = `${sim.N}² · ${viewName()}`;
    changed();
  }
  App.setView = setView;
  $$("#view-tabs button").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  $("#btn-orbium").addEventListener("click", () => load(orbiumSpec()));
  $("#btn-patch").addEventListener("click", () => { S.seed = (S.seed + 1) >>> 0; load(patchSpec(+$("#patch-side").value)); });
  $("#btn-clear").addEventListener("click", () => load(emptySpec()));
  $("#btn-png").addEventListener("click", savePng);

  // brush
  const box = $("#canvas-box");
  $("#brush").addEventListener("change", (e) => { S.brush = e.target.value; box.classList.toggle("brush", S.brush !== "off"); });
  let painting = false;
  function paintAt(ev) {
    const rect = over.getBoundingClientRect(), N = sim.N;
    const vj = (ev.clientX - rect.left) / rect.width * N, vi = (ev.clientY - rect.top) / rect.height * N;
    const [sy, sx] = S.shift || [0, 0], r = Math.max(2, sim.rule.R / 3);
    for (let di = -Math.ceil(r); di <= Math.ceil(r); di++) for (let dj = -Math.ceil(r); dj <= Math.ceil(r); dj++) {
      const d2 = (di * di + dj * dj) / (r * r);
      if (d2 > 1) continue;
      const i = ((Math.floor(vi) + di - sy) % N + N) % N, j = ((Math.floor(vj) + dj - sx) % N + N) % N, k = i * N + j;
      sim.A[k] = S.brush === "erase" ? 0 : Math.min(1, Math.max(sim.A[k], 0.9 * (1 - d2) + 0.1 * Math.random()));
    }
    S.dirty = true;
  }
  over.addEventListener("pointerdown", (e) => { if (S.brush === "off") return; painting = true; over.setPointerCapture(e.pointerId); paintAt(e); });
  over.addEventListener("pointermove", (e) => { if (painting) paintAt(e); });
  const stopPaint = () => { if (painting) { painting = false; trackReset(); trackPush(); checkComponents(true); frameAnchor(); } };
  over.addEventListener("pointerup", stopPaint); over.addEventListener("pointercancel", stopPaint);

  // keyboard
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea" || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey || $("#library").open) return;
    if (e.key === " ") { if (tag === "button" || tag === "summary") return; e.preventDefault(); setRunning(!S.running); }
    else if (e.key === "ArrowRight") { setRunning(false); doStep(); S.dirty = true; }
    else if (e.key === "r" || e.key === "R") reset();
    else if (e.key === "f" || e.key === "F") { S.follow = !S.follow; $("#opt-follow").checked = S.follow; S.dirty = true; }
    else if (/^[1-6]$/.test(e.key)) { const v = ["A", "U", "G", "dA", "V", "K"][+e.key - 1]; setView(v); }
  });

  // theme
  $("#theme-toggle").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("lenia-theme", next); } catch (e) { /* storage may be unavailable */ }
    S.dirty = true; lastCharts = 0; emit("theme", next);
  });
  if (mqDark && mqDark.addEventListener) mqDark.addEventListener("change", () => { S.dirty = true; lastCharts = 0; emit("theme"); });

  // toast
  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  App.toast = toast;

  function savePng() {
    const N = sim.N, k = Math.max(1, Math.floor(1024 / N)), cv = document.createElement("canvas");
    cv.width = N * k; cv.height = N * k;
    const c2 = cv.getContext("2d"); c2.imageSmoothingEnabled = false; c2.drawImage(world, 0, 0, N * k, N * k);
    cv.toBlob((b) => {
      const a = document.createElement("a"), name = (App.current && App.current.label || "lenia").replace(/[^\w]+/g, "-").toLowerCase();
      a.href = URL.createObjectURL(b); a.download = `${name}-t${Math.round(sim.time)}-${S.view}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  App.scrollToSim = () => $("#simulator").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  App.run = (r = true) => setRunning(r);
  App.redraw = () => { S.dirty = true; lastCharts = 0; };
  App.doStep = doStep;
  /** Render and update every instrument now (without waiting for the next frame). */
  App.refresh = () => { render(); instText(); instCharts(); };
  App.frameAnchor = () => frameAnchor();

  // ================================================================== start
  function fitCanvasBox() {
    const box = $("#canvas-box");
    if (!box || !box.parentElement) return;
    const availW = box.parentElement.clientWidth;
    const availH = Math.max(180, window.innerHeight - 170);
    const size = Math.floor(Math.min(availW, availH));
    if (size > 0 && (box.offsetWidth !== size || box.offsetHeight !== size)) {
      box.style.width = size + "px";
      box.style.height = size + "px";
      S.dirty = true;
    }
  }

  fitCanvasBox();
  window.addEventListener("resize", () => { fitCanvasBox(); S.dirty = true; lastCharts = 0; });
  if (typeof ResizeObserver !== "undefined") {
    const stage = $(".sim-stage");
    if (stage) new ResizeObserver(() => fitCanvasBox()).observe(stage);
  }
  $('#view-tabs [data-view="V"]').disabled = true;
  load(orbiumSpec(), { quiet: true });
  setRunning(true);
  requestAnimationFrame((t) => { last = t; frame(t); });
})();

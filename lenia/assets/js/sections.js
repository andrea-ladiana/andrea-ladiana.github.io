/*
 * sections.js — what lies below the simulator: the scenarios, the library, the Kramers
 * lab, the phase map and the species table. Every number quoted here is
 * read from LENIA_DATA (built from the project's result files), not typed by hand.
 */
(function () {
  "use strict";
  const App = window.App, D = App.D, C = App.C, Charts = window.Charts, { fx, sci, trim } = App.fmt;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = App.escapeHtml;
  const K = D.kramers;
  const e4mu = (mu) => K.mus.find(m => Math.abs(m.mu - mu) < 1e-5);
  const e4ref = (mu) => D.orbium.e4_refs.find(s => Math.abs(s.rule.mu - mu) < 1e-5);
  const lockRow = (R) => D.lattice.lock.find(r => Math.abs(r.R - R) < 1e-6);
  const scanRow = (R) => D.lattice.scan.find(r => Math.abs(r.R - R) < 1e-6);
  const e0 = D.windows.E0.find(r => r.R === 13), e3 = D.lattice.e3.find(r => r.R === 13 && r.N === 128);
  const w13 = D.windows.E6["13"];
  const KIND = {
    moving_steady: "moving, steady", static_steady: "static, steady", moving_unsteady: "moving, unsteady",
    static_unsteady: "static, unsteady", several: "breaks up", texture: "becomes a texture", dead: "dies",
  };
  App.KIND = KIND;

  function setSpeed(v) { const s = $("#speed"); s.value = String(v); s.dispatchEvent(new Event("change")); }
  const e4Spec = (mu, row) => App.e4Spec(mu, row);

  // ================================================================== scenarios
  const scen = [];
  {
    const s16 = scanRow(16), l23 = lockRow(23), l228 = lockRow(22.8), m1 = e4mu(0.153865), m2 = e4mu(0.129865);
    const r1 = m1.rows[3], r2 = m2.rows[4];
    const gy = D.species.find(s => s.code === "OG2g");
    const mv = D.examples.movers[0];
    scen.push(
      { k: "The creature", slug: "orbium", title: "The protocol's Orbium",
        text: `R = 13, μ = 0.15, σ = 0.015 on a 128² torus, relaxed for 1000 steps. Its largest Lyapunov exponent is zero: a travelling shape with a free position neither forgets nor amplifies a perturbation.`,
        nums: `mass ${fx(e0.mass, 1)} · speed ${fx(e0.speed, 2)} cells per time unit · v/R = ${fx(e0.v_over_R, 4)} · λ = ${fx(e3.lam_mean, 4)}`,
        apply: () => App.load(Object.assign(App.orbiumSpec(), { temp: 0, h: 0, lyap: true, view: "A" })) },
      { k: "The window", cls: "lab", slug: "below-window", title: "Just below the window: it multiplies",
        text: `The same creature at μ = 0.123, below the lower edge of its window (${trim(w13.lo, 4)} < μ < ${trim(w13.hi, 4)}, E6). It buds, and the copies fill the torus within about 30 time units. So close to the edge the outcome also depends on where the creature sits on the grid: try μ = 0.124 or 0.122 with the field above.`,
        nums: "μ = 0.123 · deterministic",
        apply: () => { const s = App.orbiumSpec(); s.rule = Object.assign({}, s.rule, { mu: 0.123 }); App.load(Object.assign(s, { temp: 0, lyap: false, label: "Orbium at μ = 0.123", latin: false })); } },
      { k: "The window", cls: "lab", slug: "above-window", title: "Just above the window: it fades",
        text: "At μ = 0.163 the creature first swells, then dissolves in about three time units. The two doors of the window, proliferation below and extinction above, are the Orbium's; 30 of 50 moving species of the catalogue share them, while for the others an edge turns the creature into something else.",
        nums: "μ = 0.163 · deterministic",
        apply: () => { const s = App.orbiumSpec(); s.rule = Object.assign({}, s.rule, { mu: 0.163 }); App.load(Object.assign(s, { temp: 0, lyap: false, label: "Orbium at μ = 0.163", latin: false })); setSpeed(3); } },
      { k: "The bath", cls: "bath", slug: "bath", title: "A creature in the bath",
        text: `ϑ = 10⁻³, the temperature of the fluctuation–dissipation measurements: the largest of the ladder at which at least 95% of 64 Orbiums survive 2000 steps. The void stays exactly empty; the creature trembles and keeps its shape: in its own moving frame it stays correlated with itself.`,
        nums: "ϑ = 10⁻³ · kick 0.014 per step vs decay 0.1",
        apply: () => App.load(Object.assign(App.orbiumSpec(), { temp: K.temp_s, lyap: false, label: "Orbium in the bath", latin: false })) },
      { k: "The bath", cls: "bath", slug: "void", title: "The void comes alive",
        text: "At ϑ = 0.05 the kicks match the decay and each empty cell is a ball bouncing on a floor. This system obeys the fluctuation–dissipation theorem in the continuum; at T = 10 our estimator reads it 30% out of equilibrium (a₁ = 1.30 instead of 1), a discretisation effect that vanishes as T grows.",
        nums: "ϑ = 0.05 · empty 128² torus",
        apply: () => { const s = App.emptySpec(); s.rule = D.orbium.relaxed.rule; s.N = 128; App.load(Object.assign(s, { temp: 0.05, lyap: false })); } },
      { k: "Kramers", cls: "bath", slug: "kramers", title: "Escape over a barrier",
        text: `Near the upper edge (μ = ${trim(m1.mu, 4)}) at ϑ = ${sci(r1.temp, 3)}: 128 replicas on the cluster lived ${fx(r1.tau / 10, 1)} time units on average. Deaths are a Poisson process and ln τ is linear in 1/ϑ, as Kramers' law predicts. Watch the lifetime instrument, then run the Kramers lab below.`,
        nums: `⟨τ⟩ = ${fx(r1.tau, 0)} steps [${fx(r1.tau_lo, 0)}, ${fx(r1.tau_hi, 0)}] · ${r1.d} deaths of ${r1.n}`,
        apply: () => { App.load(e4Spec(m1.mu, 3)); App.setLyap(false); $("#k-point").value = `${m1.mu}|3`; } },
      { k: "Kramers", cls: "bath", slug: "false-death", title: "A death that is not one",
        text: `Near the lower edge (μ = ${trim(m2.mu, 4)}, ϑ = ${sci(r2.temp, 3)}) the criterion records deaths quickly, but almost all of them are a fragment breaking off: in a re-run, 23 of 23 recorded deaths were reversible and the creature lived on. The lifetime instrument tells the two apart after 30 time units.`,
        nums: `E4: ⟨τ⟩ = ${fx(r2.tau, 0)} steps · ${r2.d} deaths of ${r2.n}`,
        apply: () => { App.load(e4Spec(m2.mu, 4)); App.setLyap(false); $("#k-point").value = `${m2.mu}|4`; } },
      { k: "The grid", cls: "lab", slug: "weak-chaos", title: "Weak chaos from the grid",
        text: "The same creature at R = 16 is weakly chaotic. Its exponent jumps erratically from one resolution to the next and fades only slowly; where it is chaotic, the sub-cell positions it visits fill the square instead of drawing a curve.",
        nums: `λ = ${fx(s16.lam_mean, 3)} per time unit (E10, N = ${s16.N})`,
        apply: () => App.load(Object.assign(App.latticeSpec(16), { temp: 0, lyap: true })) },
      { k: "The grid", cls: "lab", slug: "locked", title: "Locked to the grid",
        text: `At R = 23 the creature advances exactly one row per step: δy = ${fx(l23.dy, 6)}. The advance stays locked on a whole interval of R (22.40–23.35), a devil's staircase, and the locked creature is regular.`,
        nums: `δy = ${fx(l23.dy, 7)}, δx = ${fx(l23.dx, 4)} · λ = ${fx(l23.lam_mean, 4)}`,
        apply: () => App.load(Object.assign(App.latticeSpec(23), { temp: 0, lyap: true })) },
      { k: "The grid", cls: "lab", slug: "pinned", title: "Pinned by the grid",
        text: "At R = 22.8 both advances seem locked and the exponent turns clearly negative: the motion is a periodic orbit of the grid that attracts every perturbation, a sideways shift included. The Goldstone neutrality of the continuum is lost.",
        nums: `λ = ${fx(l228.lam_mean, 4)} (E12) · δy = ${fx(l228.dy, 6)}, δx = ${fx(l228.dx, 4)}`,
        apply: () => App.load(Object.assign(App.latticeSpec(22.8), { temp: 0, lyap: true })) },
      { k: "Belts", slug: "belt", title: "A belt that needs the torus",
        text: "A band of rings that wraps around the torus and slides perpendicular to itself, from the upper part of the phase map (μ = 0.37, σ = 0.0475). On a three times longer torus, 22 of 22 closed belts still travelled after 700 time units.",
        nums: "100² torus · one component spanning x",
        apply: () => App.load(Object.assign(App.exampleByKey("belt"), { temp: 0, lyap: false })) },
      { k: "Belts", slug: "open-belt", title: "The same belt with free ends",
        text: "One period of the belt alone in a 300² torus. With nothing to close on, it unzips from both ends at about 8–9 cells per time unit and is gone in about 7 time units: 0 of 22 open pieces persisted. Played at 1×.",
        nums: "300² torus · mass 869 at t = 0",
        apply: () => { App.load(Object.assign(App.exampleByKey("belt-open"), { temp: 0, lyap: false })); setSpeed(1); } },
      { k: "The census", slug: "census", title: "An unclassified trajectory",
        text: "One of the trajectories that Hudcová's classification calls 'unclassified', re-run from the phase map's replica E1b: an elongated creature that our compact-mover descriptor missed by its thresholds. 432 of the 436 unclassified trajectories travel.",
        nums: `μ = ${trim(mv.rule.mu, 4)}, σ = ${trim(mv.rule.sigma, 4)} · speed ${fx(mv.speed, 2)} · mass ${fx(mv.mass, 0)}`,
        apply: () => App.load(Object.assign(App.exampleByKey("mover:0"), { temp: 0, lyap: false })) },
      { k: "Species", slug: "rotating", title: "A rotating creature",
        text: "Gyrorbium gyrans, from Chan's catalogue, travels along a circle. Rotating species carry the largest exponents of the catalogue; none of the 74 living localised species is contracting: a free position forbids λ < 0.",
        nums: `λ = ${fx(gy.lam_mean, 3)} per time unit (E9, four copies)`,
        apply: () => App.load(Object.assign(App.speciesSpec(gy), { temp: 0, lyap: true })) },
    );
  }
  const scBox = $("#scenarios");
  scBox.innerHTML = scen.map((s, i) => `
    <button class="scen ${s.cls || ""}" type="button" data-i="${i}">
      <span class="k">${esc(s.k)}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
      <span class="num-line">${esc(s.nums)}</span><span class="go">Load in the simulator ↑</span>
    </button>`).join("");
  scBox.addEventListener("click", (e) => {
    const b = e.target.closest(".scen"); if (!b) return;
    const sc = scen[+b.dataset.i];
    try {
      App.applying = true;
      try { sc.apply(); } finally { App.applying = false; }
      App.scenarioSlug = sc.slug; App.changed();
      App.run(true); App.scrollToSim();
    } catch (err) { App.toast(String(err.message || err)); }
  });

  // ================================================================== library
  const dlg = $("#library"), body = $("#lib-body");
  function libItems() {
    const groups = [];
    const extra = [
      { t: "Orbium unicaudatus", latin: true, m: "the protocol's Orbium · R = 13 · 128²", f: () => App.orbiumSpec() },
      ...D.lattice.states.map(s => ({ t: `Orbium at R = ${trim(s.rule.R, 2)}`, m: `N = ${s.N} · E10/E12 preparation`, f: () => App.latticeSpec(s.rule.R) })),
      { t: "Travelling belt", m: "μ 0.37 · σ 0.0475 · 100² (E7)", f: () => App.exampleByKey("belt") },
      { t: "Open belt", m: "the same, free ends, 300² (E7)", f: () => App.exampleByKey("belt-open") },
      ...D.examples.movers.map((m, i) => ({ t: `Unclassified mover ${i + 1}`, m: `μ ${trim(m.rule.mu, 4)} · σ ${trim(m.rule.sigma, 4)} · E1b`, f: () => App.exampleByKey(`mover:${i}`) })),
    ];
    groups.push({ h: "Protocol and census", items: extra });
    for (const k of Object.keys(KIND)) {
      const sp = D.species.filter(s => s.kind === k);
      if (!sp.length) continue;
      groups.push({ h: `${KIND[k]} (${sp.length})`, items: sp.map(s => ({
        t: s.name, latin: true, sp: s,
        m: `${s.code} · R ${trim(s.rule.R, 0)} · μ ${trim(s.rule.mu, 3)} · σ ${trim(s.rule.sigma, 4)}${s.lam_mean !== null && s.lam_mean !== undefined ? ` · λ ${fx(s.lam_mean, 3)}` : ""}`,
        f: () => App.speciesSpec(s) })) });
    }
    return groups;
  }
  const LIB = libItems();
  function renderLib(q) {
    q = (q || "").trim().toLowerCase();
    let k = 0;
    body.innerHTML = LIB.map((g, gi) => {
      const items = g.items.map((it, ii) => ({ it, ii })).filter(({ it }) => !q || (it.t + " " + it.m).toLowerCase().includes(q));
      if (!items.length) return "";
      k += items.length;
      return `<div class="lib-group"><h4>${esc(g.h)}</h4><div class="lib-list">${items.map(({ it, ii }) =>
        `<button type="button" class="lib-item" data-g="${gi}" data-i="${ii}"><div class="t${it.latin ? "" : " plain"}">${esc(it.t)}</div><div class="m">${esc(it.m)}</div></button>`).join("")}</div></div>`;
    }).join("") || `<p class="hint">Nothing matches “${esc(q)}”.</p>`;
  }
  $("#btn-library").addEventListener("click", () => { renderLib($("#lib-search").value); dlg.showModal(); $("#lib-search").focus(); });
  $("#lib-search").addEventListener("input", (e) => renderLib(e.target.value));
  body.addEventListener("click", (e) => {
    const b = e.target.closest(".lib-item"); if (!b) return;
    const it = LIB[+b.dataset.g].items[+b.dataset.i];
    try { App.load(it.f()); dlg.close(); App.run(true); } catch (err) { App.toast(String(err.message || err)); }
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  // ================================================================== Kramers lab
  const kp = $("#k-point");
  kp.innerHTML = `<option value="">— keep the simulator's μ and ϑ —</option>` + K.mus.map(m => m.rows.map((r, i) =>
    `<option value="${m.mu}|${i}">μ = ${trim(m.mu, 4)}, ϑ = ${sci(r.temp, 3)} · E4 ⟨τ⟩ = ${fx(r.tau, 0)} steps</option>`).join("")).join("");
  const K_DEFAULT = "0.153865|3";      // μ = 0.1539, ϑ = 4.17·10⁻³: ⟨τ⟩ ≈ 956 steps, a run of about a minute
  function kApplyPoint(value) {
    const [mu, row] = value.split("|");
    App.load(e4Spec(+mu, +row)); App.setLyap(false);
    const tau = e4mu(+mu).rows[+row].tau, opts = [500, 1000, 2000, 5000, 10000, 20000];
    $("#k-tmax").value = String(opts.find(o => o >= 4 * tau) || 20000);
    kUpdateRule();
  }
  kp.addEventListener("change", () => { if (kp.value) kApplyPoint(kp.value); });
  /** The menu shows the E4 point the simulator is on, or "keep" when it is on none. */
  function kSyncPoint() {
    const m = App.e4Point(), t = App.S.temp;
    let v = "";
    if (m && t > 0) { const i = m.rows.findIndex(r => Math.abs(r.temp / t - 1) < 1e-6); if (i >= 0) v = `${m.mu}|${i}`; }
    kp.value = v;
  }
  function kStartState() {
    const v = document.querySelector('input[name="k-start"]:checked').value, sim = App.sim, m = App.e4Point();
    if (v === "e4") {
      if (m) return { A0: C.unpackState(e4ref(m.mu)), relax: 0, what: `the E4 reference at μ = ${trim(m.mu, 6)}` };
      return { A0: Float64Array.from(sim.A), relax: 1000, what: "no E4 reference for this rule: the current creature, relaxed 1000 steps" };
    }
    if (v === "relax") return { A0: Float64Array.from(sim.A), relax: 1000, what: "the current creature, relaxed 1000 steps without noise" };
    return { A0: Float64Array.from(sim.A), relax: 0, what: "the current state as it is" };
  }
  function kUpdateRule() {
    const r = App.sim.rule, m = App.e4Point();
    kSyncPoint();
    $("#k-rule").innerHTML = `μ = ${trim(r.mu, 6)} · σ = ${trim(r.sigma, 4)} · R = ${trim(r.R, 2)} · T = ${r.T} · N = ${App.sim.N}<br>` +
      (App.S.temp > 0 ? `ϑ = ${sci(App.S.temp, 3)}${m ? " · an E4 point" : ""}`
                      : "ϑ = 0: Start will load an E4 point (the one chosen above, or μ = 0.1539, ϑ = 4.17·10⁻³)");
  }
  ["load", "rule", "temp"].forEach(ev => App.on(ev, kUpdateRule));
  kUpdateRule();

  const K_ST = { worker: null, run: null, fallbackTimer: 0, params: null, summary: null, thumbs: null, startedAt: 0, results: [] };
  function kStart() {
    // without a bath there is nothing to escape from: load an E4 point first, and say so here
    // (a toast would appear on the simulator, out of sight from this section)
    let notice = "";
    if (!(App.S.temp > 0)) {
      const v = kp.value || K_DEFAULT;
      kApplyPoint(v);
      kp.value = v;
      notice = `ϑ was 0, so the E4 point ${kp.options[kp.selectedIndex].textContent.split(" · ")[0]} was loaded in the simulator. `;
    }
    kStop(true);
    const st = kStartState(), sim = App.sim;
    // a fresh seed for every run (shown, so that a run can be repeated): with a fixed seed every
    // visitor's first run would be the same sample, lucky or not
    const labSeed = (Math.random() * 4294967296) >>> 0;
    const params = { N: sim.N, rule: Object.assign({}, sim.rule, { h: App.S.h }), temp: App.S.temp, n: +$("#k-n").value, tMax: +$("#k-tmax").value,
                     seed: labSeed, relaxSteps: st.relax, A0: st.A0, checkEvery: K.check_every };
    K_ST.params = params; K_ST.summary = null; K_ST.thumbs = null; K_ST.startedAt = Date.now(); K_ST.what = st.what;
    K_ST.e4 = App.e4Point(); K_ST.e4row = K_ST.e4 ? K_ST.e4.rows.find(r => Math.abs(r.temp / params.temp - 1) < 0.01) : null;
    $("#k-start").disabled = true; $("#k-stop").disabled = false;
    $("#k-status").textContent = `${notice}Starting from ${st.what}…`;
    K_ST.notice = notice;
    let w = null;
    try { w = new Worker("assets/js/lab-worker.js"); } catch (e) { w = null; }
    if (w) {
      K_ST.worker = w;
      w.onmessage = (e) => kMessage(e.data);
      w.onerror = (e) => { e.preventDefault(); w.terminate(); K_ST.worker = null; kFallback(params); };
      w.postMessage({ cmd: "start", params });
    } else kFallback(params);
  }
  function kFallback(params) {
    // pages opened from the disk cannot start workers: run on this thread, in slices
    try { K_ST.run = new window.KramersRun(params); } catch (err) { kMessage({ type: "error", message: String(err.message || err) }); return; }
    $("#k-status").textContent = `${K_ST.notice || ""}Running on the page's own thread (workers need the page to be served over http).`;
    const tick = () => {
      if (!K_ST.run) return;
      const done = K_ST.run.run(18);
      kMessage({ type: "progress", summary: K_ST.run.summary(), thumbs: done || Math.random() < 0.12 ? K_ST.run.thumbs() : null });
      if (done) { kMessage({ type: "done", summary: K_ST.run.summary() }); K_ST.run = null; return; }
      K_ST.fallbackTimer = setTimeout(tick, 16);
    };
    tick();
  }
  function kStop(silent) {
    if (K_ST.worker) { K_ST.worker.postMessage({ cmd: "stop" }); const w = K_ST.worker; setTimeout(() => w.terminate(), 300); K_ST.worker = null; }
    if (K_ST.run) { clearTimeout(K_ST.fallbackTimer); const s = K_ST.run.summary(); K_ST.run = null; if (!silent) kMessage({ type: "done", summary: s, stopped: true }); }
    $("#k-start").disabled = false; $("#k-stop").disabled = true;
  }
  function kMessage(m) {
    if (m.type === "error") { $("#k-status").textContent = "Could not start: " + m.message; kStop(true); return; }
    if (m.type === "started") { $("#k-status").textContent = `${K_ST.notice || ""}Running from ${K_ST.what}. Reference: mass ${fx(m.ref.mass, 1)}, R_g ${fx(m.ref.rg, 2)}; seed ${K_ST.params.seed}.`; return; }
    if (m.summary) K_ST.summary = m.summary;
    if (m.thumbs) K_ST.thumbs = m.thumbs;
    const s = K_ST.summary;
    if (!s) return;
    $("#k-progress").style.width = `${100 * s.t / s.tMax}%`;
    $("#k-alive").textContent = `${s.alive.length} of ${s.n} alive at t = ${fx(s.t / K_ST.params.rule.T, 0)} (${s.t} steps)`;
    drawThumbs(); drawSurvival();
    if (m.type === "done") {
      if (!m.stopped) $("#k-progress").style.width = "100%";
      $("#k-start").disabled = false; $("#k-stop").disabled = true;
      K_ST.worker && K_ST.worker.terminate(); K_ST.worker = null;
      const secs = (Date.now() - K_ST.startedAt) / 1000;
      $("#k-status").textContent = `${K_ST.notice || ""}${m.stopped || (m.summary && m.summary.t < m.summary.tMax && m.summary.alive.length) ? "Stopped" : "Done"} in ${fx(secs, 0)} s.`;
      const fit = kFit();
      if (fit && Number.isFinite(fit.tau) && fit.d >= 3) {
        K_ST.results.push({ mu: K_ST.params.rule.mu, temp: K_ST.params.temp, tau: fit.tau / K_ST.params.rule.T, lo: fit.tau_lo / K_ST.params.rule.T, hi: fit.tau_hi / K_ST.params.rule.T, e4: !!K_ST.e4 });
        drawArrhenius();
      }
    }
  }
  $("#k-start").addEventListener("click", kStart);
  $("#k-stop").addEventListener("click", () => kStop(false));

  function kFit() {
    const s = K_ST.summary; if (!s) return null;
    const cen = s.steps.map((t, k) => s.cause[k] === 0);
    return C.exponentialMLE(s.steps, cen, K.transient_steps);
  }
  const thumbCanvas = $("#k-thumbs"), tile = document.createElement("canvas");
  function drawThumbs() {
    const { ctx, w, h } = Charts.setup(thumbCanvas), s = K_ST.summary, th = K_ST.thumbs, p = K_ST.params;
    if (!s || !p) {
      ctx.fillStyle = Charts.cssVar("--muted", "#888"); ctx.font = `13px ${Charts.cssVar("--font-ui", "sans-serif")}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Each replica will appear here; it dims when it dies.", w / 2, h / 2);
      return;
    }
    const n = s.n, cols = Math.ceil(Math.sqrt(n)), gap = 3, size = (w - gap * (cols - 1)) / cols, N = p.N;
    const lut = App.isDark() ? App.LUT.dark.field : App.LUT.light.field;
    // each tile is a window of 4R cells centred on its replica's circular centroid
    const Wc = Math.min(N, Math.max(24, Math.round(4 * p.rule.R)));
    tile.width = Wc; tile.height = Wc;
    const tctx = tile.getContext("2d"), img = tctx.createImageData(Wc, Wc);
    const cosN = new Float64Array(N), sinN = new Float64Array(N);
    for (let i = 0; i < N; i++) { cosN[i] = Math.cos(2 * Math.PI * i / N); sinN[i] = Math.sin(2 * Math.PI * i / N); }
    const py = new Float64Array(N), px = new Float64Array(N);
    const alive = new Set(s.alive);
    ctx.font = `11px ${Charts.cssVar("--font-ui", "sans-serif")}`;
    for (let k = 0; k < n; k++) {
      const x = (k % cols) * (size + gap), y = Math.floor(k / cols) * (size + gap);
      if (th) {
        const o = k * N * N, d = img.data;
        py.fill(0); px.fill(0);
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const v = th[o + i * N + j]; py[i] += v; px[j] += v; }
        const c = C.profileCentroid(py, px, cosN, sinN);
        const y0 = Math.round(c.cy) - (Wc >> 1), x0 = Math.round(c.cx) - (Wc >> 1);
        for (let i = 0; i < Wc; i++) {
          const si = ((y0 + i) % N + N) % N;
          for (let j = 0; j < Wc; j++) {
            const sj = ((x0 + j) % N + N) % N, cc = th[o + si * N + sj] * 3, q = (i * Wc + j) * 4;
            d[q] = lut[cc]; d[q + 1] = lut[cc + 1]; d[q + 2] = lut[cc + 2]; d[q + 3] = 255;
          }
        }
        tctx.putImageData(img, 0, 0);
        ctx.globalAlpha = alive.has(k) ? 1 : 0.35;
        ctx.imageSmoothingEnabled = false; ctx.drawImage(tile, x, y, size, size);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = Charts.cssVar(alive.has(k) ? "--line" : "--lab", "#ccc"); ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      if (!alive.has(k) && s.cause[k]) {
        ctx.fillStyle = Charts.cssVar("--lab-ink", "#b9461a"); ctx.textAlign = "left"; ctx.textBaseline = "top";
        if (size > 46) ctx.fillText(`${C.CAUSES[s.cause[k]]} ${fx(s.steps[k] / p.rule.T, 0)}`, x + 4, y + 3);
      }
    }
  }
  function drawSurvival() {
    const s = K_ST.summary, p = K_ST.params;
    if (!s || !p) {
      Charts.plot($("#k-surv"), { x: [0, 200], y: [0.01, 1.05], ylog: true, series: [], xlabel: "time (units)", ylabel: "survival S(t)",
                                  yticks: [0.01, 0.1, 1], yfmt: (v) => String(v), empty: "Choose an E4 point or set ϑ > 0, then Start" });
      return;
    }
    const T = p.rule.T, cen = s.steps.map((t, k) => s.cause[k] === 0 || s.steps[k] > s.t);
    const times = s.steps.map((t, k) => s.cause[k] === 0 ? Math.min(t, s.t) : t);
    const km = C.kaplanMeier(times, cen);
    const xs = km.map(q => q[0] / T), ys = km.map(q => q[1]);
    xs.push(s.t / T); ys.push(ys[ys.length - 1]);
    const fit = C.exponentialMLE(times, cen, K.transient_steps), t0 = K.transient_steps / T;
    const series = [{ x: xs, y: ys, color: "--creature", step: true, width: 1.8 }];
    const ymin = Math.max(1 / (2 * s.n), Math.min(...ys.filter(v => v > 0), 1) * 0.6);
    if (fit && Number.isFinite(fit.tau) && fit.d > 0) {
      const tauT = fit.tau / T, S0 = survAt(km, K.transient_steps);
      series.push({ x: [t0, s.t / T], y: [S0, S0 * Math.exp(-(s.t / T - t0) / tauT)], color: "--creature", dash: [5, 4], width: 1.2 });
    }
    if (K_ST.e4row) {
      const tauE = K_ST.e4row.tau / T, S0 = survAt(km, K.transient_steps);
      series.push({ x: [t0, s.t / T], y: [S0, S0 * Math.exp(-(s.t / T - t0) / tauE)], color: "--ink-2", dash: [2, 3], width: 1.2 });
    }
    Charts.plot($("#k-surv"), { x: [0, Math.max(1, s.tMax / T)], y: [ymin, 1.05], ylog: true, series, xlabel: "time (units)", ylabel: "survival S(t)",
                                yticks: [0.01, 0.03, 0.1, 0.3, 1].filter(v => v >= ymin), yfmt: (v) => String(v) });
    // the result line
    let txt = "";
    if (fit && fit.d > 0) {
      txt = `${fit.d} deaths of ${s.n} after the first ${K.transient_steps} steps (${fit.early} earlier). ⟨τ⟩ = <b>${fx(fit.tau, 0)}</b> steps [${fx(fit.tau_lo, 0)}, ${Number.isFinite(fit.tau_hi) ? fx(fit.tau_hi, 0) : "∞"}] = ${fx(fit.tau / T, 1)} time units (95%, Poisson; dashed: the exponential fit).`;
    } else txt = `No death yet after the first ${K.transient_steps} steps.`;
    if (K_ST.e4row) txt += ` <br>E4 at this point: ${fx(K_ST.e4row.tau, 0)} [${fx(K_ST.e4row.tau_lo, 0)}, ${fx(K_ST.e4row.tau_hi, 0)}] steps with ${K_ST.e4row.n} replicas (dotted).`;
    else if (K_ST.e4) txt += ` <br>E4 Arrhenius fit at this μ: ${fx(Math.exp(K_ST.e4.ln_tau0 + K_ST.e4.dPhi / p.temp), 1)} time units.`;
    const causes = {}; s.cause.forEach(c => { if (c) causes[C.CAUSES[c]] = (causes[C.CAUSES[c]] || 0) + 1; });
    if (Object.keys(causes).length) txt += ` <span class="hint">Causes: ${Object.entries(causes).map(([k, v]) => `${k} ${v}`).join(", ")}.</span>`;
    $("#k-result").innerHTML = txt;
  }
  function survAt(km, t) { let S = 1; for (const [tt, v] of km) { if (tt <= t) S = v; else break; } return S; }

  function mixHex(a, b, t) {
    const pa = parseCol(a), pb = parseCol(b);
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
  }
  function parseCol(c) {
    c = c.trim();
    if (c.startsWith("#")) { const h = c.length === 4 ? c.slice(1).split("").map(x => x + x).join("") : c.slice(1); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
    const m = c.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }
  function drawArrhenius() {
    const cre = Charts.cssVar("--creature", "#4a3aa7"), surf = Charts.cssVar("--surface", "#fff");
    const series = [], points = [];
    const mus = K.mus.slice().sort((a, b) => a.mu - b.mu);
    let xmin = Infinity, xmax = -Infinity;
    mus.forEach((m, i) => {
      const col = mixHex(cre, surf, 0.62 - 0.62 * i / (mus.length - 1));
      const xs = m.rows.map(r => 1 / r.temp);
      xmin = Math.min(xmin, ...xs); xmax = Math.max(xmax, ...xs);
      const a = Math.min(...xs), b = Math.max(...xs);
      series.push({ x: [a, b], y: [Math.exp(m.ln_tau0 + m.dPhi * a), Math.exp(m.ln_tau0 + m.dPhi * b)], color: col, width: 1.4 });
      m.rows.forEach(r => points.push({ x: 1 / r.temp, y: r.tau / 10, ylo: r.tau_lo / 10, yhi: r.tau_hi / 10, color: col, r: 2.8 }));
    });
    for (const q of K_ST.results) { points.push({ x: 1 / q.temp, y: q.tau, ylo: q.lo, yhi: q.hi, color: "--lab", r: 4, hollow: true }); xmin = Math.min(xmin, 1 / q.temp); xmax = Math.max(xmax, 1 / q.temp); }
    Charts.plot($("#k-arr"), { x: [xmin * 0.9, xmax * 1.05], ylog: true, series, points, xlabel: "1 / ϑ", ylabel: "⟨τ⟩ (time units)", yfmt: (v) => String(v) });
    const lg = mus.map((m, i) => `<span style="color:${mixHex(cre, surf, 0.62 - 0.62 * i / (mus.length - 1))}">●</span> ${trim(m.mu, 4)}`).join("  ");
    const cap = $("#k-arr").previousElementSibling.querySelector(".hint");
    cap.innerHTML = `E4, lines: fits ln τ = ln τ₀ + ΔΦ/ϑ · μ: ${lg}${K_ST.results.length ? ` · <span style="color:${Charts.cssVar("--lab", "#eb6834")}">○</span> this page` : ""}`;
  }

  // ================================================================== phase map
  const P = D.phase, nmu = P.mu.length, nsg = P.sigma.length;
  const map = $("#phase-map"), tip = $("#map-tip");
  const CLS = {
    a: { name: "a · all stable", text: "every trajectory reaches a cycle, usually the empty world" },
    b: { name: "b · all metastable", text: "no cycle; the centre of mass settles: textures" },
    c: { name: "c · transition", text: "from stable to metastable as the patch grows" },
    d: { name: "d · unclassified appear", text: "some centres of mass keep wandering: things that travel" },
  };
  function clsColour(k) {
    const dark = App.isDark();
    return { a: dark ? "#25242c" : "#efede7", b: dark ? "#8c8a84" : "#6f6c63", c: dark ? "#45434c" : "#c9c6bc", d: Charts.cssVar("--creature", "#4a3aa7") }[k];
  }
  const counts = { a: 0, b: 0, c: 0, d: 0 };
  for (const ch of P.cls) counts[ch]++;
  const nMov = P.f_moving.filter(v => v > 0).length;
  function legend() {
    $("#map-legend").innerHTML = Object.keys(CLS).map(k => `<li><i style="background:${clsColour(k)}"></i><span><b>${CLS[k].name}</b> (${counts[k]} rules): ${CLS[k].text}</span></li>`).join("") +
      `<li><i style="background:transparent;border:0;display:grid;place-items:center"><svg width="10" height="10"><circle cx="5" cy="5" r="3.2" fill="${Charts.cssVar("--lab", "#eb6834")}"/></svg></i><span><b>compact moving creature</b> found by our descriptor (${nMov} rules)</span></li>`;
  }
  let geom = null;
  function drawMap() {
    const { ctx, w, h } = Charts.setup(map);
    const padL = 44, padB = 34, padT = 8, padR = 8, pw = w - padL - padR, ph = h - padT - padB;
    const cw = pw / nmu, ch = ph / nsg;
    geom = { padL, padT, pw, ph, cw, ch };
    for (let i = 0; i < nmu; i++) for (let j = 0; j < nsg; j++) {
      const k = P.cls[i * nsg + j];
      ctx.fillStyle = clsColour(k);
      ctx.fillRect(padL + i * cw, padT + (nsg - 1 - j) * ch, Math.ceil(cw), Math.ceil(ch));
    }
    ctx.fillStyle = Charts.cssVar("--lab", "#eb6834");
    for (let i = 0; i < nmu; i++) for (let j = 0; j < nsg; j++) if (P.f_moving[i * nsg + j] > 0) {
      ctx.beginPath(); ctx.arc(padL + (i + 0.5) * cw, padT + (nsg - 0.5 - j) * ch, Math.max(1.6, Math.min(cw, ch) * 0.22), 0, 2 * Math.PI); ctx.fill();
    }
    // axes
    ctx.strokeStyle = Charts.cssVar("--axis", "#ccc"); ctx.strokeRect(padL + 0.5, padT + 0.5, pw, ph);
    ctx.fillStyle = Charts.cssVar("--ink-2", "#555"); ctx.font = `11px ${Charts.cssVar("--font-ui", "sans-serif")}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const v of [0.1, 0.2, 0.3, 0.4, 0.5]) { const i = (v - P.mu[0]) / (P.mu[1] - P.mu[0]); ctx.fillText(String(v), padL + (i + 0.5) * cw, padT + ph + 5); }
    ctx.fillText("μ", padL + pw / 2, padT + ph + 19);
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const v of [0.0025, 0.025, 0.05, 0.075, 0.1]) { const j = (v - P.sigma[0]) / (P.sigma[1] - P.sigma[0]); ctx.fillText(String(v), padL - 5, padT + (nsg - 0.5 - j) * ch); }
    ctx.save(); ctx.translate(10, padT + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("σ", 0, 0); ctx.restore();
    // the simulator's rule, when it is on this plane
    const r = App.sim.rule;
    if (Math.abs(r.R - 13) < 1e-9 && r.T === 10 && r.core === "exponential" && r.growth === "gaussian" && r.peaks.length === 1 && r.peaks[0] === 1) {
      const x = padL + ((r.mu - P.mu[0]) / (P.mu[1] - P.mu[0]) + 0.5) * cw, y = padT + (nsg - 0.5 - (r.sigma - P.sigma[0]) / (P.sigma[1] - P.sigma[0])) * ch;
      if (x >= padL && x <= padL + pw && y >= padT && y <= padT + ph) {
        ctx.strokeStyle = Charts.cssVar("--ink", "#000"); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, Math.max(5, cw * 0.7), 0, 2 * Math.PI); ctx.stroke();
      }
    }
  }
  function cellAt(e) {
    if (!geom) return null;
    const rect = map.getBoundingClientRect(), x = e.clientX - rect.left - geom.padL, y = e.clientY - rect.top - geom.padT;
    const i = Math.floor(x / geom.cw), jj = Math.floor(y / geom.ch);
    if (i < 0 || i >= nmu || jj < 0 || jj >= nsg) return null;
    return { i, j: nsg - 1 - jj, x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  map.addEventListener("mousemove", (e) => {
    const c = cellAt(e);
    if (!c) { tip.classList.remove("show"); return; }
    const k = c.i * nsg + c.j, [st, me, un] = P.counts[k], cl = P.cls[k];
    tip.innerHTML = `μ = ${trim(P.mu[c.i], 3)}, σ = ${trim(P.sigma[c.j], 4)} · class <b>${cl}</b><br>stable ${st}, metastable ${me}, unclassified ${un} of ${P.per_cell}${P.f_moving[k] > 0 ? ` · moving creatures ${fx(P.f_moving[k] * 100, 1)}%` : ""}`;
    const W = map.clientWidth;
    tip.style.left = Math.min(W - 230, c.x + 14) + "px"; tip.style.top = (c.y + 14) + "px";
    tip.classList.add("show");
  });
  map.addEventListener("mouseleave", () => tip.classList.remove("show"));
  map.addEventListener("click", (e) => {
    const c = cellAt(e); if (!c) return;
    const rule = { mu: P.mu[c.i], sigma: P.sigma[c.j], R: 13, T: 10, peaks: [1], core: "exponential", growth: "gaussian" };
    App.S.seed = (App.S.seed + 1) >>> 0;
    const spec = App.patchSpec(+$("#map-side").value, C.normRule(rule), P.protocol.N);
    spec.label = `Patch at μ = ${trim(rule.mu, 3)}, σ = ${trim(rule.sigma, 4)}`;
    spec.meta = `phase map class ${P.cls[c.i * nsg + c.j]} · side ${$("#map-side").value} · 100² as in E1`;
    App.load(Object.assign(spec, { temp: 0, lyap: false }));
    App.run(true); App.scrollToSim();
  });
  App.on("rule", drawMap); App.on("load", drawMap); App.on("theme", () => { legend(); drawMap(); drawArrhenius(); drawThumbs(); });

  // ================================================================== species table
  const tbody = $("#sp-table tbody");
  const SP = { kind: null, q: "", sort: null, dir: 1 };
  const kindCounts = {}; D.species.forEach(s => { kindCounts[s.kind] = (kindCounts[s.kind] || 0) + 1; });
  $("#sp-chips").innerHTML = `<button class="chip" type="button" data-k="" aria-pressed="true">all<span class="n">${D.species.length}</span></button>` +
    Object.keys(KIND).filter(k => kindCounts[k]).map(k => `<button class="chip" type="button" data-k="${k}" aria-pressed="false">${KIND[k]}<span class="n">${kindCounts[k]}</span></button>`).join("");
  $("#sp-chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    SP.kind = b.dataset.k || null;
    $("#sp-chips").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c === b)));
    renderSpecies();
  });
  $("#sp-search").addEventListener("input", (e) => { SP.q = e.target.value.trim().toLowerCase(); renderSpecies(); });
  document.querySelectorAll("#sp-table th").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.k; SP.dir = SP.sort === k ? -SP.dir : 1; SP.sort = k; renderSpecies();
  }));
  const kindOrder = Object.keys(KIND);
  function sortKey(s, k) {
    switch (k) {
      case "name": return s.name; case "R": return s.rule.R; case "b": return s.rule.peaks.length; case "mu": return s.rule.mu;
      case "sigma": return s.rule.sigma; case "kind": return kindOrder.indexOf(s.kind);
      case "lam": return s.lam_mean ?? (s.died_in_lyap ? -9 : 9); case "win": return s.lower ? s.upper.edge - s.lower.edge : -1;
      default: return 0;
    }
  }
  function renderSpecies() {
    let rows = D.species.map((s, i) => ({ s, i }));
    if (SP.kind) rows = rows.filter(({ s }) => s.kind === SP.kind);
    if (SP.q) rows = rows.filter(({ s }) => (s.name + " " + s.code).toLowerCase().includes(SP.q));
    if (SP.sort) rows.sort((a, b) => { const x = sortKey(a.s, SP.sort), y = sortKey(b.s, SP.sort); return (x < y ? -1 : x > y ? 1 : 0) * SP.dir; });
    tbody.innerHTML = rows.map(({ s, i }) => {
      const lam = s.lam_mean !== null && s.lam_mean !== undefined ? fx(s.lam_mean, 3) : s.died_in_lyap ? "died" : "—";
      const win = s.lower && s.upper ? `<span class="win">${trim(s.lower.edge, 4)} – ${trim(s.upper.edge, 4)}</span><br><span class="fate ${s.lower.fate}">${s.lower.fate}</span> <span class="fate">/</span> <span class="fate ${s.upper.fate}">${s.upper.fate}</span>` : "—";
      return `<tr data-i="${i}"><td><span class="sp-name">${esc(s.name)}</span><span class="sp-code">${esc(s.code)}</span></td>
        <td class="n">${trim(s.rule.R, 0)}</td><td>${esc(s.b)}</td><td class="n">${trim(s.rule.mu, 4)}</td><td class="n">${trim(s.rule.sigma, 4)}</td>
        <td><span class="kind ${s.kind}">${KIND[s.kind] || s.kind}</span></td><td class="n">${lam}</td><td>${win}</td></tr>`;
    }).join("");
  }
  tbody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    try { App.load(App.speciesSpec(D.species[+tr.dataset.i])); App.run(true); App.scrollToSim(); } catch (err) { App.toast(String(err.message || err)); }
  });

  // ================================================================== first draw
  legend(); drawMap(); renderSpecies(); drawArrhenius(); drawThumbs(); drawSurvival();
  if (App.applyQuery((slug) => scen.find(x => x.slug === slug)) && !location.hash) {
    // after layout, and without the page's smooth scrolling (it would be lost on load)
    setTimeout(() => document.getElementById("simulator").scrollIntoView({ block: "start", behavior: "instant" }), 0);
  }
  window.addEventListener("resize", () => { drawMap(); drawArrhenius(); drawThumbs(); drawSurvival(); });
})();

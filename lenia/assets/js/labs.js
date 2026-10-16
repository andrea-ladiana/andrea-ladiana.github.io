/*
 * labs.js — the labs below the simulator (fluctuation–dissipation E2, rheology E5, window
 * edges E6) and the measured maps of the grid (E10, E12). The Kramers lab is in
 * sections.js. Every experiment runs in lab-worker.js (or, opened from the disk, on this
 * thread in slices) and is shown next to what the cluster measured.
 */
(function () {
  "use strict";
  const App = window.App, D = App.D, C = App.C, X = window.Experiments, Charts = window.Charts, { fx, sci, trim } = App.fmt;
  const $ = (s, r = document) => r.querySelector(s);
  const L = D.labs, PROTO = X.PROTO;

  // ================================================================== a job runner
  /** Run a job of lab-worker.js; fall back to this thread when workers are not available. */
  function runJob(kind, params, on) {
    let w = null, stopped = false, timer = 0, local = null;
    try { w = new Worker("assets/js/lab-worker.js"); } catch (e) { w = null; }
    const finish = (m) => { on(m); if (m.type === "done" || m.type === "error") { if (w) w.terminate(); w = null; } };
    const fallback = () => {
      try {
        if (kind === "fd") local = new X.FDRun(params);
        else if (kind === "rheo") local = new X.RheoRun(params);
        else if (kind === "edges") { if (!params.base) params.base = X.prepareOrbium(params.N, params.R, params.cells); local = new X.EdgeRun(params); }
        else if (kind === "prepare") { const A = X.prepareOrbium(params.N, params.R, params.cells); finish({ type: "done", summary: { done: true, A } }); return; }
      } catch (err) { finish({ type: "error", message: String(err.message || err) }); return; }
      on({ type: "started", local: true });
      const tick = () => {
        if (stopped) return;
        const done = local.run(20);
        on({ type: "progress", summary: local.summary() });
        if (done) { finish({ type: "done", summary: local.summary() }); return; }
        timer = setTimeout(tick, 12);
      };
      tick();
    };
    if (w) {
      w.onmessage = (e) => finish(e.data);
      w.onerror = (e) => { e.preventDefault(); if (w) w.terminate(); w = null; fallback(); };
      w.postMessage({ cmd: "start", job: kind, params });
    } else fallback();
    return {
      stop() {
        stopped = true; clearTimeout(timer);
        if (w) { w.postMessage({ cmd: "stop" }); const ww = w; setTimeout(() => ww.terminate(), 300); w = null; }
        if (local) on({ type: "done", summary: local.summary(), stopped: true });
      },
    };
  }
  const human = (s) => s < 90 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`;
  // seconds per cell and per field step, measured on a laptop; small tori pay the FFT overhead
  const cost = (N) => 5.5e-8 * (1 + 32 / N);

  // ================================================================== tabs
  const tabs = [...document.querySelectorAll("#lab-tabs button")];
  function showTab(id) {
    tabs.forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    document.querySelectorAll(".lab-panel").forEach(p => { p.hidden = p.id !== id; });
    App.emit("labtab", id);
  }
  tabs.forEach(b => b.addEventListener("click", () => { showTab(b.dataset.tab); history.replaceState(null, "", location.pathname + location.search + "#" + b.dataset.tab); }));
  function fromHash() {
    const h = location.hash.slice(1);
    if (tabs.some(b => b.dataset.tab === h)) { showTab(h); document.getElementById("labs").scrollIntoView({ block: "start", behavior: "instant" }); }
  }
  window.addEventListener("hashchange", fromHash);
  setTimeout(fromHash, 0);
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener("click", () => setTimeout(fromHash, 0)));

  // ================================================================== E2: fluctuation–dissipation
  const E2 = L.E2;
  const FD_PRESETS = {
    "void-T10":  { ic: "empty", T: 10, N: E2.control_T.N, B: E2.control_T.n_samples, temp: E2.control_temp, part: "controlT", label: "The void at ϑ = 0.05, T = 10 · E2 control at T (32², 64 samples)" },
    "void-T40":  { ic: "empty", T: 40, N: E2.control_T.N, B: E2.control_T.n_samples, temp: E2.control_temp, part: "controlT", label: "The void at ϑ = 0.05, T = 40 · same protocol" },
    "void-T160": { ic: "empty", T: 160, N: E2.control_T.N, B: E2.control_T.n_samples, temp: E2.control_temp, part: "controlT", label: "The void at ϑ = 0.05, T = 160 · same protocol" },
    "void-128":  { ic: "empty", T: 10, N: E2.N, B: E2.n_samples, temp: E2.control_temp, part: "control", label: "The void at ϑ = 0.05, T = 10 · E2 control (128², 32 samples)" },
    "soliton":   { ic: "soliton", T: 10, N: E2.N, B: E2.n_samples, temp: D.kramers.temp_s, part: "cut", label: "The Orbium in the bath · E2 cut (128², ϑ = 10⁻³)" },
    "patch":     { ic: "patch", T: 10, N: E2.N, B: E2.n_samples, temp: D.kramers.temp_s, part: "cut", label: "A noise patch, side 50 · E2 cut (128², ϑ = 10⁻³)" },
  };
  const fdSel = { proto: $("#fd-proto"), mu: $("#fd-mu"), tstar: $("#fd-tstar"), h: $("#fd-h"), B: $("#fd-B") };
  fdSel.proto.innerHTML = Object.entries(FD_PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  fdSel.mu.innerHTML = [0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.20].map(m => `<option value="${m}"${m === 0.15 ? " selected" : ""}>${m.toFixed(2)}</option>`).join("");
  const FD = { job: null, results: [], last: null };
  function fdParams() {
    const p = FD_PRESETS[fdSel.proto.value], empty = p.ic === "empty";
    const tStar = empty ? (p.part === "control" ? E2.anchors[0] : Math.round(E2.control_T.t_star_time * p.T)) : +fdSel.tstar.value;
    const mu = empty ? 0.15 : +fdSel.mu.value;
    return { preset: fdSel.proto.value, ic: p.ic, part: p.part, N: p.N, B: +fdSel.B.value, T: p.T, temp: p.temp, h: +fdSel.h.value, tStar, mu,
             burn: Math.round(50 * p.T), patchSide: E2.patch_side, rule: Object.assign({}, PROTO, { mu, T: p.T }) };
  }
  function fdReference(q) {
    return L.fd.find(r => r.part === q.part && r.ic === q.ic && Math.abs(r.mu - q.mu) < 1e-9 && r.t_star === q.tStar &&
                          Math.abs(r.h - q.h) < 1e-12 && r.T === q.T && r.N === q.N) || null;
  }
  function fdSync() {
    const p = FD_PRESETS[fdSel.proto.value], empty = p.ic === "empty";
    fdSel.mu.disabled = empty; fdSel.tstar.disabled = empty;
    if (!fdSel.B.dataset.touched) fdSel.B.value = String(p.B);
    const q = fdParams(), tws = X.backwardGrid(q.tStar);
    const steps = q.B * (tws.reduce((s, t) => s + 3 * (q.tStar - t), 0) + q.tStar + (q.ic === "empty" ? q.burn : q.ic === "soliton" ? 200 : 0));
    const ref = fdReference(q);
    $("#fd-rule").innerHTML = `${q.N}² · ${q.B} samples · T = ${q.T} · ϑ = ${sci(q.temp)} · h = ${q.h} · t* = ${q.tStar} steps (${fx(q.tStar / q.T, 0)} time units) · ${tws.length} waiting times` +
      `<br>about ${human(steps * q.N * q.N * cost(q.N))} here${ref ? ` · E2 used ${ref.B} samples` : ""}`;
  }
  Object.values(fdSel).forEach(s => s.addEventListener("change", (e) => { if (e.target === fdSel.B) fdSel.B.dataset.touched = "1"; if (e.target === fdSel.proto) delete fdSel.B.dataset.touched; fdSync(); fdDraw(); }));
  fdSync();

  $("#fd-start").addEventListener("click", () => {
    if (FD.job) FD.job.stop();
    const q = fdParams(), seed = (Math.random() * 4294967296) >>> 0;
    const params = { N: q.N, rule: q.rule, temp: q.temp, h: q.h, tStar: q.tStar, B: q.B, seed, ic: q.ic, burn: q.burn, patchSide: q.patchSide,
                     base: q.ic === "soliton" ? C.unpackState(D.orbium.relaxed) : null };
    const t0 = Date.now();
    FD.q = q; FD.last = null;
    $("#fd-start").disabled = true; $("#fd-stop").disabled = false;
    $("#fd-status").textContent = `Running, seed ${seed}…`;
    FD.job = runJob("fd", params, (m) => {
      if (m.type === "error") { $("#fd-status").textContent = "Could not run: " + m.message; fdEnd(); return; }
      if (m.summary) {
        $("#fd-progress").style.width = `${100 * m.summary.progress}%`;
        if (m.type === "progress") $("#fd-status").textContent = `Sample ${Math.min(m.summary.b + 1, q.B)} of ${q.B} · ${fx((Date.now() - t0) / 1000, 0)} s · seed ${seed}`;
      }
      if (m.type === "done") {
        fdEnd();
        if (m.stopped || !m.summary.raw) { $("#fd-status").textContent = "Stopped."; return; }
        const raw = m.summary.raw, alive = X.fdAlive(raw, q.ic), b = X.bootstrapLabels(raw, alive, 200, seed);
        FD.last = { q, b, secs: (Date.now() - t0) / 1000, seed };
        if (q.ic === "empty" && Number.isFinite(b.full.lab.a1)) FD.results.push({ T: q.T, a1: b.full.lab.a1, N: q.N });
        $("#fd-status").textContent = `Done in ${human(FD.last.secs)} · seed ${seed}.`;
        $("#fd-progress").style.width = "100%";
        fdDraw();
      }
    });
  });
  $("#fd-stop").addEventListener("click", () => { if (FD.job) FD.job.stop(); });
  function fdEnd() { FD.job = null; $("#fd-start").disabled = false; $("#fd-stop").disabled = true; }

  const LABEL_TEXT = {
    ergodic: "ergodic: the correlation does not stop on a plateau",
    frozen: "frozen: the plateau is not left",
    ageing: "ageing: the plateau is left",
    soliton: "soliton: in the laboratory the correlation is lost, in the co-moving frame it is kept",
    indeterminate: "indeterminate: no plateau within the window",
    dead: "dead: no component at the end",
  };
  function fdDraw() {
    const q = FD.last ? FD.last.q : fdParams(), ref = fdReference(q), mine = FD.last ? FD.last.b.full : null;
    const T = q.T;
    // (a) the FD plot, as figures/E2_fdt (a): ϑχ̂ against 1 − Ĉ, log–log, with the FDT line
    const pts = (c, color, hollow) => c.tau.map((t, i) => ({ x: 1 - c.C[i], y: c.Tchi[i], color, hollow, r: hollow ? 3.2 : 2.8 }))
      .filter(p => p.x > 0 && p.y > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
    const points = [...(ref ? pts(ref.curve, "--muted", true) : []), ...(mine ? pts(mine.curve, q.ic === "empty" ? "--bath" : "--creature", false) : [])];
    const ys = points.map(p => p.y), xs = points.map(p => p.x);
    const y0 = ys.length ? Math.pow(10, Math.floor(Math.log10(Math.min(...ys)))) : 1e-4, y1 = ys.length ? Math.max(2, Math.max(...ys) * 1.5) : 2;
    const x0 = xs.length ? Math.pow(10, Math.floor(Math.log10(Math.min(...xs)))) : 1e-3;
    Charts.plot($("#fd-plot"), { x: [Math.min(x0, 1e-2), 2], y: [y0, y1], xlog: true, ylog: true,
      series: [{ x: [Math.min(x0, 1e-3), 2], y: [Math.min(x0, 1e-3), 2], color: "--axis", dash: [5, 4], width: 1.2 }],
      points, xlabel: "1 − Ĉ", ylabel: "ϑ χ̂", empty: points.length ? "" : "no curve yet" });
    // (b) correlations against τ, as figures/E2_fdt (b)
    const series = [];
    const add = (c, dash, w) => {
      const t = c.tau.map(v => v / T);
      series.push({ x: t.slice(1), y: c.C.slice(1), color: "--lab", dash, width: w });
      series.push({ x: t.slice(1), y: c.C_cm.slice(1), color: "--creature", dash, width: w });
    };
    if (ref) add(ref.curve, [3, 3], 1.1);
    if (mine) add(mine.curve, [], 1.7);
    Charts.plot($("#fd-corr"), { x: [0.8 / T, q.tStar / T], y: [-0.1, 1.05], xlog: true, series,
      hlines: [{ y: 0, color: "--axis", dash: [] }], xlabel: "τ = t* − t_w (time units)", ylabel: "Ĉ", empty: series.length ? "" : "no curve yet" });
    // the reading
    const row = (name, a, b) => `<tr><td>${name}</td><td class="n">${a}</td><td class="n">${b}</td></tr>`;
    const f = (v, d = 4) => Number.isFinite(v) ? fx(v, d) : "—";
    const P = (pl) => pl ? Object.entries(pl).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fx(100 * v, 0)}%`).join(", ") : "—";
    let html = `<table class="mini"><thead><tr><th></th><th class="n">this page</th><th class="n">E2 (cluster)</th></tr></thead><tbody>`;
    html += row("label", mine ? `<b>${mine.label}</b>` : "—", ref ? ref.label : "—");
    html += row("bootstrap", mine ? P(FD.last.b.P_label) : "—", ref ? P(ref.P_label) : "—");
    html += row("q<sub>EA</sub> (plateau)", mine ? f(mine.lab.q_ea) : "—", ref ? f(ref.lab.q_ea) : "—");
    html += row("a₁ (slope)", mine ? f(mine.lab.a1) : "—", ref ? f(ref.lab.a1) : "—");
    html += row("X̄", mine ? f(mine.lab.X_bar, 3) : "—", ref ? f(ref.lab.X_bar, 3) : "—");
    html += row("co-moving q<sub>EA</sub>", mine ? f(mine.comoving.q_ea, 3) : "—", ref ? f(ref.comoving.q_ea, 3) : "—");
    html += row("samples", FD.last ? q.B : "—", ref ? ref.B : "—");
    html += "</tbody></table>";
    if (mine) html += `<p class="inst-note">${LABEL_TEXT[mine.label] || ""}.</p>`;
    $("#fd-read").innerHTML = html;
    // a₁ against T for the void (P1c's question): E2's three points and this page's runs
    const e2T = L.fd.filter(r => r.part === "controlT").map(r => ({ x: r.T, y: Math.abs(r.lab.a1 - 1), color: "--muted", hollow: true, r: 4 }));
    const mineT = FD.results.map(r => ({ x: r.T, y: Math.abs(r.a1 - 1), color: "--bath", r: 3.4 }));
    Charts.plot($("#fd-a1"), { x: [7, 230], y: [0.005, 0.6], xlog: true, ylog: true, points: [...e2T, ...mineT],
      xlabel: "T (steps per time unit)", ylabel: "|a₁ − 1|", xticks: [10, 40, 160], yticks: [0.01, 0.03, 0.1, 0.3], xfmt: String, yfmt: String });
  }
  fdDraw();

  // ================================================================== E5: rheology
  const E5 = L.E5;
  const RHEO_STATES = {
    soliton: { ic: "soliton", mu: 0.15, temp: D.kramers.temp_s, color: "--creature", label: "Orbium, μ = 0.15, ϑ = 10⁻³" },
    patch: { ic: "patch", mu: 0.11, temp: D.kramers.temp_s, color: "--lab", label: "patch, μ = 0.11 (below the window), ϑ = 10⁻³" },
    empty: { ic: "empty", mu: 0.15, temp: E2.control_temp, color: "--ink-2", label: "the void, ϑ = 0.05" },
  };
  const rhSel = { state: $("#rh-state"), B: $("#rh-B"), long: $("#rh-long") };
  rhSel.state.innerHTML = Object.entries(RHEO_STATES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  const RH = { job: null, runs: {} };
  function rhParams() {
    const s = RHEO_STATES[rhSel.state.value];
    const periods = E5.periods.filter(P => rhSel.long.checked || P <= 128);
    return { key: rhSel.state.value, ic: s.ic, mu: s.mu, temp: s.temp, N: E5.N, B: +rhSel.B.value, periods, h0: E5.h0, nCycles: E5.n_cycles,
             rule: Object.assign({}, PROTO, { mu: s.mu }) };
  }
  function rhSync() {
    const q = rhParams(), steps = q.B * (q.periods.reduce((s, P) => s + 9 * P, 0) * 2 + (q.ic === "empty" ? 500 : q.ic === "soliton" ? 200 : 0));
    $("#rh-rule").innerHTML = `${q.N}² · ${q.B} samples (E5: ${E5.n_samples}) · μ = ${q.mu} · ϑ = ${sci(q.temp)} · h₀ = ${q.h0} · periods ${q.periods.join(", ")} steps, ${q.nCycles} cycles each after one discarded<br>about ${human(steps * q.N * q.N * cost(q.N))} here`;
  }
  Object.values(rhSel).forEach(s => s.addEventListener("change", () => { rhSync(); rhDraw(); }));
  rhSync();
  $("#rh-start").addEventListener("click", () => {
    if (RH.job) RH.job.stop();
    const q = rhParams(), seed = (Math.random() * 4294967296) >>> 0, t0 = Date.now();
    const params = { N: q.N, rule: q.rule, temp: q.temp, h0: q.h0, periods: q.periods, nCycles: q.nCycles, nSkip: 1, B: q.B, seed, ic: q.ic,
                     burn: 500, patchSide: E2.patch_side, base: q.ic === "soliton" ? C.unpackState(D.orbium.relaxed) : null };
    $("#rh-start").disabled = true; $("#rh-stop").disabled = false;
    RH.runs[q.key] = { rows: [], q };
    RH.job = runJob("rheo", params, (m) => {
      if (m.type === "error") { $("#rh-status").textContent = "Could not run: " + m.message; rhEnd(); return; }
      if (m.summary) {
        $("#rh-progress").style.width = `${100 * m.summary.progress}%`;
        RH.runs[q.key].rows = m.summary.rows;
        $("#rh-status").textContent = `${m.summary.rows.length} of ${q.periods.length} periods · ${fx((Date.now() - t0) / 1000, 0)} s · seed ${seed}`;
        rhDraw();
      }
      if (m.type === "done") { rhEnd(); $("#rh-status").textContent = `${m.stopped ? "Stopped" : "Done"} after ${human((Date.now() - t0) / 1000)} · seed ${seed}.`; }
    });
  });
  $("#rh-stop").addEventListener("click", () => { if (RH.job) RH.job.stop(); });
  function rhEnd() { RH.job = null; $("#rh-start").disabled = false; $("#rh-stop").disabled = true; }
  function rhDraw() {
    for (const [which, id] of [["chi1", "#rh-chi1"], ["chi2", "#rh-chi2"]]) {
      const series = [], points = [];
      for (const st of L.rheo) {
        const s = RHEO_STATES[st.ic === "soliton" ? "soliton" : st.ic === "patch" ? "patch" : "empty"];
        const sel = rhSel.state.value === (st.ic === "soliton" ? "soliton" : st.ic);
        series.push({ x: st.rows.map(r => r.omega), y: st.rows.map(r => r[which]), color: s.color, width: sel ? 1.2 : 0.8, alpha: sel ? 0.9 : 0.35, dash: [3, 3] });
        st.rows.forEach(r => points.push({ x: r.omega, y: r[which], color: s.color, hollow: true, r: sel ? 3.4 : 2.4 }));
      }
      for (const [k, run] of Object.entries(RH.runs)) {
        const s = RHEO_STATES[k], rows = run.rows;
        if (!rows.length) continue;
        const key = which === "chi1" ? "chi1" : "chi2", mk = which === "chi1" ? "chi1_mean" : "chi2_mean";
        series.push({ x: rows.map(r => r.omega), y: rows.map(r => r[mk]), color: s.color, width: 1.8 });
        rows.forEach(r => {
          const v = r[key], m = r[mk], se = v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1) / v.length) : 0;
          points.push({ x: r.omega, y: m, ylo: m - se, yhi: m + se, color: s.color, r: 3.4 });
        });
      }
      Charts.plot($(id), { x: [0.2, 20], xlog: true, series, points, hlines: [{ y: 0, color: "--axis", dash: [] }],
        xlabel: "ω (per time unit)", ylabel: which === "chi1" ? "χ′(ω)" : "χ″(ω)", xticks: [0.25, 1, 4, 16], xfmt: String });
    }
    const run = RH.runs[rhSel.state.value];
    const ref = L.rheo.find(s => (s.ic === "soliton" ? "soliton" : s.ic) === rhSel.state.value);
    const rows = ref.rows.map(r => {
      const m = run && run.rows.find(x => x.period_steps === r.P);
      const c = (v, d = 4) => Number.isFinite(v) ? fx(v, d) : "—";
      return `<tr><td class="n">${r.P}</td><td class="n">${fx(r.omega, 3)}</td><td class="n">${m ? c(m.chi1_mean) : "—"}</td><td class="n">${c(r.chi1)}</td><td class="n">${m ? c(m.chi2_mean) : "—"}</td><td class="n">${c(r.chi2)}</td></tr>`;
    }).join("");
    $("#rh-table").innerHTML = `<table class="mini"><thead><tr><th class="n">period</th><th class="n">ω</th><th class="n">χ′ here</th><th class="n">χ′ E5</th><th class="n">χ″ here</th><th class="n">χ″ E5</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  rhDraw();

  // ================================================================== E6: window edges
  const E6 = L.E6;
  const edSel = { R: $("#ed-R"), branch: $("#ed-branch"), grid: $("#ed-grid") };
  edSel.R.innerHTML = E6.R.map(R => `<option value="${R}"${R === 13 ? " selected" : ""}>R = ${R} · N = ${C.even(8 * R)}</option>`).join("");
  const ED = { job: null, sum: null, R: 13 };
  function edSync() {
    const R = +edSel.R.value, N = C.even(8 * R);
    const probes = 3 + 2 * Math.ceil(Math.log2(0.09 / E6.tol)) + 4 + (edSel.branch.checked ? E6.branch_offsets.length : 0) + (edSel.grid.checked ? 25 : 0);
    $("#ed-rule").innerHTML = `μ from 0.06 to 0.30 at σ = ${D.windows.sigma} · ${N}² · ${E6.n_steps} deterministic steps per probe · tolerance ${E6.tol}<br>about ${probes} probes, ${human(probes * E6.n_steps / 2 * 2 * N * N * cost(N))} here`;
  }
  Object.values(edSel).forEach(s => s.addEventListener("change", () => { edSync(); edDraw(); }));
  edSync();
  $("#ed-start").addEventListener("click", () => {
    if (ED.job) ED.job.stop();
    const R = +edSel.R.value, N = C.even(8 * R), t0 = Date.now();
    const st = D.lattice.states.find(s => Math.abs(s.rule.R - R) < 1e-9 && s.N === N);
    const params = { N, R, lo: E6.mu_lo[0], hi: E6.mu_hi[1], tol: E6.tol, nSteps: E6.n_steps, branch: edSel.branch.checked, offsets: E6.branch_offsets,
                     grid: edSel.grid.checked, cells: D.orbium.cells, base: st ? C.unpackState(st) : null };
    ED.R = R; ED.sum = null;
    $("#ed-start").disabled = true; $("#ed-stop").disabled = false;
    $("#ed-status").textContent = st ? "Running…" : "Preparing the Orbium at this R (1100 steps), then probing…";
    ED.job = runJob("edges", params, (m) => {
      if (m.type === "error") { $("#ed-status").textContent = "Could not run: " + m.message; edEnd(); return; }
      if (m.summary) {
        ED.sum = m.summary;
        $("#ed-progress").style.width = `${Math.min(100, 100 * m.summary.progress)}%`;
        const stage = m.summary.done ? "finished" : { ends: "the two ends", bisect: "halving the brackets", confirm: "confirming at another sub-cell position", branch: "the branch", grid: "the grid" }[m.summary.stage] || m.summary.stage;
        $("#ed-status").textContent = `${m.summary.nDone} probes · ${stage} · ${fx((Date.now() - t0) / 1000, 0)} s`;
        edDraw();
      }
      if (m.type === "done") { edEnd(); if (!m.stopped) $("#ed-progress").style.width = "100%"; if (m.stopped) $("#ed-status").textContent += " · stopped."; }
    });
  });
  $("#ed-stop").addEventListener("click", () => { if (ED.job) ED.job.stop(); });
  function edEnd() { ED.job = null; $("#ed-start").disabled = false; $("#ed-stop").disabled = true; }
  function edDraw() {
    const R = ED.sum ? ED.R : +edSel.R.value, ref = L.edges[String(R)];
    // (1) the bisection: probes in order (y) against μ (x)
    const points = [], vlines = [];
    const logPts = (log, hollow) => log.forEach(([mu, pi], i) => points.push({ x: mu, y: i + 1, color: pi ? "--creature" : "--muted", hollow, r: hollow ? 3.6 : 3 }));
    if (ref) {
      for (const k of ["lower", "upper"]) if (ref[k].edge) vlines.push({ x: ref[k].edge, color: "--muted", dash: [4, 3] });
    }
    if (ED.sum) {
      for (const k of ["lower", "upper"]) {
        const S = ED.sum[k];
        logPts(S.log || [], false);
        if (S.edge !== undefined) vlines.push({ x: S.edge, color: "--creature", dash: [] });
      }
    } else if (ref) { logPts(ref.lower.log, true); logPts(ref.upper.log, true); }
    Charts.plot($("#ed-bisect"), { x: [0.05, 0.31], y: [0, 14], points, vlines, yticks: [1, 4, 8, 12], xlabel: "μ (σ = 0.015)", ylabel: "probe", xfmt: (v) => trim(v, 2),
      empty: points.length ? "" : "" });
    // (2) the branch near the closest edge: mass against the distance from the edge
    const bp = [], bs = [];
    const branchOf = (near, color, hollow) => {
      if (!near || !near.branch) return null;
      const alive = near.branch.filter(b => b.alive);
      alive.forEach(b => bp.push({ x: b.delta, y: b.mass, color, hollow, r: hollow ? 3.6 : 3 }));
      const fit = X.branchFit(alive.map(b => b.delta), alive.map(b => b.mass));
      if (fit) {
        const xs = [], ys = [];
        for (let i = 0; i <= 60; i++) { const d = 3e-4 * Math.pow(150, i / 60); xs.push(d); ys.push(fit.m_c + fit.b * Math.pow(d, fit.gamma)); }
        bs.push({ x: xs, y: ys, color, dash: hollow ? [3, 3] : [], width: 1.2 });
      }
      return fit;
    };
    const fitE6 = branchOf(ref && ref.near, "--muted", true);
    const fitMine = branchOf(ED.sum && ED.sum.near, "--creature", false);
    Charts.plot($("#ed-branch-chart"), { x: [3e-4, 0.05], xlog: true, series: bs, points: bp, xlabel: "|μ_c − μ| (distance from the edge)", ylabel: "mass", xticks: [0.001, 0.01], xfmt: String });
    // (3) E4's barrier ΔΦ(μ) between the two edges
    const w = D.windows.E6["13"];
    const pts3 = D.kramers.mus.map(m => ({ x: m.mu, y: m.dPhi, ylo: m.dPhi - m.se_dPhi, yhi: m.dPhi + m.se_dPhi, color: "--bath", r: 3.4 }));
    Charts.plot($("#ed-barrier"), { x: [0.12, 0.166], y: [0, 0.013], points: pts3, series: [{ x: pts3.map(p => p.x), y: pts3.map(p => p.y), color: "--bath", width: 1, alpha: 0.6 }],
      xbands: [{ x0: w.lo, x1: w.hi, color: "--creature", alpha: 0.07 }], vlines: [{ x: w.lo, color: "--creature", dash: [3, 3] }, { x: w.hi, color: "--creature", dash: [3, 3] }],
      xlabel: "μ (R = 13)", ylabel: "ΔΦ", yticks: [0, 0.004, 0.008, 0.012], yfmt: (v) => v === 0 ? "0" : v.toFixed(3), xfmt: (v) => trim(v, 3) });
    // the numbers
    const e = (S) => S && S.edge !== undefined ? `${trim(S.edge, 6)} ± ${trim(S.halfwidth, 5)} <span class="hint">(${S.status})</span>` : S ? (S.status || "—") : "—";
    const g = (f) => f ? `${fx(f.gamma, 2)} ± ${fx(f.se_gamma, 2)}` : "—";
    $("#ed-read").innerHTML = `<table class="mini"><thead><tr><th></th><th class="n">this page</th><th class="n">E6 (cluster)</th></tr></thead><tbody>
      <tr><td>lower edge</td><td class="n">${ED.sum ? e(ED.sum.lower) : "—"}</td><td class="n">${ref ? e(ref.lower) : "—"}</td></tr>
      <tr><td>upper edge</td><td class="n">${ED.sum ? e(ED.sum.upper) : "—"}</td><td class="n">${ref ? e(ref.upper) : "—"}</td></tr>
      <tr><td>γ of m = m_c + b δ<sup>γ</sup></td><td class="n">${g(fitMine)}</td><td class="n">${g(fitE6)}</td></tr>
      </tbody></table>`;
  }
  edDraw();

  // ================================================================== E10, E12: the grid, measured
  const LT = D.lattice;
  const gridR = () => App.sim.rule.R;
  const lamPts = () => {
    const pts = [];
    for (const r of LT.scan) if (r.lam) r.lam.forEach(v => pts.push({ x: r.R, y: v, color: "--lab", r: 1.6, alpha: 0.4 }));
    for (const r of LT.scan) if (Number.isFinite(r.lam_mean)) pts.push({ x: r.R, y: r.lam_mean, color: "--lab", r: 3.4, R: r.R });
    for (const r of LT.lock) if (Number.isFinite(r.lam_mean)) pts.push({ x: r.R, y: r.lam_mean, color: "--creature", r: 2.4, R: r.R });
    for (const r of LT.test) pts.push({ x: r.R, y: r.lam_mean, color: "--lab", r: 3.4, R: r.R });
    return pts;
  };
  const advPts = () => {
    const pts = [];
    for (const r of LT.advances) { pts.push({ x: r.R, y: r.dy, color: "--lab", r: 3, R: r.R }); pts.push({ x: r.R, y: r.dx, color: "--bath", r: 3, R: r.R }); }
    for (const r of LT.lock) if (r.formed) {
      const locked = r.locks && r.locks.length;
      pts.push({ x: r.R, y: r.dy, color: locked ? "--creature" : "--lab", r: locked ? 3 : 2, hollow: !locked, R: r.R });
      pts.push({ x: r.R, y: r.dx, color: "--bath", r: 2, hollow: true, R: r.R });
    }
    return pts;
  };
  let gridGeom = {};
  function gridDraw() {
    const R = gridR(), vl = [{ x: R, color: "--ink", dash: [2, 2], label: `R = ${trim(R, 2)}` }];
    gridGeom.lam = Charts.plot($("#grid-lam"), { x: [12, 66], y: [-0.05, 0.12], points: lamPts(), vlines: vl, hlines: [{ y: 0, color: "--axis", dash: [] }],
      xlabel: "R (cells per kernel radius)", ylabel: "λ (per time unit)", yticks: [-0.04, 0, 0.04, 0.08, 0.12] });
    const rat = [0.5, 1, 1.5].map(y => ({ y, color: "--axis", dash: [3, 3], label: y === 1 ? "1" : y === 0.5 ? "1/2" : "3/2" }));
    gridGeom.adv = Charts.plot($("#grid-adv"), { x: [12, 41], y: [0.1, 1.8], points: advPts(), vlines: vl, hlines: rat,
      xlabel: "R", ylabel: "advance per step (cells)" });
  }
  function nearestR(ev, which) {
    const g = gridGeom[which]; if (!g) return null;
    const cv = $(which === "lam" ? "#grid-lam" : "#grid-adv"), rect = cv.getBoundingClientRect(), x = ev.clientX - rect.left;
    const all = [...new Set([...LT.scan.filter(r => Number.isFinite(r.lam_mean)).map(r => r.R), ...LT.test.map(r => r.R), ...LT.lock.filter(r => r.formed).map(r => r.R), ...LT.advances.map(r => r.R)])];
    let best = null, bd = Infinity;
    for (const R of all) { const d = Math.abs(g.px(R) - x); if (d < bd) { bd = d; best = R; } }
    return bd < 14 ? best : null;
  }
  for (const which of ["lam", "adv"]) {
    const cv = $(which === "lam" ? "#grid-lam" : "#grid-adv");
    cv.addEventListener("mousemove", (e) => { const R = nearestR(e, which); cv.style.cursor = R ? "pointer" : "default"; cv.title = R ? `load the Orbium at R = ${R}` : ""; });
    cv.addEventListener("click", (e) => { const R = nearestR(e, which); if (R) loadAtR(R); });
  }
  let prepJob = null;
  function loadAtR(R) {
    const st = D.lattice.states.find(s => Math.abs(s.rule.R - R) < 1e-9);
    if (st) { App.load(Object.assign(App.latticeSpec(R), { temp: 0, lyap: true })); App.run(true); App.scrollToSim(); return; }
    const N = C.even(8 * R);
    $("#grid-status").textContent = `Preparing the Orbium at R = ${trim(R, 2)} on ${N}² (rescaled seed, 1100 steps)…`;
    if (prepJob) prepJob.stop();
    prepJob = runJob("prepare", { N, R, cells: D.orbium.cells }, (m) => {
      if (m.type === "error") { $("#grid-status").textContent = "Could not prepare: " + m.message; return; }
      if (m.type !== "done" || m.stopped) return;
      prepJob = null;
      const spec = App.preparedSpec(R, N, m.summary.A);
      App.load(Object.assign(spec, { temp: 0, lyap: true })); App.run(true); App.scrollToSim();
      $("#grid-status").textContent = `Loaded the Orbium at R = ${trim(R, 2)}.`;
    });
  }
  App.on("rule", gridDraw); App.on("load", gridDraw); App.on("theme", () => { gridDraw(); fdDraw(); rhDraw(); edDraw(); });
  window.addEventListener("resize", () => { gridDraw(); fdDraw(); rhDraw(); edDraw(); });
  App.on("labtab", () => { fdDraw(); rhDraw(); edDraw(); });
  gridDraw();
})();

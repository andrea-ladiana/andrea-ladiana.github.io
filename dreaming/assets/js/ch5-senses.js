/* Chapter 5: three linked layers, a blended cue on the simplex (the paper's Fig. 2), and one live run. */
import { stageCanvas, seg, animator, reducedMotion, colors, pointer, tooltip, mix } from "./ui.js?v=20261029a";
import { rng, randomPatterns, learn, kernel, network, overlap, example } from "./hopfield.js?v=20261029a";
import { drawPattern, plotFrame, drawAxes, polyline, text, alpha } from "./draw.js?v=20261029a";

const SIDE = 20, TAIL = 15, PER_FRAME = 5;

export function init(el, data) {
    const S = data.simplex, P = S.params, n = S.n, N = P.N, K = P.K;
    const out = id => document.getElementById(id);
    const idx = new Map();
    { let k = 0; for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) idx.set(i * (n + 1) + j, k++); }
    const value = (grid, i, j) => (grid ? grid[idx.get(i * (n + 1) + j)] : 0);

    // three independent layers, learned once
    const R0 = rng(7302);
    const layers = [0, 1, 2].map(() => learn(randomPatterns(K, N, R0), K, N, P.M, P.r, R0));
    const kernels = { 0: layers.map(l => kernel(l.C, K, 0)), 64: layers.map(l => kernel(l.C, K, 64)) };

    let mode = "t64", w3 = [0.8, 0.1, 0.1], run = null, frame = 0;
    const grid = () => (mode === "off" ? null : S[mode]);

    /* ---------- the simplex ---------- */
    const geo = (w, h) => {
        const side = Math.min(w - 60, (h - 92) / (Math.sqrt(3) / 2));
        const x0 = (w - side) / 2, yb = h - 52;
        const V = [[x0, yb], [x0 + side, yb], [x0 + side / 2, yb - (side * Math.sqrt(3)) / 2]];
        const at = ([a, b, c]) => [a * V[0][0] + b * V[1][0] + c * V[2][0], a * V[0][1] + b * V[1][1] + c * V[2][1]];
        const bary = (px, py) => {
            const [[x1, y1], [x2, y2], [x3, y3]] = V;
            const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
            const a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / d;
            const b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / d;
            return [a, b, 1 - a - b];
        };
        return { V, at, bary, side };
    };
    const ramp = v => { const C = colors(); return mix(C.surface2, C.c2, Math.max(0, Math.min(1, v))); };

    const map = stageCanvas(out("senses-simplex"), (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const C = colors(), G = geo(w, h), gr = grid();
        const pt = (i, j) => G.at([i / n, j / n, (n - i - j) / n]);
        const tri = (p, q, r, v) => {
            ctx.fillStyle = ramp(v);
            ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.lineTo(...r); ctx.closePath(); ctx.fill(); ctx.stroke();
        };
        ctx.lineWidth = 0.6;
        for (let i = 0; i < n; i++)
            for (let j = 0; j < n - i; j++) {
                const v = (value(gr, i, j) + value(gr, i + 1, j) + value(gr, i, j + 1)) / 3;
                ctx.strokeStyle = ramp(v);
                tri(pt(i, j), pt(i + 1, j), pt(i, j + 1), v);
                if (i + j < n - 1) {
                    const u = (value(gr, i + 1, j) + value(gr, i, j + 1) + value(gr, i + 1, j + 1)) / 3;
                    ctx.strokeStyle = ramp(u);
                    tri(pt(i + 1, j), pt(i, j + 1), pt(i + 1, j + 1), u);
                }
            }
        ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(...G.V[0]); ctx.lineTo(...G.V[1]); ctx.lineTo(...G.V[2]); ctx.closePath(); ctx.stroke();
        text(ctx, "view 1", G.V[0][0], G.V[0][1] + 10, { align: "center", base: "top", color: C.ink2, px: 12 });
        text(ctx, "view 2", G.V[1][0], G.V[1][1] + 10, { align: "center", base: "top", color: C.ink2, px: 12 });
        text(ctx, "view 3", G.V[2][0], G.V[2][1] - 8, { align: "center", base: "bottom", color: C.ink2, px: 12 });
        // the chosen blend
        const [mx, my] = G.at(w3);
        ctx.fillStyle = C.surface; ctx.strokeStyle = C.c1; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(mx, my, 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        // colour key
        const kw = Math.min(110, w * 0.28), kx = w - kw - 14, ky = 30;
        for (let k = 0; k < kw; k++) { ctx.fillStyle = ramp(k / (kw - 1)); ctx.fillRect(kx + k, ky, 1.2, 8); }
        text(ctx, "0", kx, ky - 3, { base: "bottom", px: 11 });
        text(ctx, "joint success", kx + kw / 2, ky - 3, { align: "center", base: "bottom", px: 11 });
        text(ctx, "1", kx + kw, ky - 3, { align: "right", base: "bottom", px: 11 });
    });

    /* ---------- one live run ---------- */
    const traces = stageCanvas(out("senses-run"), (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        if (!run) return;
        const C = colors(), col = [C.c1, C.c2, C.ink2];
        const pad = 16, gap = 12;
        const size = Math.min((w - 2 * pad - 2 * gap) / 3, h * 0.34);
        const gx = (w - (3 * size + 2 * gap)) / 2, gy = 34;
        for (let l = 0; l < 3; l++) {
            const x = gx + l * (size + gap);
            drawPattern(ctx, run.states[l][frame], SIDE, x, gy, size, { target: layers[l].xi, to: run.mu * N });
            text(ctx, `layer ${l + 1}`, x, gy - 8, { base: "bottom", color: col[l], px: 12, weight: 500 });
            text(ctx, run.m[l][frame].toFixed(2), x + size, gy - 8, { align: "right", base: "bottom", px: 12 });
        }
        const Pl = plotFrame(44, gy + size + 40, w - 16, h - 30, { xmin: 0, xmax: P.steps, ymin: -0.2, ymax: 1 });
        drawAxes(ctx, Pl, { x: [[0, "0"], [P.steps / 2, String(P.steps / 2)], [P.steps, String(P.steps)]], y: [[0, "0"], [P.mth, String(P.mth)], [1, "1"]] }, { ylabel: "overlap of each layer with its own view", xlabel: "step" });
        ctx.strokeStyle = alpha(C.c2, 0.5); ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Pl.x0, Pl.Y(P.mth)); ctx.lineTo(Pl.x1, Pl.Y(P.mth)); ctx.stroke(); ctx.setLineDash([]);
        for (let l = 0; l < 3; l++) {
            ctx.strokeStyle = col[l]; ctx.lineWidth = 2;
            const ys = run.m[l].slice(0, frame + 1);
            polyline(ctx, Pl, ys.map((_, k) => k), ys);
        }
    });

    function simulate() {
        const t = mode === "t0" ? 0 : 64, R = rng(Math.floor(Math.random() * 1e9));
        const net = network(layers, kernels[t], { gAuto: P.gAuto, gHetero: mode === "off" ? 0 : P.gHetero, beta: P.beta, R });
        const mu = Math.floor(R() * K);
        // the cue: sign(a η1 + b η2 + c η3) from fresh examples, ties at random, then cue noise; same on all layers
        const eta = layers.map(l => example(l.xi.subarray(mu * N, mu * N + N), P.r, R));
        const cue = new Int8Array(N);
        for (let i = 0; i < N; i++) {
            const v = w3[0] * eta[0][i] + w3[1] * eta[1][i] + w3[2] * eta[2][i];
            cue[i] = Math.abs(v) < 1e-12 ? (R() < 0.5 ? 1 : -1) : Math.sign(v);
            if (R() < P.eps) cue[i] = -cue[i];
        }
        const s = [0, 1, 2].map(() => Int8Array.from(cue));
        const states = [[], [], []], m = [[], [], []];
        const record = () => s.forEach((x, l) => { states[l].push(Int8Array.from(x)); m[l].push(overlap(x, layers[l].xi, mu * N, N)); });
        record();
        for (let k = 0; k < P.steps; k++) { net.step(s); record(); }
        const tail = m.map(ml => ml.slice(-TAIL).reduce((a, b) => a + b, 0) / TAIL);
        return { mu, states, m, ok: tail.every(v => v >= P.mth) };
    }

    const anim = animator(out("senses-run"), () => {
        frame = Math.min(run.m[0].length - 1, frame + PER_FRAME);
        traces.redraw();
        if (frame === run.m[0].length - 1) { showResult(); return false; }
        return true;
    });
    const showResult = () => { out("senses-ok").textContent = run.ok ? "every layer recalled" : "failed"; };

    const go = () => {
        run = simulate();
        frame = reducedMotion() ? run.m[0].length - 1 : 0;
        out("senses-ok").textContent = "running…";
        traces.redraw();
        if (frame < run.m[0].length - 1) anim.start(); else showResult();
    };

    const describe = () => {
        out("senses-w").textContent = w3.map(v => v.toFixed(2)).join(" · ");
        const i = Math.round(w3[0] * n), j = Math.min(n - i, Math.round(w3[1] * n));
        out("senses-p").textContent = Math.round(100 * value(grid(), i, j)) + "%";
        out("senses-map-label").textContent = mode === "t0" ? "awake, t = 0" : mode === "t64" ? "after sleep, t = 64" : "layers unlinked: zero everywhere";
    };

    const tip = tooltip(out("senses-tip"));
    const cv = out("senses-simplex");
    const inside = b => b.every(v => v >= -0.02);
    cv.addEventListener("pointermove", ev => {
        const [px, py] = pointer(cv, ev), b = geo(map.w, map.h).bary(px, py);
        if (!inside(b)) return tip.hide();
        const c = b.map(v => Math.max(0, v)), s = c[0] + c[1] + c[2];
        const i = Math.round((c[0] / s) * n), j = Math.min(n - i, Math.round((c[1] / s) * n));
        tip.show(px, py, `${Math.round(100 * value(grid(), i, j))}% joint success`);
    });
    cv.addEventListener("pointerleave", () => tip.hide());
    cv.addEventListener("click", ev => {
        const [px, py] = pointer(cv, ev), b = geo(map.w, map.h).bary(px, py);
        if (!inside(b)) return;
        const c = b.map(v => Math.max(0, v)), s = c[0] + c[1] + c[2];
        w3 = c.map(v => v / s);
        describe(); map.redraw(); go();
    });

    seg(out("senses-mode"), v => { mode = v; describe(); map.redraw(); go(); });
    out("senses-go").addEventListener("click", go);
    describe(); map.redraw(); go();
}

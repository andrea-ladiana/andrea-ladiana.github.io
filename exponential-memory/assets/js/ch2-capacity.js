/* Chapter 2: the exponential capacity (L = 2, N = 8..12) and, below, the rate rho_L for wider networks. */
import { stageCanvas, range, seg, colors } from "./ui.js?v=20261029a";
import { plotFrame, drawAxes, polyline, text, line, dot, logTicks, mix, alpha } from "./draw.js?v=20261029a";
import { m1step, gamma, rho, xStar } from "./theory.js?v=20261029a";
import { monteCarlo, meanSd } from "./mc.js?v=20261029a";

const PMIN = 1, PMAX = 1e7, LIVE_MAX = 3e5;
const sliderToP = v => Math.max(2, Math.round(10 ** (Math.log10(2) + (v / 100) * (7 - Math.log10(2)))));
const fmtP = p => p.toLocaleString("en-US");

export function init(root, data) {
    const cap = data.capacity.byN;
    const Ns = Object.keys(cap).map(Number);
    let N = 10, live = null;   // live: { N, P, ms }
    const mc = monteCarlo();

    const canvas = stageCanvas(root.querySelector("#cap-canvas"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const narrow = w < 560;
        const F = plotFrame(narrow ? 40 : 52, 30, w - 16, h - (narrow ? 40 : 44), { xmin: PMIN, xmax: PMAX, ymin: -0.05, ymax: 1.05, xlog: true });
        drawAxes(ctx, F, {
            x: logTicks(PMIN, PMAX).filter((_, k) => !narrow || k % 2 === 0),
            y: [[0, "0"], [0.5, "0.5"], [1, "1"]],
        }, { xlabel: "stored pairs P", ylabel: "overlap with the start, after updating" });

        // markers for the selected N: the classic limit and the number of distinct patterns per layer
        const P = sliderToP(ps.value);
        ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        const hop = 0.138 * 2 * N, cnt = 2 ** N;
        ctx.strokeStyle = C.axis; line(ctx, F.X(hop), F.y0, F.X(hop), F.y1);
        ctx.strokeStyle = alpha(C.c1, 0.6); line(ctx, F.X(cnt), F.y0, F.X(cnt), F.y1);
        ctx.setLineDash([]);
        // labelled near the bottom, where the curves have not dropped yet
        text(ctx, "classic Hopfield", F.X(hop) + 4, F.Y(0.12), { base: "bottom", px: 11 });
        text(ctx, `2^${N} patterns per layer`, F.X(cnt) + 4, F.Y(0.12), { base: "bottom", px: 11, color: C.c1Ink });

        // theory curves and the paper's dots, the selected N on top
        const order = Ns.filter(n => n !== N).concat([N]);
        for (const n of order) {
            const sel = n === N, col = sel ? C.c1 : mix(C.stageBg, C.muted, 0.55);
            const xs = [], ys = [];
            for (let k = 0; k <= 240; k++) { const p = 10 ** (Math.log10(1.5) + (k / 240) * (7 - Math.log10(1.5))); xs.push(p); ys.push(m1step(2, n, p)); }
            ctx.strokeStyle = col; ctx.lineWidth = sel ? 2 : 1.2;
            polyline(ctx, F, xs, ys);
            const d = cap[n];
            for (let k = 0; k < d.P.length; k++) {
                const x = F.X(d.P[k]), y = F.Y(d.m[k]);
                if (sel) { ctx.strokeStyle = alpha(C.c1, 0.5); ctx.lineWidth = 1; line(ctx, x, F.Y(d.m[k] - d.sd[k]), x, F.Y(d.m[k] + d.sd[k])); }
                dot(ctx, x, y, sel ? 3.4 : 2.2, sel ? C.c1 : col);
            }
            if (!narrow || sel) {
                const lp = d.P[Math.min(d.P.length - 1, d.P.findIndex(p => m1step(2, n, p) < 0.5) + 1)];
                text(ctx, `N=${n}`, F.X(lp) + 4, F.Y(m1step(2, n, lp)) - 2, { px: 11, color: sel ? C.c1Ink : C.muted, base: "bottom" });
            }
        }

        // the chosen load and the live run
        ctx.strokeStyle = C.c3; ctx.lineWidth = 1.2;
        line(ctx, F.X(P), F.y1, F.X(P), F.y1 - 8);
        if (live && live.N === N && live.ms.length) {
            const { m, sd } = meanSd(live.ms), x = F.X(live.P);
            ctx.strokeStyle = C.c3; ctx.lineWidth = 1.5;
            line(ctx, x, F.Y(Math.max(-0.05, m - sd)), x, F.Y(Math.min(1.05, m + sd)));
            dot(ctx, x, F.Y(m), 5, C.c3);
        }
        if (!narrow) {
            text(ctx, "lines: theory, one sweep · dots: the paper, five sweeps", F.x1, F.y1 - 8, { align: "right", px: 11.5 });
        }
    });

    function report() {
        const P = sliderToP(ps.value);
        const g = gamma(2, N, P);
        root.querySelector("#cap-gamma").textContent = g < 0.01 ? g.toExponential(1) : g < 100 ? g.toPrecision(2) : g.toExponential(1);
        root.querySelector("#cap-theory").textContent = m1step(2, N, P).toFixed(3);
        const d = cap[N];
        let k = -1, best = Infinity;
        d.P.forEach((p, j) => { const e = Math.abs(Math.log(p / P)); if (e < best) { best = e; k = j; } });
        root.querySelector("#cap-paper").textContent = best < Math.log(1.6) ? `${d.m[k].toFixed(3)} at P = ${fmtP(d.P[k])}` : "–";
        const btn = root.querySelector("#cap-run");
        btn.disabled = P > LIVE_MAX;
        btn.title = P > LIVE_MAX ? "Too many pairs for a browser: up to 300,000 here" : "";
        const you = root.querySelector("#cap-you");
        if (live && live.N === N && live.ms.length) {
            const { m, sd, n } = meanSd(live.ms);
            you.textContent = `${m.toFixed(3)} ± ${sd.toFixed(3)} · P = ${fmtP(live.P)} · ${n} run${n > 1 ? "s" : ""}${mc.busy ? "…" : ""}`;
        } else you.textContent = P > LIVE_MAX ? "too large to run here" : "press Run";
    }

    const ps = range(root.querySelector("#cap-P"), root.querySelector("#cap-P-out"), () => { report(); canvas.redraw(); }, v => fmtP(sliderToP(v)));
    seg(root.querySelector("#cap-N"), v => { N = +v; mc.stop(); report(); canvas.redraw(); });

    root.querySelector("#cap-run").addEventListener("click", () => {
        const P = sliderToP(ps.value);
        if (P > LIVE_MAX) return;
        // about 4 seconds of work: one trial costs roughly 4.5 µs per stored pair over five sweeps
        const trials = Math.max(3, Math.min(24, Math.round(4000 / (0.0045 * P + 2))));
        live = { N, P, ms: [] };
        report();
        mc.run({ N, L: 2, P, r: 1, steps: 5, trials }, ms => { live.ms = ms.slice(); report(); canvas.redraw(); }, () => { report(); });
    });

    report();
    initWidth(root);
}

/* ---------- More layers: the saddle point and the rate ---------- */
function initWidth(root) {
    const rates = Array.from({ length: 9 }, (_, k) => rho(k + 2));
    let L = 3;

    const saddle = stageCanvas(root.querySelector("#width-saddle"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const xmax = Math.max(5, 2 * (L - 1) * 1.15);
        const F = plotFrame(40, 36, w - 16, h - 42, { xmin: 0, xmax, ymin: 0, ymax: 1.1 });
        const step = xmax > 12 ? 4 : 2, ticks = [];
        for (let v = 0; v <= xmax; v += step) ticks.push([v, String(v)]);
        drawAxes(ctx, F, { x: ticks, y: [[0, "0"], [0.5, "0.5"], [1, "1"]] }, { xlabel: "x" });
        const xs = [], t = [], l = [];
        for (let k = 0; k <= 200; k++) { const x = (k / 200) * xmax; xs.push(x); t.push(Math.tanh(x)); l.push(x / (2 * (L - 1))); }
        ctx.lineWidth = 2; ctx.strokeStyle = C.ink; polyline(ctx, F, xs, t);
        ctx.strokeStyle = C.c1; ctx.setLineDash([5, 4]); polyline(ctx, F, xs, l); ctx.setLineDash([]);
        const xs0 = xStar(L);
        ctx.strokeStyle = alpha(C.c3, 0.6); ctx.lineWidth = 1;
        line(ctx, F.X(xs0), F.Y(Math.tanh(xs0)), F.X(xs0), F.y1);
        dot(ctx, F.X(xs0), F.Y(Math.tanh(xs0)), 5, C.c3);
        text(ctx, "tanh x", F.X(xmax * 0.06), F.Y(1.02), { color: C.ink, base: "bottom", px: 12 });
        text(ctx, `x / ${2 * (L - 1)}`, F.X(xmax * 0.7), F.Y(Math.min(1.05, 0.7 * xmax / (2 * (L - 1)))) + 16, { color: C.c1Ink, px: 12 });
        text(ctx, "saddle point", 12, 18, { px: 12.5 });
    });

    const rate = stageCanvas(root.querySelector("#width-rate"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const F = plotFrame(40, 36, w - 16, h - 42, { xmin: 1.5, xmax: 10.5, ymin: 0, ymax: 7.5 });
        drawAxes(ctx, F, { x: [2, 4, 6, 8, 10].map(v => [v, String(v)]), y: [0, 2, 4, 6].map(v => [v, String(v)]) }, { xlabel: "layers L" });
        ctx.strokeStyle = C.axis; ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2;
        line(ctx, F.X(1.5), F.Y(1.5 * Math.LN2), F.X(10.5), F.Y(10.5 * Math.LN2)); ctx.setLineDash([]);
        text(ctx, "L log 2", F.X(8.6), F.Y(8.6 * Math.LN2) - 10, { px: 11.5, align: "right" });
        ctx.strokeStyle = C.c1; ctx.lineWidth = 1.5;
        polyline(ctx, F, rates.map((_, k) => k + 2), rates);
        rates.forEach((r, k) => dot(ctx, F.X(k + 2), F.Y(r), k + 2 === L ? 5.5 : 3, k + 2 === L ? C.c3 : C.c1));
        text(ctx, "rate ρ", 12, 18, { px: 12.5 });
    });

    const fmtPow = x => {
        const e = Math.floor(x / Math.LN10), m = Math.exp(x - e * Math.LN10);
        return e < 6 ? Math.round(Math.exp(x)).toLocaleString("en-US") : `${m.toFixed(1)} × 10<sup>${e}</sup>`;
    };
    range(root.querySelector("#width-L"), root.querySelector("#width-L-out"), v => {
        L = v;
        root.querySelector("#width-x").textContent = xStar(L).toFixed(3);
        root.querySelector("#width-rho").textContent = rho(L).toFixed(3);
        root.querySelector("#width-pc").innerHTML = fmtPow(10 * rho(L));
        saddle.redraw(); rate.redraw();
    });
    root.querySelector("#width-L").dispatchEvent(new Event("input"));
}

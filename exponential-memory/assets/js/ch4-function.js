/* Chapter 4: one question filed under q answers. The first sweep returns their majority, then it locks onto one. */
import { stageCanvas, range, colors } from "./ui.js?v=20261029a";
import { drawPattern, plotFrame, drawAxes, polyline, text, dot } from "./draw.js?v=20261029a";
import { Memory, rng, overlap } from "./engine.js?v=20261029a";
import { majorityOverlap } from "./theory.js?v=20261029a";
import { glyph } from "./codes.js?v=20261029a";

const QMAX = 9;

export function init(root, data) {
    const side = data.side, N = side * side;
    const ask = glyph(data.glyphs["?"]);
    const digits = Array.from({ length: QMAX }, (_, k) => glyph(data.glyphs[String(k + 1)]));

    /** '?' filed under the digits 1..q: the first sweep and the settled answer. */
    function solve(q) {
        const xi = new Int8Array(q * 2 * N);
        for (let k = 0; k < q; k++) { xi.set(ask, k * 2 * N); xi.set(digits[k], k * 2 * N + N); }
        const mem = new Memory(xi, q, 2, N);
        const cue = new Int8Array(2 * N); cue.set(ask);
        const { path } = mem.recall(cue, [0], 8);
        const first = path[0].subarray(N), last = path.at(-1).subarray(N);
        const ov = s => digits.slice(0, q).map(d => overlap(s, d));
        const fin = ov(last);
        const k = fin.indexOf(Math.max(...fin));
        return { first, last, blend: ov(first), settled: fin[k] > 0.95 ? k : -1 };
    }
    const glyphRuns = Array.from({ length: QMAX }, (_, k) => solve(k + 1));

    /* Random answers, two cue layers: the first sweep against the majority formula. */
    const R = rng(4), M = 128, L = 3, reps = 40;
    const randomDots = Array.from({ length: QMAX }, (_, j) => {
        const q = j + 1, P = q + 60;
        let s = 0;
        for (let t = 0; t < reps; t++) {
            const xi = new Int8Array(P * L * M).map(() => (R() < 0.5 ? -1 : 1));
            for (let k = 1; k < q; k++) xi.set(xi.subarray(0, 2 * M), k * L * M);
            const mem = new Memory(xi, P, L, M);
            const cue = new Int8Array(L * M); cue.set(xi.subarray(0, 2 * M));
            const first = mem.seed(cue, [0, 1]);
            for (let k = 0; k < q; k++) s += overlap(first, xi, 2 * M, (k * L + 2) * M, M) / q;
        }
        return s / reps;
    });

    let q = 3;
    const run = stageCanvas(root.querySelector("#function-run"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const g = glyphRuns[q - 1], pad = 16;
        const qs = Math.min(64, (w - 2 * pad) * 0.22);
        text(ctx, "question", pad, pad + 12, { px: 12.5 });
        drawPattern(ctx, ask, side, side, pad, pad + 20, qs, qs);
        const ax = pad + qs + 18;
        text(ctx, `filed under ${q} answer${q > 1 ? "s" : ""}`, ax, pad + 12, { px: 12.5 });
        const cols = Math.min(q, 5), cs = Math.min(qs * 0.72, (w - ax - pad - (cols - 1) * 6) / cols);
        for (let k = 0; k < q; k++) {
            const r = Math.floor(k / 5), c = k % 5;
            drawPattern(ctx, digits[k], side, side, ax + c * (cs + 6), pad + 20 + r * (cs + 6), cs, cs);
        }
        const by = pad + 20 + Math.max(qs, 2 * cs + 6) + 40;
        const big = Math.min((w - 3 * pad) / 2, h - by - 34);
        const x1 = (w - 2 * big - pad) / 2, x2 = x1 + big + pad;
        text(ctx, "first sweep: the majority", x1, by - 8, { px: 12.5 });
        text(ctx, "after settling", x2, by - 8, { px: 12.5 });
        drawPattern(ctx, g.first, side, side, x1, by, big, big);
        drawPattern(ctx, g.last, side, side, x2, by, big, big);
        if (q > 1) text(ctx, g.settled >= 0 ? `locked onto ${g.settled + 1}` : "still a blend", x2 + big / 2, by + big + 8, { align: "center", base: "top", px: 12, color: C.c3Ink });
    });

    const plot = stageCanvas(root.querySelector("#function-plot"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const F = plotFrame(40, 36, w - 14, h - 42, { xmin: 0.5, xmax: QMAX + 0.5, ymin: 0, ymax: 1.05 });
        drawAxes(ctx, F, { x: Array.from({ length: QMAX }, (_, k) => [k + 1, String(k + 1)]), y: [[0, "0"], [0.5, "0.5"], [1, "1"]] }, { xlabel: "answers q" });
        text(ctx, "first sweep: overlap with each answer", 12, 18, { px: 12.5 });
        const xs = [], ys = [];
        for (let k = 0; k <= 200; k++) { const x = 1 + (k / 200) * (QMAX - 1); xs.push(x); ys.push(Math.sqrt(2 / (Math.PI * x))); }
        ctx.strokeStyle = C.c1; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]); polyline(ctx, F, xs, ys.map((y, k) => Math.min(1, y))); ctx.setLineDash([]);
        // exact majority overlap (ties to +1)
        ctx.lineWidth = 2; polyline(ctx, F, Array.from({ length: QMAX }, (_, k) => k + 1), Array.from({ length: QMAX }, (_, k) => majorityOverlap(k + 1)));
        randomDots.forEach((v, k) => dot(ctx, F.X(k + 1), F.Y(v), 3.5, C.c1));
        glyphRuns.forEach((g, k) => {
            const v = g.blend.reduce((a, b) => a + b, 0) / g.blend.length;
            const x = F.X(k + 1), y = F.Y(v), s = k + 1 === q ? 5 : 3.5;
            ctx.fillStyle = C.c3; ctx.fillRect(x - s, y - s, 2 * s, 2 * s);
        });
        const lx = F.x1 - 150, ly = F.y0 + 6;
        ctx.strokeStyle = C.c1; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18, ly); ctx.stroke();
        text(ctx, "majority, exact", lx + 24, ly, { base: "middle", px: 11.5 });
        ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(lx, ly + 16); ctx.lineTo(lx + 18, ly + 16); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, "√(2/πq)", lx + 24, ly + 16, { base: "middle", px: 11.5 });
        dot(ctx, lx + 9, ly + 32, 3.5, C.c1);
        text(ctx, "random answers", lx + 24, ly + 32, { base: "middle", px: 11.5 });
        ctx.fillStyle = C.c3; ctx.fillRect(lx + 5.5, ly + 44.5, 7, 7);
        text(ctx, "the digits", lx + 24, ly + 48, { base: "middle", px: 11.5 });
    });

    range(root.querySelector("#function-q"), root.querySelector("#function-q-out"), v => {
        q = v;
        const g = glyphRuns[q - 1];
        const mean = g.blend.reduce((a, b) => a + b, 0) / q;
        root.querySelector("#function-blend").textContent = q === 1 ? "1 (no conflict)" : mean.toFixed(2);
        root.querySelector("#function-theory").textContent = majorityOverlap(q).toFixed(2);
        root.querySelector("#function-final").textContent = q === 1 ? "1, the only answer" : g.settled >= 0 ? `${g.settled + 1}, one of ${q}` : "a blend";
        run.redraw(); plot.redraw();
    });
    root.querySelector("#function-q").dispatchEvent(new Event("input"));
}

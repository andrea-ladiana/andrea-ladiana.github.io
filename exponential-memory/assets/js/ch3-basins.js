/* Chapter 3: recovery from a damaged start (L = 3, N = 30, P = 35,224) and the storage exponent eps_L(r). */
import { stageCanvas, range, colors } from "./ui.js?v=20261029a";
import { plotFrame, drawAxes, polyline, text, line, dot, mix, alpha } from "./draw.js?v=20261029a";
import { m1basinAnn, m1basinTyp, epsAnn, epsTyp, rcAnn, rcTyp } from "./theory.js?v=20261029a";
import { monteCarlo, meanSd } from "./mc.js?v=20261029a";

const TRIALS = 24;

export function init(root, data) {
    const B = data.basins, { L, N, P } = B;
    const rs = Array.from({ length: 197 }, (_, k) => 0.02 + (k / 196) * 0.98);
    const ann = rs.map(r => m1basinAnn(L, N, P, r)), typ = rs.map(r => m1basinTyp(L, N, P, r));
    const eps = [2, 3, 4].map(l => ({ l, ann: rs.map(r => epsAnn(l, r)), typ: rs.map(r => epsTyp(l, r)) }));
    const rcA = rcAnn(L), rcT = rcTyp(L);
    const mc = monteCarlo();
    let live = [];   // [{ r, ms }]

    const left = stageCanvas(root.querySelector("#basins-run"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const F = plotFrame(40, 36, w - 14, h - 42, { xmin: 0, xmax: 1, ymin: -0.08, ymax: 1.1 });
        drawAxes(ctx, F, { x: [0, 0.25, 0.5, 0.75, 1].map(v => [v, String(v)]), y: [[0, "0"], [0.5, "0.5"], [1, "1"]] }, { xlabel: "starting overlap r" });
        text(ctx, "overlap after one sweep", 12, 18, { px: 12.5 });
        // threshold lines, labelled on their left where the curves are still flat
        for (const [rc, lab] of [[rcA, "annealed limit"], [rcT, "typical limit"]]) {
            ctx.strokeStyle = C.axis; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
            line(ctx, F.X(rc), F.y0, F.X(rc), F.y1); ctx.setLineDash([]);
            text(ctx, lab, F.X(rc) - 4, F.y0 + 14, { px: 11, align: "right", base: "bottom" });
        }
        ctx.strokeStyle = C.c1; ctx.lineWidth = 2; polyline(ctx, F, rs, ann);
        ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; polyline(ctx, F, rs, typ); ctx.setLineDash([]);
        for (let k = 0; k < B.r.length; k++) {
            const x = F.X(B.r[k]);
            ctx.strokeStyle = alpha(C.c1, 0.45); ctx.lineWidth = 1;
            line(ctx, x, F.Y(B.m[k] - B.sem[k]), x, F.Y(B.m[k] + B.sem[k]));
            dot(ctx, x, F.Y(B.m[k]), 2.8, C.c1);
        }
        const r = rS.value / 100;
        ctx.strokeStyle = C.c3; ctx.lineWidth = 1.2; line(ctx, F.X(r), F.y1, F.X(r), F.y1 - 8);
        for (const l of live) {
            if (!l.ms.length) continue;
            const { m, sd } = meanSd(l.ms), x = F.X(l.r);
            ctx.strokeStyle = C.c3; ctx.lineWidth = 1.4;
            line(ctx, x, F.Y(Math.max(-0.08, m - sd)), x, F.Y(Math.min(1.1, m + sd)));
            dot(ctx, x, F.Y(m), 4.5, C.c3);
        }
        const lx = F.x0 + 8, ly = F.Y(0.86);
        ctx.strokeStyle = C.c1; ctx.lineWidth = 2; line(ctx, lx, ly, lx + 22, ly);
        text(ctx, "annealed", lx + 28, ly, { base: "middle", px: 11.5 });
        ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; line(ctx, lx, ly + 17, lx + 22, ly + 17); ctx.setLineDash([]);
        text(ctx, "typical", lx + 28, ly + 17, { base: "middle", px: 11.5 });
    });

    const right = stageCanvas(root.querySelector("#basins-eps"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const F = plotFrame(40, 36, w - 14, h - 42, { xmin: 0, xmax: 1, ymin: -2, ymax: 3.2 });
        drawAxes(ctx, F, { x: [0, 0.25, 0.5, 0.75, 1].map(v => [v, String(v)]), y: [-2, -1, 0, 1, 2, 3].map(v => [v, String(v)]) }, { xlabel: "starting overlap r" });
        text(ctx, "storage exponent ε(r): P_c ~ e^(N ε)", 12, 18, { px: 12.5 });
        ctx.strokeStyle = C.axis; ctx.lineWidth = 1.2; line(ctx, F.x0, F.Y(0), F.x1, F.Y(0));
        const col = { 2: mix(C.stageBg, C.c1, 0.45), 3: C.c1, 4: C.ink };
        for (const e of eps) {
            ctx.strokeStyle = col[e.l]; ctx.lineWidth = e.l === 3 ? 2 : 1.5;
            polyline(ctx, F, rs, e.ann);
            ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2; polyline(ctx, F, rs, e.typ); ctx.setLineDash([]);
            text(ctx, `L = ${e.l}`, F.X(1) - 4, F.Y(e.ann.at(-1)) - 6, { align: "right", base: "bottom", px: 11.5, color: e.l === 3 ? C.c1Ink : C.ink2 });
        }
        const r = rS.value / 100;
        ctx.strokeStyle = alpha(C.c3, 0.7); ctx.lineWidth = 1; line(ctx, F.X(r), F.y0, F.X(r), F.y1);
        for (const e of eps) { const v = epsAnn(e.l, r); if (v > -2) dot(ctx, F.X(r), F.Y(v), e.l === 3 ? 4.5 : 3, e.l === 3 ? C.c3 : col[e.l]); }
        text(ctx, "solid: annealed · dashed: typical", F.x0 + 8, F.y0 + 14, { px: 11.5 });
    });

    function report() {
        const r = rS.value / 100;
        root.querySelector("#basins-d").textContent = `${(50 * (1 - r)).toFixed(0)}%`;
        const fa = epsAnn(L, r), ft = epsTyp(L, r);
        const sgn = v => v.toFixed(2).replace("-", "−");
        root.querySelector("#basins-eps-v").textContent = `${sgn(fa)} · ${sgn(ft)}`;
        const l = live.find(x => Math.abs(x.r - r) < 1e-9);
        const you = root.querySelector("#basins-you");
        if (l && l.ms.length) {
            const { m, sd, n } = meanSd(l.ms);
            you.textContent = `${m.toFixed(2)} ± ${sd.toFixed(2)} · ${n} start${n > 1 ? "s" : ""}${mc.busy ? "…" : ""}`;
        } else you.textContent = "press Run";
    }

    const rS = range(root.querySelector("#basins-r"), root.querySelector("#basins-r-out"), () => { report(); left.redraw(); right.redraw(); }, v => (v / 100).toFixed(2));
    root.querySelector("#basins-run-btn").addEventListener("click", () => {
        const r = rS.value / 100;
        live = live.filter(x => Math.abs(x.r - r) > 1e-9 && x.ms.length >= TRIALS);
        const entry = { r, ms: [] };
        live.push(entry);
        report();
        mc.run({ N, L, P, r, steps: 1, trials: TRIALS }, ms => { entry.ms = ms.slice(); report(); left.redraw(); }, () => report());
    });
    report();
}

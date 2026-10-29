/* Chapter 3: the dreaming kernel as a spectral filter, and what it does to recall. */
import { stageCanvas, range, colors } from "./ui.js?v=20261029a";
import { kernel, eigenvalues } from "./hopfield.js?v=20261029a";
import { layer, trajectory, recallRate, player, later, N, CUES } from "./recall.js?v=20261029a";
import { plotFrame, drawAxes, text, alpha, sliderToT, fmtT } from "./draw.js?v=20261029a";

const BINS = 36;

export function init(el) {
    let K = 120, t = 0, L = null, A = null, lam = null, seed = 3;
    const out = id => document.getElementById(id);

    const spec = stageCanvas(out("sleep-spec"), (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        if (!lam) return;
        const C = colors();
        const xmax = Math.max(2, lam[lam.length - 1] * 1.08);
        const eff = Array.from(lam, l => (t === 0 ? l : ((1 + t) * l) / (1 + t * l)));
        const hist = arr => {
            const b = new Float64Array(BINS);
            for (const v of arr) b[Math.min(BINS - 1, Math.max(0, Math.floor((v / xmax) * BINS)))]++;
            return b;
        };
        const h0 = hist(lam), h1 = hist(eff);
        // scale to the awake spectrum; a sleep spike taller than that is clipped and labelled
        const ymax = Math.max(...h0) * 1.6;
        const P = plotFrame(30, 40, w - 16, h - 40, { xmin: 0, xmax, ymin: 0, ymax });
        const ticks = [[0, "0"], [1, "1"], [2, "2"]];
        if (xmax > 3.2) ticks.push([3, "3"]);
        drawAxes(ctx, P, { x: ticks }, { xlabel: "strength of a stored direction" });
        text(ctx, "how many directions", P.x0, P.y0 - 14, { base: "bottom", px: 12 });
        const bw = (P.x1 - P.x0) / BINS;
        // after sleep: filled; awake: outline
        ctx.fillStyle = alpha(C.c1, 0.75);
        h1.forEach((c, k) => {
            if (!c) return;
            const top = P.Y(Math.min(c, ymax));
            ctx.fillRect(P.x0 + k * bw + 0.5, top, bw - 1, P.y1 - top);
            if (c > ymax) text(ctx, `${c} ↑`, P.x0 + (k + 0.5) * bw + 6, top + 4, { base: "top", color: C.c1Ink, px: 11.5 });
        });
        ctx.strokeStyle = C.c3; ctx.lineWidth = 1.5;
        ctx.beginPath();
        let y = P.y1;
        ctx.moveTo(P.x0, y);
        h0.forEach((c, k) => { const yy = P.Y(c); ctx.lineTo(P.x0 + k * bw, yy); ctx.lineTo(P.x0 + (k + 1) * bw, yy); });
        ctx.lineTo(P.x1, P.y1);
        ctx.stroke();
        // legend
        const lx = P.x1 - 4;
        ctx.fillStyle = C.c3; ctx.fillRect(lx - 118, P.y0 - 4, 14, 2);
        text(ctx, "awake", lx - 98, P.y0 - 3, { base: "middle", color: C.ink2, px: 11.5 });
        ctx.fillStyle = alpha(C.c1, 0.75); ctx.fillRect(lx - 118, P.y0 + 10, 14, 9);
        text(ctx, t === 0 ? "after sleep (t = 0)" : "after sleep", lx - 98, P.y0 + 15, { base: "middle", color: C.ink2, px: 11.5 });
    });

    const rec = player(out("sleep-grid"), () => {});

    const recompute = () => {
        A = kernel(L.C, K, t);
        spec.redraw();
        go();
        rate();
    };
    const rebuild = () => {
        L = layer(K);
        lam = eigenvalues(L.C, K);
        out("sleep-alpha").textContent = (K / N).toFixed(2);
        awake();
        recompute();
    };
    const go = () => rec.play(trajectory(L, A, (seed++ * 53) % K, seed * 211));
    const awake = later(() => { out("sleep-awake").textContent = `${recallRate(L, kernel(L.C, K, 0))} / ${CUES}`; }, 30);
    const rate = later(() => { out("sleep-rate").textContent = `${recallRate(L, A)} / ${CUES}`; }, 30);

    range(out("sleep-t"), out("sleep-t-out"), later(v => { t = sliderToT(v); recompute(); }, 50), v => fmtT(sliderToT(v)));
    range(out("sleep-K"), out("sleep-K-out"), later(v => { K = v; rebuild(); }, 80));
    out("sleep-go").addEventListener("click", go);
    rebuild();
}

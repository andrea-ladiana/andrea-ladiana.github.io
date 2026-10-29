/* Chapter 2: plain Hebbian recall (t = 0) as the number of memories grows. */
import { stageCanvas, range, colors } from "./ui.js?v=20261029a";
import { kernel } from "./hopfield.js?v=20261029a";
import { layer, trajectory, recallRate, player, later, N, STEPS, CUES, SUCCESS } from "./recall.js?v=20261029a";
import { plotFrame, drawAxes, polyline, text, alpha } from "./draw.js?v=20261029a";

export function init(el) {
    let K = 40, L = null, A = null, seed = 1;
    const out = id => document.getElementById(id);

    const plot = stageCanvas(out("crowd-plot"), (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const tr = rec.traj;
        if (!tr) return;
        const C = colors(), i = rec.step;
        // top: overlap with the cued memory, step by step
        const P = plotFrame(44, 34, w - 16, h * 0.46, { xmin: 0, xmax: STEPS, ymin: -0.2, ymax: 1 });
        drawAxes(ctx, P, { x: [[0, "0"], [STEPS / 2, String(STEPS / 2)], [STEPS, String(STEPS)]], y: [[0, "0"], [0.5, "0.5"], [1, "1"]] }, { ylabel: "overlap with the cued memory", xlabel: "step" });
        ctx.strokeStyle = alpha(C.c2, 0.35); ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(P.x0, P.Y(SUCCESS)); ctx.lineTo(P.x1, P.Y(SUCCESS)); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = C.c2; ctx.lineWidth = 2;
        polyline(ctx, P, tr.m.slice(0, i + 1).map((_, k) => k), tr.m.slice(0, i + 1));
        ctx.fillStyle = C.c2;
        ctx.beginPath(); ctx.arc(P.X(i), P.Y(tr.m[i]), 3.5, 0, 2 * Math.PI); ctx.fill();

        // bottom: overlap with every stored memory right now
        const y0 = h * 0.62, y1 = h - 26, x0 = 44, x1 = w - 16;
        const Q = plotFrame(x0, y0, x1, y1, { xmin: 0, xmax: K, ymin: -0.25, ymax: 1 });
        drawAxes(ctx, Q, { y: [[0, "0"], [1, "1"]] }, { ylabel: "overlap with each of the " + K + " memories" });
        const bw = (x1 - x0) / K;
        const all = tr.all[i];
        for (let nu = 0; nu < K; nu++) {
            const v = all[nu];
            ctx.fillStyle = nu === tr.mu ? C.c1 : alpha(C.ink2, 0.55);
            const ya = Q.Y(Math.max(0, v)), yb = Q.Y(Math.min(0, v));
            ctx.fillRect(x0 + nu * bw + bw * 0.12, ya, Math.max(1, bw * 0.76), Math.max(1, yb - ya));
        }
        text(ctx, "cued", Q.X(tr.mu + 0.5), Q.Y(Math.max(0, all[tr.mu])) - 4, { align: "center", color: C.c1Ink, px: 11 });
    });

    const rec = player(out("crowd-grid"), i => {
        plot.redraw();
        if (rec.traj) out("crowd-m").textContent = rec.traj.m[i].toFixed(2);
    });

    const rebuild = () => {
        L = layer(K);
        A = kernel(L.C, K, 0);
        out("crowd-alpha").textContent = (K / N).toFixed(2);
        go();
        rate();
    };
    const go = () => rec.play(trajectory(L, A, (seed++ * 37) % K, seed * 101));
    const rate = later(() => { out("crowd-rate").textContent = `${recallRate(L, A)} / ${CUES}`; }, 30);

    range(out("crowd-K"), out("crowd-K-out"), later(v => { K = v; rebuild(); }, 80));
    out("crowd-go").addEventListener("click", go);
    rebuild();
}

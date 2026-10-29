/* Chapter 6: examples needed versus sleep (the paper's Fig. 3a) and the optimal sleep time (§5). */
import { stageCanvas, range, colors, pointer, tooltip } from "./ui.js?v=20261029a";
import { plotFrame, drawAxes, polyline, text, alpha } from "./draw.js?v=20261029a";
import { snr2, hebb, projector, optimum } from "./s2n.js?v=20261029a";

export function init(el, data) {
    const { series } = data.saving;
    const poor = series.find(s => s.r === 0.3), good = series.find(s => s.r === 0.7);
    const out = id => document.getElementById(id);

    /* ---------- examples needed ---------- */
    let cur = 22; // index into the t grid (t ≈ 2)
    const cv = out("data-canvas");
    const frameOf = (w, h) => plotFrame(54, 36, w - 24, h - 44, { xmin: 0.125, xmax: 256, ymin: 4, ymax: 160, xlog: true, ylog: true });
    const stage = stageCanvas(cv, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const C = colors(), P = frameOf(w, h);
        drawAxes(ctx, P, {
            x: [[0.125, "0.125"], [1, "1"], [8, "8"], [64, "64"], [256, "256"]],
            y: [[5, "5"], [10, "10"], [20, "20"], [50, "50"], [100, "100"]],
        }, { xlabel: "sleep t", ylabel: "examples needed per memory" });
        for (const [s, col, lab] of [[poor, C.c3, "poor data, r = 0.3"], [good, C.c1, "good data, r = 0.7"]]) {
            // band of ± one standard deviation over the 15 runs
            ctx.fillStyle = alpha(col, 0.13);
            ctx.beginPath();
            s.t.forEach((t, k) => { const x = P.X(t), y = P.Y(Math.min(160, s.Mc[k] + s.sd[k])); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
            for (let k = s.t.length - 1; k >= 0; k--) ctx.lineTo(P.X(s.t[k]), P.Y(Math.max(4, s.Mc[k] - s.sd[k])));
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = col; ctx.lineWidth = 2;
            polyline(ctx, P, s.t, s.Mc);
            text(ctx, lab, P.X(s.t[s.t.length - 1]), P.Y(s.Mc[s.Mc.length - 1]) - 10, { align: "right", base: "bottom", color: col, px: 12, weight: 500 });
        }
        // cursor
        const t = poor.t[cur], x = Math.round(P.X(t)) + 0.5;
        ctx.strokeStyle = alpha(C.ink2, 0.5); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, P.y0); ctx.lineTo(x, P.y1); ctx.stroke(); ctx.setLineDash([]);
        for (const [s, col] of [[poor, C.c3], [good, C.c1]]) {
            ctx.fillStyle = C.surface; ctx.strokeStyle = col; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, P.Y(s.Mc[cur]), 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        }
    });
    const show = () => {
        out("data-t").textContent = poor.t[cur] < 1 ? poor.t[cur].toFixed(2) : poor.t[cur].toFixed(1);
        out("data-lo").textContent = `${Math.round(poor.Mc[cur])} (${Math.round(poor.Mc[0])} at t = 0.125)`;
        out("data-hi").textContent = `${Math.round(good.Mc[cur])} (${Math.round(good.Mc[0])} at t = 0.125)`;
        out("data-s").textContent = `${Math.round(100 * (1 - poor.Mc[cur] / poor.Mc[0]))}% · ${Math.round(100 * (1 - good.Mc[cur] / good.Mc[0]))}%`;
        stage.redraw();
    };
    const tip = tooltip(out("data-tip"));
    const near = ev => {
        const [px] = pointer(cv, ev), t = frameOf(stage.w, stage.h).invX(px);
        let k = 0;
        poor.t.forEach((v, i) => { if (Math.abs(Math.log(v / t)) < Math.abs(Math.log(poor.t[k] / t))) k = i; });
        return k;
    };
    cv.addEventListener("pointermove", ev => {
        cur = near(ev); show();
        const P = frameOf(stage.w, stage.h);
        tip.show(P.X(poor.t[cur]), P.Y(poor.Mc[cur]), `t = ${poor.t[cur].toFixed(2)} · ${Math.round(poor.Mc[cur])} and ${Math.round(good.Mc[cur])} examples`);
    });
    cv.addEventListener("pointerleave", () => tip.hide());
    show();

    /* ---------- how long to sleep ---------- */
    let a = 0.8, rho = 0.05;
    const rhoOf = v => 0.005 * 100 ** (v / 100);
    const snr = stageCanvas(out("snr-canvas"), (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const C = colors();
        const ts = Array.from({ length: 240 }, (_, k) => 10 ** (-2 + (7 * k) / 239));
        const ys = ts.map(t => snr2(a, rho, t));
        const opt = optimum(a, rho), h0 = hebb(a, rho), hi = projector(a, rho);
        const ymax = Math.max(opt.s2, h0, hi, 1) * 1.15;
        const P = plotFrame(54, 36, w - 24, h - 44, { xmin: 0.01, xmax: 1e5, ymin: 0, ymax, xlog: true });
        const step = ymax > 40 ? 20 : ymax > 16 ? 5 : ymax > 6 ? 2 : 1;
        const yt = [];
        for (let v = 0; v <= ymax; v += step) yt.push([v, String(v)]);
        drawAxes(ctx, P, { x: [[0.01, "0.01"], [1, "1"], [100, "100"], [1e4, "10⁴"]], y: yt }, { xlabel: "sleep t", ylabel: "signal-to-noise ratio²" });
        const hline = (v, col, dash, lab, above = true) => {
            ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(P.x0, P.Y(v)); ctx.lineTo(P.x1, P.Y(v)); ctx.stroke(); ctx.setLineDash([]);
            text(ctx, lab, P.x1 - 4, P.Y(v) + (above ? -4 : 4), { align: "right", base: above ? "bottom" : "top", color: col, px: 11.5 });
        };
        hline(1, alpha(C.ink2, 0.6), [2, 4], "recall threshold", h0 > 1.4 || h0 < 0.7);
        hline(hi, alpha(C.c1, 0.8), [6, 4], "endless sleep", hi > opt.s2 - (ymax * 0.06) ? false : true);
        ctx.strokeStyle = C.c1; ctx.lineWidth = 2.2;
        polyline(ctx, P, ts, ys);
        ctx.fillStyle = C.c3;
        ctx.beginPath(); ctx.arc(P.X(ts[0]), P.Y(h0), 4, 0, 2 * Math.PI); ctx.fill();
        text(ctx, "awake", P.X(ts[0]) + 8, P.Y(h0) + 4, { base: "top", color: C.c3Ink, px: 11.5 });
        // the optimum
        const ox = P.X(opt.t), oy = P.Y(opt.s2);
        ctx.fillStyle = C.c1; star(ctx, ox, oy, 7);
        text(ctx, `best t ≈ ${opt.t < 10 ? opt.t.toFixed(1) : Math.round(opt.t)}`, ox, oy - 12, { align: "center", base: "bottom", color: C.c1Ink, px: 12, weight: 500 });

        out("snr-hebb").textContent = h0.toFixed(2);
        out("snr-inf").textContent = hi.toFixed(2);
        const gain = opt.s2 / hi - 1;
        out("snr-best").textContent = `${opt.s2.toFixed(2)} at t ≈ ${opt.t < 10 ? opt.t.toFixed(1) : Math.round(opt.t)}` + (gain > 0.005 ? ` (+${Math.round(100 * gain)}% over endless)` : "");
    });
    range(out("snr-a"), out("snr-a-out"), v => { a = v / 100; snr.redraw(); }, v => (v / 100).toFixed(2));
    range(out("snr-rho"), out("snr-rho-out"), v => { rho = rhoOf(v); snr.redraw(); }, v => { const r = rhoOf(v); return r < 0.1 ? r.toFixed(3) : r.toFixed(2); });
}

function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
        k ? ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) : ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath(); ctx.fill();
}

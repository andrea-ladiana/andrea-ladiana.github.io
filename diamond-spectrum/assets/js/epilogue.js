/* Epilogue · the butterfly: spectra of D_3^(b) stacked for b = 2…12, with the first rungs as curves in b. */
import { rootsOfQ } from "./lattice.js?v=20261029a";
import { stageCanvas, seg, tooltip, pointer, colors, alpha, mix, fmtNum, fmtInt } from "./ui.js?v=20261029a";
import { lambdaScale, drawLambdaAxis } from "./axis.js?v=20261029a";

export function init(root, data) {
    const $ = id => root.querySelector("#" + id);
    const tip = tooltip($("fly-tip"));
    const bs = Object.keys(data.butterfly).map(Number).sort((a, b) => a - b);
    let log = true, curves = true, ticks = [];

    // rung curves for continuous b: Q_1 in closed form, Q_2 by root finding
    const grid = [];
    for (let b = bs[0]; b <= bs.at(-1) + 1e-9; b += 0.05) grid.push(b);
    const q1 = grid.map(b => [b, [b + 1 - Math.sqrt(b * b + 1), b + 1 + Math.sqrt(b * b + 1)]]);
    const q2 = grid.map(b => [b, rootsOfQ(b, 2, -1, 2 * b * b + 6, 6000)]);

    const stage = stageCanvas($("fly-canvas"), draw);

    function draw(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        const C = colors();
        const hi = log ? 2400 : 14;
        const S = lambdaScale(hi, 44, w - 18, { log });
        const top = 50, base = h - 38;
        const Yb = b => base - 10 - ((base - 10 - top) * (b - bs[0])) / (bs.at(-1) - bs[0]);
        drawLambdaAxis(ctx, S, base, { grid: [top - 10, base] });
        ctx.font = "11.5px " + getComputedStyle(document.body).fontFamily;
        ctx.fillStyle = C.muted; ctx.textAlign = "right"; ctx.textBaseline = "middle";
        for (const b of bs) ctx.fillText(`b=${b}`, 38, Yb(b));

        ctx.save();
        ctx.beginPath(); ctx.rect(44, 0, w - 62, h); ctx.clip();
        if (curves) {
            const curve = (pts, idx, col) => {
                ctx.strokeStyle = col; ctx.lineWidth = 1.4;
                ctx.beginPath();
                let started = false;
                for (const [b, roots] of pts) {
                    const r = roots[idx];
                    if (r === undefined || r > hi) { started = false; continue; }
                    started ? ctx.lineTo(S.X(r), Yb(b)) : ctx.moveTo(S.X(r), Yb(b));
                    started = true;
                }
                ctx.stroke();
            };
            ctx.strokeStyle = alpha(C.c3, 0.7); ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(S.X(2), Yb(bs[0])); ctx.lineTo(S.X(2), Yb(bs.at(-1))); ctx.stroke();
            for (let i = 0; i < 2; i++) curve(q1, i, alpha(C.c1, 0.55));
            for (let i = 0; i < 4; i++) curve(q2, i, alpha(C.c2, 0.5));
        }

        ticks = [];
        let maxM = 1;
        for (const b of bs) for (const [, m] of data.butterfly[b]) maxM = Math.max(maxM, m);
        const tickH = Math.max(5, Math.min(14, ((base - top) / (bs.length - 1)) * 0.7));
        for (const b of bs) {
            const y = Yb(b);
            for (const [lam, m, k] of data.butterfly[b]) {
                if (lam > hi) continue;
                const x = S.X(lam);
                const t = Math.log(m) / Math.log(maxM);
                ctx.strokeStyle = k === "ext" ? alpha(C.ink2, 0.5) : mix(C.c2, C.c3, t);
                ctx.lineWidth = k === "ext" ? 1 : 1.6 + 1.6 * t;
                ctx.beginPath(); ctx.moveTo(x, y - tickH / 2); ctx.lineTo(x, y + tickH / 2); ctx.stroke();
                ticks.push({ x, y, b, lam, m, k });
            }
        }
        ctx.restore();
        if (curves) {
            ctx.textBaseline = "bottom"; ctx.textAlign = "left";
            ctx.fillStyle = C.c3Ink; ctx.fillText("rung 0", S.X(2) + 4, top - 12);
            const r1 = q1.at(-1)[1][1];
            if (r1 <= hi) { ctx.fillStyle = C.c1Ink; ctx.textAlign = "right"; ctx.fillText("rung 1", S.X(r1), top - 12); }
        }
    }

    const cv = $("fly-canvas");
    cv.addEventListener("pointermove", ev => {
        const [mx, my] = pointer(cv, ev);
        let best = null, bd = 64;
        for (const t of ticks) { const d = (t.x - mx) ** 2 + ((t.y - my) * 0.5) ** 2; if (d < bd) { bd = d; best = t; } }
        if (!best) return tip.hide();
        const origin = best.k === "ext" ? "an extended mode" : `rung ${best.k}`;
        tip.show(best.x, best.y - 6, `b = ${best.b} · λ = ${fmtNum(best.lam, 6)}<br>${fmtInt(best.m)} mode${best.m > 1 ? "s" : ""} · ${origin}`);
    });
    cv.addEventListener("pointerleave", () => tip.hide());

    seg($("fly-scale"), v => { log = v === "log"; stage.redraw(); });
    $("fly-curves").addEventListener("change", e => { curves = e.target.checked; stage.redraw(); });
    stage.redraw();
}

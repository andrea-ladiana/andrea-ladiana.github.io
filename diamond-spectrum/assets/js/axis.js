/* λ axes: symmetric-log (whole spectrum) or linear (close-up). */
import { symlog, symlogInv } from "./lattice.js?v=20261029a";
import { colors } from "./ui.js?v=20261029a";

const NICE = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

export function lambdaScale(hi, px0, px1, { log = true, lo = 0 } = {}) {
    const f = log ? x => symlog(x) : x => x;
    const finv = log ? y => symlogInv(y) : y => y;
    const a = f(lo), b = f(hi);
    const X = x => px0 + ((f(x) - a) / (b - a)) * (px1 - px0);
    const inv = px => finv(a + ((px - px0) / (px1 - px0)) * (b - a));
    let ticks;
    if (log) ticks = NICE.filter(t => t >= lo && t <= hi);
    else {
        const step = hi - lo > 40 ? 10 : hi - lo > 12 ? 2 : 1;
        ticks = [];
        for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
    }
    return { X, inv, ticks, lo, hi };
}

/** Horizontal λ axis with tick labels at height y. */
export function drawLambdaAxis(ctx, S, y, { label = "λ", grid = null } = {}) {
    const C = colors();
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(S.X(S.lo), y + 0.5); ctx.lineTo(S.X(S.hi), y + 0.5); ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = "11.5px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    let last = -Infinity;
    for (const t of S.ticks) {
        const x = Math.round(S.X(t)) + 0.5;
        // skip labels that would collide on narrow screens
        if (x - last < 9 + 6.5 * String(t).length) continue;
        last = x;
        if (grid) {
            ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(x, grid[0]); ctx.lineTo(x, grid[1]); ctx.stroke();
        }
        ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 4); ctx.stroke();
        ctx.fillText(String(t), x, y + 6);
    }
    if (label) { ctx.textAlign = "right"; ctx.fillText(label, S.X(S.hi), y + 20); }
}

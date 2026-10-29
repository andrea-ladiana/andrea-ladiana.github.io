/* The (α, β) plane with a fisheye (symmetric-log) view, shared by chapters 4 and 6. */
import { symlog, symlogInv } from "./lattice.js?v=20261029a";
import { colors, alpha } from "./ui.js?v=20261029a";

const C0 = 1.5; // linear core of the fisheye

export function planeView(w, h, { amax = 60, bmin = -60, bmax = 400, pad = 30 } = {}) {
    const ax0 = symlog(-amax, C0), ax1 = symlog(amax, C0);
    const by0 = symlog(bmin, C0), by1 = symlog(bmax, C0);
    const sx = (w - 2 * pad) / (ax1 - ax0), sy = (h - 2 * pad) / (by1 - by0);
    return {
        X: a => pad + (symlog(a, C0) - ax0) * sx,
        Y: be => h - pad - (symlog(be, C0) - by0) * sy,
        invX: x => symlogInv(ax0 + (x - pad) / sx, C0),
        invY: y => symlogInv(by0 + (h - pad - y) / sy, C0),
        amax, bmin, bmax, w, h, pad,
    };
}

/** Axes, the singular line S = {β = 2α} (dashed), the parameter line α = 1 (dotted) and the two special points. */
export function drawPlaneFrame(ctx, P, { field = null } = {}) {
    const C = colors();
    const font = "11.5px " + getComputedStyle(document.body).fontFamily;
    ctx.font = font;

    if (field) drawField(ctx, P, field);

    // grid at 0, ±1, ±10, ±100
    ctx.lineWidth = 1;
    for (const v of [-100, -10, -1, 1, 10, 100]) {
        if (Math.abs(v) <= P.amax) { ctx.strokeStyle = C.grid; line(ctx, P.X(v), P.pad, P.X(v), P.h - P.pad); }
        if (v >= P.bmin && v <= P.bmax) { ctx.strokeStyle = C.grid; line(ctx, P.pad, P.Y(v), P.w - P.pad, P.Y(v)); }
    }
    ctx.strokeStyle = C.axis;
    line(ctx, P.X(0), P.pad, P.X(0), P.h - P.pad);
    line(ctx, P.pad, P.Y(0), P.w - P.pad, P.Y(0));
    ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const v of [-10, -1, 1, 10]) if (Math.abs(v) <= P.amax) ctx.fillText(String(v), P.X(v), P.Y(0) + 4);
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const v of [1, 10, 100]) if (v <= P.bmax) ctx.fillText(String(v), P.X(0) - 5, P.Y(v));
    ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.fillText("α", P.w - P.pad, P.Y(0) - 3);
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("β", P.X(0) + 5, P.pad - 2);

    // parameter line α = 1: where every note starts
    ctx.strokeStyle = alpha(C.c1, 0.55); ctx.setLineDash([1.5, 4]); ctx.lineWidth = 1.5;
    line(ctx, P.X(1), P.pad, P.X(1), P.h - P.pad);
    // singular line β = 2α
    ctx.strokeStyle = C.c3; ctx.setLineDash([7, 5]); ctx.lineWidth = 2;
    ctx.beginPath();
    const a0 = Math.max(-P.amax, P.bmin / 2), a1 = Math.min(P.amax, P.bmax / 2);
    for (let i = 0; i <= 400; i++) {
        const a = a0 + ((a1 - a0) * i) / 400;
        const x = P.X(a), y = P.Y(2 * a);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // (−1, 0) and the fixed point (1, 0)
    for (const [a, lab] of [[-1, "(−1, 0)"], [1, "(1, 0) fixed"]]) {
        ctx.fillStyle = C.surface; ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(P.X(a), P.Y(0), 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.ink2; ctx.textAlign = a < 0 ? "right" : "left"; ctx.textBaseline = "bottom";
        ctx.fillText(lab, P.X(a) + (a < 0 ? -6 : 6), P.Y(0) - 5);
    }
}

function line(ctx, x0, y0, x1, y1) {
    ctx.beginPath(); ctx.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5); ctx.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5); ctx.stroke();
}

/** Faint displacement field p → Φ(p), drawn as short unit strokes in screen space. */
function drawField(ctx, P, phiFn) {
    const C = colors();
    ctx.strokeStyle = alpha(C.ink2, 0.13); ctx.lineWidth = 1;
    const step = 26;
    ctx.beginPath();
    for (let x = P.pad + step / 2; x < P.w - P.pad; x += step) {
        for (let y = P.pad + step / 2; y < P.h - P.pad; y += step) {
            const a = P.invX(x), be = P.invY(y);
            const [a2, b2] = phiFn(a, be);
            let dx = P.X(clamp(a2, -P.amax, P.amax)) - x, dy = P.Y(clamp(b2, P.bmin, P.bmax)) - y;
            const n = Math.hypot(dx, dy);
            if (n < 1e-6) continue;
            dx = (dx / n) * 8; dy = (dy / n) * 8;
            ctx.moveTo(x - dx / 2, y - dy / 2); ctx.lineTo(x + dx / 2, y + dy / 2);
        }
    }
    ctx.stroke();
    ctx.fillStyle = alpha(C.ink2, 0.2);
    for (let x = P.pad + step / 2; x < P.w - P.pad; x += step) {
        for (let y = P.pad + step / 2; y < P.h - P.pad; y += step) {
            const [a2, b2] = phiFn(P.invX(x), P.invY(y));
            let dx = P.X(clamp(a2, -P.amax, P.amax)) - x, dy = P.Y(clamp(b2, P.bmin, P.bmax)) - y;
            const n = Math.hypot(dx, dy);
            if (n < 1e-6) continue;
            ctx.fillRect(x + (dx / n) * 4 - 1, y + (dy / n) * 4 - 1, 2, 2);
        }
    }
}

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

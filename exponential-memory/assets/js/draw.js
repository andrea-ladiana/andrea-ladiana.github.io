/* Drawing helpers shared by the chapters: neuron grids, plot frames, log axes. */
import { colors, mix, alpha } from "./ui.js?v=20261029a";

export const font = (px = 11.5, weight = 400) => `${weight} ${px}px ${getComputedStyle(document.body).fontFamily}`;
export const mono = (px = 11.5) => `400 ${px}px ${getComputedStyle(document.body).getPropertyValue("--font-mono") || "monospace"}`;

/**
 * A rows×cols grid of ±1 neurons (or grey levels in [-1, 1] when grey = true),
 * read from v starting at offset o. target paints disagreeing neurons in the error colour.
 */
export function drawPattern(ctx, v, rows, cols, x, y, w, h, { o = 0, target = null, to = 0, grey = false, frame = true, ink = null } = {}) {
    const C = colors();
    const on = ink || C.ink, off = C.surface2;
    const cw = w / cols, ch = h / rows;
    ctx.fillStyle = off;
    ctx.fillRect(x, y, w, h);
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            const i = r * cols + c, s = v[o + i];
            let fill = null;
            if (target && s !== target[to + i]) fill = C.c3;
            else if (grey) fill = s <= -1 ? null : mix(off, on, Math.min(1, (s + 1) / 2));
            else if (s > 0) fill = on;
            if (!fill) continue;
            ctx.fillStyle = fill;
            // overlap by a hair so no seams show between cells
            ctx.fillRect(x + c * cw, y + r * ch, cw + 0.4, ch + 0.4);
        }
    if (frame) {
        ctx.strokeStyle = C.line; ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(w) + 1, Math.round(h) + 1);
    }
}

export function text(ctx, s, x, y, { align = "left", base = "alphabetic", color = null, px = 12, weight = 400, mono: m = false } = {}) {
    ctx.font = m ? mono(px) : font(px, weight);
    ctx.fillStyle = color || colors().muted;
    ctx.textAlign = align; ctx.textBaseline = base;
    ctx.fillText(s, x, y);
}

export function line(ctx, x0, y0, x1, y1) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

/** A rectangular plot area with linear or log axes. Returns mapping helpers. */
export function plotFrame(x0, y0, x1, y1, { xmin, xmax, ymin, ymax, xlog = false, ylog = false }) {
    const fx = xlog ? Math.log10 : v => v, fy = ylog ? Math.log10 : v => v;
    const ax = fx(xmin), bx = fx(xmax), ay = fy(ymin), by = fy(ymax);
    return {
        x0, y0, x1, y1,
        X: v => x0 + ((fx(v) - ax) / (bx - ax)) * (x1 - x0),
        Y: v => y1 - ((fy(v) - ay) / (by - ay)) * (y1 - y0),
        invX: px => { const u = ax + ((px - x0) / (x1 - x0)) * (bx - ax); return xlog ? 10 ** u : u; },
        xmin, xmax, ymin, ymax,
    };
}

/** Grid lines and tick labels. ticks: { x: [[value, label]], y: [[value, label]] }. */
export function drawAxes(ctx, P, ticks, { xlabel = "", ylabel = "" } = {}) {
    const C = colors();
    ctx.lineWidth = 1;
    for (const [v, lab] of ticks.x || []) {
        const x = Math.round(P.X(v)) + 0.5;
        ctx.strokeStyle = C.grid; line(ctx, x, P.y0, x, P.y1);
        text(ctx, lab, x, P.y1 + 6, { align: "center", base: "top", px: 11.5 });
    }
    for (const [v, lab] of ticks.y || []) {
        const y = Math.round(P.Y(v)) + 0.5;
        ctx.strokeStyle = C.grid; line(ctx, P.x0, y, P.x1, y);
        text(ctx, lab, P.x0 - 6, y, { align: "right", base: "middle", px: 11.5 });
    }
    ctx.strokeStyle = C.axis;
    line(ctx, P.x0, P.y1 + 0.5, P.x1, P.y1 + 0.5);
    line(ctx, P.x0 - 0.5, P.y0, P.x0 - 0.5, P.y1);
    if (xlabel) text(ctx, xlabel, P.x1, P.y1 + 22, { align: "right", base: "top", px: 12 });
    if (ylabel) text(ctx, ylabel, P.x0, P.y0 - 8, { align: "left", base: "bottom", px: 12 });
}

/** A polyline through data points, skipping non-finite values. */
export function polyline(ctx, P, xs, ys) {
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < xs.length; i++) {
        if (!isFinite(ys[i])) { pen = false; continue; }
        const x = P.X(xs[i]), y = P.Y(ys[i]);
        pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        pen = true;
    }
    ctx.stroke();
}

/** A filled dot with a thin halo in the stage colour, so it reads over lines. */
export function dot(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, 2 * Math.PI); ctx.fillStyle = colors().stageBg; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = fill; ctx.fill();
}

/** Ticks at powers of ten between lo and hi, labelled 1, 10, 100, 1k, ... */
export function logTicks(lo, hi) {
    const out = [];
    for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) {
        const v = 10 ** e;
        out.push([v, v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : String(v)]);
    }
    return out;
}

export { alpha, mix };

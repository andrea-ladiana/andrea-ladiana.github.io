/* Drawing helpers shared by the chapters: neuron grids, plot frames, log axes. */
import { colors, mix, alpha } from "./ui.js?v=20261029a";

export const font = (px = 11.5, weight = 400) => `${weight} ${px}px ${getComputedStyle(document.body).fontFamily}`;

/**
 * A square grid of ±1 neurons (or grey levels in [-1, 1] when grey = true).
 * target, if given, paints the neurons that disagree with it in the error colour.
 */
export function drawPattern(ctx, v, side, x, y, size, { target = null, to = 0, grey = false, frame = true, ink = null } = {}) {
    const C = colors();
    const on = ink || C.ink, off = C.surface2;
    const cell = size / side;
    ctx.fillStyle = off;
    ctx.fillRect(x, y, size, size);
    for (let r = 0; r < side; r++)
        for (let c = 0; c < side; c++) {
            const i = r * side + c, s = v[i];
            let fill = null;
            if (target && s !== target[to + i]) fill = C.c3;
            else if (grey) fill = s <= -1 ? null : mix(off, on, Math.min(1, (s + 1) / 2));
            else if (s > 0) fill = on;
            if (!fill) continue;
            ctx.fillStyle = fill;
            // overlap by a hair so no seams show between cells
            ctx.fillRect(x + c * cell, y + r * cell, cell + 0.4, cell + 0.4);
        }
    if (frame) {
        ctx.strokeStyle = C.line; ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(size) + 1, Math.round(size) + 1);
    }
}

export function text(ctx, s, x, y, { align = "left", base = "alphabetic", color = null, px = 12, weight = 400 } = {}) {
    ctx.font = font(px, weight);
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

export { alpha, mix };

/** Sleep-time slider: 0 is awake, then log-spaced from 0.01 to 1000. */
export const sliderToT = v => (v <= 0 ? 0 : 10 ** (-2 + (5 * (v - 1)) / 99));
export const fmtT = t => (t === 0 ? "0 (awake)" : t < 0.1 ? t.toFixed(2) : t < 10 ? t.toFixed(1) : t < 100 ? t.toFixed(0) : String(Math.round(t / 10) * 10));

/* Drawing helpers shared by the lattice chapters. */
import { colors, mix, alpha, fitBox } from "./ui.js?v=20261029a";

/** Bounding box of the vertices that pass `keep`. */
export function bounds(pos, n, keep = () => true) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
        if (!keep(i)) continue;
        x0 = Math.min(x0, pos.x[i]); x1 = Math.max(x1, pos.x[i]);
        y0 = Math.min(y0, pos.y[i]); y1 = Math.max(y1, pos.y[i]);
    }
    return { x0, x1, y0, y1 };
}

/** Transform for a lattice layout: roots on a horizontal line, fitted with padding. */
export function latticeTransform(pos, n, w, h, pad = 26) {
    const B = bounds(pos, n);
    return fitBox(B.x0, B.x1, B.y0, B.y1, w, h, pad);
}

/** Colour by generation: roots orange, older vertices deep violet, newest lighter blue-violet. */
export function genColor(gen, L) {
    const C = colors();
    if (gen === 0) return C.c3;
    const t = L <= 1 ? 1 : (gen - 1) / (L - 1);
    return mix(C.c1, C.c2, t * 0.85);
}

/** Degree at level L of a vertex born at generation g (eq. 3). */
export const degreeAt = (b, L, g) => (g === 0 ? b ** L : 2 * b ** (L - g));

/** Node radius that keeps a few thousand vertices legible. */
export function nodeRadius(deg, n, T) {
    const base = Math.max(0.9, Math.min(4.2, 2600 / (n + 400) * Math.min(1, T.s / 500)));
    return base * Math.min(3.2, Math.pow(deg / 2, 0.33));
}

/** Stroke a list of edges with positions px/py (screen arrays). */
export function strokeEdges(ctx, edges, px, py, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [u, v] of edges) { ctx.moveTo(px[u], py[u]); ctx.lineTo(px[v], py[v]); }
    ctx.stroke();
}

export function edgeWidth(m) {
    return m > 3000 ? 0.6 : m > 800 ? 0.8 : m > 200 ? 1.1 : 1.5;
}

/** Screen coordinates for every vertex. */
export function project(pos, n, T) {
    const px = new Float32Array(n), py = new Float32Array(n);
    for (let i = 0; i < n; i++) { px[i] = T.X(pos.x[i]); py[i] = T.Y(pos.y[i]); }
    return { px, py };
}

/** Nearest vertex to (mx, my) within `max` pixels among those passing keep(). */
export function nearestVertex(px, py, n, mx, my, max = 14, keep = () => true) {
    let best = -1, bd = max * max;
    for (let i = 0; i < n; i++) {
        if (!keep(i)) continue;
        const d = (px[i] - mx) ** 2 + (py[i] - my) ** 2;
        if (d < bd) { bd = d; best = i; }
    }
    return best;
}

/** Fill a diamond motif (u, mids…, v) as a soft polygon. */
export function fillMotif(ctx, motif, px, py, color) {
    const { u, v, mids } = motif;
    const order = [...mids].sort((a, b) => side(a) - side(b));
    function side(m) { return (px[v] - px[u]) * (py[m] - py[u]) - (py[v] - py[u]) * (px[m] - px[u]); }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px[u], py[u]);
    ctx.lineTo(px[order[0]], py[order[0]]);
    ctx.lineTo(px[v], py[v]);
    ctx.lineTo(px[order[order.length - 1]], py[order[order.length - 1]]);
    ctx.closePath();
    ctx.fill();
}

/** Draw vertices coloured by an amplitude in [-1, 1] (pos = red, neg = blue, 0 = grey). */
export function drawAmplitudes(ctx, n, px, py, amp, rBase, keep = () => true) {
    const C = colors();
    for (let i = 0; i < n; i++) {
        if (!keep(i)) continue;
        const a = amp[i];
        const m = Math.min(1, Math.abs(a));
        const r = rBase * (0.8 + 1.9 * Math.sqrt(m));
        ctx.fillStyle = m < 0.02 ? alpha(C.muted, 0.55) : mix(C.muted, a > 0 ? C.pos : C.neg, 0.25 + 0.75 * m);
        ctx.beginPath();
        ctx.arc(px[i], py[i], r, 0, 2 * Math.PI);
        ctx.fill();
    }
}

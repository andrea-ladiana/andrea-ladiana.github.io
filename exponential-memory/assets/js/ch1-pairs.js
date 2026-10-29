/* Chapter 1: 26 letter pairs, asked with a blurred capital, answered by the exponential vote or the linear one. */
import { stageCanvas, range, seg, colors, pointer, reducedMotion } from "./ui.js?v=20261029a";
import { drawPattern, text, alpha } from "./draw.js?v=20261029a";
import { Memory, rng, overlap } from "./engine.js?v=20261029a";
import { glyph } from "./codes.js?v=20261029a";

const UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STEPS = 5;

export function init(root, data) {
    const side = data.side, N = side * side, P = 26, L = 2;
    const xi = new Int8Array(P * L * N);
    [...UP].forEach((c, mu) => {
        xi.set(glyph(data.glyphs[c]), mu * L * N);
        xi.set(glyph(data.glyphs[c.toLowerCase()]), mu * L * N + N);
    });
    const mem = new Memory(xi, P, L, N);
    const R = rng(20261029);

    let pick = UP.indexOf("R"), cue = null, frames = [], shown = 0, shares = new Float64Array(P), timer = 0;

    const blur = (mu, r) => {
        const c = new Int8Array(L * N);
        for (let i = 0; i < N; i++) c[i] = xi[mu * L * N + i] * (R() < (1 - r) / 2 ? -1 : 1);
        return c;
    };
    const nearest = s => {
        let best = -2, k = -1;
        for (let mu = 0; mu < P; mu++) { const o = overlap(s, xi, N, mu * L * N + N, N); if (o > best) { best = o; k = mu; } }
        return [k, best];
    };

    /* Linear (Kosko) vote: each pair weighs in with its plain overlap with the question. */
    function linear(c) {
        const w = new Float64Array(P), h = new Float64Array(N);
        let z = 0;
        for (let mu = 0; mu < P; mu++) { w[mu] = overlap(c, xi, 0, mu * L * N, N); z += Math.abs(w[mu]); }
        for (let mu = 0; mu < P; mu++) for (let i = 0; i < N; i++) h[i] += w[mu] * xi[mu * L * N + N + i];
        const s = Int8Array.from(c);
        for (let i = 0; i < N; i++) s[N + i] = h[i] >= 0 ? 1 : -1;
        return { path: [s], shares: w.map(v => Math.max(0, v) / z) };
    }

    function answer(c) {
        if (rule.value === "lin") return linear(c);
        const { path } = mem.recall(c, [0], STEPS);
        return { path, shares: null };
    }

    function ask() {
        cue = blur(pick, rs.value / 100);
        const res = answer(cue);
        frames = res.path;
        clearTimeout(timer);
        const show = k => {
            shown = k;
            shares = res.shares || mem.shares(frames[k]);
            report();
            run.redraw(); board.redraw();
            if (k + 1 < frames.length) timer = setTimeout(() => show(k + 1), 420);
        };
        show(reducedMotion() ? frames.length - 1 : 0);
    }

    function report() {
        const s = frames[shown];
        root.querySelector("#pairs-share").textContent = (100 * shares[pick]).toFixed(shares[pick] > 0.995 || shares[pick] < 0.1 ? 1 : 0) + "%";
        const [k, o] = nearest(s);
        const ok = k === pick && o > 0.9;
        root.querySelector("#pairs-answer").textContent = shown < frames.length - 1 ? "…" : ok ? `${UP[k].toLowerCase()} ✓` : o > 0.9 ? `${UP[k].toLowerCase()} ✗` : "a smudge ✗";
    }

    function tally() {
        let ok = 0;
        for (let mu = 0; mu < P; mu++) for (let k = 0; k < 2; k++) {
            const { path } = answer(blur(mu, rs.value / 100));
            const [j, o] = nearest(path.at(-1));
            ok += j === mu && o > 0.9;
        }
        root.querySelector("#pairs-rate").textContent = `${ok} of 52`;
    }

    /* ---------- left: question, sweeps, answer ---------- */
    const run = stageCanvas(root.querySelector("#pairs-run"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        if (!cue) return;
        const pad = Math.max(14, w * 0.05), gap = pad;
        const big = Math.min((w - 2 * pad - gap) / 2, h * 0.5);
        const y0 = pad + 18;
        const xq = (w - 2 * big - gap) / 2, xa = xq + big + gap;
        text(ctx, "question", xq, y0 - 7, { px: 12.5 });
        text(ctx, shown < frames.length - 1 ? "answering…" : "answer", xa, y0 - 7, { px: 12.5 });
        drawPattern(ctx, cue, side, side, xq, y0, big, big);
        const s = frames[shown];
        drawPattern(ctx, s, side, side, xa, y0, big, big, { o: N, target: xi, to: pick * L * N + N });
        // arrow
        ctx.strokeStyle = C.axis; ctx.lineWidth = 1.5;
        const ay = y0 + big / 2;
        ctx.beginPath(); ctx.moveTo(xq + big + 5, ay); ctx.lineTo(xa - 6, ay); ctx.lineTo(xa - 11, ay - 4); ctx.moveTo(xa - 6, ay); ctx.lineTo(xa - 11, ay + 4); ctx.stroke();

        // the sweeps, small
        const n = rule.value === "lin" ? 1 : STEPS + 1;
        const small = Math.min((w - 2 * pad - (n - 1) * 8) / n, h - y0 - big - 64);
        const ys = y0 + big + 40, x0 = (w - n * small - (n - 1) * 8) / 2;
        text(ctx, rule.value === "lin" ? "one linear step" : "sweep by sweep: the first guess, then the exponential vote", x0, ys - 8, { px: 12 });
        for (let k = 0; k < n; k++) {
            const x = x0 + k * (small + 8);
            if (k < frames.length && k <= shown) drawPattern(ctx, frames[k], side, side, x, ys, small, small, { o: N, target: xi, to: pick * L * N + N });
            else { ctx.strokeStyle = C.line; ctx.setLineDash([3, 3]); ctx.strokeRect(x + 0.5, ys + 0.5, small - 1, small - 1); ctx.setLineDash([]); }
            if (rule.value !== "lin") text(ctx, k === 0 ? "guess" : String(k), x + small / 2, ys + small + 5, { align: "center", base: "top", px: 11.5 });
        }
        text(ctx, "orange: pixels that differ from the stored answer", w / 2, Math.min(h - 8, ys + small + 40), { align: "center", px: 11.5 });
    });

    /* ---------- right: the 26 pairs and their vote ---------- */
    let tiles = [];
    const board = stageCanvas(root.querySelector("#pairs-pick"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const cols = 5, rows = 6, top = 34, pad = 12;
        const tw = (w - 2 * pad) / cols, th = (h - top - pad) / rows;
        const g = Math.min((tw - 14) / 2, th - 18);
        tiles = [];
        for (let mu = 0; mu < P; mu++) {
            const c = mu % cols, r = Math.floor(mu / cols);
            const x = pad + c * tw + (tw - 2 * g - 4) / 2, y = top + r * th + (th - g - 10) / 2;
            tiles.push([pad + c * tw, top + r * th, tw, th]);
            if (mu === pick) {
                ctx.fillStyle = alpha(C.c1, 0.12);
                ctx.fillRect(pad + c * tw + 2, top + r * th + 2, tw - 4, th - 4);
                ctx.strokeStyle = C.c1; ctx.lineWidth = 1.5;
                ctx.strokeRect(pad + c * tw + 2.5, top + r * th + 2.5, tw - 5, th - 5);
            }
            drawPattern(ctx, xi, side, side, x, y, g, g, { o: mu * L * N, frame: false });
            drawPattern(ctx, xi, side, side, x + g + 4, y, g, g, { o: mu * L * N + N, frame: false });
            // vote bar
            const bw = 2 * g + 4, by = y + g + 5;
            ctx.fillStyle = C.grid; ctx.fillRect(x, by, bw, 4);
            ctx.fillStyle = mu === pick ? C.c1 : C.c3;
            ctx.fillRect(x, by, Math.max(shares[mu] > 0.002 ? 1.5 : 0, bw * shares[mu]), 4);
        }
    });
    root.querySelector("#pairs-pick").addEventListener("click", ev => {
        const [px, py] = pointer(ev.currentTarget, ev);
        const k = tiles.findIndex(([x, y, w, h]) => px >= x && px < x + w && py >= y && py < y + h);
        if (k >= 0) { pick = k; ask(); }
    });

    const rule = seg(root.querySelector("#pairs-rule"), () => { ask(); tally(); });
    let tt = 0;
    const rs = range(root.querySelector("#pairs-r"), root.querySelector("#pairs-r-out"), () => {
        ask();
        clearTimeout(tt); tt = setTimeout(tally, 200);
    }, v => (v / 100).toFixed(2));
    root.querySelector("#pairs-again").addEventListener("click", ask);

    ask(); tally();
}

/* Chapter 1: a hidden letter, M noisy examples of it, and the average the network stores. */
import { stageCanvas, range, colors } from "./ui.js?v=20261029a";
import { rng, entropy } from "./hopfield.js?v=20261029a";
import { drawPattern, text, line } from "./draw.js?v=20261029a";

const MAX_M = 60, SHOWN = 12;

export function init(el, data) {
    const { side, glyphs } = data.letters;
    const N = side * side, names = Object.keys(glyphs);
    let letter = "R", x = null, U = null, M = 8, r = 0.4;
    const ex = Array.from({ length: SHOWN }, () => new Int8Array(N));
    const avg = new Float64Array(N);

    const setLetter = c => {
        letter = c;
        x = Int8Array.from(glyphs[c], ch => (ch === "1" ? 1 : -1));
        // one fixed uniform per example and pixel: moving r flips pixels coherently
        const R = rng(c.charCodeAt(0) * 7919);
        U = new Float32Array(MAX_M * N);
        for (let i = 0; i < U.length; i++) U[i] = R();
    };

    const compute = () => {
        const keep = (1 + r) / 2;
        avg.fill(0);
        let exRight = 0;
        for (let a = 0; a < M; a++)
            for (let i = 0; i < N; i++) {
                const v = U[a * N + i] < keep ? x[i] : -x[i];
                avg[i] += v;
                if (v === x[i]) exRight++;
                if (a < SHOWN) ex[a][i] = v;
            }
        let right = 0;
        for (let i = 0; i < N; i++) {
            avg[i] /= M;
            right += Math.sign(avg[i]) === x[i] ? 1 : avg[i] === 0 ? 0.5 : 0;
        }
        document.getElementById("learn-ex").textContent = Math.round((100 * exRight) / (M * N)) + "%";
        document.getElementById("learn-avg").textContent = Math.round((100 * right) / N) + "%";
        const rho = entropy(M, r);
        document.getElementById("learn-rho").textContent = rho < 0.01 ? rho.toFixed(4) : rho < 10 ? rho.toFixed(2) : rho.toFixed(0);
    };

    const stage = stageCanvas(document.getElementById("learn-canvas"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const narrow = w < 560;
        const pad = narrow ? 14 : 24;
        // big tiles: the hidden original and the stored average; small tiles: examples
        let big, bx0, bx1, by, gx, gy, cell, cols;
        if (!narrow) {
            big = Math.min((h - 2 * pad - 30), w * 0.24);
            by = (h - big) / 2 - 8;
            bx0 = pad; bx1 = w - pad - big;
            cols = 4;
            const room = bx1 - bx0 - big - 2 * 56;
            cell = Math.min((room - (cols - 1) * 8) / cols, (h - 2 * pad - 30 - 2 * 8) / 3);
            gx = bx0 + big + 56 + (room - (cols * cell + (cols - 1) * 8)) / 2;
            gy = (h - (3 * cell + 2 * 8)) / 2 - 8;
        } else {
            big = Math.min(w * 0.3, h * 0.3);
            by = pad + 4;
            bx0 = pad; bx1 = w - pad - big;
            cols = 6;
            gy = by + big + 54;
            cell = Math.min((w - 2 * pad - (cols - 1) * 6) / cols, (h - gy - 34 - 6) / 2);
            gx = (w - (cols * cell + (cols - 1) * 6)) / 2;
        }
        const gap = narrow ? 6 : 8;

        drawPattern(ctx, x, side, bx0, by, big, { ink: C.c1 });
        ctx.setLineDash([4, 4]); ctx.strokeStyle = C.c1; ctx.lineWidth = 1.5;
        ctx.strokeRect(bx0 - 5, by - 5, big + 10, big + 10); ctx.setLineDash([]);
        text(ctx, "the original", bx0 + big / 2, by + big + 12, { align: "center", base: "top", color: C.ink2, px: 12.5 });
        text(ctx, "never shown", bx0 + big / 2, by + big + 28, { align: "center", base: "top", px: 11.5 });

        for (let a = 0; a < Math.min(M, SHOWN); a++) {
            const cx = gx + (a % cols) * (cell + gap), cy = gy + Math.floor(a / cols) * (cell + gap);
            drawPattern(ctx, ex[a], side, cx, cy, cell);
        }
        const rows = narrow ? 2 : 3;
        const gridBottom = gy + rows * cell + (rows - 1) * gap;
        const label = M > SHOWN ? `${SHOWN} of ${M} examples` : `${M} example${M > 1 ? "s" : ""}`;
        text(ctx, label, gx + (cols * cell + (cols - 1) * gap) / 2, gridBottom + 12, { align: "center", base: "top", color: C.ink2, px: 12.5 });

        drawPattern(ctx, avg, side, bx1, by, big, { grey: true });
        text(ctx, "what is stored", bx1 + big / 2, by + big + 12, { align: "center", base: "top", color: C.ink2, px: 12.5 });
        text(ctx, "their average", bx1 + big / 2, by + big + 28, { align: "center", base: "top", px: 11.5 });

        // arrows
        ctx.strokeStyle = C.axis; ctx.fillStyle = C.axis; ctx.lineWidth = 1.5;
        const arrow = (x0, y0, x1, y1) => {
            line(ctx, x0, y0, x1, y1);
            const a = Math.atan2(y1 - y0, x1 - x0);
            ctx.beginPath(); ctx.moveTo(x1, y1);
            ctx.lineTo(x1 - 7 * Math.cos(a - 0.45), y1 - 7 * Math.sin(a - 0.45));
            ctx.lineTo(x1 - 7 * Math.cos(a + 0.45), y1 - 7 * Math.sin(a + 0.45)); ctx.fill();
        };
        if (!narrow) {
            const my = by + big / 2, gw = cols * cell + (cols - 1) * gap;
            arrow(bx0 + big + 14, my, gx - 14, my);
            arrow(gx + gw + 14, my, bx1 - 14, my);
        } else {
            arrow(bx0 + big + 14, by + big / 2, bx1 - 14, by + big / 2);
        }
    });

    range(document.getElementById("learn-M"), document.getElementById("learn-M-out"), v => { M = v; compute(); stage.redraw(); });
    range(document.getElementById("learn-r"), document.getElementById("learn-r-out"), v => { r = v / 100; compute(); stage.redraw(); }, v => (v / 100).toFixed(2).replace(/0$/, ""));
    document.getElementById("learn-new").addEventListener("click", () => {
        let c;
        do c = names[Math.floor(Math.random() * names.length)]; while (c === letter);
        setLetter(c); compute(); stage.redraw();
    });
    setLetter(letter); compute(); stage.redraw();
}

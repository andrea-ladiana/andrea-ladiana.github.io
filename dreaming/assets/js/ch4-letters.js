/* Chapter 4: structured, strongly correlated memories (letters), awake and after sleep. */
import { stageCanvas, range, animator, reducedMotion, colors, pointer } from "./ui.js?v=20261029a";
import { rng, learn, kernel, network, overlap } from "./hopfield.js?v=20261029a";
import { drawPattern, text, alpha, sliderToT, fmtT } from "./draw.js?v=20261029a";
import { later } from "./recall.js?v=20261029a";

const NOISE = 0.15, BETA = 10, STEPS = 24, CUES_EACH = 3, SUCCESS = 0.9, COLS = 6;

export function init(el, data) {
    const { side, glyphs } = data.letters;
    const names = Object.keys(glyphs), K = names.length, N = side * side;
    const xi = new Int8Array(K * N);
    names.forEach((c, mu) => { for (let i = 0; i < N; i++) xi[mu * N + i] = glyphs[c][i] === "1" ? 1 : -1; });
    const out = id => document.getElementById(id);

    let M = 20, r = 0.6, t = 0, layer = null, A = null, shown = null;
    let cued = names.indexOf("R"), states = [], step = 0, landed = -1, results = null;

    // average overlap between distinct letters (a property of the alphabet, not of the network)
    let sum = 0;
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) sum += overlap(xi.subarray(a * N, a * N + N), xi, b * N, N);
    out("letters-corr").textContent = ((2 * sum) / (K * (K - 1))).toFixed(2);

    const best = s => {
        let b = 0, bv = -2;
        for (let mu = 0; mu < K; mu++) { const v = overlap(s, xi, mu * N, N); if (v > bv) { bv = v; b = mu; } }
        return [b, bv];
    };

    const grid = stageCanvas(out("letters-grid"), (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        if (!states.length) return;
        const C = colors();
        const size = Math.min(w, h) - 70;
        drawPattern(ctx, states[step], side, (w - size) / 2, (h - size) / 2 - 4, size);
        text(ctx, step === 0 ? "the cue" : `step ${step}`, w - 12, 10, { align: "right", base: "top", px: 12 });
        if (step === states.length - 1 && landed >= 0) {
            const [b, v] = best(states[step]);
            const ok = b === cued && v >= SUCCESS;
            const msg = v >= SUCCESS ? (ok ? `recalled ${names[b]}` : `landed on ${names[b]}, not ${names[cued]}`) : `a blend, closest to ${names[b]} (${v.toFixed(2)})`;
            text(ctx, msg, w / 2, h - 18, { align: "center", base: "middle", color: ok ? C.c2Ink : C.c3Ink, px: 13, weight: 500 });
        }
    });

    const pick = stageCanvas(out("letters-pick"), (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        if (!shown) return;
        const C = colors(), L = tiles(w, h);
        for (let mu = 0; mu < K; mu++) {
            const [x, y] = L.at(mu);
            drawPattern(ctx, shown.subarray(mu * N, mu * N + N), side, x, y, L.cell, { grey: true, frame: false });
            if (results) {
                // one bar per letter: blue share = cues recalled, orange = cues lost
                const f = results[mu] / CUES_EACH;
                ctx.fillStyle = C.c2;
                ctx.fillRect(x, y + L.cell + 3, L.cell * f, 3);
                ctx.fillStyle = alpha(C.c3, 0.7);
                ctx.fillRect(x + L.cell * f, y + L.cell + 3, L.cell * (1 - f), 3);
            }
            if (mu === cued) {
                ctx.strokeStyle = C.c1; ctx.lineWidth = 2;
                ctx.strokeRect(x - 3, y - 3, L.cell + 6, L.cell + 12);
            }
        }
    });

    function tiles(w, h) {
        const rows = Math.ceil(K / COLS), top = 36, bottom = 14, gap = 12;
        const cell = Math.min((w - 32 - (COLS - 1) * gap) / COLS, (h - top - bottom - rows * 8 - (rows - 1) * gap) / rows);
        const x0 = (w - (COLS * cell + (COLS - 1) * gap)) / 2;
        return {
            cell,
            at: mu => [x0 + (mu % COLS) * (cell + gap), top + Math.floor(mu / COLS) * (cell + gap + 8)],
            hit: (px, py) => {
                for (let mu = 0; mu < K; mu++) {
                    const [x, y] = [x0 + (mu % COLS) * (cell + gap), top + Math.floor(mu / COLS) * (cell + gap + 8)];
                    if (px >= x - gap / 2 && px <= x + cell + gap / 2 && py >= y - 4 && py <= y + cell + 10) return mu;
                }
                return -1;
            },
        };
    }

    const anim = animator(out("letters-grid"), (tm, dt) => {
        anim.acc = (anim.acc || 0) + dt;
        if (anim.acc < 0.11) return true;
        anim.acc = 0;
        step++;
        if (step === states.length - 1) landed = 1;
        grid.redraw();
        return step < states.length - 1;
    });

    const play = (mu, seed = Math.floor(Math.random() * 1e9)) => {
        cued = mu;
        const R = rng(seed), net = network([layer], [A], { beta: BETA, R });
        const s = new Int8Array(N);
        for (let i = 0; i < N; i++) s[i] = R() < NOISE ? -xi[mu * N + i] : xi[mu * N + i];
        states = [Int8Array.from(s)];
        for (let n = 0; n < STEPS; n++) { net.step([s]); states.push(Int8Array.from(s)); }
        step = reducedMotion() ? states.length - 1 : 0;
        landed = step === states.length - 1 ? 1 : -1;
        const [b, v] = best(states[states.length - 1]);
        out("letters-land").textContent = v >= SUCCESS ? names[b] : `a blend (closest ${names[b]})`;
        out("letters-label").textContent = `cued: ${names[mu]} with ${Math.round(NOISE * 100)}% of pixels flipped`;
        grid.redraw(); pick.redraw();
        if (step < states.length - 1) anim.start();
    };

    const score = later(() => {
        const R = rng(99), net = network([layer], [A], { beta: BETA, R });
        results = new Array(K).fill(0);
        const s = new Int8Array(N);
        for (let mu = 0; mu < K; mu++)
            for (let c = 0; c < CUES_EACH; c++) {
                for (let i = 0; i < N; i++) s[i] = R() < NOISE ? -xi[mu * N + i] : xi[mu * N + i];
                for (let n = 0; n < STEPS; n++) net.step([s]);
                const [b, v] = best(s);
                if (b === mu && v >= SUCCESS) results[mu]++;
            }
        const full = results.filter(x => x === CUES_EACH).length;
        out("letters-rate").textContent = `${full} / ${K}`;
        pick.redraw();
    }, 40);

    const relearn = () => {
        layer = learn(xi, K, N, M, r, rng(4242));
        // show the plain average of the examples, in [-1, 1]
        const scale = r * (1 + layer.rho);
        shown = Float64Array.from(layer.hat, v => v * scale);
        resleep();
    };
    const resleep = () => {
        A = kernel(layer.C, K, t);
        results = null;
        play(cued);
        score();
    };

    out("letters-pick").addEventListener("click", ev => {
        const [px, py] = pointer(out("letters-pick"), ev);
        const mu = tiles(pick.w, pick.h).hit(px, py);
        if (mu >= 0) play(mu);
    });
    range(out("letters-t"), out("letters-t-out"), later(v => { t = sliderToT(v); resleep(); }, 50), v => fmtT(sliderToT(v)));
    range(out("letters-M"), out("letters-M-out"), later(v => { M = v; relearn(); }, 80));
    range(out("letters-r"), out("letters-r-out"), later(v => { r = v / 100; relearn(); }, 80), v => (v / 100).toFixed(2).replace(/0$/, ""));
    relearn();
}

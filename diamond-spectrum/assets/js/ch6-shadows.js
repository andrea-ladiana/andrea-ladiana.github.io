/* Chapter 6 · Shadows: the one-variable shadow map, its Julia set, and the true two-variable slicing. */
import { phi } from "./lattice.js?v=20261029a";
import { stageCanvas, seg, tooltip, pointer, colors, alpha, fmtNum, fitBox } from "./ui.js?v=20261029a";
import { planeView, drawPlaneFrame } from "./plane.js?v=20261029a";

const R = (lam, b) => (lam * (2 - lam)) / b;
const Q1big = b => b + 1 + Math.sqrt(b * b + 1);

const TEXT = {
    cobweb: {
        label: "λ ↦ λ(2 − λ)/b · drag to move the start",
        caption: b => `<p>Freeze α = 1 and keep only β: the note follows <strong>λ ↦ λ(2 − λ)/${b}</strong>, a map studied since the 1980s. Inside the shaded interval a point bounces forever; outside it flies off.</p>
<p>But <strong>λ = ${fmtNum(Q1big(b), 5)}</strong> is a real note of the lattice (it lands on the dashed line after one zoom-out), and here it flies off. The shadow cannot see the spectrum.</p>`,
        refs: `<span class="badge theorem">Theorem</span> Paper · eqs. (52), (57)`,
    },
    julia: {
        label: "complex λ-plane · shaded: points that never escape",
        caption: b => `<p>The same map on complex λ. The shaded set is its filled Julia set${b === 2 ? " (for b = 2, a relative of the famous cauliflower, eq. 58)" : ""}. Dots are the true notes from rungs 0–5: the <strong style="color:var(--c3-ink)">orange</strong> ones lie outside, where the shadow says nothing should be.</p>`,
        refs: `<span class="badge theorem">Theorem</span> Paper · eqs. (52), (57)–(58)`,
    },
    slices: {
        label: "the (α, β) plane · curves where Φᵏ lands on the dashed line",
        caption: () => `<p>The honest picture is two-dimensional. Pull the dashed line back through Φ once, twice, k times: you get these curves. Where they cross the dotted line α = 1, they mark <strong>exactly</strong> the notes of rung k.</p>
<p>As k grows the curves pile up on a fractal. The paper conjectures that it is a slice of the Julia set of Φ itself, and gives a formula for its dimension.</p>`,
        refs: `<span class="badge theorem">Theorem</span> slicing: Lemma 5.4, eq. (54) <span class="badge conjecture">Conjecture</span> Julia set and dimension: Conj. 5.6, 5.8`,
    },
};

export function init(root, data) {
    const $ = id => root.querySelector("#" + id);
    const tip = tooltip($("shadow-tip"));
    let tab = "cobweb", b = 2, start = null;
    let view = null, marks = [];
    const images = {};

    const stage = stageCanvas($("shadow-canvas"), draw);

    function text() {
        const T = TEXT[tab];
        $("shadow-label").textContent = T.label;
        $("shadow-caption").innerHTML = T.caption(b);
        $("shadow-refs").innerHTML = T.refs;
    }

    function draw(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        marks = [];
        if (tab === "cobweb") cobweb(ctx, w, h);
        else if (tab === "julia") julia(ctx, w, h);
        else slices(ctx, w, h);
    }

    /* ---- 1. cobweb of the shadow map on the real line ---- */
    function cobweb(ctx, w, h) {
        const C = colors();
        const lo = Math.min(-1.5, 1 - b), hi = Q1big(b) + 1.5;
        const T = fitBox(lo, hi, -(hi - lo) * 0.42, (hi - lo) * 0.42, w, h, 34);
        view = T;
        const X = T.X, Y = y => T.Y(-y);
        const K0 = Math.min(0, 2 - b), K1 = Math.max(2, b);
        // trapped interval
        ctx.fillStyle = alpha(C.c1, 0.1);
        ctx.fillRect(X(K0), 0, X(K1) - X(K0), h);
        ctx.fillStyle = C.c1Ink; ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText("trapped", (X(K0) + X(K1)) / 2, 10);
        // axes and diagonal
        ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), h); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.textBaseline = "top";
        for (let t = Math.ceil(lo); t <= hi; t++) if (t) ctx.fillText(String(t), X(t), Y(0) + 4);
        ctx.strokeStyle = alpha(C.ink2, 0.4); ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(X(lo), Y(lo)); ctx.lineTo(X(hi), Y(hi)); ctx.stroke(); ctx.setLineDash([]);
        // the map
        ctx.strokeStyle = C.c1; ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i <= 300; i++) {
            const l = lo + ((hi - lo) * i) / 300;
            i ? ctx.lineTo(X(l), Y(R(l, b))) : ctx.moveTo(X(l), Y(R(l, b)));
        }
        ctx.stroke();
        // true notes on the axis
        for (let k = 0; k <= 3; k++) for (const r of data.ladder[String(b)]?.[k] ?? []) {
            if (r > hi) continue;
            const out = r < K0 - 1e-9 || r > K1 + 1e-9;
            ctx.fillStyle = out ? C.c3 : alpha(C.c1, 0.7);
            ctx.beginPath(); ctx.arc(X(r), Y(0), out ? 5 : 3, 0, 2 * Math.PI); ctx.fill();
            marks.push({ x: X(r), y: Y(0), html: `λ = ${fmtNum(r, 6)} · a note on rung ${k}${out ? "<br>outside the trapped interval" : ""}` });
        }
        // cobweb from the start point
        let l = start ?? Q1big(b);
        ctx.strokeStyle = C.c3; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(X(l), Y(0));
        for (let i = 0; i < 40; i++) {
            const n = R(l, b);
            if (!Number.isFinite(n) || n < lo - (hi - lo) || Math.abs(n) > 1e4) { ctx.lineTo(X(l), Y(Math.max(n, -(hi - lo)))); break; }
            ctx.lineTo(X(l), Y(n)); ctx.lineTo(X(n), Y(n));
            l = n;
        }
        ctx.stroke();
        const s0 = start ?? Q1big(b);
        ctx.fillStyle = C.c3; ctx.beginPath(); ctx.arc(X(s0), Y(0), 6, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = C.c3Ink; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(`start ${fmtNum(s0, 4)}`, X(s0), Y(0) - 9);
    }

    /* ---- 2. filled Julia set of the shadow map ---- */
    function julia(ctx, w, h) {
        const C = colors();
        const lo = Math.min(-1.2, 1 - b - 0.4), hi = Math.max(3.2, b + 0.6, Q1big(b) + 0.8);
        const T = fitBox(lo, hi, -(hi - lo) * 0.36, (hi - lo) * 0.36, w, h, 18);
        view = T;
        const key = `${b},${w},${h},${document.documentElement.dataset.theme ?? ""}${C.bg}`;
        if (!images[key]) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const W = Math.round(w * dpr), H = Math.round(h * dpr);
            const img = new ImageData(W, H);
            const fill = rgb(C.c1), bg = rgb(C.stageBg), band = rgb(C.c2);
            for (let py = 0; py < H; py++) {
                for (let px = 0; px < W; px++) {
                    let [x, y] = T.inv(px / dpr, py / dpr);
                    y = -y;
                    let n = 0;
                    for (; n < 120; n++) {
                        // z ↦ z(2 − z)/b
                        const nx = (x * (2 - x) + y * y) / b, ny = (y * (2 - x) - x * y) / b;
                        x = nx; y = ny;
                        if (x * x + y * y > 1e4) break;
                    }
                    const o = 4 * (py * W + px);
                    let c;
                    if (n === 120) c = mixRgb(bg, fill, 0.32);
                    else c = mixRgb(bg, band, 0.28 * Math.min(1, n / 30));
                    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
                }
            }
            images[key] = img;
        }
        ctx.putImageData(images[key], 0, 0);
        ctx.strokeStyle = alpha(C.ink2, 0.35); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, T.Y(0)); ctx.lineTo(w, T.Y(0)); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.font = "11.5px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        for (let t = Math.ceil(lo); t <= hi; t++) ctx.fillText(String(t), T.X(t), T.Y(0) + 8);
        const K0 = Math.min(0, 2 - b), K1 = Math.max(2, b);
        const rungs = data.ladder[String(b)] ?? [];
        rungs.forEach((row, k) => {
            if (k > 5) return;
            for (const r of row) {
                if (r > hi) continue;
                const out = r < K0 - 1e-9 || r > K1 + 1e-9;
                ctx.fillStyle = out ? C.c3 : C.ink;
                ctx.beginPath(); ctx.arc(T.X(r), T.Y(0), out ? 4.5 : 2.6, 0, 2 * Math.PI); ctx.fill();
                marks.push({ x: T.X(r), y: T.Y(0), html: `λ = ${fmtNum(r, 6)} · rung ${k}${out ? "<br>outside the shadow’s Julia set" : ""}` });
            }
        });
    }

    /* ---- 3. pull-backs of the singular line in the real (α, β) plane ---- */
    function slices(ctx, w, h) {
        const C = colors();
        const P = planeView(w, h, { amax: 40, bmin: -40, bmax: 400 });
        const key = `s${b},${w},${h},${C.bg}`;
        if (!images[key]) {
            const K = 6;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const W = Math.round(w * dpr), H = Math.round(h * dpr);
            // sign of 2α_k − β_k at every pixel, for k = 0..K
            const sg = new Int8Array(W * H * (K + 1));
            for (let py = 0; py < H; py++) {
                const be0 = P.invY(py / dpr);
                for (let px = 0; px < W; px++) {
                    let a = P.invX(px / dpr), be = be0;
                    for (let k = 0; k <= K; k++) {
                        const f = 2 * a - be;
                        sg[(py * W + px) * (K + 1) + k] = Number.isFinite(f) && Math.abs(a) < 1e150 ? Math.sign(f) || 1 : 0;
                        [a, be] = phi(a, be, b);
                    }
                }
            }
            const img = new ImageData(W, H);
            const bg = rgb(C.stageBg);
            for (let i = 0; i < W * H; i++) { img.data[4 * i] = bg[0]; img.data[4 * i + 1] = bg[1]; img.data[4 * i + 2] = bg[2]; img.data[4 * i + 3] = 255; }
            const cols = [];
            for (let k = 0; k <= K; k++) cols.push(rgb(k === 0 ? C.c3 : C.c1));
            for (let k = K; k >= 1; k--) {
                const strength = 0.95 - 0.1 * k;
                for (let py = 0; py < H - 1; py++) {
                    for (let px = 0; px < W - 1; px++) {
                        const i = py * W + px;
                        const s0 = sg[i * (K + 1) + k], s1 = sg[(i + 1) * (K + 1) + k], s2 = sg[(i + W) * (K + 1) + k];
                        if (s0 && ((s1 && s1 !== s0) || (s2 && s2 !== s0))) {
                            const c = mixRgb(bg, cols[k], strength);
                            img.data[4 * i] = c[0]; img.data[4 * i + 1] = c[1]; img.data[4 * i + 2] = c[2];
                        }
                    }
                }
            }
            images[key] = img;
        }
        ctx.putImageData(images[key], 0, 0);
        drawPlaneFrame(ctx, P);
        // the notes, where the curves cut α = 1
        const rungs = data.ladder[String(b)] ?? [];
        rungs.forEach((row, k) => {
            if (k > 6) return;
            for (const r of row) {
                if (r > P.bmax) continue;
                ctx.fillStyle = k === 0 ? C.c3 : C.c1;
                ctx.strokeStyle = C.surface; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.arc(P.X(1), P.Y(r), 3.6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
                marks.push({ x: P.X(1), y: P.Y(r), html: `λ = ${fmtNum(r, 6)} · rung ${k}` });
            }
        });
    }

    const cv = $("shadow-canvas");
    let dragging = false;
    const setStart = ev => {
        if (tab !== "cobweb" || !view) return;
        const [mx] = pointer(cv, ev);
        start = view.inv(mx, 0)[0];
        stage.redraw();
    };
    cv.addEventListener("pointerdown", ev => { if (tab === "cobweb") { dragging = true; cv.setPointerCapture(ev.pointerId); setStart(ev); } });
    cv.addEventListener("pointerup", () => { dragging = false; });
    cv.addEventListener("pointermove", ev => {
        if (dragging) return setStart(ev);
        const [mx, my] = pointer(cv, ev);
        let best = null, bd = 81;
        for (const m of marks) { const d = (m.x - mx) ** 2 + (m.y - my) ** 2; if (d < bd) { bd = d; best = m; } }
        if (best) tip.show(best.x, best.y, best.html); else tip.hide();
    });
    cv.addEventListener("pointerleave", () => tip.hide());

    seg($("shadow-tab"), v => { tab = v; text(); stage.redraw(); });
    seg($("shadow-b"), v => { b = +v; start = null; text(); stage.redraw(); });
    text();
    stage.redraw();
}

function rgb(c) {
    c = c.replace("#", "");
    if (c.length === 3) c = [...c].map(x => x + x).join("");
    return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
}
const mixRgb = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));

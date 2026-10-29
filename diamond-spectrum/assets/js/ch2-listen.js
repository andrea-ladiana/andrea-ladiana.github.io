/* Chapter 2 · Listen: diagonalize the lattice in the browser, show and play its modes. */
import { buildLattice, layout, laplacian, jacobiEigen, groupLevels, sparsify, V } from "./lattice.js?v=20261029a";
import { stageCanvas, seg, range, tooltip, animator, pointer, colors, alpha, fmtInt, fmtNum, fmtPct, reducedMotion } from "./ui.js?v=20261029a";
import { latticeTransform, project, strokeEdges, edgeWidth, drawAmplitudes } from "./draw.js?v=20261029a";
import { lambdaScale, drawLambdaAxis } from "./axis.js?v=20261029a";
import { ping, playSpectrum } from "./audio.js?v=20261029a";

const LMAX = { 2: 4, 3: 3, 4: 3 };

let worker = null;
function diagonalize(b, L) {
    return new Promise(resolve => {
        try {
            worker ??= new Worker(new URL("./eigen-worker.js?v=20261029a", import.meta.url), { type: "module" });
            const onMsg = e => {
                if (e.data.b !== b || e.data.L !== L) return;
                worker.removeEventListener("message", onMsg);
                resolve(e.data);
            };
            worker.addEventListener("message", onMsg);
            worker.postMessage({ b, L });
        } catch (err) {
            // no module workers: compute here (small sizes only)
            const g = buildLattice(b, L);
            const r = jacobiEigen(laplacian(g), g.n);
            for (const { indices } of groupLevels(r.values)) {
                sparsify(indices.map(i => r.vectors[i])).forEach((v, j) => { r.vectors[indices[j]] = v; });
            }
            resolve({ b, L, ...r });
        }
    });
}

export function init(root) {
    const $ = id => root.querySelector("#" + id);
    const tip = tooltip($("listen-tip"));
    const status = $("listen-status");
    const statusText = status.textContent;
    const cache = {};
    let b = 2, L = 3;
    let cur = null;          // { g, pos, values, vectors, levels }
    let sel = 0, which = 0;  // selected level and basis vector inside it
    let phase = 0;

    const graph = stageCanvas($("listen-canvas"), drawGraph);
    const strip = stageCanvas($("listen-strip"), drawStrip);

    function amplitude() {
        const lvl = cur.levels[sel];
        const v = cur.vectors[lvl.indices[which % lvl.indices.length]];
        let m = 0;
        for (const x of v) m = Math.max(m, Math.abs(x));
        return { v, m: m || 1 };
    }

    function drawGraph(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        if (!cur) return;
        const C = colors();
        const { g, pos } = cur;
        const T = latticeTransform(pos, g.n, w, h, 30);
        const { px, py } = project(pos, g.n, T);
        strokeEdges(ctx, g.edges, px, py, alpha(C.ink2, 0.28), edgeWidth(g.edges.length));
        const { v, m } = amplitude();
        const c = reducedMotion() ? 1 : Math.cos(phase);
        const amp = Float32Array.from(v, x => (x / m) * c);
        const rBase = Math.max(1.6, Math.min(4.5, 700 / g.n));
        drawAmplitudes(ctx, g.n, px, py, amp, rBase);
    }

    let S = null;
    function drawStrip(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        if (!cur) return;
        const C = colors();
        const lv = cur.levels;
        const hi = lv[lv.length - 1].lambda * 1.08 + 0.5;
        S = lambdaScale(hi, 26, w - 18);
        const base = h - 34, top = 34;
        drawLambdaAxis(ctx, S, base, { label: "λ" });
        const maxM = Math.max(...lv.map(l => l.indices.length));
        lv.forEach((l, i) => {
            const x = S.X(l.lambda);
            const hgt = Math.max(5, ((base - top) * l.indices.length) / maxM);
            const on = i === sel;
            ctx.strokeStyle = on ? C.c1 : alpha(C.c2, 0.75);
            ctx.lineWidth = on ? 3 : 2;
            ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - hgt); ctx.stroke();
            ctx.fillStyle = on ? C.c1 : C.c2;
            ctx.beginPath(); ctx.arc(x, base - hgt, on ? 4.5 : 3, 0, 2 * Math.PI); ctx.fill();
        });
    }

    function stats() {
        if (!cur) return;
        const l = cur.levels[sel];
        $("listen-lam").textContent = fmtNum(l.lambda, 6);
        $("listen-mult").textContent = fmtInt(l.indices.length) + (l.indices.length > 1 ? ` · showing #${(which % l.indices.length) + 1}` : "");
        $("listen-share").textContent = fmtPct(l.indices.length / cur.g.n);
        $("listen-another").disabled = l.indices.length < 2;
    }

    const anim = animator(root, (t, dt) => {
        phase += dt * 2.6;
        graph.redraw();
    });

    function select(i, sound = false) {
        sel = Math.max(0, Math.min(cur.levels.length - 1, i));
        which = 0;
        stats(); graph.redraw(); strip.redraw();
        if (sound) ping(cur.levels[sel].lambda);
    }

    async function load() {
        const key = `${b},${L}`;
        if (!cache[key]) {
            status.textContent = `diagonalizing ${fmtInt(V(b, L))} × ${fmtInt(V(b, L))}…`;
            const r = await diagonalize(b, L);
            const g = buildLattice(b, L);
            cache[key] = { g, pos: layout(g), values: r.values, vectors: r.vectors, levels: groupLevels(r.values) };
        }
        if (key !== `${b},${L}`) return; // a newer request superseded this one
        cur = cache[key];
        status.textContent = statusText;
        const two = cur.levels.findIndex(l => Math.abs(l.lambda - 2) < 1e-6);
        select(two >= 0 ? two : 0);
        if (!reducedMotion()) anim.start();
    }

    const Lr = range($("listen-L"), $("listen-L-out"), v => { L = v; load(); });
    seg($("listen-b"), v => {
        b = +v;
        Lr.setMax(LMAX[b]);
        L = Lr.value;
        load();
    });

    $("listen-another").addEventListener("click", () => { which++; stats(); graph.redraw(); });

    $("listen-hear").addEventListener("click", () => {
        if (!cur) return;
        const lv = cur.levels;
        const end = playSpectrum(lv.map(l => l.lambda), lv.map(l => l.indices.length), i => { sel = i; which = 0; stats(); strip.redraw(); graph.redraw(); });
        const two = lv.findIndex(l => Math.abs(l.lambda - 2) < 1e-6);
        setTimeout(() => select(two >= 0 ? two : 0), end);
    });

    const sc = $("listen-strip");
    sc.tabIndex = 0;
    const nearestBar = mx => {
        let best = -1, bd = 14;
        cur.levels.forEach((l, i) => { const d = Math.abs(S.X(l.lambda) - mx); if (d < bd) { bd = d; best = i; } });
        return best;
    };
    sc.addEventListener("click", ev => {
        if (!cur || !S) return;
        const i = nearestBar(pointer(sc, ev)[0]);
        if (i >= 0) select(i, true);
    });
    sc.addEventListener("pointermove", ev => {
        if (!cur || !S) return;
        const [mx] = pointer(sc, ev);
        const i = nearestBar(mx);
        if (i < 0) return tip.hide();
        const l = cur.levels[i];
        tip.show(S.X(l.lambda), 40, `λ = ${fmtNum(l.lambda, 6)} · ${fmtInt(l.indices.length)} mode${l.indices.length > 1 ? "s" : ""}`);
    });
    sc.addEventListener("pointerleave", () => tip.hide());
    sc.addEventListener("keydown", ev => {
        if (!cur) return;
        if (ev.key === "ArrowRight") { select(sel + 1, true); ev.preventDefault(); }
        if (ev.key === "ArrowLeft") { select(sel - 1, true); ev.preventDefault(); }
    });

    load();
}

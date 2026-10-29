/* Chapter 1 · Grow: build D_L^(b) one inflation at a time. */
import { buildLattice, layout, V, E } from "./lattice.js?v=20261029a";
import { stageCanvas, seg, range, tooltip, animator, pointer, colors, alpha, fmtInt, reducedMotion } from "./ui.js?v=20261029a";
import { latticeTransform, genColor, degreeAt, nodeRadius, edgeWidth, project, nearestVertex, strokeEdges } from "./draw.js?v=20261029a";

const LMAX = { 2: 6, 3: 5, 4: 4, 5: 3 };
const ease = t => t * t * (3 - 2 * t);

export function init(root) {
    const $ = id => root.querySelector("#" + id);
    const tip = tooltip($("grow-tip"));
    const cache = {};
    let b = 2, L = 4;
    let shown = 4, phase = 1; // displayed level and growth progress of its newest generation
    let hover = -1;

    const model = () => {
        if (!cache[b]) {
            const g = buildLattice(b, LMAX[b]);
            cache[b] = { g, pos: layout(g) };
        }
        return cache[b];
    };

    const stage = stageCanvas($("grow-canvas"), draw);

    function draw(ctx, w, h) {
        const C = colors();
        const { g, pos } = model();
        ctx.clearRect(0, 0, w, h);
        const T = latticeTransform(pos, g.n, w, h, 30);
        const { px, py } = project(pos, g.n, T);

        // newest generation slides out of the midpoint of its parent edge
        const t = ease(phase);
        if (shown > 0 && t < 1) {
            for (const { u, v, mids } of g.diamonds[shown]) {
                const mx = (px[u] + px[v]) / 2, my = (py[u] + py[v]) / 2;
                for (const m of mids) { px[m] = mx + (px[m] - mx) * t; py[m] = my + (py[m] - my) * t; }
            }
        }

        const edges = g.edgesAt[shown];
        if (shown > 0 && t < 1) strokeEdges(ctx, g.edgesAt[shown - 1], px, py, alpha(C.ink2, 0.35 * (1 - t)), 1);
        strokeEdges(ctx, edges, px, py, alpha(C.ink2, shown > 3 ? 0.42 : 0.6), edgeWidth(edges.length));

        const nShown = V(b, shown);
        for (let gen = 0; gen <= shown; gen++) {
            ctx.fillStyle = genColor(gen, shown);
            const r = nodeRadius(degreeAt(b, shown, gen), nShown, T);
            ctx.beginPath();
            for (let i = 0; i < g.n; i++) {
                if (g.gen[i] !== gen) continue;
                ctx.moveTo(px[i] + r, py[i]);
                ctx.arc(px[i], py[i], r, 0, 2 * Math.PI);
            }
            ctx.fill();
        }

        if (hover >= 0 && g.gen[hover] <= shown) {
            ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px[hover], py[hover], nodeRadius(degreeAt(b, shown, g.gen[hover]), nShown, T) + 3, 0, 2 * Math.PI);
            ctx.stroke();
        }
        stage.px = px; stage.py = py;
    }

    function stats() {
        $("grow-V").textContent = fmtInt(V(b, L));
        $("grow-E").textContent = fmtInt(E(b, L));
        $("grow-deg").textContent = fmtInt(b ** L);
        $("grow-df").textContent = (Math.log(2 * b) / Math.log(2)).toFixed(3);
    }

    const anim = animator(root, (time, dt) => {
        phase += dt / 0.9;
        if (phase >= 1) {
            if (shown < L) { shown++; phase = 0; }
            else { phase = 1; stage.redraw(); return false; }
        }
        stage.redraw();
    });

    function show(level, animate) {
        anim.stop();
        if (animate && !reducedMotion()) { shown = level; phase = 0; anim.start(); }
        else { shown = level; phase = 1; }
        stats();
        stage.redraw();
    }

    const Lr = range($("grow-L"), $("grow-L-out"), v => { L = v; show(L, v > shown); });
    seg($("grow-b"), v => {
        b = +v;
        Lr.setMax(LMAX[b]);
        if (L > LMAX[b]) Lr.set(LMAX[b]);
        L = Lr.value;
        show(L, false);
    });
    $("grow-play").addEventListener("click", () => {
        if (reducedMotion() || L === 0) return show(L, false);
        // grow level by level from a single edge
        anim.stop();
        shown = 1; phase = 0;
        anim.start();
    });

    const cv = $("grow-canvas");
    cv.addEventListener("pointermove", ev => {
        if (!stage.px) return;
        const { g } = model();
        const [mx, my] = pointer(cv, ev);
        const i = nearestVertex(stage.px, stage.py, g.n, mx, my, 14, j => g.gen[j] <= shown);
        if (i !== hover) { hover = i; stage.redraw(); }
        if (i < 0) return tip.hide();
        const gen = g.gen[i];
        tip.show(stage.px[i], stage.py[i],
            gen === 0 ? `a root · degree ${fmtInt(b ** shown)}` : `born at step ${gen} · degree ${fmtInt(degreeAt(b, shown, gen))}`);
    });
    cv.addEventListener("pointerleave", () => { hover = -1; tip.hide(); stage.redraw(); });

    stats();
    stage.redraw();
}

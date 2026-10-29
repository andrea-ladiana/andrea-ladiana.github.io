/* Chapter 3 · Trapped: build λ = 2 eigenvectors by hand (diamond modes and loop modes). */
import { buildLattice, layout, residual, V, E } from "./lattice.js?v=20261029a";
import { stageCanvas, seg, range, animator, pointer, colors, alpha, fmtInt, reducedMotion } from "./ui.js?v=20261029a";
import { latticeTransform, project, strokeEdges, edgeWidth, drawAmplitudes, fillMotif } from "./draw.js?v=20261029a";

const LMAX = { 2: 4, 3: 3, 4: 3 };
const nu = (b, l) => (l === 1 && b === 2 ? 2 : 1);

export function init(root) {
    const $ = id => root.querySelector("#" + id);
    let b = 3, L = 3, mode = "diamond";
    let g, pos, psi, loops = [], hoverMotif = null, phase = 0, px, py, clicks = new Map();

    const stage = stageCanvas($("trap-canvas"), draw);

    function rebuild() {
        g = buildLattice(b, L);
        pos = layout(g);
        // level-L motif sitting on each edge of D_{L-1}, in both orientations
        g.motifOn = new Map();
        for (const m of g.diamonds[L]) { g.motifOn.set(m.u + "," + m.v, m); g.motifOn.set(m.v + "," + m.u, m); }
        clear();
    }

    function clear() {
        psi = new Float64Array(g.n);
        loops = [];
        clicks = new Map();
        update();
    }

    /** Candidate motifs for the current mode: level-L diamonds, or level-(L-1) diamonds whose 4-cycles carry a loop mode. */
    const candidates = () => (mode === "diamond" ? g.diamonds[L] : L >= 2 ? g.diamonds[L - 1] : []);

    function motifAt(mx, my) {
        if (!px) return null;
        let best = null, bd = Infinity;
        for (const m of candidates()) {
            let cx = 0, cy = 0;
            for (const k of m.mids) { cx += px[k]; cy += py[k]; }
            cx /= m.mids.length; cy /= m.mids.length;
            const d = (cx - mx) ** 2 + (cy - my) ** 2;
            if (d < bd) { bd = d; best = m; }
        }
        return best;
    }

    function addMode(m) {
        const n = clicks.get(m) ?? 0;
        clicks.set(m, n + 1);
        const p = n % (b - 1), q = p + 1;          // cycle through pairs of branches
        const [m1, m2] = [m.mids[p], m.mids[q]];
        if (mode === "diamond") {
            psi[m1] += 1; psi[m2] -= 1;
        } else {
            // loop u → m1 → v → m2 → u in D_{L-1}; alternate signs, spread each over its b new paths
            const cycle = [[m.u, m1, 1], [m1, m.v, -1], [m.v, m2, 1], [m2, m.u, -1]];
            for (const [x, y, s] of cycle) for (const k of g.motifOn.get(x + "," + y).mids) psi[k] += s;
            loops.push([m.u, m1, m.v, m2]);
        }
        update();
    }

    function update() {
        const diam = (b - 1) * E(b, L - 1);
        const total = V(b, L) - 2 * V(b, L - 1) + nu(b, L);
        $("trap-diam").textContent = fmtInt(diam);
        $("trap-loop").textContent = fmtInt(total - diam);
        $("trap-total").textContent = fmtInt(total);
        const any = psi.some(x => x !== 0);
        $("trap-res").textContent = any ? `‖Lψ − 2ψ‖ = ${residual(g, psi, 2).toExponential(1).replace("0.0e+0", "0")}` : "";
        $("trap-hint").textContent = mode === "loop" && L < 2
            ? "loops need L ≥ 2"
            : any ? "click again to add more · they superpose" : mode === "diamond" ? "click a diamond" : "click a loop (a diamond one level up)";
        stage.redraw();
    }

    function draw(ctx, w, h) {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        if (!g) return;
        const T = latticeTransform(pos, g.n, w, h, 30);
        ({ px, py } = project(pos, g.n, T));

        if (hoverMotif) {
            if (mode === "diamond") fillMotif(ctx, hoverMotif, px, py, alpha(C.c1, 0.12));
            else fillMotif(ctx, hoverMotif, px, py, alpha(C.c3, 0.1));
        }
        strokeEdges(ctx, g.edges, px, py, alpha(C.ink2, 0.3), edgeWidth(g.edges.length));

        // trapped loops of D_{L-1}, drawn through the old vertices
        ctx.strokeStyle = alpha(C.c3, 0.85); ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        for (const cyc of loops) {
            ctx.beginPath();
            cyc.forEach((k, i) => (i ? ctx.lineTo(px[k], py[k]) : ctx.moveTo(px[k], py[k])));
            ctx.closePath(); ctx.stroke();
        }
        ctx.setLineDash([]);

        let m = 0;
        for (const x of psi) m = Math.max(m, Math.abs(x));
        const c = reducedMotion() ? 1 : Math.cos(phase);
        const amp = Float32Array.from(psi, x => (m ? (x / m) * c : 0));
        drawAmplitudes(ctx, g.n, px, py, amp, Math.max(1.6, Math.min(4.5, 700 / g.n)));

        // the two roots never move
        ctx.fillStyle = C.c3;
        for (const r of [0, 1]) { ctx.beginPath(); ctx.arc(px[r], py[r], 5, 0, 2 * Math.PI); ctx.fill(); }
    }

    const anim = animator(root, (t, dt) => { phase += dt * 2.8; stage.redraw(); });
    if (!reducedMotion()) anim.start();

    const cv = $("trap-canvas");
    cv.addEventListener("pointermove", ev => {
        const [mx, my] = pointer(cv, ev);
        const m = motifAt(mx, my);
        if (m !== hoverMotif) { hoverMotif = m; stage.redraw(); }
    });
    cv.addEventListener("pointerleave", () => { hoverMotif = null; stage.redraw(); });
    cv.addEventListener("click", ev => {
        const [mx, my] = pointer(cv, ev);
        const m = motifAt(mx, my);
        if (m) addMode(m);
    });

    seg($("trap-mode"), v => { mode = v; clear(); });
    const Lr = range($("trap-L"), $("trap-L-out"), v => { L = v; rebuild(); });
    seg($("trap-b"), v => { b = +v; Lr.setMax(LMAX[b]); L = Lr.value; rebuild(); });
    $("trap-clear").addEventListener("click", clear);

    rebuild();
}

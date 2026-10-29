/* Chapter 4 · Zoom out: decimate the lattice and follow the note as a point of the (α, β) plane. */
import { buildLattice, layout, orbit, phi, V, symlog, symlogInv } from "./lattice.js?v=20261029a";
import { stageCanvas, seg, animator, colors, alpha, fmtInt, fmtNum, reducedMotion } from "./ui.js?v=20261029a";
import { latticeTransform, project, strokeEdges, edgeWidth, genColor, fillMotif } from "./draw.js?v=20261029a";
import { planeView, drawPlaneFrame, clamp } from "./plane.js?v=20261029a";

const LEVELS = { 2: 4, 3: 3 };
const LAM_MAX = 300;
const ease = t => t * t * (3 - 2 * t);
const onLine = ([a, be]) => Math.abs(2 * a - be) < 1e-7 * (1 + Math.abs(a) + Math.abs(be));

export function init(root, data) {
    const $ = id => root.querySelector("#" + id);
    let b = 2, L = LEVELS[2], g, pos;
    let lambda = 2 + 2 * 1.618033988749895, pts = [], hit = -1;
    let s = 0, t = 1, playing = false;

    const graph = stageCanvas($("zoom-graph"), drawGraph);
    const plane = stageCanvas($("zoom-plane"), drawPlane);
    const slider = $("zoom-lam"), out = $("zoom-lam-out");
    const toSlider = lam => Math.round((1000 * symlog(lam)) / symlog(LAM_MAX));
    const fromSlider = u => symlogInv((u / 1000) * symlog(LAM_MAX));

    function rebuild() {
        L = LEVELS[b];
        g = buildLattice(b, L);
        pos = layout(g);
        chips();
        setLambda(lambda, true);
    }

    function setLambda(lam, keepSlider = false) {
        lambda = lam;
        pts = orbit(lambda, b, L + 3);
        hit = pts.findIndex(onLine);
        if (hit > L - 1) hit = -1;
        s = 0; t = 1; playing = false;
        if (!keepSlider) slider.value = toSlider(lam);
        else slider.value = toSlider(lam);
        out.textContent = fmtNum(lam, 6);
        root.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(Math.abs(+c.dataset.v - lam) < 1e-9)));
        message(); redraw();
    }

    const maxStep = () => (hit >= 0 ? hit + 2 : L);

    function chips() {
        const box = $("zoom-snaps");
        box.innerHTML = "";
        const rungs = data.ladder[b];
        for (let k = 0; k < L; k++) {
            for (const r of rungs[k]) {
                if (k >= 3 && r > 60) continue;
                const c = document.createElement("button");
                c.type = "button"; c.className = "chip"; c.dataset.v = r;
                c.innerHTML = `${fmtNum(r, 4)}<span class="k">k=${k}</span>`;
                c.title = `a root of Q${k}: lands on the line after ${k} zoom-out${k === 1 ? "" : "s"}`;
                c.addEventListener("click", () => setLambda(r));
                box.append(c);
            }
        }
    }

    function message() {
        const m = $("zoom-msg");
        const p = pts[Math.min(s, pts.length - 1)];
        const where = p ? `(α, β) = (${fmtNum(p[0], 4)}, ${fmtNum(p[1], 4)})` : "";
        const zs = n => `${n} zoom-out${n === 1 ? "" : "s"}`;
        if (s === 0 && hit === 0) m.innerHTML = `<span class="hit">λ = 2 starts on the dashed line.</span> It is the diamond note of chapter 3, living on the newest diamonds.`;
        else if (s === 0) m.innerHTML = `The note starts at (1, λ) on the dotted line. <strong>Zoom out</strong> to see where it goes.`;
        else if (hit >= 0 && s === hit) m.innerHTML = `<span class="hit">On the dashed line after ${zs(hit)}.</span> So λ is a note: its vibrations live on the highlighted diamonds, and every bigger lattice plays it too.`;
        else if (hit >= 0 && s === hit + 1) m.innerHTML = `From the line the point always falls to (−1, 0)…`;
        else if (hit >= 0 && s >= hit + 2) m.innerHTML = `…and then to (1, 0), where it stays forever. That is what a note looks like.`;
        else if (s >= L) m.innerHTML = `<span class="esc">Missed the dashed line in all ${zs(L)}:</span> λ is not a trapped note of this lattice. Try one of the notes below.`;
        else m.innerHTML = `After ${zs(s)}: ${where}.`;
        $("zoom-step").disabled = s >= maxStep();
        const lvl = L - Math.min(s, L);
        $("zoom-level").textContent = `level ${lvl} · ${fmtInt(V(b, lvl))} vertices`;
    }

    function redraw() { graph.redraw(); plane.redraw(); }

    function drawGraph(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        if (!g) return;
        const C = colors();
        const T = latticeTransform(pos, g.n, w, h, 26);
        const { px, py } = project(pos, g.n, T);
        // displayed level and the generation that is collapsing
        const from = L - Math.min(s - (t < 1 ? 1 : 0), L);
        const collapsing = t < 1 && from > 0 && s <= L;
        const tt = ease(t);
        if (collapsing) {
            for (const { u, v, mids } of g.diamonds[from]) {
                const mx = (px[u] + px[v]) / 2, my = (py[u] + py[v]) / 2;
                for (const m of mids) { px[m] += (mx - px[m]) * tt; py[m] += (my - py[m]) * tt; }
            }
        }
        const level = collapsing ? from : L - Math.min(s, L);
        const pulse = reducedMotion() ? 0.3 : 0.22 + 0.12 * Math.sin(performance.now() / 300);
        if (hit >= 0 && s === hit && t >= 1 && level > 0) {
            for (const m of g.diamonds[level]) fillMotif(ctx, m, px, py, alpha(C.c3, pulse));
        }
        if (collapsing) strokeEdges(ctx, g.edgesAt[from - 1], px, py, alpha(C.ink2, 0.5 * tt), edgeWidth(g.edgesAt[from - 1].length));
        strokeEdges(ctx, g.edgesAt[level], px, py, alpha(C.ink2, collapsing ? 0.5 * (1 - tt) : 0.5), edgeWidth(g.edgesAt[level].length));
        const r = Math.max(1.6, Math.min(4, 400 / V(b, level)));
        for (let i = 0; i < g.n; i++) {
            const gen = g.gen[i];
            if (gen > level) continue;
            const fading = collapsing && gen === from;
            ctx.globalAlpha = fading ? 1 - tt : 1;
            ctx.fillStyle = hit >= 0 && s === hit && gen === level && level > 0 ? C.c3 : genColor(gen, L);
            ctx.beginPath(); ctx.arc(px[i], py[i], gen === 0 ? 4.5 : r, 0, 2 * Math.PI); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawPlane(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        const C = colors();
        const P = planeView(w, h);
        drawPlaneFrame(ctx, P, { field: (a, be) => phi(a, be, b) });
        if (!pts.length) return;
        const scr = pts.map(([a, be]) => [P.X(clamp(a, -P.amax, P.amax)), P.Y(clamp(be, P.bmin, P.bmax))]);
        const upto = Math.min(s, scr.length - 1);
        // path so far
        ctx.strokeStyle = alpha(C.c1, 0.8); ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i <= upto; i++) i ? ctx.lineTo(...scr[i]) : ctx.moveTo(...scr[i]);
        let cur = scr[upto];
        if (t < 1 && s >= 1 && s < scr.length) {
            const a = scr[s - 1], z = scr[s], tt = ease(t);
            cur = [a[0] + (z[0] - a[0]) * tt, a[1] + (z[1] - a[1]) * tt];
            ctx.moveTo(...a); ctx.lineTo(...cur);
        }
        ctx.stroke();
        ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
        for (let i = 0; i <= upto - (t < 1 ? 1 : 0); i++) {
            ctx.fillStyle = C.surface; ctx.strokeStyle = C.c1; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(...scr[i], 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
            ctx.fillStyle = C.c1Ink; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
            ctx.fillText(String(i), scr[i][0] + 5, scr[i][1] - 3);
        }
        const isHit = hit >= 0 && s === hit && t >= 1;
        ctx.fillStyle = isHit ? C.c3 : C.c1;
        ctx.beginPath(); ctx.arc(...cur, isHit ? 7 : 6, 0, 2 * Math.PI); ctx.fill();
    }

    const anim = animator(root, (time, dt) => {
        if (t < 1) {
            t = Math.min(1, t + dt / 0.75);
            if (t >= 1) message();
        } else if (playing && s < maxStep()) {
            s++; t = 0;
        } else {
            playing = false;
            // keep pulsing the highlighted diamonds while a note is shown
            if (!(hit >= 0 && s === hit)) { redraw(); return false; }
        }
        redraw();
    });

    function step() {
        if (s >= maxStep()) return;
        s++;
        if (reducedMotion()) { t = 1; message(); redraw(); return; }
        t = 0; anim.start();
    }

    slider.addEventListener("input", () => setLambda(fromSlider(+slider.value), true));
    $("zoom-step").addEventListener("click", step);
    $("zoom-play").addEventListener("click", () => {
        if (s >= maxStep()) { s = 0; t = 1; }
        if (reducedMotion()) { s = maxStep(); message(); redraw(); return; }
        playing = true; anim.start();
    });
    $("zoom-reset").addEventListener("click", () => setLambda(lambda, true));
    seg($("zoom-b"), v => {
        b = +v;
        lambda = data.ladder[b][1][1];
        rebuild();
    });

    rebuild();
}

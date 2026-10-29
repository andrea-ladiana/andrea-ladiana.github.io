/* Chapter 5: real VDJdb receptors. Cue with one or both chains, recall the epitope, keep a tally. */
import { stageCanvas, seg, colors, reducedMotion } from "./ui.js?v=20261029a";
import { drawPattern, text, line, alpha } from "./draw.js?v=20261029a";
import { Memory, overlap } from "./engine.js?v=20261029a";
import { unpackBits } from "./codes.js?v=20261029a";

const ROWS = 8, COLS = 16;
const SPECIES = { HomoSapiens: "human, self", InfluenzaA: "influenza A", MusMusculus: "mouse" };
// the paper's results (§8, Fig. 7): memory by cue, generalisation, its null and chance
const PAPER = [
    { key: "stored-ab", label: ["stored", "α + β"], v: 0.9994 },
    { key: "stored-a", label: ["stored", "α only"], v: 0.79 },
    { key: "stored-b", label: ["stored", "β only"], v: 0.83 },
    { key: "unseen-ab", label: ["new", "α + β"], v: 0.11 },
    { key: "null", label: ["labels", "shuffled"], v: 0.048 },
    { key: "chance", label: ["chance", ""], v: 0.005 },
];

export async function init(root) {
    const d = await fetch(new URL("../data/receptors.json?v=20261029a", import.meta.url)).then(r => r.json());
    const N = d.N, L = 3, P = d.stored.a.length, K = d.epitopes.length;
    const stored = unpackBits(d.stored.codes, P * L * N);
    const unseen = unpackBits(d.unseen.codes, d.unseen.a.length * L * N);
    const epi = unpackBits(d.epiCodes, K * N);
    const mem = new Memory(stored, P, L, N);
    const tally = {};

    let cur = null, frames = [], shown = 0, timer = 0;
    const name = k => {
        const e = d.epitopes[k];
        const sp = SPECIES[e.species] || e.species;
        return sp ? `${e.seq} · ${sp}` : e.seq;
    };
    const nearest = s => {
        let best = -2, k = -1;
        for (let j = 0; j < K; j++) { const o = overlap(s, epi, 2 * N, j * N, N); if (o > best) { best = o; k = j; } }
        return k;
    };

    function go() {
        const src = source.value === "stored" ? d.stored : d.unseen, codes = source.value === "stored" ? stored : unseen;
        const q = Math.floor(Math.random() * src.a.length);
        const known = { ab: [0, 1], a: [0], b: [1] }[cue.value];
        const c = new Int8Array(L * N);
        for (const a of known) c.set(codes.subarray((q * L + a) * N, (q * L + a + 1) * N), a * N);
        const { path } = mem.recall(c, known, d.steps);
        frames = path;
        const truth = src.e[q], got = nearest(path.at(-1));
        cur = { q, a: src.a[q], b: src.b[q], known, truth, got, ok: got === truth };
        const key = `${source.value}-${cue.value}`;
        tally[key] = tally[key] || { ok: 0, n: 0 };
        tally[key].ok += cur.ok; tally[key].n++;
        clearTimeout(timer);
        const show = k => {
            shown = k; left.redraw();
            if (k + 1 < frames.length) timer = setTimeout(() => show(k + 1), 260);
            else report();
        };
        root.querySelector("#rec-answer").textContent = "…";
        show(reducedMotion() ? frames.length - 1 : 0);
    }

    function report() {
        root.querySelector("#rec-answer").textContent = `${d.epitopes[cur.got].seq} ${cur.ok ? "✓" : "✗"}`;
        root.querySelector("#rec-truth").textContent = name(cur.truth);
        const t = tally[`${source.value}-${cue.value}`];
        root.querySelector("#rec-tally").textContent = `${t.ok} of ${t.n} right (${source.value === "stored" ? "stored" : "new"}, ${{ ab: "α + β", a: "α only", b: "β only" }[cue.value]})`;
        bars.redraw();
    }

    const left = stageCanvas(root.querySelector("#rec-run"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        if (!cur) return;
        // three strips of 8×16 with room for their labels and the legend underneath
        const pad = 16, gw = Math.min(w - 2 * pad, 300, ((h - 3 * 44 - 40) / 3) * COLS / ROWS), gh = gw * ROWS / COLS;
        const x = (w - gw) / 2;
        const rowH = gh + 44;
        let y = Math.max(pad, (h - 3 * rowH - 26) / 2) + 22;
        const s = frames[shown];
        const layer = (lab, seq, a, known) => {
            text(ctx, lab, x, y - 8, { px: 12 });
            text(ctx, seq, x + gw, y - 8, { px: 13, align: "right", mono: true, color: known ? C.ink : C.muted });
            if (known || a === 2) drawPattern(ctx, s, ROWS, COLS, x, y, gw, gh, { o: a * N, target: a === 2 ? epi : null, to: cur.truth * N });
            else {
                ctx.fillStyle = C.surface2; ctx.fillRect(x, y, gw, gh);
                ctx.strokeStyle = C.line; ctx.setLineDash([4, 4]); ctx.strokeRect(x + 0.5, y + 0.5, gw - 1, gh - 1); ctx.setLineDash([]);
                text(ctx, "not given", x + gw / 2, y + gh / 2, { align: "center", base: "middle", px: 12 });
            }
            y += rowH;
        };
        layer("α chain, CDR3", cur.a, 0, cur.known.includes(0));
        layer("β chain, CDR3", cur.b, 1, cur.known.includes(1));
        // arrow into the epitope layer
        ctx.strokeStyle = C.axis; ctx.lineWidth = 1.5;
        const ax = x + gw / 2, ay = y - 40;
        line(ctx, ax, ay - 2, ax, ay + 12); line(ctx, ax - 4, ay + 7, ax, ay + 12); line(ctx, ax + 4, ay + 7, ax, ay + 12);
        const done = shown === frames.length - 1;
        layer("epitope, recalled", done ? d.epitopes[cur.got].seq : "…", 2, true);
        text(ctx, "orange: bits that differ from the true epitope", x, y - 44 + 18, { px: 11.5 });
        if (done) text(ctx, cur.ok ? "right" : "wrong", x + gw, y - 44 + 18, { px: 12, align: "right", color: cur.ok ? C.c2Ink : C.c3Ink, weight: 600 });
    });

    const bars = stageCanvas(root.querySelector("#rec-bars"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const top = 40, bottom = h - 46, left = 34, right = w - 12;
        const bw = (right - left) / PAPER.length;
        text(ctx, "epitope named right: the paper (bars), you (dots)", 12, 18, { px: 12.5 });
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        for (const v of [0, 0.5, 1]) {
            const y = bottom - v * (bottom - top);
            line(ctx, left, y + 0.5, right, y + 0.5);
            text(ctx, String(v), left - 6, y, { align: "right", base: "middle", px: 11.5 });
        }
        PAPER.forEach((p, k) => {
            const x = left + k * bw + bw * 0.18, wd = bw * 0.64, y = bottom - p.v * (bottom - top);
            ctx.fillStyle = p.key.startsWith("stored") ? C.c2 : p.key === "unseen-ab" ? C.c1 : C.axis;
            ctx.fillRect(x, y, wd, bottom - y);
            text(ctx, p.v < 0.1 ? p.v.toFixed(3) : p.v.toFixed(2), x + wd / 2, y - 4, { align: "center", base: "bottom", px: 11, mono: true, color: C.ink2 });
            text(ctx, p.label[0], x + wd / 2, bottom + 6, { align: "center", base: "top", px: 11 });
            text(ctx, p.label[1], x + wd / 2, bottom + 20, { align: "center", base: "top", px: 11 });
            const t = tally[p.key];
            if (t && t.n) {
                const yy = bottom - (t.ok / t.n) * (bottom - top);
                ctx.beginPath(); ctx.arc(x + wd / 2, yy, 5, 0, 2 * Math.PI);
                ctx.fillStyle = C.c3; ctx.fill(); ctx.strokeStyle = C.stageBg; ctx.lineWidth = 1.5; ctx.stroke();
            }
        });
        ctx.strokeStyle = alpha(C.axis, 1); line(ctx, left, bottom + 0.5, right, bottom + 0.5);
    });

    const cue = seg(root.querySelector("#rec-cue"), go);
    const source = seg(root.querySelector("#rec-src"), go);
    root.querySelector("#rec-go").addEventListener("click", go);
    go();
}

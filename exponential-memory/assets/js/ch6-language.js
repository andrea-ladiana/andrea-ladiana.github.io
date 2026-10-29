/* Chapter 6: CLINC150. Type a request, encode it as the paper does, recall its intent. */
import { stageCanvas, range, colors } from "./ui.js?v=20261029a";
import { text, line } from "./draw.js?v=20261029a";
import { Memory, overlap } from "./engine.js?v=20261029a";
import { unpackBits, TextEncoder128 } from "./codes.js?v=20261029a";

// the paper's results (§8–9, Fig. 8): the same network on two kinds of data
const PAPER = [
    { key: "rec-mem", group: "receptors", label: "stored", v: 0.997 },
    { key: "rec-gen", group: "receptors", label: "new", v: 0.11 },
    { key: "rec-null", group: "receptors", label: "shuffled", v: 0.048 },
    { key: "stored", group: "language", label: "stored", v: 0.717 },
    { key: "unseen", group: "language", label: "new", v: 0.584 },
    { key: "lang-null", group: "language", label: "shuffled", v: 0.013 },
    { key: "lang-rand", group: "language", label: "blind code", v: 0.008 },
];
const TOP = 3;

const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const words = s => s.trim().split(/\s+/).filter(Boolean);

export async function init(root) {
    const out = root.querySelector("#lang-out"), input = root.querySelector("#lang-input");
    const d = await fetch(new URL("../data/clinc.json?v=20261029a", import.meta.url)).then(r => r.json());
    const N = d.N, P = d.stored.text.length, K = d.intents.length;
    const enc = new TextEncoder128(d.encoder);
    const utt = unpackBits(d.stored.codes, P * N), icodes = unpackBits(d.intentCodes, K * N);
    const xi = new Int8Array(P * 2 * N);
    for (let mu = 0; mu < P; mu++) {
        xi.set(utt.subarray(mu * N, (mu + 1) * N), mu * 2 * N);
        xi.set(icodes.subarray(d.stored.intent[mu] * N, (d.stored.intent[mu] + 1) * N), mu * 2 * N + N);
    }
    const mem = new Memory(xi, P, 2, N);
    const tally = {};
    let base = { text: "", truth: -1, src: null }, timer = 0;

    const nearest = s => {
        let best = -2, k = -1;
        for (let j = 0; j < K; j++) { const o = overlap(s, icodes, N, j * N, N); if (o > best) { best = o; k = j; } }
        return k;
    };

    function ask() {
        const all = words(base.text), k = all.length ? Math.min(ws.value, all.length) : 0;
        const q = all.slice(0, k).join(" ");
        if (!q) { out.innerHTML = `<p class="lang-status">Type a request, or pick one above.</p>`; return; }
        const { code, known } = enc.encode(q);
        if (!known) { out.innerHTML = `<p class="lang-status">None of these words or letter groups appear in the stored sentences, so the code says nothing. Try English.</p>`; return; }
        const cue = new Int8Array(2 * N); cue.set(code);
        const { state } = mem.recall(cue, [0], d.steps);
        const got = nearest(state);
        const w = mem.shares(state);
        const top = [];
        for (let mu = 0; mu < P; mu++) {
            if (top.length < TOP || w[mu] > top.at(-1)[1]) {
                top.push([mu, w[mu]]); top.sort((a, b) => b[1] - a[1]);
                if (top.length > TOP) top.pop();
            }
        }
        const full = k === all.length;
        let verdict = "";
        if (base.truth >= 0) {
            const ok = got === base.truth;
            // each picked request counts once, read in full
            if (full && base.count) {
                base.count = false;
                tally[base.src] = tally[base.src] || { ok: 0, n: 0 };
                tally[base.src].ok += ok; tally[base.src].n++;
                bars.redraw();
            }
            verdict = ok ? `Right: this request is filed under <b>${esc(d.intents[base.truth])}</b>.`
                : `Wrong: this request is filed under <b>${esc(d.intents[base.truth])}</b>.`;
            const t = tally[base.src];
            if (t) verdict += ` <span class="muted">Your ${base.src === "stored" ? "stored" : "new"} requests so far: ${t.ok} of ${t.n}.</span>`;
        }
        const shown = full ? esc(q) : `${esc(q)} <span class="muted">${esc(all.slice(k).join(" "))}</span>`;
        out.innerHTML = `
            <p class="read">“${shown}”</p>
            <p class="k">intent recalled</p>
            <p class="intent${base.truth >= 0 && got !== base.truth ? " miss" : ""}">${esc(d.intents[got])}</p>
            <p class="verdict">${verdict || "&nbsp;"}</p>
            <p class="k">stored sentences that carried the vote</p>
            <ol>${top.map(([mu, s]) => `<li><span class="t">${esc(d.stored.text[mu])}</span><span class="w">${(100 * s).toFixed(s > 0.995 ? 0 : 1)}%</span><span class="i">${esc(d.intents[d.stored.intent[mu]])}</span><span class="bar" style="width:${(100 * s).toFixed(1)}%"></span></li>`).join("")}</ol>`;
    }

    function setBase(t, truth = -1, src = null, count = false) {
        base = { text: t, truth, src, count };
        const n = Math.max(1, words(t).length);
        ws.setMax(n); ws.set(n);
        clearTimeout(timer);
        ask();
    }

    const ws = range(root.querySelector("#lang-words"), root.querySelector("#lang-words-out"), () => ask(),
        v => (v >= +root.querySelector("#lang-words").max ? "all" : String(v)));

    input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => setBase(input.value), 220);
    });
    const pick = (k, count) => {
        const src = k === "stored" ? d.stored : d.unseen;
        const j = Math.floor(Math.random() * src.text.length);
        input.value = src.text[j];
        setBase(src.text[j], src.intent[j], k, count);
    };
    root.querySelectorAll("#lang-chips button").forEach(b => b.addEventListener("click", () => pick(b.dataset.k, true)));

    const bars = stageCanvas(root.querySelector("#lang-bars"), (ctx, w, h) => {
        const C = colors();
        ctx.clearRect(0, 0, w, h);
        const top = 52, bottom = h - 56, left = 34, right = w - 12, gap = 14;
        const bw = (right - left - gap) / PAPER.length;
        text(ctx, "intent or epitope named right", 12, 18, { px: 12.5 });
        text(ctx, "the paper (bars), you (dots)", 12, 34, { px: 11.5 });
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        for (const v of [0, 0.5, 1]) {
            const y = bottom - v * (bottom - top);
            line(ctx, left, y + 0.5, right, y + 0.5);
            text(ctx, String(v), left - 6, y, { align: "right", base: "middle", px: 11.5 });
        }
        let gx = { receptors: [Infinity, -Infinity], language: [Infinity, -Infinity] };
        PAPER.forEach((p, k) => {
            const x0 = left + k * bw + (p.group === "language" ? gap : 0);
            const x = x0 + bw * 0.16, wd = bw * 0.68, y = bottom - p.v * (bottom - top);
            ctx.fillStyle = p.label === "stored" ? C.c2 : p.label === "new" ? C.c1 : C.axis;
            ctx.fillRect(x, y, wd, bottom - y);
            text(ctx, p.v < 0.1 ? p.v.toFixed(3) : p.v.toFixed(2), x + wd / 2, y - 4, { align: "center", base: "bottom", px: 10.5, mono: true, color: C.ink2 });
            const lab = p.label.split(" ");
            lab.forEach((s, j) => text(ctx, s, x + wd / 2, bottom + 6 + 13 * j, { align: "center", base: "top", px: 10.5 }));
            gx[p.group][0] = Math.min(gx[p.group][0], x); gx[p.group][1] = Math.max(gx[p.group][1], x + wd);
            const t = tally[p.key];
            if (t && t.n) {
                const yy = bottom - (t.ok / t.n) * (bottom - top);
                ctx.beginPath(); ctx.arc(x + wd / 2, yy, 5, 0, 2 * Math.PI);
                ctx.fillStyle = C.c3; ctx.fill(); ctx.strokeStyle = C.stageBg; ctx.lineWidth = 1.5; ctx.stroke();
            }
        });
        ctx.strokeStyle = C.axis; ctx.lineWidth = 1; line(ctx, left, bottom + 0.5, right, bottom + 0.5);
        for (const [g, [a, b]] of Object.entries(gx)) {
            ctx.strokeStyle = C.line; line(ctx, a, bottom + 36.5, b, bottom + 36.5);
            text(ctx, g, (a + b) / 2, bottom + 40, { align: "center", base: "top", px: 12, color: g === "language" ? C.c1Ink : C.ink2 });
        }
    });

    pick("stored", false);
}

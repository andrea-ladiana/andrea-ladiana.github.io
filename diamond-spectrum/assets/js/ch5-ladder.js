/* Chapter 5 · The ladder: rungs of notes, the counting staircase, and the twins. */
import { V } from "./lattice.js?v=20261029a";
import { stageCanvas, seg, range, tooltip, pointer, colors, alpha, fmtNum, fmtPct, frac } from "./ui.js?v=20261029a";
import { lambdaScale, drawLambdaAxis } from "./axis.js?v=20261029a";

export function init(root, data) {
    const $ = id => root.querySelector("#" + id);
    const tip = tooltip($("ladder-tip"));
    let b = 3, L = 3;
    let dots = [];

    const ladder = stageCanvas($("ladder-canvas"), drawLadder);
    const idos = stageCanvas($("idos-canvas"), drawIdos);
    let PADL = 112, PADR = 86;
    const scale = w => {
        const narrow = w < 520;
        PADL = narrow ? 62 : 112; PADR = narrow ? 48 : 86;
        return lambdaScale(data.ladder[b].at(-1).at(-1) * 1.3, PADL, w - PADR);
    };

    function drawLadder(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        const C = colors();
        const rungs = data.ladder[b];
        const K = rungs.length - 1;
        const S = scale(w);
        const top = 22, base = h - 40;
        const rowY = k => base - 14 - ((base - 14 - top) * k) / K;
        drawLambdaAxis(ctx, S, base, { grid: [top - 8, base] });
        ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
        dots = [];
        rungs.forEach((row, k) => {
            const y = rowY(k);
            ctx.strokeStyle = alpha(C.c1, 0.14); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PADL, y + 0.5); ctx.lineTo(w - PADR, y + 0.5); ctx.stroke();
            // each root of rung k carries (b−1)/b · (2b)^−k of the modes
            const r = Math.max(1.7, 6.5 * Math.pow(2 * b, -k / 4));
            ctx.fillStyle = k === 0 ? C.c3 : C.c1;
            for (const lam of row) {
                const x = S.X(lam);
                ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
                dots.push({ x, y, lam, k });
            }
            ctx.fillStyle = C.ink2; ctx.textAlign = "right"; ctx.textBaseline = "middle";
            ctx.fillText(w < 520 ? `rung ${k}` : `rung ${k} · ${row.length} note${row.length > 1 ? "s" : ""}`, PADL - 12, y);
            ctx.fillStyle = C.muted; ctx.textAlign = "left";
            ctx.fillText(frac(b - 1, b ** (k + 1)), w - PADR + 12, y);
        });
        ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText("share", w - PADR + 12, 2);
    }

    function drawIdos(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        const C = colors();
        const spec = data.spectra[b][L];
        const n = V(b, L);
        const S = scale(w);
        const top = 30, base = h - 36;
        const Y = f => base - f * (base - top);
        drawLambdaAxis(ctx, S, base, { label: "" });
        // y gridlines
        ctx.font = "11.5px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        for (const f of [0, 0.5, 1]) {
            ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(PADL, Y(f) + 0.5); ctx.lineTo(w - PADR, Y(f) + 0.5); ctx.stroke();
            ctx.fillStyle = C.muted; ctx.fillText(f === 0.5 ? "½" : String(f), PADL - 8, Y(f));
        }
        // staircase
        let acc = 0, jump = [0, 0];
        ctx.strokeStyle = C.c2; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(PADL, Y(0));
        for (const [lam, m] of spec) {
            const x = S.X(lam);
            ctx.lineTo(x, Y(acc));
            if (Math.abs(lam - 2) < 1e-9) jump = [acc, acc + m / n];
            acc += m / n;
            ctx.lineTo(x, Y(acc));
        }
        ctx.lineTo(w - PADR, Y(acc));
        ctx.stroke();
        // the jump at λ = 2, against the two predictions
        const x2 = S.X(2);
        const naive = ((b - 1) * (2 * b - 1)) / (2 * b * b), lim = (b - 1) / b;
        ctx.strokeStyle = C.c3; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x2, Y(jump[0])); ctx.lineTo(x2, Y(jump[1])); ctx.stroke();
        const guide = (f, col, label, dash, dy) => {
            ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.moveTo(x2 - 26, Y(jump[0] + f)); ctx.lineTo(x2 - 4, Y(jump[0] + f)); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = col; ctx.textBaseline = "middle";
            // on narrow screens there is no room left of λ = 2: write to its right
            ctx.textAlign = w < 520 ? "left" : "right";
            ctx.fillText(label, w < 520 ? x2 + 7 : x2 - 30, Y(jump[0] + f) + dy * (w < 520 ? 1.4 : 1));
        };
        guide(lim, C.c3Ink, `limit ${frac(b - 1, b)}`, [5, 3], -6);
        guide(naive, C.muted, `${w < 520 ? "diamonds" : "diamonds only"} ${frac((b - 1) * (2 * b - 1), 2 * b * b)}`, [2, 3], 6);

        const m2 = Math.round((jump[1] - jump[0]) * n);
        $("idos-jump").textContent = `${m2.toLocaleString("en-US")} of ${n.toLocaleString("en-US")} = ${fmtPct(jump[1] - jump[0])}`;
        $("idos-naive").textContent = `${frac((b - 1) * (2 * b - 1), 2 * b * b)} ≈ ${fmtPct(naive)}`;
        $("idos-limit").textContent = `${frac(b - 1, b)} ≈ ${fmtPct(lim)}`;
    }

    const cv = $("ladder-canvas");
    cv.addEventListener("pointermove", ev => {
        const [mx, my] = pointer(cv, ev);
        let best = null, bd = 100;
        for (const d of dots) { const e = (d.x - mx) ** 2 + (d.y - my) ** 2; if (e < bd) { bd = e; best = d; } }
        if (!best) return tip.hide();
        tip.show(best.x, best.y, `λ = ${fmtNum(best.lam, 8)} · rung ${best.k}<br>a note of every lattice with L > ${best.k}`);
    });
    cv.addEventListener("pointerleave", () => tip.hide());

    const Lmax = () => Math.max(...Object.keys(data.spectra[b]).map(Number));
    const Lr = range($("idos-L"), $("idos-L-out"), v => { L = v; idos.redraw(); });
    seg($("ladder-b"), v => {
        b = +v;
        Lr.setMax(Lmax());
        L = Lr.value;
        ladder.redraw(); idos.redraw();
    });
    Lr.setMax(Lmax());

    twins(root, data.twins);
}

/** Two near-equal notes from consecutive rungs, aligned digit by digit. */
function twins(root, T) {
    const pick = root.querySelector("#twins-pick"), box = root.querySelector("#twins-digits");
    T.pairs.forEach((p, i) => {
        const btn = document.createElement("button");
        btn.dataset.v = i;
        btn.textContent = `${p.d1.slice(0, 6)} · rungs ${p.k1} & ${p.k2}`;
        pick.append(btn);
    });
    const show = i => {
        const { d1, d2, k1, k2, relgap } = T.pairs[i];
        let j = 0;
        while (j < d1.length && d1[j] === d2[j]) j++;
        const sameDigits = j - (d1.indexOf(".") < j ? 1 : 0);
        const tail = 14;
        const row = (d, k) => `<div class="row"><span class="lab">rung ${k}</span><span><span class="same">${d.slice(0, j)}</span><span class="diff">${d[j]}</span><span class="rest">${d.slice(j + 1, j + 1 + tail)}…</span></span></div>`;
        const [m, e] = relgap.split("e");
        box.innerHTML = row(d1, k1) + row(d2, k2) +
            `<div class="gap">The first <b>${sameDigits}</b> digits agree: a relative gap of <b>${m} × 10<sup>${String(+e).replace("-", "−")}</sup></b>.` +
            (i > 0 ? " One rung higher, the near-miss is far tighter still." : " This is the pair quoted with the paper’s Fig. 4.") + "</div>";
    };
    const s = seg(pick, v => show(+v));
    s.set(0);
}

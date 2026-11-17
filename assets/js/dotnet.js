/*
 * dotnet.js — "every dot on this page is a neuron".
 *
 * A Hopfield network drawn on the page's own dot grid. The neurons of a rectangular "slot" store a few
 * pictures with the projector (pseudo-inverse) rule, so that even strongly correlated pictures are exact
 * fixed points:
 *
 *   h_i = Σ_μ ξ_i^μ a_μ + λ ξ_i^cue,   a = C⁻¹ m,   m_μ = (1/N) Σ_j ξ_j^μ σ_j,   C_μν = (1/N) Σ_j ξ_j^μ ξ_j^ν
 *
 * Glauber dynamics at temperature T: P(σ_i = +1) = 1 / (1 + exp(−2 h_i / T)).
 * Dots outside the slot are neurons held down by a field (h = −1): heated by the pointer they flicker, then relax.
 */
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const SS = 4; // supersampling when rasterising pictures
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ---------------------------------------------------------------- pictures ---------- */

    /** Wrap a drawing made in the unit square [0,1]² so that it is centred in a W × H raster. */
    function inSquare(draw, fill) {
        return (g, W, H) => {
            const s = Math.min(W, H) * (fill || 0.9);
            g.setTransform(s, 0, 0, s, (W - s) / 2, (H - s) / 2);
            g.fillStyle = g.strokeStyle = '#000';
            g.lineCap = g.lineJoin = 'round';
            draw(g, s);
        };
    }

    /** A text glyph scaled to fit the unit square. */
    function glyph(str, weight, family, box) {
        return (g, s) => {
            const m = g.getTransform();
            g.save();
            g.setTransform(1, 0, 0, 1, m.e, m.f);
            const fam = family || 'Inter, "Segoe UI", system-ui, sans-serif';
            g.font = `${weight || 800} ${s}px ${fam}`;
            let mt = g.measureText(str);
            const k = Math.min((box || 0.9) * s / mt.width, (box || 0.9) * s / (mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent));
            g.font = `${weight || 800} ${s * k}px ${fam}`;
            mt = g.measureText(str);
            g.textAlign = 'center';
            g.fillStyle = '#000';
            g.fillText(str, s / 2, s / 2 + (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2);
            g.restore();
        };
    }

    function poly(g, pts) {
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fill();
    }

    const DRAW = {
        heart(g) {
            g.beginPath();
            g.moveTo(0.5, 0.9);
            g.bezierCurveTo(0.14, 0.64, 0.0, 0.42, 0.1, 0.24);
            g.bezierCurveTo(0.2, 0.06, 0.44, 0.08, 0.5, 0.3);
            g.bezierCurveTo(0.56, 0.08, 0.8, 0.06, 0.9, 0.24);
            g.bezierCurveTo(1.0, 0.42, 0.86, 0.64, 0.5, 0.9);
            g.fill();
        },
        cat(g) {
            g.beginPath(); g.ellipse(0.5, 0.6, 0.38, 0.31, 0, 0, TAU); g.fill();
            poly(g, [[0.14, 0.48], [0.18, 0.06], [0.44, 0.33]]);
            poly(g, [[0.86, 0.48], [0.82, 0.06], [0.56, 0.33]]);
            g.globalCompositeOperation = 'destination-out';
            g.beginPath(); g.ellipse(0.36, 0.56, 0.058, 0.09, 0, 0, TAU); g.fill();
            g.beginPath(); g.ellipse(0.64, 0.56, 0.058, 0.09, 0, 0, TAU); g.fill();
            poly(g, [[0.45, 0.69], [0.55, 0.69], [0.5, 0.75]]);
            g.lineWidth = 0.028;
            for (const s of [-1, 1]) {
                g.beginPath(); g.moveTo(0.5 + s * 0.12, 0.76); g.lineTo(0.5 + s * 0.3, 0.72); g.stroke();
                g.beginPath(); g.moveTo(0.5 + s * 0.12, 0.8); g.lineTo(0.5 + s * 0.3, 0.83); g.stroke();
            }
            g.globalCompositeOperation = 'source-over';
        },
        crane(g) {
            poly(g, [[0.18, 0.6], [0.82, 0.6], [0.64, 0.78], [0.36, 0.78]]);
            poly(g, [[0.2, 0.64], [0.36, 0.6], [0.15, 0.17], [0.09, 0.18]]);
            poly(g, [[0.09, 0.15], [0.17, 0.19], [0.02, 0.31]]);
            poly(g, [[0.64, 0.6], [0.8, 0.64], [0.97, 0.17], [0.91, 0.16]]);
            poly(g, [[0.34, 0.62], [0.68, 0.62], [0.58, 0.02]]);
        },
        key(g) {
            g.translate(0.5, 0.5); g.rotate(-0.5); g.translate(-0.5, -0.5);
            g.beginPath(); g.arc(0.24, 0.5, 0.19, 0, TAU); g.fill();
            g.globalCompositeOperation = 'destination-out';
            g.beginPath(); g.arc(0.22, 0.5, 0.075, 0, TAU); g.fill();
            g.globalCompositeOperation = 'source-over';
            g.fillRect(0.38, 0.45, 0.6, 0.1);
            g.fillRect(0.74, 0.55, 0.07, 0.13);
            g.fillRect(0.87, 0.55, 0.07, 0.17);
        },
        bulb(g) {
            g.lineWidth = 0.075;
            g.beginPath();
            g.arc(0.5, 0.4, 0.27, Math.PI * 0.78, Math.PI * 2.22);
            g.lineTo(0.62, 0.7); g.lineTo(0.38, 0.7); g.closePath();
            g.stroke();
            g.fillRect(0.37, 0.72, 0.26, 0.06);
            g.fillRect(0.39, 0.8, 0.22, 0.06);
            g.fillRect(0.44, 0.88, 0.12, 0.05);
            g.lineWidth = 0.05;
            g.beginPath(); g.moveTo(0.43, 0.6); g.lineTo(0.45, 0.42); g.lineTo(0.5, 0.48); g.lineTo(0.55, 0.42); g.lineTo(0.57, 0.6); g.stroke();
        },
        saturn(g) {
            const ring = (from, to, w) => {
                g.lineWidth = w;
                g.beginPath(); g.ellipse(0.5, 0.52, 0.47, 0.13, -0.32, from, to); g.stroke();
            };
            ring(0, TAU, 0.06);
            g.beginPath(); g.arc(0.5, 0.52, 0.24, 0, TAU); g.fill();
            g.globalCompositeOperation = 'destination-out';
            ring(-0.1, Math.PI + 0.1, 0.13);
            g.globalCompositeOperation = 'source-over';
            ring(-0.1, Math.PI + 0.1, 0.06);
        },
        notes(g) {
            for (const [x, y] of [[0.3, 0.76], [0.74, 0.66]]) {
                g.beginPath(); g.ellipse(x, y, 0.125, 0.09, -0.35, 0, TAU); g.fill();
            }
            g.fillRect(0.36, 0.22, 0.065, 0.54);
            g.fillRect(0.8, 0.12, 0.065, 0.54);
            poly(g, [[0.36, 0.2], [0.865, 0.1], [0.865, 0.22], [0.36, 0.32]]);
        },
        pi(g) {
            g.lineWidth = 0.11;
            g.beginPath(); g.moveTo(0.12, 0.32); g.quadraticCurveTo(0.2, 0.22, 0.34, 0.24); g.lineTo(0.88, 0.22); g.stroke();
            g.beginPath(); g.moveTo(0.37, 0.26); g.quadraticCurveTo(0.36, 0.62, 0.24, 0.84); g.stroke();
            g.beginPath(); g.moveTo(0.66, 0.25); g.lineTo(0.65, 0.7); g.quadraticCurveTo(0.66, 0.84, 0.8, 0.8); g.stroke();
        }
    };

    const PICTURES = Object.fromEntries(Object.entries(DRAW).map(([k, f]) => [k, inSquare(f)]));
    PICTURES.text = (str, weight, family, fill) => inSquare(glyph(str, weight, family), fill || 0.92);

    /* ---------------------------------------------------------------- maths ------------- */

    function invert(M) {
        const p = M.length;
        const A = M.map((row, i) => [...row, ...Array.from({ length: p }, (_, j) => +(i === j))]);
        for (let c = 0; c < p; c++) {
            let piv = c;
            for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
            [A[c], A[piv]] = [A[piv], A[c]];
            const d = A[c][c];
            for (let j = 0; j < 2 * p; j++) A[c][j] /= d;
            for (let r = 0; r < p; r++) {
                if (r === c) continue;
                const f = A[r][c];
                for (let j = 0; j < 2 * p; j++) A[r][j] -= f * A[c][j];
            }
        }
        return A.map(row => Float64Array.from(row.slice(p)));
    }

    /** Rasterise a picture into the slot (in cells) of a cols × rows grid; −1 everywhere else. */
    function rasterize(draw, cols, rows, slot) {
        const c = document.createElement('canvas');
        c.width = slot.w * SS; c.height = slot.h * SS;
        const g = c.getContext('2d', { willReadFrequently: true });
        draw(g, c.width, c.height);
        const img = g.getImageData(0, 0, c.width, c.height).data;
        const xi = new Int8Array(cols * rows).fill(-1);
        for (let r = 0; r < slot.h; r++) {
            for (let q = 0; q < slot.w; q++) {
                let s = 0;
                for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) s += img[((r * SS + y) * c.width + q * SS + x) * 4 + 3];
                const Q = slot.q + q, R = slot.r + r;
                if (Q >= 0 && Q < cols && R >= 0 && R < rows) xi[R * cols + Q] = s / (SS * SS * 255) > 0.42 ? 1 : -1;
            }
        }
        return xi;
    }

    /* ---------------------------------------------------------------- the network -------- */

    function create(options) {
        const o = Object.assign({
            cell: 14,              // dot spacing in CSS px (number or function)
            align: 'element',      // 'page': dots on the document grid; 'element': dots on the canvas grid
            slot: null,            // () => {x, y, w, h} in canvas CSS px
            pictures: [],          // [{ name, draw }]
            T0: 0.3,
            rate: 2.2,             // sweeps per second
            heatTemp: 3.2,
            radius: 0.4,           // up-dot radius / cell
            baseRadius: 0.075,     // matches the CSS background dots
            palette: ['--c1', '--c2', '--c3'],
            heatColor: '--c3',
            drawBase: false,       // draw the resting dots too (when there is no CSS dot grid underneath)
            baseColor: '--dot',
            alwaysOn: false,       // keep animating (thermal twinkle) while visible
            autoCycle: 0,          // ms between automatic cues (0 = off)
            onState: null,
            start: 0               // picture shown first
        }, options);

        const canvas = o.canvas;
        const ctx = canvas.getContext('2d');
        const layer = document.createElement('canvas');
        const lctx = layer.getContext('2d');
        const base = o.drawBase ? document.createElement('canvas') : null;
        const bctx = base && base.getContext('2d');

        let cols = 0, rows = 0, N = 0, cell = 14, ox = 0, oy = 0, dpr = 1;
        let xs, ys, inSlot, slotIdx, slot, Ns = 0;
        let xi = [], p = 0, Cinv = null, m, a, sigma, vis, heat, clamp;
        let target = o.start, lambda = 0, Tg = 0;
        let raf = 0, last = 0, visible = false, frozen = false, ready = false;
        let lastSwitch = 0, lastTouch = -1e9, lastState = 0, mode = 'idle';
        let colors = {}, gradient = null;

        const reduce = () => reduceQuery.matches;

        function refreshA() {
            for (let i = 0; i < p; i++) {
                let s = 0;
                for (let j = 0; j < p; j++) s += Cinv[i][j] * m[j];
                a[i] = s;
            }
        }

        function recomputeM() {
            m.fill(0);
            for (let k = 0; k < Ns; k++) {
                const i = slotIdx[k];
                for (let mu = 0; mu < p; mu++) m[mu] += xi[mu][i] * sigma[i];
            }
            for (let mu = 0; mu < p; mu++) m[mu] /= Ns;
            refreshA();
        }

        function readColors() {
            const cs = getComputedStyle(canvas);
            const v = name => cs.getPropertyValue(name).trim();
            colors = { stops: o.palette.map(v), heat: v(o.heatColor), base: v(o.baseColor) };
            if (!N) return;
            if (base) {
                const r0 = o.baseRadius * cell * dpr;
                bctx.clearRect(0, 0, base.width, base.height);
                bctx.fillStyle = colors.base || '#ccc';
                bctx.beginPath();
                for (let i = 0; i < N; i++) { bctx.moveTo(xs[i] + r0, ys[i]); bctx.arc(xs[i], ys[i], r0, 0, TAU); }
                bctx.fill();
            }
            const x0 = (ox + slot.q * cell) * dpr, y0 = (oy + slot.r * cell) * dpr;
            gradient = lctx.createLinearGradient(x0, y0, x0 + slot.w * cell * dpr, y0 + slot.h * cell * dpr);
            colors.stops.forEach((c, k) => gradient.addColorStop(colors.stops.length > 1 ? k / (colors.stops.length - 1) : 0, c || '#888'));
        }

        function layout() {
            const rect = canvas.getBoundingClientRect();
            const W = rect.width, H = rect.height;
            if (W < 10 || H < 10) return false;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            cell = typeof o.cell === 'function' ? o.cell() : o.cell;
            const fx = o.align === 'page' ? rect.left + window.scrollX : 0;
            const fy = o.align === 'page' ? rect.top + window.scrollY : 0;
            ox = (((cell / 2 - fx) % cell) + cell) % cell;
            oy = (((cell / 2 - fy) % cell) + cell) % cell;
            cols = Math.floor((W - ox) / cell) + 1;
            rows = Math.floor((H - oy) / cell) + 1;
            N = cols * rows;
            canvas.width = layer.width = Math.round(W * dpr);
            canvas.height = layer.height = Math.round(H * dpr);
            if (base) { base.width = canvas.width; base.height = canvas.height; }

            xs = new Float32Array(N); ys = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                xs[i] = (ox + (i % cols) * cell) * dpr;
                ys[i] = (oy + ((i / cols) | 0) * cell) * dpr;
            }

            const s = o.slot ? o.slot() : { x: 0, y: 0, w: W, h: H };
            const q0 = Math.max(0, Math.ceil((s.x - ox) / cell)), r0 = Math.max(0, Math.ceil((s.y - oy) / cell));
            const q1 = Math.min(cols, Math.floor((s.x + s.w - ox) / cell) + 1), r1 = Math.min(rows, Math.floor((s.y + s.h - oy) / cell) + 1);
            slot = { q: q0, r: r0, w: Math.max(1, q1 - q0), h: Math.max(1, r1 - r0) };

            inSlot = new Uint8Array(N);
            const idx = [];
            for (let r = slot.r; r < slot.r + slot.h; r++) for (let q = slot.q; q < slot.q + slot.w; q++) { inSlot[r * cols + q] = 1; idx.push(r * cols + q); }
            slotIdx = Int32Array.from(idx);
            Ns = slotIdx.length;

            xi = o.pictures.map(pic => rasterize(pic.draw, cols, rows, slot));
            p = xi.length;
            const C = xi.map(A => xi.map(B => {
                let t = 0;
                for (let k = 0; k < Ns; k++) t += A[slotIdx[k]] * B[slotIdx[k]];
                return t / Ns;
            }));
            for (let i = 0; i < p; i++) C[i][i] += 1e-6;
            Cinv = invert(C);
            m = new Float64Array(p); a = new Float64Array(p);
            sigma = new Int8Array(N).fill(-1);
            vis = new Float32Array(N);
            heat = new Float32Array(N);
            clamp = new Uint8Array(N);
            readColors();
            ready = true;
            return true;
        }

        function setState(src, snap) {
            sigma.set(src);
            if (snap) for (let i = 0; i < N; i++) vis[i] = sigma[i] > 0 ? 1 : 0;
            recomputeM();
        }

        /* --------------------------- dynamics */

        function updateSpin(i) {
            if (clamp[i]) return;
            let h;
            if (inSlot[i]) {
                h = lambda * xi[target][i];
                for (let mu = 0; mu < p; mu++) h += xi[mu][i] * a[mu];
            } else {
                h = -1;
            }
            const T = o.T0 + Tg + o.heatTemp * heat[i];
            const s = Math.random() * (1 + Math.exp(-2 * h / T)) < 1 ? 1 : -1;
            if (s !== sigma[i]) {
                sigma[i] = s;
                if (inSlot[i]) {
                    const d = (2 * s) / Ns;
                    for (let mu = 0; mu < p; mu++) m[mu] += d * xi[mu][i];
                }
            }
        }

        function step(dt) {
            if (!frozen) {
                Tg *= Math.exp(-dt / 0.55);
                lambda *= Math.exp(-dt / 1.1);
                if (Tg < 0.003) Tg = 0;
                if (lambda < 0.003) lambda = 0;
                const n = Math.round(Ns * o.rate * dt);
                for (let u = 0; u < n; u++) {
                    if ((u & 31) === 0) refreshA();
                    updateSpin(slotIdx[(Math.random() * Ns) | 0]);
                }
            }
            let hot = false;
            const decay = Math.exp(-dt / 0.45);
            for (let i = 0; i < N; i++) {
                if (heat[i] > 0.01) {
                    hot = true;
                    if (Math.random() < 0.5) updateSpin(i);
                    heat[i] *= decay;
                } else if (heat[i]) {
                    heat[i] = 0;
                    if (!inSlot[i] && !clamp[i]) sigma[i] = -1;
                }
            }
            refreshA();
            const k = 1 - Math.exp(-dt * 13);
            let moving = false;
            for (let i = 0; i < N; i++) {
                const t = sigma[i] > 0 ? 1 : 0, d = t - vis[i];
                if (d > 0.004 || d < -0.004) { vis[i] += d * k; moving = true; } else vis[i] = t;
            }
            return moving || hot || Tg > 0 || lambda > 0.01;
        }

        /* --------------------------- drawing */

        function render() {
            const rUp = o.radius * cell * dpr, r0 = o.baseRadius * cell * dpr;
            lctx.globalCompositeOperation = 'source-over';
            lctx.clearRect(0, 0, layer.width, layer.height);
            lctx.fillStyle = '#000';
            lctx.beginPath();
            for (let i = 0; i < N; i++) {
                const v = vis[i];
                if (v < 0.03) continue;
                const r = r0 + (rUp - r0) * v;
                lctx.moveTo(xs[i] + r, ys[i]);
                lctx.arc(xs[i], ys[i], r, 0, TAU);
            }
            lctx.fill();
            lctx.globalCompositeOperation = 'source-in';
            lctx.fillStyle = gradient || '#888';
            lctx.fillRect(0, 0, layer.width, layer.height);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (base) ctx.drawImage(base, 0, 0);
            ctx.drawImage(layer, 0, 0);
            ctx.fillStyle = colors.heat || '#e8622f';
            for (let i = 0; i < N; i++) {
                if (heat[i] > 0.06 && sigma[i] > 0) {
                    ctx.globalAlpha = Math.min(1, heat[i]) * 0.85;
                    ctx.beginPath();
                    ctx.arc(xs[i], ys[i], rUp * Math.max(0, vis[i]), 0, TAU);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }

        function emit(now, force) {
            if (!o.onState || (!force && now - lastState < 110)) return;
            lastState = now;
            o.onState({ target, name: o.pictures[target] && o.pictures[target].name, m: m[target], T: o.T0 + Tg, a: Array.from(a), mode });
        }

        /* --------------------------- loop */

        function frame(now) {
            raf = 0;
            // rAF timestamps can precede the performance.now() read in wake(): never let dt go negative
            const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
            last = now;
            const busy = step(dt);
            render();
            emit(now);
            if (o.autoCycle && !reduce() && !frozen && mode !== 'sketch' && now - lastSwitch > o.autoCycle && now - lastTouch > 12000) {
                api.cue((target + 1) % p, { auto: true });
            }
            if (visible && !document.hidden && (busy || frozen || (o.alwaysOn && !reduce()))) raf = requestAnimationFrame(frame);
        }

        function wake() {
            if (ready && !raf && visible && !document.hidden) {
                last = performance.now();
                raf = requestAnimationFrame(frame);
            }
        }

        /* --------------------------- pointer helpers (coordinates in canvas CSS px) */

        function cellsNear(x, y, R, fn) {
            const qc = (x - ox) / cell, rc = (y - oy) / cell;
            for (let r = Math.max(0, Math.floor(rc - R)); r <= Math.min(rows - 1, Math.ceil(rc + R)); r++) {
                for (let q = Math.max(0, Math.floor(qc - R)); q <= Math.min(cols - 1, Math.ceil(qc + R)); q++) {
                    const d = Math.hypot(q - qc, r - rc);
                    if (d < R) fn(r * cols + q, d);
                }
            }
        }

        /* --------------------------- sketch → closest memory */

        function normalizedMask(isOn) {
            // bounding box of the "on" cells inside the slot, rescaled (aspect kept) onto a 24 × 24 grid
            let q0 = Infinity, q1 = -1, r0 = Infinity, r1 = -1;
            for (let k = 0; k < Ns; k++) {
                const i = slotIdx[k];
                if (!isOn(i)) continue;
                const q = i % cols, r = (i / cols) | 0;
                if (q < q0) q0 = q; if (q > q1) q1 = q; if (r < r0) r0 = r; if (r > r1) r1 = r;
            }
            const G = 24, out = new Float32Array(G * G);
            if (q1 < 0) return out;
            const w = q1 - q0 + 1, h = r1 - r0 + 1, s = Math.max(w, h) / (G - 2);
            const offx = (G - w / s) / 2, offy = (G - h / s) / 2;
            for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) {
                const i = r * cols + q;
                if (!isOn(i)) continue;
                const gx = Math.floor(offx + (q - q0) / s), gy = Math.floor(offy + (r - r0) / s);
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const X = gx + dx, Y = gy + dy;
                    if (X >= 0 && X < G && Y >= 0 && Y < G) out[Y * G + X] = Math.max(out[Y * G + X], dx || dy ? 0.5 : 1);
                }
            }
            return out;
        }

        function closestMemory() {
            const sketch = normalizedMask(i => sigma[i] > 0);
            let best = 0, bestScore = -Infinity;
            xi.forEach((pat, k) => {
                const mask = normalizedMask(i => pat[i] > 0);
                let dot = 0, n1 = 0, n2 = 0;
                for (let j = 0; j < mask.length; j++) { dot += mask[j] * sketch[j]; n1 += mask[j] * mask[j]; n2 += sketch[j] * sketch[j]; }
                const score = dot / Math.sqrt((n1 || 1) * (n2 || 1));
                if (score > bestScore) { bestScore = score; best = k; }
            });
            return best;
        }

        /* --------------------------- public API */

        const api = {
            get ready() { return ready; },
            get target() { return target; },
            get mode() { return mode; },
            get size() { return { cols, rows, N, Ns, cell, slot }; },
            get patterns() { return xi; },

            cue(k, opts) {
                if (!ready) return;
                const op = opts || {};
                target = k;
                lastSwitch = performance.now();
                if (!op.auto) lastTouch = lastSwitch;
                clamp.fill(0);
                frozen = false;
                mode = op.mode || 'cue';
                if (op.instant || reduce()) {
                    setState(xi[k], true);
                    Tg = 0; lambda = 0;
                    render(); emit(0, true);
                    return;
                }
                Tg = op.Tg ?? 0.9;
                lambda = op.lambda ?? 1.0;
                wake();
            },

            /** Start from a noisy copy of picture k (each neuron flipped with probability `flip`). */
            noisy(k, flip) {
                if (!ready) return;
                target = k; clamp.fill(0); frozen = false; lambda = 0; Tg = 0; mode = 'recall';
                const s = Int8Array.from(xi[k], (v, i) => (inSlot[i] && Math.random() < flip ? -v : v));
                if (reduce()) { setState(xi[k], true); render(); return; }
                setState(s, true);
                lastSwitch = performance.now();
                wake();
            },

            /** Show the cells where `keep(i)` holds as a clamped cue of picture k, noise elsewhere. */
            partial(k, keep) {
                if (!ready) return;
                target = k; frozen = false; lambda = 0; Tg = 0; mode = 'recall';
                const s = Int8Array.from(xi[k], (v, i) => (!inSlot[i] ? -1 : keep(i % cols, (i / cols) | 0, slot) ? v : (Math.random() < 0.5 ? 1 : -1)));
                for (let i = 0; i < N; i++) clamp[i] = inSlot[i] && keep(i % cols, (i / cols) | 0, slot) ? 1 : 0;
                if (reduce()) { clamp.fill(0); setState(xi[k], true); render(); return; }
                setState(s, false);
                wake();
            },

            /** Heat the neurons within R cells of (x, y). `silent` heat (ambient sparks) does not pause the auto-cycle. */
            heatAt(x, y, R, silent) {
                if (!ready || reduce()) return;
                cellsNear(x, y, R, (i, d) => { heat[i] = Math.max(heat[i], 1 - d / R); });
                if (!silent) lastTouch = performance.now();
                wake();
            },

            /** Sketching: begin() clears the slot, paint() raises neurons, end() recalls the closest memory. */
            beginSketch() {
                if (!ready) return;
                mode = 'sketch'; frozen = true; Tg = 0; lambda = 0; clamp.fill(0);
                for (let k = 0; k < Ns; k++) sigma[slotIdx[k]] = -1;
                recomputeM();
                lastTouch = performance.now();
                emit(0, true);
                wake();
            },
            paint(x, y, R) {
                if (!ready || mode !== 'sketch') return;
                cellsNear(x, y, R, i => { if (inSlot[i]) { sigma[i] = 1; vis[i] = Math.max(vis[i], 0.6); } });
                recomputeM();
                lastTouch = performance.now();
                wake();
            },
            endSketch() {
                if (!ready || mode !== 'sketch') return;
                let any = false;
                for (let k = 0; k < Ns; k++) if (sigma[slotIdx[k]] > 0) { any = true; break; }
                frozen = false;
                if (!any) { api.cue(target, { Tg: 0.3, lambda: 1 }); return; }
                const k = closestMemory();
                target = k; mode = 'recall';
                Tg = 0.25; lambda = 0.55;
                lastSwitch = lastTouch = performance.now();
                emit(0, true);
                wake();
            },
            inSlot(x, y) {
                const q = Math.round((x - ox) / cell), r = Math.round((y - oy) / cell);
                return q >= slot.q && q < slot.q + slot.w && r >= slot.r && r < slot.r + slot.h;
            },

            setVisible(v) { visible = v; if (v) wake(); },
            recolor() { if (!ready) return; readColors(); render(); },
            relayout() {
                if (!layout()) return;
                setState(xi[target], true);
                render(); emit(0, true);
            },
            init(fromNoise) {
                if (!layout()) return false;
                if (fromNoise && !reduce()) {
                    for (let k = 0; k < Ns; k++) sigma[slotIdx[k]] = Math.random() < 0.5 ? 1 : -1;
                    for (let i = 0; i < N; i++) vis[i] = sigma[i] > 0 ? 1 : 0;
                    recomputeM();
                    api.cue(target, { auto: true });
                } else {
                    setState(xi[target], true);
                    render();
                }
                emit(0, true);
                return true;
            }
        };

        new IntersectionObserver(entries => api.setVisible(entries[0].isIntersecting), { rootMargin: '80px' }).observe(canvas);
        document.addEventListener('visibilitychange', wake);
        return api;
    }

    window.DotNet = { create, PICTURES, DRAW, inSquare, glyph };
})();

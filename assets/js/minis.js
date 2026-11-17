/*
 * minis.js — small live previews for the interactive-paper cards, drawn with the same dots as the rest of the page.
 *   lenia    Chan's Lenia (Orbium, R = 13) on a small torus, as a halftone; the pointer heats the bath
 *   diamond  the Laplacian eigenmodes of the Berker–Ostlund diamond lattice, vibrating
 *   dream    a Hopfield network cleaning noisy examples into memories
 *   pairs    a hetero-associative memory: given the left half, it recalls the right one
 */
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const reduceQ = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => reduceQ.matches;
    const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

    /** Run `frame(dt)` on animation frames while the canvas is on screen. */
    function loop(canvas, frame) {
        let raf = 0, last = 0, visible = false;
        const tick = now => {
            raf = 0;
            const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
            last = now;
            const more = frame(dt, now);
            if (visible && !document.hidden && more !== false && !reduce()) raf = requestAnimationFrame(tick);
        };
        const wake = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };
        new IntersectionObserver(es => { visible = es[0].isIntersecting; wake(); }, { rootMargin: '60px' }).observe(canvas);
        document.addEventListener('visibilitychange', wake);
        return { wake, get visible() { return visible; } };
    }

    /** A colour gradient across the canvas, applied to whatever was drawn in black on `layer`. */
    function tint(ctx, layer, lctx, stops) {
        const g = lctx.createLinearGradient(0, 0, layer.width, layer.height);
        stops.forEach((c, k) => g.addColorStop(k / (stops.length - 1), c));
        lctx.globalCompositeOperation = 'source-in';
        lctx.fillStyle = g;
        lctx.fillRect(0, 0, layer.width, layer.height);
        lctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(layer, 0, 0);
    }

    /* =========================================================== Lenia */
    const ORBIUM = [[0,0,0,0,0,0,0.1,0.14,0.1,0,0,0.03,0.03,0,0,0.3,0,0,0,0],[0,0,0,0,0,0.08,0.24,0.3,0.3,0.18,0.14,0.15,0.16,0.15,0.09,0.2,0,0,0,0],[0,0,0,0,0,0.15,0.34,0.44,0.46,0.38,0.18,0.14,0.11,0.13,0.19,0.18,0.45,0,0,0],[0,0,0,0,0.06,0.13,0.39,0.5,0.5,0.37,0.06,0,0,0,0.02,0.16,0.68,0,0,0],[0,0,0,0.11,0.17,0.17,0.33,0.4,0.38,0.28,0.14,0,0,0,0,0,0.18,0.42,0,0],[0,0,0.09,0.18,0.13,0.06,0.08,0.26,0.32,0.32,0.27,0,0,0,0,0,0,0.82,0,0],[0.27,0,0.16,0.12,0,0,0,0.25,0.38,0.44,0.45,0.34,0,0,0,0,0,0.22,0.17,0],[0,0.07,0.2,0.02,0,0,0,0.31,0.48,0.57,0.6,0.57,0,0,0,0,0,0,0.49,0],[0,0.59,0.19,0,0,0,0,0.2,0.57,0.69,0.76,0.76,0.49,0,0,0,0,0,0.36,0],[0,0.58,0.19,0,0,0,0,0,0.67,0.83,0.9,0.92,0.87,0.12,0,0,0,0,0.22,0.07],[0,0,0.46,0,0,0,0,0,0.7,0.93,1,1,1,0.61,0,0,0,0,0.18,0.11],[0,0,0.82,0,0,0,0,0,0.47,1,1,0.98,1,0.96,0.27,0,0,0,0.19,0.1],[0,0,0.46,0,0,0,0,0,0.25,1,1,0.84,0.92,0.97,0.54,0.14,0.04,0.1,0.21,0.05],[0,0,0,0.4,0,0,0,0,0.09,0.8,1,0.82,0.8,0.85,0.63,0.31,0.18,0.19,0.2,0.01],[0,0,0,0.36,0.1,0,0,0,0.05,0.54,0.86,0.79,0.74,0.72,0.6,0.39,0.28,0.24,0.13,0],[0,0,0,0.01,0.3,0.07,0,0,0.08,0.36,0.64,0.7,0.64,0.6,0.51,0.39,0.29,0.19,0.04,0],[0,0,0,0,0.1,0.24,0.14,0.1,0.15,0.29,0.45,0.53,0.52,0.46,0.4,0.31,0.21,0.08,0,0],[0,0,0,0,0,0.08,0.21,0.21,0.22,0.29,0.36,0.39,0.37,0.33,0.26,0.18,0.09,0,0,0],[0,0,0,0,0,0,0.03,0.13,0.19,0.22,0.24,0.24,0.23,0.18,0.13,0.05,0,0,0,0],[0,0,0,0,0,0,0,0,0.02,0.06,0.08,0.09,0.07,0.05,0.01,0,0,0,0,0]];

    function lenia(canvas) {
        const R = 13, MU = 0.15, SG = 0.015, DT = 0.1, NY = 48;
        const ks = [];
        let S = 0;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
            const r = Math.hypot(dx, dy) / R;
            if (r <= 0 || r >= 1) continue;
            const k = Math.exp(4 - 1 / (r * (1 - r)));
            ks.push([dx, dy, k]); S += k;
        }
        const KW = Float32Array.from(ks, k => k[2] / S);
        const ctx = canvas.getContext('2d'), layer = document.createElement('canvas'), lctx = layer.getContext('2d');
        const base = document.createElement('canvas'), bctx = base.getContext('2d');
        let NX = 0, PW = 0, P, OFF, A, cell = 5, dpr = 1, steps = 0, odd = false, colors = [];

        function seed(x0, y0) {
            ORBIUM.forEach((row, y) => row.forEach((v, x) => { if (v) A[((y0 + y) % NY + NY) % NY * NX + ((x0 + x) % NX + NX) % NX] = v; }));
        }
        function layout() {
            const r = canvas.getBoundingClientRect();
            if (r.width < 10) return false;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            cell = r.height / NY;
            NX = Math.max(NY, Math.round(r.width / cell));
            for (const c of [canvas, layer, base]) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
            PW = NX + 2 * R;
            P = new Float32Array(PW * (NY + 2 * R));
            OFF = Int32Array.from(ks, ([dx, dy]) => dy * PW + dx);
            A = new Float32Array(NX * NY);
            seed(Math.round(NX * 0.12), 14);
            recolor();
            return true;
        }
        function recolor() {
            colors = ['--c1', '--c2', '--c3'].map(v => css(canvas, v));
            const cx = cell * dpr, r0 = 0.11 * cx;
            bctx.clearRect(0, 0, base.width, base.height);
            bctx.fillStyle = css(canvas, '--dot');
            bctx.beginPath();
            for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
                const px = (x + 0.5) * cx, py = (y + 0.5) * cx;
                bctx.moveTo(px + r0, py); bctx.arc(px, py, r0, 0, TAU);
            }
            bctx.fill();
            if (reduce()) render();
        }
        function step() {
            const PH = NY + 2 * R;
            for (let y = 0; y < PH; y++) {
                const sy = ((y - R) % NY + NY) % NY * NX;
                for (let x = 0; x < PW; x++) P[y * PW + x] = A[sy + ((x - R) % NX + NX) % NX];
            }
            const n = OFF.length, inv = 1 / (2 * SG * SG);
            for (let y = 0; y < NY; y++) {
                for (let x = 0; x < NX; x++) {
                    const b = (y + R) * PW + x + R;
                    let s = 0;
                    for (let k = 0; k < n; k++) s += P[b + OFF[k]] * KW[k];
                    const i = y * NX + x, d = s - MU;
                    const v = A[i] + DT * (2 * Math.exp(-d * d * inv) - 1);
                    A[i] = v < 0 ? 0 : v > 1 ? 1 : v;
                }
            }
            if (++steps % 90 === 0) {
                let m = 0;
                for (let i = 0; i < A.length; i++) m += A[i];
                if (m < 12 || m > A.length * 0.2) { A.fill(0); seed(Math.round(Math.random() * NX), Math.round(Math.random() * NY)); }
            }
        }
        function render() {
            const cx = cell * dpr;
            lctx.clearRect(0, 0, layer.width, layer.height);
            lctx.fillStyle = '#000';
            lctx.beginPath();
            for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
                const v = A[y * NX + x];
                if (v < 0.04) continue;
                const r = cx * 0.56 * Math.sqrt(v), px = (x + 0.5) * cx, py = (y + 0.5) * cx;
                lctx.moveTo(px + r, py); lctx.arc(px, py, r, 0, TAU);
            }
            lctx.fill();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(base, 0, 0);
            tint(ctx, layer, lctx, colors);
        }
        const run = loop(canvas, () => {
            odd = !odd;
            if (odd) step();          // ~30 Lenia steps per second
            render();
        });
        canvas.closest('.card').addEventListener('pointermove', e => {
            if (!A) return;
            const r = canvas.getBoundingClientRect();
            const qx = (e.clientX - r.left) / cell, qy = (e.clientY - r.top) / cell;
            if (qy < 0 || qy > NY) return;
            for (let y = Math.floor(qy - 3); y <= qy + 3; y++) for (let x = Math.floor(qx - 3); x <= qx + 3; x++) {
                if (Math.hypot(x - qx, y - qy) > 3 || Math.random() < 0.5) continue;
                const i = ((y % NY) + NY) % NY * NX + ((x % NX) + NX) % NX;
                A[i] = Math.min(1, Math.max(0, A[i] + (Math.random() - 0.45) * 0.5));
            }
            run.wake();
        });
        new ResizeObserver(() => { if (layout()) { render(); run.wake(); } }).observe(canvas);
        return recolor;
    }

    /* =========================================================== diamond lattice eigenmodes */
    const LATTICE = 'M11.1 54.7L8.0 34.0L23.0 19.4M11.1 54.7L26.0 40.1L23.0 19.4L40.5 8.0L60.0 15.5M23.0 19.4L42.5 26.9L60.0 15.5M11.1 54.7L28.6 43.2L48.1 50.8M11.1 54.7L30.6 62.2L48.1 50.8L45.0 30.1L60.0 15.5M48.1 50.8L63.1 36.2L60.0 15.5L79.5 8.0L97.0 19.4M60.0 15.5L77.5 26.9L97.0 19.4L112.0 34.0L108.9 54.7M97.0 19.4L94.0 40.1L108.9 54.7M60.0 15.5L75.0 30.1L71.9 50.8M60.0 15.5L56.9 36.2L71.9 50.8L91.4 43.2L108.9 54.7M71.9 50.8L89.4 62.2L108.9 54.7M11.1 54.7L30.6 47.2L48.1 58.6M11.1 54.7L28.6 66.1L48.1 58.6L63.1 73.2L60.0 93.8M48.1 58.6L45.0 79.3L60.0 93.8M11.1 54.7L26.0 69.2L23.0 89.9M11.1 54.7L8.0 75.4L23.0 89.9L42.5 82.4L60.0 93.8M23.0 89.9L40.5 101.4L60.0 93.8L56.9 73.2L71.9 58.6M60.0 93.8L75.0 79.3L71.9 58.6L89.4 47.2L108.9 54.7M71.9 58.6L91.4 66.1L108.9 54.7M60.0 93.8L77.5 82.4L97.0 89.9M60.0 93.8L79.5 101.4L97.0 89.9L94.0 69.2L108.9 54.7M97.0 89.9L112.0 75.4L108.9 54.7';

    function parseGraph(path) {
        const nodes = [], index = new Map(), edges = [];
        const id = (x, y) => {
            const key = `${x.toFixed(1)},${y.toFixed(1)}`;
            if (!index.has(key)) { index.set(key, nodes.length); nodes.push([x, y]); }
            return index.get(key);
        };
        let prev = -1;
        for (const [, cmd, xs, ys] of path.matchAll(/([ML])\s*([-\d.]+)[ ,]([-\d.]+)/g)) {
            const i = id(+xs, +ys);
            if (cmd === 'L' && prev >= 0 && !edges.some(([a, b]) => (a === prev && b === i) || (a === i && b === prev))) edges.push([prev, i]);
            prev = i;
        }
        return { nodes, edges };
    }

    /** Cyclic Jacobi rotations for a small symmetric matrix: eigenvalues ascending, eigenvectors as rows. */
    function jacobi(M) {
        const n = M.length, A = M.map(r => r.slice()), V = M.map((r, i) => r.map((_, j) => +(i === j)));
        for (let sweep = 0; sweep < 80; sweep++) {
            let off = 0;
            for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
            if (off < 1e-20) break;
            for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
                if (Math.abs(A[p][q]) < 1e-15) continue;
                const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
                const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
                const c = 1 / Math.sqrt(t * t + 1), s = t * c;
                for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
                for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
                for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
            }
        }
        return Array.from({ length: n }, (_, i) => ({ val: A[i][i], vec: V.map(r => r[i]) })).sort((a, b) => a.val - b.val);
    }

    function diamond(canvas, note) {
        const { nodes, edges } = parseGraph(LATTICE);
        const n = nodes.length;
        const L = nodes.map(() => new Array(n).fill(0));
        edges.forEach(([a, b]) => { L[a][b] -= 1; L[b][a] -= 1; L[a][a] += 1; L[b][b] += 1; });
        const modes = jacobi(L).slice(1).map(m => {
            const mx = Math.max(...m.vec.map(Math.abs));
            return { val: m.val, vec: m.vec.map(v => v / mx) };
        });
        // start from a mode that uses the whole lattice
        let k = 0, phase = 0, gain = 1, target = 1;
        const ctx = canvas.getContext('2d');
        let W = 0, H = 0, dpr = 1, sc = 1, ox = 0, oy = 0, colors = {};
        const label = () => { if (note) note.textContent = `mode ${k + 1} of ${modes.length} · λ = ${modes[k].val.toFixed(3)} · click for the next`; };

        function layout() {
            const r = canvas.getBoundingClientRect();
            if (r.width < 10) return false;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = r.width; H = r.height;
            canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
            sc = Math.min((W - 40) / 104, (H - 70) / 94);
            ox = (W - 120 * sc) / 2; oy = (H - 109 * sc) / 2 - 10;
            recolor();
            return true;
        }
        function recolor() {
            colors = { a: css(canvas, '--c1'), b: css(canvas, '--c3'), line: css(canvas, '--line-2'), ink: css(canvas, '--ink-2'), dot: css(canvas, '--dot') };
            if (reduce()) render();
        }
        function render() {
            const m = modes[k], amp = 15 * gain * Math.cos(phase);
            const P = nodes.map(([x, y], i) => [ox + x * sc, oy + y * sc - m.vec[i] * amp]);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);
            // resting lattice
            ctx.strokeStyle = colors.dot; ctx.lineWidth = 1;
            ctx.beginPath();
            edges.forEach(([a, b]) => { ctx.moveTo(ox + nodes[a][0] * sc, oy + nodes[a][1] * sc); ctx.lineTo(ox + nodes[b][0] * sc, oy + nodes[b][1] * sc); });
            ctx.stroke();
            // vibrating lattice
            ctx.strokeStyle = colors.ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
            ctx.beginPath();
            edges.forEach(([a, b]) => { ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); });
            ctx.stroke();
            ctx.globalAlpha = 1;
            P.forEach(([x, y], i) => {
                const v = m.vec[i] * Math.cos(phase);
                ctx.fillStyle = v >= 0 ? colors.a : colors.b;
                ctx.beginPath(); ctx.arc(x, y, 2.2 + 2.8 * Math.abs(v) * gain, 0, TAU); ctx.fill();
            });
        }
        const run = loop(canvas, dt => {
            gain += (target - gain) * Math.min(1, dt * 6);
            phase += dt * (1.6 + 2.4 * Math.sqrt(modes[k].val / modes[modes.length - 1].val));
            render();
        });
        const card = canvas.closest('.card');
        card.addEventListener('pointerenter', () => { target = 1.5; run.wake(); });
        card.addEventListener('pointerleave', () => { target = 1; });
        canvas.parentElement.addEventListener('click', e => {
            e.preventDefault();      // the viz is inside the card link: clicking the drawing changes the mode instead
            k = (k + 1) % modes.length;
            label();
            if (reduce()) render();
            run.wake();
        });
        label();
        new ResizeObserver(() => { if (layout()) render(); }).observe(canvas);
        return recolor;
    }

    /* =========================================================== Hopfield previews (dreaming, pairs) */
    function moon(g) {
        g.save(); g.scale(1 / 32, 1 / 32); g.translate(1, 0.5);
        g.fill(new Path2D('M20 4.5A12 12 0 1 0 27.5 21 9.5 9.5 0 0 1 20 4.5z'));
        g.restore();
    }
    function star(g) {
        g.beginPath();
        for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 0.2 : 0.48, a = -Math.PI / 2 + (i * Math.PI) / 5;
            g.lineTo(0.5 + Math.cos(a) * r, 0.54 + Math.sin(a) * r);
        }
        g.closePath(); g.fill();
    }
    function cloud(g) {
        g.beginPath();
        for (const [x, y, r] of [[0.3, 0.6, 0.17], [0.5, 0.45, 0.23], [0.7, 0.58, 0.18], [0.5, 0.66, 0.16]]) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
        g.fill();
        g.fillRect(0.3, 0.6, 0.4, 0.17);
    }

    function hopfieldMini(canvas, kind) {
        const D = window.DotNet;
        let pictures, act;
        if (kind === 'dream') {
            pictures = [['moon', moon], ['star', star], ['cloud', cloud]].map(([name, f]) => ({ name, draw: D.inSquare(f, 0.84) }));
            act = (net, k) => net.noisy(k, 0.32);
        } else {
            const pair = (a, b) => (g, W, H) => {
                const s = Math.min(W / 2, H) * 0.86;
                [[a, W * 0.25], [b, W * 0.75]].forEach(([f, cx]) => {
                    g.setTransform(s, 0, 0, s, cx - s / 2, (H - s) / 2);
                    g.fillStyle = g.strokeStyle = '#000'; g.lineCap = g.lineJoin = 'round'; g.globalCompositeOperation = 'source-over';
                    f(g, s);
                });
            };
            pictures = [['key', 'heart'], ['cat', 'notes'], ['saturn', 'bulb']].map(([a, b]) => ({ name: `${a}→${b}`, draw: pair(D.DRAW[a], D.DRAW[b]) }));
            act = (net, k) => net.partial(k, (q, r, slot) => q < slot.q + Math.floor(slot.w / 2));
        }
        const cell = () => (window.innerWidth < 600 ? 8 : 10);
        const net = D.create({
            canvas,
            cell,
            drawBase: true,
            baseRadius: 0.11,
            T0: 0.2,
            rate: 1.6,
            slot: () => {
                const r = canvas.getBoundingClientRect(), c = cell();
                if (kind === 'dream') { const s = Math.min(r.height - 3 * c, r.width - 2 * c); return { x: (r.width - s) / 2, y: (r.height - s) / 2 - c * 0.6, w: s, h: s }; }
                const h = Math.min(r.height - 4 * c, (r.width - 4 * c) / 2.1), w = 2.1 * h;
                return { x: (r.width - w) / 2, y: (r.height - h) / 2 - c * 0.6, w, h };
            },
            pictures
        });
        let k = 0, visible = false;
        new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
        new ResizeObserver(() => {
            if (!net.ready) { if (net.init(false)) act(net, k); }
            else { net.relayout(); act(net, k); }
        }).observe(canvas);
        setInterval(() => {
            if (!visible || document.hidden || reduce() || !net.ready) return;
            k = (k + 1) % pictures.length;
            act(net, k);
        }, kind === 'dream' ? 3400 : 3800);
        canvas.closest('.card').addEventListener('pointermove', e => {
            const r = canvas.getBoundingClientRect();
            if (e.clientY > r.bottom) return;
            net.heatAt(e.clientX - r.left, e.clientY - r.top, 2.2);
        });
        return () => net.recolor();
    }

    window.Minis = {
        init() {
            const fns = [];
            document.querySelectorAll('canvas[data-mini]').forEach(c => {
                const kind = c.dataset.mini, note = document.querySelector(`[data-note="${kind}"]`);
                try {
                    if (kind === 'lenia') fns.push(lenia(c));
                    else if (kind === 'diamond') fns.push(diamond(c, note));
                    else fns.push(hopfieldMini(c, kind));
                } catch (err) { console.error('preview failed:', kind, err); }
            });
            return () => fns.forEach(f => f && f());
        }
    };
})();

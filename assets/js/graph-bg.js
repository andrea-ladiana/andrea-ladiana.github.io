/*
 * Ambient background: a slowly drifting random geometric graph on which signals
 * hop from node to node, occasionally fanning out to several neighbours.
 *
 * Cheap on purpose: one canvas, O(n^2) edge test on <= ~80 nodes, ~30 fps,
 * paused when the tab is hidden. With prefers-reduced-motion it draws a single still frame,
 * and the #bg-toggle button lets visitors override that choice either way (remembered).
 */
(function () {
    'use strict';

    const canvas = document.getElementById('graph-bg');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarseQuery = window.matchMedia('(pointer: coarse)');

    // Same palette as the old blurred blobs: teal (dominant), blue, violet.
    const SIGNAL_COLORS = [[100, 255, 218], [100, 255, 218], [90, 150, 255], [221, 110, 255]];
    const EDGE_RGB = '150,180,255';
    const MIN_FRAME_S = 0.028;
    const STORE_KEY = 'bg-motion';
    const toggle = document.getElementById('bg-toggle');

    let W = 0, H = 0, R = 120, dpr = 1;
    let nodes = [], pulses = [], edges = [], adj = [];
    let maxPulses = 10, spawnIn = 0.4;
    let rafId = 0, lastTime = 0, resizeTimer = 0;

    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = arr => arr[(Math.random() * arr.length) | 0];

    function storedPref() {
        try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
    }

    /** Explicit choice from the toggle wins; otherwise follow the OS setting. */
    function motionOn() {
        const pref = storedPref();
        if (pref === 'on') return true;
        if (pref === 'off') return false;
        return !motionQuery.matches;
    }

    function viewportSize() {
        const w = window.innerWidth;
        // On phones the visible height changes while the URL bar collapses: use the tallest one.
        const h = coarseQuery.matches ? Math.max(window.innerHeight, window.screen.height || 0) : window.innerHeight;
        return [w, h];
    }

    function resize(force) {
        const [w, h] = viewportSize();
        if (!force && w === W && Math.abs(h - H) < 100) return;

        const oldW = W, oldH = H;
        W = w; H = h;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const count = Math.max(30, Math.min(80, Math.round((W * H) / 22000)));
        R = Math.max(100, Math.min(200, Math.sqrt((W * H) / count) * 1.25));
        maxPulses = W < 700 ? 6 : 10;

        if (oldW && nodes.length) {
            nodes.forEach(n => { n.x *= W / oldW; n.y *= H / oldH; });
        }
        while (nodes.length < count) {
            const angle = rand(0, Math.PI * 2), speed = rand(3, 9);
            nodes.push({
                x: rand(0, W), y: rand(0, H),
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                r: rand(1.2, 2.3), glow: 0
            });
        }
        nodes.length = count;
        pulses = [];
        buildGraph();
        if (!motionOn()) drawFrame();
    }

    function buildGraph() {
        edges = [];
        adj = nodes.map(() => []);
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
                const d = Math.hypot(dx, dy);
                if (d < R) {
                    edges.push([i, j, d]);
                    adj[i].push(j);
                    adj[j].push(i);
                }
            }
        }
    }

    function spawnPulse(from, to, hops, maxHops, color) {
        pulses.push({
            a: from, b: to, t: 0, hops, maxHops,
            speed: rand(90, 140), color: color || pick(SIGNAL_COLORS)
        });
    }

    function step(dt) {
        for (const n of nodes) {
            n.x += n.vx * dt;
            n.y += n.vy * dt;
            if (n.x < -30 || n.x > W + 30) n.vx *= -1;
            if (n.y < -30 || n.y > H + 30) n.vy *= -1;
            n.glow *= Math.exp(-dt * 1.7);
        }
        buildGraph();

        spawnIn -= dt;
        if (spawnIn <= 0) {
            spawnIn = rand(0.7, 1.6);
            if (pulses.length < maxPulses) {
                const source = (Math.random() * nodes.length) | 0;
                if (adj[source].length) {
                    nodes[source].glow = 1;
                    spawnPulse(source, pick(adj[source]), 0, 3 + ((Math.random() * 5) | 0));
                }
            }
        }

        for (let k = pulses.length - 1; k >= 0; k--) {
            const p = pulses[k];
            const A = nodes[p.a], B = nodes[p.b];
            const len = Math.max(Math.hypot(B.x - A.x, B.y - A.y), 1);
            p.t += (p.speed * dt) / len;
            if (p.t < 1) continue;

            B.glow = 1;
            const options = adj[p.b].filter(n => n !== p.a);
            if (p.hops + 1 >= p.maxHops || !options.length) {
                pulses.splice(k, 1);
                continue;
            }
            const next = pick(options);
            // Sometimes the signal fans out to a second neighbour.
            if (options.length > 1 && pulses.length < maxPulses && Math.random() < 0.28) {
                const other = pick(options.filter(n => n !== next));
                spawnPulse(p.b, other, p.hops + 1, p.maxHops, p.color);
            }
            p.a = p.b; p.b = next; p.t = 0; p.hops++;
        }
    }

    function drawFrame() {
        ctx.clearRect(0, 0, W, H);
        ctx.lineWidth = 1;

        for (const [i, j, d] of edges) {
            const alpha = Math.pow(1 - d / R, 1.2) * 0.24;
            if (alpha < 0.008) continue;
            ctx.strokeStyle = `rgba(${EDGE_RGB},${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
        }

        for (const n of nodes) {
            if (n.glow > 0.03) {
                ctx.fillStyle = `rgba(100,255,218,${(0.16 * n.glow).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.r + 11 * n.glow, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = `rgba(190,215,255,${(0.38 + 0.5 * n.glow).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const p of pulses) {
            const A = nodes[p.a], B = nodes[p.b];
            const x = A.x + (B.x - A.x) * p.t, y = A.y + (B.y - A.y) * p.t;
            const len = Math.max(Math.hypot(B.x - A.x, B.y - A.y), 1);
            const tail = Math.min(p.t, 38 / len);
            const tx = A.x + (B.x - A.x) * (p.t - tail), ty = A.y + (B.y - A.y) * (p.t - tail);
            const [r, g, b] = p.color;

            const grad = ctx.createLinearGradient(tx, ty, x, y);
            grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0.75)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(x, y);
            ctx.stroke();

            ctx.fillStyle = `rgba(${r},${g},${b},0.16)`;
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
            ctx.beginPath();
            ctx.arc(x, y, 2.1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.lineWidth = 1;
    }

    function frame(now) {
        rafId = requestAnimationFrame(frame);
        const dt = (now - lastTime) / 1000;
        if (dt < MIN_FRAME_S) return;
        lastTime = now;
        step(Math.min(dt, 0.05));
        drawFrame();
    }

    function start() {
        if (rafId || !motionOn() || document.hidden) return;
        lastTime = performance.now();
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
    }

    function syncMotion() {
        stop();
        if (motionOn()) start();
        else { pulses = []; buildGraph(); drawFrame(); }
        updateToggle();
    }

    function updateToggle() {
        if (!toggle) return;
        const on = motionOn();
        const label = on ? 'Pause background animation' : 'Play background animation';
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
        const use = toggle.querySelector('use');
        if (use) use.setAttribute('href', on ? '#i-pause' : '#i-motion');
    }

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => resize(false), 150);
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', syncMotion);
    if (toggle) {
        toggle.addEventListener('click', () => {
            try { localStorage.setItem(STORE_KEY, motionOn() ? 'off' : 'on'); } catch (e) { /* private mode */ }
            syncMotion();
        });
    }

    resize(true);
    syncMotion();
})();

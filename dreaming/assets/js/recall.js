/* Recall experiments on one layer of random memories, shared by chapters 2 and 3. */
import { stageCanvas, animator, reducedMotion, colors } from "./ui.js?v=20261029a";
import { rng, randomPatterns, learn, block, network, overlap } from "./hopfield.js?v=20261029a";
import { drawPattern } from "./draw.js?v=20261029a";

export const N = 400, SIDE = 20, KMAX = 240, M = 40, R_QUALITY = 0.6, CUE_NOISE = 0.15, BETA = 10, STEPS = 24;
export const SUCCESS = 0.9, CUES = 24;

/** The same pool of memories for every chapter that asks for it (fixed seed). */
let pool = null;
export function memoryPool() {
    if (!pool) {
        const R = rng(20261029);
        const xi = randomPatterns(KMAX, N, R);
        pool = learn(xi, KMAX, N, M, R_QUALITY, R);
    }
    return pool;
}

/** The first K memories of the pool as a layer, with their K×K correlation block. */
export function layer(K) {
    const P = memoryPool();
    return { hat: P.hat.subarray(0, K * N), K, N, rho: P.rho, C: block(P.C, KMAX, K) };
}

export function cue(xi, mu, R) {
    const s = new Int8Array(N);
    for (let i = 0; i < N; i++) s[i] = R() < CUE_NOISE ? -xi[mu * N + i] : xi[mu * N + i];
    return s;
}

/** Full trajectory of one recall: states, overlap with the target, overlaps with all memories. */
export function trajectory(L, A, mu, seed) {
    const P = memoryPool(), R = rng(seed);
    const net = network([L], [A], { beta: BETA, R });
    const s = cue(P.xi, mu, R);
    const states = [Int8Array.from(s)], m = [overlap(s, P.xi, mu * N, N)], all = [overlapsAll(s, L.K)];
    for (let n = 0; n < STEPS; n++) {
        net.step([s]);
        states.push(Int8Array.from(s));
        m.push(overlap(s, P.xi, mu * N, N));
        all.push(overlapsAll(s, L.K));
    }
    return { mu, states, m, all };
}

function overlapsAll(s, K) {
    const P = memoryPool(), out = new Float32Array(K);
    for (let nu = 0; nu < K; nu++) out[nu] = overlap(s, P.xi, nu * N, N);
    return out;
}

/** How many of CUES fixed cues end with overlap ≥ SUCCESS. Same cues for every call. */
export function recallRate(L, A, seed = 7) {
    const P = memoryPool(), R = rng(seed);
    const net = network([L], [A], { beta: BETA, R });
    let ok = 0;
    for (let k = 0; k < CUES; k++) {
        const mu = Math.floor(R() * L.K);
        const s = cue(P.xi, mu, R);
        for (let n = 0; n < STEPS; n++) net.step([s]);
        if (overlap(s, P.xi, mu * N, N) >= SUCCESS) ok++;
    }
    return ok;
}

/** Plays a trajectory on a neuron grid, one step every ~120 ms; onStep(i) for side panels. */
export function player(gridCanvas, onStep) {
    let traj = null, i = 0, acc = 0;
    const stage = stageCanvas(gridCanvas, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        if (!traj) return;
        const P = memoryPool();
        const size = Math.min(w, h) - 56;
        drawPattern(ctx, traj.states[i], SIDE, (w - size) / 2, (h - size) / 2 + 6, size, { target: P.xi, to: traj.mu * N });
        const C = colors();
        ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
        ctx.fillStyle = C.muted; ctx.textAlign = "right"; ctx.textBaseline = "top";
        ctx.fillText(i === 0 ? "the cue" : `step ${i}`, w - 12, 10);
    });
    const anim = animator(gridCanvas, (t, dt) => {
        acc += dt;
        if (acc < 0.12) return true;
        acc = 0;
        i++;
        stage.redraw(); onStep(i);
        return i < traj.states.length - 1;
    });
    return {
        play(tr) {
            traj = tr; acc = 0;
            i = reducedMotion() ? tr.states.length - 1 : 0;
            stage.redraw(); onStep(i);
            if (i < tr.states.length - 1) anim.start(); else anim.stop();
        },
        get step() { return i; },
        get traj() { return traj; },
        redraw: () => stage.redraw(),
    };
}

/** Debounce for work triggered by sliders. */
export function later(fn, ms = 60) {
    let id = 0;
    return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}


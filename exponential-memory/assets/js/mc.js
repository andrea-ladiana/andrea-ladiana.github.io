/* A cancellable Monte Carlo run in a worker: each new run replaces the previous one. */

export function monteCarlo() {
    let worker = null, id = 0;
    return {
        run(job, onTrial, onDone) {
            worker?.terminate();
            worker = new Worker(new URL("./mc-worker.js?v=20261029a", import.meta.url), { type: "module" });
            const my = ++id, ms = [];
            worker.onmessage = e => {
                if (e.data.id !== my) return;
                if (e.data.done) { worker.terminate(); worker = null; onDone?.(ms); return; }
                ms.push(e.data.m);
                onTrial?.(ms);
            };
            worker.postMessage({ id: my, seed: (Math.random() * 2 ** 31) | 0, ...job });
        },
        stop() { worker?.terminate(); worker = null; },
        get busy() { return !!worker; },
    };
}

export const meanSd = ms => {
    const n = ms.length, m = ms.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(ms.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
    return { m, sd, n };
};

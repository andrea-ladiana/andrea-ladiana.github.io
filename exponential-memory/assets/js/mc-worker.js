/* Runs the paper's random-pattern experiments off the main thread, one trial per message. */
import { freshTrial, rng } from "./engine.js?v=20261029a";

self.onmessage = e => {
    const { id, N, L, P, r, steps, trials, seed } = e.data;
    const R = rng(seed);
    for (let k = 0; k < trials; k++) self.postMessage({ id, k, m: freshTrial({ N, L, P, r, steps, R }) });
    self.postMessage({ id, done: true });
};

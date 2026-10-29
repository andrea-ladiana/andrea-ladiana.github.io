/* A tiny synthesizer: each eigenvalue λ becomes a sine tone. */
let ac = null;
const audio = () => {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return ac;
};

/** Pitch of a note: the frequency of a mode scales like √λ; shifted so λ = 0 is audible. */
export const pitch = lambda => 196 * Math.sqrt(1 + Math.max(0, lambda));

function tone(freq, start, gain, decay) {
    const a = audio();
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.012);
    g.gain.exponentialRampToValueAtTime(1e-4, start + decay);
    osc.connect(g).connect(a.destination);
    osc.start(start);
    osc.stop(start + decay + 0.05);
}

export function ping(lambda, gain = 0.12) {
    try { const a = audio(); tone(pitch(lambda), a.currentTime + 0.01, gain, 0.9); } catch (e) { /* no audio */ }
}

/**
 * Arpeggio of all distinct notes, then the whole spectrum as one chord with each note
 * as loud as its share of modes. onNote(i) is called as note i sounds.
 */
export function playSpectrum(levels, weights, onNote) {
    let a;
    try { a = audio(); } catch (e) { return 0; }
    const n = levels.length;
    const step = Math.min(0.11, 2.2 / n);
    const t0 = a.currentTime + 0.05;
    levels.forEach((lam, i) => {
        tone(pitch(lam), t0 + i * step, 0.07, 0.5);
        setTimeout(() => onNote?.(i), (0.05 + i * step) * 1000);
    });
    const tc = t0 + n * step + 0.35;
    const total = weights.reduce((s, w) => s + w, 0);
    levels.forEach((lam, i) => tone(pitch(lam), tc, 0.32 * weights[i] / total + 0.004, 3.2));
    return (tc - a.currentTime) * 1000;
}

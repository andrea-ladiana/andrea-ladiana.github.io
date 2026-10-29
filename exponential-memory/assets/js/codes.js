/* Decoding the precomputed data, and the frozen text encoder of the language chapter. */

export function b64bytes(s) {
    const bin = atob(s), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** Packed bits (little-endian per byte, 1 = +1) -> Int8Array of ±1. */
export function unpackBits(s, n) {
    const by = b64bytes(s), out = new Int8Array(n);
    for (let k = 0; k < n; k++) out[k] = (by[k >> 3] >> (k & 7)) & 1 ? 1 : -1;
    return out;
}

export const f32 = s => new Float32Array(b64bytes(s).buffer);

export function f16(s) {
    const u = new Uint16Array(b64bytes(s).buffer), out = new Float32Array(u.length);
    for (let k = 0; k < u.length; k++) {
        const h = u[k], sg = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
        out[k] = e === 0 ? sg * f * 2 ** -24 : e === 31 ? (f ? NaN : sg * Infinity) : sg * (1 + f / 1024) * 2 ** (e - 15);
    }
    return out;
}

/** A glyph string of 0/1 -> ±1 pattern. */
export const glyph = s => Int8Array.from(s, c => (c === "1" ? 1 : -1));

/* ------------------------------------------------------------------ */
/*  Text -> 128 bits, as scikit-learn's TF-IDF (word 1-2 grams plus    */
/*  char_wb 3-5 grams, sublinear tf, l2 norm) -> PCA-whitening ->       */
/*  random projection -> sign. Mirrors the paper's encoder.py.         */
/* ------------------------------------------------------------------ */
export const normalise = t => t.trim().toLowerCase().replace(/\s+/g, " ");

function wordGrams(t) {
    const tok = t.match(/[\p{L}\p{N}_]{2,}/gu) || [];
    const g = [...tok];
    for (let k = 0; k + 1 < tok.length; k++) g.push(tok[k] + " " + tok[k + 1]);
    return g;
}

function charGrams(t) {
    const g = [];
    for (const word of t.replace(/\s\s+/g, " ").split(/\s+/).filter(Boolean)) {
        const w = " " + word + " ";
        for (let n = 3; n <= 5; n++) {
            let o = 0;
            g.push(w.slice(o, o + n));
            while (o + n < w.length) { o++; g.push(w.slice(o, o + n)); }
            if (o === 0) break;   // a short word counts once
        }
    }
    return g;
}

export class TextEncoder128 {
    constructor(enc) {
        const index = (terms, off) => new Map(terms.map((t, k) => [t, k + off]));
        this.word = index(enc.word.terms, 0);
        this.char = index(enc.char.terms, enc.word.terms.length);
        this.idf = Float64Array.from([...enc.word.idf, ...enc.char.idf]);
        [this.d, this.F, this.N] = enc.dims;
        this.W = f16(enc.W); this.bias = f32(enc.bias); this.R = f32(enc.R);
    }

    /** Sparse TF-IDF features: [[index, value], ...], each block l2-normalised. */
    features(text) {
        const t = normalise(text), out = [];
        for (const [grams, map] of [[wordGrams(t), this.word], [charGrams(t), this.char]]) {
            const tf = new Map();
            for (const g of grams) { const k = map.get(g); if (k !== undefined) tf.set(k, (tf.get(k) || 0) + 1); }
            const block = [...tf].map(([k, c]) => [k, (1 + Math.log(c)) * this.idf[k]]);
            const n = Math.hypot(...block.map(b => b[1])) || 1;
            block.forEach(b => out.push([b[0], b[1] / n]));
        }
        return out;
    }

    /** ±1 code of a sentence; `known` tells how many of its n-grams the encoder had seen. */
    encode(text) {
        const X = this.features(text), { d, F, N, W, bias, R } = this;
        const z = Float64Array.from(bias);
        for (let j = 0; j < d; j++) for (const [k, v] of X) z[j] += v * W[j * F + k];
        const code = new Int8Array(N);
        for (let n = 0; n < N; n++) {
            let s = 0;
            for (let j = 0; j < d; j++) s += z[j] * R[j * N + n];
            code[n] = s >= 0 ? 1 : -1;
        }
        return { code, known: X.length };
    }
}

/* Small UI toolkit shared by the chapters: crisp canvases, theme colours, controls, tooltips, loops. */

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- colours ---------- */
let palette = null;
const VARS = ["bg", "surface", "surface-2", "line", "ink", "ink-2", "muted", "grid", "axis",
    "c1", "c1-ink", "c1-soft", "c2", "c2-ink", "c2-soft", "c3", "c3-ink", "c3-soft", "pos", "neg", "stage-bg"];

export function colors() {
    if (!palette) {
        const cs = getComputedStyle(document.documentElement);
        palette = {};
        for (const v of VARS) palette[v.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = cs.getPropertyValue("--" + v).trim();
    }
    return palette;
}
export function onThemeChange(fn) { document.addEventListener("themechange", fn); }
function themeChanged() { palette = null; document.dispatchEvent(new Event("themechange")); }
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeChanged);

export function initThemeToggle(btn) {
    btn?.addEventListener("click", () => {
        const dark = document.documentElement.dataset.theme
            ? document.documentElement.dataset.theme === "dark"
            : matchMedia("(prefers-color-scheme: dark)").matches;
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("series-theme", next); } catch (e) { /* storage may be unavailable */ }
        themeChanged();
    });
}

const hex = c => {
    c = c.replace("#", "");
    if (c.length === 3) c = [...c].map(x => x + x).join("");
    return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
};
/** Linear mix of two hex colours, t in [0, 1]. */
export function mix(a, b, t) {
    const A = hex(a), B = hex(b);
    return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(",")})`;
}
export function alpha(c, a) {
    const [r, g, b] = hex(c);
    return `rgba(${r},${g},${b},${a})`;
}

/* ---------- canvas ---------- */
/**
 * Keeps a canvas at device resolution and calls draw(ctx, w, h) in CSS pixels
 * whenever it is resized or the theme changes. Returns { ctx, w, h, redraw }.
 */
export function stageCanvas(canvas, draw) {
    const ctx = canvas.getContext("2d");
    const s = { ctx, w: 0, h: 0, canvas, redraw: () => { if (s.w) draw(ctx, s.w, s.h); } };
    const fit = () => {
        const r = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        s.w = Math.max(1, r.width); s.h = Math.max(1, r.height);
        canvas.width = Math.round(s.w * dpr); canvas.height = Math.round(s.h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        s.redraw();
    };
    // the observer fires once right away, after the caller has finished setting up
    new ResizeObserver(fit).observe(canvas);
    onThemeChange(() => s.redraw());
    return s;
}

/** Map a box of data coordinates into a w×h canvas, preserving aspect ratio. */
export function fitBox(x0, x1, y0, y1, w, h, pad = 24) {
    const sx = (w - 2 * pad) / (x1 - x0 || 1), sy = (h - 2 * pad) / (y1 - y0 || 1);
    const s = Math.min(sx, sy);
    const ox = (w - s * (x1 - x0)) / 2 - s * x0, oy = (h - s * (y1 - y0)) / 2 - s * y0;
    return { s, X: x => ox + s * x, Y: y => oy + s * y, inv: (px, py) => [(px - ox) / s, (py - oy) / s] };
}

/** Pointer position in CSS pixels relative to the canvas. */
export function pointer(canvas, ev) {
    const r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
}

/* ---------- controls ---------- */
/** Segmented control: buttons with data-v; calls onChange(value) and keeps aria-pressed in sync. */
export function seg(el, onChange) {
    const buttons = [...el.querySelectorAll("button")];
    const api = {
        get value() { return el.querySelector('[aria-pressed="true"]')?.dataset.v; },
        set(v, fire = true) {
            buttons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === String(v))));
            if (fire) onChange?.(String(v));
        },
        buttons,
    };
    buttons.forEach(b => {
        if (!b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", "false");
        b.type = "button";
        b.addEventListener("click", () => { if (!b.disabled) api.set(b.dataset.v); });
    });
    return api;
}

/** Range input with live <output>. fmt maps the raw value to the shown text. */
export function range(input, output, onInput, fmt = v => v) {
    const show = () => { if (output) output.textContent = fmt(+input.value); };
    input.addEventListener("input", () => { show(); onInput?.(+input.value); });
    show();
    return {
        get value() { return +input.value; },
        set(v, fire = false) { input.value = v; show(); if (fire) onInput?.(+input.value); },
        setMax(m) { input.max = m; if (+input.value > m) input.value = m; show(); },
        refresh: show,
    };
}

/* ---------- tooltip ---------- */
export function tooltip(el) {
    return {
        show(x, y, html) { el.innerHTML = html; el.style.left = x + "px"; el.style.top = y + "px"; el.classList.add("on"); },
        hide() { el.classList.remove("on"); },
    };
}

/* ---------- animation ---------- */
/**
 * requestAnimationFrame loop that only runs while `el` is on screen.
 * frame(t, dt) returns false to stop by itself.
 */
export function animator(el, frame) {
    let running = false, visible = false, raf = 0, last = 0;
    const tick = now => {
        raf = 0;
        if (!running || !visible) return;
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        if (frame(now / 1000, dt) === false) { running = false; return; }
        raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (running && visible && !raf) { last = 0; raf = requestAnimationFrame(tick); } };
    new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }, { rootMargin: "80px" }).observe(el);
    return {
        start() { running = true; kick(); },
        stop() { running = false; },
        get running() { return running; },
    };
}

/** Run init() the first time el comes near the viewport. */
export function whenNear(el, init) {
    const io = new IntersectionObserver(es => {
        if (es.some(e => e.isIntersecting)) { io.disconnect(); init(); }
    }, { rootMargin: "400px" });
    io.observe(el);
}

/* ---------- formatting ---------- */
export const fmtInt = n => n.toLocaleString("en-US");
export const fmtNum = (x, d = 4) => {
    if (Math.abs(x) < 1e-9) return "0";
    if (Number.isInteger(x)) return String(x);
    const a = Math.abs(x);
    return a >= 1000 ? x.toFixed(1) : x.toPrecision(d).replace(/\.?0+$/, "");
};
export const fmtPct = x => (100 * x).toFixed(x < 0.1 ? 1 : 0) + "%";

/** Simple fraction text for small rationals like 2/3 or 5/9. */
export function frac(p, q) {
    const g = (a, b) => (b ? g(b, a % b) : a);
    const d = g(p, q);
    return `${p / d}/${q / d}`;
}

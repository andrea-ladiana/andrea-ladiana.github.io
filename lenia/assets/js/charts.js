/*
 * charts.js — small, dependency-free canvas charts in the visual language of the
 * narration: thin axes, light grid, one semantic colour per meaning, text in the page
 * font. Colours are read from the CSS custom properties, so charts follow the theme.
 *
 *   Charts.plot(canvas, {
 *     x: [lo, hi], y: [lo, hi] | null (auto), ylog, xlog,
 *     series: [{ x: [...], y: [...], color, width, dash, alpha }],
 *     points: [{ x, y, ylo, yhi, color, r, hollow }],
 *     bands:  [{ y0, y1, color, alpha }],    xbands: [{ x0, x1, color, alpha }],
 *     hlines: [{ y, color, dash, label }],   vlines: [{ x, color, dash, label }],
 *     xlabel, ylabel, xfmt, yfmt, title, empty
 *   })
 */
(function (root) {
  "use strict";

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function colour(c) { return c && c.startsWith("--") ? cssVar(c, "#888") : c; }

  /** Size the backing store to the CSS box times devicePixelRatio. */
  function setup(canvas) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(10, canvas.clientWidth), h = Math.max(10, canvas.clientHeight);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function niceStep(span, n) {
    const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function ticks(lo, hi, n = 5) {
    if (!(hi > lo)) return [lo];
    const s = niceStep(hi - lo, n), out = [];
    for (let t = Math.ceil(lo / s - 1e-9) * s; t <= hi + s * 1e-9; t += s) out.push(Math.abs(t) < s * 1e-9 ? 0 : t);
    return out;
  }
  function logTicks(lo, hi) {
    const out = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      const v = Math.pow(10, e);
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
    return out;
  }
  function fmtDefault(v) {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e4 || a < 1e-3) {
      const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
      return (Math.abs(m - 1) < 1e-9 ? "" : (+m.toPrecision(2)) + "·") + "10" + sup(e);
    }
    return String(+v.toPrecision(4));
  }
  const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  function sup(e) { return String(e).replace("−", "-").split("").map(c => SUP[c] || c).join(""); }

  function extent(spec) {
    let ylo = Infinity, yhi = -Infinity, xlo = Infinity, xhi = -Infinity;
    for (const s of spec.series || []) {
      const n = s.n ?? s.y.length;
      for (let i = 0; i < n; i++) {
        const y = s.y[i], x = s.x ? s.x[i] : i;
        if (!Number.isFinite(y) || (spec.ylog && y <= 0)) continue;
        if (y < ylo) ylo = y; if (y > yhi) yhi = y;
        if (x < xlo) xlo = x; if (x > xhi) xhi = x;
      }
    }
    for (const p of spec.points || []) {
      for (const y of [p.y, p.ylo, p.yhi]) if (Number.isFinite(y) && !(spec.ylog && y <= 0)) { ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); }
      if (Number.isFinite(p.x)) { xlo = Math.min(xlo, p.x); xhi = Math.max(xhi, p.x); }
    }
    return { xlo, xhi, ylo, yhi };
  }

  function plot(canvas, spec) {
    const { ctx, w, h } = setup(canvas);
    const font = cssVar("--font-ui", "system-ui, sans-serif");
    const ink2 = cssVar("--ink-2", "#52514e"), muted = cssVar("--muted", "#898781");
    const gridc = cssVar("--grid", "#e1e0d9"), axisc = cssVar("--axis", "#c3c2b7");
    const fs = spec.fontSize || 11;
    ctx.font = `${fs}px ${font}`;
    const padL = spec.padL ?? (spec.ylabel ? 46 : 38), padR = spec.padR ?? 10, padT = spec.padT ?? (spec.title ? 20 : 8), padB = spec.padB ?? (spec.xlabel ? 34 : 22);
    const pw = w - padL - padR, ph = h - padT - padB;
    if (pw < 20 || ph < 20) return null;

    const ex = extent(spec);
    let [x0, x1] = spec.x || [ex.xlo, ex.xhi];
    let [y0, y1] = spec.y || [ex.ylo, ex.yhi];
    if (!Number.isFinite(x0) || !Number.isFinite(x1)) { x0 = 0; x1 = 1; }
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) { y0 = spec.ylog ? 1 : 0; y1 = spec.ylog ? 10 : 1; }
    if (x1 === x0) { x1 = x0 + 1; }
    if (y1 === y0) { const d = Math.abs(y0) * 0.05 || 0.5; y0 -= d; y1 += d; }
    if (!spec.y && !spec.ylog) { const d = (y1 - y0) * 0.08; y0 -= d; y1 += d; if (spec.yZero && y0 > 0) y0 = 0; }
    const ly = (v) => spec.ylog ? Math.log10(v) : v, lx = (v) => spec.xlog ? Math.log10(v) : v;
    const Y0 = ly(y0), Y1 = ly(y1), X0 = lx(x0), X1 = lx(x1);
    const px = (x) => padL + (lx(x) - X0) / (X1 - X0) * pw;
    const py = (y) => padT + ph - (ly(y) - Y0) / (Y1 - Y0) * ph;

    // grid and ticks
    ctx.lineWidth = 1;
    ctx.strokeStyle = gridc; ctx.fillStyle = ink2;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const yt = spec.yticks || (spec.ylog ? logTicks(y0, y1) : ticks(y0, y1, Math.max(2, Math.round(ph / 34))));
    const yf = spec.yfmt || fmtDefault, xf = spec.xfmt || fmtDefault;
    for (const t of yt) {
      const yy = Math.round(py(t)) + 0.5;
      if (yy < padT - 1 || yy > padT + ph + 1) continue;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + pw, yy); ctx.stroke();
      ctx.fillText(yf(t), padL - 6, yy);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const xt = spec.xticks || (spec.xlog ? logTicks(x0, x1) : ticks(x0, x1, Math.max(2, Math.round(pw / 70))));
    for (const t of xt) {
      const xx = Math.round(px(t)) + 0.5;
      if (xx < padL - 1 || xx > padL + pw + 1) continue;
      ctx.strokeStyle = gridc;
      ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + ph); ctx.stroke();
      ctx.fillText(xf(t), xx, padT + ph + 5);
    }
    ctx.strokeStyle = axisc;
    ctx.beginPath(); ctx.moveTo(padL + 0.5, padT); ctx.lineTo(padL + 0.5, padT + ph + 0.5); ctx.lineTo(padL + pw, padT + ph + 0.5); ctx.stroke();

    if (spec.xlabel) { ctx.fillStyle = ink2; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(spec.xlabel, padL + pw / 2, h - 2); }
    if (spec.ylabel) {
      ctx.save(); ctx.translate(11, padT + ph / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = ink2; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(spec.ylabel, 0, 0); ctx.restore();
    }
    if (spec.title) { ctx.fillStyle = cssVar("--ink", "#0b0b0b"); ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.font = `600 ${fs}px ${font}`; ctx.fillText(spec.title, padL, 2); ctx.font = `${fs}px ${font}`; }

    // clip to the plotting box
    ctx.save();
    ctx.beginPath(); ctx.rect(padL, padT, pw, ph); ctx.clip();
    for (const b of spec.bands || []) {
      ctx.globalAlpha = b.alpha ?? 0.12; ctx.fillStyle = colour(b.color);
      const a = py(Math.min(b.y1, y1)), c = py(Math.max(b.y0, y0));
      ctx.fillRect(padL, Math.min(a, c), pw, Math.abs(c - a));
    }
    for (const b of spec.xbands || []) {
      ctx.globalAlpha = b.alpha ?? 0.12; ctx.fillStyle = colour(b.color);
      const a = px(b.x0), c = px(b.x1);
      ctx.fillRect(Math.min(a, c), padT, Math.abs(c - a), ph);
    }
    ctx.globalAlpha = 1;
    const line = (l, vertical) => {
      ctx.strokeStyle = colour(l.color || "--muted"); ctx.lineWidth = l.width || 1;
      ctx.setLineDash(l.dash || [4, 3]);
      ctx.beginPath();
      if (vertical) { const xx = px(l.x); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + ph); }
      else { const yy = py(l.y); ctx.moveTo(padL, yy); ctx.lineTo(padL + pw, yy); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    for (const l of spec.hlines || []) line(l, false);
    for (const l of spec.vlines || []) line(l, true);

    for (const s of spec.series || []) {
      const n = s.n ?? s.y.length;
      if (n < 1) continue;
      ctx.strokeStyle = colour(s.color || "--creature"); ctx.lineWidth = s.width || 1.6;
      ctx.globalAlpha = s.alpha ?? 1; ctx.setLineDash(s.dash || []);
      ctx.lineJoin = "round";
      ctx.beginPath();
      let pen = false, lastY = 0;
      for (let i = 0; i < n; i++) {
        const y = s.y[i], x = s.x ? s.x[i] : i;
        if (!Number.isFinite(y) || (spec.ylog && y <= 0)) { pen = false; continue; }
        const X = px(x), Yv = py(y);
        if (s.step && pen) ctx.lineTo(X, lastY);           // survival curves: hold, then drop
        if (pen) ctx.lineTo(X, Yv); else { ctx.moveTo(X, Yv); pen = true; }
        lastY = Yv;
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    for (const p of spec.points || []) {
      if (!Number.isFinite(p.y) || (spec.ylog && p.y <= 0)) continue;
      const X = px(p.x), Yv = py(p.y), c = colour(p.color || "--creature");
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1.2;
      if (Number.isFinite(p.ylo) && Number.isFinite(p.yhi)) {
        ctx.beginPath(); ctx.moveTo(X, py(Math.max(p.ylo, spec.ylog ? 1e-300 : -Infinity))); ctx.lineTo(X, py(p.yhi)); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(X, Yv, p.r || 3.2, 0, 2 * Math.PI);
      if (p.hollow) { ctx.fillStyle = cssVar("--surface", "#fff"); ctx.fill(); ctx.stroke(); } else ctx.fill();
    }
    ctx.restore();

    // labels of reference lines, outside the clip so they stay readable
    ctx.font = `${fs - 1}px ${font}`; ctx.textBaseline = "bottom"; ctx.textAlign = "right";
    for (const l of spec.hlines || []) if (l.label) { ctx.fillStyle = colour(l.color || "--muted"); ctx.fillText(l.label, padL + pw - 2, py(l.y) - 2); }
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    for (const l of spec.vlines || []) if (l.label) { ctx.fillStyle = colour(l.color || "--muted"); ctx.fillText(l.label, px(l.x) + 3, padT + 2); }
    if (spec.empty) { ctx.fillStyle = muted; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `${fs}px ${font}`; ctx.fillText(spec.empty, padL + pw / 2, padT + ph / 2); }
    return { px, py, padL, padT, pw, ph, w, h };
  }

  root.Charts = { plot, setup, ticks, logTicks, fmt: fmtDefault, cssVar, colour, sup };
})(typeof self !== "undefined" ? self : this);

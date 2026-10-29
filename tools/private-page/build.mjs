/*
 * Builds a password-protected page: bundles the page's ES modules, inlines its stylesheet and data,
 * then encrypts the whole document. Only the encrypted file and a small password gate are published.
 *
 * Usage:
 *   PRIVATE_PAGE_PASSWORD=... node tools/private-page/build.mjs <source dir> <output dir> [--data <file in source>] [--title <gate title>]
 *   e.g. node tools/private-page/build.mjs _private/hendecasyllable hendeca --data assets/data/hend.json
 *
 * Output: <output dir>/index.html (the gate, noindex) and <output dir>/content.bin:
 *   "PPG1" | PBKDF2 iterations (uint32, big-endian) | salt (16 bytes) | IV (12 bytes) | AES-256-GCM(gzip(html)) with its tag.
 * The gate derives the key with PBKDF2-SHA256 in the browser, decrypts with Web Crypto and writes the page in place.
 *
 * Root-absolute links (/assets/series/...) stay links: they are public. Relative assets must all be inlined.
 * The password comes only from the environment and is never written anywhere.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, posix } from "node:path";
import { gzipSync } from "node:zlib";
import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";

const ITERATIONS = 600_000;

function args() {
    const a = process.argv.slice(2), out = { flags: {} };
    const pos = [];
    for (let i = 0; i < a.length; i++) {
        if (a[i].startsWith("--")) out.flags[a[i].slice(2)] = a[++i];
        else pos.push(a[i]);
    }
    if (pos.length !== 2) {
        console.error("usage: PRIVATE_PAGE_PASSWORD=... node build.mjs <source dir> <output dir> [--data <file>] [--title <title>]");
        process.exit(2);
    }
    [out.src, out.dst] = pos;
    return out;
}

/* ---------- a minimal bundler for the page's own modules ---------- */
const IMPORT = /^import\s+(?:\{([^}]*)\}|\*\s+as\s+([\w$]+))\s+from\s+["']([^"']+)["'];?[ \t]*$/gm;
const EXPORT_DECL = /^export\s+((?:async\s+)?function\*?|class|const|let|var)\s+([\w$]+)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

const clean = p => p.replace(/[?#].*$/, "");

function bundle(srcDir, entry) {
    const order = [], seen = new Set(), mods = new Map();
    const visit = rel => {
        if (seen.has(rel)) return;
        seen.add(rel);
        const code = readFileSync(join(srcDir, rel), "utf8");
        const deps = [];
        for (const m of code.matchAll(IMPORT)) deps.push(posix.normalize(posix.join(posix.dirname(rel), clean(m[3]))));
        deps.forEach(visit);
        mods.set(rel, code);
        order.push(rel);
    };
    visit(entry);

    const exported = new Map();   // module -> its export names, filled in dependency order
    const parts = order.map(rel => {
        let code = mods.get(rel);
        const names = [], pub = new Set();
        code = code.replace(EXPORT_DECL, (_, kind, name) => { names.push(name); pub.add(name); return `${kind} ${name}`; });
        code = code.replace(EXPORT_LIST, (_, list) => {
            for (const s of list.split(",").map(s => s.trim()).filter(Boolean)) {
                const [a, b] = s.split(/\s+as\s+/);
                names.push(b ? `${b}: ${a}` : a);
                pub.add(b || a);
            }
            return "";
        });
        code = code.replace(IMPORT, (_, list, ns, from) => {
            const dep = posix.normalize(posix.join(posix.dirname(rel), clean(from))), key = JSON.stringify(dep);
            if (ns) return `const ${ns} = __m[${key}];`;
            const binds = list.split(",").map(s => s.trim()).filter(Boolean).map(s => {
                const [a, b] = s.split(/\s+as\s+/);
                if (!exported.get(dep).has(a)) throw new Error(`${rel}: ${dep} does not export ${a}`);
                return b ? `${a}: ${b}` : a;
            });
            return `const { ${binds.join(", ")} } = __m[${key}];`;
        });
        exported.set(rel, pub);
        if (/^\s*export\s/m.test(code) || /^\s*import\s/m.test(code)) throw new Error(`${rel}: an import or export form the bundler does not handle`);
        if (/import\.meta|import\(/.test(code)) throw new Error(`${rel}: import.meta and dynamic import cannot be bundled`);
        return `__m[${JSON.stringify(rel)}] = (() => {\n${code}\nreturn { ${names.join(", ")} };\n})();`;
    });
    return `(() => {\n"use strict";\nconst __m = {};\n${parts.join("\n")}\n})();`;
}

/* ---------- the plain document ---------- */
const scriptSafe = s => s.replace(/<\/(script)/gi, "<\\/$1");

function page(srcDir, dataFile) {
    let html = readFileSync(join(srcDir, "index.html"), "utf8");
    // stylesheets with a relative path are inlined; root-absolute ones stay links
    html = html.replace(/<link rel="stylesheet" href="(?!\/|https?:)([^"]+)">/g, (_, href) =>
        `<style>\n${readFileSync(join(srcDir, clean(href)), "utf8")}</style>`);
    let data = "";
    if (dataFile) {
        const json = JSON.stringify(JSON.parse(readFileSync(join(srcDir, dataFile), "utf8"))).replace(/</g, "\\u003c");
        data = `<script>window.__BUNDLE_DATA__ = ${json};</script>\n`;
    }
    html = html.replace(/<script type="module" src="([^"]+)"><\/script>/, (_, src) =>
        `${data}<script>\n${scriptSafe(bundle(srcDir, clean(src)))}\n</script>`);
    const left = html.match(/(?:src|href)="(?!\/|https?:|#|mailto:)[^"]+"/g);
    if (left) throw new Error(`relative assets left in the page: ${left.join(", ")}`);
    return html;
}

/* ---------- encryption ---------- */
function encrypt(plain, password) {
    const salt = randomBytes(16), iv = randomBytes(12);
    const key = pbkdf2Sync(Buffer.from(password, "utf8"), salt, ITERATIONS, 32, "sha256");
    const c = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([c.update(gzipSync(Buffer.from(plain, "utf8"), { level: 9 })), c.final(), c.getAuthTag()]);
    const head = Buffer.alloc(8);
    head.write("PPG1", 0, "ascii");
    head.writeUInt32BE(ITERATIONS, 4);
    return Buffer.concat([head, salt, iv, body]);
}

function gate(title) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="/assets/series/series.css">
<script>
  try { const t = localStorage.getItem("series-theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (e) {}
</script>
<style>
  body { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
  .gate { width: 100%; max-width: 400px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 28px 24px; }
  .gate h1 { margin: 0 0 6px; font-size: 24px; font-weight: 600; }
  .gate p { margin: 0 0 18px; color: var(--ink-2); font-size: 15px; }
  .gate form { display: flex; gap: 8px; }
  .gate input { flex: 1; min-width: 0; font: 400 16px/1.3 var(--font-ui); color: var(--ink); background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-s); padding: 10px 12px; }
  .gate input:focus { outline: 2px solid var(--c1); outline-offset: 1px; border-color: var(--c1); }
  .gate .msg { min-height: 1.4em; margin: 10px 0 0; font-size: 14px; color: var(--c3-ink); }
  .gate .home { display: inline-block; margin-top: 14px; font-size: 14px; color: var(--muted); }
</style>
</head>
<body>
<main class="gate">
  <h1>A private draft</h1>
  <p>This page shares unpublished work. Enter the password you were given.</p>
  <form id="f" autocomplete="off">
    <input id="pw" type="password" aria-label="Password" placeholder="Password" required autofocus>
    <button class="btn primary" type="submit">Open</button>
  </form>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
  <a class="home" href="/">← Andrea Ladiana</a>
</main>
<script>
(() => {
  const KEY = "private-page:" + location.pathname;
  const msg = document.getElementById("msg");
  const b64 = u => btoa(String.fromCharCode(...u));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  let blob = null;
  const load = async () => blob || (blob = new Uint8Array(await (await fetch("content.bin", { cache: "no-cache" })).arrayBuffer()));
  async function decrypt(key, buf) {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(24, 36) }, key, buf.slice(36));
    return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  const write = html => { document.open(); document.write(html); document.close(); };
  async function withPassword(pw) {
    const buf = await load(), it = new DataView(buf.buffer).getUint32(4), salt = buf.slice(8, 24);
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: it, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    const html = await decrypt(key, buf);  // throws on a wrong password, before anything is stored
    // the key, not the password, is kept for this tab only, so a reload does not ask again
    try { sessionStorage.setItem(KEY, b64(salt) + "." + b64(new Uint8Array(await crypto.subtle.exportKey("raw", key)))); } catch (e) {}
    write(html);
  }
  (async () => {
    let saved = null;
    try { saved = sessionStorage.getItem(KEY); } catch (e) {}
    if (!saved) return;
    try {
      const buf = await load(), [s, k] = saved.split(".");
      if (s !== b64(buf.slice(8, 24))) throw 0;  // the page was rebuilt
      write(await decrypt(await crypto.subtle.importKey("raw", unb64(k), "AES-GCM", false, ["decrypt"]), buf));
    } catch (e) { try { sessionStorage.removeItem(KEY); } catch (_) {} }
  })();
  document.getElementById("f").addEventListener("submit", async ev => {
    ev.preventDefault();
    const pw = document.getElementById("pw").value;
    msg.textContent = "Opening…";
    try { await withPassword(pw); }
    catch (e) { msg.textContent = e && e.name === "OperationError" ? "Wrong password." : "Could not open the page in this browser."; }
  });
})();
</script>
</body>
</html>
`;
}

const { src, dst, flags } = args();
const password = process.env.PRIVATE_PAGE_PASSWORD;
if (!password) { console.error("set PRIVATE_PAGE_PASSWORD"); process.exit(2); }
const html = page(src, flags.data);
const bin = encrypt(html, password);
if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
writeFileSync(join(dst, "content.bin"), bin);
writeFileSync(join(dst, "index.html"), gate(flags.title || "Private draft · Andrea Ladiana"));
console.log(`page ${(html.length / 1024).toFixed(0)} KB → ${join(dst, "content.bin")} ${(bin.length / 1024).toFixed(0)} KB (gzip + AES-256-GCM, PBKDF2 ${ITERATIONS.toLocaleString("en-US")})`);

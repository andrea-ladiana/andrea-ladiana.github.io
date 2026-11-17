/*
 * Andrea Ladiana — home page logic.
 * Data lives in biblio.bib and conferences.json (nothing is duplicated here).
 * Browsers block fetch() on file://, so preview locally with a tiny server:  python -m http.server
 *
 * Sections: theme · reveal/scrollspy · hero network (assets/js/dotnet.js) · publications + research map ·
 * conferences raster · origami vertex · Szilárd numerals · interactive-paper previews (assets/js/minis.js)
 */
(function () {
    'use strict';

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const root = document.documentElement;
    const reduceQ = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => reduceQ.matches;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
    const icon = n => `<svg class="icon" aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const cellSize = () => parseFloat(getComputedStyle(root).getPropertyValue('--cell')) || 14;
    const recolorers = [];
    const DATA = '';
    const SITE_URL = 'https://andrea-ladiana.github.io/';
    const LOCAL_HINT = 'Open the site through a local web server (e.g. <code>python -m http.server</code>) to load this section.';
    async function fetchData(path) {
        if (location.protocol === 'file:') throw new Error('file-protocol');
        const res = await fetch(DATA + path, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
        return res;
    }

    /* ================================================================ theme */
    (function theme() {
        const btn = $('#theme');
        const dark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
        const sync = () => {
            btn.querySelector('use').setAttribute('href', dark() ? '#i-sun' : '#i-moon');
            btn.setAttribute('aria-label', dark() ? 'Switch to light theme' : 'Switch to dark theme');
        };
        const recolor = () => requestAnimationFrame(() => recolorers.forEach(f => f()));
        btn.addEventListener('click', () => {
            root.dataset.theme = dark() ? 'light' : 'dark';
            try { localStorage.setItem('series-theme', root.dataset.theme); } catch (e) { /* private mode */ }
            sync(); recolor();
        });
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { sync(); recolor(); });
        sync();
    })();

    /* ================================================================ reveal, scrollspy, card spotlight */
    const revealIO = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
    }), { rootMargin: '0px 0px -6% 0px' });
    const observeReveal = scope => $$('.reveal:not(.in)', scope).forEach((el, i) => { el.style.transitionDelay = (i % 4) * 60 + 'ms'; revealIO.observe(el); });
    observeReveal(document);

    (function scrollspy() {
        const links = new Map($$('.nav-pill a.lnk').map(a => [a.getAttribute('href').slice(1), a]));
        const io = new IntersectionObserver(es => es.forEach(e => {
            if (!e.isIntersecting) return;
            links.forEach(a => a.classList.remove('active'));
            const a = links.get(e.target.id);
            if (a) { a.classList.add('active'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
        }), { rootMargin: '-45% 0px -50% 0px' });
        ['top', ...links.keys()].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    })();

    $$('.card').forEach(card => card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', e.clientX - r.left + 'px');
        card.style.setProperty('--my', e.clientY - r.top + 'px');
    }));

    /* ================================================================ HERO: the page's dots are a Hopfield network */
    (function hero() {
        const heroEl = $('#top'), canvas = $('#hero-net'), slot = $('#slot');
        const MEMS = [['heart', 'heart'], ['cat', 'cat'], ['crane', 'crane'], ['key', 'key'], ['bulb', 'light bulb'], ['saturn', 'Saturn'], ['notes', 'music'], ['pi', 'π']];
        const out = { n: $('#hop-n'), state: $('#hop-state'), name: $('#hop-name'), m: $('#hop-m'), t: $('#hop-t') };
        const chipsEl = $('#mem-chips');

        const chips = MEMS.map(([, label], k) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'mem'; b.textContent = label;
            b.setAttribute('aria-pressed', 'false');
            b.addEventListener('click', () => { setDrawMode(false); net.cue(k); });
            chipsEl.appendChild(b);
            return b;
        });
        const drawBtn = document.createElement('button');
        drawBtn.type = 'button'; drawBtn.className = 'mem draw-btn';
        drawBtn.innerHTML = `${icon('pen')} draw`;
        drawBtn.setAttribute('aria-pressed', 'false');
        drawBtn.title = 'Draw a shape in the square: the network settles into the closest memory';
        chipsEl.appendChild(drawBtn);

        const net = DotNet.create({
            canvas,
            align: 'page',
            cell: cellSize,
            slot: () => {
                const c = canvas.getBoundingClientRect(), s = slot.getBoundingClientRect();
                return { x: s.left - c.left, y: s.top - c.top, w: s.width, h: s.height };
            },
            pictures: MEMS.map(([key, label]) => ({ name: label, draw: DotNet.PICTURES[key] })),
            alwaysOn: true,
            autoCycle: 6500,
            onState: s => {
                out.state.textContent = s.mode === 'sketch' ? 'listening to your drawing' : s.mode === 'recall' ? 'your drawing recalls' : 'recalling';
                out.name.textContent = s.mode === 'sketch' ? '…' : s.name;
                out.m.textContent = s.m.toFixed(3);
                out.t.textContent = s.T.toFixed(2);
                chips.forEach((c, k) => {
                    c.style.setProperty('--a', Math.max(0, Math.min(1, s.a[k])).toFixed(3));
                    c.setAttribute('aria-pressed', String(s.mode !== 'sketch' && k === s.target));
                });
            }
        });
        recolorers.push(() => net.recolor());

        /* ---- pointer: heat anywhere in the hero, draw inside the slot */
        let px = null, py = null, drawing = false, drawMode = false, endTimer = 0, drew = false;
        const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

        function setDrawMode(on) {
            drawMode = on;
            slot.classList.toggle('drawing', on);
            drawBtn.setAttribute('aria-pressed', String(on));
            slot.dataset.hint = on ? 'draw here' : '';
        }
        drawBtn.addEventListener('click', () => {
            const on = !drawMode;
            setDrawMode(on);
            if (on) { clearTimeout(endTimer); net.beginSketch(); }
            else if (net.mode === 'sketch') net.endSketch();
        });

        function paintLine(x0, y0, x1, y1) {
            const c = cellSize(), n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (c * 0.5)));
            for (let s = 1; s <= n; s++) net.paint(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, 1.15);
        }
        function heatLine(x0, y0, x1, y1, R) {
            const c = cellSize(), n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / c));
            for (let s = 1; s <= n; s++) net.heatAt(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, R);
        }

        heroEl.addEventListener('pointermove', e => {
            if (!net.ready) return;
            const [x, y] = local(e);
            if (drawing) { paintLine(px ?? x, py ?? y, x, y); px = x; py = y; return; }
            if (e.pointerType === 'touch') return;
            const R = 3;
            if (px !== null) heatLine(px, py, x, y, R); else net.heatAt(x, y, R);
            px = x; py = y;
        });
        heroEl.addEventListener('pointerleave', () => { if (!drawing) px = py = null; });
        heroEl.addEventListener('pointerdown', e => {
            if (!net.ready || e.target.closest('a, button')) return;
            const [x, y] = local(e);
            const inSlot = e.target === slot;
            if (inSlot && (e.pointerType !== 'touch' || drawMode) && e.button === 0) {
                e.preventDefault();
                slot.setPointerCapture(e.pointerId);
                clearTimeout(endTimer);
                if (net.mode !== 'sketch') net.beginSketch();
                drawing = true; drew = true; slot.dataset.hint = '';
                px = x; py = y; net.paint(x, y, 1.15);
                return;
            }
            net.heatAt(x, y, e.pointerType === 'touch' ? 4.5 : 3);
        });
        const stop = () => {
            if (!drawing) return;
            drawing = false; px = py = null;
            clearTimeout(endTimer);
            endTimer = setTimeout(() => { setDrawMode(false); net.endSketch(); }, 850);
        };
        slot.addEventListener('pointerup', stop);
        slot.addEventListener('pointercancel', stop);
        slot.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !drew && !drawMode) slot.dataset.hint = 'drag to draw ✎'; });
        slot.addEventListener('pointerleave', () => { if (!drawMode) slot.dataset.hint = ''; });

        /* ---- ambient sparks: spontaneous activity across the whole hero */
        let heroVisible = true;
        new IntersectionObserver(es => { heroVisible = es[0].isIntersecting; }).observe(heroEl);
        setInterval(() => {
            if (!heroVisible || document.hidden || reduce() || !net.ready || drawing) return;
            const r = canvas.getBoundingClientRect();
            const x = Math.random() * r.width, y = Math.random() * r.height;
            if (!net.inSlot(x, y)) net.heatAt(x, y, 1.3, true);
        }, 420);

        /* ---- layout */
        let lastW = 0, lastH = 0, rt = 0;
        new ResizeObserver(() => {
            const r = heroEl.getBoundingClientRect();
            if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
            const first = !lastW;
            lastW = r.width; lastH = r.height;
            clearTimeout(rt);
            rt = setTimeout(() => {
                if (first || !net.ready) { if (net.init(true)) out.n.textContent = net.size.Ns.toLocaleString('en'); }
                else { net.relayout(); out.n.textContent = net.size.Ns.toLocaleString('en'); }
            }, first ? 0 : 160);
        }).observe(heroEl);
    })();

    /* ================================================================ PUBLICATIONS + RESEARCH MAP */
    const FAMILIES = [
        { n: 1, name: 'Memory & learning', tags: ['Associative Networks', 'Machine Learning', 'Federated Learning'] },
        { n: 2, name: 'Statistical physics', tags: ['Statistical Mechanics', 'Spin Glasses', 'Linear Response', 'Finite-size Scaling', 'Stochastic Processes'] },
        { n: 3, name: 'Geometry & analysis', tags: ['Mathematical Physics', 'Optimal Transport', 'Graph Theory', 'Spectral Theory', 'Fractals', 'Discrete Geometry', 'Origami'] },
        { n: 4, name: 'Living systems', tags: ['Biological Systems', 'Collective Dynamics'] }
    ];
    const familyOf = tag => (FAMILIES.find(f => f.tags.includes(tag)) || FAMILIES[2]).n;
    const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const LEGACY_TOPICS = { associative: 'associative-networks', statmech: 'statistical-mechanics', federated: 'federated-learning', graphs: 'graph-theory' };

    const TYPES = [
        { key: 'all', label: 'All', test: () => true },
        { key: 'journal', label: 'Journal articles', test: e => e.type === 'article' && /published/i.test(e.note || '') },
        { key: 'submitted', label: 'Preprints & submitted', test: e => /submitted|arxiv/i.test(e.note || '') },
        { key: 'conference', label: 'Proceedings', test: e => e.type === 'inproceedings' || /workshop/i.test(e.note || '') },
        { key: 'ca', label: 'Corresponding author', test: e => e.isSelfCA }
    ];
    const pub = { entries: [], topics: [], type: 'all', topic: 'all', q: '' };
    const listEl = $('#pubs');
    let mapApi = null;

    const status = e => (e.note || '').replace(/^\[|\]$/g, '').trim();
    const statusClass = s => (/published/i.test(s) ? 's-pub' : /submitted/i.test(s) ? 's-sub' : /arxiv/i.test(s) ? 's-pre' : 's-proc');
    const venueOf = e => {
        const v = BibTeX.displayText(e.journal || e.booktitle || '').replace(/^submitted to\s+/i, '');
        if (/^arxiv preprint$/i.test(v)) return '';
        return v.charAt(0).toUpperCase() + v.slice(1);
    };
    const doiUrl = e => (!e.doi ? '' : /^https?:/i.test(e.doi) ? e.doi : `https://doi.org/${e.doi}`);

    function linksOf(e) {
        const seen = new Set(), out = [];
        const add = (url, label) => { const u = safeUrl(url); if (u && !seen.has(u)) { seen.add(u); out.push([u, label]); } };
        const arxiv = e.eprint ? (/^https?:/.test(e.eprint) ? e.eprint : `https://arxiv.org/abs/${e.eprint}`) : '';
        if (/arxiv\.org/.test(e.url || '')) add(e.url, 'arXiv');
        add(arxiv, 'arXiv');
        add(doiUrl(e), 'DOI');
        if (e.url && !/doi\.org|arxiv\.org/.test(e.url)) add(e.url, /openreview/.test(e.url) ? 'OpenReview' : /sciencedirect/.test(e.url) ? 'Journal' : /iop\.org/.test(e.url) ? 'Journal' : 'Link');
        if (e.code) add(e.code, 'Code');
        return out;
    }

    const typeOk = (e, t) => TYPES.find(x => x.key === t).test(e);
    const topicOk = (e, t) => t === 'all' || e.tags.some(x => slug(x) === t);
    const queryOk = (e, q) => q.toLowerCase().split(/\s+/).filter(Boolean).every(tok => e._search.includes(tok));
    const shown = () => pub.entries.filter(e => typeOk(e, pub.type) && topicOk(e, pub.topic) && queryOk(e, pub.q));

    function rowHtml(e) {
        const st = status(e), venue = venueOf(e);
        const main = safeUrl(e.url) || safeUrl(doiUrl(e));
        const title = esc(BibTeX.displayText(e.title));
        const authors = e.authors.map(a => {
            const star = a.corresponding ? '<span class="ca" title="Corresponding author">*</span>' : '';
            return a.self ? `<strong>Andrea Ladiana${star}</strong>` : `${esc(a.name)}${star}`;
        }).join(', ');
        const tags = e.tags.map(t => `<button type="button" class="ptag f${familyOf(t)}${slug(t) === pub.topic ? ' on' : ''}" data-topic="${slug(t)}" aria-label="Show all papers about ${esc(t)}">${esc(t)}</button>`).join('');
        const links = linksOf(e).map(([u, l]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${l} ↗</a>`).join('')
            + `<button type="button" class="copy-bib" data-key="${esc(e.key)}">${icon('copy')} BibTeX</button>`;
        return `<li class="pub" id="pub-${esc(e.key)}" style="view-transition-name: p-${esc(e.key)}">
            <span class="yr">${esc(e.year)}</span>
            <div>
              <div class="pub-meta"><span class="status ${statusClass(st)}">${esc(st)}</span>${venue ? `<span class="venue">${esc(venue)}</span>` : ''}</div>
              <h3>${main ? `<a href="${esc(main)}" target="_blank" rel="noopener">${title}</a>` : title}</h3>
              <p class="au">${authors}</p>
              ${e.tldr ? `<p class="tldr">${esc(e.tldr)}</p>` : ''}
              ${e.abstract ? `<details class="abstract"><summary>Abstract</summary><p>${esc(BibTeX.displayText(e.abstract))}</p></details>` : ''}
              <div class="ptags">${tags}</div>
            </div>
            <div class="links">${links}</div>
          </li>`;
    }

    function renderChips() {
        const typeEl = $('#f-type'), topicEl = $('#f-topic');
        typeEl.innerHTML = TYPES.map(t => {
            const n = pub.entries.filter(e => t.test(e) && topicOk(e, pub.topic) && queryOk(e, pub.q)).length;
            return `<button type="button" class="fchip" data-type="${t.key}" aria-pressed="${pub.type === t.key}" ${n || t.key === pub.type ? '' : 'disabled'}>${t.label} <span class="ct">${n}</span></button>`;
        }).join('');
        const allN = pub.entries.filter(e => typeOk(e, pub.type) && queryOk(e, pub.q)).length;
        topicEl.innerHTML = `<button type="button" class="fchip" data-topic="all" aria-pressed="${pub.topic === 'all'}">All topics <span class="ct">${allN}</span></button>`
            + pub.topics.map(t => {
                const n = pub.entries.filter(e => typeOk(e, pub.type) && queryOk(e, pub.q) && e.tags.includes(t.name)).length;
                const on = pub.topic === t.slug;
                return `<button type="button" class="fchip f${t.fam}" data-topic="${t.slug}" aria-pressed="${on}" ${n || on ? '' : 'disabled'}><span class="dot"></span>${esc(t.name)} <span class="ct">${n}</span></button>`;
            }).join('');
    }

    function renderPubs(animate) {
        const list = shown();
        const apply = () => {
            listEl.innerHTML = list.length ? list.map(rowHtml).join('')
                : '<li class="pub-empty">No publications match these filters.</li>';
            renderChips();
            const filtered = pub.type !== 'all' || pub.topic !== 'all' || pub.q;
            $('#pub-summary').textContent = filtered ? `Showing ${list.length} of ${pub.entries.length}` : `${pub.entries.length} publications, newest first`;
            $('#pub-reset').hidden = !filtered;
            if (mapApi) mapApi.select(pub.topic);
        };
        if (animate && document.startViewTransition && !reduce()) document.startViewTransition(apply);
        else apply();
        syncUrl();
    }

    function syncUrl() {
        const u = new URL(location.href);
        [['type', pub.type, 'all'], ['topic', pub.topic, 'all'], ['q', pub.q, '']].forEach(([k, v, d]) => (v && v !== d ? u.searchParams.set(k, v) : u.searchParams.delete(k)));
        history.replaceState(null, '', u);
    }

    function setTopic(t, scroll) {
        pub.topic = pub.topic === t && t !== 'all' ? 'all' : t;
        renderPubs(true);
        if (scroll) $('#publications').scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth' });
    }

    function initPubControls() {
        $('#f-type').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) { pub.type = b.dataset.type; renderPubs(true); } });
        $('#f-topic').addEventListener('click', e => { const b = e.target.closest('[data-topic]'); if (b) { pub.topic = b.dataset.topic; renderPubs(true); } });
        listEl.addEventListener('click', e => {
            const tag = e.target.closest('.ptag');
            if (tag) { setTopic(tag.dataset.topic); return; }
            const cb = e.target.closest('.copy-bib');
            if (cb) copyBib(cb);
        });
        const q = $('#pub-q'), qx = $('#pub-q-x');
        let qt = 0;
        q.addEventListener('input', () => {
            qx.hidden = !q.value;
            clearTimeout(qt);
            qt = setTimeout(() => { pub.q = q.value.trim(); renderPubs(false); }, 140);
        });
        qx.addEventListener('click', () => { q.value = ''; qx.hidden = true; pub.q = ''; renderPubs(true); q.focus(); });
        $('#pub-reset').addEventListener('click', () => { pub.type = 'all'; pub.topic = 'all'; pub.q = ''; q.value = ''; qx.hidden = true; renderPubs(true); });
    }

    function copyBib(btn) {
        const e = pub.entries.find(x => x.key === btn.dataset.key);
        if (!e) return;
        const text = BibTeX.cleanEntry(e);
        const done = () => {
            const html = btn.innerHTML;
            btn.innerHTML = `${icon('check')} Copied`; btn.classList.add('copied');
            setTimeout(() => { btn.innerHTML = html; btn.classList.remove('copied'); }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
        else fallback(text, done);
    }
    function fallback(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { /* ignore */ }
        ta.remove();
    }

    /** Schema.org ScholarlyArticle list, built from the same bib file. */
    function injectJsonLd(entries) {
        const author = a => (a.self ? { '@type': 'Person', '@id': `${SITE_URL}#me`, name: 'Andrea Ladiana' } : { '@type': 'Person', name: a.name });
        const articles = entries.map(e => {
            const item = { '@type': 'ScholarlyArticle', headline: BibTeX.displayText(e.title), author: e.authors.map(author), datePublished: e.year };
            const url = safeUrl(e.url) || safeUrl(doiUrl(e));
            if (url) item.url = url;
            if (e.doi) item.sameAs = doiUrl(e);
            if (e.tags.length) item.keywords = e.tags.join(', ');
            const st = status(e);
            if (/^published$/i.test(st)) { const venue = BibTeX.displayText(e.journal || ''); if (venue) item.isPartOf = { '@type': 'Periodical', name: venue }; }
            else if (st) item.creativeWorkStatus = st;
            return item;
        });
        const el = document.createElement('script');
        el.type = 'application/ld+json';
        el.id = 'ld-publications';
        el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': articles }).replace(/</g, '\\u003c');
        document.head.appendChild(el);
    }

    function renderStats() {
        const coauthors = new Set();
        pub.entries.forEach(e => e.authors.forEach(a => { if (!a.self) coauthors.add(a.name.replace(/\W/g, '').toLowerCase()); }));
        const stats = [
            [pub.entries.length, 'papers'],
            [pub.entries.filter(TYPES[1].test).length, 'in journals'],
            [pub.entries.filter(e => e.isSelfCA).length, 'as corresponding author'],
            [coauthors.size, 'co-authors']
        ];
        const el = $('#pub-stats');
        el.innerHTML = stats.map(([n, l]) => `<div class="stat"><b data-n="${n}">${reduce() ? n : 0}</b><span>${l}</span></div>`).join('');
        if (reduce()) return;
        const io = new IntersectionObserver(es => {
            if (!es[0].isIntersecting) return;
            io.disconnect();
            const t0 = performance.now();
            const tick = now => {
                const k = Math.min(1, (now - t0) / 1100), ease = 1 - Math.pow(1 - k, 3);
                $$('b[data-n]', el).forEach(b => { b.textContent = Math.round(+b.dataset.n * ease); });
                if (k < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }, { threshold: 0.6 });
        io.observe(el);
    }

    (async function loadPublications() {
        initPubControls();
        try {
            const res = await fetchData('biblio.bib');
            pub.entries = BibTeX.parse(await res.text());
            pub.entries.forEach(e => {
                e.tags = (e.keywords || '').split(',').map(s => s.trim()).filter(Boolean);
                e._search = [BibTeX.displayText(e.title), e.authors.map(a => a.name).join(' '), BibTeX.displayText(e.journal || e.booktitle), e.year, e.tags.join(' '), e.note, e.tldr, BibTeX.displayText(e.abstract || '')].join(' ').toLowerCase();
            });
            const counts = new Map();
            pub.entries.forEach(e => e.tags.forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
            pub.topics = Array.from(counts, ([name, n]) => ({ name, n, slug: slug(name), fam: familyOf(name) }))
                .sort((a, b) => a.fam - b.fam || b.n - a.n || a.name.localeCompare(b.name));

            const p = new URLSearchParams(location.search);
            if (TYPES.some(t => t.key === p.get('type'))) pub.type = p.get('type');
            const tp = LEGACY_TOPICS[p.get('topic')] || p.get('topic');
            if (pub.topics.some(t => t.slug === tp)) pub.topic = tp;
            if (p.get('q')) { pub.q = p.get('q'); $('#pub-q').value = pub.q; $('#pub-q-x').hidden = false; }

            renderStats();
            renderPubs(false);
            const dl = $('#bib-download');
            if (window.Blob && URL.createObjectURL) dl.href = URL.createObjectURL(new Blob([BibTeX.cleanFile(pub.entries)], { type: 'text/plain;charset=utf-8' }));
            injectJsonLd(pub.entries);
            mapApi = researchMap(pub.entries, pub.topics);
            mapApi.select(pub.topic);
        } catch (err) {
            const local = err.message === 'file-protocol';
            if (!local) console.error('Could not load biblio.bib', err);
            listEl.innerHTML = `<li class="pub-empty">${local ? LOCAL_HINT : 'Could not load the publications list.'}</li>`;
        }
    })();

    /* ---------------------------------------------------------------- research map (force layout) */
    function researchMap(entries, topics) {
        const NS = 'http://www.w3.org/2000/svg';
        const box = $('#map'), svg = $('#map-svg'), tip = $('#map-tip');
        $('#families').innerHTML = FAMILIES.filter(f => topics.some(t => t.fam === f.n)).map(f => `<li class="f${f.n}">${f.name}</li>`).join('');

        const meas = document.createElement('canvas').getContext('2d');
        let W = 0, H = 0, nodes = [], edges = [], byId = new Map(), alpha = 0, raf = 0, drag = null, selected = 'all';

        // a small seeded generator keeps the layout the same on every visit
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

        function build() {
            W = box.clientWidth; H = box.clientHeight;
            if (W < 10) return;
            seed = 7;
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            svg.innerHTML = '';
            nodes = []; edges = []; byId = new Map();
            const small = W < 520;
            topics.forEach((t, i) => {
                // hubs are bigger and start near the centre; rare topics start on the rim
                const fs = (t.n >= 8 ? 15 : t.n >= 3 ? 13.5 : 12.5) - (small ? 1 : 0);
                meas.font = `${t.n >= 8 ? 600 : 500} ${fs}px Inter, system-ui, sans-serif`;
                const nw = meas.measureText(t.name).width, cw = String(t.n).length * 7;
                const ang = (i / topics.length) * Math.PI * 2 - Math.PI / 2, rr = t.n >= 5 ? 0.1 : 0.4;
                const n = { kind: 'tag', id: t.slug, t, fs, w: nw + cw + 30, h: Math.round(fs * 2), nw, cw, pull: 1 + t.n * 1.6,
                    x: W / 2 + Math.cos(ang) * W * rr, y: H / 2 + Math.sin(ang) * H * rr, vx: 0, vy: 0 };
                nodes.push(n); byId.set(n.id, n);
            });
            entries.forEach(e => {
                const n = { kind: 'paper', id: e.key, e, r: e.isSelfCA ? 6 : 5, w: 16, h: 16,
                    x: W / 2 + (rnd() - 0.5) * W * 0.3, y: H / 2 + (rnd() - 0.5) * H * 0.3, vx: 0, vy: 0 };
                nodes.push(n); byId.set(n.id, n);
                e.tags.forEach(t => edges.push({ s: n, t: byId.get(slug(t)) }));
            });
            edges = edges.filter(ed => ed.t);

            const gE = document.createElementNS(NS, 'g'), gN = document.createElementNS(NS, 'g');
            svg.append(gE, gN);
            edges.forEach(ed => {
                ed.el = document.createElementNS(NS, 'line');
                ed.el.setAttribute('class', `edge f${ed.t.t.fam}`);
                gE.appendChild(ed.el);
            });
            nodes.forEach(n => {
                const g = document.createElementNS(NS, 'g');
                g.setAttribute('tabindex', '0');
                g.setAttribute('role', 'button');
                if (n.kind === 'tag') {
                    g.setAttribute('class', `node tag f${n.t.fam}`);
                    g.setAttribute('aria-label', `${n.t.name}: ${n.t.n} paper${n.t.n > 1 ? 's' : ''}. Filter the publications.`);
                    g.innerHTML = `<rect x="${-n.w / 2}" y="${-n.h / 2}" width="${n.w}" height="${n.h}" rx="${n.h / 2}"/>`
                        + `<text x="${-n.w / 2 + 11 + n.nw / 2}" y="0.5" style="font-size:${n.fs}px;font-weight:${n.t.n >= 8 ? 600 : 500}">${esc(n.t.name)}</text>`
                        + `<text class="n" x="${n.w / 2 - 10 - n.cw / 2}" y="0.5">${n.t.n}</text>`;
                } else {
                    g.setAttribute('class', `node paper${n.e.isSelfCA ? ' ca' : ''}`);
                    g.setAttribute('aria-label', `${BibTeX.displayText(n.e.title)} (${n.e.year}). Go to the paper in the list.`);
                    g.innerHTML = `<circle r="${n.r}"/>`;
                }
                n.el = g;
                gN.appendChild(g);
                bind(n);
            });
            alpha = 1;
            for (let i = 0; i < 520; i++) tick();
            alpha = 0;
            draw();
            select(selected);
        }

        function tick() {
            const L = Math.max(60, Math.min(120, W * 0.18)), cx = W / 2, cy = H / 2, sz = Math.min(W, H) / 560;
            for (let i = 0; i < nodes.length; i++) {
                const a = nodes[i];
                for (let j = i + 1; j < nodes.length; j++) {
                    const b = nodes[j];
                    let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
                    if (d2 < 1) { dx = rnd() - 0.5; dy = rnd() - 0.5; d2 = 1; }
                    const k = (a.kind === 'tag' && b.kind === 'tag' ? 16000 : a.kind === 'tag' || b.kind === 'tag' ? 3200 : 1600) * sz * sz * alpha;
                    const d = Math.sqrt(d2), f = Math.min(k / d2, 30);
                    a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f;
                }
            }
            edges.forEach(({ s, t }) => {
                const dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy) || 1, f = (d - L) * 0.04 * alpha;
                s.vx += dx / d * f * 1.4; s.vy += dy / d * f * 1.4; t.vx -= dx / d * f * 0.6; t.vy -= dy / d * f * 0.6;
            });
            nodes.forEach(n => {
                const p = n.pull || 1;
                n.vx += (cx - n.x) * 0.0016 * p * alpha; n.vy += (cy - n.y) * 0.0024 * p * alpha;
                n.vx *= 0.58; n.vy *= 0.58;
                if (n === drag) return;
                n.x += n.vx; n.y += n.vy;
            });
            // rectangle collisions so labels never overlap
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i], b = nodes[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const ox = (a.w + b.w) / 2 + 6 - Math.abs(dx), oy = (a.h + b.h) / 2 + 6 - Math.abs(dy);
                    if (ox <= 0 || oy <= 0) continue;
                    const wa = a === drag ? 0 : b === drag ? 1 : 0.5, wb = 1 - wa;
                    if (ox < oy) { const s = Math.sign(dx) || 1; a.x -= s * ox * wa; b.x += s * ox * wb; }
                    else { const s = Math.sign(dy) || 1; a.y -= s * oy * wa; b.y += s * oy * wb; }
                }
            }
            nodes.forEach(n => {
                n.x = Math.max(n.w / 2 + 2, Math.min(W - n.w / 2 - 2, n.x));
                n.y = Math.max(n.h / 2 + 2, Math.min(H - n.h / 2 - 2, n.y));
            });
            alpha *= 0.99;
        }

        function draw() {
            edges.forEach(({ s, t, el }) => { el.setAttribute('x1', s.x.toFixed(1)); el.setAttribute('y1', s.y.toFixed(1)); el.setAttribute('x2', t.x.toFixed(1)); el.setAttribute('y2', t.y.toFixed(1)); });
            nodes.forEach(n => n.el.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`));
        }

        function loop() {
            raf = 0;
            for (let i = 0; i < 2; i++) tick();
            draw();
            if (drag || alpha > 0.01) raf = requestAnimationFrame(loop);
        }
        const heat = a => { alpha = Math.max(alpha, a); if (!raf && !reduce()) raf = requestAnimationFrame(loop); };

        function focus(n) {
            const on = new Set([n]);
            edges.forEach(ed => {
                const hot = ed.s === n || ed.t === n;
                ed.el.classList.toggle('hot', hot);
                if (hot) { on.add(ed.s); on.add(ed.t); }
            });
            nodes.forEach(m => m.el.classList.toggle('hot', on.has(m)));
            box.classList.add('focus');
            if (n.kind === 'paper') {
                tip.innerHTML = `${esc(BibTeX.displayText(n.e.title))}<small>${esc(n.e.year)} · ${esc(status(n.e))}</small>`;
                tip.style.left = Math.max(140, Math.min(W - 140, n.x)) + 'px';
                tip.style.top = n.y + 'px';
                tip.hidden = false;
            }
        }
        function blur() {
            box.classList.remove('focus');
            nodes.forEach(m => m.el.classList.remove('hot'));
            edges.forEach(ed => ed.el.classList.remove('hot'));
            tip.hidden = true;
        }
        function activate(n) {
            if (n.kind === 'tag') { setTopic(n.id, true); return; }
            const row = document.getElementById('pub-' + n.id) || (() => { pub.type = 'all'; pub.topic = 'all'; pub.q = ''; $('#pub-q').value = ''; renderPubs(false); return document.getElementById('pub-' + n.id); })();
            if (!row) return;
            row.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' });
            row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
        }

        function bind(n) {
            const el = n.el;
            let sx = 0, sy = 0, moved = false;
            el.addEventListener('pointerenter', () => { if (!drag) focus(n); });
            el.addEventListener('pointerleave', () => { if (!drag) blur(); });
            el.addEventListener('focus', () => focus(n));
            el.addEventListener('blur', blur);
            el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(n); } });
            el.addEventListener('pointerdown', e => {
                if (e.button !== 0) return;
                e.preventDefault();
                el.setPointerCapture(e.pointerId);
                drag = n; moved = false; sx = e.clientX; sy = e.clientY;
                focus(n);
            });
            el.addEventListener('pointermove', e => {
                if (drag !== n) return;
                if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return;
                moved = true;
                const r = svg.getBoundingClientRect();
                n.x = Math.max(n.w / 2, Math.min(W - n.w / 2, (e.clientX - r.left) * W / r.width));
                n.y = Math.max(n.h / 2, Math.min(H - n.h / 2, (e.clientY - r.top) * H / r.height));
                tip.hidden = true;
                heat(0.35);
                if (reduce()) { for (let i = 0; i < 30; i++) tick(); draw(); }
            });
            const end = () => {
                if (drag !== n) return;
                drag = null;
                if (!moved) activate(n);
                heat(0.25);
                blur();
            };
            el.addEventListener('pointerup', end);
            el.addEventListener('pointercancel', end);
        }

        function select(slugSel) {
            selected = slugSel;
            nodes.forEach(n => { if (n.kind === 'tag') n.el.classList.toggle('on', n.id === slugSel); });
        }

        build();
        let lw = box.clientWidth, rt = 0;
        new ResizeObserver(() => {
            if (Math.abs(box.clientWidth - lw) < 2) return;
            lw = box.clientWidth;
            clearTimeout(rt); rt = setTimeout(build, 150);
        }).observe(box);
        return { select };
    }

    /* ================================================================ CONFERENCES: a raster plot of meetings */
    (async function conferences() {
        const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const parse = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
        const DAY = 864e5;
        const raster = $('#raster'), list = $('#conf-list'), statusEl = $('#conf-status');
        let data;
        try {
            data = await (await fetchData('conferences.json')).json();
        } catch (err) {
            const local = err.message === 'file-protocol';
            if (!local) console.error('Could not load conferences.json', err);
            statusEl.innerHTML = local ? LOCAL_HINT : 'Could not load the conferences list.';
            return;
        }
        const ev = [
            ...(data.organized || []).map(c => ({ ...c, role: 'organized' })),
            ...(data.speaker || []).map(c => ({ ...c, role: 'speaker' }))
        ].filter(c => !isNaN(parse(c.start))).map((c, i) => ({ ...c, id: `conf-${i}`, t0: parse(c.start), t1: parse(c.end || c.start) }));
        if (!ev.length) return;

        const now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        const minT = Math.min(...ev.map(c => c.t0)), maxT = Math.max(today, ...ev.map(c => c.t1));
        const d0 = new Date(minT);
        let start = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1);
        start -= ((new Date(start).getUTCDay() + 6) % 7) * DAY;            // back to a Monday
        const dE = new Date(maxT);
        const end = Date.UTC(dE.getUTCFullYear(), dE.getUTCMonth() + 2, 0); // end of the following month
        const weeks = Math.ceil((end - start) / (7 * DAY));
        const week = t => Math.floor((t - start) / (7 * DAY));
        raster.style.setProperty('--cols', weeks);

        const fmt = c => {
            const a = new Date(c.t0), b = new Date(c.t1);
            const sameM = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
            const d = c.t0 === c.t1 ? `${a.getUTCDate()}` : `${a.getUTCDate()}–${b.getUTCDate()}`;
            const my = sameM ? `${MON[a.getUTCMonth()]} ${a.getUTCFullYear()}` : `${MON[a.getUTCMonth()]}–${MON[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
            return { d, my, long: `${d} ${my}` };
        };

        const lane = role => ev.filter(c => c.role === role).map(c => {
            const w0 = week(c.t0), w1 = week(c.t1), n = w1 - w0 + 1;
            return `<button type="button" class="spike ${c.role}" data-id="${c.id}" style="left:${(w0 / weeks) * 100}%;width:${(n / weeks) * 100}%" aria-label="${esc(c.title)}, ${fmt(c).long}">${'<i></i>'.repeat(n)}</button>`;
        }).join('');

        let axis = '';
        for (let y = new Date(start).getUTCFullYear(), m = new Date(start).getUTCMonth(); ; m++) {
            const t = Date.UTC(y, m, 1);
            if (t < start) continue;
            if (t > end) break;
            const dt = new Date(t), x = ((t - start) / (weeks * 7 * DAY)) * 100;
            if (x > 98) break;
            axis += `<span style="left:${x}%">${MON[dt.getUTCMonth()]}</span>`;
            if (dt.getUTCMonth() === 0 || !axis.includes('class="yr"')) axis += `<span class="yr" style="left:${x}%">${dt.getUTCFullYear()}</span>`;
        }
        const tf = (today - start) / (weeks * 7 * DAY);
        raster.innerHTML = `<span class="lane-name">Organizer</span><div class="lane">${lane('organized')}</div>`
            + `<span class="lane-name">Speaker</span><div class="lane">${lane('speaker')}</div>`
            + `<div class="axis">${axis}</div>`
            + `<div class="today" style="left:calc(96px + (100% - 96px) * ${tf.toFixed(4)})"><b>today</b></div>`;

        // on narrow screens the raster scrolls sideways: start with the latest events in view
        const scroller = raster.parentElement;
        if (scroller.scrollWidth > scroller.clientWidth) {
            const lastF = (Math.max(...ev.map(c => c.t1)) - start) / (weeks * 7 * DAY);
            scroller.scrollLeft = Math.max(0, 96 + (raster.clientWidth - 96) * lastF - scroller.clientWidth * 0.62);
        }

        const upcoming = ev.filter(c => c.t1 >= today).sort((a, b) => a.t0 - b.t0);
        const past = ev.filter(c => c.t1 < today).sort((a, b) => b.t0 - a.t0);
        const nOrg = ev.filter(c => c.role === 'organized').length, nSp = ev.length - nOrg;
        statusEl.textContent = upcoming.length
            ? `${upcoming.length} upcoming · ${past.length} past`
            : `Nothing on the calendar right now. ${nOrg} organized, ${nSp} as a speaker since ${MON[new Date(minT).getUTCMonth()]} ${new Date(minT).getUTCFullYear()}.`;

        list.innerHTML = [...upcoming, ...past].map(c => {
            const f = fmt(c), url = safeUrl(c.url);
            const title = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(c.title)} ${icon('ext')}</a>` : esc(c.title);
            return `<article class="conf ${c.role} reveal" id="${c.id}" data-id="${c.id}">
                <div class="when"><span class="d">${f.d}</span><span class="my">${f.my}</span></div>
                <span class="role-pill">${c.role === 'organized' ? 'Organizer' : 'Speaker'}${c.t1 >= today ? ' · upcoming' : ''}</span>
                <h3>${title}</h3>
                <p class="loc">${icon('pin')}<span>${esc(c.location)}</span></p>
                <p class="desc">${esc(c.description)}</p>
              </article>`;
        }).join('');
        observeReveal(list);

        const hot = (id, on) => $$(`[data-id="${id}"]`).forEach(el => el.classList.toggle('hot', on));
        [raster, list].forEach(scope => {
            scope.addEventListener('pointerover', e => { const el = e.target.closest('[data-id]'); if (el) hot(el.dataset.id, true); });
            scope.addEventListener('pointerout', e => { const el = e.target.closest('[data-id]'); if (el) hot(el.dataset.id, false); });
            scope.addEventListener('focusin', e => { const el = e.target.closest('[data-id]'); if (el) hot(el.dataset.id, true); });
            scope.addEventListener('focusout', e => { const el = e.target.closest('[data-id]'); if (el) hot(el.dataset.id, false); });
        });
        raster.addEventListener('click', e => {
            const s = e.target.closest('.spike');
            if (!s) return;
            const card = document.getElementById(s.dataset.id);
            card.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' });
            hot(s.dataset.id, true);
            setTimeout(() => hot(s.dataset.id, false), 1600);
        });
    })();

    /* ================================================================ OTHER INTERESTS: one origami vertex */
    (function fold() {
        const svg = $('#fold-svg'), fig = svg.closest('.fold-fig');
        const verdictEl = $('#fold-verdict'), rulesEl = $('#fold-rules');
        const DEFAULT = { angles: [60, 100, 120, 80], mv: ['M', 'V', 'M', 'M'], rot: -112 };
        let st = JSON.parse(JSON.stringify(DEFAULT));
        const S = 112, rad = d => (d * Math.PI) / 180;
        const pt = (deg, r) => [Math.cos(rad(deg)) * r, Math.sin(rad(deg)) * r];
        const edge = deg => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return S / Math.max(Math.abs(c), Math.abs(s)); };

        function draw() {
            const dirs = st.angles.reduce((acc, a, i) => (acc.push(i ? acc[i - 1] + st.angles[i - 1] : st.rot), acc), []);
            const min = Math.min(...st.angles);
            let html = `<rect class="sheet" x="${-S}" y="${-S}" width="${2 * S}" height="${2 * S}" rx="3"/>`;
            st.angles.forEach((a, k) => {
                const from = dirs[k], to = from + a, r = 30;
                const [x0, y0] = pt(from, r), [x1, y1] = pt(to, r), [lx, ly] = pt(from + a / 2, 50);
                html += `<path class="sector-arc" d="M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}"/>`;
                html += `<text class="sector-lab${a === min ? ' min' : ''}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${a}°</text>`;
            });
            dirs.forEach((d, k) => {
                const L = edge(d), [x, y] = pt(d, L), [tx, ty] = pt(d, Math.min(L, S) * 0.74);
                const kind = st.mv[k] === 'M' ? 'mountain' : 'valley';
                html += `<g class="crease ${st.mv[k]}" data-k="${k}" tabindex="0" role="button" aria-label="Crease ${k + 1}: ${kind}. Activate to switch.">
                    <line class="hit" x1="0" y1="0" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>
                    <line class="ln" x1="0" y1="0" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>
                    <circle class="tagc" cx="${tx.toFixed(2)}" cy="${ty.toFixed(2)}" r="10"/>
                    <text class="tagt" x="${tx.toFixed(2)}" y="${(ty + 0.5).toFixed(2)}">${st.mv[k]}</text></g>`;
            });
            html += '<circle class="vertex" r="3.4"/>';
            svg.innerHTML = html;
            judge();
        }

        function judge() {
            const M = st.mv.filter(x => x === 'M').length, V = 4 - M;
            const maekawa = Math.abs(M - V) === 2;
            const min = Math.min(...st.angles), idx = st.angles.indexOf(min);
            const unique = st.angles.filter(a => a === min).length === 1;
            const a = st.mv[idx], b = st.mv[(idx + 1) % 4];
            const blb = !unique || a !== b;
            const ok = maekawa && blb;
            fig.classList.toggle('ok', ok);
            fig.classList.toggle('bad', !ok);
            verdictEl.textContent = ok ? 'It folds flat.'
                : !maekawa ? `It can't fold flat: M − V = ${M - V}.`
                : `Still no: the ${min}° sector needs a mountain and a valley.`;
            const [p, q, r, s] = st.angles;
            rulesEl.innerHTML = `<span class="${maekawa ? 'y' : 'n'}">${maekawa ? '✓' : '✗'} Maekawa</span> M − V = ${M - V}<br>`
                + `<span class="y">✓ Kawasaki</span> ${p}° + ${r}° = ${q}° + ${s}° = 180°<br>`
                + `<span class="${blb ? 'y' : 'n'}">${blb ? '✓' : '✗'} smallest angle</span> ${min}° between ${a} and ${b}`;
        }

        svg.addEventListener('click', e => {
            const g = e.target.closest('.crease');
            if (!g) return;
            const k = +g.dataset.k;
            st.mv[k] = st.mv[k] === 'M' ? 'V' : 'M';
            draw();
            svg.querySelector(`.crease[data-k="${k}"]`).focus({ preventScroll: true });
        });
        svg.addEventListener('keydown', e => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.crease')) { e.preventDefault(); e.target.closest('.crease').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
        });
        $('#fold-new').addEventListener('click', () => {
            const pick = () => 35 + 5 * Math.floor(Math.random() * 23);   // 35°…145°
            let a1, a2;
            do { a1 = pick(); a2 = pick(); } while (a1 === 90 || a2 === 90 || a1 === a2 || a1 + a2 === 180);
            st.angles = [a1, a2, 180 - a1, 180 - a2];
            st.rot = -90 - 15 * Math.floor(Math.random() * 6);
            const order = [['M', 'M', 'M', 'V'], ['M', 'V', 'V', 'V'], ['M', 'M', 'V', 'V'], ['M', 'V', 'M', 'V']][Math.floor(Math.random() * 4)];
            st.mv = order.slice().sort(() => Math.random() - 0.5);
            draw();
        });
        $('#fold-reset').addEventListener('click', () => { st = JSON.parse(JSON.stringify(DEFAULT)); draw(); });
        draw();
    })();

    /* ================================================================ SZILÁRD: a network that recalls Roman numerals */
    (function szilard() {
        const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        const canvas = $('#numeral-net'), items = $$('#commandments li');
        const fitText = str => (g, W, H) => {
            const fam = 'Georgia, "Times New Roman", "Noto Serif", serif';   // serifs make I, II, III read as numerals
            g.font = `700 100px ${fam}`;
            let m = g.measureText(str);
            const k = Math.min(0.9 * W / m.width, 0.8 * H / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent));
            g.font = `700 ${100 * k}px ${fam}`;
            m = g.measureText(str);
            g.textAlign = 'center';
            g.fillStyle = '#000';
            g.fillText(str, W / 2, H / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
        };
        const fonts = document.fonts ? document.fonts.load('800 100px Inter').catch(() => {}) : Promise.resolve();
        fonts.then(() => {
            const net = DotNet.create({
                canvas,
                align: 'element',
                cell: () => (window.innerWidth < 860 ? 6 : 10),
                pictures: ROMAN.map(r => ({ name: r, draw: fitText(r) })),
                drawBase: true,
                alwaysOn: true,
                T0: 0.22,
                radius: 0.42,
                baseRadius: 0.09
            });
            recolorers.push(() => net.recolor());
            let active = -1;
            const setActive = k => {
                if (k === active) return;
                active = k;
                items.forEach((li, i) => li.classList.toggle('on', i === k));
                net.cue(Math.max(0, k));
            };
            new ResizeObserver(() => { if (!net.ready) { if (net.init(true)) active = 0; } else net.relayout(); }).observe(canvas);
            const io = new IntersectionObserver(es => {
                es.forEach(e => { if (e.isIntersecting) setActive(items.indexOf(e.target)); });
            }, { rootMargin: '-38% 0px -58% 0px' });
            items.forEach(li => io.observe(li));
        });
    })();

    /* ================================================================ interactive-paper previews */
    if (window.Minis) recolorers.push(window.Minis.init());
})();

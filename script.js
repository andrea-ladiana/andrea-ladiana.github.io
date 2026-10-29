'use strict';

/*
 * Data lives in biblio.bib and conferences.json (nothing is duplicated here).
 * Browsers block fetch() on file://, so preview locally with a tiny server:  python -m http.server
 */

const SITE_URL = 'https://andrea-ladiana.github.io/';
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Helpers ---------- */

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

/** Only allow http(s) links in generated markup. */
function safeUrl(url) {
    return /^https?:\/\//i.test(url || '') ? url : '';
}

async function fetchText(path) {
    if (window.location.protocol === 'file:') throw new Error('file-protocol');
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
}

const LOCAL_PREVIEW_HINT = 'Open the site through a local web server (e.g. <code>python -m http.server</code>) to load this section.';

/* ---------- Reveal on scroll (classes, so hover transforms keep working) ---------- */

(function initReveal() {
    const cards = document.querySelectorAll('.glass-card');
    if (!('IntersectionObserver' in window)) {
        cards.forEach(card => card.classList.add('is-visible'));
        return;
    }
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    cards.forEach(card => observer.observe(card));
})();

/* ---------- Navigation: height variable, dropdown, scrollspy, back-to-top ---------- */

const navEl = document.querySelector('.top-nav');

(function initNavMetrics() {
    if (!navEl) return;
    const update = () => document.documentElement.style.setProperty('--nav-h', `${navEl.offsetHeight}px`);
    update();
    window.addEventListener('resize', update, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(navEl);
})();

(function initProjectsDropdown() {
    const dropdown = document.getElementById('projects-dropdown');
    const btn = document.getElementById('projects-dropdown-btn');
    if (!dropdown || !btn) return;

    const close = () => {
        dropdown.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('active');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', e => {
        if (!dropdown.contains(e.target)) close();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && dropdown.classList.contains('active')) {
            close();
            btn.focus();
        }
    });
})();

(function initScrollspy() {
    const navLinks = document.querySelectorAll('.top-nav a[href^="#"]');
    if (!navLinks.length) return;

    const sections = Array.from(navLinks)
        .map(link => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    function onScroll() {
        const navHeight = navEl ? navEl.offsetHeight : 0;
        const scrollPos = window.scrollY + navHeight + 80;
        let currentId = null;

        for (let i = sections.length - 1; i >= 0; i--) {
            if (sections[i].offsetTop <= scrollPos) {
                currentId = sections[i].id;
                break;
            }
        }

        navLinks.forEach(link => {
            link.classList.toggle('active', !!currentId && link.getAttribute('href') === `#${currentId}`);
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();

(function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 350);
    }, { passive: true });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
})();

/* ---------- Conferences ---------- */

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });

function parseIsoDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

/** "19–20 January 2026", "28 April – 2 May 2026", "20 September 2025". */
function formatDateRange(startIso, endIso) {
    const start = parseIsoDate(startIso);
    const end = parseIsoDate(endIso || startIso);
    if (!start || !end) return '';

    const d = date => date.getUTCDate();
    const m = date => MONTH_FORMAT.format(date);
    const y = date => date.getUTCFullYear();

    if (+start === +end) return `${d(start)} ${m(start)} ${y(start)}`;
    if (y(start) !== y(end)) return `${d(start)} ${m(start)} ${y(start)} – ${d(end)} ${m(end)} ${y(end)}`;
    if (m(start) !== m(end)) return `${d(start)} ${m(start)} – ${d(end)} ${m(end)} ${y(end)}`;
    return `${d(start)}–${d(end)} ${m(start)} ${y(start)}`;
}

const todayIso = () => new Date().toLocaleDateString('en-CA'); // local date as YYYY-MM-DD

function renderConference(conf) {
    const title = esc(conf.title);
    const url = safeUrl(conf.url);
    const titleHtml = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${title}</a>` : title;
    return `
        <div class="conference-item">
            <h3>${titleHtml}</h3>
            <p class="conf-meta">
                ${icon('calendar')} ${esc(formatDateRange(conf.start, conf.end))}<br>
                ${icon('map-pin')} ${esc(conf.location)}
            </p>
            <p class="conf-desc">${esc(conf.description)}</p>
        </div>`;
}

function renderConferenceTimeline({ data, upcomingListId, pastDetailsId, pastListId }) {
    const upcomingList = document.getElementById(upcomingListId);
    const pastDetails = document.getElementById(pastDetailsId);
    const pastList = document.getElementById(pastListId);
    if (!upcomingList || !pastDetails || !pastList) return;

    const today = todayIso();
    const conferences = (Array.isArray(data) ? data : []).filter(c => c && parseIsoDate(c.start));
    const endOf = c => c.end || c.start;

    const upcoming = conferences.filter(c => endOf(c) >= today).sort((a, b) => a.start.localeCompare(b.start));
    const past = conferences.filter(c => endOf(c) < today).sort((a, b) => b.start.localeCompare(a.start));

    upcomingList.innerHTML = upcoming.length
        ? upcoming.map(renderConference).join('')
        : '<p class="empty-note">No upcoming events at the moment.</p>';
    pastList.innerHTML = past.map(renderConference).join('');

    pastDetails.hidden = past.length === 0;
    // With nothing upcoming, show the most recent events straight away instead of an empty block.
    pastDetails.open = upcoming.length === 0 && past.length > 0;
}

(async function loadConferences() {
    const upcomingContainer = document.getElementById('conferences-list');
    if (!upcomingContainer) return;

    try {
        const json = JSON.parse(await fetchText('conferences.json'));
        renderConferenceTimeline({
            data: json.organized,
            upcomingListId: 'conferences-list',
            pastDetailsId: 'past-conferences',
            pastListId: 'past-conferences-list'
        });
        renderConferenceTimeline({
            data: json.speaker,
            upcomingListId: 'speaker-conferences-list',
            pastDetailsId: 'past-speaker-conferences',
            pastListId: 'past-speaker-conferences-list'
        });
    } catch (error) {
        const local = error.message === 'file-protocol';
        if (!local) console.error('Could not load conferences.json', error);
        upcomingContainer.innerHTML = `<p class="empty-note">${local ? LOCAL_PREVIEW_HINT : 'Could not load the conferences list.'}</p>`;
    }
})();

/* ---------- Publications ---------- */

const TYPE_RULES = {
    all: () => true,
    journal: e => e.type === 'article' && /published/i.test(e.note || ''),
    submitted: e => /submitted|arxiv/i.test(e.note || ''),
    conference: e => e.type === 'inproceedings' || /workshop/i.test(e.note || ''),
    ca: e => e.isSelfCA
};

const TOPIC_RULES = {
    all: () => true,
    associative: e => /associative/i.test(e.keywords || '') || /associative|hopfield|dlam/i.test(e.title || ''),
    statmech: e => /statistical mechanics/i.test(e.keywords || '') || /statistical-mechanical|ising|spin|thermodynamic/i.test(e.title || ''),
    federated: e => /federated/i.test(e.keywords || '') || /federated|feddqkl/i.test(e.title || ''),
    graphs: e => /graph|fractal/i.test(e.keywords || '') || /laplacian|lattice/i.test(e.title || '')
};

const pubState = { entries: [], type: 'all', topic: 'all', q: '' };

function matchesFilters(entry, { type, topic, q }) {
    if (!TYPE_RULES[type](entry) || !TOPIC_RULES[topic](entry)) return false;
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.every(token => entry._search.includes(token));
}

function buildSearchIndex(entry) {
    entry._search = [
        BibTeX.displayText(entry.title),
        entry.authors.map(a => a.name).join(' '),
        BibTeX.displayText(entry.journal || entry.booktitle),
        entry.year, entry.keywords, entry.note, entry.tldr, BibTeX.displayText(entry.abstract)
    ].join(' ').toLowerCase();
}

function doiUrl(entry) {
    if (!entry.doi) return '';
    return /^https?:\/\//i.test(entry.doi) ? entry.doi : `https://doi.org/${entry.doi}`;
}

function linkLabel(url) {
    if (/arxiv\.org/i.test(url)) return 'arXiv';
    if (/openreview\.net/i.test(url)) return 'OpenReview';
    if (/sciencedirect\.com/i.test(url)) return 'ScienceDirect';
    if (/iopscience\.iop\.org/i.test(url)) return 'IOPscience';
    if (/doi\.org/i.test(url)) return 'DOI';
    return 'Link';
}

function renderAuthors(entry) {
    if (!entry.authors.length) return 'Unknown Author';
    return entry.authors.map(author => {
        const star = author.corresponding ? '<span class="ca-star" title="Corresponding Author">*</span>' : '';
        return author.self
            ? `<strong class="author-self">Andrea Ladiana${star}</strong>`
            : `${esc(author.name)}${star}`;
    }).join(', ');
}

function renderPublication(entry) {
    const title = esc(BibTeX.displayText(entry.title) || 'Untitled');
    const venue = esc(BibTeX.displayText(entry.journal || entry.booktitle));
    const year = esc(entry.year);
    const mainLink = safeUrl(entry.url) || safeUrl(doiUrl(entry));

    const typeLabel = entry.type === 'article' ? 'Journal'
        : entry.type === 'inproceedings' ? 'Conference'
            : entry.type.charAt(0).toUpperCase() + entry.type.slice(1);

    const badges = [`<span class="pub-badge">${esc(typeLabel)}</span>`];
    if (year) badges.push(`<span class="pub-badge">${year}</span>`);
    if (entry.isSelfCA) {
        badges.push(`<span class="pub-badge ca-badge" title="Andrea Ladiana is Corresponding Author">${icon('mail')} Corresponding Author</span>`);
    }
    if (entry.note) {
        badges.push(`<span class="pub-badge pub-badge-status">${esc(entry.note.replace(/^\[|\]$/g, '').trim())}</span>`);
    }
    (entry.keywords || '').split(',').map(k => k.trim()).filter(Boolean).forEach(keyword => {
        badges.push(`<span class="pub-badge pub-badge-topic">${esc(keyword)}</span>`);
    });

    // Links: publisher/preprint URL, arXiv, DOI (each URL once)
    const seen = new Set();
    const links = [];
    const addLink = (url, label) => {
        const safe = safeUrl(url);
        if (!safe || seen.has(safe)) return;
        seen.add(safe);
        links.push(`<a href="${esc(safe)}" target="_blank" rel="noopener">[${label || linkLabel(safe)}]</a>`);
    };
    addLink(entry.url);
    if (entry.eprint) addLink(/^https?:/.test(entry.eprint) ? entry.eprint : `https://arxiv.org/abs/${entry.eprint}`, 'arXiv');
    addLink(doiUrl(entry), 'DOI');

    const tldr = entry.tldr ? `<p class="pub-tldr">${esc(entry.tldr)}</p>` : '';
    const abstract = entry.abstract
        ? `<details class="pub-abstract"><summary>Abstract</summary><p>${esc(BibTeX.displayText(entry.abstract))}</p></details>`
        : '';

    return `
        <article class="publication-item">
            ${mainLink
            ? `<a href="${esc(mainLink)}" target="_blank" rel="noopener" class="pub-title">${title}</a>`
            : `<span class="pub-title">${title}</span>`}
            <p class="pub-authors">${renderAuthors(entry)}</p>
            ${venue ? `<p class="pub-journal">${venue}${year ? ', ' + year : ''}</p>` : ''}
            ${tldr}
            <div class="pub-meta-badges">${badges.join('')}</div>
            ${abstract}
            <div class="pub-actions">
                ${links.length ? `<div class="pub-links">${links.join(' ')}</div>` : ''}
                <button type="button" class="pub-btn-bibtex" data-key="${esc(entry.key)}" title="Copy BibTeX citation">${icon('copy')} BibTeX</button>
            </div>
        </article>`;
}

function renderPublicationList() {
    const container = document.getElementById('bibtex-container');
    const filtered = pubState.entries.filter(e => matchesFilters(e, pubState));

    updatePublicationUi(filtered.length);

    if (!filtered.length) {
        container.innerHTML = `<div class="pub-empty-msg">${icon('search')} No publications match your search.</div>`;
        return;
    }

    const groups = new Map();
    filtered.forEach(entry => {
        const key = entry.year || 'Undated';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
    });

    container.innerHTML = Array.from(groups, ([year, items]) => `
        <div class="pub-year-group">
            <h3 class="pub-year">${esc(year)} <span class="pub-year-count">${items.length}</span></h3>
            ${items.map(renderPublication).join('')}
        </div>`).join('');
}

function updatePublicationUi(shownCount) {
    const total = pubState.entries.length;
    const filtersActive = pubState.type !== 'all' || pubState.topic !== 'all' || pubState.q.trim() !== '';

    document.querySelectorAll('[data-filter-type]').forEach(btn => {
        const value = btn.dataset.filterType;
        const active = value === pubState.type;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
        const count = pubState.entries.filter(e => matchesFilters(e, { ...pubState, type: value })).length;
        const countEl = btn.querySelector('.pub-count');
        if (countEl) countEl.textContent = count;
        btn.classList.toggle('is-empty', count === 0);
    });

    document.querySelectorAll('[data-filter-topic]').forEach(btn => {
        const value = btn.dataset.filterTopic;
        const active = value === pubState.topic;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
        const count = pubState.entries.filter(e => matchesFilters(e, { ...pubState, topic: value })).length;
        const countEl = btn.querySelector('.pub-count');
        if (countEl) countEl.textContent = count;
        btn.classList.toggle('is-empty', count === 0);
    });

    const summary = document.getElementById('pub-summary');
    if (summary) {
        summary.textContent = filtersActive
            ? `Showing ${shownCount} of ${total} publications`
            : `${total} publications`;
    }
    const reset = document.getElementById('pub-reset');
    if (reset) reset.hidden = !filtersActive;
    const clear = document.getElementById('pub-search-clear');
    if (clear) clear.hidden = pubState.q === '';

    syncFiltersToUrl();
}

/** Keep filters in the address bar (?type=ca&topic=statmech&q=hopfield) so a filtered view can be shared. */
function syncFiltersToUrl() {
    const params = new URLSearchParams();
    if (pubState.type !== 'all') params.set('type', pubState.type);
    if (pubState.topic !== 'all') params.set('topic', pubState.topic);
    if (pubState.q.trim()) params.set('q', pubState.q.trim());
    const query = params.toString();
    try {
        history.replaceState(null, '', `${location.pathname}${query ? '?' + query : ''}${location.hash}`);
    } catch (e) { /* replaceState can throw on file:// */ }
}

function readFiltersFromUrl() {
    const params = new URLSearchParams(location.search);
    const type = params.get('type');
    const topic = params.get('topic');
    if (type && TYPE_RULES[type]) pubState.type = type;
    if (topic && TOPIC_RULES[topic]) pubState.topic = topic;
    pubState.q = params.get('q') || '';
    const input = document.getElementById('pub-search');
    if (input) input.value = pubState.q;
}

function initPublicationControls() {
    const wrap = document.querySelector('.pub-filters-wrap');
    const input = document.getElementById('pub-search');
    if (!wrap || !input) return;

    wrap.addEventListener('click', e => {
        const typeBtn = e.target.closest('[data-filter-type]');
        const topicBtn = e.target.closest('[data-filter-topic]');
        if (typeBtn) pubState.type = typeBtn.dataset.filterType;
        else if (topicBtn) pubState.topic = topicBtn.dataset.filterTopic;
        else return;
        renderPublicationList();
    });

    let timer = 0;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            pubState.q = input.value;
            renderPublicationList();
        }, 120);
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Escape' && input.value) {
            input.value = '';
            pubState.q = '';
            renderPublicationList();
        }
    });

    document.getElementById('pub-search-clear').addEventListener('click', () => {
        input.value = '';
        pubState.q = '';
        renderPublicationList();
        input.focus();
    });

    document.getElementById('pub-reset').addEventListener('click', () => {
        Object.assign(pubState, { type: 'all', topic: 'all', q: '' });
        input.value = '';
        renderPublicationList();
    });
}

/* ---------- BibTeX copy / download ---------- */

function copyBibTeX(key, button) {
    const entry = pubState.entries.find(e => e.key === key);
    if (!entry) return;

    const text = BibTeX.cleanEntry(entry);
    const originalHtml = button.innerHTML;
    const feedback = () => {
        button.innerHTML = `${icon('check')} Copied!`;
        button.classList.add('copied');
        setTimeout(() => {
            button.innerHTML = originalHtml;
            button.classList.remove('copied');
        }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(feedback).catch(() => fallbackCopyText(text, feedback));
    } else {
        fallbackCopyText(text, feedback);
    }
}

function fallbackCopyText(text, callback) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        callback();
    } catch (e) {
        console.error('Copy failed:', e);
    }
    document.body.removeChild(textarea);
}

document.addEventListener('click', e => {
    const btn = e.target.closest('.pub-btn-bibtex');
    if (btn) copyBibTeX(btn.dataset.key, btn);
});

/** Point the "download .bib" button at a cleaned file (no *, status notes, URL-style DOIs). */
function setupBibDownload(entries) {
    const link = document.getElementById('bib-download');
    if (!link || !window.Blob || !window.URL || !URL.createObjectURL) return;
    link.href = URL.createObjectURL(new Blob([BibTeX.cleanFile(entries)], { type: 'text/plain;charset=utf-8' }));
}

/* ---------- Structured data (JSON-LD) built from the same bib file ---------- */

function injectPublicationsJsonLd(entries) {
    const author = a => (a.self
        ? { '@type': 'Person', '@id': `${SITE_URL}#me`, name: 'Andrea Ladiana' }
        : { '@type': 'Person', name: a.name });

    const articles = entries.map(entry => {
        const item = {
            '@type': 'ScholarlyArticle',
            headline: BibTeX.displayText(entry.title),
            author: entry.authors.map(author),
            datePublished: entry.year
        };
        const url = safeUrl(entry.url) || safeUrl(doiUrl(entry));
        if (url) item.url = url;
        if (entry.doi) item.sameAs = doiUrl(entry);

        const status = (entry.note || '').replace(/^\[|\]$/g, '').trim();
        if (/^published$/i.test(status)) {
            const venue = BibTeX.displayText(entry.journal);
            if (venue) item.isPartOf = { '@type': 'Periodical', name: venue };
        } else if (status) {
            item.creativeWorkStatus = status;
        }
        return item;
    });

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'ld-publications';
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': articles }).replace(/</g, '\\u003c');
    document.head.appendChild(script);
}

/* ---------- Load publications ---------- */

(async function loadPublications() {
    const container = document.getElementById('bibtex-container');
    if (!container) return;

    initPublicationControls();

    try {
        const text = await fetchText('biblio.bib');
        pubState.entries = BibTeX.parse(text);
        pubState.entries.forEach(buildSearchIndex);
        readFiltersFromUrl();
        renderPublicationList();
        setupBibDownload(pubState.entries);
        injectPublicationsJsonLd(pubState.entries);
    } catch (error) {
        const local = error.message === 'file-protocol';
        if (!local) console.error('Error loading publications:', error);
        container.innerHTML = `<div class="pub-empty-msg">${icon('alert')} <span>${local ? LOCAL_PREVIEW_HINT : 'Could not load publications.'}</span></div>`;
    }
})();

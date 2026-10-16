// Embedded Data to avoid CORS issues on local file system
const CONFERENCES_DATA = [
    {
        "title": "The Role of Data Science: From Statistical to Quantum and Relative Mechanics",
        "url": "https://sites.google.com/uniroma1.it/ecc-ds4-workshop2025/home-page",
        "date": "19-20 January 2026",
        "location": "Sapienza Università di Roma, Department of Mathematics \"G. Castelnuovo\", Aula Picone",
        "description": "A conference in memory of Francesco Guerra."
    },
    {
        "title": "4th Workshop of UMI Group: Mathematics for Artificial Intelligence and Machine Learning",
        "url": "https://sites.google.com/uniroma1.it/umiworkshop2025/math4aiml-umi-workshop",
        "date": "21-23 January 2026",
        "location": "Sapienza Università di Roma, Department of Mathematics \"G. Castelnuovo\"",
        "description": "Focusing on the interplay between mathematics, artificial intelligence, and machine learning."
    },
    {
        "title": "Intelligenza Artificiale: il futuro è già qui",
        "date": "20 September 2025",
        "location": "Centro Congressi di Ecotekne, Università del Salento, Lecce, Italy",
        "description": "Dialogue on how artificial intelligence is transforming the future, featuring Prof. Pierluigi Contucci, Prof. Marc Mézard, and Prof. Giorgio Parisi."
    }
];

// Conferences where you are invited as a speaker (same schema as CONFERENCES_DATA)
const SPEAKER_CONFERENCES_DATA = [
    {
        "title": "ICLR 2026",
        "url": "https://iclr.cc/",
        "date": "23-27 April 2026",
        "location": "Riocentro Convention and Event Center, Rio de Janeiro, Brazil",
        "description": "The International Conference on Learning Representations (ICLR) is the premier gathering of professionals dedicated to the advancement of the branch of artificial intelligence called representation learning, but generally referred to as deep learning."
    },
    {
        "title": "Deep Patterns",
        "url": "https://www.eurandom.tue.nl/event/deep-patterns/",
        "date": "18-22 May 2026",
        "location": "Eurandom, Metaforum, 4th floor, Eindhoven, Netherlands",
        "description": "Workshop bringing together researchers on pattern formation and pattern recognition at the intersection of Applied Mathematics and Theoretical Physics."
    }
];

/*
Temporarily hidden (finding new venue after PNAS rejection):
@article{ladiana2026origami,
  title = {Geometric spin glasses: origami flat-foldability as a deterministic frustrated spin model},
  author = {Andrea Ladiana*},
  journal = {submitted to Proceedings of the National Academy of Sciences (PNAS)},
  year = {2026},
  note = {[Submitted]}
}
*/

const BIBTEX_DATA = `
@article{rollo2026feddqkl,
  title = {FedDQKL: A Federated Learning aggregation method with Data-Quality-driven client weighting and Kullback-Leibler-based calibration},
  author = {Davide Rollo and Mattia Cotardo and Andrea Ladiana and Andrea Lepre and Teodoro Montanaro and Fabrizio Durante and Elisabetta Mangino and Luigi Patrono*},
  journal = {submitted to Array},
  year = {2026},
  keywords = {Federated Learning, Machine Learning},
  note = {[Submitted]}
}

@article{ladiana2026berker,
  title = {The Exact Laplacian Spectrum of the Berker--Ostlund Diamond Lattice},
  author = {Andrea Ladiana*},
  journal = {Journal of Physics A: Mathematical and Theoretical},
  year = {2026},
  doi = {https://doi.org/10.1088/1751-8121/aea3c9},
  url = {https://iopscience.iop.org/article/10.1088/1751-8121/aea3c9},
  keywords = {Graph Theory, Mathematical Physics},
  note = {[Published]}
}

@article{albanese2026semisupervised,
  title = {Semi-supervised Hopfield model: Theoretical and Numerical results},
  author = {Linda Albanese and Andrea Ladiana and Andrea Lepre*},
  journal = {Physica A: Statistical Mechanics and its Applications},
  pages = {132009},
  year = {2026},
  issn = {0378-4371},
  doi = {https://doi.org/10.1016/j.physa.2026.132009},
  url = {https://www.sciencedirect.com/science/article/pii/S0378437126007454},
  eprint = {https://arxiv.org/abs/2607.28173},
  keywords = {Associative Networks, Statistical Mechanics},
  note = {[Published]}
}

@article{alessandrelli2026federated,
  title = {A Federated Many-to-One Hopfield model for associative Neural Networks},
  author = {Andrea Alessandrelli* and Fabrizio Durante and Andrea Ladiana and Andrea Lepre},
  journal = {submitted to Neural Networks},
  year = {2026},
  url = {https://arxiv.org/abs/2603.19902},
  keywords = {Associative Networks, Federated Learning},
  note = {[Submitted]}
}

@article{barra2027dreaming,
  title = {Do Hopfield Networks Dream of Stored Patterns? A Statistical-Mechanical Theory of Dreaming in Multidirectional Associative Memories},
  author = {Adriano Barra and Fabrizio Durante and Andrea Ladiana* and Michela Marra Solazzo},
  journal = {Neural Networks},
  volume = {206},
  pages = {109729},
  year = {2027},
  issn = {0893-6080},
  doi = {https://doi.org/10.1016/j.neunet.2026.109729},
  url = {https://www.sciencedirect.com/science/article/pii/S0893608026011846},
  eprint = {https://arxiv.org/abs/2605.13721},
  keywords = {Associative Networks, Statistical Mechanics},
  note = {[Published]}
}

@article{agliari2026exponential,
  title = {Exponential Capacity in Multilayer Hetero-Associative Neural Networks},
  author = {Elena Agliari and Adriano Barra and Andrea Ladiana* and Andrea Lepre},
  journal = {submitted to Neural Networks},
  year = {2026},
  url = {https://arxiv.org/abs/2607.29554},
  keywords = {Associative Networks},
  note = {[Submitted]}
}

@article{ladiana2026retrieval,
  title = {Finite-size scaling of hetero-associative retrieval in continuous-signal-driven Ising spin systems},
  author = {Andrea Ladiana*},
  journal = {arXiv preprint},
  year = {2026},
  url = {https://arxiv.org/abs/2605.14059},
  keywords = {Statistical Mechanics, Associative Networks},
  note = {[arXiv preprint]}
}

@inproceedings{ladiana2026thermodynamic,
  title = {Thermodynamic Binding: Freezing Chimeric States in Multi-Modal Associative Memories},
  author = {Elena Agliari and Adriano Barra and Andrea Ladiana* and Andrea Lepre},
  booktitle = {proceedings of the New Frontiers in Associative Memories Workshop (ICLR, 2026)},
  year = {2026},
  url = {https://openreview.net/forum?id=ZTnAvMRFyU},
  keywords = {Associative Networks, Statistical Mechanics},
  note = {[Workshop Proceedings]}
}

@inproceedings{alessandrellibeyond,
  title = {Beyond Disorder: Unveiling Cooperativeness in Multidirectional Associative Memories},
  author = {Andrea Alessandrelli* and Adriano Barra and Andrea Ladiana and Andrea Lepre and Federico Ricci-Tersenghi},
  booktitle = {proceedings of the New Frontiers in Associative Memories Workshop (ICLR, Singapore, 2025)},
  year = {2025},
  url = {https://openreview.net/pdf?id=o1AGK0hzJp},
  keywords = {Associative Networks, Statistical Mechanics},
  note = {[In press]}
}

@article{ALESSANDRELLI2025130871,
  title = {Supervised and Unsupervised Learning Protocols in Hetero-associative Neural Networks},
  author = {Andrea Alessandrelli and Adriano Barra and Andrea Ladiana* and Andrea Lepre and Federico Ricci-Tersenghi},
  journal = {Physica A: Statistical Mechanics and its Applications},
  volume = {676},
  pages = {130871},
  year = {2025},
  issn = {0378-4371},
  doi = {https://doi.org/10.1016/j.physa.2025.130871},
  url = {https://www.sciencedirect.com/science/article/pii/S0378437125005230},
  keywords = {Associative Networks, Statistical Mechanics},
  note = {[Published]}
}
`;

// Reveal animation
const cards = document.querySelectorAll('.glass-card');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = 1;
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, { threshold: 0.1 });

cards.forEach(card => {
    card.style.opacity = 0;
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(card);
});

// Load and Parse BibTeX
loadBibTeX();

// Load & Render Conferences (organized + invited speaker)
loadAndRenderConferences();

async function loadAndRenderConferences() {
    const data = await loadConferencesData();

    renderConferenceTimeline({
        data: data.organized,
        upcomingListId: 'conferences-list',
        pastDetailsId: 'past-conferences',
        pastListId: 'past-conferences-list'
    });

    renderConferenceTimeline({
        data: data.speaker,
        upcomingListId: 'speaker-conferences-list',
        pastDetailsId: 'past-speaker-conferences',
        pastListId: 'past-speaker-conferences-list'
    });
}

async function loadConferencesData() {
    // Default fallback (works on file://)
    let organized = Array.isArray(CONFERENCES_DATA) ? CONFERENCES_DATA : [];
    let speaker = Array.isArray(SPEAKER_CONFERENCES_DATA) ? SPEAKER_CONFERENCES_DATA : [];

    // Best-effort: load from conferences.json when served via http(s)
    try {
        if (typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:') {
            const response = await fetch('conferences.json', { cache: 'no-store' });
            if (response.ok) {
                const json = await response.json();

                if (Array.isArray(json)) {
                    // Backward compatibility: old format was a plain array of organized conferences
                    organized = json;
                } else if (json && typeof json === 'object') {
                    if (Array.isArray(json.organized)) organized = json.organized;
                    if (Array.isArray(json.speaker)) speaker = json.speaker;
                }
            }
        }
    } catch (error) {
        // Silent fallback to embedded data
        console.warn('Could not load conferences.json; using embedded data.', error);
    }

    return { organized, speaker };
}

function renderConferenceTimeline({ data, upcomingListId, pastDetailsId, pastListId }) {
    const upcomingList = document.getElementById(upcomingListId);
    const pastDetails = document.getElementById(pastDetailsId);
    const pastList = document.getElementById(pastListId);

    if (!upcomingList || !pastDetails || !pastList) return;

    try {
        const conferences = Array.isArray(data) ? data : [];
        const currentDate = new Date();

        upcomingList.innerHTML = '';
        pastList.innerHTML = '';
        pastDetails.style.display = 'none';

        conferences.forEach(conf => {
            const div = document.createElement('div');
            div.className = 'conference-item';

            const titleHtml = conf.url
                ? `<a href="${conf.url}" target="_blank">${conf.title}</a>`
                : `${conf.title}`;

            div.innerHTML = `
                <h3>${titleHtml}</h3>
                <p class="conf-meta">
                    <i class="far fa-calendar-alt"></i> ${conf.date} <br>
                    <i class="fas fa-map-marker-alt"></i> ${conf.location}
                </p>
                <p class="conf-desc">
                    ${conf.description}
                </p>
            `;

            const isPast = isConferenceInPast(conf.date, currentDate);
            if (isPast) {
                pastList.appendChild(div);
            } else {
                upcomingList.appendChild(div);
            }
        });

        if (pastList.children.length > 0) {
            pastDetails.style.display = 'block';
        }
    } catch (error) {
        console.error('Error rendering conferences:', error);
        upcomingList.innerHTML = '<p>Error loading conferences.</p>';
    }
}

function isConferenceInPast(dateStr, now) {
    if (!dateStr) return false;

    // Try range format first: "19-20 January 2026"
    const rangeMatch = dateStr.match(/(\d+)-(\d+)\s+([A-Za-z]+)\s+(\d{4})/);
    // Try single date format: "20 September 2025"
    const singleMatch = dateStr.match(/^(\d+)\s+([A-Za-z]+)\s+(\d{4})$/);

    let endDay, monthStr, year;
    if (rangeMatch) {
        endDay = parseInt(rangeMatch[2]);
        monthStr = rangeMatch[3];
        year = parseInt(rangeMatch[4]);
    } else if (singleMatch) {
        endDay = parseInt(singleMatch[1]);
        monthStr = singleMatch[2];
        year = parseInt(singleMatch[3]);
    } else {
        return false;
    }

    const endDate = new Date(`${monthStr} ${endDay}, ${year}`);
    endDate.setHours(23, 59, 59, 999);
    return endDate < now;
}

// Global state for publications
let allPublicationEntries = [];
let currentTypeFilter = 'all';
let currentTopicFilter = 'all';

async function loadBibTeX() {
    const container = document.getElementById('bibtex-container');
    if (!container) return;

    let text = BIBTEX_DATA;
    // Dynamic fetch from biblio.bib when served over http(s)
    try {
        if (typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:') {
            const res = await fetch('biblio.bib', { cache: 'no-store' });
            if (res.ok) {
                const fetchedText = await res.text();
                if (fetchedText && fetchedText.trim().length > 0) {
                    text = fetchedText;
                }
            }
        }
    } catch (e) {
        console.warn('Could not load biblio.bib dynamically; using embedded data.', e);
    }

    try {
        allPublicationEntries = parseBibTeX(text);
        initPublicationFilters();
        renderFilteredPublications();
    } catch (error) {
        console.error('Error loading publications:', error);
        container.innerHTML = '<p class="error">Error loading publications.</p>';
    }
}

function parseBibTeX(input) {
    const entries = [];
    // Strip comment lines (% ...)
    const cleanedInput = input
        .split('\n')
        .filter(line => !line.trim().startsWith('%'))
        .join('\n');

    const entryBlocks = cleanedInput.split(/(?=@\w+\s*\{)/);

    for (const block of entryBlocks) {
        const trimmed = block.trim();
        if (!trimmed.startsWith('@')) continue;

        const headerMatch = trimmed.match(/^@(\w+)\s*\{\s*([^,]+),/);
        if (!headerMatch) continue;

        const type = headerMatch[1].toLowerCase();
        const key = headerMatch[2].trim();

        // Safety exclusion: ensure unpublished/hidden origami manuscript never renders
        if (key === 'ladiana2026origami' || key.toLowerCase().includes('origami')) continue;

        const entry = { type, key, rawBibtex: trimmed };

        const body = trimmed.slice(headerMatch[0].length);
        const fieldRegex = /([a-zA-Z_]+)\s*=\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|([a-zA-Z_]+)\s*=\s*"([^"]*)"/g;
        let match;
        while ((match = fieldRegex.exec(body)) !== null) {
            const fieldName = (match[1] || match[3]).toLowerCase();
            const fieldValue = (match[2] !== undefined ? match[2] : match[4]).trim();
            entry[fieldName] = fieldValue;
        }

        // Determine if Andrea Ladiana is Corresponding Author
        let isLadianaCA = false;
        if (entry.author) {
            const authorsList = entry.author.split(/\s+and\s+/i);
            for (const auth of authorsList) {
                const isCA = auth.includes('*') || auth.includes('^');
                const cleanName = auth.replace(/[\*\$\^]/g, '').trim();
                const isLadiana = /Andrea\s+Ladiana|A\.\s*Ladiana/i.test(cleanName);
                if (isLadiana && isCA) {
                    isLadianaCA = true;
                    break;
                }
            }
        }
        entry.isLadianaCA = isLadianaCA;

        entries.push(entry);
    }

    // Sort by publication year descending
    return entries.sort((a, b) => {
        const yearA = parseInt(a.year) || 0;
        const yearB = parseInt(b.year) || 0;
        return yearB - yearA;
    });
}

function initPublicationFilters() {
    const typeGroup = document.getElementById('filter-type-group');
    const topicGroup = document.getElementById('filter-topic-group');

    if (typeGroup) {
        typeGroup.querySelectorAll('.pub-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                typeGroup.querySelectorAll('.pub-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTypeFilter = btn.dataset.filterType || 'all';
                renderFilteredPublications();
            });
        });
    }

    if (topicGroup) {
        topicGroup.querySelectorAll('.pub-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                topicGroup.querySelectorAll('.pub-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTopicFilter = btn.dataset.filterTopic || 'all';
                renderFilteredPublications();
            });
        });
    }
}

function matchesFilters(entry) {
    // Type Filter
    if (currentTypeFilter !== 'all') {
        const note = (entry.note || '').toLowerCase();
        const type = (entry.type || '').toLowerCase();

        if (currentTypeFilter === 'journal') {
            if (type !== 'article' || !note.includes('published')) return false;
        } else if (currentTypeFilter === 'submitted') {
            if (!note.includes('submitted') && !note.includes('arxiv')) return false;
        } else if (currentTypeFilter === 'conference') {
            if (type !== 'inproceedings' && !note.includes('workshop') && !note.includes('press')) return false;
        } else if (currentTypeFilter === 'ca') {
            if (!entry.isLadianaCA) return false;
        }
    }

    // Topic Filter
    if (currentTopicFilter !== 'all') {
        const kws = (entry.keywords || '').toLowerCase();
        const title = (entry.title || '').toLowerCase();

        if (currentTopicFilter === 'associative') {
            if (!kws.includes('associative') && !title.includes('associative') && !title.includes('hopfield') && !title.includes('dlam')) return false;
        } else if (currentTopicFilter === 'statmech') {
            if (!kws.includes('statistical mechanics') && !title.includes('statistical-mechanical') && !title.includes('ising') && !title.includes('spin') && !title.includes('thermodynamic')) return false;
        } else if (currentTopicFilter === 'federated') {
            if (!kws.includes('federated') && !title.includes('federated') && !title.includes('feddqkl')) return false;
        } else if (currentTopicFilter === 'graphs') {
            if (!kws.includes('graph') && !kws.includes('fractal') && !title.includes('laplacian') && !title.includes('lattice')) return false;
        }
    }

    return true;
}

function renderFilteredPublications() {
    const container = document.getElementById('bibtex-container');
    const olderContainer = document.getElementById('older-publications');
    if (!container) return;

    // Update total count indicator
    const countAllEl = document.getElementById('pub-count-all');
    if (countAllEl) countAllEl.textContent = allPublicationEntries.length;

    const filtered = allPublicationEntries.filter(matchesFilters);

    if (olderContainer) olderContainer.style.display = 'none';

    if (filtered.length === 0) {
        container.innerHTML = '<div class="pub-empty-msg"><i class="fas fa-search"></i> No publications match the selected filters.</div>';
        return;
    }

    container.innerHTML = '';
    filtered.forEach(entry => {
        const div = createPublicationElement(entry);
        container.appendChild(div);
    });
}

function createPublicationElement(entry) {
    const div = document.createElement('div');
    div.className = 'publication-item';

    const title = entry.title ? entry.title.replace(/--/g, '–') : 'Untitled';
    const venue = entry.journal || entry.booktitle || '';
    const year = entry.year || '';
    const publicationLink = entry.url || entry.doi || '';
    const type = entry.type || '';

    // Authors formatting
    let authorsHtml = 'Unknown Author';
    if (entry.author) {
        const authorsList = entry.author.split(/\s+and\s+/i);
        const formattedAuthors = authorsList.map(auth => {
            const isCA = auth.includes('*') || auth.includes('^');
            const cleanName = auth.replace(/[\*\$\^]/g, '').trim();
            const isLadiana = /Andrea\s+Ladiana|A\.\s*Ladiana/i.test(cleanName);

            const starHtml = isCA ? '<span class="ca-star" title="Corresponding Author">*</span>' : '';
            if (isLadiana) {
                return `<strong class="author-self">Andrea Ladiana${starHtml}</strong>`;
            }
            return `${cleanName}${starHtml}`;
        });
        authorsHtml = formattedAuthors.join(', ');
    }

    let html = `
        ${publicationLink
            ? `<a href="${publicationLink}" target="_blank" rel="noopener" class="pub-title">${title}</a>`
            : `<span class="pub-title">${title}</span>`}
        <p class="pub-authors">${authorsHtml}</p>
        ${venue ? `<p class="pub-journal">${venue}${year ? ', ' + year : ''}</p>` : ''}
    `;

    // Metadata badges
    html += '<div class="pub-meta-badges">';
    if (type) {
        const typeLabel = type === 'article' ? 'Journal' :
            type === 'inproceedings' ? 'Conference' :
                type.charAt(0).toUpperCase() + type.slice(1);
        html += `<span class="pub-badge">${typeLabel}</span>`;
    }
    if (year) {
        html += `<span class="pub-badge">${year}</span>`;
    }
    if (entry.isLadianaCA) {
        html += `<span class="pub-badge ca-badge" title="Andrea Ladiana is Corresponding Author"><i class="fas fa-envelope"></i> Corresponding Author</span>`;
    }
    if (entry.note) {
        const cleanNote = entry.note.replace(/^\[|\]$/g, '').trim();
        html += `<span class="pub-badge pub-badge-status">${cleanNote}</span>`;
    }
    if (entry.keywords) {
        const kws = entry.keywords.split(',').map(k => k.trim()).filter(Boolean);
        kws.forEach(kw => {
            html += `<span class="pub-badge pub-badge-topic">${kw}</span>`;
        });
    }
    html += '</div>';

    // Actions: Links & Copy BibTeX
    html += '<div class="pub-actions">';
    let links = [];
    if (entry.url) {
        let label = 'Link';
        if (entry.url.includes('arxiv.org')) label = 'arXiv';
        else if (entry.url.includes('openreview.net')) label = 'OpenReview';
        else if (entry.url.includes('sciencedirect.com')) label = 'ScienceDirect';
        else if (entry.url.includes('iopscience.iop.org')) label = 'IOPscience';
        else if (entry.url.includes('doi.org')) label = 'DOI';
        links.push(`<a href="${entry.url}" target="_blank" rel="noopener">[${label}]</a>`);
    }
    if (entry.eprint) {
        const arxivUrl = entry.eprint.startsWith('http') ? entry.eprint : `https://arxiv.org/abs/${entry.eprint}`;
        links.push(`<a href="${arxivUrl}" target="_blank" rel="noopener">[arXiv]</a>`);
    }
    if (entry.doi && !entry.url) {
        links.push(`<a href="${entry.doi}" target="_blank" rel="noopener">[DOI]</a>`);
    }

    if (links.length > 0) {
        html += `<div class="pub-links">${links.join(' ')}</div>`;
    }

    // Copy BibTeX Button
    html += `<button type="button" class="pub-btn-bibtex" data-key="${entry.key}" title="Copy BibTeX citation"><i class="fas fa-quote-right"></i> BibTeX</button>`;
    html += '</div>';

    div.innerHTML = html;
    return div;
}

// Copy BibTeX to clipboard with visual feedback
function copyBibTeX(key, button) {
    const entry = allPublicationEntries.find(e => e.key === key);
    if (!entry) return;

    const textToCopy = entry.rawBibtex || '';
    const doFeedback = () => {
        const originalHtml = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> Copied!';
        button.classList.add('copied');
        setTimeout(() => {
            button.innerHTML = originalHtml;
            button.classList.remove('copied');
        }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(doFeedback).catch(() => {
            fallbackCopyText(textToCopy, doFeedback);
        });
    } else {
        fallbackCopyText(textToCopy, doFeedback);
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
        if (callback) callback();
    } catch (e) {
        console.error('Copy failed:', e);
    }
    document.body.removeChild(textarea);
}

// Global click delegation for Copy BibTeX
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pub-btn-bibtex');
    if (btn) {
        const key = btn.dataset.key;
        copyBibTeX(key, btn);
    }
});

// Dropdown menu interactivity for Projects
(function initProjectsDropdown() {
    const dropdown = document.getElementById('projects-dropdown');
    const btn = document.getElementById('projects-dropdown-btn');

    if (!dropdown || !btn) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('active');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dropdown.classList.contains('active')) {
            dropdown.classList.remove('active');
            btn.setAttribute('aria-expanded', 'false');
            btn.focus();
        }
    });
})();

// Scrollspy for top navigation
(function initScrollspy() {
    const navLinks = document.querySelectorAll('.top-nav a[href^="#"]');
    if (!navLinks.length) return;

    const sections = Array.from(navLinks)
        .map(link => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    function onScroll() {
        const scrollPos = window.scrollY + 120;
        let currentSectionId = null;

        for (let i = sections.length - 1; i >= 0; i--) {
            const section = sections[i];
            if (section.offsetTop <= scrollPos) {
                currentSectionId = section.getAttribute('id');
                break;
            }
        }

        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (currentSectionId && href === `#${currentSectionId}`) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();

// Floating Back to Top Button
(function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 350) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    }, { passive: true });

    btn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
})();


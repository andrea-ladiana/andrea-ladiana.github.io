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

const BIBTEX_DATA = `
@inproceedings{alessandrellibeyond,
  title={Beyond Disorder: Unveiling Cooperativeness in Multidirectional Associative Memories},
  author={Andrea Alessandrelli and Adriano Barra and Andrea Ladiana and Andrea Lepre and Federico Ricci-Tersenghi},
  booktitle={New Frontiers in Associative Memories}
  url = {https://openreview.net/pdf?id=o1AGK0hzJp},
}

@article{ALESSANDRELLI2025130871,
title = {Supervised and unsupervised protocols for hetero-associative neural networks},
journal = {Physica A: Statistical Mechanics and its Applications},
volume = {676},
pages = {130871},
year = {2025},
issn = {0378-4371},
doi = {https://doi.org/10.1016/j.physa.2025.130871},
url = {https://www.sciencedirect.com/science/article/pii/S0378437125005230},
author = {Andrea Alessandrelli and Adriano Barra and Andrea Ladiana and Andrea Lepre and Federico Ricci-Tersenghi},
keywords = {Statistical mechanics, Spin glass, Supervised learning, Unsupervised learning, Heteroassociative memory, Neural networks},
abstract = {This paper introduces a learning framework for Three-Directional Associative Memory (TAM) models, extending the classical Hebbian paradigm to both supervised and unsupervised protocols within an hetero-associative setting. These neural networks consist of three interconnected layers of binary neurons interacting via generalized Hebbian synaptic couplings that allow learning, storage and retrieval of structured triplets of patterns. By relying upon glassy statistical mechanical techniques (mainly replica theory and Guerra interpolation), we analyze the emergent computational properties of these networks, at work with random (Rademacher) datasets and at the replica-symmetric level of description: we obtain a set of self-consistency equations for the order parameters that quantify the critical dataset sizes (i.e. their thresholds for learning) and describe the retrieval performance of these networks, highlighting the differences between supervised and unsupervised protocols. Numerical simulations validate our theoretical findings and demonstrate the robustness of the captured picture about TAMs also at work with structured datasets. In particular, this study provides insights into the cooperative interplay of layers, beyond that of the neurons within the layers, with potential implications for optimal design of artificial neural network architectures.}
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

// Sort Conferences
sortConferences();

function sortConferences() {
    const conferencesList = document.getElementById('conferences-list');
    const pastConferencesContainer = document.getElementById('past-conferences');
    const pastConferencesList = document.getElementById('past-conferences-list');

    if (!conferencesList || !pastConferencesContainer || !pastConferencesList) return;

    try {
        const conferences = CONFERENCES_DATA;

        const currentDate = new Date();
        conferencesList.innerHTML = '';
        pastConferencesList.innerHTML = '';

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

            // Parse date
            // Parse date
            // Try range format first: "19-20 January 2026"
            const rangeMatch = conf.date.match(/(\d+)-(\d+)\s+([A-Za-z]+)\s+(\d{4})/);
            // Try single date format: "20 September 2025"
            const singleMatch = conf.date.match(/^(\d+)\s+([A-Za-z]+)\s+(\d{4})$/);

            let isPast = false;
            let endDay, monthStr, year;

            if (rangeMatch) {
                endDay = parseInt(rangeMatch[2]);
                monthStr = rangeMatch[3];
                year = parseInt(rangeMatch[4]);
            } else if (singleMatch) {
                endDay = parseInt(singleMatch[1]);
                monthStr = singleMatch[2];
                year = parseInt(singleMatch[3]);
            }

            if (rangeMatch || singleMatch) {
                const conferenceDate = new Date(`${monthStr} ${endDay}, ${year}`);
                conferenceDate.setHours(23, 59, 59, 999);

                if (conferenceDate < currentDate) {
                    isPast = true;
                }
            }

            if (isPast) {
                pastConferencesList.appendChild(div);
            } else {
                conferencesList.appendChild(div);
            }
        });

        // Show past conferences container if needed
        if (pastConferencesList.children.length > 0) {
            pastConferencesContainer.style.display = 'block';
        }

    } catch (error) {
        console.error('Error loading conferences:', error);
        conferencesList.innerHTML = '<p>Error loading conferences.</p>';
    }
}

function loadBibTeX() {
    const container = document.getElementById('bibtex-container');
    if (!container) return;

    try {
        const text = BIBTEX_DATA;
        const entries = parseBibTeX(text);
        renderPublications(entries, container);
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="error">Error loading publications.</p>';
    }
}

function parseBibTeX(input) {
    const entries = [];
    // Simple regex-based parser for standard BibTeX
    // Matches @type{key, field={value}, ...}
    const entryRegex = /@(\w+)\s*{\s*([^,]+),([^@]+)}/g;
    let match;

    while ((match = entryRegex.exec(input)) !== null) {
        const type = match[1];
        const key = match[2];
        const body = match[3];

        const entry = { type, key };

        // Parse fields
        const fieldRegex = /(\w+)\s*=\s*{([^}]+)}/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(body)) !== null) {
            entry[fieldMatch[1].toLowerCase()] = fieldMatch[2].trim();
        }

        entries.push(entry);
    }

    // Sort by year descending (if available)
    return entries.sort((a, b) => (b.year || 0) - (a.year || 0));
}

function renderPublications(entries, container) {
    if (entries.length === 0) {
        container.innerHTML = '<p>No publications found.</p>';
        return;
    }

    const olderPublicationsContainer = document.getElementById('older-publications');
    const olderPublicationsList = document.getElementById('older-publications-list');

    // Show first 10 publications in main container
    const recentPublications = entries.slice(0, 10);
    const olderPublications = entries.slice(10);

    container.innerHTML = '';

    // Render recent publications
    recentPublications.forEach(entry => {
        const div = createPublicationElement(entry);
        container.appendChild(div);
    });

    // Render older publications if any
    if (olderPublications.length > 0 && olderPublicationsList) {
        olderPublicationsList.innerHTML = '';
        olderPublications.forEach(entry => {
            const div = createPublicationElement(entry);
            olderPublicationsList.appendChild(div);
        });

        if (olderPublicationsContainer) {
            olderPublicationsContainer.style.display = 'block';
        }
    }
}

function createPublicationElement(entry) {
    const div = document.createElement('div');
    div.className = 'publication-item';

    const title = entry.title || 'Untitled';
    const authors = entry.author ? entry.author.replace(/ and /g, ', ') : 'Unknown Author';
    const venue = entry.journal || entry.booktitle || 'Unknown Venue';
    const year = entry.year || '';
    const url = entry.url || entry.doi || '#';
    const type = entry.type || '';

    let html = `
        <a href="${url}" target="_blank" class="pub-title">${title}</a>
        <p class="pub-authors">${authors}</p>
        <p class="pub-journal">${venue}${year ? ', ' + year : ''}</p>
    `;

    // Add badges for type and year
    if (type || year) {
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
        html += '</div>';
    }

    if (entry.note || entry.comment) {
        html += `<p class="pub-desc">${entry.note || entry.comment}</p>`;
    }

    // Add links if available
    let links = [];
    if (entry.url) links.push(`<a href="${entry.url}" target="_blank">[URL]</a>`);
    if (entry.doi && !entry.url) links.push(`<a href="${entry.doi}" target="_blank">[DOI]</a>`); // Avoid duplicate if url is same

    if (links.length > 0) {
        html += `<div class="pub-links">${links.join(' ')}</div>`;
    }

    div.innerHTML = html;
    return div;
}

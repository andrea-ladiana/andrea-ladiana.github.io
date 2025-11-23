document.addEventListener('DOMContentLoaded', () => {
    console.log("Website loaded successfully.");

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
});

async function loadBibTeX() {
    const container = document.getElementById('bibtex-container');
    try {
        const response = await fetch('biblio.bib');
        if (!response.ok) throw new Error('Failed to load biblio.bib');
        const text = await response.text();
        const entries = parseBibTeX(text);
        renderPublications(entries, container);
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="error">Error loading publications. Please check biblio.bib.</p>';
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

    container.innerHTML = '';
    entries.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'publication-item';

        const title = entry.title || 'Untitled';
        const authors = entry.author ? entry.author.replace(/ and /g, ', ') : 'Unknown Author';
        const venue = entry.journal || entry.booktitle || 'Unknown Venue';
        const year = entry.year || '';
        const url = entry.url || entry.doi || '#';

        let html = `
            <a href="${url}" target="_blank" class="pub-title">${title}</a>
            <p class="pub-authors">${authors}</p>
            <p class="pub-journal">${venue}${year ? ', ' + year : ''}</p>
        `;

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
        container.appendChild(div);
    });
}

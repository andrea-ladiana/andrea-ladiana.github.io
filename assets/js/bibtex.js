/*
 * BibTeX helpers shared by the page (window.BibTeX) and by tools/check-data.js (Node).
 *
 * Site-specific conventions used in biblio.bib:
 *   - "*" after an author name marks the corresponding author
 *   - note = {[Published]} / {[Submitted]} / ... is a status label shown on the page
 *   - optional `tldr` (one line) and `abstract` fields are shown in the publication card
 * None of this belongs in a citation, so cleanEntry() strips it before copying/downloading.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BibTeX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    const SELF_RE = /Andrea\s+Ladiana|A\.\s*Ladiana/i;

    /** Read a balanced {...} group starting at `start` (which must point to "{"). Returns [content, indexAfter]. */
    function readBraced(src, start) {
        let depth = 0;
        for (let i = start; i < src.length; i++) {
            const ch = src[i];
            if (ch === '\\') { i++; continue; }
            if (ch === '{') depth++;
            else if (ch === '}' && --depth === 0) return [src.slice(start + 1, i), i + 1];
        }
        return [src.slice(start + 1), src.length];
    }

    function parseFields(body) {
        const fields = [];
        let i = 0;
        while (i < body.length) {
            while (i < body.length && /[\s,]/.test(body[i])) i++;
            const nameMatch = /^[A-Za-z_][\w-]*/.exec(body.slice(i));
            if (!nameMatch) break;
            const name = nameMatch[0];
            i += name.length;
            while (i < body.length && /\s/.test(body[i])) i++;
            if (body[i] !== '=') break;
            i++;
            while (i < body.length && /\s/.test(body[i])) i++;

            let value;
            if (body[i] === '{') {
                [value, i] = readBraced(body, i);
            } else if (body[i] === '"') {
                const end = body.indexOf('"', i + 1);
                value = body.slice(i + 1, end < 0 ? body.length : end);
                i = end < 0 ? body.length : end + 1;
            } else {
                const m = /^[^,}\s]+/.exec(body.slice(i));
                value = m ? m[0] : '';
                i += value.length;
            }
            fields.push([name.toLowerCase(), value.trim()]);
        }
        return fields;
    }

    function parseAuthors(authorField) {
        return (authorField || '').split(/\s+and\s+/i).map(raw => {
            const name = raw.replace(/[*$^]/g, '').trim();
            return { name, corresponding: /[*^]/.test(raw), self: SELF_RE.test(name) };
        }).filter(a => a.name);
    }

    /** Parse a .bib text into entries, sorted by year (newest first, file order preserved within a year). */
    function parse(input) {
        const text = String(input)
            .split(/\r?\n/)
            .filter(line => !line.trim().startsWith('%'))
            .join('\n');

        const entries = [];
        const header = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
        let m;
        while ((m = header.exec(text)) !== null) {
            const braceStart = text.indexOf('{', m.index);
            const [inner, after] = readBraced(text, braceStart);
            header.lastIndex = after;

            const fields = parseFields(inner.slice(inner.indexOf(',') + 1));
            const entry = { type: m[1].toLowerCase(), key: m[2], fields };
            fields.forEach(([name, value]) => { entry[name] = value; });

            entry.authors = parseAuthors(entry.author);
            entry.isSelfCA = entry.authors.some(a => a.self && a.corresponding);
            entries.push(entry);
        }

        return entries
            .map((entry, index) => ({ entry, index }))
            .sort((a, b) => (parseInt(b.entry.year, 10) || 0) - (parseInt(a.entry.year, 10) || 0) || a.index - b.index)
            .map(x => x.entry);
    }

    function arxivIdOf(entry) {
        const source = entry.eprint || entry.url || '';
        const match = /arxiv\.org\/(?:abs|pdf)\/([\w.\/-]+?)(?:v\d+)?(?:\.pdf)?$/i.exec(source);
        if (match) return match[1];
        return /^\d{4}\.\d{4,5}$/.test(source) ? source : '';
    }

    /** Fields as they should appear in a real citation (no site-only markers). */
    function cleanFields(entry) {
        const out = [];
        for (const [name, value] of entry.fields) {
            if (name === 'tldr') continue;
            if (name === 'note' && /^\[.*\]$/.test(value)) continue;
            if (name === 'author') out.push([name, value.replace(/[*^]/g, '').replace(/\s+and\s+/gi, ' and ')]);
            else if (name === 'doi') out.push([name, value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')]);
            else if (name === 'eprint') continue;
            else if (name === 'journal') out.push([name, value.replace(/^submitted to\s+/i, 'Submitted to ')]);
            else out.push([name, value]);
        }
        const arxivId = arxivIdOf(entry);
        if (arxivId) out.push(['eprint', arxivId], ['archivePrefix', 'arXiv']);
        return out;
    }

    function cleanEntry(entry) {
        const lines = cleanFields(entry).map(([name, value]) => `  ${name} = {${value}}`);
        return `@${entry.type}{${entry.key},\n${lines.join(',\n')}\n}`;
    }

    function cleanFile(entries) {
        return entries.map(cleanEntry).join('\n\n') + '\n';
    }

    /** Plain text for display: drop BibTeX braces/escapes and typeset dashes. */
    function displayText(value) {
        return String(value || '')
            .replace(/---/g, '—')
            .replace(/--/g, '–')
            .replace(/\\([&%$#_])/g, '$1')
            .replace(/[{}]/g, '');
    }

    return { parse, parseAuthors, cleanEntry, cleanFile, displayText, arxivIdOf };
});

# andrea-ladiana.github.io

Personal website. Plain HTML/CSS/JS, no build step.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `style.css`, `script.js` | The home page |
| `assets/js/bibtex.js` | BibTeX parser/cleaner (used by the page and by `tools/check-data.js`) |
| `assets/js/graph-bg.js` | Animated graph background (canvas) |
| `assets/fonts/` | Self-hosted Inter (SIL OFL, see `OFL.txt`) |
| `biblio.bib` | **Publications**: edit this file, the page renders it |
| `conferences.json` | **Conferences**: edit this file, the page renders it |
| `lenia/`, `affitti/` | Sub-pages |
| `404.html`, `robots.txt`, `sitemap.xml`, `og-image.png` | SEO / sharing |

## Previewing locally

`fetch()` does not work on `file://`, so serve the folder:

```bash
python -m http.server 8000
```

then open <http://localhost:8000>.

## Updating content

**Publications** (`biblio.bib`)

- `*` after an author name marks the corresponding author.
- `note = {[Published]}` / `{[Submitted]}` / `{[arXiv preprint]}` / `{[Workshop Proceedings]}` is the status badge and drives the "Type" filters.
- `keywords = {Associative Networks, Statistical Mechanics}` drives the "Topic" filters.
- Optional: `tldr = {one-line summary}` and `abstract = {...}` add a summary line and an "Abstract" toggle to the card.
- Lines starting with `%` are ignored (use them to hide an entry).
- "BibTeX" buttons and the `.bib` download strip the site-only markers (`*`, status notes, `tldr`), turn DOI URLs into bare DOIs and add `eprint`/`archivePrefix` for arXiv links.

**Conferences** (`conferences.json`): dates are ISO (`"start": "2026-01-19"`, optional `"end"`). Events whose last day is in the past move to the collapsible "Past" list automatically.

## Checks

```bash
node tools/check-data.js
```

validates `biblio.bib` and `conferences.json`. The same check, plus a link checker, runs on GitHub Actions (`.github/workflows/checks.yml`) on every push and every Monday.

## Cache busting

GitHub Pages caches assets for a few minutes. When you change `style.css`, `script.js` or the files in `assets/js/`, bump the `?v=` suffix in `index.html` (and `404.html`) so visitors never get new HTML with old CSS/JS.

## Background animation

The graph background follows `prefers-reduced-motion` (a still frame instead of motion). The round button at the bottom-left of the page pauses/plays it and remembers the choice in `localStorage`.

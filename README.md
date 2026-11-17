# andrea-ladiana.github.io

Personal website. Plain HTML/CSS/JS, no build step.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `style.css`, `script.js` | The home page |
| `assets/js/bibtex.js` | BibTeX parser/cleaner (used by the page and by `tools/check-data.js`) |
| `assets/js/dotnet.js` | The dot network: a Hopfield network (projector rule, Glauber dynamics) drawn on the page's dot grid; used by the hero, the Szilárd numerals and `404.html` |
| `assets/js/minis.js` | Live previews in the "Papers you can play with" cards (Lenia, diamond-lattice eigenmodes, dreaming, pairs) |
| `assets/fonts/` | Self-hosted Inter (SIL OFL, see `OFL.txt`) |
| `biblio.bib` | **Publications**: edit this file, the page renders it |
| `conferences.json` | **Conferences**: edit this file, the page renders it |
| `lenia/`, `affitti/` | Sub-pages |
| `diamond-spectrum/` | Interactive paper on the diamond-lattice spectrum (ES modules, data in `assets/data/spectrum.json`) |
| `dreaming/` | Interactive paper on dreaming Hopfield networks (ES modules, live Monte Carlo, data in `assets/data/dreaming.json`) |
| `exponential-memory/` | Interactive paper on exponential multilayer hetero-associative memory (ES modules, Monte Carlo in a worker, live VDJdb and CLINC150 recall; data in `assets/data/`) |
| `assets/series/` | Shared look of the interactive-paper series (`series.css`, fonts) |
| `tools/diamond/precompute.py` | Regenerates `diamond-spectrum/assets/data/spectrum.json` from the paper's exact formulas (needs sympy, mpmath, numpy; ~3 min) |
| `tools/dreaming/precompute.py` | Regenerates `dreaming/assets/data/dreaming.json`: letter bitmaps plus the paper's Monte Carlo data, read from the local DLAM working folder (needs numpy, pillow, matplotlib) |
| `tools/exponential-memory/precompute.py` | Regenerates `exponential-memory/assets/data/*.json` (glyphs, the paper's Monte Carlo data, VDJdb and CLINC150 codes and the text encoder) from the local TAM-EASY folder passed as argument |
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
- `keywords = {Associative Networks, Statistical Mechanics}` drives the "Topic" filters, the tags on each paper and the research map. Every keyword becomes a filter with its count; its colour comes from the family it belongs to in `FAMILIES` (top of the publications part of `script.js`): add new keywords there to give them the right colour.
- Optional: `tldr = {one-line summary}` and `abstract = {...}` add a summary line and an "Abstract" toggle to the card.
- Lines starting with `%` are ignored (use them to hide an entry).
- "BibTeX" buttons and the `.bib` download strip the site-only markers (`*`, status notes, `tldr`), turn DOI URLs into bare DOIs and add `eprint`/`archivePrefix` for arXiv links.

**Conferences** (`conferences.json`): dates are ISO (`"start": "2026-01-19"`, optional `"end"`). They are drawn as a raster plot (one dot per week, one row per role, a "today" marker) and as cards; upcoming events come first, then the past ones, newest first.

## Checks

```bash
node tools/check-data.js
```

validates `biblio.bib` and `conferences.json`. The same check, plus a link checker, runs on GitHub Actions (`.github/workflows/checks.yml`) on every push and every Monday.

## Cache busting

GitHub Pages caches assets for a few minutes. When you change `style.css`, `script.js` or the files in `assets/js/`, bump the `?v=` suffix in `index.html` (and `404.html`) so visitors never get new HTML with old CSS/JS.

In `diamond-spectrum/`, `dreaming/` and `exponential-memory/` the same suffix is also on every `import` between modules, so bump it everywhere at once:

```bash
grep -rl "v=20261029a" diamond-spectrum | xargs sed -i "s/v=20261029a/v=NEW/g"
grep -rl "v=20261029a" dreaming | xargs sed -i "s/v=20261029a/v=NEW/g"
grep -rl "v=20261029a" exponential-memory | xargs sed -i "s/v=20261029a/v=NEW/g"
```

## The dot network

The page background is a CSS dot grid (`--cell`, 14px; 12px on phones) anchored at the document origin. The hero canvas lines its neurons up with that grid, so the pictures form out of the page's own dots. Inside the hero square the network stores eight pictures with the projector rule; outside it the neurons are held quiet and only flicker when heated (pointer, ambient sparks).

Everything animated (hero, previews, Szilárd numerals, 404) follows `prefers-reduced-motion`: the networks show the final picture without dynamics, and the previews stay still. Animations pause when off screen or when the tab is hidden.

Light/dark follows the system, and the moon/sun button stores the choice under `series-theme`, the same key used by the interactive papers.

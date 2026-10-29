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

In `diamond-spectrum/`, `dreaming/` and `exponential-memory/` the same suffix is also on every `import` between modules, so bump it everywhere at once:

```bash
grep -rl "v=20261029a" diamond-spectrum | xargs sed -i "s/v=20261029a/v=NEW/g"
grep -rl "v=20261029a" dreaming | xargs sed -i "s/v=20261029a/v=NEW/g"
grep -rl "v=20261029a" exponential-memory | xargs sed -i "s/v=20261029a/v=NEW/g"
```

## Background animation

The graph background follows `prefers-reduced-motion` (a still frame instead of motion). The round button at the bottom-left of the page pauses/plays it and remembers the choice in `localStorage`.

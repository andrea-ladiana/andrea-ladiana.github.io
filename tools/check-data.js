#!/usr/bin/env node
/*
 * Sanity checks for the data files that drive the page.
 *   node tools/check-data.js
 * Exits with status 1 if biblio.bib or conferences.json has problems.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const BibTeX = require('../assets/js/bibtex.js');

const root = path.join(__dirname, '..');
const errors = [];
const fail = message => errors.push(message);

/* ---- biblio.bib ---- */
const bibText = fs.readFileSync(path.join(root, 'biblio.bib'), 'utf8');
const entries = BibTeX.parse(bibText);

const declared = bibText.split(/\r?\n/).filter(l => !l.trim().startsWith('%')).join('\n').match(/^\s*@\w+\s*\{/gm) || [];
if (declared.length !== entries.length) fail(`biblio.bib: ${declared.length} "@" entries found but ${entries.length} parsed (unbalanced braces?)`);

const keys = new Set();
for (const e of entries) {
    const where = `biblio.bib [${e.key}]`;
    if (keys.has(e.key)) fail(`${where}: duplicate key`);
    keys.add(e.key);
    if (!e.title) fail(`${where}: missing title`);
    if (!e.authors.length) fail(`${where}: missing author`);
    if (!/^\d{4}$/.test(e.year || '')) fail(`${where}: year must be 4 digits`);
    if (!e.journal && !e.booktitle) fail(`${where}: missing journal/booktitle`);
    if (!e.note || !/^\[.+\]$/.test(e.note)) fail(`${where}: note should look like {[Status]}`);
    if (!/\d{4}/.test(e.key)) fail(`${where}: key should contain the year`);
    for (const field of ['url', 'eprint', 'doi']) {
        if (e[field] && !/^https?:\/\//.test(e[field]) && field !== 'eprint') fail(`${where}: ${field} must start with http(s)://`);
    }
}

/* ---- conferences.json ---- */
const iso = /^\d{4}-\d{2}-\d{2}$/;
const conferences = JSON.parse(fs.readFileSync(path.join(root, 'conferences.json'), 'utf8'));
for (const group of ['organized', 'speaker']) {
    if (!Array.isArray(conferences[group])) { fail(`conferences.json: "${group}" must be an array`); continue; }
    conferences[group].forEach((c, i) => {
        const where = `conferences.json ${group}[${i}] (${c.title || '?'})`;
        for (const field of ['title', 'location', 'description']) if (!c[field]) fail(`${where}: missing ${field}`);
        if (!iso.test(c.start || '') || isNaN(Date.parse(c.start))) fail(`${where}: start must be a valid YYYY-MM-DD date`);
        if (c.end && (!iso.test(c.end) || isNaN(Date.parse(c.end)))) fail(`${where}: end must be a valid YYYY-MM-DD date`);
        if (c.end && c.start && c.end < c.start) fail(`${where}: end is before start`);
        if (c.url && !/^https?:\/\//.test(c.url)) fail(`${where}: url must start with http(s)://`);
    });
}

if (errors.length) {
    console.error(errors.map(e => `✗ ${e}`).join('\n'));
    process.exit(1);
}
console.log(`✓ biblio.bib: ${entries.length} entries OK`);
console.log(`✓ conferences.json: ${conferences.organized.length + conferences.speaker.length} events OK`);

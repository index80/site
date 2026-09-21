#!/usr/bin/env node
/**
 * Guardrail for the static INDEX:80 homepage directory.
 *
 * Run after generate-home-directory.mjs. It proves that the generated
 * homepage contains one and only one internal profile link for every valid
 * projects.json record, with no stale or unexpected project slugs.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const DATA_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const HOME_FILE = join(PUBLIC_HTML, 'index.html');
const START_MARKER = '<!-- INDEX80_DIRECTORY_START -->';
const END_MARKER = '<!-- INDEX80_DIRECTORY_END -->';
const SLUG_RE = /^[a-z0-9-]+$/;

function validProject(p) {
  return Boolean(
    p &&
    p.slug &&
    SLUG_RE.test(p.slug) &&
    p.name &&
    p.summary &&
    p.category &&
    p.status
  );
}

function fail(message) {
  console.error(`[test-home-directory] FAIL: ${message}`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const expected = (data.projects || []).filter(validProject).map((p) => p.slug);
const expectedSet = new Set(expected);
if (expectedSet.size !== expected.length) fail('projects.json contains duplicate valid slugs.');

const html = readFileSync(HOME_FILE, 'utf8');
const start = html.indexOf(START_MARKER);
const end = html.indexOf(END_MARKER);
if (start < 0 || end < 0 || end <= start) fail('generation markers are missing or out of order.');
if (html.indexOf(START_MARKER, start + START_MARKER.length) !== -1 ||
    html.indexOf(END_MARKER, end + END_MARKER.length) !== -1) {
  fail('generation markers must occur exactly once.');
}

const fragment = html.slice(start + START_MARKER.length, end);
if (fragment.includes('Loading directory…')) fail('loading placeholder remains inside generated directory.');

const rowCount = (fragment.match(/<li class="dir-row">/g) || []).length;
const slugs = [...fragment.matchAll(/href="\/projects\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
const slugSet = new Set(slugs);
const duplicates = slugs.filter((slug, i) => slugs.indexOf(slug) !== i);
const missing = expected.filter((slug) => !slugSet.has(slug));
const unexpected = [...slugSet].filter((slug) => !expectedSet.has(slug));

if (rowCount !== expected.length) fail(`found ${rowCount} static rows; expected ${expected.length}.`);
if (slugs.length !== expected.length) fail(`found ${slugs.length} project-profile links; expected ${expected.length}.`);
if (slugSet.size !== slugs.length) fail(`duplicate project-profile link(s): ${[...new Set(duplicates)].join(', ')}`);
if (missing.length) fail(`missing project-profile link(s): ${missing.join(', ')}`);
if (unexpected.length) fail(`unexpected project-profile link(s): ${unexpected.join(', ')}`);

const countMatch = html.match(/<span id="directory-count" class="directory-count">([^<]+)<\/span>/);
if (!countMatch || countMatch[1].trim() !== `${expected.length} RECORDS`) {
  fail('static directory count does not match projects.json.');
}

console.log(`[test-home-directory] PASS: ${expected.length} valid records, ${rowCount} static rows, ${slugs.length} unique project links.`);

#!/usr/bin/env node
/**
 * Generate the static governance-category directory.
 *
 * Mirrors the homepage's progressive-enhancement contract: the current
 * governance rows and count are written into HTML at build time from the same
 * projects.json used by schema/search. assets/js/directory.js may enhance the
 * list in the browser, but the page remains useful and crawlable without JS.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { esc, safeUrl } from './lib/html-safety.mjs';

const Treasury = createRequire(import.meta.url)('../public_html/assets/js/treasury-rule.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const DATA_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const RELATIONS_FILE = join(PUBLIC_HTML, 'data', 'project-relations.json');
const GOVERNANCE_FILE = join(PUBLIC_HTML, 'governance', 'index.html');

const START_MARKER = '<!-- INDEX80_GOVERNANCE_DIRECTORY_START -->';
const END_MARKER = '<!-- INDEX80_GOVERNANCE_DIRECTORY_END -->';
const SLUG_RE = /^[a-z0-9-]+$/;

const CATEGORY_ICON = {
  governance: 'governance',
};

const catLabel = (cat) => String(cat).replace(/-/g, ' ').toUpperCase();
const bestExternalLink = (p) =>
  safeUrl(p.official_url) || safeUrl(p.github_url) || safeUrl(p.docs_url) || safeUrl(p.social_url) || null;

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

function isListable(p) {
  return validProject(p) && p.status !== 'archived';
}

function loadFallbackRelations() {
  if (!existsSync(RELATIONS_FILE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(RELATIONS_FILE, 'utf8'));
    return parsed.records || {};
  } catch {
    return {};
  }
}

function effectiveRelations(projects, fallbackRelations) {
  const records = {};
  for (const p of projects) {
    const fallback = fallbackRelations[p.slug] || {};
    records[p.slug] = {
      related_projects:
        Array.isArray(p.related_projects) && p.related_projects.length
          ? p.related_projects
          : (fallback.related_projects || []),
    };
  }
  return records;
}

function orderByRelations(items, relationRecords) {
  const bySlug = new Map(items.map((p) => [p.slug, p]));
  const emitted = new Set();
  const ordered = [];

  function emit(slug) {
    if (emitted.has(slug)) return;
    const project = bySlug.get(slug);
    if (!project) return;
    emitted.add(slug);
    ordered.push(project);
    const related = relationRecords?.[slug]?.related_projects || [];
    for (const relatedSlug of related) emit(relatedSlug);
  }

  for (const project of items) emit(project.slug);
  return ordered;
}

function renderRow(p, index) {
  const catIcon = CATEGORY_ICON[p.category] || 'governance';
  const num = String(index + 1).padStart(2, '0');
  const profileHref = `/projects/${encodeURIComponent(p.slug)}/`;
  const external = bestExternalLink(p);
  const externalLink = external
    ? `<a class="dir-link" href="${esc(external)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.name)}'s external site in a new tab">↗</a>`
    : '<span class="dir-link" aria-hidden="true"></span>';
  const featuredMark = p.featured
    ? '<span class="dir-featured" aria-label="Featured by INDEX:80" title="Editorially featured by INDEX:80">★</span> '
    : '';
  const treasuryMark = Treasury.isConfirmedFunded(p)
    ? '<span class="dir-treasury" aria-label="Treasury funded" title="Confirmed Cardano Treasury funding on record">₳</span> '
    : '';

  return `        <li class="dir-row">
          <span class="dir-index">${num}</span>
          <svg class="icon dir-icon" aria-hidden="true"><use href="../assets/icons/icons.svg#icon-${catIcon}"></use></svg>
          <a class="dir-name" href="${esc(profileHref)}">${featuredMark}${treasuryMark}${esc(p.name)}</a>
          <span class="dir-desc">${esc(p.summary || '')}</span>
          <span class="dir-cat">${esc(catLabel(p.category))}</span>
          ${externalLink}
        </li>`;
}

function replaceGeneratedDirectory(html, rows) {
  const start = html.indexOf(START_MARKER);
  const end = html.indexOf(END_MARKER);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Governance directory generation markers are missing or out of order.');
  }
  if (
    html.indexOf(START_MARKER, start + START_MARKER.length) !== -1 ||
    html.indexOf(END_MARKER, end + END_MARKER.length) !== -1
  ) {
    throw new Error('Governance directory generation markers must occur exactly once.');
  }
  const contentStart = start + START_MARKER.length;
  return html.slice(0, contentStart) + '\n' + rows + '\n        ' + html.slice(end);
}

function updateStaticCount(html, visible, total) {
  const pattern = /(<span id="directory-count" class="directory-count">)[^<]*(<\/span>)/;
  if (!pattern.test(html)) throw new Error('Governance directory count element was not found.');
  return html.replace(pattern, `$1${visible} / ${total} RECORDS$2`);
}

const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const listable = (data.projects || []).filter(isListable);
const fallbackRelations = loadFallbackRelations();
const ordered = orderByRelations(listable, effectiveRelations(listable, fallbackRelations));
const governance = ordered.filter((p) => p.category === 'governance');

if (ordered.length !== listable.length) {
  throw new Error(`Relation ordering emitted ${ordered.length} row(s) for ${listable.length} listable projects.`);
}

let html = readFileSync(GOVERNANCE_FILE, 'utf8');
html = replaceGeneratedDirectory(html, governance.map(renderRow).join('\n'));
html = updateStaticCount(html, governance.length, ordered.length);
writeFileSync(GOVERNANCE_FILE, html, 'utf8');

console.log(
  `[generate-governance-directory] wrote ${governance.length} governance row(s); ${ordered.length} active project(s) total.`
);

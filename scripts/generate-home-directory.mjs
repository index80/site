#!/usr/bin/env node
/**
 * INDEX:80 static homepage-directory generator.
 *
 * Progressive enhancement: every published project profile link is written
 * into public_html/index.html at build time from the same projects.json used
 * by the project-page and sitemap generators. assets/js/directory.js may then
 * enhance those rows with filtering/search/sorting in the browser, but the
 * directory remains complete and crawlable without JavaScript.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Shared "confirmed Treasury-funded" rule — see assets/js/treasury-rule.js.
const Treasury = createRequire(import.meta.url)('../public_html/assets/js/treasury-rule.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const DATA_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const RELATIONS_FILE = join(PUBLIC_HTML, 'data', 'project-relations.json');
const HOME_FILE = join(PUBLIC_HTML, 'index.html');

const START_MARKER = '<!-- INDEX80_DIRECTORY_START -->';
const END_MARKER = '<!-- INDEX80_DIRECTORY_END -->';
const SLUG_RE = /^[a-z0-9-]+$/;

const CATEGORY_ICON = {
  wallet: 'wallet',
  dex: 'dex',
  defi: 'dex',
  lending: 'dex',
  derivatives: 'dex',
  governance: 'governance',
  analytics: 'analytics',
  explorer: 'explorer',
  nft: 'nft',
  infrastructure: 'infrastructure',
  'stake-pools': 'infrastructure',
  'developer-tool': 'developer',
  education: 'education',
  ai: 'ai',
  game: 'nft',
  utility: 'infrastructure',
  'token-project': 'nft',
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

const catLabel = (cat) => String(cat).replace(/-/g, ' ').toUpperCase();
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
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

// Archived records keep their own static page (generate-project-pages.mjs
// still builds it) but are a human editorial decision to retire from active
// discovery — never list them in the homepage directory. Applied wherever
// validProject() gates an *active listing* surface (this file,
// generate-site-schema.mjs's ItemList, directory.js's client search); never
// applied in generate-project-pages.mjs, which must keep building the page.
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

function icon(name) {
  return `<svg class="icon dir-icon" aria-hidden="true"><use href="assets/icons/icons.svg#icon-${name}"></use></svg>`;
}

function renderRow(p, index) {
  const catIcon = CATEGORY_ICON[p.category] || 'infrastructure';
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
    ? `<span class="dir-treasury" aria-label="Treasury funded" title="Confirmed Cardano Treasury funding on record">₳</span> `
    : '';

  return `        <li class="dir-row">
          <span class="dir-index">${num}</span>
          ${icon(catIcon)}
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
    throw new Error('Homepage directory generation markers are missing or out of order.');
  }
  if (html.indexOf(START_MARKER, start + START_MARKER.length) !== -1 ||
      html.indexOf(END_MARKER, end + END_MARKER.length) !== -1) {
    throw new Error('Homepage directory generation markers must occur exactly once.');
  }

  const contentStart = start + START_MARKER.length;
  return html.slice(0, contentStart) + '\n' + rows + '\n        ' + html.slice(end);
}

function updateStaticCount(html, count) {
  const pattern = /(<span id="directory-count" class="directory-count">)[^<]*(<\/span>)/;
  if (!pattern.test(html)) throw new Error('Homepage directory count element was not found.');
  return html.replace(pattern, `$1${count} RECORDS$2`);
}

function main() {
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const projects = (data.projects || []).filter(isListable);
  const fallbackRelations = loadFallbackRelations();
  const relations = effectiveRelations(projects, fallbackRelations);
  const ordered = orderByRelations(projects, relations);

  if (ordered.length !== projects.length) {
    throw new Error(`Relation ordering emitted ${ordered.length} rows for ${projects.length} valid projects.`);
  }

  const rows = ordered.map(renderRow).join('\n');
  let html = readFileSync(HOME_FILE, 'utf8');
  html = replaceGeneratedDirectory(html, rows);
  html = updateStaticCount(html, ordered.length);
  writeFileSync(HOME_FILE, html, 'utf8');

  console.log(`[generate-home-directory] wrote ${ordered.length} static project row(s) to public_html/index.html`);
}

main();

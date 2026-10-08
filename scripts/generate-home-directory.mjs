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
import { esc, safeUrl } from './lib/html-safety.mjs';
import { buildHistory } from './generate-registry-history.mjs';

// Shared "confirmed Treasury-funded" rule — see assets/js/treasury-rule.js.
const Treasury = createRequire(import.meta.url)('../public_html/assets/js/treasury-rule.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const DATA_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const PEOPLE_FILE = join(PUBLIC_HTML, 'data', 'people.json');
const RELATIONS_FILE = join(PUBLIC_HTML, 'data', 'project-relations.json');
const HOME_FILE = join(PUBLIC_HTML, 'index.html');

const START_MARKER = '<!-- INDEX80_DIRECTORY_START -->';
const END_MARKER = '<!-- INDEX80_DIRECTORY_END -->';
const CURRENT_START = '<!-- INDEX80_CURRENT_STATE_START -->';
const CURRENT_END = '<!-- INDEX80_CURRENT_STATE_END -->';
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

function replaceCurrentState(html, body) {
  const start = html.indexOf(CURRENT_START);
  const end = html.indexOf(CURRENT_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Homepage current-state markers are missing or out of order.');
  }
  const contentStart = start + CURRENT_START.length;
  return html.slice(0, contentStart) + '\n' + body + '\n      ' + html.slice(end);
}

// Each WHAT'S CURRENT date is read from the governed dataset it describes —
// never the build clock — so a rebuild cannot make old data look fresh. A
// missing or malformed date renders as an explicit "UNDATED", not a guess.
export function isoDay(value) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
  return m && !Number.isNaN(Date.parse(m[1] + 'T00:00:00Z')) ? m[1] : null;
}

function datedLabel(prefix, iso) {
  if (!iso) return `${prefix} UNDATED`;
  const display = new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' })
    .format(new Date(iso + 'T00:00:00Z')).toUpperCase();
  return `${prefix} <time datetime="${iso}">${esc(display)}</time>`;
}

export function currentStateBody(projects, people, registryIndex, dates = {}) {
  const governanceCount = projects.filter((p) => p.category === 'governance').length;
  const latestId = registryIndex.latest_release_id || 'LATEST RELEASE';
  const latest = (registryIndex.releases || []).find((release) => release.release_id === latestId);
  const projectsDate = isoDay(dates.projects);
  const peopleDate = isoDay(dates.people);
  const proofDate = isoDay(latest?.proof?.confirmation_observed?.date);

  // Window chrome, shortcuts and the trust line are static in index.html;
  // only the data-tied tiles are generated.
  return `        <div class="current-state-grid">
          <a class="current-state-item" href="#directory"><span>PROJECTS</span><strong>${projects.length}</strong><small>LISTED · ${datedLabel('DATA', projectsDate)}</small></a>
          <a class="current-state-item" href="/people/"><span>PEOPLE</span><strong>${people.length}</strong><small>PUBLIC PROFILES · ${datedLabel('DATA', peopleDate)}</small></a>
          <a class="current-state-item" href="/governance/"><span>GOVERNANCE</span><strong>${governanceCount}</strong><small>LISTED · ${datedLabel('DATA', projectsDate)}</small></a>
          <a class="current-state-item" href="/registry/"><span>REGISTRY</span><strong>${esc(latestId)}</strong><small>${proofDate ? datedLabel('MAINNET PROOF ·', proofDate) : 'MAINNET PROOF · SEE REGISTRY'}</small></a>
        </div>`;
}

function main() {
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const peopleData = JSON.parse(readFileSync(PEOPLE_FILE, 'utf8'));
  // Read governed releases/receipts directly: index.json is refreshed later
  // in the build, so using it here would lag one build behind a new proof.
  const registryIndex = buildHistory();
  const projects = (data.projects || []).filter(isListable);
  const people = Array.isArray(peopleData.people) ? peopleData.people : [];
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
  html = replaceCurrentState(html, currentStateBody(ordered, people, registryIndex, {
    projects: data.generated_at,
    people: peopleData.generated,
  }));
  writeFileSync(HOME_FILE, html, 'utf8');

  console.log(`[generate-home-directory] wrote ${ordered.length} static project row(s) to public_html/index.html`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

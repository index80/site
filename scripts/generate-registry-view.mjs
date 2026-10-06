#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, safeUrl } from './lib/html-safety.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const HISTORY_FILE = join(PUBLIC, 'registry', 'index.json');
const VIEW_FILE = join(PUBLIC, 'registry', 'view', 'index.html');

const HEADER_START = '<!-- INDEX80_REGISTRY_VIEW_HEADER_START -->';
const HEADER_END = '<!-- INDEX80_REGISTRY_VIEW_HEADER_END -->';
const TOOLBAR_START = '<!-- INDEX80_REGISTRY_VIEW_TOOLBAR_START -->';
const TOOLBAR_END = '<!-- INDEX80_REGISTRY_VIEW_TOOLBAR_END -->';
const ROWS_START = '<!-- INDEX80_REGISTRY_VIEW_ROWS_START -->';
const ROWS_END = '<!-- INDEX80_REGISTRY_VIEW_ROWS_END -->';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function replaceBetween(html, startMarker, endMarker, content, label) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`${label}: generation markers missing or out of order`);
  }
  if (
    html.indexOf(startMarker, start + startMarker.length) !== -1 ||
    html.indexOf(endMarker, end + endMarker.length) !== -1
  ) {
    throw new Error(`${label}: generation markers must occur exactly once`);
  }
  return html.slice(0, start + startMarker.length)
    + '\n'
    + content
    + '\n'
    + html.slice(end);
}

function releaseSlug(releaseId) {
  const slug = String(releaseId || '').toLowerCase();
  if (!/^index80-\d{4,}$/.test(slug)) throw new Error(`Invalid latest release ID: ${releaseId}`);
  return slug;
}

function snapshotFileFromPath(snapshotPath) {
  if (!/^\/registry\/snapshots\/[a-z0-9-]+\.json$/.test(snapshotPath || '')) {
    throw new Error(`Invalid registry snapshot path: ${snapshotPath}`);
  }
  return join(PUBLIC, snapshotPath.replace(/^\//, ''));
}

function renderRow(project) {
  const slug = String(project?.slug || '');
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid project slug in snapshot: ${slug}`);
  const familyCategory = [project.public_family, project.category].filter(Boolean).join(' / ') || '—';
  const external = safeUrl(project.official_url) || safeUrl(project.primary_link_url);
  return `          <tr data-project-slug="${esc(slug)}">
            <td class="project-name"><a href="/projects/${esc(slug)}/">${esc(project.name || '')}</a></td>
            <td>${esc(familyCategory)}</td>
            <td class="project-status">${esc(project.status || '—')}</td>
            <td class="project-summary">${esc(project.summary || '—')}</td>
            <td class="project-link">${external ? `<a href="${esc(external)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : '—'}</td>
          </tr>`;
}

const history = readJson(HISTORY_FILE);
const slug = releaseSlug(history.latest_release_id);
const manifest = readJson(join(PUBLIC, 'registry', 'releases', `${slug}.json`));
if (String(manifest.release_id || '').toLowerCase() !== slug) {
  throw new Error(`Release manifest ID does not match ${slug}`);
}

const snapshotPath = manifest.snapshot?.path;
const snapshot = readJson(snapshotFileFromPath(snapshotPath));
const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
const people = Array.isArray(snapshot.people) ? snapshot.people : [];
const projectCount = Number(snapshot.project_count ?? manifest.snapshot?.project_count ?? projects.length);
const peopleCount = Number(snapshot.people_count ?? manifest.snapshot?.people_count ?? people.length);

if (projects.length !== projectCount) {
  throw new Error(`Registry snapshot project count ${projects.length} != declared ${projectCount}`);
}
if (Array.isArray(snapshot.people) && people.length !== peopleCount) {
  throw new Error(`Registry snapshot people count ${people.length} != declared ${peopleCount}`);
}

const releaseId = String(manifest.release_id || history.latest_release_id);
const network = String(manifest.cardano?.network || '').toUpperCase() || 'UNKNOWN';
const hash = String(manifest.snapshot?.hash || '—');

const header = `      <h1 id="snapshot-title">${esc(releaseId)}</h1>
      <p id="snapshot-intro">Human-readable view of the immutable ${esc(releaseId)} public registry snapshot.</p>
      <div class="registry-snapshot-meta" id="snapshot-meta">
        <span>${projectCount} projects</span>
        <span>${peopleCount} people</span>
        <span>${esc(network)} proof target</span>
        <span>SHA-256 ${esc(hash)}</span>
      </div>`;

const toolbar = `      <span id="snapshot-count" class="registry-snapshot-count">${projectCount} PROJECTS · ${peopleCount} PEOPLE</span>
      <a id="raw-json-link" class="button" href="${esc(snapshotPath)}">RAW JSON</a>`;

let html = readFileSync(VIEW_FILE, 'utf8');
html = replaceBetween(html, HEADER_START, HEADER_END, header, 'registry view header');
html = replaceBetween(html, TOOLBAR_START, TOOLBAR_END, toolbar, 'registry view toolbar');
html = replaceBetween(html, ROWS_START, ROWS_END, projects.map(renderRow).join('\n'), 'registry view rows');
html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(releaseId)} Snapshot — INDEX:80 / CARDANO</title>`);
// Sprint 4B.1 indexing policy: this human view of an immutable snapshot
// duplicates project content, so it is kept out of search results (links stay
// followable) and out of the sitemap, global search and llms.txt. Exactly one
// robots directive, placed after the description, whatever the template holds.
const ROBOTS_META = '<meta name="robots" content="noindex, follow">';
html = html.replace(/\n\s*<meta name="robots"[^>]*>/g, '');
const descriptionMeta = html.match(/\n(\s*)<meta name="description"[^>]*>/);
if (!descriptionMeta) throw new Error('registry view: description meta missing');
html = html.replace(descriptionMeta[0], `${descriptionMeta[0]}\n${descriptionMeta[1]}${ROBOTS_META}`);
writeFileSync(VIEW_FILE, html, 'utf8');

console.log(`[generate-registry-view] wrote ${projectCount} project row(s) for ${releaseId}; ${peopleCount} people declared.`);

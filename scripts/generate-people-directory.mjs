#!/usr/bin/env node
/**
 * INDEX:80 People directory generator.
 *
 * Reads public_html/data/people.json and writes the owner-approved release
 * into public_html/people/index.html. The browser enhancer may filter/search
 * the same data, but the complete directory remains usable without JS.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeAvatarPath, validatePublicPerson } from './lib/people-public.mjs';
import { directoryMeta } from './lib/people-seo.mjs';
import { hasVerifiedDrep, hasVerifiedSpo, initials } from './lib/people-display.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT, 'public_html', 'data', 'people.json');
const PAGE_FILE = join(ROOT, 'public_html', 'people', 'index.html');
const START = '<!-- INDEX80_PEOPLE_DIRECTORY_START -->';
const END = '<!-- INDEX80_PEOPLE_DIRECTORY_END -->';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

function validPerson(p) {
  validatePublicPerson(p, {publicRoot:join(ROOT, 'public_html')});
  return Boolean(p.name && p.primary_category && Array.isArray(p.role_tags));
}

function summary(p) {
  const role = p.role_tags.join(', ');
  const linked = Array.isArray(p.linked_projects) && p.linked_projects.length
    ? ` · ${p.linked_projects.join(', ')}`
    : '';
  return `${role}${linked}`;
}

function external(p) {
  return p.x_url || p.linkedin_url || null;
}

// Small avatar: approved avatar, else a monogram.
function thumb(p) {
  const src = safeAvatarPath(p.avatar_url);
  if (src) return `<img class="dir-thumb" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  return `<span class="dir-thumb dir-thumb-fallback" aria-hidden="true">${esc(initials(p.name))}</span>`;
}

function badges(p) {
  return [
    hasVerifiedDrep(p) ? '<span class="dir-badge" title="Verified active DRep">DREP</span>' : '',
    hasVerifiedSpo(p) ? '<span class="dir-badge" title="Verified active stake pool operator">SPO</span>' : '',
  ].join('');
}

function renderRow(p, index) {
  const num = String(index + 1).padStart(2, '0');
  const name = p.profile_url
    ? `<a class="dir-name" href="${esc(p.profile_url)}">${esc(p.name)}</a>`
    : `<span class="dir-name">${esc(p.name)}</span>`;
  const outbound = external(p)
    ? `<a class="dir-link" href="${esc(external(p))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.name)} public profile in a new tab">↗</a>`
    : '<span class="dir-link" aria-hidden="true"></span>';

  return `        <li class="dir-row">
          <span class="dir-index">${num}</span>
          <svg class="icon dir-icon" aria-hidden="true"><use href="/assets/icons/icons.svg#icon-${esc(p.icon || 'infrastructure')}"></use></svg>
          <span class="dir-person">${thumb(p)}${name}${badges(p)}</span>
          <span class="dir-desc">${esc(summary(p))}</span>
          <span class="dir-cat">${esc(p.filter_label || p.primary_category.toUpperCase())}</span>
          ${outbound}
        </li>`;
}

const SITE = 'https://index80.com';
const SHARE_IMAGE_URL = `${SITE}/assets/people/people-hero.jpg`;
const META_START = '<!-- INDEX80_PEOPLE_META_START -->';
const META_END = '<!-- INDEX80_PEOPLE_META_END -->';
const SCHEMA_START = '<!-- INDEX80_PEOPLE_SCHEMA_START -->';
const SCHEMA_END = '<!-- INDEX80_PEOPLE_SCHEMA_END -->';

function replaceBlock(html, startMarker, endMarker, body) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) throw new Error(`People directory ${startMarker} markers missing or out of order.`);
  return html.slice(0, start + startMarker.length) + '\n' + body + '\n  ' + html.slice(end);
}

function metaBlock(people) {
  const { title, description } = directoryMeta(people);
  return [
    `  <meta name="description" content="${esc(description)}">`,
    `  <title>${esc(title)}</title>`,
    `  <link rel="canonical" href="${SITE}/people/">`,
    `  <meta property="og:title" content="${esc(title)}">`,
    `  <meta property="og:description" content="${esc(description)}">`,
    `  <meta property="og:url" content="${SITE}/people/">`,
    `  <meta property="og:type" content="website">`,
    `  <meta property="og:site_name" content="INDEX:80">`,
    `  <meta property="og:image" content="${SHARE_IMAGE_URL}">`,
    `  <meta name="twitter:card" content="summary_large_image">`,
    `  <meta name="twitter:title" content="${esc(title)}">`,
    `  <meta name="twitter:description" content="${esc(description)}">`,
    `  <meta name="twitter:image" content="${SHARE_IMAGE_URL}">`,
  ].join('\n');
}

function schemaBlock(people, generated) {
  const { description } = directoryMeta(people);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/people/#directory`,
        url: `${SITE}/people/`,
        name: 'INDEX:80 People',
        description,
        isPartOf: { '@id': `${SITE}/#website` },
        ...(generated ? { dateModified: generated } : {}),
        breadcrumb: { '@id': `${SITE}/people/#breadcrumb` },
        mainEntity: { '@id': `${SITE}/people/#people-list` },
        // Machine-readable copy of the same records; no private editorial fields.
        subjectOf: { '@type': 'Dataset', name: 'INDEX:80 People dataset', url: `${SITE}/data/people.json`, encodingFormat: 'application/json', description: 'Machine-readable copy of the public People directory records.' },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE}/people/#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'INDEX:80', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'People', item: `${SITE}/people/` },
        ],
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE}/people/#people-list`,
        name: 'Cardano people directory',
        numberOfItems: people.length,
        itemListElement: people.map((p, i) => ({
          '@type': 'ListItem', position: i + 1, name: p.name, url: `${SITE}/people/${p.slug}/`, item: `${SITE}/people/${p.slug}/`,
        })),
      },
    ],
  };
  return `  <script type="application/ld+json">${JSON.stringify(graph, null, 2).replace(/<\/script/gi, '<\\/script')}</script>`;
}

const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const people = (data.people || []).filter(validPerson);
const rows = people.map(renderRow).join('\n');

let html = readFileSync(PAGE_FILE, 'utf8');
const start = html.indexOf(START);
const end = html.indexOf(END);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('People directory generation markers are missing or out of order.');
}
if (html.indexOf(START, start + START.length) !== -1 || html.indexOf(END, end + END.length) !== -1) {
  throw new Error('People directory generation markers must occur exactly once.');
}
html = html.slice(0, start + START.length) + '\n' + rows + '\n        ' + html.slice(end);
html = replaceBlock(html, META_START, META_END, metaBlock(people));
html = replaceBlock(html, SCHEMA_START, SCHEMA_END, schemaBlock(people, data.generated));
html = html.replace(/ data-pfp-review="[^"]*"/, '');
html = html.replace(
  /(<span id="people-directory-count" class="directory-count">)[^<]*(<\/span>)/,
  `$1${people.length} RECORDS$2`
);
writeFileSync(PAGE_FILE, html, 'utf8');
console.log(`[generate-people-directory] wrote ${people.length} public release row(s)`);

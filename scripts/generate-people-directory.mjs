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
import { hasVerifiedDrep, hasVerifiedSpo, initials } from './lib/people-display.mjs';
import { loadReviewMap, REVIEW_MAP_FILE } from './lib/people-pfp-review.mjs';

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

const review = loadReviewMap(join(ROOT, 'public_html'));

// Small avatar: approved avatar, else the DEV-only review candidate, else a monogram.
function thumb(p) {
  const approved = safeAvatarPath(p.avatar_url);
  const candidate = !approved && review?.images?.[p.slug]?.path;
  const src = approved || candidate;
  if (src) return `<img class="dir-thumb${candidate ? ' dir-thumb-review' : ''}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
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
// The DEV review map is referenced only when review mode staged it for this build.
html = html.replace(/ data-pfp-review="[^"]*"/, '');
if (review) html = html.replace('data-people-directory ', `data-people-directory data-pfp-review="/${REVIEW_MAP_FILE}" `);
html = html.replace(
  /(<span id="people-directory-count" class="directory-count">)[^<]*(<\/span>)/,
  `$1${people.length} RECORDS$2`
);
writeFileSync(PAGE_FILE, html, 'utf8');
console.log(`[generate-people-directory] wrote ${people.length} public release row(s)`);

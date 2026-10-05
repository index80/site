#!/usr/bin/env node
/**
 * Generate the static INDEX:80 trust floor for /data/.
 *
 * Live market/network data is optional enhancement. Core INDEX:80 ecosystem
 * facts are written into HTML at build time from governed local release data
 * so the page remains useful when external services or JavaScript fail.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const PROJECTS_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const PEOPLE_FILE = join(PUBLIC_HTML, 'data', 'people.json');
const DATA_PAGE = join(PUBLIC_HTML, 'data', 'index.html');

const STATUS_START = '<!-- INDEX80_DATA_STATUS_START -->';
const STATUS_END = '<!-- INDEX80_DATA_STATUS_END -->';
const ECOSYSTEM_START = '<!-- INDEX80_DATA_ECOSYSTEM_START -->';
const ECOSYSTEM_END = '<!-- INDEX80_DATA_ECOSYSTEM_END -->';
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

function isListable(p) {
  return validProject(p) && p.status !== 'archived';
}

function formatAsOf(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'CURRENT RELEASE';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date).toUpperCase() + ' UTC';
}

function replaceBetween(html, startMarker, endMarker, body, label) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`${label}: markers are missing or out of order.`);
  }
  if (
    html.indexOf(startMarker, start + startMarker.length) !== -1 ||
    html.indexOf(endMarker, end + endMarker.length) !== -1
  ) {
    throw new Error(`${label}: markers must occur exactly once.`);
  }
  const contentStart = start + startMarker.length;
  return html.slice(0, contentStart) + body + html.slice(end);
}

function metric(label, value, note) {
  return `<div class="data-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
}

const projectData = JSON.parse(readFileSync(PROJECTS_FILE, 'utf8'));
const peopleData = JSON.parse(readFileSync(PEOPLE_FILE, 'utf8'));
const projects = projectData.projects || [];
const active = projects.filter(isListable);
const archived = projects.filter((p) => validProject(p) && p.status === 'archived');
const governance = active.filter((p) => p.category === 'governance');
const people = Array.isArray(peopleData.people) ? peopleData.people : [];
const asOf = formatAsOf(projectData.generated_at || peopleData.generated);

const status = `<strong>INDEX:80 STATIC SNAPSHOT</strong><span>AS OF ${asOf}</span><span>LIVE CARDANO DATA ENHANCES WHEN AVAILABLE</span>`;
const ecosystem = [
  metric('ACTIVE PROJECTS', active.length, 'CURRENT INDEX:80 RELEASE'),
  metric('PEOPLE', people.length, 'CURRENT PEOPLE RELEASE'),
  metric('GOVERNANCE RECORDS', governance.length, 'ACTIVE GOVERNANCE CATEGORY'),
  metric('ARCHIVED RECORDS', archived.length, 'RETAINED HISTORY · NOT ACTIVE'),
].join('');

let html = readFileSync(DATA_PAGE, 'utf8');
html = replaceBetween(html, STATUS_START, STATUS_END, status, 'data status');
html = replaceBetween(html, ECOSYSTEM_START, ECOSYSTEM_END, ecosystem, 'data ecosystem');
writeFileSync(DATA_PAGE, html, 'utf8');

console.log(
  `[generate-data-page] wrote static trust floor: ${active.length} active projects, ${people.length} People, ${governance.length} governance, ${archived.length} archived.`
);

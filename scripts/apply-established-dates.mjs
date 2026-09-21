#!/usr/bin/env node
/**
 * Applies public project-age metadata to generated static project pages.
 *
 * Priority:
 *   1. Editorial Registry `Established` date -> ESTABLISHED
 *      - normally supplied by projects.json
 *      - while the data exporter is being synchronised, a
 *        derived review-data/editorial-dates.json snapshot may supply the
 *        same canonical Registry value without hard-coding page content
 *   2. Earliest independently observed web evidence from the link-history
 *      dataset -> EARLIEST WEB EVIDENCE
 *
 * Earliest web evidence is deliberately labelled as evidence rather than a
 * founding/launch date. Domain-registration dates are no longer promoted as
 * the main public age metric because an old/reused domain can pre-date the
 * project by many years. Existing DOMAIN REGISTERED metrics are removed when
 * pages are regenerated.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = join(ROOT, 'public_html', 'data', 'projects.json');
const LINK_HISTORY_PATH = join(ROOT, 'public_html', 'data', 'project-link-history.json');
const EDITORIAL_DATES_PATH = join(ROOT, 'review-data', 'editorial-dates.json');
const PROJECTS_DIR = join(ROOT, 'public_html', 'projects');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return fallback; }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function displayDate(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';

  // Link-history evidence is stored as an ISO timestamp. The public metric
  // needs calendar precision only, so normalise to YYYY-MM-DD first.
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoPrefix) raw = isoPrefix[1];

  let match = raw.match(/^(\d{4})$/);
  if (match) return match[1];

  match = raw.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return `${MONTHS[month - 1]} ${match[1]}`;
    return raw;
  }

  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${day} ${MONTHS[month - 1]} ${match[1]}`;
    }
  }

  return raw;
}

const LAST_CHECKED_RE = /\s*<div><span>LAST CHECKED<\/span><strong>[^<]*<\/strong><\/div>/;
const ESTABLISHED_RE = /\s*<div><span(?: class="metric-label")?>?(?:<svg[\s\S]*?<\/svg>)?ESTABLISHED<\/span><strong>[^<]*<\/strong><\/div>/;
const DOMAIN_REGISTERED_RE = /\s*<div><span title="Registration date of the current official domain; not necessarily the project founding date\.">DOMAIN REGISTERED<\/span><strong>[^<]*<\/strong><\/div>/;
const EARLIEST_EVIDENCE_RE = /\s*<div><span title="Earliest independently observed web evidence; not necessarily the project founding or launch date\.">EARLIEST WEB EVIDENCE<\/span><strong>[^<]*<\/strong><\/div>/;

const data = loadJson(DATA_PATH, { projects: [] });
const linkHistory = loadJson(LINK_HISTORY_PATH, { records: [] });
const editorialDates = loadJson(EDITORIAL_DATES_PATH, { records: {} });
const linkHistoryBySlug = new Map((linkHistory.records || []).map((record) => [record.slug, record]));

function establishedFor(project) {
  return project.established || editorialDates.records?.[project.slug]?.established || '';
}

function ageMetric(project, historyRecord) {
  const established = displayDate(establishedFor(project));
  if (established) {
    return `<div><span>ESTABLISHED</span><strong>${esc(established)}</strong></div>`;
  }

  const earliestEvidence = displayDate(historyRecord?.earliest_web_evidence?.at);
  if (earliestEvidence) {
    return `<div><span title="Earliest independently observed web evidence; not necessarily the project founding or launch date.">EARLIEST WEB EVIDENCE</span><strong>${esc(earliestEvidence)}</strong></div>`;
  }

  return '';
}

function applyToPage(project, historyRecord) {
  const path = join(PROJECTS_DIR, project.slug, 'index.html');
  if (!existsSync(path)) return false;

  let html = readFileSync(path, 'utf8');
  const metric = ageMetric(project, historyRecord);

  // Replace any previously generated age metric. This deliberately removes
  // DOMAIN REGISTERED from the main public metric area even if no stronger
  // date is available.
  if (ESTABLISHED_RE.test(html)) {
    html = html.replace(ESTABLISHED_RE, metric ? `\n    ${metric}` : '');
  } else if (EARLIEST_EVIDENCE_RE.test(html)) {
    html = html.replace(EARLIEST_EVIDENCE_RE, metric ? `\n    ${metric}` : '');
  } else if (DOMAIN_REGISTERED_RE.test(html)) {
    html = html.replace(DOMAIN_REGISTERED_RE, metric ? `\n    ${metric}` : '');
  } else if (LAST_CHECKED_RE.test(html)) {
    html = html.replace(LAST_CHECKED_RE, metric ? `\n    ${metric}` : '');
  } else if (metric) {
    const categoryMetric = `<div><span>DETAILED CATEGORY</span><strong>${esc(String(project.category || '').replace(/-/g, ' ').toUpperCase())}</strong></div>`;
    if (html.includes(categoryMetric)) {
      html = html.replace(categoryMetric, `${categoryMetric}\n    ${metric}`);
    } else {
      console.warn(`[project-age] Could not find metadata insertion point for ${project.slug}`);
      return false;
    }
  }

  writeFileSync(path, html, 'utf8');
  return true;
}

let touched = 0;
let withEstablished = 0;
let withEvidenceFallback = 0;
let withNoAgeMetric = 0;

for (const project of data.projects || []) {
  const historyRecord = linkHistoryBySlug.get(project.slug);
  if (establishedFor(project)) withEstablished += 1;
  else if (historyRecord?.earliest_web_evidence) withEvidenceFallback += 1;
  else withNoAgeMetric += 1;
  if (applyToPage(project, historyRecord)) touched += 1;
}

console.log(`[project-age] processed ${touched} page(s); ${withEstablished} Established; ${withEvidenceFallback} earliest-web-evidence fallback(s); ${withNoAgeMetric} without age metric.`);

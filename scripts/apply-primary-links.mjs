#!/usr/bin/env node
/**
 * Applies the Editorial Registry's explicit Primary Link choice to generated
 * static project pages. This is a post-generation layer for the same reason
 * dates/relationships are: the Registry is authoritative and the shared page
 * generator must not guess a different destination when an editor has chosen
 * one explicitly.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = join(ROOT, 'public_html', 'data', 'projects.json');
const HISTORY_PATH = join(ROOT, 'public_html', 'data', 'project-link-history.json');
const PROJECTS_DIR = join(ROOT, 'public_html', 'projects');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const safeUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null;
const BAD = new Set(['DEAD', 'SUNSET', 'PARKED']);

// linkedin_url is intentionally absent from TYPE_TO_FIELD below: LinkedIn is
// always a secondary social link and must never be selectable as the primary
// CTA, however primary_link_type is set.
const FIELDS = ['official_url','marketplace_url','docs_url','github_url','social_url','linkedin_url','discord_url','explorer_url'];
const LABELS = {
  official_url:'Official site', marketplace_url:'Marketplace / App', docs_url:'Documentation',
  github_url:'GitHub', social_url:'Social / X', linkedin_url:'LinkedIn', discord_url:'Discord / Community', explorer_url:'Explorer'
};
const CTA = {
  official_url:'VISIT OFFICIAL SITE ↗', marketplace_url:'OPEN THE APP ↗', docs_url:'READ THE DOCUMENTATION ↗',
  github_url:'VIEW ON GITHUB ↗', social_url:'VISIT ON X / SOCIAL ↗', linkedin_url:'VISIT ON LINKEDIN ↗',
  discord_url:'JOIN THE COMMUNITY ↗', explorer_url:'VIEW ON EXPLORER ↗'
};
const TYPE_TO_FIELD = {
  website:'official_url', site:'official_url', official:'official_url',
  app:'marketplace_url', marketplace:'marketplace_url', 'marketplace/app':'marketplace_url',
  docs:'docs_url', documentation:'docs_url', github:'github_url', code:'github_url',
  x:'social_url', social:'social_url', twitter:'social_url', discord:'discord_url', community:'discord_url', explorer:'explorer_url'
};

function load(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

const data = load(DATA_PATH, {projects:[]});
const history = load(HISTORY_PATH, {records:[]});
const historyBySlug = new Map((history.records || []).map((r) => [r.slug, r]));

function fieldForPrimary(p) {
  const url = safeUrl(p.primary_link_url);
  if (!url) return null;
  const byUrl = FIELDS.find((k) => safeUrl(p[k]) === url);
  if (byUrl) return byUrl;
  return TYPE_TO_FIELD[String(p.primary_link_type || '').trim().toLowerCase()] || 'primary_link_url';
}

function stateFor(slug, field) {
  if (field === 'primary_link_url') return null;
  return historyBySlug.get(slug)?.links?.[field]?.state || null;
}

// Kept in sync with formatLinkDestination() in generate-project-pages.mjs —
// this postprocessor rewrites the same .profile-cta markup whenever a
// project has an explicit Registry primary_link_url (all current
// projects do), so the hover/focus destination hint has to be re-applied
// here too or it's silently lost the moment this script runs.
function formatLinkDestination(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  const path = u.pathname.replace(/\/+$/, '');
  let dest = path ? `${u.hostname}${path}` : u.hostname;
  if (dest.length > 40) dest = `${dest.slice(0, 37)}…`;
  return dest;
}

function button(label, url, primary, suppressed) {
  if (suppressed) {
    return `<span class="button is-link-suppressed${primary ? ' cta-primary' : ''}" aria-disabled="true" title="Flagged by automated verification — currently unavailable, pending editorial review">${esc(label)} — unavailable ⚠</span>`;
  }
  const body = primary ? esc(label) : `<svg class="icon dir-link-icon" aria-hidden="true"><use href="/assets/icons/icons.svg#icon-external-link"></use></svg> ${esc(label)} →`;
  return `<a class="button${primary ? ' cta-primary' : ''}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-dest="${esc(formatLinkDestination(url))}">${body}</a>`;
}

function replaceJsonLd(html, primaryUrl) {
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (whole, raw) => {
    try {
      const json = JSON.parse(raw);
      const pages = Array.isArray(json['@graph']) ? json['@graph'] : [json];
      const page = pages.find((x) => x && x['@type'] === 'WebPage');
      if (page?.about && typeof page.about === 'object') page.about.url = primaryUrl;
      return `<script type="application/ld+json">${JSON.stringify(json, null, 2)}\n</script>`;
    } catch { return whole; }
  });
}

let touched = 0;
for (const p of data.projects || []) {
  const primaryUrl = safeUrl(p.primary_link_url);
  if (!primaryUrl) continue;
  const path = join(PROJECTS_DIR, p.slug, 'index.html');
  if (!existsSync(path)) continue;

  const primaryField = fieldForPrimary(p);
  const state = stateFor(p.slug, primaryField);
  const primarySuppressed = BAD.has(state);
  const primaryLabel = CTA[primaryField] || 'OPEN PRIMARY LINK ↗';

  const seen = new Set([primaryUrl]);
  const secondary = [];
  for (const field of FIELDS) {
    const url = safeUrl(p[field]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    secondary.push(button(LABELS[field], url, false, BAD.has(stateFor(p.slug, field))));
  }
  const buttons = button(primaryLabel, primaryUrl, true, primarySuppressed) + secondary.join('');

  let html = readFileSync(path, 'utf8');
  html = html.replace(/<div class="profile-cta">[\s\S]*?<\/div><\/div>\s*<div class="profile-info">/, `<div class="profile-cta"><div class="link-buttons">${buttons}</div></div>\n      <div class="profile-info">`);
  if (!primarySuppressed) html = replaceJsonLd(html, primaryUrl);
  writeFileSync(path, html, 'utf8');
  touched += 1;
}

console.log(`[primary-links] applied explicit editorial primary links to ${touched} page(s).`);

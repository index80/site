#!/usr/bin/env node
/**
 * Applies public relationship metadata to generated project pages.
 *
 * Source of truth remains the Editorial Registry. Published fields embedded
 * in projects.json take priority; public_html/data/project-relations.json is
 * a derived fallback so the dev/static build can show relationships before
 * the Registry data exporter has been synced to the latest repo code.
 *
 * This pass also adds small semantic record icons and linkifies explicit
 * public X handles in Founder / Lead fields. The icons are presentation only;
 * no editorial facts are inferred from them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS_PATH = join(ROOT, 'public_html', 'data', 'projects.json');
const RELATIONS_PATH = join(ROOT, 'public_html', 'data', 'project-relations.json');
const PROJECTS_DIR = join(ROOT, 'public_html', 'projects');

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

const CATEGORY_ICON = {
  wallet: 'wallet', dex: 'dex', defi: 'dex', lending: 'dex', derivatives: 'dex',
  governance: 'governance', analytics: 'analytics', explorer: 'explorer', nft: 'nft',
  infrastructure: 'infrastructure', 'developer-tool': 'developer', education: 'education',
  ai: 'ai', game: 'nft', utility: 'infrastructure', 'token-project': 'nft', depin: 'infrastructure',
};

function icon(name) {
  return `<svg class="icon record-icon" aria-hidden="true"><use href="/assets/icons/icons.svg#icon-${name}"></use></svg>`;
}

function metricLabel(label, iconName) {
  return `<span class="metric-label">${icon(iconName)}${esc(label)}</span>`;
}

function linkifyXHandles(value) {
  return esc(value).replace(/@([A-Za-z0-9_]{1,15})/g, (_match, handle) =>
    `<a class="identity-link" href="https://x.com/${handle}" target="_blank" rel="noopener noreferrer">@${handle}</a>`
  );
}

// V0.05 PROTOTYPE (colour/depth polish branch): record icons previously
// forced var(--blue) regardless of the project's own Public Family. They
// now prefer --family-accent-icon — set per data-family value in
// assets/css/site.css, itself written to <body> by
// generate-project-pages.mjs's familySlug() — and fall back to the exact
// previous var(--blue) when no family is set, so an unfamilied record
// (or any page this style block never reaches) renders unchanged.
const RECORD_ICON_STYLE = `<style data-record-icons>
  .profile-cat { display:flex; align-items:center; gap:.35rem; }
  .profile-cat .record-icon { width:.82rem; height:.82rem; color:var(--family-accent-icon, var(--blue)); flex:none; }
  .metric-label { display:flex !important; align-items:center; gap:.28rem; }
  .metric-label .record-icon { width:.68rem; height:.68rem; color:var(--family-accent-icon, var(--blue)); flex:none; }
  .identity-link { color:var(--blue); text-decoration:underline; text-underline-offset:2px; }
  .identity-link:hover { color:var(--ink); }
</style>`;

const data = loadJson(PROJECTS_PATH, { projects: [] });
const relations = loadJson(RELATIONS_PATH, { records: {} });
const bySlug = new Map((data.projects || []).map((p) => [p.slug, p]));

const RELATION_BLOCK_RE = /\s*<div data-editorial-relation="(?:team|founder|related)">[\s\S]*?<\/div>/g;
const CATEGORY_METRIC_RE = /(<div><span>DETAILED CATEGORY<\/span><strong>[^<]*<\/strong><\/div>)/;
const PROFILE_CAT_RE = /<p class="profile-cat">([^<]*)<\/p>/;
const EDITORIAL_NOTE_RE = /(<section class="panel profile-note">[\s\S]*?<p class="profile-summary"[^>]*>)[\s\S]*?(<\/p>[\s\S]*?<\/section>)/;
const RECORD_ICON_STYLE_RE = /\s*<style data-record-icons>[\s\S]*?<\/style>/g;

let touched = 0;
for (const project of data.projects || []) {
  const path = join(PROJECTS_DIR, project.slug, 'index.html');
  if (!existsSync(path)) continue;

  let html = readFileSync(path, 'utf8')
    .replace(RELATION_BLOCK_RE, '')
    .replace(RECORD_ICON_STYLE_RE, '');

  const fallback = relations.records?.[project.slug] || {};
  const meta = {
    team_entity: project.team_entity || fallback.team_entity || '',
    founder_lead: project.founder_lead || fallback.founder_lead || '',
    related_projects:
      Array.isArray(project.related_projects) && project.related_projects.length
        ? project.related_projects
        : (fallback.related_projects || []),
  };

  const blocks = [];
  if (meta.team_entity) {
    blocks.push(`<div data-editorial-relation="team">${metricLabel('TEAM / ENTITY', 'team')}<strong>${esc(meta.team_entity)}</strong></div>`);
  }
  if (meta.founder_lead) {
    blocks.push(`<div data-editorial-relation="founder">${metricLabel('FOUNDER / LEAD', 'person')}<strong>${linkifyXHandles(meta.founder_lead)}</strong></div>`);
  }

  const related = (meta.related_projects || [])
    .map((slug) => bySlug.get(slug))
    .filter(Boolean);
  if (related.length) {
    const links = related
      .map((p) => `<a href="/projects/${encodeURIComponent(p.slug)}/">${esc(p.name)} →</a>`)
      .join(' · ');
    blocks.push(`<div data-editorial-relation="related">${metricLabel('DIRECT CONNECTIONS', 'link')}<strong>${links}</strong></div>`);
  }

  if (blocks.length && CATEGORY_METRIC_RE.test(html)) {
    html = html.replace(CATEGORY_METRIC_RE, `$1\n    ${blocks.join('\n    ')}`);
    touched += 1;
  }

  // While the data exporter catches up with the canonical Registry,
  // allow the derived relation snapshot to carry the already-approved public
  // note too. This avoids showing a superseded personal-name form on dev.
  if (fallback.public_editorial_note && EDITORIAL_NOTE_RE.test(html)) {
    html = html.replace(
      EDITORIAL_NOTE_RE,
      `$1${esc(fallback.public_editorial_note)}$2`
    );
  }

  const categoryIcon = CATEGORY_ICON[project.category] || 'infrastructure';
  html = html.replace(
    PROFILE_CAT_RE,
    `<p class="profile-cat">${icon(categoryIcon)}<span>$1</span></p>`
  );

  const standardLabels = [
    ['PUBLIC FAMILY', 'family'],
    ['DETAILED CATEGORY', categoryIcon],
    ['ESTABLISHED', 'calendar'],
    ['DOMAIN REGISTERED', 'calendar'],
    ['POLICY ID / CONTRACT', 'id'],
  ];
  for (const [label, iconName] of standardLabels) {
    html = html.replace(`<span>${label}</span>`, metricLabel(label, iconName));
  }

  html = html.replace('</head>', `\n  ${RECORD_ICON_STYLE}\n</head>`);
  writeFileSync(path, html, 'utf8');
}

console.log(`[project-relations] applied relationship metadata to ${touched} page(s).`);

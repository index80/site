#!/usr/bin/env node
/**
 * Builds public_html/data/search-index.json — the single static index behind
 * the site-wide "SEARCH INDEX:80" control (assets/js/site-search.js).
 *
 * Sources are only data that is already public on the site:
 *   - data/projects.json   (fields rendered on project pages)
 *   - data/people.json     (the public People allowlist; DEV-public on this branch)
 *   - Learn / Governance topic cards, core page titles + descriptions,
 *     Methodology sections, and Registry release ids from registry/index.json.
 * Nothing is read from the private editorial registry, submissions, research notes or
 * editorial/PFP/contact state. Each entry carries only SEARCH_ITEM_KEYS.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
export const SEARCH_INDEX_FILE = join(PUBLIC, 'data', 'search-index.json');
export const SEARCH_INDEX_SCHEMA = 'index80-search-index/1';
export const SEARCH_ITEM_KEYS = ['type', 'title', 'subtitle', 'url', 'search_terms'];
export const SEARCH_TYPES = ['project', 'person', 'learn', 'governance', 'data', 'registry', 'page'];

const readJson = (rel) => JSON.parse(readFileSync(join(PUBLIC, rel), 'utf8'));
const readHtml = (rel) => readFileSync(join(PUBLIC, rel), 'utf8');
const decode = (s) => String(s ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** Same normalisation as site-search.js: lower-case, strip accents, punctuation → space. */
export function normalise(value) {
  return String(value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const terms = (...parts) => {
  const seen = new Set();
  for (const p of parts.flat(Infinity)) {
    const n = normalise(p);
    if (n) seen.add(n);
  }
  return [...seen].join(' | ');
};
const ACRONYMS = {dex:'DEX', nft:'NFT', ai:'AI', defi:'DeFi', depin:'DePIN', spo:'SPO', dao:'DAO'};
const label = (slug) => {
  const s = String(slug || '').split('-').filter(Boolean).map((w) => ACRONYMS[w] || w).join(' ');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
};
const item = (type, title, subtitle, url, search_terms) => ({type, title: decode(title), subtitle: decode(subtitle), url, search_terms});

function pageMeta(rel) {
  const html = readHtml(rel);
  return {
    title: decode(html.match(/<title>([^<]*)<\/title>/)?.[1]).replace(/\s+—\s+INDEX:80 \/ CARDANO$/, ''),
    description: decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1]),
    html,
  };
}

function topicCards(rel, url, type) {
  const out = [];
  for (const m of readHtml(rel).matchAll(/<article class="panel topic-card" id="([^"]+)">([\s\S]*?)<\/article>/g)) {
    const title = decode(m[2].match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]);
    const desc = decode(m[2].match(/<p>([\s\S]*?)<\/p>/)?.[1]);
    const linked = [...m[2].matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((a) => decode(a[1]).replace(/[↗→]/g, ''));
    out.push(item(type, title, desc.length > 110 ? `${desc.slice(0, 107).replace(/\s+\S*$/, '')}…` : desc, `${url}#${m[1]}`, terms(title, desc, linked)));
  }
  return out;
}

export function buildSearchIndex() {
  const items = [];
  const projectsRaw = readJson('data/projects.json');
  const projects = (Array.isArray(projectsRaw) ? projectsRaw : projectsRaw.projects || projectsRaw.records || [])
    .filter((p) => p.slug && existsSync(join(PUBLIC, 'projects', p.slug, 'index.html')));
  const people = readJson('data/people.json').people || [];

  // Cross-type links from public data only: a person's public linked projects
  // matched to project names, so "GranADA" surfaces the pool and its operator.
  const projectByName = new Map(projects.map((p) => [normalise(p.name), p]));
  const peopleByProject = new Map();
  for (const person of people) {
    for (const org of person.linked_projects || []) {
      const p = projectByName.get(normalise(org));
      if (!p) continue;
      if (!peopleByProject.has(p.slug)) peopleByProject.set(p.slug, []);
      peopleByProject.get(p.slug).push(person.name);
    }
  }

  for (const p of projects) {
    const archived = p.status === 'archived';
    items.push(item('project', p.name, [label(p.category), archived ? 'Archived' : ''].filter(Boolean).join(' · '), `/projects/${p.slug}/`, terms(
      p.name, p.slug, p.summary, p.public_family, label(p.category), p.tags || [],
      p.founder_lead, p.team_entity, p.policy_id, peopleByProject.get(p.slug) || [], archived ? 'archived' : '',
    )));
  }

  for (const person of people) {
    const linked = person.linked_projects || [];
    items.push(item('person', person.name, [person.role_tags?.[0], linked[0]].filter(Boolean).join(' · '), person.profile_url || `/people/${person.slug}/`, terms(
      person.name, person.profile_subtitle, person.primary_category, person.role_tags || [],
      person.current_roles || [], person.historic_roles || [], linked,
      person.pool_ticker, person.drep_id, person.drep_id ? 'drep' : '', person.pool_ticker ? ['spo', 'stake pool'] : [],
    )));
  }

  items.push(...topicCards('learn/index.html', '/learn/', 'learn'));
  items.push(...topicCards('governance/index.html', '/governance/', 'governance'));

  const CORE = [
    ['index.html', '/', 'page', 'Projects directory', 'Projects directory'],
    ['people/index.html', '/people/', 'page', 'People directory', 'People directory'],
    ['learn/index.html', '/learn/', 'learn', 'Learn'],
    ['governance/index.html', '/governance/', 'governance', 'Governance'],
    ['data/index.html', '/data/', 'data', 'Data'],
    ['registry/index.html', '/registry/', 'registry', 'Registry'],
    ['about/index.html', '/about/', 'page', 'About'],
    ['about/charter/index.html', '/about/charter/', 'page', 'Charter'],
    ['about/methodology/index.html', '/about/methodology/', 'page', 'Methodology'],
    ['submit/index.html', '/submit/', 'page', 'Submit / corrections'],
    ['privacy/index.html', '/privacy/', 'page', 'Privacy'],
  ];
  for (const [rel, url, type, kind, titleOverride] of CORE) {
    const meta = pageMeta(rel);
    const {description, html} = meta;
    const title = titleOverride || meta.title;
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)].map((m) => decode(m[1]));
    items.push(item(type, title, kind, url, terms(title, kind, description, headings)));
  }

  const method = readHtml('about/methodology/index.html');
  let section = '';
  for (const m of method.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)) {
    const heading = decode(m[3]);
    if (m[1] === '2') section = heading;
    // A sub-heading that repeats a section name (e.g. Corrections → People) is qualified by its section.
    const title = m[1] === '3' && /^(Projects|People)$/.test(heading) ? `${section} — ${heading}` : heading;
    const body = decode(method.slice(m.index, m.index + 900).split(/<h[23]/)[1] || '');
    items.push(item('page', `Methodology: ${title}`, 'How INDEX:80 publishes information', `/about/methodology/#${m[2]}`, terms(title, 'methodology', body.slice(0, 400))));
  }

  const registry = readJson('registry/index.json');
  for (const r of registry.releases || []) {
    const tx = r.proof?.transaction_id || r.transaction_id || '';
    items.push(item('registry', `${r.release_id} · Registry release`, `${r.status || ''} · ${r.network || ''}`.replace(/^ · | · $/g, ''), '/registry/', terms(r.release_id, 'registry release snapshot', r.network, r.status, tx)));
  }

  for (const it of items) {
    for (const k of Object.keys(it)) if (!SEARCH_ITEM_KEYS.includes(k)) throw new Error(`search index: unexpected key ${k}`);
    if (!SEARCH_TYPES.includes(it.type)) throw new Error(`search index: unknown type ${it.type}`);
    if (!/^\/(?!\/)[^\s"'<>]*$/.test(it.url)) throw new Error(`search index: unsafe url ${it.url}`);
  }
  return {schema:SEARCH_INDEX_SCHEMA, count:items.length, items};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = buildSearchIndex();
  const text = `${JSON.stringify(index)}\n`;
  writeFileSync(SEARCH_INDEX_FILE, text);
  const byType = Object.fromEntries(SEARCH_TYPES.map((t) => [t, index.items.filter((i) => i.type === t).length]));
  console.log(`[generate-search-index] ${index.count} item(s) ${JSON.stringify(byType)} → data/search-index.json (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB)`);
}

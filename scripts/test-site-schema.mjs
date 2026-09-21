#!/usr/bin/env node
/**
 * Guardrail for the INDEX:80 site-schema layer (home / learn / governance).
 *
 * Run after scripts/generate-site-schema.mjs. Proves the three JSON-LD
 * blocks exist, parse, contain exactly the projects.json-derived records
 * with canonical URLs, introduce no rating/review/endorsement schema, and
 * leave the pre-existing project-page and Charles Hoskinson schema intact.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const DATA_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const HOME_FILE = join(PUBLIC_HTML, 'index.html');
const LEARN_FILE = join(PUBLIC_HTML, 'learn', 'index.html');
const GOV_FILE = join(PUBLIC_HTML, 'governance', 'index.html');
const PROJECTS_DIR = join(PUBLIC_HTML, 'projects');
const HOSKINSON_FILE = join(PUBLIC_HTML, 'people', 'charles-hoskinson', 'index.html');

const SITE_URL = 'https://index80.com';
const SLUG_RE = /^[a-z0-9-]+$/;
const CANONICAL_RE = /^https:\/\/index80\.com\/projects\/([a-z0-9-]+)\/$/;

function validProject(p) {
  return Boolean(
    p && p.slug && SLUG_RE.test(p.slug) && p.name && p.summary && p.category && p.status
  );
}

function fail(message) {
  console.error(`[test-site-schema] FAIL: ${message}`);
  process.exit(1);
}

function extractJsonLdBlocks(html, label) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) fail(`${label}: no <script type="application/ld+json"> block found.`);
  return blocks.map((raw, i) => {
    try {
      return JSON.parse(raw);
    } catch (e) {
      fail(`${label}: JSON-LD block ${i + 1} does not parse as valid JSON (${e.message}).`);
    }
  });
}

function graphNodes(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed['@graph'])) return parsed['@graph'];
  if (parsed && typeof parsed === 'object') return [parsed];
  return [];
}

function nodesOfType(nodes, type) {
  return nodes.filter((n) => n && n['@type'] === type);
}

function collectItemListEntries(nodes) {
  const lists = nodesOfType(nodes, 'ItemList');
  if (!lists.length) return null;
  // Homepage/governance graphs each carry exactly one ItemList.
  if (lists.length !== 1) return { ambiguous: true, lists };
  const el = lists[0].itemListElement || [];
  return { lists, entries: el };
}

function slugFromListItem(li) {
  const raw = (li && (li.item || li.url)) || '';
  const m = String(raw).match(CANONICAL_RE);
  return m ? m[1] : null;
}

// Recursively reject rating/review/endorsement schema inside JSON-LD only
// (visible page copy is out of scope for this check).
const FORBIDDEN_TYPES = new Set(['review', 'aggregaterating']);
const FORBIDDEN_KEYS = new Set([
  'review', 'reviews', 'rating', 'ratings', 'ratingvalue', 'bestrating',
  'worstrating', 'reviewcount', 'score', 'scores', 'endorsement', 'endorsements',
  'recommendation', 'recommendations',
]);
function assertNoForbiddenSchema(value, label, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoForbiddenSchema(v, label, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const kl = k.toLowerCase();
      if (k === '@type' && typeof v === 'string' && FORBIDDEN_TYPES.has(v.toLowerCase())) {
        fail(`${label}: forbidden schema @type "${v}" at ${path}.`);
      }
      if (FORBIDDEN_KEYS.has(kl)) {
        fail(`${label}: forbidden schema key "${k}" at ${path}.`);
      }
      assertNoForbiddenSchema(v, label, `${path}.${k}`);
    }
  }
}

function assertListMatches({ entries, label, expectedBySlug, expectedOrder }) {
  const slugs = [];
  const seen = new Set();
  const duplicates = new Set();
  entries.forEach((li, i) => {
    if (!li || li['@type'] !== 'ListItem') fail(`${label}: entry ${i + 1} is not a ListItem.`);
    if (li.position !== i + 1) fail(`${label}: entry ${i + 1} has position ${li.position}; expected ${i + 1}.`);
    const slug = slugFromListItem(li);
    if (!slug) fail(`${label}: entry ${i + 1} URL is not canonical https://index80.com/projects/<slug>/ (got ${JSON.stringify(li.item ?? li.url)}).`);
    if (typeof li.name !== 'string' || !li.name) fail(`${label}: entry ${slug} is missing its project name.`);
    const expected = expectedBySlug.get(slug);
    if (!expected) fail(`${label}: unexpected project slug "${slug}".`);
    if (li.name !== expected.name) fail(`${label}: entry ${slug} name ${JSON.stringify(li.name)} does not match projects.json ${JSON.stringify(expected.name)}.`);
    if (seen.has(slug)) duplicates.add(slug);
    seen.add(slug);
    slugs.push(slug);
  });
  if (duplicates.size) fail(`${label}: duplicate project entries: ${[...duplicates].join(', ')}.`);
  const missing = [...expectedBySlug.keys()].filter((s) => !seen.has(s));
  if (missing.length) fail(`${label}: missing ${missing.length} record(s): ${missing.join(', ')}.`);
  if (slugs.length !== expectedBySlug.size) {
    fail(`${label}: found ${slugs.length} entries; expected ${expectedBySlug.size}.`);
  }
  if (expectedOrder) {
    const mismatchIndex = slugs.findIndex((s, i) => s !== expectedOrder[i]);
    if (mismatchIndex !== -1) {
      fail(`${label}: order differs from the static directory at position ${mismatchIndex + 1} (got ${slugs[mismatchIndex]}; expected ${expectedOrder[mismatchIndex]}).`);
    }
  }
  return slugs;
}

function readHtmlOrFail(file, label) {
  if (!existsSync(file)) fail(`${label}: file not found (${file}).`);
  return readFileSync(file, 'utf8');
}

// ---- Expected records (same validity rule as the static generators) ----
const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const valid = (data.projects || []).filter(validProject);
const validSet = new Set(valid.map((p) => p.slug));
if (validSet.size !== valid.length) fail('projects.json contains duplicate valid slugs.');
const validBySlug = new Map(valid.map((p) => [p.slug, p]));
const gov = valid.filter((p) => p.category === 'governance');
const govBySlug = new Map(gov.map((p) => [p.slug, p]));

// ---- Homepage ----
const homeHtml = readHtmlOrFail(HOME_FILE, 'homepage');
const homeNodes = extractJsonLdBlocks(homeHtml, 'homepage').flatMap(graphNodes);
for (const parsed of extractJsonLdBlocks(homeHtml, 'homepage')) assertNoForbiddenSchema(parsed, 'homepage');
const homeWebsites = nodesOfType(homeNodes, 'WebSite');
if (!homeWebsites.length) fail('homepage: WebSite node missing.');
const homeSameAs = Array.isArray(homeWebsites[0].sameAs) ? homeWebsites[0].sameAs : [homeWebsites[0].sameAs].filter(Boolean);
if (!homeSameAs.includes('https://x.com/index80web')) fail('homepage: official INDEX:80 X account missing from WebSite sameAs.');
if (!nodesOfType(homeNodes, 'CollectionPage').length) fail('homepage: CollectionPage node missing.');
const homeList = collectItemListEntries(homeNodes);
if (!homeList) fail('homepage: ItemList node missing.');
if (homeList.ambiguous) fail('homepage: expected exactly one ItemList node.');

// The homepage directory order is the source for position checks when the
// pre-rendered rows exist; otherwise fall back to set equality only.
let homeOrder = null;
{
  const fragStart = homeHtml.indexOf('<!-- INDEX80_DIRECTORY_START -->');
  const fragEnd = homeHtml.indexOf('<!-- INDEX80_DIRECTORY_END -->');
  if (fragStart >= 0 && fragEnd > fragStart) {
    const frag = homeHtml.slice(fragStart, fragEnd);
    const dirSlugs = [...frag.matchAll(/href="\/projects\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
    if (dirSlugs.length === valid.length && new Set(dirSlugs).size === valid.length) {
      homeOrder = dirSlugs;
    }
  }
}
assertListMatches({ entries: homeList.entries, label: 'homepage ItemList', expectedBySlug: validBySlug, expectedOrder: homeOrder });

// ---- Learn ----
const learnHtml = readHtmlOrFail(LEARN_FILE, 'learn page');
const learnNodes = extractJsonLdBlocks(learnHtml, 'learn page').flatMap(graphNodes);
for (const parsed of extractJsonLdBlocks(learnHtml, 'learn page')) assertNoForbiddenSchema(parsed, 'learn page');
if (!nodesOfType(learnNodes, 'WebPage').length) fail('learn page: WebPage node missing.');
if (!nodesOfType(learnNodes, 'LearningResource').length) fail('learn page: LearningResource node missing.');

// ---- Governance ----
const govHtml = readHtmlOrFail(GOV_FILE, 'governance page');
const govNodes = extractJsonLdBlocks(govHtml, 'governance page').flatMap(graphNodes);
for (const parsed of extractJsonLdBlocks(govHtml, 'governance page')) assertNoForbiddenSchema(parsed, 'governance page');
if (!nodesOfType(govNodes, 'CollectionPage').length && !nodesOfType(govNodes, 'WebPage').length) {
  fail('governance page: CollectionPage (or WebPage) node missing.');
}
const govAbout = govNodes.find((n) => n && (n['@type'] === 'CollectionPage' || n['@type'] === 'WebPage') && n.about);
if (!govAbout) fail('governance page: page node has no "about" Cardano governance reference.');
if (JSON.stringify(govAbout.about).toLowerCase().indexOf('governance') === -1) {
  fail('governance page: page "about" does not reference governance.');
}
const govList = collectItemListEntries(govNodes);
if (!govList) fail('governance page: ItemList node missing.');
if (govList.ambiguous) fail('governance page: expected exactly one ItemList node.');
assertListMatches({ entries: govList.entries, label: 'governance ItemList', expectedBySlug: govBySlug, expectedOrder: null });

// ---- Pre-existing schema preserved ----
{
  let checked = 0;
  for (const p of valid) {
    const file = join(PROJECTS_DIR, p.slug, 'index.html');
    if (!existsSync(file)) fail(`project page ${p.slug}: file missing; existing project-page schema not preserved.`);
    const html = readFileSync(file, 'utf8');
    const nodes = extractJsonLdBlocks(html, `project page ${p.slug}`).flatMap(graphNodes);
    if (!nodesOfType(nodes, 'WebPage').length) fail(`project page ${p.slug}: WebPage schema missing.`);
    if (!nodesOfType(nodes, 'BreadcrumbList').length) fail(`project page ${p.slug}: BreadcrumbList schema missing.`);
    checked += 1;
  }
  if (!checked) fail('no project pages checked.');
  console.log(`[test-site-schema] project pages preserved: ${checked} page(s) with WebPage + BreadcrumbList.`);
}
{
  const html = readHtmlOrFail(HOSKINSON_FILE, 'Charles Hoskinson page');
  const nodes = extractJsonLdBlocks(html, 'Charles Hoskinson page').flatMap(graphNodes);
  if (!nodesOfType(nodes, 'WebPage').length) fail('Charles Hoskinson page: WebPage schema missing.');
  if (!nodesOfType(nodes, 'Person').length) fail('Charles Hoskinson page: Person schema missing.');
  if (!nodesOfType(nodes, 'BreadcrumbList').length) fail('Charles Hoskinson page: BreadcrumbList schema missing.');
}

console.log(
  `[test-site-schema] PASS: home ItemList ${valid.length}, governance ItemList ${gov.length}; learn/learn-resource, project pages and Hoskinson schema present; no rating/review/endorsement schema.`
);

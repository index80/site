#!/usr/bin/env node
// Editorial information architecture: About → Charter / Methodology.
// Guards the canonical methodology URL, its anchors, the contextual links on
// People and Project pages, the retired /people/methodology/ redirect and
// against methodology being duplicated back onto About.
import { INK_TOLERANT_HTML } from './test-helpers/ink-tolerant-html.mjs'; // eslint-disable-line no-unused-vars
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const read = (...p) => readFileSync(join(PUBLIC, ...p), 'utf8');
const failures = [];
const ok = (cond, label) => { if (!cond) failures.push(label); };
const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

const METHOD = read('about', 'methodology', 'index.html');
const CHARTER = read('about', 'charter', 'index.html');
const ABOUT = read('about', 'index.html');
const PEOPLE_DIR = read('people', 'index.html');
const methodIds = ids(METHOD);
const charterIds = ids(CHARTER);

// 1. Canonical methodology page
ok(!/only once its use has been cleared/.test(METHOD), 'methodology has no image-clearance requirement (matches the Privacy Policy)');
ok(METHOD.includes('<link rel="canonical" href="https://index80.com/about/methodology/">'), 'methodology canonical URL');
ok(/<h1 id="methodology-title">EDITORIAL METHODOLOGY<\/h1>/.test(METHOD), 'methodology has a single page h1');
ok((METHOD.match(/<h1\b/g) || []).length === 1, 'methodology has exactly one h1');
for (const id of ['projects', 'people', 'people-public-beta', 'evidence', 'corrections', 'specialist-standards', 'community-stake-pools', 'people-corrections']) {
  ok(methodIds.has(id), `methodology anchor #${id}`);
}
for (const step of ['DISCOVER', 'VERIFY', 'REVIEW', 'PUBLISH', 'MAINTAIN']) ok(METHOD.includes(`<div>${step}<br>`), `methodology flow step ${step}`);
ok(METHOD.includes('href="/about/charter/"'), 'methodology links to the Charter');
ok(METHOD.includes('href="/submit/"') && METHOD.includes('href="/privacy/"') && METHOD.includes('mailto:hello@index80.com'), 'methodology links to Submit, privacy and email');
ok(/"@type": "WebPage"[\s\S]*"url": "https:\/\/index80.com\/about\/methodology\/"/.test(METHOD), 'methodology WebPage JSON-LD');
ok(METHOD.includes('aria-current="page">◇ About'), 'methodology sits under About in the nav');
for (const phrase of ['not</strong> a background check, a reputation score, an endorsement or a ranking', 'there is no deanonymisation', 'Checked is not endorsement', 'Community Stake Pool Standard', 'Publication does not mean the person has endorsed or approved their profile', "Profile images are sourced from the person's own public profile or other clearly attributable public source", 'Individuals may ask us to update, replace or remove an image at any time']) {
  ok(METHOD.includes(phrase), `methodology keeps: ${phrase}`);
}

// Privacy Policy covers the People directory and routes to the same corrections process
const PRIVACY = read('privacy', 'index.html');
ok(PRIVACY.includes('<p id="people-profiles"><strong>People and public profiles.</strong> INDEX:80 may publish factual profiles of people whose work is materially connected to the Cardano ecosystem.'), 'Privacy Policy: People and public profiles');
ok(PRIVACY.includes('Publication does not imply endorsement, approval or participation by the person profiled') && PRIVACY.includes('href="/about/methodology/#people-corrections"'), 'Privacy Policy: not endorsement + corrections/objections route');
ok(PRIVACY.includes('not private dossiers about people') && PRIVACY.includes('does not publish private dossiers or unnecessary personal information'), 'Privacy Policy keeps its restraint wording');

// 2. Charter stays separate and is not the methodology
ok(CHARTER.includes('<link rel="canonical" href="https://index80.com/about/charter/">'), 'Charter keeps its own canonical URL');
ok(!CHARTER.includes('id="community-stake-pools"'), 'Charter does not absorb the methodology');

// 3. About is the entry point, without the duplicated operational detail
const cards = [...ABOUT.matchAll(/<a class="editorial-card" href="([^"]+)">/g)].map((m) => m[1]);
ok(JSON.stringify(cards) === JSON.stringify(['/about/charter/', '/about/methodology/', '/about/methodology/#people', '/about/methodology/#corrections']), `About EDITORIAL SYSTEM cards (got ${cards.join(', ')})`);
for (const heading of ['THE FIVE-QUESTION PUBLICATION TEST', 'COMMUNITY STAKE POOL STANDARD', 'WHAT WE MEAN BY A “QUALITY BAR”', 'WHAT “VERIFIED BY INDEX:80” MEANS']) {
  ok(!ABOUT.includes(heading), `About no longer duplicates "${heading}" (it lives in /about/methodology/)`);
}
ok(ABOUT.includes('mailto:hello@index80.com') && ABOUT.includes('href="/submit/"'), 'About keeps a direct correction route');

// 4. Retired /people/methodology/: 301 to the People section, no loop, not in the sitemap
const redirects = read('_redirects').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
const rule = redirects.find(([from]) => from === '/people/methodology/');
ok(rule && rule[1] === '/about/methodology/#people' && rule[2] === '301', '/people/methodology/ → /about/methodology/#people 301');
ok(!redirects.some(([from]) => from.startsWith('/about/methodology')), 'no redirect loop on /about/methodology/');
const stub = read('people', 'methodology', 'index.html');
ok(stub.includes('<link rel="canonical" href="https://index80.com/about/methodology/">') && stub.includes('noindex') && stub.includes('url=/about/methodology/#people'), 'old URL fallback page points at the canonical methodology');
const sitemap = read('sitemap.xml');
ok(sitemap.includes('<loc>https://index80.com/about/methodology/</loc>'), 'sitemap lists /about/methodology/');
ok(!sitemap.includes('/people/methodology/'), 'sitemap no longer lists /people/methodology/');

// 5. Contextual links
ok(PEOPLE_DIR.includes('<a href="/about/methodology/#people">How People records are built →</a>'), 'People directory links to the People methodology');
const peopleDir = join(PUBLIC, 'people');
let profiles = 0;
for (const slug of readdirSync(peopleDir)) {
  const f = join(peopleDir, slug, 'index.html');
  if (slug === 'methodology' || !existsSync(f)) continue;
  const html = readFileSync(f, 'utf8');
  if (!html.includes('INDEX80_GENERATED_PEOPLE_PROFILE')) continue;
  profiles += 1;
  ok(html.includes('<a href="/about/methodology/#people">How People records are built</a>') && html.includes('<a href="/about/methodology/#people-corrections">Corrections &amp; objections</a>'), `People profile methodology/corrections links: ${slug}`);
}
ok(profiles > 0, 'found generated People profiles');
const projectsDir = join(PUBLIC, 'projects');
let projects = 0;
for (const slug of readdirSync(projectsDir)) {
  const f = join(projectsDir, slug, 'index.html');
  if (!existsSync(f)) continue;
  const html = readFileSync(f, 'utf8');
  if (!html.includes('class="back-to-directory"')) continue;
  projects += 1;
  ok(html.includes('<p class="record-editorial-line"><a href="/about/methodology/#projects">How records are checked</a> · <a href="/submit/">Suggest a correction</a></p>'), `Project editorial footer: ${slug}`);
}
ok(projects > 0, 'found generated Project pages');

// 6. No page links to the retired URL; every About/Charter/Methodology anchor resolves
function* htmlFiles(dir) {
  for (const e of readdirSync(dir, {withFileTypes:true})) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}
const targets = {'/about/methodology/': methodIds, '/about/charter/': charterIds, '/about/': ids(ABOUT)};
let anchors = 0;
for (const f of htmlFiles(PUBLIC)) {
  const rel = f.slice(PUBLIC.length);
  const html = readFileSync(f, 'utf8');
  if (rel !== '/people/methodology/index.html' && /href="(?:https:\/\/index80\.com)?\/people\/methodology\/?/.test(html)) failures.push(`links to retired /people/methodology/: ${rel}`);
  for (const m of html.matchAll(/href="(?:https:\/\/index80\.com)?(\/about\/(?:methodology\/|charter\/)?)#([^"]+)"/g)) {
    anchors += 1;
    if (!targets[m[1]].has(m[2])) failures.push(`broken anchor ${m[1]}#${m[2]} in ${rel}`);
  }
}

if (failures.length) {
  console.error(`[test-editorial-methodology] ${failures.length} failure(s):\n  ${failures.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
console.log(`[test-editorial-methodology] OK — canonical /about/methodology/, About entry point, retired /people/methodology/ redirect, ${profiles} People + ${projects} Project contextual links, ${anchors} anchor link(s) resolved`);

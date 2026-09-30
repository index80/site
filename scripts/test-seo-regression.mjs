#!/usr/bin/env node
/**
 * SEO / GEO regression checks over the generated site (run after the build):
 * sitemap coverage, per-page metadata quality and uniqueness for People and
 * Project pages, People directory + homepage structured data, llms.txt
 * accuracy, and internal-link integrity. Read-only; deterministic; no network.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public_html');
const SITE = 'https://index80.com';
const problems = [];
const fail = (m) => problems.push(m);
const read = (p) => readFileSync(join(PUB, p), 'utf8');
const unesc = (s) => String(s).replace(/&(#39|amp|lt|gt|quot);/g, (_, e) => ({ '#39': "'", amp: '&', lt: '<', gt: '>', quot: '"' }[e]));
const attr = (h, re) => { const m = h.match(re); return m ? unesc(m[1]) : null; };
const meta = (h, kind, key) => attr(h, new RegExp(`<meta ${kind}="${key}" content="([^"]*)"`));

const projects = JSON.parse(read('data/projects.json')).projects || [];
const people = JSON.parse(read('data/people.json')).people || [];

// ---- sitemap ----
const sitemap = read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const locSet = new Set(locs);
if (locSet.size !== locs.length) fail('sitemap contains duplicate URLs');
for (const u of ['/', '/people/', '/registry/', '/about/methodology/', '/learn/']) if (!locSet.has(SITE + u)) fail(`sitemap missing ${u}`);
for (const p of people) if (!locSet.has(`${SITE}/people/${p.slug}/`)) fail(`sitemap missing person ${p.slug}`);
for (const p of projects) if (p.slug && !locSet.has(`${SITE}/projects/${p.slug}/`)) fail(`sitemap missing project ${p.slug}`);
for (const u of locs) {
  const path = u.replace(SITE, '');
  const file = join('public_html', path, 'index.html');
  if (!existsSync(join(ROOT, file))) { fail(`sitemap URL has no static page: ${u}`); continue; }
  const h = read(join(path, 'index.html'));
  if (/name="robots" content="[^"]*noindex/i.test(h)) fail(`sitemap lists a noindex page: ${u}`);
  if (attr(h, /<link rel="canonical" href="([^"]*)"/) !== u) fail(`canonical does not match sitemap URL: ${u}`);
}
if (/\/people\/methodology\/|\/search\/|\/review\//.test(sitemap)) fail('sitemap lists a retired/noindex utility page');

// ---- per-page metadata (People + Projects) ----
function checkPages(kind, slugs, { maxDesc = 160 } = {}) {
  const titles = new Map(); const descs = new Map();
  for (const slug of slugs) {
    const h = read(`${kind}/${slug}/index.html`);
    const title = attr(h, /<title>([^<]*)<\/title>/);
    const desc = meta(h, 'name', 'description');
    const where = `${kind}/${slug}`;
    if (!title || title.length > 75) fail(`${where}: title missing or >75 chars`);
    if (!desc || desc.length < 40 || desc.length > maxDesc) fail(`${where}: description missing or outside 40-${maxDesc} chars (${desc?.length})`);
    if (titles.has(title)) fail(`${where}: duplicate title with ${titles.get(title)}`); titles.set(title, where);
    if (descs.has(desc)) fail(`${where}: duplicate description with ${descs.get(desc)}`); descs.set(desc, where);
    for (const [k, key] of [['property', 'og:title'], ['property', 'og:description'], ['property', 'og:url'], ['name', 'twitter:card'], ['name', 'twitter:title'], ['name', 'twitter:description']]) {
      if (!meta(h, k, key)) fail(`${where}: missing ${key}`);
    }
    if (meta(h, 'property', 'og:url') !== `${SITE}/${kind}/${slug}/`) fail(`${where}: og:url is not the canonical URL`);
    if (meta(h, 'property', 'og:description') !== desc) fail(`${where}: og:description differs from description`);
    if (!/application\/ld\+json/.test(h)) fail(`${where}: no JSON-LD`);
    if (/noindex/i.test(h)) fail(`${where}: unexpectedly noindex`);
  }
}
const generatedPeople = people.filter((p) => p.profile_type === 'generated').map((p) => p.slug);
checkPages('people', generatedPeople);
checkPages('projects', projects.filter((p) => p.slug).map((p) => p.slug));
for (const slug of generatedPeople) {
  const h = read(`people/${slug}/index.html`);
  const desc = meta(h, 'name', 'description');
  if (/…$/.test(desc)) fail(`people/${slug}: description is truncated with an ellipsis`);
  if (/confirmed (directly )?by (the person|them)|self-confirmed|portrait/i.test(desc)) fail(`people/${slug}: description makes an editorial-confirmation or portrait claim`);
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const person = ld.find((n) => n['@type'] === 'Person');
  if (!person || person.url !== `${SITE}/people/${slug}/`) fail(`people/${slug}: Person schema missing url`);
  if (!ld.some((n) => n['@type'] === 'BreadcrumbList')) fail(`people/${slug}: BreadcrumbList missing`);
  for (const m of ld[0].mentions || []) {
    if (!existsSync(join(PUB, m.url.replace(SITE, ''), 'index.html'))) fail(`people/${slug}: schema mentions a missing project page ${m.url}`);
  }
}

// ---- People directory ----
{
  const h = read('people/index.html');
  const title = attr(h, /<title>([^<]*)<\/title>/);
  const desc = meta(h, 'name', 'description');
  if (!title || !title.includes(String(people.length))) fail('people directory title should state the record count');
  if (!desc || desc.length > 170) fail('people directory description missing/too long');
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const list = ld.find((n) => n['@type'] === 'ItemList');
  if (!list || list.numberOfItems !== people.length || list.itemListElement.length !== people.length) fail('people directory ItemList must list every People record');
  if (!ld.some((n) => n['@type'] === 'CollectionPage')) fail('people directory CollectionPage schema missing');
}

// ---- homepage ----
{
  const h = read('index.html');
  if (!/people/i.test(meta(h, 'name', 'description') || '')) fail('homepage description does not mention People');
  if (!/people/i.test(meta(h, 'property', 'og:description') || '')) fail('homepage og:description does not mention People');
  if (!h.includes(`${SITE}/people/#directory`)) fail('homepage schema does not reference the People directory');
}

// ---- llms.txt ----
{
  const t = read('llms.txt');
  for (const need of ['/people/', '/data/people.json', 'not an endorsement', 'does not mean the person has reviewed']) {
    if (!t.includes(need)) fail(`llms.txt missing "${need}"`);
  }
  for (const m of t.matchAll(/https:\/\/index80\.com(\/[^\s)`<>#]*)/g)) {
    const p = m[1];
    if (t[m.index + m[0].length] === '<') continue; // URL template such as /snapshots/<release>.json
    if (!(existsSync(join(PUB, p)) && statSync(join(PUB, p)).isFile()) && !existsSync(join(PUB, p, 'index.html'))) fail(`llms.txt references a missing resource: ${p}`);
  }
}

// ---- internal links ----
{
  const redirects = new Set(readFileSync(join(PUB, '_redirects'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split(/\s+/)[0]));
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.html') ? [join(d, e.name)] : []));
  const seen = new Set();
  for (const f of walk(PUB)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/href="(\/[^"#?]*)/g)) {
      const u = m[1];
      if (u.startsWith('//') || seen.has(u)) continue;
      seen.add(u);
      const ok = existsSync(join(PUB, u)) && statSync(join(PUB, u)).isFile() || existsSync(join(PUB, u, 'index.html')) || existsSync(join(PUB, `${u}.html`)) || redirects.has(u);
      if (!ok) fail(`broken internal link ${u} (first seen in ${f.replace(PUB, '')})`);
    }
  }
}

if (problems.length) {
  console.error(`[test-seo-regression] FAIL (${problems.length})\n - ${problems.slice(0, 40).join('\n - ')}`);
  process.exit(1);
}
console.log(`[test-seo-regression] OK — ${locs.length} sitemap URLs, ${generatedPeople.length} People + ${projects.length} Project pages checked for unique metadata, People/home schema, llms.txt and internal links.`);

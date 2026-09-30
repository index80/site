#!/usr/bin/env node
// Site-wide search prototype: index privacy/shape, real client matching
// (assets/js/site-search.js run in a VM), cross-type results, URLs, the
// strip on every public page, the /search/ page and local category filters.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { SEARCH_ITEM_KEYS, SEARCH_TYPES, decode, normalise as buildNormalise } from './generate-search-index.mjs';
import { START, END, EXCLUDED_PREFIXES } from './apply-global-search.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const read = (...p) => readFileSync(join(PUBLIC, ...p), 'utf8');
const failures = [];
const ok = (cond, label) => { if (!cond) failures.push(label); };

// ---------------------------------------------------------------- the index
const indexText = read('data', 'search-index.json');
const index = JSON.parse(indexText);
const items = index.items || [];
ok(index.schema === 'index80-search-index/1' && index.count === items.length, 'search index schema/count');
for (const it of items) {
  const keys = Object.keys(it);
  if (keys.length !== SEARCH_ITEM_KEYS.length || !keys.every((k) => SEARCH_ITEM_KEYS.includes(k))) failures.push(`non-allowlisted keys on ${it.title}: ${keys.join(',')}`);
  if (!SEARCH_TYPES.includes(it.type)) failures.push(`unknown type ${it.type}`);
  if (typeof it.search_terms !== 'string' || /https?\b|www\b/.test(it.search_terms)) failures.push(`raw URL text in search terms: ${it.title}`);
}
const projects = JSON.parse(read('data', 'projects.json'));
const projectList = Array.isArray(projects) ? projects : projects.projects || projects.records || [];
const people = JSON.parse(read('data', 'people.json')).people || [];
ok(items.filter((i) => i.type === 'project').length === readdirSync(join(PUBLIC, 'projects')).filter((d) => existsSync(join(PUBLIC, 'projects', d, 'index.html'))).length, 'every project page is searchable');
ok(items.filter((i) => i.type === 'person').length === people.length && people.length > 0, 'every public person is searchable');
ok(['learn', 'governance', 'registry', 'page'].every((t) => items.some((i) => i.type === t)), 'Learn, Governance, Registry and site pages are searchable');
ok(Buffer.byteLength(indexText) < 400 * 1024, `search index stays small (${(Buffer.byteLength(indexText) / 1024).toFixed(1)} KB)`);

// Public build: only public inputs are available here. The comparison against
// the private registry lives in scripts/test-people-public-boundary.mjs
// (private-only, dropped from the public export).
const allTerms = items.map((i) => ` ${buildNormalise(i.title)} | ${i.search_terms} `).join('\n');
for (const word of ['pending permission', 'not contacted', 'approve for dev', 'dev only', 'do not link', 'inbox', 'research note', 'pipeline state']) {
  if (allTerms.includes(` ${word} `)) failures.push(`editorial state text "${word}" in search index`);
}
ok(!/"(?:identity_basis|editorial_notes|pfp_status|contact_status|owner_decision|research_id)"/i.test(indexText), 'no private field names in the search index');
ok(!/res \d{3}/.test(allTerms), 'no Research IDs in the search index');

// URLs: internal, and they resolve (including #anchors)
const idsCache = new Map();
for (const it of items) {
  const m = /^(\/(?!\/)[^#?\s]*)(?:#([\w-]+))?$/.exec(it.url);
  if (!m) { failures.push(`invalid search URL ${it.url}`); continue; }
  const file = join(PUBLIC, m[1].replace(/\/$/, '/index.html'));
  if (!existsSync(file)) { failures.push(`search URL has no page: ${it.url}`); continue; }
  if (m[2]) {
    if (!idsCache.has(file)) idsCache.set(file, new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((x) => x[1])));
    if (!idsCache.get(file).has(m[2])) failures.push(`search URL anchor missing: ${it.url}`);
  }
}

// ------------------------------------------------- real client-side matching
const sandbox = {window:{}, document:{readyState:'complete', querySelector:() => null}, URLSearchParams, fetch:() => Promise.reject(new Error('offline'))};
vm.runInNewContext(read('assets', 'js', 'site-search.js'), sandbox);
const S = sandbox.window.INDEX80Search;
ok(S && typeof S.search === 'function', 'site-search.js exposes its matcher for tests');
const prepared = S.prepare(JSON.parse(indexText).items);
const find = (q) => S.search(prepared, q).map((r) => r.item);
const titles = (q) => find(q).map((i) => `${i.type}:${i.title}`);
ok(find('g').length === 0, 'single character does not flood results');
const granada = titles('GranADA');
ok(granada.includes('project:GranADA Pool') && granada.includes('person:LaPetite'), `cross-type: "GranADA" finds the pool and its operator (${granada.slice(0, 5)})`);
ok(titles('granada pool')[0] === 'project:GranADA Pool', 'exact project name ranks first');
ok(titles('MINSWAP')[0] === 'project:Minswap', 'case-insensitive: Minswap first');
ok(titles('midnight').includes('project:Midnight'), 'Midnight project found');
ok(find('drep').some((i) => i.type === 'person') && find('drep').some((i) => i.type === 'governance'), 'DRep finds people and governance');
ok(find('cip').length > 0 && find('cip').every((i) => (` ${buildNormalise(i.title)} | ${i.search_terms}`).includes(' cip')), 'CIP matches whole-word starts only');
ok(titles('lukas barta').includes('person:Lukáš Bárta'), 'accent-insensitive person search');
ok(titles('GRANA').includes('person:LaPetite'), 'pool ticker search');
ok(titles('snek')[0] === 'project:SNEK', 'token search');
ok(find('zzqxv nonsense').length === 0, 'nonsense query returns nothing');
const groups = S.grouped(S.search(prepared, 'granada')).map((g) => g.label);
ok(groups.includes('PROJECTS') && groups.includes('PEOPLE'), 'results group by type');

// ----------------------------------------------------- strip on every page
function* htmlFiles(dir) {
  for (const e of readdirSync(dir, {withFileTypes:true})) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}
let pages = 0;
const REQUIRED = ['index.html', 'people/index.html', 'projects/minswap/index.html', 'people/lukas-barta/index.html', 'about/index.html',
  'about/methodology/index.html', 'about/charter/index.html', 'data/index.html', 'learn/index.html', 'governance/index.html', 'registry/index.html', 'search/index.html'];
const withStrip = new Set();
for (const f of htmlFiles(PUBLIC)) {
  const rel = relative(PUBLIC, f).split(sep).join('/');
  if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
  const html = readFileSync(f, 'utf8');
  if (!/<header class="site-header"[\s>]/.test(html)) continue;
  pages += 1;
  const starts = html.split(START).length - 1;
  const inputs = html.split('id="global-search-input"').length - 1;
  if (starts !== 1 || inputs !== 1) { failures.push(`${rel}: expected one global search strip (got ${starts} strip, ${inputs} input)`); continue; }
  withStrip.add(rel);
  const header = html.indexOf('</header>');
  const strip = html.indexOf(START);
  const main = html.indexOf('<main');
  if (!(header < strip && (main === -1 || strip < main))) failures.push(`${rel}: search strip is not directly below the navigation`);
  if (/id="(?:directory-search|people-search)"/.test(html)) failures.push(`${rel}: still has a page-local text search box`);
}
for (const r of REQUIRED) ok(withStrip.has(r), `global search strip on ${r}`);
ok(pages > 300, `strip checked on ${pages} pages`);

const strip = read('about', 'index.html').split(START)[1].split(END)[0];
ok(/<form class="search-box global-search-box" role="search" action="\/search\/" method="get"/.test(strip), 'strip is a GET form to /search/ (works without JS)');
ok(/name="q" type="search"[^>]*role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="global-search-results"/.test(strip), 'combobox ARIA on the input');
ok(/<label class="global-search-label" for="global-search-input">/.test(strip) && strip.includes('SEARCH INDEX:80'), 'visible label bound to the input');
ok(strip.includes('placeholder="Projects, people, organisations, tags, governance…"'), 'placeholder text');
ok(strip.includes('id="global-search-results" class="gs-results" role="listbox"') && strip.includes('aria-live="polite"'), 'listbox + live region markup');
const js = read('assets', 'js', 'site-search.js');
for (const key of ["'ArrowDown'", "'ArrowUp'", "'Escape'", "'Enter'", 'pointerdown', 'No INDEX:80 results', 'View all ', '/search/?q=']) ok(js.includes(key), `site-search.js handles ${key}`);

// ------------------------------------------------------------- /search/ page
const searchPage = read('search', 'index.html');
ok(searchPage.includes('data-search-page') && searchPage.includes('id="search-query-title"') && searchPage.includes('id="search-summary"'), '/search/ page containers');
ok(searchPage.includes('<meta name="robots" content="noindex, follow">') && searchPage.includes('<link rel="canonical" href="https://index80.com/search/">'), '/search/ is noindex with a canonical URL');
ok((searchPage.match(/type="search"/g) || []).length === 1, '/search/ reuses the strip input (no duplicate search box)');
ok(!read('sitemap.xml').includes('/search/'), '/search/ is not in the sitemap');

// ------------------------------------------------ local category filters kept
const home = read('index.html');
const peopleDir = read('people', 'index.html');
ok(home.includes('id="category-bar"') && peopleDir.includes('id="people-category-bar"'), 'category filter bars kept');
const dirJs = read('assets', 'js', 'directory.js');
const peopleJs = read('assets', 'js', 'people-directory.js');
ok(/activeCategory/.test(dirJs) && /buildCategoryBar/.test(dirJs) && /if \(searchInput\)/.test(dirJs), 'Projects category filtering intact; text search optional');
ok(/activeCategory/.test(peopleJs) && /if \(searchInput\)/.test(peopleJs), 'People category filtering intact; text search optional');

// Entities are decoded exactly once (CodeQL js/double-escaping).
ok(decode('Tom &amp; Jerry') === 'Tom & Jerry', 'decode: &amp; → &');
ok(decode('a &amp;lt;b&amp;gt; c') === 'a &lt;b&gt; c', 'decode: &amp;lt; is not double-decoded');
ok(decode('x &amp;nbsp; y &amp;amp; z') === 'x &nbsp; y &amp; z', 'decode: &amp;nbsp; / &amp;amp; decoded once');
ok(decode('<b>A</b>&nbsp;&lt;B&gt; &quot;C&quot; &rsquo;D&#39; &hellip;') === 'A <B> "C" \'D\'', 'decode: tags, named entities and catch-all');

if (failures.length) {
  console.error(`[test-global-search] ${failures.length} failure(s):\n  ${failures.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
console.log(`[test-global-search] OK — ${items.length} index items (${(Buffer.byteLength(indexText) / 1024).toFixed(1)} KB), allowlisted fields, cross-type + ranking queries, strip on ${pages} pages, /search/ page, category filters`);

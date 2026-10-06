#!/usr/bin/env node
/**
 * Semantic accent words ("ink") — site-wide regression.
 *
 * - The owner-approved dictionary is used exactly (six families, no extra
 *   terms) and no word maps to more than one colour.
 * - Matching is deterministic and idempotent; committed pages equal a fresh
 *   application, so the build is stable.
 * - Every ink word renders in its dictionary family; CSS defines all six
 *   families from theme variables; no runtime JavaScript creates ink.
 * - Prohibited contexts are never wrapped: links, buttons, nav, header/footer,
 *   code/pre, tables, summaries, form controls, names, URLs, file names,
 *   hashes, IDs, values ($1.2M), JS-hydrated containers, attributes, JSON-LD.
 * - Project, People and Explore pages carry ink; JSON datasets and the search
 *   index carry no markup.
 * - Restraint: at most 5 per paragraph and 2 per heading, each word once per block.
 *
 * Node core only, read-only. Usage: node scripts/test-semantic-ink.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INK_TONES, INK_FAMILIES, inkTone, inkHtml, nameGuard, stripInk } from './lib/semantic-ink.mjs';
import { publicNames, EXCLUDED_PREFIXES } from './apply-semantic-ink.mjs';
import { buildSearchIndex } from './generate-search-index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public_html');
const SPAN = /<span class="ink ink-([a-z]+)">([^<]*)<\/span>/g;
const problems = [];
const fail = (m) => problems.push(m);
const check = (cond, m) => { if (!cond) fail(m); };

// ---- 1. authoritative dictionary -------------------------------------------
const APPROVED = {
  gold: ['immutable', 'permanent', 'fingerprint', 'proof', 'decentralised', 'scalable', 'secure', 'locked', 'Bitcoin', 'ADA', 'BTC', '$'],
  green: ['public', 'open', 'verified', 'confirmed', 'live', 'active', 'people', 'community', 'governance', 'DRep', 'voting', 'vote'],
  blue: ['Cardano', 'blockchain', 'on-chain', 'chain', 'mainnet'],
  magenta: ['data', 'JSON', 'API', 'SHA-256', 'hash', 'source', 'sources', 'snapshot', 'snapshots', 'code', 'technology'],
  purple: ['archived', 'historic', 'pending', 'partial', 'observed'],
  cyan: ['ecosystem', 'AI', 'humans', 'research', 'creative'],
};
check(JSON.stringify(INK_TONES) === JSON.stringify(APPROVED), 'INK_TONES must equal the owner-approved dictionary exactly');
check(JSON.stringify(INK_FAMILIES) === JSON.stringify(['gold', 'green', 'blue', 'magenta', 'purple', 'cyan']), 'exactly six colour families');
const seen = new Map();
for (const [tone, words] of Object.entries(INK_TONES)) for (const w of words) {
  check(!seen.has(w.toLowerCase()), `"${w}" maps to more than one colour`);
  seen.set(w.toLowerCase(), tone);
}
for (const [w, tone] of [['CARDANO', 'blue'], ['ai', 'cyan'], ['People', 'green'], ['json', 'magenta'], ['Sources', 'magenta'], ['ARCHIVED', 'purple']]) check(inkTone(w) === tone, `case-insensitive lookup: ${w} → ${tone}`);

// ---- 2. matching rules (fixtures) -------------------------------------------
const guard = nameGuard(['Cardano Foundation', 'Ada Handle', 'Frogs on Cardano', 'DRep Council', 'Cardano Feed ($ADA)']);
const page = (body) => `<html><head><title>Cardano data</title><meta name="description" content="open data"></head><body><header>Cardano</header><main>${body}</main><footer>open data</footer></body></html>`;
const main = (html) => html.slice(html.indexOf('<main>') + 6, html.indexOf('</main>'));
const ink = (body) => main(inkHtml(page(body), { guard }));
const fixtures = [
  ['<p>An open Cardano technology project building secure blockchain infrastructure.</p>', '<p>An <span class="ink ink-green">open</span> <span class="ink ink-blue">Cardano</span> <span class="ink ink-magenta">technology</span> project building <span class="ink ink-gold">secure</span> <span class="ink ink-blue">blockchain</span> infrastructure.</p>'],
  ['<h2>PUBLIC DATA FOR CARDANO</h2>', '<h2><span class="ink ink-green">PUBLIC</span> <span class="ink ink-magenta">DATA</span> FOR CARDANO</h2>'],
  ['<p>Cardano data and Cardano data again.</p>', '<p><span class="ink ink-blue">Cardano</span> <span class="ink ink-magenta">data</span> and Cardano data again.</p>'],
  ['<p>See <a href="/data/">open data</a> and <code>data.json</code> or <button>Open</button>.</p>', '<p>See <a href="/data/">open data</a> and <code>data.json</code> or <button>Open</button>.</p>'],
  ['<p>Read data.index80.com/cardano.json, index80-0004.json, @cardano, #data, off-chain and open-source.</p>', '<p>Read data.index80.com/cardano.json, index80-0004.json, @cardano, #data, off-chain and open-source.</p>'],
  ['<p>The Cardano Foundation and Ada Handle and Frogs on Cardano and DRep Council.</p>', '<p>The Cardano Foundation and Ada Handle and Frogs on Cardano and DRep Council.</p>'],
  ['<p>Paid in $ and ADA, not $1.2M or ₳ADA.</p>', '<p>Paid in <span class="ink ink-gold">$</span> and <span class="ink ink-gold">ADA</span>, not $1.2M or ₳ADA.</p>'],
  ['<table><tr><td>ADA</td><th>Cardano</th></tr></table><pre>open data</pre><nav>Cardano</nav>', '<table><tr><td>ADA</td><th>Cardano</th></tr></table><pre>open data</pre><nav>Cardano</nav>'],
  ['<p class="metric-grid">public data</p><div id="directory-list"><p>open</p></div><p aria-live="polite">live data</p>', '<p class="metric-grid">public data</p><div id="directory-list"><p>open</p></div><p aria-live="polite">live data</p>'],
  ['<p data-x="open data" title="Cardano">x</p>', '<p data-x="open data" title="Cardano">x</p>'],
  ['<script type="application/ld+json">{"d":"open Cardano data"}</script><p>public open live active verified confirmed data</p>', '<script type="application/ld+json">{"d":"open Cardano data"}</script><p><span class="ink ink-green">public</span> <span class="ink ink-green">open</span> <span class="ink ink-green">live</span> <span class="ink ink-green">active</span> <span class="ink ink-green">verified</span> confirmed data</p>'],
  ['<p>hash 4226bc80f1a94e65a8b8a010a51530f60329af643f2375b9c15d4ebdd771b36d and addr1qxljlkqp3u79data</p>', '<p><span class="ink ink-magenta">hash</span> 4226bc80f1a94e65a8b8a010a51530f60329af643f2375b9c15d4ebdd771b36d and addr1qxljlkqp3u79data</p>'],
];
for (const [input, expected] of fixtures) {
  const got = ink(input);
  check(got === expected, `fixture mismatch:\n   in:  ${input}\n   got: ${got}\n   exp: ${expected}`);
}
const whole = inkHtml(page('<p>open data</p>'), { guard });
check(whole.includes('<header>Cardano</header>') && whole.includes('<footer>open data</footer>') && whole.includes('<title>Cardano data</title>') && whole.includes('content="open data"'), 'nothing outside <main> or inside attributes is wrapped');
check(inkHtml(whole, { guard }) === whole, 'inkHtml is idempotent');

// ---- 3. site pages -----------------------------------------------------------
const siteGuard = nameGuard(publicNames(ROOT));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []));
const EXCLUDED_TAGS = ['a', 'button', 'nav', 'header', 'footer', 'code', 'pre', 'th', 'td', 'summary', 'label', 'title', 'option', 'textarea', 'script', 'style'];
let pages = 0;
let inkedPages = 0;
let total = 0;
let proseWords = 0;
let inkedInProse = 0;
const byFamily = Object.fromEntries(INK_FAMILIES.map((f) => [f, 0]));
const perArea = {};
for (const file of walk(PUB)) {
  const rel = relative(PUB, file).split(sep).join('/');
  const html = readFileSync(file, 'utf8');
  if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) { check(!html.includes('class="ink '), `${rel}: tooling page must not carry ink`); continue; }
  pages += 1;
  check(inkHtml(html, { guard: siteGuard }) === html, `${rel}: committed page differs from a fresh deterministic ink application (rebuild)`);
  const spans = [...html.matchAll(SPAN)];
  if (spans.length) inkedPages += 1;
  total += spans.length;
  const area = rel.split('/')[0].replace(/\.html$/, '') || 'home';
  perArea[area] = (perArea[area] || 0) + spans.length;
  for (const [, tone, word] of spans) {
    byFamily[tone] = (byFamily[tone] || 0) + 1;
    check(inkTone(word) === tone, `${rel}: "${word}" rendered ${tone}, dictionary says ${inkTone(word)}`);
  }
  const before = html.slice(0, html.indexOf('<main'));
  const after = html.slice(html.indexOf('</main>'));
  check(!before.includes('class="ink ') && !after.includes('class="ink '), `${rel}: ink outside <main>`);
  for (const tag of EXCLUDED_TAGS) {
    for (const m of html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))) {
      if (m[1].includes('class="ink ')) { fail(`${rel}: ink inside <${tag}>`); break; }
    }
  }
  check(!/<[^>]+="[^"]*class=&quot;ink|<meta[^>]+content="[^"]*<span/.test(html), `${rel}: ink inside an attribute`);
  for (const m of html.matchAll(/<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    if (/<(p|h[1-6]|li|div|ul|ol)\b/.test(m[2])) continue; // container of nested blocks: each block is counted on its own
    const words = [...m[2].matchAll(SPAN)].map((s) => s[2].toLowerCase().replace(/s$/, ''));
    const max = m[1].startsWith('h') ? 2 : 5;
    if (words.length > max) fail(`${rel}: ${words.length} ink words in one <${m[1]}> (max ${max})`);
    if (new Set(words).size !== words.length) fail(`${rel}: a word is inked twice in one <${m[1]}>`);
    if (m[1] === 'p' && words.length) {
      proseWords += stripInk(m[2]).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      inkedInProse += words.length;
    }
  }
}
for (const [label, rel] of [['Project page', 'projects/minswap/index.html'], ['Person page', 'people/adam-dean/index.html'], ['People directory', 'people/index.html'], ['Explore', 'explore/index.html'], ['Home', 'index.html'], ['Registry', 'registry/index.html'], ['Data', 'data/index.html'], ['Learn', 'learn/index.html'], ['Governance', 'governance/index.html'], ['About', 'about/index.html']]) {
  check(readFileSync(join(PUB, rel), 'utf8').includes('class="ink '), `${label} (${rel}) carries semantic ink`);
}
const profile = readFileSync(join(PUB, 'projects/minswap/index.html'), 'utf8');
for (const cls of ['profile-heading', 'metric-grid', 'profile-tags', 'source-list']) {
  const m = profile.match(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</(div|ul)>`));
  if (m) check(!m[1].includes('class="ink '), `Project page .${cls} must not be inked`);
}

// ---- 4. data hygiene ------------------------------------------------------
const jsonFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsonFiles(join(dir, e.name)) : e.name.endsWith('.json') ? [join(dir, e.name)] : []));
for (const file of jsonFiles(PUB)) {
  const text = readFileSync(file, 'utf8');
  if (/class=\\?"ink|ink-(gold|green|blue|magenta|purple|cyan)/.test(text)) fail(`${relative(PUB, file)}: JSON carries ink markup`);
}
const search = readFileSync(join(PUB, 'data/search-index.json'), 'utf8');
check(!/<span|<\/span>|class=/.test(search), 'search-index.json carries no HTML markup');
// Search text is read from plain prose: an ink span must not leave a spacing
// artefact such as "Cardano 's" behind in titles or subtitles.
for (const item of JSON.parse(search).items) {
  if (/\s['’]s\b|\s[,.;:]/.test(`${item.title} ${item.subtitle}`)) { fail(`search-index item text has a markup spacing artefact: ${item.url}`); break; }
}
check(JSON.stringify(buildSearchIndex()) + '\n' === search, 'search-index.json equals a fresh build from the inked pages (ink-agnostic)');

// ---- 5. CSS + no runtime JS ----------------------------------------------
const css = readFileSync(join(PUB, 'assets/css/site.css'), 'utf8');
for (const tone of INK_FAMILIES) {
  const rule = (css.match(new RegExp(`^\\.ink-${tone} \\{[^}]*\\}`, 'm')) || [''])[0];
  check(/color:color-mix\(in srgb, .*var\(--ink-to\)/.test(rule) && !/#[0-9a-f]{3,6}/i.test(rule), `site.css .ink-${tone} must be a theme-derived color-mix toward --ink-to`);
}
check(!/^\.ink-(amber|coral) /m.test(css), 'retired pilot families are removed');
for (const file of readdirSync(join(PUB, 'assets/js'))) {
  const js = readFileSync(join(PUB, 'assets/js', file), 'utf8');
  if (/ink-(gold|green|blue|magenta|purple|cyan)|class="ink |semantic-ink/.test(js)) fail(`runtime JS must not create or rewrite ink: assets/js/${file}`);
}

const share = inkedInProse / Math.max(proseWords, 1);
if (problems.length) {
  console.error(`[test-semantic-ink] FAIL (${problems.length})\n - ${problems.slice(0, 40).join('\n - ')}`);
  process.exit(1);
}
console.log(`[test-semantic-ink] OK — ${total} accent words on ${inkedPages}/${pages} public pages; ${(share * 100).toFixed(1)}% of words in inked paragraphs; families ${JSON.stringify(byFamily)}; dictionary exact, deterministic, excluded contexts clean, no JSON/search contamination, no runtime JS.`);

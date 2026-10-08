#!/usr/bin/env node
/**
 * Ecosystem Signals guardrail (npm run test:signals; part of the build).
 *
 * Proves: the shipped dataset is fully valid and its related links point at
 * real records; the homepage selection rule (LIVE + show_current + dated on
 * or before today + not expired, newest first, at most six); malformed
 * records are dropped with reasons and never throw or reach HTML; text is
 * escaped and only http(s) links render; and the generated homepage carries
 * the strip from data inside the WHAT'S CURRENT window: a headline-only
 * ticker plus compact details (no why_it_matters), with the site's existing
 * semantic-ink colouring surviving in headline and summary prose.
 * Runs after apply-semantic-ink in the build. Ticker behaviour is covered by
 * test-signals-ticker.mjs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_CURRENT, SIGNAL_TYPES, renderSignals, selectSignals, signalProblems } from './lib/signals.mjs';
import { stripInk } from './lib/semantic-ink.mjs';
import { SIGNALS_END, SIGNALS_START, nowFromEnv, relatedLookup, replaceSignals } from './generate-home-signals.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const read = (...p) => readFileSync(join(PUBLIC, ...p), 'utf8');
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error(`FAIL: ${msg}`); } };
const day = (iso) => Date.parse(iso + 'T12:00:00Z');

const base = {
  id: 'test-signal', date: '2026-10-07', type: 'PROTOCOL', impact: 'HIGH',
  headline: 'Test headline', summary: 'Test summary.', why_it_matters: 'Test reason.',
  primary_url: 'https://example.org/source', source_label: 'Source',
  related_project_slugs: [], related_person_slugs: [], tags: ['TEST'],
  show_current: true, expires_at: null, status: 'LIVE',
};
const sig = (over) => ({ ...base, ...over });

// 1. Shipped dataset: every record valid, unique ids, related slugs real.
const dataset = JSON.parse(read('data', 'signals.json'));
const projects = JSON.parse(read('data', 'projects.json')).projects;
const people = JSON.parse(read('data', 'people.json')).people;
ok(dataset.schema === 'index80.signals' && dataset.schema_version === 1, 'signals.json declares schema index80.signals v1');
const shipped = selectSignals(dataset, day('2026-10-07'));
ok(shipped.rejected.length === 0, `every shipped signal is valid (rejected: ${JSON.stringify(shipped.rejected)})`);
const projectSlugs = new Set(projects.map((p) => p.slug));
const personSlugs = new Set(people.map((p) => p.slug));
for (const s of dataset.signals) {
  for (const slug of s.related_project_slugs || []) ok(projectSlugs.has(slug) && existsSync(join(PUBLIC, 'projects', slug, 'index.html')), `${s.id}: related project ${slug} exists`);
  for (const slug of s.related_person_slugs || []) ok(personSlugs.has(slug) && existsSync(join(PUBLIC, 'people', slug, 'index.html')), `${s.id}: related person ${slug} exists`);
}
const seed = dataset.signals.find((s) => s.id === '2026-10-07-cip-0113-programmable-tokens-mainnet');
ok(seed && seed.date === '2026-10-07' && seed.type === 'PROTOCOL' && seed.impact === 'HIGH' && seed.status === 'LIVE' && seed.show_current === true, 'seed CIP-0113 signal present with the approved date/type/impact/status');
ok(seed && seed.headline === 'CIP-0113 programmable tokens live on Cardano mainnet', 'seed headline is the approved wording');
ok(seed && JSON.stringify(seed.tags) === JSON.stringify(['CIP-0113', 'STABLECOINS', 'RWA', 'WALLETS', 'DEFI']), 'seed tags are the approved set');
ok(seed && seed.primary_url.startsWith('https://cardanofoundation.org/') && seed.secondary_links?.some((l) => l.url === 'https://cips.cardano.org/cip/CIP-0113'), 'seed links the Foundation announcement and the CIP');
ok(seed && seed.related_project_slugs.length === 0 && seed.expires_at === '2026-11-06', 'CIP-0113: no related project (Libertum removed), expires 2026-11-06');
// Launch set: one strong signal per category, from primary sources, each with an expiry.
const launch = {
  PROTOCOL: ['2026-10-07-cip-0113-programmable-tokens-mainnet', 'https://cardanofoundation.org/'],
  INFRASTRUCTURE: ['2026-09-18-cardano-x402-sdk', 'https://developers.cardano.org/'],
  ADOPTION: ['2026-09-30-petrobras-renewable-fuel-traceability', 'https://cardanofoundation.org/'],
  GOVERNANCE: ['2026-10-02-three-governance-actions-open', 'https://intersectmbo.org/'],
  FUNDING: ['2026-10-02-treasury-budgets-usdm-smart-contracts', 'https://intersectmbo.org/'],
  PROJECT: ['2026-09-17-plutus-moves-to-midgard-labs', 'https://www.iog.io/'],
};
ok(JSON.stringify(Object.keys(launch)) === JSON.stringify(SIGNAL_TYPES), 'launch set covers every signal type');
for (const [type, [id, host]] of Object.entries(launch)) {
  const s = dataset.signals.find((x) => x.id === id);
  ok(s && s.type === type && s.primary_url.startsWith(host), `${type}: ${id} present with its primary source`);
}
// Expiry policy: every signal expires; default 30 days after its date, never later.
for (const s of dataset.signals) {
  const days = s.expires_at ? (Date.parse(s.expires_at) - Date.parse(s.date)) / 86400000 : null;
  ok(days !== null && days >= 0 && days <= 30, `${s.id}: expires within 30 days of its date (got ${days})`);
}
ok(dataset.signals.find((s) => s.type === 'GOVERNANCE')?.expires_at === '2026-10-10', 'governance signal expires before the first vote closes (11 Oct, epoch 661)');
ok(!dataset.signals.some((s) => s.related_project_slugs.includes('libertum') || s.related_project_slugs.includes('midgard')), 'no unevidenced relations (libertum; midgard is Anastasia Labs, not Midgard Labs)');

// 2. Selection rule.
const now = day('2026-10-07');
const pick = (signals, limit) => selectSignals({ signals }, now, limit).current.map((s) => s.id);
ok(pick([sig({ status: 'DRAFT' })]).length === 0, 'DRAFT is not current');
ok(pick([sig({ status: 'WITHDRAWN' })]).length === 0, 'WITHDRAWN is not current');
ok(pick([sig({ show_current: false })]).length === 0, 'show_current=false is not current');
ok(pick([sig({ date: '2026-10-08' })]).length === 0, 'a future-dated signal is not current yet');
ok(pick([sig({ expires_at: '2026-10-07' })]).length === 1, 'expires_at is inclusive: still current on its last day');
ok(pick([sig({ expires_at: '2026-10-06' })]).length === 0, 'expired the day after expires_at');
const many = Array.from({ length: 8 }, (_, i) => sig({ id: `s-${i}`, date: `2026-09-0${i + 1}`, impact: i % 2 ? 'LOW' : 'HIGH' }));
const top = pick(many);
ok(top.length === MAX_CURRENT && MAX_CURRENT === 6, `at most ${MAX_CURRENT} current signals (got ${top.length})`);
ok(top[0] === 's-7' && top[5] === 's-2', `newest first, oldest dropped past the cap (got ${top.join(',')})`);
ok(JSON.stringify(pick([sig({ id: 'low', impact: 'LOW' }), sig({ id: 'high' })])) === '["high","low"]', 'same day: higher impact first');
ok(pick([sig({ id: 'dup' }), sig({ id: 'dup', headline: 'Second' })]).length === 1 &&
  selectSignals({ signals: [sig({ id: 'dup' }), sig({ id: 'dup' })] }, now).rejected[0]?.problems.includes('duplicate id'), 'duplicate ids: first wins, the rest are rejected');

// 3. Malformed input fails safe: no throw, rejected with reasons, nothing rendered.
const malformed = [
  null, 'text', [], {},
  sig({ id: 'Bad Id' }), sig({ date: '2026-02-30' }), sig({ date: '7 Oct 2026' }), sig({ type: 'NEWS' }),
  sig({ impact: 'HUGE' }), sig({ headline: '' }), sig({ headline: 'x'.repeat(121) }), sig({ summary: undefined }),
  sig({ why_it_matters: ' ' }), sig({ primary_url: 'javascript:alert(1)' }), sig({ primary_url: 'http://insecure.example' }),
  sig({ source_label: null }), sig({ secondary_links: [{ label: 'x', url: 'data:text/html,hi' }] }),
  sig({ related_project_slugs: 'libertum' }), sig({ related_person_slugs: ['Not A Slug'] }), sig({ tags: [''] }),
  sig({ show_current: 'yes' }), sig({ expires_at: 'soon' }), sig({ status: 'live' }),
];
let threw = false;
let result;
try { result = selectSignals({ signals: malformed }, now); } catch { threw = true; }
ok(!threw && result.current.length === 0 && result.rejected.length === malformed.length, `every malformed record is rejected without throwing (${result?.rejected.length}/${malformed.length})`);
ok(result?.rejected.every((r) => r.problems.length > 0), 'each rejection carries a reason');
for (const bad of [undefined, null, 42, {}, { signals: 'nope' }]) {
  let t = false;
  try { ok(selectSignals(bad, now).current.length === 0, `dataset ${JSON.stringify(bad)} yields no signals`); } catch { t = true; }
  ok(!t, `dataset ${JSON.stringify(bad)} does not throw`);
}
const mixed = selectSignals({ signals: [null, sig({ id: 'good' }), sig({ primary_url: 'javascript:x' })] }, now);
ok(mixed.current.length === 1 && mixed.current[0].id === 'good', 'one bad record does not hide the good ones');
ok(signalProblems(base).length === 0, 'the base fixture is valid');

// 4. Rendering: escaped, safe links, real related records only.
const hostile = sig({ headline: '<img src=x onerror=alert(1)>', summary: '"quoted" & <b>bold</b>', source_label: '<script><SCRIPT><ScRiPt>' });
const html = renderSignals([hostile], {});
ok(['<img', '<b>', '<script'].every((tag) => !html.toLowerCase().includes(tag)) && html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'signal text is HTML-escaped');
ok(html.includes('&quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;') && html.includes('&lt;script&gt;&lt;SCRIPT&gt;&lt;ScRiPt&gt;'), 'summary and source label are escaped, including upper and mixed-case tags');
ok(renderSignals([], {}) === '', 'no current signals renders nothing (strip omitted)');
const linked = renderSignals([sig({ related_project_slugs: ['real', 'ghost'], related_person_slugs: ['person'] })], {
  projects: new Map([['real', 'Real Project']]), people: new Map([['person', 'A Person']]),
});
ok(linked.includes('href="/projects/real/"') && !linked.includes('ghost') && linked.includes('href="/people/person/"'), 'related links render only for known records');
ok(!linked.includes('All signals'), 'no ALL SIGNALS link while no archive exists');
ok(renderSignals([base], { archiveUrl: '/signals/' }).includes('href="/signals/"'), 'ALL SIGNALS link appears once an archive URL is set');
ok(/target="_blank" rel="noopener noreferrer"/.test(linked), 'external source links open safely in a new tab');
const two = renderSignals([sig({ id: 'a-1', headline: 'Alpha headline', why_it_matters: 'Alpha reason never shown', secondary_links: [{ label: 'Spec', url: 'https://example.org/spec' }] }), sig({ id: 'b-2', headline: 'Beta headline' })], {});
const tickerHtml = two.slice(two.indexOf('<ul class="signals-ticker-list"'), two.indexOf('</ul>', two.indexOf('<ul class="signals-ticker-list"')));
const ticks = [...tickerHtml.matchAll(/<li class="signal-tick" data-signal-ref="([^"]+)">([\s\S]*?)<\/li>/g)].map((m) => [m[1], m[2]]);
ok(JSON.stringify(ticks) === JSON.stringify([['a-1', 'Alpha headline'], ['b-2', 'Beta headline']]), `ticker holds headlines only, in order (got ${JSON.stringify(ticks)})`);
ok(!/<time|IMPACT|PROTOCOL|<a\b|<button/.test(tickerHtml), 'ticker carries no date, type, impact or links in static HTML');
ok(!two.includes('Alpha reason never shown'), 'why_it_matters is not rendered on the homepage');
ok(/id="signal-a-1"[\s\S]*?<ul class="signal-links"><li><a href="https:\/\/example\.org\/source"[\s\S]*?<li><a href="https:\/\/example\.org\/spec"/.test(two), 'detail lists the primary source first, then the secondary source');
ok(!/aria-live/.test(two), 'static strip has no aria-live container (it would block semantic ink)');
const lookup = relatedLookup([{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }, null], [], (dir, slug) => slug === 'a');
ok(lookup.projects.has('a') && !lookup.projects.has('b'), 'related lookup requires a real generated page');

// 5. Marker handling and clock override.
let markerThrow = false;
try { replaceSignals('<p>no markers</p>', ''); } catch { markerThrow = true; }
ok(markerThrow, 'missing markers fail the build (template fault)');
ok(replaceSignals(`a${SIGNALS_START}old${SIGNALS_END}b`, '') === `a${SIGNALS_START}\n        ${SIGNALS_END}b`, 'empty strip leaves only the markers');
ok(nowFromEnv({ INDEX80_SIGNALS_NOW: '2026-10-07' }, 0) === day('2026-10-07') && nowFromEnv({ INDEX80_SIGNALS_NOW: 'bad' }, 5) === 5, 'INDEX80_SIGNALS_NOW override is strict');

// 6. Generated homepage: the strip comes from data, inside WHAT'S CURRENT.
const HOME = read('index.html');
ok(HOME.split(SIGNALS_START).length === 2 && HOME.split(SIGNALS_END).length === 2, 'homepage has exactly one signals marker pair');
const windowBody = HOME.slice(HOME.indexOf('id="home-window-body"'), HOME.indexOf('<nav class="os-shortcuts"'));
ok(windowBody.includes(SIGNALS_START), 'signals strip sits inside the WHAT\'S CURRENT window, before the shortcuts');
const strip = HOME.slice(HOME.indexOf(SIGNALS_START), HOME.indexOf(SIGNALS_END));
const expected = selectSignals(dataset, nowFromEnv()).current;
const rendered = [...strip.matchAll(/data-signal-id="([^"]+)"/g)].map((m) => m[1]);
ok(JSON.stringify(rendered) === JSON.stringify(expected.map((s) => s.id)), `homepage signals match the dataset selection (got ${rendered.join(',') || 'none'})`);
if (expected.length) {
  ok(/<h3 class="signals-title" id="signals-title">ECOSYSTEM SIGNALS<\/h3>/.test(strip), 'strip is labelled ECOSYSTEM SIGNALS, label left un-inked');
  ok(!/\bCURRENT\b/.test(strip.replace(/<[^>]+>/g, ' ')), 'no current-count metadata in the strip');
  const tickTexts = [...strip.matchAll(/<li class="signal-tick" data-signal-ref="[^"]+">([\s\S]*?)<\/li>/g)].map((m) => stripInk(m[1]));
  ok(JSON.stringify(tickTexts) === JSON.stringify(expected.map((s) => s.headline.replace(/&/g, '&amp;').replace(/'/g, '&#39;'))), 'homepage ticker shows exactly the current headlines');
  for (const s of dataset.signals) ok(!HOME.includes(s.why_it_matters.slice(0, 40)), `${s.id}: why_it_matters stays off the homepage`);
  const lk = relatedLookup(projects, people, (dir, slug) => existsSync(join(PUBLIC, dir, slug, 'index.html')));
  ok(stripInk(strip) === `${SIGNALS_START}\n${renderSignals(expected, { ...lk, archiveUrl: null })}\n        `, 'semantic ink only adds word spans: the strip is otherwise exactly the generated markup');
  ok(/<li class="signal-tick"[^>]*>[^<]*<span class="ink ink-(green|blue|gold|magenta|cyan|purple)">/.test(strip), 'semantic ink colours words inside ticker headlines');
  ok(/<p class="signal-summary">[^]*?<span class="ink ink-/.test(strip), 'semantic ink colours words inside summaries');
  ok(!/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*class="ink /.test(strip), 'links are never inked');

  ok(!/\b(news|breaking|latest|trending)\b/i.test(strip.replace(/<[^>]+>/g, ' ')), 'strip carries no news-feed language');
  ok(!/<img\b/i.test(strip), 'strip has no thumbnails');
}
ok(/<script src="assets\/js\/signals-ticker\.js" defer><\/script>/.test(HOME) && existsSync(join(PUBLIC, 'assets', 'js', 'signals-ticker.js')), 'homepage loads the ticker enhancement');
const css = read('assets', 'css', 'site.css');
const motionBlocks = css.match(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g) || [];
const outsideMotion = motionBlocks.reduce((rest, block) => rest.replace(block, ''), css);
ok(motionBlocks.some((b) => b.includes('.signals-track') && b.includes('.signal-tick.is-entering')), 'marquee and step motion are declared under prefers-reduced-motion: no-preference');
ok(!/\.signal[\w-]*[^{}]*\{[^}]*\banimation\s*:/.test(outsideMotion), 'no signals animation outside prefers-reduced-motion: no-preference');
ok(/\.signals\[data-signals-mode="step"\] \.signal-tick:not\(\.is-active\) \{ display:none; \}/.test(css), 'step mode shows one complete headline at a time');
ok(/\.signals-ticker-clone \{ display:none; \}/.test(css), 'the marquee copy is hidden unless the marquee is running');
ok(!/signals[^{]*\{[^}]*(#[0-9a-f]{3,6}\b|rgb\()/i.test(css.slice(css.indexOf('Ecosystem Signals (WHAT'))), 'signals CSS uses theme tokens only (no own palette)');

if (failures) { console.error(`[test-home-signals] ${failures} failure(s)`); process.exit(1); }
console.log(`[test-home-signals] OK — ${dataset.signals.length} signal(s) valid, ${expected.length} current on the homepage; selection, expiry, fail-safe and escaping rules hold`);

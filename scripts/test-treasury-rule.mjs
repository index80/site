#!/usr/bin/env node
/**
 * Regression test for the shared "confirmed Treasury-funded" rule
 * (public_html/assets/js/treasury-rule.js) and everywhere it is applied.
 *
 * A Catalyst / Funding Ref alone must never create a badge, a filter match or a
 * funded-list row; confirmed funding needs a funded-proposal count, a USD value
 * or an ADA-native value. USD and ADA are never converted.
 *
 * Run AFTER the page generators (it inspects the generated static output).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public_html');
const T = createRequire(import.meta.url)(join(PUB, 'assets/js/treasury-rule.js'));
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

// --- 1. rule semantics ---
const REF = 'https://projectcatalyst.io/funds/14/x/y';
check('reference alone is NOT confirmed funding', T.isConfirmedFunded({ treasury_funding_ref: REF }) === false);
check('free-text reference alone is NOT confirmed funding', T.isConfirmedFunded({ treasury_funding_ref: 'Fund 6 / Fund 8 / Fund 11' }) === false);
check('funded-proposal count confirms funding', T.isConfirmedFunded({ treasury_funded_proposals: 1 }) === true);
check('USD value confirms funding', T.isConfirmedFunded({ treasury_funding_value_usd: 1000 }) === true);
check('ADA-native value confirms funding', T.isConfirmedFunded({ treasury_funding_value_ada: 570000 }) === true);
check('zero / null / blank values do not confirm funding', [0, null, '', undefined, '0'].every((v) => !T.isConfirmedFunded({ treasury_funded_proposals: v, treasury_funding_value_usd: v, treasury_funding_value_ada: v })));
check('legacy bridge only fills fields the record lacks', T.isConfirmedFunded({}, { treasury_funded_proposals: 2 }) === true && T.fundingUsd({ treasury_funding_value_usd: 5 }, { treasury_funding_value_usd: 9 }) === 5);
check('ADA never leaks into USD (and vice versa)', T.fundingUsd({ treasury_funding_value_ada: 570000 }) === null && T.fundingAda({ treasury_funding_value_usd: 1000 }) === null);
check('formatAda formats native ADA', T.formatAda(570000) === '₳570,000' && T.formatAda(1250000) === '₳1.25M' && T.formatAda(null) === '' && T.formatAda(0) === '');
check('single-proposal refs are recognised as linked funding; proposer refs are not', T.isLinkedProposalRef(REF) === true && T.isLinkedProposalRef('https://projectcatalyst.io/proposers/minswapdex') === false);

// --- 2. generated static output agrees with the rule ---
const dataset = JSON.parse(readFileSync(join(PUB, 'data/projects.json'), 'utf8'));
const bridgePath = join(PUB, 'data/treasury-funding.json');
const bridge = existsSync(bridgePath) ? (JSON.parse(readFileSync(bridgePath, 'utf8')).records || {}) : {};
const projects = dataset.projects || [];
let pageMismatch = [];
let checked = 0;
for (const p of projects) {
  const file = join(PUB, 'projects', p.slug, 'index.html');
  if (!existsSync(file)) continue;
  checked += 1;
  const html = readFileSync(file, 'utf8');
  // The static generator sees the record only (the legacy bridge is a client-side fill).
  const expected = T.isConfirmedFunded(p);
  const hasBadge = html.includes('class="badge-treasury"');
  const hasMetric = /TREASURY FUNDING<\/span>/.test(html);
  if (hasBadge !== expected || hasMetric !== expected) pageMismatch.push(`${p.slug}(badge=${hasBadge},metric=${hasMetric},rule=${expected})`);
}
check(`static project pages: badge + metric match the shared rule (${checked} pages)`, pageMismatch.length === 0, pageMismatch.slice(0, 5).join(', '));

const home = readFileSync(join(PUB, 'index.html'), 'utf8');
const homeMarks = (home.match(/class="dir-treasury"/g) || []).length;
const expectedHome = projects.filter((p) => T.isConfirmedFunded(p)).length;
check(`homepage ₳ marks match the shared rule (${expectedHome})`, homeMarks === expectedHome, `marks=${homeMarks}`);

const refOnly = projects.filter((p) => T.fundingRef(p) && !T.isConfirmedFunded(p)).map((p) => p.slug);
for (const slug of refOnly) {
  const file = join(PUB, 'projects', slug, 'index.html');
  if (!existsSync(file)) continue;
  check(`ref-only record "${slug}" gets no badge or funding metric`, !/badge-treasury"/.test(readFileSync(file, 'utf8')));
}

// --- 3. every consumer uses the shared rule (no private copies of the test) ---
const consumers = ['treasury.js', 'treasury-directory.js', 'treasury-summary.js', 'cardano-data.js', 'cardano-data-live.js', 'directory.js'];
for (const name of consumers) {
  const src = readFileSync(join(PUB, 'assets/js', name), 'utf8');
  check(`${name} uses INDEX80Treasury`, /INDEX80Treasury/.test(src));
  check(`${name} has no private "ref implies funded" trigger`, !/treasury_funding_ref\s*\?/.test(src) && !/if \(!p\.treasury_funding_ref\)/.test(src));
}
for (const gen of ['generate-project-pages.mjs', 'generate-home-directory.mjs']) {
  const src = readFileSync(join(ROOT, 'scripts', gen), 'utf8');
  check(`${gen} gates on the shared rule`, /Treasury\.isConfirmedFunded/.test(src) && !/p\.treasury_funding_ref\s*\?/.test(src));
}
check('rule script is loaded before consumers (main.js, analytics.js, homepage)',
  /treasury-rule\.js/.test(readFileSync(join(PUB, 'assets/js/main.js'), 'utf8')) &&
  /treasury-rule\.js/.test(readFileSync(join(PUB, 'assets/js/analytics.js'), 'utf8')) &&
  /treasury-rule\.js/.test(home));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;

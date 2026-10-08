#!/usr/bin/env node
/**
 * INDEX:80 Ecosystem Signals → homepage WHAT'S CURRENT.
 *
 * Renders the current signals from public_html/data/signals.json between the
 * INDEX80_SIGNALS markers in public_html/index.html (see scripts/lib/signals.mjs
 * for the schema and selection rule). The strip is complete static HTML;
 * assets/js/signals-ticker.js only adds the restrained rotation.
 *
 * Fail-safe: an unreadable dataset or a malformed record never breaks the
 * build or the homepage — bad records are skipped and reported, and with no
 * current signals the strip is simply omitted. Missing markers are a template
 * fault and do fail, like the other homepage generators.
 *
 * Expiry is measured against the build clock (override with
 * INDEX80_SIGNALS_NOW=YYYY-MM-DD for a reproducible run); the browser script
 * also hides a signal whose expiry passes between builds.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isoDate, renderSignals, selectSignals } from './lib/signals.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const SIGNALS_FILE = join(PUBLIC_HTML, 'data', 'signals.json');
const PROJECTS_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const PEOPLE_FILE = join(PUBLIC_HTML, 'data', 'people.json');
const HOME_FILE = join(PUBLIC_HTML, 'index.html');

export const SIGNALS_START = '<!-- INDEX80_SIGNALS_START -->';
export const SIGNALS_END = '<!-- INDEX80_SIGNALS_END -->';

/** One content-derived version couples the homepage's ticker CSS and JS. */
export function versionSignalsAssets(html, css, script) {
  const version = createHash('sha256').update(css).update('\0').update(script).digest('hex').slice(0, 16);
  return html.replace(/assets\/css\/site\.css(?:\?v=[a-zA-Z0-9-]+)?(?=")/g, `assets/css/site.css?v=${version}`)
    .replace(/assets\/js\/signals-ticker\.js(?:\?v=[a-zA-Z0-9-]+)?(?=")/g, `assets/js/signals-ticker.js?v=${version}`);
}

export function replaceSignals(html, body) {
  const start = html.indexOf(SIGNALS_START);
  const end = html.indexOf(SIGNALS_END);
  if (start < 0 || end < 0 || end <= start ||
      html.indexOf(SIGNALS_START, start + 1) !== -1 || html.indexOf(SIGNALS_END, end + 1) !== -1) {
    throw new Error('Homepage signals markers must each occur exactly once, in order.');
  }
  const contentStart = start + SIGNALS_START.length;
  return html.slice(0, contentStart) + '\n' + (body ? body + '\n' : '') + '        ' + html.slice(end);
}

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (err) {
    console.warn(`[generate-home-signals] WARNING: could not read ${file.slice(ROOT.length + 1)} (${err.message}); continuing without it`);
    return fallback;
  }
}

/** Display names for related slugs that have a real generated page. */
export function relatedLookup(projects, people, pageExists) {
  const map = (list, dir) => new Map((Array.isArray(list) ? list : [])
    .filter((r) => r && typeof r.slug === 'string' && typeof r.name === 'string' && pageExists(dir, r.slug))
    .map((r) => [r.slug, r.name]));
  return { projects: map(projects, 'projects'), people: map(people, 'people') };
}

export function nowFromEnv(env = process.env, fallbackMs = Date.now()) {
  const forced = isoDate(env.INDEX80_SIGNALS_NOW);
  return forced ? Date.parse(forced + 'T12:00:00Z') : fallbackMs;
}

function main() {
  const dataset = readJson(SIGNALS_FILE, { signals: [] });
  const { rejected, current } = selectSignals(dataset, nowFromEnv());
  for (const r of rejected) {
    console.warn(`[generate-home-signals] WARNING: skipped signal #${r.index}${r.id ? ` (${r.id})` : ''}: ${r.problems.join('; ')}`);
  }
  const lookup = relatedLookup(
    readJson(PROJECTS_FILE, {}).projects,
    readJson(PEOPLE_FILE, {}).people,
    (dir, slug) => existsSync(join(PUBLIC_HTML, dir, slug, 'index.html')),
  );
  const archiveUrl = typeof dataset?.archive_url === 'string' && /^\/[a-z0-9/-]*$/.test(dataset.archive_url) ? dataset.archive_url : null;
  const html = versionSignalsAssets(
    replaceSignals(readFileSync(HOME_FILE, 'utf8'), renderSignals(current, { ...lookup, archiveUrl })),
    readFileSync(join(PUBLIC_HTML, 'assets', 'css', 'site.css')),
    readFileSync(join(PUBLIC_HTML, 'assets', 'js', 'signals-ticker.js')),
  );
  writeFileSync(HOME_FILE, html, 'utf8');
  console.log(`[generate-home-signals] ${current.length} current signal(s) on the homepage; ${rejected.length} record(s) skipped`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

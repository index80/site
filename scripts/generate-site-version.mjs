#!/usr/bin/env node
/**
 * Stamps a small deploy-version marker so a page Safari/WebKit resumes from
 * its back-forward cache (bfcache) can notice a newer deploy exists and
 * reload itself once, without disabling caching anywhere.
 *
 * Two things come from one computed VERSION:
 *   - public_html/site-version.json — { "version": "...", "builtAt": "..." }
 *     fetched at runtime with cache:'no-store' as the live source of truth.
 *   - the existing `const VERSION = '...'` line in
 *     public_html/assets/js/main.js — the value already baked into whatever
 *     main.js instance is executing for a given page. A bfcache freeze
 *     preserves that JS closure as-is (the script does not re-run on
 *     restore), so it stays a faithful record of "what version was live
 *     when this page last actually loaded" for comparison on `pageshow`.
 *
 * Timestamp format matches the convention already used by hand in main.js
 * (e.g. '20260916-1327'). Runs last in `npm run build`, after every step
 * that generates or patches HTML, so it always reflects the final build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const MAIN_JS_PATH = join(PUBLIC_HTML, 'assets', 'js', 'main.js');
const VERSION_JSON_PATH = join(PUBLIC_HTML, 'site-version.json');

function pad(n) {
  return String(n).padStart(2, '0');
}

function computeVersion(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  return `${y}${m}${d}-${hh}${mm}`;
}

const VERSION = computeVersion();
const builtAt = new Date().toISOString();

writeFileSync(
  VERSION_JSON_PATH,
  JSON.stringify({ version: VERSION, builtAt }, null, 2) + '\n'
);

const mainJs = readFileSync(MAIN_JS_PATH, 'utf8');
const VERSION_LINE_RE = /const VERSION = '[^']*';/;
if (!VERSION_LINE_RE.test(mainJs)) {
  throw new Error(`[generate-site-version] could not find "const VERSION = '...';" in ${MAIN_JS_PATH}`);
}
writeFileSync(MAIN_JS_PATH, mainJs.replace(VERSION_LINE_RE, `const VERSION = '${VERSION}';`));

console.log(`[generate-site-version] version ${VERSION}; wrote site-version.json and stamped main.js`);

#!/usr/bin/env node
/**
 * Inserts the site-wide "SEARCH INDEX:80" strip directly below the primary
 * navigation (after </header class="site-header">) on every normal public
 * page — static and generated alike — so there is one search control in one
 * place across the site. Idempotent: the block between the markers is
 * replaced, and a file is written only if it changed.
 *
 * The strip is a plain GET form to /search/?q= (works without JavaScript);
 * assets/js/site-search.js adds the as-you-type dropdown.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
export const START = '<!-- INDEX80_GLOBAL_SEARCH_START -->';
export const END = '<!-- INDEX80_GLOBAL_SEARCH_END -->';
// Tooling pages that are not part of the public site.
export const EXCLUDED_PREFIXES = ['admin/', 'review/'];

export const GLOBAL_SEARCH_BLOCK = `${START}
  <div class="global-search" data-global-search>
    <form class="search-box global-search-box" role="search" action="/search/" method="get" aria-label="Search INDEX:80">
      <label class="global-search-label" for="global-search-input"><span aria-hidden="true">&gt;</span><span class="global-search-label-text"> SEARCH INDEX:80</span></label>
      <input id="global-search-input" name="q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="Projects, people, organisations, tags, governance…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="global-search-results" aria-describedby="global-search-hint">
    </form>
    <div id="global-search-results" class="gs-results" role="listbox" aria-label="Search suggestions" hidden></div>
    <p id="global-search-hint" class="visually-hidden">Type at least two characters for suggestions. Use the arrow keys to choose one, or press Enter to see all results.</p>
    <p class="gs-status visually-hidden" aria-live="polite"></p>
  </div>
  <script src="/assets/js/site-search.js" defer></script>
${END}`;

function* htmlFiles(dir) {
  for (const e of readdirSync(dir, {withFileTypes:true})) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

export function applyGlobalSearch(html) {
  const stripped = html.replace(new RegExp(`\\n*[ \\t]*${START}[\\s\\S]*?${END}`), '');
  const header = stripped.search(/<header class="site-header"[\s>]/);
  if (header === -1) return null;
  const close = stripped.indexOf('</header>', header);
  if (close === -1) return null;
  const at = close + '</header>'.length;
  return `${stripped.slice(0, at)}\n\n  ${GLOBAL_SEARCH_BLOCK}${stripped.slice(at)}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let applied = 0;
  let written = 0;
  for (const file of htmlFiles(PUBLIC)) {
    const rel = relative(PUBLIC, file).split(sep).join('/');
    if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const html = readFileSync(file, 'utf8');
    const next = applyGlobalSearch(html);
    if (next == null) continue;
    applied += 1;
    if (next !== html) { writeFileSync(file, next); written += 1; }
  }
  console.log(`[apply-global-search] search strip on ${applied} page(s); ${written} file(s) updated`);
}

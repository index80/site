#!/usr/bin/env node
// Every page's header and footer navigation must match the canonical order in
// scripts/lib/site-nav.mjs exactly — static, custom (e.g. Charles Hoskinson)
// and generated (projects, People, registry history) pages alike.
import { INK_TOLERANT_HTML } from './test-helpers/ink-tolerant-html.mjs'; // eslint-disable-line no-unused-vars
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_NAV, SITE_NAV_HREFS, renderNavLinks } from './lib/site-nav.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const failures = [];
const htmlFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? htmlFiles(p) : (name.endsWith('.html') ? [p] : []);
});

const expected = SITE_NAV_HREFS.join(' ');
if (expected !== '/ /people/ /data/ /learn/ /governance/ /about/ /registry/ /submit/') {
  failures.push(`canonical order changed unexpectedly: ${expected}`);
}
if (!renderNavLinks('/people/').includes('<a href="/people/" aria-current="page">◎ People</a>')) failures.push('renderNavLinks does not mark the current page');

let navs = 0;
let pages = 0;
for (const file of htmlFiles(PUBLIC)) {
  const html = readFileSync(file, 'utf8');
  const blocks = [...html.matchAll(/<nav class="(main-nav|footer-nav)"[^>]*>([\s\S]*?)<\/nav>/g)];
  if (!blocks.length) continue;
  pages += 1;
  for (const [, cls, inner] of blocks) {
    navs += 1;
    const links = [...inner.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map(([, attrs, label]) => ({href:/href="([^"]+)"/.exec(attrs)?.[1], label, current:/aria-current="page"/.test(attrs)}));
    const hrefs = links.map((l) => l.href).join(' ');
    const labels = links.map((l) => l.label).join('|');
    if (hrefs !== expected) failures.push(`${relative(ROOT, file)} ${cls}: ${hrefs}`);
    else if (labels !== SITE_NAV.map(([, l]) => l).join('|')) failures.push(`${relative(ROOT, file)} ${cls}: labels ${labels}`);
    if (links.filter((l) => l.current).length > 1) failures.push(`${relative(ROOT, file)} ${cls}: more than one aria-current`);
  }
}
if (failures.length) {
  console.error(`[test-site-navigation] ${failures.length} failure(s):\n  ${failures.slice(0, 20).join('\n  ')}`);
  process.exit(1);
}
console.log(`[test-site-navigation] OK — ${navs} nav block(s) across ${pages} page(s) match Projects · People · Data · Learn · Governance · About · Registry · Submit`);

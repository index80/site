#!/usr/bin/env node
/**
 * INDEX:80 sitemap generator.
 *
 * Deterministic by construction: project URLs come directly from
 * public_html/data/projects.json (the same canonical Registry export the
 * page generator reads), so the sitemap can never drift from the actual
 * set of published project pages. Core static pages are a small fixed
 * list of genuinely public, indexable top-level pages — /review/ is
 * deliberately excluded (it already ships its own noindex,nofollow and
 * is not linked from navigation).
 *
 * Usage: node scripts/generate-sitemap.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const DATA_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const OUT_PATH = join(PUBLIC_HTML, 'sitemap.xml');
const SITE_URL = 'https://index80.com';

const SLUG_RE = /^[a-z0-9-]+$/;

// Genuinely public, indexable top-level static pages. /review/ is
// intentionally omitted (noindex,nofollow, unlinked dev editorial queue).
// /cardano/ is retired (obsolete duplicate "Discover" directory — the
// homepage is now the canonical directory) and permanently redirects to /
// via public_html/_redirects; it must never appear here again.
const CORE_PAGES = [
  '/',
  '/about/',
  '/about/charter/',
  '/data/',
  '/learn/',
  '/people/charles-hoskinson/',
  '/governance/',
  '/submit/',
  '/news/',
  '/privacy/',
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function main() {
  const raw = readFileSync(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  const projects = data.projects || [];

  const projectPaths = projects
    .filter((p) => p.slug && SLUG_RE.test(p.slug) && p.name && p.summary && p.category && p.status)
    .map((p) => `/projects/${p.slug}/`);

  const urls = [...CORE_PAGES, ...projectPaths];

  const body = urls
    .map((path) => `  <url><loc>${esc(SITE_URL + path)}</loc></url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

  writeFileSync(OUT_PATH, xml, 'utf8');
  console.log(`[generate-sitemap] wrote ${urls.length} url(s) (${CORE_PAGES.length} core page(s) + ${projectPaths.length} project page(s)) to public_html/sitemap.xml`);
}

main();

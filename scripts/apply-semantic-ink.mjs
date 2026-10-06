#!/usr/bin/env node
/**
 * Applies the INDEX:80 semantic accent words (scripts/lib/semantic-ink.mjs) to
 * the prose of every normal public page — static and generated alike — at
 * build time. Runs after the page generators. Idempotent and deterministic:
 * existing ink spans are stripped and re-applied, and a file is written only
 * if it changed. Public project/person names are guarded so a dictionary word
 * inside a name is never coloured.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inkHtml, nameGuard } from './lib/semantic-ink.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
// Tooling pages that are not part of the public site.
export const EXCLUDED_PREFIXES = ['admin/', 'review/'];

function* htmlFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

export function publicNames(root = ROOT) {
  const read = (rel) => JSON.parse(readFileSync(join(root, 'public_html', rel), 'utf8'));
  const projects = read('data/projects.json');
  const people = read('data/people.json');
  return [
    ...(Array.isArray(projects) ? projects : projects.projects || []).map((p) => p.name),
    ...(people.people || []).map((p) => p.name),
  ].filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const guard = nameGuard(publicNames());
  let pages = 0;
  let written = 0;
  let words = 0;
  for (const file of htmlFiles(PUBLIC)) {
    const rel = relative(PUBLIC, file).split(sep).join('/');
    if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const html = readFileSync(file, 'utf8');
    const next = inkHtml(html, { guard });
    pages += 1;
    words += (next.match(/<span class="ink ink-/g) || []).length;
    if (next !== html) { writeFileSync(file, next); written += 1; }
  }
  console.log(`[apply-semantic-ink] ${words} accent word(s) across ${pages} page(s); ${written} file(s) updated`);
}

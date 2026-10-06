#!/usr/bin/env node
import { INK_TOLERANT_HTML } from './test-helpers/ink-tolerant-html.mjs'; // eslint-disable-line no-unused-vars
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePublicPerson } from './lib/people-public.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT, 'public_html', 'data', 'people.json');
const PAGE_FILE = join(ROOT, 'public_html', 'people', 'index.html');
const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const html = readFileSync(PAGE_FILE, 'utf8');
const people = data.people || [];
const allowedCategories = new Set([
  'DReps & Governance','Founders & Builders','Developers & Engineers',
  'SPOs & Infrastructure','Creators & Media','Community & Ambassadors',
  'Education & Research','Ecosystem Leadership','Arts & Culture'
]);

if (!people.length) throw new Error('people.json contains no release records.');
const slugs = new Set();
for (const p of people) {
  validatePublicPerson(p, {publicRoot:join(ROOT, 'public_html')});
  if (!/^[a-z0-9-]+$/.test(p.slug)) throw new Error(`Invalid people slug: ${p.slug}`);
  if (slugs.has(p.slug)) throw new Error(`Duplicate people slug: ${p.slug}`);
  slugs.add(p.slug);
  if (!allowedCategories.has(p.primary_category)) throw new Error(`Unknown category for ${p.name}: ${p.primary_category}`);
  if (!Array.isArray(p.role_tags)) throw new Error(`role_tags must be an array for ${p.name}`);
  if (p.profile_url) {
    const rel = p.profile_url.replace(/^\//,'').replace(/\/$/,'');
    if (!existsSync(join(ROOT, 'public_html', rel, 'index.html'))) {
      throw new Error(`profile_url points to a missing static page for ${p.name}: ${p.profile_url}`);
    }
  }
}
const publicPeopleOutputs = [
  JSON.stringify(data), html, readFileSync(join(ROOT,'public_html','sitemap.xml'),'utf8'),
  ...people.map((p)=>readFileSync(join(ROOT,'public_html','people',p.slug,'index.html'),'utf8')),
].join('\n');
if (/Oliver Radivojevic|apex-oliver-radivojevic/i.test(publicPeopleOutputs)) {
  throw new Error('Privacy regression: old Apex identity or slug leaked into public People output');
}
if (!html.includes('INDEX80_PEOPLE_DIRECTORY_START') || !html.includes('INDEX80_PEOPLE_DIRECTORY_END')) {
  throw new Error('People directory generation markers are missing.');
}
for (const p of people) {
  const escapedName = p.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  if (!html.includes(escapedName)) throw new Error(`Generated People page is missing ${p.name}`);
}
if (!html.includes(`${people.length} RECORDS`)) {
  throw new Error(`People directory count does not match people.json (${people.length})`);
}
console.log(`[test-people-directory] OK — ${people.length} public release people, ${slugs.size} unique slugs`);

#!/usr/bin/env node
/**
 * Reciprocal Project ↔ People links (scripts/lib/people-project-links.mjs):
 *   - every project a public profile lists links back to that profile, and
 *     every profile linked from a project page links to that project;
 *   - Founder / Lead names link only on an exact public-name match;
 *   - an unmatched Founder / Lead value renders exactly as before.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectedPeopleByProject, normalizeName, renderFounderLead } from './lib/people-project-links.mjs';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public_html');
const projects = JSON.parse(readFileSync(join(PUBLIC, 'data', 'projects.json'), 'utf8')).projects || [];
const people = JSON.parse(readFileSync(join(PUBLIC, 'data', 'people.json'), 'utf8')).people || [];
const failures = [];
const ok = (cond, label) => { if (!cond) failures.push(label); };
const page = (url) => {
  const f = join(PUBLIC, url, 'index.html');
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const relations = (html) => (html.match(/<div data-editorial-relation="(?:founder|people)">[\s\S]*?<\/div>/g) || []).join('\n');

// Unit: exact-name linking only, text otherwise untouched.
const apex = { slug: 'apex', name: 'Apex', profile_url: '/people/apex/' };
const phil = { slug: 'phil-uplc', name: 'Phil (uplc)', profile_url: '/people/phil-uplc/' };
const r1 = renderFounderLead('Apex (@Apex_333) — CEO & Founder; Carlos Rene — CTO', [apex], { esc, renderText: esc });
ok(r1.html === '<a class="identity-link person-link" href="/people/apex/">Apex</a> (@Apex_333) — CEO &amp; Founder; Carlos Rene — CTO' && r1.linked.has('apex'), 'founder: exact name links, rest unchanged');
const r2 = renderFounderLead('Philip DiSarro — Founder / CEO', [phil], { esc, renderText: esc });
ok(!r2.html.includes('<a') && r2.linked.size === 0, 'founder: a near match (legal name vs persona) is never linked');

// Unmatched Founder / Lead values render exactly as they did before.
for (const p of projects.filter((x) => x.founder_lead)) {
  ok(renderFounderLead(p.founder_lead, [], { esc, renderText: esc }).html === esc(p.founder_lead), `founder: unmatched value unchanged (${p.slug})`);
}

// Generated pages: both directions.
const connected = connectedPeopleByProject(projects, people);
let pairs = 0;
for (const [slug, list] of connected) {
  const html = page(`projects/${slug}`);
  ok(html, `project page exists: ${slug}`);
  if (!html) continue;
  const rel = relations(html);
  for (const person of list) {
    pairs += 1;
    ok(rel.includes(`href="${person.profile_url}"`), `project → person: ${slug} → ${person.slug}`);
    const profile = page(person.profile_url.replace(/^\/|\/$/g, ''));
    ok(profile && profile.includes(`href="/projects/${slug}/"`), `person → project: ${person.slug} → ${slug}`);
  }
}
const bySlug = new Map(people.map((p) => [p.slug, p]));
for (const project of projects) {
  const html = page(`projects/${project.slug}`);
  if (!html) continue;
  const rel = relations(html);
  const list = connected.get(project.slug) || [];
  for (const [, url, text] of rel.matchAll(/<a class="(?:identity-link )?person-link" href="([^"]+)">([^<]+)<\/a>/g)) {
    const person = people.find((p) => p.profile_url === url);
    ok(person && list.includes(person), `only connected people are linked: ${project.slug} → ${url}`);
    ok(!rel.includes(`person-link" href="${url}">${text}</a>`) || normalizeName(text.replace(/ →$/, '')) === normalizeName(person?.name), `link text is the public name: ${project.slug} → ${url}`);
  }
  if (!list.length) ok(!rel.includes('person-link') && !rel.includes('data-editorial-relation="people"'), `no people links without a connected profile: ${project.slug}`);
  // A person appears once: in Founder / Lead or in Connected People, not both.
  for (const p of list) ok((rel.match(new RegExp(`href="${p.profile_url}"`, 'g')) || []).length === 1, `listed once: ${project.slug} → ${p.slug}`);
}
ok(bySlug.get('lapetite') && relations(page('projects/granada-pool') || '').includes('person-link" href="/people/lapetite/">LaPetite</a>'), 'GranADA Pool Founder / Lead links to LaPetite');

if (failures.length) {
  console.error(`[test-people-project-links] ${failures.length} failure(s):\n  ${failures.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
console.log(`[test-people-project-links] OK — ${pairs} reciprocal link(s) across ${connected.size} project(s); exact-name Founder / Lead links only`);

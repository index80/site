#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATED_PROFILE_MARKER,
  pruneStaleGeneratedProfiles,
  safeAvatarPath,
  validatePublicPerson,
} from './lib/people-public.mjs';
import { SITE_NAV_HREFS } from './lib/site-nav.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const data = JSON.parse(readFileSync(join(PUBLIC,'data','people.json'),'utf8'));
const OLD_APEX_IDENTIFIERS = [/Oliver Radivojevic/i, /apex-oliver-radivojevic/i];
const SHARE_IMAGE_URL = 'https://index80.com/assets/people/people-hero.jpg';
let generated = 0;
let custom = 0;

function metaContent(html, attribute, value) {
  return html.match(new RegExp(`<meta ${attribute}="${value}" content="([^"]+)">`))?.[1];
}

function assertShareMetadata(html, slug, type) {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = metaContent(html, 'name', 'description');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  if (!title || !description || !canonical) throw new Error(`Missing core metadata: ${slug}`);
  const expected = {
    'property:og:title': title,
    'property:og:description': description,
    'property:og:url': canonical,
    'property:og:type': type,
    'property:og:image': SHARE_IMAGE_URL,
    'name:twitter:card': 'summary_large_image',
    'name:twitter:title': title,
    'name:twitter:description': description,
    'name:twitter:image': SHARE_IMAGE_URL,
  };
  for (const [key, value] of Object.entries(expected)) {
    const separator = key.indexOf(':');
    const attribute = key.slice(0, separator);
    const field = key.slice(separator + 1);
    if (metaContent(html, attribute, field) !== value) throw new Error(`Missing or inconsistent ${field}: ${slug}`);
  }
  if (/noindex|nofollow|people-review|pfp-candidates/i.test(html.match(/<head>[\s\S]*?<\/head>/)?.[0] || '')) {
    throw new Error(`Unsafe People index/share metadata: ${slug}`);
  }
}

function mustReject(label, person) {
  try {
    validatePublicPerson(person, {requireAvatarFile:false});
  } catch {
    return;
  }
  throw new Error(`Privacy validation accepted ${label}`);
}

const publicJson = JSON.stringify(data);
for (const pattern of OLD_APEX_IDENTIFIERS) {
  if (pattern.test(publicJson)) throw new Error(`Privacy regression in public People JSON: ${pattern}`);
}

const base = data.people.find((p)=>p.x_url === 'https://x.com/Apex_333');
if (!base || base.name !== 'Apex' || base.slug !== 'apex' || base.profile_url !== '/people/apex/') {
  throw new Error('Privacy-safe Apex public identity is not configured correctly');
}
mustReject('an internal editorial field', {...base, identity_safety:'SAFE'});
mustReject('owner_decision', {...base, owner_decision:'APPROVE FOR DEV'});
mustReject('a mismatched profile URL', {...base, profile_url:'/people/someone-else/'});
mustReject('an unsafe slug', {...base, slug:'../apex'});
mustReject('markup in a public name', {...base, name:'<img src=x>'});
mustReject('an Instagram link on another host', {...base, instagram_url:'https://example.com/lapetiteada/'});
for (const unsafe of ['https://pbs.twimg.com/avatar.jpg', 'javascript:alert(1)', 'data:image/png;base64,AA', '/assets/people/../secret.png', '//assets/people/apex.png']) {
  if (safeAvatarPath(unsafe)) throw new Error(`Unsafe avatar path accepted: ${unsafe}`);
  mustReject(`unsafe avatar ${unsafe}`, {...base, avatar_url:unsafe});
}
if (safeAvatarPath('/assets/people/apex/profile.webp') !== '/assets/people/apex/profile.webp') {
  throw new Error('Safe site-local People avatar path was rejected');
}

for (const p of data.people || []) {
  validatePublicPerson(p, {publicRoot:PUBLIC});
  const file = join(PUBLIC,'people',p.slug,'index.html');
  if (!existsSync(file)) throw new Error(`Missing People profile page: ${p.slug}`);
  const html = readFileSync(file,'utf8');
  assertShareMetadata(html, p.slug, 'profile');
  if (!html.includes(p.name.replace(/&/g,'&amp;'))) throw new Error(`People profile does not contain its name: ${p.slug}`);
  if (!html.includes(`<link rel="canonical" href="https://index80.com/people/${p.slug}/">`)) throw new Error(`Unsafe or missing canonical link: ${p.slug}`);
  for (const pattern of OLD_APEX_IDENTIFIERS) {
    if (pattern.test(html)) throw new Error(`Old Apex identity leaked into profile: ${p.slug}`);
  }
  if (p.profile_type === 'custom') {
    custom += 1;
    if (html.includes(GENERATED_PROFILE_MARKER)) throw new Error(`Custom profile has generated marker: ${p.slug}`);
  } else {
    generated += 1;
    if (!html.includes(GENERATED_PROFILE_MARKER)) throw new Error(`Generated profile marker missing: ${p.slug}`);
    if (html.includes('ABOUT THIS RECORD')) throw new Error(`Generated People profile repeats the methodology essay: ${p.slug}`);
    if (!html.includes('href="/about/methodology/#people">How People records are built</a>')) throw new Error(`Generated People profile missing methodology link: ${p.slug}`);
    if (html.includes('href="/people/methodology/"')) throw new Error(`Generated People profile links to the retired /people/methodology/: ${p.slug}`);
    if (!html.includes('<p class="people-beta-status" role="note"><strong>PUBLIC BETA · FACTUAL REVIEW OPEN</strong> <span>This profile is based on public sources and may not yet have been confirmed by the person listed.</span> <a href="/submit/">Suggest a correction →</a></p>')) throw new Error(`Generated People profile missing PUBLIC BETA status: ${p.slug}`);
    if (!p.avatar_url && /<img[^>]+class="people-avatar-img"/.test(html)) throw new Error(`Portrait shown without a cleared avatar: ${p.slug}`);
    if (!html.includes('class="people-meta"')) throw new Error(`Generated People profile missing metadata strip: ${p.slug}`);
    if (!/class="button people-link people-link-primary"[^>]*>(?:X|LinkedIn) ↗/.test(html)) throw new Error(`Generated People profile missing X/LinkedIn link: ${p.slug}`);
    if (Boolean(p.bio) !== html.includes('class="people-bio"')) throw new Error(`Generated People profile bio rendering mismatch: ${p.slug}`);
    const strap = html.match(/<p class="strap people-subtitle" data-subtitle-source="(canonical|fallback)">/)?.[1];
    if (strap !== (p.profile_subtitle ? 'canonical' : 'fallback')) throw new Error(`Generated People profile subtitle source mismatch: ${p.slug}`);
    if (p.profile_subtitle && !html.includes(`data-subtitle-source="canonical">${p.profile_subtitle.replace(/&/g, '&amp;')}</p>`)) throw new Error(`Generated People profile does not render its Profile Subtitle: ${p.slug}`);
    for (const [label, field] of [['Website','website_url'],['GitHub','github_url'],['Instagram','instagram_url'],['YouTube','youtube_url']]) {
      if (Boolean(p[field]) !== html.includes(`>${label} ↗</a>`)) throw new Error(`Generated People profile ${label} button mismatch: ${p.slug}`);
    }
    if (!html.includes('people-profile-hero') || !html.includes('people-avatar')) throw new Error(`Generated People profile missing avatar framework: ${p.slug}`);
    const nav = html.match(/<nav class="main-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
    const navHrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).join(' ');
    if (navHrefs !== SITE_NAV_HREFS.join(' ') || !nav.includes('Projects</a>')) {
      throw new Error(`People profile primary nav must follow the canonical site navigation: ${p.slug}`);
    }
    const jsonLdText = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const graph = JSON.parse(jsonLdText || '{}')['@graph'];
    const sameAs = (Array.isArray(graph) && graph.find((n) => n['@type'] === 'Person')?.sameAs) || [];
    for (const key of ['x_url', 'linkedin_url', 'website_url', 'github_url', 'youtube_url', 'instagram_url']) {
      if (p[key] && !sameAs.includes(new URL(p[key]).href)) throw new Error(`People JSON-LD sameAs missing ${key}: ${p.slug}`);
    }
    if (!Array.isArray(graph) || graph[0]?.url !== `https://index80.com/people/${p.slug}/` || graph[1]?.name !== p.name) {
      throw new Error(`Unsafe People JSON-LD identity metadata: ${p.slug}`);
    }
  }
}

{
  // Launch: only the confirmed X link; secondary socials wait for direct confirmation.
  const lapetite = (data.people || []).find((p) => p.slug === 'lapetite');
  if (!lapetite || lapetite.x_url !== 'https://x.com/LaPetiteADA' || lapetite.instagram_url || lapetite.youtube_url) {
    throw new Error('LaPetite must publish only her confirmed X link at launch');
  }
  if (/tangem/i.test(readFileSync(join(PUBLIC,'people','lapetite','index.html'),'utf8'))) throw new Error('No sponsored/affiliate links on People profiles');
}
const directoryHtml = readFileSync(join(PUBLIC,'people','index.html'),'utf8');
// Every People profile (generated and custom) carries the PUBLIC BETA status line.
for (const p of data.people || []) {
  const html = readFileSync(join(PUBLIC,'people',p.slug,'index.html'),'utf8');
  if (!html.includes('<p class="people-beta-status" role="note"><strong>PUBLIC BETA · FACTUAL REVIEW OPEN</strong>')) throw new Error(`People profile missing PUBLIC BETA status: ${p.slug}`);
}
const methodologyHtml = readFileSync(join(PUBLIC,'about','methodology','index.html'),'utf8');
assertShareMetadata(directoryHtml, 'directory', 'website');
if (!/<section class="panel people-beta-notice" role="note"[\s\S]*?⚠<\/span> PEOPLE DIRECTORY — PUBLIC BETA<\/p>[\s\S]*?Some profiles have not yet been confirmed by the person listed\. <a href="\/about\/methodology\/#people-corrections">Review your profile or suggest a correction →<\/a>/.test(directoryHtml)) {
  throw new Error('People directory missing the PUBLIC BETA notice');
}
if (directoryHtml.indexOf('class="panel people-beta-notice"') > directoryHtml.indexOf('class="panel hero-panel')) throw new Error('PUBLIC BETA notice must sit at the top of /people/');
if (!directoryHtml.includes('Profiles are human-reviewed against public sources.')) throw new Error('People directory lost the human-review methodology note');
const methodologyLd = JSON.parse(methodologyHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || '{}');
if (methodologyLd['@type'] !== 'WebPage' || methodologyLd.url !== 'https://index80.com/about/methodology/') {
  throw new Error('Editorial methodology (/about/methodology/) must carry WebPage JSON-LD');
}

const descriptions = (data.people || []).map((p) => {
  const html = readFileSync(join(PUBLIC,'people',p.slug,'index.html'),'utf8');
  return metaContent(html, 'name', 'description');
});
if (new Set(descriptions).size !== descriptions.length) throw new Error('People profile meta descriptions must be unique');

const fixture = mkdtempSync(join(tmpdir(), 'index80-people-cleanup-'));
for (const [slug, body] of [
  ['active', `<!-- ${GENERATED_PROFILE_MARKER} -->`],
  ['stale', `<!-- ${GENERATED_PROFILE_MARKER} -->`],
  ['manual', '<!-- hand-authored -->'],
  ['charles-hoskinson', '<!-- custom profile -->'],
]) {
  mkdirSync(join(fixture, slug), {recursive:true});
  writeFileSync(join(fixture, slug, 'index.html'), body);
}
const pruned = pruneStaleGeneratedProfiles(fixture, new Set(['active']));
if (pruned !== 1 || existsSync(join(fixture,'stale')) || !existsSync(join(fixture,'manual')) || !existsSync(join(fixture,'charles-hoskinson'))) {
  throw new Error('Stale cleanup did not exclusively remove marked generated profiles');
}

console.log(`[test-people-pages] OK — ${generated} generated + ${custom} custom profile(s); privacy, metadata, avatar and cleanup regressions covered`);

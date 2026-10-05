#!/usr/bin/env node
/**
 * Public trust guardrail.
 *
 * Proves that specialist public surfaces have a useful static baseline and
 * that visible counts/schema agree with the governed release data.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, safeUrl } from './lib/html-safety.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const SLUG_RE = /^[a-z0-9-]+$/;
const problems = [];

const read = (path) => readFileSync(join(PUBLIC, path), 'utf8');
const fail = (message) => problems.push(message);

function validProject(p) {
  return Boolean(
    p &&
    p.slug &&
    SLUG_RE.test(p.slug) &&
    p.name &&
    p.summary &&
    p.category &&
    p.status
  );
}

function isListable(p) {
  return validProject(p) && p.status !== 'archived';
}

function fragmentBetween(html, startMarker, endMarker, label) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    fail(`${label}: markers missing or out of order`);
    return '';
  }
  if (
    html.indexOf(startMarker, start + startMarker.length) !== -1 ||
    html.indexOf(endMarker, end + endMarker.length) !== -1
  ) {
    fail(`${label}: markers must occur exactly once`);
  }
  return html.slice(start + startMarker.length, end);
}

const HIDDEN_ATTR = /(?:\bhidden\b|aria-hidden=["']true["']|style=["'][^"']*display\s*:\s*none)/i;
const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function targetOrAncestorHidden(html, id) {
  const targetNeedle = `id="${id}"`;
  const targetPos = html.indexOf(targetNeedle);
  if (targetPos < 0) return true;

  const stack = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  let match;
  while ((match = tagRe.exec(html)) && match.index < targetPos) {
    const tag = match[1].toLowerCase();
    const raw = match[0];
    if (raw.startsWith('</')) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === tag) {
          stack.splice(i, 1);
          break;
        }
      }
    } else if (!VOID_TAGS.has(tag) && !raw.endsWith('/>')) {
      stack.push({ tag, raw });
    }
  }

  const targetTagStart = html.lastIndexOf('<', targetPos);
  const targetTagEnd = html.indexOf('>', targetPos);
  const targetTag = targetTagStart >= 0 && targetTagEnd >= 0
    ? html.slice(targetTagStart, targetTagEnd + 1)
    : '';
  return HIDDEN_ATTR.test(targetTag) || stack.some((entry) => HIDDEN_ATTR.test(entry.raw));
}

const projectData = JSON.parse(read('data/projects.json'));
const peopleData = JSON.parse(read('data/people.json'));
const active = (projectData.projects || []).filter(isListable);
const governance = active.filter((p) => p.category === 'governance');
const people = Array.isArray(peopleData.people) ? peopleData.people : [];
const archived = (projectData.projects || []).filter((p) => validProject(p) && p.status === 'archived');

// Governance: complete static initial state.
{
  const html = read('governance/index.html');
  const fragment = fragmentBetween(
    html,
    '<!-- INDEX80_GOVERNANCE_DIRECTORY_START -->',
    '<!-- INDEX80_GOVERNANCE_DIRECTORY_END -->',
    'governance directory'
  );
  if (/Loading directory|Static governance directory not generated/.test(fragment)) {
    fail('governance directory still contains a placeholder');
  }
  const rows = (fragment.match(/<li class="dir-row">/g) || []).length;
  if (rows !== governance.length) fail(`governance static rows ${rows} != expected ${governance.length}`);

  const slugs = [...fragment.matchAll(/href="\/projects\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
  const actual = new Set(slugs);
  const expected = new Set(governance.map((p) => p.slug));
  if (slugs.length !== governance.length || actual.size !== governance.length) {
    fail('governance static project links are missing or duplicated');
  }
  for (const slug of expected) if (!actual.has(slug)) fail(`governance static directory missing ${slug}`);
  for (const slug of actual) if (!expected.has(slug)) fail(`governance static directory has unexpected ${slug}`);

  const rowBlocks = [...fragment.matchAll(/<li class="dir-row">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
  for (const block of rowBlocks) {
    const slug = block.match(/href="\/projects\/([a-z0-9-]+)\//)?.[1];
    const source = governance.find((project) => project.slug === slug);
    if (!source) continue;

    const nameInner = block.match(/<a class="dir-name"[^>]*>([\s\S]*?)<\/a>/)?.[1] || '';
    if (!nameInner.endsWith(esc(source.name))) {
      fail(`governance static row name mismatch for ${slug}`);
    }

    const external = safeUrl(source.official_url) || safeUrl(source.github_url) || safeUrl(source.docs_url) || safeUrl(source.social_url);
    const externalLink = block.match(/<a class="dir-link" href="([^"]+)"/)?.[1] || null;
    if ((external ? esc(external) : null) !== externalLink) {
      fail(`governance static external URL mismatch for ${slug}`);
    }
  }

  const count = html.match(/<span id="directory-count" class="directory-count">([^<]+)<\/span>/)?.[1]?.trim();
  const expectedCount = `${governance.length} / ${active.length} RECORDS`;
  if (count !== expectedCount) fail(`governance count "${count}" != "${expectedCount}"`);

  const schemaBlock = html.match(
    /<!-- INDEX80_GOVERNANCE_SCHEMA_START -->[\s\S]*?<script type="application\/ld\+json">([\s\S]*?)<\/script>[\s\S]*?<!-- INDEX80_GOVERNANCE_SCHEMA_END -->/
  )?.[1];
  if (!schemaBlock) {
    fail('governance JSON-LD block missing');
  } else {
    try {
      const parsed = JSON.parse(schemaBlock);
      const list = parsed['@graph']?.find((n) => n['@type'] === 'ItemList');
      if (!list) fail('governance ItemList schema missing');
      else {
        if (list.numberOfItems !== governance.length) {
          fail(`governance schema numberOfItems ${list.numberOfItems} != ${governance.length}`);
        }
        if (!Array.isArray(list.itemListElement) || list.itemListElement.length !== governance.length) {
          fail('governance schema itemListElement length does not match governed rows');
        } else {
          const rowSlugs = slugs;
          const schemaSlugs = list.itemListElement.map((item) => {
            const match = String(item.url || item.item || '').match(/\/projects\/([a-z0-9-]+)\/$/);
            return match?.[1] || null;
          });
          if (JSON.stringify(schemaSlugs) !== JSON.stringify(rowSlugs)) {
            fail('governance schema project order/identity diverges from static rows');
          }
          list.itemListElement.forEach((item, index) => {
            const slug = schemaSlugs[index];
            const source = governance.find((project) => project.slug === slug);
            const canonical = slug ? `https://index80.com/projects/${slug}/` : null;
            if (item.position !== index + 1) fail(`governance schema position mismatch at index ${index}`);
            if (!source || item.name !== source.name) fail(`governance schema name mismatch for ${slug || 'unknown'}`);
            if (canonical && item.url !== canonical) fail(`governance schema URL mismatch for ${slug}`);
            if (canonical && item.item !== canonical) fail(`governance schema item mismatch for ${slug}`);
          });
        }
      }
    } catch (error) {
      fail(`governance JSON-LD is invalid: ${error.message}`);
    }
  }
}

// Data: static release-derived facts must exist before JS.
{
  const html = read('data/index.html');
  for (const forbidden of [
    'LOADING PUBLIC DATA',
    '<span>LOADING</span>',
    'Loading market data',
    'Loading source register',
  ]) {
    if (html.includes(forbidden)) fail(`data page still contains loading-only default: ${forbidden}`);
  }

  const status = fragmentBetween(
    html,
    '<!-- INDEX80_DATA_STATUS_START -->',
    '<!-- INDEX80_DATA_STATUS_END -->',
    'data status'
  );
  if (!status.includes('INDEX:80 STATIC SNAPSHOT')) fail('data static status label missing');
  if (!status.includes('LIVE CARDANO DATA ENHANCES WHEN AVAILABLE')) fail('data optional-live wording missing');

  const ecosystem = fragmentBetween(
    html,
    '<!-- INDEX80_DATA_ECOSYSTEM_START -->',
    '<!-- INDEX80_DATA_ECOSYSTEM_END -->',
    'data ecosystem'
  );
  if (targetOrAncestorHidden(html, 'cardano-ecosystem-metrics')) {
    fail('data ecosystem static trust floor or an ancestor is hidden in initial HTML');
  }

  const expectedFacts = [
    ['ACTIVE PROJECTS', active.length],
    ['PEOPLE', people.length],
    ['GOVERNANCE RECORDS', governance.length],
    ['ARCHIVED RECORDS', archived.length],
  ];
  for (const [label, value] of expectedFacts) {
    if (!ecosystem.includes(`<span>${label}</span><strong>${value}</strong>`)) {
      fail(`data ecosystem static fact missing/mismatched: ${label}=${value}`);
    }
  }

  const mainJs = read('assets/js/main.js');
  if (!mainJs.includes("load('/assets/js/cardano-snapshot-policy.js')")) {
    fail('data snapshot policy is not loaded before the live client');
  }
  // Runtime freshness, fetch boundaries, failure UI and static-floor preservation
  // are exercised behaviorally by test-cardano-data-client.mjs rather than by
  // brittle source-string matching here.
}

// Registry snapshot view: latest immutable release must be useful without JavaScript.
{
  const history = JSON.parse(read('registry/index.json'));
  const releaseSlug = String(history.latest_release_id || '').toLowerCase();
  if (!/^index80-\d{4,}$/.test(releaseSlug)) {
    fail('registry view latest release ID is invalid');
  } else {
    const manifest = JSON.parse(read(`registry/releases/${releaseSlug}.json`));
    const snapshotPath = String(manifest.snapshot?.path || '');
    const snapshotRel = snapshotPath.replace(/^\//, '');
    const snapshot = snapshotPath ? JSON.parse(read(snapshotRel)) : null;
    const html = read('registry/view/index.html');

    for (const forbidden of ['LOADING SNAPSHOT', 'Loading snapshot', '— RECORDS', 'href="#"']) {
      if (html.includes(forbidden)) fail(`registry view still contains placeholder: ${forbidden}`);
    }

    const header = fragmentBetween(
      html,
      '<!-- INDEX80_REGISTRY_VIEW_HEADER_START -->',
      '<!-- INDEX80_REGISTRY_VIEW_HEADER_END -->',
      'registry view header'
    );
    const toolbar = fragmentBetween(
      html,
      '<!-- INDEX80_REGISTRY_VIEW_TOOLBAR_START -->',
      '<!-- INDEX80_REGISTRY_VIEW_TOOLBAR_END -->',
      'registry view toolbar'
    );
    const rowsFragment = fragmentBetween(
      html,
      '<!-- INDEX80_REGISTRY_VIEW_ROWS_START -->',
      '<!-- INDEX80_REGISTRY_VIEW_ROWS_END -->',
      'registry view rows'
    );

    const projectCount = Number(snapshot?.project_count ?? manifest.snapshot?.project_count ?? 0);
    const peopleCount = Number(snapshot?.people_count ?? manifest.snapshot?.people_count ?? 0);
    if (!header.includes(`<h1 id="snapshot-title">${esc(manifest.release_id)}</h1>`)) {
      fail('registry view static title does not match latest release');
    }
    if (!toolbar.includes(`${projectCount} PROJECTS · ${peopleCount} PEOPLE`)) {
      fail('registry view static count does not match latest manifest');
    }
    if (!toolbar.includes(`href="${esc(snapshotPath)}"`)) {
      fail('registry view raw JSON link does not match latest manifest');
    }

    const rowBlocks = [...rowsFragment.matchAll(/<tr data-project-slug="([^"]+)">([\s\S]*?)<\/tr>/g)];
    const rowSlugs = rowBlocks.map((match) => match[1]);
    const expectedProjects = Array.isArray(snapshot?.projects) ? snapshot.projects : [];
    const expectedSlugs = expectedProjects.map((project) => project.slug);
    if (rowBlocks.length !== projectCount) {
      fail(`registry view static rows ${rowBlocks.length} != expected ${projectCount}`);
    }
    if (JSON.stringify(rowSlugs) !== JSON.stringify(expectedSlugs)) {
      fail('registry view static project order/identity diverges from immutable snapshot');
    }

    rowBlocks.forEach((match, index) => {
      const [,, block] = match;
      const source = expectedProjects[index];
      if (!source) return;
      const expectedName = esc(source.name || '');
      if (!block.includes(`<a href="/projects/${esc(source.slug)}/">${expectedName}</a>`)) {
        fail(`registry view static row name mismatch for ${source.slug}`);
      }
      const external = safeUrl(source.official_url) || safeUrl(source.primary_link_url);
      const externalLink = block.match(/<a href="([^"]+)" target="_blank" rel="noopener noreferrer">Open ↗<\/a>/)?.[1] || null;
      if ((external ? esc(external) : null) !== externalLink) {
        fail(`registry view static external URL mismatch for ${source.slug}`);
      }
    });
  }
}

if (problems.length) {
  console.error(`[test-public-trust] FAIL (${problems.length})\n - ${problems.join('\n - ')}`);
  process.exit(1);
}

console.log(
  `[test-public-trust] PASS — ${active.length} active projects; governance ${governance.length}/${active.length}; Data static facts include ${people.length} People and ${archived.length} archived record(s).`
);

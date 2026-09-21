#!/usr/bin/env node
/**
 * INDEX:80 site-schema generator (home / learn / governance JSON-LD).
 *
 * Adds a minimal, machine-readable schema layer to three existing static
 * pages without changing any visible design, layout, wording or behaviour:
 *
 * - /                WebSite + CollectionPage + ItemList (valid projects.json records)
 * - /learn/          WebPage + LearningResource (educational material about Cardano)
 * - /governance/     CollectionPage + ItemList (valid records where category === "governance")
 *
 * Conventions mirror scripts/generate-home-directory.mjs: Node core only,
 * deterministic markers replaced in place, projects.json is the source of
 * truth (never hardcoded names), and JSON safely escapes </script.
 *
 * Usage: node scripts/generate-site-schema.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const DATA_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const RELATIONS_FILE = join(PUBLIC_HTML, 'data', 'project-relations.json');
const HOME_FILE = join(PUBLIC_HTML, 'index.html');
const LEARN_FILE = join(PUBLIC_HTML, 'learn', 'index.html');
const GOVERNANCE_FILE = join(PUBLIC_HTML, 'governance', 'index.html');

const SITE_URL = 'https://index80.com';
const SLUG_RE = /^[a-z0-9-]+$/;

const HOME_START = '<!-- INDEX80_HOME_SCHEMA_START -->';
const HOME_END = '<!-- INDEX80_HOME_SCHEMA_END -->';
const LEARN_START = '<!-- INDEX80_LEARN_SCHEMA_START -->';
const LEARN_END = '<!-- INDEX80_LEARN_SCHEMA_END -->';
const GOV_START = '<!-- INDEX80_GOVERNANCE_SCHEMA_START -->';
const GOV_END = '<!-- INDEX80_GOVERNANCE_SCHEMA_END -->';

const HOME_META_DESCRIPTION =
  'INDEX:80 — an independent human- and machine-readable index of the Cardano ecosystem: projects, data, governance and education.';
const LEARN_META_DESCRIPTION =
  'INDEX:80 /CARDANO — plain-language explanations of Cardano concepts linked directly to current wallets, DeFi, governance and developer tools in the index.';
const GOV_META_DESCRIPTION =
  'INDEX:80 /CARDANO — understand Cardano governance, DReps, stake pool operators, the Constitutional Committee, governance tools and Project Catalyst funding.';

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

function loadFallbackRelations() {
  if (!existsSync(RELATIONS_FILE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(RELATIONS_FILE, 'utf8'));
    return parsed.records || {};
  } catch {
    return {};
  }
}

function effectiveRelations(projects, fallbackRelations) {
  const records = {};
  for (const p of projects) {
    const fallback = fallbackRelations[p.slug] || {};
    records[p.slug] = {
      related_projects:
        Array.isArray(p.related_projects) && p.related_projects.length
          ? p.related_projects
          : (fallback.related_projects || []),
    };
  }
  return records;
}

// Same deterministic ordering used by generate-home-directory.mjs so the
// homepage ItemList matches the static directory rows in set and order.
function orderByRelations(items, relationRecords) {
  const bySlug = new Map(items.map((p) => [p.slug, p]));
  const emitted = new Set();
  const ordered = [];
  function emit(slug) {
    if (emitted.has(slug)) return;
    const project = bySlug.get(slug);
    if (!project) return;
    emitted.add(slug);
    ordered.push(project);
    const related = relationRecords?.[slug]?.related_projects || [];
    for (const relatedSlug of related) emit(relatedSlug);
  }
  for (const project of items) emit(project.slug);
  return ordered;
}

const canonicalProjectUrl = (slug) => `${SITE_URL}/projects/${slug}/`;

const toListItem = (p, index) => ({
  '@type': 'ListItem',
  position: index + 1,
  name: p.name,
  item: canonicalProjectUrl(p.slug),
  url: canonicalProjectUrl(p.slug),
});

function safeJsonLd(graph) {
  return JSON.stringify(graph, null, 2).replace(/<\/script/gi, '<\\/script');
}

function replaceBetween(html, startMarker, endMarker, scriptBody, label) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`${label}: generation markers are missing or out of order.`);
  }
  if (
    html.indexOf(startMarker, start + startMarker.length) !== -1 ||
    html.indexOf(endMarker, end + endMarker.length) !== -1
  ) {
    throw new Error(`${label}: generation markers must occur exactly once.`);
  }
  const contentStart = start + startMarker.length;
  return (
    html.slice(0, contentStart) +
    `\n  <script type="application/ld+json">${scriptBody}</script>\n  ` +
    html.slice(end)
  );
}

function homeGraph(ordered) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: 'INDEX:80 / CARDANO',
        description: HOME_META_DESCRIPTION,
        sameAs: ['https://x.com/index80web'],
        inLanguage: 'en',
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}/#directory`,
        url: `${SITE_URL}/`,
        name: 'INDEX:80 / CARDANO',
        description: HOME_META_DESCRIPTION,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        mainEntity: { '@id': `${SITE_URL}/#directory-list` },
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE_URL}/#directory-list`,
        name: 'Cardano project directory',
        numberOfItems: ordered.length,
        itemListElement: ordered.map(toListItem),
      },
    ],
  };
}

function learnGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}/learn/`,
        url: `${SITE_URL}/learn/`,
        name: 'Learn — INDEX:80 / CARDANO',
        description: LEARN_META_DESCRIPTION,
        isPartOf: { '@type': 'WebSite', name: 'INDEX:80 / CARDANO', url: `${SITE_URL}/` },
        mainEntity: { '@id': `${SITE_URL}/learn/#resource` },
      },
      {
        '@type': 'LearningResource',
        '@id': `${SITE_URL}/learn/#resource`,
        url: `${SITE_URL}/learn/`,
        name: 'Learn Cardano',
        description:
          'Plain-language explanations of Cardano concepts linked to real wallets, DeFi, governance, explorers and developer tools in the INDEX:80 directory.',
        about: { '@type': 'Thing', name: 'Cardano' },
        isPartOf: { '@type': 'WebSite', name: 'INDEX:80 / CARDANO', url: `${SITE_URL}/` },
        inLanguage: 'en',
      },
    ],
  };
}

function governanceGraph(orderedGov) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}/governance/`,
        url: `${SITE_URL}/governance/`,
        name: 'Governance — INDEX:80 / CARDANO',
        description: GOV_META_DESCRIPTION,
        isPartOf: { '@type': 'WebSite', name: 'INDEX:80 / CARDANO', url: `${SITE_URL}/` },
        about: {
          '@type': 'Thing',
          name: 'Cardano governance',
          description:
            "Cardano's on-chain governance: ADA holders, DReps, stake pool operators, the Constitutional Committee and governance actions.",
        },
        mainEntity: { '@id': `${SITE_URL}/governance/#governance-list` },
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE_URL}/governance/#governance-list`,
        name: 'Governance-category records',
        numberOfItems: orderedGov.length,
        itemListElement: orderedGov.map(toListItem),
      },
    ],
  };
}

function writePage(file, startMarker, endMarker, graph, label) {
  const html = readFileSync(file, 'utf8');
  const next = replaceBetween(html, startMarker, endMarker, safeJsonLd(graph), label);
  writeFileSync(file, next, 'utf8');
}

function main() {
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const valid = (data.projects || []).filter(validProject);
  const slugSet = new Set(valid.map((p) => p.slug));
  if (slugSet.size !== valid.length) {
    throw new Error('projects.json contains duplicate valid slugs.');
  }
  const fallbackRelations = loadFallbackRelations();
  const ordered = orderByRelations(valid, effectiveRelations(valid, fallbackRelations));
  if (ordered.length !== valid.length) {
    throw new Error(`Relation ordering emitted ${ordered.length} item(s) for ${valid.length} valid project(s).`);
  }
  const orderedGov = ordered.filter((p) => p.category === 'governance');

  writePage(HOME_FILE, HOME_START, HOME_END, homeGraph(ordered), 'homepage schema');
  writePage(LEARN_FILE, LEARN_START, LEARN_END, learnGraph(), 'learn schema');
  writePage(GOVERNANCE_FILE, GOV_START, GOV_END, governanceGraph(orderedGov), 'governance schema');

  console.log(
    `[generate-site-schema] wrote homepage ItemList (${ordered.length}), governance ItemList (${orderedGov.length}), learn resource to 3 page(s).`
  );
}

main();

#!/usr/bin/env node
/**
 * INDEX:80 static project-page generator.
 *
 * Reads public_html/data/projects.json (the Editorial Registry export) and
 * writes a genuine static HTML record to public_html/projects/<slug>/index.html
 * for every project in the file — one shared template, no client-side
 * fetch required to see the core record. JS may still enhance the page,
 * but the important content (name, summary, status, links, tags,
 * provenance) is in the HTML that ships.
 *
 * No dependencies — Node core (fs/path) only, so this can run as the
 * Cloudflare Pages build command with no install step.
 *
 * Usage: node scripts/generate-project-pages.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Single shared definition of "confirmed Treasury-funded" (also used by the
// browser scripts and the homepage generator) — see assets/js/treasury-rule.js.
const Treasury = createRequire(import.meta.url)('../public_html/assets/js/treasury-rule.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const DATA_FILE = join(PUBLIC_HTML, 'data', 'projects.json');
const IMAGES_FILE = join(PUBLIC_HTML, 'data', 'project-images.json');
const LINK_HISTORY_FILE = join(PUBLIC_HTML, 'data', 'project-link-history.json');
const PROJECTS_DIR = join(PUBLIC_HTML, 'projects');
const SITE_URL = 'https://index80.com';

// project-images.json is a separate, generator-owned enrichment file (see
// docs/IMAGE_ENRICHMENT.md) — not part of the Editorial Registry export, so
// its absence is normal (e.g. before the enrichment script has ever run)
// and must never fail the build.
function loadProjectImages() {
  if (!existsSync(IMAGES_FILE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(IMAGES_FILE, 'utf8'));
    return parsed.images || {};
  } catch {
    return {};
  }
}

// project-link-history.json is produced by scripts/enrich-link-history.mjs
// (see docs/VERIFICATION_LINK_HISTORY.md) — like project-images.json it's a
// generator-side enrichment file, not part of the Editorial Registry
// export, so its absence (e.g. before the workflow has ever run) must
// never fail the build; link buttons just render un-suppressed.
function loadLinkHistory() {
  if (!existsSync(LINK_HISTORY_FILE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(LINK_HISTORY_FILE, 'utf8'));
    const bySlug = {};
    for (const rec of parsed.records || []) bySlug[rec.slug] = rec;
    return bySlug;
  } catch {
    return {};
  }
}

const SLUG_RE = /^[a-z0-9-]+$/;

// Mirrors the lookup tables in assets/js/directory.js / assets/js/project.js
// (kept in sync by hand — same small, stable vocabulary in both places).
const CATEGORY_ICON = {
  wallet: 'wallet', dex: 'dex', defi: 'dex', lending: 'dex', derivatives: 'dex',
  governance: 'governance', analytics: 'analytics', explorer: 'explorer', nft: 'nft',
  infrastructure: 'infrastructure', 'developer-tool': 'developer', education: 'education',
  ai: 'ai', game: 'nft', utility: 'infrastructure', 'token-project': 'nft',
};
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const catLabel = (cat) => cat.replace(/-/g, ' ').toUpperCase();

// V0.05 PROTOTYPE (colour/depth polish branch): a deterministic slug of
// the Editorial Registry's own Public Family text (e.g. "DeFi & Markets"
// -> "defi-markets"), written to the page as a plain data-family
// attribute. No hardcoded family list here — this generically slugifies
// whatever public_family string the record already carries, so a future
// family added in the Registry gets a stable slug for free. The actual
// colour-per-family mapping lives entirely in assets/css/site.css
// (body[data-family="…"] blocks); this generator never picks colours, it
// only exposes the one fact (the family name) CSS needs to key off. A
// record with no public_family simply gets no attribute, and every
// consuming CSS rule falls back to its pre-existing default via
// var(--family-accent, <default>) — unaffected.
function familySlug(publicFamily) {
  if (!publicFamily) return '';
  return String(publicFamily)
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function metaDescription(p) {
  const raw = `${p.name} — ${p.summary}`;
  if (raw.length <= 160) return raw;
  const cut = raw.slice(0, 157);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

// Outbound discovery is the main purpose of the page, so one link gets
// promoted to a strong CTA — the rest stay as neutral outlined buttons.
// Priority mirrors the site's existing bestExternalLink() convention
// (public_html/assets/js/directory.js): Website → GitHub → Docs → Social.
// Discord is display-only, never a LINK_PRIORITY candidate — a community
// chat server isn't a "destination" in the same sense as a site/app/X
// profile, so it never becomes the primary CTA even when it's the only
// link populated.
const LINK_PRIORITY = ['official_url', 'marketplace_url', 'github_url', 'docs_url', 'social_url'];
const LINK_DISPLAY_ORDER = ['official_url', 'marketplace_url', 'docs_url', 'github_url', 'social_url', 'discord_url'];
const LINK_LABELS = {
  official_url: 'Official site', docs_url: 'Documentation', github_url: 'GitHub',
  social_url: 'Social / X', marketplace_url: 'Marketplace / App', discord_url: 'Discord / Community',
};
const PRIMARY_CTA_LABEL = {
  official_url: 'VISIT OFFICIAL SITE ↗',
  marketplace_url: 'OPEN THE APP ↗',
  github_url: 'VIEW ON GITHUB ↗',
  docs_url: 'READ THE DOCUMENTATION ↗',
  social_url: 'VISIT ON X / SOCIAL ↗',
};

// A link the verification engine has classified DEAD/SUNSET/PARKED must
// not be presented as a normal clickable CTA (Verification & Link-History
// Standard v1.0, "PUBLIC SAFETY BEHAVIOUR"). This never substitutes a new
// URL — it only chooses which of the record's own already-populated,
// editor-approved fields gets the primary-CTA slot, and renders a
// suppressed field as inert text rather than a link. It does not touch
// projects.json and never promotes a record's editorial status.
const BAD_LINK_STATES = new Set(['DEAD', 'SUNSET', 'PARKED']);

function linkStateFor(linkHistoryRecord, field) {
  return linkHistoryRecord?.links?.[field]?.state || null;
}

// Small hover/focus destination hint for external CTA buttons — shows
// where a labelled button ("Marketplace / App →") actually goes, without
// relying on the browser's own status-bar link preview (inconsistent
// across browsers, absent on touch/keyboard). Computed once at build
// time (not client JS) and rendered via a data-dest attribute + a pure-CSS
// ::after tooltip (see .button[data-dest] in site.css). Hostname plus
// meaningful path only, truncated — never a full raw URL.
function formatLinkDestination(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  const path = u.pathname.replace(/\/+$/, '');
  let dest = path ? `${u.hostname}${path}` : u.hostname;
  if (dest.length > 40) dest = `${dest.slice(0, 37)}…`;
  return dest;
}

function suppressedButton(label, extraClass = '') {
  return `<span class="button is-link-suppressed ${extraClass}" aria-disabled="true" title="Flagged by automated verification — currently unavailable, pending editorial review">${esc(label)} — unavailable ⚠</span>`;
}

// Shared with jsonLd() below so the schema.org `about.url` (a
// machine-read "this project's primary URL" field, same purpose as the
// primary CTA) picks the same live alternative rather than advertising a
// known-dead URL to search engines/AI systems even while the visible
// button is suppressed.
function effectivePrimaryLink(p, linkHistoryRecord) {
  const populatedPriority = LINK_PRIORITY.filter((k) => p[k]);
  if (!populatedPriority.length) return null;
  const key = populatedPriority.find((k) => !BAD_LINK_STATES.has(linkStateFor(linkHistoryRecord, k))) || populatedPriority[0];
  return { key, url: p[key], suppressed: BAD_LINK_STATES.has(linkStateFor(linkHistoryRecord, key)) };
}

function linkButtons(p, linkHistoryRecord) {
  const populatedPriority = LINK_PRIORITY.filter((k) => p[k]);
  if (!populatedPriority.length) {
    return '<p class="empty-note">No outbound links recorded for this project yet.</p>';
  }
  // Prefer the first populated field that isn't currently flagged bad; if
  // every populated field is flagged, fall back to the normal priority
  // order so the record still shows its recorded destination (suppressed)
  // rather than nothing at all.
  const primaryKey = effectivePrimaryLink(p, linkHistoryRecord).key;
  const secondaryKeys = LINK_DISPLAY_ORDER.filter((k) => k !== primaryKey && p[k]);

  const primaryHtml = BAD_LINK_STATES.has(linkStateFor(linkHistoryRecord, primaryKey))
    ? suppressedButton(LINK_LABELS[primaryKey], 'cta-primary')
    : `<a class="button cta-primary" href="${esc(p[primaryKey])}" target="_blank" rel="noopener noreferrer" data-dest="${esc(formatLinkDestination(p[primaryKey]))}">${esc(PRIMARY_CTA_LABEL[primaryKey])}</a>`;

  const secondaryHtml = secondaryKeys
    .map((k) =>
      BAD_LINK_STATES.has(linkStateFor(linkHistoryRecord, k))
        ? suppressedButton(LINK_LABELS[k])
        : `<a class="button" href="${esc(p[k])}" target="_blank" rel="noopener noreferrer" data-dest="${esc(formatLinkDestination(p[k]))}"><svg class="icon dir-link-icon" aria-hidden="true"><use href="/assets/icons/icons.svg#icon-external-link"></use></svg> ${LINK_LABELS[k]} →</a>`
    )
    .join('');

  return `<div class="link-buttons">${primaryHtml}${secondaryHtml}</div>`;
}

function tagChips(p) {
  if (!p.tags || !p.tags.length) return '<span class="empty-note">No tags recorded.</span>';
  return p.tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('');
}

// "₳ TREASURY FUNDED" — a compact fact badge, not an award: a project gets
// this only when the Registry holds confirmed award evidence (a funded-proposal
// count, a USD value or an ADA-native value — see assets/js/treasury-rule.js).
// A Catalyst / Funding Ref alone is a pointer, never evidence, and renders
// nothing. The ₳ glyph itself is the icon. assets/js/treasury.js and
// directory.js apply the same rule so the wording and DOM shape stay identical
// wherever the badge appears.
function treasuryBadge(p) {
  if (!Treasury.isConfirmedFunded(p)) return '';
  const ref = Treasury.fundingRef(p);
  return `<span class="badge-treasury" title="Confirmed Cardano Treasury funding on record${ref ? ` (${esc(ref)})` : ''}"><span class="ada-glyph" aria-hidden="true">₳</span>TREASURY FUNDED</span>`;
}

// Compact profile-page metadata entry: the confirmed funded-proposal count and
// any award value (USD and ADA kept separate, never converted), plus a link to
// the Catalyst record. For a single-proposal reference the scope note makes
// clear the amount belongs to the linked proposal, not the whole project.
function treasuryMetric(p) {
  if (!Treasury.isConfirmedFunded(p)) return '';
  const ref = Treasury.fundingRef(p);
  const count = Treasury.proposalCount(p);
  const usd = Treasury.fundingUsd(p);
  const ada = Treasury.fundingAda(p);
  const linked = Treasury.isLinkedProposalRef(ref);
  const parts = [];
  if (count) parts.push(`${count} funded proposal${count === 1 ? '' : 's'} on linked record`);
  if (ada) parts.push(`${Treasury.formatAda(ada)} allocated`);
  if (usd) parts.push(`≈$${Math.round(usd).toLocaleString('en-US')} USD (historical estimate)`);
  const link = ref && /^https?:\/\//i.test(ref)
    ? `<a class="treasury-funding-link" href="${esc(ref)}" target="_blank" rel="noopener noreferrer">${linked ? 'View linked Catalyst proposal ↗' : 'View Catalyst record ↗'}</a>`
    : '';
  const note = linked && (ada || usd) ? `<small class="treasury-scope-note">${esc(Treasury.LINKED_PROPOSAL_NOTE)}</small>` : '';
  const body = [parts.join(' · '), link].filter(Boolean).join(' · ') || 'Treasury funding recorded';
  return `<div class="treasury-metric"><span class="metric-label"><span class="ada-glyph" aria-hidden="true">₳</span>TREASURY FUNDING</span><strong>${body}</strong>${note}</div>`;
}

// Internal source "type" values (migration tags from before the Registry existed)
// and raw internal document paths are never shown to the public as-is —
// every source is translated into one of a small set of human-readable
// evidence labels, inferred first from the URL's own domain (a much more
// reliable signal than the internal type tag) and only falling back to
// the type tag, then a generic label, when the URL doesn't say more.
// A source whose "url" isn't actually a fetchable link (an internal repo
// path, not http(s)) is labelled but not linked or shown as raw text.
// Real hostname comparison, not a regex against the whole URL string — a
// regex like /(^|\.)x\.com/ silently fails to match "https://x.com/..."
// because nothing precedes "x.com" but "//", not "." or start-of-string.
function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
const hostMatches = (host, ...domains) => domains.some((d) => host === d || host.endsWith(`.${d}`));

function evidenceLabel(s, p) {
  const url = s.url || '';
  if (s.type === 'founder-supplied' || s.type === 'user-supplied') return 'Founder/project-supplied assets';
  // The exporter (Generate.gs) withholds a Website from official_url when
  // its human-controlled Website Status is a recognised non-current state
  // and preserves it here instead, tagged with that status — so
  // official_url will never match this URL to earn the "Official website"
  // label below. Surface the exporter's own label (it already names the
  // status) rather than falling through to a generic "Web reference".
  if (typeof s.type === 'string' && s.type.indexOf('Former official website') === 0) return s.type;
  if (p.official_url && url === p.official_url) return 'Official website';
  if (p.marketplace_url && url === p.marketplace_url) return 'Official app';
  if (p.docs_url && url === p.docs_url) return 'Official documentation';
  if (p.social_url && url === p.social_url) return 'Official X';
  if (p.discord_url && url === p.discord_url) return 'Community / Discord';
  const host = hostnameOf(url);
  if (hostMatches(host, 'wayup.io')) return 'Wayup collection';
  if (hostMatches(host, 'discord.gg', 'discord.com')) return 'Community / Discord';
  if (hostMatches(host, 'twitter.com', 'x.com')) return 'Official X';
  if (hostMatches(host, 'github.com')) return 'GitHub';
  if (hostMatches(host, 'web.archive.org')) return 'Web archive';
  if (hostMatches(host, 'cardanoscan.io', 'cexplorer.io', 'pool.pm', 'adastat.net')) return 'Cardano on-chain record';
  if (host) return 'Web reference';
  return 'Historical project document';
}

// Collapsed by default (native <details>/<summary>, no JS) — keeps the
// record's editorial sources available without costing permanent vertical
// space on a page meant to fit in one viewport (see .profile-source rules
// in assets/css/site.css). Public label is "EVIDENCE" — internal terms
// like "provenance" and raw doc paths only ever appear once a visitor
// opens the disclosure, never in the collapsed public view, and even then
// only as a human-readable label (see evidenceLabel()), never as a raw
// internal path or migration-tag string.
function sourceList(p) {
  if (!p.sources || !p.sources.length) return '';
  const items = p.sources.map((s) => {
    const label = evidenceLabel(s, p);
    const isLink = /^https?:\/\//i.test(s.url || '');
    return isLink
      ? `<li>${esc(label)} — <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.url)}</a></li>`
      : `<li>${esc(label)}</li>`;
  });
  return `<details class="panel profile-source">
      <summary class="panel-title"><h2>EVIDENCE</h2><span>/ SOURCES <b class="disclosure-caret">▸</b></span></summary>
      <ul class="source-list">${items.join('')}</ul>
    </details>`;
}

// Long on-chain identifiers (policy IDs etc.) are truncated for display —
// never left as one unbroken hex string — but the full value stays in the
// HTML (title attribute + data-copy-value) and is both copyable and
// linked to a CardanoScan lookup.
function truncateMiddle(s, headLen, tailLen) {
  if (s.length <= headLen + tailLen + 1) return s;
  return `${s.slice(0, headLen)}…${s.slice(-tailLen)}`;
}

function policyIdCell(p) {
  if (!p.policy_id) return '';
  const full = String(p.policy_id).trim();
  if (!full) return '';
  const short = truncateMiddle(full, 10, 8);
  const explorerUrl = `https://cardanoscan.io/tokenPolicy/${encodeURIComponent(full)}`;
  return `<div class="policy-id-cell">
      <span>POLICY ID / CONTRACT</span>
      <strong class="policy-id-value" title="${esc(full)}">
        <code>${esc(short)}</code>
        <button type="button" class="copy-btn" data-copy-value="${esc(full)}" aria-label="Copy full Policy ID">⧉</button>
        <a href="${esc(explorerUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View ${esc(p.name)}'s Policy ID on CardanoScan">↗</a>
      </strong>
    </div>`;
}

// Not part of the current registry schema yet, but the product rule asks
// for a public editorial note "if available" — support it without
// requiring it, under any of the field names an editor might reasonably use.
function editorialNote(p) {
  const note = p.editorial_note || p.public_note || p.note;
  if (!note) return '';
  return `<section class="panel profile-note">
      <div class="panel-title"><h2>EDITORIAL NOTE</h2></div>
      <p class="profile-summary" style="padding:.9rem;margin:0;">${esc(note)}</p>
    </section>`;
}

function jsonLd(p, canonicalUrl, linkHistoryRecord) {
  const about = {
    '@type': 'Thing',
    name: p.name,
    description: p.summary,
  };
  // Never advertise a DEAD/SUNSET/PARKED official_url to search
  // engines/AI systems as this project's canonical URL, even though the
  // visible CTA button already suppresses it — same effective link, same
  // "no known-dead destination presented as current" rule.
  const effectivePrimary = effectivePrimaryLink(p, linkHistoryRecord);
  if (effectivePrimary && !effectivePrimary.suppressed) about.url = effectivePrimary.url;
  const sameAs = [p.docs_url, p.github_url, p.social_url, p.discord_url].filter(Boolean);
  if (sameAs.length) about.sameAs = sameAs;

  const webPage = {
    '@type': 'WebPage',
    '@id': canonicalUrl,
    url: canonicalUrl,
    name: `${p.name} — INDEX:80 / CARDANO`,
    description: metaDescription(p),
    isPartOf: { '@type': 'WebSite', name: 'INDEX:80 / CARDANO', url: `${SITE_URL}/` },
    about,
  };
  if (p.last_verified) webPage.dateModified = p.last_verified;

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'INDEX:80', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: p.name, item: canonicalUrl },
    ],
  };

  const graph = { '@context': 'https://schema.org', '@graph': [webPage, breadcrumb] };
  return JSON.stringify(graph, null, 2).replace(/<\/script/gi, '<\\/script');
}

const isResolved = (entry) => entry && entry.status === 'ok' && entry.path;

// The title icon only ever renders from the "icon" role (favicon /
// apple-touch-icon / logo-or-wordmark link) — a "hero" role image (an OG/
// Twitter banner) is a different shape and purpose and is never squeezed in
// here, even when no icon exists. Every other status (no_image_found,
// fetch_error, skipped_x_needs_token, no_source, or simply absent) falls
// back to the existing category glyph, same as before this field existed.
function profileIcon(p, images) {
  const icon = images?.icon;
  if (isResolved(icon)) {
    const w = icon.width || '';
    const h = icon.height || '';
    return `<img class="profile-icon-img" src="${esc(icon.path)}" alt=""${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''} loading="lazy" decoding="async">`;
  }
  const catIcon = CATEGORY_ICON[p.category] || 'infrastructure';
  return `<svg class="icon" aria-hidden="true"><use href="/assets/icons/icons.svg#icon-${catIcon}"></use></svg>`;
}

// Combined image + metadata rectangle: an official project image (the
// harvested "hero"/OG-social image, when one exists) sits left of the
// compact metric panel; with no image the metadata simply expands to
// the full width rather than reserving a blank image slot — images are
// never required for a record. Metadata is limited to public-safe
// fields only (no internal editorial-workflow status).
function mediaMetaBlock(p, images) {
  const hero = images?.hero;
  const hasImage = isResolved(hero);
  const w = hero?.width || '';
  const h = hero?.height || '';
  const metrics = [
    `<div><span>PUBLIC FAMILY</span><strong>${esc(p.public_family || '—')}</strong></div>`,
    `<div><span>DETAILED CATEGORY</span><strong>${esc(catLabel(p.category))}</strong></div>`,
  ];
  if (p.last_verified) {
    metrics.push(`<div><span>LAST CHECKED</span><strong>${esc(p.last_verified)}</strong></div>`);
  }
  const policyCell = policyIdCell(p);
  if (policyCell) metrics.push(policyCell);
  const treasuryCell = treasuryMetric(p);
  if (treasuryCell) metrics.push(treasuryCell);
  return `<section class="panel dark profile-media-meta${hasImage ? '' : ' no-image'}">
      ${hasImage ? `<div class="profile-media"><img src="${esc(hero.path)}" alt=""${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''} loading="lazy" decoding="async"></div>` : ''}
      <div class="metric-grid">${metrics.join('')}</div>
    </section>`;
}

function renderProjectPage(p, images, linkHistoryRecord) {
  const canonicalUrl = `${SITE_URL}/projects/${p.slug}/`;
  const pageTitle = `${p.name} — INDEX:80 / CARDANO`;
  const description = metaDescription(p);
  // A hero (social) image is what og:image/twitter:image are actually for —
  // prefer it for link-preview meta tags, falling back to the icon (still a
  // real logo) only when there's no hero, and to nothing when neither exists.
  const socialImage = isResolved(images?.hero) ? images.hero : isResolved(images?.icon) ? images.icon : null;

  return `<!doctype html>
<html lang="en">
<head>
  <script src="/assets/js/analytics.js"></script>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(description)}">
  <title>${esc(pageTitle)}</title>
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/svg+xml" href="/assets/icons/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32.png">
  <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
  ${socialImage ? `<meta property="og:image" content="${esc(SITE_URL + socialImage.path)}">\n  <meta name="twitter:image" content="${esc(SITE_URL + socialImage.path)}">\n  ` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap">
  <script src="/assets/js/theme.js"></script>
  <link rel="stylesheet" href="/assets/css/site.css">
  <script type="application/ld+json">${jsonLd(p, canonicalUrl, linkHistoryRecord)}</script>
</head>
<body data-mode="project"${familySlug(p.public_family) ? ` data-family="${esc(familySlug(p.public_family))}"` : ''}>
  <a class="skip-link" href="#main">Skip to content</a>

  <div class="system-bar">
    <span class="system-slogan">A MORE OPEN INTERNET, A BRIGHTER TOMORROW.</span>
    <span class="system-status"><span class="status-dot"></span> INDEX:80 ONLINE</span>
  </div>

  <header class="site-header">
    <div class="brand-row">
      <a class="wordmark" href="/" aria-label="INDEX:80 home"><span>INDEX:</span><b>80</b></a>
      <span class="network-label">/CARDANO</span>
    </div>
    <nav class="main-nav" aria-label="Primary">
      <a href="/">⌂ Home</a>
      <a href="/submit/">✎ Submit</a>
      <a href="/data/">▥ Data</a>
      <a href="/learn/">▤ Learn</a>
      <a href="/governance/">⌂ Governance</a>
      <a href="/about/">◇ About</a>
    </nav>
  </header>

  <main id="main" class="page-grid single-column">
    <p class="source-line" style="margin:.6rem .8rem 0;"><a href="/">INDEX:80</a> / ${esc(p.name)}</p>

    <section class="panel profile-header">
      <div class="profile-heading">
        <span class="profile-icon">${profileIcon(p, images)}</span>
        <h1>${esc(p.name)}</h1>${Treasury.isConfirmedFunded(p) ? `\n        ${treasuryBadge(p)}` : ''}
      </div>
    </section>

    <section class="profile-body">
      <div class="profile-cta">${linkButtons(p, linkHistoryRecord)}</div>
      <div class="profile-info">
        <p class="profile-cat">${catLabel(p.category)}</p>
        <p class="profile-summary-text">${esc(p.summary)}</p>
        <div class="profile-tags">${tagChips(p)}</div>
      </div>
    </section>

    ${mediaMetaBlock(p, images)}

    ${editorialNote(p)}
    ${sourceList(p)}
  </main>

  <p style="max-width:1600px;margin:0 auto;padding:0 .8rem 1rem;">
    <a class="back-to-directory" href="/">← Back to the index</a>
  </p>

  <footer class="site-footer">
    <nav class="footer-nav" aria-label="Secondary">
      <a href="/">⌂ Home</a>
      <a href="/submit/">✎ Submit</a>
      <a href="/data/">▥ Data</a>
      <a href="/learn/">▤ Learn</a>
      <a href="/governance/">⌂ Governance</a>
      <a href="/about/">◇ About</a>
    </nav>
    <div class="footer-meta">
      <span class="footer-brand">INDEX:<b>80</b> /CARDANO</span>
      <span>OPEN LINKS · OPEN DATA · SOURCED INFORMATION</span>
      <button type="button" class="footer-consent-toggle" data-consent-toggle>Cookie preferences</button>
    </div>
  </footer>

  <script src="/assets/js/main.js" defer></script>
</body>
</html>
`;
}

function pruneStaleSlugDirs(validSlugs) {
  let entries;
  try {
    entries = readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return 0;
  }
  let pruned = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (validSlugs.has(entry.name)) continue;
    rmSync(join(PROJECTS_DIR, entry.name), { recursive: true, force: true });
    pruned += 1;
  }
  return pruned;
}

function main() {
  const startedAt = Date.now();
  const raw = readFileSync(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  const projects = data.projects || [];
  const images = loadProjectImages();
  const linkHistory = loadLinkHistory();

  const validSlugs = new Set();
  const skipped = [];
  for (const p of projects) {
    if (!p.slug || !SLUG_RE.test(p.slug) || !p.name || !p.summary || !p.category || !p.status) {
      skipped.push(p.slug || '(no slug)');
      continue;
    }
    validSlugs.add(p.slug);
  }

  const pruned = pruneStaleSlugDirs(validSlugs);

  let written = 0;
  for (const p of projects) {
    if (!validSlugs.has(p.slug)) continue;
    const dir = join(PROJECTS_DIR, p.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), renderProjectPage(p, images[p.slug], linkHistory[p.slug]), 'utf8');
    written += 1;
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`[generate-project-pages] wrote ${written} page(s), pruned ${pruned} stale dir(s), skipped ${skipped.length} invalid record(s) in ${elapsedMs}ms.`);
  if (skipped.length) console.log(`[generate-project-pages] skipped: ${skipped.join(', ')}`);

  if (written !== projects.length) {
    console.error(`[generate-project-pages] WARNING: wrote ${written} page(s) but projects.json has ${projects.length} record(s).`);
    process.exitCode = 1;
  }
}

main();

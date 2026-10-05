#!/usr/bin/env node
/**
 * Generate compact INDEX:80 People profiles from people.json (itself imported
 * from the canonical Editorial People Registry snapshot).
 *
 * Custom profiles (currently Charles Hoskinson) are preserved and only
 * existence-checked. Every other staged record gets a static /people/<slug>/
 * page: identity, links and bio up top; roles, projects and verified
 * governance facts in compact cards; one short record line linking to the
 * shared methodology page instead of repeating it on every profile.
 *
 * On the protected DEV preview only, candidate PFPs staged by
 * stage-people-pfp-review.mjs are shown with a visible review label; otherwise
 * (and always on dev/main) the production-approved avatar or the monogram is used.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATED_PROFILE_MARKER,
  pruneStaleGeneratedProfiles,
  safeAvatarPath,
  safeExternalUrl,
  validatePublicPerson,
} from './lib/people-public.mjs';
import { loadReviewMap } from './lib/people-pfp-review.mjs';
import { hasVerifiedDrep, hasVerifiedSpo, inferredRole, initials, profileStrap } from './lib/people-display.mjs';
import { renderNavLinks } from './lib/site-nav.mjs';
import { personMetaDescription, personTitle } from './lib/people-seo.mjs';

export { hasVerifiedDrep, hasVerifiedSpo };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const PEOPLE_FILE = join(PUBLIC, 'data', 'people.json');
const PROJECTS_FILE = join(PUBLIC, 'data', 'projects.json');
const PEOPLE_DIR = join(PUBLIC, 'people');
// Canonical editorial methodology (About → Methodology). /people/methodology/
// is retired and redirects here (public_html/_redirects).
export const METHODOLOGY_URL = '/about/methodology/#people';
export const CORRECTIONS_URL = '/about/methodology/#people-corrections';
// PUBLIC BETA notice CTA: the existing correction route (Submit handles People corrections).
export const PROFILE_CORRECTION_URL = '/submit/';
const SHARE_IMAGE_URL = 'https://index80.com/assets/people/people-hero.jpg';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));
const normalize = (s) => String(s || '').trim().toLowerCase();
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}

// Public provenance wording. verification_status records INDEX:80's own
// research only: it never implies the person confirmed their facts, and it
// says nothing about image permission (tracked separately, never public).
// "Facts confirmed by subject — [date]" may only appear once a public,
// governed subject-confirmation date exists; no such field is published yet.
const EVIDENCE_LINE = {
  VERIFIED: 'Independently checked by INDEX:80',
  PARTIAL: 'Partly checked by INDEX:80, some checks open',
  UNVERIFIED: 'Not yet checked by INDEX:80',
  CONFLICT: 'Sources currently conflict',
};

const EVIDENCE_SHORT_LABEL = {
  VERIFIED: 'Checked',
  PARTIAL: 'Partly checked',
  UNVERIFIED: 'Not yet checked',
  CONFLICT: 'Sources conflict',
};

/** "Independently checked by INDEX:80 — 28 Sep 2026"; no date is ever invented. */
export function evidenceLine(p) {
  const label = EVIDENCE_LINE[p.verification_status] || 'Evidence status recorded';
  const checked = formatDate(p.last_verified);
  if (!checked) return label;
  return p.verification_status === 'VERIFIED' || p.verification_status === 'PARTIAL'
    ? `${label} — ${checked}`
    : `${label} · Last checked ${checked}`;
}

/** @deprecated migration fallback — see profileStrap(); kept for callers/tests. */
export const principalRole = inferredRole;

const metaDescription = personMetaDescription;

export function linkButtons(p) {
  const links = [
    ['X', p.x_url, 'people-link-primary'],
    ['LinkedIn', p.linkedin_url, 'people-link-primary'],
    ['Website', p.website_url, ''],
    ['GitHub', p.github_url, ''],
    ['Instagram', p.instagram_url, ''],
    ['YouTube', p.youtube_url, ''],
  ].map(([label, url, extra]) => {
    const safe = safeExternalUrl(url);
    const cls = ['button', 'people-link', extra].filter(Boolean).join(' ');
    return safe ? `<a class="${cls}" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
  }).filter(Boolean);
  return links.length ? `<div class="people-links">${links.join('')}</div>` : '';
}

function relationChip(label, projectMap) {
  const slug = projectMap.get(normalize(label));
  return slug
    ? `<a class="tag-chip" href="/projects/${esc(slug)}/">${esc(label)}</a>`
    : `<span class="tag-chip">${esc(label)}</span>`;
}

export function renderAvatar(p, review) {
  const avatar = safeAvatarPath(p.avatar_url);
  if (avatar) {
    const alt = p.avatar_alt || `${p.name} profile image`;
    const source = safeExternalUrl(p.avatar_source_url);
    const credit = p.avatar_credit
      ? `<figcaption class="people-avatar-credit">${source
        ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(p.avatar_credit)}</a>`
        : esc(p.avatar_credit)}</figcaption>`
      : '';
    return `<figure class="people-avatar">
          <img class="people-avatar-img" src="${esc(avatar)}" alt="${esc(alt)}" loading="eager" referrerpolicy="no-referrer">
          ${credit}
        </figure>`;
  }
  const candidate = review?.images?.[p.slug];
  if (candidate) {
    return `<figure class="people-avatar people-avatar-review" data-pfp-review="candidate">
          <img class="people-avatar-img" src="${esc(candidate.path)}" alt="${esc(p.name)} public profile image (candidate for review)" loading="eager" referrerpolicy="no-referrer">
          <figcaption class="people-review-label">${esc(review.label)}</figcaption>
        </figure>`;
  }
  return `<div class="people-avatar people-avatar-fallback" role="img" aria-label="Profile image not yet published for ${esc(p.name)}"><span>${esc(initials(p.name))}</span></div>`;
}

// Project-style framed panel: title bar + body, with the People (yellow) accent.
function factPanel(title, body, extraClass = '') {
  return `<article class="panel people-fact${extraClass}"><div class="panel-title"><h2>${esc(title)}</h2></div><div class="people-fact-body">${body}</div></article>`;
}

function listCard(title, items) {
  if (!items.length) return '';
  return factPanel(title, `<ul class="people-role-list">${items.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
}

function chipCard(title, chips) {
  if (!chips) return '';
  return factPanel(title, `<div class="tag-list">${chips}</div>`);
}

function governanceCards(p) {
  const cards = [];
  if (hasVerifiedDrep(p)) {
    cards.push(factPanel('DREP', `<dl>
        <dt>Status</dt><dd>${esc(p.drep_status)}</dd>
        <dt>DRep ID</dt><dd><code>${esc(p.drep_id)}</code></dd>
      </dl>`, ' people-fact-gov'));
  }
  if (hasVerifiedSpo(p)) {
    const ids = (p.pool_ids || []).map((id) => `<code>${esc(id)}</code>`).join(' ');
    cards.push(factPanel('STAKE POOL', `<dl>
${p.pool_ticker ? `        <dt>Ticker</dt><dd>${esc(p.pool_ticker)}</dd>\n` : ''}        <dt>Status</dt><dd>${esc(p.spo_status)}</dd>
${ids ? `        <dt>${(p.pool_ids || []).length > 1 ? 'Pool IDs' : 'Pool ID'}</dt><dd>${ids}</dd>\n` : ''}      </dl>`, ' people-fact-gov'));
  }
  return cards.join('\n      ');
}

function jsonLd(p, projectMap = new Map()) {
  const sameAs = [p.x_url, p.linkedin_url, p.website_url, p.github_url, p.instagram_url, p.youtube_url].map(safeExternalUrl).filter(Boolean);
  // Only projects named in the approved linked_projects list AND present in the
  // published project dataset become schema relationships.
  const mentions = (p.linked_projects || []).map((label) => projectMap.get(normalize(label))).filter(Boolean)
    .map((slug) => ({'@type':'WebPage','@id':`https://index80.com/projects/${slug}/`,url:`https://index80.com/projects/${slug}/`}));
  return JSON.stringify({
    '@context':'https://schema.org',
    '@graph':[
      {
        '@type':'WebPage',
        '@id':`https://index80.com/people/${p.slug}/`,
        url:`https://index80.com/people/${p.slug}/`,
        name:personTitle(p),
        description:metaDescription(p),
        isPartOf:{'@type':'WebSite',name:'INDEX:80 / CARDANO',url:'https://index80.com/'},
        about:{'@id':`https://index80.com/people/${p.slug}/#person`},
        mainEntity:{'@id':`https://index80.com/people/${p.slug}/#person`},
        breadcrumb:{'@id':`https://index80.com/people/${p.slug}/#breadcrumb`},
        ...(p.last_verified ? {dateModified:p.last_verified} : {}),
        ...(mentions.length ? {mentions} : {})
      },
      {
        '@type':'Person',
        '@id':`https://index80.com/people/${p.slug}/#person`,
        name:p.name,
        url:`https://index80.com/people/${p.slug}/`,
        mainEntityOfPage:{'@id':`https://index80.com/people/${p.slug}/`},
        ...(p.bio ? {description:p.bio} : {}),
        sameAs,
        ...(safeAvatarPath(p.avatar_url) ? {image:`https://index80.com${safeAvatarPath(p.avatar_url)}`} : {})
      },
      {
        '@type':'BreadcrumbList',
        '@id':`https://index80.com/people/${p.slug}/#breadcrumb`,
        itemListElement:[
          {'@type':'ListItem',position:1,name:'INDEX:80',item:'https://index80.com/'},
          {'@type':'ListItem',position:2,name:'People',item:'https://index80.com/people/'},
          {'@type':'ListItem',position:3,name:p.name,item:`https://index80.com/people/${p.slug}/`}
        ]
      }
    ]
  }, null, 2).replace(/</g,'\\u003c');
}

// Educational context only where the profile already shows a verified DRep / SPO card.
function learnLinks(p) {
  const links = [];
  if (hasVerifiedDrep(p)) links.push('<a href="/learn/#learn-governance-dreps">What is a DRep?</a>');
  if (hasVerifiedSpo(p)) links.push('<a href="/learn/#learn-staking">What is staking?</a>');
  return links.length ? ` ${links.join(' · ')} ·` : '';
}

export function render(p, projectMap, review = null) {
  const pageTitle = personTitle(p);
  const pageUrl = `https://index80.com/people/${p.slug}/`;
  const description = metaDescription(p);
  const checked = formatDate(p.last_verified);
  const statusLabel = EVIDENCE_SHORT_LABEL[p.verification_status] || null;
  const meta = [p.primary_category, statusLabel && checked ? `${statusLabel} ${checked}` : statusLabel].filter(Boolean);
  const tags = (p.role_tags || []).map((r) => `<span class="tag-chip">${esc(r)}</span>`).join('');
  const projects = (p.linked_projects || []).map((r) => relationChip(r, projectMap)).join('');
  const facts = [
    listCard('CURRENT ROLES', p.current_roles || []),
    listCard('PREVIOUSLY', p.historic_roles || []),
    chipCard('PROJECTS / ORGANISATIONS', projects),
    governanceCards(p),
    chipCard('ROLE TAGS', tags),
  ].filter(Boolean).join('\n      ');
  const recordLine = esc(evidenceLine(p));

  return `<!doctype html>
<html lang="en">
<head>
  <script src="/assets/js/analytics.js"></script>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(description)}">
  <title>${esc(pageTitle)}</title>
  <link rel="canonical" href="${esc(pageUrl)}">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(pageUrl)}">
  <meta property="og:type" content="profile">
  <meta property="og:image" content="${SHARE_IMAGE_URL}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${SHARE_IMAGE_URL}">
  <link rel="icon" type="image/svg+xml" href="/assets/icons/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32.png">
  <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap">
  <script src="/assets/js/theme.js"></script>
  <link rel="stylesheet" href="/assets/css/site.css">
  <script type="application/ld+json">${jsonLd(p, projectMap)}</script>
</head>
<body data-mode="people">
  <!-- ${GENERATED_PROFILE_MARKER} -->
  <a class="skip-link" href="#main">Skip to content</a>

  <div class="system-bar">
    <span class="system-slogan">A MORE OPEN INTERNET, A BRIGHTER TOMORROW.</span>
    <span class="system-status"><span class="status-dot"></span> INDEX:80 ONLINE</span>
  </div>

  <header class="site-header">
    <div class="brand-row">
      <a class="wordmark" href="/" aria-label="INDEX:80 home"><span>INDEX:</span><b>80</b></a>
      <span class="network-label">/PEOPLE</span>
    </div>
    <nav class="main-nav" aria-label="Primary">
${renderNavLinks('/people/', '      ')}
    </nav>
  </header>

  <main id="main" class="page-grid single-column people-profile">
    <p class="source-line people-crumb"><a href="/">INDEX:80</a> / <a href="/people/">People</a> / ${esc(p.name)}</p>
    <p class="people-beta-status" role="note"><strong>PUBLIC BETA · FACTUAL REVIEW OPEN</strong> <span>This profile is based on public sources and may not yet have been confirmed by the person listed.</span> <a href="${PROFILE_CORRECTION_URL}">Suggest a correction →</a></p>

    <section class="panel people-profile-hero people-record-header" aria-labelledby="person-name">
      <div class="people-profile-media">
        ${renderAvatar(p, review)}
      </div>
      <div class="people-profile-copy">
        <p class="people-record-cat">${esc(p.primary_category)}</p>
        <h1 id="person-name" class="people-record-name">${esc(p.name)}</h1>
        <p class="strap people-subtitle" data-subtitle-source="${profileStrap(p).source}">${esc(profileStrap(p).text)}</p>
        ${linkButtons(p)}
      </div>
    </section>

    <section class="panel people-summary" aria-label="Summary">
${p.bio ? `      <p class="people-bio">${esc(p.bio)}</p>\n` : ''}      <p class="people-meta">${meta.map(esc).join(' · ')}</p>
    </section>
${facts ? `
    <section class="people-facts" aria-label="Roles, projects and governance">
      ${facts}
    </section>
` : ''}
    <p class="people-record-line">${recordLine} ·${learnLinks(p)} <a href="${METHODOLOGY_URL}">How People records are built</a> · <a href="${CORRECTIONS_URL}">Corrections &amp; objections</a> · <a href="/people/">← All people</a></p>
  </main>

  <footer class="site-footer">
    <nav class="footer-nav" aria-label="Secondary">
${renderNavLinks(null, '      ')}
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

function main() {
  const peopleData = JSON.parse(readFileSync(PEOPLE_FILE, 'utf8'));
  const projectsData = JSON.parse(readFileSync(PROJECTS_FILE, 'utf8'));
  const projectMap = new Map((projectsData.projects || []).map((p)=>[normalize(p.name),p.slug]));
  const review = loadReviewMap(PUBLIC);

  let generated = 0;
  let custom = 0;
  let candidates = 0;
  const people = peopleData.people || [];
  const activeSlugs = new Set();
  for (const p of people) {
    validatePublicPerson(p, {publicRoot:PUBLIC});
    if (activeSlugs.has(p.slug)) throw new Error(`Duplicate People slug: ${p.slug}`);
    activeSlugs.add(p.slug);
    const dir = join(PEOPLE_DIR, p.slug);
    const out = join(dir, 'index.html');

    if (p.profile_type === 'custom') {
      if (!existsSync(out)) throw new Error(`Custom People profile is missing: ${p.slug}`);
      custom += 1;
      continue;
    }

    mkdirSync(dir, {recursive:true});
    writeFileSync(out, render(p, projectMap, review), 'utf8');
    generated += 1;
    if (!p.avatar_url && review?.images?.[p.slug]) candidates += 1;
  }

  const pruned = pruneStaleGeneratedProfiles(PEOPLE_DIR, activeSlugs);
  console.log(`[generate-people-pages] wrote ${generated} generated profile(s); preserved ${custom} custom profile(s); pruned ${pruned} stale generated profile(s)${review ? `; DEV review: ${candidates} candidate PFP(s)` : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

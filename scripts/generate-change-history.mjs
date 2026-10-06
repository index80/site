#!/usr/bin/env node
/**
 * Sprint 3B public change-history generator.
 *
 * Public output is derived only from immutable Registry history and the
 * conservative Sprint 3A public-candidate rules. The fuller audit diff stays
 * private/dev and is never used as a public activity feed.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDryRun } from './sprint3a-change-detection.mjs';
import { esc, safeUrl } from './lib/html-safety.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const SITE_URL = 'https://index80.com';
export const PEOPLE_PUBLIC_CANDIDATE_FIELDS = new Set([
  'name', 'x_url', 'linkedin_url', 'website_url', 'github_url', 'youtube_url',
  'drep_id', 'drep_status', 'spo_status', 'pool_ticker', 'pool_ids',
]);

function publicPeopleView(comparison) {
  if (!comparison) return null;
  return {
    added: comparison.added,
    removed: comparison.removed,
    updated: comparison.updated
      .map((item) => ({
        ...item,
        changes: item.changes.filter((change) => PEOPLE_PUBLIC_CANDIDATE_FIELDS.has(change.field)),
      }))
      .filter((item) => item.changes.length > 0),
    flags: comparison.flags,
  };
}

function eventId({ fromRelease, toRelease, entityType, entityId, operation, field }) {
  const token = [fromRelease, toRelease, entityType, entityId, operation, field || ''].join('|');
  return `chg_${createHash('sha256').update(token).digest('hex').slice(0, 20)}`;
}

function entityPath(type, id) {
  if (!/^[a-z0-9-]+$/.test(id || '')) return null;
  return type === 'person' ? `/people/${id}/` : `/projects/${id}/`;
}

function absoluteSiteUrl(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return null;
  return new URL(pathname, SITE_URL).href;
}

function evidenceFor(from, to) {
  return [
    { type: 'registry_snapshot_before', url: absoluteSiteUrl(from.snapshot?.path) },
    { type: 'registry_snapshot_after', url: absoluteSiteUrl(to.snapshot?.path) },
    { type: 'registry_release', url: absoluteSiteUrl(to.release_manifest_url) },
    { type: 'cardano_proof', url: to.proof?.explorer_url || null },
  ].filter((item) => item.url);
}

function atomicEvents(from, to, entityType, view) {
  if (!view) return [];
  const base = {
    from_release: from.release_id,
    to_release: to.release_id,
    observed_on: to.proof?.confirmation_observed?.date || null,
    release_manifest_url: absoluteSiteUrl(to.release_manifest_url),
    cardano_proof_url: to.proof?.explorer_url || null,
    evidence: evidenceFor(from, to),
  };
  const events = [];

  for (const item of view.added) {
    const operation = 'added_to_index';
    events.push({
      event_id: eventId({ fromRelease: from.release_id, toRelease: to.release_id, entityType, entityId: item.id, operation, field: null }),
      ...base,
      entity_type: entityType,
      entity_id: item.id,
      entity_name: item.name,
      entity_url: absoluteSiteUrl(entityPath(entityType, item.id)),
      operation,
      field: null,
      previous_present: false,
      current_present: true,
      previous: null,
      current: { name: item.name },
    });
  }

  for (const item of view.removed) {
    const operation = 'removed_from_public_index';
    events.push({
      event_id: eventId({ fromRelease: from.release_id, toRelease: to.release_id, entityType, entityId: item.id, operation, field: null }),
      ...base,
      entity_type: entityType,
      entity_id: item.id,
      entity_name: item.name,
      entity_url: absoluteSiteUrl(entityPath(entityType, item.id)),
      operation,
      field: null,
      previous_present: true,
      current_present: false,
      previous: { name: item.name },
      current: null,
    });
  }

  for (const item of view.updated) {
    for (const change of item.changes) {
      const operation = 'field_updated';
      events.push({
        event_id: eventId({ fromRelease: from.release_id, toRelease: to.release_id, entityType, entityId: item.id, operation, field: change.field }),
        ...base,
        entity_type: entityType,
        entity_id: item.id,
        entity_name: item.name,
        entity_url: absoluteSiteUrl(entityPath(entityType, item.id)),
        operation,
        field: change.field,
        previous_present: change.before_present,
        current_present: change.after_present,
        previous: change.previous,
        current: change.current,
      });
    }
  }

  return events.sort((a, b) =>
    a.entity_type.localeCompare(b.entity_type, 'en')
    || a.entity_id.localeCompare(b.entity_id, 'en')
    || a.operation.localeCompare(b.operation, 'en')
    || String(a.field || '').localeCompare(String(b.field || ''), 'en')
  );
}

export function buildPublicChangeLedger(root = ROOT) {
  const history = JSON.parse(readFileSync(join(root, 'public_html', 'registry', 'index.json'), 'utf8'));
  const releases = [...history.releases].sort((a, b) => a.sequence - b.sequence);
  const releaseMap = new Map(releases.map((release) => [release.release_id, release]));
  const comparison = buildDryRun(root);
  const groups = [];
  const events = [];

  for (const pair of comparison.pairs) {
    const from = releaseMap.get(pair.from);
    const to = releaseMap.get(pair.to);
    if (!from || !to) throw new Error(`Missing Registry release metadata for ${pair.from} → ${pair.to}`);

    const project = pair.project_public_candidates;
    const people = publicPeopleView(pair.people);
    const groupEvents = [
      ...atomicEvents(from, to, 'project', project),
      ...atomicEvents(from, to, 'person', people),
    ];

    const counts = {
      projects_added_to_index: project.added.length,
      projects_removed_from_public_index: project.removed.length,
      project_records_updated: project.updated.length,
      people_added_to_index: people?.added.length || 0,
      people_removed_from_public_index: people?.removed.length || 0,
      people_records_updated: people?.updated.length || 0,
      atomic_events: groupEvents.length,
    };

    groups.push({
      from_release: from.release_id,
      to_release: to.release_id,
      observed_on: to.proof?.confirmation_observed?.date || null,
      release_manifest_url: absoluteSiteUrl(to.release_manifest_url),
      cardano_proof_url: to.proof?.explorer_url || null,
      counts,
    });
    events.push(...groupEvents);
  }

  const ids = new Set();
  for (const event of events) {
    if (ids.has(event.event_id)) throw new Error(`Duplicate change event ID: ${event.event_id}`);
    ids.add(event.event_id);
  }

  return {
    schema: 'INDEX80 Public Change Ledger v1',
    semantics: {
      scope: 'Changes first reflected in immutable INDEX:80 Registry releases.',
      date_rule: 'observed_on is the Registry proof-confirmation observation date, not necessarily the real-world effective date of the underlying fact.',
      addition_rule: 'added_to_index means added to INDEX:80, not project/person launch or creation.',
      removal_rule: 'removed_from_public_index is neutral and does not imply that an entity ceased operating.',
      public_candidate_rule: 'Only the approved conservative candidate fields are public; broader editorial maintenance remains audit-only.',
    },
    registry_history_url: absoluteSiteUrl('/registry/index.json'),
    project_baseline: comparison.project_baseline,
    people_baseline: comparison.people_baseline,
    latest_release_id: comparison.latest_release_id,
    release_groups: groups,
    event_count: events.length,
    events,
  };
}

function formatObservedDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || 'DATE UNAVAILABLE';
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(date)
    .toUpperCase();
}

const FIELD_LABELS = {
  name: 'Name',
  official_url: 'Official site',
  docs_url: 'Documentation',
  github_url: 'GitHub',
  social_url: 'X / social',
  linkedin_url: 'LinkedIn',
  discord_url: 'Discord',
  marketplace_url: 'Marketplace / app',
  policy_id: 'Policy ID / contract',
  established: 'Established',
  treasury_funded_proposals: 'Treasury funded proposals',
  treasury_funding_ref: 'Treasury funding reference',
  treasury_funding_value_usd: 'Treasury funding value USD',
  treasury_funding_value_ada: 'Treasury funding value ADA',
  x_url: 'X / social',
  website_url: 'Website',
  youtube_url: 'YouTube',
  drep_id: 'DRep ID',
  drep_status: 'DRep status',
  spo_status: 'SPO status',
  pool_ticker: 'Pool ticker',
  pool_ids: 'Pool IDs',
};

function fieldLabel(field) {
  return FIELD_LABELS[field] || String(field || '').replaceAll('_', ' ').toUpperCase();
}

function renderValue(present, value) {
  if (!present) return '<span class="change-empty">NOT PRESENT</span>';
  if (value === null) return '<span class="change-empty">NONE</span>';
  if (typeof value === 'string') {
    const url = safeUrl(value);
    return url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(value)} ↗</a>`
      : `<code>${esc(value)}</code>`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="change-empty">EMPTY</span>';
    return `<code>${esc(JSON.stringify(value))}</code>`;
  }
  return `<code>${esc(JSON.stringify(value))}</code>`;
}

function renderEntityLink(type, item) {
  const href = entityPath(type, item.id);
  return href ? `<a href="${href}">${esc(item.name)}</a>` : esc(item.name);
}

function renderEntityList(type, items) {
  if (!items.length) return '<p class="change-none">None.</p>';
  return `<ul class="change-entity-list">${items.map((item) => `<li>${renderEntityLink(type, item)} <code>${esc(item.id)}</code></li>`).join('')}</ul>`;
}

function renderUpdates(type, items) {
  if (!items.length) return '<p class="change-none">None.</p>';
  return items.map((item) => `<article class="change-update">
    <h4>${renderEntityLink(type, item)} <code>${esc(item.id)}</code></h4>
    <div class="change-fields">
      ${item.changes.map((change) => `<div class="change-field">
        <strong>${esc(fieldLabel(change.field))}</strong>
        <div><span>BEFORE</span>${renderValue(change.before_present, change.previous)}</div>
        <div><span>AFTER</span>${renderValue(change.after_present, change.current)}</div>
      </div>`).join('')}
    </div>
  </article>`).join('');
}

function changeCountSummary(project, people = null) {
  const parts = [
    `${project.added.length} added to INDEX:80`,
    `${project.removed.length} removed`,
    `${project.updated.length} updated`,
  ];
  if (people) {
    const peopleCount = people.added.length + people.removed.length + people.updated.length;
    if (peopleCount) parts.push(`${peopleCount} People changes`);
  }
  return parts.join(' · ');
}

// Shared body for one Registry release transition, rendered in the Registry
// page's Recent Changes windows. /registry/#recent-changes is the one
// human-readable change history (the standalone /changes/ page was retired in
// Sprint 4B.1 and 301-redirects there via public_html/_redirects);
// /data/change-ledger.json is the machine-readable equivalent.
function renderReleaseChangeBody(pair) {
  const project = pair.project_public_candidates;
  const people = publicPeopleView(pair.people);
  const peopleHasContent = people && (people.added.length || people.removed.length || people.updated.length);
  return `<div class="change-counts" aria-label="Change counts">
      <span><strong>${project.added.length}</strong> PROJECTS ADDED TO INDEX:80</span>
      <span><strong>${project.removed.length}</strong> PROJECTS REMOVED FROM PUBLIC INDEX</span>
      <span><strong>${project.updated.length}</strong> PROJECT RECORDS UPDATED</span>
    </div>
    <div class="change-columns">
      <div class="change-block">
        <h3>ADDED TO INDEX:80</h3>
        ${renderEntityList('project', project.added)}
      </div>
      <div class="change-block">
        <h3>REMOVED FROM PUBLIC INDEX</h3>
        ${renderEntityList('project', project.removed)}
      </div>
    </div>
    <div class="change-block change-updates">
      <h3>FACTUAL RECORD UPDATES</h3>
      ${renderUpdates('project', project.updated)}
    </div>
    ${pair.people_baseline_suppressed ? `<div class="change-baseline"><strong>PEOPLE BASELINE:</strong> ${pair.people_baseline_suppressed} People first appear in ${esc(pair.to)} and are intentionally not reported as additions.</div>` : ''}
    ${peopleHasContent ? `<div class="change-block"><h3>PEOPLE CHANGES</h3><div class="change-columns"><div><h4>ADDED TO INDEX:80</h4>${renderEntityList('person', people.added)}</div><div><h4>REMOVED FROM PUBLIC INDEX</h4>${renderEntityList('person', people.removed)}</div></div>${renderUpdates('person', people.updated)}</div>` : ''}`;
}

function renderProofActions(release) {
  const releaseManifestUrl = typeof release.release_manifest_url === 'string'
    && (/^\/registry\/releases\/[a-z0-9-]+\.json$/.test(release.release_manifest_url) || safeUrl(release.release_manifest_url))
    ? release.release_manifest_url
    : null;
  return `${releaseManifestUrl ? `<a class="button" href="${esc(releaseManifestUrl)}">Release JSON →</a>` : '<span class="button" aria-disabled="true">Release JSON unavailable</span>'}
        ${safeUrl(release.proof?.explorer_url) ? `<a class="button" href="${esc(release.proof.explorer_url)}" target="_blank" rel="noopener noreferrer">Cardano proof ↗</a>` : ''}`;
}

// One collapsible Registry window per release transition, using the same
// native <details>/<summary> + .panel-title + .disclosure-caret pattern as
// the Project-page EVIDENCE panel. No JS state.
function renderRegistryChangeWindow(pair, release, open = false) {
  const project = pair.project_public_candidates;
  const people = publicPeopleView(pair.people);
  return `<details class="panel registry-change-window"${open ? ' open' : ''} id="${esc(pair.to.toLowerCase())}-changes">
        <summary class="panel-title registry-window-title">
          <h2>${esc(pair.from)} → ${esc(pair.to)}</h2>
          <span>OBSERVED ${esc(formatObservedDate(release.proof?.confirmation_observed?.date))} · ${esc(changeCountSummary(project, people))} <b class="disclosure-caret">▸</b></span>
        </summary>
        <div class="registry-window-body registry-change-body">
    ${renderReleaseChangeBody(pair)}
          <div class="registry-actions registry-change-actions">
        ${renderProofActions(release)}
          </div>
        </div>
      </details>`;
}

// Registry-page RECENT CHANGES section. Takes the already-built Sprint 3A
// comparison (buildDryRun) so the Registry generator never re-implements
// change detection. Newest transition open; older transitions collapsed.
export function renderRegistryChangeHistory(history, comparison) {
  const releaseMap = new Map(history.releases.map((release) => [release.release_id, release]));
  const pairs = [...comparison.pairs].reverse();
  if (!pairs.length) return '';
  return `<section class="panel shell-panel registry-change-history" id="recent-changes" aria-labelledby="registry-change-history-title">
      <div class="panel-title registry-change-history-titlebar">
        <h2 id="registry-change-history-title">RECENT CHANGES</h2>
        <span>/ PUBLIC RECORD DIFF</span>
      </div>
      <div class="registry-change-history-intro">
        <p>What changed in INDEX:80's public record between consecutive immutable Registry releases. Only the conservative public fields are shown: additions to INDEX:80, neutral removals from the public index, and low-ambiguity factual record updates.</p>
        <p class="registry-change-note"><strong>Observation dates:</strong> each date is when a change was first reflected in an INDEX:80 Registry release. It is not automatically the date the underlying real-world event happened. <strong>Added to INDEX:80</strong> does not mean launched; <strong>removed from public index</strong> does not mean an entity ceased operating.</p>
      </div>
      <div class="registry-change-windows">
      ${pairs.map((pair, index) => {
        const release = releaseMap.get(pair.to);
        if (!release) throw new Error(`Missing release for ${pair.to}`);
        return renderRegistryChangeWindow(pair, release, index === 0);
      }).join('\n      ')}
      </div>
      <div class="registry-actions registry-change-history-links">
        <a class="button" href="/data/change-ledger.json">Change ledger JSON →</a>
      </div>
    </section>`;
}

export function generatePublicChangeHistory(root = ROOT) {
  const ledger = buildPublicChangeLedger(root);

  // Only the machine-readable ledger is written here. The human-readable
  // history is the Registry page's Recent Changes section
  // (renderRegistryChangeHistory, called by generate-registry-history.mjs);
  // no standalone /changes/ page is generated.
  mkdirSync(join(root, 'public_html', 'data'), { recursive: true });
  writeFileSync(join(root, 'public_html', 'data', 'change-ledger.json'), JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  return { ledger };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ledger } = generatePublicChangeHistory(ROOT);
  console.log(`[generate-change-history] wrote ${ledger.event_count} atomic public event(s) across ${ledger.release_groups.length} release transition(s).`);
}

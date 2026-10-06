#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDryRun, PROJECT_PUBLIC_CANDIDATE_FIELDS } from './sprint3a-change-detection.mjs';
import { buildPublicChangeLedger, renderChangesPage, renderRegistryChangeHistory } from './generate-change-history.mjs';
import { applyGlobalSearch } from './apply-global-search.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const history = JSON.parse(readFileSync(join(PUBLIC, 'registry', 'index.json'), 'utf8'));

const first = buildPublicChangeLedger(ROOT);
const second = buildPublicChangeLedger(ROOT);
assert.deepEqual(first, second, 'Public change ledger must be deterministic');
assert.equal(first.schema, 'INDEX80 Public Change Ledger v1');
assert.equal(first.project_baseline, 'INDEX80-0001');
assert.equal(first.people_baseline, 'INDEX80-0004');
assert.equal(first.release_groups.length, 3);
assert(first.event_count > 0, 'Public ledger must contain real events');

const ids = first.events.map((event) => event.event_id);
assert.equal(new Set(ids).size, ids.length, 'Public event IDs must be unique');
for (const event of first.events) {
  assert(/^chg_[0-9a-f]{20}$/.test(event.event_id), `Invalid event ID: ${event.event_id}`);
  const eventToken = [event.from_release, event.to_release, event.entity_type, event.entity_id, event.operation, event.field || ''].join('|');
  const expectedId = `chg_${createHash('sha256').update(eventToken).digest('hex').slice(0, 20)}`;
  assert.equal(event.event_id, expectedId, `Event ID is not deterministic for ${eventToken}`);
  assert(['project', 'person'].includes(event.entity_type), 'Unexpected entity type');
  assert(['added_to_index', 'removed_from_public_index', 'field_updated'].includes(event.operation), 'Unexpected operation');
  assert(event.to_release && event.from_release, 'Release pair missing');
  assert(event.release_manifest_url?.startsWith('https://index80.com/registry/releases/'), 'Canonical release manifest URL missing');
  assert(/^https:\/\/cardanoscan\.io\/transaction\/|^https:\/\/preprod\.cardanoscan\.io\/transaction\//.test(event.cardano_proof_url || ''), 'Cardano proof link missing');
  assert(event.entity_url?.startsWith('https://index80.com/'), 'Canonical entity URL missing');
  assert(event.evidence.every((item) => /^https:\/\//.test(item.url)), 'Evidence URLs must be absolute HTTP(S)');
}

const forbiddenPublicFields = new Set([
  'summary', 'editorial_note', 'tags', 'sources', 'category', 'public_family',
  'team_entity', 'founder_lead', 'related_projects', 'bio', 'primary_category',
  'category_slug', 'current_roles', 'historic_roles', 'linked_projects',
  'role_tags', 'verification_status', 'last_verified', 'avatar_url',
  'featured', 'status', 'primary_link_type', 'primary_link_url', 'explorer_url',
  'profile_subtitle', 'profile_type', 'instagram_url', 'avatar_alt',
  'avatar_credit', 'avatar_source_url', 'filter_label', 'icon', 'profile_url',
  'identity_basis', 'contact_status', 'owner_decision', 'research_id',
  'publish', 'review_status', 'workflow_state', 'internal_notes',
]);
assert(!first.events.some((event) => event.field && forbiddenPublicFields.has(event.field)), 'Audit-only field leaked into public ledger');
assert(!first.events.some((event) => event.entity_type === 'person'), 'People baseline must not create public change events');

const eventKeys = [
  'cardano_proof_url', 'current', 'current_present', 'entity_id', 'entity_name',
  'entity_type', 'entity_url', 'event_id', 'evidence', 'field', 'from_release',
  'observed_on', 'operation', 'previous', 'previous_present',
  'release_manifest_url', 'to_release',
].sort();
const evidenceKeys = ['type', 'url'];
for (const event of first.events) {
  assert.deepEqual(Object.keys(event).sort(), eventKeys, `Unexpected public ledger field(s) on ${event.event_id}`);
  for (const evidence of event.evidence) {
    assert.deepEqual(Object.keys(evidence).sort(), evidenceKeys, `Unexpected evidence field(s) on ${event.event_id}`);
  }
}
function objectKeys(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) objectKeys(item, found);
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key);
      objectKeys(nested, found);
    }
  }
  return found;
}
const ledgerKeys = objectKeys(first);
for (const field of forbiddenPublicFields) {
  assert(!ledgerKeys.has(field), `Private editorial/workflow key leaked into public ledger: ${field}`);
}

const comparison = buildDryRun(ROOT);
for (const pair of comparison.pairs) {
  const group = first.release_groups.find((item) => item.from_release === pair.from && item.to_release === pair.to);
  assert(group, `Missing release group ${pair.from} → ${pair.to}`);
  assert.equal(group.counts.projects_added_to_index, pair.project_public_candidates.added.length);
  assert.equal(group.counts.projects_removed_from_public_index, pair.project_public_candidates.removed.length);
  assert.equal(group.counts.project_records_updated, pair.project_public_candidates.updated.length);
  for (const item of pair.project_public_candidates.updated) {
    assert(item.changes.every((change) => PROJECT_PUBLIC_CANDIDATE_FIELDS.has(change.field)), `Audit-only Project field reached public candidates for ${item.id}`);
  }
}
const peopleBaseline = comparison.pairs.find((pair) => pair.people_baseline_suppressed === 155);
assert(peopleBaseline, 'Expected 155-record People baseline suppression is missing');
const peopleBaselineGroup = first.release_groups.find((group) => group.from_release === peopleBaseline.from && group.to_release === peopleBaseline.to);
assert(peopleBaselineGroup, 'People baseline release group missing from public ledger');
assert.deepEqual(
  [peopleBaselineGroup.counts.people_added_to_index, peopleBaselineGroup.counts.people_removed_from_public_index, peopleBaselineGroup.counts.people_records_updated],
  [0, 0, 0],
  'People baseline must not appear as 155 additions or other People events',
);
assert(first.events.every((event) => !('effective_date' in event) && !('real_world_date' in event)), 'Ledger must not infer a real-world event date');
for (const group of first.release_groups) {
  const release = history.releases.find((item) => item.release_id === group.to_release);
  assert.equal(group.observed_on, release?.proof?.confirmation_observed?.date || null, `Observed date must come only from Registry proof metadata for ${group.to_release}`);
}

const committedLedgerText = readFileSync(join(PUBLIC, 'data', 'change-ledger.json'), 'utf8');
assert.equal(committedLedgerText, JSON.stringify(first, null, 2) + '\n', 'Committed public ledger must match generated output byte-for-byte');

const html = renderChangesPage(first, comparison, history);
const htmlWithGlobalSearch = applyGlobalSearch(html);
const committedHtml = readFileSync(join(PUBLIC, 'changes', 'index.html'), 'utf8');
assert(
  committedHtml === html || committedHtml === htmlWithGlobalSearch,
  'Generated /changes/ page must match the deterministic base output, with only the standard global-search injection permitted',
);
assert(html.includes('ADDED TO INDEX:80'), 'Public addition semantics missing');
assert(html.includes('REMOVED FROM PUBLIC INDEX'), 'Neutral removal semantics missing');
assert(html.includes('observation date is not automatically the date'), 'Date semantics warning missing');
assert(html.includes('/data/change-ledger.json'), 'Machine-readable ledger link missing');
assert(!html.includes('OPERATIONS CEASED'), 'Public history must not invent cessation semantics');
assert(!html.includes('<strong>SUMMARY</strong>') && !html.includes('<strong>Summary</strong>'), 'Audit-only summary field must not render as a public change field');
for (const label of ['EDITORIAL NOTE', 'TAGS', 'SOURCES', 'PUBLIC FAMILY', 'TEAM ENTITY', 'FOUNDER LEAD', 'RELATED PROJECTS']) {
  assert(!html.includes(`<strong>${label}</strong>`), `Audit-only ${label} field rendered in public Recent Changes`);
}
assert(!html.includes('aria-current="page"'), 'Changes must not be promoted into primary navigation before owner review');

// Registry integration: Recent Changes lives inside /registry/, rendered from
// the same comparison as /changes/ (no second source of truth).
const registryHtml = readFileSync(join(PUBLIC, 'registry', 'index.html'), 'utf8');
const registryFragment = renderRegistryChangeHistory(history, comparison);
assert(registryHtml.includes(registryFragment), 'Committed /registry/ must embed the deterministic Recent Changes fragment byte-for-byte');
assert(registryFragment.includes('id="registry-change-history-title">RECENT CHANGES</h2>'), 'Registry Recent Changes heading missing');
const windows = [...registryFragment.matchAll(/<details class="panel registry-change-window"( open)? id="([a-z0-9-]+)-changes">/g)];
assert.equal(windows.length, comparison.pairs.length, 'One Registry change window per release transition');
assert.equal(windows[0][1], ' open', 'Newest release transition must be open by default');
assert(windows.slice(1).every((match) => !match[1]), 'Older release transitions must start collapsed');
assert.equal(windows[0][2], comparison.pairs.at(-1).to.toLowerCase(), 'First Registry window must be the newest transition');
for (const pair of comparison.pairs) {
  const release = history.releases.find((item) => item.release_id === pair.to);
  assert(registryFragment.includes(`href="${release.release_manifest_url}"`), `Release JSON link missing for ${pair.to}`);
  if (release.proof?.explorer_url) assert(registryFragment.includes(release.proof.explorer_url), `Cardano proof link missing for ${pair.to}`);
  for (const item of pair.project_public_candidates.added) assert(registryFragment.includes(`<code>${item.id}</code>`), `Added project ${item.id} missing from Registry window`);
  for (const item of pair.project_public_candidates.removed) assert(registryFragment.includes(`<code>${item.id}</code>`), `Removed project ${item.id} missing from Registry window`);
  if (pair.people_baseline_suppressed) assert(registryFragment.includes(`PEOPLE BASELINE:</strong> ${pair.people_baseline_suppressed} People first appear in ${pair.to}`), 'People baseline notice missing from Registry');
}
assert(registryFragment.includes('ADDED TO INDEX:80') && registryFragment.includes('REMOVED FROM PUBLIC INDEX'), 'Registry addition/removal semantics missing');
assert(registryFragment.includes('not automatically the date the underlying real-world event happened'), 'Registry observation-date disclaimer missing');
assert(registryFragment.includes('href="/changes/"') && registryFragment.includes('href="/data/change-ledger.json"'), 'Registry must link the full /changes/ view and ledger JSON');
assert(registryFragment.includes('class="panel-title registry-window-title"'), 'Registry change windows must reuse the shared panel-title chrome');
assert(registryFragment.includes('class="disclosure-caret">▸</b>'), 'Registry change windows must reuse the shared disclosure caret');
assert(!registryFragment.includes('registry-window-toggle'), 'Registry must not use a separate custom window toggle system');
assert(registryFragment.includes('class="panel shell-panel registry-change-history"'), 'Recent Changes container must use the shared light panel theme'); // Shared Project/People window chrome
assert(!registryFragment.includes('OPERATIONS CEASED'), 'Registry must not invent cessation semantics');
// Hero and latest chain-proof card stay permanently visible. Other independent
// disclosure panels may appear before or after them, so test the proof card's
// own element type rather than assuming it precedes every <details> element.
const heroAt = registryHtml.indexOf('<section class="panel registry-hero">');
const latestCardAt = registryHtml.indexOf('<article class="panel dark registry-release registry-release-latest">');
assert(heroAt > 0 && latestCardAt > heroAt, 'Registry hero and latest chain-proof card must render');
assert(!registryHtml.includes('<details class="panel dark registry-release registry-release-latest"'), 'Latest chain-proof card must not be collapsible');
assert(registryHtml.indexOf('id="recent-changes"') > latestCardAt, 'Recent Changes must follow the latest chain-proof card');

// Hostile Registry-derived values must be escaped, and unsafe proof/manifest
// URLs must never become clickable links in either public rendering surface.
const hostilePair = {
  from: 'INDEX80-TEST-A',
  to: 'INDEX80-TEST-B',
  people: null,
  people_baseline_suppressed: 0,
  project_public_candidates: {
    added: [{ id: 'bad\"-slug', name: '<img src=x onerror=alert(1)>' }],
    removed: [],
    updated: [{
      id: 'safe-slug',
      name: '<script>alert(1)</script>',
      changes: [{
        field: 'official_url',
        before_present: true,
        after_present: true,
        previous: 'javascript:alert(1)',
        current: 'https://example.test/?q=\"<tag>&ok=1',
      }],
    }],
  },
};
const hostileHistory = {
  releases: [{
    release_id: hostilePair.to,
    release_manifest_url: 'javascript:alert(2)',
    proof: { explorer_url: 'data:text/html,<script>alert(3)</script>', confirmation_observed: { date: '2026-10-05' } },
  }],
};
const hostileComparison = { pairs: [hostilePair] };
const hostileLedger = { release_groups: [], event_count: 0, latest_release_id: hostilePair.to };
for (const hostileHtml of [
  renderRegistryChangeHistory(hostileHistory, hostileComparison),
  renderChangesPage(hostileLedger, hostileComparison, hostileHistory),
]) {
  assert(!/href="(?:javascript|data):/i.test(hostileHtml), 'Unsafe Registry URL became a clickable link');
  assert(!hostileHtml.includes('<script>alert(1)</script>') && !hostileHtml.includes('<img src=x'), 'Registry-derived markup was not escaped');
  assert(hostileHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'Escaped hostile entity name missing');
  assert(hostileHtml.includes('https://example.test/?q=&quot;&lt;tag&gt;&amp;ok=1'), 'Safe URL text/attribute was not escaped correctly');
  assert(hostileHtml.includes('Release JSON unavailable'), 'Unsafe release manifest URL must be rendered as unavailable');
}

console.log(`Sprint 3B change-history tests passed: ${first.event_count} atomic public events, stable IDs, conservative fields and static /changes/ output verified.`);

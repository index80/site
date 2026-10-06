#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PROJECT_BASELINE = 'INDEX80-0001';
export const PEOPLE_BASELINE = 'INDEX80-0004';

export const PROJECT_CONFIG = {
  idField: 'slug',
  meaningfulFields: [
    'name', 'summary', 'category', 'public_family', 'official_url', 'docs_url',
    'github_url', 'social_url', 'linkedin_url', 'discord_url', 'marketplace_url',
    'policy_id', 'established', 'tags', 'sources', 'team_entity', 'founder_lead',
    'related_projects', 'treasury_funded_proposals', 'treasury_funding_ref',
    'treasury_funding_value_usd', 'treasury_funding_value_ada', 'editorial_note',
  ],
  setFields: new Set(['tags', 'sources', 'related_projects']),
  ignoredFields: new Set([
    'featured', 'status', 'primary_link_type', 'primary_link_url', 'explorer_url',
  ]),
};

export const PROJECT_PUBLIC_CANDIDATE_FIELDS = new Set([
  'name', 'official_url', 'docs_url', 'github_url', 'social_url', 'linkedin_url',
  'discord_url', 'marketplace_url', 'policy_id', 'established',
  'treasury_funded_proposals', 'treasury_funding_ref',
  'treasury_funding_value_usd', 'treasury_funding_value_ada',
]);

export const PEOPLE_CONFIG = {
  idField: 'slug',
  meaningfulFields: [
    'name', 'bio', 'primary_category', 'category_slug', 'profile_subtitle',
    'profile_type', 'current_roles', 'historic_roles', 'linked_projects',
    'website_url', 'x_url', 'linkedin_url', 'github_url', 'instagram_url',
    'youtube_url', 'drep_id', 'drep_status', 'spo_status', 'pool_ids',
    'pool_ticker', 'role_tags',
  ],
  setFields: new Set([
    'current_roles', 'historic_roles', 'linked_projects', 'pool_ids', 'role_tags',
  ]),
  ignoredFields: new Set([
    'avatar_alt', 'avatar_credit', 'avatar_source_url', 'avatar_url', 'filter_label',
    'icon', 'last_verified', 'verification_status', 'profile_url',
  ]),
};

function isBlank(value) {
  return value === null || value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ');
  return value;
}

export function normalizeFieldValue(field, value, config) {
  if (isBlank(value)) return null;
  const normal = canonical(value);
  if (config.setFields.has(field) && Array.isArray(normal)) {
    return [...normal].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  }
  return normal;
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function increment(target, reason, field) {
  target[reason] ??= {};
  target[reason][field] = (target[reason][field] ?? 0) + 1;
}

function identitySignals(record) {
  return [
    ['name', record?.name],
    ['official_url', record?.official_url],
    ['policy_id', record?.policy_id],
    ['github_url', record?.github_url],
    ['social_url', record?.social_url],
  ].filter(([, value]) => !isBlank(value)).map(([field, value]) => [field, canonical(value)]);
}

function possibleIdentityMatches(removedRecords, addedRecords) {
  const flags = [];
  const blockedRemoved = new Set();
  const blockedAdded = new Set();
  for (const before of removedRecords) {
    const beforeSignals = new Map(identitySignals(before));
    const candidates = [];
    for (const after of addedRecords) {
      const shared = identitySignals(after)
        .filter(([field, value]) => beforeSignals.has(field) && jsonEqual(beforeSignals.get(field), value))
        .map(([field]) => field);
      if (shared.length) candidates.push({ after, shared });
    }
    if (!candidates.length) continue;
    blockedRemoved.add(before.slug);
    for (const candidate of candidates) blockedAdded.add(candidate.after.slug);
    flags.push({
      type: 'identity_continuity_ambiguous',
      before_slug: before.slug,
      before_name: before.name ?? before.slug,
      candidates: candidates.map(({ after, shared }) => ({
        after_slug: after.slug,
        after_name: after.name ?? after.slug,
        shared_signals: shared,
      })),
    });
  }
  return { flags, blockedRemoved, blockedAdded };
}

export function compareEntityCollections(beforeRecords = [], afterRecords = [], entityType, config) {
  const idField = config.idField;
  const beforeMap = new Map(beforeRecords.map((record) => [record[idField], record]));
  const afterMap = new Map(afterRecords.map((record) => [record[idField], record]));
  const removedRecords = [...beforeMap.keys()].filter((id) => !afterMap.has(id)).map((id) => beforeMap.get(id));
  const addedRecords = [...afterMap.keys()].filter((id) => !beforeMap.has(id)).map((id) => afterMap.get(id));
  const identity = possibleIdentityMatches(removedRecords, addedRecords);

  const added = addedRecords
    .filter((record) => !identity.blockedAdded.has(record[idField]))
    .map((record) => ({ entity_type: entityType, id: record[idField], name: record.name ?? record[idField] }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const removed = removedRecords
    .filter((record) => !identity.blockedRemoved.has(record[idField]))
    .map((record) => ({ entity_type: entityType, id: record[idField], name: record.name ?? record[idField] }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));

  const meaningful = new Set(config.meaningfulFields);
  const suppression = {};
  const flags = [...identity.flags];
  const updated = [];

  for (const id of [...afterMap.keys()].filter((key) => beforeMap.has(key)).sort((a, b) => a.localeCompare(b, 'en'))) {
    const before = beforeMap.get(id);
    const after = afterMap.get(id);
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((field) => field !== idField)
      .sort((a, b) => a.localeCompare(b, 'en'));
    const changes = [];

    for (const field of fields) {
      const beforePresent = Object.prototype.hasOwnProperty.call(before, field);
      const afterPresent = Object.prototype.hasOwnProperty.call(after, field);
      const beforeRaw = before[field];
      const afterRaw = after[field];
      if (jsonEqual(beforeRaw, afterRaw) && beforePresent === afterPresent) continue;

      const beforeNormal = normalizeFieldValue(field, beforeRaw, config);
      const afterNormal = normalizeFieldValue(field, afterRaw, config);
      if (jsonEqual(beforeNormal, afterNormal)) {
        const reason = isBlank(beforeRaw) && isBlank(afterRaw) && beforePresent !== afterPresent
          ? 'null_absent_equivalent'
          : (config.setFields.has(field) ? 'order_only' : 'normalised_equivalent');
        increment(suppression, reason, field);
        continue;
      }

      if (meaningful.has(field)) {
        changes.push({
          field,
          before_present: beforePresent,
          after_present: afterPresent,
          previous: beforePresent ? beforeRaw : null,
          current: afterPresent ? afterRaw : null,
        });
      } else if (config.ignoredFields.has(field)) {
        increment(suppression, 'ignored_field', field);
      } else {
        flags.push({
          type: 'unknown_field_change',
          entity_type: entityType,
          entity_id: id,
          entity_name: after.name ?? before.name ?? id,
          field,
        });
      }
    }

    if (changes.length) {
      updated.push({
        entity_type: entityType,
        id,
        name: after.name ?? before.name ?? id,
        changes,
      });
    }
  }

  return { added, removed, updated, suppression, flags };
}

export function buildPublicCandidateView(comparison) {
  return {
    added: comparison.added,
    removed: comparison.removed,
    updated: comparison.updated
      .map((item) => ({
        ...item,
        changes: item.changes.filter((change) => PROJECT_PUBLIC_CANDIDATE_FIELDS.has(change.field)),
      }))
      .filter((item) => item.changes.length > 0),
    flags: comparison.flags,
  };
}

function snapshotFile(root, release) {
  const relative = String(release.snapshot.path).replace(/^\//, '');
  return path.join(root, 'public_html', relative);
}

function readSnapshot(root, release) {
  const file = snapshotFile(root, release);
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (snapshot.project_count !== snapshot.projects?.length) {
    throw new Error(`${release.release_id}: project_count does not match projects length`);
  }
  if (Number.isInteger(snapshot.people_count) && snapshot.people_count !== snapshot.people?.length) {
    throw new Error(`${release.release_id}: people_count does not match people length`);
  }
  return snapshot;
}

function releaseProofDate(release) {
  return release.proof?.confirmation_observed?.date ?? null;
}

export function buildDryRun(root = ROOT) {
  const history = JSON.parse(fs.readFileSync(path.join(root, 'public_html/registry/index.json'), 'utf8'));
  const releases = [...history.releases].sort((a, b) => a.sequence - b.sequence);
  for (let i = 0; i < releases.length; i += 1) {
    if (releases[i].sequence !== i + 1) throw new Error(`Registry sequence gap at ${releases[i].release_id}`);
    if (i > 0 && releases[i].previous?.release_id !== releases[i - 1].release_id) {
      throw new Error(`${releases[i].release_id} does not chain to ${releases[i - 1].release_id}`);
    }
  }

  const snapshots = new Map(releases.map((release) => [release.release_id, readSnapshot(root, release)]));
  const pairs = [];
  for (let i = 1; i < releases.length; i += 1) {
    const from = releases[i - 1];
    const to = releases[i];
    const before = snapshots.get(from.release_id);
    const after = snapshots.get(to.release_id);
    const project = compareEntityCollections(before.projects, after.projects, 'project', PROJECT_CONFIG);

    let people = null;
    let peopleBaselineSuppressed = 0;
    if (to.release_id === PEOPLE_BASELINE && !Array.isArray(before.people) && Array.isArray(after.people)) {
      peopleBaselineSuppressed = after.people.length;
    } else if (Array.isArray(before.people) && Array.isArray(after.people)) {
      people = compareEntityCollections(before.people, after.people, 'person', PEOPLE_CONFIG);
    }

    pairs.push({
      from: from.release_id,
      to: to.release_id,
      to_proof_confirmation_observed: releaseProofDate(to),
      project,
      project_public_candidates: buildPublicCandidateView(project),
      people,
      people_baseline_suppressed: peopleBaselineSuppressed,
    });
  }

  return {
    schema: 'INDEX80 Sprint 3A Change Detection POC v1',
    project_baseline: PROJECT_BASELINE,
    people_baseline: PEOPLE_BASELINE,
    latest_release_id: releases.at(-1)?.release_id ?? null,
    pairs,
  };
}

function formatValue(present, value) {
  if (!present) return '*(absent)*';
  const json = JSON.stringify(value, null, 2);
  if (json.length <= 160 && !json.includes('\n')) return `\`${json.replaceAll('\\`', '\\\\`')}\``;
  return `\n\n\`\`\`json\n${json}\n\`\`\``;
}

function suppressionLines(suppression) {
  const lines = [];
  for (const reason of Object.keys(suppression).sort()) {
    for (const [field, count] of Object.entries(suppression[reason]).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      lines.push(`- ${reason}: \`${field}\` × ${count}`);
    }
  }
  return lines.length ? lines : ['- None.'];
}

function flagLines(flags) {
  if (!flags.length) return ['- None.'];
  return flags.map((flag) => {
    if (flag.type === 'identity_continuity_ambiguous') {
      const candidates = flag.candidates.map((candidate) => `\`${candidate.after_slug}\` via ${candidate.shared_signals.join(', ')}`).join('; ');
      return `- IDENTITY REVIEW: \`${flag.before_slug}\` may continue as ${candidates}. Add/remove semantics blocked pending review.`;
    }
    return `- UNKNOWN FIELD: ${flag.entity_type} \`${flag.entity_id}\` changed \`${flag.field}\`; review before classifying.`;
  });
}

function entityList(items) {
  return items.length ? items.map((item) => `- ${item.name} (\`${item.id}\`)`) : ['- None.'];
}

export function renderPublicCandidateReview(result) {
  const lines = [
    '# INDEX:80 — Sprint 3A Public Change Candidates — Dry Run',
    '',
    'Private/dev owner-review output derived from the complete Registry audit comparison.',
    '',
    'This is deliberately conservative. It is NOT an automatic news feed and does not claim that the underlying real-world event happened on the Registry release date.',
    '',
    'Included automatically: Project additions/removals and low-ambiguity factual fields such as names, official links, policy IDs, established dates and funding references/amounts.',
    '',
    'Audit-only by default: summaries, editorial notes, tags, sources, categories/taxonomy, team/founder relationships and related-project enrichment.',
    '',
  ];

  for (const pair of result.pairs) {
    const view = pair.project_public_candidates;
    lines.push(
      `## ${pair.from} → ${pair.to}`,
      '',
      `Candidates: **${view.added.length} added to INDEX:80 · ${view.removed.length} removed from public index · ${view.updated.length} factual record updates**.`,
      '',
      '### Added to INDEX:80',
      '',
      ...entityList(view.added),
      '',
      '### Removed from public index',
      '',
      ...entityList(view.removed),
      '',
      '### Factual record updates',
      '',
    );
    if (!view.updated.length) lines.push('- None.', '');
    for (const item of view.updated) {
      lines.push(`#### ${item.name} (\`${item.id}\`)`, '');
      for (const change of item.changes) {
        lines.push(
          `- **${change.field}**`,
          `  - before: ${formatValue(change.before_present, change.previous)}`,
          `  - after: ${formatValue(change.after_present, change.current)}`,
        );
      }
      lines.push('');
    }
    if (pair.people_baseline_suppressed) {
      lines.push('### People baseline', '', `- ${pair.people_baseline_suppressed} People in ${pair.to} remain baseline-only and are not candidate additions.`, '');
    }
    lines.push('### Flags / owner review', '', ...flagLines(view.flags), '');
  }

  return `${lines.join('\n')}\n`;
}

export function renderDryRun(result) {
  const lines = [
    '# INDEX:80 — Sprint 3A Registry Change Detection — Dry Run',
    '',
    'Private/dev proof-of-concept output. Generated deterministically from immutable INDEX:80 Registry snapshots.',
    '',
    '**Date rule:** any proof date shown is the date INDEX:80 observed confirmation of the Registry proof. It is not automatically the date the underlying Project or Person changed in the real world.',
    '',
    `Projects baseline: ${result.project_baseline}. People baseline: ${result.people_baseline}.`,
    '',
  ];

  for (const pair of result.pairs) {
    lines.push(`## ${pair.from} → ${pair.to}`, '');
    if (pair.to_proof_confirmation_observed) {
      lines.push(`Registry proof confirmation observed for ${pair.to}: **${pair.to_proof_confirmation_observed}**.`, '');
    }
    lines.push(
      `Projects: **${pair.project.added.length} added · ${pair.project.removed.length} removed from public index · ${pair.project.updated.length} updated**.`,
      '',
      '### Added',
      '',
      ...entityList(pair.project.added),
      '',
      '### Removed from public index',
      '',
      ...entityList(pair.project.removed),
      '',
      '### Updated',
      '',
    );
    if (!pair.project.updated.length) lines.push('- None.', '');
    for (const item of pair.project.updated) {
      lines.push(`#### ${item.name} (\`${item.id}\`)`, '');
      for (const change of item.changes) {
        lines.push(
          `- **${change.field}**`,
          `  - before: ${formatValue(change.before_present, change.previous)}`,
          `  - after: ${formatValue(change.after_present, change.current)}`,
        );
      }
      lines.push('');
    }
    lines.push('### Suppressed / noise audit', '', ...suppressionLines(pair.project.suppression), '');
    if (pair.people_baseline_suppressed) {
      lines.push(`### People baseline`, '', `- ${pair.people_baseline_suppressed} People in ${pair.to} are treated as the initial People baseline, not as additions.`, '');
    } else if (pair.people) {
      lines.push('### People', '', `- ${pair.people.added.length} added · ${pair.people.removed.length} removed · ${pair.people.updated.length} updated.`, '');
    }
    const allFlags = [...pair.project.flags, ...(pair.people?.flags ?? [])];
    lines.push('### Flags / owner review', '', ...flagLines(allFlags), '');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const result = buildDryRun(ROOT);
  const auditReport = renderDryRun(result);
  const publicReport = renderPublicCandidateReview(result);
  const writePublicIndex = process.argv.indexOf('--write-public');
  const writeIndex = process.argv.indexOf('--write');
  if (writePublicIndex >= 0) {
    const requested = process.argv[writePublicIndex + 1];
    if (!requested) throw new Error('--write-public requires a path');
    const output = path.resolve(ROOT, requested);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, publicReport, 'utf8');
    console.log(`Sprint 3A public-candidate report written: ${path.relative(ROOT, output)}`);
  } else if (writeIndex >= 0) {
    const requested = process.argv[writeIndex + 1];
    if (!requested) throw new Error('--write requires a path');
    const output = path.resolve(ROOT, requested);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, auditReport, 'utf8');
    console.log(`Sprint 3A dry-run report written: ${path.relative(ROOT, output)}`);
  } else {
    process.stdout.write(publicReport);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

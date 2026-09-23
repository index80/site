#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const PREPROD = {
  release_id: 'INDEX80-0001',
  hash: '14546a96f15632eeedba12464adc17531597a5f40181e0b72cf7a060933375d2',
  tx: 'bd2f95598b963430435e893c9896f481cc8c0299edb2ee9356f6918c37219563',
  network: 'preprod',
};

const MAINNET = {
  release_id: 'INDEX80-0002',
  sequence: 2,
  hash: 'c6fe33631f95ebf8d36e50caa9aa18051891e670ce9e89607ac03e28e4def3bc',
  tx: '9e6a2f3c6e51e6dc9f9bae8498dd8bb68ca3693e1cd1edaa68f4d03ca83dabb1',
  network: 'mainnet',
  block: 13949083,
  projects: 155,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function snapshotHash(releaseId) {
  const file = path.join(ROOT, 'public_html/registry/snapshots', `${releaseId.toLowerCase()}.json`);
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

execFileSync(process.execPath, ['scripts/generate-registry-history.mjs'], { cwd: ROOT, stdio: 'inherit' });

const historyPath = path.join(ROOT, 'public_html/registry/index.json');
const pagePath = path.join(ROOT, 'public_html/registry/index.html');
const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
const page = fs.readFileSync(pagePath, 'utf8');
const preprod = history.releases.find((entry) => entry.release_id === PREPROD.release_id);
const mainnet = history.releases.find((entry) => entry.release_id === MAINNET.release_id);

assert(history.schema === 'INDEX80 Registry History v1', 'Wrong registry history schema');

// The release sequence is derived from the immutable manifests on disk, never hard-coded: the newest
// release may be one freshly prepared and still ANCHOR_PENDING, every earlier release must be
// CONFIRMED, sequences must be contiguous from 1, and each release must chain to the one before it.
const manifestSequences = fs.readdirSync(path.join(ROOT, 'public_html/registry/releases'))
  .filter((name) => /^index80-\d+\.json$/i.test(name))
  .map((name) => Number(name.match(/-(\d+)\.json$/i)[1]))
  .sort((a, b) => a - b);
const bySequence = [...history.releases].sort((a, b) => a.sequence - b.sequence);
assert(bySequence.length === history.release_count, 'History release_count does not match its releases');
assert(JSON.stringify(bySequence.map((entry) => entry.sequence)) === JSON.stringify(manifestSequences), 'History releases do not match the release manifests on disk');
bySequence.forEach((entry, i) => {
  assert(entry.sequence === i + 1, `Release sequence gap at ${entry.release_id}`);
  assert(entry.release_id === `INDEX80-${String(entry.sequence).padStart(4, '0')}`, `Release ID does not match sequence: ${entry.release_id}`);
  if (i === 0) return;
  const before = bySequence[i - 1];
  assert(entry.previous?.release_id === before.release_id, `${entry.release_id} does not chain to ${before.release_id}`);
  assert(entry.previous?.transaction_id === before.proof?.transaction_id, `${entry.release_id} previous transaction does not match ${before.release_id}`);
});

const newest = bySequence.at(-1);
const confirmed = bySequence.filter((entry) => entry.status === 'CONFIRMED');
const latestConfirmed = confirmed.at(-1);
assert(latestConfirmed, 'No confirmed registry release');
assert(history.latest_release_id === newest.release_id, 'History latest_release_id is not the highest-sequence release');
assert(history.confirmed_count === confirmed.length, 'History confirmed_count does not match confirmed releases');
assert(bySequence.slice(0, -1).every((entry) => entry.status === 'CONFIRMED'), 'Only the newest release may be unconfirmed');
assert(['ANCHOR_PENDING', 'CONFIRMED'].includes(newest.status), `Unexpected status on newest release ${newest.release_id}: ${newest.status}`);
assert(newest === latestConfirmed || newest.sequence === latestConfirmed.sequence + 1, 'A pending release must directly follow the latest confirmed release');
assert(latestConfirmed.sequence >= MAINNET.sequence, `${MAINNET.release_id} (or a later release) must be the latest confirmed release`);
assert(snapshotHash(newest.release_id) === newest.snapshot.hash, `${newest.release_id} snapshot bytes do not match its manifest SHA-256`);

assert(preprod, 'INDEX80-0001 is missing from registry history');
assert(preprod.status === 'CONFIRMED', 'INDEX80-0001 should remain confirmed');
assert(preprod.network === PREPROD.network, 'INDEX80-0001 network changed');
assert(preprod.snapshot.hash === PREPROD.hash, 'INDEX80-0001 snapshot hash mismatch');
assert(preprod.proof.transaction_id === PREPROD.tx, 'INDEX80-0001 transaction ID mismatch');
assert(preprod.proof.metadata_label === 309, 'INDEX80-0001 metadata label mismatch');
assert(preprod.proof.proof_standard === 'CIP-190', 'INDEX80-0001 proof standard mismatch');
assert(snapshotHash(PREPROD.release_id) === PREPROD.hash, 'INDEX80-0001 snapshot bytes no longer match anchored SHA-256');

assert(mainnet, 'INDEX80-0002 is missing from registry history');
assert(mainnet.status === 'CONFIRMED', 'INDEX80-0002 should be confirmed');
assert(mainnet.network === MAINNET.network, 'INDEX80-0002 must be Mainnet');
assert(mainnet.snapshot.project_count === MAINNET.projects, 'INDEX80-0002 project count mismatch');
assert(mainnet.snapshot.hash === MAINNET.hash, 'INDEX80-0002 snapshot hash mismatch');
assert(mainnet.proof.transaction_id === MAINNET.tx, 'INDEX80-0002 transaction ID mismatch');
assert(mainnet.proof.block === MAINNET.block, 'INDEX80-0002 block mismatch');
assert(mainnet.proof.fee_lovelace === '172893', 'INDEX80-0002 fee mismatch');
assert(mainnet.proof.metadata_label === 309, 'INDEX80-0002 metadata label mismatch');
assert(mainnet.proof.proof_standard === 'CIP-190', 'INDEX80-0002 proof standard mismatch');
assert(snapshotHash(MAINNET.release_id) === MAINNET.hash, 'INDEX80-0002 snapshot bytes no longer match anchored SHA-256');

assert(page.includes('VERIFIED ON CARDANO MAINNET'), 'Human page is missing Mainnet verified status');
assert(page.includes(MAINNET.tx), 'Human page is missing INDEX80-0002 transaction ID');
assert(page.includes(latestConfirmed.proof.transaction_id), `Human page is missing latest confirmed ${latestConfirmed.release_id} transaction ID`);
assert(page.includes(PREPROD.tx), 'Human page is missing INDEX80-0001 transaction ID in release history');
assert(page.includes('/registry/index.json'), 'Human page is missing machine-readable history link');
// The page links the snapshot of the newest release, whether confirmed or freshly prepared.
assert(page.includes(`/registry/snapshots/${newest.release_id.toLowerCase()}.json`), `Human page is missing ${newest.release_id} snapshot link`);

console.log(`Registry provenance tests passed: ${bySequence.length} releases chain in sequence; latest confirmed ${latestConfirmed.release_id}; newest ${newest.release_id} (${newest.status}); pinned INDEX80-0001/0002 proofs agree with immutable snapshots.`);

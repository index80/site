#!/usr/bin/env node
/**
 * Offline Registry integrity test. Proves the publicly served Registry layer still verifies:
 * snapshot bytes -> SHA-256 -> receipt -> proof CBOR (the value Cardano committed) -> manifests.
 * Also proves the only difference between original and public manifests is the private `source`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(ROOT, 'public_html/registry');
const PRIV = path.join(ROOT, 'registry-private/releases');
const PINNED = {
  '0001': { hash: '14546a96f15632eeedba12464adc17531597a5f40181e0b72cf7a060933375d2', tx: 'bd2f95598b963430435e893c9896f481cc8c0299edb2ee9356f6918c37219563', network: 'preprod' },
  '0002': { hash: 'c6fe33631f95ebf8d36e50caa9aa18051891e670ce9e89607ac03e28e4def3bc', tx: '9e6a2f3c6e51e6dc9f9bae8498dd8bb68ca3693e1cd1edaa68f4d03ca83dabb1', network: 'mainnet' },
  '0003': { hash: '51146bc27168293fc0262f606f05bea1bc72562407ad7df2cb62e417731965a8', tx: '4e49332fafb2a94d8660da75b16cc0cbd2ef8e79320896148e15bdce7fa72067', network: 'mainnet' },
  '0004': { hash: 'd4d316bf8961ce7fe3253c9d613bc1adf02c8071c1094c11fa82e31fdcc9bb2b', tx: '4226bc80f1a94e65a8b8a010a51530f60329af643f2375b9c15d4ebdd771b36d', network: 'mainnet' },
  '0005': { hash: '9aff0fa659748fde0a4e746e594172765c91e766eea1cdca5cd9b1f98393a93d', tx: '86bc6b154421045c22e63d6aa83eb3ef7e2371cf8be07161bad0b2aece9d8bac', network: 'mainnet' },
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
// The public source repository ships without the private originals (marker written by the export).
const PUBLIC_REPO = fs.existsSync(path.join(ROOT, '.public-repo')) && !fs.existsSync(PRIV);
function assert(c, m) { if (!c) throw new Error(m); }

const history = readJson(path.join(REG, 'index.json'));
for (const [n, pin] of Object.entries(PINNED)) {
  const name = `index80-${n}.json`;
  const snapshotBytes = fs.readFileSync(path.join(REG, 'snapshots', name));
  const sha = crypto.createHash('sha256').update(snapshotBytes).digest('hex');
  const receipt = readJson(path.join(REG, 'receipts', name));
  const publicRelease = readJson(path.join(REG, 'releases', name));
  const original = PUBLIC_REPO ? null : readJson(path.join(PRIV, name));

  assert(sha === pin.hash, `${n}: snapshot SHA-256 differs from the pinned/anchored value`);
  assert(snapshotBytes.length === publicRelease.snapshot.bytes, `${n}: snapshot byte length mismatch`);
  assert(receipt.snapshot_hash === sha, `${n}: receipt.snapshot_hash does not match snapshot`);
  assert(publicRelease.snapshot.hash === sha, `${n}: public manifest hash does not match snapshot`);
  if (original) assert(original.snapshot.hash === sha, `${n}: private original manifest hash does not match snapshot`);
  assert(receipt.transaction_id === pin.tx, `${n}: transaction ID changed`);
  assert(receipt.network === pin.network && publicRelease.cardano.network === pin.network, `${n}: network changed`);
  assert(receipt.status === 'CONFIRMED', `${n}: receipt no longer CONFIRMED`);
  // CIP-190 proof CBOR: {"v":1,"items":[{"hashes":{"sha2-256":h'<hash>'}}]} — ends with 5820 + hash.
  assert(receipt.proof_cbor_hex.endsWith(`5820${sha}`), `${n}: proof CBOR does not commit to the snapshot hash`);

  assert(!('source' in publicRelease), `${n}: public manifest still carries source`);
  if (original) {
    const { source, ...originalWithoutSource } = original;
    assert(source && typeof source === 'object', `${n}: private original lost its source object`);
    assert(JSON.stringify(publicRelease) === JSON.stringify(originalWithoutSource), `${n}: public manifest differs from original by more than the source object`);
  }

  const entry = history.releases.find((r) => r.release_id === publicRelease.release_id);
  assert(entry, `${n}: missing from history`);
  assert(entry.snapshot.hash === sha && entry.proof.transaction_id === pin.tx, `${n}: history entry disagrees with proof`);
  assert(!('source' in entry), `${n}: history entry still carries source`);
}
assert(readJson(path.join(REG, 'releases/index80-0002.json')).previous.transaction_id === PINNED['0001'].tx, 'INDEX80-0002 no longer chains to INDEX80-0001');
// Any release whose manifest declares People (snapshot v2, INDEX80-0004 onward) must agree with its snapshot bytes.
for (const name of fs.readdirSync(path.join(REG, 'releases')).filter((n) => /^index80-\d+\.json$/i.test(n))) {
  const rel = readJson(path.join(REG, 'releases', name));
  const seq = Number(name.match(/-(\d+)\.json$/i)[1]);
  assert(seq < 4 || rel.snapshot.people_count !== undefined, `${name}: releases from INDEX80-0004 must be Projects + People (snapshot v2)`);
  assert(seq >= 4 || rel.snapshot.people_count === undefined, `${name}: historic release must remain snapshot v1`);
  if (rel.snapshot.people_count === undefined) continue;
  const snap = readJson(path.join(REG, 'snapshots', name));
  assert(rel.snapshot.schema === 'INDEX80 Registry Snapshot v2' && snap.schema === rel.snapshot.schema, `${name}: snapshot schema mismatch`);
  assert(Array.isArray(snap.people) && snap.people.length === rel.snapshot.people_count && snap.people_count === rel.snapshot.people_count, `${name}: people count mismatch`);
  assert(Array.isArray(snap.projects) && snap.projects.length === rel.snapshot.project_count && snap.project_count === rel.snapshot.project_count, `${name}: project count mismatch`);
  const slugs = snap.people.map((p) => p.slug);
  assert(new Set(slugs).size === slugs.length && JSON.stringify(slugs) === JSON.stringify([...slugs].sort()), `${name}: people not unique/sorted`);
  assert(!('source' in rel), `${name}: public manifest carries source`);
}
console.log(`[test-registry-integrity] PASS: snapshot hashes, receipts, proof CBOR, transaction IDs and chaining verified${PUBLIC_REPO ? '' : '; public manifests differ from private originals only by the removed source object'}.`);

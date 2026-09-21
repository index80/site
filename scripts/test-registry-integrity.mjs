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
console.log(`[test-registry-integrity] PASS: snapshot hashes, receipts, proof CBOR, transaction IDs and chaining verified${PUBLIC_REPO ? '' : '; public manifests differ from private originals only by the removed source object'}.`);

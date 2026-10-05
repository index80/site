#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createSnapshotBase, finaliseSnapshot } from './lib/cardano-refresh-policy.mjs';

const previous = {
  generated_at: '2026-09-13T09:55:00Z',
  market: { ada_price_usd: 0.21 },
  network: { epoch: 500 },
  minswap: { assets: [{ ticker: 'OLD' }] },
};

const failed = createSnapshotBase(previous);
assert.deepEqual(failed.market, {}, 'failed refresh base must not carry old market values');
assert.deepEqual(failed.network, {}, 'failed refresh base must not carry old network values');
assert.deepEqual(failed.minswap.assets, [], 'failed refresh base must not carry old token rows');
finaliseSnapshot(failed, previous, 0, '2026-10-04T20:00:00Z');
assert.equal(failed.generated_at, previous.generated_at, 'zero-observation refresh must not advance generated_at');
assert.equal(failed.status, 'stale_snapshot');

const partial = createSnapshotBase(previous);
partial.market.ada_price_usd = 0.42;
finaliseSnapshot(partial, previous, 1, '2026-10-04T20:00:00Z');
assert.equal(partial.generated_at, '2026-10-04T20:00:00Z', 'fresh observation must advance generated_at');
assert.equal(partial.status, 'public_snapshot');
assert.equal(partial.market.ada_price_usd, 0.42);
assert.equal(partial.network.epoch, undefined, 'partial refresh must not retain stale network fields');

console.log('[test-cardano-refresh-policy] PASS — failed refreshes cannot launder carried-forward values.');

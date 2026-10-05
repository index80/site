#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_URL = pathToFileURL(join(ROOT, 'scripts', 'update-cardano-snapshot.mjs')).href;
const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;

const previous = {
  schema_version: '0.2',
  generated_at: '2026-09-13T09:55:00Z',
  status: 'public_snapshot',
  market: {
    ada_price_usd: 0.21,
    defi_tvl_usd: 123456789,
  },
  network: {
    epoch: 500,
    block_height: 12345,
  },
  minswap: {
    as_of: '2026-09-13T09:55:00Z',
    assets: [{ name: 'Old Token', ticker: 'OLD' }],
  },
  sources: [
    { name: 'CoinGecko', last_success_at: '2026-09-13T09:55:00Z' },
    { name: 'DefiLlama', last_success_at: '2026-09-13T09:55:00Z' },
    { name: 'Koios', last_success_at: '2026-09-13T09:55:00Z' },
    { name: 'Minswap', last_success_at: '2026-09-13T09:55:00Z' },
  ],
};

async function runScenario(name, fetchImpl) {
  const dir = await mkdtemp(join(tmpdir(), `index80-refresh-${name}-`));
  const outDir = join(dir, 'public_html', 'data');
  const outFile = join(outDir, 'cardano-snapshot.json');
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(previous, null, 2) + '\n', 'utf8');

  try {
    process.chdir(dir);
    globalThis.fetch = fetchImpl;
    await import(`${SCRIPT_URL}?trust=${encodeURIComponent(name)}-${Date.now()}-${Math.random()}`);
    return JSON.parse(await readFile(outFile, 'utf8'));
  } finally {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
}

const failingFetch = async () => {
  throw new Error('offline');
};

const failed = await runScenario('all-fail', failingFetch);
assert.equal(failed.generated_at, previous.generated_at, 'all-failed refresh must not advance generated_at');
assert.equal(failed.status, 'stale_snapshot');
assert.equal(failed.market.ada_price_usd, undefined, 'all-failed refresh must not carry previous ADA price');
assert.equal(failed.market.defi_tvl_usd, undefined, 'all-failed refresh must not carry previous DeFi TVL');
assert.equal(failed.network.epoch, undefined, 'all-failed refresh must not carry previous epoch');
assert.equal(failed.network.block_height, undefined, 'all-failed refresh must not carry previous block height');
assert.deepEqual(failed.minswap?.assets || [], [], 'all-failed refresh must not carry previous token rows');

const partial = await runScenario('price-only', async (url) => {
  if (new URL(String(url)).hostname === 'api.coingecko.com') {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        cardano: {
          usd: 0.42,
          usd_24h_change: 1.5,
          usd_market_cap: 15000000000,
          last_updated_at: Math.floor(Date.now() / 1000),
        },
      }),
    };
  }
  throw new Error('offline');
});

assert.notEqual(partial.generated_at, previous.generated_at, 'a genuinely fresh observation should advance generated_at');
assert.equal(partial.status, 'public_snapshot');
assert.equal(partial.market.ada_price_usd, 0.42);
assert.equal(partial.market.defi_tvl_usd, undefined, 'failed market groups must not retain previous values');
assert.deepEqual(partial.network, {}, 'failed network group must remain empty');
assert.deepEqual(partial.minswap?.assets || [], [], 'failed Minswap refresh must remain empty');

console.log('[test-cardano-refresh-script] PASS — real refresh script cannot re-date or carry forward failed-source values.');

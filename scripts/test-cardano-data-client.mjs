#!/usr/bin/env node
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const policyCode = readFileSync(join(ROOT, 'public_html/assets/js/cardano-snapshot-policy.js'), 'utf8');
const clientCode = readFileSync(join(ROOT, 'public_html/assets/js/cardano-data-live.js'), 'utf8');

const FIELD_SOURCES = {
  'market.ada_price_usd': 'CoinGecko',
  'market.ada_change_24h_pct': 'CoinGecko',
  'market.defi_tvl_usd': 'DefiLlama',
  'market.dex_volume_24h_usd': 'DefiLlama',
  'market.stablecoin_mcap_usd': 'DefiLlama',
  'market.ada_market_cap_usd': 'CoinGecko',
  'network.epoch': 'Koios',
  'network.block_height': 'Koios',
  'network.active_stake_ada': 'Koios',
  'network.epoch_tx_count': 'Koios',
  'network.latest_block_time': 'Koios',
  'minswap.assets': 'Minswap',
};

function provenanceAt(iso, stale = false) {
  return Object.fromEntries(
    Object.entries(FIELD_SOURCES).map(([key, source]) => [
      key,
      { source, observed_at: iso, stale },
    ])
  );
}

function snapshotAt(iso, overrides = {}) {
  return {
    schema_version: '0.3',
    generated_at: iso,
    market: {
      ada_price_usd: 0.42,
      ada_change_24h_pct: 1.2,
      defi_tvl_usd: 1000000,
      dex_volume_24h_usd: 200000,
      stablecoin_mcap_usd: 300000,
      ada_market_cap_usd: 15000000000,
      ...(overrides.market || {}),
    },
    network: {
      epoch: 600,
      block_height: 123456,
      active_stake_ada: 1000000,
      epoch_tx_count: 1234,
      latest_block_time: iso,
      ...(overrides.network || {}),
    },
    minswap: {
      observed_at: iso,
      assets: [{
        name: 'Fresh Token',
        ticker: 'FRESH',
        price_ada: 1,
        price_change_24h_pct: 1,
        volume_24h_ada: 1000,
        liquidity_ada: 2000,
        market_cap_ada: 3000,
      }],
      ...(overrides.minswap || {}),
    },
    provenance: overrides.provenance === undefined ? provenanceAt(iso) : overrides.provenance,
    sources: overrides.sources || [
      { name: 'Koios', purpose: 'Chain data', status: 'LIVE', coverage: '1/1', observed_at: iso, url: 'https://koios.rest/' },
    ],
  };
}

function responseFor(value) {
  if (value instanceof Error) throw value;
  if (value && value.ok === false) {
    return { ok: false, status: value.status || 500, statusText: value.statusText || 'Error', json: async () => ({}) };
  }
  return { ok: true, status: 200, statusText: 'OK', json: async () => value };
}

function makeElement(initial = '') {
  return { innerHTML: initial, textContent: initial };
}

function visibleDump(elements) {
  return [...elements.values()]
    .map((element) => `${element.innerHTML || ''}\n${element.textContent || ''}`)
    .join('\n');
}

async function runScenario({ primary, fallback }) {
  const ecosystemText = 'ACTIVE PROJECTS 216 PEOPLE 155 GOVERNANCE RECORDS 9 ARCHIVED RECORDS 2';
  const elements = new Map([
    ['#cardano-data-status', makeElement('INDEX:80 STATIC SNAPSHOT')],
    ['#cardano-market-metrics', makeElement('STATIC MARKET')],
    ['#cardano-network-metrics', makeElement('STATIC NETWORK')],
    ['#cardano-ecosystem-metrics', makeElement(ecosystemText)],
    ['#cardano-market-table-body', makeElement('STATIC TABLE')],
    ['#cardano-market-caption', makeElement('STATIC CAPTION')],
    ['#cardano-data-sources', makeElement('INDEX:80 Registry STATIC SOURCES')],
  ]);

  const warnings = [];
  const requests = [];
  const context = vm.createContext({
    self: {},
    window: {},
    document: {
      body: { dataset: { mode: 'data' } },
      head: { appendChild() {} },
      createElement() { return { textContent: '' }; },
      querySelector(sel) { return elements.get(sel) || null; },
    },
    fetch: async (url) => {
      const key = String(url);
      requests.push(key);
      if (key === 'https://data.index80.com/cardano.json') return responseFor(primary);
      if (key === '/data/cardano-snapshot.json') return responseFor(fallback);
      throw new Error('unexpected fetch ' + key);
    },
    console: { warn: (...args) => warnings.push(args.join(' ')), log() {}, error() {} },
    setTimeout,
    clearTimeout,
    AbortController,
    Intl,
    URL,
    Date,
  });
  context.window = context;
  context.self = context;

  vm.runInContext(policyCode, context, { filename: 'cardano-snapshot-policy.js' });
  vm.runInContext(clientCode, context, { filename: 'cardano-data-live.js' });

  await new Promise((resolve) => setTimeout(resolve, 30));
  return { elements, warnings, requests, ecosystemText };
}

const now = Date.now();
const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
const currentFallback = () => snapshotAt(iso(-5 * 60 * 1000), { provenance: null });

// Fresh primary renders and preserves the complete static INDEX:80 trust floor and provenance.
{
  const result = await runScenario({
    primary: snapshotAt(iso(-10 * 60 * 1000)),
    fallback: currentFallback(),
  });
  assert.match(result.elements.get('#cardano-data-status').innerHTML, /LIVE PUBLIC DATA/);
  assert.notEqual(result.elements.get('#cardano-market-metrics').innerHTML, 'STATIC MARKET');
  assert.equal(result.elements.get('#cardano-ecosystem-metrics').innerHTML, result.ecosystemText);
  assert.equal(result.elements.get('#cardano-ecosystem-metrics').textContent, result.ecosystemText);
  assert.match(result.elements.get('#cardano-data-sources').innerHTML, /INDEX:80 Registry/);
  assert.deepEqual(result.requests, ['https://data.index80.com/cardano.json']);
}

// Delayed-but-displayable primary is labelled delayed.
{
  const delayed = iso(-60 * 60 * 1000);
  const result = await runScenario({
    primary: snapshotAt(delayed),
    fallback: currentFallback(),
  });
  assert.match(result.elements.get('#cardano-data-status').innerHTML, /DELAYED PUBLIC DATA/);
}

// A fresh snapshot must not launder seven-day-old carried-forward fields.
{
  const fresh = iso(-2 * 60 * 1000);
  const old = iso(-7 * 24 * 60 * 60 * 1000);
  const provenance = provenanceAt(fresh);
  for (const key of [
    'market.defi_tvl_usd',
    'network.epoch',
    'network.block_height',
    'network.active_stake_ada',
    'network.epoch_tx_count',
    'network.latest_block_time',
    'minswap.assets',
  ]) {
    provenance[key] = { source: FIELD_SOURCES[key], observed_at: old, stale: true };
  }

  const result = await runScenario({
    primary: snapshotAt(fresh, {
      market: { defi_tvl_usd: 99000000 },
      network: {
        epoch: 650,
        block_height: 13900000,
        active_stake_ada: 999999999,
        epoch_tx_count: 999999,
        latest_block_time: old,
      },
      minswap: {
        observed_at: old,
        assets: [{
          name: 'Snek',
          ticker: 'SNEK',
          price_ada: 9,
          price_change_24h_pct: 9,
          volume_24h_ada: 999999,
          liquidity_ada: 999999,
          market_cap_ada: 999999,
        }],
      },
      provenance,
    }),
    fallback: currentFallback(),
  });

  const visible = visibleDump(result.elements);
  assert.match(result.elements.get('#cardano-data-status').innerHTML, /PARTIAL PUBLIC DATA/);
  assert.doesNotMatch(result.elements.get('#cardano-market-metrics').innerHTML, /\$99M/);
  assert.doesNotMatch(result.elements.get('#cardano-network-metrics').innerHTML, />650<|13,900,000|999,999,999/);
  assert.doesNotMatch(result.elements.get('#cardano-market-table-body').innerHTML, /Snek|SNEK/);
  assert.match(visible, /UNAVAILABLE/);
  assert.equal(result.elements.get('#cardano-ecosystem-metrics').innerHTML, result.ecosystemText);
  assert.equal(result.elements.get('#cardano-ecosystem-metrics').textContent, result.ecosystemText);
}

// Carried-forward data that is still inside the display window may render, but must say STALE.
{
  const fresh = iso(-2 * 60 * 1000);
  const recent = iso(-60 * 60 * 1000);
  const provenance = provenanceAt(fresh);
  provenance['market.defi_tvl_usd'] = { source: 'DefiLlama', observed_at: recent, stale: true };
  const result = await runScenario({
    primary: snapshotAt(fresh, { market: { defi_tvl_usd: 99000000 }, provenance }),
    fallback: currentFallback(),
  });
  assert.match(result.elements.get('#cardano-market-metrics').innerHTML, /\$99M/);
  assert.match(result.elements.get('#cardano-market-metrics').innerHTML, /DEFILLAMA · STALE/);
  assert.match(result.elements.get('#cardano-data-status').innerHTML, /PARTIAL PUBLIC DATA/);
}

// Expired primary and expired fallback must leave all static panels untouched.
{
  const expired = iso(-3 * 60 * 60 * 1000);
  const result = await runScenario({
    primary: snapshotAt(expired),
    fallback: snapshotAt(expired, { provenance: null }),
  });
  assert.match(result.elements.get('#cardano-data-status').innerHTML, /LIVE DATA UNAVAILABLE/);
  assert.equal(result.elements.get('#cardano-market-metrics').innerHTML, 'STATIC MARKET');
  assert.equal(result.elements.get('#cardano-network-metrics').innerHTML, 'STATIC NETWORK');
  assert.equal(result.elements.get('#cardano-ecosystem-metrics').innerHTML, result.ecosystemText);
  assert.equal(result.elements.get('#cardano-ecosystem-metrics').textContent, result.ecosystemText);
}

// Materially future primary is rejected; a current fallback may be used.
{
  const result = await runScenario({
    primary: snapshotAt(iso(30 * 60 * 1000)),
    fallback: currentFallback(),
  });
  assert.match(result.elements.get('#cardano-data-status').innerHTML, /FALLBACK SNAPSHOT/);
}

// A fallback with a fresh top-level timestamp cannot display an old Minswap observation.
{
  const fresh = iso(-5 * 60 * 1000);
  const old = iso(-7 * 24 * 60 * 60 * 1000);
  const result = await runScenario({
    primary: new Error('primary unavailable'),
    fallback: snapshotAt(fresh, {
      provenance: null,
      minswap: {
        observed_at: old,
        assets: [{ name: 'Old Token', ticker: 'OLD', price_ada: 9 }],
      },
    }),
  });
  assert.match(result.elements.get('#cardano-data-status').innerHTML, /FALLBACK SNAPSHOT/);
  assert.doesNotMatch(result.elements.get('#cardano-market-table-body').innerHTML, /Old Token|OLD/);
}

// Invalid shapes and transport errors never expose raw details anywhere in the visible document.
{
  const result = await runScenario({
    primary: new Error('503 upstream exploded SECRET_URL'),
    fallback: { generated_at: iso(-5 * 60 * 1000), market: {} },
  });
  const visible = visibleDump(result.elements);
  assert.match(result.elements.get('#cardano-data-status').innerHTML, /LIVE DATA UNAVAILABLE/);
  assert.doesNotMatch(visible, /503|exploded|upstream|SECRET_URL|Error/);
  assert.equal(result.elements.get('#cardano-ecosystem-metrics').innerHTML, result.ecosystemText);
  assert.equal(result.elements.get('#cardano-ecosystem-metrics').textContent, result.ecosystemText);
}

// Only the intended live endpoint and same-origin fallback may ever be fetched by this client.
{
  const result = await runScenario({
    primary: new Error('offline'),
    fallback: currentFallback(),
  });
  assert.deepEqual(result.requests, [
    'https://data.index80.com/cardano.json',
    '/data/cardano-snapshot.json',
  ]);
}

// Policy rejects expired/future snapshots and expired field observations.
{
  const context = vm.createContext({ self: {}, window: {}, Date });
  context.window = context;
  context.self = context;
  vm.runInContext(policyCode, context);
  const policy = context.INDEX80SnapshotPolicy;
  assert.equal(policy.validateSnapshot(snapshotAt(iso(-3 * 60 * 60 * 1000)), now).reason, 'expired');
  assert.equal(policy.validateSnapshot(snapshotAt(iso(30 * 60 * 1000)), now).reason, 'future');
  assert.equal(policy.validateSnapshot(snapshotAt(iso(-10 * 60 * 1000)), now).ok, true);
  assert.equal(policy.validateObservation({ observed_at: iso(-7 * 24 * 60 * 60 * 1000), stale: true }, now).reason, 'expired');
  assert.equal(policy.validateObservation({ observed_at: iso(-60 * 60 * 1000), stale: true }, now).stale, true);
}

console.log('[test-cardano-data-client] PASS — snapshot and per-field freshness, safe failures, fetch boundaries and static-floor preservation verified.');

import fs from 'node:fs/promises';
import path from 'node:path';
import { createSnapshotBase, finaliseSnapshot } from './lib/cardano-refresh-policy.mjs';

const OUT = path.resolve('public_html/data/cardano-snapshot.json');
const TIMEOUT_MS = 18000;
const STABLE_TICKERS = new Set(['USDM','USDC','USDCX','USDT','DJED','IUSD','USDA','MYUSD']);

async function readPrevious() {
  try { return JSON.parse(await fs.readFile(OUT, 'utf8')); }
  catch { return {}; }
}

async function getJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { accept: 'application/json', ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const positiveNum = (v) => {
  const x = num(v);
  return x !== null && x > 0 ? x : null;
};
const keep = (fresh, old) => fresh ?? old ?? null;

function source(name, url, purpose, successCount, expectedCount, previous) {
  let status = 'UNAVAILABLE';
  if (successCount >= expectedCount && expectedCount > 0) status = 'LIVE';
  else if (successCount > 0) status = 'PARTIAL';
  else if (previous?.last_success_at) status = 'STALE';
  return {
    name,
    url,
    purpose,
    status,
    coverage: `${successCount}/${expectedCount}`,
    last_success_at: successCount > 0 ? new Date().toISOString() : (previous?.last_success_at || null),
  };
}

const previous = await readPrevious();
const previousSources = new Map((previous.sources || []).map((s) => [s.name, s]));
const refreshedAt = new Date().toISOString();
const next = createSnapshotBase(previous);

let totalFreshObservations = 0;
let successes = 0;
try {
  const cg = await getJson('https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd&include_market_cap=true&include_24hr_change=true&include_last_updated_at=true');
  const row = cg?.cardano || {};
  const price = positiveNum(row.usd);
  if (price !== null) {
    next.market.ada_price_usd = price;
    next.market.ada_change_24h_pct = keep(num(row.usd_24h_change), next.market.ada_change_24h_pct);
    next.market.ada_market_cap_usd = keep(positiveNum(row.usd_market_cap), next.market.ada_market_cap_usd);
    next.market.ada_price_updated_at = row.last_updated_at
      ? new Date(Number(row.last_updated_at) * 1000).toISOString()
      : new Date().toISOString();
    successes = 1;
  }
} catch (err) {
  console.warn('CoinGecko:', err.message);
}
totalFreshObservations += successes;
next.sources.push(source(
  'CoinGecko',
  'https://www.coingecko.com/en/coins/cardano',
  'ADA USD price, market cap and 24h change.',
  successes,
  1,
  previousSources.get('CoinGecko'),
));

successes = 0;
try {
  const chains = await getJson('https://api.llama.fi/v2/chains');
  const cardano = Array.isArray(chains)
    ? chains.find((r) => String(r.name || '').toLowerCase() === 'cardano')
    : null;
  const tvl = positiveNum(cardano?.tvl);
  if (tvl !== null) {
    next.market.defi_tvl_usd = tvl;
    successes += 1;
  }
} catch (err) {
  console.warn('DefiLlama TVL:', err.message);
}

try {
  const dex = await getJson('https://api.llama.fi/overview/dexs/Cardano?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume');
  const volume = positiveNum(dex?.total24h);
  if (volume !== null) {
    next.market.dex_volume_24h_usd = volume;
    successes += 1;
  }
} catch (err) {
  console.warn('DefiLlama DEX:', err.message);
}

try {
  const stables = await getJson('https://stablecoins.llama.fi/stablecoincharts/Cardano');
  const last = Array.isArray(stables) && stables.length ? stables[stables.length - 1] : null;
  const pegged = last?.totalCirculatingUSD?.peggedUSD
    ?? last?.totalCirculating?.peggedUSD
    ?? last?.totalCirculatingUSD
    ?? null;
  const stablecoinMcap = positiveNum(pegged);
  if (stablecoinMcap !== null) {
    next.market.stablecoin_mcap_usd = stablecoinMcap;
    successes += 1;
  }
} catch (err) {
  console.warn('DefiLlama stables:', err.message);
}

totalFreshObservations += successes;
next.sources.push(source(
  'DefiLlama',
  'https://defillama.com/chain/cardano',
  'Cardano DeFi TVL, DEX volume and stablecoin market context.',
  successes,
  3,
  previousSources.get('DefiLlama'),
));

successes = 0;
try {
  const tipRows = await getJson('https://api.koios.rest/api/v1/tip');
  const tip = Array.isArray(tipRows) ? tipRows[0] : null;
  const epoch = num(tip?.epoch_no);
  if (epoch !== null) {
    next.network.epoch = epoch;
    next.network.block_height = keep(num(tip?.block_no ?? tip?.block_height), next.network.block_height);
    next.network.latest_block_time = tip?.block_time
      ? new Date(Number(tip.block_time) * 1000).toISOString()
      : next.network.latest_block_time;
    successes += 1;

    try {
      const epochRows = await getJson(`https://api.koios.rest/api/v1/epoch_info?_epoch_no=${encodeURIComponent(epoch)}`);
      const e = Array.isArray(epochRows) ? epochRows[0] : null;
      const activeStake = positiveNum(e?.active_stake);
      if (activeStake !== null) next.network.active_stake_ada = activeStake / 1e6;
      next.network.epoch_tx_count = keep(num(e?.tx_count), next.network.epoch_tx_count);
      if (e) successes += 1;
    } catch (err) {
      console.warn('Koios epoch info:', err.message);
    }
  }
} catch (err) {
  console.warn('Koios tip:', err.message);
}
totalFreshObservations += successes;
next.sources.push(source(
  'Koios',
  'https://koios.rest/',
  'Cardano chain tip, epoch number, epoch transactions and active-stake snapshot.',
  successes,
  2,
  previousSources.get('Koios'),
));

successes = 0;
try {
  const mins = await getJson('https://api-mainnet-prod.minswap.org/v1/assets/metrics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      term: '',
      limit: 100,
      only_verified: true,
      sort_direction: 'desc',
      sort_field: 'volume_24h',
    }),
  });
  const rows = Array.isArray(mins?.asset_metrics) ? mins.asset_metrics : [];
  const assets = rows
    .map((r) => {
      const meta = r?.asset?.metadata || {};
      const ticker = String(meta.ticker || meta.name || '').trim();
      return {
        name: meta.name || ticker || 'Unknown',
        ticker,
        asset_id: `${r?.asset?.currency_symbol || ''}.${r?.asset?.token_name || ''}`,
        price_ada: positiveNum(r?.price),
        price_change_24h_pct: num(r?.price_change_24h),
        volume_24h_ada: num(r?.volume_24h),
        liquidity_ada: positiveNum(r?.liquidity),
        market_cap_ada: positiveNum(r?.market_cap),
        categories: Array.isArray(r?.categories) ? r.categories : [],
      };
    })
    .filter((r) => r.ticker && r.ticker.toUpperCase() !== 'ADA')
    .filter((r) => !STABLE_TICKERS.has(r.ticker.toUpperCase()))
    .filter((r) => !(r.categories || []).some((c) => String(c).toLowerCase().includes('stable')))
    .filter((r) => (r.liquidity_ada || 0) >= 10000)
    .sort((a, b) => (b.volume_24h_ada || 0) - (a.volume_24h_ada || 0))
    .slice(0, 10);

  if (assets.length) {
    next.minswap = { as_of: new Date().toISOString(), assets };
    successes = 1;
  }
} catch (err) {
  console.warn('Minswap:', err.message);
}
totalFreshObservations += successes;
next.sources.push(source(
  'Minswap',
  'https://minswap.org/',
  'Verified Cardano-native asset price, volume and liquidity metrics.',
  successes,
  1,
  previousSources.get('Minswap'),
));

// The seeded activity figures are cleared on the first automated refresh until
// a stable, documented public endpoint is selected for these specific metrics.
next.market.active_addresses_24h = null;
next.market.transactions_24h = null;

finaliseSnapshot(next, previous, totalFreshObservations, refreshedAt);

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(next, null, 2) + '\n', 'utf8');
console.log(`Wrote ${OUT}`);

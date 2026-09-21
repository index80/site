import fs from 'node:fs/promises';

const FILE = new URL('../public_html/data/cardano-snapshot.json', import.meta.url);
const snapshot = JSON.parse(await fs.readFile(FILE, 'utf8'));
const errors = [];

const forbiddenKeys = new Set([
  'wallet','wallets','held','held_quantity','quantity','balance','balances',
  'email','recipient','stake_address','staking_address','payment_address',
  'private_key','privatekey','seed','mnemonic','api_key','apikey','secret','notes'
]);

function walk(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(String(key).toLowerCase())) {
      errors.push(`${path}.${key}: forbidden private/personal field`);
    }
    walk(child, `${path}.${key}`);
  }
}
walk(snapshot);

if (!snapshot.schema_version) errors.push('schema_version missing');
if (!snapshot.generated_at || Number.isNaN(Date.parse(snapshot.generated_at))) {
  errors.push('generated_at missing or invalid');
}

const assets = snapshot?.minswap?.assets;
if (!Array.isArray(assets)) {
  errors.push('minswap.assets must be an array');
} else {
  if (assets.length > 25) errors.push(`minswap.assets has ${assets.length} rows; public cap is 25`);
  const allowed = new Set([
    'name','ticker','asset_id','price_ada','price_change_24h_pct',
    'volume_24h_ada','liquidity_ada','market_cap_ada','categories','project_slug'
  ]);
  assets.forEach((asset, i) => {
    for (const key of Object.keys(asset || {})) {
      if (!allowed.has(key)) errors.push(`minswap.assets[${i}].${key}: unexpected public field`);
    }
    if (!asset?.ticker) errors.push(`minswap.assets[${i}]: ticker missing`);
    for (const key of ['price_ada','volume_24h_ada','liquidity_ada','market_cap_ada']) {
      const value = asset?.[key];
      if (value !== null && value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        errors.push(`minswap.assets[${i}].${key}: invalid numeric value`);
      }
    }
    if (asset?.market_cap_ada === 0) {
      errors.push(`minswap.assets[${i}].market_cap_ada: use null for unavailable market cap, never 0`);
    }
  });
}

const market = snapshot.market || {};
for (const key of ['ada_price_usd','ada_market_cap_usd','defi_tvl_usd','dex_volume_24h_usd','stablecoin_mcap_usd']) {
  const value = market[key];
  if (value !== null && value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
    errors.push(`market.${key}: invalid numeric value`);
  }
}

for (const source of snapshot.sources || []) {
  if (!source?.name) errors.push('source without name');
  if (source?.url && !String(source.url).startsWith('https://')) errors.push(`${source.name || 'source'}: source URL must use https`);
}

if (errors.length) {
  console.error('Cardano public snapshot validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Cardano public snapshot validation passed (${assets?.length || 0} market rows, no private fields).`);

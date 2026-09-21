#!/usr/bin/env node
/**
 * Manual (network) check: confirms on Cardano, via Koios, that label 309 of each anchoring
 * transaction commits to the snapshot hash served by this site. Not part of CI.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REG = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public_html/registry');
const KOIOS = { mainnet: 'https://api.koios.rest', preprod: 'https://preprod.koios.rest' };
let failed = false;
for (const name of fs.readdirSync(path.join(REG, 'receipts')).filter((n) => /^index80-\d+\.json$/.test(n)).sort()) {
  const receipt = JSON.parse(fs.readFileSync(path.join(REG, 'receipts', name), 'utf8'));
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(REG, 'snapshots', name))).digest('hex');
  const res = await fetch(`${KOIOS[receipt.network]}/api/v1/tx_info`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ _tx_hashes: [receipt.transaction_id], _metadata: true }),
  });
  const [tx] = await res.json();
  const onchain = String(tx?.metadata?.['309']?.[0] ?? '').toLowerCase();
  const ok = onchain.endsWith(`5820${sha}`) && tx.tx_hash === receipt.transaction_id;
  console.log(`${receipt.release_id} (${receipt.network}) block ${tx?.block_height}: on-chain label 309 ${ok ? 'COMMITS TO' : 'DOES NOT MATCH'} served snapshot ${sha}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);

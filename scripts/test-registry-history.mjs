#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { stripInk } from './lib/semantic-ink.mjs';
import { START as GLOBAL_SEARCH_START, END as GLOBAL_SEARCH_END } from './apply-global-search.mjs';

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

// The published Registry page is the post-build output (generator + global
// search strip + semantic ink). This test must never overwrite it: the fresh
// render goes to a temporary directory, and the published files are hashed
// before and after to prove they are untouched.
const publishedPagePath = path.join(ROOT, 'public_html/registry/index.html');
const publishedHistoryPath = path.join(ROOT, 'public_html/registry/index.json');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const publishedHashesBefore = [sha256(publishedPagePath), sha256(publishedHistoryPath)];

const renderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'index80-registry-history-'));
let history;
let renderedPage;
try {
  execFileSync(process.execPath, ['scripts/generate-registry-history.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, INDEX80_REGISTRY_HISTORY_OUT_DIR: renderDir },
  });
  history = JSON.parse(fs.readFileSync(path.join(renderDir, 'index.json'), 'utf8'));
  renderedPage = fs.readFileSync(path.join(renderDir, 'index.html'), 'utf8');
  assert(fs.readFileSync(path.join(renderDir, 'index.json'), 'utf8') === fs.readFileSync(publishedHistoryPath, 'utf8'), 'Published registry/index.json must equal a fresh generation (rebuild)');
} finally {
  fs.rmSync(renderDir, { recursive: true, force: true });
}
// Text assertions run on the fresh render (no post-processing spans).
const page = renderedPage;
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

// Registry is five sibling AROS windows. Content panels and native <details>
// disclosures remain inside their assigned window body without gaining their
// own data-window state.
const windowSpecs = [
  ['registry-history', 'registry-history-body', 'registry-history-window-title', 'INDEX:80 · /REGISTRY'],
  ['registry-changes', 'registry-changes-body', 'registry-changes-window-title', 'INDEX:80 · /RECENT CHANGES'],
  ['registry-verify', 'registry-verify-body', 'registry-verify-window-title', 'INDEX:80 · /VERIFY'],
  ['registry-wallet-window', 'registry-wallet-window-body', 'registry-wallet-window-title', 'INDEX:80 · /REGISTRY WALLET'],
  ['registry-data', 'registry-data-body', 'registry-data-window-title', 'INDEX:80 · /RELEASES + OPEN DATA'],
];
const dataWindows = [...page.matchAll(/<section class="panel os-window registry-section-window" data-window="([^"]+)" data-room="([^"]+)"/g)];
assert(dataWindows.length === 5, `Registry must have exactly five AROS top-level windows (found ${dataWindows.length})`);
assert(JSON.stringify(dataWindows.map((match) => match[1])) === JSON.stringify(windowSpecs.map(([id]) => id)), 'Registry AROS windows are missing or out of order');
assert(dataWindows.every((match) => match[2] === 'registry'), 'Every Registry AROS window must use data-room="registry"');
assert(!page.includes('data-window="registry-main"'), 'The former registry-main wrapper must be removed');

function windowBody(windowId, bodyId, titleId, title) {
  const startTag = `<div class="os-window-body registry-section-body" id="${bodyId}">`;
  const start = page.indexOf(startTag);
  const end = page.indexOf(`</div><!-- /#${bodyId} -->`, start);
  assert(start >= 0 && end > start, `${windowId} AROS body boundaries are missing or invalid`);
  assert(page.includes(`class="os-titlebar" aria-expanded="true" aria-controls="${bodyId}"`), `${windowId} titlebar must control an open-by-default body`);
  assert(page.includes(`class="os-title" id="${titleId}">${title}</span>`), `${windowId} titlebar text is wrong`);
  const body = page.slice(start, end);
  assert(!body.includes('data-window='), `${windowId} must not contain a nested data-window frame`);
  return body;
}

const bodies = new Map(windowSpecs.map(([windowId, bodyId, titleId, title]) => [windowId, windowBody(windowId, bodyId, titleId, title)]));
const expectedContent = new Map([
  ['registry-history', ['class="panel registry-hero"', 'LATEST CHAIN PROOF', 'registry-release-latest']],
  ['registry-changes', ['id="recent-changes"', 'registry-change-window']],
  ['registry-verify', ['id="registry-process"', 'class="panel dark shell-panel registry-verify"']],
  ['registry-wallet-window', ['id="registry-wallet"', 'id="registry-wallet-address"']],
  ['registry-data', ['RELEASE HISTORY', 'MACHINE-READABLE FILES', '/registry/index.json', '/data/change-ledger.json']],
]);
for (const [windowId, markers] of expectedContent) {
  for (const marker of markers) assert(bodies.get(windowId).includes(marker), `${windowId} is missing ${marker}`);
}
assert(!bodies.get('registry-history').includes('id="recent-changes"'), 'Recent Changes must not remain in the Registry history window');
assert(page.indexOf('<footer class="site-footer">') > page.indexOf('</div><!-- /#registry-data-body -->'), 'Registry footer must remain outside the AROS windows');

// ui-windows.js handles deep links generically by finding the closest parent.
const anchorParents = new Map([
  ['recent-changes', 'registry-changes'],
  ['registry-process', 'registry-verify'],
  ['registry-wallet', 'registry-wallet-window'],
]);
for (const [anchor, windowId] of anchorParents) {
  assert(bodies.get(windowId).includes(`id="${anchor}"`), `#${anchor} must remain inside ${windowId}`);
}
const uiWindows = fs.readFileSync(path.join(ROOT, 'public_html/assets/js/ui-windows.js'), 'utf8');
assert(uiWindows.includes("target.closest('[data-window]')"), 'Generic window script must reopen the closest parent frame for deep links');
assert(uiWindows.includes('openForHash(window.location.hash)'), 'Generic window script must handle the initial URL hash');
assert(page.includes('<script src="../assets/js/main.js" defer></script>'), 'Registry must load the shared script loader that activates ui-windows.js');

// Sprint 3B Registry-window UX: Recent Changes live inside /registry/ as native
// <details>/<summary> disclosures reusing the Project-page minimising language.
// Newest release window is open by default, older windows are collapsed, and each
// collapsed summary carries the release pair, observation date and counts.
const changeWindows = [...page.matchAll(/<details class="panel registry-change-window"( open)? id="([^"]+)"/g)];
assert(changeWindows.length >= 1, 'Registry page is missing embedded Recent Changes windows');
assert(changeWindows[0][1] === ' open', 'Newest Recent Changes window must be open by default');
assert(changeWindows.slice(1).every((match) => match[1] !== ' open'), 'Older Recent Changes windows must be collapsed by default');
assert(changeWindows.every((match) => bodies.get('registry-changes').includes(match[0])), 'Every Recent Changes disclosure must stay inside the Recent Changes AROS window');
assert(page.includes('id="registry-change-history-title"'), 'Registry page is missing the Recent Changes section heading');
assert(page.includes('aria-label="Change counts"'), 'Collapsed change windows must expose added/removed/updated counts');
// Sprint 4B.1 owner UX: the Publishing Process is a permanently visible panel
// inside /VERIFY, not a second nested disclosure.
assert(page.includes('<section class="panel registry-process" id="registry-process" aria-labelledby="registry-process-title">'), 'Publishing-process must be a plain, always-visible panel');
assert(!/<details[^>]*registry-process/.test(page), 'Publishing-process must not be a nested <details> disclosure');
const processPanel = page.slice(page.indexOf('id="registry-process"'), page.indexOf('</section>', page.indexOf('id="registry-process"')));
assert(!processPanel.includes('disclosure-caret') && !processPanel.includes('<summary'), 'Publishing-process must not carry a disclosure caret or summary');
for (const step of ['LIVE REGISTRY', 'FREEZE SNAPSHOT', 'HASH + APPROVE', 'CARDANO PROOF', 'PLANNED CADENCE: WEEKLY']) assert(processPanel.includes(step), `Publishing-process lost ${step}`);
assert(page.includes('id="registry-process-title"'), 'Publishing-process title anchor must remain intact');

// VERIFY A SNAPSHOT YOURSELF is generated from the latest confirmed release.
{
  const target = history.releases.find((entry) => entry.status === 'CONFIRMED') || history.releases[0];
  const verifyStart = page.indexOf('<section class="panel dark shell-panel registry-verify" id="registry-verify">');
  assert(verifyStart > 0, 'Verify section missing');
  const verify = page.slice(verifyStart, page.indexOf('</section>', verifyStart));
  const file = target.snapshot.path.split('/').pop();
  assert(/^index80-\d{4,}\.json$/.test(file), `Unexpected snapshot filename ${file}`);
  assert(verify.includes(`<strong>${target.release_id}</strong>`), 'Verify section must name the release being verified');
  assert(verify.includes(`href="${target.snapshot.path}" download="${file}">DOWNLOAD ${target.release_id} SNAPSHOT JSON</a>`), 'Verify section must link the latest snapshot JSON download');
  assert(verify.includes('href="/registry/view/">VIEW SNAPSHOT TABLE</a>'), 'Verify section must link the snapshot table');
  assert(verify.includes(`<code>shasum -a 256 ${file}</code>`), 'macOS/Linux hash command must use the derived filename');
  assert(verify.includes(`<code>Get-FileHash .\\${file} -Algorithm SHA256</code>`), 'PowerShell hash command must use the derived filename');
  assert(/^[0-9a-f]{64}$/.test(target.snapshot.hash) && verify.includes(`id="registry-verify-hash">${target.snapshot.hash}</code>`), 'Verify section must show the full latest SHA-256');
  assert(verify.includes('data-copy-target="registry-verify-hash">COPY HASH</button>'), 'Verify section must offer COPY HASH via wallet-copy.js');
  assert(page.includes('<script src="../assets/js/wallet-copy.js" defer></script>'), 'Registry must load the shared copy script');
  assert(verify.includes(`href="${target.proof.explorer_url}" target="_blank" rel="noopener noreferrer">OPEN CARDANO TRANSACTION ↗</a>`), 'Verify section must link the Cardano explorer transaction');
  if (Number.isInteger(target.proof.metadata_label)) assert(verify.includes(`metadata label <code>${target.proof.metadata_label}</code>`), 'Verify section must render the governed metadata label');
  if (target.proof.proof_standard) assert(verify.includes(`${target.proof.proof_standard} SHA2-256 proof`), 'Verify section must render the governed proof standard');
  assert(verify.includes('you have independently verified that this is the snapshot INDEX:80 anchored on-chain'), 'Verify completion statement missing');
  assert(verify.includes('The whole INDEX:80 database is not written on-chain'), 'On-chain scope note missing');
  // Committed snapshot bytes really hash to the displayed value.
  const bytes = fs.readFileSync(path.join(ROOT, 'public_html', target.snapshot.path.replace(/^\//, '')));
  assert(crypto.createHash('sha256').update(bytes).digest('hex') === target.snapshot.hash, 'Displayed hash must match the committed snapshot bytes');
}
assert(page.includes('class="panel-title registry-window-title"'), 'Recent Changes windows must reuse shared panel-title chrome');
assert(page.includes('class="disclosure-caret">▸</b>'), 'Recent Changes windows must reuse shared disclosure caret');
assert(!page.includes('registry-window-toggle'), 'Registry must not render a custom toggle chip'); // shared Project/People window chrome
assert(page.includes('registry-release-latest'), 'Latest release proof card must stay always visible');
assert(page.includes('LATEST CHAIN PROOF'), 'Latest chain-proof status must stay always visible');
assert(page.includes('<section class="panel dark shell-panel registry-wallet" id="registry-wallet"'), 'Registry wallet must remain directly visible for the existing #registry-wallet deep link');
assert(!page.includes('registry-compact registry-wallet'), 'Registry wallet must not be hidden in a collapsed disclosure');
assert(page.includes('/data/change-ledger.json'), 'Registry machine-readable files must include the public change ledger');

// The published page is exactly the fresh render plus the standard
// post-build passes, and still carries them (global search strip, semantic
// ink, VERIFY UX, current Recent Changes).
{
  const published = fs.readFileSync(publishedPagePath, 'utf8');
  const searchBlock = new RegExp(`\\n*[ \\t]*${GLOBAL_SEARCH_START}[\\s\\S]*?${GLOBAL_SEARCH_END}`);
  assert((published.match(new RegExp(GLOBAL_SEARCH_START, 'g')) || []).length === 1 && published.includes('id="global-search-input"'), 'Published Registry page must carry the global search strip');
  assert((published.match(/<span class="ink ink-[a-z]+">/g) || []).length >= 10, 'Published Registry page must carry semantic ink spans');
  const publishedText = stripInk(published);
  assert(publishedText.includes('VERIFY A SNAPSHOT YOURSELF') && publishedText.includes('data-copy-target="registry-verify-hash"'), 'Published Registry page must carry the VERIFY UX');
  assert(publishedText.includes('id="recent-changes"') && publishedText.includes(history.latest_release_id.toLowerCase() + '-changes'), 'Published Registry page must carry the current Recent Changes');
  assert(publishedText.replace(searchBlock, '') === renderedPage, 'Published Registry page must equal the fresh render plus only the global-search and semantic-ink passes (rebuild)');
}
const publishedHashesAfter = [sha256(publishedPagePath), sha256(publishedHistoryPath)];
assert(JSON.stringify(publishedHashesAfter) === JSON.stringify(publishedHashesBefore), 'test-registry-history must not modify public_html/registry/index.html or index.json');

console.log(`Registry provenance tests passed (published page untouched, sha256 ${publishedHashesAfter[0].slice(0, 12)}…): ${bySequence.length} releases chain in sequence; latest confirmed ${latestConfirmed.release_id}; newest ${newest.release_id} (${newest.status}); pinned INDEX80-0001/0002 proofs agree with immutable snapshots.`);

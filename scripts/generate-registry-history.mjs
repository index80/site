#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderNavLinks } from './lib/site-nav.mjs';
import { buildDryRun } from './sprint3a-change-detection.mjs';
import { renderRegistryChangeHistory } from './generate-change-history.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_DIR = path.join(ROOT, 'public_html/registry');
const RELEASES_DIR = path.join(REGISTRY_DIR, 'releases');
const RECEIPTS_DIR = path.join(REGISTRY_DIR, 'receipts');
// Output defaults to the published Registry. INDEX80_REGISTRY_HISTORY_OUT_DIR
// redirects ONLY the two written files (tests render into a temp directory so
// they never overwrite the post-processed published page); inputs are unchanged.
const OUT_DIR = process.env.INDEX80_REGISTRY_HISTORY_OUT_DIR ? path.resolve(process.env.INDEX80_REGISTRY_HISTORY_OUT_DIR) : REGISTRY_DIR;
const HISTORY_JSON = path.join(OUT_DIR, 'index.json');
const HISTORY_HTML = path.join(OUT_DIR, 'index.html');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listReleaseFiles() {
  return fs.readdirSync(RELEASES_DIR)
    .filter((name) => /^index80-\d+\.json$/i.test(name))
    .sort((a, b) => b.localeCompare(a, 'en'));
}

function receiptFor(filename) {
  const file = path.join(RECEIPTS_DIR, filename);
  return fs.existsSync(file) ? readJson(file) : null;
}

function explorerUrl(network, transactionId) {
  if (!transactionId) return null;
  return network === 'mainnet'
    ? `https://cardanoscan.io/transaction/${transactionId}`
    : `https://preprod.cardanoscan.io/transaction/${transactionId}`;
}

function buildEntry(filename) {
  const release = readJson(path.join(RELEASES_DIR, filename));
  const receipt = receiptFor(filename);

  if (receipt) {
    if (receipt.release_id !== release.release_id) throw new Error(`Receipt/release ID mismatch: ${filename}`);
    if (receipt.snapshot_hash !== release.snapshot.hash) throw new Error(`Receipt/snapshot hash mismatch: ${filename}`);
    if (receipt.network !== release.cardano.network) throw new Error(`Receipt/release network mismatch: ${filename}`);
  }

  const status = receipt?.status === 'CONFIRMED' ? 'CONFIRMED' : release.cardano.status;
  const proof = receipt ? {
    block: receipt.block ?? null,
    confirmation_observed: receipt.confirmation_observed ?? null,
    epoch: receipt.epoch ?? null,
    explorer_url: explorerUrl(receipt.network, receipt.transaction_id),
    fee_lovelace: receipt.fee_lovelace ?? null,
    local_signed_size_bytes: receipt.local_signed_size_bytes ?? null,
    metadata_hash: receipt.metadata_hash ?? null,
    metadata_label: receipt.metadata_label ?? null,
    onchain_size_bytes: receipt.onchain_size_bytes ?? null,
    proof_standard: receipt.proof_standard ?? null,
    publisher_address: receipt.publisher_address ?? null,
    transaction_id: receipt.transaction_id ?? null,
    timestamp_display: receipt.cardanoscan_timestamp_display ?? null,
  } : null;

  return {
    network: release.cardano.network,
    previous: release.previous,
    proof,
    release_id: release.release_id,
    release_manifest_url: `/registry/releases/${filename}`,
    sequence: release.sequence,
    snapshot: release.snapshot,
    status,
  };
}

export function buildHistory() {
  const releases = listReleaseFiles().map(buildEntry);
  return {
    confirmed_count: releases.filter((entry) => entry.status === 'CONFIRMED').length,
    latest_release_id: releases[0]?.release_id ?? null,
    release_count: releases.length,
    releases,
    schema: 'INDEX80 Registry History v1',
  };
}

function html(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function dateLabel(entry) {
  const date = entry.proof?.confirmation_observed?.date;
  if (!date) return 'Awaiting Cardano confirmation';
  const parsed = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(parsed);
}

function adaFromLovelace(value) {
  if (value == null) return '—';
  return `${(Number(value) / 1_000_000).toFixed(6)} ADA`;
}

function shorten(value, head = 12, tail = 10) {
  const text = String(value ?? '');
  if (text.length <= head + tail + 3) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function statusText(entry) {
  if (entry.status !== 'CONFIRMED') return 'ANCHOR PENDING';
  return entry.network === 'mainnet' ? 'VERIFIED ON CARDANO MAINNET' : 'VERIFIED ON CARDANO PREPROD';
}

function releaseType(entry) {
  return entry.network === 'mainnet' ? 'PUBLIC MAINNET PROOF' : 'PREPROD TEST PROOF';
}

function hasPeople(entry) {
  return Number.isInteger(entry.snapshot.people_count);
}

function countsPhrase(entry) {
  return hasPeople(entry)
    ? `${entry.snapshot.project_count} projects and ${entry.snapshot.people_count} people`
    : `${entry.snapshot.project_count} projects`;
}

function renderRelease(entry, latest = false) {
  const receiptUrl = `/registry/receipts/${entry.release_id.toLowerCase()}.json`;
  const proof = entry.proof;
  return `
    <article class="panel dark registry-release${latest ? ' registry-release-latest' : ''}">
      <div class="registry-release-head">
        <div>
          <span class="registry-kicker">${html(releaseType(entry))}</span>
          <h2>${html(entry.release_id)}</h2>
          <p>${latest ? 'Current top release in the public history.' : 'Immutable registry snapshot.'}</p>
        </div>
        <span class="registry-status ${entry.status === 'CONFIRMED' ? 'is-confirmed' : 'is-pending'}">${html(statusText(entry))}</span>
      </div>

      <div class="registry-release-summary">
        <div class="registry-release-number"><span>SNAPSHOT</span><strong>${String(entry.sequence).padStart(4, '0')}</strong></div>
        <div class="registry-release-copy">
          <p><strong>${hasPeople(entry) ? `${html(entry.snapshot.project_count)} public project records and ${html(entry.snapshot.people_count)} public people records` : `${html(entry.snapshot.project_count)} public project records`}</strong> frozen into one immutable JSON snapshot.</p>
          <p>Cardano stores the SHA-256 proof; the full registry stays readable here on the open web.</p>
        </div>
      </div>

      <div class="registry-facts">
        <div><span>PROOF DATE</span><strong>${html(dateLabel(entry))}</strong></div>
        <div><span>PROJECTS</span><strong>${html(entry.snapshot.project_count)}</strong></div>
        ${hasPeople(entry) ? `<div><span>PEOPLE</span><strong>${html(entry.snapshot.people_count)}</strong></div>` : ''}
        <div><span>NETWORK</span><strong>${html(entry.network.toUpperCase())}</strong></div>
        <div><span>BLOCK</span><strong>${html(proof?.block ?? '—')}</strong></div>
        <div><span>FEE</span><strong>${html(adaFromLovelace(proof?.fee_lovelace))}</strong></div>
      </div>

      <div class="registry-proof-lines">
        <div><span>SNAPSHOT SHA-256</span><code>${html(entry.snapshot.hash)}</code></div>
        <div><span>CARDANO TRANSACTION</span><code>${html(proof?.transaction_id ?? 'Awaiting submission')}</code></div>
      </div>

      <div class="registry-actions registry-actions-primary">
        <a class="button primary" href="/registry/view/">VIEW SNAPSHOT TABLE</a>
        ${proof?.explorer_url ? `<a class="button" href="${html(proof.explorer_url)}" target="_blank" rel="noopener noreferrer">VIEW ON CARDANO ↗</a>` : ''}
      </div>
      <details class="registry-technical">
        <summary>Technical files</summary>
        <div class="registry-actions">
          <a href="${html(entry.release_manifest_url)}">Release manifest</a>
          ${proof ? `<a href="${html(receiptUrl)}">Verification receipt</a>` : ''}
          <a href="/registry/index.json">Release history JSON</a>
        </div>
      </details>
    </article>`;
}

function renderHistoryRow(entry) {
  const proof = entry.proof;
  return `
        <li class="registry-history-row">
          <div>
            <strong>${html(entry.release_id)}</strong>
            <span>${html(dateLabel(entry))} · ${html(countsPhrase(entry))} · ${html(entry.network.toUpperCase())}</span>
          </div>
          <code title="${html(entry.snapshot.hash)}">${html(shorten(entry.snapshot.hash))}</code>
          <span class="registry-mini-status ${entry.status === 'CONFIRMED' ? 'is-confirmed' : 'is-pending'}">${entry.status === 'CONFIRMED' ? 'VERIFIED' : 'PENDING'}</span>
          ${proof?.explorer_url ? `<a href="${html(proof.explorer_url)}" target="_blank" rel="noopener noreferrer">Cardano ↗</a>` : '<span>—</span>'}
        </li>`;
}

// VERIFY A SNAPSHOT YOURSELF — generated from the latest confirmed Registry
// release (falling back to the latest release while its proof is pending), so
// every future release updates the download link, filename, hash and proof
// link automatically. No release-specific values are written by hand.
function snapshotFilename(snapshotPath) {
  const match = /^\/registry\/snapshots\/([a-z0-9-]+\.json)$/.exec(snapshotPath || '');
  if (!match) throw new Error(`Invalid Registry snapshot path: ${snapshotPath}`);
  return match[1];
}

function renderVerify(entry) {
  const note = `<p class="registry-note">The whole INDEX:80 database is not written on-chain. Cardano carries the compact proof; the readable registry stays on the open web.</p>`;
  if (!entry?.snapshot?.path || !/^[0-9a-f]{64}$/.test(entry.snapshot.hash || '')) {
    return `<section class="panel dark shell-panel registry-verify" id="registry-verify">
      <div class="registry-section-head compact">
        <span>INDEPENDENT CHECK</span>
        <h2>VERIFY A SNAPSHOT YOURSELF</h2>
      </div>
      <p class="registry-note">No published snapshot is available to verify yet.</p>
      ${note}
    </section>`;
  }
  const releaseId = html(entry.release_id);
  const file = snapshotFilename(entry.snapshot.path);
  const hash = entry.snapshot.hash;
  const proof = entry.proof || {};
  const proofUrl = /^https:\/\/(preprod\.)?cardanoscan\.io\/transaction\/[0-9a-f]{64}$/.test(proof.explorer_url || '') ? proof.explorer_url : null;
  const label = Number.isInteger(proof.metadata_label) ? proof.metadata_label : null;
  const standard = typeof proof.proof_standard === 'string' && /^[A-Za-z0-9 .-]+$/.test(proof.proof_standard) ? proof.proof_standard : null;
  const proofScheme = [label !== null ? `metadata label <code>${label}</code>` : null, standard ? `the ${html(standard)} SHA2-256 proof` : null].filter(Boolean).join(' — ');
  const network = entry.network === 'mainnet' ? 'Cardano Mainnet' : 'Cardano Preprod (test network)';

  return `<section class="panel dark shell-panel registry-verify" id="registry-verify">
      <div class="registry-section-head compact">
        <span>INDEPENDENT CHECK</span>
        <h2>VERIFY A SNAPSHOT YOURSELF</h2>
        <p>Verifying release <strong>${releaseId}</strong>. Four steps, using only your own computer and a public Cardano explorer.</p>
      </div>
      <ol class="registry-verify-grid registry-verify-steps">
        <li><span>1</span><div>
          <h3>DOWNLOAD THE SNAPSHOT</h3>
          <p>Save the exact ${releaseId} snapshot file. Do not open and re-save it: any change to the bytes changes the hash.</p>
          <div class="registry-actions">
            <a class="button primary" href="${html(entry.snapshot.path)}" download="${html(file)}">DOWNLOAD ${releaseId} SNAPSHOT JSON</a>
            <a class="button" href="/registry/view/">VIEW SNAPSHOT TABLE</a>
          </div>
        </div></li>
        <li><span>2</span><div>
          <h3>CALCULATE SHA-256</h3>
          <p>Run one of these commands in the folder containing the downloaded JSON file.</p>
          <p class="registry-verify-label">macOS / Linux</p>
          <pre class="registry-verify-code"><code>shasum -a 256 ${html(file)}</code></pre>
          <p class="registry-verify-label">Windows PowerShell</p>
          <pre class="registry-verify-code"><code>Get-FileHash .\\${html(file)} -Algorithm SHA256</code></pre>
        </div></li>
        <li><span>3</span><div>
          <h3>COMPARE WITH THE INDEX:80 RELEASE HASH</h3>
          <p>The hash returned by your computer should exactly match this value.</p>
          <code class="registry-wallet-address registry-verify-hash" id="registry-verify-hash">${html(hash)}</code>
          <div class="registry-actions"><button type="button" class="button" data-copy-target="registry-verify-hash">COPY HASH</button></div>
          <p class="registry-verify-label">PowerShell prints the hash in capitals; the letters are the same.</p>
        </div></li>
        <li><span>4</span><div>
          <h3>CHECK THE CARDANO PROOF</h3>
          ${proofUrl
            ? `<p>The ${network} transaction stores the snapshot fingerprint. Open it and inspect ${proofScheme || 'the transaction metadata'}: the hash recorded there should be the same value.</p>
          <div class="registry-actions"><a class="button primary" href="${html(proofUrl)}" target="_blank" rel="noopener noreferrer">OPEN CARDANO TRANSACTION ↗</a></div>`
            : `<p>The Cardano proof for ${releaseId} has not been confirmed yet. Once it is, the transaction link appears here.</p>`}
        </div></li>
      </ol>
      <p class="registry-verify-done">If the hash calculated from your downloaded file matches the INDEX:80 release hash and the hash recorded in the Cardano proof, you have independently verified that this is the snapshot INDEX:80 anchored on-chain.</p>
      ${note}
    </section>`;
}

function renderPage(history) {
  const latest = history.releases[0];
  const latestConfirmed = history.releases.find((entry) => entry.status === 'CONFIRMED');
  const confirmedHtml = latestConfirmed
    ? `${html(latestConfirmed.release_id)} has a confirmed ${latestConfirmed.network === 'mainnet' ? 'Mainnet' : 'Preprod test'} proof on Cardano.`
    : 'No confirmed Cardano registry proof has been published yet.';

  return `<!doctype html>
<html lang="en">
<head>
  <script src="/assets/js/analytics.js"></script>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="INDEX:80 Registry — weekly public Cardano ecosystem snapshots with downloadable JSON, SHA-256 fingerprints and independently verifiable Cardano proofs.">
  <title>Registry — INDEX:80 / CARDANO</title>
  <link rel="canonical" href="https://index80.com/registry/">
  <link rel="icon" type="image/svg+xml" href="../assets/icons/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="../assets/icons/favicon-32.png">
  <link rel="apple-touch-icon" href="../assets/icons/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap">
  <script src="../assets/js/theme.js"></script>
  <link rel="stylesheet" href="../assets/css/site.css">
  <link rel="stylesheet" href="../assets/css/registry-page.css">
</head>
<body data-mode="data" data-page="registry">
  <a class="skip-link" href="#main">Skip to content</a>

  <div class="system-bar">
    <span class="system-slogan">A MORE OPEN INTERNET, A BRIGHTER TOMORROW.</span>
    <span class="system-status"><span class="status-dot"></span> INDEX:80 ONLINE</span>
  </div>

  <header class="site-header">
    <div class="brand-row">
      <a class="wordmark" href="/" aria-label="INDEX:80 home"><span>INDEX:</span><b>80</b></a>
      <span class="network-label">/CARDANO</span>
    </div>
    <nav class="main-nav" aria-label="Primary">
${renderNavLinks('/registry/', '      ')}
    </nav>
  </header>

  <main id="main" class="page-grid single-column">
    <section class="panel os-window registry-section-window" data-window="registry-history" data-room="registry" aria-labelledby="registry-history-window-title">
      <h2 class="os-titlebar-heading"><button type="button" class="os-titlebar" aria-expanded="true" aria-controls="registry-history-body"><span class="os-gadget os-gadget-close" aria-hidden="true"></span><span class="os-title" id="registry-history-window-title">INDEX:80 · /REGISTRY</span><span class="os-gadget os-gadget-toggle" aria-hidden="true"></span><span class="visually-hidden"> — show or hide Registry history</span></button></h2>
      <div class="os-window-body registry-section-body" id="registry-history-body">
        <div class="registry-os-content">
    <section class="panel registry-hero">
      <div class="hero-copy">
        <div class="eyebrow on-dark">PUBLIC REGISTRY + CARDANO PROOF</div>
        <h1><span class="registry-hero-title">REGISTRY</span><small>/HISTORY</small></h1>
        <p class="strap">A PUBLIC RECORD OF WHAT INDEX:80 PUBLISHED.</p>
        <p>INDEX:80 freezes a copy of its public Projects and People registries on a regular schedule. Each snapshot stays available as ordinary JSON, while its SHA-256 fingerprint is published to Cardano so the record can be checked independently.</p>
        <div class="registry-hero-art"><img src="/assets/images/index80-registry-astronaut-cat.webp" alt="Pixel-art illustration of an astronaut sitting at a desk working on a glowing computer terminal, with a black cat perched beside a coffee mug, representing INDEX:80's public Cardano registry proof." width="600" height="450" loading="lazy"></div>
      </div>
      <div class="registry-hero-status">
        <span class="registry-kicker">LATEST CHAIN PROOF</span>
        <span class="registry-status ${latestConfirmed ? 'is-confirmed' : 'is-pending'}">${latestConfirmed ? html(statusText(latestConfirmed)) : 'NO CONFIRMED ANCHOR'}</span>
        <strong>${html(latestConfirmed?.release_id ?? '—')}</strong>
        <p>${confirmedHtml}</p>
        ${latestConfirmed?.proof?.explorer_url ? `<a class="registry-text-link" href="${html(latestConfirmed.proof.explorer_url)}" target="_blank" rel="noopener noreferrer">Open Cardano transaction ↗</a>` : ''}
      </div>
    </section>

    ${latest ? renderRelease(latest, true) : '<section class="panel dark shell-panel"><h2>NO RELEASES YET</h2></section>'}
        </div><!-- /.registry-os-content -->
      </div><!-- /#registry-history-body -->
    </section><!-- /[data-window="registry-history"] -->

    <section class="panel os-window registry-section-window" data-window="registry-changes" data-room="registry" aria-labelledby="registry-changes-window-title">
      <h2 class="os-titlebar-heading"><button type="button" class="os-titlebar" aria-expanded="true" aria-controls="registry-changes-body"><span class="os-gadget os-gadget-close" aria-hidden="true"></span><span class="os-title" id="registry-changes-window-title">INDEX:80 · /RECENT CHANGES</span><span class="os-gadget os-gadget-toggle" aria-hidden="true"></span><span class="visually-hidden"> — show or hide Recent Changes</span></button></h2>
      <div class="os-window-body registry-section-body" id="registry-changes-body">
        <div class="registry-os-content">
    ${renderRegistryChangeHistory(history, buildDryRun(ROOT))}
        </div><!-- /.registry-os-content -->
      </div><!-- /#registry-changes-body -->
    </section><!-- /[data-window="registry-changes"] -->

    <section class="panel os-window registry-section-window" data-window="registry-verify" data-room="registry" aria-labelledby="registry-verify-window-title">
      <h2 class="os-titlebar-heading"><button type="button" class="os-titlebar" aria-expanded="true" aria-controls="registry-verify-body"><span class="os-gadget os-gadget-close" aria-hidden="true"></span><span class="os-title" id="registry-verify-window-title">INDEX:80 · /VERIFY</span><span class="os-gadget os-gadget-toggle" aria-hidden="true"></span><span class="visually-hidden"> — show or hide verification guidance</span></button></h2>
      <div class="os-window-body registry-section-body" id="registry-verify-body">
        <div class="registry-os-content">
    <section class="panel registry-process" id="registry-process" aria-labelledby="registry-process-title">
      <div class="panel-title"><h2 id="registry-process-title">THE PUBLISHING PROCESS</h2><span>/ HOW IT WORKS</span></div>
      <div class="registry-window-body registry-process-body">
        <p class="registry-process-intro">Simple by design: one public file, one fingerprint, one manually approved Cardano transaction.</p>
        <div class="registry-process-flow">
          <article><span>01</span><h3>LIVE REGISTRY</h3><p>The current approved INDEX:80 public registry is the source.</p></article>
          <i aria-hidden="true">→</i>
          <article><span>02</span><h3>FREEZE SNAPSHOT</h3><p>A permanent JSON copy is created for that release.</p></article>
          <i aria-hidden="true">→</i>
          <article><span>03</span><h3>HASH + APPROVE</h3><p>SHA-256 is calculated and the transaction is approved locally in Lace.</p></article>
          <i aria-hidden="true">→</i>
          <article><span>04</span><h3>CARDANO PROOF</h3><p>The fingerprint is recorded on Cardano and linked back here.</p></article>
        </div>
        <div class="registry-cadence"><strong>PLANNED CADENCE: WEEKLY</strong><span>Snapshot preparation can be automated. Cardano signing always requires manual wallet approval.</span></div>
      </div>
    </section>

    ${renderVerify(latestConfirmed || latest)}
        </div><!-- /.registry-os-content -->
      </div><!-- /#registry-verify-body -->
    </section><!-- /[data-window="registry-verify"] -->

    <section class="panel os-window registry-section-window" data-window="registry-wallet-window" data-room="registry" aria-labelledby="registry-wallet-window-title">
      <h2 class="os-titlebar-heading"><button type="button" class="os-titlebar" aria-expanded="true" aria-controls="registry-wallet-window-body"><span class="os-gadget os-gadget-close" aria-hidden="true"></span><span class="os-title" id="registry-wallet-window-title">INDEX:80 · /REGISTRY WALLET</span><span class="os-gadget os-gadget-toggle" aria-hidden="true"></span><span class="visually-hidden"> — show or hide the Registry wallet</span></button></h2>
      <div class="os-window-body registry-section-body" id="registry-wallet-window-body">
        <div class="registry-os-content">
    <section class="panel dark shell-panel registry-wallet" id="registry-wallet" aria-labelledby="registry-wallet-title">
      <div class="registry-section-head compact">
        <span>PUBLIC TRANSPARENCY</span>
        <h2 id="registry-wallet-title">REGISTRY WALLET</h2>
      </div>
      <div class="registry-wallet-body">
        <figure class="registry-wallet-qr"><img src="../assets/images/qr-registry-wallet-cardano.png" alt="QR code for the INDEX:80 Cardano Registry wallet address" width="180" height="180" loading="lazy"></figure>
        <div class="registry-wallet-copy">
          <p><strong>Cardano mainnet.</strong> This is the dedicated INDEX:80 Registry wallet, published for transparency.</p>
          <p class="registry-wallet-warning"><strong>Separate from the donations wallet.</strong> It is not a donation address. To support INDEX:80, use the addresses on the <a href="../about/#donate">About page</a>.</p>
          <code class="registry-wallet-address" id="registry-wallet-address">addr1qxljlkqp3u79xc22zvhg6sfhxu6pg0y6ncwcdu2r6yesgyhae4nddtq0je0jezr2pf9kq6xthp9np7aslenum230sqhqjnqcrz</code>
          <div class="registry-actions"><button type="button" class="button" data-copy-target="registry-wallet-address">COPY ADDRESS</button></div>
          <p class="registry-note">Publishing this address does not by itself show which wallet signed any past Registry transaction. Verify each release from its own Cardano transaction, as described above.</p>
        </div>
      </div>
    </section>
        </div><!-- /.registry-os-content -->
      </div><!-- /#registry-wallet-window-body -->
    </section><!-- /[data-window="registry-wallet-window"] -->

    <section class="panel os-window registry-section-window" data-window="registry-data" data-room="registry" aria-labelledby="registry-data-window-title">
      <h2 class="os-titlebar-heading"><button type="button" class="os-titlebar" aria-expanded="true" aria-controls="registry-data-body"><span class="os-gadget os-gadget-close" aria-hidden="true"></span><span class="os-title" id="registry-data-window-title">INDEX:80 · /RELEASES + OPEN DATA</span><span class="os-gadget os-gadget-toggle" aria-hidden="true"></span><span class="visually-hidden"> — show or hide releases and open data</span></button></h2>
      <div class="os-window-body registry-section-body" id="registry-data-body">
        <div class="registry-os-content">
    <section class="panel dark shell-panel">
      <div class="registry-section-head compact">
        <span>ARCHIVE</span>
        <h2>RELEASE HISTORY</h2>
      </div>
      <ul class="registry-history">
        ${history.releases.map(renderHistoryRow).join('\n')}
      </ul>
    </section>

    <section class="panel dark shell-panel registry-machine">
      <div class="registry-section-head compact">
        <span>OPEN DATA</span>
        <h2>MACHINE-READABLE FILES</h2>
      </div>
      <p>These are ordinary public JSON files. They can be opened in a browser, downloaded, analysed by code or read by AI systems.</p>
      <div class="registry-machine-links">
        <a href="/registry/index.json"><strong>Release history</strong><code>/registry/index.json</code></a>
        ${latest ? `<a href="${html(latest.snapshot.path)}"><strong>Latest snapshot</strong><code>${html(latest.snapshot.path)}</code></a>` : ''}
        ${latest ? `<a href="${html(latest.release_manifest_url)}"><strong>Latest manifest</strong><code>${html(latest.release_manifest_url)}</code></a>` : ''}
        <a href="/data/change-ledger.json"><strong>Change ledger</strong><code>/data/change-ledger.json</code></a>
      </div>
    </section>
        </div><!-- /.registry-os-content -->
      </div><!-- /#registry-data-body -->
    </section><!-- /[data-window="registry-data"] -->
  </main>

  <footer class="site-footer">
    <nav class="footer-nav" aria-label="Secondary">
${renderNavLinks('/registry/', '      ')}
    </nav>
    <div class="footer-meta">
      <span class="footer-brand">INDEX:<b>80</b> /CARDANO</span>
      <span>OPEN LINKS · OPEN DATA · SOURCED INFORMATION</span>
      <button type="button" class="footer-consent-toggle" data-consent-toggle>Cookie preferences</button>
    </div>
  </footer>

  <script src="../assets/js/main.js" defer></script>
  <script src="../assets/js/wallet-copy.js" defer></script>
</body>
</html>
`;
}

function main() {
  const history = buildHistory();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_JSON, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  fs.writeFileSync(HISTORY_HTML, renderPage(history), 'utf8');
  console.log(`Registry history generated: ${history.release_count} release(s), ${history.confirmed_count} confirmed.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

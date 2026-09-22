#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_DIR = path.join(ROOT, 'public_html/registry');
const RELEASES_DIR = path.join(REGISTRY_DIR, 'releases');
const RECEIPTS_DIR = path.join(REGISTRY_DIR, 'receipts');
const HISTORY_JSON = path.join(REGISTRY_DIR, 'index.json');
const HISTORY_HTML = path.join(REGISTRY_DIR, 'index.html');

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

function buildHistory() {
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
          <p><strong>${html(entry.snapshot.project_count)} public project records</strong> frozen into one immutable JSON snapshot.</p>
          <p>Cardano stores the SHA-256 proof; the full registry stays readable here on the open web.</p>
        </div>
      </div>

      <div class="registry-facts">
        <div><span>PROOF DATE</span><strong>${html(dateLabel(entry))}</strong></div>
        <div><span>PROJECTS</span><strong>${html(entry.snapshot.project_count)}</strong></div>
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
            <span>${html(dateLabel(entry))} · ${html(entry.snapshot.project_count)} projects · ${html(entry.network.toUpperCase())}</span>
          </div>
          <code title="${html(entry.snapshot.hash)}">${html(shorten(entry.snapshot.hash))}</code>
          <span class="registry-mini-status ${entry.status === 'CONFIRMED' ? 'is-confirmed' : 'is-pending'}">${entry.status === 'CONFIRMED' ? 'VERIFIED' : 'PENDING'}</span>
          ${proof?.explorer_url ? `<a href="${html(proof.explorer_url)}" target="_blank" rel="noopener noreferrer">Cardano ↗</a>` : '<span>—</span>'}
        </li>`;
}

function renderPage(history) {
  const latest = history.releases[0];
  const latestConfirmed = history.releases.find((entry) => entry.status === 'CONFIRMED');
  const confirmedText = latestConfirmed
    ? `${latestConfirmed.release_id} has a confirmed ${latestConfirmed.network === 'mainnet' ? 'Mainnet' : 'Preprod test'} proof on Cardano.`
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
      <a href="/">⌂ Home</a>
      <a href="/submit/">✎ Submit</a>
      <a href="/data/">▥ Data</a>
      <a href="/learn/">▤ Learn</a>
      <a href="/governance/">⌂ Governance</a>
      <a href="/about/">◇ About</a>
      <a aria-current="page" href="/registry/">▣ Registry</a>
    </nav>
  </header>

  <main id="main" class="page-grid single-column">
    <section class="panel registry-hero">
      <div class="hero-copy">
        <div class="eyebrow on-dark">PUBLIC REGISTRY + CARDANO PROOF</div>
        <h1><span class="registry-hero-title">REGISTRY</span><small>/HISTORY</small></h1>
        <p class="strap">A PUBLIC RECORD OF WHAT INDEX:80 PUBLISHED.</p>
        <p>INDEX:80 freezes a copy of its public project registry on a regular schedule. Each snapshot stays available as ordinary JSON, while its SHA-256 fingerprint is published to Cardano so the record can be checked independently.</p>
        <div class="registry-hero-art"><img src="/assets/images/index80-registry-astronaut-cat.webp" alt="Pixel-art illustration of an astronaut sitting at a desk working on a glowing computer terminal, with a black cat perched beside a coffee mug, representing INDEX:80's public Cardano registry proof." width="600" height="450" loading="lazy"></div>
      </div>
      <div class="registry-hero-status">
        <span class="registry-kicker">LATEST CHAIN PROOF</span>
        <span class="registry-status ${latestConfirmed ? 'is-confirmed' : 'is-pending'}">${latestConfirmed ? html(statusText(latestConfirmed)) : 'NO CONFIRMED ANCHOR'}</span>
        <strong>${html(latestConfirmed?.release_id ?? '—')}</strong>
        <p>${html(confirmedText)}</p>
        ${latestConfirmed?.proof?.explorer_url ? `<a class="registry-text-link" href="${html(latestConfirmed.proof.explorer_url)}" target="_blank" rel="noopener noreferrer">Open Cardano transaction ↗</a>` : ''}
      </div>
    </section>

    <section class="panel dark registry-process" aria-labelledby="registry-process-title">
      <div class="registry-section-head">
        <span>HOW IT WORKS</span>
        <h2 id="registry-process-title">THE PUBLISHING PROCESS</h2>
        <p>Simple by design: one public file, one fingerprint, one manually approved Cardano transaction.</p>
      </div>
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
    </section>

    ${latest ? renderRelease(latest, true) : '<section class="panel dark shell-panel"><h2>NO RELEASES YET</h2></section>'}

    <section class="panel dark shell-panel registry-verify">
      <div class="registry-section-head compact">
        <span>INDEPENDENT CHECK</span>
        <h2>VERIFY A SNAPSHOT YOURSELF</h2>
      </div>
      <div class="registry-verify-grid">
        <div><span>1</span><p>Download the snapshot JSON.</p></div>
        <div><span>2</span><p>Calculate SHA-256 over the exact file.</p></div>
        <div><span>3</span><p>Compare it with the hash in the Cardano transaction.</p></div>
      </div>
      <p class="registry-note">The whole INDEX:80 database is not written on-chain. Cardano carries the compact proof; the readable registry stays on the open web.</p>
    </section>

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
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <nav class="footer-nav" aria-label="Secondary">
      <a href="/">⌂ Home</a>
      <a href="/submit/">✎ Submit</a>
      <a href="/data/">▥ Data</a>
      <a href="/learn/">▤ Learn</a>
      <a href="/governance/">⌂ Governance</a>
      <a href="/about/">◇ About</a>
      <a aria-current="page" href="/registry/">▣ Registry</a>
      <a href="https://x.com/index80web" target="_blank" rel="noopener noreferrer">𝕏 X</a>
      <a href="https://www.linkedin.com/company/index80" target="_blank" rel="noopener noreferrer">in LinkedIn</a>
    </nav>
    <div class="footer-meta">
      <span class="footer-brand">INDEX:<b>80</b> /CARDANO</span>
      <span>OPEN LINKS · OPEN DATA · SOURCED INFORMATION</span>
      <button type="button" class="footer-consent-toggle" data-consent-toggle>Cookie preferences</button>
    </div>
  </footer>

  <script src="../assets/js/main.js" defer></script>
</body>
</html>
`;
}

function main() {
  const history = buildHistory();
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_JSON, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  fs.writeFileSync(HISTORY_HTML, renderPage(history), 'utf8');
  console.log(`Registry history generated: ${history.release_count} release(s), ${history.confirmed_count} confirmed.`);
}

main();

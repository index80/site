#!/usr/bin/env node
/**
 * Donation / Registry wallet test.
 *  1. Every displayed address equals the pinned release address and passes its Bech32/Bech32m checksum.
 *  2. Every QR image is the pinned, independently decoded file (SHA-256) and is referenced by the right card.
 *     (When Python + OpenCV are available the QR is also decoded and compared; otherwise this step is skipped.)
 *  3. The copy buttons copy exactly the displayed address (Clipboard API and select-copy fallback).
 *  4. Forbidden material (DUST, shielded address, key material) is not published.
 */
import { INK_TOLERANT_HTML } from './test-helpers/ink-tolerant-html.mjs'; // eslint-disable-line no-unused-vars
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public_html');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
function assert(c, m) { if (!c) throw new Error(`donation-wallets: ${m}`); }

// Pinned from INDEX80-QR-Release-Set-2026-09-30 (README addresses; QR decoded independently with OpenCV and ZBar).
const WALLETS = {
  cardano:  { id: 'wallet-cardano',  page: 'about/index.html',    address: 'addr1q8lk4p3p8436ng24x6gkglrrsrhhnn4kc0v6sff4plj2h6fgze77r90ayy3ufsusdzwj8g7j28hw68dgwy4dm5tnamhqax3ezt', hrp: 'addr', spec: 'bech32',  qr: 'qr-donate-cardano.png',           sha: 'c3394a0c0158f0de48c275beab60a73975e22f314d6bb56a8f30b572cbf90122' },
  bitcoin:  { id: 'wallet-bitcoin',  page: 'about/index.html',    address: 'bc1qmrpky5eh6cc87p3ue6uleh38zure6n8dz5t0fm', hrp: 'bc', spec: 'bech32', qr: 'qr-donate-bitcoin.png',           sha: '2862704b6f9f02e7e1f44118b9805d35cc60ca994eb6bd7f79ffd6a45fd48e2a' },
  midnight: { id: 'wallet-midnight', page: 'about/index.html',    address: 'mn_addr13e7g2g4kzyyf2j0hp0w76ruqp2pgvgfzq4m2afdh6zjmvq4aalgs34wda0', hrp: 'mn_addr', spec: 'bech32m', qr: 'qr-donate-midnight-night.png',   sha: '8edc3af580d2ee82d7aa53dd6cec0e6d39793c7cf366b685654046a7c25edc71' },
  registry: { id: 'registry-wallet-address', page: 'registry/index.html', address: 'addr1qxljlkqp3u79xc22zvhg6sfhxu6pg0y6ncwcdu2r6yesgyhae4nddtq0je0jezr2pf9kq6xthp9np7aslenum230sqhqjnqcrz', hrp: 'addr', spec: 'bech32', qr: 'qr-registry-wallet-cardano.png', sha: 'd02c346c6c909f1e4ce25332423ebfee5b1d3bb7b1d889c93615308bcb543598' },
};
const FORBIDDEN = [
  'mn_dust1w0mrwe05w4mvvf70c7t0wvvwrht0gsg9jhl5uls3lq0cfx8f5vhyy87qa8h',            // DUST address: not a donation destination
  'mn_shield-addr1hw6a5k99y0eqsvlkqt6sasnxdpt4040xvzyf0jqmxnsfadnfrqtang8q40lwg9rdqlnjc97gfvpd5a8anj4m27eu3wvz3ad9xexctrgzg48fg', // shielded: compatibility unconfirmed
];
const KEY_MATERIAL = /(xprv|xpub|acct_xvk|acct_xsk|root_xsk|addr_xsk|stake_xsk|drep_xsk|_sk1[0-9a-z]{20,}|seed phrase|mnemonic)/i;

// --- Bech32 / Bech32m checksum (BIP-173 / BIP-350; no length limit, as Cardano/Midnight need) ---
const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(v) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let chk = 1;
  for (const x of v) { const b = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= G[i]; }
  return chk >>> 0;
}
function bech32Valid(addr, hrp, spec) {
  if (addr !== addr.toLowerCase()) return false;
  const pos = addr.lastIndexOf('1');
  if (addr.slice(0, pos) !== hrp || pos < 1 || addr.length - pos - 1 < 6) return false;
  const data = [...addr.slice(pos + 1)].map((c) => CH.indexOf(c));
  if (data.includes(-1)) return false;
  const hrpExp = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
  return polymod(hrpExp.concat(data)) === (spec === 'bech32m' ? 0x2bc830a3 : 1);
}

// --- 1 & 2: display, checksum, QR file ---
const cache = {};
for (const [name, w] of Object.entries(WALLETS)) {
  const html = (cache[w.page] ||= read(w.page));
  const m = html.match(new RegExp(`<code[^>]*id="${w.id}"[^>]*>([^<]*)</code>`));
  assert(m, `${name}: address element #${w.id} missing on ${w.page}`);
  assert(m[1].trim() === w.address, `${name}: displayed address differs from pinned release address`);
  assert(bech32Valid(w.address, w.hrp, w.spec), `${name}: address fails ${w.spec} checksum`);
  assert(html.split(w.address).length === 2, `${name}: address must appear exactly once on ${w.page}`);
  const btn = new RegExp(`<button[^>]*data-copy-target="${w.id}"`);
  assert(btn.test(html), `${name}: copy button not bound to #${w.id}`);
  const qrFile = path.join(PUB, 'assets/images', w.qr);
  assert(fs.existsSync(qrFile), `${name}: QR image missing`);
  assert(crypto.createHash('sha256').update(fs.readFileSync(qrFile)).digest('hex') === w.sha, `${name}: QR image is not the verified release file`);
  assert(html.includes(`assets/images/${w.qr}"`), `${name}: page does not reference ${w.qr}`);
  assert(new RegExp(`assets/images/${w.qr}"[^>]*alt="QR code for the INDEX:80`).test(html), `${name}: QR alt text missing`);
}
// Card ↔ QR pairing on the About page: each card holds its own QR and address.
const about = cache['about/index.html'];
for (const key of ['cardano', 'bitcoin', 'midnight']) {
  const w = WALLETS[key];
  const card = about.match(new RegExp(`<article class="wallet-card" data-wallet="${key}">[\\s\\S]*?</article>`));
  assert(card && card[0].includes(w.qr) && card[0].includes(w.address), `${key}: card does not pair its QR with its address`);
}
assert(!/id="donation-address"/.test(about), 'legacy single-address block should be gone');
assert(/\$index80web/.test(about), 'Cardano handle $index80web missing');
assert(about.includes('Cardano mainnet') && about.includes('Bitcoin mainnet') && about.includes('Midnight mainnet'), 'network labels missing');
const registry = cache['registry/index.html'];
assert(!registry.includes(WALLETS.cardano.address) && !about.includes(WALLETS.registry.address), 'Registry and donations wallets must not appear on each other\'s page');
assert(/Separate from the donations wallet/.test(registry), 'Registry wallet separation notice missing');
assert(!/signed (by|with) this wallet|this wallet signed/i.test(registry), 'unsupported signer claim');

// Optional independent QR decode (OpenCV). Skipped where Python/OpenCV are unavailable.
const py = `
import sys,cv2
for f in sys.argv[1:]:
    im=cv2.copyMakeBorder(cv2.imread(f),40,40,40,40,cv2.BORDER_CONSTANT,value=(255,255,255))
    print(cv2.QRCodeDetector().detectAndDecode(im)[0])
`;
const dec = spawnSync('python3', ['-c', py, ...Object.values(WALLETS).map((w) => path.join(PUB, 'assets/images', w.qr))], { encoding: 'utf8' });
if (dec.status === 0) {
  const out = dec.stdout.trim().split('\n');
  Object.values(WALLETS).forEach((w, i) => assert(out[i] === w.address, `QR ${w.qr} decodes to a different value`));
  console.log('QR decode (OpenCV): all 4 codes match their displayed addresses');
} else console.log('QR decode: skipped (python3/OpenCV unavailable); pinned SHA-256 of verified files used');

// --- 4: nothing forbidden anywhere in shipped files ---
const scan = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['projects', 'people'].includes(e.name)) walk(p); } else if (/\.(html|js|css|json|md|txt|xml)$/.test(e.name)) scan.push(p); } })(PUB);
for (const f of scan) {
  const t = fs.readFileSync(f, 'utf8');
  for (const bad of FORBIDDEN) assert(!t.includes(bad), `forbidden address published in ${path.relative(ROOT, f)}`);
  if (/(about\/index\.html|registry\/index\.html|wallet-copy\.js)$/.test(f)) assert(!KEY_MATERIAL.test(t), `key-material pattern in ${path.relative(ROOT, f)}`);
}

// --- 3: copy behaviour, run the real script against a minimal DOM ---
function runCopy({ clipboard, execOk = true, target }) {
  const w = WALLETS[target];
  const listeners = {}; const state = { copied: null, execCopy: 0, selected: null, timers: [] };
  const el = { textContent: `\n  ${w.address}\n `, };
  const btn = { textContent: 'COPY ADDRESS', _a: {}, getAttribute(k) { return k === 'data-copy-target' ? w.id : this._a[k] ?? null; }, setAttribute(k, v) { this._a[k] = v; }, addEventListener(t, f) { listeners[t] = f; } };
  const sel = { removeAllRanges() {}, addRange() { state.selected = true; } };
  const ctx = {
    document: { querySelectorAll: () => [btn], getElementById: (id) => (id === w.id ? el : null), createRange: () => ({ selectNodeContents() {} }), execCommand: (c) => { if (c === 'copy') state.execCopy++; return execOk; } },
    window: { getSelection: () => sel },
    navigator: clipboard ? { clipboard: { writeText: (t) => { state.copied = t; return clipboard === 'reject' ? Promise.reject(new Error('denied')) : Promise.resolve(); } } } : {},
    setTimeout: (f) => state.timers.push(f),
  };
  ctx.Array = Array; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(PUB, 'assets/js/wallet-copy.js'), 'utf8'), ctx);
  listeners.click();
  return new Promise((r) => setImmediate(() => r({ state, btn, w })));
}
for (const key of Object.keys(WALLETS)) {
  let r = await runCopy({ clipboard: 'ok', target: key });
  assert(r.state.copied === r.w.address, `${key}: clipboard received wrong text`);
  assert(r.btn.textContent === 'COPIED ✓', `${key}: no success feedback`);
  r.state.timers.forEach((f) => f()); assert(r.btn.textContent === 'COPY ADDRESS', `${key}: label not restored`);
  r = await runCopy({ clipboard: 'reject', target: key });
  assert(r.state.execCopy === 1 && r.state.selected, `${key}: fallback not used after clipboard rejection`);
  r = await runCopy({ clipboard: null, target: key });
  assert(r.state.execCopy === 1 && r.btn.textContent === 'COPIED ✓', `${key}: fallback copy failed without Clipboard API`);
  r = await runCopy({ clipboard: null, execOk: false, target: key });
  assert(/SELECTED/.test(r.btn.textContent), `${key}: manual-copy prompt missing`);
}
console.log('Donation wallets test passed (4 wallets: display, checksum, QR, copy, exclusions).');

#!/usr/bin/env node
/**
 * INDEX:80 theme-system test (Option A).
 *
 * Static + functional checks for the two-theme / two-mode system:
 * hand-authored heads and generator templates load theme.js before
 * site.css, the four root states exist in CSS, the obsolete positional
 * cursor rule is gone, body[data-mode] semantics are untouched, and the
 * bootstrap validation/default logic behaves (via a DOM stub).
 *
 * Node core only. Usage: node scripts/test-theme-system.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const failures = [];

function check(name, cond) {
  if (cond) {
    console.log(`ok - ${name}`);
  } else {
    failures.push(name);
    console.error(`FAIL - ${name}`);
  }
}

function collectHtml(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'projects') continue; /* generated: covered via template */
      collectHtml(full, out);
    } else if (entry.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

/* --- 1. theme.js bootstrap content --- */
const themeJs = readFileSync(join(PUBLIC_HTML, 'assets/js/theme.js'), 'utf8');
check('theme.js reads index80-theme key', themeJs.includes('index80-theme'));
check('theme.js reads index80-color-mode key', themeJs.includes('index80-color-mode'));
check('theme.js validates web1|arcade', themeJs.includes("'web1', 'arcade'") || themeJs.includes('"web1", "arcade"'));
check('theme.js validates light|dark', themeJs.includes("'light', 'dark'") || themeJs.includes('"light", "dark"'));
check('theme.js sets data-theme on documentElement', themeJs.includes("setAttribute('data-theme'") || themeJs.includes('setAttribute("data-theme"'));
check('theme.js sets data-color-mode on documentElement', themeJs.includes('data-color-mode'));
check('theme.js bootstrap runs before CSS (no defer/async trick)', !/async|defer/.test(themeJs.split('apply(currentTheme')[0] || ''));
check('theme.js independent of analytics', !themeJs.includes('analytics_consent') && !themeJs.includes('createElement(\'script\')'));
check('theme.js creates four controls with aria-pressed', themeJs.includes('theme-controls') && themeJs.includes('aria-pressed') && (themeJs.match(/makeKey\('/g) || []).length === 4);
check('theme.js never writes body[data-mode]', !themeJs.includes('setAttribute(\'data-mode\'') && !themeJs.includes('dataset.mode'));
check('theme.js localStorage access is guarded', themeJs.includes('try') && themeJs.includes('localStorage'));

/* --- 2. theme.js bootstrap behaviour via DOM stub --- */
function runBootstrap(stored) {
  const attrs = {};
  const listeners = {};
  const store = { ...(stored || {}) };
  const windowStub = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    addEventListener: () => {},
  };
  const documentStub = {
    readyState: 'complete',
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: null,
  };
  const sandbox = { window: windowStub, document: documentStub, localStorage: windowStub.localStorage };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(themeJs, sandbox, { filename: 'theme.js' });
  return { attrs, api: sandbox.window.INDEX80Theme, store };
}

let r = runBootstrap({});
check('bootstrap defaults to web1/light when storage empty', r.attrs['data-theme'] === 'web1' && r.attrs['data-color-mode'] === 'light');
r = runBootstrap({ 'index80-theme': 'terminal', 'index80-color-mode': 'auto' });
check('bootstrap rejects terminal/auto, falls back to web1/light', r.attrs['data-theme'] === 'web1' && r.attrs['data-color-mode'] === 'light');
r = runBootstrap({ 'index80-theme': 'arcade', 'index80-color-mode': 'dark' });
check('bootstrap applies saved arcade/dark before paint', r.attrs['data-theme'] === 'arcade' && r.attrs['data-color-mode'] === 'dark');
r = runBootstrap({});
r.api.setTheme('arcade');
check('setTheme persists valid theme', r.store['index80-theme'] === 'arcade' && r.attrs['data-theme'] === 'arcade');
r.api.setTheme('terminal');
check('setTheme ignores invalid theme', r.store['index80-theme'] === 'arcade');
r.api.setMode('dark');
check('setMode persists valid mode', r.store['index80-color-mode'] === 'dark' && r.attrs['data-color-mode'] === 'dark');
r.api.setMode('auto');
check('setMode ignores AUTO', r.store['index80-color-mode'] === 'dark');

/* --- 3. site.css states, controls, cursor --- */
const siteCss = readFileSync(join(PUBLIC_HTML, 'assets/css/site.css'), 'utf8');
for (const combo of ['web1"][data-color-mode="light', 'web1"][data-color-mode="dark', 'arcade"][data-color-mode="light', 'arcade"][data-color-mode="dark']) {
  check(`site.css defines html[data-theme="${combo}..."]`, siteCss.includes(`html[data-theme="${combo}`));
}
check('site.css styles .theme-controls/.theme-key', siteCss.includes('.theme-controls') && siteCss.includes('.theme-key'));
check('site.css marks active key via aria-pressed', siteCss.includes('.theme-key[aria-pressed="true"]'));
check('site.css has 640px second-row system-bar rule', siteCss.includes('@media (max-width: 640px)') && siteCss.includes('grid-template-areas'));
check('obsolete .system-bar span:last-child::after rule removed', !siteCss.includes('.system-bar span:last-child::after'));
check('cursor keyframes kept for wordmark', siteCss.includes('@keyframes cursor-blink'));
check('body[data-mode] accents preserved', siteCss.includes('body[data-mode="home"]') && siteCss.includes('body[data-mode="project"]'));
check('data-family accents preserved', siteCss.includes('body[data-family="defi-markets"]'));

/* --- 3b. arcade-only directory reach; WEB 1.0 untouched --- */
check('arcade light styles category chips', siteCss.includes('html[data-theme="arcade"][data-color-mode="light"] .cat-chip'));
check('arcade dark styles category chips with yellow active', siteCss.includes('html[data-theme="arcade"][data-color-mode="dark"] .cat-chip.active'));
check('arcade directory header/rows/search reach', siteCss.includes('html[data-theme="arcade"][data-color-mode="dark"] .dir-head') && siteCss.includes('html[data-theme="arcade"][data-color-mode="light"] .dir-row:hover') && siteCss.includes('html[data-theme="arcade"][data-color-mode="dark"] .search-box'));
check('arcade inactive chips use 1px border, no offset shadow', siteCss.includes('html[data-theme="arcade"][data-color-mode="light"] .cat-chip { border:1px solid var(--magenta)') && siteCss.includes('html[data-theme="arcade"][data-color-mode="dark"] .cat-chip { border:1px solid var(--magenta)'));
check('arcade dir-icon explicitly coloured with fill', siteCss.includes('html[data-theme="arcade"][data-color-mode="dark"] .dir-icon { color:var(--cyan); fill:currentColor; }') && siteCss.includes('html[data-theme="arcade"][data-color-mode="light"] .dir-icon { color:var(--magenta); fill:currentColor; }'));
const web1ComponentRules = siteCss.split('\n').filter((l) => l.includes('html[data-theme="web1"]') && !l.trim().endsWith('{'));
check('no web1-scoped component overrides (palette blocks only)', web1ComponentRules.length === 0);

/* --- 3c. arcade emoji accents: arcade-scoped pseudo-elements only --- */
const emojiRules = siteCss.split('\n').filter((l) => /\\1F3AE|\\1F579|\\1F47E/.test(l));
check('arcade emoji accents present (game controller, joystick, invader)', ['\\1F3AE', '\\1F579', '\\1F47E'].every((cp) => emojiRules.some((l) => l.includes(cp))));
check('every emoji rule is arcade-scoped and a pseudo-element', emojiRules.length > 0 && emojiRules.every((l) => l.startsWith('html[data-theme="arcade"]') && l.includes('::')));
check('emoji accents carry empty alt text (decorative)', emojiRules.every((l) => l.includes('/ ""')));
check('theme.js labels/markup unchanged by emoji accents (no emoji in JS)', !/[\u{1F300}-\u{1FAFF}]/u.test(themeJs));

/* --- 4. main-core.js cursor + nav tokens --- */
const mainCore = readFileSync(join(PUBLIC_HTML, 'assets/js/main-core.js'), 'utf8');
check('main-core.js suppression of obsolete cursor removed', !mainCore.includes('.system-bar span:last-child::after'));
check('main-core.js keeps wordmark cursor', mainCore.includes('.wordmark::after'));
check('main-core.js nav states use theme tokens', mainCore.includes('var(--nav-hover-bg)') && mainCore.includes('var(--nav-active-bg)'));
check('main-core.js arcade panel-title accents only', mainCore.includes('html[data-theme="arcade"] .panel-title::before') && !mainCore.includes('html[data-theme="web1"]'));

/* --- 5. every site.css page loads theme.js first --- */
const htmlFiles = collectHtml(PUBLIC_HTML);
let checkedHeads = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  if (!html.includes('site.css')) continue; /* standalone dev page */
  const themeIdx = html.indexOf('theme.js');
  const cssIdx = html.indexOf('site.css');
  const rel = file.slice(PUBLIC_HTML.length + 1);
  check(`${rel} loads theme.js before site.css`, themeIdx !== -1 && themeIdx < cssIdx);
  checkedHeads++;
}
// The public source repository does not ship the registry admin page (one of the 14 checked pages).
const expectedHeads = existsSync(join(ROOT, '.public-repo')) ? 13 : 14;
check(`head wiring checked on ${checkedHeads} pages (expected >= ${expectedHeads})`, checkedHeads >= expectedHeads);

/* --- 6. generator templates --- */
const projectGen = readFileSync(join(ROOT, 'scripts/generate-project-pages.mjs'), 'utf8');
check('project generator injects theme.js before site.css', projectGen.indexOf('/assets/js/theme.js') !== -1 && projectGen.indexOf('/assets/js/theme.js') < projectGen.indexOf('/assets/css/site.css'));
check('project generator keeps body[data-mode="project"]', projectGen.includes('data-mode=\\"project\\"') || projectGen.includes('data-mode="project"'));
check('project generator tags system-status', projectGen.includes('system-status'));
const registryGen = readFileSync(join(ROOT, 'scripts/generate-registry-history.mjs'), 'utf8');
check('registry generator injects theme.js before site.css', registryGen.indexOf('assets/js/theme.js') !== -1 && registryGen.indexOf('assets/js/theme.js') < registryGen.indexOf('assets/css/site.css'));
check('registry generator keeps body[data-mode]', registryGen.includes('data-mode=\\"data\\"') || registryGen.includes('data-mode="data"'));

/* --- 7. storage key hygiene --- */
const analytics = readFileSync(join(PUBLIC_HTML, 'assets/js/analytics.js'), 'utf8');
const consentKey = (analytics.match(/CONSENT_KEY = '([^']+)'/) || [])[1];
check('analytics consent key untouched', consentKey === 'index80_analytics_consent');
check('theme keys do not collide with analytics key', !['index80-theme', 'index80-color-mode'].includes(consentKey));

if (failures.length) {
  console.error(`\n[test-theme-system] ${failures.length} failure(s).`);
  process.exitCode = 1;
} else {
  console.log('\n[test-theme-system] all checks passed.');
}

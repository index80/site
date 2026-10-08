#!/usr/bin/env node
/**
 * Behaviour test for public_html/assets/js/signals-ticker.js (part of the
 * build; also npm run test:signals).
 *
 * Runs the real browser script in a vm against a minimal DOM shim built from
 * the generated, semantic-inked strip markup, with fake timers and fake media
 * queries, so it is deterministic and needs no dependencies. It proves:
 * wide screens run a continuous marquee with an inert copy; narrow screens
 * show one headline at a time and advance in sequence; reduced motion is
 * static with nothing advancing and no PAUSE; hover, keyboard focus, touch,
 * a hidden tab and PAUSE all stop movement; clicking or focusing a headline
 * selects its detail; expired signals are removed; ink spans survive intact;
 * and the script never rewrites prose.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { renderSignals } from './lib/signals.mjs';
import { inkHtml } from './lib/semantic-ink.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = readFileSync(join(ROOT, 'public_html', 'assets', 'js', 'signals-ticker.js'), 'utf8');
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error(`FAIL: ${msg}`); } };

// ---- minimal DOM ------------------------------------------------------------
class Text { constructor(text) { this.text = text; this.parentNode = null; } get textContent() { return this.text; } }
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this.listeners = {}; this.hidden = false; this.offsetWidth = 0; this.scrollWidth = 0; this.clientWidth = 0; this.focusVisible = false; this.style = { props: {}, setProperty(k, v) { this.props[k] = v; } }; }
  get children() { return this.childNodes.filter((n) => n instanceof El); }
  get firstChild() { return this.childNodes[0] || null; }
  get id() { return this.getAttribute('id') || ''; }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  hasAttribute(n) { return this.attrs.has(n); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  set type(v) { this.setAttribute('type', v); }
  set tabIndex(v) { this.setAttribute('tabindex', v); }
  get tabIndex() { return Number(this.getAttribute('tabindex') ?? 0); }
  get classList() {
    const get = () => this.className.split(/\s+/).filter(Boolean);
    const set = (a) => { this.className = [...new Set(a)].join(' '); };
    return {
      add: (...c) => set([...get(), ...c]),
      remove: (...c) => set(get().filter((x) => !c.includes(x))),
      contains: (c) => get().includes(c),
      toggle: (c, force) => { const want = force === undefined ? !get().includes(c) : Boolean(force); set(want ? [...get(), c] : get().filter((x) => x !== c)); return want; },
    };
  }
  get dataset() {
    const key = (k) => 'data-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    return new Proxy({}, { get: (_, k) => this.getAttribute(key(k)) ?? undefined, set: (_, k, v) => { this.setAttribute(key(k), v); return true; } });
  }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.childNodes = []; this.append(new Text(String(v))); }
  append(...nodes) { for (const n of nodes) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); } }
  removeChild(n) { this.childNodes = this.childNodes.filter((x) => x !== n); n.parentNode = null; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceWith(n) { const p = this.parentNode; const i = p.childNodes.indexOf(this); if (n.parentNode) n.parentNode.removeChild(n); p.childNodes[i] = n; n.parentNode = p; this.parentNode = null; }
  after(n) { const p = this.parentNode; if (n.parentNode) n.parentNode.removeChild(n); p.childNodes.splice(p.childNodes.indexOf(this) + 1, 0, n); n.parentNode = p; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  cloneNode(deep) { const c = new El(this.tagName); for (const [k, v] of this.attrs) c.attrs.set(k, v); c.hidden = this.hidden; if (deep) for (const n of this.childNodes) c.append(n instanceof El ? n.cloneNode(true) : new Text(n.text)); return c; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  dispatch(t, ev = {}) {
    const event = { type: t, target: this, ...ev };
    for (let x = this; x; x = x.parentNode) {
      for (const f of x.listeners[t] || []) f(event);
      if (t === 'mouseenter' || t === 'mouseleave' || t === 'focus') break;
    }
  }
  matches(sel) { return sel === ':focus-visible' ? this.focusVisible : matchSel(this, sel); }
  querySelectorAll(sel) { const out = []; const walk = (e) => { for (const c of e.children) { if (matchSel(c, sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function matchSel(el, sel) {
  let m;
  if ((m = /^\[([\w-]+)\]$/.exec(sel))) return el.hasAttribute(m[1]);
  if ((m = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel))) return el.getAttribute(m[1]) === m[2];
  if ((m = /^\.([\w-]+)$/.exec(sel))) return el.classList.contains(m[1]);
  if (/^[a-z]+$/.test(sel)) return el.tagName === sel.toUpperCase();
  throw new Error(`shim: unsupported selector ${sel}`);
}
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function parse(html) {
  const body = new El('body');
  const stack = [body];
  for (const [tok] of html.matchAll(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
    if (tok.startsWith('<!--')) continue;
    const close = /^<\/([a-zA-Z0-9]+)/.exec(tok);
    if (close) { stack.pop(); continue; }
    const open = /^<([a-zA-Z0-9]+)([^>]*)>$/.exec(tok);
    if (open) {
      const el = new El(open[1]);
      for (const a of open[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
        if (a[1] === 'hidden') el.hidden = true; else el.setAttribute(a[1], decode(a[2] ?? ''));
      }
      stack[stack.length - 1].append(el);
      stack.push(el);
      continue;
    }
    stack[stack.length - 1].append(new Text(decode(tok)));
  }
  return body;
}

// ---- harness ---------------------------------------------------------------
const DAY = 86400000;
const NOW = Date.parse('2026-10-07T12:00:00Z');
const base = { date: '2026-10-05', type: 'PROTOCOL', impact: 'HIGH', summary: 'Now live on Cardano mainnet for the community.', why_it_matters: 'x',
  primary_url: 'https://example.org/s', source_label: 'Source', related_project_slugs: [], related_person_slugs: [], tags: [], show_current: true, status: 'LIVE' };
const FIXTURE = [
  { ...base, id: 'one', headline: 'Alpha live on Cardano mainnet', expires_at: null },
  { ...base, id: 'gone', headline: 'Expired yesterday', expires_at: '2026-10-06' },
  { ...base, id: 'two', headline: 'Beta governance vote is open', expires_at: '2026-10-07' },
  { ...base, id: 'three', headline: 'Gamma pays in ADA', expires_at: null },
];

function setup({ wide = true, reduce = false, fixture = FIXTURE, listWidth = 2400, tickerWidth = 900 } = {}) {
  const html = inkHtml(`<main>${renderSignals(fixture, {})}</main>`);
  const body = parse(html);
  const root = body.querySelector('[data-signals]');
  root.querySelector('[data-signals-ticker-list]').scrollWidth = listWidth;
  root.querySelector('[data-signals-ticker]').clientWidth = tickerWidth;
  const timers = [];
  let clock = 0;
  const media = {};
  const mq = (q, matches) => (media[q] = { matches, listeners: [], addEventListener(t, f) { this.listeners.push(f); }, set(v) { this.matches = v; this.listeners.forEach((f) => f({ matches: v })); } });
  mq('(prefers-reduced-motion: reduce)', reduce);
  mq('(max-width: 720px)', !wide);
  const docListeners = {};
  const document = {
    readyState: 'complete', hidden: false, body,
    createElement: (t) => new El(t),
    getElementById: (id) => [body, ...body.querySelectorAll('[id]')].find((e) => e.id === id) || null,
    querySelectorAll: (s) => body.querySelectorAll(s),
    addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); },
  };
  const context = {
    document,
    Date: class extends Date { static now() { return NOW; } },
    setTimeout: (f, ms) => { const t = { f, at: clock + ms, id: timers.length + 1 }; timers.push(t); return t.id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
  };
  context.window = { matchMedia: (q) => media[q] || { matches: false }, addEventListener() {} };
  vm.runInNewContext(SCRIPT, context);
  const tick = (ms) => {
    const end = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      clock = next.at;
      next.f();
    }
    clock = end;
  };
  const list = root.querySelector('[data-signals-ticker-list]');
  const buttons = () => list.querySelectorAll('button');
  const shown = () => root.querySelectorAll('[data-signal-id]').filter((d) => !d.hidden).map((d) => d.getAttribute('data-signal-id'));
  const pause = root.querySelector('.signals-key');
  const status = root.children.find((c) => c.getAttribute('aria-live') === 'polite');
  const visibility = (hidden) => { document.hidden = hidden; (docListeners.visibilitychange || []).forEach((f) => f()); };
  return { root, list, buttons, shown, pause, status, tick, media, visibility, mode: () => root.getAttribute('data-signals-mode') };
}

// 1. Wide screen: continuous marquee with an inert, unfocusable copy.
{
  const t = setup();
  ok(t.mode() === 'marquee', `wide + motion runs the marquee (got ${t.mode()})`);
  ok(t.root.querySelector('.signals-track')?.style.props['--signals-duration'] === '75s', 'marquee speed is slow (2400px at 32px/s = 75s)');
  const clone = t.root.querySelector('.signals-ticker-clone');
  ok(clone && clone.getAttribute('aria-hidden') === 'true' && clone.hasAttribute('inert') && clone.querySelectorAll('button').every((b) => b.tabIndex === -1), 'marquee copy is aria-hidden, inert and unfocusable');
  ok(!t.root.querySelector('[data-signal-id="gone"]') && !t.list.querySelectorAll('[data-signal-ref]').some((li) => li.getAttribute('data-signal-ref') === 'gone'), 'expired signal removed from ticker and detail');
  ok(t.buttons().length === 3 && t.buttons().every((b) => b.getAttribute('aria-controls')?.startsWith('signal-')), 'each live headline is a button controlling its detail');
  ok(JSON.stringify(t.buttons().map((b) => b.textContent)) === JSON.stringify(['Alpha live on Cardano mainnet', 'Beta governance vote is open', 'Gamma pays in ADA']), 'headline text is unchanged by the script');
  ok(t.buttons()[0].querySelectorAll('.ink').length >= 2 && t.buttons()[2].querySelector('.ink-gold')?.textContent === 'ADA', 'semantic-ink spans survive inside the headline buttons');
  ok(JSON.stringify(t.shown()) === '["one"]' && t.buttons()[0].getAttribute('aria-current') === 'true', 'first signal selected by default; one detail shown');
  ok(t.pause && !t.pause.hidden && t.pause.textContent === 'PAUSE' && t.pause.getAttribute('aria-pressed') === 'false', 'minimal PAUSE control shown while moving');
  t.tick(30000);
  ok(JSON.stringify(t.shown()) === '["one"]', 'on wide screens the detail stays on the selected signal while headlines scroll');
  t.root.dispatch('mouseenter');
  ok(t.root.classList.contains('is-paused'), 'hover pauses the marquee');
  t.root.dispatch('mouseleave');
  ok(!t.root.classList.contains('is-paused'), 'leaving resumes the marquee');
  t.buttons()[2].dispatch('click');
  ok(JSON.stringify(t.shown()) === '["three"]' && t.buttons()[2].getAttribute('aria-current') === 'true' && t.buttons()[0].getAttribute('aria-current') === 'false', 'clicking a headline selects its detail');
  ok(/Showing signal 3 of 3: Gamma pays in ADA/.test(t.status?.textContent || ''), 'manual selection is announced politely');
  clone.querySelectorAll('[data-signal-ref]')[1].dispatch('click');
  ok(JSON.stringify(t.shown()) === '["two"]', 'clicking a headline in the scrolling copy selects the same signal');
  t.buttons()[0].dispatch('focus');
  ok(JSON.stringify(t.shown()) === '["one"]', 'focusing a headline selects it');
  t.buttons()[0].dispatch('focusin');
  ok(t.mode() === 'marquee', 'mouse focus (not focus-visible) does not re-lay out under the pointer');
  t.buttons()[1].focusVisible = true;
  t.buttons()[1].dispatch('focusin');
  ok(t.mode() === 'static' && t.root.classList.contains('is-paused'), 'keyboard focus stops movement and lays every headline out in place');
  t.buttons()[1].dispatch('focusout', { relatedTarget: t.buttons()[2] });
  ok(t.mode() === 'static', 'moving focus between headlines stays static');
  t.buttons()[2].dispatch('focusout', { relatedTarget: null });
  ok(t.mode() === 'marquee' && !t.root.classList.contains('is-paused'), 'focus leaving the strip resumes the marquee');
  t.pause.dispatch('click');
  ok(t.root.classList.contains('is-paused') && t.pause.textContent === 'PLAY' && t.pause.getAttribute('aria-pressed') === 'true' && t.pause.getAttribute('aria-label') === 'Resume signal headlines', 'PAUSE stops movement and becomes PLAY');
  t.pause.dispatch('click');
  ok(!t.root.classList.contains('is-paused'), 'PLAY resumes');
  t.visibility(true);
  ok(t.root.classList.contains('is-paused'), 'a hidden tab pauses movement');
  t.visibility(false);
  t.root.dispatch('touchstart');
  ok(t.root.classList.contains('is-paused') && t.pause.textContent === 'PLAY', 'touch pauses movement until resumed');
}

// 2. Narrow screen: one complete headline at a time, advancing with its detail.
{
  const t = setup({ wide: false });
  ok(t.mode() === 'step', `narrow + motion steps one headline at a time (got ${t.mode()})`);
  const active = () => t.list.querySelectorAll('.signal-tick').filter((li) => li.classList.contains('is-active')).map((li) => li.getAttribute('data-signal-ref'));
  ok(JSON.stringify(active()) === '["one"]' && JSON.stringify(t.shown()) === '["one"]', 'one active headline with its detail');
  t.tick(6999);
  ok(JSON.stringify(active()) === '["one"]', 'holds each headline for 7 seconds');
  t.tick(1);
  ok(JSON.stringify(active()) === '["two"]' && JSON.stringify(t.shown()) === '["two"]', 'advances to the next headline and detail');
  ok(t.status.textContent === '', 'automatic advance is not announced');
  t.tick(7000);
  t.tick(7000);
  ok(JSON.stringify(active()) === '["one"]', 'wraps back to the first headline');
  t.root.dispatch('mouseenter');
  t.tick(30000);
  ok(JSON.stringify(active()) === '["one"]', 'hover holds the current headline');
  t.root.dispatch('mouseleave');
  t.pause.dispatch('click');
  t.tick(30000);
  ok(JSON.stringify(active()) === '["one"]' && !t.pause.hidden, 'PAUSE holds the current headline');
  t.pause.dispatch('click');
  t.buttons()[0].focusVisible = true;
  t.buttons()[0].dispatch('focusin');
  ok(t.mode() === 'static', 'keyboard focus on a phone lists every headline so none is unreachable');
  t.tick(30000);
  ok(JSON.stringify(t.shown()) === '["one"]', 'nothing advances while keyboard focus is inside');
}

// 3. Reduced motion: static, nothing advances, no PAUSE; selection still works; live switch.
{
  const t = setup({ reduce: true, wide: false });
  ok(t.mode() === 'static' && t.pause.hidden, 'reduced motion: static headlines and no PAUSE control');
  t.tick(60000);
  ok(JSON.stringify(t.shown()) === '["one"]', 'reduced motion: nothing advances on its own');
  t.buttons()[1].dispatch('click');
  ok(JSON.stringify(t.shown()) === '["two"]', 'reduced motion: every headline remains selectable');
  t.media['(prefers-reduced-motion: reduce)'].set(false);
  ok(t.mode() === 'step', 'switching motion back on resumes stepping');
  t.media['(prefers-reduced-motion: reduce)'].set(true);
  ok(t.mode() === 'static', 'switching reduced motion on stops it again');
  t.media['(max-width: 720px)'].set(false);
  t.media['(prefers-reduced-motion: reduce)'].set(false);
  ok(t.mode() === 'marquee', 'widening the screen with motion on starts the marquee');
}

// 4. Short headline sets do not scroll; all-expired hides the strip.
{
  const t = setup({ listWidth: 500, tickerWidth: 900 });
  ok(t.mode() === 'static' && t.pause.hidden, 'headlines that fit the strip stay static (nothing to scroll)');
  for (const wide of [true, false]) {
    const single = setup({ fixture: [FIXTURE[0]], wide, listWidth: 2400, tickerWidth: 900 });
    ok(single.mode() === 'static' && single.pause.hidden, 'a single headline stays static on desktop and mobile, even when long');
  }
  const g = setup({ fixture: [FIXTURE[1]] });
  ok(g.root.hidden === true, 'strip hides itself when every signal has expired');
}

if (failures) { console.error(`[test-signals-ticker] ${failures} failure(s)`); process.exit(1); }
console.log('[test-signals-ticker] OK — marquee, one-at-a-time step, reduced motion, pause (hover/focus/touch/tab/PAUSE), selection, expiry and ink preservation verified');

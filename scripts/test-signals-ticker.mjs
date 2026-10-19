#!/usr/bin/env node
/** Dependency-free runtime regression: measured overflow at every width,
 * single headlines, stable animation through resize/font/theme changes,
 * explicit PAUSE/PLAY, pointer/touch continuity, reduced motion, keyboard,
 * selected details, accessible copies, expiry and semantic ink. */
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
  getBoundingClientRect() { return { width: this.scrollWidth }; }
  animate(keyframes, options) { return this.onAnimate(keyframes, options); }
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

function setup({ reduce = false, fixture = FIXTURE, listWidth = 2400, tickerWidth = 900 } = {}) {
  const body = parse(inkHtml(`<main>${renderSignals(fixture, {})}</main>`));
  const root = body.querySelector('[data-signals]');
  const original = root.querySelector('[data-signals-ticker-list]');
  const ticker = root.querySelector('[data-signals-ticker]');
  original.scrollWidth = listWidth;
  ticker.clientWidth = tickerWidth;
  const timers = [], animations = [], observers = [], mutations = [];
  let clock = 0, nextId = 0;
  const media = {};
  const mq = (q, matches) => (media[q] = { matches, listeners: [], addEventListener(t, f) { this.listeners.push(f); }, set(v) { this.matches = v; this.listeners.forEach((f) => f({ matches: v })); } });
  mq('(prefers-reduced-motion: reduce)', reduce);
  const docListeners = {}, winListeners = {}, fontListeners = {};
  const document = {
    readyState: 'complete', hidden: false, body, documentElement: body,
    fonts: { ready: { then(f) { fontListeners.ready = f; } }, addEventListener(t, f) { fontListeners[t] = f; } },
    createElement(t) {
      const el = new El(t);
      el.onAnimate = (keyframes, options) => {
        const animation = { keyframes, options, currentTime: 0, playState: 'running',
          pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; }, cancel() { this.playState = 'idle'; } };
        animations.push(animation); return animation;
      };
      return el;
    },
    getElementById: (id) => [body, ...body.querySelectorAll('[id]')].find((e) => e.id === id) || null,
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); },
  };
  class ResizeObserver { constructor(f) { observers.push(f); } observe() {} }
  class MutationObserver { constructor(f) { mutations.push(f); } observe() {} }
  const context = {
    document, ResizeObserver, MutationObserver,
    Date: class extends Date { static now() { return NOW; } },
    requestAnimationFrame: (f) => { const t = { f, at: clock + 16, id: ++nextId }; timers.push(t); return t.id; },
  };
  context.window = { ResizeObserver, MutationObserver, matchMedia: (q) => media[q] || { matches: false }, addEventListener(t, f) { (winListeners[t] ||= []).push(f); } };
  vm.runInNewContext(SCRIPT, context);
  const advance = (to) => { for (const a of animations) if (a.playState === 'running') a.currentTime += to - clock; clock = to; };
  const tick = (ms) => {
    const end = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift(); advance(next.at); next.f();
    }
    advance(end);
  };
  const list = root.querySelector('[data-signals-ticker-list]');
  const buttons = () => list.querySelectorAll('button');
  const shown = () => root.querySelectorAll('[data-signal-id]').filter((d) => !d.hidden).map((d) => d.getAttribute('data-signal-id'));
  const status = root.children.find((c) => c.getAttribute('aria-live') === 'polite');
  return { root, list, buttons, shown, status, tick, media, animations,
    pause: root.querySelector('.signals-key'), mode: () => root.getAttribute('data-signals-mode'),
    animation: () => animations[animations.length - 1],
    visibility(hidden) { document.hidden = hidden; (docListeners.visibilitychange || []).forEach((f) => f()); },
    resize(width, event = 'resize') { ticker.clientWidth = width; (winListeners[event] || []).forEach((f) => f()); tick(16); },
    containerResize(width) { ticker.clientWidth = width; observers.forEach((f) => f()); tick(16); },
    font(width, event = 'loadingdone') { list.scrollWidth = width; fontListeners[event](); tick(16); },
    theme(width = list.scrollWidth) { list.scrollWidth = width; mutations.forEach((f) => f()); tick(16); },
    key() { (docListeners.keydown || []).forEach((f) => f()); },
  };
}

// Identical measured overflow rule on desktop, narrow windows and mobile.
for (const width of [1200, 719, 390, 240]) {
  const t = setup({ tickerWidth: width });
  ok(t.mode() === 'marquee', `${width}px available: overflowing headlines use the continuous loop`);
  const animation = t.animation();
  ok(animation.options.duration === 75000 && animation.options.iterations === Infinity, 'constant 32px/s continuous loop');
  ok(animation.keyframes[1].transform === 'translateX(-2400px)', 'loop advances exactly one original track including its trailing separator');
  t.tick(7000);
  ok(animation.currentTime === 7000 && JSON.stringify(t.shown()) === '["one"]', 'continuous movement preserves selected detail without a mobile step timer');
}

// Markup, expiry, selected details and accessible duplicate.
{
  const t = setup();
  const clone = t.root.querySelector('.signals-ticker-clone');
  ok(clone.getAttribute('aria-hidden') === 'true' && clone.querySelectorAll('button').every((b) => b.tabIndex === -1 && !b.hasAttribute('aria-controls')), 'copy is hidden from assistive technology and keyboard navigation');
  ok(!clone.hasAttribute('inert'), 'visible looping copy remains pointer-selectable');
  ok(!t.root.querySelector('[data-signal-id="gone"]') && !t.list.querySelectorAll('[data-signal-ref]').some((li) => li.getAttribute('data-signal-ref') === 'gone'), 'expired headline and detail removed');
  ok(t.buttons().length === 3 && t.buttons().every((b) => b.getAttribute('aria-controls')?.startsWith('signal-')), 'each original headline controls its detail');
  ok(JSON.stringify(t.buttons().map((b) => b.textContent)) === JSON.stringify(['Alpha live on Cardano mainnet', 'Beta governance vote is open', 'Gamma pays in ADA']), 'headline text unchanged');
  ok(t.buttons()[0].querySelectorAll('.ink').length >= 2 && t.buttons()[2].querySelector('.ink-gold')?.textContent === 'ADA', 'semantic ink spans preserved');
  t.buttons()[2].dispatch('click');
  ok(JSON.stringify(t.shown()) === '["three"]' && t.buttons()[2].getAttribute('aria-current') === 'true', 'selection changes the detail and current indicator');
  ok(t.status.textContent.includes('Showing signal 3 of 3: Gamma pays in ADA'), 'manual selection announced politely');
  clone.querySelectorAll('[data-signal-ref]')[1].dispatch('click');
  ok(JSON.stringify(t.shown()) === '["two"]', 'selecting the loop copy selects the original detail');
  t.buttons()[0].dispatch('focus');
  ok(JSON.stringify(t.shown()) === '["one"]', 'focusing an original headline selects its detail');
}

// Short sets fit, but a single long headline must also scroll.
for (const width of [900, 300]) {
  const fit = setup({ fixture: [FIXTURE[0]], listWidth: 180, tickerWidth: width });
  ok(fit.mode() === 'static' && fit.pause.hidden && fit.animations.length === 0, 'fitting single headline does not animate');
  const long = setup({ fixture: [FIXTURE[0]], listWidth: 1500, tickerWidth: width });
  ok(long.mode() === 'marquee' && !long.pause.hidden, 'single overflowing headline scrolls at desktop and mobile widths');
}
{
  const fit = setup({ listWidth: 500, tickerWidth: 900 });
  ok(fit.mode() === 'static' && fit.pause.hidden, 'multiple fitting headlines remain static');
  const gone = setup({ fixture: [FIXTURE[1]] });
  ok(gone.root.hidden === true && gone.animations.length === 0, 'all-expired hides strip without animation');
}

// Hover, touch and scroll never pause; PAUSE/PLAY intentionally does.
{
  const t = setup({ tickerWidth: 300 });
  const a = t.animation();
  for (const event of ['mouseenter', 'pointerenter', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'mouseleave']) {
    t.root.dispatch(event, { pointerType: 'touch', touches: [] });
    const before = a.currentTime; t.tick(1000);
    ok(a.currentTime === before + 1000 && !t.root.classList.contains('is-paused') && t.pause.getAttribute('aria-pressed') === 'false', `${event} does not pause movement`);
  }
  t.root.dispatch('pointerenter', { pointerType: 'mouse' }); t.tick(1000);
  ok(a.playState === 'running', 'genuine desktop hover no longer pauses');
  t.buttons()[1].dispatch('touchstart'); t.buttons()[1].focusVisible = true; t.buttons()[1].dispatch('focusin'); t.buttons()[1].dispatch('touchend', { touches: [] }); t.buttons()[1].dispatch('click');
  ok(t.mode() === 'marquee' && a.playState === 'running' && JSON.stringify(t.shown()) === '["two"]', 'touch focus and selection preserve continuous movement');
  t.pause.dispatch('click'); const held = a.currentTime; t.tick(30000);
  ok(a.currentTime === held && t.pause.textContent === 'PLAY' && t.pause.getAttribute('aria-pressed') === 'true', 'PAUSE freezes current scroll position');
  t.root.dispatch('touchstart'); t.root.dispatch('touchcancel', { touches: [] });
  ok(a.playState === 'paused', 'touch does not clear intentional PAUSE');
  t.resize(250); ok(t.animation() === a && a.currentTime === held, 'resizing preserves intentional pause and position');
  t.pause.dispatch('click'); t.tick(1000);
  ok(a.currentTime === held + 1000 && t.pause.textContent === 'PAUSE', 'PLAY continues from retained position');
  t.visibility(true); const hidden = a.currentTime; t.tick(5000);
  ok(a.currentTime === hidden, 'hidden document stops background animation');
  t.visibility(false); t.tick(1000); ok(a.currentTime === hidden + 1000, 'visible document resumes without resetting');
}

// Live resize and measurement events keep the animation unless width changes.
{
  const t = setup({ listWidth: 600, tickerWidth: 900 });
  t.resize(300); ok(t.mode() === 'marquee', 'resize from fit to overflow starts scrolling');
  const a = t.animation(); t.tick(3000);
  t.resize(450); t.resize(250, 'orientationchange'); t.containerResize(350); t.theme(); t.font(600, 'ready'); t.font(600, 'loadingerror');
  ok(t.animation() === a && a.currentTime > 3000, 'viewport/orientation/container/theme/font events do not reset unchanged track');
  const distance = (a.currentTime / 1000 * 32) % 600;
  t.font(800);
  ok(t.animation() !== a && a.playState === 'idle', 'changed font metrics update loop geometry');
  ok(Math.abs(t.animation().currentTime * 32 / 1000 - (distance + .512)) < .001, 'font resize retains travelled pixel position');
  const b = t.animation(); t.resize(1000); const held = b.currentTime; t.tick(5000);
  ok(t.mode() === 'static' && t.pause.hidden && b.currentTime === held, 'widening until content fits stops movement');
  t.resize(300); t.tick(1000);
  ok(t.mode() === 'marquee' && t.animation() === b && b.currentTime > held, 'narrowing resumes retained animation');
}

// Reduced motion and keyboard list every original headline statically.
{
  const t = setup({ reduce: true, tickerWidth: 300 });
  ok(t.mode() === 'static' && t.pause.hidden && t.animations.length === 0, 'reduced motion creates no animation');
  t.buttons()[1].dispatch('click'); ok(JSON.stringify(t.shown()) === '["two"]', 'reduced motion selection works');
  t.media['(prefers-reduced-motion: reduce)'].set(false); t.tick(16);
  ok(t.mode() === 'marquee', 'live motion preference enables measured loop');
  const a = t.animation(); t.tick(3000); t.media['(prefers-reduced-motion: reduce)'].set(true); t.tick(16);
  const held = a.currentTime; t.tick(30000);
  ok(t.mode() === 'static' && a.currentTime === held, 'live reduced motion stops movement');
  t.media['(prefers-reduced-motion: reduce)'].set(false); t.tick(16);
  t.root.dispatch('touchstart'); t.buttons()[1].focusVisible = true; t.buttons()[1].dispatch('focusin');
  ok(t.mode() === 'marquee', 'pointer-origin focus leaves the ticker moving');
  t.buttons()[1].dispatch('keydown');
  ok(t.mode() === 'static' && a.playState === 'paused', 'keyboard on an already touch-focused headline stops and exposes all originals');
  t.buttons()[1].dispatch('focusout', { relatedTarget: t.buttons()[2] }); ok(t.mode() === 'static', 'keyboard navigation within ticker stays static');
  t.buttons()[2].dispatch('focusout', { relatedTarget: null });
  ok(t.mode() === 'marquee' && a.playState === 'running', 'keyboard exit resumes retained loop');
  t.root.dispatch('touchstart'); t.key(); t.buttons()[1].dispatch('focusin');
  ok(t.mode() === 'static', 'Tab entry after touch also exposes the static originals');
}

if (failures) { console.error(`[test-signals-ticker] ${failures} failure(s)`); process.exit(1); }
console.log('[test-signals-ticker] OK — adaptive measured loop, single headlines, resize/font/theme continuity, explicit PAUSE/PLAY, touch/hover continuity, reduced motion, keyboard, selection, expiry and ink preservation');

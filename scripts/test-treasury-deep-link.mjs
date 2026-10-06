#!/usr/bin/env node
/**
 * Treasury deep-link regression (Sprint 4B.1).
 *
 * Runs the real public_html/assets/js/treasury-rule.js and
 * treasury-directory.js in a vm against a small homepage-directory DOM stub.
 * The stub plays directory.js's documented contract (it builds the category
 * bar, honours ?category= and re-renders rows on chip clicks), and stands in
 * for ui-windows.js through window.INDEX80_UI.
 *
 * Proves:
 *   1. /?funding=treasury opens the filtered Treasury state: ₳ chip active,
 *      exactly the records that treasury-rule.js confirms as funded are visible,
 *      and the count says so.
 *   2. A directory window the visitor previously collapsed is opened.
 *   3. /?funding=treasury&category=<c> resolves to the Treasury view over ALL
 *      categories (as a ₳ chip click does) and drops ?category= from the URL.
 *   4. /?category=<c> alone is untouched (no Treasury view, no window change,
 *      no URL rewrite); / alone is untouched.
 *   5. The outcome does not depend on whether the directory or the Treasury
 *      data arrives first.
 *   6. ui-windows.js exposes the open()/ready hook the fix relies on.
 *
 * Node core only, no network. Usage: node scripts/test-treasury-deep-link.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public_html');
const JS = (name) => readFileSync(join(PUB, 'assets', 'js', name), 'utf8');
const RULE_JS = JS('treasury-rule.js');
const TREASURY_DIR_JS = JS('treasury-directory.js');
const UI_JS = JS('ui-windows.js');
const projectsJson = JSON.parse(readFileSync(join(PUB, 'data', 'projects.json'), 'utf8'));
const bridgeJson = JSON.parse(readFileSync(join(PUB, 'data', 'treasury-funding.json'), 'utf8'));

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`ok - ${name}`); } else { fail += 1; console.error(`FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ---- canonical expectations straight from treasury-rule.js ------------------
const ruleCtx = { module: { exports: {} } };
vm.runInNewContext(RULE_JS, ruleCtx);
const T = ruleCtx.module.exports;
const listable = (projectsJson.projects || []).filter((p) => p && p.slug && p.name && p.status !== 'archived');
const bridge = bridgeJson.records || {};
const fundedAll = new Set(listable.filter((p) => T.isConfirmedFunded(p, bridge[p.slug] || {})).map((p) => p.slug));
// A category that has at least one funded record and is not the whole set.
const catCounts = {};
for (const p of listable) catCounts[p.category] = (catCounts[p.category] || 0) + 1;
const someCategory = Object.keys(catCounts).sort().find((c) => listable.some((p) => p.category === c && fundedAll.has(p.slug)) && catCounts[c] < listable.length);
check('fixture: projects.json has confirmed-funded records and a mixed category', fundedAll.size > 0 && Boolean(someCategory), `funded=${fundedAll.size} cat=${someCategory}`);

// ---- minimal DOM ------------------------------------------------------------
function parseSel(sel) {
  const m = { tag: null, id: null, classes: [], attrs: [] };
  const re = /([a-z]+)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/gy;
  let x;
  while ((x = re.exec(sel))) {
    if (x[1]) m.tag = x[1]; else if (x[2]) m.id = x[2]; else if (x[3]) m.classes.push(x[3]); else m.attrs.push([x[4], x[5]]);
    if (re.lastIndex === sel.length) break;
  }
  if (re.lastIndex !== sel.length) throw new Error(`stub selector unsupported: ${sel}`);
  return m;
}
const matches = (el, sel) => sel.split(',').some((part) => {
  const m = parseSel(part.trim());
  if (m.tag && el.tag !== m.tag) return false;
  if (m.id && el.attrs.id !== m.id) return false;
  if (!m.classes.every((c) => el.classSet.has(c))) return false;
  return m.attrs.every(([k, v]) => (v === undefined ? k in el.attrs : el.attrs[k] === v));
});
class El {
  constructor(tag, attrs = {}) {
    this.tag = tag; this.attrs = { ...attrs }; this.children = []; this.parent = null;
    this.classSet = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    this.listeners = { click: [], clickCapture: [] };
    this.hidden = false; this.style = { display: '' }; this.textContent = '';
    const self = this;
    this.classList = {
      add: (c) => self.classSet.add(c), remove: (c) => self.classSet.delete(c), contains: (c) => self.classSet.has(c),
      toggle: (c, on) => { const want = on === undefined ? !self.classSet.has(c) : on; if (want) self.classSet.add(c); else self.classSet.delete(c); return want; },
    };
    this.dataset = new Proxy({}, {
      get: (_, k) => self.attrs[`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`],
      set: (_, k, v) => { self.attrs[`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = String(v); return true; },
    });
  }
  get className() { return [...this.classSet].join(' '); }
  set className(v) { this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  set innerHTML(v) { this._html = v; this.children = []; const m = /<span>([^<]*)<\/span>/.exec(v); if (m) { const s = new El('span'); s.textContent = m[1]; this.appendChild(s); } }
  get innerHTML() { return this._html || ''; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.push(c); return c; }
  insertBefore(c, ref) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  insertAdjacentElement(pos, c) { const p = this.parent; const i = p.children.indexOf(this); if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = p; p.children.splice(pos === 'afterend' ? i + 1 : i, 0, c); return c; }
  prepend(c) { c.parent = this; this.children.unshift(c); }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelectorAll(sel) { return [...this.walk()].filter((e) => matches(e, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { let e = this; while (e) { if (e.tag && matches(e, sel)) return e; e = e.parent; } return null; }
  addEventListener(t, fn, capture) { if (t === 'click') this.listeners[capture ? 'clickCapture' : 'click'].push(fn); }
  click() {
    const event = { target: this };
    const chain = []; let e = this; while (e) { chain.unshift(e); e = e.parent; }
    for (const n of chain) for (const fn of n.listeners.clickCapture) fn(event);
    for (const n of [...chain].reverse()) for (const fn of n.listeners.click) fn(event);
  }
}

async function scenario(search, { collapsed = false, order = 'directory-first' } = {}) {
  const tasks = [];
  const flush = async () => { for (let i = 0; i < 50; i += 1) { await new Promise((r) => setImmediate(r)); while (tasks.length) tasks.shift()(); } };
  const doc = new El('#document');
  const head = doc.appendChild(new El('head'));
  const body = doc.appendChild(new El('body'));
  const root = body.appendChild(new El('section', { id: 'directory', class: 'panel os-window directory', 'data-window': 'home-directory', 'data-directory': '', 'data-source': 'data/projects.json' }));
  if (collapsed) root.classList.add('is-collapsed');
  const count = root.appendChild(new El('span', { id: 'directory-count' }));
  const bar = root.appendChild(new El('div', { id: 'category-bar' }));
  const dirHead = root.appendChild(new El('div', { class: 'dir-head' }));
  dirHead.appendChild(new El('button', { class: 'dir-sort', 'data-sort': 'name' }));
  dirHead.appendChild(new El('span'));
  const list = root.appendChild(new El('ul', { id: 'directory-list' }));
  const observers = [];
  const notify = (target) => observers.filter((o) => o.target === target).forEach((o) => tasks.push(() => o.fn([])));

  // directory.js contract: static rows first, then category bar + render.
  let activeCategory = 'all';
  const render = () => {
    list.children = [];
    listable.filter((p) => activeCategory === 'all' || p.category === activeCategory).forEach((p) => {
      const row = list.appendChild(new El('li', { class: 'dir-row' }));
      row.appendChild(new El('a', { class: 'dir-name', href: `/projects/${p.slug}/` })).textContent = p.name;
      row.appendChild(new El('a', { class: 'dir-link' }));
    });
    count.textContent = `${list.children.length} RECORDS`;
    notify(list);
  };
  render();
  const directoryLoad = () => {
    const requested = new URLSearchParams(location.search).get('category');
    if (requested && listable.some((p) => p.category === requested)) activeCategory = requested;
    bar.children = [];
    for (const id of ['all', ...Object.keys(catCounts).sort()]) {
      const chip = bar.appendChild(new El('button', { class: `cat-chip${id === activeCategory ? ' active' : ''}`, 'data-cat': id }));
      chip.addEventListener('click', () => {
        activeCategory = id;
        bar.querySelectorAll('.cat-chip').forEach((b) => b.classList.toggle('active', b === chip));
        render();
      });
    }
    notify(bar);
    render();
  };

  const location = { href: `https://index80.com/${search}`, search, pathname: '/', hash: '' };
  const urlLog = [];
  const history = { replaceState: (_s, _t, u) => { urlLog.push(u); const n = new URL(u, 'https://index80.com'); location.search = n.search; location.href = n.href; } };
  const opened = [];
  const winListeners = {};
  const window = {
    location,
    INDEX80_UI: { ready: false, open: (el) => { opened.push(el); const f = el.closest('[data-window]'); if (f) f.classList.remove('is-collapsed'); } },
    addEventListener: (t, fn) => { (winListeners[t] ||= []).push(fn); },
    dispatchEvent: (e) => (winListeners[e.type] || []).forEach((fn) => fn(e)),
  };
  const document = { head, querySelector: (s) => doc.querySelector(s), createElement: (t) => new El(t) };
  const fetch = async (url) => {
    const payload = String(url).includes('treasury-funding') ? bridgeJson : projectsJson;
    return { ok: true, json: async () => JSON.parse(JSON.stringify(payload)) };
  };
  class MutationObserver { constructor(fn) { this.fn = fn; } observe(target) { observers.push({ target, fn: this.fn }); } }
  const ctx = vm.createContext({ window, document, location, history, fetch, MutationObserver, URL, URLSearchParams, Event: class { constructor(type) { this.type = type; } }, requestAnimationFrame: (fn) => tasks.push(fn), console, setTimeout, self: undefined });
  ctx.self = window;
  vm.runInContext(RULE_JS, ctx);
  window.INDEX80Treasury = ctx.INDEX80Treasury || window.INDEX80Treasury;

  if (order === 'directory-first') directoryLoad();
  vm.runInContext(TREASURY_DIR_JS, ctx);
  // ui-windows.js finishes init after the Treasury script started.
  window.INDEX80_UI.ready = true; window.dispatchEvent({ type: 'index80-ui-ready' });
  await flush();
  if (order === 'treasury-first') { directoryLoad(); await flush(); }

  const rows = list.querySelectorAll('.dir-row');
  const visible = rows.filter((r) => !r.hidden && r.style.display !== 'none').map((r) => /\/projects\/([^/]+)\//.exec(r.querySelector('.dir-name').getAttribute('href'))[1]);
  return {
    visible: new Set(visible),
    chipCount: bar.querySelector('.treasury-filter-chip')?.querySelector('span')?.textContent || null,
    chipActive: Boolean(bar.querySelector('.treasury-filter-chip') && bar.querySelector('.treasury-filter-chip').classList.contains('active')),
    activeCat: bar.querySelector('.cat-chip.active[data-cat]')?.getAttribute('data-cat') || null,
    count: count.textContent,
    collapsed: root.classList.contains('is-collapsed'),
    opened: opened.length,
    search: location.search,
    urlLog,
    treasuryTable: root.classList.contains('treasury-table'),
  };
}
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

for (const order of ['directory-first', 'treasury-first']) {
  const r = await scenario('?funding=treasury', { order });
  check(`[${order}] /?funding=treasury shows exactly the treasury-rule.js funded records (${fundedAll.size})`, sameSet(r.visible, fundedAll), `visible=${r.visible.size}`);
  check(`[${order}] ₳ TREASURY FUNDED chip is active and the funding column is shown`, r.chipActive && r.treasuryTable);
  check(`[${order}] count reads "${fundedAll.size} TREASURY FUNDED"`, r.count === `${fundedAll.size} TREASURY FUNDED`, r.count);
  check(`[${order}] ₳ chip count equals the visible Treasury records`, r.chipCount === String(r.visible.size) && r.visible.size === fundedAll.size, `chip=${r.chipCount} visible=${r.visible.size}`);
  check(`[${order}] category stays ALL and the URL is not rewritten`, r.activeCat === 'all' && r.search === '?funding=treasury', `${r.activeCat} ${r.search}`);

  const c = await scenario('?funding=treasury', { order, collapsed: true });
  check(`[${order}] a previously collapsed directory window is opened by the deep link`, !c.collapsed && c.opened >= 1);
  check(`[${order}] collapsed + deep link still lands on the filtered state`, sameSet(c.visible, fundedAll) && c.chipActive);

  const both = await scenario(`?funding=treasury&category=${someCategory}`, { order });
  check(`[${order}] funding+category: Treasury wins over ALL categories (as a ₳ chip click does)`, sameSet(both.visible, fundedAll) && both.chipActive && both.activeCat === 'all', `visible=${both.visible.size} cat=${both.activeCat}`);
  check(`[${order}] funding+category: ?category= is dropped, ?funding=treasury kept`, both.search === '?funding=treasury', both.search);

  const cat = await scenario(`?category=${someCategory}`, { order });
  const expectCat = new Set(listable.filter((p) => p.category === someCategory).map((p) => p.slug));
  check(`[${order}] ?category=${someCategory} alone is unchanged (category filter, no Treasury view)`, sameSet(cat.visible, expectCat) && !cat.chipActive && cat.activeCat === someCategory && !cat.treasuryTable);
  check(`[${order}] ?category= alone: no window change and no URL rewrite`, cat.opened === 0 && cat.urlLog.length === 0 && cat.search === `?category=${someCategory}`);

  const catCollapsed = await scenario(`?category=${someCategory}`, { order, collapsed: true });
  check(`[${order}] ?category= alone leaves a collapsed window collapsed (no new behaviour)`, catCollapsed.collapsed && catCollapsed.opened === 0);

  const plain = await scenario('', { order });
  check(`[${order}] / alone: all listable records, no Treasury view`, plain.visible.size === listable.length && !plain.chipActive && plain.urlLog.length === 0);
}

// Archived records never enter the Treasury view (existing behaviour).
const archivedFunded = (projectsJson.projects || []).filter((p) => p.status === 'archived' && T.isConfirmedFunded(p, bridge[p.slug] || {})).map((p) => p.slug);
{
  const r = await scenario('?funding=treasury');
  check(`archived records stay out of the Treasury view (${archivedFunded.length} archived funded)`, archivedFunded.every((s) => !r.visible.has(s)));
}

// ui-windows.js exposes the hook the fix relies on.
check('ui-windows.js exposes INDEX80_UI.open and a ready flag', /window\.INDEX80_UI = \{ reset: resetAll, open: openFrame, ready: false \}/.test(UI_JS));
check('ui-windows.js signals readiness after init with index80-ui-ready', /init\(\);\s*window\.INDEX80_UI\.ready = true;[\s\S]{0,200}index80-ui-ready/.test(UI_JS));
check('treasury-directory.js qualifies records only through INDEX80Treasury', /window\.INDEX80Treasury\.isConfirmedFunded/.test(TREASURY_DIR_JS) && !/treasury_funded_proposals|treasury_funding_value/.test(TREASURY_DIR_JS));

console.log(`\n[test-treasury-deep-link] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;

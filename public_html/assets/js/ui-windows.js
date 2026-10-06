/* INDEX:80 collapsible windows (first OS-frame behaviour).
 *
 * Generic for any frame marked up as:
 *   <section data-window="<id>">
 *     <h2><button class="os-titlebar" aria-expanded="true" aria-controls="<body-id>">…</button></h2>
 *     <div class="os-window-body" id="<body-id>">…</div>
 *   </section>
 *
 * Static HTML is complete and open by default. This script only applies a
 * previously saved local preference and handles toggling. Preferences live in
 * one small versioned localStorage object (index80_ui_v1) holding non-sensitive
 * UI state only; it never leaves the browser. Storage failures (private mode,
 * blocked storage) fall back to the open default.
 * An in-page link (or URL hash) pointing into a collapsed window opens it.
 * No drag, reorder or desktop behaviour yet.
 */
(() => {
  const KEY = 'index80_ui_v1';
  const VERSION = 1;

  function readPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.v === VERSION && raw.windows && typeof raw.windows === 'object') return raw;
    } catch { /* unreadable or blocked: use defaults */ }
    return { v: VERSION, windows: {} };
  }

  function writePrefs(prefs) {
    try {
      if (Object.keys(prefs.windows).length) localStorage.setItem(KEY, JSON.stringify(prefs));
      else localStorage.removeItem(KEY);
    } catch { /* storage unavailable: the toggle still works for this page view */ }
  }

  function setOpen(frame, open) {
    const button = frame.querySelector('.os-titlebar[aria-controls]');
    const body = button && document.getElementById(button.getAttribute('aria-controls'));
    if (!button || !body) return;
    button.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    frame.classList.toggle('is-collapsed', !open);
  }

  function syncResetControl(prefs) {
    const collapsed = Object.values(prefs.windows).some((w) => w && w.collapsed);
    document.querySelectorAll('.footer-meta').forEach((meta) => {
      let reset = meta.querySelector('[data-window-reset]');
      if (!collapsed) { reset?.remove(); return; }
      if (reset) return;
      reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'footer-consent-toggle';
      reset.dataset.windowReset = 'true';
      reset.textContent = 'Restore windows';
      reset.addEventListener('click', resetAll);
      meta.appendChild(reset);
    });
  }

  function frames() {
    return [...document.querySelectorAll('[data-window]')];
  }

  function resetAll() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    frames().forEach((frame) => setOpen(frame, true));
    syncResetControl({ v: VERSION, windows: {} });
  }

  // Toggle a window and remember the choice (also used when an in-page link
  // such as "Browse projects ↓" targets a collapsed window: following the
  // link is an explicit request to see it).
  function choose(frame, open) {
    const id = frame.dataset.window;
    setOpen(frame, open);
    const next = readPrefs();
    if (open) delete next.windows[id];
    else next.windows[id] = { collapsed: true };
    writePrefs(next);
    syncResetControl(next);
  }

  function openForHash(hash) {
    if (!hash || hash.length < 2) return;
    let target = null;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
    const frame = target && target.closest && target.closest('[data-window]');
    if (frame && frame.classList.contains('is-collapsed')) choose(frame, true);
  }

  function init() {
    const prefs = readPrefs();
    frames().forEach((frame) => {
      const id = frame.dataset.window;
      const button = frame.querySelector('.os-titlebar[aria-controls]');
      if (!id || !button) return;
      if (prefs.windows[id]?.collapsed) setOpen(frame, false);
      button.addEventListener('click', () => choose(frame, button.getAttribute('aria-expanded') !== 'true'));
    });
    syncResetControl(prefs);
    openForHash(window.location.hash);
    window.addEventListener('hashchange', () => openForHash(window.location.hash));
    // Runs before the browser scrolls, so the target is visible to land on.
    document.addEventListener('click', (event) => {
      const link = event.target.closest && event.target.closest('a[href^="#"]');
      if (link) openForHash(link.getAttribute('href'));
    });
  }

  // Open a window on behalf of an explicit deep link (e.g. /?funding=treasury
  // targeting the homepage directory) — same rule as an in-page link or hash.
  function openFrame(frame) {
    const target = frame && frame.closest && frame.closest('[data-window]');
    if (target && target.classList.contains('is-collapsed')) choose(target, true);
  }

  window.INDEX80_UI = { reset: resetAll, open: openFrame, ready: false };
  function start() {
    init();
    window.INDEX80_UI.ready = true;
    if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
      window.dispatchEvent(new Event('index80-ui-ready'));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

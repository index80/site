/* INDEX:80 Ecosystem Signals: headline ticker + selected detail (WHAT'S CURRENT).
 *
 * Progressive enhancement over complete static HTML written by
 * scripts/generate-home-signals.mjs. Without this script every headline and
 * every detail is listed. This script only controls movement and selection:
 * it never writes or recolours text. Headline markup, including the build-time
 * accent-word colour spans, is moved into a <button> as-is.
 *
 * Layouts (data-signals-mode on the strip):
 *   marquee: wide screens with motion allowed. Headlines scroll slowly and
 *            continuously; the detail below shows the selected signal.
 *   step:    narrow screens with motion allowed. One complete headline at a
 *            time, advancing in sequence; the detail follows it.
 *   static:  prefers-reduced-motion, keyboard focus inside the ticker, or
 *            headlines too short to scroll. All headlines wrap in place.
 * Movement pauses on hover, keyboard focus, touch, a hidden tab, or PAUSE.
 * Clicking or focusing a headline selects it. Manual selection is announced
 * politely; automatic advancing is not.
 *
 * Signals whose expires_at day has passed since the last build are removed;
 * with none left the strip is hidden.
 */
(() => {
  const DAY_MS = 86400000;
  const STEP_MS = 7000;
  const SPEED_PX_S = 32;

  function expired(el, now) {
    const exp = el.getAttribute('data-expires');
    if (!exp || !/^\d{4}-\d{2}-\d{2}$/.test(exp)) return false;
    const start = Date.parse(exp + 'T00:00:00Z');
    return !Number.isNaN(start) && now >= start + DAY_MS;
  }

  function init(root) {
    const ticker = root.querySelector('[data-signals-ticker]');
    const list = root.querySelector('[data-signals-ticker-list]');
    if (!ticker || !list) return;
    const now = Date.now();
    const items = [];
    for (const li of [...list.children]) {
      const detail = document.getElementById('signal-' + li.getAttribute('data-signal-ref'));
      if (!detail || expired(detail, now)) { li.remove(); if (detail) detail.remove(); continue; }
      items.push({ li, detail });
    }
    root.querySelectorAll('[data-signal-id]').forEach((d) => {
      if (!items.some((it) => it.detail === d)) d.remove();
    });
    if (!items.length) { root.hidden = true; return; }

    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'signal-tick-btn';
      b.setAttribute('aria-controls', it.detail.id);
      while (it.li.firstChild) b.append(it.li.firstChild);
      it.li.append(b);
      it.button = b;
      b.addEventListener('click', () => select(i, true));
      b.addEventListener('focus', () => { if (selected !== i) select(i, true); });
    });

    const track = document.createElement('div');
    track.className = 'signals-track';
    list.replaceWith(track);
    track.append(list);
    const clone = list.cloneNode(true);
    clone.removeAttribute('aria-labelledby');
    clone.removeAttribute('data-signals-ticker-list');
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    clone.classList.add('signals-ticker-clone');
    clone.querySelectorAll('button').forEach((b) => { b.tabIndex = -1; b.removeAttribute('aria-controls'); });
    clone.querySelectorAll('[data-signal-ref]').forEach((li) => li.addEventListener('click', () => {
      const i = items.findIndex((it) => it.li.getAttribute('data-signal-ref') === li.getAttribute('data-signal-ref'));
      if (i >= 0) select(i, true);
    }));
    track.append(clone);

    const pause = document.createElement('button');
    pause.type = 'button';
    pause.className = 'signals-key';
    pause.addEventListener('click', () => { userPaused = !userPaused; update(); });
    ticker.after(pause);

    const status = document.createElement('span');
    status.className = 'visually-hidden';
    status.setAttribute('aria-live', 'polite');
    root.append(status);
    root.classList.add('is-enhanced');

    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const narrow = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;
    let selected = 0;
    let hovered = false;
    let keyboard = false;
    let userPaused = false;
    let timer = null;
    let mode = 'static';

    function select(i, announce) {
      selected = (i + items.length) % items.length;
      items.forEach((it, j) => {
        const on = j === selected;
        it.detail.hidden = !on;
        it.li.classList.toggle('is-active', on);
        it.button.setAttribute('aria-current', String(on));
      });
      clone.querySelectorAll('.signal-tick').forEach((li, j) => li.classList.toggle('is-active', j === selected));
      if (announce) status.textContent = `Showing signal ${selected + 1} of ${items.length}: ${items[selected].button.textContent}`;
      if (mode === 'step') {
        const li = items[selected].li;
        li.classList.remove('is-entering');
        void li.offsetWidth; // restart the step entrance
        li.classList.add('is-entering');
        schedule();
      }
    }

    function paused() {
      return userPaused || hovered || keyboard || document.hidden;
    }

    function schedule() {
      clearTimeout(timer);
      timer = null;
      if (mode === 'step' && !paused()) timer = setTimeout(() => select(selected + 1, false), STEP_MS);
    }

    function layout() {
      if ((reduce && reduce.matches) || keyboard || items.length < 2) return 'static';
      if (narrow && narrow.matches) return 'step';
      // Marquee only when the headlines are wider than the strip.
      root.dataset.signalsMode = 'marquee';
      return list.scrollWidth > ticker.clientWidth ? 'marquee' : 'static';
    }

    function update() {
      mode = layout();
      root.dataset.signalsMode = mode;
      if (mode === 'marquee') track.style.setProperty('--signals-duration', `${Math.max(20, Math.round(list.scrollWidth / SPEED_PX_S))}s`);
      const moving = mode === 'marquee' || mode === 'step';
      pause.hidden = !moving;
      pause.textContent = userPaused ? 'PLAY' : 'PAUSE';
      pause.setAttribute('aria-label', userPaused ? 'Resume signal headlines' : 'Pause signal headlines');
      pause.setAttribute('aria-pressed', String(userPaused));
      root.classList.toggle('is-paused', paused());
      schedule();
    }

    root.addEventListener('mouseenter', () => { hovered = true; update(); });
    root.addEventListener('mouseleave', () => { hovered = false; update(); });
    root.addEventListener('focusin', (event) => {
      // Keyboard focus lays every headline out in place so none is off-screen;
      // a mouse click only selects (no layout jump under the pointer).
      let visible = true;
      try { visible = event.target.matches(':focus-visible'); } catch { /* old browsers: treat as keyboard */ }
      if (visible && !keyboard) { keyboard = true; update(); }
    });
    root.addEventListener('focusout', (event) => {
      if (keyboard && !root.contains(event.relatedTarget)) { keyboard = false; update(); }
    });
    root.addEventListener('touchstart', () => { if (!userPaused) { userPaused = true; update(); } }, { passive: true });
    document.addEventListener('visibilitychange', update);
    for (const mq of [reduce, narrow]) if (mq && mq.addEventListener) mq.addEventListener('change', update);
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(update, 200); });

    update();
    select(0, false);
  }

  function start() {
    document.querySelectorAll('[data-signals]').forEach((root) => {
      try { init(root); } catch { /* keep the static list if enhancement fails */ }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

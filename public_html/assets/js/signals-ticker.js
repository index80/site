/* INDEX:80 Ecosystem Signals: headline ticker + selected detail (WHAT'S CURRENT).
 *
 * Progressive enhancement over complete static HTML written by
 * scripts/generate-home-signals.mjs. Without this script every headline and
 * every detail is listed. This script only controls movement and selection:
 * it never writes or recolours text. Headline markup, including the build-time
 * accent-word colour spans, is moved into a <button> as-is.
 *
 * Layouts (data-signals-mode on the strip):
 *   marquee: the unwrapped headlines overflow the available ticker width.
 *            The same continuous loop runs at every viewport width.
 *   static:  prefers-reduced-motion, keyboard focus inside the ticker, or
 *            headlines too short to scroll. All headlines wrap in place.
 * PAUSE/PLAY is the manual movement control. Hover and touch never pause.
 * Keyboard navigation exposes all headlines; reduced motion stays static.
 * Clicking or focusing a headline selects it. Manual selection is announced
 * politely; automatic advancing is not.
 *
 * Signals whose expires_at day has passed since the last build are removed;
 * with none left the strip is hidden.
 */
(() => {
  const DAY_MS = 86400000;
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
    pause.addEventListener('click', () => { userPaused = !userPaused; syncMotion(); });
    ticker.after(pause);

    const status = document.createElement('span');
    status.className = 'visually-hidden';
    status.setAttribute('aria-live', 'polite');
    root.append(status);
    root.classList.add('is-enhanced');

    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let selected = 0;
    let keyboard = false;
    let userPaused = false;
    let mode = 'static';
    let animation = null;
    let animationWidth = 0;
    let measureFrame = null;
    let pointerFocus = false;

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
    }

    function paused() {
      return userPaused || keyboard || document.hidden || mode !== 'marquee';
    }

    function syncMotion() {
      pause.hidden = mode !== 'marquee';
      pause.textContent = userPaused ? 'PLAY' : 'PAUSE';
      pause.setAttribute('aria-label', userPaused ? 'Resume signal headlines' : 'Pause signal headlines');
      pause.setAttribute('aria-pressed', String(userPaused));
      root.classList.toggle('is-paused', paused());
      if (animation) {
        if (paused()) { if (animation.playState !== 'paused') animation.pause(); }
        else if (animation.playState !== 'running') animation.play();
      }
    }

    function measure() {
      measureFrame = null;
      // Measure the original list at its actual unwrapped width, even when
      // the previous layout wrapped. The copy never contributes to the test.
      // This synchronous measuring state is restored before the next paint.
      root.dataset.signalsMode = 'measure';
      const width = list.getBoundingClientRect().width;
      const overflow = width > ticker.clientWidth && ticker.clientWidth > 0;
      mode = !(reduce && reduce.matches) && !keyboard && overflow && typeof track.animate === 'function' ? 'marquee' : 'static';
      root.dataset.signalsMode = mode;
      if (mode === 'marquee' && (!animation || Math.abs(width - animationWidth) > .01)) {
        // Preserve travelled pixels when fonts change the loop's width.
        // A viewport-only resize or theme recolour keeps the same animation.
        const distance = animation && animationWidth ? ((animation.currentTime || 0) / 1000 * SPEED_PX_S) % animationWidth : 0;
        if (animation) animation.cancel();
        animation = track.animate([
          { transform: 'translateX(0)' },
          { transform: `translateX(-${width}px)` },
        ], { duration: width / SPEED_PX_S * 1000, iterations: Infinity });
        animationWidth = width;
        animation.currentTime = (distance % width) / SPEED_PX_S * 1000;
      }
      syncMotion();
    }

    function queueMeasure() {
      if (measureFrame === null) measureFrame = requestAnimationFrame(measure);
    }

    // Pointer-origin focus must not be mistaken for keyboard navigation,
    // including compatibility focus after a touch. These never pause motion.
    root.addEventListener('pointerdown', () => { pointerFocus = true; }, { passive: true });
    root.addEventListener('touchstart', () => { pointerFocus = true; }, { passive: true });
    root.addEventListener('keydown', (event) => {
      pointerFocus = false;
      if (list.contains(event.target) && !keyboard) { keyboard = true; measure(); }
    });
    root.addEventListener('focusin', (event) => {
      // Keyboard focus lays every headline out in place so none is off-screen;
      // a mouse click only selects (no layout jump under the pointer).
      let visible = true;
      try { visible = event.target.matches(':focus-visible'); } catch { /* old browsers: treat as keyboard */ }
      if (visible && !pointerFocus && !keyboard && !clone.contains(event.target) && event.target !== pause) { keyboard = true; measure(); }
    });
    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) { pointerFocus = false; if (keyboard) { keyboard = false; measure(); } }
    });
    document.addEventListener('keydown', () => { pointerFocus = false; }, true);
    document.addEventListener('visibilitychange', syncMotion);
    if (reduce && reduce.addEventListener) reduce.addEventListener('change', queueMeasure);
    window.addEventListener('resize', queueMeasure);
    window.addEventListener('orientationchange', queueMeasure);
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(queueMeasure);
      observer.observe(ticker);
      observer.observe(list);
    }
    if (window.MutationObserver) new MutationObserver(queueMeasure).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme', 'data-color-mode'],
    });
    if (document.fonts) {
      document.fonts.ready.then(queueMeasure);
      document.fonts.addEventListener('loadingdone', queueMeasure);
      document.fonts.addEventListener('loadingerror', queueMeasure);
    }

    measure();
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

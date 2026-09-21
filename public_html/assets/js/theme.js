/* INDEX:80 theme system (Option A) — synchronous bootstrap + controls.
 *
 * Loaded synchronously in <head> BEFORE site.css so the saved theme is
 * applied to <html> before first paint (no light/dark flash). Deliberately
 * independent of analytics.js: theme selection works when analytics is
 * blocked or fails.
 *
 * State (localStorage):
 *   index80-theme       = "web1" | "arcade"   (default "web1")
 *   index80-color-mode  = "light" | "dark"    (default "light")
 * No AUTO mode, no TERMINAL theme. Invalid/missing values fall back to the
 * defaults. body[data-mode] / body[data-family] semantics are untouched —
 * theme state lives only on documentElement as data-theme/data-color-mode.
 */
(function () {
  'use strict';

  var THEME_KEY = 'index80-theme';
  var MODE_KEY = 'index80-color-mode';
  var THEMES = ['web1', 'arcade'];
  var MODES = ['light', 'dark'];
  var DEFAULT_THEME = 'web1';
  var DEFAULT_MODE = 'light';

  function isValid(value, list) {
    return list.indexOf(value) !== -1;
  }

  function readStored(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null; /* private mode / blocked storage: fall back, still paint */
    }
  }

  function writeStored(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* Storage unavailable: the theme still applies to this page load. */
    }
  }

  function currentTheme() {
    var stored = readStored(THEME_KEY);
    return isValid(stored, THEMES) ? stored : DEFAULT_THEME;
  }

  function currentMode() {
    var stored = readStored(MODE_KEY);
    return isValid(stored, MODES) ? stored : DEFAULT_MODE;
  }

  function apply(theme, mode) {
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-color-mode', mode);
  }

  /* Bootstrap immediately at script execution — documentElement exists this
     early, and because this script runs before the site.css <link>, the
     themed selectors match on first paint. */
  apply(currentTheme(), currentMode());

  function syncControls() {
    var theme = currentTheme();
    var mode = currentMode();
    var buttons = document.querySelectorAll('.theme-controls [data-set-theme], .theme-controls [data-set-mode]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (btn.hasAttribute('data-set-theme')) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-set-theme') === theme ? 'true' : 'false');
      } else {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-set-mode') === mode ? 'true' : 'false');
      }
    }
  }

  function setTheme(theme) {
    if (!isValid(theme, THEMES)) return;
    writeStored(THEME_KEY, theme);
    apply(theme, currentMode());
    syncControls();
  }

  function setMode(mode) {
    if (!isValid(mode, MODES)) return;
    writeStored(MODE_KEY, mode);
    apply(currentTheme(), mode);
    syncControls();
  }

  function makeKey(label, accessibleLabel, attr, value, onActivate) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-key';
    btn.textContent = label;
    btn.setAttribute('aria-label', accessibleLabel);
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute(attr, value);
    btn.addEventListener('click', onActivate);
    return btn;
  }

  /* Controls are created here (not duplicated across every page's markup)
     so all hand-authored pages and generated project pages stay in sync.
     Two logical groups, no explanatory text beside them. */
  function buildControls() {
    if (!document.body) return;
    var bar = document.querySelector('.system-bar');
    if (!bar || bar.querySelector('.theme-controls')) return;

    /* Robust fallback tagging: pages whose markup predates the dedicated
       classes still get a stable layout hook without positional CSS. */
    var first = bar.firstElementChild;
    var last = bar.lastElementChild;
    if (first && !bar.querySelector('.system-slogan')) first.classList.add('system-slogan');
    if (last && last !== first && !bar.querySelector('.system-status')) last.classList.add('system-status');

    var controls = document.createElement('div');
    controls.className = 'theme-controls';

    var themeGroup = document.createElement('div');
    themeGroup.className = 'theme-group';
    themeGroup.setAttribute('role', 'group');
    themeGroup.setAttribute('aria-label', 'Site theme');
    themeGroup.appendChild(makeKey('WEB 1.0', 'Site theme: Web 1.0', 'data-set-theme', 'web1', function () { setTheme('web1'); }));
    themeGroup.appendChild(makeKey('ARCADE', 'Site theme: Arcade', 'data-set-theme', 'arcade', function () { setTheme('arcade'); }));

    var modeGroup = document.createElement('div');
    modeGroup.className = 'theme-group';
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', 'Colour mode');
    modeGroup.appendChild(makeKey('LIGHT', 'Colour mode: light', 'data-set-mode', 'light', function () { setMode('light'); }));
    modeGroup.appendChild(makeKey('DARK', 'Colour mode: dark', 'data-set-mode', 'dark', function () { setMode('dark'); }));

    controls.appendChild(themeGroup);
    controls.appendChild(modeGroup);

    var status = bar.querySelector('.system-status');
    if (status && status.parentNode === bar) {
      bar.insertBefore(controls, status);
    } else {
      bar.appendChild(controls);
    }
    syncControls();
  }

  /* A second tab changing preferences updates this tab without reload. */
  window.addEventListener('storage', function (event) {
    if (event.key === THEME_KEY || event.key === MODE_KEY) {
      apply(currentTheme(), currentMode());
      syncControls();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildControls);
  } else {
    buildControls();
  }

  /* Minimal surface for debugging and tests; not part of the public API. */
  window.INDEX80Theme = {
    get: function () { return { theme: currentTheme(), mode: currentMode() }; },
    setTheme: setTheme,
    setMode: setMode
  };
})();

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

  /* Shared typography (human visual review, 12 Sep 2026) and the project profile
     layout (editorial review, 11-12 Sep 2026), moved unchanged from main-core.js.
     They are appended at the end of <head> as soon as the head has been parsed,
     so they apply at first paint instead of re-laying-out the page after load.
     Admin pages never loaded main-core.js, so they do not get them. */
  var SITE_TYPOGRAPHY_CSS = `
    :root {
      --font-interface: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --font-brand: "Silkscreen", ui-monospace, SFMono-Regular, Menlo, monospace;
      --font-pixel: var(--font-interface);
      --font-body: var(--font-interface);
      --type-body: .88rem;
      --type-ui: .72rem;
      --type-label: .62rem;
    }

    body,
    button,
    input,
    select,
    textarea {
      font-family: var(--font-interface);
      font-weight: 400;
    }

    /* One readable text face across prose, records, tables and evidence. */
    p,
    li,
    .dir-row,
    .link-row,
    .profile-summary-text,
    .profile-note .profile-summary,
    .source-list,
    .metric-grid strong,
    .feed-grid strong,
    .back-to-directory,
    .charter-doc,
    .founder-copy p,
    .support-copy p,
    .submit-explainer,
    .form-note,
    .form-result {
      font-family: var(--font-interface);
      font-weight: 400;
    }

    /* One strong interface weight for controls and small structural labels. */
    .system-bar,
    .main-nav > a,
    .search-box,
    .search-box input,
    .button,
    .healthy,
    .metric-grid span,
    .metric-grid small,
    .source-line,
    .prototype-note,
    .directory-count,
    .cat-chip,
    .dir-head,
    .dir-index,
    .dir-cat,
    .dir-link,
    .dir-empty,
    .site-footer,
    .eyebrow,
    .strap,
    .badge,
    .panel-title h2,
    .profile-cat,
    .tag-chip,
    .policy-id-cell > span,
    .submit-sub,
    .submit-footnote,
    .form-field label,
    .support-handle,
    .support-qr figcaption,
    .charter-doc h2,
    .charter-doc .charter-meta,
    .founder-copy h2 {
      font-family: var(--font-interface);
      font-weight: 700;
    }

    /* Silkscreen is display type only. */
    .wordmark,
    .network-label,
    .hero h1,
    .section-hero h1,
    .discover-h1,
    .profile-heading h1,
    .registry-hero-title {
      font-family: var(--font-brand) !important;
    }

    /* Active-menu cue follows the theme system (amber/yellow per state);
       tokens live in site.css so WEB 1.0 and ARCADE stay in sync. */
    .main-nav > a:hover,
    .main-nav > a:focus-visible {
      background: var(--nav-hover-bg) !important;
      color: var(--nav-hover-text) !important;
      box-shadow: inset 0 -3px 0 var(--nav-hover-edge) !important;
      outline: none;
    }
    .main-nav > a[aria-current="page"] {
      background: var(--nav-active-bg);
      color: var(--nav-active-text);
      box-shadow: inset 0 -3px 0 var(--nav-active-edge);
    }

    /* The terminal cursor belongs with INDEX:80, beside the wordmark —
       the obsolete .system-bar positional cursor rule was removed from
       site.css, so no suppression is needed here anymore. */
    .wordmark::after {
      content: "▮";
      display: inline-block;
      margin-left: .32em;
      color: var(--brand-accent, var(--blue));
      font-family: var(--font-interface);
      font-size: .62em;
      vertical-align: .08em;
      animation: cursor-blink 1.1s step-end infinite;
    }

    /* Restore the original three-point panel marker without letting it collide
       with the title: the pseudo-element owns a fixed-width visual slot. */
    .panel-title::before {
      content: "" !important;
      flex: 0 0 2.05rem !important;
      width: 2.05rem !important;
      height: .48rem !important;
      background:
        linear-gradient(var(--accent),var(--accent)) 0 50% / .42rem .42rem no-repeat,
        linear-gradient(var(--line),var(--line)) .78rem 50% / .42rem .42rem no-repeat,
        linear-gradient(var(--line),var(--line)) 1.56rem 50% / .42rem .42rem no-repeat !important;
      box-shadow: none !important;
    }

    /* Theme System Option A — ARCADE panel-title accent reach. Higher
       specificity than the rules above, so these win for arcade only;
       WEB 1.0 is untouched. Trailing squares go magenta on arcade
       light, cyan structure on arcade dark. */
    html[data-theme="arcade"] .panel-title::before {
      background:
        linear-gradient(var(--accent),var(--accent)) 0 50% / .42rem .42rem no-repeat,
        linear-gradient(var(--magenta),var(--magenta)) .78rem 50% / .42rem .42rem no-repeat,
        linear-gradient(var(--magenta),var(--magenta)) 1.56rem 50% / .42rem .42rem no-repeat !important;
    }
    html[data-theme="arcade"][data-color-mode="dark"] .panel-title::before {
      background:
        linear-gradient(var(--accent),var(--accent)) 0 50% / .42rem .42rem no-repeat,
        linear-gradient(var(--cyan),var(--cyan)) .78rem 50% / .42rem .42rem no-repeat,
        linear-gradient(var(--cyan),var(--cyan)) 1.56rem 50% / .42rem .42rem no-repeat !important;
    }
  `;
  var PROJECT_PROFILE_CSS = `
      .profile-cat {
        font-family: var(--font-interface);
        font-weight: 700;
        font-size: var(--type-label);
        line-height: 1.2;
        letter-spacing: .025em;
        overflow-wrap: anywhere;
      }

      .profile-body {
        grid-template-columns: 1fr;
        gap: .55rem;
        padding-bottom: .65rem;
      }
      .profile-info { order: 1; }
      .profile-cta { order: 2; width: 100%; }
      .profile-cta .link-buttons {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: .4rem;
        width: 100%;
      }
      .profile-cta .button {
        width: 100%;
        min-height: 0;
        padding: .5rem .65rem;
        font-family: var(--font-interface);
        font-weight: 700;
        font-size: var(--type-ui);
        line-height: 1.15;
        box-shadow: 2px 2px 0 var(--ink);
      }
      .profile-cta .button.cta-primary {
        padding: .62rem .75rem;
        font-size: .76rem;
      }
      .profile-summary-text {
        max-width: 92ch;
        margin-bottom: .5rem;
        font-family: var(--font-interface);
        font-weight: 400;
        font-size: var(--type-body);
        line-height: 1.5;
      }
      .tag-chip {
        font-family: var(--font-interface);
        font-weight: 700;
        font-size: var(--type-label);
      }

      .profile-media-meta.dark {
        background: var(--paper-2);
        color: var(--ink);
        border: 2px solid var(--ink);
        box-shadow: var(--shadow);
      }
      .profile-media-meta.no-image { display: block; }
      .profile-media-meta .metric-grid {
        grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
      }
      .profile-media-meta .metric-grid > div {
        min-height: 0;
        padding: .42rem .58rem;
        border-right: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
      }
      .profile-media-meta .metric-grid [data-editorial-relation="team"],
      .profile-media-meta .metric-grid [data-editorial-relation="founder"] {
        grid-column: span 2;
      }
      .profile-media-meta .metric-grid span,
      .profile-media-meta .metric-grid small,
      .profile-media-meta .policy-id-cell > span {
        font-family: var(--font-interface);
        font-weight: 700;
        font-size: var(--type-label);
        line-height: 1.2;
        letter-spacing: .02em;
        color: var(--muted);
      }
      .profile-media-meta .metric-grid strong {
        margin: .15rem 0 0;
        font-family: var(--font-interface);
        font-weight: 400;
        font-size: var(--type-body);
        line-height: 1.4;
        letter-spacing: 0;
        color: var(--ink);
        overflow-wrap: break-word;
        word-break: normal;
      }
      .profile-media-meta .policy-id-cell {
        grid-column: auto;
        padding: .42rem .58rem;
      }
      .profile-media-meta .policy-id-value {
        gap: .3rem;
        font-family: var(--font-interface);
        font-weight: 400;
        font-size: var(--type-ui);
        line-height: 1.25;
      }
      .profile-media-meta .policy-id-value code {
        font-family: var(--font-interface);
        font-weight: 400;
        font-size: var(--type-ui);
        line-height: 1.25;
        background: #eef2f6;
        color: var(--ink);
        padding: .22rem .35rem;
      }
      .profile-media-meta .copy-btn {
        border-color: var(--line);
        color: var(--muted);
        padding: .22rem .34rem;
      }
      .profile-media-meta .copy-btn:hover {
        color: var(--ink);
        border-color: var(--ink);
        background: var(--amber);
      }
      .profile-media-meta .policy-id-value a {
        color: var(--blue);
        font-size: var(--type-ui);
      }
      .profile-media-meta .policy-id-value a:hover { color: var(--ink); }
      .profile-media-meta .profile-media { border-right: 1px solid var(--line); }
      .profile-media-meta .profile-media img {
        width: 100%;
        height: 100%;
        min-height: 100%;
        max-height: 16rem;
        object-fit: cover;
      }

      .profile-note .profile-summary,
      .source-list,
      .back-to-directory,
      .profile-source > summary span {
        font-family: var(--font-interface);
        font-weight: 400;
      }
      .panel-title h2 {
        font-family: var(--font-interface);
        font-weight: 700;
        font-size: .78rem;
        letter-spacing: .02em;
      }

      @media (max-width: 1050px) {
        .profile-media-meta .profile-media {
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }
        .profile-media-meta .profile-media img {
          max-height: 15rem;
          min-height: 0;
        }
      }
      @media (max-width: 720px) {
        .profile-media-meta .metric-grid [data-editorial-relation="team"],
        .profile-media-meta .metric-grid [data-editorial-relation="founder"] {
          grid-column: auto;
        }
        .profile-media-meta .metric-grid {
          grid-template-columns: 1fr;
        }
        .profile-media-meta .metric-grid > div,
        .profile-media-meta .policy-id-cell {
          padding: .4rem .55rem;
        }
        .profile-media-meta .metric-grid strong {
          font-size: .84rem;
          line-height: 1.35;
        }
      }
      @media (max-width: 560px) {
        .profile-cta .link-buttons { grid-template-columns: 1fr; }
      }
    `;
  var runtimeStylesAdded = false;
  function addRuntimeStyles() {
    if (runtimeStylesAdded || !document.body) return;
    runtimeStylesAdded = true;
    if (/^\/admin\//.test(window.location.pathname)) return;
    var typography = document.createElement('style');
    typography.textContent = SITE_TYPOGRAPHY_CSS;
    document.head.appendChild(typography);
    document.documentElement.setAttribute('data-site-styles', ''); // main-core.js checks this
    if (document.body.getAttribute('data-mode') === 'project') { // read only: page type, not colour mode
      var profile = document.createElement('style');
      profile.textContent = PROJECT_PROFILE_CSS;
      document.head.appendChild(profile);
    }
  }

  if (document.readyState === 'loading') {
    /* Build the controls as soon as the system bar has been parsed, before the
       first paint. Waiting for DOMContentLoaded let fast connections paint the
       page first and then push everything down when the bar grew (layout shift). */
    var watcher = null;
    if (typeof MutationObserver === 'function') {
      watcher = new MutationObserver(function () {
        addRuntimeStyles(); // once <body> exists the head is complete
        var bar = document.querySelector('.system-bar');
        if (bar && bar.nextElementSibling) { // the bar is complete
          watcher.disconnect();
          buildControls();
        }
      });
      watcher.observe(document.documentElement, { childList: true, subtree: true });
    }
    document.addEventListener('DOMContentLoaded', function () {
      if (watcher) watcher.disconnect();
      addRuntimeStyles();
      buildControls(); // no-op when already built
    });
  } else {
    addRuntimeStyles();
    buildControls();
  }

  /* Minimal surface for debugging and tests; not part of the public API. */
  window.INDEX80Theme = {
    get: function () { return { theme: currentTheme(), mode: currentMode() }; },
    setTheme: setTheme,
    setMode: setMode
  };
})();

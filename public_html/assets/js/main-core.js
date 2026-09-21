/* INDEX:80 shared site script — small, framework-free, loaded on every page. */
(() => {
  document.documentElement.classList.add('js');

  // Human visual review (12 Sep 2026): reduce the site to two type roles.
  // 1) system monospace for all normal reading and interface text;
  // 2) Silkscreen only for the INDEX:80 identity and major page/project titles.
  // Also restore the earlier amber menu interaction, three-dot panel motif and
  // move the terminal cursor from the status text to the main wordmark.
  const typographyStyle = document.createElement('style');
  typographyStyle.textContent = `
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
    .dark .panel-title::before {
      background:
        linear-gradient(var(--accent),var(--accent)) 0 50% / .42rem .42rem no-repeat,
        linear-gradient(#2e4e69,#2e4e69) .78rem 50% / .42rem .42rem no-repeat,
        linear-gradient(#2e4e69,#2e4e69) 1.56rem 50% / .42rem .42rem no-repeat !important;
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
  document.head.appendChild(typographyStyle);

  // Human editorial review (11-12 Sep 2026): make the project profile denser,
  // readable and consistent with the rest of the site. Summary first, links in
  // a compact strip, then a light structured metadata frame. Normal record text
  // uses the shared system-mono face; only the project title remains Silkscreen.
  if (document.body && document.body.dataset.mode === 'project') {
    const style = document.createElement('style');
    style.textContent = `
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
    document.head.appendChild(style);

    // Temporary dev-review bridge for a newly added record that predates the
    // latest image-enrichment manifest. The image is served by the project's
    // own current official website. Once the normal enrichment run stores a
    // local asset/manifest entry, this fallback should be removed.
    const projectSlugMatch = window.location.pathname.match(/\/projects\/([^/]+)\/?/);
    const projectSlug = projectSlugMatch ? decodeURIComponent(projectSlugMatch[1]) : '';
    const reviewHeroBySlug = {
      'infinity-rising': {
        src: 'https://infinityrising.com/_next/image?q=75&url=https%3A%2F%2Fcdn.filestackcontent.com%2Fresize%3Dwidth%3A1920%2Fxi7Exs8vSLu8hJLnPZAp&w=3840',
        alt: 'Infinity Rising official game artwork'
      }
    };
    const reviewHero = reviewHeroBySlug[projectSlug];
    const emptyMediaMeta = document.querySelector('.profile-media-meta.no-image');
    if (reviewHero && emptyMediaMeta) {
      const media = document.createElement('div');
      media.className = 'profile-media';
      const img = document.createElement('img');
      img.src = reviewHero.src;
      img.alt = reviewHero.alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      media.appendChild(img);
      emptyMediaMeta.classList.remove('no-image');
      emptyMediaMeta.prepend(media);
    }
  }

  // The directory renderer has safe fallbacks for old records, but when the
  // Registry explicitly selects Primary Link we must honour that editorial
  // choice. Directory rows are client-rendered, so apply the canonical URL
  // after each render (including filter/sort rerenders) without duplicating
  // the directory's filtering logic.
  const directoryRoot = document.querySelector('[data-directory]');
  const directoryList = document.querySelector('#directory-list');
  if (directoryRoot && directoryList) {
    const source = directoryRoot.getAttribute('data-source') || 'data/projects.json';
    fetch(source)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`directory data ${r.status}`)))
      .then((data) => {
        const primaryBySlug = new Map(
          (data.projects || [])
            .filter((p) => typeof p.primary_link_url === 'string' && /^https?:\/\//i.test(p.primary_link_url))
            .map((p) => [p.slug, p.primary_link_url])
        );
        if (!primaryBySlug.size) return;
        const apply = () => {
          directoryList.querySelectorAll('.dir-row').forEach((row) => {
            const profile = row.querySelector('.dir-name');
            const external = row.querySelector('a.dir-link');
            if (!profile || !external) return;
            const match = (profile.getAttribute('href') || '').match(/\/projects\/([^/]+)\/?/);
            const slug = match ? decodeURIComponent(match[1]) : '';
            const url = primaryBySlug.get(slug);
            if (url) external.setAttribute('href', url);
          });
        };
        apply();
        new MutationObserver(apply).observe(directoryList, { childList: true });
      })
      .catch(() => { /* Directory fallback remains usable. */ });
  }

  // Generic "copy this value" control — any element with data-copy-value
  // copies that exact string on click (e.g. a project page's full Policy
  // ID, kept in the DOM even though the visible text is truncated).
  // navigator.clipboard can reject (permissions policy, non-secure-context
  // edge cases); falls back to selecting a temporary off-screen text node
  // and document.execCommand('copy') so a click is never silently a no-op.
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-copy-value]');
    if (!btn) return;
    const value = btn.getAttribute('data-copy-value') || '';
    const original = btn.textContent;
    const flash = (label) => {
      btn.textContent = label;
      setTimeout(() => { btn.textContent = original; }, 1200);
    };
    const fallbackCopy = () => {
      const temp = document.createElement('textarea');
      temp.value = value;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* ok stays false */ }
      document.body.removeChild(temp);
      flash(ok ? '✓' : '×');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(() => flash('✓')).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  });
})();

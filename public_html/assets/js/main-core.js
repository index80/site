/* INDEX:80 shared site script — small, framework-free, loaded on every page. */
(() => {
  document.documentElement.classList.add('js');

  // Human visual review (12 Sep 2026): reduce the site to two type roles.
  // 1) system monospace for all normal reading and interface text;
  // 2) Silkscreen only for the INDEX:80 identity and major page/project titles.
  // Also restore the earlier amber menu interaction, three-dot panel motif and
  // move the terminal cursor from the status text to the main wordmark.
  // The typography and project-profile styles from these reviews now live in theme.js,
  // which adds them before first paint (they used to arrive after load and shift the layout).
  // A browser still holding a cached theme.js from before that change reloads it here
  // (with this script's version), so the styles are never missing.
  if (!document.documentElement.hasAttribute('data-site-styles') && !/^\/admin\//.test(window.location.pathname)) {
    const self = document.currentScript && document.currentScript.src ? new URL(document.currentScript.src) : null;
    const refresh = document.createElement('script');
    refresh.src = `/assets/js/theme.js${self && self.search ? self.search : `?v=${Date.now()}`}`;
    document.head.appendChild(refresh);
  }

  // Human editorial review (11-12 Sep 2026): make the project profile denser,
  // readable and consistent with the rest of the site. Summary first, links in
  // a compact strip, then a light structured metadata frame. Normal record text
  // uses the shared system-mono face; only the project title remains Silkscreen.
  if (document.body && document.body.dataset.mode === 'project') {

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

  // People profile correction CTAs should go to People-specific guidance rather
  // than dropping a subject into the project-submission form.
  if (document.body?.dataset.mode === 'people') {
    document.querySelectorAll('.people-beta-status a[href="/submit/"]').forEach((link) => {
      link.setAttribute('href', '/about/methodology/#people-corrections');
    });
  }

  // Primary navigation: Data, Learn and Governance are one Explore area.
  // The older explicit links remain in static HTML as a useful no-JS fallback;
  // when JavaScript is available, replace them with one ordinary Explore link.
  const primaryNav = document.querySelector('.main-nav');
  if (primaryNav) {
    const existingExplore = primaryNav.querySelector('a[href="/explore/"]');
    const dataLink = primaryNav.querySelector('a[href="/data/"]');
    const learnLink = primaryNav.querySelector('a[href="/learn/"]');
    const governanceLink = primaryNav.querySelector('a[href="/governance/"]');
    const exploreIsCurrent = window.location.pathname === '/explore/'
      || [dataLink, learnLink, governanceLink].some((link) => link?.hasAttribute('aria-current'));

    let exploreLink = existingExplore;
    if (!exploreLink && dataLink && learnLink && governanceLink) {
      exploreLink = document.createElement('a');
      exploreLink.href = '/explore/';
      exploreLink.textContent = '▤ Explore';
      const aboutLink = primaryNav.querySelector('a[href="/about/"]');
      primaryNav.insertBefore(exploreLink, aboutLink || null);
    }
    if (exploreLink && exploreIsCurrent) exploreLink.setAttribute('aria-current', 'page');
    [dataLink, learnLink, governanceLink].forEach((link) => link?.remove());
  }

  // The wordmark suffix identifies the current top-level area. Project pages
  // retain /CARDANO; deep Learn/Governance/Data pages belong to /EXPLORE.
  const networkLabel = document.querySelector('.network-label');
  if (networkLabel) {
    const path = window.location.pathname;
    let label = '/CARDANO';
    if (path === '/people/' || path.startsWith('/people/')) label = '/PEOPLE';
    else if (
      path === '/explore/' || path.startsWith('/explore/')
      || path === '/learn/' || path.startsWith('/learn/')
      || path === '/governance/' || path.startsWith('/governance/')
      || path === '/data/' || path.startsWith('/data/')
    ) label = '/EXPLORE';
    else if (path === '/about/' || path.startsWith('/about/')) label = '/ABOUT';
    else if (path === '/registry/' || path.startsWith('/registry/')) label = '/REGISTRY';
    else if (path === '/submit/' || path.startsWith('/submit/')) label = '/SUBMIT';
    networkLabel.textContent = label;
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

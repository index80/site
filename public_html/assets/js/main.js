/* INDEX:80 shared script loader.
   Existing site behaviour lives in main-core.js; page-specific enhancements
   are loaded separately so the static site stays small and framework-free. */
(() => {
  const VERSION = '20260921-1840';
  const load = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${src}?v=${VERSION}`;
    script.async = false;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  // Stale-page detection for Safari/WebKit's back-forward cache (bfcache).
  // A bfcache restore fires 'pageshow' with persisted:true but does not
  // re-run this script, so VERSION above stays frozen at whatever was true
  // when the page actually loaded. Comparing it against a live, uncached
  // fetch of site-version.json lets a resumed old page notice a newer
  // deploy exists and reload itself exactly once. sessionStorage guards
  // against looping if the reload still lands on a stale response.
  const RELOAD_GUARD_KEY = 'index80-reloaded-for-version';

  function checkForNewVersion() {
    fetch('/site-version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const latest = data && data.version;
        if (!latest || latest === VERSION) return;
        let alreadyTried = '';
        try { alreadyTried = sessionStorage.getItem(RELOAD_GUARD_KEY) || ''; } catch { /* private mode etc. */ }
        if (alreadyTried === latest) return;
        try { sessionStorage.setItem(RELOAD_GUARD_KEY, latest); } catch { /* ignore */ }
        location.reload();
      })
      .catch(() => { /* offline or blocked: keep showing the current page */ });
  }

  checkForNewVersion();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) checkForNewVersion();
  });

  function ensurePrivacyLink() {
    document.querySelectorAll('.footer-nav').forEach((nav) => {
      if (nav.querySelector('a[href="/privacy/"]')) return;
      const link = document.createElement('a');
      link.href = '/privacy/';
      link.textContent = '▦ Privacy';
      nav.appendChild(link);
    });
  }

  function ensureOfficialXLink() {
    document.querySelectorAll('.footer-meta').forEach((meta) => {
      if (meta.querySelector('a[data-index80-x]')) return;
      const link = document.createElement('a');
      link.href = 'https://x.com/index80web';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'footer-social';
      link.dataset.index80X = 'true';
      link.setAttribute('aria-label', 'INDEX:80 on X (@index80web)');
      link.textContent = '𝕏 @index80web ↗';
      const consent = meta.querySelector('[data-consent-toggle]');
      if (consent) consent.insertAdjacentElement('beforebegin', link);
      else meta.appendChild(link);
    });
  }

  // Concise licence/copyright reference. Third-party project assets are not covered
  // by INDEX:80 licences (see docs/ASSET_PROVENANCE.md), so the wording is limited to
  // INDEX:80's own code and data/editorial content.
  function ensureLicenceLine() {
    document.querySelectorAll('.footer-meta').forEach((meta) => {
      if (meta.querySelector('[data-index80-licence]')) return;
      const line = document.createElement('span');
      line.className = 'footer-licence';
      line.dataset.index80Licence = 'true';
      line.append('© 2026 Adam Winstanley · Apache-2.0 code · CC BY 4.0 data/editorial · ');
      const gh = document.createElement('a');
      gh.href = 'https://github.com/index80/site';
      gh.target = '_blank';
      gh.rel = 'noopener noreferrer';
      gh.textContent = 'GitHub ↗';
      line.appendChild(gh);
      const consent = meta.querySelector('[data-consent-toggle]');
      if (consent) consent.insertAdjacentElement('beforebegin', line);
      else meta.appendChild(line);
    });
  }

  function ensureRegistryLink() {
    document.querySelectorAll('.main-nav, .footer-nav').forEach((nav) => {
      let link = nav.querySelector('a[href="/registry/"]');
      if (!link) {
        link = document.createElement('a');
        link.href = '/registry/';
        link.textContent = '▣ Registry';
        const about = nav.querySelector('a[href="/about/"]');
        if (about) about.insertAdjacentElement('afterend', link);
        else nav.appendChild(link);
      }
      if (document.body?.dataset.page === 'registry' || document.body?.dataset.page === 'registry-snapshot') {
        link.setAttribute('aria-current', 'page');
        nav.querySelectorAll('a[aria-current="page"]').forEach((other) => {
          if (other !== link) other.removeAttribute('aria-current');
        });
      }
    });
  }

  function enhanceRegistryPage() {
    if (!document.body || document.body.dataset.page !== 'registry') return;

    const heroCopy = document.querySelector('.registry-hero .hero-copy');
    if (heroCopy && !heroCopy.querySelector('.registry-hero-art')) {
      const art = document.createElement('div');
      art.className = 'registry-hero-art';
      art.innerHTML = '<img src="/assets/images/index80-registry-astronaut-cat.webp" alt="Pixel-art INDEX:80 astronaut working at a retro computer with the black cat beside them and a Cardano mug on the desk." width="720" height="540" loading="eager">';
      heroCopy.appendChild(art);
    }

    const release = document.querySelector('.registry-release');
    const releaseId = release?.querySelector('.registry-release-head h2')?.textContent?.trim();
    const snapshotButton = release?.querySelector('.registry-actions-primary a.primary');
    if (releaseId && snapshotButton) {
      const slug = releaseId.toLowerCase();
      const rawHref = snapshotButton.getAttribute('href');
      snapshotButton.href = `/registry/view/?release=${encodeURIComponent(slug)}`;
      snapshotButton.textContent = 'VIEW SNAPSHOT TABLE';

      const technicalActions = release.querySelector('.registry-technical .registry-actions');
      if (technicalActions && rawHref && !technicalActions.querySelector('[data-raw-snapshot]')) {
        const raw = document.createElement('a');
        raw.href = rawHref;
        raw.dataset.rawSnapshot = 'true';
        raw.textContent = 'Raw snapshot JSON';
        technicalActions.prepend(raw);
      }
    }
  }

  function ensureProjectMediaFit() {
    if (!document.body || document.body.dataset.mode !== 'project') return;
    if (document.getElementById('index80-project-media-fit')) return;
    const style = document.createElement('style');
    style.id = 'index80-project-media-fit';
    style.textContent = `
      .profile-media-meta .profile-media {
        background: var(--paper-2);
      }
      .profile-media-meta .profile-media img {
        object-fit: contain;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureDirectorySearchFit() {
    if (!document.querySelector('.directory-search')) return;
    if (document.getElementById('index80-directory-search-fit')) return;
    const style = document.createElement('style');
    style.id = 'index80-directory-search-fit';
    style.textContent = `
      .directory-search {
        flex: 0 1 420px;
        min-width: 340px;
        max-width: 100%;
      }
      @media (max-width: 800px) {
        .directory-search {
          flex: 1 1 100%;
          width: 100%;
          min-width: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function initialiseSharedChrome() {
    ensureRegistryLink();
    ensurePrivacyLink();
    ensureOfficialXLink();
    ensureLicenceLine();
    enhanceRegistryPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseSharedChrome, { once: true });
  } else {
    initialiseSharedChrome();
  }

  // treasury-rule.js first: the shared "confirmed funded" rule the Treasury
  // scripts below (and directory.js) depend on.
  Promise.all([load('/assets/js/treasury-rule.js'), load('/assets/js/main-core.js')])
    .then(() => {
      const loads = [];
      ensureProjectMediaFit();
      ensureDirectorySearchFit();
      if (document.body && document.body.dataset.mode === 'project') {
        loads.push(load('/assets/js/treasury.js'));
      }
      if (document.querySelector('[data-directory]')) {
        loads.push(load('/assets/js/treasury-directory.js'));
        loads.push(load('/assets/js/treasury-summary.js'));
      }
      if (document.body?.dataset.mode === 'data' && document.body?.dataset.page !== 'registry' && document.body?.dataset.page !== 'registry-snapshot') {
        loads.push(load('/assets/js/cardano-data-live.js'));
      }
      return Promise.all(loads);
    })
    .catch(() => { /* Keep the page usable if an enhancement fails. */ });
})();

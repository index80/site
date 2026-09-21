/* INDEX:80 analytics loader — shared across every page (incl. generated project pages).
   Direct gtag.js (no GTM). Production-only, consent-gated:
   - Only runs on index80.com / www.index80.com — never on *.pages.dev previews or localhost.
   - Loads nothing and sends nothing until the visitor accepts the consent banner.

   This file is also the earliest shared script on generated project pages, so it
   loads the separate treasury UI enhancer before the production-only analytics
   gate. Treasury rendering itself remains isolated in treasury.js. */
(() => {
  if (document.body?.dataset.mode === 'project' || /\/projects\//.test(window.location.pathname)) {
    // Ordered (async=false): the shared confirmed-funding rule must run before treasury.js.
    ['/assets/js/treasury-rule.js', '/assets/js/treasury.js'].forEach((src) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      document.head.appendChild(script);
    });
  }

  const GA_ID = 'G-5Y3SMF1NGB';
  const PROD_HOSTS = ['index80.com', 'www.index80.com'];
  const CONSENT_KEY = 'index80_analytics_consent';

  if (!PROD_HOSTS.includes(window.location.hostname)) return;

  function loadGtag() {
    if (window.__index80GtagLoaded) return;
    window.__index80GtagLoaded = true;
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
  }

  function getConsent() {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function setConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, value); } catch (e) { /* no storage available */ }
  }

  function renderBanner() {
    if (document.getElementById('index80-consent')) return;
    const el = document.createElement('div');
    el.id = 'index80-consent';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Cookie consent');
    el.innerHTML =
      '<p>INDEX:80 uses optional analytics (Google Analytics) to see which pages are useful. ' +
      'Nothing is sent unless you accept. Read the <a href="/privacy/">Data &amp; Privacy Policy</a>.</p>' +
      '<div class="consent-actions">' +
        '<button type="button" class="button primary" data-consent="granted">Accept</button>' +
        '<button type="button" class="button" data-consent="denied">Decline</button>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-consent]');
      if (!btn) return;
      const choice = btn.getAttribute('data-consent');
      setConsent(choice);
      el.remove();
      if (choice === 'granted') loadGtag();
    });
  }

  function bindFooterToggle() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-consent-toggle]')) renderBanner();
    });
  }

  const consent = getConsent();
  if (consent === 'granted') loadGtag();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindFooterToggle();
      if (consent !== 'granted' && consent !== 'denied') renderBanner();
    });
  } else {
    bindFooterToggle();
    if (consent !== 'granted' && consent !== 'denied') renderBanner();
  }
})();

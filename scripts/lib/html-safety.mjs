/**
 * Shared HTML-output safety helpers for the static generators.
 *
 * Registry-derived text (names, summaries, URLs) is edited by people through
 * the Editorial Registry and must never reach generated HTML unescaped, and
 * only http(s) URLs may ever become a clickable link — a `javascript:`,
 * `data:`, `vbscript:` etc. value is dropped rather than rendered, even if it
 * slipped past Registry validation.
 *
 * The browser scripts (assets/js/directory.js, registry-view.js,
 * cardano-data-live.js, treasury.js, treasury-summary.js) carry one-line
 * copies of the same rules because they load without a module system;
 * scripts/test-url-safety.mjs proves every copy behaves identically.
 */

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

export const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

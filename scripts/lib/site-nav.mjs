/**
 * Canonical INDEX:80 site navigation — the single source for the header and
 * footer menus in every generator (projects, People, registry history).
 * Static pages carry the same links; scripts/test-site-navigation.mjs checks
 * that every page on the site matches this order exactly.
 */
export const SITE_NAV = [
  ['/', '▦ Projects'],
  ['/people/', '◎ People'],
  ['/data/', '▥ Data'],
  ['/learn/', '▤ Learn'],
  ['/governance/', '⌂ Governance'],
  ['/about/', '◇ About'],
  ['/registry/', '▣ Registry'],
  ['/submit/', '✎ Submit'],
];

export const SITE_NAV_HREFS = SITE_NAV.map(([href]) => href);

/** Renders the nav links, one per line, marking `current` with aria-current. */
export function renderNavLinks(current = null, indent = '      ') {
  return SITE_NAV.map(([href, label]) => `${indent}<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`).join('\n');
}

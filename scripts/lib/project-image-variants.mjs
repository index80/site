/**
 * Theme-aware project artwork — the single resolver.
 *
 * public_html/data/project-images.json keeps one entry per project with
 * image ROLES ("icon", "hero"). Any role may additionally carry optional
 * colour-mode overrides alongside it, using the same entry shape:
 *
 *   "<role>"        existing/default image (unchanged meaning)
 *   "<role>_light"  optional LIGHT colour-mode override
 *   "<role>_dark"   optional DARK colour-mode override
 *
 * Resolution (independent of the WEB 1.0 / ARCADE style — both use the
 * same colour-mode choice, html[data-color-mode]):
 *
 *   LIGHT → <role>_light || <role>
 *   DARK  → <role>_dark  || <role>
 *
 * Variants are presentational only: structured data and og:image keep the
 * default <role> image. Nothing here is project-specific.
 */

export const COLOR_MODES = Object.freeze(['light', 'dark']);

export const isResolvedImage = (entry) => Boolean(entry && entry.status === 'ok' && entry.path);

/**
 * @param {object|undefined} entries  one project's entry from project-images.json
 * @param {string} role               "hero" | "icon" | …
 * @returns {{ base: object|null, light: object|null, dark: object|null, themed: boolean }}
 *   themed = the two colour modes resolve to different images, so the page
 *   must carry both and let CSS show the one for the current mode.
 */
export function resolveThemedImage(entries, role = 'hero') {
  const pick = (key) => (isResolvedImage(entries?.[key]) ? entries[key] : null);
  const base = pick(role);
  const light = pick(`${role}_light`) || base;
  const dark = pick(`${role}_dark`) || base;
  const themed = (light?.path || null) !== (dark?.path || null);
  return { base, light, dark, themed };
}

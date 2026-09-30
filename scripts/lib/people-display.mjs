/**
 * Display rules shared by the People profile and directory generators
 * (mirrored in public_html/assets/js/people-directory.js).
 */

/** DRep facts/badge only for a recorded DRep ID with an active status. */
export const hasVerifiedDrep = (p) => Boolean(p.drep_id) && /^Active\b/i.test(p.drep_status || '');

/** SPO facts/badge only for an active status with a ticker or pool ID. */
export const hasVerifiedSpo = (p) => /^Active\b/i.test(p.spo_status || '') && Boolean(p.pool_ticker || (p.pool_ids || []).length);

export function initials(name) {
  const cleaned = String(name || '').replace(/^[$@#]+/, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Migration fallback only: the pre-subtitle strap (first Current Role, else
 * the first role tags). Remove once every staged record has a canonical
 * Profile Subtitle.
 */
export function inferredRole(p) {
  if ((p.current_roles || []).length) return p.current_roles[0];
  return (p.role_tags || []).slice(0, 4).join(' · ');
}

/**
 * The line beneath a person's name. The canonical `profile_subtitle` (Sheet
 * column "Profile Subtitle") always wins; the inferred role is used only
 * while the Sheet migration is in progress. Custom profiles (e.g. Charles
 * Hoskinson) should use this too so the identity hierarchy stays consistent.
 */
export function profileStrap(p) {
  if (p.profile_subtitle) return {text:p.profile_subtitle, source:'canonical'};
  return {text:inferredRole(p), source:'fallback'};
}

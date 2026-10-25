// Small People-directory portraits, derived from approved published avatars.
//
// The directory shows portraits at 24 CSS px; the approved avatars are 400–500 px.
// tools/people-thumbs/generate.mjs (manual, needs cwebp) writes a 144×144 centre-cropped
// WebP for each approved avatar, named after the SHA-256 of the exact source bytes:
//   public_html/assets/people-thumbs/<slug>-<first 12 hex of source sha256>.webp
// The build only *references* a thumbnail whose name matches the current avatar's bytes,
// so a replaced or removed portrait is never shown through a stale thumbnail; otherwise
// the directory falls back to the full avatar. The build never writes or deletes images.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const THUMB_DIR = 'assets/people-thumbs';
export const THUMB_PX = 144; // 6× the 24 px directory display: matches Chrome's own downscale on 3× screens
export const THUMB_QUALITY = 82;
export const THUMB_RE = /^\/assets\/people-thumbs\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{12}\.webp$/;

export const thumbName = (slug, sourceSha256) => `${slug}-${String(sourceSha256).slice(0, 12)}.webp`;
export const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * Content check of every thumbnail file in a repository tree (DEV checkout or frozen release
 * candidate): each must be byte-identical to an entry in registry-private/people/people-thumbs.json, and
 * that entry's source must be the portrait currently approved (registry-private/people/avatars.json,
 * same SHA-256), shown (public_html/data/people.json) and not suppressed (PFP Status).
 *   unknown — not in the manifest / bytes differ / records unavailable (never acceptable)
 *   retired — derived from a portrait since replaced, withdrawn or suppressed. Sid cannot delete
 *             files, so these stay in DEV until removed by a reviewed change (npm run people:thumbs
 *             -- --prune plus tools/public-export/intentional-deletions.txt); Stage 4 refuses to
 *             publish a thumbnail of a withdrawn or suppressed portrait.
 */
export function auditThumbnails(treeRoot, { suppressRe }) {
  const dir = join(treeRoot, 'public_html', THUMB_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith('.')) : [];
  const out = { checked: files.length, ok: [], unknown: [], retired: [] };
  if (!files.length) return out;
  const read = (rel) => { try { return JSON.parse(readFileSync(join(treeRoot, rel), 'utf8')); } catch { return null; } };
  const manifest = read('registry-private/people/people-thumbs.json');
  const avatars = read('registry-private/people/avatars.json')?.avatars;
  const people = read('public_html/data/people.json')?.people;
  const registry = read('registry-private/people/editorial-people-registry.json')?.records;
  if (!manifest?.entries || !avatars || !people || !registry) {
    for (const n of files) out.unknown.push({ path: `/${THUMB_DIR}/${n}`, reason: 'thumbnail records are unavailable, so it cannot be verified' });
    return out;
  }
  const shown = new Map(people.filter((p) => p.avatar_url).map((p) => [p.slug, p.avatar_url]));
  const status = new Map(registry.map((r) => [String(r.Slug).trim(), String(r['PFP Status'] || '').trim()]));
  for (const n of files) {
    const path = `/${THUMB_DIR}/${n}`, e = manifest.entries[n];
    if (!e || sha256File(join(dir, n)) !== e.thumb_sha256) { out.unknown.push({ path, reason: 'not a recorded thumbnail (missing from the manifest or bytes differ)' }); continue; }
    const a = avatars[e.slug];
    if (suppressRe.test(status.get(e.slug) || '')) out.retired.push({ path, slug: e.slug, privacy: true, reason: `portrait suppressed (PFP Status ${status.get(e.slug)})` });
    else if (!a || !shown.has(e.slug)) out.retired.push({ path, slug: e.slug, privacy: true, reason: 'portrait withdrawn (no approved, shown portrait)' });
    else if (a.sha256 !== e.source_sha256 || a.path !== e.source_path || shown.get(e.slug) !== a.path) out.retired.push({ path, slug: e.slug, privacy: false, reason: 'portrait replaced' });
    else out.ok.push(path);
  }
  return out;
}

/** The thumbnail URL for an approved avatar URL, or null when none matches its current bytes. */
export function thumbFor(publicRoot, slug, avatarUrl) {
  if (!slug || typeof avatarUrl !== 'string' || !avatarUrl.startsWith(`/assets/people/${slug}/`)) return null;
  const source = join(publicRoot, avatarUrl);
  if (!existsSync(source)) return null;
  const name = thumbName(slug, sha256File(source));
  return existsSync(join(publicRoot, THUMB_DIR, name)) ? `/${THUMB_DIR}/${name}` : null;
}

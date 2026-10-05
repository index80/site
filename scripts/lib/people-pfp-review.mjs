/**
 * DEV-only candidate PFP review mode for the protected People preview.
 *
 * This is deliberately separate from the production-approved avatar pipeline
 * (avatars.json + PFP Status APPROVED -> avatar_url in people.json). Candidate
 * images collected for editorial review are copied into the BUILD OUTPUT only,
 * only on the protected `people-directory-v0-1` Cloudflare preview, and never
 * change people.json, PFP Status or reuse/permission state (PENDING REVIEW).
 *
 * A candidate is used only when it was taken from the record's own canonical
 * X/LinkedIn profile (the public persona's avatar), its file exists, its
 * SHA-256 matches the manifest and it carries no `review_exclusion`.
 *
 * Image suitability is the owner's decision on the protected preview: a
 * person's own chosen avatar (illustration, logo/personal mark, mascot, group
 * or family photo, informal photo) is a valid candidate. `review_exclusion`
 * is for objective problems only — wrong account, identity not confidently
 * connected, provenance/hash failure, corrupt/unsupported file, or a clearly
 * unrelated third-party/project image rather than the chosen avatar.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REVIEW_BRANCH = 'people-directory-v0-1';
export const REVIEW_ASSET_DIR = 'assets/people-review';
export const REVIEW_MAP_FILE = 'data/people-pfp-review.json';
export const REVIEW_LABEL = 'DEV review · permission pending';
const EXT = {'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp'};

/**
 * Review mode is OFF by default everywhere, including the People preview
 * branch (now shared with invited external reviewers, so it must show exactly
 * what production shows: no PENDING PERMISSION portraits). It is on only when
 * explicitly requested with INDEX80_PEOPLE_PFP_REVIEW=1 (local review, or a
 * deliberately set Preview-environment variable), and can never be forced on
 * `dev`, `main` or any production/candidate build.
 */
export function reviewModeEnabled(env = process.env) {
  const branch = env.CF_PAGES_BRANCH || '';
  if (branch === 'main' || branch === 'dev' || env.INDEX80_PRODUCTION_BUILD === '1') return false;
  return env.INDEX80_PEOPLE_PFP_REVIEW === '1';
}

const norm = (url) => String(url || '').trim().replace(/\/+$/, '').toLowerCase();

/**
 * Selects candidate images for staged public people. Returns
 * [{slug, research_id, src (repo-relative), public_path, source_url}] and a
 * list of skipped reasons.
 */
export function selectCandidates(people, registry, manifest, {root}) {
  const rowBySlug = new Map((registry.records || []).map((r) => [String(r['Slug']).trim(), r]));
  const byResearchId = new Map((manifest.records || []).map((m) => [m.research_id, m]));
  const chosen = [];
  const skipped = [];
  for (const p of people) {
    const row = rowBySlug.get(p.slug);
    const cand = row && byResearchId.get(String(row['Research ID'] || '').trim());
    if (!cand || cand.status !== 'COLLECTED' || !cand.candidate_original_path) {
      skipped.push({slug:p.slug, reason:'no collected candidate'});
      continue;
    }
    // Objective exclusion only (see header); the file and evidence are kept.
    if (cand.review_exclusion) {
      skipped.push({slug:p.slug, reason:`excluded: ${cand.review_exclusion.reason}`});
      continue;
    }
    const own = [norm(p.x_url), norm(p.linkedin_url)].filter(Boolean);
    if (!own.includes(norm(cand.source_page_url))) {
      skipped.push({slug:p.slug, reason:'candidate is not from the record\'s own canonical X/LinkedIn profile'});
      continue;
    }
    const ext = EXT[cand.original_mime_type];
    const src = join(root, cand.candidate_original_path);
    if (!ext || !existsSync(src)) {
      skipped.push({slug:p.slug, reason:'candidate file missing or unsupported type'});
      continue;
    }
    if (createHash('sha256').update(readFileSync(src)).digest('hex') !== cand.sha256) {
      skipped.push({slug:p.slug, reason:'candidate file does not match manifest hash'});
      continue;
    }
    chosen.push({
      slug:p.slug,
      research_id:cand.research_id,
      src:cand.candidate_original_path,
      public_path:`/${REVIEW_ASSET_DIR}/${p.slug}.${ext}`,
      source_url:cand.source_page_url,
    });
  }
  return {chosen, skipped};
}

/** Reads the review map written into the build output, or null when review mode is off. */
export function loadReviewMap(publicRoot) {
  const file = join(publicRoot, REVIEW_MAP_FILE);
  if (!existsSync(file)) return null;
  const map = JSON.parse(readFileSync(file, 'utf8'));
  return map && map.mode === 'dev-review' ? map : null;
}

import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const GENERATED_PROFILE_MARKER = 'INDEX80_GENERATED_PEOPLE_PROFILE';
export const PEOPLE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Public People record, in the exact key order the importer writes. Anything
// not listed here is editorial/internal and must never reach people.json.
export const PUBLIC_PERSON_KEYS = [
  'slug', 'name', 'profile_subtitle', 'primary_category', 'category_slug', 'filter_label', 'icon',
  'role_tags', 'bio', 'current_roles', 'historic_roles', 'verification_status',
  'drep_status', 'drep_id', 'spo_status', 'pool_ticker', 'pool_ids',
  'linked_projects', 'x_url', 'linkedin_url', 'website_url', 'github_url',
  'instagram_url', 'youtube_url', 'last_verified', 'profile_url', 'profile_type',
  'avatar_url', 'avatar_alt', 'avatar_credit', 'avatar_source_url',
];
export const PUBLIC_PERSON_FIELDS = new Set(PUBLIC_PERSON_KEYS);
// No minimum: a short factual bio from the registry is rendered as written.
export const BIO_MAX_WORDS = 160;
// Paths under /people/ that are shared pages, never person slugs.
export const RESERVED_PEOPLE_SLUGS = new Set(['methodology']);
const STRING_ARRAY_FIELDS = ['role_tags', 'current_roles', 'historic_roles', 'linked_projects', 'pool_ids'];
// Each public link field may only point at the platform it is labelled as.
const LINK_HOSTS = {
  x_url: /^(?:www\.)?(?:x|twitter)\.com$/,
  linkedin_url: /^(?:[a-z]{2,3}\.)?linkedin\.com$/,
  github_url: /^github\.com$/,
  instagram_url: /^(?:www\.)?instagram\.com$/,
  youtube_url: /^(?:(?:www|m)\.)?youtube\.com$|^youtu\.be$/,
  website_url: /./,
  avatar_source_url: /./,
};
const PLAIN_TEXT_RE = /^[^<>\u0000-\u0008\u000b-\u001f\u007f]*$/u;

const FORBIDDEN_EDITORIAL_FIELD = /^(?:identity.?basis|identity.?safety|pfp.?(?:status|permission)|contact.?(?:status|date)|subject.?confirmed|publication.?(?:status|decision)|owner.?decision|internal.*(?:identity|note)|researched.*name)$/i;
const PUBLIC_NAME_RE = /^[^<>\u0000-\u001f\u007f]+$/u;
const SITE_AVATAR_RE = /^\/assets\/people\/[a-z0-9][a-z0-9/_-]*\.(?:avif|gif|jpe?g|png|webp)$/i;

export function safeExternalUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function safeAvatarPath(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !SITE_AVATAR_RE.test(value)) return null;
  if (value.includes('..') || value.includes('//') || value.includes('\\')) return null;
  return value;
}

export function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function validatePublicPerson(person, {publicRoot, requireAvatarFile = true} = {}) {
  if (!person || typeof person !== 'object' || Array.isArray(person)) {
    throw new Error('People record must be an object');
  }
  for (const key of Object.keys(person)) {
    if (FORBIDDEN_EDITORIAL_FIELD.test(key) || !PUBLIC_PERSON_FIELDS.has(key)) {
      throw new Error(`Non-public People field: ${key}`);
    }
  }
  if (!PEOPLE_SLUG_RE.test(person.slug || '')) throw new Error(`Invalid People slug: ${person.slug}`);
  if (RESERVED_PEOPLE_SLUGS.has(person.slug)) throw new Error(`Reserved People slug: ${person.slug}`);
  if (typeof person.name !== 'string' || !PUBLIC_NAME_RE.test(person.name) || person.name.trim() !== person.name || person.name.length > 120) {
    throw new Error(`Invalid public People name: ${person.slug}`);
  }
  if (person.profile_url !== `/people/${person.slug}/`) {
    throw new Error(`People profile_url must match slug: ${person.slug}`);
  }
  if (!['generated', 'custom'].includes(person.profile_type)) {
    throw new Error(`Invalid People profile_type: ${person.slug}`);
  }
  for (const field of STRING_ARRAY_FIELDS) {
    const value = person[field];
    if (value == null && field !== 'role_tags' && field !== 'linked_projects') continue;
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.trim() && PLAIN_TEXT_RE.test(v))) {
      throw new Error(`People ${field} must be an array of plain strings: ${person.slug}`);
    }
  }
  if (person.profile_subtitle != null) {
    const sub = person.profile_subtitle;
    if (typeof sub !== 'string' || !sub || sub.trim() !== sub || /[\r\n]/.test(sub) || !PLAIN_TEXT_RE.test(sub) || sub.length > 90) {
      throw new Error(`People profile_subtitle must be one line of plain text, at most 90 characters: ${person.slug}`);
    }
  }
  if (person.bio != null) {
    if (typeof person.bio !== 'string' || !PLAIN_TEXT_RE.test(person.bio) || person.bio.trim() !== person.bio) {
      throw new Error(`People bio must be plain text: ${person.slug}`);
    }
    const words = wordCount(person.bio);
    if (words < 1 || words > BIO_MAX_WORDS) {
      throw new Error(`People bio must be 1-${BIO_MAX_WORDS} words (has ${words}): ${person.slug}`);
    }
  }
  for (const [field, hostRe] of Object.entries(LINK_HOSTS)) {
    if (person[field] == null) continue;
    if (safeExternalUrl(person[field]) !== person[field]) throw new Error(`Unsafe People ${field}: ${person.slug}`);
    if (!hostRe.test(new URL(person[field]).hostname)) throw new Error(`People ${field} points at the wrong host: ${person.slug}`);
  }
  for (const field of ['avatar_alt', 'avatar_credit']) {
    if (person[field] != null && (typeof person[field] !== 'string' || !PLAIN_TEXT_RE.test(person[field]))) {
      throw new Error(`People ${field} must be plain text: ${person.slug}`);
    }
  }
  if (person.avatar_url == null && (person.avatar_alt != null || person.avatar_credit != null || person.avatar_source_url != null)) {
    throw new Error(`People avatar metadata without an avatar: ${person.slug}`);
  }
  if (person.avatar_url != null) {
    const avatar = safeAvatarPath(person.avatar_url);
    if (!avatar) throw new Error(`Unsafe People avatar_url: ${person.slug}`);
    if (!avatar.startsWith(`/assets/people/${person.slug}/`)) {
      throw new Error(`People avatar must live under /assets/people/${person.slug}/: ${person.slug}`);
    }
    if (!person.avatar_alt || !person.avatar_credit) {
      throw new Error(`People avatar needs alt text and a credit: ${person.slug}`);
    }
    if (requireAvatarFile && publicRoot && !existsSync(join(publicRoot, avatar.slice(1)))) {
      throw new Error(`Missing People avatar asset: ${person.slug}`);
    }
  }
  return person;
}

export function pruneStaleGeneratedProfiles(peopleDir, activeSlugs) {
  let pruned = 0;
  for (const entry of readdirSync(peopleDir, {withFileTypes:true})) {
    if (!entry.isDirectory() || activeSlugs.has(entry.name)) continue;
    const indexFile = join(peopleDir, entry.name, 'index.html');
    if (!existsSync(indexFile)) continue;
    const html = readFileSync(indexFile, 'utf8');
    if (!html.includes(`<!-- ${GENERATED_PROFILE_MARKER} -->`)) continue;
    rmSync(join(peopleDir, entry.name), {recursive:true});
    pruned += 1;
  }
  return pruned;
}

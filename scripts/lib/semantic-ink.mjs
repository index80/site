/**
 * INDEX:80 semantic accent words ("ink") — site-wide brand vocabulary.
 *
 * INK_TONES is the owner-approved, authoritative dictionary: one concept word
 * maps to exactly one colour family, so a word always renders in the same
 * colour on every page. Matching is case-insensitive and keeps the displayed
 * casing. Do not add terms without owner approval.
 *
 * inkHtml() is the one shared wrapper used at build time for every public page
 * (scripts/apply-semantic-ink.mjs): it only touches prose text inside <main>,
 * never names, links, buttons, code, tables, form controls, IDs, hashes,
 * technical/data values or containers that JavaScript re-renders. Output is
 * deterministic and idempotent (existing ink spans are stripped first), and no
 * JavaScript recolours text at runtime. Colours live in the .ink-* classes in
 * assets/css/site.css.
 */

export const INK_TONES = Object.freeze({
  gold: ['immutable', 'permanent', 'fingerprint', 'proof', 'decentralised', 'scalable', 'secure', 'locked', 'Bitcoin', 'ADA', 'BTC', '$'],
  green: ['public', 'open', 'verified', 'confirmed', 'live', 'active', 'people', 'community', 'governance', 'DRep', 'voting', 'vote'],
  blue: ['Cardano', 'blockchain', 'on-chain', 'chain', 'mainnet'],
  magenta: ['data', 'JSON', 'API', 'SHA-256', 'hash', 'source', 'sources', 'snapshot', 'snapshots', 'code', 'technology'],
  purple: ['archived', 'historic', 'pending', 'partial', 'observed'],
  cyan: ['ecosystem', 'AI', 'humans', 'research', 'creative'],
});

export const INK_FAMILIES = Object.freeze(Object.keys(INK_TONES));

const TONE_BY_WORD = new Map();
for (const [tone, words] of Object.entries(INK_TONES)) {
  for (const word of words) {
    const key = word.toLowerCase();
    if (TONE_BY_WORD.has(key)) throw new Error(`semantic-ink: "${word}" is mapped to more than one colour`);
    TONE_BY_WORD.set(key, tone);
  }
}

/** The dictionary tone for a word (case-insensitive), or null if it is not an ink word. */
export function inkTone(word) {
  return TONE_BY_WORD.get(String(word).toLowerCase()) || null;
}

/** Remove ink spans, keeping their text. */
export function stripInk(html) {
  return String(html).replace(/<span class="ink ink-[a-z]+">([^<]*)<\/span>/g, '$1');
}

// ---- matching ---------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD_TERMS = [...TONE_BY_WORD.keys()].filter((w) => w !== '$').sort((a, b) => b.length - a.length || a.localeCompare(b));
// Word terms must stand alone: not part of a longer word, hyphenated compound,
// path, URL, domain, handle, file name (index80-0004.json) or HTML entity.
const WORD_RE = new RegExp(`(?<![\\p{L}\\p{N}_\\-./@#:&;$€£₳])(${WORD_TERMS.map(escapeRe).join('|')})(?![\\p{L}\\p{N}_\\-/@#]|\\.[\\p{L}\\p{N}])`, 'giu');
// "$" only as a standalone prose/label token — never inside a value such as $1.2M.
const DOLLAR_RE = /(?<=^|[\s(])(\$)(?=$|[\s),.;:])/g;

const HEADING = /^h[1-6]$/;
const BLOCK_TAGS = new Set(['p', 'li', 'dd', 'dt', 'blockquote', 'figcaption', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Elements whose text is never prose: links, controls, code, tables, chrome.
export const EXCLUDED_TAGS = new Set([
  'a', 'button', 'nav', 'header', 'footer', 'form', 'input', 'textarea', 'select', 'option', 'label',
  'code', 'pre', 'kbd', 'samp', 'var', 'th', 'td', 'summary', 'title', 'svg', 'time', 'noscript', 'template', 'iframe',
]);
// Names, IDs, tags, factual data cells, technical values, status chips and
// JavaScript-hydrated containers (static ink there would flicker away).
export const EXCLUDED_CLASSES = new Set([
  'eyebrow', 'os-titlebar-heading', 'visually-hidden', 'skip-link', 'global-search', 'gs-results', 'search-results',
  'directory', 'dir-list', 'category-bar', 'cat-chip', 'directory-count', 'tag-chip', 'tag-list', 'badge', 'badge-treasury',
  'profile-heading', 'profile-cat', 'profile-tags', 'profile-cta', 'link-buttons', 'link-row', 'metric-grid', 'policy-id-cell',
  'treasury-metric', 'profile-source', 'source-list', 'source-line',
  'people-record-name', 'people-subtitle', 'people-crumb', 'people-record-cat', 'people-meta', 'people-role-list',
  'people-links', 'people-fact-body', 'people-list', 'people-card', 'people-beta-status', 'people-beta-notice',
  'current-state-grid', 'signals-title', 'data-status-strip', 'data-metrics', 'data-metric', 'market-table', 'market-table-wrap', 'data-source-list',
  'registry-facts', 'registry-proof-lines', 'registry-history', 'registry-machine-links', 'registry-wallet-address',
  'registry-verify-hash', 'registry-verify-code', 'registry-status', 'registry-mini-status', 'registry-kicker',
  'registry-release-number', 'registry-snapshot-meta', 'registry-snapshot-toolbar', 'registry-snapshot-table-wrap',
  'change-counts', 'change-entity-list', 'change-update', 'change-fields', 'copy-btn', 'hero-art',
  // Hero page titles (the large pixel H1 + /SECTION label) keep their artwork identity.
  'registry-hero-title', 'people-record-name',
]);
export const EXCLUDED_IDS = new Set([
  'directory-list', 'category-bar', 'directory-count', 'people-list', 'people-category-bar', 'people-directory-count',
  'cardano-data-status', 'cardano-data-sources', 'cardano-market-caption', 'cardano-market-metrics', 'cardano-market-table-body',
  'cardano-network-metrics', 'snapshot-title', 'snapshot-intro', 'snapshot-meta', 'snapshot-count', 'snapshot-table-body',
  'people-table-body', 'search-query-title', 'search-summary', 'treasury-funding',
]);
// Attributes that mark a container JavaScript owns or rewrites.
const EXCLUDED_ATTRS = /\s(?:aria-live|data-directory|data-people-directory|data-search-page|data-global-search|contenteditable)(?:[\s=>]|$)/;

const PARAGRAPH_MAX = 5;
const HEADING_MAX = 2;

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

function isExcludedTag(name, tag, parent) {
  if (EXCLUDED_TAGS.has(name)) return true;
  if (name === 'h1' && parent?.heroCopy) return true;
  const id = attr(tag, 'id');
  if (id && EXCLUDED_IDS.has(id)) return true;
  const cls = attr(tag, 'class');
  if (cls && cls.split(/\s+/).some((c) => EXCLUDED_CLASSES.has(c))) return true;
  return EXCLUDED_ATTRS.test(tag);
}

/**
 * Build a name guard from public project/person names: any name that contains
 * a dictionary word (e.g. "Cardano Foundation", "Ada Handle") is masked so the
 * word inside it is never coloured.
 */
export function nameGuard(names) {
  const parts = new Set();
  for (const name of names || []) {
    for (const part of [name, ...String(name).split(/\s+\/\s+|\s*\(|\)\s*/)]) {
      const clean = String(part || '').replace(/[()]/g, '').trim();
      if (clean.length >= 3 && (WORD_RE.test(clean) || clean.includes('$'))) parts.add(clean);
      WORD_RE.lastIndex = 0;
    }
  }
  const list = [...parts].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const variants = list.flatMap((n) => [n, n.replace(/&/g, '&amp;')]);
  return variants.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...new Set(variants)].map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
}

const titleCase = (w) => /^\p{Lu}\p{Ll}/u.test(w || '');

// A capitalised neighbour that is not itself a dictionary word usually means
// the match is part of a proper name ("Cardano Foundation", "Open DJED"); the
// previous word only counts when it is not starting a sentence.
function looksLikeName(text, start, end) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const next = after.match(/^ (\S+)/)?.[1]?.replace(/[^\p{L}\p{N}-]/gu, '');
  const prevM = before.match(/(\S+) $/);
  const prev = prevM?.[1]?.replace(/[^\p{L}\p{N}-]/gu, '');
  const prevStartsSentence = prevM ? /(^|[.!?:]\s+)$/.test(before.slice(0, before.length - prevM[0].length)) || before.length - prevM[0].length === 0 : true;
  if (next && titleCase(next) && !inkTone(next)) return true;
  if (prev && titleCase(prev) && !inkTone(prev) && !prevStartsSentence) return true;
  return false;
}

function inkText(text, block, guard) {
  if (!block || block.count >= block.max) return text;
  const protectedRanges = [];
  if (guard) for (const m of text.matchAll(guard)) protectedRanges.push([m.index, m.index + m[0].length]);
  const isProtected = (s, e) => protectedRanges.some(([a, b]) => s < b && e > a);
  const hits = [];
  for (const m of text.matchAll(WORD_RE)) hits.push([m.index, m[0]]);
  for (const m of text.matchAll(DOLLAR_RE)) hits.push([m.index, m[0]]);
  hits.sort((a, b) => a[0] - b[0]);
  let out = '';
  let last = 0;
  for (const [start, word] of hits) {
    if (block.count >= block.max) break;
    const end = start + word.length;
    if (start < last || isProtected(start, end)) continue;
    const tone = inkTone(word);
    const key = word.toLowerCase().replace(/s$/, '');
    if (!tone || block.used.has(key) || looksLikeName(text, start, end)) continue;
    block.used.add(key);
    block.count += 1;
    out += `${text.slice(last, start)}<span class="ink ink-${tone}">${word}</span>`;
    last = end;
  }
  return out + text.slice(last);
}

const TOKEN_RE = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<\/?[a-zA-Z][^>]*>|[^<]+|</g;

/** Apply semantic ink to one HTML document (deterministic, idempotent). */
export function inkHtml(html, { guard = null } = {}) {
  const source = stripInk(html);
  const stack = [];
  let inMain = false;
  let out = '';
  for (const [token] of source.matchAll(TOKEN_RE)) {
    if (token.startsWith('<')) {
      out += token;
      const close = token.match(/^<\/([a-zA-Z][\w-]*)/);
      const open = token.match(/^<([a-zA-Z][\w-]*)/);
      if (close) {
        const name = close[1].toLowerCase();
        if (name === 'main') inMain = false;
        const i = stack.map((s) => s.name).lastIndexOf(name);
        if (i >= 0) stack.length = i;
      } else if (open && !token.startsWith('<!--') && !/^<(script|style)\b/i.test(token)) {
        const name = open[1].toLowerCase();
        if (name === 'main') inMain = true;
        if (VOID_TAGS.has(name) || token.endsWith('/>')) continue;
        const parent = stack[stack.length - 1];
        const excluded = Boolean(parent?.excluded) || isExcludedTag(name, token, parent);
        const entry = { name, excluded, block: parent?.block || null, heroCopy: Boolean(parent?.heroCopy) || /\sclass="[^"]*\bhero-copy\b/.test(token) };
        if (BLOCK_TAGS.has(name)) entry.block = { max: HEADING.test(name) ? HEADING_MAX : PARAGRAPH_MAX, count: 0, used: new Set() };
        stack.push(entry);
      }
      continue;
    }
    const top = stack[stack.length - 1];
    if (!inMain || !top || top.excluded || !token.trim()) { out += token; continue; }
    if (!top.block) top.block = { max: PARAGRAPH_MAX, count: 0, used: new Set() };
    out += inkText(token, top.block, guard);
  }
  return out;
}

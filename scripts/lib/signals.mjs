/**
 * INDEX:80 Ecosystem Signals — shared validation, selection and rendering.
 *
 * A signal records a material change to the state of the Cardano ecosystem
 * (public_html/data/signals.json). The homepage WHAT'S CURRENT window shows
 * the few signals selected for it; a later /signals/ archive can read the
 * same records (every valid LIVE signal, by id) without a schema change.
 *
 * Fail-safe by design: one malformed record is dropped with a reason, never
 * rendered half-formed, and never breaks the homepage build. Pure functions
 * only — the clock is always passed in, so tests are deterministic.
 */
import { esc, safeUrl } from './html-safety.mjs';

export const SIGNAL_TYPES = ['PROTOCOL', 'INFRASTRUCTURE', 'ADOPTION', 'GOVERNANCE', 'FUNDING', 'PROJECT'];
export const SIGNAL_IMPACTS = ['HIGH', 'MEDIUM', 'LOW'];
export const SIGNAL_STATUSES = ['DRAFT', 'LIVE', 'WITHDRAWN'];
export const MAX_CURRENT = 6;
export const HEADLINE_MAX = 120;

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_RE = /^[a-z0-9-]+$/;
const IMPACT_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

/** A strict calendar date (YYYY-MM-DD that round-trips), or null. */
export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(value + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value ? value : null;
}

/** Returns a list of problems; an empty list means the record is publishable. */
export function signalProblems(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['record is not an object'];
  const problems = [];
  if (!isText(s.id) || !ID_RE.test(s.id)) problems.push('id must be a lowercase slug');
  if (!isoDate(s.date)) problems.push('date must be YYYY-MM-DD');
  if (!SIGNAL_TYPES.includes(s.type)) problems.push(`type must be one of ${SIGNAL_TYPES.join('/')}`);
  if (!SIGNAL_IMPACTS.includes(s.impact)) problems.push(`impact must be one of ${SIGNAL_IMPACTS.join('/')}`);
  if (!isText(s.headline) || s.headline.length > HEADLINE_MAX) problems.push(`headline must be 1-${HEADLINE_MAX} characters`);
  if (!isText(s.summary)) problems.push('summary is required');
  if (!isText(s.why_it_matters)) problems.push('why_it_matters is required');
  if (!safeUrl(s.primary_url) || !/^https:\/\//i.test(s.primary_url)) problems.push('primary_url must be an https URL');
  if (!isText(s.source_label)) problems.push('source_label is required');
  if (s.secondary_links !== undefined && (!Array.isArray(s.secondary_links) ||
      s.secondary_links.some((l) => !l || !isText(l.label) || !safeUrl(l.url)))) {
    problems.push('secondary_links must be [{label, url}] with http(s) URLs');
  }
  for (const key of ['related_project_slugs', 'related_person_slugs']) {
    if (!Array.isArray(s[key]) || s[key].some((v) => typeof v !== 'string' || !SLUG_RE.test(v))) problems.push(`${key} must be an array of slugs`);
  }
  if (!Array.isArray(s.tags) || s.tags.some((t) => !isText(t))) problems.push('tags must be an array of strings');
  if (typeof s.show_current !== 'boolean') problems.push('show_current must be true or false');
  if (s.expires_at !== null && !isoDate(s.expires_at)) problems.push('expires_at must be YYYY-MM-DD or null');
  if (!SIGNAL_STATUSES.includes(s.status)) problems.push(`status must be one of ${SIGNAL_STATUSES.join('/')}`);
  return problems;
}

/**
 * `expires_at` is the last calendar day (UTC) a signal may appear as current;
 * it stops being current at the following midnight UTC.
 */
export function expiryInstant(expiresAt) {
  const day = isoDate(expiresAt);
  return day ? Date.parse(day + 'T00:00:00Z') + 86400000 : null;
}

export function isExpired(s, nowMs) {
  const end = expiryInstant(s.expires_at);
  return end !== null && nowMs >= end;
}

/**
 * Splits a raw dataset into valid records and rejected ones (with reasons),
 * and picks the homepage selection: LIVE, show_current, dated on or before
 * today, not expired. Newest first, then higher impact; at most MAX_CURRENT.
 * Duplicate ids: the first wins, the rest are rejected.
 */
export function selectSignals(dataset, nowMs, limit = MAX_CURRENT) {
  const raw = dataset && Array.isArray(dataset.signals) ? dataset.signals : [];
  const valid = [];
  const rejected = [];
  const seen = new Set();
  raw.forEach((s, index) => {
    const problems = signalProblems(s);
    if (!problems.length && seen.has(s.id)) problems.push('duplicate id');
    if (problems.length) { rejected.push({ index, id: s && typeof s.id === 'string' ? s.id : null, problems }); return; }
    seen.add(s.id);
    valid.push(s);
  });
  const current = valid
    .filter((s) => s.status === 'LIVE' && s.show_current === true &&
      Date.parse(s.date + 'T00:00:00Z') <= nowMs && !isExpired(s, nowMs))
    .sort((a, b) => b.date.localeCompare(a.date) || IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || a.id.localeCompare(b.id))
    .slice(0, limit);
  return { valid, rejected, current };
}

/**
 * Static, complete markup in two parts:
 *   - a headline ticker (headlines only, no metadata), and
 *   - one compact detail per signal: summary, sources, related records.
 * Headlines and summaries are plain prose so the build-time semantic-ink pass
 * (scripts/apply-semantic-ink.mjs) can colour dictionary words; links are left
 * alone by ink. why_it_matters is deliberately not rendered here (archive only).
 * Without JavaScript every headline and every detail is listed.
 * assets/js/signals-ticker.js only adds movement and selection.
 * Unknown related slugs are dropped rather than linked to a missing page.
 */
export function renderSignals(current, { projects = new Map(), people = new Map(), archiveUrl = null } = {}) {
  if (!current.length) return '';
  const ticks = current.map((s) => `              <li class="signal-tick" data-signal-ref="${esc(s.id)}">${esc(s.headline)}</li>`).join('\n');
  const details = current.map((s) => {
    const links = [`<li><a href="${esc(s.primary_url)}" target="_blank" rel="noopener noreferrer">${esc(s.source_label)}<span aria-hidden="true"> ↗</span><span class="visually-hidden"> (source, opens in a new tab)</span></a></li>`];
    for (const l of s.secondary_links || []) {
      links.push(`<li><a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label)}<span aria-hidden="true"> ↗</span><span class="visually-hidden"> (opens in a new tab)</span></a></li>`);
    }
    const related = [
      ...s.related_project_slugs.filter((slug) => projects.has(slug)).map((slug) => [`/projects/${slug}/`, projects.get(slug)]),
      ...s.related_person_slugs.filter((slug) => people.has(slug)).map((slug) => [`/people/${slug}/`, people.get(slug)]),
    ];
    for (const [href, name] of related) {
      links.push(`<li class="signal-related"><a href="${esc(href)}">${esc(name)}<span aria-hidden="true"> →</span><span class="visually-hidden"> (INDEX:80 record)</span></a></li>`);
    }
    if (archiveUrl) links.push(`<li><a href="${esc(archiveUrl)}">All signals<span aria-hidden="true"> →</span></a></li>`);
    const expires = s.expires_at ? ` data-expires="${esc(s.expires_at)}"` : '';
    return `            <div class="signal" id="signal-${esc(s.id)}" data-signal-id="${esc(s.id)}"${expires}>
              <p class="signal-detail-head">${esc(s.headline)}</p>
              <p class="signal-summary">${esc(s.summary)}</p>
              <ul class="signal-links">${links.join('')}</ul>
            </div>`;
  }).join('\n');
  return `        <div class="signals" data-signals>
          <div class="signals-bar">
            <h3 class="signals-title" id="signals-title">ECOSYSTEM SIGNALS</h3>
            <div class="signals-ticker" data-signals-ticker>
              <ul class="signals-ticker-list" data-signals-ticker-list aria-labelledby="signals-title">
${ticks}
              </ul>
            </div>
          </div>
          <div class="signals-details" data-signals-details>
${details}
          </div>
        </div>`;
}

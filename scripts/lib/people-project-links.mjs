/**
 * Reciprocal Project ↔ People links.
 *
 * The only relationship source is an approved public People record
 * (public_html/data/people.json): a person is connected to a project when one
 * of their `linked_projects` entries names that published project exactly
 * (trimmed, case-insensitive) — the same rule generate-people-pages.mjs uses
 * for the project chips on a profile, so every link here has a link back.
 *
 * A Founder / Lead name becomes a profile link only when that name is exactly
 * the connected person's public display name. Near matches (a legal name vs a
 * persona, a handle vs a name) are never linked: INDEX:80 does not
 * deanonymise people, and a project page is not identity evidence.
 */

export const normalizeName = (s) => String(s ?? '').trim().toLowerCase();

/** Map of project slug → connected public people, sorted by name. */
export function connectedPeopleByProject(projects, people) {
  const slugByName = new Map(projects.map((p) => [normalizeName(p.name), p.slug]));
  const out = new Map();
  for (const person of people) {
    const slugs = new Set();
    for (const org of person.linked_projects || []) {
      const slug = slugByName.get(normalizeName(org));
      if (slug) slugs.add(slug);
    }
    for (const slug of slugs) {
      if (!out.has(slug)) out.set(slug, []);
      out.get(slug).push(person);
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return out;
}

export const personUrl = (person) => person.profile_url || `/people/${encodeURIComponent(person.slug)}/`;

// "Name — role; Name (@handle) — role": the name is the text before an em-dash
// role or a parenthetical.
const SEGMENT_NAME_RE = /^(.+?)(?=\s+—|\s*\(|$)/;

/**
 * Renders a Founder / Lead value. Segments whose name exactly matches a
 * connected person link to that profile; everything else renders through
 * `renderText` exactly as before. Returns { html, linked } where `linked` is
 * the set of person slugs linked from the field.
 */
export function renderFounderLead(value, connected, { esc, renderText }) {
  const byName = new Map((connected || []).map((p) => [normalizeName(p.name), p]));
  const linked = new Set();
  const html = String(value ?? '').split(/(;\s*)/).map((part, i) => {
    if (i % 2) return esc(part);
    const lead = part.match(/^\s*/)[0];
    const m = part.slice(lead.length).match(SEGMENT_NAME_RE);
    const person = m && byName.get(normalizeName(m[1]));
    if (!person) return renderText(part);
    linked.add(person.slug);
    const rest = part.slice(lead.length + m[1].length);
    return `${esc(lead)}<a class="identity-link person-link" href="${esc(personUrl(person))}">${esc(m[1])}</a>${renderText(rest)}`;
  }).join('');
  return { html, linked };
}

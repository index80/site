/**
 * Search/social metadata for People profiles, derived only from approved
 * public People data (people.json). Never claims more than the recorded
 * evidence status: "Verified" always means verified against public sources,
 * not confirmed by the person themselves.
 */
import { profileStrap } from './people-display.mjs';

const MAX = 160;

export const EVIDENCE_SHORT = {
  VERIFIED: 'Verified against public sources.',
  PARTIAL: 'Partially verified against public sources.',
  UNVERIFIED: 'Not yet verified.',
  CONFLICT: 'Sources currently conflict.',
};

const firstSentence = (text) => String(text || '').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9])/)[0] || '';

function fit(text) {
  if (text.length <= MAX) return text;
  const cut = text.slice(0, MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:—-]+$/, '')}…`;
}

/** Unique, non-truncated-where-possible description for a People profile. */
export function personMetaDescription(p) {
  const evidence = EVIDENCE_SHORT[p.verification_status] || '';
  const bioLead = firstSentence(p.bio);
  // A bio sentence that never names the person (e.g. "Board member; …") is
  // prefixed with the name so the snippet is self-explanatory and unique.
  const tokens = String(p.name).toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const names = tokens.some((t) => bioLead.toLowerCase().includes(t));
  const lead = bioLead && !names ? `${p.name} — ${bioLead}` : bioLead;
  if (lead && lead.length <= MAX) {
    const withEvidence = evidence ? `${lead} ${evidence}` : lead;
    return withEvidence.length <= MAX ? withEvidence : lead;
  }
  // No usable bio sentence: build from approved current roles (else the strap),
  // then add the category and evidence line only while they fit.
  const roles = (p.current_roles || []).slice(0, 3).join('; ') || profileStrap(p).text;
  const head = roles ? `${p.name} — ${roles}.` : `${p.name}.`;
  let out = head;
  for (const part of [`${p.primary_category} profile on INDEX:80.`, evidence]) {
    if (part && `${out} ${part}`.length <= MAX) out = `${out} ${part}`;
  }
  return fit(out);
}

/** <title> for a People profile: name, category and site. */
export function personTitle(p) {
  const full = `${p.name} — ${p.primary_category} in Cardano | INDEX:80`;
  return full.length <= 70 ? full : `${p.name} — Cardano People | INDEX:80`;
}

export function directoryMeta(people) {
  const n = people.length;
  return {
    title: `Cardano People Directory — ${n} Sourced Profiles | INDEX:80`,
    description: `${n} sourced profiles of founders, developers, DReps, stake pool operators, researchers and creators across Cardano. Independent; not an endorsement.`,
  };
}

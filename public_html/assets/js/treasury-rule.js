/* INDEX:80 Treasury-funding rule — the single definition of "confirmed funded".

   A project is confirmed Treasury-funded only when the Registry carries award
   evidence: a funded-proposal count, a USD award value, or an ADA-native award
   value. A Catalyst / Funding Ref alone (a URL or a "Fund 6 / Fund 8" note) is a
   pointer, never evidence, and must not create a badge, a filter match or a
   funded-list row.

   Used by the browser (window.INDEX80Treasury) and, unchanged, by the Node
   generators (require). USD and ADA values are kept separate: nothing here
   converts one into the other. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.INDEX80Treasury = api;
    if (typeof root.dispatchEvent === 'function' && typeof root.Event === 'function') {
      root.dispatchEvent(new root.Event('index80-treasury-rule'));
    }
  }
}(typeof self !== 'undefined' ? self : this, function () {
  const positive = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // The `??` order is deliberate: the project record wins; the legacy
  // /data/treasury-funding.json bridge only fills fields the record lacks.
  const pick = (project, bridge, key) => (project || {})[key] ?? (bridge || {})[key];

  const proposalCount = (project, bridge) => positive(pick(project, bridge, 'treasury_funded_proposals'));
  const fundingUsd = (project, bridge) => positive(pick(project, bridge, 'treasury_funding_value_usd'));
  const fundingAda = (project, bridge) => positive(pick(project, bridge, 'treasury_funding_value_ada'));

  const isConfirmedFunded = (project, bridge) =>
    proposalCount(project, bridge) !== null ||
    fundingUsd(project, bridge) !== null ||
    fundingAda(project, bridge) !== null;

  const fundingRef = (project, bridge) => {
    const ref = pick(project, bridge, 'treasury_funding_ref');
    return typeof ref === 'string' && ref.trim() ? ref.trim() : null;
  };

  // A /funds/<n>/<challenge>/<proposal> URL points at one specific proposal
  // (linked funding), whereas /proposers/<name> is a team-level record.
  const isLinkedProposalRef = (ref) => /^https?:\/\/[^/]*projectcatalyst\.io\/funds\//i.test(ref || '');

  const formatAda = (value) => {
    const n = positive(value);
    if (n === null) return '';
    if (n >= 1000000) return `₳${(n / 1000000).toFixed(2).replace(/\.?0+$/, '')}M`;
    return `₳${Math.round(n).toLocaleString('en-US')}`;
  };

  // Plain-English scope note shown wherever a funding amount is displayed for
  // a record whose reference is a single proposal.
  const LINKED_PROPOSAL_NOTE = 'Allocated to the linked Catalyst proposal — not a claim that the whole project or organisation received this amount.';

  return {
    positive,
    proposalCount,
    fundingUsd,
    fundingAda,
    fundingRef,
    isConfirmedFunded,
    isLinkedProposalRef,
    formatAda,
    LINKED_PROPOSAL_NOTE,
  };
}));

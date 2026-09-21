/* INDEX:80 treasury-funding UI enhancement.
   Registry-driven: confirmed funding requires award evidence (funded proposal
   count and/or a USD or ADA award value) — see treasury-rule.js, the single
   shared definition. A proposal/reference URL alone must never imply that a
   project was funded. */
(() => {
  function init() {
    if (!document.body || document.body.dataset.mode !== 'project') return;
    const T = window.INDEX80Treasury;
    if (!T) return;

    const slugMatch = window.location.pathname.match(/\/projects\/([^/]+)\/?/);
    const slug = slugMatch ? decodeURIComponent(slugMatch[1]) : '';
    if (!slug) return;

    const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
    const formatUsd = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return '';
      if (n >= 1000000) return `≈$${(n / 1000000).toFixed(n >= 10000000 ? 1 : 2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')}M`;
      if (n >= 1000) return `≈$${Math.round(n / 1000).toLocaleString('en-US')}K`;
      return `≈$${Math.round(n).toLocaleString('en-US')}`;
    };
    const style = document.createElement('style');
    style.textContent = `
      .treasury-heading-meta {
        display: inline-flex;
        align-items: center;
        gap: .45rem;
        flex-wrap: wrap;
      }
      .treasury-award-amount {
        font-family: var(--font-interface);
        font-weight: 700;
        font-size: .78rem;
        line-height: 1;
        letter-spacing: .01em;
        color: var(--ink);
        white-space: nowrap;
      }
      .tag-treasury { border-color: var(--blue); }
      .treasury-funding-link { color: var(--blue); text-decoration: underline; text-underline-offset: 2px; }
      .treasury-funding-link:hover { color: var(--ink); }
    `;
    document.head.appendChild(style);

    Promise.all([
      fetch('/data/projects.json').then((r) => r.ok ? r.json() : Promise.reject(new Error(`projects.json ${r.status}`))),
      fetch('/data/treasury-funding.json').then((r) => r.ok ? r.json() : { records: {} }).catch(() => ({ records: {} })),
    ])
      .then(([data, treasuryData]) => {
        const project = (data.projects || []).find((p) => p.slug === slug);
        if (!project) return;

        const bridge = treasuryData?.records?.[slug] || {};
        const confirmed = T.isConfirmedFunded(project, bridge);
        const existingBadge = document.querySelector('.badge-treasury');
        const existingFundingMetric = Array.from(document.querySelectorAll('.metric-grid > div')).find((el) => {
          const label = el.querySelector('.metric-label');
          return label && /TREASURY FUNDING/i.test(label.textContent || '');
        });

        // Defensive cleanup: old static pages may contain a badge because a
        // reference string existed before the stricter award-evidence rule.
        if (!confirmed) {
          existingBadge?.remove();
          existingFundingMetric?.remove();
          document.querySelector('.tag-treasury')?.remove();
          return;
        }

        const fundingRef = T.fundingRef(project, bridge);
        const fundingValueUsd = T.fundingUsd(project, bridge);
        const fundingValueAda = T.fundingAda(project, bridge);
        const fundedProposals = T.proposalCount(project, bridge);
        const fundingUrl = safeUrl(fundingRef);
        const linkedProposal = T.isLinkedProposalRef(fundingRef);
        // USD and ADA are never converted into each other: USD leads when the
        // Registry has it, otherwise the ADA-native allocation is shown.
        const amount = formatUsd(fundingValueUsd) || T.formatAda(fundingValueAda);

        let badge = existingBadge;
        if (!badge) {
          const heading = document.querySelector('.profile-heading');
          if (heading) {
            badge = document.createElement('span');
            badge.className = 'badge-treasury';
            badge.title = 'Confirmed Cardano Treasury funding on record';
            badge.innerHTML = '<span class="ada-glyph" aria-hidden="true">₳</span>TREASURY FUNDED';
            heading.appendChild(badge);
          }
        }

        if (badge && amount && !document.querySelector('.treasury-award-amount')) {
          const wrap = document.createElement('span');
          wrap.className = 'treasury-heading-meta';
          badge.parentNode.insertBefore(wrap, badge);
          wrap.appendChild(badge);

          const amountEl = document.createElement('span');
          amountEl.className = 'treasury-award-amount';
          amountEl.textContent = amount;
          amountEl.title = fundingValueUsd
            ? 'Historical Catalyst award-value estimate using Project Catalyst\'s fund-result exchange-rate methodology.'
            : `ADA allocated to the linked Catalyst proposal${linkedProposal ? '' : ' record'}. Not converted to USD.`;
          wrap.appendChild(amountEl);
        }

        const tags = document.querySelector('.profile-tags');
        if (tags && !tags.querySelector('.tag-treasury')) {
          const tag = document.createElement('span');
          tag.className = 'tag-chip tag-treasury';
          tag.textContent = '₳ treasury funded';
          tag.title = 'Confirmed Cardano Treasury funding';
          tags.appendChild(tag);
        }

        let fundingMetric = existingFundingMetric;
        if (!fundingMetric) {
          const grid = document.querySelector('.metric-grid');
          if (grid) {
            fundingMetric = document.createElement('div');
            fundingMetric.className = 'treasury-metric';
            fundingMetric.innerHTML = '<span class="metric-label"><span class="ada-glyph" aria-hidden="true">₳</span>TREASURY FUNDING</span><strong></strong>';
            grid.appendChild(fundingMetric);
          }
        }
        if (!fundingMetric) return;

        const strong = fundingMetric.querySelector('strong');
        if (!strong) return;

        const count = Number(fundedProposals);
        const parts = [];
        if (Number.isFinite(count) && count > 0) parts.push(`${count} funded proposal${count === 1 ? '' : 's'} on linked record`);
        if (fundingValueAda) parts.push(`${T.formatAda(fundingValueAda)} allocated`);
        if (fundingValueUsd) parts.push(`${formatUsd(fundingValueUsd)} USD (historical estimate)`);

        strong.replaceChildren();
        if (parts.length) strong.append(document.createTextNode(`${parts.join(' · ')}${fundingUrl ? ' · ' : ''}`));

        if (fundingUrl) {
          const link = document.createElement('a');
          link.className = 'treasury-funding-link';
          link.href = fundingUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = linkedProposal
            ? 'Official Project Catalyst proposal page.'
            : 'Official Project Catalyst proposer/team record; aggregate values may include related work by the same team.';
          link.textContent = linkedProposal ? 'View linked Catalyst proposal ↗' : 'View Catalyst record ↗';
          strong.appendChild(link);
        } else if (!parts.length) {
          strong.textContent = 'Treasury funding recorded';
        }

        // Scope note: an amount tied to a single proposal is not the whole
        // project's funding.
        const scope = fundingMetric.querySelector('.treasury-scope-note');
        if (linkedProposal && (fundingValueAda || fundingValueUsd)) {
          if (!scope) {
            const note = document.createElement('small');
            note.className = 'treasury-scope-note';
            note.textContent = T.LINKED_PROPOSAL_NOTE;
            fundingMetric.appendChild(note);
          }
        } else if (scope) {
          scope.remove();
        }
      })
      .catch(() => { /* Existing static Treasury UI remains usable. */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

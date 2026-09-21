/* INDEX:80 Treasury aggregate summary.
   The aggregate statistics belong on the Data page. The main directory keeps
   funding information project-by-project inside the Treasury-funded view. */
(() => {
  if (document.body?.dataset.mode !== 'data') return;

  const formatUsd = (value, digits = 1) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1000000) {
      const d = n >= 10000000 ? 1 : digits;
      return `≈$${(n / 1000000).toFixed(d).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')}M`;
    }
    if (n >= 1000) return `≈$${Math.round(n / 1000).toLocaleString('en-US')}K`;
    return `≈$${Math.round(n).toLocaleString('en-US')}`;
  };

  const addStyles = () => {
    if (document.getElementById('treasury-summary-styles')) return;
    const style = document.createElement('style');
    style.id = 'treasury-summary-styles';
    style.textContent = `
      .treasury-data-panel { grid-column:1 / -1; }
      .treasury-data-panel .metric-grid strong { font-size:1.05rem; }
      .treasury-data-note {
        margin:.7rem .8rem .9rem; max-width:1100px;
        font-family:var(--font-body); font-size:.78rem; line-height:1.5; color:var(--muted);
      }
      .treasury-data-note a { white-space:nowrap; }
    `;
    document.head.appendChild(style);
  };

  Promise.all([
    fetch('/data/treasury-funding.json').then((r) => {
      if (!r.ok) throw new Error(`treasury-funding.json ${r.status}`);
      return r.json();
    }),
    fetch('/data/projects.json').then((r) => r.ok ? r.json() : { projects: [] }).catch(() => ({ projects: [] })),
  ])
    .then(([treasuryData, projectData]) => {
      const records = treasuryData?.records || {};
      const T = window.INDEX80Treasury;
      const projects = projectData.projects || [];
      // Same confirmed-funding rule as the badge, the filter and the funded
      // list (treasury-rule.js). The legacy bridge only fills fields a
      // Registry record lacks. USD and ADA totals are kept separate.
      const funded = projects.filter((p) => T.isConfirmedFunded(p, records[p.slug] || {}));

      const withValue = funded
        .map((p) => ({ slug: p.slug, name: p.name || p.slug, value: T.fundingUsd(p, records[p.slug] || {}) }))
        .filter((row) => row.value !== null);
      const total = withValue.reduce((sum, row) => sum + row.value, 0);
      const largest = withValue.reduce((best, row) => !best || row.value > best.value ? row : best, null);
      const adaRows = funded
        .map((p) => ({ name: p.name || p.slug, value: T.fundingAda(p, records[p.slug] || {}) }))
        .filter((row) => row.value !== null);
      const adaTotal = adaRows.reduce((sum, row) => sum + row.value, 0);
      const count = funded.length;

      addStyles();
      if (document.getElementById('treasury-funding')) return;

      const dashboard = document.querySelector('.dashboard-grid');
      const panel = document.createElement('div');
      panel.className = 'panel dark treasury-data-panel';
      panel.id = 'treasury-funding';
      panel.innerHTML = `
        <div class="panel-title"><h2>₳ TREASURY FUNDING</h2><span class="badge badge-live">REGISTRY-DERIVED</span></div>
        <div class="metric-grid">
          <div><span>FUNDED PROJECTS</span><strong>${count}</strong><small>CONFIRMED INDEX:80 RECORDS</small></div>
          <div><span>LINKED AWARD VALUE</span><strong>${formatUsd(total, 1)}</strong><small>USD HISTORICAL ESTIMATE</small></div>
          <div><span>LARGEST LINKED RECORD</span><strong>${largest ? largest.name : '—'}</strong><small>${largest ? formatUsd(largest.value, 2) : '—'}</small></div>
          <div><span>USD VALUES AVAILABLE</span><strong>${withValue.length} / ${count}</strong><small>ONE OR MORE RECORDS MAY LACK USD TOTALS</small></div>
          ${adaRows.length ? `<div><span>ADA-NATIVE LINKED VALUE</span><strong>${T.formatAda(adaTotal)}</strong><small>${adaRows.length} RECORD${adaRows.length === 1 ? '' : 'S'} · NOT CONVERTED TO USD</small></div>` : ''}
        </div>
        <p class="treasury-data-note">Catalyst award values are shown in USD using Project Catalyst's historical conversion method. Where proposal budgets were denominated in ADA, Catalyst converts them using the ADA/USD rate associated with that Fund's results. These are historical award-value estimates, not current-market conversions. Linked proposer/team records can include related work by the same team, so INDEX:80 does not present these totals as cash received exclusively by the named product. <a href="/?funding=treasury">View funded projects →</a></p>
        <p class="source-line">SOURCE: PROJECT CATALYST PROPOSER/TEAM RECORDS · DERIVED FROM INDEX:80 TREASURY DATA</p>
      `;
      if (dashboard) dashboard.insertAdjacentElement('beforeend', panel);
      else document.querySelector('main')?.appendChild(panel);
    })
    .catch(() => { /* Funding summary is enhancement-only; base site remains usable. */ });
})();

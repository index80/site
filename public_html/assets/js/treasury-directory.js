/* INDEX:80 Treasury-funded directory filter.
   Funding status is computed from confirmed award data, not from the mere
   presence of a Catalyst/proposal reference. When the Treasury view is active,
   a derived funding-value column is added to the existing directory table and
   is sorted by linked award value by default. */
(() => {
  const root = document.querySelector('[data-directory]');
  const list = document.querySelector('#directory-list');
  const bar = document.querySelector('#category-bar');
  const countEl = document.querySelector('#directory-count');
  const head = document.querySelector('.dir-head');
  if (!root || !list || !bar || !head) return;

  const source = root.getAttribute('data-source') || 'data/projects.json';
  let treasuryOnly = new URLSearchParams(window.location.search).get('funding') === 'treasury';
  let fundedSlugs = new Set();
  let fundingBySlug = new Map();
  let fundingAdaBySlug = new Map();
  let fundingSortActive = treasuryOnly;
  let fundingSortDir = 'desc';
  let applying = false;

  const style = document.createElement('style');
  style.textContent = `
    .directory.treasury-table .dir-row,
    .directory.treasury-table .dir-head {
      grid-template-columns:2.2rem 1.4rem minmax(0,1fr) minmax(0,1.45fr) minmax(6rem,8rem) minmax(7.4rem,9rem) 2.6rem;
    }
    .treasury-amount-cell {
      font:700 .72rem/1 var(--font-pixel);
      color:var(--ink);
      white-space:nowrap;
      text-align:right;
    }
    .treasury-amount-sort { text-align:right; white-space:nowrap; }
    @media (max-width:760px) {
      .directory.treasury-table .dir-row,
      .directory.treasury-table .dir-head {
        grid-template-columns:2rem 1.2rem minmax(0,1fr) minmax(6rem,7.5rem) minmax(6.8rem,8.2rem) 2.2rem;
      }
      .directory.treasury-table .dir-desc { display:none; }
    }
    @media (max-width:640px) {
      .directory.treasury-table .dir-row,
      .directory.treasury-table .dir-head {
        grid-template-columns:1.6rem 1.2rem minmax(5rem,1fr) minmax(5.8rem,6.4rem) 2rem;
        gap:.35rem;
        padding-left:.55rem;
        padding-right:.55rem;
      }
      .directory.treasury-table .dir-desc,
      .directory.treasury-table .dir-cat { display:none; }
      .directory.treasury-table .dir-name {
        min-width:0;
        display:block;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .directory.treasury-table .treasury-amount-cell,
      .directory.treasury-table .treasury-amount-sort {
        min-width:0;
        font-size:.61rem;
        text-align:right;
      }
    }
  `;
  document.head.appendChild(style);

  // The shared confirmed-funding rule (treasury-rule.js): award evidence only,
  // never a bare Catalyst / Funding Ref. USD and ADA stay separate.
  const isConfirmedFunded = (p = {}, bridge = {}) => window.INDEX80Treasury.isConfirmedFunded(p, bridge);
  const fundingValue = (p = {}, bridge = {}) => window.INDEX80Treasury.fundingUsd(p, bridge);
  const fundingAdaValue = (p = {}, bridge = {}) => window.INDEX80Treasury.fundingAda(p, bridge);

  const formatUsd = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1000000) return `≈$${(n / 1000000).toFixed(n >= 10000000 ? 1 : 2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')}M`;
    if (n >= 1000) return `≈$${Math.round(n / 1000).toLocaleString('en-US')}K`;
    return `≈$${Math.round(n).toLocaleString('en-US')}`;
  };

  const slugFromRow = (row) => {
    const link = row.querySelector('.dir-name');
    const match = (link?.getAttribute('href') || '').match(/\/projects\/([^/]+)\/?/);
    return match ? decodeURIComponent(match[1]) : '';
  };

  const updateUrl = () => {
    const url = new URL(window.location.href);
    if (treasuryOnly) url.searchParams.set('funding', 'treasury');
    else url.searchParams.delete('funding');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const ensureButton = () => {
    let btn = bar.querySelector('.treasury-filter-chip');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-chip treasury-filter-chip';
      btn.dataset.funding = 'treasury';
      btn.setAttribute('role', 'tab');
      btn.innerHTML = `₳ TREASURY FUNDED <span>${fundedSlugs.size}</span>`;
      const all = bar.querySelector('[data-cat="all"]');
      if (all) all.insertAdjacentElement('afterend', btn);
      else bar.prepend(btn);

      btn.addEventListener('click', () => {
        const allButton = bar.querySelector('[data-cat="all"]');
        if (!treasuryOnly) {
          if (allButton && !allButton.classList.contains('active')) allButton.click();
          treasuryOnly = true;
          fundingSortActive = true;
          fundingSortDir = 'desc';
        } else {
          treasuryOnly = false;
          fundingSortActive = false;
          if (allButton) allButton.click();
        }
        updateUrl();
        apply();
      });
    }

    btn.classList.toggle('active', treasuryOnly);
    btn.setAttribute('aria-selected', String(treasuryOnly));
    const count = btn.querySelector('span');
    if (count) count.textContent = String(fundedSlugs.size);
  };

  const ensureFundingColumn = () => {
    if (!treasuryOnly) {
      root.classList.remove('treasury-table');
      head.querySelector('.treasury-amount-sort')?.remove();
      list.querySelectorAll('.treasury-amount-cell').forEach((el) => el.remove());
      return;
    }

    root.classList.add('treasury-table');

    let sort = head.querySelector('.treasury-amount-sort');
    if (!sort) {
      sort = document.createElement('button');
      sort.type = 'button';
      sort.className = 'dir-sort treasury-amount-sort';
      sort.textContent = 'AMOUNT FUNDED';
      const siteHead = head.lastElementChild;
      head.insertBefore(sort, siteHead || null);
      sort.addEventListener('click', () => {
        fundingSortDir = fundingSortActive && fundingSortDir === 'desc' ? 'asc' : 'desc';
        fundingSortActive = true;
        apply();
      });
    }

    sort.classList.toggle('active', fundingSortActive);
    if (fundingSortActive) sort.setAttribute('data-dir', fundingSortDir);
    else sort.removeAttribute('data-dir');

    list.querySelectorAll('.dir-row').forEach((row) => {
      let cell = row.querySelector('.treasury-amount-cell');
      if (!cell) {
        cell = document.createElement('span');
        cell.className = 'treasury-amount-cell';
        const siteCell = row.lastElementChild;
        row.insertBefore(cell, siteCell || null);
      }
      const slug = slugFromRow(row);
      const value = fundingBySlug.get(slug) ?? null;
      const ada = fundingAdaBySlug.get(slug) ?? null;
      // USD and ADA are never converted: USD leads when the Registry has a USD
      // value, otherwise the ADA-native allocation is shown.
      cell.textContent = value ? formatUsd(value) : (ada ? window.INDEX80Treasury.formatAda(ada) : '—');
      cell.title = value
        ? 'Linked Project Catalyst proposer/team award value.'
        : ada
          ? 'ADA allocated to the linked Catalyst proposal (not converted to USD, and not necessarily the whole project\'s funding).'
          : 'Funded record; award value not yet available.';
    });
  };

  const sortFundingRows = () => {
    if (!treasuryOnly || !fundingSortActive) return;
    const rows = Array.from(list.querySelectorAll('.dir-row'));
    const sorted = rows.slice().sort((a, b) => {
      // Group USD-valued rows first, then ADA-only rows, then rows with no
      // value; within a group, larger native amounts first. USD and ADA are
      // never compared with each other.
      const rank = (row) => {
        const slug = slugFromRow(row);
        const usd = fundingBySlug.get(slug);
        const ada = fundingAdaBySlug.get(slug);
        if (Number.isFinite(usd) && usd > 0) return 2e15 + usd;
        if (Number.isFinite(ada) && ada > 0) return 1e15 + ada;
        return -1;
      };
      const an = rank(a);
      const bn = rank(b);
      if (an === bn) return (a.querySelector('.dir-name')?.textContent || '').localeCompare(b.querySelector('.dir-name')?.textContent || '');
      return fundingSortDir === 'desc' ? bn - an : an - bn;
    });

    const current = Array.from(list.querySelectorAll('.dir-row'));
    const alreadySorted = current.length === sorted.length && current.every((row, i) => row === sorted[i]);
    if (!alreadySorted) sorted.forEach((row) => list.appendChild(row));
  };

  const apply = () => {
    if (applying) return;
    applying = true;
    try {
      ensureButton();
      ensureFundingColumn();

      const rows = Array.from(list.querySelectorAll('.dir-row'));
      let visible = 0;
      rows.forEach((row) => {
        const show = !treasuryOnly || fundedSlugs.has(slugFromRow(row));
        row.hidden = !show;
        row.style.display = show ? '' : 'none';
        if (show) visible += 1;
      });

      sortFundingRows();

      if (countEl && treasuryOnly) countEl.textContent = `${visible} TREASURY FUNDED`;
    } finally {
      applying = false;
    }
  };

  head.addEventListener('click', (event) => {
    const baseSort = event.target.closest('.dir-sort');
    if (baseSort && !baseSort.classList.contains('treasury-amount-sort')) {
      fundingSortActive = false;
      requestAnimationFrame(apply);
    }
  }, true);

  bar.addEventListener('click', (event) => {
    const categoryButton = event.target.closest('.cat-chip[data-cat]');
    if (categoryButton && treasuryOnly) {
      treasuryOnly = false;
      fundingSortActive = false;
      updateUrl();
      requestAnimationFrame(apply);
    }
  }, true);

  Promise.all([
    fetch(source).then((r) => r.ok ? r.json() : Promise.reject(new Error(`directory data ${r.status}`))),
    fetch('/data/treasury-funding.json').then((r) => r.ok ? r.json() : { records: {} }).catch(() => ({ records: {} })),
  ])
    .then(([data, treasuryData]) => {
      const bridgeRecords = treasuryData?.records || {};
      const projectRows = data.projects || [];

      fundedSlugs = new Set(projectRows
        .filter((p) => isConfirmedFunded(p, bridgeRecords[p.slug] || {}))
        .map((p) => p.slug));

      fundingBySlug = new Map(projectRows.map((p) => [
        p.slug,
        fundingValue(p, bridgeRecords[p.slug] || {}),
      ]));
      fundingAdaBySlug = new Map(projectRows.map((p) => [
        p.slug,
        fundingAdaValue(p, bridgeRecords[p.slug] || {}),
      ]));

      apply();

      new MutationObserver(() => apply()).observe(list, { childList: true });
      new MutationObserver(() => ensureButton()).observe(bar, { childList: true });
    })
    .catch(() => { /* Base directory remains fully usable. */ });
})();

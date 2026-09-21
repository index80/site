/* INDEX:80 Cardano data dashboard.
   Reads only public, timestamped JSON snapshots. No personal portfolio data,
   credentials or private monitoring state is ever consumed by this page. */
(() => {
  if (document.body?.dataset.mode !== 'data') return;

  const $ = (sel) => document.querySelector(sel);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const n = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const x = Number(value);
    return Number.isFinite(x) ? x : null;
  };
  const fmtUsd = (value, compact = false) => {
    const x = n(value);
    if (x === null) return '—';
    if (compact && Math.abs(x) >= 1e9) return `$${(x / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
    if (compact && Math.abs(x) >= 1e6) return `$${(x / 1e6).toFixed(2).replace(/\.00$/, '')}M`;
    if (compact && Math.abs(x) >= 1e3) return `$${(x / 1e3).toFixed(0)}K`;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: x < 1 ? 4 : 2 }).format(x);
  };
  const fmtAda = (value, compact = false) => {
    const x = n(value);
    if (x === null) return '—';
    if (compact && Math.abs(x) >= 1e9) return `₳${(x / 1e9).toFixed(2)}B`;
    if (compact && Math.abs(x) >= 1e6) return `₳${(x / 1e6).toFixed(2)}M`;
    if (compact && Math.abs(x) >= 1e3) return `₳${(x / 1e3).toFixed(0)}K`;
    return `₳${new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(x)}`;
  };
  const fmtInt = (value) => {
    const x = n(value);
    return x === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(x);
  };
  const fmtPct = (value) => {
    const x = n(value);
    if (x === null) return '—';
    return `${x > 0 ? '+' : ''}${x.toFixed(2)}%`;
  };
  const fmtDate = (value) => {
    if (!value) return 'UNKNOWN';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).toUpperCase();
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(d) + ' UTC';
  };

  const style = document.createElement('style');
  style.textContent = `
    .data-status-strip { display:flex; flex-wrap:wrap; gap:.45rem 1rem; align-items:center; padding:.55rem .8rem; border:1px solid #36526e; background:#071829; color:#9cb7cd; font:600 .66rem/1.35 var(--font-pixel); }
    .data-status-strip strong { color:var(--cyan); }
    .data-live-dot { width:.55rem; height:.55rem; display:inline-block; background:var(--green); box-shadow:0 0 .45rem rgba(16,185,129,.7); margin-right:.35rem; }
    .data-grid { grid-column:1/-1; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.8rem; }
    .data-card { min-width:0; }
    .data-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .data-metric { min-height:78px; padding:.7rem .8rem; border-right:1px solid #2e4e69; border-bottom:1px solid #2e4e69; }
    .data-metric span,.data-metric small { display:block; font:600 .64rem/1.3 var(--font-pixel); color:#9cb7cd; }
    .data-metric strong { display:block; margin:.3rem 0; font:700 clamp(1rem,2.4vw,1.35rem)/1.05 var(--font-pixel); color:#fff; overflow-wrap:anywhere; }
    .data-metric strong.up { color:#68e3a5; } .data-metric strong.down { color:#ff8677; }
    .market-table-wrap { overflow-x:auto; }
    .market-table { width:100%; border-collapse:collapse; font-size:.8rem; font-family:var(--font-body); }
    .market-table th { text-align:left; color:#9cb7cd; font:700 .61rem/1.2 var(--font-pixel); letter-spacing:.03em; white-space:nowrap; }
    .market-table th,.market-table td { padding:.5rem .55rem; border-bottom:1px solid #2e4e69; }
    .market-table td.num,.market-table th.num { text-align:right; font-variant-numeric:tabular-nums; }
    .market-table td.asset { font-weight:700; color:#fff; white-space:nowrap; }
    .market-table .ticker { color:var(--cyan); font:700 .67rem/1 var(--font-pixel); }
    .market-table .positive { color:#68e3a5; } .market-table .negative { color:#ff8677; }
    .data-source-list { list-style:none; margin:0; padding:0; }
    .data-source-list li { display:grid; grid-template-columns:minmax(9rem,.7fr) minmax(0,1.4fr) auto; gap:.7rem; padding:.6rem .2rem; border-bottom:1px solid #d8dfe6; align-items:start; }
    .data-source-list strong { font:700 .68rem/1.25 var(--font-pixel); }
    .data-source-list span { font-size:.82rem; line-height:1.4; }
    .data-source-list a { white-space:nowrap; font:700 .65rem/1.2 var(--font-pixel); }
    .data-note { color:var(--muted); font-size:.82rem; line-height:1.5; }
    .data-wide { grid-column:1/-1; }
    @media (max-width:1000px) { .data-grid { grid-template-columns:1fr 1fr; } .data-wide { grid-column:1/-1; } }
    @media (max-width:680px) { .data-grid { grid-template-columns:1fr; } .data-metrics { grid-template-columns:1fr 1fr; } .data-source-list li { grid-template-columns:1fr; gap:.25rem; } .market-table th:nth-child(5),.market-table td:nth-child(5) { display:none; } }
  `;
  document.head.appendChild(style);

  const metric = (label, value, note = '', cls = '') => `
    <div class="data-metric"><span>${esc(label)}</span><strong class="${cls}">${esc(value)}</strong><small>${esc(note)}</small></div>`;

  const sourceStatus = (source) => String(source?.status || 'unknown').toUpperCase();

  Promise.all([
    fetch('/data/cardano-snapshot.json').then((r) => {
      if (!r.ok) throw new Error(`snapshot ${r.status}`);
      return r.json();
    }),
    fetch('/data/projects.json').then((r) => r.ok ? r.json() : { projects: [] }).catch(() => ({ projects: [] })),
    fetch('/data/treasury-funding.json').then((r) => r.ok ? r.json() : { records: {} }).catch(() => ({ records: {} })),
  ]).then(([snapshot, projectData, treasuryData]) => {
    const market = snapshot.market || {};
    const network = snapshot.network || {};
    const assets = snapshot.minswap?.assets || [];
    const projects = projectData.projects || [];
    const bridge = treasuryData.records || {};

    const funded = projects.filter((p) => window.INDEX80Treasury.isConfirmedFunded(p, bridge[p.slug] || {}));
    const fundingRows = funded.map((p) => {
      const b = bridge[p.slug] || {};
      return {
        name: p.name,
        value: n(p.treasury_funding_value_usd ?? b.treasury_funding_value_usd),
      };
    });
    const knownFunding = fundingRows.reduce((sum, row) => sum + (row.value || 0), 0);
    const largest = fundingRows.filter((row) => row.value !== null).sort((a, b) => b.value - a.value)[0] || null;

    const status = $('#cardano-data-status');
    if (status) {
      const sourceStates = (snapshot.sources || []).map(sourceStatus);
      const allLive = sourceStates.length > 0 && sourceStates.every((s) => s === 'LIVE' || s === 'SEEDED');
      status.innerHTML = `<span><i class="data-live-dot"></i><strong>${allLive ? 'PUBLIC SNAPSHOT CONNECTED' : 'PARTIAL PUBLIC SNAPSHOT'}</strong></span><span>UPDATED ${esc(fmtDate(snapshot.generated_at || snapshot.as_of))}</span><span>SCHEMA ${esc(snapshot.schema_version || '0.1')}</span>`;
    }

    const marketEl = $('#cardano-market-metrics');
    if (marketEl) {
      const change = n(market.ada_change_24h_pct);
      marketEl.innerHTML = [
        metric('ADA PRICE', fmtUsd(market.ada_price_usd), 'USD'),
        metric('ADA 24H', fmtPct(change), 'PRICE CHANGE', change === null ? '' : (change >= 0 ? 'up' : 'down')),
        metric('DEFI TVL', fmtUsd(market.defi_tvl_usd, true), 'DEFILLAMA'),
        metric('DEX VOLUME 24H', fmtUsd(market.dex_volume_24h_usd, true), 'DEFILLAMA'),
        metric('STABLECOINS', fmtUsd(market.stablecoin_mcap_usd, true), 'MARKET CAP'),
        metric('ADA MARKET CAP', fmtUsd(market.ada_market_cap_usd, true), 'USD'),
      ].join('');
    }

    const networkEl = $('#cardano-network-metrics');
    if (networkEl) {
      networkEl.innerHTML = [
        metric('EPOCH', fmtInt(network.epoch), 'KOIOS'),
        metric('BLOCK HEIGHT', fmtInt(network.block_height), 'CHAIN TIP'),
        metric('ACTIVE STAKE', fmtAda(network.active_stake_ada, true), 'EPOCH SNAPSHOT'),
        metric('EPOCH TX', fmtInt(network.epoch_tx_count), 'CURRENT EPOCH'),
        metric('ACTIVE ADDRESSES 24H', fmtInt(market.active_addresses_24h), 'DEFILLAMA SNAPSHOT'),
        metric('TRANSACTIONS 24H', fmtInt(market.transactions_24h), 'DEFILLAMA SNAPSHOT'),
      ].join('');
    }

    const ecosystemEl = $('#cardano-ecosystem-metrics');
    if (ecosystemEl) {
      ecosystemEl.innerHTML = [
        metric('INDEXED PROJECTS', fmtInt(projects.length), 'INDEX:80 REGISTRY EXPORT'),
        metric('TREASURY FUNDED', fmtInt(funded.length), 'CONFIRMED LINKED RECORDS'),
        metric('KNOWN LINKED AWARDS', `≈${fmtUsd(knownFunding, true)}`, 'CATALYST HISTORICAL USD'),
        metric('LARGEST LINKED RECORD', largest ? largest.name : '—', largest ? `≈${fmtUsd(largest.value, true)}` : 'NO USD VALUE'),
      ].join('');
    }

    const table = $('#cardano-market-table-body');
    if (table) {
      if (!assets.length) {
        table.innerHTML = '<tr><td colspan="6">No market rows available in the current snapshot.</td></tr>';
      } else {
        table.innerHTML = assets.map((a) => {
          const change = n(a.price_change_24h_pct);
          const changeCls = change === null ? '' : (change >= 0 ? 'positive' : 'negative');
          return `<tr>
            <td class="asset">${esc(a.name || a.ticker || 'Unknown')} <span class="ticker">${esc(a.ticker || '')}</span></td>
            <td class="num">${esc(fmtAda(a.price_ada))}</td>
            <td class="num ${changeCls}">${esc(fmtPct(change))}</td>
            <td class="num">${esc(fmtAda(a.volume_24h_ada, true))}</td>
            <td class="num">${esc(fmtAda(a.liquidity_ada, true))}</td>
            <td class="num">${esc(fmtAda(a.market_cap_ada, true))}</td>
          </tr>`;
        }).join('');
      }
    }

    const marketCaption = $('#cardano-market-caption');
    if (marketCaption) marketCaption.textContent = `Verified Cardano-native assets from Minswap public metrics. Snapshot: ${snapshot.minswap?.as_of || 'unknown'}. Sorted by the public snapshot collector; no personal holdings or trading signals are included.`;

    const sourcesEl = $('#cardano-data-sources');
    if (sourcesEl) {
      sourcesEl.innerHTML = (snapshot.sources || []).map((source) => `
        <li><strong>${esc(source.name)}</strong><span>${esc(source.purpose || '')}<br><small>${esc(sourceStatus(source))}${source.last_success_at ? ` · ${esc(fmtDate(source.last_success_at))}` : ''}</small></span>${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">SOURCE ↗</a>` : ''}</li>`).join('');
    }
  }).catch((err) => {
    const status = $('#cardano-data-status');
    if (status) status.innerHTML = `<strong>DATA SNAPSHOT UNAVAILABLE</strong><span>${esc(err.message)}</span>`;
  });
})();

/* INDEX:80 Cardano public data dashboard.
   Live path: one public JSON endpoint at data.index80.com, cached at the edge.
   Static fallback: /data/cardano-snapshot.json. No account, wallet or private data. */
(() => {
  if (document.body?.dataset.mode !== 'data') return;

  const LIVE_DATA_URL = 'https://data.index80.com/cardano.json';
  const STATIC_FALLBACK_URL = '/data/cardano-snapshot.json';
  const LIVE_TIMEOUT_MS = 7000;
  const LIVE_MAX_AGE_MS = 30 * 60 * 1000;
  const DELAYED_MAX_AGE_MS = 2 * 60 * 60 * 1000;

  const $ = (sel) => document.querySelector(sel);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const n = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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
  const toDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const fmtDate = (value) => {
    const date = toDate(value);
    if (!date) return value ? String(value).toUpperCase() : 'UNKNOWN';
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC';
  };
  const fmtClock = (value) => {
    const date = toDate(value);
    if (!date) return '—';
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }).format(date) + ' UTC';
  };
  const ageMs = (value) => {
    const date = toDate(value);
    return date ? Math.max(0, Date.now() - date.getTime()) : null;
  };
  const fmtAge = (value) => {
    const ms = ageMs(value);
    if (ms === null) return 'UNKNOWN';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return '<1 MIN AGO';
    if (minutes < 60) return `${minutes} MIN AGO`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} H AGO`;
    return `${Math.floor(hours / 24)} D AGO`;
  };

  const style = document.createElement('style');
  style.textContent = `
    .data-status-strip { display:flex; flex-wrap:wrap; gap:.45rem 1rem; align-items:center; padding:.55rem .8rem; border:1px solid #36526e; background:#071829; color:#9cb7cd; font:600 .66rem/1.35 var(--font-pixel); }
    .data-status-strip strong { color:var(--cyan); }
    .data-live-dot { width:.55rem; height:.55rem; display:inline-block; background:var(--green); box-shadow:0 0 .45rem rgba(16,185,129,.7); margin-right:.35rem; }
    .data-live-dot.delayed { background:var(--amber); box-shadow:none; }
    .data-live-dot.stale { background:#ff8677; box-shadow:none; }
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

  async function fetchJson(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadPublicSnapshot() {
    try {
      const snapshot = await fetchJson(LIVE_DATA_URL, LIVE_TIMEOUT_MS);
      if (!snapshot || !snapshot.generated_at || !snapshot.market || !snapshot.network) throw new Error('invalid live snapshot');
      return { snapshot, delivery: 'live' };
    } catch (liveError) {
      const snapshot = await fetchJson(STATIC_FALLBACK_URL, 5000);
      return { snapshot, delivery: 'fallback', liveError: liveError.message };
    }
  }

  Promise.all([
    loadPublicSnapshot(),
    fetchJson('/data/projects.json', 5000).catch(() => ({ projects: [] })),
    fetchJson('/data/treasury-funding.json', 5000).catch(() => ({ records: {} })),
  ]).then(([snapshotResult, projectData, treasuryData]) => {
    const { snapshot, delivery } = snapshotResult;
    const market = snapshot.market || {};
    const network = snapshot.network || {};
    const assets = snapshot.minswap?.assets || [];
    const projects = projectData.projects || [];
    const bridge = treasuryData.records || {};

    // Shared confirmed-funding rule (treasury-rule.js) — same as the badge,
    // the filter and the Treasury views.
    const funded = projects.filter((project) => window.INDEX80Treasury.isConfirmedFunded(project, bridge[project.slug] || {}));
    const fundingRows = funded.map((project) => {
      const linked = bridge[project.slug] || {};
      return { name: project.name, value: n(project.treasury_funding_value_usd ?? linked.treasury_funding_value_usd) };
    });
    const knownFunding = fundingRows.reduce((sum, row) => sum + (row.value || 0), 0);
    const largest = fundingRows.filter((row) => row.value !== null).sort((a, b) => b.value - a.value)[0] || null;

    const status = $('#cardano-data-status');
    if (status) {
      const snapshotAge = ageMs(snapshot.generated_at);
      let label = 'LIVE PUBLIC DATA';
      let dotClass = '';
      if (delivery === 'fallback') {
        label = 'FALLBACK SNAPSHOT';
        dotClass = 'stale';
      } else if (snapshotAge === null || snapshotAge > DELAYED_MAX_AGE_MS) {
        label = 'STALE PUBLIC DATA';
        dotClass = 'stale';
      } else if (snapshotAge > LIVE_MAX_AGE_MS) {
        label = 'DELAYED PUBLIC DATA';
        dotClass = 'delayed';
      }
      status.innerHTML = `<span><i class="data-live-dot ${dotClass}"></i><strong>${label}</strong></span><span>REFRESHED ${esc(fmtAge(snapshot.generated_at))}</span><span>TARGET 15 MIN</span><span>SCHEMA ${esc(snapshot.schema_version || '0.2')}</span>`;
    }

    const marketEl = $('#cardano-market-metrics');
    if (marketEl) {
      const change = n(market.ada_change_24h_pct);
      // The ADA price label names the source that actually supplied it (CoinGecko
      // primary, Kraken fallback) from the snapshot's own provenance — never a
      // hard-coded source. The static fallback snapshot has no provenance and
      // is CoinGecko-seeded.
      const priceProv = snapshot.provenance?.['market.ada_price_usd'];
      const priceSource = String(priceProv?.source || 'CoinGecko').toUpperCase();
      const priceNote = `${priceSource} · USD${priceProv?.stale ? ' · STALE' : ''}`;
      marketEl.innerHTML = [
        metric('ADA PRICE', fmtUsd(market.ada_price_usd), priceNote),
        metric('ADA 24H', fmtPct(change), 'COINGECKO', change === null ? '' : (change >= 0 ? 'up' : 'down')),
        metric('DEFI TVL', fmtUsd(market.defi_tvl_usd, true), 'DEFILLAMA'),
        metric('DEX VOLUME 24H', fmtUsd(market.dex_volume_24h_usd, true), 'DEFILLAMA'),
        metric('STABLECOINS', fmtUsd(market.stablecoin_mcap_usd, true), 'DEFILLAMA'),
        metric('ADA MARKET CAP', fmtUsd(market.ada_market_cap_usd, true), 'COINGECKO'),
      ].join('');
    }

    const networkEl = $('#cardano-network-metrics');
    if (networkEl) {
      networkEl.innerHTML = [
        metric('EPOCH', fmtInt(network.epoch), 'KOIOS'),
        metric('BLOCK HEIGHT', fmtInt(network.block_height), 'KOIOS CHAIN TIP'),
        metric('ACTIVE STAKE', fmtAda(network.active_stake_ada, true), 'KOIOS · CURRENT EPOCH'),
        metric('EPOCH TX', fmtInt(network.epoch_tx_count), 'KOIOS · CURRENT EPOCH'),
        metric('LATEST BLOCK', fmtClock(network.latest_block_time), 'KOIOS'),
        metric('TIP AGE', fmtAge(network.latest_block_time), 'CHAIN FRESHNESS'),
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
        table.innerHTML = '<tr><td colspan="6">No market rows available in the current public data response.</td></tr>';
      } else {
        table.innerHTML = assets.map((asset) => {
          const change = n(asset.price_change_24h_pct);
          const changeClass = change === null ? '' : (change >= 0 ? 'positive' : 'negative');
          return `<tr>
            <td class="asset">${esc(asset.name || asset.ticker || 'Unknown')} <span class="ticker">${esc(asset.ticker || '')}</span></td>
            <td class="num">${esc(fmtAda(asset.price_ada))}</td>
            <td class="num ${changeClass}">${esc(fmtPct(change))}</td>
            <td class="num">${esc(fmtAda(asset.volume_24h_ada, true))}</td>
            <td class="num">${esc(fmtAda(asset.liquidity_ada, true))}</td>
            <td class="num">${esc(fmtAda(asset.market_cap_ada, true))}</td>
          </tr>`;
        }).join('');
      }
    }

    const marketCaption = $('#cardano-market-caption');
    if (marketCaption) {
      const observed = snapshot.minswap?.observed_at || snapshot.minswap?.as_of;
      marketCaption.textContent = `Verified Cardano-native assets from Minswap public metrics${observed ? ` · observed ${fmtDate(observed)}` : ''}. No personal holdings or trading signals.`;
    }

    const sourcesEl = $('#cardano-data-sources');
    if (sourcesEl) {
      sourcesEl.innerHTML = (snapshot.sources || []).map((source) => {
        const observed = source.observed_at || source.last_success_at;
        return `<li><strong>${esc(source.name)}</strong><span>${esc(source.purpose || '')}<br><small>${esc(sourceStatus(source))}${source.coverage ? ` · ${esc(source.coverage)}` : ''}${observed ? ` · ${esc(fmtAge(observed))}` : ''}</small></span>${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">SOURCE ↗</a>` : ''}</li>`;
      }).join('');
    }
  }).catch((error) => {
    const status = $('#cardano-data-status');
    if (status) status.innerHTML = `<strong>PUBLIC DATA UNAVAILABLE</strong><span>${esc(error.message)}</span>`;
  });
})();

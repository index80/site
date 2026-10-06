/* INDEX:80 Cardano public data dashboard.
   Live path: one public JSON endpoint at data.index80.com, cached at the edge.
   Static fallback: /data/cardano-snapshot.json. No account, wallet or private data. */
(() => {
  if (!['data', 'explore'].includes(document.body?.dataset.mode || '')) return;

  const LIVE_DATA_URL = 'https://data.index80.com/cardano.json';
  const STATIC_FALLBACK_URL = '/data/cardano-snapshot.json';
  const LIVE_TIMEOUT_MS = 7000;
  const LIVE_MAX_AGE_MS = 30 * 60 * 1000;
  const SnapshotPolicy = window.INDEX80SnapshotPolicy;
  if (!SnapshotPolicy) {
    console.warn('[INDEX:80] Snapshot policy unavailable; keeping static Data page.');
    return;
  }

  const $ = (sel) => document.querySelector(sel);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  // Source links come from a separate origin (data.index80.com): only
  // http(s) may become a clickable link. Same rule as directory.js.
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
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
    .data-status-strip { display:flex; flex-wrap:wrap; gap:.45rem 1rem; align-items:center; padding:.55rem .8rem; border:1px solid var(--line); background:var(--page-bg-2); color:var(--muted); font:600 .66rem/1.35 var(--font-pixel); }
    .data-status-strip strong { color:var(--cyan-text); }
    .data-live-dot { width:.55rem; height:.55rem; display:inline-block; background:var(--green); box-shadow:0 0 .45rem rgba(16,185,129,.7); margin-right:.35rem; }
    .data-live-dot.delayed { background:var(--amber); box-shadow:none; }
    .data-live-dot.stale { background:var(--coral); box-shadow:none; }
    .data-grid { grid-column:1/-1; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.8rem; }
    .data-card { min-width:0; }
    .data-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .data-metric { min-height:78px; padding:.7rem .8rem; border-right:1px solid var(--line); border-bottom:1px solid var(--line); }
    .data-metric span,.data-metric small { display:block; font:600 .64rem/1.3 var(--font-pixel); color:var(--muted); }
    .data-metric strong { display:block; margin:.3rem 0; font:700 clamp(1rem,2.4vw,1.35rem)/1.05 var(--font-pixel); color:var(--text); overflow-wrap:anywhere; }
    .data-metric strong.up { color:var(--green-text); } .data-metric strong.down { color:var(--coral-text); }
    .market-table-wrap { overflow-x:auto; }
    .market-table { width:100%; border-collapse:collapse; font-size:.8rem; font-family:var(--font-body); }
    .market-table th { text-align:left; color:var(--muted); font:700 .61rem/1.2 var(--font-pixel); letter-spacing:.03em; white-space:nowrap; }
    .market-table th,.market-table td { padding:.5rem .55rem; border-bottom:1px solid var(--line); }
    .market-table td.num,.market-table th.num { text-align:right; font-variant-numeric:tabular-nums; }
    .market-table td.asset { font-weight:700; color:var(--text); white-space:nowrap; }
    .market-table .ticker { color:var(--cyan-text); font:700 .67rem/1 var(--font-pixel); }
    .market-table .positive { color:var(--green-text); } .market-table .negative { color:var(--coral-text); }
    .data-source-list { list-style:none; margin:0; padding:0; }
    .data-source-list li { display:grid; grid-template-columns:minmax(9rem,.7fr) minmax(0,1.4fr) auto; gap:.7rem; padding:.6rem .2rem; border-bottom:1px solid var(--line); align-items:start; }
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

  function fieldState(snapshot, key, value, fallbackSource) {
    const hasProvenance = snapshot.provenance && typeof snapshot.provenance === 'object';
    const record = hasProvenance ? snapshot.provenance[key] : null;
    const source = String(record?.source || fallbackSource || '').toUpperCase();

    if (value === null || value === undefined) {
      return { value: null, available: false, stale: false, note: [source, 'SOURCE UNAVAILABLE'].filter(Boolean).join(' · ') };
    }

    if (!hasProvenance) {
      return { value, available: true, stale: false, note: source };
    }

    const verdict = SnapshotPolicy.validateObservation(record);
    if (!verdict.ok) {
      return { value: null, available: false, stale: false, note: [source, 'SOURCE UNAVAILABLE'].filter(Boolean).join(' · ') };
    }

    return {
      value,
      available: true,
      stale: verdict.stale === true,
      note: [source, verdict.stale ? 'STALE' : null].filter(Boolean).join(' · '),
    };
  }

  function minswapState(snapshot) {
    const observed = snapshot.minswap?.observed_at || snapshot.minswap?.as_of || snapshot.generated_at;
    const hasProvenance = snapshot.provenance && typeof snapshot.provenance === 'object';
    const verdict = hasProvenance
      ? SnapshotPolicy.validateObservation(snapshot.provenance['minswap.assets'])
      : SnapshotPolicy.validateTimestamp(observed);

    return {
      available: verdict.ok,
      stale: verdict.ok && verdict.stale === true,
      observed,
    };
  }

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
      const verdict = SnapshotPolicy.validateSnapshot(snapshot);
      if (!verdict.ok) throw new Error('live snapshot outside display policy');
      return { snapshot, delivery: 'live', ageMs: verdict.ageMs };
    } catch (liveError) {
      const snapshot = await fetchJson(STATIC_FALLBACK_URL, 5000);
      const verdict = SnapshotPolicy.validateSnapshot(snapshot);
      if (!verdict.ok) throw new Error('no current live or fallback snapshot');
      return { snapshot, delivery: 'fallback', ageMs: verdict.ageMs, liveError: liveError.message };
    }
  }

  loadPublicSnapshot().then((snapshotResult) => {
    const { snapshot, delivery, ageMs: snapshotAge } = snapshotResult;
    const market = snapshot.market || {};
    const network = snapshot.network || {};

    const fields = {
      adaPrice: fieldState(snapshot, 'market.ada_price_usd', market.ada_price_usd, 'CoinGecko'),
      adaChange: fieldState(snapshot, 'market.ada_change_24h_pct', market.ada_change_24h_pct, 'CoinGecko'),
      defiTvl: fieldState(snapshot, 'market.defi_tvl_usd', market.defi_tvl_usd, 'DefiLlama'),
      dexVolume: fieldState(snapshot, 'market.dex_volume_24h_usd', market.dex_volume_24h_usd, 'DefiLlama'),
      stablecoins: fieldState(snapshot, 'market.stablecoin_mcap_usd', market.stablecoin_mcap_usd, 'DefiLlama'),
      adaMarketCap: fieldState(snapshot, 'market.ada_market_cap_usd', market.ada_market_cap_usd, 'CoinGecko'),
      epoch: fieldState(snapshot, 'network.epoch', network.epoch, 'Koios'),
      blockHeight: fieldState(snapshot, 'network.block_height', network.block_height, 'Koios'),
      activeStake: fieldState(snapshot, 'network.active_stake_ada', network.active_stake_ada, 'Koios'),
      epochTx: fieldState(snapshot, 'network.epoch_tx_count', network.epoch_tx_count, 'Koios'),
      latestBlock: fieldState(snapshot, 'network.latest_block_time', network.latest_block_time, 'Koios'),
    };
    const mins = minswapState(snapshot);
    const rawAssets = Array.isArray(snapshot.minswap?.assets) ? snapshot.minswap.assets : [];
    const assets = mins.available ? rawAssets : [];

    const status = $('#cardano-data-status');
    if (status) {
      const fieldStates = Object.values(fields);
      const partial = fieldStates.some((field) => !field.available || field.stale)
        || (rawAssets.length > 0 && (!mins.available || mins.stale));
      let label = 'LIVE PUBLIC DATA';
      let dotClass = '';
      if (delivery === 'fallback') {
        label = 'FALLBACK SNAPSHOT';
        dotClass = 'stale';
      } else if (partial) {
        label = 'PARTIAL PUBLIC DATA';
        dotClass = 'delayed';
      } else if (snapshotAge > LIVE_MAX_AGE_MS) {
        label = 'DELAYED PUBLIC DATA';
        dotClass = 'delayed';
      }
      status.innerHTML = `<span><i class="data-live-dot ${dotClass}"></i><strong>${label}</strong></span><span>REFRESHED ${esc(fmtAge(snapshot.generated_at))}</span><span>TARGET 15 MIN</span><span>SCHEMA ${esc(snapshot.schema_version || '0.2')}</span>`;
    }

    const marketEl = $('#cardano-market-metrics');
    if (marketEl) {
      const change = n(fields.adaChange.value);
      marketEl.innerHTML = [
        metric('ADA PRICE', fmtUsd(fields.adaPrice.value), fields.adaPrice.available ? `${fields.adaPrice.note} · USD` : fields.adaPrice.note),
        metric('ADA 24H', fmtPct(fields.adaChange.value), fields.adaChange.note, change === null ? '' : (change >= 0 ? 'up' : 'down')),
        metric('DEFI TVL', fmtUsd(fields.defiTvl.value, true), fields.defiTvl.note),
        metric('DEX VOLUME 24H', fmtUsd(fields.dexVolume.value, true), fields.dexVolume.note),
        metric('STABLECOINS', fmtUsd(fields.stablecoins.value, true), fields.stablecoins.note),
        metric('ADA MARKET CAP', fmtUsd(fields.adaMarketCap.value, true), fields.adaMarketCap.note),
      ].join('');
    }

    const networkEl = $('#cardano-network-metrics');
    if (networkEl) {
      networkEl.innerHTML = [
        metric('EPOCH', fmtInt(fields.epoch.value), fields.epoch.note),
        metric('BLOCK HEIGHT', fmtInt(fields.blockHeight.value), fields.blockHeight.note),
        metric('ACTIVE STAKE', fmtAda(fields.activeStake.value, true), fields.activeStake.note),
        metric('EPOCH TX', fmtInt(fields.epochTx.value), fields.epochTx.note),
        metric('LATEST BLOCK', fmtClock(fields.latestBlock.value), fields.latestBlock.note),
        metric('TIP AGE', fields.latestBlock.available ? fmtAge(fields.latestBlock.value) : '—', fields.latestBlock.available ? `CHAIN FRESHNESS · ${fields.latestBlock.note}` : 'CHAIN FRESHNESS · UNAVAILABLE'),
      ].join('');
    }

    // INDEX:80-native ecosystem metrics are generated statically at build time.
    // Live data must not overwrite that trusted release-derived surface.

    const table = $('#cardano-market-table-body');
    if (table) {
      if (!mins.available) {
        table.innerHTML = '<tr><td colspan="6">Current Minswap market rows are unavailable.</td></tr>';
      } else if (!assets.length) {
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
      if (!mins.available) {
        marketCaption.textContent = 'Minswap market rows unavailable because the latest observation is outside the display window.';
      } else {
        marketCaption.textContent = `Verified Cardano-native assets from Minswap public metrics${mins.observed ? ` · observed ${fmtDate(mins.observed)}` : ''}${mins.stale ? ' · STALE' : ''}. No personal holdings or trading signals.`;
      }
    }

    const sourcesEl = $('#cardano-data-sources');
    if (sourcesEl) {
      const registrySource = '<li><strong>INDEX:80 Registry</strong><span>Static ecosystem facts from the current governed release.<br><small>AVAILABLE WITHOUT LIVE SERVICES</small></span><a href="/registry/">SOURCE →</a></li>';
      const externalSources = (snapshot.sources || []).map((source) => {
        const observed = source.observed_at || source.last_success_at;
        return `<li><strong>${esc(source.name)}</strong><span>${esc(source.purpose || '')}<br><small>${esc(sourceStatus(source))}${source.coverage ? ` · ${esc(source.coverage)}` : ''}${observed ? ` · ${esc(fmtAge(observed))}` : ''}</small></span>${safeUrl(source.url) ? `<a href="${esc(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">SOURCE ↗</a>` : ''}</li>`;
      }).join('');
      sourcesEl.innerHTML = registrySource + externalSources;
    }
  }).catch((error) => {
    console.warn('[INDEX:80] Optional live Cardano data unavailable; keeping static release snapshot.', error);
    const status = $('#cardano-data-status');
    if (status) {
      status.innerHTML = '<span><i class="data-live-dot stale"></i><strong>LIVE DATA UNAVAILABLE</strong></span><span>STATIC INDEX:80 SNAPSHOT SHOWN</span>';
    }
  });
})();

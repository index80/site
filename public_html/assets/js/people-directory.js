/*
 * INDEX:80 People directory progressive enhancement.
 * Static rows are already in the HTML; this adds client-side search,
 * category filters and sorting from /data/people.json.
 */
(() => {
  const root = document.querySelector('[data-people-directory]');
  const list = document.querySelector('#people-list');
  if (!root || !list) return;

  const bar = document.querySelector('#people-category-bar');
  const countEl = document.querySelector('#people-directory-count');
  const searchInput = document.querySelector('#people-search');
  const source = root.getAttribute('data-source') || '/data/people.json';

  const CATEGORY_ORDER = [
    'DReps & Governance',
    'Founders & Builders',
    'Developers & Engineers',
    'SPOs & Infrastructure',
    'Creators & Media',
    'Community & Ambassadors',
    'Education & Research',
    'Ecosystem Leadership',
    'Arts & Culture',
  ];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  // Mirrors scripts/lib/people-display.mjs.
  const hasVerifiedDrep = (p) => Boolean(p.drep_id) && /^Active\b/i.test(p.drep_status || '');
  const hasVerifiedSpo = (p) => /^Active\b/i.test(p.spo_status || '') && Boolean(p.pool_ticker || (p.pool_ids || []).length);
  const initials = (name) => {
    const parts = String(name || '').replace(/^[$@#]+/, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  const safeAvatar = (u) => (typeof u === 'string' && /^\/assets\/people\/[a-z0-9][a-z0-9/_.-]*\.(?:avif|gif|jpe?g|png|webp)$/i.test(u) && !u.includes('..') ? u : null);
  const thumb = (p) => {
    const src = safeAvatar(p.avatar_url);
    return src
      ? `<img class="dir-thumb" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="dir-thumb dir-thumb-fallback" aria-hidden="true">${esc(initials(p.name))}</span>`;
  };
  const badges = (p) => (hasVerifiedDrep(p) ? '<span class="dir-badge" title="Verified active DRep">DREP</span>' : '')
    + (hasVerifiedSpo(p) ? '<span class="dir-badge" title="Verified active stake pool operator">SPO</span>' : '');

  let people = [];
  let activeCategory = 'all';
  let query = '';
  let sortKey = null;
  let sortDir = 'asc';

  const summary = (p) => {
    const role = (p.role_tags || []).join(', ');
    const linked = (p.linked_projects || []).length ? ` · ${p.linked_projects.join(', ')}` : '';
    return `${role}${linked}`;
  };

  function render() {
    // Every word must match somewhere (name, roles, projects, tickers, handles).
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const visible = people.filter((p) => {
      const inCategory = activeCategory === 'all' || p.primary_category === activeCategory;
      const inSearch = terms.every((t) => p._search.includes(t));
      return inCategory && inSearch;
    });

    if (sortKey) {
      const dir = sortDir === 'desc' ? -1 : 1;
      visible.sort((a,b) => {
        const av = sortKey === 'category' ? a.primary_category : a.name;
        const bv = sortKey === 'category' ? b.primary_category : b.name;
        return av.localeCompare(bv) * dir;
      });
    }

    list.innerHTML = visible.map((p,i) => {
      const num = String(i + 1).padStart(2,'0');
      const name = p.profile_url
        ? `<a class="dir-name" href="${esc(p.profile_url)}">${esc(p.name)}</a>`
        : `<span class="dir-name">${esc(p.name)}</span>`;
      const ext = safeUrl(p.x_url) || safeUrl(p.linkedin_url);
      const outbound = ext
        ? `<a class="dir-link" href="${esc(ext)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.name)} public profile in a new tab">↗</a>`
        : '<span class="dir-link" aria-hidden="true"></span>';

      return `<li class="dir-row">
        <span class="dir-index">${num}</span>
        <svg class="icon dir-icon" aria-hidden="true"><use href="/assets/icons/icons.svg#icon-${esc(p.icon || 'infrastructure')}"></use></svg>
        <span class="dir-person">${thumb(p)}${name}${badges(p)}</span>
        <span class="dir-desc">${esc(summary(p))}</span>
        <span class="dir-cat">${esc(p.filter_label || p.primary_category.toUpperCase())}</span>
        ${outbound}
      </li>`;
    }).join('');

    if (!visible.length) list.innerHTML = '<li class="dir-empty">No people match this filter yet.</li>';
    if (countEl) countEl.textContent = visible.length === people.length
      ? `${people.length} RECORDS`
      : `${visible.length} / ${people.length} RECORDS`;
  }

  function buildCategoryBar() {
    if (!bar) return;
    const counts = {};
    people.forEach((p) => { counts[p.primary_category] = (counts[p.primary_category] || 0) + 1; });
    const categories = CATEGORY_ORDER.filter((c) => counts[c]);
    const buttons = [{id:'all',label:'ALL',count:people.length}]
      .concat(categories.map((c) => ({
        id:c,
        label:(people.find((p)=>p.primary_category===c)?.filter_label || c.toUpperCase()),
        count:counts[c]
      })));

    bar.innerHTML = buttons.map((b) =>
      `<button type="button" class="cat-chip${b.id === activeCategory ? ' active' : ''}" data-cat="${esc(b.id)}" role="tab" aria-selected="${b.id === activeCategory}">${esc(b.label)} <span>${b.count}</span></button>`
    ).join('');

    bar.querySelectorAll('.cat-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-cat');
        bar.querySelectorAll('.cat-chip').forEach((b) => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', String(active));
        });
        syncUrl();
        render();
      });
    });
  }

  // Keep the current filter shareable without adding history entries.
  function syncUrl() {
    try {
      const url = new URL(window.location.href);
      if (activeCategory === 'all') url.searchParams.delete('category');
      else url.searchParams.set('category', activeCategory);
      if (query.trim()) url.searchParams.set('q', query.trim());
      else url.searchParams.delete('q');
      window.history.replaceState(null, '', url);
    } catch { /* non-critical */ }
  }

  // Coalesce keystrokes into one render per frame; the list is several hundred rows.
  let pending = 0;
  if (searchInput) searchInput.addEventListener('input', () => {
    query = searchInput.value;
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      syncUrl();
      render();
    });
  });

  document.querySelectorAll('.people-sort').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sort');
      sortDir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc';
      sortKey = key;
      document.querySelectorAll('.people-sort').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        if (active) b.setAttribute('data-dir', sortDir);
        else b.removeAttribute('data-dir');
      });
      render();
    });
  });

  fetch(source)
    .then((r) => {
      if (!r.ok) throw new Error(`${source} responded ${r.status}`);
      return r.json();
    })
    .then((data) => {
      people = (data.people || [])
        .map((p) => ({
          ...p,
          _search: [
            p.name,
            p.profile_subtitle || '',
            p.primary_category,
            p.filter_label || '',
            ...(p.role_tags || []),
            ...(p.current_roles || []),
            ...(p.historic_roles || []),
            ...(p.linked_projects || []),
            p.pool_ticker || '',
            (p.x_url || '').replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '@'),
            hasVerifiedDrep(p) ? 'drep' : '',
            hasVerifiedSpo(p) ? 'spo stake pool' : '',
          ].join(' ').toLowerCase()
        }));

      const params = new URLSearchParams(window.location.search);
      const requested = params.get('category');
      if (requested && people.some((p) => p.primary_category === requested)) activeCategory = requested;
      const q = params.get('q');
      if (q && searchInput) { query = q; searchInput.value = q; }
      buildCategoryBar();
      render();
    })
    .catch((err) => {
      console.warn('[INDEX:80] People directory enhancement unavailable; keeping pre-rendered directory.', err);
    });
})();

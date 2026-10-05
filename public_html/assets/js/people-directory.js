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
  const projectsSource = '/data/projects.json';

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
  // DEV-only candidate PFP map; present only on the protected review preview.
  const reviewSource = root.getAttribute('data-pfp-review');
  let reviewImages = {};
  const safeAvatar = (u) => (typeof u === 'string' && /^\/assets\/people(?:-review)?\/[a-z0-9][a-z0-9/_.-]*\.(?:avif|gif|jpe?g|png|webp)$/i.test(u) && !u.includes('..') ? u : null);
  const thumb = (p) => {
    const approved = safeAvatar(p.avatar_url);
    const candidate = !approved && safeAvatar(reviewImages[p.slug]?.path);
    const src = approved || candidate;
    return src
      ? `<img class="dir-thumb${candidate ? ' dir-thumb-review' : ''}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="dir-thumb dir-thumb-fallback" aria-hidden="true">${esc(initials(p.name))}</span>`;
  };
  const badges = (p) => {
    const checkedTitle = p.last_verified
      ? `INDEX:80 checked against public sources on ${p.last_verified}`
      : 'INDEX:80 checked against public sources';
    return (hasVerifiedDrep(p) ? '<span class="dir-badge" title="Active DRep — checked against on-chain or official sources">DREP</span>' : '')
      + (hasVerifiedSpo(p) ? '<span class="dir-badge" title="Active stake pool operator — checked against on-chain or official sources">SPO</span>' : '')
      + (p.verification_status === 'VERIFIED'
        ? `<span class="dir-badge dir-badge-checked" title="${esc(checkedTitle)}">CHECKED</span>`
        : '');
  };

  let people = [];
  let projectMap = new Map();
  let activeCategory = 'all';
  let query = '';
  let sortKey = null;
  let sortDir = 'asc';

  const normalize = (s) => String(s ?? '').trim().toLowerCase();

  // Preserve build-time People → Project links if the optional projects
  // dataset cannot be fetched during client enhancement. Hydration should
  // never make the static-first directory less useful than the HTML fallback.
  list.querySelectorAll('.dir-project-link').forEach((link) => {
    const label = normalize(link.textContent);
    const match = (link.getAttribute('href') || '').match(/^\/projects\/([a-z0-9-]+)\/?$/);
    if (label && match) projectMap.set(label, match[1]);
  });

  const summary = (p) => {
    const role = esc((p.role_tags || []).join(', '));
    const linked = (p.linked_projects || []).map((label) => {
      const slug = projectMap.get(normalize(label));
      return slug
        ? `<a class="dir-project-link" href="/projects/${esc(slug)}/">${esc(label)}</a>`
        : esc(label);
    }).join(', ');
    return linked ? `${role} · ${linked}` : role;
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
        <span class="dir-desc">${summary(p)}</span>
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

  const reviewReady = reviewSource
    ? fetch(reviewSource).then((r) => (r.ok ? r.json() : null)).then((m) => { reviewImages = (m && m.mode === 'dev-review' && m.images) || {}; }).catch(() => {})
    : Promise.resolve();

  Promise.all([
    fetch(source),
    reviewReady,
    fetch(projectsSource)
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .catch(() => ({ projects: [] })),
  ])
    .then(async ([r, , projectData]) => {
      if (!r.ok) throw new Error(`${source} responded ${r.status}`);
      (projectData.projects || [])
        .filter((p) => p && p.status !== 'archived' && p.name && p.slug)
        .forEach((p) => projectMap.set(normalize(p.name), p.slug));
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

/*
 * INDEX:80 directory renderer.
 * Fetches data/projects.json and renders a filterable, searchable
 * category-grouped directory into any page that has a `#directory-list`
 * element inside a container carrying `data-source="path/to/projects.json"`.
 * Plain JS, no build step, no framework.
 *
 * Project names link to the INDEX:80 profile route (/projects/<slug>/).
 * A separate external-link icon opens the best available outbound link
 * for that record (official site, falling back to docs/GitHub/social) —
 * the link model does not assume every record has a website.
 *
 * Related-project metadata prefers fields embedded in projects.json by the
 * Registry publisher. project-relations.json is a temporary derived fallback
 * for dev builds made before the data exporter is synced. In the default
 * Registry ordering, related projects are kept together; explicit user
 * sorting still wins when a sort control is selected.
 */
(() => {
  const root = document.querySelector('[data-directory]');
  const list = document.querySelector('#directory-list');
  if (!root || !list) return;

  const bar = document.querySelector('#category-bar');
  const countEl = document.querySelector('#directory-count');
  const searchInput =
    document.querySelector('#directory-search') ||
    document.querySelector('.main-nav input[type="search"]');
  const source = root.getAttribute('data-source') || 'data/projects.json';
  const relationsSource = root.getAttribute('data-relations-source') || '/data/project-relations.json';
  const iconsHref = root.getAttribute('data-icons') || 'assets/icons/icons.svg';
  const profileBase = root.getAttribute('data-profile-base') || '/projects/';
  const defaultCategory = root.getAttribute('data-default-category');

  // Controlled category vocabulary, in display order.
  const CATEGORY_ORDER = [
    'wallet', 'dex', 'defi', 'lending', 'derivatives', 'governance',
    'analytics', 'explorer', 'nft', 'infrastructure', 'stake-pools', 'developer-tool',
    'education', 'ai', 'game', 'utility', 'token-project',
  ];

  const CATEGORY_ICON = {
    wallet: 'wallet',
    dex: 'dex',
    defi: 'dex',
    lending: 'dex',
    derivatives: 'dex',
    governance: 'governance',
    analytics: 'analytics',
    explorer: 'explorer',
    nft: 'nft',
    infrastructure: 'infrastructure',
    'stake-pools': 'infrastructure',
    'developer-tool': 'developer',
    education: 'education',
    ai: 'ai',
    game: 'nft',
    utility: 'infrastructure',
    'token-project': 'nft',
  };

  const icon = (name, cls) =>
    `<svg class="icon ${cls || ''}" aria-hidden="true"><use href="${iconsHref}#icon-${name}"></use></svg>`;

  const catLabel = (cat) => cat.replace(/-/g, ' ').toUpperCase();

  // Registry-derived text (name, category, status, slug, URLs) is edited by
  // non-developer editors through the Editorial Registry and must never be
  // interpolated into HTML unescaped — mirrors esc() in
  // scripts/generate-project-pages.mjs, which the static profile pages
  // already rely on.
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Only allow http(s) links out — blocks a `javascript:`/`data:` etc. URL
  // from executing on click even if it slipped past registry validation.
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

  // Typed-link model: prefer an official website, but fall back to any
  // other outbound link a record does carry. Returns null if a record
  // has no outbound link at all yet.
  const bestExternalLink = (p) =>
    safeUrl(p.official_url) || safeUrl(p.github_url) || safeUrl(p.docs_url) || safeUrl(p.social_url) || null;

  function orderByRelations(items, relationRecords) {
    const bySlug = new Map(items.map((p) => [p.slug, p]));
    const emitted = new Set();
    const ordered = [];

    function emit(slug) {
      if (emitted.has(slug)) return;
      const project = bySlug.get(slug);
      if (!project) return;
      emitted.add(slug);
      ordered.push(project);

      const related = relationRecords?.[slug]?.related_projects || [];
      for (const relatedSlug of related) emit(relatedSlug);
    }

    for (const project of items) emit(project.slug);
    return ordered;
  }

  let projects = [];
  let activeCategory = defaultCategory || 'all';
  let query = '';
  let sortKey = null; // 'name' | 'category' | null (Registry/relationship order)
  let sortDir = 'asc';

  const sortButtons = document.querySelectorAll('.dir-sort');

  function render() {
    const q = query.trim().toLowerCase();
    const visible = projects.filter((p) => {
      const inCategory = activeCategory === 'all' || p.category === activeCategory;
      const haystack = p._search;
      const inSearch = !q || haystack.includes(q);
      return inCategory && inSearch;
    });

    if (sortKey) {
      const dir = sortDir === 'desc' ? -1 : 1;
      visible.sort((a, b) => {
        const av = sortKey === 'category' ? catLabel(a.category) : a.name;
        const bv = sortKey === 'category' ? catLabel(b.category) : b.name;
        return av.localeCompare(bv) * dir;
      });
    }

    // codeql[js/xss-through-dom] Every dynamic value below is escaped by esc() (defined above) or drawn from the fixed CATEGORY_ICON lookup before interpolation; nothing here reaches innerHTML unescaped.
    list.innerHTML = visible
      .map((p, i) => {
        const catIcon = CATEGORY_ICON[p.category] || 'infrastructure';
        const num = String(i + 1).padStart(2, '0');
        const profileHref = `${profileBase}${encodeURIComponent(p.slug)}/`;
        const external = bestExternalLink(p);
        const externalLink = external
          ? `<a class="dir-link" href="${esc(external)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.name)}'s external site in a new tab">↗</a>`
          : `<span class="dir-link" aria-hidden="true"></span>`;
        const featuredMark = p.featured
          ? `<span class="dir-featured" aria-label="Featured by INDEX:80" title="Editorially featured by INDEX:80">★</span> `
          : '';
        // Same confirmed-funding rule as the profile page's badge and the
        // Treasury filter (assets/js/treasury-rule.js): award evidence only —
        // a Catalyst / Funding Ref alone never marks a row. A compact glyph
        // here rather than the full "₳ TREASURY FUNDED" chip, matching how
        // Featured is just "★" in this dense row.
        const treasuryMark = window.INDEX80Treasury?.isConfirmedFunded(p)
          ? `<span class="dir-treasury" aria-label="Treasury funded" title="Confirmed Cardano Treasury funding on record">₳</span> `
          : '';
        return `<li class="dir-row">
          <span class="dir-index">${num}</span>
          ${icon(catIcon, 'dir-icon')}
          <a class="dir-name" href="${esc(profileHref)}">${featuredMark}${treasuryMark}${esc(p.name)}</a>
          <span class="dir-desc">${esc(p.summary || '')}</span>
          <span class="dir-cat">${esc(catLabel(p.category))}</span>
          ${externalLink}
        </li>`;
      })
      .join('');

    if (countEl) {
      countEl.textContent =
        visible.length === projects.length
          ? `${projects.length} RECORDS`
          : `${visible.length} / ${projects.length} RECORDS`;
    }

    if (!visible.length) {
      list.innerHTML = '<li class="dir-empty">No records match this filter yet.</li>';
    }
  }

  function buildCategoryBar() {
    if (!bar) return;
    const counts = {};
    for (const p of projects) counts[p.category] = (counts[p.category] || 0) + 1;

    const cats = CATEGORY_ORDER.filter((c) => counts[c]);
    const buttons = [{ id: 'all', label: 'ALL', count: projects.length }].concat(
      cats.map((c) => ({ id: c, label: catLabel(c), count: counts[c] }))
    );

    bar.innerHTML = buttons
      .map(
        (b) =>
          `<button type="button" class="cat-chip${b.id === activeCategory ? ' active' : ''}" data-cat="${b.id}" role="tab" aria-selected="${b.id === activeCategory}">${b.label} <span>${b.count}</span></button>`
      )
      .join('');

    bar.querySelectorAll('.cat-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-cat');
        bar.querySelectorAll('.cat-chip').forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-selected', String(isActive));
        });
        render();
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      query = searchInput.value;
      render();
    });
  }

  sortButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sort');
      sortDir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc';
      sortKey = key;
      sortButtons.forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle('active', isActive);
        if (isActive) {
          b.setAttribute('data-dir', sortDir);
        } else {
          b.removeAttribute('data-dir');
        }
      });
      render();
    });
  });

  const relationsPromise = fetch(relationsSource)
    .then((r) => (r.ok ? r.json() : { records: {} }))
    .catch(() => ({ records: {} }));

  Promise.all([
    fetch(source).then((r) => {
      if (!r.ok) throw new Error(`${source} responded ${r.status}`);
      return r.json();
    }),
    relationsPromise,
  ])
    .then(([data, relationData]) => {
      const fallbackRelations = relationData.records || {};
      // Archived records keep their own static /projects/<slug>/ page but are
      // a human editorial decision to retire from active discovery — never
      // surface them in the homepage directory/search. Mirrors isListable()
      // in scripts/generate-home-directory.mjs and generate-site-schema.mjs.
      const projectRows = (data.projects || []).filter((p) => p.status !== 'archived');
      const nameBySlug = new Map(projectRows.map((p) => [p.slug, p.name]));
      const effectiveRelations = {};

      const rawProjects = projectRows.map((p) => {
        const fallback = fallbackRelations[p.slug] || {};
        const relation = {
          team_entity: p.team_entity || fallback.team_entity || '',
          founder_lead: p.founder_lead || fallback.founder_lead || '',
          related_projects:
            Array.isArray(p.related_projects) && p.related_projects.length
              ? p.related_projects
              : (fallback.related_projects || []),
        };
        effectiveRelations[p.slug] = relation;
        const relatedNames = relation.related_projects
          .map((slug) => nameBySlug.get(slug))
          .filter(Boolean);
        return {
          ...p,
          _search: [
            p.name,
            p.category,
            p.summary,
            ...(p.tags || []),
            relation.team_entity,
            relation.founder_lead,
            ...relatedNames,
          ].join(' ').toLowerCase(),
        };
      });
      projects = orderByRelations(rawProjects, effectiveRelations);

      // Allow deep-linking a category filter, e.g. /?category=wallet
      const requestedCategory = new URLSearchParams(window.location.search).get('category');
      if (requestedCategory && projects.some((p) => p.category === requestedCategory)) {
        activeCategory = requestedCategory;
      }

      buildCategoryBar();
      render();
    })
    .catch((err) => {
      // The build ships a complete static directory in the original HTML.
      // If enhancement data is unavailable, keep that crawlable/usable
      // fallback rather than replacing it with an error message.
      console.warn('[INDEX:80] Directory enhancement unavailable; keeping pre-rendered directory.', err);
    });
})();

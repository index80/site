(() => {
  const params = new URLSearchParams(location.search);
  const requested = (params.get('release') || '').trim().toLowerCase();
  const releaseSlug = /^index80-\d{4,}$/.test(requested) ? requested : null;

  const title = document.getElementById('snapshot-title');
  const intro = document.getElementById('snapshot-intro');
  const meta = document.getElementById('snapshot-meta');
  const count = document.getElementById('snapshot-count');
  const body = document.getElementById('snapshot-table-body');
  const search = document.getElementById('snapshot-search');
  const rawLink = document.getElementById('raw-json-link');

  const escapeText = (value) => String(value ?? '');
  let rows = [];

  function render(filter = '') {
    const q = filter.trim().toLowerCase();
    const shown = q
      ? rows.filter((row) => row.searchText.includes(q))
      : rows;

    count.textContent = `${shown.length} / ${rows.length} RECORDS`;
    if (!shown.length) {
      body.innerHTML = '<tr><td colspan="5" class="registry-snapshot-empty">No matching projects.</td></tr>';
      return;
    }

    body.innerHTML = '';
    for (const row of shown) {
      const tr = document.createElement('tr');

      const project = document.createElement('td');
      project.className = 'project-name';
      const projectLink = document.createElement('a');
      projectLink.href = `/projects/${encodeURIComponent(row.slug)}/`;
      projectLink.textContent = row.name;
      project.appendChild(projectLink);

      const category = document.createElement('td');
      category.textContent = [row.publicFamily, row.category].filter(Boolean).join(' / ') || '—';

      const status = document.createElement('td');
      status.className = 'project-status';
      status.textContent = row.status || '—';

      const summary = document.createElement('td');
      summary.className = 'project-summary';
      summary.textContent = row.summary || '—';

      const site = document.createElement('td');
      site.className = 'project-link';
      if (row.officialUrl) {
        const a = document.createElement('a');
        a.href = row.officialUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Open ↗';
        site.appendChild(a);
      } else {
        site.textContent = '—';
      }

      tr.append(project, category, status, summary, site);
      body.appendChild(tr);
    }
  }

  async function loadSnapshot() {
    try {
      let slug = releaseSlug;
      if (!slug) {
        const historyRes = await fetch('/registry/index.json', { cache: 'no-store' });
        if (!historyRes.ok) throw new Error('Unable to load release history.');
        const history = await historyRes.json();
        slug = String(history.latest_release_id || '').toLowerCase();
      }
      if (!/^index80-\d{4,}$/.test(slug)) throw new Error('Invalid release ID.');

      const manifestRes = await fetch(`/registry/releases/${slug}.json`, { cache: 'no-store' });
      if (!manifestRes.ok) throw new Error(`Release ${slug.toUpperCase()} was not found.`);
      const manifest = await manifestRes.json();

      const snapshotPath = manifest.snapshot?.path;
      if (!snapshotPath) throw new Error('Release manifest has no snapshot path.');
      const snapshotRes = await fetch(snapshotPath, { cache: 'no-store' });
      if (!snapshotRes.ok) throw new Error('Snapshot JSON could not be loaded.');
      const snapshot = await snapshotRes.json();

      title.textContent = manifest.release_id;
      document.title = `${manifest.release_id} Snapshot — INDEX:80 / CARDANO`;
      intro.textContent = `Human-readable view of the immutable ${manifest.release_id} public registry snapshot.`;
      meta.innerHTML = '';
      const details = [
        `${snapshot.project_count ?? manifest.snapshot?.project_count ?? 0} projects`,
        `${String(manifest.cardano?.network || '').toUpperCase()} proof target`,
        `SHA-256 ${manifest.snapshot?.hash || '—'}`,
      ];
      details.forEach((value) => {
        const span = document.createElement('span');
        span.textContent = value;
        meta.appendChild(span);
      });
      rawLink.href = snapshotPath;

      rows = (snapshot.projects || []).map((project) => ({
        slug: escapeText(project.slug),
        name: escapeText(project.name),
        publicFamily: escapeText(project.public_family),
        category: escapeText(project.category),
        status: escapeText(project.status),
        summary: escapeText(project.summary),
        officialUrl: escapeText(project.official_url || project.primary_link_url || ''),
        searchText: [
          project.slug,
          project.name,
          project.public_family,
          project.category,
          project.status,
          project.summary,
          ...(Array.isArray(project.tags) ? project.tags : []),
        ].filter(Boolean).join(' ').toLowerCase(),
      }));

      render();
      search.addEventListener('input', () => render(search.value));
    } catch (error) {
      title.textContent = 'SNAPSHOT UNAVAILABLE';
      intro.textContent = error instanceof Error ? error.message : String(error);
      count.textContent = '0 RECORDS';
      body.innerHTML = '<tr><td colspan="5" class="registry-snapshot-empty">Unable to load this registry snapshot.</td></tr>';
    }
  }

  loadSnapshot();
})();

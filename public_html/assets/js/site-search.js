/* INDEX:80 — site-wide search (prototype).
 *
 * One rule across the site: text search = search INDEX:80. The search strip
 * under the primary navigation is a plain GET form to /search/?q=, so it
 * works without JavaScript; this script adds an as-you-type dropdown and
 * renders the /search/ results page. Data: /data/search-index.json (static,
 * public fields only — see scripts/generate-search-index.mjs).
 */
(function () {
  'use strict';

  var INDEX_URL = '/data/search-index.json';
  var MIN_CHARS = 2;
  var DROPDOWN_MAX = 8;
  var PER_GROUP_MAX = 4;
  var TYPES = {
    project: {icon: '▦', label: 'Project', group: 'projects'},
    person: {icon: '◎', label: 'Person', group: 'people'},
    learn: {icon: '▤', label: 'Learn', group: 'learn'},
    governance: {icon: '⌂', label: 'Governance', group: 'govdata'},
    data: {icon: '▥', label: 'Data', group: 'govdata'},
    registry: {icon: '▣', label: 'Registry', group: 'govdata'},
    page: {icon: '◇', label: 'INDEX:80', group: 'site'}
  };
  var GROUPS = {projects: 'PROJECTS', people: 'PEOPLE', learn: 'LEARN', govdata: 'GOVERNANCE / DATA', site: 'INDEX:80'};

  var indexPromise = null;
  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(INDEX_URL, {credentials: 'same-origin'})
        .then(function (r) { if (!r.ok) throw new Error('search index ' + r.status); return r.json(); })
        .then(function (data) { return prepare(data.items || []); });
      indexPromise.catch(function () { indexPromise = null; });
    }
    return indexPromise;
  }

  function prepare(items) {
    return items.map(function (it) {
      var t = normalise(it.title);
      it._title = t;
      it._hay = ' ' + t + ' | ' + it.search_terms + ' ';
      return it;
    });
  }

  function normalise(value) {
    return String(value == null ? '' : value).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  // Every query word must start a word somewhere in the entry (title or public
  // terms). Title matches rank above term-only matches.
  function search(items, query) {
    var q = normalise(query);
    if (q.length < MIN_CHARS) return [];
    var words = q.split(' ');
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var ok = true;
      for (var w = 0; w < words.length; w++) if (it._hay.indexOf(' ' + words[w]) === -1) { ok = false; break; }
      if (!ok) continue;
      var t = it._title;
      var score = t === q ? 100 : t.indexOf(q) === 0 ? 80 : (' ' + t).indexOf(' ' + q) !== -1 ? 60 : 10;
      if (score === 10) {
        var inTitle = words.every(function (w) { return (' ' + t).indexOf(' ' + w) !== -1; });
        if (inTitle) score = 40;
      }
      if (it.type === 'project' || it.type === 'person') score += 2;
      score -= Math.min(t.length, 80) / 100;
      out.push({item: it, score: score});
    }
    out.sort(function (a, b) { return b.score - a.score || a.item.title.localeCompare(b.item.title); });
    return out;
  }

  function grouped(results) {
    var groups = {};
    var order = [];
    results.forEach(function (r) {
      var g = TYPES[r.item.type].group;
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(r);
    });
    return order.map(function (g) { return {key: g, label: GROUPS[g], results: groups[g]}; });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; });
  }
  function safeUrl(url) { return /^\/(?!\/)/.test(url) ? url : '/'; }
  function subtitle(it) {
    var type = TYPES[it.type] || TYPES.page;
    return [type.label, it.subtitle].filter(Boolean).join(' · ');
  }
  function resultHtml(it, id, role) {
    var type = TYPES[it.type] || TYPES.page;
    return '<a class="gs-option" href="' + esc(safeUrl(it.url)) + '"' + (id ? ' id="' + id + '"' : '') + (role ? ' role="option"' : '') + '>' +
      '<span class="gs-icon" aria-hidden="true">' + type.icon + '</span>' +
      '<span class="gs-text"><span class="gs-title">' + esc(it.title) + '</span>' +
      '<span class="gs-sub">' + esc(subtitle(it)) + '</span></span></a>';
  }

  // ---------------------------------------------------------------- dropdown
  function initStrip(root) {
    var form = root.querySelector('form');
    var input = root.querySelector('input[type="search"]');
    var panel = root.querySelector('.gs-results');
    var status = root.querySelector('.gs-status');
    if (!form || !input || !panel) return;
    var active = -1;
    var options = [];
    var seq = 0;

    function setExpanded(open) {
      panel.hidden = !open;
      input.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) { active = -1; input.removeAttribute('aria-activedescendant'); }
    }
    function highlight(i) {
      options.forEach(function (o, n) { o.classList.toggle('is-active', n === i); o.setAttribute('aria-selected', n === i ? 'true' : 'false'); });
      active = i;
      if (i >= 0 && options[i]) {
        input.setAttribute('aria-activedescendant', options[i].id);
        options[i].scrollIntoView({block: 'nearest'});
      } else input.removeAttribute('aria-activedescendant');
    }
    function render(query) {
      var mine = ++seq;
      var q = query.trim();
      if (normalise(q).length < MIN_CHARS) { panel.innerHTML = ''; options = []; setExpanded(false); status.textContent = ''; return; }
      loadIndex().then(function (items) {
        if (mine !== seq) return;
        var all = search(items, q);
        var html = '';
        var shown = 0;
        var n = 0;
        if (!all.length) {
          html = '<p class="gs-empty">No INDEX:80 results for “' + esc(q) + '”.</p>';
        } else {
          grouped(all).forEach(function (g) {
            if (shown >= DROPDOWN_MAX) return;
            var take = g.results.slice(0, Math.min(PER_GROUP_MAX, DROPDOWN_MAX - shown));
            shown += take.length;
            html += '<div class="gs-group" role="group" aria-label="' + esc(g.label) + '"><p class="gs-group-label" aria-hidden="true">' + esc(g.label) + ' <span>' + g.results.length + '</span></p>' +
              take.map(function (r) { return resultHtml(r.item, 'gs-opt-' + (n++), true); }).join('') + '</div>';
          });
        }
        html += '<a class="gs-option gs-all" id="gs-opt-' + (n++) + '" role="option" href="/search/?q=' + encodeURIComponent(q) + '">' +
          (all.length ? 'View all ' + all.length + ' result' + (all.length === 1 ? '' : 's') + ' →' : 'Open search page →') + '</a>';
        panel.innerHTML = html;
        options = Array.prototype.slice.call(panel.querySelectorAll('[role="option"]'));
        options.forEach(function (o) { o.setAttribute('aria-selected', 'false'); });
        active = -1;
        setExpanded(true);
        status.textContent = all.length ? all.length + ' result' + (all.length === 1 ? '' : 's') + ' available. Use the arrow keys to browse.' : 'No results.';
      }).catch(function () {
        if (mine !== seq) return;
        panel.innerHTML = '<p class="gs-empty">Search is unavailable right now. Press Enter to open the search page.</p>';
        options = [];
        setExpanded(true);
      });
    }

    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { render(input.value); }, 90);
    });
    input.addEventListener('focus', function () { loadIndex(); if (normalise(input.value).length >= MIN_CHARS && panel.innerHTML) setExpanded(true); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (panel.hidden) { if (normalise(input.value).length >= MIN_CHARS) render(input.value); return; }
        e.preventDefault();
        if (!options.length) return;
        var next = e.key === 'ArrowDown' ? active + 1 : active - 1;
        if (next < 0) next = options.length - 1;
        if (next >= options.length) next = 0;
        highlight(next);
      } else if (e.key === 'Enter') {
        if (!panel.hidden && active >= 0 && options[active]) { e.preventDefault(); window.location.href = options[active].getAttribute('href'); }
        // otherwise the form submits to /search/?q=
      } else if (e.key === 'Escape') {
        if (!panel.hidden) { e.preventDefault(); setExpanded(false); }
      }
    });
    form.addEventListener('submit', function (e) {
      if (!input.value.trim()) { e.preventDefault(); input.focus(); }
    });
    document.addEventListener('pointerdown', function (e) { if (!root.contains(e.target)) setExpanded(false); });
    root.addEventListener('focusout', function (e) { if (e.relatedTarget && !root.contains(e.relatedTarget)) setExpanded(false); });
    panel.addEventListener('mousemove', function (e) {
      var o = e.target.closest && e.target.closest('[role="option"]');
      if (o) highlight(options.indexOf(o));
    });
  }

  // ------------------------------------------------------------ /search/ page
  function initPage(container, stripInput) {
    var q = new URLSearchParams(window.location.search).get('q') || '';
    var heading = document.getElementById('search-query-title');
    var summary = document.getElementById('search-summary');
    if (stripInput && !stripInput.value) stripInput.value = q;
    if (q) document.title = 'Search: ' + q + ' — INDEX:80 / CARDANO';
    if (!q.trim()) {
      if (heading) heading.textContent = 'SEARCH INDEX:80';
      if (summary) summary.textContent = 'Search projects, people, organisations, tags, tickers, governance and Learn topics.';
      container.innerHTML = '';
      return;
    }
    if (heading) heading.textContent = 'RESULTS FOR “' + q + '”';
    loadIndex().then(function (items) {
      var all = search(items, q);
      if (!all.length) {
        if (summary) summary.textContent = 'No results.';
        container.innerHTML = '<div class="search-empty"><p><strong>No INDEX:80 results for “' + esc(q) + '”.</strong></p>' +
          '<p>Try a project, person, organisation, token, pool ticker or topic — or browse the <a href="/">Projects</a> and <a href="/people/">People</a> directories.</p>' +
          '<p>Missing something? <a href="/submit/">Suggest a project or correction</a>.</p></div>';
        return;
      }
      var groups = grouped(all);
      if (summary) summary.textContent = all.length + ' result' + (all.length === 1 ? '' : 's') + ' · ' + groups.map(function (g) { return g.label + ' ' + g.results.length; }).join(' · ');
      container.innerHTML = groups.map(function (g) {
        return '<section class="search-group" aria-labelledby="search-group-' + g.key + '"><h2 id="search-group-' + g.key + '">' + esc(g.label) + ' <span>' + g.results.length + '</span></h2>' +
          '<div class="search-group-list">' + g.results.map(function (r) { return resultHtml(r.item, '', false); }).join('') + '</div></section>';
      }).join('');
    }).catch(function () {
      if (summary) summary.textContent = 'Search is unavailable right now. Please try again.';
    });
  }

  // Read-only hooks for scripts/test-global-search.mjs (no page behaviour).
  window.INDEX80Search = {normalise: normalise, prepare: prepare, search: search, grouped: grouped, MIN_CHARS: MIN_CHARS};

  function init() {
    var strip = document.querySelector('[data-global-search]');
    if (strip) initStrip(strip);
    var page = document.querySelector('[data-search-page]');
    if (page) initPage(page, strip && strip.querySelector('input[type="search"]'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

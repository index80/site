#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');

function mainInner(name) {
  const html = readFileSync(join(PUBLIC, name, 'index.html'), 'utf8');
  const match = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (!match) throw new Error(`Could not extract <main> from /${name}/`);
  return match[1].trim();
}

const staticNav = `      <a href="/">▦ Projects</a>
      <a href="/people/">◎ People</a>
      <a href="/data/">▥ Data</a>
      <a href="/learn/">▤ Learn</a>
      <a href="/governance/">⌂ Governance</a>
      <a href="/about/">◇ About</a>
      <a href="/registry/">▣ Registry</a>
      <a href="/submit/">✎ Submit</a>`;
const footerNav = `      <a href="/">▦ Projects</a>
      <a href="/people/">◎ People</a>
      <a href="/data/">▥ Data</a>
      <a href="/learn/">▤ Learn</a>
      <a href="/governance/">⌂ Governance</a>
      <a href="/about/">◇ About</a>
      <a href="/registry/">▣ Registry</a>
      <a href="/submit/">✎ Submit</a>`;
// Explore is three sibling AROS windows (one per imported section), sharing
// the Explore Room accent. Existing .panel cards stay as the small windows
// inside each; behaviour comes from the generic assets/js/ui-windows.js.
function exploreWindow(id, label, title, content) {
  return `    <section class="panel os-window explore-window" data-window="explore-${id}" data-room="explore">
      <div class="os-titlebar-heading"><button type="button" class="os-titlebar" aria-expanded="true" aria-controls="explore-${id}-body"><span class="os-gadget os-gadget-close" aria-hidden="true"></span><span class="os-title">INDEX:80 · /${title}</span><span class="os-gadget os-gadget-toggle" aria-hidden="true"></span><span class="visually-hidden"> — show or hide ${label}</span></button></div>
      <div class="os-window-body" id="explore-${id}-body">
    <section id="${id}" class="explore-subpage explore-${id}" aria-label="${label}">
      <div class="page-grid single-column">
${content}
      </div>
    </section>
      </div>
    </section>`;
}

const learn = mainInner('learn');
const governance = mainInner('governance');
const data = mainInner('data');

const html = "<!doctype html>\n<html lang=\"en\">\n<head>\n  <script src=\"/assets/js/analytics.js\"></script>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <meta name=\"description\" content=\"Explore INDEX:80 learning, Cardano governance and current public data in one place.\">\n  <title>Explore — INDEX:80 / CARDANO</title>\n  <link rel=\"canonical\" href=\"https://index80.com/explore/\">\n  <link rel=\"icon\" type=\"image/svg+xml\" href=\"../assets/icons/favicon.svg\">\n  <link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"../assets/icons/favicon-32.png\">\n  <link rel=\"apple-touch-icon\" href=\"../assets/icons/apple-touch-icon.png\">\n  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n  <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n  <link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap\">\n  <script src=\"../assets/js/theme.js\"></script>\n  <link rel=\"stylesheet\" href=\"../assets/css/site.css\">\n  <script type=\"application/ld+json\">{\n    \"@context\":\"https://schema.org\",\n    \"@type\":\"CollectionPage\",\n    \"@id\":\"https://index80.com/explore/\",\n    \"url\":\"https://index80.com/explore/\",\n    \"name\":\"Explore — INDEX:80 / CARDANO\",\n    \"description\":\"INDEX:80 learning, Cardano governance and current public data in one consolidated Explore page.\",\n    \"isPartOf\":{\"@type\":\"WebSite\",\"name\":\"INDEX:80 / CARDANO\",\"url\":\"https://index80.com/\"},\n    \"hasPart\":[\n      {\"@type\":\"WebPage\",\"name\":\"Learn\",\"url\":\"https://index80.com/learn/\"},\n      {\"@type\":\"WebPage\",\"name\":\"Governance\",\"url\":\"https://index80.com/governance/\"},\n      {\"@type\":\"WebPage\",\"name\":\"Data\",\"url\":\"https://index80.com/data/\"}\n    ]\n  }</script>\n</head>\n<body data-mode=\"explore\" data-page=\"explore\">\n  <a class=\"skip-link\" href=\"#main\">Skip to content</a>\n\n  <div class=\"system-bar\">\n    <span class=\"system-slogan\">A MORE OPEN INTERNET, A BRIGHTER TOMORROW.</span>\n    <span class=\"system-status\"><span class=\"status-dot\"></span> INDEX:80 ONLINE</span>\n  </div>\n\n  <header class=\"site-header\">\n    <div class=\"brand-row\">\n      <a class=\"wordmark\" href=\"/\" aria-label=\"INDEX:80 home\"><span>INDEX:</span><b>80</b></a>\n      <span class=\"network-label\">/EXPLORE</span>\n    </div>\n    <nav class=\"main-nav\" aria-label=\"Primary\">\n      <a href=\"/\">▦ Projects</a>\n      <a href=\"/people/\">◎ People</a>\n      <a href=\"/data/\">▥ Data</a>\n      <a href=\"/learn/\">▤ Learn</a>\n      <a href=\"/governance/\">⌂ Governance</a>\n      <a href=\"/about/\">◇ About</a>\n      <a href=\"/registry/\">▣ Registry</a>\n      <a href=\"/submit/\">✎ Submit</a>\n    </nav>\n  </header>\n\n  <!-- INDEX80_GLOBAL_SEARCH_START -->\n  <div class=\"global-search\" data-global-search>\n    <form class=\"search-box global-search-box\" role=\"search\" action=\"/search/\" method=\"get\" aria-label=\"Search INDEX:80\">\n      <label class=\"global-search-label\" for=\"global-search-input\"><span aria-hidden=\"true\">&gt;</span><span class=\"global-search-label-text\"> SEARCH INDEX:80</span></label>\n      <input id=\"global-search-input\" name=\"q\" type=\"search\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" enterkeyhint=\"search\" placeholder=\"Projects, people, organisations, tags, governance…\" role=\"combobox\" aria-autocomplete=\"list\" aria-expanded=\"false\" aria-controls=\"global-search-results\" aria-describedby=\"global-search-hint\">\n    </form>\n    <div id=\"global-search-results\" class=\"gs-results\" role=\"listbox\" aria-label=\"Search suggestions\" hidden></div>\n    <p id=\"global-search-hint\" class=\"visually-hidden\">Type at least two characters for suggestions. Use the arrow keys to choose one, or press Enter to see all results.</p>\n    <p class=\"gs-status visually-hidden\" aria-live=\"polite\"></p>\n  </div>\n  <script src=\"/assets/js/site-search.js\" defer></script>\n  <!-- INDEX80_GLOBAL_SEARCH_END -->\n\n  <main id=\"main\" class=\"page-grid single-column explore-page\">\n__WINDOWS__  </main>\n\n  <footer class=\"site-footer\">\n    <nav class=\"footer-nav\" aria-label=\"Secondary\">\n      <a href=\"/\">▦ Projects</a>\n      <a href=\"/people/\">◎ People</a>\n      <a href=\"/data/\">▥ Data</a>\n      <a href=\"/learn/\">▤ Learn</a>\n      <a href=\"/governance/\">⌂ Governance</a>\n      <a href=\"/about/\">◇ About</a>\n      <a href=\"/registry/\">▣ Registry</a>\n      <a href=\"/submit/\">✎ Submit</a>\n    </nav>\n    <div class=\"footer-meta\">\n      <span class=\"footer-brand\">INDEX:<b>80</b> /CARDANO</span>\n      <span>OPEN LINKS · OPEN DATA · SOURCED INFORMATION</span>\n      <button type=\"button\" class=\"footer-consent-toggle\" data-consent-toggle>Cookie preferences</button>\n    </div>\n  </footer>\n\n  <script src=\"../assets/js/main.js\" defer></script>\n  <script src=\"../assets/js/treasury-rule.js\" defer></script>\n  <script src=\"../assets/js/directory.js\" defer></script>\n</body>\n</html>\n"
  .replace('__WINDOWS__', [
    exploreWindow('learn', 'Learn', 'LEARN', learn),
    exploreWindow('governance', 'Governance', 'GOVERNANCE', governance),
    exploreWindow('data', 'Data', 'DATA', data),
  ].join('\n\n') + '\n');

const dir = join(PUBLIC, 'explore');
mkdirSync(dir, { recursive:true });
writeFileSync(join(dir, 'index.html'), html, 'utf8');
console.log('[generate-explore-page] wrote /explore/ from Learn → Governance → Data');

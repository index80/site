#!/usr/bin/env node
// Sprint 2 product-clarity guardrails. Semantic checks, not locked marketing
// prose: the homepage proposition and one collapsible OS window (counts,
// shortcuts, one trust line) exist complete and open in static HTML; the
// window toggle persists only a versioned local UI preference; WHAT'S CURRENT counts and dates come from the governed datasets (never
// the build clock); no fake change feed; and public provenance wording never
// claims team/subject confirmation that no published field supports.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { currentStateBody } from './generate-home-directory.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public_html');
const read = (...p) => readFileSync(join(PUBLIC, ...p), 'utf8');
const json = (...p) => JSON.parse(read(...p));
const failures = [];
const ok = (cond, label) => { if (!cond) failures.push(label); };
const text = (html) => html.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const HOME = read('index.html');
const projectsData = json('data', 'projects.json');
const peopleData = json('data', 'people.json');
const registryIndex = json('registry', 'index.json');
const listed = (projectsData.projects || []).filter((p) => p.slug && p.name && p.summary && p.category && p.status && p.status !== 'archived');
const people = peopleData.people || [];

ok(!/have not yet passed independent verification/i.test(String(projectsData.warning || '')), 'public projects warning does not contradict the publication test');
ok(/human editorial review for publication/i.test(String(projectsData.warning || '')) && /workflow\/maturity metadata/i.test(String(projectsData.warning || '')), 'public projects warning explains status as workflow/maturity metadata');
// Config.gs is the private Editorial Registry generator config: it exists in the
// private repo (where this assertion always runs) and is intentionally absent
// from the public export, where only this one assertion is skipped.
const REGISTRY_CONFIG_PATH = join(ROOT, 'apps-script', 'editorial-registry', 'Config.gs');
if (existsSync(REGISTRY_CONFIG_PATH)) {
  const REGISTRY_CONFIG = readFileSync(REGISTRY_CONFIG_PATH, 'utf8');
  ok(/PUBLIC_DATASET_WARNING:[\s\S]*human editorial review for publication[\s\S]*workflow\/maturity metadata/i.test(REGISTRY_CONFIG), 'Registry generator public warning matches the publication semantics');
}
const PRIVACY = read('privacy', 'index.html');
ok(/display preferences[^.]*theme[^.]*collapsed windows/i.test(text(PRIVACY)), 'privacy policy documents local theme and collapsed-window preferences');

// 1. Proposition, one OS window (counts + shortcuts + one trust line), then the directory.
const hero = HOME.match(/<section class="panel os-window home-hero-window" data-window="home-hero"[\s\S]*?<\/section>/)?.[0] || '';
const proposition = hero.match(/<p class="home-proposition">([^<]+)<\/p>/)?.[1] || '';
ok(proposition.length > 20 && /Cardano/.test(proposition), 'homepage hero has a static proposition naming Cardano');
ok(!/\bverified\b/i.test(text(hero)), 'homepage hero avoids generic "verified" wording');
const windowHtml = HOME.match(/<section class="panel os-window[^"]*" data-window="home-current"[\s\S]*?<\/section>/)?.[0] || '';
ok(windowHtml, 'homepage has one data-window OS frame');
const windowIds = [...HOME.matchAll(/data-window="([^"]+)"/g)].map((m) => m[1]);
ok(JSON.stringify(windowIds) === JSON.stringify(['home-hero', 'home-current', 'home-directory']), `homepage OS windows are hero, WHAT'S CURRENT, directory (got ${windowIds.join(', ')})`);

// 1a. §8D: generic OS-window contract for every window on the two directory
// pages — a real title-bar <button> (aria-expanded="true", aria-controls) and
// a body that exists and is open (not hidden) in static HTML.
function windowsOf(html) {
  return [...html.matchAll(/<section class="panel os-window[^"]*"[^>]*data-window="([^"]+)"[\s\S]*?(?=\n    <section |\n  <\/main>)/g)].map((m) => ({ id: m[1], html: m[0] }));
}
function checkWindow(page, w) {
  const btn = w.html.match(/<button type="button" class="os-titlebar" aria-expanded="true" aria-controls="([^"]+)">/);
  ok(btn, `${page} ${w.id}: title bar is a <button> with aria-expanded="true"`);
  const body = btn && w.html.match(new RegExp(`<div class="os-window-body" id="${btn[1]}"[^>]*>`))?.[0];
  ok(body && !/\shidden\b/.test(body), `${page} ${w.id}: body is controlled by the title bar and open in static HTML`);
  ok(/os-gadget-toggle/.test(w.html), `${page} ${w.id}: has the state gadget`);
  return { body: btn ? w.html.slice(w.html.indexOf(`id="${btn[1]}"`)) : '' };
}
const homeWindows = Object.fromEntries(windowsOf(HOME).map((w) => [w.id, { ...w, ...checkWindow('home', w) }]));
// Whole hero: copy, proposition, actions and artwork all inside the one body.
const heroBody = homeWindows['home-hero']?.body || '';
for (const part of ['class="home-proposition"', '<h1>', 'class="actions"', 'index80-hero-home.webp', 'class="terminal"']) {
  ok(heroBody.includes(part), `hero window body contains ${part}`);
}
ok(!/hero-art-window|home-hero-art/.test(HOME), 'the §8C art-only window is gone');
// Directory: existing heading + live count are the title bar; everything else in the body.
const dirWin = homeWindows['home-directory'];
ok(dirWin && /<h2 class="os-titlebar-heading"><button[^>]*>[\s\S]*?<span class="os-title" id="directory-title">DIRECTORY<\/span> <span id="directory-count" class="directory-count">\d+ RECORDS<\/span>/.test(dirWin.html), 'directory title bar reuses the DIRECTORY heading and live count (no duplicate heading)');
ok((HOME.match(/>DIRECTORY</g) || []).length === 1, 'DIRECTORY heading appears once');
for (const part of ['id="category-bar"', 'class="dir-head"', 'id="directory-list"', '<!-- INDEX80_DIRECTORY_START -->', '<!-- INDEX80_DIRECTORY_END -->']) {
  ok(dirWin?.body.includes(part), `directory window body contains ${part}`);
}
ok(/<section class="panel os-window directory" id="directory"[^>]*data-directory[^>]*aria-labelledby="directory-title"/.test(HOME), 'directory section keeps id, data-directory hook and its accessible name');

// People directory page: hero + directory windowed; the beta disclosure never collapses.
const PEOPLE = read('people', 'index.html');
const peopleWindows = Object.fromEntries(windowsOf(PEOPLE).map((w) => [w.id, { ...w, ...checkWindow('people', w) }]));
ok(JSON.stringify(Object.keys(peopleWindows)) === JSON.stringify(['people-hero', 'people-directory']), `People OS windows are hero and directory (got ${Object.keys(peopleWindows).join(', ')})`);
ok(/<section class="panel people-beta-notice" role="note"/.test(PEOPLE) && !/data-window="[^"]*"[^>]*people-beta|people-beta-notice[^>]*data-window/.test(PEOPLE), 'PUBLIC BETA notice stays a permanent, non-collapsible frame');
ok(PEOPLE.indexOf('people-beta-notice') < PEOPLE.indexOf('data-window="people-hero"'), 'PUBLIC BETA notice stays above the windows');
ok((peopleWindows['people-hero']?.body || '').includes('id="people-hero-title"'), 'People hero heading lives inside its window body');
ok(/<span class="os-title" id="people-directory-title">PEOPLE DIRECTORY<\/span> <span id="people-directory-count" class="directory-count">\d+ RECORDS<\/span>/.test(PEOPLE), 'People directory title bar reuses its heading and live count');
for (const part of ['id="people-category-bar"', 'id="people-list"', '<!-- INDEX80_PEOPLE_DIRECTORY_START -->', 'dir-badge-checked']) {
  ok(peopleWindows['people-directory']?.body.includes(part), `People directory window body contains ${part}`);
}
// Scope: only the two directory pages, no record pages yet.
for (const page of ['submit']) ok(!read(page, 'index.html').includes('data-window="'), `no OS windows on /${page}/ in this experiment`);
// About: five sibling AROS windows in the About Room; every existing panel
// stays inside the right window, unchanged and not itself an OS frame.
const ABOUT = read('about', 'index.html');
const ABOUT_WINDOWS = [
  { id: 'about-overview', title: 'ABOUT', panels: ['<section class="panel hero-panel section-hero compact-hero">', '<section class="panel shell-panel" id="independent-open-source">'] },
  { id: 'about-method', title: 'METHOD', panels: ['<section class="panel methodology">', '<section class="panel shell-panel editorial-system" id="editorial-system"'] },
  { id: 'about-support', title: 'SUPPORT', panels: ['<section class="panel support-panel">', '<section class="panel shell-panel donation-options" id="donate"'] },
  { id: 'about-builder', title: 'WHO BUILDS THIS', panels: ['<section class="panel founder-panel">'] },
  { id: 'about-future', title: 'LOOKING AHEAD', panels: ['<section class="panel shell-panel" aria-labelledby="looking-ahead-title">'] },
];
const aboutIds = [...ABOUT.matchAll(/<section [^>]*data-window="([^"]+)"/g)].map((m) => m[1]);
ok(JSON.stringify(aboutIds) === JSON.stringify(ABOUT_WINDOWS.map((w) => w.id)), `About has exactly five sibling OS windows in order (got ${aboutIds.join(', ')})`);
ok((ABOUT.match(/data-room="about"/g) || []).length === 5, 'Every About AROS frame declares the About Room');
const aboutMain = ABOUT.match(/<main id="main" class="page-grid single-column">([\s\S]*)<\/main>/)?.[1] || '';
ok(aboutMain.trimStart().startsWith('<section class="panel os-window about-section-window" data-window="about-overview"'), 'About <main> starts with the About window (no outer wrapper)');
ABOUT_WINDOWS.forEach((w, i) => {
  const start = aboutMain.indexOf(`data-window="${w.id}"`);
  const endMarker = `</section><!-- /[data-window="${w.id}"] -->`;
  const end = aboutMain.indexOf(endMarker);
  ok(start >= 0 && end > start, `${w.id}: window opens and closes`);
  if (start < 0 || end < 0) return;
  const seg = aboutMain.slice(aboutMain.lastIndexOf('<section', start), end + endMarker.length);
  checkWindow('about', { id: w.id, html: seg });
  ok(seg.includes(`<span class="os-title" id="${w.id}-window-title">INDEX:80 · /${w.title}</span>`), `${w.id}: title bar reads INDEX:80 · /${w.title}`);
  ok((seg.match(/class="panel os-window/g) || []).length === 1, `${w.id}: sibling window, no nested AROS frame`);
  for (const panel of w.panels) ok(seg.includes(panel), `${w.id}: contains existing panel ${panel.slice(0, 60)}`);
  ok((seg.match(/<section class="panel(?! os-window)/g) || []).length === w.panels.length, `${w.id}: keeps exactly its existing panels`);
  if (i < ABOUT_WINDOWS.length - 1) ok(aboutMain.indexOf(`data-window="${ABOUT_WINDOWS[i + 1].id}"`) > end, `${w.id}: closes before the next window opens`);
});
// Stripe colours come only from the shared positional rotation: the five
// windows are direct siblings in <main>, with no per-window colour styling.
ok((aboutMain.match(/\n    <section class="panel os-window about-section-window"/g) || []).length === 5, 'About windows are direct <main> siblings, so the shared 5-colour stripe rotation applies');
ok(!ABOUT.includes('--window-stripe') && !/class="[^"]*os-window[^"]*"[^>]*\sstyle=/.test(ABOUT), 'About assigns no per-window stripe colours');
for (const anchor of ['independent-open-source', 'editorial-system', 'donate', 'wallet-cardano', 'wallet-bitcoin', 'wallet-midnight']) {
  ok((ABOUT.match(new RegExp(`id="${anchor}"`, 'g')) || []).length === 1, `About #${anchor} preserved once`);
}
const registryPage = read('registry', 'index.html');
const registryWindowIds = [...registryPage.matchAll(/data-window="([^"]+)" data-room="registry"/g)].map((match) => match[1]);
ok(JSON.stringify(registryWindowIds) === JSON.stringify(['registry-history', 'registry-changes', 'registry-verify', 'registry-wallet-window', 'registry-data']), 'Registry has exactly five sibling OS windows in the expected order');
ok(registryWindowIds.length === 5 && (registryPage.match(/data-room="registry"/g) || []).length === 5, 'Every Registry AROS frame declares the Registry Room accent');
for (const dir of ['projects', 'people']) {
  for (const slug of readdirSync(join(PUBLIC, dir))) {
    const f = join(PUBLIC, dir, slug, 'index.html');
    if (existsSync(f) && readFileSync(f, 'utf8').includes('data-window="')) failures.push(`${dir}/${slug}: record pages are not windowed yet`);
  }
}
ok(!/home-routes|home-trust/.test(HOME), 'the separate WHERE TO GO and trust blocks are gone');
const shortcuts = windowHtml.match(/<nav class="os-shortcuts" aria-label="Shortcuts">([\s\S]*?)<\/nav>/)?.[1] || '';
const shortcutHrefs = [...shortcuts.matchAll(/<a class="os-shortcut" href="([^"]+)"/g)].map((m) => m[1]);
ok(JSON.stringify(shortcutHrefs) === JSON.stringify(['/explore/', '/about/methodology/', '/registry/', '/submit/']), `static shortcuts are Explore, Methodology, Registry, Submit (got ${shortcutHrefs.join(', ')})`);
ok((shortcuts.match(/<svg class="icon" aria-hidden="true"><use href="assets\/icons\/icons.svg#icon-os-[a-z]+"><\/use><\/svg>/g) || []).length === 4, 'each shortcut is icon-led (decorative icon, text label)');
const sprite = read('assets', 'icons', 'icons.svg');
for (const m of shortcuts.matchAll(/#(icon-os-[a-z]+)/g)) ok(sprite.includes(`<symbol id="${m[1]}"`), `sprite defines ${m[1]}`);
ok((windowHtml.match(/href="\/people\/"/g) || []).length === 1 && (windowHtml.match(/href="#directory"/g) || []).length === 1, 'Projects/People are linked once, from their counts, not repeated as route buttons');
const statusLines = windowHtml.match(/<p class="os-statusline">[\s\S]*?<\/p>/g) || [];
ok(statusLines.length === 1, 'exactly one trust/provenance line');
const trust = statusLines[0] || '';
ok(trust.includes('href="/about/methodology/#evidence"'), 'trust line links to Methodology');
ok(/not (?:an )?endorsements?/i.test(trust) && /not (?:been )?confirmed by the teams or people/i.test(trust), 'trust line separates INDEX:80 checks from endorsement and confirmation');
ok(/DATA\b[^.]*dataset publish date/i.test(trust), 'DATA dates are explained as dataset publish dates, not per-record re-checks');
ok(text(trust).length < 320, 'trust line stays short');
const order = ['data-window="home-hero"', 'data-window="home-current"', 'data-window="home-directory"'].map((m) => HOME.indexOf(m));
ok(order.every((i) => i >= 0) && order.every((i, n) => n === 0 || i > order[n - 1]), 'homepage order: proposition → OS window → directory');

// 1b. Collapsible window: complete and open in static HTML, accessible control.
const titlebar = windowHtml.match(/<h2 class="os-titlebar-heading"[^>]*><button type="button" class="os-titlebar" aria-expanded="true" aria-controls="([^"]+)">/);
ok(titlebar, 'title bar is a real <button> inside the heading, aria-expanded="true" by default');
const bodyTag = titlebar && windowHtml.match(new RegExp(`<div class="os-window-body" id="${titlebar[1]}"[^>]*>`))?.[0];
ok(bodyTag && !/\shidden\b/.test(bodyTag), 'window body is controlled by the title bar and open (not hidden) in static HTML');
ok(/os-gadget-toggle/.test(windowHtml), 'title bar carries a visual state gadget');
const loader = read('assets', 'js', 'main.js');
ok(/querySelector\('\[data-window\]'\)[\s\S]{0,80}load\('\/assets\/js\/ui-windows\.js'\)/.test(loader), 'main.js loads ui-windows.js only where a [data-window] frame exists');

// 2. No fake change feed before Sprint 3's structured change ledger.
ok(!/recent(ly)?[\s-]+(changes?|updated|updates|activity)|what changed/i.test(text(HOME)), 'homepage has no Recent Changes / Recently Updated feed');

// 3. WHAT'S CURRENT counts and dates are tied to governed data.
const current = HOME.slice(HOME.indexOf('<!-- INDEX80_CURRENT_STATE_START -->'), HOME.indexOf('<!-- INDEX80_CURRENT_STATE_END -->'));
const strong = [...current.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
ok(strong[0] === String(listed.length), `projects count ${strong[0]} = ${listed.length}`);
ok(strong[1] === String(people.length), `people count ${strong[1]} = ${people.length}`);
ok(strong[2] === String(listed.filter((p) => p.category === 'governance').length), 'governance count matches projects.json');
ok(strong[3] === registryIndex.latest_release_id, 'registry tile shows the latest release id');
const times = [...current.matchAll(/<time datetime="([^"]+)">/g)].map((m) => m[1]);
const latest = registryIndex.releases.find((r) => r.release_id === registryIndex.latest_release_id);
const expectedTimes = [String(projectsData.generated_at).slice(0, 10), String(peopleData.generated).slice(0, 10), String(projectsData.generated_at).slice(0, 10), latest?.proof?.confirmation_observed?.date].filter(Boolean);
ok(JSON.stringify(times) === JSON.stringify(expectedTimes), `WHAT'S CURRENT dates come from the datasets (got ${times.join(', ')}; expected ${expectedTimes.join(', ')})`);

// 4. A missing dataset date is shown as undated, never replaced with the build date.
const undated = currentStateBody(listed.slice(0, 2), people.slice(0, 1), {latest_release_id:'INDEX80-TEST', releases:[]}, {});
ok(!/<time /.test(undated) && (undated.match(/DATA UNDATED/g) || []).length === 3 && undated.includes('MAINNET PROOF · SEE REGISTRY'), 'missing dates render UNDATED / SEE REGISTRY, not an invented date');
ok(!currentStateBody([], [], {releases:[]}, {projects:'not-a-date'}).includes('<time '), 'malformed dataset date is not rendered as a date');

// 5. Explore hero summarises Learn → Governance → Data and has its own artwork.
const EXPLORE = read('explore', 'index.html');
const exploreHero = EXPLORE.match(/<section class="panel hero-panel section-hero[\s\S]*?<\/section>/)?.[0] || '';
const exploreCopy = text(exploreHero.split('class="hero-art')[0]);
ok(/\bLEARN\b|\bconcepts?\b/i.test(exploreCopy) && /governance/i.test(exploreCopy) && /\bdata\b/i.test(exploreCopy), 'Explore hero names Learn/concepts, Governance and Data');
const exploreImg = exploreHero.match(/<img src="[^"]*\/([^"/]+)"/)?.[1] || '';
const aboutImg = read('about', 'index.html').match(/class="hero-art[^"]*">\s*<img src="[^"]*\/([^"/]+)"/)?.[1] || '';
ok(exploreImg === 'index80-hero-explore.webp', `Explore hero uses the approved dedicated artwork (got ${exploreImg})`);
ok(exploreImg && exploreImg !== aboutImg && exploreImg !== 'index80-hero-learn.webp', `Explore hero art is dedicated, not the About/Learn duplicate (got ${exploreImg})`);
ok(exploreImg && existsSync(join(PUBLIC, 'assets', 'images', exploreImg)), 'Explore hero image file exists');

// 5b. Explore: three sibling AROS windows (Learn, Governance, Data), all in
// the Explore Room. Each holds its imported section unchanged; the existing
// .panel cards stay as the small windows inside (never new OS frames).
const EXPLORE_WINDOWS = [
  { id: 'explore-learn', section: 'learn', title: 'LEARN', anchors: ['learn', 'topics'] },
  { id: 'explore-governance', section: 'governance', title: 'GOVERNANCE', anchors: ['governance', 'directory'] },
  { id: 'explore-data', section: 'data', title: 'DATA', anchors: ['data'] },
];
const exploreFrames = [...EXPLORE.matchAll(/data-window="([^"]+)"/g)].map((m) => m[1]);
ok(JSON.stringify(exploreFrames) === JSON.stringify(EXPLORE_WINDOWS.map((w) => w.id)), `Explore has exactly three OS windows in order explore-learn, explore-governance, explore-data (got ${exploreFrames.join(', ')})`);
ok(!EXPLORE.includes('explore-main'), 'The single explore-main wrapper is gone');
const exploreMain = EXPLORE.match(/<main id="main" class="explore-page">([\s\S]*)<\/main>/)?.[1] || '';
const windowStart = (id) => exploreMain.indexOf(`<section class="panel os-window explore-window" data-window="${id}" data-room="explore">`);
ok(exploreMain.trimStart().startsWith('<section class="panel os-window explore-window" data-window="explore-learn"'), 'Explore <main> starts with the Learn window');
let exploreHeroWindow = '';
EXPLORE_WINDOWS.forEach((w, i) => {
  const start = windowStart(w.id);
  ok(start >= 0, `${w.id}: declares data-room="explore"`);
  if (start < 0) return;
  const next = EXPLORE_WINDOWS[i + 1] ? windowStart(EXPLORE_WINDOWS[i + 1].id) : exploreMain.length;
  const seg = exploreMain.slice(start, next).trimEnd();
  checkWindow('explore', { id: w.id, html: seg });
  ok(seg.includes(`aria-controls="${w.id}-body"`) && seg.includes(`<div class="os-window-body" id="${w.id}-body">`), `${w.id}: title bar controls #${w.id}-body`);
  ok(seg.includes(`<span class="os-title">INDEX:80 · /${w.title}</span>`), `${w.id}: title bar reads INDEX:80 · /${w.title}`);
  // Siblings, not nested: one OS frame per segment, closed before the next one starts.
  ok((seg.match(/class="panel os-window/g) || []).length === 1 && seg.endsWith('</div>\n    </section>'), `${w.id}: is a self-contained sibling window (no nested AROS frames)`);
  for (const anchor of w.anchors) ok(seg.includes(`id="${anchor}"`), `${w.id}: contains #${anchor}`);
  // Nothing deleted: the imported subpage <main> is present verbatim in its own window.
  const inner = read(w.section, 'index.html').match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1].trim() || '';
  ok(inner && seg.includes(inner), `${w.id}: contains the full /${w.section}/ content`);
  const innerPanels = (inner.match(/class="panel[\s"]/g) || []).length;
  ok(innerPanels > 0 && (seg.match(/class="panel[\s"]/g) || []).length === innerPanels + 1, `${w.id}: keeps every existing small panel and adds none`);
  ok(/<section class="panel hero-panel section-hero/.test(seg), `${w.id}: keeps its section hero`);
  if (seg.includes(exploreHero)) exploreHeroWindow = w.id;
});
ok(exploreHeroWindow === 'explore-learn', `Explore hero/artwork lives in the Learn window (got ${exploreHeroWindow || 'none'})`);

// 6. Public provenance wording never overstates confirmation.
// No public People/Project field records team/subject confirmation yet, so no
// generated profile may claim it; People status reads CHECKED, not Verified.
// Positive claims only: the beta disclaimer "may not yet have been confirmed by
// the person listed" is the correct, cautious wording and must stay allowed.
const OVERSTATE = /facts confirmed by|confirmed by (?:the )?(?:subject|project team)|correction received from/i;
let profiles = 0;
for (const dir of ['people', 'projects']) {
  for (const slug of readdirSync(join(PUBLIC, dir))) {
    const f = join(PUBLIC, dir, slug, 'index.html');
    if (!existsSync(f)) continue;
    const html = readFileSync(f, 'utf8');
    profiles += 1;
    if (OVERSTATE.test(text(html))) failures.push(`${dir}/${slug}: claims confirmation not present in public data`);
    if (dir === 'people' && html.includes('INDEX80_GENERATED_PEOPLE_PROFILE')) {
      if (/Verified against public sources|Partially verified|class="people-meta">[^<]*\bVERIFIED\b/.test(html)) failures.push(`people/${slug}: generic Verified wording on profile`);
      const p = people.find((x) => x.slug === slug);
      const line = html.match(/<p class="people-record-line">([^<]*)/)?.[1] || '';
      if (p?.verification_status === 'VERIFIED' && p.last_verified && !line.startsWith('Independently checked by INDEX:80 — ')) failures.push(`people/${slug}: record line is not "Independently checked by INDEX:80 — [date]"`);
    }
  }
}
ok(profiles > 300, `scanned ${profiles} People/Project pages`);
ok(!OVERSTATE.test(text(read('people', 'index.html'))) && !/>VERIFIED</.test(read('people', 'index.html')), 'People directory makes no confirmation claim and shows CHECKED, not VERIFIED');

// 7. Methodology uses the precise standard and keeps image permission separate.
const METHOD = read('about', 'methodology', 'index.html');
ok(!/People: Verified and Partial|what “verified by INDEX:80” means/i.test(METHOD), 'methodology no longer uses the ambiguous Verified headings');
for (const phrase of ['Independently checked by INDEX:80 — [date]', 'Facts confirmed by project team — [date]', 'Facts confirmed by subject — [date]', 'Correction received from project team — [date]']) {
  ok(METHOD.includes(phrase), `methodology defines: ${phrase}`);
}
ok(/image is tracked separately from factual confirmation/.test(METHOD), 'methodology separates image permission from factual confirmation');

// 8. ui-windows.js behaviour against a minimal DOM stub: open by default,
// applies a saved preference, persists a versioned object, restores, and
// survives corrupt or blocked storage.
const SITE_CSS = read('assets', 'css', 'site.css');
ok(SITE_CSS.includes('--window-accent:var(--accent)'), 'AROS windows expose a generic --window-accent hook');
ok(SITE_CSS.includes('.os-window[data-room="explore"]') && SITE_CSS.includes('.os-window[data-room="registry"]'), 'Explore and Registry define Room-specific titlebar accents');
ok(/\.os-titlebar \{[^}]*\n    linear-gradient\(180deg, color-mix\(in srgb, var\(--window-accent\)/.test(SITE_CSS), 'AROS title-bar base tint still uses the Room accent variable');
// 7b. Rotating stripe accent: shared component only, pinstripe lines only.
ok(/\.os-window \{[^}]*--window-stripe-accent:var\(--window-accent\)/.test(SITE_CSS), 'AROS windows expose --window-stripe-accent, defaulting to the Room accent');
const stripeVars = ['cyan', 'magenta', 'amber', 'purple', 'green'].map((c, i) => `--window-stripe-${i + 1}:var(--${c})`);
ok(stripeVars.every((v) => SITE_CSS.includes(v)), 'Five theme-derived stripe accents: cyan, magenta, amber, violet, green');
for (let i = 1; i <= 5; i += 1) {
  ok(SITE_CSS.includes(`.os-window:nth-child(5n+${i} of .os-window) { --window-stripe-accent:var(--window-stripe-${i}); }`), `sibling AROS window ${i} (mod 5) takes stripe accent ${i}`);
}
const stripeLayers = [...SITE_CSS.matchAll(/repeating-linear-gradient\(180deg, color-mix\(in srgb, var\(--([a-z-]+)\) var\(--window-stripe-strength\), transparent\) 0 2px, transparent 2px 4px\)/g)].map((m) => m[1]);
ok(stripeLayers.length === 2 && stripeLayers.every((v) => v === 'window-stripe-accent'), `light and dark pinstripe layers use --window-stripe-accent (got ${stripeLayers.join(', ') || 'none'})`);
ok(!/\.os-gadget[^{]*\{[^}]*--window-stripe|\.os-title(?![a-z-])[^{]*\{[^}]*--window-stripe|\.os-window-body[^{]*\{[^}]*--window-stripe/.test(SITE_CSS), 'stripe accent never reaches gadgets, title label or window body');
ok(/\.os-window \{[^}]*--window-stripe-strength:/.test(SITE_CSS) && /html\[data-theme="arcade"\] \.os-window \{ --window-stripe-strength:/.test(SITE_CSS), 'WEB 1.0 default and ARCADE tune stripe strength, not colour identity');
for (const [page, html] of [['explore', read('explore', 'index.html')], ['registry', read('registry', 'index.html')]]) {
  ok(!/class="[^"]*os-window[^"]*"[^>]*\sstyle=/.test(html) && !/os-titlebar"[^>]*\sstyle=/.test(html) && !html.includes('--window-stripe'), `${page}: no per-window inline stripe styling`);
}
const UI_JS = read('assets', 'js', 'ui-windows.js');
function runWindows({ stored, storageThrows = false, ids = ['home-hero', 'home-current', 'home-directory'], hash = '', targets = {} } = {}) {
  const store = new Map(stored === undefined ? [] : [['index80_ui_v1', stored]]);
  const localStorage = {
    getItem: (k) => { if (storageThrows) throw new Error('blocked'); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => { if (storageThrows) throw new Error('blocked'); store.set(k, String(v)); },
    removeItem: (k) => { if (storageThrows) throw new Error('blocked'); store.delete(k); },
  };
  const bodies = {};
  const frames = ids.map((id) => {
    const attrs = { 'aria-expanded': 'true', 'aria-controls': `${id}-body` };
    const w = { id, attrs, body: { hidden: false }, classes: new Set(), onClick: null };
    bodies[`${id}-body`] = w.body;
    const button = { getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = String(v); }, addEventListener: (t, fn) => { if (t === 'click') w.onClick = fn; } };
    w.el = { dataset: { window: id }, querySelector: () => button, classList: { toggle: (c, on) => (on ? w.classes.add(c) : w.classes.delete(c)), contains: (c) => w.classes.has(c) } };
    return w;
  });
  const footerChildren = [];
  const footer = { querySelector: () => footerChildren.find((b) => b.dataset.windowReset) || null, appendChild: (el) => { footerChildren.push(el); el.remove = () => footerChildren.splice(footerChildren.indexOf(el), 1); } };
  const document = {
    readyState: 'complete',
    querySelectorAll: (sel) => (sel === '[data-window]' ? frames.map((f) => f.el) : sel === '.footer-meta' ? [footer] : []),
    getElementById: (id) => bodies[id] || (targets[id] ? { closest: () => byIdEl(targets[id]) } : null),
    addEventListener: (t, fn) => { if (t === 'click') listeners.click = fn; },
    createElement: () => { let h = null; return { dataset: {}, addEventListener: (t, fn) => { h = fn; }, click: () => h && h() }; },
  };
  const listeners = {};
  const location = { hash };
  const window = { location, addEventListener: (t, fn) => { if (t === 'hashchange') listeners.hashchange = fn; } };
  const byIdEl = (wid) => frames.find((f) => f.id === wid)?.el || null;
  vm.runInNewContext(UI_JS, { window, document, localStorage });
  const byId = Object.fromEntries(frames.map((f) => [f.id, f]));
  const first = frames.find((f) => f.id === 'home-current') || frames[0];
  const navigate = (h) => { location.hash = h; listeners.hashchange?.(); };
  const clickLink = (href) => listeners.click?.({ target: { closest: () => ({ getAttribute: () => href }) } });
  return { navigate, clickLink, store, footerChildren, w: byId, attrs: first.attrs, body: first.body, classes: first.classes, click: () => first.onClick() };
}
{
  const t = runWindows();
  ok(t.attrs['aria-expanded'] === 'true' && !t.body.hidden && t.footerChildren.length === 0, 'window: open by default with no saved preference, no reset control');
  t.click();
  const saved = JSON.parse(t.store.get('index80_ui_v1') || 'null');
  ok(t.attrs['aria-expanded'] === 'false' && t.body.hidden && t.classes.has('is-collapsed'), 'window: title bar click collapses (aria-expanded=false, body hidden)');
  ok(saved && saved.v === 1 && saved.windows['home-current'].collapsed === true && Object.keys(saved).length === 2, 'window: collapse persists a versioned index80_ui_v1 object of UI state only');
  ok(t.footerChildren.length === 1 && /Restore windows/.test(t.footerChildren[0].textContent), 'window: an obvious Restore control appears while a window is collapsed');
  t.click();
  ok(t.attrs['aria-expanded'] === 'true' && !t.body.hidden && !t.store.has('index80_ui_v1') && t.footerChildren.length === 0, 'window: reopening clears the stored preference and the restore control');
}
{
  const t = runWindows({ stored: JSON.stringify({ v: 1, windows: { 'home-current': { collapsed: true } } }) });
  ok(t.attrs['aria-expanded'] === 'false' && t.body.hidden, 'window: a saved collapsed preference is applied');
  t.footerChildren[0]?.click();
  ok(t.attrs['aria-expanded'] === 'true' && !t.body.hidden && !t.store.has('index80_ui_v1'), 'window: Restore windows reopens everything and clears preferences');
}
for (const [label, stored] of [['corrupt JSON', '{nope'], ['wrong version', JSON.stringify({ v: 99, windows: { 'home-current': { collapsed: true } } })]]) {
  const t = runWindows({ stored });
  ok(t.attrs['aria-expanded'] === 'true' && !t.body.hidden, `window: ${label} preference falls back to open`);
}
{
  const t = runWindows({ storageThrows: true });
  t.click();
  ok(t.attrs['aria-expanded'] === 'false' && t.body.hidden, 'window: toggling still works when storage is blocked');
}

{
  // Two windows: independent persistence; Restore windows reopens both.
  const t = runWindows();
  t.w['home-hero'].onClick();
  let saved = JSON.parse(t.store.get('index80_ui_v1'));
  ok(t.w['home-hero'].body.hidden && !t.w['home-current'].body.hidden, 'windows: collapsing the hero leaves WHAT\'S CURRENT open');
  ok(JSON.stringify(saved.windows) === JSON.stringify({ 'home-hero': { collapsed: true } }), 'windows: hero state is stored under its own key');
  t.w['home-current'].onClick();
  saved = JSON.parse(t.store.get('index80_ui_v1'));
  ok(saved.windows['home-hero']?.collapsed && saved.windows['home-current']?.collapsed, 'windows: both states persist side by side in one index80_ui_v1 object');
  t.w['home-current'].onClick();
  saved = JSON.parse(t.store.get('index80_ui_v1'));
  ok(saved.windows['home-hero']?.collapsed && !saved.windows['home-current'] && t.footerChildren.length === 1, 'windows: reopening one keeps the other collapsed and the Restore control visible');
  t.footerChildren[0].click();
  ok(!t.w['home-hero'].body.hidden && !t.w['home-current'].body.hidden && t.w['home-hero'].attrs['aria-expanded'] === 'true' && !t.store.has('index80_ui_v1'), 'windows: Restore windows reopens the hero too');
}
{
  const t = runWindows({ stored: JSON.stringify({ v: 1, windows: { 'home-hero': { collapsed: true } } }) });
  ok(t.w['home-hero'].body.hidden && t.w['home-hero'].attrs['aria-expanded'] === 'false' && !t.w['home-current'].body.hidden, 'windows: a saved hero preference is applied without touching the other window');
}

{
  // Three windows collapsed independently; Restore reopens all of them.
  const t = runWindows();
  ['home-hero', 'home-current', 'home-directory'].forEach((id) => t.w[id].onClick());
  const saved = JSON.parse(t.store.get('index80_ui_v1'));
  ok(Object.keys(saved.windows).length === 3 && Object.values(t.w).every((w) => w.body.hidden), 'windows: hero, WHAT\'S CURRENT and directory collapse and persist independently');
  t.footerChildren[0].click();
  ok(Object.values(t.w).every((w) => !w.body.hidden && w.attrs['aria-expanded'] === 'true') && !t.store.has('index80_ui_v1'), 'windows: Restore windows reopens all three');
}
{
  // Following "Browse projects ↓" / a #directory URL opens a collapsed directory.
  const collapsedDir = JSON.stringify({ v: 1, windows: { 'home-directory': { collapsed: true }, 'home-hero': { collapsed: true } } });
  const a = runWindows({ stored: collapsedDir, targets: { directory: 'home-directory' } });
  ok(a.w['home-directory'].body.hidden, 'windows: saved collapsed directory applied before navigation');
  a.clickLink('#directory');
  ok(!a.w['home-directory'].body.hidden && a.w['home-hero'].body.hidden, 'windows: an in-page link to a collapsed window opens only that window');
  ok(!JSON.parse(a.store.get('index80_ui_v1')).windows['home-directory'], 'windows: following the link records the directory as open');
  const b = runWindows({ stored: collapsedDir, hash: '#directory', targets: { directory: 'home-directory' } });
  ok(!b.w['home-directory'].body.hidden, 'windows: arriving with #directory in the URL opens the directory');
  const c = runWindows({ stored: collapsedDir, targets: { directory: 'home-directory' } });
  c.navigate('#nowhere');
  ok(c.w['home-directory'].body.hidden, 'windows: unrelated hashes leave collapsed windows alone');
  c.navigate('#directory');
  ok(!c.w['home-directory'].body.hidden, 'windows: hashchange to #directory opens it');
}
{
  // About deep links: parents are read from the real page, then the generic
  // ui-windows.js reopens only the collapsed window that holds the anchor.
  const ids = ['about-overview', 'about-method', 'about-support', 'about-builder', 'about-future'];
  const parentOf = (anchor) => {
    const at = ABOUT.indexOf(`id="${anchor}"`);
    return ids.filter((id) => ABOUT.indexOf(`data-window="${id}" data-room="about"`) < at).at(-1);
  };
  const expected = { 'independent-open-source': 'about-overview', 'editorial-system': 'about-method', donate: 'about-support' };
  for (const [anchor, parent] of Object.entries(expected)) {
    ok(parentOf(anchor) === parent, `About #${anchor} lives in ${parent} (got ${parentOf(anchor)})`);
    const stored = JSON.stringify({ v: 1, windows: Object.fromEntries(ids.map((id) => [id, { collapsed: true }])) });
    const viaHash = runWindows({ ids, stored, hash: `#${anchor}`, targets: { [anchor]: parentOf(anchor) } });
    ok(ids.every((id) => viaHash.w[id].body.hidden === (id !== parent)), `About: arriving with #${anchor} opens only ${parent}`);
    const viaLink = runWindows({ ids, stored, targets: { [anchor]: parentOf(anchor) } });
    viaLink.clickLink(`#${anchor}`);
    ok(!viaLink.w[parent].body.hidden, `About: an in-page link to #${anchor} reopens ${parent}`);
  }
}
{
  // Registry deep links reuse the same generic parent-window behaviour.
  const ids = ['registry-history', 'registry-changes', 'registry-verify', 'registry-wallet-window', 'registry-data'];
  const targets = { 'recent-changes': 'registry-changes', 'registry-process': 'registry-verify', 'registry-wallet': 'registry-wallet-window' };
  for (const [anchor, parent] of Object.entries(targets)) {
    const stored = JSON.stringify({ v: 1, windows: Object.fromEntries(ids.map((id) => [id, { collapsed: true }])) });
    const t = runWindows({ stored, ids, hash: `#${anchor}`, targets });
    ok(!t.w[parent].body.hidden && t.w[parent].attrs['aria-expanded'] === 'true', `windows: /registry/#${anchor} reopens ${parent}`);
    ok(ids.filter((id) => id !== parent).every((id) => t.w[id].body.hidden), `windows: /registry/#${anchor} leaves unrelated Registry windows collapsed`);
    ok(!JSON.parse(t.store.get('index80_ui_v1') || '{"windows":{}}').windows[parent], `windows: #${anchor} clears the collapsed preference for ${parent}`);
  }
}

if (failures.length) {
  console.error(`[test-product-clarity] ${failures.length} failure(s):\n  ${failures.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
console.log(`[test-product-clarity] OK — static proposition + collapsible OS window (counts, shortcuts, one trust line, persisted UI pref), dedicated Explore hero, data-tied WHAT'S CURRENT (${times.length} dated tiles), no change feed, ${profiles} profiles free of overstated confirmation, methodology provenance standard`);

#!/usr/bin/env node
/**
 * Theme-aware project artwork test.
 *
 * Checks the single resolver (scripts/lib/project-image-variants.mjs), the
 * generic CSS rule, the generated pages (only projects with real variants
 * change; everyone else keeps the exact single-<img> markup; og:image /
 * structured data keep the default image), that no project is special-cased
 * in code, and that every variant in project-images.json is a real file
 * with honest dimensions and the same aspect ratio as its default.
 *
 * Node core only. Usage: node scripts/test-project-image-variants.mjs
 * (run after scripts/generate-project-pages.mjs)
 */
import { INK_TOLERANT_HTML } from './test-helpers/ink-tolerant-html.mjs'; // eslint-disable-line no-unused-vars
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveThemedImage } from './lib/project-image-variants.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HTML = join(ROOT, 'public_html');
const failures = [];
function check(name, cond, detail = '') {
  if (cond) console.log(`ok - ${name}`);
  else { failures.push(name); console.error(`FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

// --- resolver ---------------------------------------------------------------------
const e = (path, status = 'ok') => ({ path, status });
{
  const none = resolveThemedImage(undefined);
  check('resolver: no images -> nothing, not themed', none.base === null && none.light === null && none.dark === null && !none.themed);
  const plain = resolveThemedImage({ hero: e('/h.png') });
  check('resolver: default only -> both modes use it, not themed', plain.light.path === '/h.png' && plain.dark.path === '/h.png' && !plain.themed);
  const light = resolveThemedImage({ hero: e('/h.png'), hero_light: e('/l.webp') });
  check('resolver: LIGHT -> hero_light, DARK -> hero', light.light.path === '/l.webp' && light.dark.path === '/h.png' && light.themed);
  const dark = resolveThemedImage({ hero: e('/h.png'), hero_dark: e('/d.webp') });
  check('resolver: DARK -> hero_dark, LIGHT -> hero', dark.dark.path === '/d.webp' && dark.light.path === '/h.png' && dark.themed);
  const both = resolveThemedImage({ hero: e('/h.png'), hero_light: e('/l.webp'), hero_dark: e('/d.webp') });
  check('resolver: both overrides used', both.light.path === '/l.webp' && both.dark.path === '/d.webp' && both.base.path === '/h.png');
  const broken = resolveThemedImage({ hero: e('/h.png'), hero_light: e('/l.webp', 'fetch_error') });
  check('resolver: an unresolved override falls back to the default', broken.light.path === '/h.png' && !broken.themed);
  const same = resolveThemedImage({ hero: e('/h.png'), hero_light: e('/h.png') });
  check('resolver: an override identical to the default is not themed', !same.themed);
  const icon = resolveThemedImage({ icon: e('/i.png'), icon_dark: e('/id.png') }, 'icon');
  check('resolver: works for any role (icon)', icon.dark.path === '/id.png' && icon.light.path === '/i.png');
}

// --- generic: no project special-cased in code ---------------------------------------
const manifest = JSON.parse(readFileSync(join(PUBLIC_HTML, 'data', 'project-images.json'), 'utf8')).images;
const variantSlugs = Object.keys(manifest).filter((s) => Object.keys(manifest[s]).some((k) => /_(light|dark)$/.test(k)));
const code = ['scripts/generate-project-pages.mjs', 'scripts/lib/project-image-variants.mjs', 'public_html/assets/js/theme.js', 'public_html/assets/css/site.css']
  .map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]);
for (const slug of variantSlugs) {
  const hit = code.filter(([, t]) => new RegExp(`\\b${slug}\\b`, 'i').test(t)).map(([f]) => f);
  check(`generic: "${slug}" is not hardcoded in template, CSS, theme JS or resolver`, hit.length === 0, hit.join(', '));
}
const css = readFileSync(join(PUBLIC_HTML, 'assets', 'css', 'site.css'), 'utf8');
check('css: dark mode hides light variants', /html\[data-color-mode="dark"\] \[data-theme-variant="light"\]/.test(css));
check('css: light (default) mode hides dark variants', /html:not\(\[data-color-mode="dark"\]\) \[data-theme-variant="dark"\]/.test(css));
check('css: the rule does not depend on WEB 1.0 / ARCADE (no data-theme in the selector)', !/data-theme="[^"]*"\][^{]*\[data-theme-variant/.test(css));

// --- manifest variants are real, honest, undistorted ------------------------------------
function dims(buf) {
  if (buf.subarray(1, 4).toString('latin1') === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    const fourcc = buf.subarray(12, 16).toString('latin1');
    if (fourcc === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
    if (fourcc === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (fourcc === 'VP8L') { const v = buf.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return null; // JPEG: dimensions not re-derived here
  return null;
}
for (const slug of variantSlugs) {
  for (const [role, entry] of Object.entries(manifest[slug]).filter(([k]) => /_(light|dark)$/.test(k))) {
    const file = join(PUBLIC_HTML, entry.path || '');
    check(`${slug}.${role}: status ok and file present`, entry.status === 'ok' && existsSync(file));
    if (!existsSync(file)) continue;
    const buf = readFileSync(file);
    check(`${slug}.${role}: recorded bytes match the file`, entry.bytes === buf.length);
    const d = dims(buf);
    if (d) check(`${slug}.${role}: recorded dimensions match the file (${d.w}x${d.h})`, d.w === entry.width && d.h === entry.height);
    const base = manifest[slug][role.replace(/_(light|dark)$/, '')];
    if (base?.width && entry.width) {
      const ratio = (entry.width / entry.height) / (base.width / base.height);
      check(`${slug}.${role}: same aspect ratio as the default (no distortion/crop), ratio ${ratio.toFixed(3)}`, Math.abs(ratio - 1) < 0.02);
    }
    check(`${slug}.${role}: carries provenance (kind + note), no private share link`, entry.kind && entry.note && !/drive\.google|docs\.google|dropbox|wetransfer/i.test(JSON.stringify(entry)));
  }
}

// --- generated pages ------------------------------------------------------------------------
const projectsDir = join(PUBLIC_HTML, 'projects');
const pages = readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const withVariantMarkup = pages.filter((slug) => readFileSync(join(projectsDir, slug, 'index.html'), 'utf8').includes('data-theme-variant'));
const expectedThemed = variantSlugs.filter((s) => resolveThemedImage(manifest[s], 'hero').themed);
check('pages: only projects with real hero variants carry variant markup', JSON.stringify(withVariantMarkup.sort()) === JSON.stringify(expectedThemed.sort()), `got ${withVariantMarkup.join(',')}`);
for (const slug of expectedThemed) {
  const html = readFileSync(join(projectsDir, slug, 'index.html'), 'utf8');
  const r = resolveThemedImage(manifest[slug], 'hero');
  const media = html.match(/<div class="profile-media">([\s\S]*?)<\/div>/)?.[1] || '';
  check(`${slug}: light variant rendered for LIGHT`, !r.light || media.includes(`src="${r.light.path}"`) && /data-theme-variant="light"/.test(media));
  check(`${slug}: dark variant rendered for DARK`, !r.dark || media.includes(`src="${r.dark.path}"`) && /data-theme-variant="dark"/.test(media));
  check(`${slug}: variants load eagerly (no empty slot on switch)`, !/data-theme-variant="[^"]+"[^>]*loading="lazy"/.test(media));
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || '';
  check(`${slug}: og:image keeps the default image`, og.endsWith(r.base.path));
}
// An ordinary project with no overrides keeps the exact single-image markup.
const ordinary = pages.find((s) => manifest[s]?.hero?.status === 'ok' && !Object.keys(manifest[s]).some((k) => /_(light|dark)$/.test(k)));
if (ordinary) {
  const html = readFileSync(join(projectsDir, ordinary, 'index.html'), 'utf8');
  const h = manifest[ordinary].hero;
  const expected = `<div class="profile-media"><img src="${h.path}" alt=""${h.width ? ` width="${h.width}"` : ''}${h.height ? ` height="${h.height}"` : ''} loading="lazy" decoding="async"></div>`;
  check(`ordinary project (${ordinary}): unchanged single lazy <img>`, html.includes(expected));
}

if (failures.length) { console.error(`\n${failures.length} failure(s)`); process.exit(1); }
console.log('\nproject image variants: all checks passed');

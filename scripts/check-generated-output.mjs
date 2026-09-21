#!/usr/bin/env node
/**
 * Deterministic-build check (npm run test:generated-output).
 *
 * Committed generated HTML is allowed to lag behind public_html/data/projects.json: the dedicated
 * production rebuild workflow regenerates and commits public_html/projects/** and sitemap.xml.
 * So this check deliberately does NOT compare a build with HEAD. It proves two things instead:
 *
 *   1. Determinism  - two consecutive `npm run build` runs produce byte-identical output, apart
 *                     from the intentional build stamp (public_html/site-version.json and the
 *                     VERSION marker in public_html/assets/js/main.js).
 *   2. Containment  - a build only writes inside the generated-output surface listed below, so it
 *                     cannot silently rewrite source-of-truth data, scripts, docs or workflows.
 *
 * It runs the build itself (twice), so run it instead of, not after, a separate build step.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules']);

// Everything `npm run build` is allowed to create, change or delete. Each entry mirrors a build script.
const GENERATED_FILES = new Set([
  'public_html/index.html', // generate-home-directory, generate-site-schema
  'public_html/learn/index.html', // generate-site-schema
  'public_html/governance/index.html', // generate-site-schema
  'public_html/registry/index.json', // generate-registry-history
  'public_html/registry/index.html', // generate-registry-history
  'public_html/sitemap.xml', // generate-sitemap
  'public_html/site-version.json', // generate-site-version (build stamp)
  'public_html/assets/js/main.js', // generate-site-version (build stamp)
]);
const GENERATED_PREFIXES = ['public_html/projects/']; // generate-project-pages and the apply-* scripts

const MAIN_JS = 'public_html/assets/js/main.js';
const VERSION_JSON = 'public_html/site-version.json';
const STAMP_FILES = new Set([MAIN_JS, VERSION_JSON]);
const VERSION_MARKER = /const VERSION = '([^']*)';/g;

const isGenerated = (path) => GENERATED_FILES.has(path) || GENERATED_PREFIXES.some((prefix) => path.startsWith(prefix));

function snapshot() {
  const files = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile()) {
        files.set(relative(ROOT, full).split(sep).join('/'), createHash('sha256').update(readFileSync(full)).digest('hex'));
      }
    }
  };
  walk(ROOT);
  return files;
}

function changedPaths(from, to) {
  const paths = new Set();
  for (const [path, hash] of to) if (from.get(path) !== hash) paths.add(path);
  for (const path of from.keys()) if (!to.has(path)) paths.add(path);
  return [...paths].sort();
}

function build(label) {
  const env = { ...process.env };
  // Production builds strip dev-only pages; keep this check independent of the host environment.
  delete env.CF_PAGES_BRANCH;
  delete env.INDEX80_PRODUCTION_BUILD;
  const result = spawnSync('npm', ['run', 'build'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) {
    const tail = `${result.stdout || ''}\n${result.stderr || ''}`.trim().split('\n').slice(-40).join('\n');
    console.error(`[generated-output] FAIL - npm run build failed (${label}, exit ${result.status ?? result.signal}). Last output:\n${tail}`);
    process.exit(1);
  }
}

// Reads the intentional build stamp and returns it with the stamp masked, so two builds can be compared.
function readStamp() {
  const mainJs = readFileSync(join(ROOT, MAIN_JS), 'utf8');
  const markers = [...mainJs.matchAll(VERSION_MARKER)];
  if (markers.length !== 1) throw new Error(`${MAIN_JS} must contain exactly one VERSION marker (found ${markers.length})`);
  const stamp = JSON.parse(readFileSync(join(ROOT, VERSION_JSON), 'utf8'));
  if (Object.keys(stamp).sort().join() !== 'builtAt,version') throw new Error(`${VERSION_JSON} must contain exactly "version" and "builtAt"`);
  if (markers[0][1] !== stamp.version) throw new Error(`VERSION marker in ${MAIN_JS} (${markers[0][1]}) does not match ${VERSION_JSON} (${stamp.version})`);
  return {
    version: stamp.version,
    maskedMainJs: mainJs.replace(VERSION_MARKER, "const VERSION = '<BUILD_VERSION>';"),
    maskedVersionJson: JSON.stringify({ version: '<BUILD_VERSION>', builtAt: '<BUILD_TIME>' }),
  };
}

const failures = [];
const before = snapshot();

build('build 1');
const afterOne = snapshot();
let stampOne;
try { stampOne = readStamp(); } catch (error) { failures.push(`build 1 stamp: ${error.message}`); }

build('build 2');
const afterTwo = snapshot();
let stampTwo;
try { stampTwo = readStamp(); } catch (error) { failures.push(`build 2 stamp: ${error.message}`); }

// 1. Containment: build 1 may only touch the generated-output surface (relative to the pre-build tree, not HEAD).
const firstBuildChanges = changedPaths(before, afterOne);
for (const path of firstBuildChanges.filter((p) => !isGenerated(p))) {
  failures.push(`build wrote outside the generated-output surface: ${path}`);
}

// 2. Determinism: build 2 must reproduce build 1 exactly, except for the masked build stamp.
for (const path of changedPaths(afterOne, afterTwo)) {
  if (!STAMP_FILES.has(path)) failures.push(`non-deterministic output, differs between consecutive builds: ${path}`);
}
if (stampOne && stampTwo) {
  if (stampOne.maskedMainJs !== stampTwo.maskedMainJs) failures.push(`${MAIN_JS} differs between consecutive builds beyond its VERSION marker`);
  if (stampOne.maskedVersionJson !== stampTwo.maskedVersionJson) failures.push(`${VERSION_JSON} differs between consecutive builds beyond version/builtAt`);
}

if (failures.length > 0) {
  console.error('[generated-output] FAIL - the build is not deterministic or wrote outside its permitted surface:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const stampNote = stampOne.version === stampTwo.version ? `build stamp ${stampOne.version}` : `build stamp ${stampOne.version} -> ${stampTwo.version}`;
console.log(`[generated-output] PASS - two consecutive builds are identical (${stampNote} masked); build 1 changed ${firstBuildChanges.length} file(s) relative to the pre-build tree, all inside the generated-output surface.`);

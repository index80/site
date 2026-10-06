/**
 * Content tests import this so they assert on the words of a public page, not
 * on its semantic accent-word presentation: every readFileSync of a public
 * .html file returns the page with ink spans stripped (scripts/lib/semantic-ink.mjs).
 * The ink layer itself is verified by scripts/test-semantic-ink.mjs, which
 * does NOT import this helper.
 */
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { stripInk } from '../lib/semantic-ink.mjs';

const original = fs.readFileSync;
fs.readFileSync = function readFileSyncInkTolerant(path, options) {
  const result = original.call(this, path, options);
  const isHtml = typeof path === 'string' ? path.endsWith('.html') : path instanceof URL ? path.pathname.endsWith('.html') : false;
  if (!isHtml) return result;
  if (typeof result === 'string') return stripInk(result);
  return Buffer.from(stripInk(result.toString('utf8')), 'utf8');
};
syncBuiltinESMExports();

/** Imported by name (not as a bare side-effect import) so the public-export
 *  import tracer, which follows `from '...'` specifiers, ships this helper. */
export const INK_TOLERANT_HTML = true;

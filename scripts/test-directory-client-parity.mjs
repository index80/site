#!/usr/bin/env node
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(ROOT, 'public_html/assets/js/directory.js'), 'utf8');

const list = { innerHTML: '' };
const count = { textContent: '' };
const bar = { innerHTML: '', querySelectorAll: () => [] };
const search = { value: '', addEventListener() {} };
const root = {
  getAttribute(name) {
    return {
      'data-source': '/data/projects.json',
      'data-relations-source': '/data/project-relations.json',
      'data-icons': '/assets/icons/icons.svg',
      'data-profile-base': '/projects/',
      'data-default-category': 'governance',
    }[name] ?? null;
  },
};

const fixture = {
  projects: [
    {
      slug: 'valid-governance',
      name: 'Valid Governance',
      summary: 'A valid governance record.',
      category: 'governance',
      status: 'review',
      tags: [],
    },
    {
      slug: 'BAD SLUG',
      name: 'Malformed Governance',
      summary: '',
      category: 'governance',
      status: 'review',
      tags: [],
    },
    {
      slug: 'valid-wallet',
      name: 'Valid Wallet',
      summary: 'A valid wallet record.',
      category: 'wallet',
      status: 'review',
      tags: [],
    },
    {
      slug: 'archived-governance',
      name: 'Archived Governance',
      summary: 'Archived record.',
      category: 'governance',
      status: 'archived',
      tags: [],
    },
  ],
};

const document = {
  querySelector(selector) {
    return {
      '[data-directory]': root,
      '#directory-list': list,
      '#category-bar': bar,
      '#directory-count': count,
      '#directory-search': search,
    }[selector] ?? null;
  },
  querySelectorAll(selector) {
    return selector === '.dir-sort' ? [] : [];
  },
};

const fetch = async (url) => {
  if (String(url) === '/data/projects.json') {
    return { ok: true, json: async () => fixture };
  }
  if (String(url) === '/data/project-relations.json') {
    return { ok: true, json: async () => ({ records: {} }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

const context = vm.createContext({
  document,
  window: {
    location: { search: '' },
    INDEX80Treasury: { isConfirmedFunded: () => false },
  },
  fetch,
  URLSearchParams,
  console,
});
vm.runInContext(code, context, { filename: 'directory.js' });
await new Promise((resolve) => setTimeout(resolve, 25));

assert.equal(count.textContent, '1 / 2 RECORDS', 'hydrated Governance count must use the same listable rule as static generation');
assert.match(list.innerHTML, /Valid Governance/);
assert.doesNotMatch(list.innerHTML, /Malformed Governance|Archived Governance|Valid Wallet/);

console.log('[test-directory-client-parity] PASS — directory hydration excludes malformed and archived records exactly as the static listability rule requires.');

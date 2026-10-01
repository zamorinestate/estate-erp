'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_ROOTS = [
  'backend/src',
  'backend/tests',
  'frontend/src',
  'scripts',
];

const FORBIDDEN_ROLE_TOKENS = [
  ['MASTER', 'NORMAL'].join('_'),
  ['master', 'normal'].join('_'),
];

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }

  return files;
}

test('retired non-primary Master role tokens cannot return to active code or audit tooling', () => {
  const violations = [];

  for (const relativeRoot of SCAN_ROOTS) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    for (const filePath of walkFiles(absoluteRoot)) {
      if (!/\.(?:js|mjs|cjs|json|html|css|ps1)$/.test(filePath)) continue;

      const source = fs.readFileSync(filePath, 'utf8');
      for (const token of FORBIDDEN_ROLE_TOKENS) {
        if (source.includes(token)) {
          violations.push(
            `${path.relative(REPO_ROOT, filePath)} contains retired role token ${token}`
          );
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Retired non-primary Master role tokens were reintroduced:\n${violations.join('\n')}`
  );
});

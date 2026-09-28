'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BACKEND_RUNTIME = path.resolve(__dirname, '../src');
const FRONTEND_RUNTIME = path.resolve(__dirname, '../../frontend/src');
const SKIP_DIR_NAMES = new Set(['scripts']);
const EXACT_DEFAULT_CAFE_LITERAL = /(['"])ZC-0001\1/g;

function scan(dir, findings) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name) && dir === BACKEND_RUNTIME) continue;
      scan(full, findings);
      continue;
    }

    if (!/\.(?:js|mjs|cjs|ts|tsx|jsx)$/.test(entry.name)) continue;

    const source = fs.readFileSync(full, 'utf8');
    EXACT_DEFAULT_CAFE_LITERAL.lastIndex = 0;
    if (EXACT_DEFAULT_CAFE_LITERAL.test(source)) {
      findings.push(path.relative(path.resolve(__dirname, '../..'), full).replace(/\\/g, '/'));
    }
  }
}

test('production runtime has no hard-coded ZC-0001 café fallback literal', () => {
  const findings = [];
  scan(BACKEND_RUNTIME, findings);
  scan(FRONTEND_RUNTIME, findings);

  assert.deepEqual(
    findings,
    [],
    'Hard-coded ZC-0001 runtime literals remain:\n' +
      findings.map((file) => `- ${file}`).join('\n')
  );
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'dist',
  'build',
  '.next',
  '.cache',
]);
const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.md', '.txt', '.yml', '.yaml', '.ps1',
  '.html', '.css', '.scss', '.xml', '.sh',
]);

const FORBIDDEN = [
  new RegExp(['Normal', 'Master'].join(' '), 'g'),
  new RegExp(['NORMAL', 'MASTER'].join(' '), 'g'),
  new RegExp(['NORMAL', 'MASTER'].join('_'), 'g'),
  new RegExp(['master', 'normal'].join('_'), 'g'),
  new RegExp(['normal', 'master'].join('\\.'), 'g'),
];

function walk(dir, findings) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full, findings);
      continue;
    }

    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch (_) {
      continue;
    }

    const hits = [];
    for (const pattern of FORBIDDEN) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) hits.push(pattern.source);
    }

    if (hits.length) {
      findings.push({
        file: path.relative(REPO_ROOT, full).replace(/\\/g, '/'),
        hits,
      });
    }
  }
}

test('Retired secondary MASTER persona is absent from the repository', () => {
  const findings = [];
  walk(REPO_ROOT, findings);

  assert.deepEqual(
    findings,
    [],
    'Retired secondary MASTER persona references remain:\n' +
      findings.map((f) => `- ${f.file}: ${f.hits.join(', ')}`).join('\n')
  );
});

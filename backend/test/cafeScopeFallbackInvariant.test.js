'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const RUNTIME_ROOTS = [
  path.join(REPO_ROOT, 'backend', 'src'),
  path.join(REPO_ROOT, 'frontend', 'src'),
];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.cache']);
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

const CAFE_ONE = ['ZC', '0001'].join('-');
const QUOTED_CAFE_ONE = `["']${CAFE_ONE.replace('-', '\\-')}["']`;
const DANGEROUS_PATTERNS = [
  {
    name: 'logical OR café fallback',
    re: new RegExp(`\\|\\|\\s*${QUOTED_CAFE_ONE}`, 'g'),
  },
  {
    name: 'nullish café fallback',
    re: new RegExp(`\\?\\?\\s*${QUOTED_CAFE_ONE}`, 'g'),
  },
  {
    name: 'schema café default',
    re: new RegExp(`default\\s*:\\s*${QUOTED_CAFE_ONE}`, 'g'),
  },
  {
    name: 'array café fallback',
    re: new RegExp(`\\|\\|\\s*\\[\\s*${QUOTED_CAFE_ONE}`, 'g'),
  },
  {
    name: 'cafeId assignment default',
    re: new RegExp(`\\bcafeId\\s*=\\s*${QUOTED_CAFE_ONE}`, 'g'),
  },
];

function scanFile(filePath, findings) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return;
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(text)) {
      findings.push({
        file: path.relative(REPO_ROOT, filePath).replace(/\\/g, '/'),
        pattern: pattern.name,
      });
    }
  }
}

function walk(dir, findings) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, findings);
      continue;
    }
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    scanFile(full, findings);
  }
}

test('runtime café scope never falls back to the first canonical café', () => {
  const findings = [];
  for (const root of RUNTIME_ROOTS) walk(root, findings);

  assert.deepEqual(
    findings,
    [],
    'Unsafe runtime café fallbacks remain:\n' +
      findings.map((f) => `- ${f.file}: ${f.pattern}`).join('\n')
  );
});

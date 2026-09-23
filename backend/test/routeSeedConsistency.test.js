'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { DEFAULT_PERMISSION_RULES } = require('../src/scripts/seedInitialData');

test('RBAC Route Authorization Consistency — Every route has an authoritative governance policy', () => {
  const routesDir = path.join(__dirname, '../src/routes');
  const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));

  const seededCodes = new Set(DEFAULT_PERMISSION_RULES.map((r) => r.permissionCode));

  // Matches authorize('CODE', ...) or authorize('CODE')
  const authorizeRegex = /authorize\(\s*['"]([A-Z0-9_:]+)['"](?:\s*,\s*(\{[\s\S]*?\}))?\s*\)/g;
  const ungovernedRoutes = [];
  let totalChecked = 0;

  for (const file of routeFiles) {
    const filePath = path.join(routesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    let match;
    while ((match = authorizeRegex.exec(content)) !== null) {
      totalChecked++;
      const code = match[1];
      const optionsStr = match[2];
      const hasAllowedRoles = optionsStr && optionsStr.includes('allowedRoles');

      // If the route does not declare an explicit role matrix, it must have a seeded DB permission rule
      if (!hasAllowedRoles && !seededCodes.has(code)) {
        ungovernedRoutes.push({ file, code });
      }
    }
  }

  assert.ok(totalChecked > 0, 'Must audit active route authorize() calls');
  assert.deepEqual(
    ungovernedRoutes,
    [],
    `Found backend routes using dynamic authorize() with permission codes missing from seedInitialData.js: ${JSON.stringify(
      ungovernedRoutes
    )}`
  );
});


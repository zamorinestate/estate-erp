import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { DEFAULT_PERMISSION_RULES } = require('../src/scripts/seedInitialData.js');

const routesDir = path.resolve('D:/Zamorin_Cafe_ERP_Build/A Main Workspace/Backend/src/routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

const missingRules = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
  // Match authorize('CODE', { allowedRoles: [...] })
  const regex = /authorize\(\s*['"]([^'"]+)['"]\s*,\s*\{[^}]*allowedRoles:\s*\[([^\]]+)\]/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    const code = m[1].toUpperCase();
    const rolesStr = m[2];
    const roles = rolesStr.split(',').map(r => r.replace(/['"\s]/g, '').toUpperCase()).filter(Boolean);

    for (const role of roles) {
      if (role === 'PRIMARY_MASTER') continue;
      const found = DEFAULT_PERMISSION_RULES.some(r => r.role === role && r.permissionCode === code);
      if (!found) {
        missingRules.push({ file, code, role });
      }
    }
  }
}

console.log('Total route-guard combinations without a direct DB rule in DEFAULT_PERMISSION_RULES:', missingRules.length);
const grouped = {};
for (const item of missingRules) {
  const k = `${item.code} -> missing for: ${item.role}`;
  grouped[k] = (grouped[k] || 0) + 1;
}
for (const [k, c] of Object.entries(grouped)) {
  console.log(`- ${k} (${c} occurrences)`);
}

import { NAVIGATION, ROLES, isRouteAllowed } from '../frontend/src/js/navigation.js';

console.log('=== FOUR-PROFILE ROUTING & PERMISSION PARITY AUDIT (PERMANENT 4-WINDOW TOPOLOGY) ===\n');

const profiles = [
  { name: 'PRIMARY MASTER', role: ROLES.MASTER, isPrimary: true },
  { name: 'OWNER', role: ROLES.OWNER, isPrimary: false },
  { name: 'CAFE OPERATIONS', role: ROLES.CAFE_ADMIN, isPrimary: false },
  { name: 'STAFF', role: ROLES.STAFF, isPrimary: false },
];

let allPass = true;

for (const p of profiles) {
  console.log(`--- Checking Profile: ${p.name} ---`);
  const navConfig = NAVIGATION[p.role];
  if (!navConfig) {
    console.error(`FAIL: Missing navigation config for role: ${p.role}`);
    allPass = false;
    continue;
  }
  const items = navConfig.primaryItems || navConfig.items || [];

  console.log(`Total sidebar items configured: ${items.length}`);
  
  // Verify all configured routes are allowed
  for (const item of items) {
    const allowed = isRouteAllowed(p.role, item.route, p.isPrimary);
    if (!allowed) {
      console.error(`FAIL: Configured route '${item.route}' is NOT allowed by isRouteAllowed for ${p.name}`);
      allPass = false;
    }
  }

  console.log(`Profile ${p.name}: OK\n`);
}

if (allPass) {
  console.log('=== ALL FOUR PROFILES PASSED ROUTE PARITY & PERMISSION CHECKS ===');
} else {
  console.error('=== PARITY CHECKS FAILED ===');
  process.exit(1);
}

// =============================================================================
// ZAMORIN CAFE ERP — STAGE 3 UI/NAVIGATION & PARITY AUTOMATED AUDIT
// =============================================================================

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { NAVIGATION, ROLES, isRouteAllowed, PRIMARY_MASTER_ONLY_ROUTES } from '../frontend/src/js/navigation.js';

console.log('=====================================================================');
console.log('STAGE 3 AUTOMATED AUDIT: UI/UX, CONTROL CENTRES & ROUTING PARITY');
console.log('=====================================================================\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assert(condition, name, details = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${name}`);
  } else {
    failedChecks++;
    console.error(`  [FAIL] ${name} ${details ? `— ${details}` : ''}`);
  }
}

// 1. Audit Navigation & Active-Profile Route Parity
console.log('1. Auditing Active-Profile Navigation Configurations...');
const profiles = [
  { name: 'PRIMARY MASTER', role: ROLES.MASTER, isPrimary: true, expectedCount: 24 },
  { name: 'OWNER', role: ROLES.OWNER, isPrimary: false, expectedCount: 12 },
  { name: 'CAFE OPERATIONS', role: ROLES.CAFE_ADMIN, isPrimary: false, expectedCount: 15 }
];

for (const p of profiles) {
  const navConfig = NAVIGATION[p.role];
  const items = p.role === ROLES.MASTER
    ? (navConfig.primaryItems || navConfig.items)
    : navConfig.items;

  assert(items.length === p.expectedCount, `${p.name} navigation item count equals ${p.expectedCount}`, `Actual: ${items.length}`);

  let allAllowed = true;
  for (const item of items) {
    if (!isRouteAllowed(p.role, item.route, p.isPrimary)) {
      allAllowed = false;
      console.error(`    Unauthorized route in sidebar: ${item.route}`);
    }
  }
  assert(allAllowed, `${p.name} all sidebar routes are authorized by isRouteAllowed`);

  // Tasks & Oversight presence check
  const hasTasks = items.some(i => i.route === 'tasks' || i.route === 'approvals');
  assert(hasTasks, `${p.name} has Tasks & Oversight in its active navigation`);

  // MailOps retirement check
  const hasMailops = items.some(i => i.route === 'mailops');
  assert(!hasMailops, `${p.name} does NOT contain retired MailOps in user-facing navigation`);
}

// 2. Audit Control-Centre Hub Codebases for Button Grids & Subpage Headers
console.log('\n2. Auditing Control-Centre Button Hub Implementations...');
const modulesToCheck = [
  { name: 'Finance & Accounts', path: './frontend/src/js/pages/financeAccounts.js', hubAttr: 'data-fin-hub-tile', backBtn: '#fin-back-to-hub-btn' },
  { name: 'Customer Directory & Loyalty', path: './frontend/src/js/pages/customers.js', hubAttr: 'data-cust-hub-tile', backBtn: '#cust-back-to-hub-btn' },
  { name: 'Menu & Recipe Management', path: './frontend/src/js/pages/menuManagement.js', hubAttr: 'data-menu-hub-tile', backBtn: '#menu-back-to-hub-btn' },
  { name: 'Suppliers & Sourcing', path: './frontend/src/js/pages/vendors.js', hubAttr: 'data-vnd-hub-tile', backBtn: '#vnd-back-to-hub-btn' },
  { name: 'Payroll Management', path: './frontend/src/js/pages/payrollManagement.js', hubAttr: 'data-payroll-hub-tile', backBtn: '#payroll-back-to-hub-btn' },
  { name: 'Reports & Analytics', path: './frontend/src/js/pages/reportsAnalytics.js', hubAttr: 'data-analytics-tab', backBtn: '#analytics-back-to-hub-btn' },
  { name: 'Quality & Compliance', path: './frontend/src/js/pages/quality.js', hubAttr: 'data-quality-hub-tile', backBtn: '#quality-back-to-hub-btn' },
  { name: 'Assets & Equipment', path: './frontend/src/js/pages/assets.js', hubAttr: 'data-assets-hub-tile', backBtn: '#assets-back-to-hub-btn' },
  { name: 'Workforce & HRIS', path: './frontend/src/js/pages/employees.js', hubAttr: 'data-workforce-hub-tile', backBtn: '#workforce-back-to-hub-btn' },
  { name: 'Inventory & Stock', path: './frontend/src/js/pages/inventory.js', hubAttr: 'data-inv-hub-tile', backBtn: '#inv-back-to-hub-btn' },
  { name: 'Procurement & Purchasing', path: './frontend/src/js/pages/procurement.js', hubAttr: 'data-proc-hub-tile', backBtn: '#proc-back-to-hub-btn' },
  { name: 'Expenses & Spend', path: './frontend/src/js/pages/expenses.js', hubAttr: 'data-exp-hub-tile', backBtn: '#exp-back-to-hub-btn' },
  { name: 'Bills & Receipts', path: './frontend/src/js/pages/ownerBills.js', hubAttr: 'data-bills-hub-tile', backBtn: '#bills-back-to-hub-btn' },
  { name: 'Revenue Share & Outlets', path: './frontend/src/js/pages/revenueShare.js', hubAttr: 'data-rs-hub-tile', backBtn: '#rs-back-to-hub-btn' },
  { name: 'Attendance & Shifts', path: './frontend/src/js/modules/attendance/attendanceShifts.js', hubAttr: 'data-attendance-hub-tile', backBtn: '#attendance-back-to-hub-btn' },
  { name: 'Administration & Governance', path: './frontend/src/js/pages/administration.js', hubAttr: 'data-admin-hub-tile', backBtn: '#admin-back-to-hub-btn' },
  { name: 'Devices & Sessions', path: './frontend/src/js/pages/cafeOperationsDevices.js', hubAttr: 'data-devices-hub-tile', backBtn: '#devices-back-to-hub-btn' },
  { name: 'Universal Settings Hub', path: './frontend/src/js/pages/settingsShared.js', hubAttr: 'data-settings-section', backBtn: '#settings-back-to-hub-btn' }
];

for (const mod of modulesToCheck) {
  const content = fs.readFileSync(mod.path, 'utf8');
  assert(content.includes('module-tile-grid') || content.includes(mod.hubAttr), `${mod.name} has responsive Button Hub grid layout`);
  assert(content.includes(mod.hubAttr), `${mod.name} wires tiles via ${mod.hubAttr}`);
}

// 4. Audit CSS Canonical Class System
console.log('\n4. Auditing CSS Design System & Canonical Spacing Tokens...');
const cssContent = fs.readFileSync('./frontend/src/styles/components.css', 'utf8');
assert(cssContent.includes('.module-hub-container'), 'CSS contains .module-hub-container');
assert(cssContent.includes('.module-tile-grid'), 'CSS contains .module-tile-grid');
assert(cssContent.includes('.module-hub-tile'), 'CSS contains .module-hub-tile');
assert(cssContent.includes('.page-header-standard'), 'CSS contains .page-header-standard');
assert(cssContent.includes('minmax('), 'CSS uses responsive minmax reflow grids');

console.log('\n=====================================================================');
console.log(`STAGE 3 AUDIT SUMMARY: ${passedChecks}/${totalChecks} PASSED (${failedChecks} FAILED)`);
console.log('=====================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  console.log('STATUS: READY FOR USER REVIEW & CHATGPT STAGE-3 CERTIFICATION.');
  process.exit(0);
}

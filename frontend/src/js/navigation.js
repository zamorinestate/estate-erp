// =============================================================================
// ZAMORIN CAFE ERP — NAVIGATION CONFIGURATION
//
// Per the Global Implementation Governance Layer:
//   - Each role's navigation is built from its OWN configuration.
//   - Items not listed for a role here are unreachable by that role anywhere.
//   - Navigation is structured in logical groups (COMMAND, OPERATIONS, PEOPLE,
//     FINANCE, COMMERCIAL, INSIGHTS, ADMINISTRATION, SYSTEM).
//   - MASTER navigation requires explicit isPrimaryMaster === true.
//     Non-primary/unattested MASTER accounts are retired and fail closed.
//   - User-facing CAFE_ADMIN terminology is "Cafe Operations" / "Operator".
//   - My Profile, My Payslip → Avatar menu / Settings (not main sidebar).
//   - My Payslips, My Loans & Advances → Settings → My Employment (not STAFF sidebar).
//   - Trash Bin → Settings → Data & Recovery (not main sidebar).
//   - Department Orders = University/Department/C/o business orders (NOT kitchen).
//
// route:  the hash route this item renders
// group:  logical section label for the sidebar heading
// =============================================================================

export const ROLES = {
  MASTER: 'master',
  OWNER: 'owner',
  CAFE_ADMIN: 'cafe_admin',
  STAFF: 'staff',
  VENDOR: 'vendor',
};

// ─── Primary Master Navigation ────────────────────────────────────────────────
// Full access — every café, every module, every sensitive finance area.
const PRIMARY_MASTER_ITEMS = [
  // ── COMMAND ─────────────────────────────────────────────────────────────────
  { id: 'dashboard',     label: 'Command Centre',         icon: 'home',         route: 'dashboard',         group: 'COMMAND' },

  // ── OPERATIONS ──────────────────────────────────────────────────────────────
  { id: 'pos',           label: 'POS & Billing',          icon: 'pos',          route: 'pos',               group: 'OPERATIONS' },
  { id: 'inventory',     label: 'Inventory',              icon: 'inventory',    route: 'inventory',         group: 'OPERATIONS' },
  { id: 'procurement',   label: 'Procurement & Orders',   icon: 'procurement',  route: 'procurement',       group: 'OPERATIONS' },
  { id: 'vendors',       label: 'Vendors',                icon: 'vendors',      route: 'vendors',           group: 'OPERATIONS' },
  { id: 'approvals',     label: 'Action Centre',          icon: 'tasks',        route: 'approvals',         group: 'OPERATIONS' },

  // ── FINANCE ─────────────────────────────────────────────────────────────────
  { id: 'sales-cash',    label: 'Sales & Cash Book',      icon: 'finance',      route: 'sales-cash',        group: 'FINANCE' },
  { id: 'expenses',      label: 'Expenses',               icon: 'expenses',     route: 'expenses',          group: 'FINANCE' },
  { id: 'finance',       label: 'Finance & Accounts',     icon: 'finance',      route: 'finance',           group: 'FINANCE' },
  { id: 'ledger',        label: 'Personal Ledger',        icon: 'ledger',       route: 'ledger',            group: 'FINANCE', primaryMasterOnly: true },
  { id: 'revenue-share', label: 'Revenue Share & Outlets', icon: 'revenueShare', route: 'revenue-share',   group: 'FINANCE', primaryMasterOnly: true },

  // ── PEOPLE ──────────────────────────────────────────────────────────────────
  { id: 'attendance',    label: 'Attendance & Shifts',    icon: 'attendance',   route: 'attendance',        group: 'PEOPLE' },
  { id: 'employees',     label: 'Employees',              icon: 'employees',    route: 'employees',         group: 'PEOPLE' },
  { id: 'payroll',       label: 'Payroll',                icon: 'payslip',      route: 'payroll',           group: 'PEOPLE', primaryMasterOnly: true },

  // ── COMMERCIAL ──────────────────────────────────────────────────────────────
  { id: 'menu',          label: 'Menu & Pricing',         icon: 'menuItem',     route: 'menu',              group: 'COMMERCIAL' },

  // ── INSIGHTS ────────────────────────────────────────────────────────────────
  { id: 'reports',       label: 'Reports',                icon: 'reports',      route: 'reports',           group: 'INSIGHTS' },
  { id: 'exports',       label: 'Export Centre',          icon: 'download',     route: 'exports',           group: 'INSIGHTS' },

  // ── ADMINISTRATION ──────────────────────────────────────────────────────────
  { id: 'admin',         label: 'Cafés & Administration', icon: 'admin',        route: 'admin',             group: 'ADMINISTRATION' },

  // ── SYSTEM ──────────────────────────────────────────────────────────────────
  { id: 'settings',      label: 'Settings',               icon: 'settings',     route: 'settings',          group: 'SYSTEM' },
];

export const NAVIGATION = {
  // ── MASTER ───────────────────────────────────────────────────────────────────
  [ROLES.MASTER]: {
    scopeLabel: 'Primary Master View',
    items: PRIMARY_MASTER_ITEMS,
    primaryItems: PRIMARY_MASTER_ITEMS,
    footnote: 'Full operational and financial control across all cafés.',
  },

  // ── OWNER ────────────────────────────────────────────────────────────────────
  [ROLES.OWNER]: {
    scopeLabel: 'Owner Portal',
    items: [
      // ── COMMAND ─────────────────────────────────────────────────────────────────
      { id: 'dashboard',          label: 'Overview',                icon: 'home',         route: 'dashboard',          group: 'COMMAND' },
      { id: 'performance',        label: 'Café Performance',        icon: 'performance',  route: 'performance',        group: 'COMMAND' },

      // ── OPERATIONS ──────────────────────────────────────────────────────────────
      { id: 'inventory',          label: 'Inventory & Stock',       icon: 'inventory',    route: 'inventory',          group: 'OPERATIONS' },
      { id: 'procurement',        label: 'Purchasing & Vendors',    icon: 'procurement',  route: 'procurement',        group: 'OPERATIONS' },
      { id: 'approvals',          label: 'Action Centre',          icon: 'tasks',        route: 'approvals',          group: 'OPERATIONS' },

      // ── FINANCE ─────────────────────────────────────────────────────────────────
      { id: 'sales-cash',         label: 'Sales & Cash Book',       icon: 'finance',      route: 'sales-cash',         group: 'FINANCE' },
      { id: 'expenses',           label: 'Expenses',                icon: 'expenses',     route: 'expenses',           group: 'FINANCE' },
      { id: 'finance',            label: 'Finance Summary',         icon: 'finance',      route: 'finance',            group: 'FINANCE' },
      { id: 'ledger',             label: 'Personal Ledger',         icon: 'ledger',       route: 'ledger',             group: 'FINANCE' },
      { id: 'revenue-share',      label: 'Revenue Share & Outlets', icon: 'revenueShare', route: 'revenue-share',      group: 'FINANCE' },

      // ── PEOPLE ──────────────────────────────────────────────────────────────────
      { id: 'attendance',         label: 'Attendance & Shifts',     icon: 'attendance',   route: 'attendance',         group: 'PEOPLE' },
      { id: 'employees',          label: 'Employees',               icon: 'employees',    route: 'employees',          group: 'PEOPLE' },
      { id: 'payroll',            label: 'Payroll',                 icon: 'payslip',      route: 'payroll',            group: 'PEOPLE' },

      // ── COMMERCIAL ──────────────────────────────────────────────────────────────
      { id: 'owner-menu-pricing', label: 'Menu & Pricing',          icon: 'finance',      route: 'owner-menu-pricing', group: 'COMMERCIAL' },

      // ── INSIGHTS ────────────────────────────────────────────────────────────────
      { id: 'reports',            label: 'Reports',                 icon: 'reports',      route: 'reports',            group: 'INSIGHTS' },
      { id: 'exports',            label: 'Export Centre',           icon: 'download',     route: 'exports',            group: 'INSIGHTS' },

      // ── SYSTEM ──────────────────────────────────────────────────────────────────
      { id: 'settings',           label: 'Settings & Governance',   icon: 'settings',     route: 'settings',           group: 'SYSTEM' },
    ],
    footnote: 'Owner Portal — strategic governance, executive metrics, and café oversight.',
  },

  // ── CAFE ADMIN (CAFE OPERATIONS) ─────────────────────────────────────────────
  [ROLES.CAFE_ADMIN]: {
    scopeLabel: 'Cafe Operations',
    items: [
      // ── COMMAND ─────────────────────────────────────────────────────────────────
      { id: 'dashboard',    label: 'Cafe Operations Dashboard', icon: 'home',       route: 'dashboard',       group: 'COMMAND' },

      // ── OPERATIONS (Store Floor Fast-Lane) ──────────────────────────────────────
      { id: 'pos',          label: 'POS & Billing',           icon: 'pos',          route: 'pos',             group: 'OPERATIONS' },
      { id: 'attendance',   label: 'Attendance & Shifts',     icon: 'attendance',   route: 'attendance',      group: 'OPERATIONS' },
      { id: 'inventory',    label: 'Inventory',               icon: 'inventory',    route: 'inventory',       group: 'OPERATIONS' },
      { id: 'procurement',  label: 'Procurement',             icon: 'procurement',  route: 'procurement',     group: 'OPERATIONS' },
      { id: 'vendors',      label: 'Vendors',                 icon: 'vendors',      route: 'vendors',         group: 'OPERATIONS' },
      { id: 'dept-orders',  label: 'Department Orders',       icon: 'deptOrders',   route: 'dept-orders',     group: 'OPERATIONS' },

      // ── FINANCE & CASH ──────────────────────────────────────────────────────────
      { id: 'sales-cash',   label: 'Sales & Cash',            icon: 'finance',      route: 'sales-cash',      group: 'FINANCE' },
      { id: 'expenses',     label: 'Expenses',                icon: 'expenses',     route: 'expenses',        group: 'FINANCE' },

      // ── STORE SUPPORT & COMPLIANCE ──────────────────────────────────────────────
      { id: 'customers',    label: 'Customers & Loyalty',     icon: 'customers',    route: 'customers',       group: 'SUPPORT' },
      { id: 'tasks',        label: 'Action Centre',           icon: 'tasks',        route: 'tasks',           group: 'SUPPORT' },
      { id: 'reports',      label: 'Reports (this café)',      icon: 'reports',      route: 'reports',         group: 'SUPPORT' },
      { id: 'quality',      label: 'Quality & Compliance',    icon: 'quality',      route: 'quality',         group: 'SUPPORT' },
      { id: 'assets',       label: 'Assets & Maintenance',    icon: 'assets',       route: 'assets',          group: 'SUPPORT' },

      // ── SYSTEM ───────────────────────────────────────────────────────────────────
      { id: 'cafe-ops-devices', label: 'Devices & Sessions',  icon: 'devices',      route: 'cafe-ops-devices',group: 'SYSTEM' },
      { id: 'settings',     label: 'Settings',                icon: 'settings',     route: 'settings',        group: 'SYSTEM' },
    ],
    footnote: 'Cafe-owned trusted device operational workspace. Operator sessions & device context.',
  },

  // ── STAFF ────────────────────────────────────────────────────────────────────
  [ROLES.STAFF]: {
    scopeLabel: null,
    items: [
      { id: 'home',          label: 'Home',           icon: 'home',       route: 'staff-home',       group: 'COMMAND' },
      { id: 'announcements', label: 'Announcements',  icon: 'announce',   route: 'announcements',    group: 'COMMAND' },
      { id: 'attendance',    label: 'My Attendance',  icon: 'attendance', route: 'staff-attendance', group: 'SELF' },
      { id: 'leave',         label: 'My Leave',       icon: 'calendar',   route: 'staff-leave',      group: 'SELF' },
      { id: 'settings',      label: 'Settings',       icon: 'settings',   route: 'staff-settings',   group: 'SYSTEM' },
    ],
    footnote: 'Self-service only. Payslips & Loans are inside Settings.',
  },

  // ── VENDOR (EXTERNAL VISIBILITY USER) ─────────────────────────────────────────
  [ROLES.VENDOR]: {
    scopeLabel: 'Vendor Portal (Read-Only)',
    items: [
      { id: 'vendor-dashboard', label: 'Vendor Overview', icon: 'home', route: 'vendor-dashboard', group: 'WORKSPACE' },
      { id: 'vendor-orders', label: 'Purchase Orders', icon: 'procurement', route: 'vendor-orders', group: 'WORKSPACE' },
      { id: 'vendor-deliveries', label: 'Deliveries & GRN', icon: 'shipping', route: 'vendor-deliveries', group: 'WORKSPACE' },
      { id: 'vendor-invoices', label: 'Invoices', icon: 'finance', route: 'vendor-invoices', group: 'WORKSPACE' },
      { id: 'vendor-payments', label: 'Payments & Balance', icon: 'finance', route: 'vendor-payments', group: 'WORKSPACE' },
      { id: 'vendor-statement', label: 'Account Statement', icon: 'reports', route: 'vendor-statement', group: 'WORKSPACE' },
      { id: 'vendor-receivables', label: 'Outstanding & Ageing', icon: 'finance', route: 'vendor-receivables', group: 'WORKSPACE' },
      { id: 'vendor-adjustments', label: 'Returns & Adjustments', icon: 'tasks', route: 'vendor-adjustments', group: 'WORKSPACE' },
      { id: 'vendor-products', label: 'Products & Pricing', icon: 'inventory', route: 'vendor-products', group: 'WORKSPACE' },
      { id: 'vendor-documents', label: 'Documents Centre', icon: 'documents', route: 'vendor-documents', group: 'WORKSPACE' },
      { id: 'vendor-reports', label: 'Commercial Reports', icon: 'reports', route: 'vendor-reports', group: 'WORKSPACE' },
      { id: 'vendor-notifications', label: 'Notifications & Alerts', icon: 'announce', route: 'vendor-notifications', group: 'WORKSPACE' },
      { id: 'vendor-profile', label: 'Vendor Profile', icon: 'settings', route: 'vendor-profile', group: 'WORKSPACE' },
    ],
    footnote: 'READ-ONLY VENDOR ACCESS — External visibility into authorized transactions.',
  },
};

// ── Routes exclusively accessible only to Primary Master (for MASTER role) ───
export const PRIMARY_MASTER_ONLY_ROUTES = new Set([
  'passbook',
  'ledger',
  'payroll',
  'revenue-share',
  'org-identity',
  'organisation-identity',
  'mailops',
  'exports',
  'export-centre',
]);

// ─── Implicit routes — not in sidebar but accessible to all authenticated users ─
// These are auth-context / device-state screens that any authenticated role may
// reach (e.g. kiosk mode, operator sign-in, device blocked screens).
const IMPLICIT_ROUTES_ALL = new Set([
  'notifications',
  'kiosk-attendance',
  'staff-attendance',
  'staff-leave',
  'staff-payslips',
  'staff-loans-advances',
  'staff-documents',
  'staff-settings',
  'staff-home',
  'announcements',
  'employee-profile',
  'design-system',
]);

// Implicit routes specific to CAFE_ADMIN — auth-context pages (not sidebar items)
const IMPLICIT_ROUTES_CAFE_ADMIN = new Set([
  'cafe-operator-signin',
  'cafe-device-state',
  // Stage-2 Login Integration: additive terminal auth screens
  'cafe-master-signin',
  'cafe-device-enroll',
  'cafe-terminal-welcome',
]);

// ─── Route allowlist check ─────────────────────────────────────────────────────
export function isRouteAllowed(rawRole, rawRoute, isPrimaryMaster = false) {
  const cleanRole = String(rawRole || '').toLowerCase();
  const role = (cleanRole === 'admin' || cleanRole === 'cafe_admin') ? ROLES.CAFE_ADMIN : cleanRole;
  const cleanRoute = (rawRoute || '').replace(/^#/, '');
  const route = cleanRoute.split('?')[0];
  const pathOnly = route ? route.split('?')[0] : '';
  const baseRoute = pathOnly ? pathOnly.split('/')[0] : '';

  // STRICT VENDOR ROUTE ISOLATION:
  // Vendor users operate under a dedicated external visibility boundary.
  // They must NEVER inherit internal employee implicit routes (e.g. staff attendance,
  // payslips, leave, settings) or any other internal operational routes.
  if (String(role || '').toLowerCase() === 'vendor') {
    const navConfig = NAVIGATION[ROLES.VENDOR];
    const allowed = (navConfig?.items || []).map((i) => i.route);
    const VENDOR_ALLOWED_ROUTES = new Set([
      ...allowed,
      'vendor-dashboard',
      'vendor/dashboard',
      'vendor-orders',
      'vendor/orders',
      'vendor-deliveries',
      'vendor/deliveries',
      'vendor-grns',
      'vendor/grns',
      'vendor-invoices',
      'vendor/invoices',
      'vendor-payments',
      'vendor/payments',
      'vendor-statement',
      'vendor/statement',
      'vendor-receivables',
      'vendor/receivables',
      'vendor-adjustments',
      'vendor/adjustments',
      'vendor-returns',
      'vendor/returns',
      'vendor-products',
      'vendor/products',
      'vendor-pricing',
      'vendor/pricing',
      'vendor-documents',
      'vendor/documents',
      'vendor-reports',
      'vendor/reports',
      'vendor-notifications',
      'vendor/notifications',
      'vendor-profile',
      'vendor/profile',
    ]);
    return VENDOR_ALLOWED_ROUTES.has(route);
  }

  // MASTER is a valid application persona only when explicitly attested as Primary Master.
  // This check intentionally precedes implicit-route handling so retired/unattested
  // MASTER accounts cannot inherit notifications, staff aliases, settings, or deep links.
  if (role === ROLES.MASTER && isPrimaryMaster !== true) {
    return false;
  }

  // Implicit routes allowed for all authenticated internal roles
  if (IMPLICIT_ROUTES_ALL.has(route)) return true;

  // Primary Master has 100% universal unrestricted access to every route and module
  if ((role === ROLES.MASTER || role === 'master') && isPrimaryMaster) {
    return true;
  }

  // Implicit CAFE_ADMIN auth-context routes
  if (role === ROLES.CAFE_ADMIN && IMPLICIT_ROUTES_CAFE_ADMIN.has(route)) return true;

  // Settings subroutes and universal profile/employment aliases
  if (
    route === "employee-profile" ||
    route === "profile" ||
    route === "my-profile" ||
    route === "employment" ||
    route === "my-employment"
  ) {
    return true;
  }

  if (route.startsWith("settings/")) {
    const sub = route.slice("settings/".length).toLowerCase();
    if (role === ROLES.STAFF || role === 'staff') {
      const STAFF_ALLOWED_SETTINGS = new Set([
        'profile',
        'security',
        'devices',
        'notifications',
        'appearance',
        'accessibility',
        'language',
        'help',
        'privacy',
      ]);
      return STAFF_ALLOWED_SETTINGS.has(sub);
    }
    // Organisation governance / trash subroutes are restricted to MASTER
    if (sub === "trash" || sub === "data-recovery" || sub === "admin" || sub === "system-administration" || sub === "templates") {
      return role === ROLES.MASTER && isPrimaryMaster === true;
    }
    // All personal preference and identity subroutes are accessible to all authenticated profiles
    return true;
  }

  // OF03: Allow OWNER read-only drill-down and consolidated module access for assigned cafés
  if (role === ROLES.OWNER || role === 'owner') {
    const OWNER_OPERATIONAL_DRILLDOWN_ROUTES = new Set([
      'dept-orders',
      'inventory',
      'procurement',
      'vendors',
      'expenses',
      'customers',
      'bills',
      'passbook',
      'tasks',
      'approvals',
      'exports',
      'export-centre',
      'cafe-ops-devices',
      'system-health',
      'owner-menu-pricing',
      'owner-customer-loyalty',
      'owner-supplier-intelligence',
      'owner-complaints',
      'owner-food-safety',
      'owner-utilities',
      'owner-utilities-waste',
      'owner-planning',
      'owner-risk-audit',
      'owner-compliance',
      'owner-asset-reliability',
      'owner-academy',
      'owner-master-data',
      'owner-governance',
      'owner-governance-delegation',
      'owner-bcdr',
      'owner-privacy-cyber',
    ]);
    if (
      OWNER_OPERATIONAL_DRILLDOWN_ROUTES.has(route) ||
      OWNER_OPERATIONAL_DRILLDOWN_ROUTES.has(pathOnly) ||
      OWNER_OPERATIONAL_DRILLDOWN_ROUTES.has(baseRoute)
    ) {
      return true;
    }
  }

  const navConfig = NAVIGATION[role];
  if (!navConfig) return false;

  // For MASTER: Primary Master is the sole system master
  let items;
  if (role === ROLES.MASTER) {
    items = navConfig.primaryItems || navConfig.items || [];
  } else {
    items = navConfig.items || [];
  }

  const routeAliases = {
    'devices': 'cafe-ops-devices',
    'cafe-ops-devices': 'devices',
    'tasks': 'approvals',
    'approvals': 'tasks',
    'personal-ledger': 'ledger',
    'ledger': 'personal-ledger',
    'org-identity': 'admin',
    'organisation-identity': 'admin',
    'performance': 'dashboard',
    'settings': 'staff-settings',
    'staff-settings': 'settings',
    'trash': 'admin',
    'exports': 'export-centre',
    'export-centre': 'exports',
    'export': 'exports',
  };



  const allowed = items.map((i) => i.route);

  // Check direct route match or base module match or alias match
  return Boolean(
    allowed.includes(pathOnly) ||
    allowed.includes(route) ||
    (baseRoute && allowed.includes(baseRoute)) ||
    (routeAliases[pathOnly] && allowed.includes(routeAliases[pathOnly])) ||
    (routeAliases[route] && allowed.includes(routeAliases[route])) ||
    (routeAliases[baseRoute] && allowed.includes(routeAliases[baseRoute]))
  );
}

// ─── Grouped navigation for sidebar rendering ─────────────────────────────────
export function getGroupedNavItems(role, isPrimaryMaster = false) {
  const navConfig = NAVIGATION[role];
  if (!navConfig) return {};
  if (role === ROLES.MASTER && isPrimaryMaster !== true) return {};

  const items = navConfig.items || navConfig.primaryItems || [];

  const groups = {};
  for (const item of items) {
    const groupKey = item.group || 'OTHER';
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
  }
  return groups;
}

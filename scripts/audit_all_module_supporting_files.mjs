// =============================================================================
// ZAMORIN CAFÉ ERP — APPLICATION-WIDE SUPPORTING FILE INTEGRATION
// CANONICAL ALL-MODULE SUPPORTING FILE AUDIT & MANIFEST GENERATOR
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const ERP_MODULES = [
  {
    id: 'DASHBOARD_PRIMARY_MASTER',
    name: 'Primary Master Command Centre Dashboard',
    family: 'Dashboard',
    personas: ['MASTER'],
    route: '#dashboard-master',
    frontendFile: 'frontend/src/js/pages/dashboardMaster.js',
    backendRoute: 'backend/src/routes/dashboardRoutes.js',
    controller: 'backend/src/controllers/dashboardController.js',
    exportSupport: 'ZURF_PDF',
    uploadSupport: 'NOT_APPLICABLE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['VIEW_PORTFOLIO_DASHBOARD', 'VIEW_FINANCIAL_TOTALS'],
    testOwnership: 'backend/test/dashboardCommandCentre.test.js'
  },
  {
    id: 'DASHBOARD_OWNER',
    name: 'Owner Portfolio Dashboard',
    family: 'Dashboard',
    personas: ['OWNER'],
    route: '#dashboard-owner',
    frontendFile: 'frontend/src/js/pages/dashboardOwner.js',
    backendRoute: 'backend/src/routes/dashboardRoutes.js',
    controller: 'backend/src/controllers/dashboardController.js',
    exportSupport: 'ZURF_PDF',
    uploadSupport: 'NOT_APPLICABLE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['VIEW_OWNER_DASHBOARD'],
    testOwnership: 'backend/test/ownerDashboardControl.test.js'
  },
  {
    id: 'DASHBOARD_CAFE_OPS',
    name: 'Cafe Operations Shift Dashboard',
    family: 'Dashboard',
    personas: ['CAFE_ADMIN'],
    route: '#dashboard-admin',
    frontendFile: 'frontend/src/js/pages/dashboardAdmin.js',
    backendRoute: 'backend/src/routes/dashboardRoutes.js',
    controller: 'backend/src/controllers/dashboardController.js',
    exportSupport: 'ZURF_PDF',
    uploadSupport: 'NOT_APPLICABLE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['VIEW_CAFE_DASHBOARD'],
    testOwnership: 'backend/test/cafeOperationsFoundation.test.js'
  },
  {
    id: 'STAFF_HOME',
    name: 'Staff / Employee Self-Service Home',
    family: 'Staff Self-Service',
    personas: ['STAFF'],
    route: '#staff-home',
    frontendFile: 'frontend/src/js/pages/staffHome.js',
    backendRoute: 'backend/src/routes/employeeRoutes.js',
    controller: 'backend/src/controllers/employeeController.js',
    exportSupport: 'NOT_APPLICABLE',
    uploadSupport: 'STAFF_DOCUMENTS',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['VIEW_SELF_PROFILE', 'VIEW_SELF_ATTENDANCE'],
    testOwnership: 'backend/test/employeeStaffDashboard.test.js'
  },
  {
    id: 'POS_BILLING',
    name: 'POS Billing, Till & Orders Terminal',
    family: 'POS & Orders',
    personas: ['CAFE_ADMIN', 'MASTER', 'OWNER'],
    route: '#pos-till',
    frontendFile: 'frontend/src/js/pages/posTill.js',
    backendRoute: 'backend/src/routes/billRoutes.js',
    controller: 'backend/src/controllers/billController.js',
    exportSupport: 'THERMAL_RECEIPT_PDF',
    uploadSupport: 'NOT_APPLICABLE',
    receiptSupport: 'POS_CUSTOMER_RECEIPT',
    permissions: ['CREATE_POS_BILL', 'VIEW_POS_TILL'],
    testOwnership: 'backend/test/posBillingTerminal.test.js'
  },
  {
    id: 'SALES_CASH_BOOK',
    name: 'Sales & Cash Book Management',
    family: 'Sales & Cash',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#cash-book',
    frontendFile: 'frontend/src/js/pages/cashBook.js',
    backendRoute: 'backend/src/routes/cashRoutes.js',
    controller: 'backend/src/controllers/cashController.js',
    exportSupport: 'CSV_XLSX_PDF',
    uploadSupport: 'DENOMINATION_EVIDENCE',
    receiptSupport: 'CASH_RECEIPT',
    permissions: ['VIEW_CASH_BOOK', 'MANAGE_FLOAT'],
    testOwnership: 'backend/test/businessModules.test.js'
  },
  {
    id: 'ATTENDANCE_SHIFTS',
    name: 'Attendance, Timeclock & Shifts',
    family: 'Attendance',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    route: '#cafe-attendance-display',
    frontendFile: 'frontend/src/js/pages/cafeAttendanceDisplay.js',
    backendRoute: 'backend/src/modules/attendance/attendanceRoutes.js',
    controller: 'backend/src/modules/attendance/attendanceController.js',
    exportSupport: 'CSV_XLSX',
    uploadSupport: 'NOT_APPLICABLE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['RECORD_ATTENDANCE', 'VIEW_ATTENDANCE_ROSTER'],
    testOwnership: 'backend/test/attendanceManagement.test.js'
  },
  {
    id: 'INVENTORY_STOCK',
    name: 'Inventory, Stock Register & FIFO Lots',
    family: 'Inventory',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#inventory',
    frontendFile: 'frontend/src/js/pages/inventory.js',
    backendRoute: 'backend/src/routes/inventoryRoutes.js',
    controller: 'backend/src/controllers/inventoryController.js',
    exportSupport: 'CSV_XLSX_PDF',
    uploadSupport: 'BATCH_IMPORT_CSV',
    receiptSupport: 'STOCK_TRANSFER_NOTE',
    permissions: ['VIEW_INVENTORY', 'MANAGE_STOCK_ADJUSTMENT'],
    testOwnership: 'backend/test/inventoryStockManagement.test.js'
  },
  {
    id: 'PROCUREMENT_PURCHASING',
    name: 'Procurement, Purchase Orders & 3-Way Match',
    family: 'Procurement',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#procurement',
    frontendFile: 'frontend/src/js/pages/procurement.js',
    backendRoute: 'backend/src/routes/procurementRoutes.js',
    controller: 'backend/src/controllers/procurementController.js',
    exportSupport: 'PURCHASE_ORDER_PDF',
    uploadSupport: 'SUPPLIER_INVOICE_GRN',
    receiptSupport: 'GOODS_RECEIPT_NOTE',
    permissions: ['CREATE_PURCHASE_ORDER', 'APPROVE_PURCHASE_ORDER'],
    testOwnership: 'backend/test/businessModules.test.js'
  },
  {
    id: 'ASSETS_MAINTENANCE',
    name: 'Asset Register, Preventive Maintenance & PM 360',
    family: 'Assets',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#assets',
    frontendFile: 'frontend/src/js/pages/assets.js',
    backendRoute: 'backend/src/routes/assetRoutes.js',
    controller: 'backend/src/controllers/assetController.js',
    exportSupport: 'ASSET_REGISTER_PDF',
    uploadSupport: 'ASSET_MANUALS_INVOICES',
    receiptSupport: 'MAINTENANCE_SERVICE_SLIP',
    permissions: ['VIEW_ASSETS', 'MANAGE_MAINTENANCE'],
    testOwnership: 'backend/test/assetManagement.test.js'
  },
  {
    id: 'QUALITY_FSMS',
    name: 'Quality, Food Safety (FSMS), Cleaning & Checklists',
    family: 'Quality & Safety',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#quality',
    frontendFile: 'frontend/src/js/pages/quality.js',
    backendRoute: 'backend/src/routes/qualityRoutes.js',
    controller: 'backend/src/controllers/qualityController.js',
    exportSupport: 'AUDIT_REPORT_PDF',
    uploadSupport: 'INSPECTION_PHOTO_EVIDENCE',
    receiptSupport: 'COMPLIANCE_CERTIFICATE',
    permissions: ['VIEW_QUALITY_LOGS', 'SUBMIT_CHECKLIST'],
    testOwnership: 'backend/test/businessModules.test.js'
  },
  {
    id: 'EMPLOYEES_WORKFORCE',
    name: 'Employee Directory & Workforce HRIS',
    family: 'Workforce HRIS',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#employees',
    frontendFile: 'frontend/src/js/pages/employees.js',
    backendRoute: 'backend/src/routes/employeeRoutes.js',
    controller: 'backend/src/controllers/employeeController.js',
    exportSupport: 'EMPLOYEE_ROSTER_XLSX',
    uploadSupport: 'KYC_EMPLOYMENT_DOCUMENTS',
    receiptSupport: 'EMPLOYMENT_OFFER_LETTER',
    permissions: ['VIEW_EMPLOYEE_DIRECTORY', 'MANAGE_EMPLOYEES'],
    testOwnership: 'backend/test/employeeWorkforceManagement.test.js'
  },
  {
    id: 'PAYROLL_MANAGEMENT',
    name: 'Payroll Control, Statutory Rules & Payslips',
    family: 'Payroll',
    personas: ['MASTER'],
    route: '#payroll-management',
    frontendFile: 'frontend/src/js/pages/payrollManagement.js',
    backendRoute: 'backend/src/routes/payrollRoutes.js',
    controller: 'backend/src/controllers/payrollController.js',
    exportSupport: 'PAYSLIP_PDF_XLSX',
    uploadSupport: 'BANK_DISBURSEMENT_REPORT',
    receiptSupport: 'PAYSLIP_RECEIPT',
    permissions: ['MANAGE_PAYROLL_RUN', 'VIEW_PAYROLL_REPORTS'],
    testOwnership: 'backend/test/payrollMasterControl.test.js'
  },
  {
    id: 'OWNER_BILLS_RECEIPTS',
    name: 'Owner Bills, Receipts & Invoice Attachment Viewer',
    family: 'Bills & Receipts',
    personas: ['OWNER', 'MASTER'],
    route: '#owner-bills',
    frontendFile: 'frontend/src/js/pages/ownerBills.js',
    backendRoute: 'backend/src/routes/billRoutes.js',
    controller: 'backend/src/controllers/billController.js',
    exportSupport: 'BILLS_LEDGER_PDF',
    uploadSupport: 'BILL_RECEIPT_ATTACHMENTS',
    receiptSupport: 'VENDOR_BILL_RECEIPT',
    permissions: ['VIEW_OWNER_BILLS', 'UPLOAD_RECEIPTS'],
    testOwnership: 'backend/test/ownerSalesBills.test.js'
  },
  {
    id: 'EXPENSES_PETTY_CASH',
    name: 'Expense Vouchers, Approvals & Petty Cash',
    family: 'Expenses',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#expenses',
    frontendFile: 'frontend/src/js/pages/expenses.js',
    backendRoute: 'backend/src/routes/expenseRoutes.js',
    controller: 'backend/src/controllers/expenseController.js',
    exportSupport: 'EXPENSE_STATEMENT_PDF',
    uploadSupport: 'EXPENSE_RECEIPT_PHOTO',
    receiptSupport: 'PETTY_CASH_VOUCHER',
    permissions: ['VIEW_EXPENSES', 'CREATE_EXPENSE_CLAIM'],
    testOwnership: 'backend/test/expenseManagement.test.js'
  },
  {
    id: 'FINANCE_ACCOUNTS',
    name: 'Finance Hub, General Ledger, Journals & AP/AR',
    family: 'Finance',
    personas: ['MASTER'],
    route: '#finance-accounts',
    frontendFile: 'frontend/src/js/pages/financeAccounts.js',
    backendRoute: 'backend/src/routes/financeRoutes.js',
    controller: 'backend/src/controllers/financeController.js',
    exportSupport: 'FINANCIAL_STATEMENTS_PDF_XLSX',
    uploadSupport: 'BANK_STATEMENT_IMPORT',
    receiptSupport: 'JOURNAL_POSTING_VOUCHER',
    permissions: ['VIEW_GENERAL_LEDGER', 'POST_JOURNAL_ENTRY'],
    testOwnership: 'backend/test/financeAccounting.test.js'
  },
  {
    id: 'PERSONAL_LEDGER',
    name: 'Primary Master Personal Ledger & Owner Settlements',
    family: 'Treasury & Personal Ledger',
    personas: ['MASTER', 'OWNER'],
    route: '#personal-ledger',
    frontendFile: 'frontend/src/js/pages/personalLedger.js',
    backendRoute: 'backend/src/routes/personalLedgerRoutes.js',
    controller: 'backend/src/controllers/personalLedgerController.js',
    exportSupport: 'LEDGER_STATEMENT_PDF',
    uploadSupport: 'SETTLEMENT_CONFIRMATION_PROOF',
    receiptSupport: 'SETTLEMENT_ACKNOWLEDGEMENT',
    permissions: ['ACCESS_PERSONAL_LEDGER'],
    testOwnership: 'backend/test/personalLedgerMasterControl.test.js'
  },
  {
    id: 'PASSBOOK_TREASURY',
    name: 'Passbook & Multi-Account Treasury Vault',
    family: 'Treasury & Personal Ledger',
    personas: ['MASTER', 'OWNER'],
    route: '#passbook',
    frontendFile: 'frontend/src/js/pages/passbook.js',
    backendRoute: 'backend/src/routes/passbookRoutes.js',
    controller: 'backend/src/controllers/passbookController.js',
    exportSupport: 'PASSBOOK_STATEMENT_PDF_XLSX_CSV',
    uploadSupport: 'BANK_STATEMENT_CSV',
    receiptSupport: 'TREASURY_TRANSFER_RECEIPT',
    permissions: ['VIEW_PASSBOOK', 'PERFORM_PASSBOOK_TRANSFER'],
    testOwnership: 'backend/test/passbookTreasury.test.js'
  },
  {
    id: 'CUSTOMERS_LOYALTY',
    name: 'Customer Directory, 360 & Loyalty Points Ledger',
    family: 'Customers & Loyalty',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#customers',
    frontendFile: 'frontend/src/js/pages/customers.js',
    backendRoute: 'backend/src/routes/customerRoutes.js',
    controller: 'backend/src/controllers/customerController.js',
    exportSupport: 'CUSTOMER_LEDGER_CSV',
    uploadSupport: 'CUSTOMER_IMPORT_CSV',
    receiptSupport: 'LOYALTY_REDEMPTION_SLIP',
    permissions: ['VIEW_CUSTOMERS', 'MANAGE_LOYALTY_POINTS'],
    testOwnership: 'backend/test/customerLoyaltyManagement.test.js'
  },
  {
    id: 'MENU_RECIPE',
    name: 'Global Menu Master, BOM Recipes & Pricing',
    family: 'Menu & Recipes',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#menu-management',
    frontendFile: 'frontend/src/js/pages/menuManagement.js',
    backendRoute: 'backend/src/routes/menuRoutes.js',
    controller: 'backend/src/controllers/menuController.js',
    exportSupport: 'MENU_CATALOGUE_PDF',
    uploadSupport: 'ITEM_IMAGE_ASSETS',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['VIEW_MENU', 'MANAGE_RECIPES'],
    testOwnership: 'backend/test/menuRecipeManagement.test.js'
  },
  {
    id: 'SUPPLIERS_VENDORS',
    name: 'Supplier Directory, Onboarding & Bank Maker-Checker',
    family: 'Vendors',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#vendors',
    frontendFile: 'frontend/src/js/pages/vendors.js',
    backendRoute: 'backend/src/routes/vendorRoutes.js',
    controller: 'backend/src/controllers/vendorController.js',
    exportSupport: 'VENDOR_LIST_XLSX',
    uploadSupport: 'VENDOR_GSTIN_BANK_PROOFS',
    receiptSupport: 'VENDOR_ONBOARDING_LETTER',
    permissions: ['VIEW_VENDORS', 'MANAGE_VENDOR_PROFILES'],
    testOwnership: 'backend/test/businessModules.test.js'
  },
  {
    id: 'REVENUE_SHARE',
    name: 'Revenue Share & Leased Outlet Agreements',
    family: 'Revenue Share',
    personas: ['MASTER', 'OWNER'],
    route: '#revenue-share',
    frontendFile: 'frontend/src/js/pages/revenueShare.js',
    backendRoute: 'backend/src/routes/revenueShareRoutes.js',
    controller: 'backend/src/controllers/revenueShareController.js',
    exportSupport: 'SETTLEMENT_REPORT_PDF',
    uploadSupport: 'AGREEMENT_CONTRACT_PDF',
    receiptSupport: 'REVENUE_SHARE_SETTLEMENT_INVOICE',
    permissions: ['VIEW_REVENUE_SHARE', 'MANAGE_REVENUE_SHARE'],
    testOwnership: 'backend/test/businessModules.test.js'
  },
  {
    id: 'TASKS_APPROVALS',
    name: 'Operational Tasks, Approvals & Oversight Queue',
    family: 'Tasks & Oversight',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#tasks-approvals',
    frontendFile: 'frontend/src/js/pages/tasksApprovals.js',
    backendRoute: 'backend/src/routes/taskRoutes.js',
    controller: 'backend/src/controllers/taskController.js',
    exportSupport: 'TASK_SUMMARY_PDF',
    uploadSupport: 'TASK_COMPLETION_EVIDENCE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['VIEW_TASKS', 'ASSIGN_TASKS'],
    testOwnership: 'backend/test/businessModules.test.js'
  },
  {
    id: 'REPORTS_ANALYTICS',
    name: 'Reports & Analytics Control Centre / ZURF Export',
    family: 'Reports & Analytics',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#reports-analytics',
    frontendFile: 'frontend/src/js/pages/reportsAnalytics.js',
    backendRoute: 'backend/src/routes/reportRoutes.js',
    controller: 'backend/src/controllers/reportController.js',
    exportSupport: 'ZURF_FULL_SUITE_PDF_XLSX_CSV',
    uploadSupport: 'NOT_APPLICABLE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['VIEW_REPORTS', 'EXPORT_GOVERNED_REPORTS'],
    testOwnership: 'backend/test/ownerReportsAnalyticsParity.test.js'
  },
  {
    id: 'ADMINISTRATION_GOVERNANCE',
    name: 'System Administration, Roles, Users & Cafe Setup',
    family: 'Administration',
    personas: ['MASTER'],
    route: '#administration',
    frontendFile: 'frontend/src/js/pages/administration.js',
    backendRoute: 'backend/src/routes/adminRoutes.js',
    controller: 'backend/src/controllers/adminGovernanceController.js',
    exportSupport: 'SYSTEM_AUDIT_LOG_CSV',
    uploadSupport: 'NOT_APPLICABLE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['MANAGE_ORGANISATION', 'MANAGE_ROLES'],
    testOwnership: 'backend/test/adminGovernance.test.js'
  },
  {
    id: 'DEVICES_SESSIONS',
    name: 'Cafe Operations Device Trust & Session Management',
    family: 'Devices & Sessions',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN'],
    route: '#cafe-operations-devices',
    frontendFile: 'frontend/src/js/pages/cafeOperationsDevices.js',
    backendRoute: 'backend/src/routes/deviceRoutes.js',
    controller: 'backend/src/controllers/deviceController.js',
    exportSupport: 'DEVICE_SECURITY_AUDIT_PDF',
    uploadSupport: 'NOT_APPLICABLE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['MANAGE_DEVICES', 'VIEW_DEVICE_REGISTRY'],
    testOwnership: 'backend/test/deviceBoundAttendanceFinal.test.js'
  },
  {
    id: 'SETTINGS_PROFILE',
    name: 'Universal User Settings, Account & Preferences',
    family: 'Settings & Profile',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    route: '#settings-profile',
    frontendFile: 'frontend/src/js/pages/settingsShared.js',
    backendRoute: 'backend/src/routes/settingsRoutes.js',
    controller: 'backend/src/controllers/settingsController.js',
    exportSupport: 'GDPR_DATA_EXPORT_JSON',
    uploadSupport: 'AVATAR_IMAGE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['VIEW_SETTINGS', 'EDIT_PROFILE'],
    testOwnership: 'backend/test/employeeProfileApi.test.js'
  },
  {
    id: 'TRASH_SOFT_DELETE',
    name: 'Trash Bin & Governed 30-Day Soft-Delete Retention',
    family: 'Administration',
    personas: ['MASTER'],
    route: '#trash-bin',
    frontendFile: 'frontend/src/js/pages/trashBin.js',
    backendRoute: 'backend/src/routes/trashRoutes.js',
    controller: 'backend/src/controllers/trashController.js',
    exportSupport: 'PURGE_LOG_CSV',
    uploadSupport: 'NOT_APPLICABLE',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['RESTORE_TRASH', 'PURGE_TRASH'],
    testOwnership: 'backend/test/businessModules.test.js'
  },
  {
    id: 'ANNOUNCEMENTS',
    name: 'Corporate Announcements & Communications',
    family: 'Communications',
    personas: ['MASTER', 'OWNER', 'CAFE_ADMIN', 'STAFF'],
    route: '#announcements',
    frontendFile: 'frontend/src/js/pages/announcements.js',
    backendRoute: 'backend/src/routes/notificationRoutes.js',
    controller: 'backend/src/controllers/notificationController.js',
    exportSupport: 'NOT_APPLICABLE',
    uploadSupport: 'ANNOUNCEMENT_ATTACHMENT',
    receiptSupport: 'NOT_APPLICABLE',
    permissions: ['VIEW_ANNOUNCEMENTS'],
    testOwnership: 'backend/test/businessModules.test.js'
  }
];

async function runAllModuleSupportingFilesAudit() {
  console.log('=============================================================================');
  console.log('   ZAMORIN CAFÉ ERP — ALL-MODULE SUPPORTING FILE AUDIT');
  console.log('=============================================================================\n');

  let totalDiscovered = ERP_MODULES.length;
  let totalAudited = 0;
  let totalPass = 0;
  let totalFailed = 0;
  let manifestRecords = [];

  for (const mod of ERP_MODULES) {
    totalAudited++;
    let errors = [];

    // Verify frontend file exists
    const fePath = path.join(ROOT_DIR, mod.frontendFile);
    if (!fs.existsSync(fePath)) {
      errors.push(`Frontend file missing: ${mod.frontendFile}`);
    }

    // Verify backend route exists
    const beRoutePath = path.join(ROOT_DIR, mod.backendRoute);
    if (!fs.existsSync(beRoutePath)) {
      errors.push(`Backend route file missing: ${mod.backendRoute}`);
    }

    // Verify backend controller exists
    const beCtrlPath = path.join(ROOT_DIR, mod.controller);
    if (!fs.existsSync(beCtrlPath)) {
      errors.push(`Backend controller file missing: ${mod.controller}`);
    }

    // Verify test ownership file exists
    const testPath = path.join(ROOT_DIR, mod.testOwnership);
    if (!fs.existsSync(testPath)) {
      errors.push(`Test ownership file missing: ${mod.testOwnership}`);
    }

    const status = errors.length === 0 ? 'PASS' : 'FAIL';
    if (status === 'PASS') {
      totalPass++;
    } else {
      totalFailed++;
    }

    manifestRecords.push({
      ...mod,
      status,
      errors
    });
  }

  // Save runtime support manifest artifact
  const artifactDir = path.join(ROOT_DIR, 'artifacts');
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactDir, 'runtime_support_manifest.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      totalModules: totalDiscovered,
      passedModules: totalPass,
      failedModules: totalFailed,
      modules: manifestRecords
    }, null, 2),
    'utf8'
  );

  console.log(`▶ Total Modules Discovered: ${totalDiscovered}`);
  console.log(`▶ Total Modules Audited: ${totalAudited}`);
  console.log(`▶ Passed: ${totalPass} / ${totalAudited}`);
  console.log(`▶ Failed: ${totalFailed}`);
  console.log(`▶ Runtime support manifest written to artifacts/runtime_support_manifest.json\n`);

  assert.strictEqual(totalFailed, 0, 'TOTAL_FAILED must equal 0');
  assert.strictEqual(totalPass, totalDiscovered, 'All discovered modules must pass support file audit');

  console.log('✅ ALL MODULE SUPPORTING FILE AUDIT PASSED — 100% complete dependency closure.\n');
}

runAllModuleSupportingFilesAudit().catch(err => {
  console.error('\n❌ ALL MODULE AUDIT FAILED:');
  console.error(err);
  process.exit(1);
});

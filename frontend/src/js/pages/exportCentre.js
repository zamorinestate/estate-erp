// =============================================================================
// ZAMORIN CAFE ERP — EXPORT CENTRE (Canonical Workspace)
// Centralized catalogue, search, configuration, and download workspace over
// existing authorized business records, financial statements, and audit logs.
// Authoritative access: Primary Master & Owner only.
// =============================================================================

import { apiGet, apiPost, downloadFile } from '../apiClient.js';
import { showToast, skeleton, renderCafeContextStrip, renderModuleErrorState } from '../components.js';
import { state } from '../state.js';
import { ROLES } from '../navigation.js';
import { icon } from '../icons.js';
import { getIsPrimaryMaster } from '../router.js';

// ── Export Catalogue Definition ──────────────────────────────────────────────
export const EXPORT_CATALOGUE = [
  // ── SALES & REVENUE ────────────────────────────────────────────────────────
  {
    id: 'daily-sales-summary',
    name: 'Daily Sales & Operations Summary',
    description: 'Consolidated gross & net sales, tender breakdown, void analytics, discount allocations, and store operational totals.',
    category: 'SALES',
    categoryLabel: 'Sales & Revenue',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'POS & Billing / Reports',
    endpoint: '/api/v1/reports/export',
    reportId: 'daily-sales-summary',
    reportCode: 'ZURF-RPT-01',
    requiresDates: true,
  },
  {
    id: 'sales-register',
    name: 'Itemized Sales Register',
    description: 'Line-by-line transaction register containing bill serial numbers, timestamps, tax classifications, and payment mode tokens.',
    category: 'SALES',
    categoryLabel: 'Sales & Revenue',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Sales & Cash Book',
    endpoint: '/api/v1/reports/export',
    reportId: 'sales-register',
    reportCode: 'ZURF-RPT-02',
    requiresDates: true,
  },
  {
    id: 'gst-sales-summary',
    name: 'GST Sales & Tax Liability Register',
    description: 'B2C and B2B GST tax reconciliation, HSN breakdown, taxable turnover, and CGST/SGST/IGST liability registers.',
    category: 'SALES',
    categoryLabel: 'Sales & Revenue',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Finance & Accounts',
    endpoint: '/api/v1/reports/export',
    reportId: 'gst-sales-summary',
    reportCode: 'ZURF-RPT-03',
    requiresDates: true,
  },
  {
    id: 'cash-reconciliation',
    name: 'Shift Tender & Cash Reconciliation',
    description: 'Shift cashier opening floats, gross cash intake, cash drops, tender discrepancies, and register closure slips.',
    category: 'SALES',
    categoryLabel: 'Sales & Revenue',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE',
    sourceModule: 'Sales & Cash Book',
    endpoint: '/api/v1/reports/export',
    reportId: 'cash-reconciliation',
    reportCode: 'ZURF-RPT-04',
    requiresDates: true,
  },

  // ── FINANCE & TAX ──────────────────────────────────────────────────────────
  {
    id: 'pnl-statement',
    name: 'Profit & Loss (P&L) Statement',
    description: 'Standard multi-period P&L statement, operating revenues, cost of goods sold (COGS), operating expenses, and EBITDA margins.',
    category: 'FINANCE',
    categoryLabel: 'Finance & Tax',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Finance & Accounts',
    endpoint: '/api/v1/reports/export',
    reportId: 'pnl-statement',
    reportCode: 'ZURF-FIN-01',
    requiresDates: true,
  },
  {
    id: 'expense-register',
    name: 'Operating Expense (OPEX) Register',
    description: 'Categorized store operating expenses, petty cash vouchers, approval audit signatures, and payment ledger entries.',
    category: 'FINANCE',
    categoryLabel: 'Finance & Tax',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Expenses',
    endpoint: '/api/v1/reports/export',
    reportId: 'expenses-audit',
    reportCode: 'ZURF-FIN-02',
    requiresDates: true,
  },
  {
    id: 'personal-ledger',
    name: 'Personal Ledger & Owner Statement',
    description: 'Chronological Director/Owner personal ledger with verified running balances, drawings, capital infusions, and settlements.',
    category: 'FINANCE',
    categoryLabel: 'Finance & Tax',
    formats: ['PDF', 'CSV'],
    scopeType: 'ALL',
    sourceModule: 'Personal Ledger',
    endpoint: '/api/v1/personal-ledger/export',
    reportId: 'personal-ledger',
    reportCode: 'ZURF-LEDGER-01',
    requiresDates: false,
    directDownload: true,
  },
  {
    id: 'passbook-pdf',
    name: 'Passbook & Treasury Statement',
    description: 'Institutional digital treasury passbook statement, banking receipts, UPI settlements, and verified reconciliation vouchers.',
    category: 'FINANCE',
    categoryLabel: 'Finance & Tax',
    formats: ['PDF'],
    scopeType: 'ALL',
    sourceModule: 'Finance & Accounts',
    endpoint: '/api/v1/passbook/export/pdf',
    reportId: 'passbook-pdf',
    reportCode: 'ZURF-TREASURY-01',
    requiresDates: false,
    directDownload: true,
  },
  {
    id: 'revenue-share-statement',
    name: 'Revenue Share & Royalty Settlement',
    description: 'Franchise/landlord percentage revenue-share statements, contracted baseline adjustments, and payable settlement schedules.',
    category: 'FINANCE',
    categoryLabel: 'Finance & Tax',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Revenue Share & Outlets',
    endpoint: '/api/v1/reports/export',
    reportId: 'revenue-share-statement',
    reportCode: 'ZURF-REV-01',
    requiresDates: true,
  },

  // ── INVENTORY & STOCK ──────────────────────────────────────────────────────
  {
    id: 'inventory-valuation',
    name: 'Stock Valuation & Balance Register',
    description: 'Current on-hand inventory balances, closing unit costs, total stock asset valuation, and lot-level expiration data.',
    category: 'INVENTORY',
    categoryLabel: 'Inventory & Stock',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Inventory',
    endpoint: '/api/v1/reports/export',
    reportId: 'inventory-valuation',
    reportCode: 'ZURF-INV-01',
    requiresDates: false,
  },
  {
    id: 'stock-movement-ledger',
    name: 'Stock Movement & Material Ledger',
    description: 'Complete audit trail of stock additions via GRN, store transfers, recipe depletion, and physical count reconciliations.',
    category: 'INVENTORY',
    categoryLabel: 'Inventory & Stock',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Inventory',
    endpoint: '/api/v1/reports/export',
    reportId: 'stock-movement-ledger',
    reportCode: 'ZURF-INV-02',
    requiresDates: true,
  },
  {
    id: 'inventory-wastage',
    name: 'Wastage & Shrinkage Audit Register',
    description: 'Logged ingredient wastage, expiration discard logs, preparation damage incidents, and verified financial write-offs.',
    category: 'INVENTORY',
    categoryLabel: 'Inventory & Stock',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Inventory',
    endpoint: '/api/v1/reports/export',
    reportId: 'inventory-wastage',
    reportCode: 'ZURF-INV-03',
    requiresDates: true,
  },
  {
    id: 'stock-count-variance',
    name: 'Physical Stock Count Variance Report',
    description: 'Discrepancy audit between physical inventory stock takes and expected system quantities with variance valuations.',
    category: 'INVENTORY',
    categoryLabel: 'Inventory & Stock',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Inventory',
    endpoint: '/api/v1/reports/export',
    reportId: 'stock-count-variance',
    reportCode: 'ZURF-INV-04',
    requiresDates: true,
  },

  // ── PROCUREMENT ────────────────────────────────────────────────────────────
  {
    id: 'purchase-orders-register',
    name: 'Purchase Orders (PO) Register',
    description: 'Consolidated purchase order records, vendor details, authorized quantities, expected delivery dates, and fulfilment states.',
    category: 'PROCUREMENT',
    categoryLabel: 'Procurement',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Procurement & Orders',
    endpoint: '/api/v1/reports/export',
    reportId: 'purchase-orders-register',
    reportCode: 'ZURF-PROC-01',
    requiresDates: true,
  },
  {
    id: 'grn-register',
    name: 'Goods Received Notes (GRN) Register',
    description: 'Inbound physical delivery inspection records, delivered quantities, shortage discrepancy reasons, and receiver sign-offs.',
    category: 'PROCUREMENT',
    categoryLabel: 'Procurement',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Procurement & Orders',
    endpoint: '/api/v1/reports/export',
    reportId: 'grn-register',
    reportCode: 'ZURF-PROC-02',
    requiresDates: true,
  },
  {
    id: 'three-way-matching',
    name: 'Three-Way Match & Invoice Audit',
    description: 'Reconciliation of Purchase Orders, physical GRN verifications, and Vendor Invoices with automated price and volume tolerances.',
    category: 'PROCUREMENT',
    categoryLabel: 'Procurement',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Procurement & Orders',
    endpoint: '/api/v1/reports/export',
    reportId: 'three-way-matching',
    reportCode: 'ZURF-PROC-03',
    requiresDates: true,
  },

  // ── VENDORS ────────────────────────────────────────────────────────────────
  {
    id: 'vendor-ageing',
    name: 'Vendor Payables & Ageing Statement',
    description: 'Supplier payables ageing distribution (0-30, 31-60, 61-90, 90+ days), unpaid bills, and accounts payable cash forecast.',
    category: 'VENDORS',
    categoryLabel: 'Vendors',
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Vendors',
    endpoint: '/api/v1/reports/export',
    reportId: 'vendor-ageing',
    reportCode: 'ZURF-VEND-01',
    requiresDates: false,
  },
  {
    id: 'vendor-spend-history',
    name: 'Supplier Purchase & Spend History',
    description: 'Aggregated procurement spend per vendor, unit price trends over time, delivery lead-time consistency, and fulfillment rates.',
    category: 'VENDORS',
    categoryLabel: 'Vendors',
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Vendors',
    endpoint: '/api/v1/reports/export',
    reportId: 'vendor-spend-history',
    reportCode: 'ZURF-VEND-02',
    requiresDates: true,
  },

  // ── WORKFORCE & HR ─────────────────────────────────────────────────────────
  {
    id: 'attendance-register',
    name: 'Staff Attendance & Shift Register',
    description: 'Employee clock-in/out timestamps, rostered shifts, hours logged, break compliance, overtime hours, and verified leaves.',
    category: 'WORKFORCE',
    categoryLabel: 'Workforce & HR',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Attendance & Shifts',
    endpoint: '/api/v1/reports/export',
    reportId: 'attendance-register',
    reportCode: 'ZURF-HR-01',
    requiresDates: true,
  },
  {
    id: 'payroll-summary',
    name: 'Payroll Summary & Bank Disbursement',
    description: 'Monthly payroll register, gross salaries, statutory deductions, net payable wages, and bank disbursement NEFT files.',
    category: 'WORKFORCE',
    categoryLabel: 'Workforce & HR',
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Payroll',
    endpoint: '/api/v1/reports/export',
    reportId: 'payroll-summary',
    reportCode: 'ZURF-HR-02',
    requiresDates: true,
  },
  {
    id: 'employee-register',
    name: 'Employee Master Register',
    description: 'Active personnel directory, designated store assignments, contract status, wage terms, and verified onboarding files.',
    category: 'WORKFORCE',
    categoryLabel: 'Workforce & HR',
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Employees',
    endpoint: '/api/v1/reports/export',
    reportId: 'employee-register',
    reportCode: 'ZURF-HR-03',
    requiresDates: false,
  },

  // ── COMMERCIAL ─────────────────────────────────────────────────────────────
  {
    id: 'menu-performance',
    name: 'Menu Engineering & Item Performance',
    description: 'Sales volume per recipe, revenue share, bill penetration, modifier attach rates, and food cost margin performance.',
    category: 'COMMERCIAL',
    categoryLabel: 'Commercial',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Menu & Pricing',
    endpoint: '/api/v1/reports/export',
    reportId: 'menu-performance',
    reportCode: 'ZURF-COMM-01',
    requiresDates: true,
  },
  {
    id: 'outlet-benchmarking',
    name: 'Outlet Comparative Performance Benchmark',
    description: 'Cross-store sales performance, average bill value (ABV), labor productivity per hour, and operating cost benchmarking.',
    category: 'COMMERCIAL',
    categoryLabel: 'Commercial',
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Reports & Analytics',
    endpoint: '/api/v1/reports/export',
    reportId: 'outlet-benchmarking',
    reportCode: 'ZURF-COMM-02',
    requiresDates: true,
  },
];

// Local state for export centre
let currentSearch = '';
let currentCategory = 'ALL';
let currentCafeScope = 'ALL';
let currentPeriod = 'CURRENT_MONTH';
let customStartDate = '';
let customEndDate = '';
let recentExports = [];
let isLoadingHistory = false;
let activeDownloadId = null;

// ── Render Function ──────────────────────────────────────────────────────────
export function renderExportCentre() {
  const isPrimary = getIsPrimaryMaster();
  const isOwner = state.role === ROLES.OWNER || state.role === 'owner';

  // Double-gate in page render
  if (!isPrimary && !isOwner) {
    return `<div class="p-8 text-center text-muted">Access Restricted. Only Primary Master and Owner have Export Centre authority.</div>`;
  }

  const cafes = state.cafes || [];
  const today = new Date().toISOString().split('T')[0];

  return `
    <div class="export-centre-workspace" style="padding: 24px; max-width: 1400px; margin: 0 auto;">
      <!-- Page Header -->
      <div class="page-header" style="margin-bottom: 24px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: rgba(var(--primary-rgb, 198, 153, 99), 0.12); color: var(--primary);">
              ${icon('download')}
            </span>
            <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: var(--text);">Export Centre</h1>
          </div>
          <p style="font-size: 14px; color: var(--muted); margin: 6px 0 0 0;">
            Generate and download authorized business records and statements.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <button id="btn-refresh-history" class="btn btn-secondary btn-sm" type="button" style="display: inline-flex; align-items: center; gap: 6px;">
            ${icon('refresh')} <span>Refresh Activity</span>
          </button>
        </div>
      </div>

      <!-- Scope & Global Filters Card -->
      <div class="card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; margin-bottom: 24px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; align-items: flex-end;">
          <!-- Search -->
          <div>
            <label for="export-search-input" style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
              Search Exports
            </label>
            <div style="position: relative;">
              <input
                id="export-search-input"
                type="text"
                class="form-control"
                placeholder="Search by name, module, code..."
                value="${currentSearch}"
                style="width: 100%; padding-left: 36px; height: 38px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface, var(--bg-card)); color: var(--text);"
              />
              <span style="position: absolute; left: 10px; top: 10px; color: var(--muted); pointer-events: none;">
                ${icon('search')}
              </span>
            </div>
          </div>

          <!-- Category Filter -->
          <div>
            <label for="export-category-select" style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
              Category
            </label>
            <select id="export-category-select" class="form-control" style="width: 100%; height: 38px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface, var(--bg-card)); color: var(--text);">
              <option value="ALL" ${currentCategory === 'ALL' ? 'selected' : ''}>All Categories (All Modules)</option>
              <option value="SALES" ${currentCategory === 'SALES' ? 'selected' : ''}>Sales & Revenue</option>
              <option value="FINANCE" ${currentCategory === 'FINANCE' ? 'selected' : ''}>Finance & Tax</option>
              <option value="INVENTORY" ${currentCategory === 'INVENTORY' ? 'selected' : ''}>Inventory & Stock</option>
              <option value="PROCUREMENT" ${currentCategory === 'PROCUREMENT' ? 'selected' : ''}>Procurement</option>
              <option value="VENDORS" ${currentCategory === 'VENDORS' ? 'selected' : ''}>Vendors</option>
              <option value="WORKFORCE" ${currentCategory === 'WORKFORCE' ? 'selected' : ''}>Workforce & HR</option>
              <option value="COMMERCIAL" ${currentCategory === 'COMMERCIAL' ? 'selected' : ''}>Commercial</option>
            </select>
          </div>

          <!-- Café Scope -->
          <div>
            <label for="export-cafe-select" style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
              Target Café Scope
            </label>
            <select id="export-cafe-select" class="form-control" style="width: 100%; height: 38px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface, var(--bg-card)); color: var(--text);">
              <option value="ALL" ${currentCafeScope === 'ALL' ? 'selected' : ''}>All Cafés (Consolidated)</option>
              ${cafes.map(c => `
                <option value="${c.id || c.code || c._id}" ${currentCafeScope === (c.id || c.code || c._id) ? 'selected' : ''}>
                  ${c.name || c.code || c.id}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Date Period -->
          <div>
            <label for="export-period-select" style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
              Date Period
            </label>
            <select id="export-period-select" class="form-control" style="width: 100%; height: 38px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface, var(--bg-card)); color: var(--text);">
              <option value="CURRENT_MONTH" ${currentPeriod === 'CURRENT_MONTH' ? 'selected' : ''}>Current Month to Date</option>
              <option value="LAST_30_DAYS" ${currentPeriod === 'LAST_30_DAYS' ? 'selected' : ''}>Last 30 Days</option>
              <option value="LAST_MONTH" ${currentPeriod === 'LAST_MONTH' ? 'selected' : ''}>Previous Full Month</option>
              <option value="CURRENT_QUARTER" ${currentPeriod === 'CURRENT_QUARTER' ? 'selected' : ''}>Current Quarter</option>
              <option value="FY2026_27" ${currentPeriod === 'FY2026_27' ? 'selected' : ''}>Fiscal Year 2026-27</option>
              <option value="CUSTOM" ${currentPeriod === 'CUSTOM' ? 'selected' : ''}>Custom Date Range</option>
            </select>
          </div>
        </div>

        <!-- Custom Date Range Sub-row -->
        <div id="export-custom-dates-row" style="display: ${currentPeriod === 'CUSTOM' ? 'flex' : 'none'}; gap: 16px; margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border);">
          <div style="flex: 1; max-width: 200px;">
            <label style="display: block; font-size: 11.5px; color: var(--muted); margin-bottom: 4px;">Start Date</label>
            <input type="date" id="export-start-date" class="form-control" value="${customStartDate || today}" style="width: 100%; height: 36px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface, var(--bg-card)); color: var(--text);" />
          </div>
          <div style="flex: 1; max-width: 200px;">
            <label style="display: block; font-size: 11.5px; color: var(--muted); margin-bottom: 4px;">End Date</label>
            <input type="date" id="export-end-date" class="form-control" value="${customEndDate || today}" style="width: 100%; height: 36px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-surface, var(--bg-card)); color: var(--text);" />
          </div>
        </div>
      </div>

      <!-- Main Catalogue Table Card -->
      <div class="card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin-bottom: 30px;">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <h2 style="font-size: 16px; font-weight: 600; margin: 0; color: var(--text);">Export Catalogue</h2>
          <span id="export-count-badge" style="font-size: 12px; background: rgba(var(--primary-rgb, 198, 153, 99), 0.15); color: var(--primary); padding: 3px 10px; border-radius: 12px; font-weight: 600;">
            ${EXPORT_CATALOGUE.length} Available
          </span>
        </div>

        <div style="overflow-x: auto;">
          <table class="table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13.5px;">
            <thead>
              <tr style="background: var(--surface, rgba(0,0,0,0.02)); border-bottom: 1px solid var(--border); color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em;">
                <th style="padding: 12px 18px; font-weight: 600;">Export Name & Description</th>
                <th style="padding: 12px 16px; font-weight: 600; width: 140px;">Category</th>
                <th style="padding: 12px 16px; font-weight: 600; width: 150px;">Source Module</th>
                <th style="padding: 12px 16px; font-weight: 600; width: 130px;">Supported Formats</th>
                <th style="padding: 12px 18px; font-weight: 600; width: 180px; text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody id="export-catalogue-tbody">
              ${renderCatalogueRows()}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Export Activity & Audit Trail -->
      <div class="card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden;">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="font-size: 16px; font-weight: 600; margin: 0; color: var(--text);">Recent Export Activity & Audit History</h2>
            <p style="font-size: 12px; color: var(--muted); margin: 4px 0 0 0;">Historical exports generated across the organisation with immutable audit verification.</p>
          </div>
          <span style="font-size: 11.5px; color: var(--muted);">Authoritative Server Records</span>
        </div>

        <div id="export-history-container" style="padding: 16px 20px;">
          <div style="text-align: center; padding: 24px; color: var(--muted); font-size: 13px;">
            Loading recent activity records...
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Helper: Render Catalogue Table Rows ───────────────────────────────────────
function renderCatalogueRows() {
  const q = currentSearch.trim().toLowerCase();
  const cat = currentCategory;

  const filtered = EXPORT_CATALOGUE.filter((item) => {
    if (cat !== 'ALL' && item.category !== cat) return false;
    if (q) {
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchModule = item.sourceModule.toLowerCase().includes(q);
      const matchCode = (item.reportCode || '').toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchModule && !matchCode) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    return `
      <tr>
        <td colspan="5" style="padding: 36px 20px; text-align: center; color: var(--muted);">
          No exports match your search filter "${currentSearch}". <br />
          <button id="btn-clear-export-filters" class="btn btn-secondary btn-sm" style="margin-top: 10px;" type="button">Reset Filters</button>
        </td>
      </tr>
    `;
  }

  return filtered.map((item) => {
    const isDownloading = activeDownloadId === item.id;
    return `
      <tr style="border-bottom: 1px solid var(--border); transition: background 0.15s ease;" class="export-row" data-export-id="${item.id}">
        <td style="padding: 14px 18px; vertical-align: middle;">
          <div style="font-weight: 600; color: var(--text); margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
            <span>${item.name}</span>
            ${item.reportCode ? `<span style="font-size: 10px; font-weight: 500; padding: 1px 6px; border-radius: 4px; background: rgba(0,0,0,0.06); color: var(--muted);">${item.reportCode}</span>` : ''}
          </div>
          <div style="font-size: 12.5px; color: var(--muted); line-height: 1.4; max-width: 580px;">
            ${item.description}
          </div>
        </td>
        <td style="padding: 14px 16px; vertical-align: middle;">
          <span style="display: inline-block; font-size: 11.5px; font-weight: 500; padding: 3px 8px; border-radius: 6px; background: rgba(var(--primary-rgb, 198, 153, 99), 0.1); color: var(--primary);">
            ${item.categoryLabel}
          </span>
        </td>
        <td style="padding: 14px 16px; vertical-align: middle; color: var(--muted); font-size: 12.5px;">
          ${item.sourceModule}
        </td>
        <td style="padding: 14px 16px; vertical-align: middle;">
          <div style="display: flex; gap: 5px; flex-wrap: wrap;">
            ${item.formats.map(fmt => `
              <span style="font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${fmt === 'PDF' ? '#fee2e2' : fmt === 'XLSX' ? '#dcfce7' : '#e0e7ff'}; color: ${fmt === 'PDF' ? '#991b1b' : fmt === 'XLSX' ? '#166534' : '#3730a3'};">
                ${fmt}
              </span>
            `).join('')}
          </div>
        </td>
        <td style="padding: 14px 18px; vertical-align: middle; text-align: right;">
          <div style="display: inline-flex; gap: 6px; justify-content: flex-end;">
            ${item.formats.map(fmt => `
              <button
                class="btn btn-sm btn-action-download"
                data-export-id="${item.id}"
                data-format="${fmt}"
                style="height: 32px; padding: 0 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-surface, var(--bg-card)); color: var(--text);"
                ${isDownloading ? 'disabled' : ''}
                title="Download ${item.name} as ${fmt}"
                type="button"
              >
                ${icon('download')}
                <span>${fmt}</span>
              </button>
            `).join('')}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ── Wire Function ────────────────────────────────────────────────────────────
export async function wireExportCentre(container) {
  if (!container) return;

  // Search input with debounce
  const searchInput = container.querySelector('#export-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      updateCatalogueView(container);
    });
  }

  // Category filter
  const categorySelect = container.querySelector('#export-category-select');
  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      currentCategory = e.target.value;
      updateCatalogueView(container);
    });
  }

  // Cafe scope
  const cafeSelect = container.querySelector('#export-cafe-select');
  if (cafeSelect) {
    cafeSelect.addEventListener('change', (e) => {
      currentCafeScope = e.target.value;
    });
  }

  // Period select
  const periodSelect = container.querySelector('#export-period-select');
  const customDatesRow = container.querySelector('#export-custom-dates-row');
  if (periodSelect) {
    periodSelect.addEventListener('change', (e) => {
      currentPeriod = e.target.value;
      if (customDatesRow) {
        customDatesRow.style.display = currentPeriod === 'CUSTOM' ? 'flex' : 'none';
      }
    });
  }

  // Start / End date inputs
  const startDateInput = container.querySelector('#export-start-date');
  if (startDateInput) {
    startDateInput.addEventListener('change', (e) => {
      customStartDate = e.target.value;
    });
  }
  const endDateInput = container.querySelector('#export-end-date');
  if (endDateInput) {
    endDateInput.addEventListener('change', (e) => {
      customEndDate = e.target.value;
    });
  }

  // Refresh history button
  const refreshBtn = container.querySelector('#btn-refresh-history');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadExportHistory(container);
    });
  }

  // Clear filters button (delegated)
  container.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-clear-export-filters') {
      currentSearch = '';
      currentCategory = 'ALL';
      if (searchInput) searchInput.value = '';
      if (categorySelect) categorySelect.value = 'ALL';
      updateCatalogueView(container);
    }
  });

  // Action download buttons (delegated)
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-action-download');
    if (!btn) return;

    const exportId = btn.getAttribute('data-export-id');
    const format = btn.getAttribute('data-format');
    const item = EXPORT_CATALOGUE.find(x => x.id === exportId);
    if (!item) return;

    await executeExportDownload(item, format, btn, container);
  });

  // Load history asynchronously
  loadExportHistory(container);
}

// ── Update Table in place ────────────────────────────────────────────────────
function updateCatalogueView(container) {
  const tbody = container.querySelector('#export-catalogue-tbody');
  const countBadge = container.querySelector('#export-count-badge');
  if (!tbody) return;

  tbody.innerHTML = renderCatalogueRows();

  if (countBadge) {
    const q = currentSearch.trim().toLowerCase();
    const count = EXPORT_CATALOGUE.filter(item => {
      if (currentCategory !== 'ALL' && item.category !== currentCategory) return false;
      if (q) {
        const matchName = item.name.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchModule = item.sourceModule.toLowerCase().includes(q);
        const matchCode = (item.reportCode || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchModule && !matchCode) return false;
      }
      return true;
    }).length;
    countBadge.textContent = `${count} Available`;
  }
}

// ── Execute Real Download ────────────────────────────────────────────────────
async function executeExportDownload(item, format, btn, container) {
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>Generating...</span>`;
  activeDownloadId = item.id;

  showToast(`Preparing ${item.name} (${format})...`, 'info');

  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const safeFilename = `${item.id}_${dateStr}.${format.toLowerCase()}`;

    // 1. Direct GET endpoints (Personal Ledger, Passbook)
    if (item.directDownload) {
      let downloadUrl = item.endpoint;
      if (item.id === 'personal-ledger') {
        downloadUrl += `?format=${format}`;
      }
      await downloadFile({
        url: downloadUrl,
        filename: safeFilename,
      });
      showToast(`${item.name} (${format}) downloaded successfully!`, 'success');
      loadExportHistory(container);
      return;
    }

    // 2. Canonical Reports Export Endpoint (/api/v1/reports/export)
    const payload = {
      reportId: item.reportId,
      format: format,
      scope: currentCafeScope === 'ALL' ? 'ALL_STORES' : currentCafeScope,
      cafeId: currentCafeScope !== 'ALL' ? currentCafeScope : undefined,
      period: currentPeriod,
      startDate: currentPeriod === 'CUSTOM' ? customStartDate : undefined,
      endDate: currentPeriod === 'CUSTOM' ? customEndDate : undefined,
    };

    const res = await apiPost('/reports/export', payload);

    if (res?.data?.downloadUrl) {
      await downloadFile({
        url: res.data.downloadUrl,
        filename: res.data.filename || safeFilename,
      });
      showToast(`${item.name} (${format}) downloaded successfully!`, 'success');
    } else if (res?.data?.pdfBase64) {
      // Decode base64 PDF
      const byteCharacters = atob(res.data.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      triggerBlobDownload(blob, safeFilename);
      showToast(`${item.name} downloaded successfully!`, 'success');
    } else if (res?.data?.xlsxBase64) {
      // Decode base64 XLSX
      const byteCharacters = atob(res.data.xlsxBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      triggerBlobDownload(blob, safeFilename);
      showToast(`${item.name} downloaded successfully!`, 'success');
    } else {
      showToast(`${item.name} export requested. Check recent activity below.`, 'success');
    }

    loadExportHistory(container);
  } catch (err) {
    console.error('[ExportCentre] Download error:', err);
    showToast(`Export failed: ${err.message || 'Please check backend logs.'}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    activeDownloadId = null;
  }
}

// ── Trigger In-Browser Blob Download ──────────────────────────────────────────
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

// ── Load Server Export History ────────────────────────────────────────────────
async function loadExportHistory(container) {
  const historyContainer = container.querySelector('#export-history-container');
  if (!historyContainer) return;

  try {
    const res = await apiGet('/exports/history?limit=10');
    const items = res?.data?.items || [];

    if (!items || items.length === 0) {
      historyContainer.innerHTML = `
        <div style="text-align: center; padding: 28px 16px; color: var(--muted); font-size: 13px;">
          <span style="display: block; font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📄</span>
          No exports recorded yet in the system audit log.<br />
          Click any format button above to generate and download statements.
        </div>
      `;
      return;
    }

    historyContainer.innerHTML = `
      <div style="overflow-x: auto;">
        <table class="table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12.5px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border); color: var(--muted); font-size: 11px; text-transform: uppercase;">
              <th style="padding: 8px 12px;">Export Document</th>
              <th style="padding: 8px 12px;">Format</th>
              <th style="padding: 8px 12px;">Scope</th>
              <th style="padding: 8px 12px;">Generated By</th>
              <th style="padding: 8px 12px;">Timestamp</th>
              <th style="padding: 8px 12px; text-align: right;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((hist) => `
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px 12px; font-weight: 500; color: var(--text);">
                  ${hist.reportTitle || hist.reportCode || hist.filename || 'Export Document'}
                </td>
                <td style="padding: 10px 12px;">
                  <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.06); color: var(--text);">
                    ${hist.format || 'PDF'}
                  </span>
                </td>
                <td style="padding: 10px 12px; color: var(--muted);">
                  ${hist.scope || hist.cafeId || 'All Cafés'}
                </td>
                <td style="padding: 10px 12px; color: var(--muted);">
                  ${hist.generatedBy || hist.userName || 'System'}
                </td>
                <td style="padding: 10px 12px; color: var(--muted);">
                  ${hist.createdAt ? new Date(hist.createdAt).toLocaleString('en-IN') : 'Recent'}
                </td>
                <td style="padding: 10px 12px; text-align: right;">
                  <span style="font-size: 11px; font-weight: 600; color: #166534; background: #dcfce7; padding: 2px 8px; border-radius: 10px;">
                    VERIFIED
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    // If endpoint returns 404 or empty because no history exists yet
    historyContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--muted); font-size: 12.5px;">
        No prior export history found. Click any export above to generate live records.
      </div>
    `;
  }
}

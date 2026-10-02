// =============================================================================
// ZAMORIN CAFE ERP — EXPORT CENTRE (Canonical Workspace)
// Centralized catalogue, search, configuration, and download workspace over
// existing authorized business records, financial statements, and audit logs.
// Authoritative access: Primary Master & Owner only.
// =============================================================================

import { apiGet, apiPost, downloadFile } from '../apiClient.js';
import { showToast, skeleton, renderCafeContextStrip, renderModuleErrorState, escapeHtml } from '../components.js';
import { state } from '../state.js';
import { ROLES } from '../navigation.js';
import { icon } from '../icons.js';
import { getIsPrimaryMaster } from '../router.js';

// ── Export Catalogue Definition ──────────────────────────────────────────────
export const EXPORT_CATALOGUE = [
  // ── SALES & REVENUE ────────────────────────────────────────────────────────
  {
    id: 'daily-sales',
    name: 'Daily Sales & Operations Summary',
    description: 'Consolidated gross & net sales, tender breakdown, void analytics, discount allocations, and store operational totals.',
    category: 'SALES',
    categoryLabel: 'Sales & Revenue',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'POS & Billing / Reports',
    endpoint: '/api/v1/reports/export',
    reportId: 'daily-sales',
    reportCode: 'ZURF-RPT-01',
    requiresDates: true,
  },
  {
    id: 'pos-exceptions',
    name: 'POS Exceptions & Cashier Control Audit',
    description: 'Audited bill voids, returns, customer refunds, high discounts (>20%), complimentary bills, reprinted receipts, offline replays, and cash variances.',
    category: 'SALES',
    categoryLabel: 'Sales & Revenue',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'POS & Billing',
    endpoint: '/api/v1/reports/export',
    reportId: 'pos-exceptions',
    reportCode: 'ZURF-POS-01',
    requiresDates: true,
  },
  {
    id: 'cash-book-variance',
    name: 'Shift Tender & Cash Reconciliation',
    description: 'Register session opening floats, physical blind cash declarations, net till variances, safe drops, payouts, and marketplace aggregator settlements.',
    category: 'SALES',
    categoryLabel: 'Sales & Revenue',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Sales & Cash Book',
    endpoint: '/api/v1/reports/export',
    reportId: 'cash-book-variance',
    reportCode: 'ZURF-CASH-01',
    requiresDates: true,
  },

  // ── FINANCE & TAX ──────────────────────────────────────────────────────────
  {
    id: 'pl-statement',
    name: 'Profit & Loss (P&L) Statement',
    description: 'Standard multi-period P&L statement, revenue bridge, categorized operating expenses, payroll allocations, accounts payable aging, and budget variance.',
    category: 'FINANCE',
    categoryLabel: 'Finance & Tax',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Finance & Accounts',
    endpoint: '/api/v1/reports/export',
    reportId: 'pl-statement',
    reportCode: 'ZURF-FIN-01',
    requiresDates: true,
  },
  {
    id: 'personal-ledger',
    name: 'Personal Ledger & Owner Statement',
    description: 'Chronological Director/Owner personal ledger with verified running balances, drawings, capital infusions, and settlements.',
    category: 'FINANCE',
    categoryLabel: 'Finance & Tax',
    formats: ['PDF', 'XLSX'],
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
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Finance & Accounts',
    endpoint: '/api/v1/passbook/export',
    reportId: 'passbook-pdf',
    reportCode: 'ZURF-TREASURY-01',
    requiresDates: false,
    directDownload: true,
  },

  // ── INVENTORY & STOCK ──────────────────────────────────────────────────────
  {
    id: 'inventory-valuation',
    name: 'Stock Valuation & Balance Register',
    description: 'Current physical on-hand inventory balances, unrestricted available stock, category valuations, expiring lots, stock movements, and waste loss.',
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

  // ── PROCUREMENT ────────────────────────────────────────────────────────────
  {
    id: 'procurement-spend',
    name: 'Procurement Spend & 3-Way Match',
    description: 'Consolidated purchase commitments, PO lifecycle status, vendor scorecard, fill rates, on-time delivery, and 3-way match exceptions.',
    category: 'PROCUREMENT',
    categoryLabel: 'Procurement',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Procurement & Orders',
    endpoint: '/api/v1/reports/export',
    reportId: 'procurement-spend',
    reportCode: 'ZURF-PROC-01',
    requiresDates: true,
  },

  // ── VENDORS ────────────────────────────────────────────────────────────────
  {
    id: 'vendor-performance-intelligence',
    name: 'Supplier Performance & Intelligence Suite',
    description: 'Vendor scorecards, spend distribution, item purchase price history, lead times, dock temperature quality compliance, and exceptions.',
    category: 'VENDORS',
    categoryLabel: 'Vendors',
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Vendors',
    endpoint: '/api/v1/reports/export',
    reportId: 'vendor-performance-intelligence',
    reportCode: 'ZURF-VEND-01',
    requiresDates: true,
  },

  // ── WORKFORCE & HR ─────────────────────────────────────────────────────────
  {
    id: 'workforce-overview',
    name: 'Workforce & Headcount Intelligence',
    description: 'Active personnel directory, café staffing allocation, job title distribution, scheduled vs actual hours, roster compliance, and sales per labour hour (SPLH).',
    category: 'WORKFORCE',
    categoryLabel: 'Workforce & HR',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Workforce & HR',
    endpoint: '/api/v1/reports/export',
    reportId: 'workforce-overview',
    reportCode: 'ZURF-HR-01',
    requiresDates: true,
  },
  {
    id: 'attendance-exceptions',
    name: 'Staff Attendance & Exceptions Register',
    description: 'Employee clock-in/out punctuality, late arrivals, early exits, missed punches, hours variance, and approved leave records.',
    category: 'WORKFORCE',
    categoryLabel: 'Workforce & HR',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Attendance & Shifts',
    endpoint: '/api/v1/reports/export',
    reportId: 'attendance-exceptions',
    reportCode: 'ZURF-HR-02',
    requiresDates: true,
  },
  {
    id: 'payroll-summary',
    name: 'Gross Payroll & Labour Cost Allocation',
    description: 'Authoritative gross payroll disbursements by café and historical role, overtime hours, and labour cost ratio against sales.',
    category: 'WORKFORCE',
    categoryLabel: 'Workforce & HR',
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Payroll',
    endpoint: '/api/v1/reports/export',
    reportId: 'payroll-summary',
    reportCode: 'ZURF-HR-03',
    requiresDates: true,
  },

  // ── COMMERCIAL & STORE INTELLIGENCE ────────────────────────────────────────
  {
    id: 'menu-engineering',
    name: 'Menu Engineering & Item Performance',
    description: 'Recipe theoretical food costs, estimated contribution margins, Boston box quadrant popularity, bill penetration, and price history.',
    category: 'COMMERCIAL',
    categoryLabel: 'Commercial',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Menu & Recipes',
    endpoint: '/api/v1/reports/export',
    reportId: 'menu-engineering',
    reportCode: 'ZURF-COMM-01',
    requiresDates: true,
  },
  {
    id: 'customer-retention',
    name: 'Customer Cohorts & Loyalty Repeat Index',
    description: 'Identified transacting guests, visit frequency, loyalty tier distribution, service mode breakdown, and deterministic RFM segments.',
    category: 'COMMERCIAL',
    categoryLabel: 'Commercial',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Customers & Loyalty',
    endpoint: '/api/v1/reports/export',
    reportId: 'customer-retention',
    reportCode: 'ZURF-COMM-02',
    requiresDates: true,
  },
  {
    id: 'service-speed',
    name: 'Speed of Service & Prep Analytics',
    description: 'Kitchen prep times, station performance, order ticket volume, fulfillment duration, and service mode efficiency.',
    category: 'COMMERCIAL',
    categoryLabel: 'Commercial',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Operations',
    endpoint: '/api/v1/reports/export',
    reportId: 'service-speed',
    reportCode: 'ZURF-COMM-03',
    requiresDates: true,
  },
  {
    id: 'same-store-sales',
    name: 'Like-for-Like (Same-Store) Sales Growth',
    description: 'Normalized comparative revenue growth across mature branches operating >=12 months with prior year baselines and cohort waterfall.',
    category: 'COMMERCIAL',
    categoryLabel: 'Commercial',
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Reports & Analytics',
    endpoint: '/api/v1/reports/export',
    reportId: 'same-store-sales',
    reportCode: 'ZURF-COMM-04',
    requiresDates: true,
  },
  {
    id: 'multi-cafe-benchmark',
    name: 'Multi-Café Benchmarking & Comparative Intelligence',
    description: 'Cross-store sales benchmarks, average bill value (ABV), sales per labour hour (SPLH) rank, and operating cost benchmarking.',
    category: 'COMMERCIAL',
    categoryLabel: 'Commercial',
    formats: ['PDF', 'XLSX'],
    scopeType: 'ALL',
    sourceModule: 'Reports & Analytics',
    endpoint: '/api/v1/reports/export',
    reportId: 'multi-cafe-benchmark',
    reportCode: 'ZURF-COMM-05',
    requiresDates: true,
  },
  {
    id: 'sales-forecast',
    name: 'Sales & Revenue Predictive Forecast',
    description: 'Statistically backtested walk-forward predictive revenue forecast with 95% prediction intervals and candidate model evaluations.',
    category: 'COMMERCIAL',
    categoryLabel: 'Commercial',
    formats: ['PDF', 'XLSX'],
    scopeType: 'CAFE_OR_ALL',
    sourceModule: 'Forecasting & Planning',
    endpoint: '/api/v1/reports/export',
    reportId: 'sales-forecast',
    reportCode: 'ZURF-COMM-06',
    requiresDates: false,
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

// ── Direct Export URL Builder ────────────────────────────────────────────────
export function buildDirectExportUrl(item, format) {
  const normFormat = String(format || 'PDF').trim().toUpperCase() === 'EXCEL' ? 'XLSX' : String(format || 'PDF').trim().toUpperCase();
  const endpoint = item.endpoint || '';
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}format=${encodeURIComponent(normFormat)}`;
}

// ── Render Function ──────────────────────────────────────────────────────────
export function renderExportCentre() {
  const isPrimary = getIsPrimaryMaster();
  const isOwner = state.role === ROLES.OWNER || String(state.role || '').toLowerCase() === 'owner';

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
                value="${escapeHtml(currentSearch)}"
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
          No exports match your search filter "${escapeHtml(currentSearch)}". <br />
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
            ${item.formats.map(fmt => {
              const displayLabel = fmt === 'XLSX' ? 'Excel' : fmt;
              return `
                <span style="font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${fmt === 'PDF' ? '#fee2e2' : '#dcfce7'}; color: ${fmt === 'PDF' ? '#991b1b' : '#166534'};">
                  ${displayLabel}
                </span>
              `;
            }).join('')}
          </div>
        </td>
        <td style="padding: 14px 18px; vertical-align: middle; text-align: right;">
          <div style="display: inline-flex; gap: 6px; justify-content: flex-end;">
            ${item.formats.map(fmt => {
              const displayLabel = fmt === 'XLSX' ? 'Excel' : fmt;
              return `
                <button
                  class="btn btn-sm btn-action-download"
                  data-export-id="${item.id}"
                  data-format="${fmt}"
                  style="height: 32px; padding: 0 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-surface, var(--bg-card)); color: var(--text);"
                  ${isDownloading ? 'disabled' : ''}
                  title="Download ${item.name} as ${displayLabel}"
                  type="button"
                >
                  ${icon('download')}
                  <span>${displayLabel}</span>
                </button>
              `;
            }).join('')}
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

  const displayFormat = format === 'XLSX' ? 'Excel' : format;
  showToast(`Preparing ${item.name} (${displayFormat})...`, 'info');

  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const ext = format.toUpperCase() === 'XLSX' ? 'xlsx' : 'pdf';
    const safeFilename = `${item.id}_${dateStr}.${ext}`;

    // 1. Direct GET endpoints (Personal Ledger, Passbook)
    if (item.directDownload) {
      const downloadUrl = buildDirectExportUrl(item, format);
      await downloadFile({
        url: downloadUrl,
        filename: safeFilename,
      });
      showToast(`${item.name} (${displayFormat}) downloaded successfully!`, 'success');
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
      showToast(`${item.name} (${displayFormat}) downloaded successfully!`, 'success');
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
      showToast(`${item.name} (${displayFormat}) downloaded successfully!`, 'success');
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
      showToast(`${item.name} (${displayFormat}) downloaded successfully!`, 'success');
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

// ── Safe DOM Rendering for Export History (XSS Prevention) ───────────────────
export function renderExportHistoryTable(items) {
  const wrapper = document.createElement('div');
  wrapper.style.overflowX = 'auto';

  const table = document.createElement('table');
  table.className = 'table';
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.textAlign = 'left';
  table.style.fontSize = '12.5px';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.style.borderBottom = '1px solid var(--border)';
  headRow.style.color = 'var(--muted)';
  headRow.style.fontSize = '11px';
  headRow.style.textTransform = 'uppercase';

  const headers = [
    { text: 'Export Document', align: 'left' },
    { text: 'Format', align: 'left' },
    { text: 'Scope', align: 'left' },
    { text: 'Generated By', align: 'left' },
    { text: 'Timestamp', align: 'left' },
    { text: 'Status', align: 'right' },
  ];

  headers.forEach(h => {
    const th = document.createElement('th');
    th.style.padding = '8px 12px';
    th.style.textAlign = h.align;
    th.textContent = h.text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  items.forEach(hist => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border)';

    // 1. Export Document
    const tdDoc = document.createElement('td');
    tdDoc.style.padding = '10px 12px';
    tdDoc.style.fontWeight = '500';
    tdDoc.style.color = 'var(--text)';
    tdDoc.textContent = hist.reportTitle || hist.reportCode || hist.filename || 'Export Document';
    tr.appendChild(tdDoc);

    // 2. Format
    const tdFormat = document.createElement('td');
    tdFormat.style.padding = '10px 12px';
    const formatBadge = document.createElement('span');
    formatBadge.style.fontSize = '10px';
    formatBadge.style.fontWeight = '700';
    formatBadge.style.padding = '2px 6px';
    formatBadge.style.borderRadius = '4px';
    formatBadge.style.background = 'rgba(0,0,0,0.06)';
    formatBadge.style.color = 'var(--text)';
    formatBadge.textContent = hist.format || 'PDF';
    tdFormat.appendChild(formatBadge);
    tr.appendChild(tdFormat);

    // 3. Scope
    const tdScope = document.createElement('td');
    tdScope.style.padding = '10px 12px';
    tdScope.style.color = 'var(--muted)';
    tdScope.textContent = hist.scope || hist.cafeId || 'All Cafés';
    tr.appendChild(tdScope);

    // 4. Generated By
    const tdUser = document.createElement('td');
    tdUser.style.padding = '10px 12px';
    tdUser.style.color = 'var(--muted)';
    tdUser.textContent = hist.generatedBy || hist.userName || 'System';
    tr.appendChild(tdUser);

    // 5. Timestamp
    const tdTime = document.createElement('td');
    tdTime.style.padding = '10px 12px';
    tdTime.style.color = 'var(--muted)';
    let dateStr = 'Recent';
    if (hist.createdAt) {
      try {
        dateStr = new Date(hist.createdAt).toLocaleString('en-IN');
      } catch {
        dateStr = String(hist.createdAt);
      }
    }
    tdTime.textContent = dateStr;
    tr.appendChild(tdTime);

    // 6. Status
    const tdStatus = document.createElement('td');
    tdStatus.style.padding = '10px 12px';
    tdStatus.style.textAlign = 'right';
    const statusBadge = document.createElement('span');
    statusBadge.style.fontSize = '11px';
    statusBadge.style.fontWeight = '600';
    statusBadge.style.color = '#166534';
    statusBadge.style.background = '#dcfce7';
    statusBadge.style.padding = '2px 8px';
    statusBadge.style.borderRadius = '10px';
    statusBadge.textContent = hist.status ? String(hist.status).toUpperCase() : 'VERIFIED';
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

// ── Load Server Export History ────────────────────────────────────────────────
export async function loadExportHistory(container) {
  const historyContainer = container.querySelector('#export-history-container');
  if (!historyContainer) return;

  try {
    const res = await apiGet('/exports/history?limit=10');
    const items = res?.data?.items || [];

    historyContainer.innerHTML = '';

    if (!items || items.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.padding = '28px 16px';
      emptyDiv.style.color = 'var(--muted)';
      emptyDiv.style.fontSize = '13px';

      const iconSpan = document.createElement('span');
      iconSpan.style.display = 'block';
      iconSpan.style.fontSize = '24px';
      iconSpan.style.marginBottom = '8px';
      iconSpan.style.opacity = '0.5';
      iconSpan.textContent = '📄';
      emptyDiv.appendChild(iconSpan);

      const textNode = document.createTextNode('No exports recorded yet in the system audit log.');
      emptyDiv.appendChild(textNode);
      emptyDiv.appendChild(document.createElement('br'));
      const subTextNode = document.createTextNode('Click any format button above to generate and download statements.');
      emptyDiv.appendChild(subTextNode);

      historyContainer.appendChild(emptyDiv);
      return;
    }

    historyContainer.appendChild(renderExportHistoryTable(items));
  } catch (err) {
    historyContainer.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.style.textAlign = 'center';
    errorDiv.style.padding = '20px';
    errorDiv.style.color = 'var(--muted)';
    errorDiv.style.fontSize = '12.5px';
    errorDiv.textContent = 'No prior export history found. Click any export above to generate live records.';
    historyContainer.appendChild(errorDiv);
  }
}

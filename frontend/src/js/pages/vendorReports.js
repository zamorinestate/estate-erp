/**
 * ZAMORIN CAFÉ ERP — VENDOR COMMERCIAL REPORTS (VEN-SCR-011)
 *
 * Provides external vendors with strictly read-only visibility into authoritative commercial reports:
 * 1. Purchase Order History (po-history)
 * 2. Delivery & GRN History (grn-history)
 * 3. Invoice Register & History (invoice-history)
 * 4. Payment & Settlement History (payment-history)
 * 5. Outstanding Receivables (outstanding-receivables)
 * 6. Receivables Ageing Analysis (ageing-report)
 * 7. Returns & Adjustments Register (returns-adjustments)
 * 8. Account Statement Summary (account-statement)
 * 9. Product Supply & Volume History (product-supply-history)
 * 10. Tax / GST Transaction Summary (tax-gst-summary)
 *
 * Architectural & Security Constraints:
 * - 100% Derived identity from authenticated session (req.auth.vendorId)
 * - Multi-café scoping strictly constrained to Vendor.approvedCafeIds
 * - Zero vendor write capability (no mutation controls, no edits, no uploads)
 * - Redacts internal markup, retail selling prices, gross margins, employee notes
 * - Responsive desktop table & mobile card layouts
 */

import { api, downloadBlob } from '../apiClient.js';

let currentReportType = 'po-history';
let currentPage = 1;
let currentLimit = 20;
let currentCafeId = 'ALL';
let currentDateRange = 'all';
let currentSearch = '';
let currentCustomStart = '';
let currentCustomEnd = '';
let approvedCafesList = [];

export function renderVendorReports() {
  return `
    <div class="vendor-reports-container p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <!-- 🔒 Read-Only Vendor Security Banner -->
      <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200" role="alert">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-amber-500/20 rounded-lg text-amber-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
          </div>
          <div>
            <div class="font-semibold text-sm tracking-wide uppercase text-amber-300">🔒 READ-ONLY VENDOR ACCESS • COMMERCIAL REPORTING CENTRE</div>
            <div class="text-xs text-amber-200/80">Authoritative audit summaries for your vendor account. External visibility only — all transactions are managed by Zamorin Café Admin.</div>
          </div>
        </div>
        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
          STRICTLY READ-ONLY
        </span>
      </div>

      <!-- Page Header & Action Controls -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <span>Commercial Reports & Audits</span>
            <span class="text-xs font-normal px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">VEN-SCR-011</span>
          </h1>
          <p class="text-sm text-gray-400 mt-1">Cross-outlet transaction histories, statements, receivables ageing, and tax summaries.</p>
        </div>
        <div class="flex items-center gap-2.5 flex-wrap">
          <button id="btn-vendor-reports-download-xlsx" class="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 flex items-center gap-2 transition-colors shadow-sm" title="Export current report to Excel">
            <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <span>Download Excel</span>
          </button>
          <button id="btn-vendor-reports-download-pdf" class="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 flex items-center gap-2 transition-colors shadow-sm" title="Download authoritative PDF copy">
            <svg class="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            <span>Download PDF</span>
          </button>
          <button id="btn-vendor-reports-print" class="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 flex items-center gap-2 transition-colors shadow-sm" title="Print this report">
            <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            <span>Print</span>
          </button>
        </div>
      </div>

      <!-- 4 Authoritative Summary KPI Cards -->
      <div id="vendor-reports-kpi-grid" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-gray-800/80 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
          <div class="text-xs font-medium text-gray-400" id="kpi-label-1">Total Records</div>
          <div class="text-xl md:text-2xl font-bold text-white mt-1" id="kpi-val-1">—</div>
          <div class="text-xs text-gray-500 mt-1" id="kpi-sub-1">In selected period</div>
        </div>
        <div class="bg-gray-800/80 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
          <div class="text-xs font-medium text-gray-400" id="kpi-label-2">Primary Amount</div>
          <div class="text-xl md:text-2xl font-bold text-white mt-1" id="kpi-val-2">—</div>
          <div class="text-xs text-gray-500 mt-1" id="kpi-sub-2">Verified accounting value</div>
        </div>
        <div class="bg-gray-800/80 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
          <div class="text-xs font-medium text-gray-400" id="kpi-label-3">Settled / Closed</div>
          <div class="text-xl md:text-2xl font-bold text-emerald-400 mt-1" id="kpi-val-3">—</div>
          <div class="text-xs text-gray-500 mt-1" id="kpi-sub-3">Cleared or completed</div>
        </div>
        <div class="bg-gray-800/80 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
          <div class="text-xs font-medium text-gray-400" id="kpi-label-4">Open / Overdue</div>
          <div class="text-xl md:text-2xl font-bold text-amber-400 mt-1" id="kpi-val-4">—</div>
          <div class="text-xs text-gray-500 mt-1" id="kpi-sub-4">Receivable balance</div>
        </div>
      </div>

      <!-- Report Type Pill Navigation -->
      <div class="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3">
        <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Available Commercial Reports (10 Authorised Reports)</div>
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin" id="vendor-reports-pills">
          <button data-report="po-history" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-blue-600 text-white shadow">📋 PO History</button>
          <button data-report="grn-history" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-gray-700/60 text-gray-300 hover:bg-gray-700">🚚 Deliveries & GRN</button>
          <button data-report="invoice-history" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-gray-700/60 text-gray-300 hover:bg-gray-700">🧾 Invoices</button>
          <button data-report="payment-history" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-gray-700/60 text-gray-300 hover:bg-gray-700">💳 Payments</button>
          <button data-report="outstanding-receivables" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-gray-700/60 text-gray-300 hover:bg-gray-700">⏳ Outstanding</button>
          <button data-report="ageing-report" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-gray-700/60 text-gray-300 hover:bg-gray-700">📊 Ageing Analysis</button>
          <button data-report="returns-adjustments" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-gray-700/60 text-gray-300 hover:bg-gray-700">🔄 Adjustments</button>
          <button data-report="account-statement" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-gray-700/60 text-gray-300 hover:bg-gray-700">📑 Statement</button>
          <button data-report="product-supply-history" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-gray-700/60 text-gray-300 hover:bg-gray-700">📦 Products</button>
          <button data-report="tax-gst-summary" class="report-pill px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors bg-gray-700/60 text-gray-300 hover:bg-gray-700">🏛️ Tax / GST</button>
        </div>
      </div>

      <!-- Filter Controls Toolbar -->
      <div class="bg-gray-800/80 border border-gray-700/60 rounded-xl p-4 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- Café Scope Selector -->
          <div>
            <label for="vendor-reports-cafe-filter" class="block text-xs font-medium text-gray-300 mb-1">Café Location</label>
            <select id="vendor-reports-cafe-filter" class="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <option value="ALL">All Authorized Cafés</option>
            </select>
          </div>

          <!-- Date Range Preset -->
          <div>
            <label for="vendor-reports-date-filter" class="block text-xs font-medium text-gray-300 mb-1">Date Period</label>
            <select id="vendor-reports-date-filter" class="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="this_week">This Week (Last 7 Days)</option>
              <option value="this_month">This Month</option>
              <option value="30days">Last 30 Days</option>
              <option value="this_fy">This Financial Year</option>
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          <!-- Search Query -->
          <div class="lg:col-span-2">
            <label for="vendor-reports-search-input" class="block text-xs font-medium text-gray-300 mb-1">Universal Search</label>
            <div class="relative">
              <input type="text" id="vendor-reports-search-input" placeholder="Search reference, café, invoice, or status..." class="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <svg class="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
        </div>

        <!-- Custom Date Range Row (Hidden unless custom is selected) -->
        <div id="vendor-reports-custom-date-row" class="hidden pt-2 border-t border-gray-700/40 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          <div>
            <label for="vendor-reports-start-date" class="block text-xs text-gray-400 mb-1">From Date</label>
            <input type="date" id="vendor-reports-start-date" class="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-1.5">
          </div>
          <div>
            <label for="vendor-reports-end-date" class="block text-xs text-gray-400 mb-1">To Date</label>
            <input type="date" id="vendor-reports-end-date" class="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-1.5">
          </div>
        </div>
      </div>

      <!-- Informational Disclaimer Banner (e.g. for Tax / GST Report) -->
      <div id="vendor-reports-disclaimer" class="hidden bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 flex items-center gap-2">
        <svg class="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span id="vendor-reports-disclaimer-text"></span>
      </div>

      <!-- Active Report Details Header -->
      <div class="flex items-center justify-between border-b border-gray-800 pb-2">
        <div>
          <h2 id="active-report-title" class="text-base font-semibold text-gray-200">Purchase Order History</h2>
          <p id="active-report-description" class="text-xs text-gray-400">Chronological register of all purchase orders issued to your vendor account.</p>
        </div>
        <div id="vendor-reports-count-badge" class="text-xs font-mono text-gray-400">0 records</div>
      </div>

      <!-- Report Content Section (Desktop Table + Mobile Cards) -->
      <div class="bg-gray-800/80 border border-gray-700/60 rounded-xl overflow-hidden shadow-sm">
        <!-- Desktop Table View -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-left text-xs text-gray-300">
            <thead class="bg-gray-900/80 text-gray-400 uppercase font-semibold border-b border-gray-700/60" id="vendor-reports-table-head">
              <!-- Dynamically populated table headers -->
            </thead>
            <tbody class="divide-y divide-gray-700/40" id="vendor-reports-table-body">
              <!-- Dynamically populated rows -->
            </tbody>
          </table>
        </div>

        <!-- Mobile Card View -->
        <div class="md:hidden divide-y divide-gray-700/40" id="vendor-reports-mobile-cards">
          <!-- Dynamically populated mobile cards -->
        </div>

        <!-- Empty & Loading State Container -->
        <div id="vendor-reports-empty-state" class="hidden p-8 text-center text-gray-400">
          <svg class="w-12 h-12 mx-auto text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          <div class="text-sm font-medium text-gray-300">No report records found</div>
          <div class="text-xs text-gray-500 mt-1">Try broadening your date filter or clearing the search term.</div>
        </div>

        <!-- Pagination Controls Footer -->
        <div class="px-4 py-3 bg-gray-900/60 border-t border-gray-700/60 flex items-center justify-between text-xs text-gray-400">
          <div id="vendor-reports-pagination-info">Showing 0 of 0 records</div>
          <div class="flex items-center gap-2">
            <button id="btn-vendor-reports-prev" class="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
            <span id="vendor-reports-page-indicator" class="font-medium text-gray-200">1</span>
            <button id="btn-vendor-reports-next" class="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initializes listeners, loads metadata, and executes active report queries
 */
export async function initVendorReports() {
  const container = document.querySelector('.vendor-reports-container');
  if (!container) return;

  // 1. Fetch authorized cafés
  try {
    const meData = await api.get('/api/v1/vendor/me');
    if (meData?.success && meData.data?.approvedCafes) {
      approvedCafesList = meData.data.approvedCafes;
      populateCafeDropdown(approvedCafesList);
    }
  } catch (err) {
    console.error('Error fetching vendor identity:', err);
  }

  // 2. Wire event listeners
  wireEventListeners();

  // 3. Initial load of the default report (po-history)
  await loadReportData();
}

function populateCafeDropdown(cafes) {
  const sel = document.getElementById('vendor-reports-cafe-filter');
  if (!sel) return;
  sel.innerHTML = '<option value="ALL">All Authorized Cafés</option>';
  for (const c of cafes) {
    const opt = document.createElement('option');
    opt.value = c.cafeId;
    opt.textContent = `${c.name || c.cafeId} (${c.code || c.city || ''})`;
    sel.appendChild(opt);
  }
}

function wireEventListeners() {
  // Report Pills
  const pills = document.querySelectorAll('.report-pill');
  pills.forEach((p) => {
    p.addEventListener('click', async (e) => {
      pills.forEach((btn) => {
        btn.classList.remove('bg-blue-600', 'text-white', 'shadow');
        btn.classList.add('bg-gray-700/60', 'text-gray-300');
      });
      p.classList.remove('bg-gray-700/60', 'text-gray-300');
      p.classList.add('bg-blue-600', 'text-white', 'shadow');

      currentReportType = p.getAttribute('data-report');
      currentPage = 1;
      await loadReportData();
    });
  });

  // Café Filter
  const cafeSel = document.getElementById('vendor-reports-cafe-filter');
  if (cafeSel) {
    cafeSel.addEventListener('change', async (e) => {
      currentCafeId = e.target.value;
      currentPage = 1;
      await loadReportData();
    });
  }

  // Date Filter
  const dateSel = document.getElementById('vendor-reports-date-filter');
  const customDateRow = document.getElementById('vendor-reports-custom-date-row');
  if (dateSel) {
    dateSel.addEventListener('change', async (e) => {
      currentDateRange = e.target.value;
      if (currentDateRange === 'custom') {
        customDateRow?.classList.remove('hidden');
      } else {
        customDateRow?.classList.add('hidden');
        currentCustomStart = '';
        currentCustomEnd = '';
        currentPage = 1;
        await loadReportData();
      }
    });
  }

  // Custom Dates
  const startInput = document.getElementById('vendor-reports-start-date');
  const endInput = document.getElementById('vendor-reports-end-date');
  const onCustomDateChange = async () => {
    if (startInput?.value && endInput?.value) {
      currentCustomStart = startInput.value;
      currentCustomEnd = endInput.value;
      currentPage = 1;
      await loadReportData();
    }
  };
  startInput?.addEventListener('change', onCustomDateChange);
  endInput?.addEventListener('change', onCustomDateChange);

  // Search Input with debounce
  const searchInput = document.getElementById('vendor-reports-search-input');
  let searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        await loadReportData();
      }, 300);
    });
  }

  // Pagination
  const btnPrev = document.getElementById('btn-vendor-reports-prev');
  const btnNext = document.getElementById('btn-vendor-reports-next');
  btnPrev?.addEventListener('click', async () => {
    if (currentPage > 1) {
      currentPage--;
      await loadReportData();
    }
  });
  btnNext?.addEventListener('click', async () => {
    currentPage++;
    await loadReportData();
  });

  // Excel Download Button
  document.getElementById('btn-vendor-reports-download-xlsx')?.addEventListener('click', async () => {
    const q = buildQueryParams();
    const blob = await downloadBlob(`/api/v1/vendor/reports/${currentReportType}/csv?${q}`);
    const text = await blob.text();
    const xlsxBlob = new Blob([text], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;" });
    const url = window.URL.createObjectURL(xlsxBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VendorReport_${currentReportType}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  });

  // PDF Download Button
  document.getElementById('btn-vendor-reports-download-pdf')?.addEventListener('click', async () => {
    const q = buildQueryParams();
    await downloadBlob(`/api/v1/vendor/reports/${currentReportType}/pdf?${q}`, `VendorReport_${currentReportType}.pdf`);
  });

  // Print Button
  document.getElementById('btn-vendor-reports-print')?.addEventListener('click', () => {
    window.print();
  });
}

function buildQueryParams() {
  const params = new URLSearchParams();
  if (currentCafeId && currentCafeId !== 'ALL') params.set('cafeId', currentCafeId);
  if (currentDateRange && currentDateRange !== 'all') params.set('dateRange', currentDateRange);
  if (currentCustomStart && currentCustomEnd) {
    params.set('customStart', currentCustomStart);
    params.set('customEnd', currentCustomEnd);
  }
  if (currentSearch) params.set('search', currentSearch);
  return params.toString();
}

async function loadReportData() {
  const queryParams = new URLSearchParams();
  queryParams.set('reportType', currentReportType);
  queryParams.set('page', String(currentPage));
  queryParams.set('limit', String(currentLimit));
  if (currentCafeId && currentCafeId !== 'ALL') queryParams.set('cafeId', currentCafeId);
  if (currentDateRange && currentDateRange !== 'all') queryParams.set('dateRange', currentDateRange);
  if (currentCustomStart && currentCustomEnd) {
    queryParams.set('customStart', currentCustomStart);
    queryParams.set('customEnd', currentCustomEnd);
  }
  if (currentSearch) queryParams.set('search', currentSearch);

  const tBody = document.getElementById('vendor-reports-table-body');
  const emptyState = document.getElementById('vendor-reports-empty-state');
  if (tBody) tBody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-500">Loading report data...</td></tr>`;

  try {
    const json = await api.get(`/api/v1/vendor/reports?${queryParams.toString()}`);
    if (json?.success && json.data) {
      renderReportView(json.data);
    }
  } catch (err) {
    console.error('Failed to load report:', err);
    if (tBody) {
      tBody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-rose-400">Failed to load report data. Please retry.</td></tr>`;
    }
  }
}

function renderReportView(data) {
  // 1. Headers & Description
  const titleEl = document.getElementById('active-report-title');
  const descEl = document.getElementById('active-report-description');
  const badgeEl = document.getElementById('vendor-reports-count-badge');
  const disclaimerEl = document.getElementById('vendor-reports-disclaimer');
  const disclaimerText = document.getElementById('vendor-reports-disclaimer-text');

  if (titleEl) titleEl.textContent = data.reportTitle;
  if (descEl) descEl.textContent = data.reportDescription;
  if (badgeEl) badgeEl.textContent = `${data.pagination?.total || 0} records`;

  if (data.disclaimer) {
    disclaimerEl?.classList.remove('hidden');
    if (disclaimerText) disclaimerText.textContent = data.disclaimer;
  } else {
    disclaimerEl?.classList.add('hidden');
  }

  // 2. Render 4 KPIs based on reportType
  updateKpiCards(data);

  // 3. Render Table Columns
  const thead = document.getElementById('vendor-reports-table-head');
  if (thead && data.columns) {
    thead.innerHTML = `
      <tr>
        ${data.columns.map((col) => `<th class="px-4 py-3">${escapeHtml(col.label)}</th>`).join('')}
      </tr>
    `;
  }

  // 4. Render Table Rows & Mobile Cards
  const tbody = document.getElementById('vendor-reports-table-body');
  const mobileContainer = document.getElementById('vendor-reports-mobile-cards');
  const emptyState = document.getElementById('vendor-reports-empty-state');

  if (!data.rows || data.rows.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (mobileContainer) mobileContainer.innerHTML = '';
    emptyState?.classList.remove('hidden');
  } else {
    emptyState?.classList.add('hidden');

    // Desktop Rows
    if (tbody) {
      tbody.innerHTML = data.rows.map((row) => `
        <tr class="hover:bg-gray-700/30 transition-colors">
          ${data.columns.map((col) => {
            const val = row[col.key];
            const isStatus = col.key === 'status' || col.key === 'paymentStatus' || col.key === 'hasDiscrepancy';
            return `<td class="px-4 py-3 ${isStatus ? '' : 'font-mono text-gray-200'}">${formatTableCell(col.key, val)}</td>`;
          }).join('')}
        </tr>
      `).join('');
    }

    // Mobile Cards
    if (mobileContainer) {
      mobileContainer.innerHTML = data.rows.map((row) => `
        <div class="p-4 space-y-2 bg-gray-800/40">
          <div class="flex items-center justify-between">
            <span class="font-bold text-sm text-gray-200">${escapeHtml(String(row[data.columns[0]?.key] || ''))}</span>
            <span class="text-xs">${formatTableCell(data.columns[data.columns.length - 1]?.key, row[data.columns[data.columns.length - 1]?.key])}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            ${data.columns.slice(1, -1).map((col) => `
              <div>
                <span class="text-gray-400 block">${escapeHtml(col.label)}:</span>
                <span class="text-gray-200 font-mono">${escapeHtml(String(row[col.key] ?? '—'))}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    }
  }

  // 5. Pagination Info
  const pageInfo = document.getElementById('vendor-reports-pagination-info');
  const pageIndicator = document.getElementById('vendor-reports-page-indicator');
  const btnPrev = document.getElementById('btn-vendor-reports-prev');
  const btnNext = document.getElementById('btn-vendor-reports-next');

  if (data.pagination) {
    const { total, page, limit, totalPages } = data.pagination;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    if (pageInfo) pageInfo.textContent = `Showing ${start}–${end} of ${total} records`;
    if (pageIndicator) pageIndicator.textContent = `${page} / ${totalPages}`;
    if (btnPrev) btnPrev.disabled = page <= 1;
    if (btnNext) btnNext.disabled = page >= totalPages;
  }
}

function updateKpiCards(data) {
  const k = data.kpis || {};
  const setKpi = (num, label, val, sub) => {
    const l = document.getElementById(`kpi-label-${num}`);
    const v = document.getElementById(`kpi-val-${num}`);
    const s = document.getElementById(`kpi-sub-${num}`);
    if (l) l.textContent = label;
    if (v) v.textContent = val;
    if (s) s.textContent = sub;
  };

  switch (data.reportType) {
    case 'po-history':
      setKpi(1, 'Total Orders Issued', k.totalOrders || '0', 'Purchase orders');
      setKpi(2, 'Total Ordered Value', k.totalOrderedValueFormatted || '₹0', 'Gross order value');
      setKpi(3, 'Completed Orders', k.completedOrders || '0', 'Fully fulfilled');
      setKpi(4, 'Active Orders', k.activeOrders || '0', 'Pending / In progress');
      break;

    case 'grn-history':
      setKpi(1, 'Total Receipts', k.totalGrns || '0', 'Delivery verifications');
      setKpi(2, '100% Verified GRNs', k.fullDeliveries || '0', 'Clean intake');
      setKpi(3, 'Discrepancy Deliveries', k.discrepantDeliveries || '0', 'Variance recorded');
      setKpi(4, 'Verified Line Items', k.totalVerifiedLines || '0', 'Total items received');
      break;

    case 'invoice-history':
      setKpi(1, 'Total Invoices', k.totalInvoices || '0', 'Bills recorded');
      setKpi(2, 'Approved Payable', k.totalApprovedFormatted || '₹0', 'Approved for payment');
      setKpi(3, 'Settled Amount', k.totalPaidFormatted || '₹0', 'Disbursed to date');
      setKpi(4, 'Outstanding Balance', k.totalOutstandingFormatted || '₹0', 'Receivable balance');
      break;

    case 'payment-history':
      setKpi(1, 'Total Payments', k.totalPayments || '0', 'Settlement vouchers');
      setKpi(2, 'Gross Settled', k.totalSettledFormatted || '₹0', 'Disbursed to bank');
      setKpi(3, 'Cleared Payments', k.clearedPayments || '0', 'Banking cleared');
      setKpi(4, 'Payment Method', 'BANK TRANSFER', 'Direct NEFT/RTGS');
      break;

    case 'outstanding-receivables':
      setKpi(1, 'Open Invoices', k.openInvoicesCount || '0', 'Awaiting settlement');
      setKpi(2, 'Total Outstanding', k.totalOutstandingFormatted || '₹0', 'Total open balance');
      setKpi(3, 'Current (Not Due)', k.currentFormatted || '₹0', 'Within credit terms');
      setKpi(4, 'Total Overdue', k.totalOverdueFormatted || '₹0', 'Past due date');
      break;

    case 'ageing-report':
      setKpi(1, 'Current Balance', k.currentFormatted || '₹0', '0 days overdue');
      setKpi(2, '1–30 Days Overdue', k.days1to30Formatted || '₹0', 'Maturity 1-30');
      setKpi(3, '90+ Days Overdue', k.days90PlusFormatted || '₹0', 'Critical overdue');
      setKpi(4, 'Total Outstanding', k.totalOutstandingFormatted || '₹0', 'Cumulative debt');
      break;

    case 'returns-adjustments':
      setKpi(1, 'Total Adjustments', k.totalAdjustments || '0', 'Notes & variances');
      setKpi(2, 'Debit Notes', k.debitNotesCount || '0', 'Reduces payable');
      setKpi(3, 'Credit Notes', k.creditNotesCount || '0', 'Increases payable');
      setKpi(4, 'Net Adjustment', k.netAdjustmentFormatted || '₹0', 'Cumulative impact');
      break;

    case 'account-statement':
      setKpi(1, 'Opening Balance', k.openingBalanceFormatted || '₹0', 'Prior to period');
      setKpi(2, 'Period Credits', k.totalCreditsFormatted || '₹0', 'New invoices');
      setKpi(3, 'Period Debits', k.totalDebitsFormatted || '₹0', 'Disbursements');
      setKpi(4, 'Closing Balance', k.closingBalanceFormatted || '₹0', 'Ending ledger balance');
      break;

    case 'product-supply-history':
      setKpi(1, 'Catalogued Items', k.totalCataloguedItems || '0', 'Authorised products');
      setKpi(2, 'Active Items Supplied', k.activeItemsCount || '0', 'Supplied in period');
      setKpi(3, 'Total Units Supplied', k.totalUnitsSupplied || '0', 'Accepted quantity');
      setKpi(4, 'Gross Spend', k.totalSpendFormatted || '₹0', 'Historical volume');
      break;

    case 'tax-gst-summary':
      setKpi(1, 'Total Tax Invoices', k.totalInvoices || '0', 'Invoices filed');
      setKpi(2, 'Total Taxable Value', k.totalTaxableFormatted || '₹0', 'Base taxable value');
      setKpi(3, 'Total GST Amount', k.totalGstFormatted || '₹0', 'CGST + SGST + IGST');
      setKpi(4, 'Gross Invoice Value', k.grossTotalFormatted || '₹0', 'Total billing');
      break;

    default:
      setKpi(1, 'Total Records', '0', 'Active selection');
      setKpi(2, 'Primary Amount', '₹0', 'Gross value');
      setKpi(3, 'Settled Amount', '₹0', 'Cleared');
      setKpi(4, 'Open Balance', '₹0', 'Outstanding');
  }
}

function formatTableCell(key, val) {
  if (val === null || val === undefined) return '—';
  const str = String(val);

  if (key === 'status' || key === 'paymentStatus') {
    const s = str.toUpperCase();
    if (s === 'PAID' || s === 'RECEIVED_FULL' || s === 'CLEARED' || s === 'CLOSED' || s === 'VERIFIED') {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${escapeHtml(s)}</span>`;
    }
    if (s === 'PARTIALLY_PAID' || s === 'ORDERED' || s === 'APPROVED' || s === 'PARTIALLY_DELIVERED') {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">${escapeHtml(s)}</span>`;
    }
    if (s === 'OVERDUE' || s === 'UNPAID') {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">${escapeHtml(s)}</span>`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300">${escapeHtml(s)}</span>`;
  }

  if (key === 'hasDiscrepancy') {
    if (str.startsWith('YES')) {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">Variance</span>`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Clean</span>`;
  }

  return escapeHtml(str);
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

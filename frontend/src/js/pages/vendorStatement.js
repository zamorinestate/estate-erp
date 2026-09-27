// =============================================================================
// ZAMORIN CAFE ERP — VEN-SCR-006: ACCOUNT STATEMENT
//
// Authoritative, strictly read-only visibility into the Vendor Account Statement
// and chronological subledger progression:
// - 4 Balance Progression KPI Cards: Opening Balance, Total Period Bills (+),
//   Total Period Settlements / Credits (-), Closing Balance (=)
// - Preserves authoritative subledger direction:
//     Credit = Increases liability (Bill)
//     Debit  = Decreases liability (Payment / Credit Note)
// - Date range filtering: fromDate, toDate, quick presets
// - Café scope filtering constrained to approvedCafeIds
// - Universal reference search and transaction type filtering
// - Export to official Vector A4 PDF and standard CSV
// - In-browser print layout with clean professional styling
// - Zero vendor mutation controls (strict read-only access)
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentStatementData = null;
let currentSelectedCafe = "ALL";
let currentFromDate = "";
let currentToDate = "";
let currentSelectedEntryType = "ALL";
let currentSearchTerm = "";
let currentPage = 1;
let currentLimit = 50;

function formatCurrency(paisa) {
  const amount = Number(paisa || 0) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function renderVendorStatement() {
  return `
    <div id="vendor-statement-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-950/40 via-sky-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-lg border border-sky-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-300">READ-ONLY ACCOUNT STATEMENT</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-sky-500/20 text-sky-200 border border-sky-500/40">VEN-SCR-006</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Authoritative commercial subledger tracking liability creation, banking payments, credits, and running balance progression.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-refresh-statement" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
            <span class="refresh-icon">🔄</span> Refresh
          </button>
        </div>
      </div>

      <!-- HEADER & IDENTITY BLOCK -->
      <header class="vendor-header bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2.5 text-xs font-semibold text-primary-400 uppercase tracking-widest">
            <span>ZAMORIN CAFÉ ERP</span>
            <span class="text-neutral-600">•</span>
            <span>VENDOR WORKSPACE</span>
          </div>
          <h1 id="vendor-company-name" class="text-xl sm:text-2xl font-black text-white mt-1 tracking-tight flex items-center gap-3">
            <span>Account Statement</span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span id="vendor-id-badge" class="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 font-semibold">—</span>
            <span id="vendor-category-badge" class="px-2.5 py-1 rounded-md bg-primary-950/60 text-primary-300 border border-primary-800/50 uppercase font-semibold text-[11px]">—</span>
            <span id="vendor-gst-badge" class="hidden sm:inline-flex px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono text-[11px]">—</span>
            <span id="vendor-pan-badge" class="hidden sm:inline-flex px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono text-[11px]">—</span>
          </div>
        </div>

        <!-- CAFÉ SCOPE SELECTOR -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-2">
          <label for="select-cafe-scope" class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Café Scope:</label>
          <select id="select-cafe-scope" class="bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-primary-500 shadow-inner min-w-[200px]">
            <option value="ALL">All Authorised Cafés</option>
          </select>
        </div>
      </header>

      <!-- 4 AUTHORITATIVE SUBLEDGER PROGRESSION KPI CARDS -->
      <section class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
        <!-- 1. Opening Balance -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-sky-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-sky-400">Opening Balance</div>
          <div id="kpi-opening-balance" class="text-lg sm:text-xl font-black text-white mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Payable at start of period</div>
        </div>

        <!-- 2. Total Period Bills (+) -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-amber-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-amber-400">(+) Period Bills</div>
          <div id="kpi-period-credit" class="text-lg sm:text-xl font-black text-white mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Credits / Liabilities added</div>
        </div>

        <!-- 3. Total Settlements / Credits (-) -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-emerald-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400">(-) Settlements & Credits</div>
          <div id="kpi-period-debit" class="text-lg sm:text-xl font-black text-white mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Debits / Payable reductions</div>
        </div>

        <!-- 4. Closing Balance (=) -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-primary-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-primary-400">(=) Closing Balance</div>
          <div id="kpi-closing-balance" class="text-lg sm:text-xl font-black text-white mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Net payable at end of period</div>
        </div>
      </section>

      <!-- FILTER & EXPORT TOOLBAR -->
      <section class="filter-toolbar bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 backdrop-blur-md shadow-md space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <!-- Date presets -->
            <button class="btn-date-preset px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-range="30days">Last 30 Days</button>
            <button class="btn-date-preset px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-range="this_month">This Month</button>
            <button class="btn-date-preset px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-range="this_quarter">Current Quarter</button>
            <button class="btn-date-preset px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-range="this_fy">Financial Year</button>
            <button class="btn-date-preset px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-range="all">All Time</button>
          </div>

          <!-- Statement Export & Print Actions -->
          <div class="flex items-center gap-2">
            <button id="btn-export-csv" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
              <span>📊</span> Export CSV
            </button>
            <button id="btn-download-pdf" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-primary-950/80 hover:bg-primary-900 active:scale-95 transition-all rounded-lg border border-primary-700/60 flex items-center gap-1.5 text-primary-200 shadow">
              <span>📄</span> Download PDF
            </button>
            <button id="btn-print-statement" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
              <span>🖨️</span> Print
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-2 border-t border-neutral-800/80">
          <!-- From Date -->
          <div>
            <label for="filter-from-date" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">From Date:</label>
            <input type="date" id="filter-from-date" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
          </div>

          <!-- To Date -->
          <div>
            <label for="filter-to-date" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">To Date:</label>
            <input type="date" id="filter-to-date" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
          </div>

          <!-- Transaction Type -->
          <div>
            <label for="select-entry-type" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Transaction Type:</label>
            <select id="select-entry-type" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Transactions</option>
              <option value="VENDOR_BILL">Bills & Invoices</option>
              <option value="PAYMENT">Bank Payments</option>
              <option value="PARTIAL_PAYMENT">Partial Payments</option>
              <option value="ADVANCE_PAYMENT">Advances Paid</option>
              <option value="ADVANCE_APPLIED">Advances Applied</option>
              <option value="CREDIT_NOTE">Credit Notes</option>
              <option value="DEBIT_ADJUSTMENT">Debit Adjustments</option>
              <option value="OPENING_BALANCE">Opening Balance</option>
              <option value="HOLD_RELEASE">Hold Releases</option>
            </select>
          </div>

          <!-- Search -->
          <div class="sm:col-span-2 md:col-span-1 lg:col-span-2">
            <label for="input-search" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Search Reference:</label>
            <div class="relative">
              <input type="text" id="input-search" placeholder="Search reference, invoice, PO, or payment ID..." class="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 shadow-inner">
              <span class="absolute left-2.5 top-2 text-neutral-500 text-xs">🔍</span>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <div class="text-xs text-neutral-400 font-medium">
            <span id="label-period-display">Selected Period: Loading...</span>
          </div>
          <button id="btn-reset-filters" class="text-xs text-neutral-400 hover:text-white underline transition-colors">
            Reset Filters
          </button>
        </div>
      </section>

      <!-- STATEMENT REGISTER (DESKTOP TABLE & MOBILE CARDS) -->
      <section class="statement-register-section bg-neutral-900/80 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        <div class="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>Subledger Journal</span>
            <span id="badge-entry-count" class="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-mono text-[11px]">0 entries</span>
          </h2>
          <div class="text-xs text-neutral-400 font-medium">
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
            <span>Strict Chronological Accounting Direction</span>
          </div>
        </div>

        <!-- DESKTOP REGISTER TABLE -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-neutral-800 text-[11px] font-bold text-neutral-400 uppercase tracking-wider bg-neutral-950/60">
                <th class="py-3 px-4">Date</th>
                <th class="py-3 px-4">Reference</th>
                <th class="py-3 px-4">Transaction Type</th>
                <th class="py-3 px-4">PO / Invoice</th>
                <th class="py-3 px-4">Café</th>
                <th class="py-3 px-4 text-right">Debit (-)</th>
                <th class="py-3 px-4 text-right">Credit (+)</th>
                <th class="py-3 px-4 text-right">Running Balance</th>
                <th class="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody id="statement-table-body" class="divide-y divide-neutral-800/60 text-xs">
              <!-- Dynamically populated -->
            </tbody>
          </table>
        </div>

        <!-- MOBILE STRUCTURED CARDS -->
        <div id="statement-mobile-cards" class="md:hidden divide-y divide-neutral-800/80">
          <!-- Dynamically populated -->
        </div>

        <!-- EMPTY STATE -->
        <div id="statement-empty-state" class="hidden p-12 text-center space-y-3">
          <div class="text-4xl">📜</div>
          <div class="text-base font-bold text-white">No Ledger Transactions Recorded</div>
          <p class="text-xs text-neutral-400 max-w-md mx-auto">There are no subledger transactions matching your selected date range and filter criteria.</p>
        </div>

        <!-- PAGINATION CONTROLS -->
        <div id="pagination-controls" class="px-5 py-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400 bg-neutral-950/40">
          <span id="pagination-info">Showing 0 of 0 entries</span>
          <div class="flex items-center gap-1.5">
            <button id="btn-prev-page" class="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-all" disabled>Previous</button>
            <span id="pagination-page-number" class="px-2 font-mono font-bold text-white">1</span>
            <button id="btn-next-page" class="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-all" disabled>Next</button>
          </div>
        </div>
      </section>

      <!-- READ-ONLY TRANSACTION DETAIL MODAL -->
      <div id="modal-entry-detail" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
          
          <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div>
              <span class="text-[10px] font-bold text-sky-400 uppercase tracking-widest">SUBLEDGER ENTRY DETAIL</span>
              <h3 id="modal-entry-id" class="text-lg font-black text-white mt-0.5 font-mono">—</h3>
            </div>
            <button id="btn-close-modal" class="text-neutral-400 hover:text-white text-lg font-bold p-1">✕</button>
          </div>

          <div class="space-y-4 text-xs">
            <!-- 1. Transaction Identity -->
            <div class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 space-y-2">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">1. Transaction Identity</div>
              <div class="grid grid-cols-2 gap-2 text-neutral-300">
                <div><span class="text-neutral-500">Posting Date:</span> <span id="modal-entry-date" class="font-semibold text-white">—</span></div>
                <div><span class="text-neutral-500">Entry Type:</span> <span id="modal-entry-type-label" class="font-semibold text-white">—</span></div>
                <div><span class="text-neutral-500">Reference Type:</span> <span id="modal-reference-type" class="font-mono text-white">—</span></div>
                <div><span class="text-neutral-500">Reference No:</span> <span id="modal-reference-number" class="font-mono font-bold text-white">—</span></div>
              </div>
            </div>

            <!-- 2. Source Documents & References -->
            <div class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 space-y-2">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">2. Associated Documents</div>
              <div class="grid grid-cols-2 gap-2 text-neutral-300">
                <div><span class="text-neutral-500">Purchase Order:</span> <span id="modal-po-ref" class="font-mono text-white">—</span></div>
                <div><span class="text-neutral-500">Supplier Invoice:</span> <span id="modal-inv-ref" class="font-mono text-white">—</span></div>
                <div><span class="text-neutral-500">Payment ID:</span> <span id="modal-payment-ref" class="font-mono text-white">—</span></div>
                <div><span class="text-neutral-500">Café Scope:</span> <span id="modal-cafe-scope" class="font-semibold text-white">—</span></div>
              </div>
            </div>

            <!-- 3. Accounting Direction -->
            <div class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 space-y-2">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">3. Accounting Effect on Payable</div>
              <div class="grid grid-cols-2 gap-3">
                <div class="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div class="text-[10px] uppercase font-bold text-neutral-400">Debit (Reduces Payable)</div>
                  <div id="modal-debit-val" class="text-sm font-black text-emerald-400 mt-1">₹0</div>
                  <div class="text-[10px] text-neutral-500 mt-0.5">Disbursed settlement or credit</div>
                </div>
                <div class="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div class="text-[10px] uppercase font-bold text-neutral-400">Credit (Increases Payable)</div>
                  <div id="modal-credit-val" class="text-sm font-black text-amber-400 mt-1">₹0</div>
                  <div class="text-[10px] text-neutral-500 mt-0.5">Approved bill or liability</div>
                </div>
              </div>
            </div>

            <!-- 4. Resulting Running Balance -->
            <div class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">4. Resulting Running Balance</div>
                <div class="text-[10px] text-neutral-500">Cumulative commercial balance after this entry</div>
              </div>
              <div id="modal-running-balance" class="text-base font-black text-sky-400 font-mono">₹0</div>
            </div>

            <!-- 5. Description -->
            <div class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 space-y-1">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">5. Safe Description</div>
              <p id="modal-description" class="text-neutral-300 font-mono text-[11px] break-words leading-relaxed">—</p>
            </div>
          </div>

          <div class="pt-2 flex justify-end">
            <button id="btn-modal-close" class="px-4 py-2 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all">Close</button>
          </div>
        </div>
      </div>

    </div>
  `;
}

export async function initVendorStatement() {
  const container = document.getElementById("vendor-statement-container");
  if (!container) return;

  // Initialize dates: default to last 30 days
  const today = new Date();
  const past30 = new Date(today);
  past30.setDate(past30.getDate() - 30);
  currentToDate = today.toISOString().slice(0, 10);
  currentFromDate = past30.toISOString().slice(0, 10);

  const inputFrom = document.getElementById("filter-from-date");
  const inputTo = document.getElementById("filter-to-date");
  if (inputFrom) inputFrom.value = currentFromDate;
  if (inputTo) inputTo.value = currentToDate;

  // Bind event listeners
  bindEventListeners();

  // Load statement data
  await loadStatementData();
}

function bindEventListeners() {
  // Refresh button
  const btnRefresh = document.getElementById("btn-refresh-statement");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      currentPage = 1;
      loadStatementData();
    });
  }

  // Café scope change
  const selectCafe = document.getElementById("select-cafe-scope");
  if (selectCafe) {
    selectCafe.addEventListener("change", (e) => {
      currentSelectedCafe = e.target.value;
      currentPage = 1;
      loadStatementData();
    });
  }

  // Transaction type filter
  const selectType = document.getElementById("select-entry-type");
  if (selectType) {
    selectType.addEventListener("change", (e) => {
      currentSelectedEntryType = e.target.value;
      currentPage = 1;
      loadStatementData();
    });
  }

  // From date input
  const inputFrom = document.getElementById("filter-from-date");
  if (inputFrom) {
    inputFrom.addEventListener("change", (e) => {
      currentFromDate = e.target.value;
      currentPage = 1;
      loadStatementData();
    });
  }

  // To date input
  const inputTo = document.getElementById("filter-to-date");
  if (inputTo) {
    inputTo.addEventListener("change", (e) => {
      currentToDate = e.target.value;
      currentPage = 1;
      loadStatementData();
    });
  }

  // Date Presets
  const presetButtons = document.querySelectorAll(".btn-date-preset");
  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const range = btn.dataset.range;
      applyDatePreset(range);
      currentPage = 1;
      loadStatementData();
    });
  });

  // Search input debounce
  const inputSearch = document.getElementById("input-search");
  if (inputSearch) {
    let debounceTimer = null;
    inputSearch.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearchTerm = e.target.value.trim();
        currentPage = 1;
        loadStatementData();
      }, 350);
    });
  }

  // Reset Filters
  const btnReset = document.getElementById("btn-reset-filters");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      applyDatePreset("30days");
      currentSelectedCafe = "ALL";
      currentSelectedEntryType = "ALL";
      currentSearchTerm = "";
      if (inputSearch) inputSearch.value = "";
      if (selectType) selectType.value = "ALL";
      if (selectCafe) selectCafe.value = "ALL";
      currentPage = 1;
      loadStatementData();
    });
  }

  // Export CSV
  const btnCsv = document.getElementById("btn-export-csv");
  if (btnCsv) {
    btnCsv.addEventListener("click", () => exportStatementCsv());
  }

  // Download PDF
  const btnPdf = document.getElementById("btn-download-pdf");
  if (btnPdf) {
    btnPdf.addEventListener("click", () => downloadStatementPdf());
  }

  // Print Statement
  const btnPrint = document.getElementById("btn-print-statement");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => window.print());
  }

  // Pagination buttons
  const btnPrev = document.getElementById("btn-prev-page");
  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadStatementData();
      }
    });
  }

  const btnNext = document.getElementById("btn-next-page");
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      const maxPages = currentStatementData?.pagination?.totalPages || 1;
      if (currentPage < maxPages) {
        currentPage++;
        loadStatementData();
      }
    });
  }

  // Modal close buttons
  const modal = document.getElementById("modal-entry-detail");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnModalClose = document.getElementById("btn-modal-close");

  if (btnCloseModal && modal) {
    btnCloseModal.addEventListener("click", () => modal.classList.add("hidden"));
  }
  if (btnModalClose && modal) {
    btnModalClose.addEventListener("click", () => modal.classList.add("hidden"));
  }
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }
}

function applyDatePreset(preset) {
  const today = new Date();
  const inputFrom = document.getElementById("filter-from-date");
  const inputTo = document.getElementById("filter-to-date");

  switch (preset) {
    case "30days": {
      const past30 = new Date(today);
      past30.setDate(past30.getDate() - 30);
      currentFromDate = past30.toISOString().slice(0, 10);
      currentToDate = today.toISOString().slice(0, 10);
      break;
    }
    case "this_month": {
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      currentFromDate = `${year}-${month}-01`;
      currentToDate = today.toISOString().slice(0, 10);
      break;
    }
    case "this_quarter": {
      const curQuarter = Math.floor(today.getMonth() / 3);
      const startMonth = String(curQuarter * 3 + 1).padStart(2, "0");
      currentFromDate = `${today.getFullYear()}-${startMonth}-01`;
      currentToDate = today.toISOString().slice(0, 10);
      break;
    }
    case "this_fy": {
      const curYear = today.getFullYear();
      const isPastApril = today.getMonth() >= 3;
      const fyStart = isPastApril ? curYear : curYear - 1;
      currentFromDate = `${fyStart}-04-01`;
      currentToDate = today.toISOString().slice(0, 10);
      break;
    }
    case "all": {
      currentFromDate = "2020-01-01";
      currentToDate = today.toISOString().slice(0, 10);
      break;
    }
  }

  if (inputFrom) inputFrom.value = currentFromDate;
  if (inputTo) inputTo.value = currentToDate;
}

async function loadStatementData() {
  try {
    const params = new URLSearchParams();
    if (currentSelectedCafe && currentSelectedCafe !== "ALL") params.append("cafeId", currentSelectedCafe);
    if (currentFromDate) params.append("fromDate", currentFromDate);
    if (currentToDate) params.append("toDate", currentToDate);
    if (currentSelectedEntryType && currentSelectedEntryType !== "ALL") params.append("entryType", currentSelectedEntryType);
    if (currentSearchTerm) params.append("search", currentSearchTerm);
    params.append("page", currentPage);
    params.append("limit", currentLimit);

    const res = await api.get(`/api/v1/vendor/statement?${params.toString()}`);
    if (res && res.success && res.data) {
      currentStatementData = res.data;
      updateStatementUI(res.data);
    }
  } catch (err) {
    console.error("Failed to load vendor account statement:", err);
  }
}

function updateStatementUI(data) {
  // Update Vendor Badges
  const vendor = data.vendor || {};
  const companyNameEl = document.getElementById("vendor-company-name");
  const vendorIdBadge = document.getElementById("vendor-id-badge");
  const gstBadge = document.getElementById("vendor-gst-badge");
  const panBadge = document.getElementById("vendor-pan-badge");

  if (companyNameEl) companyNameEl.innerHTML = `<span>Account Statement</span> <span class="text-xs text-neutral-400 font-normal">(${vendor.tradeName || vendor.name || "Vendor"})</span>`;
  if (vendorIdBadge) vendorIdBadge.textContent = vendor.vendorId || "—";
  if (gstBadge) gstBadge.textContent = `GST: ${vendor.gstNumber || "Unregistered"}`;
  if (panBadge) panBadge.textContent = `PAN: ${vendor.panNumber || "N/A"}`;

  // Period label
  const periodLabel = document.getElementById("label-period-display");
  if (periodLabel && data.period) {
    periodLabel.textContent = `Period: ${formatDate(data.period.fromDate)} to ${formatDate(data.period.toDate)} • Scope: ${data.period.cafeName || "All Cafés"}`;
  }

  // Update 4 Summary KPI Cards
  const summary = data.summary || {};
  const kpiOpening = document.getElementById("kpi-opening-balance");
  const kpiCredit = document.getElementById("kpi-period-credit");
  const kpiDebit = document.getElementById("kpi-period-debit");
  const kpiClosing = document.getElementById("kpi-closing-balance");

  if (kpiOpening) kpiOpening.textContent = summary.openingBalanceFormatted || formatCurrency(summary.openingBalancePaisa || 0);
  if (kpiCredit) kpiCredit.textContent = summary.totalCreditFormatted || formatCurrency(summary.totalCreditPaisa || 0);
  if (kpiDebit) kpiDebit.textContent = summary.totalDebitFormatted || formatCurrency(summary.totalDebitPaisa || 0);
  if (kpiClosing) kpiClosing.textContent = summary.closingBalanceFormatted || formatCurrency(summary.closingBalancePaisa || 0);

  // Update Entries Register
  const entries = data.entries || [];
  const badgeCount = document.getElementById("badge-entry-count");
  if (badgeCount) badgeCount.textContent = `${entries.length} of ${data.pagination?.totalCount || entries.length} entries`;

  renderStatementTable(entries);
  renderStatementMobileCards(entries);

  // Toggle Empty State
  const emptyState = document.getElementById("statement-empty-state");
  if (emptyState) {
    emptyState.classList.toggle("hidden", entries.length > 0);
  }

  // Update Pagination
  const pagination = data.pagination || {};
  const paginationInfo = document.getElementById("pagination-info");
  const btnPrev = document.getElementById("btn-prev-page");
  const btnNext = document.getElementById("btn-next-page");
  const pageNumEl = document.getElementById("pagination-page-number");

  if (paginationInfo) {
    const total = pagination.totalCount || 0;
    const start = total === 0 ? 0 : (currentPage - 1) * currentLimit + 1;
    const end = Math.min(currentPage * currentLimit, total);
    paginationInfo.textContent = `Showing ${start} - ${end} of ${total} entries`;
  }
  if (pageNumEl) pageNumEl.textContent = String(currentPage);
  if (btnPrev) btnPrev.disabled = currentPage <= 1;
  if (btnNext) btnNext.disabled = currentPage >= (pagination.totalPages || 1);
}

function renderStatementTable(entries) {
  const tbody = document.getElementById("statement-table-body");
  if (!tbody) return;

  if (entries.length === 0) {
    tbody.innerHTML = "";
    return;
  }

  tbody.innerHTML = entries
    .map((e) => {
      const debitFormatted = Number(e.debitPaisa || 0) > 0 ? e.debitFormatted : "—";
      const creditFormatted = Number(e.creditPaisa || 0) > 0 ? e.creditFormatted : "—";
      const relatedDoc = e.supplierInvoiceNumber || e.purchaseOrderId || e.paymentId || "—";

      return `
        <tr class="hover:bg-neutral-800/40 transition-colors">
          <td class="py-3 px-4 text-neutral-300 font-mono whitespace-nowrap">${e.entryDate}</td>
          <td class="py-3 px-4 font-mono font-semibold text-white whitespace-nowrap">${e.referenceNumber || e.ledgerEntryId}</td>
          <td class="py-3 px-4">
            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getEntryTypeBadgeClass(e.entryType)}">
              ${e.entryTypeLabel || e.entryType}
            </span>
          </td>
          <td class="py-3 px-4 font-mono text-neutral-300 whitespace-nowrap">${relatedDoc}</td>
          <td class="py-3 px-4 text-neutral-300 whitespace-nowrap">${e.cafeName || e.cafeId}</td>
          <td class="py-3 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">${debitFormatted}</td>
          <td class="py-3 px-4 text-right font-mono font-bold text-amber-400 whitespace-nowrap">${creditFormatted}</td>
          <td class="py-3 px-4 text-right font-mono font-bold text-sky-400 whitespace-nowrap">${e.runningBalanceFormatted}</td>
          <td class="py-3 px-4 text-center">
            <button class="btn-view-entry px-2.5 py-1 text-[11px] rounded bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition-all" data-entry-id="${e.ledgerEntryId}">
              View
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  // Attach click listeners to view entry buttons
  tbody.querySelectorAll(".btn-view-entry").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entryId = btn.dataset.entryId;
      const matched = entries.find((x) => x.ledgerEntryId === entryId);
      if (matched) showEntryDetailModal(matched);
    });
  });
}

function renderStatementMobileCards(entries) {
  const container = document.getElementById("statement-mobile-cards");
  if (!container) return;

  if (entries.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = entries
    .map((e) => {
      const debitFormatted = Number(e.debitPaisa || 0) > 0 ? e.debitFormatted : null;
      const creditFormatted = Number(e.creditPaisa || 0) > 0 ? e.creditFormatted : null;

      return `
        <div class="p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono font-bold text-white">${e.referenceNumber || e.ledgerEntryId}</span>
            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getEntryTypeBadgeClass(e.entryType)}">
              ${e.entryTypeLabel || e.entryType}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs text-neutral-300">
            <div><span class="text-neutral-500">Date:</span> <span class="font-mono text-white">${e.entryDate}</span></div>
            <div><span class="text-neutral-500">Café:</span> <span class="text-white">${e.cafeName || e.cafeId}</span></div>
            <div><span class="text-neutral-500">PO/Invoice:</span> <span class="font-mono text-white">${e.supplierInvoiceNumber || e.purchaseOrderId || "—"}</span></div>
            <div><span class="text-neutral-500">Running Bal:</span> <span class="font-mono font-bold text-sky-400">${e.runningBalanceFormatted}</span></div>
          </div>

          <div class="flex items-center justify-between pt-1 border-t border-neutral-800/80">
            <div>
              ${debitFormatted ? `<span class="text-xs font-mono font-bold text-emerald-400">Debit: ${debitFormatted}</span>` : ""}
              ${creditFormatted ? `<span class="text-xs font-mono font-bold text-amber-400">Credit: ${creditFormatted}</span>` : ""}
            </div>
            <button class="btn-view-entry-mobile px-3 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-white font-medium" data-entry-id="${e.ledgerEntryId}">
              Details
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".btn-view-entry-mobile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entryId = btn.dataset.entryId;
      const matched = entries.find((x) => x.ledgerEntryId === entryId);
      if (matched) showEntryDetailModal(matched);
    });
  });
}

function getEntryTypeBadgeClass(type) {
  switch (type) {
    case "VENDOR_BILL":
      return "bg-amber-950/60 text-amber-300 border border-amber-800/40";
    case "PAYMENT":
    case "PARTIAL_PAYMENT":
      return "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40";
    case "CREDIT_NOTE":
      return "bg-purple-950/60 text-purple-300 border border-purple-800/40";
    case "DEBIT_ADJUSTMENT":
      return "bg-blue-950/60 text-blue-300 border border-blue-800/40";
    case "OPENING_BALANCE":
      return "bg-sky-950/60 text-sky-300 border border-sky-800/40";
    default:
      return "bg-neutral-800 text-neutral-300 border border-neutral-700";
  }
}

function showEntryDetailModal(e) {
  const modal = document.getElementById("modal-entry-detail");
  if (!modal) return;

  document.getElementById("modal-entry-id").textContent = e.ledgerEntryId || "—";
  document.getElementById("modal-entry-date").textContent = e.entryDate || "—";
  document.getElementById("modal-entry-type-label").textContent = e.entryTypeLabel || e.entryType || "—";
  document.getElementById("modal-reference-type").textContent = e.referenceType || "MANUAL";
  document.getElementById("modal-reference-number").textContent = e.referenceNumber || e.ledgerEntryId || "—";

  document.getElementById("modal-po-ref").textContent = e.purchaseOrderId || "—";
  document.getElementById("modal-inv-ref").textContent = e.supplierInvoiceNumber || "—";
  document.getElementById("modal-payment-ref").textContent = e.paymentId || "—";
  document.getElementById("modal-cafe-scope").textContent = e.cafeName || e.cafeId || "—";

  document.getElementById("modal-debit-val").textContent = Number(e.debitPaisa || 0) > 0 ? e.debitFormatted : "₹0";
  document.getElementById("modal-credit-val").textContent = Number(e.creditPaisa || 0) > 0 ? e.creditFormatted : "₹0";
  document.getElementById("modal-running-balance").textContent = e.runningBalanceFormatted || "₹0";
  document.getElementById("modal-description").textContent = e.notes || "Standard subledger entry posted to vendor subledger.";

  modal.classList.remove("hidden");
}

async function exportStatementCsv() {
  try {
    const params = new URLSearchParams();
    if (currentSelectedCafe && currentSelectedCafe !== "ALL") params.append("cafeId", currentSelectedCafe);
    if (currentFromDate) params.append("fromDate", currentFromDate);
    if (currentToDate) params.append("toDate", currentToDate);
    if (currentSelectedEntryType && currentSelectedEntryType !== "ALL") params.append("entryType", currentSelectedEntryType);
    if (currentSearchTerm) params.append("search", currentSearchTerm);

    await downloadBlob(`/api/v1/vendor/statement/csv?${params.toString()}`, `VendorStatement-${currentFromDate}-to-${currentToDate}.csv`);
  } catch (err) {
    console.error("Failed to download statement CSV:", err);
  }
}

async function downloadStatementPdf() {
  try {
    const params = new URLSearchParams();
    if (currentSelectedCafe && currentSelectedCafe !== "ALL") params.append("cafeId", currentSelectedCafe);
    if (currentFromDate) params.append("fromDate", currentFromDate);
    if (currentToDate) params.append("toDate", currentToDate);

    await downloadBlob(`/api/v1/vendor/statement/pdf?${params.toString()}`, `VendorStatement-${currentFromDate}-to-${currentToDate}.pdf`);
  } catch (err) {
    console.error("Failed to download statement PDF:", err);
  }
}

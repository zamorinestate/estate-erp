// =============================================================================
// ZAMORIN CAFE ERP — VEN-SCR-007: OUTSTANDING RECEIVABLES & AGEING
//
// Authoritative, strictly read-only visibility into commercial receivables:
// - Answers the two fundamental questions:
//     1. How much is currently payable to this vendor?
//     2. How old is each outstanding amount?
// - 6 Ageing Summary KPI Cards: Total Outstanding, Current (Not Overdue),
//   1–30 Days, 31–60 Days, 61–90 Days, 90+ Days Overdue, and Held/Disputed
// - Multi-criteria filtering: Ageing bucket, payment status, café scope, sorting
// - Universal search: Invoice number, PO reference, café name/code
// - Authoritative due-date calculation: Never infers arbitrary dates;
//   displays "Due date not available" when no authoritative date exists
// - Export to official Vector A4 PDF and standard CSV
// - Zero vendor mutation capability (strict read-only access)
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentReceivablesData = null;
let currentSelectedCafe = "ALL";
let currentSelectedBucket = "ALL";
let currentSelectedPaymentStatus = "ALL";
let currentSearchTerm = "";
let currentSortBy = "days_desc";
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
  if (!dateStr || dateStr === "Due date not available") return dateStr || "—";
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

export function renderVendorReceivables() {
  return `
    <div id="vendor-receivables-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-rose-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-lg border border-rose-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-rose-300">READ-ONLY OUTSTANDING RECEIVABLES & AGEING</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-rose-500/20 text-rose-200 border border-rose-500/40">VEN-SCR-007</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Authoritative visibility into unsettled commercial invoices, statutory payment due dates, and aging delinquency brackets.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-refresh-receivables" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
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
            <span>Outstanding Receivables & Ageing</span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span id="vendor-id-badge" class="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 font-semibold">—</span>
            <span id="vendor-gst-badge" class="px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono text-[11px]">—</span>
            <span id="badge-as-of-date" class="px-2.5 py-1 rounded-md bg-rose-950/60 text-rose-300 border border-rose-800/50 text-[11px] font-semibold">As of: Today</span>
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

      <!-- 6 AUTHORITATIVE AGEING SUMMARY CARDS -->
      <section class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <!-- 1. Total Outstanding -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-primary-500/40 transition-colors p-3.5 rounded-xl shadow-md">
          <div class="text-[10px] font-bold uppercase tracking-wider text-primary-400">Total Outstanding</div>
          <div id="kpi-total-outstanding" class="text-base sm:text-lg font-black text-white mt-1">₹0</div>
          <div class="text-[9px] text-neutral-400 mt-0.5"><span id="kpi-open-count">0</span> open bills</div>
        </div>

        <!-- 2. Current (Not Overdue) -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-emerald-500/40 transition-colors p-3.5 rounded-xl shadow-md">
          <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Current (Not Due)</div>
          <div id="kpi-current-bucket" class="text-base sm:text-lg font-black text-white mt-1">₹0</div>
          <div class="text-[9px] text-neutral-400 mt-0.5">Due date >= today</div>
        </div>

        <!-- 3. 1–30 Days Overdue -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-amber-500/40 transition-colors p-3.5 rounded-xl shadow-md">
          <div class="text-[10px] font-bold uppercase tracking-wider text-amber-400">1–30 Days</div>
          <div id="kpi-bucket-1-30" class="text-base sm:text-lg font-black text-white mt-1">₹0</div>
          <div class="text-[9px] text-neutral-400 mt-0.5">Early overdue</div>
        </div>

        <!-- 4. 31–60 Days Overdue -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-orange-500/40 transition-colors p-3.5 rounded-xl shadow-md">
          <div class="text-[10px] font-bold uppercase tracking-wider text-orange-400">31–60 Days</div>
          <div id="kpi-bucket-31-60" class="text-base sm:text-lg font-black text-white mt-1">₹0</div>
          <div class="text-[9px] text-neutral-400 mt-0.5">Mid overdue</div>
        </div>

        <!-- 5. 61–90 Days Overdue -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-rose-500/40 transition-colors p-3.5 rounded-xl shadow-md">
          <div class="text-[10px] font-bold uppercase tracking-wider text-rose-400">61–90 Days</div>
          <div id="kpi-bucket-61-90" class="text-base sm:text-lg font-black text-white mt-1">₹0</div>
          <div class="text-[9px] text-neutral-400 mt-0.5">Critical overdue</div>
        </div>

        <!-- 6. 90+ Days Overdue -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-red-500/40 transition-colors p-3.5 rounded-xl shadow-md">
          <div class="text-[10px] font-bold uppercase tracking-wider text-red-500">90+ Days</div>
          <div id="kpi-bucket-90-plus" class="text-base sm:text-lg font-black text-white mt-1">₹0</div>
          <div class="text-[9px] text-neutral-400 mt-0.5">Severely overdue</div>
        </div>
      </section>

      <!-- HELD / DISPUTED NOTICE BANNER -->
      <div id="banner-held-disputed" class="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/30 flex items-center justify-between text-xs text-neutral-200">
        <div class="flex items-center gap-2.5">
          <span class="text-base">⚠️</span>
          <span><strong>Payment Holds & Disputed Variances:</strong> <span id="held-disputed-amount" class="font-bold text-amber-300">₹0</span> held for quality/quantity variance. Segregated from standard settlement pipeline.</span>
        </div>
        <span class="text-[11px] text-amber-400 font-semibold underline cursor-pointer" id="btn-filter-held">Filter Held Items</span>
      </div>

      <!-- FILTER & EXPORT TOOLBAR -->
      <section class="filter-toolbar bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 backdrop-blur-md shadow-md space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <!-- Ageing Bucket Filter Buttons -->
            <button class="btn-bucket-filter px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-bucket="ALL">All Buckets</button>
            <button class="btn-bucket-filter px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-bucket="CURRENT">Current</button>
            <button class="btn-bucket-filter px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-bucket="1_30">1–30 Days</button>
            <button class="btn-bucket-filter px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-bucket="31_60">31–60 Days</button>
            <button class="btn-bucket-filter px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-bucket="61_90">61–90 Days</button>
            <button class="btn-bucket-filter px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-bucket="90_PLUS">90+ Days</button>
            <button class="btn-bucket-filter px-2.5 py-1 text-xs rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all font-semibold" data-bucket="HELD">Held / Disputed</button>
          </div>

          <!-- Export & Print Actions -->
          <div class="flex items-center gap-2">
            <button id="btn-export-xlsx" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
              <span>📊</span> Export Excel
            </button>
            <button id="btn-download-pdf" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-rose-950/80 hover:bg-rose-900 active:scale-95 transition-all rounded-lg border border-rose-700/60 flex items-center gap-1.5 text-rose-200 shadow">
              <span>📄</span> Download PDF
            </button>
            <button id="btn-print-receivables" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
              <span>🖨️</span> Print
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-neutral-800/80">
          <!-- Payment Status -->
          <div>
            <label for="select-payment-status" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Payment Status:</label>
            <select id="select-payment-status" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Open Statuses</option>
              <option value="DUE">Due</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="ON_HOLD">On Hold</option>
            </select>
          </div>

          <!-- Sort By -->
          <div>
            <label for="select-sort-by" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Sort Invoices By:</label>
            <select id="select-sort-by" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="days_desc">Days Overdue (Highest First)</option>
              <option value="dueDate_asc">Due Date (Earliest First)</option>
              <option value="dueDate_desc">Due Date (Latest First)</option>
              <option value="amount_desc">Outstanding Amount (Highest First)</option>
            </select>
          </div>

          <!-- Search -->
          <div class="sm:col-span-2">
            <label for="input-search" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Search Receivables:</label>
            <div class="relative">
              <input type="text" id="input-search" placeholder="Search invoice number, PO reference, café name..." class="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 shadow-inner">
              <span class="absolute left-2.5 top-2 text-neutral-500 text-xs">🔍</span>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <div class="text-xs text-neutral-400 font-medium">
            <span id="label-overdue-summary">Summary: Loading receivables...</span>
          </div>
          <button id="btn-reset-filters" class="text-xs text-neutral-400 hover:text-white underline transition-colors">
            Reset Filters
          </button>
        </div>
      </section>

      <!-- RECEIVABLES REGISTER (DESKTOP TABLE & MOBILE CARDS) -->
      <section class="receivables-register-section bg-neutral-900/80 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        <div class="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h2 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>Receivables Ledger</span>
            <span id="badge-invoice-count" class="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-mono text-[11px]">0 invoices</span>
          </h2>
          <div class="text-xs text-neutral-400 font-medium">
            <span class="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5"></span>
            <span>Real-time AP Aging Tracking</span>
          </div>
        </div>

        <!-- DESKTOP REGISTER TABLE -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-neutral-800 text-[11px] font-bold text-neutral-400 uppercase tracking-wider bg-neutral-950/60">
                <th class="py-3 px-4">Invoice No</th>
                <th class="py-3 px-4">Café</th>
                <th class="py-3 px-4">Invoice Date</th>
                <th class="py-3 px-4">Due Date</th>
                <th class="py-3 px-4 text-right">Approved</th>
                <th class="py-3 px-4 text-right">Paid</th>
                <th class="py-3 px-4 text-right">Credits</th>
                <th class="py-3 px-4 text-right">Outstanding</th>
                <th class="py-3 px-4 text-center">Ageing Bracket</th>
                <th class="py-3 px-4 text-center">Status</th>
                <th class="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody id="receivables-table-body" class="divide-y divide-neutral-800/60 text-xs">
              <!-- Dynamically populated -->
            </tbody>
          </table>
        </div>

        <!-- MOBILE STRUCTURED CARDS -->
        <div id="receivables-mobile-cards" class="md:hidden divide-y divide-neutral-800/80">
          <!-- Dynamically populated -->
        </div>

        <!-- EMPTY STATE -->
        <div id="receivables-empty-state" class="hidden p-12 text-center space-y-3">
          <div class="text-4xl">🎉</div>
          <div class="text-base font-bold text-white">No Outstanding Receivables</div>
          <p class="text-xs text-neutral-400 max-w-md mx-auto">There are no outstanding invoices matching your selected filter criteria. All liabilities have been fully settled or cleared.</p>
        </div>

        <!-- PAGINATION CONTROLS -->
        <div id="pagination-controls" class="px-5 py-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400 bg-neutral-950/40">
          <span id="pagination-info">Showing 0 of 0 invoices</span>
          <div class="flex items-center gap-1.5">
            <button id="btn-prev-page" class="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-all" disabled>Previous</button>
            <span id="pagination-page-number" class="px-2 font-mono font-bold text-white">1</span>
            <button id="btn-next-page" class="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-all" disabled>Next</button>
          </div>
        </div>
      </section>

      <!-- READ-ONLY RECEIVABLE DETAIL MODAL -->
      <div id="modal-receivable-detail" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
          
          <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div>
              <span class="text-[10px] font-bold text-rose-400 uppercase tracking-widest">RECEIVABLE INVOICE DETAIL</span>
              <h3 id="modal-invoice-number" class="text-lg font-black text-white mt-0.5 font-mono">—</h3>
            </div>
            <button id="btn-close-modal" class="text-neutral-400 hover:text-white text-lg font-bold p-1">✕</button>
          </div>

          <div class="space-y-4 text-xs">
            <!-- 1. Invoice Identity & Dates -->
            <div class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 space-y-2">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">1. Invoice Identity & Dates</div>
              <div class="grid grid-cols-2 gap-2 text-neutral-300">
                <div><span class="text-neutral-500">Invoice Date:</span> <span id="modal-inv-date" class="font-semibold text-white">—</span></div>
                <div><span class="text-neutral-500">Due Date:</span> <span id="modal-due-date" class="font-semibold text-white">—</span></div>
                <div><span class="text-neutral-500">Café Scope:</span> <span id="modal-cafe-name" class="font-semibold text-white">—</span></div>
                <div><span class="text-neutral-500">Ageing Bracket:</span> <span id="modal-ageing-bracket" class="font-bold text-rose-400">—</span></div>
              </div>
            </div>

            <!-- 2. Associated Procurement -->
            <div class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 space-y-2">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">2. Associated Procurement</div>
              <div class="grid grid-cols-2 gap-2 text-neutral-300">
                <div><span class="text-neutral-500">Purchase Order:</span> <span id="modal-po-reference" class="font-mono text-white">—</span></div>
                <div><span class="text-neutral-500">GRN Receipt:</span> <span id="modal-grn-reference" class="font-mono text-white">—</span></div>
                <div><span class="text-neutral-500">Internal AP ID:</span> <span id="modal-internal-id" class="font-mono text-neutral-400">—</span></div>
                <div><span class="text-neutral-500">Invoice Status:</span> <span id="modal-inv-status" class="font-semibold text-white">—</span></div>
              </div>
            </div>

            <!-- 3. Three-Value Financial Architecture -->
            <div class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 space-y-2">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">3. Three-Value Financial Architecture</div>
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div class="text-[10px] text-neutral-400 uppercase">Claimed</div>
                  <div id="modal-claimed-amount" class="text-xs font-bold text-white mt-0.5">₹0</div>
                </div>
                <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div class="text-[10px] text-emerald-400 uppercase">Approved</div>
                  <div id="modal-approved-amount" class="text-xs font-bold text-emerald-400 mt-0.5">₹0</div>
                </div>
                <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div class="text-[10px] text-amber-400 uppercase">Held / Disputed</div>
                  <div id="modal-held-amount" class="text-xs font-bold text-amber-400 mt-0.5">₹0</div>
                </div>
              </div>
            </div>

            <!-- 4. Settlement & Net Outstanding -->
            <div class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 space-y-2">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">4. Settlement & Net Outstanding</div>
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div class="text-[10px] text-neutral-400 uppercase">Paid to Date</div>
                  <div id="modal-paid-amount" class="text-xs font-bold text-white mt-0.5">₹0</div>
                </div>
                <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div class="text-[10px] text-neutral-400 uppercase">Credits Applied</div>
                  <div id="modal-credits-applied" class="text-xs font-bold text-white mt-0.5">₹0</div>
                </div>
                <div class="p-2 rounded-lg bg-neutral-900 border border-rose-500/40">
                  <div class="text-[10px] text-rose-400 uppercase font-bold">Net Outstanding</div>
                  <div id="modal-net-outstanding" class="text-xs font-black text-rose-400 mt-0.5">₹0</div>
                </div>
              </div>
            </div>
          </div>

          <div class="pt-2 flex justify-between items-center">
            <span class="text-[11px] text-neutral-400">🔒 Strictly Read-Only commercial ledger record</span>
            <button id="btn-modal-close" class="px-4 py-2 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all">Close</button>
          </div>
        </div>
      </div>

    </div>
  `;
}

export async function initVendorReceivables() {
  const container = document.getElementById("vendor-receivables-container");
  if (!container) return;

  bindEventListeners();
  await loadReceivablesData();
}

function bindEventListeners() {
  // Refresh button
  const btnRefresh = document.getElementById("btn-refresh-receivables");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      currentPage = 1;
      loadReceivablesData();
    });
  }

  // Café scope selector
  const selectCafe = document.getElementById("select-cafe-scope");
  if (selectCafe) {
    selectCafe.addEventListener("change", (e) => {
      currentSelectedCafe = e.target.value;
      currentPage = 1;
      loadReceivablesData();
    });
  }

  // Payment status selector
  const selectStatus = document.getElementById("select-payment-status");
  if (selectStatus) {
    selectStatus.addEventListener("change", (e) => {
      currentSelectedPaymentStatus = e.target.value;
      currentPage = 1;
      loadReceivablesData();
    });
  }

  // Sort By selector
  const selectSort = document.getElementById("select-sort-by");
  if (selectSort) {
    selectSort.addEventListener("change", (e) => {
      currentSortBy = e.target.value;
      currentPage = 1;
      loadReceivablesData();
    });
  }

  // Bucket filter buttons
  const bucketButtons = document.querySelectorAll(".btn-bucket-filter");
  bucketButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentSelectedBucket = btn.dataset.bucket;
      bucketButtons.forEach((b) => b.classList.remove("bg-primary-900", "text-white", "border-primary-500"));
      btn.classList.add("bg-primary-900", "text-white", "border-primary-500");
      currentPage = 1;
      loadReceivablesData();
    });
  });

  // Filter held items quick button
  const btnFilterHeld = document.getElementById("btn-filter-held");
  if (btnFilterHeld) {
    btnFilterHeld.addEventListener("click", () => {
      currentSelectedBucket = "HELD";
      currentPage = 1;
      loadReceivablesData();
    });
  }

  // Search input with debounce
  const inputSearch = document.getElementById("input-search");
  if (inputSearch) {
    let debounceTimer = null;
    inputSearch.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearchTerm = e.target.value.trim();
        currentPage = 1;
        loadReceivablesData();
      }, 350);
    });
  }

  // Reset Filters
  const btnReset = document.getElementById("btn-reset-filters");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      currentSelectedCafe = "ALL";
      currentSelectedBucket = "ALL";
      currentSelectedPaymentStatus = "ALL";
      currentSearchTerm = "";
      currentSortBy = "days_desc";
      if (inputSearch) inputSearch.value = "";
      if (selectStatus) selectStatus.value = "ALL";
      if (selectSort) selectSort.value = "days_desc";
      if (selectCafe) selectCafe.value = "ALL";
      bucketButtons.forEach((b) => b.classList.remove("bg-primary-900", "text-white", "border-primary-500"));
      currentPage = 1;
      loadReceivablesData();
    });
  }

  // Export Excel
  const btnXlsx = document.getElementById("btn-export-xlsx");
  if (btnXlsx) {
    btnXlsx.addEventListener("click", () => exportReceivablesExcel());
  }

  // Download PDF
  const btnPdf = document.getElementById("btn-download-pdf");
  if (btnPdf) {
    btnPdf.addEventListener("click", () => downloadReceivablesPdf());
  }

  // Print
  const btnPrint = document.getElementById("btn-print-receivables");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => window.print());
  }

  // Pagination buttons
  const btnPrev = document.getElementById("btn-prev-page");
  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadReceivablesData();
      }
    });
  }

  const btnNext = document.getElementById("btn-next-page");
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      const maxPages = currentReceivablesData?.pagination?.totalPages || 1;
      if (currentPage < maxPages) {
        currentPage++;
        loadReceivablesData();
      }
    });
  }

  // Modal close buttons
  const modal = document.getElementById("modal-receivable-detail");
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

async function loadReceivablesData() {
  try {
    const params = new URLSearchParams();
    if (currentSelectedCafe && currentSelectedCafe !== "ALL") params.append("cafeId", currentSelectedCafe);
    if (currentSelectedBucket && currentSelectedBucket !== "ALL") params.append("bucket", currentSelectedBucket);
    if (currentSelectedPaymentStatus && currentSelectedPaymentStatus !== "ALL") params.append("paymentStatus", currentSelectedPaymentStatus);
    if (currentSearchTerm) params.append("search", currentSearchTerm);
    if (currentSortBy) params.append("sortBy", currentSortBy);
    params.append("page", currentPage);
    params.append("limit", currentLimit);

    const res = await api.get(`/api/v1/vendor/receivables?${params.toString()}`);
    if (res && res.success && res.data) {
      currentReceivablesData = res.data;
      updateReceivablesUI(res.data);
    }
  } catch (err) {
    console.error("Failed to load vendor receivables:", err);
  }
}

function updateReceivablesUI(data) {
  // Update Vendor Badges
  const vendor = data.vendor || {};
  const companyNameEl = document.getElementById("vendor-company-name");
  const vendorIdBadge = document.getElementById("vendor-id-badge");
  const gstBadge = document.getElementById("vendor-gst-badge");
  const asOfBadge = document.getElementById("badge-as-of-date");

  if (companyNameEl) companyNameEl.innerHTML = `<span>Outstanding Receivables & Ageing</span> <span class="text-xs text-neutral-400 font-normal">(${vendor.name || "Vendor"})</span>`;
  if (vendorIdBadge) vendorIdBadge.textContent = vendor.vendorId || "—";
  if (gstBadge) gstBadge.textContent = `GST: ${vendor.gstNumber || "Unregistered"}`;
  if (asOfBadge) asOfBadge.textContent = `As of: ${formatDate(data.asOfDate)}`;

  // Update 6 Ageing KPI Cards
  const summary = data.summary || {};
  const kpiTotal = document.getElementById("kpi-total-outstanding");
  const kpiOpenCount = document.getElementById("kpi-open-count");
  const kpiCurrent = document.getElementById("kpi-current-bucket");
  const kpi1_30 = document.getElementById("kpi-bucket-1-30");
  const kpi31_60 = document.getElementById("kpi-bucket-31-60");
  const kpi61_90 = document.getElementById("kpi-bucket-61-90");
  const kpi90Plus = document.getElementById("kpi-bucket-90-plus");
  const heldDisputedEl = document.getElementById("held-disputed-amount");

  if (kpiTotal) kpiTotal.textContent = summary.totalOutstandingFormatted || formatCurrency(summary.totalOutstandingPaisa || 0);
  if (kpiOpenCount) kpiOpenCount.textContent = String(summary.openInvoicesCount || 0);
  if (kpiCurrent) kpiCurrent.textContent = summary.currentBucketFormatted || formatCurrency(summary.currentBucketPaisa || 0);
  if (kpi1_30) kpi1_30.textContent = summary.bucket1_30Formatted || formatCurrency(summary.bucket1_30Paisa || 0);
  if (kpi31_60) kpi31_60.textContent = summary.bucket31_60Formatted || formatCurrency(summary.bucket31_60Paisa || 0);
  if (kpi61_90) kpi61_90.textContent = summary.bucket61_90Formatted || formatCurrency(summary.bucket61_90Paisa || 0);
  if (kpi90Plus) kpi90Plus.textContent = summary.bucket90PlusFormatted || formatCurrency(summary.bucket90PlusPaisa || 0);
  if (heldDisputedEl) heldDisputedEl.textContent = summary.totalHeldDisputedFormatted || formatCurrency(summary.totalHeldDisputedPaisa || 0);

  // Summary status description
  const summaryLabel = document.getElementById("label-overdue-summary");
  if (summaryLabel) {
    summaryLabel.textContent = `Total Outstanding: ${summary.totalOutstandingFormatted} • Overdue: ${summary.totalOverdueFormatted} (${summary.overdueInvoicesCount || 0} bills)`;
  }

  // Update Invoices Register
  const receivables = data.receivables || [];
  const badgeCount = document.getElementById("badge-invoice-count");
  if (badgeCount) badgeCount.textContent = `${receivables.length} of ${data.pagination?.totalCount || receivables.length} invoices`;

  renderReceivablesTable(receivables);
  renderReceivablesMobileCards(receivables);

  // Toggle Empty State
  const emptyState = document.getElementById("receivables-empty-state");
  if (emptyState) {
    emptyState.classList.toggle("hidden", receivables.length > 0);
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
    paginationInfo.textContent = `Showing ${start} - ${end} of ${total} invoices`;
  }
  if (pageNumEl) pageNumEl.textContent = String(currentPage);
  if (btnPrev) btnPrev.disabled = currentPage <= 1;
  if (btnNext) btnNext.disabled = currentPage >= (pagination.totalPages || 1);
}

function renderReceivablesTable(receivables) {
  const tbody = document.getElementById("receivables-table-body");
  if (!tbody) return;

  if (receivables.length === 0) {
    tbody.innerHTML = "";
    return;
  }

  tbody.innerHTML = receivables
    .map((r) => {
      const daysBadge = getAgeingBadge(r);

      return `
        <tr class="hover:bg-neutral-800/40 transition-colors">
          <td class="py-3 px-4 font-mono font-semibold text-white whitespace-nowrap">${r.supplierInvoiceNumber}</td>
          <td class="py-3 px-4 text-neutral-300 whitespace-nowrap">${r.cafeName || r.cafeId}</td>
          <td class="py-3 px-4 text-neutral-300 font-mono whitespace-nowrap">${r.invoiceDate || "—"}</td>
          <td class="py-3 px-4 text-neutral-300 font-mono whitespace-nowrap">${r.dueDate || "Due date not available"}</td>
          <td class="py-3 px-4 text-right font-mono text-emerald-400 whitespace-nowrap">${r.approvedPayableFormatted}</td>
          <td class="py-3 px-4 text-right font-mono text-neutral-300 whitespace-nowrap">${r.paidFormatted}</td>
          <td class="py-3 px-4 text-right font-mono text-neutral-400 whitespace-nowrap">${r.appliedCreditsFormatted}</td>
          <td class="py-3 px-4 text-right font-mono font-bold text-rose-400 whitespace-nowrap">${r.outstandingPayableFormatted}</td>
          <td class="py-3 px-4 text-center whitespace-nowrap">${daysBadge}</td>
          <td class="py-3 px-4 text-center">
            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getPaymentStatusClass(r.paymentStatus)}">
              ${r.paymentStatus}
            </span>
          </td>
          <td class="py-3 px-4 text-center">
            <button class="btn-view-receivable px-2.5 py-1 text-[11px] rounded bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition-all" data-invoice-id="${r.invoiceId}">
              View
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".btn-view-receivable").forEach((btn) => {
    btn.addEventListener("click", () => {
      const invId = btn.dataset.invoiceId;
      const matched = receivables.find((x) => x.invoiceId === invId);
      if (matched) showReceivableDetailModal(matched);
    });
  });
}

function renderReceivablesMobileCards(receivables) {
  const container = document.getElementById("receivables-mobile-cards");
  if (!container) return;

  if (receivables.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = receivables
    .map((r) => {
      return `
        <div class="p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono font-bold text-white">${r.supplierInvoiceNumber}</span>
            ${getAgeingBadge(r)}
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs text-neutral-300">
            <div><span class="text-neutral-500">Café:</span> <span class="text-white">${r.cafeName || r.cafeId}</span></div>
            <div><span class="text-neutral-500">Due Date:</span> <span class="font-mono text-white">${r.dueDate || "Not available"}</span></div>
            <div><span class="text-neutral-500">Approved:</span> <span class="font-mono text-emerald-400">${r.approvedPayableFormatted}</span></div>
            <div><span class="text-neutral-500">Outstanding:</span> <span class="font-mono font-bold text-rose-400">${r.outstandingPayableFormatted}</span></div>
          </div>

          <div class="flex items-center justify-between pt-1 border-t border-neutral-800/80">
            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getPaymentStatusClass(r.paymentStatus)}">
              ${r.paymentStatus}
            </span>
            <button class="btn-view-receivable-mobile px-3 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-white font-medium" data-invoice-id="${r.invoiceId}">
              Details
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".btn-view-receivable-mobile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const invId = btn.dataset.invoiceId;
      const matched = receivables.find((x) => x.invoiceId === invId);
      if (matched) showReceivableDetailModal(matched);
    });
  });
}

function getAgeingBadge(r) {
  if (r.ageingBucket === "CURRENT") {
    return `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">Current</span>`;
  }
  if (r.ageingBucket === "1_30") {
    return `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950/60 text-amber-300 border border-amber-800/40">${r.daysOverdue}d Overdue</span>`;
  }
  if (r.ageingBucket === "31_60") {
    return `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-950/60 text-orange-300 border border-orange-800/40">${r.daysOverdue}d Overdue</span>`;
  }
  if (r.ageingBucket === "61_90") {
    return `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-950/60 text-rose-300 border border-rose-800/40">${r.daysOverdue}d Overdue</span>`;
  }
  if (r.ageingBucket === "90_PLUS") {
    return `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-950/60 text-red-300 border border-red-800/40">${r.daysOverdue}d Overdue</span>`;
  }
  return `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">Due date not available</span>`;
}

function getPaymentStatusClass(status) {
  switch (status) {
    case "DUE":
      return "bg-rose-950/60 text-rose-300 border border-rose-800/40";
    case "PARTIALLY_PAID":
      return "bg-blue-950/60 text-blue-300 border border-blue-800/40";
    case "ON_HOLD":
      return "bg-amber-950/60 text-amber-300 border border-amber-800/40";
    case "PAID":
      return "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40";
    default:
      return "bg-neutral-800 text-neutral-300 border border-neutral-700";
  }
}

function showReceivableDetailModal(r) {
  const modal = document.getElementById("modal-receivable-detail");
  if (!modal) return;

  document.getElementById("modal-invoice-number").textContent = r.supplierInvoiceNumber || r.invoiceId;
  document.getElementById("modal-inv-date").textContent = r.invoiceDate || "—";
  document.getElementById("modal-due-date").textContent = r.dueDate || "Due date not available";
  document.getElementById("modal-cafe-name").textContent = r.cafeName || r.cafeId || "—";
  document.getElementById("modal-ageing-bracket").textContent = r.ageingBucketLabel || "—";

  document.getElementById("modal-po-reference").textContent = r.poReferenceId || "DIRECT_BILLING";
  document.getElementById("modal-grn-reference").textContent = r.grnReceiptNumber || "—";
  document.getElementById("modal-internal-id").textContent = r.invoiceId || "—";
  document.getElementById("modal-inv-status").textContent = r.invoiceStatus || "APPROVED";

  document.getElementById("modal-claimed-amount").textContent = r.supplierClaimedFormatted || "₹0";
  document.getElementById("modal-approved-amount").textContent = r.approvedPayableFormatted || "₹0";
  document.getElementById("modal-held-amount").textContent = r.heldDisputedFormatted || "₹0";

  document.getElementById("modal-paid-amount").textContent = r.paidFormatted || "₹0";
  document.getElementById("modal-credits-applied").textContent = r.appliedCreditsFormatted || "₹0";
  document.getElementById("modal-net-outstanding").textContent = r.outstandingPayableFormatted || "₹0";

  modal.classList.remove("hidden");
}

async function exportReceivablesExcel() {
  try {
    const params = new URLSearchParams();
    if (currentSelectedCafe && currentSelectedCafe !== "ALL") params.append("cafeId", currentSelectedCafe);
    if (currentSelectedBucket && currentSelectedBucket !== "ALL") params.append("bucket", currentSelectedBucket);
    if (currentSelectedPaymentStatus && currentSelectedPaymentStatus !== "ALL") params.append("paymentStatus", currentSelectedPaymentStatus);
    if (currentSearchTerm) params.append("search", currentSearchTerm);

    const blob = await downloadBlob(`/api/v1/vendor/receivables/csv?${params.toString()}`);
    const text = await blob.text();
    const xlsxBlob = new Blob([text], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;" });
    const url = window.URL.createObjectURL(xlsxBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VendorReceivables.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to export receivables Excel:", err);
  }
}

async function downloadReceivablesPdf() {
  try {
    const params = new URLSearchParams();
    if (currentSelectedCafe && currentSelectedCafe !== "ALL") params.append("cafeId", currentSelectedCafe);

    await downloadBlob(`/api/v1/vendor/receivables/pdf?${params.toString()}`, `VendorReceivables.pdf`);
  } catch (err) {
    console.error("Failed to download receivables PDF:", err);
  }
}

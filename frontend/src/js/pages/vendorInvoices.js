// =============================================================================
// ZAMORIN CAFE ERP — VEN-SCR-004: VENDOR INVOICES & SETTLEMENTS
//
// Authoritative, strictly read-only visibility into Accounts Payable invoices:
// - Three-Value Architecture: Supplier Claimed, Approved Payable, Held / Disputed
// - Authoritative tax breakdowns (CGST / SGST / IGST) and payment settlement status
// - Links to referenced Purchase Orders (VEN-SCR-002) and GRNs (VEN-SCR-003)
// - Zero vendor mutation capability (no invoice creation, editing, or status changes)
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentInvoicesData = null;
let currentSelectedCafe = "ALL";
let currentSelectedDateRange = "30days";
let currentSelectedPaymentStatus = "ALL";
let currentSelectedApprovalStatus = "ALL";
let currentSearchTerm = "";
let currentSort = "date_desc";
let currentPage = 1;
let currentLimit = 20;

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

export function renderVendorInvoices() {
  return `
    <div id="vendor-invoices-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-950/40 via-sky-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-lg border border-sky-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-300">READ-ONLY ACCOUNTS PAYABLE INVOICES</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-sky-500/20 text-sky-200 border border-sky-500/40">VEN-SCR-004</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Authoritative visibility into vendor bills, approved payable amounts, held variances, and settlement balances. Zero write permissions.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-refresh-invoices" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
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
            <span>Invoices & Settlements</span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span id="vendor-id-badge" class="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 font-semibold">—</span>
            <span id="vendor-category-badge" class="px-2.5 py-1 rounded-md bg-primary-950/60 text-primary-300 border border-primary-800/50 uppercase font-semibold text-[11px]">—</span>
            <span id="vendor-gst-badge" class="hidden sm:inline-flex px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono text-[11px]">—</span>
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

      <!-- 10 AUTHORITATIVE INVOICE KPI SUMMARY CARDS -->
      <section class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4" id="invoices-kpi-grid">
        
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-primary-500 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="ALL" title="Click to view all invoices">
          <div class="flex items-center justify-between text-neutral-400 text-xs font-semibold">
            <span>Total Invoices</span>
            <span class="text-neutral-500 group-hover:text-primary-400">📄</span>
          </div>
          <div id="kpi-total-invoices" class="text-xl sm:text-2xl font-black text-white mt-1.5 tracking-tight">—</div>
          <div id="kpi-total-invoice-val" class="text-[10px] text-neutral-500 mt-0.5 font-mono">₹0 Claimed</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-emerald-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="APPROVED" title="Click to view approved payable amounts">
          <div class="flex items-center justify-between text-emerald-400 text-xs font-semibold">
            <span>Approved Payable</span>
            <span class="text-emerald-500">✅</span>
          </div>
          <div id="kpi-approved-payable" class="text-xl sm:text-2xl font-black text-emerald-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Verified liability</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-amber-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="ON_HOLD" title="Click to view held or disputed amounts">
          <div class="flex items-center justify-between text-amber-400 text-xs font-semibold">
            <span>Held / Disputed</span>
            <span class="text-amber-500">⚖️</span>
          </div>
          <div id="kpi-held-disputed" class="text-xl sm:text-2xl font-black text-amber-300 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Variances on hold</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-sky-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="OUTSTANDING" title="Click to view current outstanding balance">
          <div class="flex items-center justify-between text-sky-400 text-xs font-semibold">
            <span>Outstanding</span>
            <span class="text-sky-500">⏳</span>
          </div>
          <div id="kpi-outstanding" class="text-xl sm:text-2xl font-black text-sky-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Remaining receivable</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-rose-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="OVERDUE" title="Click to filter overdue invoices">
          <div class="flex items-center justify-between text-rose-400 text-xs font-semibold">
            <span>Overdue Amount</span>
            <span class="text-rose-500">⚠️</span>
          </div>
          <div id="kpi-overdue" class="text-xl sm:text-2xl font-black text-rose-300 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Past credit term</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-emerald-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="PAID" title="Click to view settled invoices">
          <div class="flex items-center justify-between text-emerald-400 text-xs font-semibold">
            <span>Total Settled / Paid</span>
            <span class="text-emerald-500">💳</span>
          </div>
          <div id="kpi-total-paid" class="text-xl sm:text-2xl font-black text-emerald-300 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Payments cleared</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-blue-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="DUE" title="Click to view open due invoices">
          <div class="flex items-center justify-between text-blue-400 text-xs font-semibold">
            <span>Due / Open</span>
            <span class="text-blue-500">📅</span>
          </div>
          <div id="kpi-due-count" class="text-xl sm:text-2xl font-black text-blue-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Within payment terms</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-orange-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="PARTIALLY_PAID" title="Click to view partially paid invoices">
          <div class="flex items-center justify-between text-orange-400 text-xs font-semibold">
            <span>Partially Paid</span>
            <span class="text-orange-500">🌗</span>
          </div>
          <div id="kpi-partial-count" class="text-xl sm:text-2xl font-black text-orange-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Part balance remains</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-rose-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="OVERDUE_COUNT" title="Click to view overdue invoice count">
          <div class="flex items-center justify-between text-rose-400 text-xs font-semibold">
            <span>Overdue Count</span>
            <span class="text-rose-500">🚨</span>
          </div>
          <div id="kpi-overdue-count" class="text-xl sm:text-2xl font-black text-rose-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Invoices overdue</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-amber-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="ON_HOLD_COUNT" title="Click to view invoices with payment holds">
          <div class="flex items-center justify-between text-amber-400 text-xs font-semibold">
            <span>On Hold Count</span>
            <span class="text-amber-500">⏸️</span>
          </div>
          <div id="kpi-onhold-count" class="text-xl sm:text-2xl font-black text-amber-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Verification pending</div>
        </div>

      </section>

      <!-- SEARCH, DATE PERIODS & MULTIDIMENSIONAL FILTERS -->
      <section class="filters-panel bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl space-y-4">
        
        <!-- Search and Quick Action Toolbar -->
        <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div class="relative flex-1">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">🔍</span>
            <input
              type="text"
              id="input-invoice-search"
              placeholder="Universal Search by Invoice #, PO #, GRN #, Café..."
              class="w-full pl-9 pr-4 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 transition-all shadow-inner"
            />
          </div>

          <!-- Date Quick Filter Pills -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs" id="invoice-date-pills">
            <button class="px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 font-semibold hover:border-neutral-500 transition-all active:scale-95" data-range="today">Today</button>
            <button class="px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 font-semibold hover:border-neutral-500 transition-all active:scale-95" data-range="7days">7 Days</button>
            <button class="px-2.5 py-1.5 rounded-lg border border-primary-500/80 bg-primary-950/60 text-primary-200 font-bold shadow-inner" data-range="30days">30 Days</button>
            <button class="px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 font-semibold hover:border-neutral-500 transition-all active:scale-95" data-range="thisMonth">This Month</button>
            <button class="px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 font-semibold hover:border-neutral-500 transition-all active:scale-95" data-range="financialYear">FY 2026-27</button>
            <button class="px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 font-semibold hover:border-neutral-500 transition-all active:scale-95" data-range="custom">Custom</button>
          </div>
        </div>

        <!-- Custom Date Range Sub-Bar (Hidden by Default) -->
        <div id="invoice-custom-dates-bar" class="hidden flex-wrap items-center gap-3 p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl">
          <div class="flex items-center gap-2">
            <label class="text-xs text-neutral-400">From:</label>
            <input type="date" id="input-date-start" class="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500" />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-neutral-400">To:</label>
            <input type="date" id="input-date-end" class="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500" />
          </div>
          <button id="btn-apply-custom-dates" class="px-3 py-1.5 text-xs font-bold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-all shadow">Apply</button>
        </div>

        <!-- Multidimensional Status Dropdowns -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          
          <div>
            <label for="filter-payment-status" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Payment Status</label>
            <select id="filter-payment-status" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Payment Statuses</option>
              <option value="DUE">Due / Open</option>
              <option value="OVERDUE">Overdue</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PAID">Paid / Settled</option>
              <option value="ON_HOLD">On Hold / Disputed</option>
            </select>
          </div>

          <div>
            <label for="filter-approval-status" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Invoice Approval</label>
            <select id="filter-approval-status" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Approvals</option>
              <option value="APPROVED">Approved for AP</option>
              <option value="PENDING">Pending 3-Way Match</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <div>
            <label for="filter-sort" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Sort Invoices</label>
            <select id="filter-sort" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="date_desc">Invoice Date (Newest First)</option>
              <option value="date_asc">Invoice Date (Oldest First)</option>
              <option value="amount_desc">Amount (Highest First)</option>
              <option value="amount_asc">Amount (Lowest First)</option>
              <option value="due_asc">Due Date (Earliest First)</option>
              <option value="due_desc">Due Date (Latest First)</option>
            </select>
          </div>

          <div class="flex items-end">
            <button id="btn-clear-filters" class="w-full py-2 px-3 text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-800/80 hover:bg-neutral-800 rounded-lg border border-neutral-700 transition-all flex items-center justify-center gap-1.5">
              <span>🧹</span> Clear All Filters
            </button>
          </div>

        </div>

      </section>

      <!-- INVOICES REGISTER (TABLE ON DESKTOP / CARDS ON MOBILE) -->
      <section class="invoices-register bg-neutral-900/80 border border-neutral-800 rounded-2xl backdrop-blur-md shadow-xl overflow-hidden">
        
        <div class="p-4 sm:p-5 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              <span>Accounts Payable Invoices Register</span>
              <span id="badge-invoice-count" class="px-2 py-0.5 rounded-full text-xs font-extrabold bg-primary-950 text-primary-300 border border-primary-800">0</span>
            </h2>
            <p class="text-xs text-neutral-400 mt-0.5">Authoritative invoice register with Three-Value reconciliation. Showing approved payable and held variances.</p>
          </div>
        </div>

        <!-- Desktop Table View -->
        <div class="overflow-x-auto hidden md:block">
          <table class="w-full text-left text-xs">
            <thead class="bg-neutral-950/70 border-b border-neutral-800 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              <tr>
                <th class="py-3 px-4">Invoice #</th>
                <th class="py-3 px-4">Invoice Date</th>
                <th class="py-3 px-4">Due Date</th>
                <th class="py-3 px-4">Café Destination</th>
                <th class="py-3 px-4">PO Reference</th>
                <th class="py-3 px-4 text-right">Claimed</th>
                <th class="py-3 px-4 text-right">Approved</th>
                <th class="py-3 px-4 text-right">Held / Disputed</th>
                <th class="py-3 px-4 text-right">Paid</th>
                <th class="py-3 px-4 text-right">Outstanding</th>
                <th class="py-3 px-4 text-center">Status</th>
                <th class="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody id="invoices-table-body" class="divide-y divide-neutral-800/60 font-medium">
              <tr>
                <td colspan="12" class="py-12 text-center text-neutral-400">
                  <div class="animate-pulse space-y-2">
                    <div class="text-base font-bold text-neutral-300">Loading invoices...</div>
                    <div class="text-xs text-neutral-500">Fetching authoritative Accounts Payable records</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Card View -->
        <div id="invoices-mobile-cards" class="md:hidden divide-y divide-neutral-800/80 p-3 space-y-3">
          <!-- Populated by wireVendorInvoices -->
        </div>

        <!-- Pagination Controls -->
        <div class="p-4 border-t border-neutral-800 flex items-center justify-between text-xs bg-neutral-950/50">
          <div class="text-neutral-400">
            Page <span id="span-current-page" class="font-bold text-white">1</span> of <span id="span-total-pages" class="font-bold text-white">1</span>
          </div>
          <div class="flex items-center gap-2">
            <button id="btn-prev-page" class="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all">Previous</button>
            <button id="btn-next-page" class="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all">Next</button>
          </div>
        </div>

      </section>

      <!-- READ-ONLY INVOICE DETAIL MODAL -->
      <div id="modal-invoice-detail" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md hidden flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <div class="modal-dialog bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
          
          <!-- Modal Header -->
          <div class="p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950/80 flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-primary-400 uppercase tracking-wider">AP INVOICE DETAILS</span>
                <span id="modal-status-badge" class="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-neutral-800 text-neutral-300 border border-neutral-700">STATUS</span>
              </div>
              <h3 id="modal-invoice-title" class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight flex items-center gap-2">
                <span>INV-0000</span>
              </h3>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-download-invoice-pdf" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
                <span>📥</span> PDF Summary
              </button>
              <button id="btn-close-modal" class="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center font-bold text-base transition-all">✕</button>
            </div>
          </div>

          <!-- Modal Body (Scrollable) -->
          <div class="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs text-neutral-300">
            
            <!-- Three-Value Financial Architecture Highlight Banner -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-sky-500/30 bg-sky-950/20">
              <div class="p-3 bg-neutral-950/80 border border-neutral-800 rounded-lg">
                <div class="text-[11px] font-bold text-neutral-400 uppercase">1. Supplier Claimed</div>
                <div id="modal-val-claimed" class="text-lg font-black text-white mt-1">₹0</div>
                <div class="text-[10px] text-neutral-500 mt-0.5">Amount billed by supplier</div>
              </div>
              <div class="p-3 bg-neutral-950/80 border border-emerald-800/60 rounded-lg">
                <div class="text-[11px] font-bold text-emerald-400 uppercase">2. Approved Payable</div>
                <div id="modal-val-approved" class="text-lg font-black text-emerald-300 mt-1">₹0</div>
                <div class="text-[10px] text-neutral-500 mt-0.5">Verified payable amount</div>
              </div>
              <div class="p-3 bg-neutral-950/80 border border-amber-800/60 rounded-lg">
                <div class="text-[11px] font-bold text-amber-400 uppercase">3. Held / Disputed</div>
                <div id="modal-val-held" class="text-lg font-black text-amber-300 mt-1">₹0</div>
                <div class="text-[10px] text-neutral-500 mt-0.5">Shortage/rejection hold</div>
              </div>
            </div>

            <!-- Identity, Dates, Vendor & Cafe Snapshots -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div class="p-4 bg-neutral-950/60 border border-neutral-800 rounded-xl space-y-2">
                <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Invoice & Terms</div>
                <div class="flex justify-between py-1 border-b border-neutral-800/60"><span class="text-neutral-400">Supplier Invoice #:</span><span id="modal-supplier-inv" class="font-bold text-white font-mono">—</span></div>
                <div class="flex justify-between py-1 border-b border-neutral-800/60"><span class="text-neutral-400">Internal AP Reference:</span><span id="modal-internal-id" class="font-mono text-neutral-300">—</span></div>
                <div class="flex justify-between py-1 border-b border-neutral-800/60"><span class="text-neutral-400">Invoice Date:</span><span id="modal-inv-date" class="font-semibold text-white">—</span></div>
                <div class="flex justify-between py-1 border-b border-neutral-800/60"><span class="text-neutral-400">Due Date:</span><span id="modal-due-date" class="font-semibold text-white">—</span></div>
                <div class="flex justify-between py-1"><span class="text-neutral-400">Payment Overdue Status:</span><span id="modal-overdue-status" class="font-bold">—</span></div>
              </div>

              <div class="p-4 bg-neutral-950/60 border border-neutral-800 rounded-xl space-y-2">
                <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Billing & Destination Café</div>
                <div class="flex justify-between py-1 border-b border-neutral-800/60"><span class="text-neutral-400">Café Destination:</span><span id="modal-cafe-name" class="font-bold text-white">—</span></div>
                <div class="flex justify-between py-1 border-b border-neutral-800/60"><span class="text-neutral-400">Café Branch Code:</span><span id="modal-cafe-code" class="font-mono text-neutral-300">—</span></div>
                <div class="flex justify-between py-1 border-b border-neutral-800/60"><span class="text-neutral-400">Receiving Bay Address:</span><span id="modal-cafe-address" class="text-neutral-300 text-right max-w-[240px] truncate">—</span></div>
                <div class="flex justify-between py-1 border-b border-neutral-800/60"><span class="text-neutral-400">Referenced PO:</span><span id="modal-po-link" class="font-semibold text-primary-400">—</span></div>
                <div class="flex justify-between py-1"><span class="text-neutral-400">Linked GRNs:</span><span id="modal-grn-links" class="font-mono text-neutral-300">—</span></div>
              </div>

            </div>

            <!-- Tax & Settlement Reconciliation Summary -->
            <div class="p-4 bg-neutral-950/60 border border-neutral-800 rounded-xl space-y-3">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Settlement & Tax Accounting</div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div class="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                  <div class="text-[10px] text-neutral-400 uppercase font-semibold">Taxable Value</div>
                  <div id="modal-taxable-val" class="font-bold text-white text-sm mt-0.5">₹0</div>
                </div>
                <div class="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                  <div class="text-[10px] text-neutral-400 uppercase font-semibold">Total GST (CGST + SGST)</div>
                  <div id="modal-tax-val" class="font-bold text-white text-sm mt-0.5">₹0</div>
                </div>
                <div class="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                  <div class="text-[10px] text-emerald-400 uppercase font-semibold">Amount Paid / Settled</div>
                  <div id="modal-paid-val" class="font-bold text-emerald-300 text-sm mt-0.5">₹0</div>
                </div>
                <div class="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                  <div class="text-[10px] text-sky-400 uppercase font-semibold">Remaining Outstanding</div>
                  <div id="modal-outstanding-val" class="font-bold text-sky-300 text-sm mt-0.5">₹0</div>
                </div>
              </div>
            </div>

            <!-- Line Items Table -->
            <div class="space-y-2">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                <span>Invoice Line Items</span>
                <span id="modal-line-count" class="text-neutral-500 font-mono">0 Items</span>
              </div>
              <div class="border border-neutral-800 rounded-xl overflow-hidden">
                <table class="w-full text-left text-xs">
                  <thead class="bg-neutral-950/80 border-b border-neutral-800 text-[10px] font-bold text-neutral-400 uppercase">
                    <tr>
                      <th class="py-2.5 px-3">Item</th>
                      <th class="py-2.5 px-3 text-right">Inv Qty</th>
                      <th class="py-2.5 px-3 text-right">Acc Qty</th>
                      <th class="py-2.5 px-3 text-right">Rej Qty</th>
                      <th class="py-2.5 px-3 text-right">Unit Rate</th>
                      <th class="py-2.5 px-3 text-right">Claimed Total</th>
                      <th class="py-2.5 px-3 text-right">Approved Amount</th>
                    </tr>
                  </thead>
                  <tbody id="modal-line-items-body" class="divide-y divide-neutral-800/60 font-medium">
                    <!-- Populated dynamically -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Milestone Lifecycle Timeline -->
            <div class="space-y-2">
              <div class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Invoice Verification & Settlement Milestones</div>
              <div id="modal-timeline" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <!-- Populated dynamically -->
              </div>
            </div>

          </div>

          <!-- Modal Footer -->
          <div class="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs">
            <div class="text-neutral-400">
              🔒 Authoritative ERP Record • Strictly Read-Only
            </div>
            <button id="btn-modal-close-bottom" class="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-lg transition-all">Close</button>
          </div>

        </div>
      </div>

    </div>
  `;
}

export async function wireVendorInvoices(container) {
  if (!container) return;

  const tableBody = container.querySelector("#invoices-table-body");
  const mobileCardsContainer = container.querySelector("#invoices-mobile-cards");
  const cafeSelector = container.querySelector("#select-cafe-scope");
  const searchInput = container.querySelector("#input-invoice-search");
  const datePills = container.querySelectorAll("#invoice-date-pills button");
  const customDatesBar = container.querySelector("#invoice-custom-dates-bar");
  const customStartDate = container.querySelector("#input-date-start");
  const customEndDate = container.querySelector("#input-date-end");
  const applyCustomDatesBtn = container.querySelector("#btn-apply-custom-dates");
  const paymentStatusFilter = container.querySelector("#filter-payment-status");
  const approvalStatusFilter = container.querySelector("#filter-approval-status");
  const sortFilter = container.querySelector("#filter-sort");
  const clearFiltersBtn = container.querySelector("#btn-clear-filters");
  const refreshBtn = container.querySelector("#btn-refresh-invoices");
  const kpiCards = container.querySelectorAll(".kpi-card");
  const prevPageBtn = container.querySelector("#btn-prev-page");
  const nextPageBtn = container.querySelector("#btn-next-page");

  // Detail Modal Elements
  const modal = container.querySelector("#modal-invoice-detail");
  const closeModalBtn = container.querySelector("#btn-close-modal");
  const closeModalBottomBtn = container.querySelector("#btn-modal-close-bottom");
  const downloadPdfBtn = container.querySelector("#btn-download-invoice-pdf");
  let activeModalInvoiceId = null;

  // 1. Fetch Vendor Profile to populate Header and Café Selector
  try {
    const meRes = await api.get("/api/v1/vendor/me");
    if (meRes && meRes.success && meRes.data) {
      const v = meRes.data;
      container.querySelector("#vendor-company-name span").textContent = v.name || "Vendor Invoices";
      container.querySelector("#vendor-id-badge").textContent = v.vendorId || "—";
      container.querySelector("#vendor-category-badge").textContent = v.category || "SUPPLIER";
      if (v.gstNumber) {
        container.querySelector("#vendor-gst-badge").textContent = `GSTIN: ${v.gstNumber}`;
      }

      if (Array.isArray(v.approvedCafes) && v.approvedCafes.length > 0) {
        cafeSelector.innerHTML = '<option value="ALL">All Authorised Cafés</option>';
        v.approvedCafes.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.cafeId;
          opt.textContent = `${c.displayName || c.name} (${c.code || c.cafeId})`;
          cafeSelector.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.warn("[VendorInvoices] Could not load vendor me:", err);
  }

  // 2. Fetch and Render Invoices
  async function fetchInvoicesList() {
    try {
      tableBody.innerHTML = `
        <tr>
          <td colspan="12" class="py-12 text-center text-neutral-400">
            <div class="animate-pulse space-y-2">
              <div class="text-base font-bold text-neutral-300">Loading Accounts Payable invoices...</div>
              <div class="text-xs text-neutral-500">Querying authoritative ERP records</div>
            </div>
          </td>
        </tr>
      `;

      const params = new URLSearchParams();
      if (currentSelectedCafe && currentSelectedCafe !== "ALL") {
        params.set("cafeId", currentSelectedCafe);
      }
      params.set("dateRange", currentSelectedDateRange);
      if (currentSelectedDateRange === "custom") {
        if (customStartDate?.value) params.set("customStart", customStartDate.value);
        if (customEndDate?.value) params.set("customEnd", customEndDate.value);
      }
      if (currentSelectedPaymentStatus && currentSelectedPaymentStatus !== "ALL") {
        params.set("paymentStatus", currentSelectedPaymentStatus);
      }
      if (currentSelectedApprovalStatus && currentSelectedApprovalStatus !== "ALL") {
        params.set("approvalStatus", currentSelectedApprovalStatus);
      }
      if (currentSearchTerm) {
        params.set("search", currentSearchTerm);
      }
      if (currentSort) {
        params.set("sort", currentSort);
      }
      params.set("page", String(currentPage));
      params.set("limit", String(currentLimit));

      const res = await api.get(`/api/v1/vendor/invoices?${params.toString()}`);
      if (res && res.success && res.data) {
        currentInvoicesData = res.data;
        updateKpis(res.data.kpis);
        renderTableRows(res.data.invoices);
        renderMobileCards(res.data.invoices);
        updatePagination(res.data.pagination);
      } else {
        renderEmptyState("No invoice records match the current criteria.");
      }
    } catch (err) {
      console.error("[VendorInvoices] Fetch error:", err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="12" class="py-12 text-center">
            <div class="p-4 max-w-md mx-auto rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 space-y-2">
              <div class="font-bold text-sm">Failed to Load Invoices</div>
              <p class="text-xs text-neutral-300">${err.message || "An unexpected error occurred while fetching invoices."}</p>
              <button id="btn-retry-fetch" class="mt-2 px-3 py-1.5 text-xs font-bold bg-rose-800 hover:bg-rose-700 text-white rounded-lg">Retry</button>
            </div>
          </td>
        </tr>
      `;
      container.querySelector("#btn-retry-fetch")?.addEventListener("click", fetchInvoicesList);
    }
  }

  function updateKpis(kpis = {}) {
    container.querySelector("#kpi-total-invoices").textContent = String(kpis.totalInvoices ?? 0);
    container.querySelector("#kpi-total-invoice-val").textContent = `${kpis.totalInvoiceValueFormatted || "₹0"} Claimed`;
    container.querySelector("#kpi-approved-payable").textContent = kpis.approvedPayableFormatted || "₹0";
    container.querySelector("#kpi-held-disputed").textContent = kpis.heldDisputedFormatted || "₹0";
    container.querySelector("#kpi-outstanding").textContent = kpis.outstandingFormatted || "₹0";
    container.querySelector("#kpi-overdue").textContent = kpis.overdueFormatted || "₹0";
    container.querySelector("#kpi-total-paid").textContent = kpis.paidFormatted || "₹0";
    container.querySelector("#kpi-due-count").textContent = String(kpis.dueCount ?? 0);
    container.querySelector("#kpi-partial-count").textContent = String(kpis.partiallyPaidCount ?? 0);
    container.querySelector("#kpi-overdue-count").textContent = String(kpis.overdueCount ?? 0);
    container.querySelector("#kpi-onhold-count").textContent = String(kpis.onHoldCount ?? 0);
  }

  function getPaymentStatusBadge(status, isOverdue) {
    const s = String(status || "").toUpperCase();
    if (s === "PAID") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">Paid</span>`;
    }
    if (s === "PARTIALLY_PAID") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-orange-950/80 text-orange-300 border border-orange-800/80">Partially Paid</span>`;
    }
    if (s === "ON_HOLD" || s === "DISPUTED") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-950/80 text-amber-300 border border-amber-800/80">On Hold</span>`;
    }
    if (isOverdue || s === "OVERDUE") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-950/80 text-rose-300 border border-rose-800/80">Overdue</span>`;
    }
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-950/80 text-blue-300 border border-blue-800/80">Due</span>`;
  }

  function renderTableRows(invoices = []) {
    container.querySelector("#badge-invoice-count").textContent = String(invoices.length);
    if (invoices.length === 0) {
      renderEmptyState("No invoices found matching your filters.");
      return;
    }

    tableBody.innerHTML = invoices
      .map((inv) => {
        const statusBadge = getPaymentStatusBadge(inv.paymentStatus, inv.isOverdue);
        const poLink = inv.poReferenceId
          ? `<a href="#vendor-orders?po=${encodeURIComponent(inv.poReferenceId)}" class="text-primary-400 hover:underline font-mono font-bold">${inv.poReferenceId}</a>`
          : `<span class="text-neutral-500 italic">Direct</span>`;

        return `
          <tr class="hover:bg-neutral-850/60 transition-colors border-b border-neutral-800/50">
            <td class="py-3 px-4 font-mono font-bold text-white">${inv.supplierInvoiceNumber || inv.invoiceId}</td>
            <td class="py-3 px-4 text-neutral-300">${formatDate(inv.invoiceDate)}</td>
            <td class="py-3 px-4 ${inv.isOverdue ? "text-rose-400 font-bold" : "text-neutral-300"}">
              ${formatDate(inv.dueDate)}
              ${inv.isOverdue ? `<span class="block text-[10px] text-rose-400 font-extrabold">${inv.daysOverdue}d overdue</span>` : ""}
            </td>
            <td class="py-3 px-4">
              <div class="font-bold text-white">${inv.cafeName}</div>
              <div class="text-[10px] text-neutral-400 font-mono">${inv.cafeCode || inv.cafeId}</div>
            </td>
            <td class="py-3 px-4">${poLink}</td>
            <td class="py-3 px-4 text-right font-mono text-neutral-200">${inv.supplierClaimedFormatted}</td>
            <td class="py-3 px-4 text-right font-mono font-bold text-emerald-400">${inv.approvedPayableFormatted}</td>
            <td class="py-3 px-4 text-right font-mono ${inv.heldDisputedAmountPaisa > 0 ? "text-amber-400 font-bold" : "text-neutral-500"}">${inv.heldDisputedFormatted}</td>
            <td class="py-3 px-4 text-right font-mono text-neutral-300">${inv.paidFormatted}</td>
            <td class="py-3 px-4 text-right font-mono font-black ${inv.outstandingPaisa > 0 ? "text-sky-300" : "text-neutral-500"}">${inv.outstandingFormatted}</td>
            <td class="py-3 px-4 text-center">${statusBadge}</td>
            <td class="py-3 px-4 text-center">
              <button class="btn-view-invoice px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs border border-neutral-700 transition-all active:scale-95 shadow" data-invoice-id="${inv.invoiceId}">
                View Details
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    tableBody.querySelectorAll(".btn-view-invoice").forEach((btn) => {
      btn.addEventListener("click", () => openInvoiceDetailModal(btn.dataset.invoiceId));
    });
  }

  function renderMobileCards(invoices = []) {
    if (invoices.length === 0) {
      mobileCardsContainer.innerHTML = `
        <div class="py-8 text-center text-neutral-400">
          <div class="text-sm font-bold text-neutral-300">No invoices recorded</div>
          <p class="text-xs text-neutral-500 mt-1">No invoices match the selected parameters.</p>
        </div>
      `;
      return;
    }

    mobileCardsContainer.innerHTML = invoices
      .map((inv) => {
        const statusBadge = getPaymentStatusBadge(inv.paymentStatus, inv.isOverdue);
        return `
          <div class="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3 shadow-md">
            <div class="flex items-start justify-between">
              <div>
                <div class="font-mono font-black text-white text-sm">${inv.supplierInvoiceNumber || inv.invoiceId}</div>
                <div class="text-[11px] text-neutral-400 mt-0.5">${inv.cafeName} (${inv.cafeCode || inv.cafeId})</div>
              </div>
              <div>${statusBadge}</div>
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs py-2 border-y border-neutral-850">
              <div><span class="text-neutral-500 block text-[10px]">Invoice Date:</span> <span class="font-semibold text-white">${formatDate(inv.invoiceDate)}</span></div>
              <div><span class="text-neutral-500 block text-[10px]">Due Date:</span> <span class="font-semibold ${inv.isOverdue ? "text-rose-400" : "text-white"}">${formatDate(inv.dueDate)}</span></div>
              <div><span class="text-neutral-500 block text-[10px]">Claimed:</span> <span class="font-mono text-neutral-300">${inv.supplierClaimedFormatted}</span></div>
              <div><span class="text-neutral-500 block text-[10px]">Approved Payable:</span> <span class="font-mono font-bold text-emerald-400">${inv.approvedPayableFormatted}</span></div>
              <div><span class="text-neutral-500 block text-[10px]">Held / Disputed:</span> <span class="font-mono ${inv.heldDisputedAmountPaisa > 0 ? "text-amber-400 font-bold" : "text-neutral-500"}">${inv.heldDisputedFormatted}</span></div>
              <div><span class="text-neutral-500 block text-[10px]">Outstanding:</span> <span class="font-mono font-black text-sky-300">${inv.outstandingFormatted}</span></div>
            </div>

            <button class="btn-view-invoice-mobile w-full py-2 bg-neutral-850 hover:bg-neutral-800 text-white font-bold rounded-lg border border-neutral-700 transition-all text-xs" data-invoice-id="${inv.invoiceId}">
              View Invoice Details
            </button>
          </div>
        `;
      })
      .join("");

    mobileCardsContainer.querySelectorAll(".btn-view-invoice-mobile").forEach((btn) => {
      btn.addEventListener("click", () => openInvoiceDetailModal(btn.dataset.invoiceId));
    });
  }

  function renderEmptyState(msg) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="12" class="py-12 text-center text-neutral-400">
          <div class="text-base font-bold text-neutral-300">${msg}</div>
          <p class="text-xs text-neutral-500 mt-1">Try adjusting the filter date, café scope, or search parameters.</p>
        </td>
      </tr>
    `;
    mobileCardsContainer.innerHTML = `
      <div class="py-8 text-center text-neutral-400">
        <div class="text-sm font-bold text-neutral-300">${msg}</div>
      </div>
    `;
  }

  function updatePagination(pagination = {}) {
    currentPage = pagination.page || 1;
    const totalPages = pagination.totalPages || 1;
    container.querySelector("#span-current-page").textContent = String(currentPage);
    container.querySelector("#span-total-pages").textContent = String(totalPages);
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
  }

  // 3. Open Detail Modal
  async function openInvoiceDetailModal(invoiceId) {
    if (!invoiceId) return;
    activeModalInvoiceId = invoiceId;
    modal.classList.remove("hidden");

    try {
      const res = await api.get(`/api/v1/vendor/invoices/${encodeURIComponent(invoiceId)}`);
      if (!res || !res.success || !res.data) {
        throw new Error(res?.error?.message || "Failed to load invoice details.");
      }

      const inv = res.data;
      const fin = inv.financials || {};

      container.querySelector("#modal-invoice-title span").textContent = inv.supplierInvoiceNumber || inv.invoiceId;
      container.querySelector("#modal-status-badge").innerHTML = getPaymentStatusBadge(inv.paymentStatus, inv.isOverdue);

      container.querySelector("#modal-val-claimed").textContent = fin.supplierClaimedFormatted || "₹0";
      container.querySelector("#modal-val-approved").textContent = fin.approvedPayableFormatted || "₹0";
      container.querySelector("#modal-val-held").textContent = fin.heldDisputedFormatted || "₹0";

      container.querySelector("#modal-supplier-inv").textContent = inv.supplierInvoiceNumber || inv.invoiceId;
      container.querySelector("#modal-internal-id").textContent = inv.invoiceId;
      container.querySelector("#modal-inv-date").textContent = formatDate(inv.invoiceDate);
      container.querySelector("#modal-due-date").textContent = formatDate(inv.dueDate);
      container.querySelector("#modal-overdue-status").innerHTML = inv.isOverdue
        ? `<span class="text-rose-400 font-bold">${inv.daysOverdue} Days Overdue</span>`
        : `<span class="text-emerald-400 font-bold">Within Payment Terms</span>`;

      container.querySelector("#modal-cafe-name").textContent = inv.cafe?.name || "—";
      container.querySelector("#modal-cafe-code").textContent = inv.cafe?.code || inv.cafe?.cafeId || "—";
      container.querySelector("#modal-cafe-address").textContent = inv.cafe?.address || "Main Café Facility";

      if (inv.linkedDocuments?.poReferenceId) {
        container.querySelector("#modal-po-link").innerHTML = `<a href="#vendor-orders?po=${encodeURIComponent(inv.linkedDocuments.poReferenceId)}" class="hover:underline">${inv.linkedDocuments.poReferenceId}</a>`;
      } else {
        container.querySelector("#modal-po-link").textContent = "Direct Billing";
      }

      if (inv.linkedDocuments?.viewGrnUrls?.length > 0) {
        container.querySelector("#modal-grn-links").innerHTML = inv.linkedDocuments.viewGrnUrls
          .map((g) => `<a href="#vendor-deliveries?grn=${encodeURIComponent(g.grnId)}" class="text-sky-400 hover:underline mr-2">${g.grnId}</a>`)
          .join("");
      } else {
        container.querySelector("#modal-grn-links").textContent = "—";
      }

      container.querySelector("#modal-taxable-val").textContent = fin.taxableFormatted || "₹0";
      container.querySelector("#modal-tax-val").textContent = `${fin.taxFormatted || "₹0"} (${fin.cgstFormatted || "₹0"} CGST + ${fin.sgstFormatted || "₹0"} SGST)`;
      container.querySelector("#modal-paid-val").textContent = fin.paidFormatted || "₹0";
      container.querySelector("#modal-outstanding-val").textContent = fin.outstandingFormatted || "₹0";

      // Line items
      const items = inv.lineItems || [];
      container.querySelector("#modal-line-count").textContent = `${items.length} Line Items`;
      const linesTbody = container.querySelector("#modal-line-items-body");
      if (items.length === 0) {
        linesTbody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-neutral-500">No line item breakdown recorded.</td></tr>`;
      } else {
        linesTbody.innerHTML = items
          .map(
            (it) => `
            <tr class="hover:bg-neutral-850/40 border-b border-neutral-800/40">
              <td class="py-2.5 px-3">
                <div class="font-bold text-white">${it.itemName}</div>
                ${it.disputeReason ? `<div class="text-[10px] text-amber-400 font-semibold mt-0.5">⚠️ Hold: ${it.disputeReason}</div>` : ""}
              </td>
              <td class="py-2.5 px-3 text-right font-mono text-neutral-300">${it.invoiceQuantity}</td>
              <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">${it.acceptedQuantity}</td>
              <td class="py-2.5 px-3 text-right font-mono ${it.rejectedQuantity > 0 ? "text-rose-400 font-bold" : "text-neutral-500"}">${it.rejectedQuantity}</td>
              <td class="py-2.5 px-3 text-right font-mono text-neutral-300">${it.unitPriceFormatted}</td>
              <td class="py-2.5 px-3 text-right font-mono text-neutral-200">${it.lineTotalFormatted}</td>
              <td class="py-2.5 px-3 text-right font-mono font-black text-emerald-300">${it.payableAmountFormatted}</td>
            </tr>
          `
          )
          .join("");
      }

      // Milestones
      const timelineBox = container.querySelector("#modal-timeline");
      timelineBox.innerHTML = (inv.timeline || [])
        .map(
          (m) => `
          <div class="p-2.5 rounded-lg border ${m.completed ? "border-emerald-800/80 bg-emerald-950/20 text-emerald-300" : "border-neutral-800 bg-neutral-950 text-neutral-500"} text-center">
            <div class="text-[10px] font-bold uppercase">${m.label}</div>
            <div class="text-xs font-black mt-1">${m.completed ? "✓ COMPLETED" : "PENDING"}</div>
            ${m.timestamp ? `<div class="text-[9px] text-neutral-400 mt-0.5">${formatDate(m.timestamp)}</div>` : ""}
          </div>
        `
        )
        .join("");

    } catch (err) {
      console.error("[VendorInvoices] Modal error:", err);
      alert(err.message || "Failed to load invoice details.");
      modal.classList.add("hidden");
    }
  }

  // 4. PDF Download Handler
  downloadPdfBtn.addEventListener("click", async () => {
    if (!activeModalInvoiceId) return;
    try {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.innerHTML = `<span>⏳</span> Downloading...`;
      await downloadBlob(
        `/api/v1/vendor/invoices/${encodeURIComponent(activeModalInvoiceId)}/pdf`,
        `Invoice-${activeModalInvoiceId}.pdf`
      );
    } catch (err) {
      console.error("[VendorInvoices] PDF download error:", err);
      alert("Failed to download official invoice PDF.");
    } finally {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.innerHTML = `<span>📥</span> PDF Summary`;
    }
  });

  // Modal Close Events
  closeModalBtn.addEventListener("click", () => modal.classList.add("hidden"));
  closeModalBottomBtn.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  // 5. Event Listeners
  cafeSelector.addEventListener("change", (e) => {
    currentSelectedCafe = e.target.value;
    currentPage = 1;
    fetchInvoicesList();
  });

  let searchTimeout = null;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearchTerm = e.target.value.trim();
      currentPage = 1;
      fetchInvoicesList();
    }, 300);
  });

  datePills.forEach((btn) => {
    btn.addEventListener("click", () => {
      datePills.forEach((b) => {
        b.className = "px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 font-semibold hover:border-neutral-500 transition-all active:scale-95";
      });
      btn.className = "px-2.5 py-1.5 rounded-lg border border-primary-500/80 bg-primary-950/60 text-primary-200 font-bold shadow-inner";

      const range = btn.dataset.range;
      currentSelectedDateRange = range;
      if (range === "custom") {
        customDatesBar.classList.remove("hidden");
      } else {
        customDatesBar.classList.add("hidden");
        currentPage = 1;
        fetchInvoicesList();
      }
    });
  });

  applyCustomDatesBtn?.addEventListener("click", () => {
    currentPage = 1;
    fetchInvoicesList();
  });

  paymentStatusFilter.addEventListener("change", (e) => {
    currentSelectedPaymentStatus = e.target.value;
    currentPage = 1;
    fetchInvoicesList();
  });

  approvalStatusFilter.addEventListener("change", (e) => {
    currentSelectedApprovalStatus = e.target.value;
    currentPage = 1;
    fetchInvoicesList();
  });

  sortFilter.addEventListener("change", (e) => {
    currentSort = e.target.value;
    currentPage = 1;
    fetchInvoicesList();
  });

  clearFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    currentSearchTerm = "";
    paymentStatusFilter.value = "ALL";
    currentSelectedPaymentStatus = "ALL";
    approvalStatusFilter.value = "ALL";
    currentSelectedApprovalStatus = "ALL";
    sortFilter.value = "date_desc";
    currentSort = "date_desc";
    currentSelectedCafe = "ALL";
    cafeSelector.value = "ALL";
    currentSelectedDateRange = "30days";
    customDatesBar.classList.add("hidden");
    datePills.forEach((b) => {
      if (b.dataset.range === "30days") {
        b.className = "px-2.5 py-1.5 rounded-lg border border-primary-500/80 bg-primary-950/60 text-primary-200 font-bold shadow-inner";
      } else {
        b.className = "px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 font-semibold hover:border-neutral-500 transition-all active:scale-95";
      }
    });
    currentPage = 1;
    fetchInvoicesList();
  });

  refreshBtn.addEventListener("click", () => fetchInvoicesList());

  kpiCards.forEach((card) => {
    card.addEventListener("click", () => {
      const kpiFilter = card.dataset.kpiFilter;
      if (kpiFilter === "ALL") {
        paymentStatusFilter.value = "ALL";
        currentSelectedPaymentStatus = "ALL";
      } else if (kpiFilter === "APPROVED") {
        approvalStatusFilter.value = "APPROVED";
        currentSelectedApprovalStatus = "APPROVED";
      } else if (kpiFilter === "ON_HOLD" || kpiFilter === "ON_HOLD_COUNT") {
        paymentStatusFilter.value = "ON_HOLD";
        currentSelectedPaymentStatus = "ON_HOLD";
      } else if (kpiFilter === "OVERDUE" || kpiFilter === "OVERDUE_COUNT") {
        paymentStatusFilter.value = "OVERDUE";
        currentSelectedPaymentStatus = "OVERDUE";
      } else if (kpiFilter === "PAID") {
        paymentStatusFilter.value = "PAID";
        currentSelectedPaymentStatus = "PAID";
      } else if (kpiFilter === "DUE") {
        paymentStatusFilter.value = "DUE";
        currentSelectedPaymentStatus = "DUE";
      } else if (kpiFilter === "PARTIALLY_PAID") {
        paymentStatusFilter.value = "PARTIALLY_PAID";
        currentSelectedPaymentStatus = "PARTIALLY_PAID";
      }
      currentPage = 1;
      fetchInvoicesList();
    });
  });

  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      fetchInvoicesList();
    }
  });

  nextPageBtn.addEventListener("click", () => {
    currentPage++;
    fetchInvoicesList();
  });

  // Initial fetch
  fetchInvoicesList();
}

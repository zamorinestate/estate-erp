// =============================================================================
// ZAMORIN CAFE ERP — VEN-SCR-003: VENDOR DELIVERIES & GOODS RECEIPT (GRN)
//
// Single source of truth for external vendors regarding inbound supply:
// What was ordered → What was supplied → What reached the café →
// What was accepted → What was rejected / missing → Discrepancy reasons.
//
// Key Guarantees:
// 1. Strictly READ-ONLY: Zero mutation controls (no create/edit/status updates).
// 2. Semantic Unit Preservation: Never sums incompatible UOMs (e.g. 10 KG + 5 L != 15).
// 3. Multi-GRN Support: Accurately presents multiple receipts under a single PO.
// 4. Discrepancy Transparency: Exposes physical count discrepancies without leaking
//    internal employee / manager chatter or profit margins.
// 5. 10 interactive KPI cards functioning as quick filter triggers.
// 6. Comprehensive read-only Delivery/GRN detail view with 8-stage lifecycle timeline.
// 7. Authorised document downloads (Official A4 GRN PDF & delivery attachments).
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentDeliveriesData = null;
let currentSelectedCafe = "ALL";
let currentSelectedDateRange = "30days";
let currentSelectedDeliveryStatus = "ALL";
let currentSelectedGrnStatus = "ALL";
let currentSelectedDiscrepancy = "ALL";
let currentSearchTerm = "";
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

export function renderVendorDeliveries() {
  return `
    <div id="vendor-deliveries-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-950/40 via-sky-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-lg border border-sky-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-300">READ-ONLY GOODS RECEIPT (GRN) & DELIVERIES</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-sky-500/20 text-sky-200 border border-sky-500/40">VEN-SCR-003</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Authoritative visibility into delivery dispatches, physical store counts, accepted goods, shortages, and discrepancies. Zero mutation permitted.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-refresh-deliveries" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
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
            <span>Deliveries & Goods Receipt</span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span id="vendor-id-badge" class="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 font-semibold">—</span>
            <span id="vendor-category-badge" class="px-2.5 py-1 rounded-md bg-primary-950/60 text-primary-300 border border-primary-800/50 uppercase font-semibold text-[11px]">—</span>
            <span id="vendor-gst-badge" class="hidden sm:inline-flex px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono text-[11px]">—</span>
          </div>
        </div>

        <!-- CAFÉ SCOPE SELECTOR -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-2">
          <label for="select-cafe-scope" class="text-xs font-semibold text-neutral-400">Café Scope:</label>
          <div class="relative">
            <select id="select-cafe-scope" class="w-full sm:w-64 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Authorized Cafés</option>
            </select>
          </div>
        </div>
      </header>

      <!-- 10 INTERACTIVE KPI SUMMARY CARDS -->
      <section class="kpi-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5" aria-label="Deliveries and Goods Receipt Summaries">
        
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-neutral-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="ALL" title="Click to view all delivery records">
          <div class="flex items-center justify-between text-neutral-400 text-xs font-semibold">
            <span>Total Records</span>
            <span class="text-neutral-500 group-hover:text-neutral-300 transition-colors">📦</span>
          </div>
          <div id="kpi-total-records" class="text-xl sm:text-2xl font-black text-white mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Deliveries & GRNs</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-amber-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="AWAITING" title="Click to view shipments awaiting receipt">
          <div class="flex items-center justify-between text-amber-400 text-xs font-semibold">
            <span>Awaiting Receipt</span>
            <span class="text-amber-500">⏳</span>
          </div>
          <div id="kpi-awaiting-receipt" class="text-xl sm:text-2xl font-black text-amber-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Pending Store Intake</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-sky-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="EXPECTED_TODAY" title="Click to view deliveries expected today">
          <div class="flex items-center justify-between text-sky-400 text-xs font-semibold">
            <span>Expected Today</span>
            <span class="text-sky-500">🚚</span>
          </div>
          <div id="kpi-expected-today" class="text-xl sm:text-2xl font-black text-sky-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Scheduled for today</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-emerald-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="RECEIVED" title="Click to view goods arrived at café">
          <div class="flex items-center justify-between text-emerald-400 text-xs font-semibold">
            <span>Received at Café</span>
            <span class="text-emerald-500">🏢</span>
          </div>
          <div id="kpi-received-cafe" class="text-xl sm:text-2xl font-black text-emerald-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Physically arrived</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-orange-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="PARTIAL" title="Click to view partial intake records">
          <div class="flex items-center justify-between text-orange-400 text-xs font-semibold">
            <span>Partially Received</span>
            <span class="text-orange-500">⚖️</span>
          </div>
          <div id="kpi-partially-received" class="text-xl sm:text-2xl font-black text-orange-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Partial intake recorded</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-yellow-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="GRN_PENDING" title="Click to view GRNs pending review">
          <div class="flex items-center justify-between text-yellow-400 text-xs font-semibold">
            <span>GRN Pending</span>
            <span class="text-yellow-500">📋</span>
          </div>
          <div id="kpi-grn-pending" class="text-xl sm:text-2xl font-black text-yellow-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Review / Verification</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-emerald-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="GRN_COMPLETED" title="Click to view completed GRNs">
          <div class="flex items-center justify-between text-emerald-400 text-xs font-semibold">
            <span>GRN Completed</span>
            <span class="text-emerald-500">✅</span>
          </div>
          <div id="kpi-grn-completed" class="text-xl sm:text-2xl font-black text-emerald-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Fully verified</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-rose-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="DISCREPANCY" title="Click to filter records with shortages or rejections">
          <div class="flex items-center justify-between text-rose-400 text-xs font-semibold">
            <span>With Discrepancy</span>
            <span class="text-rose-500">⚠️</span>
          </div>
          <div id="kpi-discrepancy" class="text-xl sm:text-2xl font-black text-rose-300 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Shortage or rejection</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-rose-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="REJECTED" title="Click to view rejected line items">
          <div class="flex items-center justify-between text-rose-400 text-xs font-semibold">
            <span>Rejected Lines</span>
            <span class="text-rose-500">🚫</span>
          </div>
          <div id="kpi-rejected-lines" class="text-xl sm:text-2xl font-black text-rose-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Damaged / unacceptable</div>
        </div>

        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 cursor-pointer hover:border-amber-600 hover:bg-neutral-850 transition-all shadow-md group" data-kpi-filter="SHORTAGE" title="Click to view missing line items">
          <div class="flex items-center justify-between text-amber-400 text-xs font-semibold">
            <span>Short / Missing</span>
            <span class="text-amber-500">📉</span>
          </div>
          <div id="kpi-missing-lines" class="text-xl sm:text-2xl font-black text-amber-200 mt-1.5 tracking-tight">—</div>
          <div class="text-[10px] text-neutral-500 mt-0.5">Delivery count shortages</div>
        </div>

      </section>

      <!-- UNIVERSAL SEARCH BAR -->
      <section class="search-section bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 shadow-lg backdrop-blur-md">
        <div class="relative">
          <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500 text-sm">🔍</span>
          <input 
            type="text" 
            id="input-universal-search" 
            class="w-full bg-neutral-950 border border-neutral-700/80 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 shadow-inner"
            placeholder="Search PO number, GRN number, delivery note, ASN, item name, SKU or café..."
          />
          <button id="btn-clear-search" class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-500 hover:text-neutral-300 hidden text-sm font-bold">✕</button>
        </div>
      </section>

      <!-- FILTER TOOLBAR -->
      <section class="filter-toolbar bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 shadow-lg backdrop-blur-md space-y-4">
        
        <!-- Timeline Quick Filter Pills -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3.5">
          <div class="flex items-center gap-1 text-xs font-semibold text-neutral-400 mr-2">
            <span>Period:</span>
          </div>
          <div id="timeline-pills" class="flex flex-wrap items-center gap-1.5">
            <button class="pill-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all" data-period="today">Today</button>
            <button class="pill-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all" data-period="this_week">This Week</button>
            <button class="pill-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all" data-period="7days">Last 7 Days</button>
            <button class="pill-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-700 bg-primary-950/80 text-primary-300 active" data-period="30days">Last 30 Days</button>
            <button class="pill-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all" data-period="this_month">This Month</button>
            <button class="pill-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all" data-period="this_fy">This FY</button>
            <button class="pill-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all" data-period="custom">Custom</button>
          </div>
        </div>

        <!-- Custom Date Range Pickers (hidden by default) -->
        <div id="custom-date-container" class="hidden flex flex-wrap items-center gap-3 pt-1">
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
            <label for="filter-delivery-status" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Delivery Status</label>
            <select id="filter-delivery-status" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Delivery Statuses</option>
              <option value="Awaiting Supply">Awaiting Supply</option>
              <option value="In Transit">In Transit</option>
              <option value="Received">Received</option>
              <option value="Partially Received">Partially Received</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div>
            <label for="filter-grn-status" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">GRN Status</label>
            <select id="filter-grn-status" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All GRN Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Verification Pending">Verification Pending</option>
              <option value="Completed">Completed</option>
              <option value="Accepted">Accepted</option>
              <option value="Partial">Partial</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label for="filter-discrepancy" class="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Discrepancy</label>
            <select id="filter-discrepancy" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Records</option>
              <option value="NO_DISCREPANCY">No Discrepancy</option>
              <option value="QUANTITY_SHORTAGE">Quantity Shortage</option>
              <option value="REJECTED_QUANTITY">Rejected Quantity</option>
              <option value="DAMAGED">Damaged Goods</option>
              <option value="OTHER">Other Discrepancy</option>
            </select>
          </div>

          <div class="flex items-end">
            <button id="btn-clear-filters" class="w-full px-3 py-2 text-xs font-bold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-all flex items-center justify-center gap-1.5 shadow">
              <span>🧹</span> Clear All Filters
            </button>
          </div>

        </div>

      </section>

      <!-- DELIVERIES & GRN REGISTER (DESKTOP TABLE & MOBILE CARDS) -->
      <section class="register-section bg-neutral-900/80 border border-neutral-800 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden" aria-label="Deliveries and Goods Receipt Register">
        
        <div class="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              <span>Delivery & Goods Receipt Register</span>
              <span id="badge-total-count" class="px-2 py-0.5 text-xs font-bold rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">0</span>
            </h2>
          </div>
          <div class="text-xs text-neutral-400">
            Showing <span id="span-range-start">0</span>–<span id="span-range-end">0</span> of <span id="span-range-total">0</span>
          </div>
        </div>

        <!-- Desktop View Table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-neutral-950/80 text-neutral-400 uppercase text-[10px] font-black tracking-wider border-b border-neutral-800">
                <th class="py-3 px-4">Delivery / GRN</th>
                <th class="py-3 px-4">PO Reference</th>
                <th class="py-3 px-4">Café Destination</th>
                <th class="py-3 px-4">Receipt Date</th>
                <th class="py-3 px-4">Items</th>
                <th class="py-3 px-4 text-right">Delivered</th>
                <th class="py-3 px-4 text-right">Accepted</th>
                <th class="py-3 px-4 text-right">Rejected</th>
                <th class="py-3 px-4 text-right">Missing</th>
                <th class="py-3 px-4 text-center">GRN Status</th>
                <th class="py-3 px-4 text-center">Discrepancy</th>
                <th class="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody id="deliveries-table-body" class="divide-y divide-neutral-800/60 font-medium">
              <tr>
                <td colspan="12" class="py-12 text-center text-neutral-400">
                  <div class="animate-pulse space-y-2">
                    <div class="text-base font-bold text-neutral-300">Loading deliveries & goods receipts...</div>
                    <div class="text-xs text-neutral-500">Fetching authoritative physical count and GRN records</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Card View -->
        <div id="deliveries-mobile-cards" class="md:hidden divide-y divide-neutral-800/80 p-3 space-y-3">
          <!-- Populated by wireVendorDeliveries -->
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

      <!-- READ-ONLY DELIVERY / GRN DETAIL MODAL -->
      <div id="modal-delivery-detail" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md hidden flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <div class="modal-dialog bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
          
          <!-- Modal Header -->
          <div class="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
            <div class="flex items-center gap-2.5">
              <span class="text-lg">📦</span>
              <div>
                <div class="flex items-center gap-2">
                  <h3 id="modal-grn-id" class="text-base sm:text-lg font-black text-white font-mono tracking-tight">GRN-0000</h3>
                  <span id="modal-grn-status-badge" class="px-2.5 py-0.5 text-[11px] font-extrabold uppercase rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">—</span>
                </div>
                <div class="text-xs text-neutral-400 mt-0.5">Authoritative Read-Only Goods Receipt & Intake Verification</div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-modal-print" class="px-3 py-1.5 text-xs font-bold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg flex items-center gap-1 shadow">
                🖨️ Print
              </button>
              <button id="btn-modal-pdf" class="px-3 py-1.5 text-xs font-bold text-primary-300 bg-primary-950/80 hover:bg-primary-900 border border-primary-800/80 rounded-lg flex items-center gap-1 shadow">
                📥 Download PDF
              </button>
              <button id="btn-close-modal" class="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center font-bold text-base transition-all">✕</button>
            </div>
          </div>

          <!-- Modal Body (Scrollable) -->
          <div id="modal-body-content" class="p-4 sm:p-6 space-y-6 overflow-y-auto text-xs text-neutral-300">
            <!-- Dynamically populated by renderModalDetailContent() -->
          </div>

          <!-- Modal Footer -->
          <div class="p-3.5 sm:p-4 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between">
            <div class="text-[11px] text-neutral-500 font-mono">
              🔒 System Generated — Read-Only Vendor Copy | Zamorin Café ERP
            </div>
            <button id="btn-modal-close-bottom" class="px-4 py-2 text-xs font-bold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700">Close</button>
          </div>

        </div>
      </div>

    </div>
  `;
}

export async function wireVendorDeliveries(container) {
  const tableBody = container.querySelector("#deliveries-table-body");
  const mobileCards = container.querySelector("#deliveries-mobile-cards");
  const cafeSelect = container.querySelector("#select-cafe-scope");
  const searchInput = container.querySelector("#input-universal-search");
  const clearSearchBtn = container.querySelector("#btn-clear-search");
  const timelinePills = container.querySelectorAll(".pill-btn");
  const customDateContainer = container.querySelector("#custom-date-container");
  const dateStartInput = container.querySelector("#input-date-start");
  const dateEndInput = container.querySelector("#input-date-end");
  const applyCustomDatesBtn = container.querySelector("#btn-apply-custom-dates");
  const deliveryStatusSelect = container.querySelector("#filter-delivery-status");
  const grnStatusSelect = container.querySelector("#filter-grn-status");
  const discrepancySelect = container.querySelector("#filter-discrepancy");
  const clearFiltersBtn = container.querySelector("#btn-clear-filters");
  const refreshBtn = container.querySelector("#btn-refresh-deliveries");
  const prevPageBtn = container.querySelector("#btn-prev-page");
  const nextPageBtn = container.querySelector("#btn-next-page");

  // Detail Modal Elements
  const modal = container.querySelector("#modal-delivery-detail");
  const closeModalBtn = container.querySelector("#btn-close-modal");
  const closeModalBottomBtn = container.querySelector("#btn-modal-close-bottom");
  const modalPrintBtn = container.querySelector("#btn-modal-print");
  const modalPdfBtn = container.querySelector("#btn-modal-pdf");
  const modalBodyContent = container.querySelector("#modal-body-content");

  let activeRecordDetail = null;
  let searchDebounceTimer = null;

  async function loadVendorProfile() {
    try {
      const res = await api.get("/api/v1/vendor/me");
      if (res && res.success && res.data) {
        const v = res.data.vendor;
        const nameEl = container.querySelector("#vendor-company-name");
        const idBadge = container.querySelector("#vendor-id-badge");
        const catBadge = container.querySelector("#vendor-category-badge");
        const gstBadge = container.querySelector("#vendor-gst-badge");

        if (nameEl) nameEl.textContent = `Deliveries & Goods Receipt — ${v.name}`;
        if (idBadge) idBadge.textContent = v.vendorId;
        if (catBadge) catBadge.textContent = v.category || "FOOD & BEVERAGE";
        if (gstBadge) gstBadge.textContent = `GSTIN: ${v.gstNumber || "Unregistered"}`;

        if (cafeSelect && Array.isArray(res.data.authorizedCafes)) {
          const prevVal = cafeSelect.value;
          cafeSelect.innerHTML = `<option value="ALL">All Authorized Cafés (${res.data.authorizedCafes.length})</option>`;
          for (const c of res.data.authorizedCafes) {
            const opt = document.createElement("option");
            opt.value = c.cafeId;
            opt.textContent = `${c.name || c.displayName} (${c.cafeId})`;
            cafeSelect.appendChild(opt);
          }
          if (prevVal) cafeSelect.value = prevVal;
        }
      }
    } catch (err) {
      console.warn("[VendorDeliveries] Could not load profile metadata:", err);
    }
  }

  async function fetchDeliveriesList() {
    try {
      tableBody.innerHTML = `
        <tr>
          <td colspan="12" class="py-12 text-center text-neutral-400">
            <div class="animate-pulse space-y-2">
              <div class="text-base font-bold text-neutral-300">Refreshing deliveries & goods receipts...</div>
              <div class="text-xs text-neutral-500">Retrieving physical counting records & discrepancies</div>
            </div>
          </td>
        </tr>
      `;

      const params = new URLSearchParams();
      if (currentSelectedCafe && currentSelectedCafe !== "ALL") params.set("cafeId", currentSelectedCafe);
      if (currentSelectedDateRange) params.set("dateRange", currentSelectedDateRange);
      if (currentSelectedDateRange === "custom") {
        if (dateStartInput.value) params.set("customStart", dateStartInput.value);
        if (dateEndInput.value) params.set("customEnd", dateEndInput.value);
      }
      if (currentSelectedDeliveryStatus && currentSelectedDeliveryStatus !== "ALL") params.set("deliveryStatus", currentSelectedDeliveryStatus);
      if (currentSelectedGrnStatus && currentSelectedGrnStatus !== "ALL") params.set("grnStatus", currentSelectedGrnStatus);
      if (currentSelectedDiscrepancy && currentSelectedDiscrepancy !== "ALL") params.set("discrepancy", currentSelectedDiscrepancy);
      if (currentSearchTerm) params.set("search", currentSearchTerm);
      params.set("page", String(currentPage));
      params.set("limit", String(currentLimit));

      const res = await api.get(`/api/v1/vendor/deliveries?${params.toString()}`);
      if (res && res.success && res.data) {
        currentDeliveriesData = res.data;
        updateKpis(res.data.kpis);
        renderTableRows(res.data.deliveries);
        renderMobileCards(res.data.deliveries);
        updatePagination(res.data.pagination);
      } else {
        renderEmptyState("No delivery or goods receipt records match the current criteria.");
      }
    } catch (err) {
      console.error("[VendorDeliveries] Fetch error:", err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="12" class="py-12 text-center">
            <div class="p-4 max-w-md mx-auto rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 space-y-2">
              <div class="font-bold text-sm">Failed to Load Deliveries</div>
              <p class="text-xs text-neutral-300">${err.message || "An unexpected error occurred while fetching delivery records."}</p>
              <button id="btn-retry-fetch" class="mt-2 px-3 py-1.5 text-xs font-bold bg-rose-800 hover:bg-rose-700 text-white rounded-lg">Retry</button>
            </div>
          </td>
        </tr>
      `;
      container.querySelector("#btn-retry-fetch")?.addEventListener("click", fetchDeliveriesList);
    }
  }

  function updateKpis(kpis = {}) {
    container.querySelector("#kpi-total-records").textContent = String(kpis.totalRecords ?? 0);
    container.querySelector("#kpi-awaiting-receipt").textContent = String(kpis.awaitingReceipt ?? 0);
    container.querySelector("#kpi-expected-today").textContent = String(kpis.expectedToday ?? 0);
    container.querySelector("#kpi-received-cafe").textContent = String(kpis.receivedAtCafe ?? 0);
    container.querySelector("#kpi-partially-received").textContent = String(kpis.partiallyReceived ?? 0);
    container.querySelector("#kpi-grn-pending").textContent = String(kpis.grnPending ?? 0);
    container.querySelector("#kpi-grn-completed").textContent = String(kpis.grnCompleted ?? 0);
    container.querySelector("#kpi-discrepancy").textContent = String(kpis.recordsWithDiscrepancy ?? 0);
    container.querySelector("#kpi-rejected-lines").textContent = String(kpis.totalRejectedLines ?? 0);
    container.querySelector("#kpi-missing-lines").textContent = String(kpis.totalMissingLines ?? 0);
  }

  function getGrnBadge(status) {
    const s = String(status || "").toUpperCase();
    if (s === "COMPLETED" || s === "ACCEPTED") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">Completed</span>`;
    }
    if (s === "VERIFICATION PENDING" || s === "RECORDED") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-yellow-950/80 text-yellow-300 border border-yellow-800/80">Verification Pending</span>`;
    }
    if (s === "PARTIAL") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-orange-950/80 text-orange-300 border border-orange-800/80">Partial</span>`;
    }
    if (s === "REJECTED") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-950/80 text-rose-300 border border-rose-800/80">Rejected</span>`;
    }
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-neutral-800 text-neutral-300 border border-neutral-700">Pending</span>`;
  }

  function getDeliveryBadge(status) {
    const s = String(status || "").toUpperCase();
    if (s === "RECEIVED" || s === "COMPLETED") {
      return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">Received</span>`;
    }
    if (s === "PARTIALLY RECEIVED") {
      return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-orange-950/60 text-orange-300 border border-orange-800/60">Partial</span>`;
    }
    if (s === "IN TRANSIT") {
      return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-sky-950/60 text-sky-300 border border-sky-800/60">In Transit</span>`;
    }
    return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-neutral-800 text-neutral-400 border border-neutral-700">Awaiting</span>`;
  }

  function renderTableRows(records = []) {
    if (!records || records.length === 0) {
      renderEmptyState("No deliveries or GRN records found for the selected criteria.");
      return;
    }

    tableBody.innerHTML = records.map((r) => {
      const isShort = r.missingQty > 0;
      const isRej = r.rejectedQty > 0;
      let discBadge = `<span class="text-neutral-500 font-normal">None</span>`;
      if (isRej && isShort) {
        discBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 font-bold text-[10px]">⚠️ Rej & Short</span>`;
      } else if (isRej) {
        discBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 font-bold text-[10px]">🚫 Rejected (${r.rejectedQty})</span>`;
      } else if (isShort) {
        discBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 font-bold text-[10px]">📉 Short (${r.missingQty})</span>`;
      }

      return `
        <tr class="hover:bg-neutral-850/80 transition-colors group cursor-pointer" data-delivery-id="${r.id}">
          <td class="py-3 px-4 font-mono font-bold text-white group-hover:text-primary-300 transition-colors">
            <div class="flex items-center gap-1.5">
              <span>${r.grnId || r.id}</span>
              ${r.isAwaitingReceipt ? '<span class="text-[9px] font-normal text-amber-400 bg-amber-950/60 px-1 rounded">Expected</span>' : ''}
            </div>
            <div class="text-[10px] font-normal text-neutral-500 font-sans mt-0.5">${r.deliveryReference || "—"}</div>
          </td>
          <td class="py-3 px-4 font-mono font-semibold text-neutral-300">
            <a href="#vendor-orders?po=${r.purchaseOrderId}" class="hover:underline hover:text-primary-400" title="View Purchase Order in VEN-SCR-002">
              ${r.purchaseOrderId}
            </a>
          </td>
          <td class="py-3 px-4">
            <div class="font-medium text-neutral-200">${r.cafeName || r.cafeId}</div>
            <div class="text-[10px] text-neutral-500 font-mono">${r.cafeCode || r.cafeId}</div>
          </td>
          <td class="py-3 px-4 text-neutral-300">
            <div>${formatDate(r.receiptDate || r.expectedDeliveryDate)}</div>
            <div class="text-[10px] text-neutral-500">${r.receiptTime || (r.isAwaitingReceipt ? "Awaiting Arrival" : "")}</div>
          </td>
          <td class="py-3 px-4 text-neutral-300">
            <span class="font-semibold text-white">${r.itemCount}</span> Lines
          </td>
          <td class="py-3 px-4 text-right font-mono font-bold text-neutral-200">
            ${r.deliveredQty > 0 ? r.deliveredQty : "—"}
          </td>
          <td class="py-3 px-4 text-right font-mono font-bold text-emerald-400">
            ${r.acceptedQty > 0 ? r.acceptedQty : "—"}
          </td>
          <td class="py-3 px-4 text-right font-mono font-bold ${r.rejectedQty > 0 ? 'text-rose-400' : 'text-neutral-500'}">
            ${r.rejectedQty > 0 ? r.rejectedQty : "0"}
          </td>
          <td class="py-3 px-4 text-right font-mono font-bold ${r.missingQty > 0 ? 'text-amber-400' : 'text-neutral-500'}">
            ${r.missingQty > 0 ? r.missingQty : "0"}
          </td>
          <td class="py-3 px-4 text-center">
            ${getGrnBadge(r.grnStatus)}
          </td>
          <td class="py-3 px-4 text-center">
            ${discBadge}
          </td>
          <td class="py-3 px-4 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button class="btn-row-view px-2.5 py-1 text-[11px] font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 hover:border-neutral-600 transition-all shadow" data-id="${r.id}">
                View
              </button>
              ${r.grnId ? `
                <button class="btn-row-pdf px-2 py-1 text-[11px] font-bold bg-primary-950/60 hover:bg-primary-900 text-primary-300 rounded border border-primary-800/60 transition-all" data-id="${r.grnId}" title="Download Official A4 GRN PDF">
                  PDF
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    wireRowActions();
  }

  function renderMobileCards(records = []) {
    if (!records || records.length === 0) {
      mobileCards.innerHTML = `
        <div class="py-8 text-center text-neutral-400 text-xs">
          No delivery records to display.
        </div>
      `;
      return;
    }

    mobileCards.innerHTML = records.map((r) => {
      return `
        <div class="mobile-order-card bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3" data-delivery-id="${r.id}">
          <div class="flex items-center justify-between">
            <span class="font-mono font-bold text-white text-sm">${r.grnId || r.id}</span>
            ${getGrnBadge(r.grnStatus)}
          </div>
          <div class="text-xs text-neutral-300">
            <span class="text-neutral-500">PO:</span> <span class="font-mono font-bold">${r.purchaseOrderId}</span>
          </div>
          <div class="text-xs text-neutral-300">
            <span class="text-neutral-500">Café:</span> <span class="font-semibold text-white">${r.cafeName || r.cafeId}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-neutral-800">
            <div>
              <span class="text-neutral-500">Receipt Date:</span>
              <div class="font-semibold text-neutral-200">${formatDate(r.receiptDate || r.expectedDeliveryDate)}</div>
            </div>
            <div>
              <span class="text-neutral-500">Quantities:</span>
              <div class="font-semibold text-neutral-200">Acc: <span class="text-emerald-400 font-bold">${r.acceptedQty}</span> | Rej: <span class="text-rose-400 font-bold">${r.rejectedQty}</span></div>
            </div>
          </div>
          ${r.hasDiscrepancy ? `
            <div class="p-2 rounded bg-rose-950/40 border border-rose-800/60 text-[11px] text-rose-300">
              ⚠️ <strong>Discrepancy:</strong> ${r.discrepancySummary}
            </div>
          ` : ''}
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
            <button class="btn-row-view w-full py-2 text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg border border-neutral-700" data-id="${r.id}">
              View Delivery Detail
            </button>
          </div>
        </div>
      `;
    }).join("");

    wireRowActions();
  }

  function renderEmptyState(message) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="12" class="py-12 text-center text-neutral-400">
          <div class="space-y-2">
            <div class="text-2xl">📦</div>
            <div class="text-base font-bold text-neutral-300">No Delivery Records Found</div>
            <div class="text-xs text-neutral-500 max-w-sm mx-auto">${message}</div>
          </div>
        </td>
      </tr>
    `;
    mobileCards.innerHTML = `
      <div class="py-12 text-center text-neutral-400 text-xs">
        <div class="text-2xl mb-2">📦</div>
        <div class="font-bold text-neutral-300">No Delivery Records Found</div>
        <div class="text-neutral-500 mt-1">${message}</div>
      </div>
    `;
  }

  function updatePagination(p = {}) {
    const total = p.total ?? 0;
    const page = p.page ?? 1;
    const limit = p.limit ?? 20;
    const totalPages = p.totalPages ?? 1;

    currentPage = page;

    container.querySelector("#badge-total-count").textContent = String(total);
    container.querySelector("#span-range-start").textContent = total === 0 ? "0" : String((page - 1) * limit + 1);
    container.querySelector("#span-range-end").textContent = String(Math.min(page * limit, total));
    container.querySelector("#span-range-total").textContent = String(total);
    container.querySelector("#span-current-page").textContent = String(page);
    container.querySelector("#span-total-pages").textContent = String(totalPages);

    prevPageBtn.disabled = page <= 1;
    nextPageBtn.disabled = page >= totalPages;
  }

  function wireRowActions() {
    container.querySelectorAll(".btn-row-view, tr.group").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".btn-row-pdf") || e.target.tagName === "A") return;
        const id = el.dataset.id || el.dataset.deliveryId || el.closest("[data-delivery-id]")?.dataset.deliveryId;
        if (id) openDeliveryDetailModal(id);
      });
    });

    container.querySelectorAll(".btn-row-pdf").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id) triggerPdfDownload(id);
      });
    });
  }

  async function openDeliveryDetailModal(id) {
    try {
      modal.classList.remove("hidden");
      modalBodyContent.innerHTML = `
        <div class="py-12 text-center text-neutral-400 animate-pulse space-y-2">
          <div class="text-base font-bold text-neutral-200">Loading delivery details & receiving verification...</div>
          <div class="text-xs text-neutral-500">Retrieving line-item intake counts, discrepancy records, and document audit trails</div>
        </div>
      `;

      const res = await api.get(`/api/v1/vendor/deliveries/${id}`);
      if (res && res.success && res.data) {
        activeRecordDetail = res.data;
        renderModalDetailContent(res.data);
      } else {
        modalBodyContent.innerHTML = `<div class="p-6 text-center text-rose-400 font-bold">Failed to load record details.</div>`;
      }
    } catch (err) {
      console.error("[VendorDeliveries] Detail fetch error:", err);
      modalBodyContent.innerHTML = `
        <div class="p-6 text-center text-rose-400 space-y-2">
          <div class="font-bold text-sm">Error Loading Record</div>
          <p class="text-xs text-neutral-300">${err.message || "Failed to load record details."}</p>
        </div>
      `;
    }
  }

  function renderModalDetailContent(d) {
    container.querySelector("#modal-grn-id").textContent = d.grnId || `DEL-${d.linkedPurchaseOrder?.purchaseOrderId}`;
    const badgeEl = container.querySelector("#modal-grn-status-badge");
    badgeEl.textContent = d.grnStatus;

    modalBodyContent.innerHTML = `
      <!-- PERSISTENT READ-ONLY STRIP IN MODAL -->
      <div class="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-amber-400">🔒</span>
          <span class="text-xs font-bold text-neutral-200 uppercase tracking-wider">READ-ONLY DELIVERY / GRN RECORD</span>
        </div>
        <div class="text-[11px] text-neutral-400 font-mono">
          Intake Status: <strong class="text-white">${d.deliveryStatus}</strong>
        </div>
      </div>

      <!-- SECTION A & B: RECORD IDENTITY & LINKED PO BANNER -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <!-- Record Identity -->
        <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
          <h4 class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Intake & Reference Identity</h4>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div><span class="text-neutral-500">GRN Reference:</span> <span class="font-mono font-bold text-white block">${d.grnId || "Pending Receipt"}</span></div>
            <div><span class="text-neutral-500">Delivery Reference:</span> <span class="font-mono text-neutral-200 block">${d.deliveryReference || "—"}</span></div>
            <div><span class="text-neutral-500">Receipt Date:</span> <span class="text-neutral-200 block">${formatDate(d.receiptDate || d.expectedDeliveryDate)}</span></div>
            <div><span class="text-neutral-500">Receipt Time:</span> <span class="text-neutral-200 block">${d.receiptTime || "—"}</span></div>
            <div><span class="text-neutral-500">ASN Number:</span> <span class="font-mono text-neutral-200 block">${d.asnReference || "None Linked"}</span></div>
            <div><span class="text-neutral-500">Challan Ref:</span> <span class="font-mono text-neutral-200 block">${d.deliveryChallanReference || "None Linked"}</span></div>
          </div>
        </div>

        <!-- Linked Purchase Order Banner -->
        <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Linked Purchase Order</h4>
              <span class="px-2 py-0.5 text-[10px] font-bold rounded bg-neutral-800 text-neutral-300 font-mono">${d.linkedPurchaseOrder?.poStatus}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs mt-2">
              <div><span class="text-neutral-500">PO Number:</span> <span class="font-mono font-bold text-primary-300 block">${d.linkedPurchaseOrder?.purchaseOrderId}</span></div>
              <div><span class="text-neutral-500">Order Date:</span> <span class="text-neutral-200 block">${formatDate(d.linkedPurchaseOrder?.orderDate)}</span></div>
              <div><span class="text-neutral-500">PO Authorized Value:</span> <span class="font-mono font-bold text-white block">${d.linkedPurchaseOrder?.totalFormatted}</span></div>
              <div><span class="text-neutral-500">Destination:</span> <span class="text-neutral-200 block">${d.delivery?.cafeName}</span></div>
            </div>
          </div>
          <div class="pt-2 border-t border-neutral-800/80 flex justify-end">
            <a href="${d.linkedPurchaseOrder?.viewOrderUrl}" class="px-3 py-1.5 text-xs font-bold text-primary-300 hover:text-white bg-primary-950/60 hover:bg-primary-900 border border-primary-800/60 rounded-lg transition-all flex items-center gap-1">
              <span>View Purchase Order in VEN-SCR-002</span> ➔
            </a>
          </div>
        </div>

      </div>

      <!-- CAFÉ DESTINATION & VENDOR SNAPSHOT -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-1.5 text-xs">
          <h4 class="font-bold text-neutral-400 uppercase tracking-wider text-[11px]">Receiving Café Facility</h4>
          <div class="font-bold text-white text-sm">${d.delivery?.cafeName} (${d.delivery?.cafeCode || d.delivery?.cafeId})</div>
          <div class="text-neutral-300">${d.delivery?.address}</div>
          <div class="text-neutral-400">Intake In-Charge: <strong class="text-neutral-200">${d.delivery?.contactPerson}</strong></div>
        </div>

        <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-1.5 text-xs">
          <h4 class="font-bold text-neutral-400 uppercase tracking-wider text-[11px]">Supplier of Record</h4>
          <div class="font-bold text-white text-sm">${d.vendor?.name}</div>
          <div class="text-neutral-300 font-mono">Vendor ID: ${d.vendor?.vendorId}</div>
          <div class="text-neutral-400 font-mono">GSTIN: ${d.vendor?.gstNumber}</div>
        </div>

      </div>

      <!-- SECTION C: ITEM-LEVEL RECEIVING RECONCILIATION -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>Item-Level Receiving Reconciliation</span>
            <span class="text-neutral-500 font-normal">(${d.items?.length || 0} Line Items)</span>
          </h4>
          <div class="text-[11px] text-neutral-400 font-mono">
            Semantic Units Preserved
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-neutral-900 text-neutral-400 uppercase text-[10px] font-black tracking-wider border-b border-neutral-800">
                <th class="py-2.5 px-3">Item Description</th>
                <th class="py-2.5 px-3">SKU / Code</th>
                <th class="py-2.5 px-3">Pack Size</th>
                <th class="py-2.5 px-3">UOM</th>
                <th class="py-2.5 px-3 text-right">Ordered</th>
                <th class="py-2.5 px-3 text-right">Delivered</th>
                <th class="py-2.5 px-3 text-right">Accepted</th>
                <th class="py-2.5 px-3 text-right">Rejected</th>
                <th class="py-2.5 px-3 text-right">Missing</th>
                <th class="py-2.5 px-3 text-right">Pending</th>
                <th class="py-2.5 px-3">Lot / Expiry</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-800/80 font-medium">
              ${(d.items || []).map((it) => {
                return `
                  <tr class="hover:bg-neutral-900/60 transition-colors">
                    <td class="py-2.5 px-3 font-semibold text-white">${it.itemName}</td>
                    <td class="py-2.5 px-3 font-mono text-neutral-400">${it.sku || "—"}</td>
                    <td class="py-2.5 px-3 text-neutral-400">${it.packSize || "—"}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-primary-300">${it.baseUnit}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-neutral-300">${it.orderedQty}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-neutral-300">${it.deliveredQty}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">${it.acceptedQty}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold ${it.rejectedQty > 0 ? 'text-rose-400' : 'text-neutral-500'}">${it.rejectedQty}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold ${it.missingQty > 0 ? 'text-amber-400' : 'text-neutral-500'}">${it.missingQty}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-neutral-400">${it.pendingQty}</td>
                    <td class="py-2.5 px-3 text-neutral-400 font-mono text-[11px]">${it.lotNumber || "—"}${it.expiryDate ? ` (Exp: ${formatDate(it.expiryDate)})` : ''}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECTION D: DISCREPANCY BREAKDOWN (IF ANY) -->
      ${d.hasDiscrepancy ? `
        <div class="space-y-2 p-4 rounded-xl bg-rose-950/30 border border-rose-800/60">
          <div class="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
            <span>⚠️</span> Recorded Physical Discrepancy & Rejection Details
          </div>
          <p class="text-[11px] text-neutral-300">Authoritative physical receiving discrepancy records. Internal employee comments remain protected and omitted.</p>
          <div class="space-y-2 mt-3">
            ${(d.discrepancies || []).map((disc) => `
              <div class="p-3 rounded-lg bg-neutral-950/80 border border-rose-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div class="font-bold text-white">${disc.itemName} <span class="font-mono text-neutral-400 text-[11px]">(${disc.itemId})</span></div>
                  <div class="text-neutral-300 mt-0.5">Condition: <strong class="text-rose-300">${disc.description}</strong></div>
                  <div class="text-[10px] text-neutral-500 font-mono mt-0.5">Reason Code: ${disc.reasonCode} | Recorded: ${formatDate(disc.date)}</div>
                </div>
                <div class="text-right sm:text-right font-mono">
                  ${disc.rejectedQuantity > 0 ? `<div class="text-rose-400 font-bold">${disc.rejectedQuantity} ${disc.uom} Rejected</div>` : ''}
                  ${disc.missingQuantity > 0 ? `<div class="text-amber-400 font-bold">${disc.missingQuantity} ${disc.uom} Missing</div>` : ''}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      ` : `
        <div class="p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/40 flex items-center gap-2 text-emerald-300 text-xs">
          <span>✅</span>
          <span><strong>Perfect Physical Intake:</strong> No missing quantities or rejected items recorded on this goods receipt note.</span>
        </div>
      `}

      <!-- SECTION E: RECEIVING LIFECYCLE 8-STAGE TIMELINE -->
      <div class="space-y-3">
        <h4 class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Receiving Lifecycle Milestones</h4>
        <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800">
          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-[10px]">
            ${(d.timeline || []).map((step, idx) => `
              <div class="flex flex-col items-center p-2 rounded-lg ${step.completed ? 'bg-emerald-950/40 border border-emerald-800/50' : 'bg-neutral-900/40 border border-neutral-800/40 opacity-50'}">
                <div class="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs mb-1.5 ${step.completed ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50' : 'bg-neutral-800 text-neutral-500'}">
                  ${step.completed ? '✓' : idx + 1}
                </div>
                <div class="font-bold ${step.completed ? 'text-white' : 'text-neutral-500'} leading-tight">${step.label}</div>
                ${step.timestamp ? `<div class="text-[9px] text-neutral-400 mt-1 font-mono">${formatDate(step.timestamp)}</div>` : ''}
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <!-- SECTION F & G: RELATED INVOICES & RETURN/DEBIT SETTLEMENT IMPACT -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
          <h4 class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Linked Invoices</h4>
          ${(d.relatedInvoices && d.relatedInvoices.length > 0) ? `
            <div class="space-y-1.5">
              ${d.relatedInvoices.map((inv) => `
                <div class="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between text-xs font-mono">
                  <div>
                    <div class="font-bold text-white">${inv.invoiceNumber}</div>
                    <div class="text-[10px] text-neutral-400">${formatDate(inv.invoiceDate)}</div>
                  </div>
                  <div class="text-right">
                    <div class="font-bold text-neutral-200">${inv.amountFormatted}</div>
                    <div class="text-[10px] uppercase font-bold text-emerald-400">${inv.status}</div>
                  </div>
                </div>
              `).join("")}
            </div>
          ` : `
            <div class="text-neutral-500 text-xs py-2">No vendor invoices have been recorded against this order yet.</div>
          `}
        </div>

        <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
          <h4 class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Settlement & Adjustments</h4>
          <div class="text-xs text-neutral-300">
            ${d.returnsAndDebits?.settlementImpact}
          </div>
          <div class="text-xs text-neutral-400 pt-1">
            Debit Notes: <strong class="text-white">${d.returnsAndDebits?.hasDebitNote ? 'Recorded' : 'None'}</strong>
          </div>
        </div>

      </div>

      <!-- SECTION H: AUTHORISED DOCUMENTS -->
      <div class="space-y-2">
        <h4 class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Authorized Transaction Documents</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          ${(d.documents || []).map((doc) => `
            <div class="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 flex items-center justify-between">
              <div class="flex items-center gap-2 text-xs">
                <span class="text-base">📄</span>
                <div>
                  <div class="font-semibold text-white leading-tight">${doc.title}</div>
                  <div class="text-[10px] text-neutral-500 font-mono">${doc.filename || doc.documentType}</div>
                </div>
              </div>
              <button class="btn-download-doc px-2.5 py-1 text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700" data-url="${doc.url}" data-filename="${doc.filename}">
                Download
              </button>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    // Wire document download buttons in modal
    modalBodyContent.querySelectorAll(".btn-download-doc").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.dataset.url;
        const filename = btn.dataset.filename;
        if (url) {
          downloadBlob(url, filename || "document.pdf");
        }
      });
    });
  }

  function triggerPdfDownload(grnId) {
    if (!grnId) return;
    downloadBlob(`/api/v1/vendor/deliveries/${grnId}/pdf`, `GRN-${grnId}.pdf`);
  }

  // Event Listeners
  if (cafeSelect) {
    cafeSelect.addEventListener("change", (e) => {
      currentSelectedCafe = e.target.value;
      currentPage = 1;
      fetchDeliveriesList();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      fetchDeliveriesList();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchDebounceTimer);
      const val = e.target.value.trim();
      if (clearSearchBtn) clearSearchBtn.classList.toggle("hidden", val.length === 0);
      searchDebounceTimer = setTimeout(() => {
        currentSearchTerm = val;
        currentPage = 1;
        fetchDeliveriesList();
      }, 350);
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      clearSearchBtn.classList.add("hidden");
      currentSearchTerm = "";
      currentPage = 1;
      fetchDeliveriesList();
    });
  }

  timelinePills.forEach((pill) => {
    pill.addEventListener("click", () => {
      timelinePills.forEach((p) => p.classList.remove("active", "border-neutral-700", "bg-primary-950/80", "text-primary-300"));
      pill.classList.add("active", "border-neutral-700", "bg-primary-950/80", "text-primary-300");
      currentSelectedDateRange = pill.dataset.period;
      if (currentSelectedDateRange === "custom") {
        customDateContainer.classList.remove("hidden");
      } else {
        customDateContainer.classList.add("hidden");
        currentPage = 1;
        fetchDeliveriesList();
      }
    });
  });

  if (applyCustomDatesBtn) {
    applyCustomDatesBtn.addEventListener("click", () => {
      currentPage = 1;
      fetchDeliveriesList();
    });
  }

  if (deliveryStatusSelect) {
    deliveryStatusSelect.addEventListener("change", (e) => {
      currentSelectedDeliveryStatus = e.target.value;
      currentPage = 1;
      fetchDeliveriesList();
    });
  }

  if (grnStatusSelect) {
    grnStatusSelect.addEventListener("change", (e) => {
      currentSelectedGrnStatus = e.target.value;
      currentPage = 1;
      fetchDeliveriesList();
    });
  }

  if (discrepancySelect) {
    discrepancySelect.addEventListener("change", (e) => {
      currentSelectedDiscrepancy = e.target.value;
      currentPage = 1;
      fetchDeliveriesList();
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      currentSelectedDeliveryStatus = "ALL";
      currentSelectedGrnStatus = "ALL";
      currentSelectedDiscrepancy = "ALL";
      currentSearchTerm = "";
      currentSelectedDateRange = "30days";
      if (searchInput) searchInput.value = "";
      if (deliveryStatusSelect) deliveryStatusSelect.value = "ALL";
      if (grnStatusSelect) grnStatusSelect.value = "ALL";
      if (discrepancySelect) discrepancySelect.value = "ALL";
      timelinePills.forEach((p) => p.classList.remove("active", "border-neutral-700", "bg-primary-950/80", "text-primary-300"));
      const defaultPill = container.querySelector('[data-period="30days"]');
      if (defaultPill) defaultPill.classList.add("active", "border-neutral-700", "bg-primary-950/80", "text-primary-300");
      customDateContainer.classList.add("hidden");
      currentPage = 1;
      fetchDeliveriesList();
    });
  }

  // KPI card clickable filters
  container.querySelectorAll(".kpi-card").forEach((card) => {
    card.addEventListener("click", () => {
      const filterKey = card.dataset.kpiFilter;
      if (filterKey === "ALL") {
        currentSelectedDeliveryStatus = "ALL";
        currentSelectedGrnStatus = "ALL";
        currentSelectedDiscrepancy = "ALL";
      } else if (filterKey === "AWAITING") {
        currentSelectedDeliveryStatus = "Awaiting Supply";
      } else if (filterKey === "EXPECTED_TODAY") {
        currentSelectedDateRange = "today";
        timelinePills.forEach((p) => p.classList.remove("active", "border-neutral-700", "bg-primary-950/80", "text-primary-300"));
        const todayPill = container.querySelector('[data-period="today"]');
        if (todayPill) todayPill.classList.add("active", "border-neutral-700", "bg-primary-950/80", "text-primary-300");
      } else if (filterKey === "RECEIVED") {
        currentSelectedDeliveryStatus = "Received";
      } else if (filterKey === "PARTIAL") {
        currentSelectedDeliveryStatus = "Partially Received";
      } else if (filterKey === "GRN_PENDING") {
        currentSelectedGrnStatus = "Pending";
      } else if (filterKey === "GRN_COMPLETED") {
        currentSelectedGrnStatus = "Completed";
      } else if (filterKey === "DISCREPANCY") {
        currentSelectedDiscrepancy = "OTHER";
      } else if (filterKey === "REJECTED") {
        currentSelectedDiscrepancy = "REJECTED_QUANTITY";
      } else if (filterKey === "SHORTAGE") {
        currentSelectedDiscrepancy = "QUANTITY_SHORTAGE";
      }

      if (deliveryStatusSelect) deliveryStatusSelect.value = currentSelectedDeliveryStatus;
      if (grnStatusSelect) grnStatusSelect.value = currentSelectedGrnStatus;
      if (discrepancySelect) discrepancySelect.value = currentSelectedDiscrepancy;

      currentPage = 1;
      fetchDeliveriesList();
    });
  });

  // Pagination clicks
  if (prevPageBtn) {
    prevPageBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        fetchDeliveriesList();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener("click", () => {
      currentPage++;
      fetchDeliveriesList();
    });
  }

  // Modal close handlers
  if (closeModalBtn) closeModalBtn.addEventListener("click", () => modal.classList.add("hidden"));
  if (closeModalBottomBtn) closeModalBottomBtn.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  if (modalPrintBtn) {
    modalPrintBtn.addEventListener("click", () => {
      window.print();
    });
  }

  if (modalPdfBtn) {
    modalPdfBtn.addEventListener("click", () => {
      if (activeRecordDetail) {
        triggerPdfDownload(activeRecordDetail.grnId || activeRecordDetail.linkedPurchaseOrder?.purchaseOrderId);
      }
    });
  }

  // Initial load
  await loadVendorProfile();
  await fetchDeliveriesList();
}

// =============================================================================
// ZAMORIN CAFE ERP — VEN-SCR-002: VENDOR PURCHASE ORDERS REGISTER
//
// Authoritative, read-only single source of visibility for every purchase order
// issued to the authenticated vendor across authorized cafés.
//
// Key Guarantees:
// 1. Strictly READ-ONLY: Zero mutation capabilities.
// 2. Clear separation of PO Status vs Delivery Status vs GRN Status vs Payment Status.
// 3. 10 interactive KPI cards functioning as quick filter triggers.
// 4. Multi-level search across PO Number, Item Name/Code, Café, Invoice, GRN.
// 5. Rich, comprehensive read-only PO Detail View covering:
//    - PO Identity & Versioning
//    - Vendor Information Snapshot
//    - Café & Delivery Bay Instructions
//    - Items Table with pack sizes & specifications
//    - Financial Breakdown (Subtotal, Tax, Discounts, Grand Total)
//    - Ordered vs Supplied vs Received line-by-line reconciliation
//    - Rejection / Shortage / Discrepancy notices
//    - 8-step visual milestone timeline
//    - Revisions history
//    - Related GRNs, Invoices, and Payment settlements
//    - Linked Authorised Documents & printable A4 PDF download
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentOrdersData = null;
let currentSelectedCafe = "ALL";
let currentSelectedDateRange = "30days";
let currentSelectedPoStatus = "ALL";
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

export function renderVendorOrders() {
  return `
    <div id="vendor-orders-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg border border-amber-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-300">READ-ONLY PURCHASE ORDER REGISTER</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-amber-500/20 text-amber-200 border border-amber-500/40">VEN-SCR-002</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Authoritative visibility into purchase orders, delivery statuses, GRN receipts, and linked invoices. Zero mutation allowed.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-refresh-orders" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
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
            <span>Purchase Orders</span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span id="vendor-id-badge" class="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 font-semibold">—</span>
            <span id="vendor-category-badge" class="px-2.5 py-1 rounded-md bg-primary-950/60 text-primary-300 border border-primary-800/50 uppercase font-semibold text-[11px]">—</span>
            <span id="vendor-gst-badge" class="hidden sm:inline-flex px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono text-[11px]">—</span>
          </div>
        </div>

        <!-- CAFÉ SCOPE SELECTOR -->
        <div class="flex items-center gap-3">
          <div class="flex flex-col gap-1 min-w-[200px]">
            <label for="select-orders-cafe-scope" class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Café Scope</label>
            <select id="select-orders-cafe-scope" class="bg-neutral-950 border border-neutral-700 text-neutral-100 text-xs rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all cursor-pointer">
              <option value="ALL">All Authorised Cafés</option>
            </select>
          </div>
        </div>
      </header>

      <!-- SECTION 2: 10 KPI SUMMARY CARDS (CLICKABLE FILTER TRIGGERS) -->
      <section aria-label="Purchase Order Summary KPIs">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          
          <!-- 1. TOTAL ORDERS -->
          <div data-filter-status="ALL" class="kpi-card cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-primary-500/50 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 shadow group">
            <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 group-hover:text-primary-300 flex items-center justify-between">
              <span>Total Orders</span>
              <span>📋</span>
            </div>
            <div id="kpi-total-orders" class="text-xl font-extrabold text-white mt-1.5 font-mono">0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">POs in period</div>
          </div>

          <!-- 2. OPEN ORDERS -->
          <div data-filter-status="APPROVED" class="kpi-card cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 shadow group">
            <div class="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center justify-between">
              <span>Open Orders</span>
              <span>🔵</span>
            </div>
            <div id="kpi-open-orders" class="text-xl font-extrabold text-blue-400 mt-1.5 font-mono">0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">Active & approved</div>
          </div>

          <!-- 3. AWAITING SUPPLY -->
          <div data-filter-supply="AWAITING" class="kpi-card cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-amber-500/50 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 shadow group">
            <div class="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center justify-between">
              <span>Awaiting Supply</span>
              <span>⏳</span>
            </div>
            <div id="kpi-awaiting-supply" class="text-xl font-extrabold text-amber-400 mt-1.5 font-mono">0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">Nothing supplied yet</div>
          </div>

          <!-- 4. PARTIALLY SUPPLIED -->
          <div data-filter-supply="PARTIAL" class="kpi-card cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-orange-500/50 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 shadow group">
            <div class="text-[10px] font-bold uppercase tracking-wider text-orange-400 flex items-center justify-between">
              <span>Partially Supplied</span>
              <span>📦</span>
            </div>
            <div id="kpi-partially-supplied" class="text-xl font-extrabold text-orange-400 mt-1.5 font-mono">0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">Partial shipments</div>
          </div>

          <!-- 5. SUPPLIED -->
          <div data-filter-supply="SUPPLIED" class="kpi-card cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-indigo-500/50 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 shadow group">
            <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center justify-between">
              <span>Supplied</span>
              <span>🚚</span>
            </div>
            <div id="kpi-supplied" class="text-xl font-extrabold text-indigo-400 mt-1.5 font-mono">0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">Dispatched / in-transit</div>
          </div>

          <!-- 6. PARTIALLY RECEIVED -->
          <div data-filter-status="PARTIALLY_RECEIVED" class="kpi-card cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-purple-500/50 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 shadow group">
            <div class="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center justify-between">
              <span>Partially Received</span>
              <span>📥</span>
            </div>
            <div id="kpi-partially-received" class="text-xl font-extrabold text-purple-400 mt-1.5 font-mono">0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">Café received part</div>
          </div>

          <!-- 7. RECEIVED -->
          <div data-filter-status="RECEIVED" class="kpi-card cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-teal-500/50 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 shadow group">
            <div class="text-[10px] font-bold uppercase tracking-wider text-teal-400 flex items-center justify-between">
              <span>Received</span>
              <span>🏬</span>
            </div>
            <div id="kpi-received" class="text-xl font-extrabold text-teal-400 mt-1.5 font-mono">0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">Physical intake confirmed</div>
          </div>

          <!-- 8. COMPLETED -->
          <div data-filter-status="CLOSED" class="kpi-card cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-emerald-500/50 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 shadow group">
            <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
              <span>Completed</span>
              <span>✅</span>
            </div>
            <div id="kpi-completed" class="text-xl font-extrabold text-emerald-400 mt-1.5 font-mono">0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">Procurement finalized</div>
          </div>

          <!-- 9. CANCELLED -->
          <div data-filter-status="CANCELLED" class="kpi-card cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-rose-500/50 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 shadow group">
            <div class="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center justify-between">
              <span>Cancelled</span>
              <span>🔴</span>
            </div>
            <div id="kpi-cancelled" class="text-xl font-extrabold text-rose-400 mt-1.5 font-mono">0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">Withdrawn internally</div>
          </div>

          <!-- 10. TOTAL PO VALUE -->
          <div class="kpi-card bg-gradient-to-br from-neutral-900 to-neutral-900/90 border border-primary-900/50 rounded-xl p-3.5 shadow">
            <div class="text-[10px] font-bold uppercase tracking-wider text-primary-400 flex items-center justify-between">
              <span>Total PO Value</span>
              <span>💰</span>
            </div>
            <div id="kpi-total-value" class="text-xl font-black text-white mt-1.5 font-mono">₹0</div>
            <div class="text-[10px] text-neutral-500 mt-0.5">Total authorised order value</div>
          </div>

        </div>
      </section>

      <!-- SECTION 3 & 4: UNIVERSAL SEARCH & EXTENSIVE FILTER CONTROLS -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-lg space-y-4">
        
        <!-- ROW 1: SEARCH & DATE PILLS -->
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          <!-- UNIVERSAL SEARCH -->
          <div class="relative flex-1 min-w-[280px]">
            <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500 text-sm">🔍</span>
            <input 
              type="text" 
              id="input-orders-search" 
              placeholder="Search PO number, item, café, invoice, GRN or reference..." 
              class="w-full pl-10 pr-4 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 placeholder-neutral-500 text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all shadow-inner"
            />
          </div>

          <!-- TIMELINE QUICK PILLS -->
          <div class="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mr-1 hidden sm:inline">Timeline:</span>
            <div id="orders-date-pills" class="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl p-1 gap-1">
              <button data-range="today" class="pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition">Today</button>
              <button data-range="this_week" class="pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition">This Week</button>
              <button data-range="30days" class="pill-btn px-2.5 py-1 text-xs rounded-lg bg-primary-600 text-white font-bold transition shadow-sm">30 Days</button>
              <button data-range="this_month" class="pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition">This Month</button>
              <button data-range="this_fy" class="pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition">This FY</button>
              <button data-range="custom" class="pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition">Custom</button>
            </div>
          </div>
        </div>

        <!-- ROW 2: DETAILED DROPDOWN FILTERS & VALUE RANGE -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-neutral-800/80">
          
          <!-- PO STATUS -->
          <div class="flex flex-col gap-1">
            <label for="filter-po-status" class="text-[9px] font-bold uppercase tracking-wider text-neutral-400">PO Status</label>
            <select id="filter-po-status" class="bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 focus:outline-none">
              <option value="ALL">All PO Statuses</option>
              <option value="APPROVED">Open / Approved</option>
              <option value="ORDERED">Ordered</option>
              <option value="PARTIALLY_RECEIVED">Partially Received</option>
              <option value="RECEIVED">Received</option>
              <option value="CLOSED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <!-- SUPPLY STATUS -->
          <div class="flex flex-col gap-1">
            <label for="filter-supply-status" class="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Supply Status</label>
            <select id="filter-supply-status" class="bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 focus:outline-none">
              <option value="ALL">All Supply</option>
              <option value="AWAITING">Awaiting Supply</option>
              <option value="PARTIAL">Partially Supplied</option>
              <option value="SUPPLIED">Supplied</option>
              <option value="RECEIVED">Received</option>
            </select>
          </div>

          <!-- GRN STATUS -->
          <div class="flex flex-col gap-1">
            <label for="filter-grn-status" class="text-[9px] font-bold uppercase tracking-wider text-neutral-400">GRN Status</label>
            <select id="filter-grn-status" class="bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 focus:outline-none">
              <option value="ALL">All GRN</option>
              <option value="NONE">None</option>
              <option value="PARTIAL">Partial GRN</option>
              <option value="PENDING">Pending Verification</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <!-- INVOICE STATUS -->
          <div class="flex flex-col gap-1">
            <label for="filter-invoice-status" class="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Invoice Status</label>
            <select id="filter-invoice-status" class="bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 focus:outline-none">
              <option value="ALL">All Invoices</option>
              <option value="UNBILLED">Unbilled</option>
              <option value="RECORDED">Recorded</option>
              <option value="APPROVED">Approved</option>
            </select>
          </div>

          <!-- PAYMENT STATUS -->
          <div class="flex flex-col gap-1">
            <label for="filter-payment-status" class="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Payment Status</label>
            <select id="filter-payment-status" class="bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 focus:outline-none">
              <option value="ALL">All Payments</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="SETTLED">Settled</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>

          <!-- CLEAR FILTERS BUTTON -->
          <div class="flex flex-col justify-end">
            <button id="btn-clear-filters" class="w-full px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-950 hover:bg-neutral-800 border border-neutral-700 rounded-lg transition active:scale-95 flex items-center justify-center gap-1.5">
              <span>✕</span> Clear Filters
            </button>
          </div>

        </div>

        <!-- OPTIONAL CUSTOM DATE ROW (HIDDEN BY DEFAULT) -->
        <div id="custom-date-row" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800">
          <div>
            <label for="input-custom-start-date" class="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Date From</label>
            <input type="date" id="input-custom-start-date" class="w-full bg-neutral-950 border border-neutral-700 text-neutral-100 text-xs rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary-500" />
          </div>
          <div>
            <label for="input-custom-end-date" class="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Date To</label>
            <input type="date" id="input-custom-end-date" class="w-full bg-neutral-950 border border-neutral-700 text-neutral-100 text-xs rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary-500" />
          </div>
        </div>

      </section>

      <!-- SECTION 5: PURCHASE ORDER REGISTER (MAIN TABLE & RESPONSIVE CARDS) -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
        
        <div class="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Purchase Order Register</span>
              <span id="badge-total-records" class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-normal">0 Records</span>
            </h2>
            <p class="text-xs text-neutral-400 mt-0.5">Chronological ledger of official orders with distinct supply, GRN, invoice, and payment milestones.</p>
          </div>
        </div>

        <!-- DESKTOP DATA TABLE -->
        <div class="hidden lg:block overflow-x-auto">
          <table class="w-full text-left text-xs text-neutral-300">
            <thead class="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
              <tr>
                <th scope="col" class="py-3.5 px-4 font-semibold">PO No.</th>
                <th scope="col" class="py-3.5 px-3 font-semibold">Order Date</th>
                <th scope="col" class="py-3.5 px-3 font-semibold">Café</th>
                <th scope="col" class="py-3.5 px-3 font-semibold">Required Date</th>
                <th scope="col" class="py-3.5 px-3 font-semibold text-center">Items</th>
                <th scope="col" class="py-3.5 px-4 font-semibold text-right">PO Value</th>
                <th scope="col" class="py-3.5 px-3 font-semibold">Supply</th>
                <th scope="col" class="py-3.5 px-3 font-semibold">GRN</th>
                <th scope="col" class="py-3.5 px-3 font-semibold">Invoice</th>
                <th scope="col" class="py-3.5 px-3 font-semibold">Payment</th>
                <th scope="col" class="py-3.5 px-3 font-semibold">PO Status</th>
                <th scope="col" class="py-3.5 px-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody id="orders-table-body" class="divide-y divide-neutral-800/60 font-sans">
              <tr>
                <td colspan="12" class="py-12 text-center text-neutral-400">
                  <span class="inline-block animate-spin mr-2">⏳</span> Loading purchase orders...
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- MOBILE / TABLET RESPONSIVE CARD VIEW -->
        <div id="orders-card-container" class="lg:hidden p-4 space-y-3.5">
          <!-- Populated by JavaScript -->
        </div>

        <!-- PAGINATION CONTROLS -->
        <div class="p-4 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-neutral-950/50">
          <div class="text-xs text-neutral-400">
            Showing <span id="pagination-start" class="font-bold text-white font-mono">0</span> to <span id="pagination-end" class="font-bold text-white font-mono">0</span> of <span id="pagination-total" class="font-bold text-white font-mono">0</span> orders
          </div>
          <div class="flex items-center gap-2">
            <button id="btn-page-prev" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
              ← Previous
            </button>
            <span id="pagination-current-page" class="text-xs font-mono font-bold text-neutral-300 px-2">Page 1</span>
            <button id="btn-page-next" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
              Next →
            </button>
          </div>
        </div>

      </section>

      <!-- SECTION 6: COMPREHENSIVE READ-ONLY PO DETAIL MODAL (VEN-SCR-002) -->
      <div id="modal-po-detail" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
          
          <!-- MODAL HEADER -->
          <div class="p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-2xl">📦</span>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 id="modal-po-number" class="text-base sm:text-lg font-black text-white font-mono tracking-tight">PO-XXXX</h3>
                  <span id="modal-revision-badge" class="hidden px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">REV 01</span>
                  <span id="modal-status-badge" class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-neutral-800 text-neutral-200">OPEN</span>
                </div>
                <p id="modal-po-subtitle" class="text-xs text-neutral-400 mt-0.5">Zamorin Café ERP Official Purchase Order</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-modal-print-po" class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 flex items-center gap-1.5 transition">
                <span>🖨️</span> Print
              </button>
              <button id="btn-modal-download-pdf" class="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold shadow flex items-center gap-1.5 transition">
                <span>📥</span> PDF
              </button>
              <button id="btn-modal-close" class="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center font-bold text-sm transition">
                ✕
              </button>
            </div>
          </div>

          <!-- READ-ONLY NOTICE BANNER -->
          <div class="bg-amber-950/40 border-b border-amber-500/20 px-5 py-2.5 flex items-center gap-2 text-xs text-amber-300 font-semibold">
            <span>🔒</span>
            <span>READ-ONLY PURCHASE ORDER — This order is an official ERP record. Modifications or edits are disabled.</span>
          </div>

          <!-- MODAL SCROLLABLE BODY -->
          <div class="p-5 sm:p-6 overflow-y-auto space-y-6 text-xs text-neutral-300">

            <!-- CANCELLATION BANNER (IF CANCELLED) -->
            <div id="modal-cancellation-banner" class="hidden p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300">
              <div class="flex items-center gap-2 font-bold text-sm text-rose-200">
                <span>🔴</span>
                <span>ORDER CANCELLED INTERNALLY</span>
              </div>
              <p id="modal-cancellation-reason" class="mt-1 text-xs text-rose-300/90">Reason: Order requirement withdrawn.</p>
              <p id="modal-cancellation-date" class="mt-0.5 text-[11px] text-rose-400/80 font-mono">Cancelled on: —</p>
            </div>

            <!-- SECTION A, B, C: IDENTITY & ENTITY DETAILS (3-COLUMN GRID) -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              <!-- 1. PO IDENTIFIER & TERMS -->
              <div class="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800/80 pb-1.5 flex items-center justify-between">
                  <span>Order Identity</span>
                  <span>📄</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-neutral-500">Order Date:</span>
                  <span id="detail-order-date" class="font-mono text-white font-medium">—</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-neutral-500">Required Date:</span>
                  <span id="detail-required-date" class="font-mono text-amber-300 font-medium">—</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-neutral-500">Payment Terms:</span>
                  <span id="detail-payment-terms" class="text-neutral-200">—</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-neutral-500">Issued By:</span>
                  <span id="detail-issued-by" class="text-neutral-200 font-mono">—</span>
                </div>
              </div>

              <!-- 2. VENDOR INFORMATION SNAPSHOT -->
              <div class="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800/80 pb-1.5 flex items-center justify-between">
                  <span>Vendor Snapshot</span>
                  <span>🏢</span>
                </div>
                <div>
                  <div id="detail-vendor-name" class="font-bold text-white text-sm">—</div>
                  <div id="detail-vendor-id" class="font-mono text-neutral-400 text-[11px] mt-0.5">—</div>
                </div>
                <div class="flex justify-between">
                  <span class="text-neutral-500">GSTIN:</span>
                  <span id="detail-vendor-gst" class="font-mono text-neutral-200">—</span>
                </div>
                <div class="text-neutral-400 text-[11px]" id="detail-vendor-address">—</div>
              </div>

              <!-- 3. CAFÉ & RECEIVING BAY DETAILS -->
              <div class="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800/80 pb-1.5 flex items-center justify-between">
                  <span>Delivery Destination</span>
                  <span>📍</span>
                </div>
                <div>
                  <div id="detail-cafe-name" class="font-bold text-white text-sm">—</div>
                  <div id="detail-cafe-code" class="font-mono text-neutral-400 text-[11px] mt-0.5">—</div>
                </div>
                <div class="text-neutral-400 text-[11px]" id="detail-cafe-address">—</div>
                <div class="flex justify-between">
                  <span class="text-neutral-500">Store In-Charge:</span>
                  <span id="detail-cafe-contact" class="text-neutral-200">—</span>
                </div>
                <div class="text-[11px] text-primary-400/90 font-medium" id="detail-delivery-instructions">—</div>
              </div>

            </div>

            <!-- SECTION D: ORDERED ITEMS & FINANCIALS -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-200 flex items-center gap-2">
                  <span>Items Ordered</span>
                  <span id="detail-item-count" class="px-2 py-0.5 rounded-full bg-neutral-800 text-[11px] font-mono font-normal">0 Lines</span>
                </h4>
              </div>

              <div class="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
                <table class="w-full text-left text-xs">
                  <thead class="bg-neutral-900/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th class="py-2.5 px-3">#</th>
                      <th class="py-2.5 px-3">Item Description</th>
                      <th class="py-2.5 px-3">HSN</th>
                      <th class="py-2.5 px-3">Pack / Unit</th>
                      <th class="py-2.5 px-3 text-right">Qty</th>
                      <th class="py-2.5 px-3 text-right">Rate</th>
                      <th class="py-2.5 px-3 text-right">Discount</th>
                      <th class="py-2.5 px-3 text-right">GST</th>
                      <th class="py-2.5 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody id="detail-items-table-body" class="divide-y divide-neutral-800/60 font-mono">
                    <!-- Populated by JS -->
                  </tbody>
                </table>
              </div>

              <!-- FINANCIAL BREAKDOWN SUMMARY -->
              <div class="flex justify-end">
                <div class="w-full sm:w-80 bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2 text-xs">
                  <div class="flex justify-between text-neutral-400">
                    <span>Subtotal:</span>
                    <span id="detail-subtotal" class="font-mono text-neutral-200">₹0</span>
                  </div>
                  <div class="flex justify-between text-neutral-400">
                    <span>Item Discount:</span>
                    <span id="detail-discount" class="font-mono text-rose-400">-₹0</span>
                  </div>
                  <div class="flex justify-between text-neutral-400">
                    <span>Taxable Amount:</span>
                    <span id="detail-taxable" class="font-mono text-neutral-200">₹0</span>
                  </div>
                  <div class="flex justify-between text-neutral-400">
                    <span>CGST:</span>
                    <span id="detail-cgst" class="font-mono text-neutral-200">₹0</span>
                  </div>
                  <div class="flex justify-between text-neutral-400">
                    <span>SGST:</span>
                    <span id="detail-sgst" class="font-mono text-neutral-200">₹0</span>
                  </div>
                  <div class="pt-2 border-t border-neutral-800 flex justify-between font-bold text-white text-sm">
                    <span>Grand Total:</span>
                    <span id="detail-grand-total" class="font-mono text-primary-400 font-extrabold text-base">₹0</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- SECTION F: ORDERED VS SUPPLIED VS RECEIVED RECONCILIATION -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-200 flex items-center gap-2">
                <span>Supply & Receipt Reconciliation (Ordered vs Supplied vs Received)</span>
              </h4>
              <div class="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
                <table class="w-full text-left text-xs">
                  <thead class="bg-neutral-900/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th class="py-2.5 px-3">Item</th>
                      <th class="py-2.5 px-3 text-right">Ordered</th>
                      <th class="py-2.5 px-3 text-right">Supplied</th>
                      <th class="py-2.5 px-3 text-right">Received</th>
                      <th class="py-2.5 px-3 text-right">Accepted</th>
                      <th class="py-2.5 px-3 text-right text-rose-400">Rejected</th>
                      <th class="py-2.5 px-4 text-right text-amber-400">Pending</th>
                    </tr>
                  </thead>
                  <tbody id="detail-reconciliation-table-body" class="divide-y divide-neutral-800/60 font-mono">
                    <!-- Populated by JS -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- SECTION G: REJECTIONS & SHORTAGES (IF ANY) -->
            <div id="detail-shortages-section" class="hidden space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                <span>Discrepancies, Shortages & Rejections</span>
              </h4>
              <div class="overflow-x-auto rounded-xl border border-rose-900/40 bg-neutral-950">
                <table class="w-full text-left text-xs">
                  <thead class="bg-rose-950/20 text-[10px] font-bold uppercase tracking-wider text-rose-400 border-b border-rose-900/30">
                    <tr>
                      <th class="py-2.5 px-3">Item</th>
                      <th class="py-2.5 px-3 text-right">Rejected</th>
                      <th class="py-2.5 px-3 text-right">Missing</th>
                      <th class="py-2.5 px-3">Reason</th>
                      <th class="py-2.5 px-3">Date</th>
                      <th class="py-2.5 px-3">GRN Reference</th>
                    </tr>
                  </thead>
                  <tbody id="detail-shortages-table-body" class="divide-y divide-neutral-800/60 font-sans">
                    <!-- Populated by JS -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- SECTION H: 8-STAGE VISUAL LIFECYCLE TIMELINE -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-200">
                <span>Purchase Order Lifecycle</span>
              </h4>
              <div id="detail-lifecycle-timeline" class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                <!-- Populated by JS -->
              </div>
            </div>

            <!-- SECTION I: REVISIONS HISTORY (IF ANY) -->
            <div id="detail-revisions-section" class="hidden space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                <span>PO Revisions & Adjustments</span>
              </h4>
              <div class="rounded-xl border border-amber-900/40 bg-neutral-950 p-4 space-y-2">
                <div id="detail-revisions-list" class="space-y-2 font-sans">
                  <!-- Populated by JS -->
                </div>
              </div>
            </div>

            <!-- SECTION J, K, L: RELATED GRNS, INVOICES & PAYMENTS (TABBED / GROUPED) -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
              
              <!-- RELATED GRNS -->
              <div class="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2.5">
                <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800/80 pb-1.5 flex items-center justify-between">
                  <span>Goods Receipts (GRN)</span>
                  <span>📥</span>
                </div>
                <div id="detail-grn-list" class="space-y-2 font-mono text-[11px]">
                  <p class="text-neutral-500 font-sans">No GRN recorded yet.</p>
                </div>
              </div>

              <!-- RELATED INVOICES -->
              <div class="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2.5">
                <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800/80 pb-1.5 flex items-center justify-between">
                  <span>Recorded Invoices</span>
                  <span>📄</span>
                </div>
                <div id="detail-invoice-list" class="space-y-2 font-mono text-[11px]">
                  <p class="text-neutral-500 font-sans">No invoice submitted yet.</p>
                </div>
              </div>

              <!-- RELATED PAYMENTS -->
              <div class="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2.5">
                <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800/80 pb-1.5 flex items-center justify-between">
                  <span>Payment Settlements</span>
                  <span>💳</span>
                </div>
                <div id="detail-payment-list" class="space-y-2 font-mono text-[11px]">
                  <p class="text-neutral-500 font-sans">No payment has yet been recorded against this order/invoice.</p>
                </div>
              </div>

            </div>

            <!-- SECTION M: AUTHORISED LINKED DOCUMENTS -->
            <div class="space-y-2.5 pt-2 border-t border-neutral-800">
              <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-300">Authorised Linked Documents</h4>
              <div id="detail-documents-list" class="flex flex-wrap items-center gap-3">
                <!-- Populated by JS -->
              </div>
            </div>

          </div>

          <!-- MODAL FOOTER -->
          <div class="p-4 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between">
            <span class="text-[11px] text-neutral-500 font-mono">System-generated Purchase Order — Zamorin Café ERP</span>
            <button id="btn-modal-close-footer" class="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg transition">
              Close
            </button>
          </div>

        </div>
      </div>

    </div>
  `;
}

export function wireVendorOrders(container = document, appState = state) {
  if (!container) return;

  const refreshBtn = container.querySelector("#btn-refresh-orders");
  const cafeSelect = container.querySelector("#select-orders-cafe-scope");
  const searchInput = container.querySelector("#input-orders-search");
  const datePillsContainer = container.querySelector("#orders-date-pills");
  const clearFiltersBtn = container.querySelector("#btn-clear-filters");

  // Dropdown filter elements
  const poStatusSelect = container.querySelector("#filter-po-status");
  const supplyStatusSelect = container.querySelector("#filter-supply-status");
  const grnStatusSelect = container.querySelector("#filter-grn-status");
  const invoiceStatusSelect = container.querySelector("#filter-invoice-status");
  const paymentStatusSelect = container.querySelector("#filter-payment-status");

  // Custom date inputs
  const customDateRow = container.querySelector("#custom-date-row");
  const customStartInput = container.querySelector("#input-custom-start-date");
  const customEndInput = container.querySelector("#input-custom-end-date");

  // Pagination buttons
  const prevBtn = container.querySelector("#btn-page-prev");
  const nextBtn = container.querySelector("#btn-page-next");

  // Detail Modal Elements
  const modalEl = container.querySelector("#modal-po-detail");
  const modalCloseBtn = container.querySelector("#btn-modal-close");
  const modalCloseFooterBtn = container.querySelector("#btn-modal-close-footer");
  const modalDownloadPdfBtn = container.querySelector("#btn-modal-download-pdf");
  const modalPrintPoBtn = container.querySelector("#btn-modal-print-po");

  let activeModalPoId = null;

  // 1. Fetch & Populate Orders Data
  async function fetchOrders() {
    try {
      if (refreshBtn) refreshBtn.classList.add("opacity-50", "pointer-events-none");

      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(currentLimit),
        dateRange: currentSelectedDateRange,
      });

      if (currentSelectedCafe && currentSelectedCafe !== "ALL") {
        params.set("cafeId", currentSelectedCafe);
      }

      if (currentSelectedPoStatus && currentSelectedPoStatus !== "ALL") {
        params.set("poStatus", currentSelectedPoStatus);
      }

      if (currentSearchTerm && currentSearchTerm.trim()) {
        params.set("search", currentSearchTerm.trim());
      }

      if (currentSelectedDateRange === "custom" && customStartInput?.value && customEndInput?.value) {
        params.set("startDate", customStartInput.value);
        params.set("endDate", customEndInput.value);
      }

      const res = await api.get(`/api/v1/vendor/orders?${params.toString()}`);
      if (res && res.success && res.data) {
        currentOrdersData = res.data;
        populateOrdersUI(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch vendor purchase orders:", err);
      const tableBody = container.querySelector("#orders-table-body");
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="12" class="py-8 text-center text-rose-400 font-semibold">
              ⚠️ Unable to load purchase orders. Please verify your connection and refresh.
            </td>
          </tr>
        `;
      }
    } finally {
      if (refreshBtn) refreshBtn.classList.remove("opacity-50", "pointer-events-none");
    }
  }

  // 2. Fetch Profile to get Vendor Metadata & Authorized Cafes
  async function fetchVendorMetadata() {
    try {
      const res = await api.get("/api/v1/vendor/me");
      if (res && res.success && res.data) {
        const v = res.data;
        const compEl = container.querySelector("#vendor-company-name");
        const idBadgeEl = container.querySelector("#vendor-id-badge");
        const catBadgeEl = container.querySelector("#vendor-category-badge");
        const gstBadgeEl = container.querySelector("#vendor-gst-badge");

        if (compEl) compEl.textContent = `${v.name} — Purchase Orders`;
        if (idBadgeEl) idBadgeEl.textContent = v.vendorId || "—";
        if (catBadgeEl) catBadgeEl.textContent = v.category || "GOODS";
        if (gstBadgeEl) gstBadgeEl.textContent = v.gstNumber ? `GST: ${v.gstNumber}` : "GST: Unregistered";

        // Populate Café Scope Dropdown if not already populated
        if (cafeSelect && cafeSelect.options.length <= 1 && Array.isArray(v.approvedCafes)) {
          v.approvedCafes.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c.cafeId;
            opt.textContent = `${c.name} (${c.code || c.cafeId})`;
            if (c.cafeId === currentSelectedCafe) opt.selected = true;
            cafeSelect.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.warn("Could not fetch vendor profile metadata:", err);
    }
  }

  // 3. Populate Register UI
  function populateOrdersUI(data) {
    const { kpis, orders, pagination } = data;

    // Populate KPIs
    const totalOrdersEl = container.querySelector("#kpi-total-orders");
    const openOrdersEl = container.querySelector("#kpi-open-orders");
    const awaitingSupplyEl = container.querySelector("#kpi-awaiting-supply");
    const partiallySuppliedEl = container.querySelector("#kpi-partially-supplied");
    const suppliedEl = container.querySelector("#kpi-supplied");
    const partiallyReceivedEl = container.querySelector("#kpi-partially-received");
    const receivedEl = container.querySelector("#kpi-received");
    const completedEl = container.querySelector("#kpi-completed");
    const cancelledEl = container.querySelector("#kpi-cancelled");
    const totalValEl = container.querySelector("#kpi-total-value");

    if (totalOrdersEl) totalOrdersEl.textContent = kpis.totalOrders;
    if (openOrdersEl) openOrdersEl.textContent = kpis.openOrders;
    if (awaitingSupplyEl) awaitingSupplyEl.textContent = kpis.awaitingSupply;
    if (partiallySuppliedEl) partiallySuppliedEl.textContent = kpis.partiallySupplied;
    if (suppliedEl) suppliedEl.textContent = kpis.supplied;
    if (partiallyReceivedEl) partiallyReceivedEl.textContent = kpis.partiallyReceived;
    if (receivedEl) receivedEl.textContent = kpis.received;
    if (completedEl) completedEl.textContent = kpis.completed;
    if (cancelledEl) cancelledEl.textContent = kpis.cancelled;
    if (totalValEl) totalValEl.textContent = kpis.totalPoValueFormatted || formatCurrency(kpis.totalPoValuePaisa);

    // Populate Desktop Table
    const tableBody = container.querySelector("#orders-table-body");
    const cardsContainer = container.querySelector("#orders-card-container");
    const totalRecordsBadge = container.querySelector("#badge-total-records");

    if (totalRecordsBadge) totalRecordsBadge.textContent = `${pagination.totalRecords} Orders`;

    if (!orders || orders.length === 0) {
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="12" class="py-12 text-center text-neutral-500 font-sans">
              No purchase orders found matching your search and filter criteria.
            </td>
          </tr>
        `;
      }
      if (cardsContainer) {
        cardsContainer.innerHTML = `
          <div class="py-10 text-center text-neutral-500">
            No purchase orders found.
          </div>
        `;
      }
    } else {
      // Build Desktop Rows
      if (tableBody) {
        tableBody.innerHTML = orders
          .map((po) => {
            const poStatusBadge = getStatusBadge(po.poStatus);
            const supplyBadge = getSupplyBadge(po.supplyStatus);
            const grnBadge = getGrnBadge(po.grnStatus);
            const invoiceBadge = getInvoiceBadge(po.invoiceStatus);
            const paymentBadge = getPaymentBadge(po.paymentStatus);

            return `
              <tr class="hover:bg-neutral-800/40 transition-colors">
                <td class="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <span>${po.purchaseOrderId}</span>
                    ${po.hasRevisions ? `<span class="px-1.5 py-0.2 text-[9px] rounded bg-amber-500/20 text-amber-300 font-mono">R${po.revisionCount}</span>` : ""}
                  </div>
                </td>
                <td class="py-3 px-3 whitespace-nowrap text-neutral-300">${formatDate(po.orderDate)}</td>
                <td class="py-3 px-3">
                  <div class="font-medium text-white truncate max-w-[130px]" title="${po.cafeName}">${po.cafeName}</div>
                  <div class="text-[10px] text-neutral-500 font-mono">${po.cafeCode || po.cafeId}</div>
                </td>
                <td class="py-3 px-3 whitespace-nowrap text-amber-300/90 font-mono text-[11px]">${formatDate(po.expectedDeliveryDate)}</td>
                <td class="py-3 px-3 text-center font-mono">${po.itemCount}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-white whitespace-nowrap">${po.totalFormatted || formatCurrency(po.totalPaisa)}</td>
                <td class="py-3 px-3 whitespace-nowrap">${supplyBadge}</td>
                <td class="py-3 px-3 whitespace-nowrap">${grnBadge}</td>
                <td class="py-3 px-3 whitespace-nowrap">${invoiceBadge}</td>
                <td class="py-3 px-3 whitespace-nowrap">${paymentBadge}</td>
                <td class="py-3 px-3 whitespace-nowrap">${poStatusBadge}</td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                  <div class="flex items-center justify-center gap-1.5">
                    <button data-action="view-po" data-po-id="${po.purchaseOrderId}" class="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-lg font-semibold text-[11px] transition shadow-sm active:scale-95">
                      View
                    </button>
                    <button data-action="download-po" data-po-id="${po.purchaseOrderId}" class="p-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs transition" title="Download PDF">
                      📥
                    </button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("");
      }

      // Build Mobile Cards
      if (cardsContainer) {
        cardsContainer.innerHTML = orders
          .map((po) => {
            const poStatusBadge = getStatusBadge(po.poStatus);
            const supplyBadge = getSupplyBadge(po.supplyStatus);
            const paymentBadge = getPaymentBadge(po.paymentStatus);

            return `
              <div class="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3 shadow">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-black text-white text-sm">${po.purchaseOrderId}</span>
                    ${po.hasRevisions ? `<span class="px-1.5 py-0.2 text-[9px] rounded bg-amber-500/20 text-amber-300 font-mono">REV</span>` : ""}
                  </div>
                  <div>${poStatusBadge}</div>
                </div>

                <div class="text-xs text-neutral-300 font-medium">${po.cafeName} (${po.cafeCode || po.cafeId})</div>

                <div class="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-neutral-800/80">
                  <div>
                    <span class="text-neutral-500">Ordered:</span>
                    <span class="text-neutral-200 font-mono ml-1">${formatDate(po.orderDate)}</span>
                  </div>
                  <div>
                    <span class="text-neutral-500">Required:</span>
                    <span class="text-amber-300 font-mono ml-1">${formatDate(po.expectedDeliveryDate)}</span>
                  </div>
                  <div>
                    <span class="text-neutral-500">Items:</span>
                    <span class="text-neutral-200 font-mono ml-1">${po.itemCount}</span>
                  </div>
                  <div>
                    <span class="text-neutral-500">Value:</span>
                    <span class="text-white font-mono font-bold ml-1">${po.totalFormatted || formatCurrency(po.totalPaisa)}</span>
                  </div>
                </div>

                <div class="flex items-center gap-2 pt-2 border-t border-neutral-800/80 text-[10px]">
                  <span>Supply: ${supplyBadge}</span>
                  <span>Pay: ${paymentBadge}</span>
                </div>

                <div class="flex items-center gap-2 pt-1">
                  <button data-action="view-po" data-po-id="${po.purchaseOrderId}" class="flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-semibold text-xs transition text-center">
                    View Details
                  </button>
                  <button data-action="download-po" data-po-id="${po.purchaseOrderId}" class="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs transition">
                    📥 PDF
                  </button>
                </div>
              </div>
            `;
          })
          .join("");
      }
    }

    // Populate Pagination
    const pageStartEl = container.querySelector("#pagination-start");
    const pageEndEl = container.querySelector("#pagination-end");
    const pageTotalEl = container.querySelector("#pagination-total");
    const currentPageEl = container.querySelector("#pagination-current-page");

    const startIdx = (pagination.page - 1) * pagination.limit + 1;
    const endIdx = Math.min(pagination.totalRecords, pagination.page * pagination.limit);

    if (pageStartEl) pageStartEl.textContent = pagination.totalRecords > 0 ? startIdx : 0;
    if (pageEndEl) pageEndEl.textContent = endIdx;
    if (pageTotalEl) pageTotalEl.textContent = pagination.totalRecords;
    if (currentPageEl) currentPageEl.textContent = `Page ${pagination.page} of ${pagination.totalPages || 1}`;

    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages;
  }

  // 4. Open PO Details Modal
  async function openPoDetailsModal(purchaseOrderId) {
    if (!purchaseOrderId || !modalEl) return;
    activeModalPoId = purchaseOrderId;

    modalEl.classList.remove("hidden");

    try {
      const res = await api.get(`/api/v1/vendor/orders/${encodeURIComponent(purchaseOrderId)}`);
      if (res && res.success && res.data) {
        populateModalData(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch PO details:", err);
      alert("Failed to load purchase order details. Please try again.");
      modalEl.classList.add("hidden");
    }
  }

  // 5. Populate PO Details Modal Data
  function populateModalData(data) {
    const {
      purchaseOrderId,
      revisionCount,
      hasRevisions,
      orderDate,
      expectedDeliveryDate,
      poStatus,
      paymentTerms,
      issuedBySnapshot,
      vendor,
      delivery,
      lineItems,
      financial,
      orderedVsSuppliedVsReceived,
      shortagesAndRejections,
      timeline,
      revisions,
      relatedGrns,
      relatedInvoices,
      relatedPayments,
      linkedDocuments,
      cancellation,
    } = data;

    // Header & Badges
    const poNumEl = modalEl.querySelector("#modal-po-number");
    const revBadgeEl = modalEl.querySelector("#modal-revision-badge");
    const statusBadgeEl = modalEl.querySelector("#modal-status-badge");

    if (poNumEl) poNumEl.textContent = purchaseOrderId;
    if (revBadgeEl) {
      if (hasRevisions) {
        revBadgeEl.textContent = `REV ${String(revisionCount).padStart(2, "0")}`;
        revBadgeEl.classList.remove("hidden");
      } else {
        revBadgeEl.classList.add("hidden");
      }
    }
    if (statusBadgeEl) {
      statusBadgeEl.textContent = poStatus;
      statusBadgeEl.className = `px-2.5 py-0.5 text-xs font-bold rounded-full ${getStatusBadgeClass(poStatus)}`;
    }

    // Cancellation Notice
    const cancelBanner = modalEl.querySelector("#modal-cancellation-banner");
    const cancelReasonEl = modalEl.querySelector("#modal-cancellation-reason");
    const cancelDateEl = modalEl.querySelector("#modal-cancellation-date");

    if (cancelBanner) {
      if (cancellation?.isCancelled) {
        cancelBanner.classList.remove("hidden");
        if (cancelReasonEl) cancelReasonEl.textContent = `Reason: ${cancellation.reason || "Order requirement withdrawn."}`;
        if (cancelDateEl) cancelDateEl.textContent = `Cancelled on: ${formatDate(cancellation.cancelledAt)}`;
      } else {
        cancelBanner.classList.add("hidden");
      }
    }

    // Section 1: PO Identity
    const dtOrderDate = modalEl.querySelector("#detail-order-date");
    const dtReqDate = modalEl.querySelector("#detail-required-date");
    const dtPayTerms = modalEl.querySelector("#detail-payment-terms");
    const dtIssuedBy = modalEl.querySelector("#detail-issued-by");

    if (dtOrderDate) dtOrderDate.textContent = formatDate(orderDate);
    if (dtReqDate) dtReqDate.textContent = formatDate(expectedDeliveryDate);
    if (dtPayTerms) dtPayTerms.textContent = paymentTerms || "Net 30 Days";
    if (dtIssuedBy) dtIssuedBy.textContent = issuedBySnapshot || "MU-0001";

    // Section 2: Vendor Snapshot
    const dtVendName = modalEl.querySelector("#detail-vendor-name");
    const dtVendId = modalEl.querySelector("#detail-vendor-id");
    const dtVendGst = modalEl.querySelector("#detail-vendor-gst");
    const dtVendAddr = modalEl.querySelector("#detail-vendor-address");

    if (dtVendName) dtVendName.textContent = vendor?.name || "—";
    if (dtVendId) dtVendId.textContent = `ID: ${vendor?.vendorId || "—"}`;
    if (dtVendGst) dtVendGst.textContent = vendor?.gstNumber || "Unregistered";
    if (dtVendAddr) dtVendAddr.textContent = vendor?.billingAddress || "—";

    // Section 3: Delivery Location
    const dtCafeName = modalEl.querySelector("#detail-cafe-name");
    const dtCafeCode = modalEl.querySelector("#detail-cafe-code");
    const dtCafeAddr = modalEl.querySelector("#detail-cafe-address");
    const dtCafeContact = modalEl.querySelector("#detail-cafe-contact");
    const dtDeliveryInst = modalEl.querySelector("#detail-delivery-instructions");

    if (dtCafeName) dtCafeName.textContent = delivery?.cafeName || "—";
    if (dtCafeCode) dtCafeCode.textContent = `Code: ${delivery?.cafeCode || delivery?.cafeId || "—"}`;
    if (dtCafeAddr) dtCafeAddr.textContent = delivery?.address || "—";
    if (dtCafeContact) dtCafeContact.textContent = `${delivery?.contactPerson || "Store In-Charge"} (${delivery?.contactPhone || "Active"})`;
    if (dtDeliveryInst) dtDeliveryInst.textContent = `Instructions: ${delivery?.instructions || "Standard intake bay"}`;

    // Section 4: Line Items Table
    const itemsTbody = modalEl.querySelector("#detail-items-table-body");
    const itemCountBadge = modalEl.querySelector("#detail-item-count");

    if (itemCountBadge) itemCountBadge.textContent = `${lineItems?.length || 0} Lines`;

    if (itemsTbody) {
      itemsTbody.innerHTML = (lineItems || [])
        .map(
          (li) => `
          <tr class="hover:bg-neutral-900/60">
            <td class="py-2.5 px-3 text-neutral-500">${li.lineNumber}</td>
            <td class="py-2.5 px-3 font-sans">
              <div class="font-bold text-white">${li.itemName}</div>
              <div class="text-[10px] text-neutral-400 font-mono">${li.itemId} ${li.supplierItemCode ? `• Sup: ${li.supplierItemCode}` : ""}</div>
              ${li.specification ? `<div class="text-[10px] text-neutral-500 mt-0.5">${li.specification}</div>` : ""}
            </td>
            <td class="py-2.5 px-3 text-neutral-400">${li.hsnSac || "0401"}</td>
            <td class="py-2.5 px-3 text-neutral-300 font-sans">${li.packSize || "1 UNIT"} (${li.baseUnit})</td>
            <td class="py-2.5 px-3 text-right font-bold text-white">${li.orderedQuantity}</td>
            <td class="py-2.5 px-3 text-right text-neutral-300">${li.unitPriceFormatted || formatCurrency(li.unitPricePaisa)}</td>
            <td class="py-2.5 px-3 text-right text-rose-400">${li.discountPaisa > 0 ? `-${formatCurrency(li.discountPaisa)}` : "—"}</td>
            <td class="py-2.5 px-3 text-right text-neutral-400">${li.taxRatePercent}%</td>
            <td class="py-2.5 px-4 text-right font-bold text-white">${li.lineTotalFormatted || formatCurrency(li.lineTotalPaisa)}</td>
          </tr>
        `
        )
        .join("");
    }

    // Financial Breakdown
    const dtSubtotal = modalEl.querySelector("#detail-subtotal");
    const dtDiscount = modalEl.querySelector("#detail-discount");
    const dtTaxable = modalEl.querySelector("#detail-taxable");
    const dtCgst = modalEl.querySelector("#detail-cgst");
    const dtSgst = modalEl.querySelector("#detail-sgst");
    const dtGrandTotal = modalEl.querySelector("#detail-grand-total");

    if (dtSubtotal) dtSubtotal.textContent = financial?.subtotalFormatted || formatCurrency(financial?.subtotalPaisa);
    if (dtDiscount) dtDiscount.textContent = financial?.discountPaisa > 0 ? `-${financial?.discountFormatted || formatCurrency(financial?.discountPaisa)}` : "₹0";
    if (dtTaxable) dtTaxable.textContent = financial?.taxableAmountFormatted || formatCurrency(financial?.taxableAmountPaisa);
    if (dtCgst) dtCgst.textContent = financial?.cgstFormatted || formatCurrency(financial?.cgstPaisa);
    if (dtSgst) dtSgst.textContent = financial?.sgstFormatted || formatCurrency(financial?.sgstPaisa);
    if (dtGrandTotal) dtGrandTotal.textContent = financial?.grandTotalFormatted || formatCurrency(financial?.grandTotalPaisa);

    // Section 5: Ordered vs Supplied vs Received Reconciliation Table
    const reconTbody = modalEl.querySelector("#detail-reconciliation-table-body");
    if (reconTbody) {
      reconTbody.innerHTML = (orderedVsSuppliedVsReceived || [])
        .map(
          (rec) => `
          <tr class="hover:bg-neutral-900/60">
            <td class="py-2.5 px-3 font-sans">
              <span class="font-bold text-white">${rec.itemName}</span>
              <span class="text-neutral-500 font-mono text-[10px] ml-1.5">[${rec.unit}]</span>
            </td>
            <td class="py-2.5 px-3 text-right text-neutral-200">${rec.ordered}</td>
            <td class="py-2.5 px-3 text-right text-indigo-400">${rec.supplied}</td>
            <td class="py-2.5 px-3 text-right text-neutral-200">${rec.received}</td>
            <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">${rec.accepted}</td>
            <td class="py-2.5 px-3 text-right ${rec.rejected > 0 ? "text-rose-400 font-bold" : "text-neutral-500"}">${rec.rejected}</td>
            <td class="py-2.5 px-4 text-right ${rec.pending > 0 ? "text-amber-400 font-bold" : "text-neutral-500"}">${rec.pending}</td>
          </tr>
        `
        )
        .join("");
    }

    // Section 6: Shortages & Rejections
    const shortagesSection = modalEl.querySelector("#detail-shortages-section");
    const shortagesTbody = modalEl.querySelector("#detail-shortages-table-body");

    if (shortagesAndRejections && shortagesAndRejections.length > 0) {
      shortagesSection?.classList.remove("hidden");
      if (shortagesTbody) {
        shortagesTbody.innerHTML = shortagesAndRejections
          .map(
            (sh) => `
            <tr class="hover:bg-rose-950/10">
              <td class="py-2.5 px-3 font-bold text-white">${sh.itemName}</td>
              <td class="py-2.5 px-3 text-right font-mono text-rose-400 font-bold">${sh.rejectedQuantity || 0}</td>
              <td class="py-2.5 px-3 text-right font-mono text-amber-400 font-bold">${sh.missingQuantity || 0}</td>
              <td class="py-2.5 px-3 text-neutral-300">
                <div>${sh.description}</div>
                <div class="text-[10px] text-neutral-500 font-mono">${sh.reasonCode}</div>
              </td>
              <td class="py-2.5 px-3 font-mono text-neutral-400">${formatDate(sh.date)}</td>
              <td class="py-2.5 px-3 font-mono text-neutral-300">${sh.grnId || "—"}</td>
            </tr>
          `
          )
          .join("");
      }
    } else {
      shortagesSection?.classList.add("hidden");
    }

    // Section 7: 8-Stage Timeline Milestones
    const timelineContainer = modalEl.querySelector("#detail-lifecycle-timeline");
    if (timelineContainer && Array.isArray(timeline)) {
      timelineContainer.innerHTML = timeline
        .map(
          (step, idx) => `
          <div class="flex flex-col items-center text-center p-2 rounded-xl border ${step.completed ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300" : "bg-neutral-950/40 border-neutral-800 text-neutral-600"}">
            <div class="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${step.completed ? "bg-emerald-500 text-black" : "bg-neutral-800 text-neutral-500"}">
              ${step.completed ? "✓" : idx + 1}
            </div>
            <div class="text-[10px] font-bold mt-1.5 leading-tight">${step.label}</div>
            ${step.timestamp ? `<div class="text-[9px] text-neutral-400 font-mono mt-0.5">${formatDate(step.timestamp)}</div>` : ""}
          </div>
        `
        )
        .join("");
    }

    // Section 8: Revisions History
    const revisionsSection = modalEl.querySelector("#detail-revisions-section");
    const revisionsList = modalEl.querySelector("#detail-revisions-list");

    if (revisions && revisions.length > 0) {
      revisionsSection?.classList.remove("hidden");
      if (revisionsList) {
        revisionsList.innerHTML = revisions
          .map(
            (rev) => `
            <div class="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-start justify-between gap-3 text-xs">
              <div>
                <span class="font-mono font-bold text-amber-300">Revision ${String(rev.revisionNumber).padStart(2, "0")}</span>
                <span class="text-neutral-400 ml-2">${rev.reason}</span>
                <div class="text-neutral-500 text-[11px] mt-0.5">${rev.changesSummary}</div>
              </div>
              <span class="font-mono text-neutral-500 text-[11px] whitespace-nowrap">${formatDate(rev.date)}</span>
            </div>
          `
          )
          .join("");
      }
    } else {
      revisionsSection?.classList.add("hidden");
    }

    // Section 9: Related GRNs
    const grnList = modalEl.querySelector("#detail-grn-list");
    if (grnList) {
      if (relatedGrns && relatedGrns.length > 0) {
        grnList.innerHTML = relatedGrns
          .map(
            (g) => `
            <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between">
              <div>
                <div class="font-bold text-white">${g.grnId}</div>
                <div class="text-[10px] text-neutral-400 font-sans">Delivered: ${g.receivedQuantity} | Accepted: ${g.acceptedQuantity}</div>
              </div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${g.status === "ACCEPTED" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}">${g.status}</span>
            </div>
          `
          )
          .join("");
      } else {
        grnList.innerHTML = `<p class="text-neutral-500 font-sans">No GRN recorded yet.</p>`;
      }
    }

    // Section 10: Related Invoices
    const invList = modalEl.querySelector("#detail-invoice-list");
    if (invList) {
      if (relatedInvoices && relatedInvoices.length > 0) {
        invList.innerHTML = relatedInvoices
          .map(
            (inv) => `
            <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between">
              <div>
                <div class="font-bold text-white">${inv.invoiceNumber}</div>
                <div class="text-[10px] text-neutral-400 font-sans">Total: ${inv.totalFormatted}</div>
              </div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${inv.status === "PAID" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}">${inv.status}</span>
            </div>
          `
          )
          .join("");
      } else {
        invList.innerHTML = `<p class="text-neutral-500 font-sans">No invoice submitted yet.</p>`;
      }
    }

    // Section 11: Related Payments
    const payList = modalEl.querySelector("#detail-payment-list");
    if (payList) {
      if (relatedPayments && relatedPayments.length > 0) {
        payList.innerHTML = relatedPayments
          .map(
            (pay) => `
            <div class="p-2 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between">
              <div>
                <div class="font-bold text-white">${pay.paymentId}</div>
                <div class="text-[10px] text-neutral-400 font-sans">${pay.paymentMethod} • Ref: ${pay.reference}</div>
              </div>
              <span class="font-bold text-emerald-400">${pay.amountFormatted}</span>
            </div>
          `
          )
          .join("");
      } else {
        payList.innerHTML = `<p class="text-neutral-500 font-sans">No payment has yet been recorded against this order/invoice.</p>`;
      }
    }

    // Section 12: Linked Documents
    const docsList = modalEl.querySelector("#detail-documents-list");
    if (docsList) {
      if (linkedDocuments && linkedDocuments.length > 0) {
        docsList.innerHTML = linkedDocuments
          .map(
            (doc) => `
            <div class="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center gap-3">
              <span class="text-lg">📄</span>
              <div>
                <div class="font-bold text-white text-xs">${doc.title}</div>
                <div class="text-[10px] text-neutral-500 font-mono">${doc.filename || doc.referenceNumber || "Document"}</div>
              </div>
              ${
                doc.url
                  ? `<button data-action="download-doc" data-url="${doc.url}" data-filename="${doc.filename}" class="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg transition ml-2">📥 Download</button>`
                  : ""
              }
            </div>
          `
          )
          .join("");
      }
    }
  }

  // 6. Download PO PDF Helper
  async function downloadOrderPdf(purchaseOrderId) {
    if (!purchaseOrderId) return;
    try {
      const url = `/api/v1/vendor/orders/${encodeURIComponent(purchaseOrderId)}/pdf`;
      const filename = `PurchaseOrder-${purchaseOrderId}.pdf`;
      await downloadBlob(url, filename);
    } catch (err) {
      console.error("PDF download error:", err);
      alert("Failed to download Purchase Order PDF.");
    }
  }

  // 7. Event Handlers & Delegation
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => fetchOrders());
  }

  if (cafeSelect) {
    cafeSelect.addEventListener("change", (e) => {
      currentSelectedCafe = e.target.value;
      currentPage = 1;
      fetchOrders();
    });
  }

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearchTerm = e.target.value;
        currentPage = 1;
        fetchOrders();
      }, 350);
    });
  }

  // Timeline pills
  if (datePillsContainer) {
    datePillsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".pill-btn");
      if (!btn) return;

      datePillsContainer.querySelectorAll(".pill-btn").forEach((b) => {
        b.className = "pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition";
      });
      btn.className = "pill-btn px-2.5 py-1 text-xs rounded-lg bg-primary-600 text-white font-bold transition shadow-sm";

      currentSelectedDateRange = btn.dataset.range;
      currentPage = 1;

      if (currentSelectedDateRange === "custom") {
        customDateRow?.classList.remove("hidden");
      } else {
        customDateRow?.classList.add("hidden");
        fetchOrders();
      }
    });
  }

  if (customStartInput && customEndInput) {
    const onCustomDateChange = () => {
      if (customStartInput.value && customEndInput.value) {
        currentPage = 1;
        fetchOrders();
      }
    };
    customStartInput.addEventListener("change", onCustomDateChange);
    customEndInput.addEventListener("change", onCustomDateChange);
  }

  // KPI card quick filter clicks
  const kpiSection = container.querySelector("section[aria-label='Purchase Order Summary KPIs']");
  if (kpiSection) {
    kpiSection.addEventListener("click", (e) => {
      const card = e.target.closest(".kpi-card");
      if (!card) return;

      const filterStatus = card.dataset.filterStatus;
      if (filterStatus) {
        currentSelectedPoStatus = filterStatus;
        if (poStatusSelect) poStatusSelect.value = filterStatus;
        currentPage = 1;
        fetchOrders();
      }
    });
  }

  // PO status select
  if (poStatusSelect) {
    poStatusSelect.addEventListener("change", (e) => {
      currentSelectedPoStatus = e.target.value;
      currentPage = 1;
      fetchOrders();
    });
  }

  // Clear filters
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      currentSelectedCafe = "ALL";
      currentSelectedPoStatus = "ALL";
      currentSelectedDateRange = "30days";
      currentSearchTerm = "";
      currentPage = 1;

      if (cafeSelect) cafeSelect.value = "ALL";
      if (searchInput) searchInput.value = "";
      if (poStatusSelect) poStatusSelect.value = "ALL";
      if (supplyStatusSelect) supplyStatusSelect.value = "ALL";
      if (grnStatusSelect) grnStatusSelect.value = "ALL";
      if (invoiceStatusSelect) invoiceStatusSelect.value = "ALL";
      if (paymentStatusSelect) paymentStatusSelect.value = "ALL";

      if (datePillsContainer) {
        datePillsContainer.querySelectorAll(".pill-btn").forEach((b) => {
          b.className = b.dataset.range === "30days"
            ? "pill-btn px-2.5 py-1 text-xs rounded-lg bg-primary-600 text-white font-bold transition shadow-sm"
            : "pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition";
        });
      }
      customDateRow?.classList.add("hidden");

      fetchOrders();
    });
  }

  // Pagination clicks
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        fetchOrders();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      currentPage++;
      fetchOrders();
    });
  }

  // Action clicks inside table or cards (View / Download)
  container.addEventListener("click", (e) => {
    const viewBtn = e.target.closest("button[data-action='view-po']");
    if (viewBtn) {
      const poId = viewBtn.dataset.poId;
      if (poId) openPoDetailsModal(poId);
      return;
    }

    const dlBtn = e.target.closest("button[data-action='download-po']");
    if (dlBtn) {
      const poId = dlBtn.dataset.poId;
      if (poId) downloadOrderPdf(poId);
      return;
    }

    const docDlBtn = e.target.closest("button[data-action='download-doc']");
    if (docDlBtn) {
      const url = docDlBtn.dataset.url;
      const fn = docDlBtn.dataset.filename || "document.pdf";
      if (url) downloadBlob(url, fn);
      return;
    }
  });

  // Modal close handlers
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => modalEl?.classList.add("hidden"));
  }
  if (modalCloseFooterBtn) {
    modalCloseFooterBtn.addEventListener("click", () => modalEl?.classList.add("hidden"));
  }
  if (modalEl) {
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) modalEl.classList.add("hidden");
    });
  }

  // Modal Download PDF
  if (modalDownloadPdfBtn) {
    modalDownloadPdfBtn.addEventListener("click", () => {
      if (activeModalPoId) downloadOrderPdf(activeModalPoId);
    });
  }

  // Modal Print PO
  if (modalPrintPoBtn) {
    modalPrintPoBtn.addEventListener("click", () => {
      window.print();
    });
  }

  // Initial load
  fetchVendorMetadata();
  fetchOrders();
}

// ── Badge Helpers ────────────────────────────────────────────────────────────
function getStatusBadge(status) {
  const cls = getStatusBadgeClass(status);
  return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full ${cls}">${status || "UNKNOWN"}</span>`;
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "APPROVED":
    case "ORDER_PLACED":
    case "ORDERED":
      return "bg-blue-950/80 text-blue-300 border border-blue-800/60";
    case "ACKNOWLEDGED":
    case "DISPATCHED":
      return "bg-indigo-950/80 text-indigo-300 border border-indigo-800/60";
    case "PARTIALLY_RECEIVED":
      return "bg-purple-950/80 text-purple-300 border border-purple-800/60";
    case "RECEIVED":
    case "VERIFIED_PENDING_MASTER_APPROVAL":
    case "RECEIVED_PENDING_FINAL_POSTING":
      return "bg-teal-950/80 text-teal-300 border border-teal-800/60";
    case "CLOSED":
      return "bg-emerald-950/80 text-emerald-300 border border-emerald-800/60";
    case "CANCELLED":
      return "bg-rose-950/80 text-rose-300 border border-rose-800/60";
    default:
      return "bg-neutral-800 text-neutral-300 border border-neutral-700";
  }
}

function getSupplyBadge(status) {
  switch (status) {
    case "Awaiting":
      return `<span class="text-amber-400 font-medium">⏳ Awaiting</span>`;
    case "Partial":
      return `<span class="text-orange-400 font-medium">📦 Partial</span>`;
    case "Supplied":
      return `<span class="text-indigo-400 font-medium">🚚 Supplied</span>`;
    case "Received":
    case "Fulfilled":
      return `<span class="text-emerald-400 font-medium">✓ Received</span>`;
    case "Cancelled":
      return `<span class="text-rose-400 font-medium">✕ Cancelled</span>`;
    default:
      return `<span class="text-neutral-400 font-medium">—</span>`;
  }
}

function getGrnBadge(status) {
  switch (status) {
    case "Completed":
    case "Verified":
      return `<span class="text-emerald-400 font-medium">✓ Verified</span>`;
    case "Partial":
      return `<span class="text-purple-400 font-medium">◐ Partial</span>`;
    case "Pending":
      return `<span class="text-amber-400 font-medium">⏱ Pending</span>`;
    default:
      return `<span class="text-neutral-500 font-medium">— None</span>`;
  }
}

function getInvoiceBadge(status) {
  switch (status) {
    case "Approved":
      return `<span class="text-emerald-400 font-medium">✓ Approved</span>`;
    case "Recorded":
      return `<span class="text-blue-400 font-medium">📄 Recorded</span>`;
    default:
      return `<span class="text-neutral-500 font-medium">— Unbilled</span>`;
  }
}

function getPaymentBadge(status) {
  switch (status) {
    case "Settled":
      return `<span class="text-emerald-400 font-bold">✓ Settled</span>`;
    case "Partially Paid":
      return `<span class="text-indigo-400 font-bold">◐ Partial</span>`;
    case "Overdue":
      return `<span class="text-rose-400 font-bold">⚠️ Overdue</span>`;
    case "Pending":
      return `<span class="text-amber-400 font-medium">⏳ Pending</span>`;
    default:
      return `<span class="text-neutral-500 font-medium">—</span>`;
  }
}

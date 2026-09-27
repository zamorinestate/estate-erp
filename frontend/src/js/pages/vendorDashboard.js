// =============================================================================
// ZAMORIN CAFE ERP — VEN-SCR-001: VENDOR DASHBOARD
//
// Complete, responsive, read-only operational and commercial visibility dashboard.
// Answers the five core vendor questions immediately:
// 1. What has been ordered from us?
// 2. What has been supplied?
// 3. What has been received by the café?
// 4. How much have we been paid?
// 5. How much is still receivable?
//
// Security & Architectural Guarantees:
// - Strictly READ-ONLY: zero mutation controls or business write actions.
// - Authoritative backend numbers derived from APInvoice, PurchaseOrder & Ledger.
// - Multi-café scoping strictly constrained to Vendor.approvedCafeIds.
// - Mobile-first responsive card transformation for tables on small viewports.
// - Accessible, high-contrast typography and subtle glassmorphic elevation.
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentDashboardData = null;
let currentSelectedCafe = "ALL";
let currentSelectedDateRange = "30days";
let currentOrderFilter = "ALL";

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

export function renderVendorDashboard() {
  return `
    <div id="vendor-dashboard-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg border border-amber-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-300">READ-ONLY VENDOR ACCESS</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-amber-500/20 text-amber-200 border border-amber-500/40">VISIBILITY PORTAL</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Information displayed here is authoritative and maintained by Zamorin Café ERP. Business data mutation is disabled.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-refresh-dashboard" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
            <span class="refresh-icon">🔄</span> Refresh
          </button>
        </div>
      </div>

      <!-- HEADER & CONTROL BAR -->
      <header class="vendor-header bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2.5 text-xs font-semibold text-primary-400 uppercase tracking-widest">
            <span>Zamorin Café ERP</span>
            <span class="text-neutral-600">•</span>
            <span>Vendor Workspace</span>
          </div>
          <h1 id="vendor-company-name" class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">Loading Vendor Portal...</h1>
          <div class="flex flex-wrap items-center gap-3 mt-2 text-xs text-neutral-400">
            <span class="flex items-center gap-1.5 bg-neutral-800/80 px-2.5 py-1 rounded-md border border-neutral-700/60 font-mono">
              <span class="text-neutral-500">ID:</span> <strong id="vendor-id-badge" class="text-neutral-200">—</strong>
            </span>
            <span id="vendor-category-badge" class="px-2.5 py-1 rounded-md bg-primary-950/60 text-primary-300 border border-primary-800/50 uppercase font-semibold text-[11px]">—</span>
            <span id="vendor-gst-badge" class="hidden sm:inline-flex px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono">—</span>
          </div>
        </div>

        <!-- FILTERS: CAFÉ & DATE SCOPE -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- CAFÉ SELECTOR -->
          <div class="flex flex-col gap-1 min-w-[190px]">
            <label for="select-cafe-scope" class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Café Filter</label>
            <select id="select-cafe-scope" class="bg-neutral-950 border border-neutral-700 text-neutral-100 text-xs rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all cursor-pointer">
              <option value="ALL">All Authorised Cafés</option>
            </select>
          </div>

          <!-- DATE RANGE SELECTOR -->
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Timeline Filter</label>
            <div id="date-range-pills" class="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl p-1 gap-1">
              <button data-range="today" class="pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition">Today</button>
              <button data-range="7days" class="pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition">7 Days</button>
              <button data-range="30days" class="pill-btn px-2.5 py-1 text-xs rounded-lg bg-primary-600 text-white font-bold transition shadow-sm">30 Days</button>
              <button data-range="this_month" class="pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition">This Month</button>
              <button data-range="this_fy" class="pill-btn px-2.5 py-1 text-xs rounded-lg text-neutral-400 hover:text-white transition">This FY</button>
            </div>
          </div>
        </div>
      </header>

      <!-- SECTION B: FINANCIAL SUMMARY — THE MONEY ROW -->
      <section aria-label="Financial Summary">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
          
          <!-- TOTAL ORDER VALUE -->
          <div class="stat-card group bg-gradient-to-br from-neutral-900 to-neutral-900/90 border border-neutral-800 hover:border-primary-500/40 rounded-2xl p-4 sm:p-5 shadow-lg transition-all hover:-translate-y-0.5">
            <div class="flex items-center justify-between text-neutral-400 text-xs font-semibold uppercase tracking-wider">
              <span>Total Order Value</span>
              <span class="text-base group-hover:scale-110 transition-transform">📦</span>
            </div>
            <div id="stat-order-value" class="text-xl sm:text-2xl font-extrabold text-white mt-2 font-mono">₹0</div>
            <p class="text-[11px] text-neutral-500 mt-1">Total approved orders</p>
          </div>

          <!-- TOTAL INVOICED -->
          <div class="stat-card group bg-gradient-to-br from-neutral-900 to-neutral-900/90 border border-neutral-800 hover:border-indigo-500/40 rounded-2xl p-4 sm:p-5 shadow-lg transition-all hover:-translate-y-0.5">
            <div class="flex items-center justify-between text-neutral-400 text-xs font-semibold uppercase tracking-wider">
              <span>Total Invoiced</span>
              <span class="text-base group-hover:scale-110 transition-transform">📄</span>
            </div>
            <div id="stat-invoiced" class="text-xl sm:text-2xl font-extrabold text-white mt-2 font-mono">₹0</div>
            <p class="text-[11px] text-neutral-500 mt-1">Recorded bill liabilities</p>
          </div>

          <!-- TOTAL PAID -->
          <div class="stat-card group bg-gradient-to-br from-neutral-900 to-neutral-900/90 border border-neutral-800 hover:border-emerald-500/40 rounded-2xl p-4 sm:p-5 shadow-lg transition-all hover:-translate-y-0.5">
            <div class="flex items-center justify-between text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <span>Total Paid</span>
              <span class="text-base group-hover:scale-110 transition-transform">✅</span>
            </div>
            <div id="stat-paid" class="text-xl sm:text-2xl font-extrabold text-emerald-400 mt-2 font-mono">₹0</div>
            <p class="text-[11px] text-neutral-500 mt-1">Disbursed settlements</p>
          </div>

          <!-- BALANCE RECEIVABLE -->
          <div class="stat-card group bg-gradient-to-br from-neutral-900 to-neutral-900/90 border border-sky-500/30 hover:border-sky-400 rounded-2xl p-4 sm:p-5 shadow-lg transition-all hover:-translate-y-0.5 ring-1 ring-sky-500/20">
            <div class="flex items-center justify-between text-sky-400 text-xs font-semibold uppercase tracking-wider">
              <span>Balance Receivable</span>
              <span class="text-base group-hover:scale-110 transition-transform">⏳</span>
            </div>
            <div id="stat-receivable" class="text-xl sm:text-2xl font-extrabold text-sky-300 mt-2 font-mono">₹0</div>
            <p class="text-[11px] text-neutral-500 mt-1">Current pending payable</p>
          </div>

          <!-- OVERDUE -->
          <div class="stat-card group col-span-2 sm:col-span-1 bg-gradient-to-br from-neutral-900 to-neutral-900/90 border border-rose-500/30 hover:border-rose-400 rounded-2xl p-4 sm:p-5 shadow-lg transition-all hover:-translate-y-0.5 ring-1 ring-rose-500/20">
            <div class="flex items-center justify-between text-rose-400 text-xs font-semibold uppercase tracking-wider">
              <span>Overdue</span>
              <span class="text-base group-hover:scale-110 transition-transform">⚠️</span>
            </div>
            <div id="stat-overdue" class="text-xl sm:text-2xl font-extrabold text-rose-400 mt-2 font-mono">₹0</div>
            <p class="text-[11px] text-neutral-500 mt-1">Past applicable due date</p>
          </div>

        </div>
      </section>

      <!-- SECTION C: ORDER SUMMARY -->
      <section aria-label="Order Status Overview" class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>📋 Order Summary</span>
              <span class="text-xs font-normal text-neutral-400">(Click a card to filter records)</span>
            </h2>
          </div>
          <span class="text-xs font-semibold text-neutral-500">Commercial Pipeline</span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3 text-center">
          
          <button data-filter="ALL" class="order-filter-card p-3 rounded-xl border border-neutral-700 bg-neutral-950/70 hover:border-primary-500 transition-all text-left">
            <span class="text-[11px] text-neutral-400 uppercase font-semibold block">Total Orders</span>
            <span id="order-count-total" class="text-lg font-bold text-white mt-1 block">0</span>
          </button>

          <button data-filter="OPEN" class="order-filter-card p-3 rounded-xl border border-neutral-800 bg-neutral-950/70 hover:border-sky-500 transition-all text-left">
            <span class="text-[11px] text-sky-400 uppercase font-semibold block">New / Open</span>
            <span id="order-count-open" class="text-lg font-bold text-sky-300 mt-1 block">0</span>
          </button>

          <button data-filter="IN_PROGRESS" class="order-filter-card p-3 rounded-xl border border-neutral-800 bg-neutral-950/70 hover:border-amber-500 transition-all text-left">
            <span class="text-[11px] text-amber-400 uppercase font-semibold block">In Progress</span>
            <span id="order-count-inprogress" class="text-lg font-bold text-amber-300 mt-1 block">0</span>
          </button>

          <button data-filter="SUPPLIED" class="order-filter-card p-3 rounded-xl border border-neutral-800 bg-neutral-950/70 hover:border-indigo-500 transition-all text-left">
            <span class="text-[11px] text-indigo-400 uppercase font-semibold block">Supplied</span>
            <span id="order-count-supplied" class="text-lg font-bold text-indigo-300 mt-1 block">0</span>
          </button>

          <button data-filter="PARTIAL" class="order-filter-card p-3 rounded-xl border border-neutral-800 bg-neutral-950/70 hover:border-yellow-500 transition-all text-left">
            <span class="text-[11px] text-yellow-400 uppercase font-semibold block">Part-Supplied</span>
            <span id="order-count-partial" class="text-lg font-bold text-yellow-300 mt-1 block">0</span>
          </button>

          <button data-filter="COMPLETED" class="order-filter-card p-3 rounded-xl border border-neutral-800 bg-neutral-950/70 hover:border-emerald-500 transition-all text-left">
            <span class="text-[11px] text-emerald-400 uppercase font-semibold block">Completed</span>
            <span id="order-count-completed" class="text-lg font-bold text-emerald-300 mt-1 block">0</span>
          </button>

          <button data-filter="CANCELLED" class="order-filter-card p-3 rounded-xl border border-neutral-800 bg-neutral-950/70 hover:border-rose-500 transition-all text-left">
            <span class="text-[11px] text-rose-400 uppercase font-semibold block">Cancelled</span>
            <span id="order-count-cancelled" class="text-lg font-bold text-rose-300 mt-1 block">0</span>
          </button>

        </div>
      </section>

      <!-- SECTION D: SUPPLY & DELIVERY SUMMARY -->
      <section aria-label="Supply and Delivery Operational Status" class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span>🚚 Supply / Delivery Summary</span>
          </h2>
          <span class="text-xs text-neutral-400">Physical Inflow & Verification</span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center">
          <div class="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80">
            <span class="text-[10px] uppercase font-bold text-neutral-400 block">Awaiting Supply</span>
            <span id="sd-awaiting" class="text-base font-bold text-neutral-200 mt-1 block">0</span>
          </div>
          <div class="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80">
            <span class="text-[10px] uppercase font-bold text-sky-400 block">Expected Today</span>
            <span id="sd-expected-today" class="text-base font-bold text-sky-300 mt-1 block">0</span>
          </div>
          <div class="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80">
            <span class="text-[10px] uppercase font-bold text-yellow-400 block">Partially Supplied</span>
            <span id="sd-part-supplied" class="text-base font-bold text-yellow-300 mt-1 block">0</span>
          </div>
          <div class="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80">
            <span class="text-[10px] uppercase font-bold text-indigo-400 block">Supplied</span>
            <span id="sd-supplied" class="text-base font-bold text-indigo-300 mt-1 block">0</span>
          </div>
          <div class="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80">
            <span class="text-[10px] uppercase font-bold text-teal-400 block">Received by Café</span>
            <span id="sd-received-cafe" class="text-base font-bold text-teal-300 mt-1 block">0</span>
          </div>
          <div class="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80">
            <span class="text-[10px] uppercase font-bold text-rose-400 block">Short / Rej Qty</span>
            <span id="sd-short-rej" class="text-base font-bold text-rose-300 mt-1 block">0</span>
          </div>
          <div class="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80">
            <span class="text-[10px] uppercase font-bold text-amber-400 block">Pending GRN</span>
            <span id="sd-pending-grn" class="text-base font-bold text-amber-300 mt-1 block">0</span>
          </div>
          <div class="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80">
            <span class="text-[10px] uppercase font-bold text-emerald-400 block">GRN Completed</span>
            <span id="sd-grn-done" class="text-base font-bold text-emerald-300 mt-1 block">0</span>
          </div>
        </div>
      </section>

      <!-- TWO-COLUMN GRID: RECENT ORDERS & OUTSTANDING AGEING -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

        <!-- SECTION F: RECENT PURCHASE ORDERS (COL 7) -->
        <div class="lg:col-span-7 bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-base font-bold text-white flex items-center gap-2">
                  <span>📦 Recent Purchase Orders</span>
                </h3>
                <p class="text-xs text-neutral-400">Latest orders placed with your business</p>
              </div>
              <span id="badge-active-order-filter" class="text-[11px] font-semibold text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded">All Orders</span>
            </div>

            <!-- TABLE OR CARD CONTAINER -->
            <div id="recent-orders-list" class="space-y-3">
              <div class="text-center py-8 text-neutral-500 text-sm">Loading purchase orders...</div>
            </div>
          </div>
        </div>

        <!-- SECTION E: OUTSTANDING PAYMENTS & AGEING (COL 5) -->
        <div class="lg:col-span-5 bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col justify-between space-y-5">
          <div>
            <div class="flex items-center justify-between mb-3">
              <div>
                <h3 class="text-base font-bold text-white flex items-center gap-2">
                  <span>💰 Outstanding Payments</span>
                </h3>
                <p class="text-xs text-neutral-400">Aging schedule & receivable health</p>
              </div>
            </div>

            <div class="p-4 rounded-xl bg-gradient-to-r from-sky-950/40 via-neutral-950 to-neutral-950 border border-sky-500/30 flex items-center justify-between mb-4">
              <div>
                <span class="text-xs text-neutral-400 uppercase font-semibold">Total Amount Receivable</span>
                <div id="ageing-total-receivable" class="text-2xl font-extrabold text-sky-300 font-mono mt-0.5">₹0</div>
              </div>
              <div class="text-right">
                <span class="text-[11px] text-rose-400 uppercase font-semibold block">Total Overdue</span>
                <span id="ageing-total-overdue" class="text-sm font-bold text-rose-400 font-mono">₹0</span>
              </div>
            </div>

            <!-- AGEING BREAKDOWN TABLE -->
            <div class="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/60">
              <table class="w-full text-left text-xs">
                <thead class="bg-neutral-800/60 text-neutral-300 font-bold border-b border-neutral-800">
                  <tr>
                    <th class="py-2.5 px-3">Age Bucket</th>
                    <th class="py-2.5 px-3 text-right">Amount</th>
                    <th class="py-2.5 px-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody id="ageing-table-body" class="divide-y divide-neutral-800/60 text-neutral-300">
                  <tr><td colspan="3" class="py-4 text-center text-neutral-500">Calculating aging...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="pt-2 border-t border-neutral-800 flex items-center justify-between">
            <span class="text-xs text-neutral-400">Authoritative Subledger</span>
            <button id="btn-view-statement" class="text-xs font-bold text-primary-400 hover:text-primary-300 transition flex items-center gap-1">
              View Full Statement →
            </button>
          </div>
        </div>

      </div>

      <!-- TWO-COLUMN GRID: RECENT PAYMENTS & PENDING RECEIVABLES -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

        <!-- SECTION G: RECENT PAYMENTS (COL 6) -->
        <div class="lg:col-span-6 bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-base font-bold text-white flex items-center gap-2">
                  <span>💳 Recent Payments</span>
                </h3>
                <p class="text-xs text-neutral-400">Latest bank transfers & settlements</p>
              </div>
            </div>

            <div id="recent-payments-list" class="space-y-3">
              <div class="text-center py-6 text-neutral-500 text-sm">Loading payment history...</div>
            </div>
          </div>
        </div>

        <!-- SECTION H: PENDING RECEIVABLES (COL 6) -->
        <div class="lg:col-span-6 bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-base font-bold text-white flex items-center gap-2">
                  <span>🧾 Pending Receivables</span>
                </h3>
                <p class="text-xs text-neutral-400">Invoices awaiting settlement</p>
              </div>
            </div>

            <div id="pending-receivables-list" class="space-y-3">
              <div class="text-center py-6 text-neutral-500 text-sm">Loading pending receivables...</div>
            </div>
          </div>
        </div>

      </div>

      <!-- SECTION I: RECENT DELIVERY / GRN TIMELINE & SECTION J: EXCEPTIONS -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

        <!-- SECTION I: RECENT DELIVERY / GRN TIMELINE (COL 8) -->
        <div class="lg:col-span-8 bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                <span>⏱️ Recent Delivery / GRN Status Timeline</span>
              </h3>
              <p id="timeline-subtitle" class="text-xs text-neutral-400">Live order milestone progression</p>
            </div>
            <span id="timeline-po-badge" class="px-2.5 py-1 text-xs font-mono font-bold rounded bg-neutral-800 text-neutral-200 border border-neutral-700">—</span>
          </div>

          <div id="timeline-stepper-container" class="py-4">
            <div class="text-center py-6 text-neutral-500 text-sm">Loading milestone timeline...</div>
          </div>
        </div>

        <!-- SECTION J: RETURNS / REJECTIONS / ADJUSTMENTS (COL 4) -->
        <div class="lg:col-span-4 bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl space-y-4">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>⚠️ Returns & Adjustments</span>
            </h3>
            <p class="text-xs text-neutral-400">Exceptions and commercial debits</p>
          </div>

          <div class="grid grid-cols-2 gap-3 text-center">
            <div class="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
              <span class="text-[10px] uppercase font-bold text-neutral-400 block">Goods Returns</span>
              <span id="exc-returns" class="text-lg font-extrabold text-neutral-200 mt-1 block">0</span>
            </div>
            <div class="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
              <span class="text-[10px] uppercase font-bold text-neutral-400 block">Discrepancies</span>
              <span id="exc-discrepancies" class="text-lg font-extrabold text-amber-400 mt-1 block">0</span>
            </div>
            <div class="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
              <span class="text-[10px] uppercase font-bold text-neutral-400 block">Debit Notes</span>
              <span id="exc-debit-notes" class="text-sm font-extrabold text-rose-400 mt-1 font-mono block">₹0</span>
            </div>
            <div class="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
              <span class="text-[10px] uppercase font-bold text-neutral-400 block">Credit Notes</span>
              <span id="exc-credit-notes" class="text-sm font-extrabold text-emerald-400 mt-1 font-mono block">₹0</span>
            </div>
          </div>
        </div>

      </div>

      <!-- SECTION K: NOTIFICATIONS FEED -->
      <section aria-label="Commercial Notifications" class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <span>🔔 Recent Activity & Alerts</span>
          </h3>
          <span class="text-xs text-neutral-400">Automated ERP Event Notifications</span>
        </div>
        <div id="notifications-feed" class="space-y-2.5">
          <div class="text-center py-4 text-neutral-500 text-sm">No new notifications.</div>
        </div>
      </section>

      <!-- READ-ONLY PO DETAILS MODAL / DRAWER -->
      <div id="modal-po-details" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 hidden">
        <div class="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
          <!-- MODAL HEADER -->
          <div class="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/70">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-bold text-primary-400" id="modal-po-id">PO-XXXX</span>
                <span class="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">READ ONLY</span>
              </div>
              <h4 class="text-base sm:text-lg font-bold text-white mt-0.5" id="modal-po-cafe">Zamorin Café</h4>
            </div>
            <div class="flex items-center gap-2">
              <button id="modal-btn-download-pdf" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 flex items-center gap-1.5 transition">
                📥 Download PDF
              </button>
              <button id="modal-btn-print" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 flex items-center gap-1.5 transition">
                🖨️ Print
              </button>
              <button id="modal-btn-close" class="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition">✕</button>
            </div>
          </div>
          <!-- MODAL BODY -->
          <div id="modal-po-body" class="p-5 overflow-y-auto space-y-5 text-xs text-neutral-300">
            <div>Loading details...</div>
          </div>
        </div>
      </div>

    </div>
  `;
}

/**
 * Wires reactive data fetching and interaction controls for VEN-SCR-001.
 */
export async function wireVendorDashboard(container) {
  if (!container) return;

  const cafeSelect = container.querySelector("#select-cafe-scope");
  const datePills = container.querySelectorAll("#date-range-pills .pill-btn");
  const refreshBtn = container.querySelector("#btn-refresh-dashboard");
  const poModal = container.querySelector("#modal-po-details");
  const poModalClose = container.querySelector("#modal-btn-close");
  const poModalPrint = container.querySelector("#modal-btn-print");
  const poModalDownload = container.querySelector("#modal-btn-download-pdf");

  let activeModalPoId = null;

  // 1. Setup Date Range Selector
  datePills.forEach((btn) => {
    btn.addEventListener("click", () => {
      datePills.forEach((b) => {
        b.classList.remove("bg-primary-600", "text-white", "font-bold", "shadow-sm");
        b.classList.add("text-neutral-400");
      });
      btn.classList.add("bg-primary-600", "text-white", "font-bold", "shadow-sm");
      btn.classList.remove("text-neutral-400");

      currentSelectedDateRange = btn.dataset.range || "30days";
      loadDashboardData();
    });
  });

  // 2. Setup Café Scope Filter
  if (cafeSelect) {
    cafeSelect.addEventListener("change", (e) => {
      currentSelectedCafe = e.target.value;
      loadDashboardData();
    });
  }

  // 3. Setup Refresh Button
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadDashboardData(true);
    });
  }

  // 4. Setup Order Filter Cards
  const orderFilterCards = container.querySelectorAll(".order-filter-card");
  orderFilterCards.forEach((card) => {
    card.addEventListener("click", () => {
      currentOrderFilter = card.dataset.filter || "ALL";
      orderFilterCards.forEach((c) => c.classList.remove("ring-2", "ring-primary-500"));
      card.classList.add("ring-2", "ring-primary-500");
      applyOrderFilter(currentOrderFilter);
    });
  });

  // 5. Setup Modal Close
  if (poModalClose && poModal) {
    poModalClose.addEventListener("click", () => {
      poModal.classList.add("hidden");
    });
    poModal.addEventListener("click", (e) => {
      if (e.target === poModal) poModal.classList.add("hidden");
    });
  }

  // 6. Setup Modal Print & Download
  if (poModalPrint) {
    poModalPrint.addEventListener("click", () => {
      window.print();
    });
  }

  if (poModalDownload) {
    poModalDownload.addEventListener("click", async () => {
      if (!activeModalPoId) return;
      try {
        await downloadBlob(
          `/vendor/orders/${activeModalPoId}/pdf`,
          `PO_${activeModalPoId}.pdf`
        );
      } catch (err) {
        alert(err?.message || "Failed to download Purchase Order PDF.");
      }
    });
  }

  // 7. Core Data Loader
  async function loadDashboardData(isRefresh = false) {
    try {
      const queryParams = new URLSearchParams();
      if (currentSelectedCafe && currentSelectedCafe !== "ALL") {
        queryParams.set("cafeId", currentSelectedCafe);
      }
      if (currentSelectedDateRange) {
        queryParams.set("dateRange", currentSelectedDateRange);
      }

      const res = await api.get(`/vendor/dashboard?${queryParams.toString()}`);
      if (!res || !res.data) {
        throw new Error("Invalid response received from vendor workspace.");
      }

      currentDashboardData = res.data;
      populateDashboardUI(res.data);
    } catch (err) {
      console.error("[VENDOR_DASHBOARD] Load error:", err);
      container.innerHTML = `
        <div class="p-8 max-w-xl mx-auto text-center space-y-4">
          <div class="text-4xl">⚠️</div>
          <h2 class="text-xl font-bold text-white">Access Denied or Session Expired</h2>
          <p class="text-sm text-neutral-400">${err?.message || "Unable to retrieve authoritative vendor dashboard records."}</p>
          <button onclick="location.reload()" class="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition">
            Retry Connection
          </button>
        </div>
      `;
    }
  }

  // 8. Populate UI Elements
  function populateDashboardUI(data) {
    const { vendor, financialSummary, orderSummary, supplyDeliverySummary, outstandingPayments, recentPurchaseOrders, recentPayments, pendingReceivables, recentDeliveryStatus, returnsAndAdjustments, notifications } = data;

    // Header Info
    const companyNameEl = container.querySelector("#vendor-company-name");
    const idBadgeEl = container.querySelector("#vendor-id-badge");
    const catBadgeEl = container.querySelector("#vendor-category-badge");
    const gstBadgeEl = container.querySelector("#vendor-gst-badge");

    if (companyNameEl) companyNameEl.textContent = vendor.name || "Vendor Dashboard";
    if (idBadgeEl) idBadgeEl.textContent = vendor.vendorId || "—";
    if (catBadgeEl) catBadgeEl.textContent = vendor.category || "GOODS";
    if (gstBadgeEl) gstBadgeEl.textContent = vendor.gstNumber ? `GST: ${vendor.gstNumber}` : "GST: Unregistered";

    // Populate Café Selector if not already populated
    if (cafeSelect && cafeSelect.options.length <= 1 && Array.isArray(vendor.approvedCafes)) {
      vendor.approvedCafes.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.cafeId;
        opt.textContent = `${c.name} (${c.cafeId})`;
        if (c.cafeId === currentSelectedCafe) opt.selected = true;
        cafeSelect.appendChild(opt);
      });
    }

    // Section B: Financial Summary Cards
    const orderValEl = container.querySelector("#stat-order-value");
    const invoicedEl = container.querySelector("#stat-invoiced");
    const paidEl = container.querySelector("#stat-paid");
    const receivableEl = container.querySelector("#stat-receivable");
    const overdueEl = container.querySelector("#stat-overdue");

    if (orderValEl) orderValEl.textContent = formatCurrency(financialSummary.totalOrderValuePaisa);
    if (invoicedEl) invoicedEl.textContent = formatCurrency(financialSummary.totalInvoicedPaisa);
    if (paidEl) paidEl.textContent = formatCurrency(financialSummary.totalPaidPaisa);
    if (receivableEl) receivableEl.textContent = formatCurrency(financialSummary.balanceReceivablePaisa);
    if (overdueEl) overdueEl.textContent = formatCurrency(financialSummary.overduePaisa);

    // Section C: Order Summary Counts
    const ordTotalEl = container.querySelector("#order-count-total");
    const ordOpenEl = container.querySelector("#order-count-open");
    const ordInprogEl = container.querySelector("#order-count-inprogress");
    const ordSuppliedEl = container.querySelector("#order-count-supplied");
    const ordPartialEl = container.querySelector("#order-count-partial");
    const ordCompEl = container.querySelector("#order-count-completed");
    const ordCancEl = container.querySelector("#order-count-cancelled");

    if (ordTotalEl) ordTotalEl.textContent = orderSummary.total;
    if (ordOpenEl) ordOpenEl.textContent = orderSummary.open;
    if (ordInprogEl) ordInprogEl.textContent = orderSummary.inProgress;
    if (ordSuppliedEl) ordSuppliedEl.textContent = orderSummary.supplied;
    if (ordPartialEl) ordPartialEl.textContent = orderSummary.partiallySupplied;
    if (ordCompEl) ordCompEl.textContent = orderSummary.completed;
    if (ordCancEl) ordCancEl.textContent = orderSummary.cancelled;

    // Section D: Supply / Delivery Summary
    const sdAwaiting = container.querySelector("#sd-awaiting");
    const sdExpectedToday = container.querySelector("#sd-expected-today");
    const sdPartSupplied = container.querySelector("#sd-part-supplied");
    const sdSupplied = container.querySelector("#sd-supplied");
    const sdReceivedCafe = container.querySelector("#sd-received-cafe");
    const sdShortRej = container.querySelector("#sd-short-rej");
    const sdPendingGrn = container.querySelector("#sd-pending-grn");
    const sdGrnDone = container.querySelector("#sd-grn-done");

    if (sdAwaiting) sdAwaiting.textContent = supplyDeliverySummary.awaitingSupply;
    if (sdExpectedToday) sdExpectedToday.textContent = supplyDeliverySummary.expectedToday;
    if (sdPartSupplied) sdPartSupplied.textContent = supplyDeliverySummary.partiallySupplied;
    if (sdSupplied) sdSupplied.textContent = supplyDeliverySummary.supplied;
    if (sdReceivedCafe) sdReceivedCafe.textContent = supplyDeliverySummary.receivedByCafe;
    if (sdShortRej) sdShortRej.textContent = supplyDeliverySummary.shortRejectedQty;
    if (sdPendingGrn) sdPendingGrn.textContent = supplyDeliverySummary.pendingGrn;
    if (sdGrnDone) sdGrnDone.textContent = supplyDeliverySummary.grnCompleted;

    // Section E: Outstanding Payments & Ageing Breakdown
    const ageTotRec = container.querySelector("#ageing-total-receivable");
    const ageTotOvr = container.querySelector("#ageing-total-overdue");
    const ageTableBody = container.querySelector("#ageing-table-body");

    if (ageTotRec) ageTotRec.textContent = formatCurrency(outstandingPayments.totalReceivablePaisa);
    if (ageTotOvr) ageTotOvr.textContent = formatCurrency(outstandingPayments.overduePaisa);

    if (ageTableBody) {
      const ageing = outstandingPayments.ageing || {};
      const totalRec = Number(outstandingPayments.totalReceivablePaisa || 0);

      const calcShare = (val) => (totalRec > 0 ? `${Math.round((val / totalRec) * 100)}%` : "0%");

      const buckets = [
        { label: "Current (Not Due)", amount: ageing.currentPaisa || 0, color: "text-emerald-400" },
        { label: "1–30 Days Past Due", amount: ageing.days1_30Paisa || 0, color: "text-amber-400" },
        { label: "31–60 Days Past Due", amount: ageing.days31_60Paisa || 0, color: "text-amber-500" },
        { label: "61–90 Days Past Due", amount: ageing.days61_90Paisa || 0, color: "text-rose-400" },
        { label: "90+ Days Past Due", amount: ageing.days90PlusPaisa || 0, color: "text-rose-500 font-bold" },
      ];

      ageTableBody.innerHTML = buckets
        .map(
          (b) => `
          <tr class="hover:bg-neutral-900/60 transition">
            <td class="py-2.5 px-3 flex items-center gap-1.5 font-medium ${b.color}">
              <span class="w-2 h-2 rounded-full bg-current opacity-70"></span>
              ${b.label}
            </td>
            <td class="py-2.5 px-3 text-right font-mono font-bold">${formatCurrency(b.amount)}</td>
            <td class="py-2.5 px-3 text-right text-neutral-400 font-mono text-[11px]">${calcShare(b.amount)}</td>
          </tr>
        `
        )
        .join("");
    }

    // Section F: Render Recent Purchase Orders
    renderRecentOrdersTable(recentPurchaseOrders);

    // Section G: Render Recent Payments
    renderRecentPaymentsTable(recentPayments);

    // Section H: Render Pending Receivables
    renderPendingReceivablesTable(pendingReceivables);

    // Section I: Render Recent Delivery / GRN Timeline
    renderDeliveryTimeline(recentDeliveryStatus);

    // Section J: Exceptions
    const excReturns = container.querySelector("#exc-returns");
    const excDiscrepancies = container.querySelector("#exc-discrepancies");
    const excDebit = container.querySelector("#exc-debit-notes");
    const excCredit = container.querySelector("#exc-credit-notes");

    if (excReturns) excReturns.textContent = returnsAndAdjustments.goodsReturnsCount;
    if (excDiscrepancies) excDiscrepancies.textContent = returnsAndAdjustments.quantityDiscrepanciesCount;
    if (excDebit) excDebit.textContent = formatCurrency(returnsAndAdjustments.debitNotesPaisa);
    if (excCredit) excCredit.textContent = formatCurrency(returnsAndAdjustments.creditNotesPaisa);

    // Section K: Notifications Feed
    const notifsContainer = container.querySelector("#notifications-feed");
    if (notifsContainer) {
      if (!notifications || notifications.length === 0) {
        notifsContainer.innerHTML = `<div class="text-center py-4 text-neutral-500 text-sm">No new notifications.</div>`;
      } else {
        notifsContainer.innerHTML = notifications
          .map(
            (n) => `
            <div class="p-3 rounded-xl bg-neutral-950/70 border border-neutral-800/80 hover:border-neutral-700 transition flex items-start gap-3">
              <span class="text-base mt-0.5">ℹ️</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs font-bold text-neutral-200 truncate">${n.title}</p>
                  <span class="text-[10px] text-neutral-500 shrink-0 font-mono">${formatDate(n.createdAt)}</span>
                </div>
                <p class="text-xs text-neutral-400 mt-0.5">${n.message}</p>
              </div>
            </div>
          `
          )
          .join("");
      }
    }
  }

  // 9. Render Recent Orders (Desktop Table + Mobile Cards)
  function renderRecentOrdersTable(orders) {
    const listContainer = container.querySelector("#recent-orders-list");
    if (!listContainer) return;

    if (!orders || orders.length === 0) {
      listContainer.innerHTML = `
        <div class="p-8 text-center text-neutral-500 rounded-xl bg-neutral-950/40 border border-neutral-800">
          <p class="text-base font-bold text-neutral-400">No Purchase Orders Found</p>
          <p class="text-xs text-neutral-500 mt-1">No orders are recorded for the selected scope and period.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = `
      <div class="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950/60 hidden sm:block">
        <table class="w-full text-left text-xs">
          <thead class="bg-neutral-800/60 text-neutral-300 font-bold border-b border-neutral-800 uppercase tracking-wider text-[10px]">
            <tr>
              <th class="py-2.5 px-3">PO Number</th>
              <th class="py-2.5 px-3">Café Location</th>
              <th class="py-2.5 px-3">Order Date</th>
              <th class="py-2.5 px-3">Required By</th>
              <th class="py-2.5 px-3 text-right">Order Value</th>
              <th class="py-2.5 px-3 text-center">Status</th>
              <th class="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-800/60 text-neutral-300">
            ${orders
              .map(
                (po) => `
              <tr class="hover:bg-neutral-900/60 transition">
                <td class="py-3 px-3 font-mono font-bold text-white">${po.purchaseOrderId}</td>
                <td class="py-3 px-3 text-neutral-300 font-medium">${po.cafeName}</td>
                <td class="py-3 px-3 text-neutral-400 font-mono">${formatDate(po.orderDate)}</td>
                <td class="py-3 px-3 text-neutral-300 font-mono">${formatDate(po.expectedDeliveryDate)}</td>
                <td class="py-3 px-3 text-right font-mono font-bold text-white">${formatCurrency(po.totalPaisa)}</td>
                <td class="py-3 px-3 text-center">${renderStatusBadge(po.status)}</td>
                <td class="py-3 px-3 text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <button data-action="view-po" data-id="${po.purchaseOrderId}" class="px-2.5 py-1 text-[11px] font-semibold rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition">
                      View
                    </button>
                    <button data-action="download-po" data-id="${po.purchaseOrderId}" title="Download PDF" class="px-2 py-1 text-[11px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition">
                      📥
                    </button>
                  </div>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <!-- MOBILE CARD VIEW -->
      <div class="sm:hidden space-y-3">
        ${orders
          .map(
            (po) => `
          <div class="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2.5 shadow-sm">
            <div class="flex items-center justify-between">
              <span class="font-mono font-bold text-white text-sm">${po.purchaseOrderId}</span>
              ${renderStatusBadge(po.status)}
            </div>
            <div class="flex items-center justify-between text-xs text-neutral-400">
              <span>${po.cafeName}</span>
              <span class="font-mono font-bold text-white">${formatCurrency(po.totalPaisa)}</span>
            </div>
            <div class="flex items-center justify-between text-[11px] text-neutral-500 font-mono pt-1 border-t border-neutral-800/60">
              <span>Req: ${formatDate(po.expectedDeliveryDate)}</span>
              <div class="flex items-center gap-2">
                <button data-action="view-po" data-id="${po.purchaseOrderId}" class="text-primary-400 font-bold hover:underline">View</button>
                <button data-action="download-po" data-id="${po.purchaseOrderId}" class="text-neutral-400 font-bold hover:underline">PDF</button>
              </div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;

    // Wire PO View and Download clicks
    listContainer.querySelectorAll('[data-action="view-po"]').forEach((btn) => {
      btn.addEventListener("click", () => openPoDetailsModal(btn.dataset.id));
    });

    listContainer.querySelectorAll('[data-action="download-po"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        try {
          await downloadBlob(`/vendor/orders/${id}/pdf`, `PO_${id}.pdf`);
        } catch (err) {
          alert(err?.message || "Failed to download PDF.");
        }
      });
    });
  }

  // 10. Render Recent Payments Table
  function renderRecentPaymentsTable(payments) {
    const listContainer = container.querySelector("#recent-payments-list");
    if (!listContainer) return;

    if (!payments || payments.length === 0) {
      listContainer.innerHTML = `
        <div class="p-6 text-center text-neutral-500 rounded-xl bg-neutral-950/40 border border-neutral-800">
          <p class="text-sm font-semibold text-neutral-400">No Payments Recorded</p>
          <p class="text-xs text-neutral-500 mt-0.5">No disbursements found for the selected period.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = `
      <div class="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950/60">
        <table class="w-full text-left text-xs">
          <thead class="bg-neutral-800/60 text-neutral-300 font-bold border-b border-neutral-800 uppercase tracking-wider text-[10px]">
            <tr>
              <th class="py-2.5 px-3">Date</th>
              <th class="py-2.5 px-3">Payment Ref</th>
              <th class="py-2.5 px-3">Invoice</th>
              <th class="py-2.5 px-3">Mode</th>
              <th class="py-2.5 px-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-800/60 text-neutral-300">
            ${payments
              .map(
                (p) => `
              <tr class="hover:bg-neutral-900/60 transition">
                <td class="py-2.5 px-3 font-mono text-neutral-400">${formatDate(p.paymentDate)}</td>
                <td class="py-2.5 px-3 font-mono font-semibold text-neutral-200">${p.paymentId}</td>
                <td class="py-2.5 px-3 text-neutral-300">${p.invoiceNumber}</td>
                <td class="py-2.5 px-3 text-neutral-400">${p.paymentMethod.replace(/_/g, " ")}</td>
                <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">${formatCurrency(p.amountPaisa)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // 11. Render Pending Receivables Table
  function renderPendingReceivablesTable(receivables) {
    const listContainer = container.querySelector("#pending-receivables-list");
    if (!listContainer) return;

    if (!receivables || receivables.length === 0) {
      listContainer.innerHTML = `
        <div class="p-6 text-center text-neutral-500 rounded-xl bg-neutral-950/40 border border-neutral-800">
          <p class="text-sm font-semibold text-emerald-400">All Clear — Zero Pending Receivables</p>
          <p class="text-xs text-neutral-500 mt-0.5">All vendor invoices are fully settled.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = `
      <div class="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950/60">
        <table class="w-full text-left text-xs">
          <thead class="bg-neutral-800/60 text-neutral-300 font-bold border-b border-neutral-800 uppercase tracking-wider text-[10px]">
            <tr>
              <th class="py-2.5 px-3">Invoice</th>
              <th class="py-2.5 px-3">Due Date</th>
              <th class="py-2.5 px-3 text-right">Invoiced</th>
              <th class="py-2.5 px-3 text-right">Balance</th>
              <th class="py-2.5 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-800/60 text-neutral-300">
            ${receivables
              .map(
                (r) => `
              <tr class="hover:bg-neutral-900/60 transition">
                <td class="py-2.5 px-3 font-mono font-semibold text-white">${r.supplierInvoiceNumber}</td>
                <td class="py-2.5 px-3 font-mono ${r.status === "OVERDUE" ? "text-rose-400 font-bold" : "text-neutral-400"}">${formatDate(r.dueDate)}</td>
                <td class="py-2.5 px-3 text-right font-mono text-neutral-400">${formatCurrency(r.totalPaisa)}</td>
                <td class="py-2.5 px-3 text-right font-mono font-bold ${r.status === "OVERDUE" ? "text-rose-400" : "text-sky-300"}">${formatCurrency(r.balancePaisa)}</td>
                <td class="py-2.5 px-3 text-center">${renderInvoiceStatusBadge(r.status)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // 12. Render Delivery / GRN Status Timeline
  function renderDeliveryTimeline(timelineData) {
    const timelineContainer = container.querySelector("#timeline-stepper-container");
    const poBadge = container.querySelector("#timeline-po-badge");
    const subtitle = container.querySelector("#timeline-subtitle");

    if (!timelineContainer) return;

    if (!timelineData || !timelineData.steps) {
      timelineContainer.innerHTML = `
        <div class="text-center py-6 text-neutral-500 text-sm">
          No active order timeline available.
        </div>
      `;
      if (poBadge) poBadge.textContent = "—";
      return;
    }

    if (poBadge) poBadge.textContent = timelineData.purchaseOrderId;
    if (subtitle) subtitle.textContent = `Order for ${timelineData.cafeName} (Placed: ${formatDate(timelineData.orderDate)})`;

    timelineContainer.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        ${timelineData.steps
          .map(
            (step, idx) => `
          <div class="relative p-3.5 rounded-xl border ${step.completed ? "border-emerald-500/40 bg-emerald-950/20" : "border-neutral-800 bg-neutral-950/60"} flex flex-col justify-between space-y-2">
            <div class="flex items-center justify-between">
              <span class="w-6 h-6 rounded-full ${step.completed ? "bg-emerald-500/30 text-emerald-400 border border-emerald-500/60" : "bg-neutral-800 text-neutral-500 border border-neutral-700"} flex items-center justify-center font-bold text-xs">
                ${step.completed ? "✓" : idx + 1}
              </span>
              <span class="text-[9px] font-bold uppercase tracking-wider ${step.completed ? "text-emerald-400" : "text-neutral-500"}">
                ${step.status}
              </span>
            </div>
            <div>
              <p class="text-xs font-bold ${step.completed ? "text-white" : "text-neutral-400"}">${step.label}</p>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  // 13. Open Read-Only PO Details Modal
  async function openPoDetailsModal(poId) {
    if (!poModal) return;
    activeModalPoId = poId;

    const modalId = poModal.querySelector("#modal-po-id");
    const modalCafe = poModal.querySelector("#modal-po-cafe");
    const modalBody = poModal.querySelector("#modal-po-body");

    if (modalId) modalId.textContent = poId;
    if (modalBody) modalBody.innerHTML = `<div class="text-center py-8 text-neutral-400">Fetching order details...</div>`;
    poModal.classList.remove("hidden");

    try {
      const res = await api.get(`/vendor/orders/${poId}`);
      const po = res.data;

      if (modalCafe) modalCafe.textContent = po.cafeName;

      modalBody.innerHTML = `
        <!-- SUMMARY ROW -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
          <div>
            <span class="text-[10px] uppercase font-bold text-neutral-500 block">Order Date</span>
            <span class="font-mono text-xs text-white font-semibold">${formatDate(po.orderDate)}</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-neutral-500 block">Delivery Required</span>
            <span class="font-mono text-xs text-white font-semibold">${formatDate(po.expectedDeliveryDate)}</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-neutral-500 block">Order Status</span>
            <div class="mt-0.5">${renderStatusBadge(po.status)}</div>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-neutral-500 block">Grand Total</span>
            <span class="font-mono text-xs font-bold text-emerald-400">${formatCurrency(po.totalPaisa)}</span>
          </div>
        </div>

        <!-- LINE ITEMS TABLE -->
        <div>
          <h5 class="text-xs font-bold text-white uppercase tracking-wider mb-2">Order Line Items</h5>
          <div class="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
            <table class="w-full text-left text-xs">
              <thead class="bg-neutral-800/80 text-neutral-300 font-bold border-b border-neutral-800 uppercase text-[10px]">
                <tr>
                  <th class="py-2 px-3">Item</th>
                  <th class="py-2 px-3">Pack Size</th>
                  <th class="py-2 px-3 text-right">Ordered</th>
                  <th class="py-2 px-3 text-right">Accepted</th>
                  <th class="py-2 px-3 text-right">Rate</th>
                  <th class="py-2 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-800 text-neutral-300">
                ${(po.lineItems || [])
                  .map(
                    (li) => `
                  <tr>
                    <td class="py-2.5 px-3 font-medium text-white">${li.itemName}</td>
                    <td class="py-2.5 px-3 text-neutral-400 font-mono">${li.packSize}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold">${li.orderedQuantity} ${li.baseUnit}</td>
                    <td class="py-2.5 px-3 text-right font-mono ${li.acceptedQuantity < li.orderedQuantity && li.acceptedQuantity > 0 ? "text-amber-400" : "text-emerald-400"}">${li.acceptedQuantity}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-neutral-400">${formatCurrency(li.unitPricePaisa)}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-white">${formatCurrency(li.lineTotalPaisa)}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- GRN RECEIPTS IF ANY -->
        ${
          po.grnReceipts && po.grnReceipts.length > 0
            ? `
          <div>
            <h5 class="text-xs font-bold text-white uppercase tracking-wider mb-2">Physical Goods Receipts (GRN)</h5>
            <div class="space-y-2">
              ${po.grnReceipts
                .map(
                  (grn) => `
                <div class="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between text-xs">
                  <div>
                    <span class="font-mono font-bold text-neutral-200">${grn.grnId}</span>
                    <span class="text-neutral-500 ml-2">Note: ${grn.deliveryNoteNumber || "Standard Delivery"}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="font-mono text-neutral-400">${formatDate(grn.receivedAt)}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${grn.status === "ACCEPTED" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}">${grn.status}</span>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `
            : ""
        }
      `;
    } catch (err) {
      modalBody.innerHTML = `<div class="p-4 text-center text-rose-400">Failed to load order: ${err?.message || "Unknown error"}</div>`;
    }
  }

  // 14. Filter Orders by Status
  function applyOrderFilter(filter) {
    if (!currentDashboardData || !currentDashboardData.recentPurchaseOrders) return;
    const filterBadge = container.querySelector("#badge-active-order-filter");

    let filtered = currentDashboardData.recentPurchaseOrders;
    if (filter === "OPEN") {
      filtered = filtered.filter((po) => ["DRAFT", "SUBMITTED", "APPROVED", "ORDER_PLACED", "ORDERED"].includes(po.status));
      if (filterBadge) filterBadge.textContent = "Filtered: New / Open";
    } else if (filter === "IN_PROGRESS") {
      filtered = filtered.filter((po) => ["ACKNOWLEDGED", "DISPATCHED"].includes(po.status));
      if (filterBadge) filterBadge.textContent = "Filtered: In Progress";
    } else if (filter === "SUPPLIED") {
      filtered = filtered.filter((po) => ["RECEIVED", "RECEIVED_PENDING_FINAL_POSTING", "VERIFIED_PENDING_MASTER_APPROVAL"].includes(po.status));
      if (filterBadge) filterBadge.textContent = "Filtered: Supplied";
    } else if (filter === "PARTIAL") {
      filtered = filtered.filter((po) => po.status === "PARTIALLY_RECEIVED");
      if (filterBadge) filterBadge.textContent = "Filtered: Partially Supplied";
    } else if (filter === "COMPLETED") {
      filtered = filtered.filter((po) => po.status === "CLOSED");
      if (filterBadge) filterBadge.textContent = "Filtered: Completed";
    } else if (filter === "CANCELLED") {
      filtered = filtered.filter((po) => po.status === "CANCELLED");
      if (filterBadge) filterBadge.textContent = "Filtered: Cancelled";
    } else {
      if (filterBadge) filterBadge.textContent = "All Orders";
    }

    renderRecentOrdersTable(filtered);
  }

  // Helpers for Status Badges
  function renderStatusBadge(status) {
    const s = String(status || "").toUpperCase();
    if (["CLOSED", "COMPLETED", "FULLY_RECEIVED"].includes(s)) {
      return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Completed</span>`;
    }
    if (["RECEIVED", "VERIFIED_PENDING_MASTER_APPROVAL", "RECEIVED_PENDING_FINAL_POSTING"].includes(s)) {
      return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Supplied</span>`;
    }
    if (["ACKNOWLEDGED", "DISPATCHED"].includes(s)) {
      return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">In Progress</span>`;
    }
    if (["SUBMITTED", "APPROVED", "ORDER_PLACED", "ORDERED"].includes(s)) {
      return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">Open</span>`;
    }
    if (s === "PARTIALLY_RECEIVED") {
      return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">Partial</span>`;
    }
    if (s === "CANCELLED") {
      return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">Cancelled</span>`;
    }
    return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-neutral-800 text-neutral-400">${s}</span>`;
  }

  function renderInvoiceStatusBadge(status) {
    const s = String(status || "").toUpperCase();
    if (s === "OVERDUE") {
      return `<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">Overdue</span>`;
    }
    if (s === "PARTIALLY_PAID") {
      return `<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Part Paid</span>`;
    }
    return `<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">Due</span>`;
  }

  // Initial Data Load
  await loadDashboardData();
}

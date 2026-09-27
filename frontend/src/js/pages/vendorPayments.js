// =============================================================================
// ZAMORIN CAFE ERP — VEN-SCR-005: PAYMENTS & BALANCE
//
// Authoritative, strictly read-only visibility into disbursed payments and balances:
// - 8 Authoritative KPI Cards: Total Paid, Payments This Period, Total Payments,
//   Current Outstanding, Overdue Outstanding, Advances Applied, Credits Applied, Open Invoices
// - Multi-criteria filtering: Café scope, date ranges, payment mode (NEFT/RTGS/UPI/IMPS/CHEQUE)
// - Universal search: Payment ID, UTR, invoice number, PO reference, café name/code
// - Reconciles payment postings with APInvoice and VendorLedgerEntry
// - Downloadable official A4 Vector PDF Payment Receipt (SYSTEM GENERATED - READ-ONLY VENDOR COPY)
// - Zero vendor mutation capability (no marking as received, disputing, or creating entries)
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentPaymentsData = null;
let currentSelectedCafe = "ALL";
let currentSelectedDateRange = "30days";
let currentSelectedPaymentMethod = "ALL";
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

export function renderVendorPayments() {
  return `
    <div id="vendor-payments-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg border border-emerald-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-300">READ-ONLY PAYMENTS & SETTLEMENTS</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/40">VEN-SCR-005</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Authoritative visibility into disbursed banking payments, settlement references, invoice allocations, and current receivable balance.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-refresh-payments" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
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
            <span>Payments & Balance</span>
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

      <!-- 8 AUTHORITATIVE PAYMENT & BALANCE KPI SUMMARY CARDS -->
      <section class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
        <!-- 1. Total Paid -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-emerald-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Total Settled</div>
          <div id="kpi-total-paid" class="text-lg sm:text-xl font-black text-white mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Cumulative payments received</div>
        </div>

        <!-- 2. Payments This Period -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-emerald-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Paid in Period</div>
          <div id="kpi-period-paid" class="text-lg sm:text-xl font-black text-white mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Selected timeframe</div>
        </div>

        <!-- 3. Current Outstanding -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-primary-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-primary-400">Current Outstanding</div>
          <div id="kpi-current-outstanding" class="text-lg sm:text-xl font-black text-white mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Approved payable pending</div>
        </div>

        <!-- 4. Overdue Outstanding -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-amber-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-amber-400">Overdue Balance</div>
          <div id="kpi-overdue-outstanding" class="text-lg sm:text-xl font-black text-amber-300 mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Past commercial due date</div>
        </div>

        <!-- 5. Advances Applied -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-sky-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-sky-400">Advances Applied</div>
          <div id="kpi-advances-applied" class="text-lg sm:text-xl font-black text-white mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Advance allocations</div>
        </div>

        <!-- 6. Credits Applied -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-purple-500/40 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-purple-400">Credits / Adjustments</div>
          <div id="kpi-credits-applied" class="text-lg sm:text-xl font-black text-white mt-1">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Credit note settlements</div>
        </div>

        <!-- 7. Total Payment Count -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Number of Payments</div>
          <div id="kpi-payments-count" class="text-lg sm:text-xl font-black text-white mt-1">0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Vouchers disbursed</div>
        </div>

        <!-- 8. Open Invoices Count -->
        <div class="kpi-card bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition-colors p-4 rounded-xl shadow-md">
          <div class="text-[11px] font-bold uppercase tracking-wider text-neutral-300">Open Invoices</div>
          <div id="kpi-open-invoices" class="text-lg sm:text-xl font-black text-white mt-1">0</div>
          <div class="text-[10px] text-neutral-400 mt-1">Awaiting full clearance</div>
        </div>
      </section>

      <!-- FILTER & UNIVERSAL SEARCH TOOLBAR -->
      <section class="filter-toolbar bg-neutral-900/70 border border-neutral-800 p-4 rounded-xl backdrop-blur-md shadow-lg space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          
          <!-- Universal Search Input -->
          <div class="lg:col-span-4 relative">
            <input 
              type="text" 
              id="input-search-payments" 
              placeholder="Search reference, UTR, invoice, PO, café..." 
              class="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 transition-all shadow-inner"
            />
            <span class="absolute left-3 top-2.5 text-neutral-500 text-xs">🔍</span>
          </div>

          <!-- Date Range Filter -->
          <div class="lg:col-span-3">
            <select id="select-date-range" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="30days">Last 30 Days</option>
              <option value="7days">Last 7 Days</option>
              <option value="thisMonth">This Month</option>
              <option value="lastMonth">Last Month</option>
              <option value="quarter">This Quarter</option>
              <option value="all">All Dates</option>
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          <!-- Payment Method Filter -->
          <div class="lg:col-span-3">
            <select id="select-payment-method" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Payment Methods</option>
              <option value="NEFT">NEFT (Electronic Fund Transfer)</option>
              <option value="RTGS">RTGS (Real Time Gross Settlement)</option>
              <option value="IMPS">IMPS (Immediate Payment)</option>
              <option value="UPI">UPI (Instant VPA)</option>
              <option value="BANK_TRANSFER">Direct Bank Transfer</option>
              <option value="CHEQUE">Cheque / Demand Draft</option>
            </select>
          </div>

          <!-- Sort Filter -->
          <div class="lg:col-span-2">
            <select id="select-sort-order" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="date_desc">Latest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="amount_desc">Amount: High → Low</option>
              <option value="amount_asc">Amount: Low → High</option>
            </select>
          </div>
        </div>

        <!-- Custom Date Range Row (Hidden by default) -->
        <div id="custom-date-row" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80">
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">From Date:</label>
            <input type="date" id="input-custom-start" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500" />
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">To Date:</label>
            <input type="date" id="input-custom-end" class="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500" />
          </div>
        </div>
      </section>

      <!-- PAYMENTS REGISTER TABLE / MOBILE CARDS -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
        <div class="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <h2 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Payment Settlements Register</span>
            </h2>
            <span id="payments-count-badge" class="px-2 py-0.5 rounded-full text-xs font-mono bg-neutral-800 text-neutral-300 font-semibold border border-neutral-700">0 records</span>
          </div>
          <div class="text-xs text-neutral-400">
            Showing official disbursed accounts vouchers
          </div>
        </div>

        <!-- Loading State -->
        <div id="payments-loading" class="py-16 text-center text-neutral-400">
          <div class="inline-block animate-spin text-2xl mb-2">🔄</div>
          <p class="text-sm font-semibold">Loading payment transactions...</p>
        </div>

        <!-- Empty State -->
        <div id="payments-empty" class="hidden py-16 text-center text-neutral-400 px-4">
          <div class="text-3xl mb-2">💳</div>
          <h3 class="text-base font-bold text-white">No Payment Records Found</h3>
          <p class="text-xs text-neutral-400 max-w-md mx-auto mt-1">There are no payment vouchers matching the selected café, date window, or search criteria.</p>
        </div>

        <!-- Desktop Table (md and up) -->
        <div id="payments-table-wrapper" class="hidden md:block overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-neutral-950/70 border-b border-neutral-800 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                <th class="py-3 px-4">Payment Ref / UTR</th>
                <th class="py-3 px-4">Date</th>
                <th class="py-3 px-4">Café Outlet</th>
                <th class="py-3 px-4">Linked Invoice & PO</th>
                <th class="py-3 px-4">Method</th>
                <th class="py-3 px-4 text-right">Settled Amount</th>
                <th class="py-3 px-4 text-right">Remaining Bal</th>
                <th class="py-3 px-4 text-center">Status</th>
                <th class="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody id="payments-table-body" class="divide-y divide-neutral-800/60 font-mono text-[11px]">
              <!-- Injected by renderRows() -->
            </tbody>
          </table>
        </div>

        <!-- Mobile Card List (sm and down) -->
        <div id="payments-mobile-cards" class="md:hidden divide-y divide-neutral-800/80 p-2">
          <!-- Injected by renderCards() -->
        </div>

        <!-- Pagination Bar -->
        <div id="payments-pagination" class="p-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <span id="pagination-info">Showing 0 of 0</span>
          <div class="flex items-center gap-2">
            <button id="btn-prev-page" class="px-2.5 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-700 active:scale-95">Prev</button>
            <span id="pagination-pages" class="font-bold text-neutral-300">Page 1 of 1</span>
            <button id="btn-next-page" class="px-2.5 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-700 active:scale-95">Next</button>
          </div>
        </div>
      </section>

      <!-- PAYMENT DETAIL MODAL (6 SAFE ZONES) -->
      <div id="modal-payment-detail" class="hidden fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <div class="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
          
          <!-- Modal Header -->
          <div class="p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="text-xl">💳</span>
              <div>
                <h3 id="modal-payment-title" class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>Payment Voucher</span>
                </h3>
                <span class="text-[11px] text-neutral-400">Authoritative Accounts Disbursed Settlement</span>
              </div>
            </div>
            <button id="btn-close-modal" class="text-neutral-400 hover:text-white p-1 text-lg rounded-lg hover:bg-neutral-800 transition-colors">✕</button>
          </div>

          <!-- Modal Body (Scrollable) -->
          <div id="modal-payment-body" class="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs text-neutral-300">
            <!-- Dynamic 6-Zone breakdown injected by showPaymentModal() -->
          </div>

          <!-- Modal Footer -->
          <div class="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between flex-wrap gap-2">
            <span class="text-[10px] text-neutral-400 flex items-center gap-1">
              <span>🔒</span> Read-only payment record • Zamorin Commercial Subledger
            </span>
            <div class="flex items-center gap-2">
              <button id="btn-modal-download-receipt" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 font-semibold text-white transition-all shadow flex items-center gap-1.5">
                <span>📥</span> Download Payment Receipt
              </button>
              <button id="btn-modal-close" class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold border border-neutral-700">Close</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}

export function initVendorPayments() {
  const container = document.getElementById("vendor-payments-container");
  if (!container) return;

  // Initial load
  loadVendorProfileHeader();
  loadPaymentsData();

  // Attach event listeners
  document.getElementById("btn-refresh-payments")?.addEventListener("click", () => {
    loadPaymentsData();
  });

  document.getElementById("select-cafe-scope")?.addEventListener("change", (e) => {
    currentSelectedCafe = e.target.value;
    currentPage = 1;
    loadPaymentsData();
  });

  document.getElementById("select-date-range")?.addEventListener("change", (e) => {
    currentSelectedDateRange = e.target.value;
    const customRow = document.getElementById("custom-date-row");
    if (currentSelectedDateRange === "custom") {
      customRow?.classList.remove("hidden");
    } else {
      customRow?.classList.add("hidden");
      currentPage = 1;
      loadPaymentsData();
    }
  });

  document.getElementById("input-custom-start")?.addEventListener("change", () => {
    currentPage = 1;
    loadPaymentsData();
  });

  document.getElementById("input-custom-end")?.addEventListener("change", () => {
    currentPage = 1;
    loadPaymentsData();
  });

  document.getElementById("select-payment-method")?.addEventListener("change", (e) => {
    currentSelectedPaymentMethod = e.target.value;
    currentPage = 1;
    loadPaymentsData();
  });

  document.getElementById("select-sort-order")?.addEventListener("change", (e) => {
    currentSort = e.target.value;
    currentPage = 1;
    loadPaymentsData();
  });

  let debounceTimer;
  document.getElementById("input-search-payments")?.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearchTerm = e.target.value.trim();
      currentPage = 1;
      loadPaymentsData();
    }, 300);
  });

  // Modal close handlers
  document.getElementById("btn-close-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-modal-close")?.addEventListener("click", closeModal);
  document.getElementById("modal-payment-detail")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-payment-detail") closeModal();
  });

  // Pagination buttons
  document.getElementById("btn-prev-page")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadPaymentsData();
    }
  });

  document.getElementById("btn-next-page")?.addEventListener("click", () => {
    if (currentPaymentsData?.pagination?.hasNext) {
      currentPage++;
      loadPaymentsData();
    }
  });
}

async function loadVendorProfileHeader() {
  try {
    const res = await api.get("/api/v1/vendor/me");
    if (res.data?.success && res.data.data) {
      const v = res.data.data;
      const nameEl = document.getElementById("vendor-company-name");
      if (nameEl) nameEl.textContent = v.name || v.legalName || "Vendor Workspace";

      const idBadge = document.getElementById("vendor-id-badge");
      if (idBadge) idBadge.textContent = v.vendorId || "—";

      const catBadge = document.getElementById("vendor-category-badge");
      if (catBadge) catBadge.textContent = v.category || "GENERAL";

      const gstBadge = document.getElementById("vendor-gst-badge");
      if (gstBadge) gstBadge.textContent = v.gstNumber ? `GST: ${v.gstNumber}` : "Unregistered";

      // Populate Cafe Scope options
      const cafeSelect = document.getElementById("select-cafe-scope");
      if (cafeSelect && Array.isArray(v.approvedCafeIds)) {
        cafeSelect.innerHTML = `<option value="ALL">All Authorised Cafés (${v.approvedCafeIds.length})</option>`;
        for (const cid of v.approvedCafeIds) {
          cafeSelect.innerHTML += `<option value="${cid}">${cid}</option>`;
        }
      }
    }
  } catch (err) {
    console.error("Failed to load vendor profile for header:", err);
  }
}

async function loadPaymentsData() {
  const loading = document.getElementById("payments-loading");
  const empty = document.getElementById("payments-empty");
  const table = document.getElementById("payments-table-wrapper");
  const cards = document.getElementById("payments-mobile-cards");

  loading?.classList.remove("hidden");
  empty?.classList.add("hidden");
  table?.classList.add("hidden");
  cards?.classList.add("hidden");

  try {
    const query = new URLSearchParams();
    if (currentSelectedCafe && currentSelectedCafe !== "ALL") query.set("cafeId", currentSelectedCafe);
    if (currentSelectedDateRange && currentSelectedDateRange !== "all") query.set("dateRange", currentSelectedDateRange);
    if (currentSelectedDateRange === "custom") {
      const start = document.getElementById("input-custom-start")?.value;
      const end = document.getElementById("input-custom-end")?.value;
      if (start) query.set("customStart", start);
      if (end) query.set("customEnd", end);
    }
    if (currentSelectedPaymentMethod && currentSelectedPaymentMethod !== "ALL") query.set("paymentMethod", currentSelectedPaymentMethod);
    if (currentSearchTerm) query.set("search", currentSearchTerm);
    if (currentSort) query.set("sort", currentSort);
    query.set("page", currentPage);
    query.set("limit", currentLimit);

    const res = await api.get(`/api/v1/vendor/payments?${query.toString()}`);
    if (res.data?.success && res.data.data) {
      currentPaymentsData = res.data.data;
      updateKpis(currentPaymentsData.kpis);
      renderPayments(currentPaymentsData.payments);
      updatePagination(currentPaymentsData.pagination);
    }
  } catch (err) {
    console.error("Failed to load vendor payments:", err);
    if (empty) {
      empty.classList.remove("hidden");
      empty.querySelector("h3").textContent = "Error Loading Payments";
      empty.querySelector("p").textContent = err.message || "Failed to load payment transactions from server.";
    }
  } finally {
    loading?.classList.add("hidden");
  }
}

function updateKpis(kpis) {
  if (!kpis) return;
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("kpi-total-paid", kpis.totalPaidFormatted || "₹0");
  setTxt("kpi-period-paid", kpis.paymentsThisPeriodFormatted || "₹0");
  setTxt("kpi-current-outstanding", kpis.currentOutstandingFormatted || "₹0");
  setTxt("kpi-overdue-outstanding", kpis.overdueOutstandingFormatted || "₹0");
  setTxt("kpi-advances-applied", kpis.advancesAppliedFormatted || "₹0");
  setTxt("kpi-credits-applied", kpis.creditsAppliedFormatted || "₹0");
  setTxt("kpi-payments-count", String(kpis.paymentsCount || 0));
  setTxt("kpi-open-invoices", String(kpis.openInvoiceCount || 0));
}

function renderPayments(payments) {
  const empty = document.getElementById("payments-empty");
  const table = document.getElementById("payments-table-wrapper");
  const cards = document.getElementById("payments-mobile-cards");
  const countBadge = document.getElementById("payments-count-badge");

  if (!payments || payments.length === 0) {
    empty?.classList.remove("hidden");
    table?.classList.add("hidden");
    cards?.classList.add("hidden");
    if (countBadge) countBadge.textContent = "0 records";
    return;
  }

  if (countBadge) countBadge.textContent = `${payments.length} records`;
  table?.classList.remove("hidden");
  cards?.classList.remove("hidden");

  // Render Desktop Rows
  const tbody = document.getElementById("payments-table-body");
  if (tbody) {
    tbody.innerHTML = payments.map((p) => `
      <tr class="hover:bg-neutral-800/40 transition-colors">
        <td class="py-3 px-4 font-bold text-white">
          <div class="flex items-center gap-1.5">
            <span>${p.paymentReference || p.paymentId}</span>
          </div>
          <div class="text-[10px] text-neutral-400 font-normal">ID: ${p.paymentId}</div>
        </td>
        <td class="py-3 px-4 text-neutral-300 font-sans">
          ${formatDate(p.paymentDate)}
        </td>
        <td class="py-3 px-4 font-sans">
          <div class="font-semibold text-neutral-200">${p.cafeName || p.cafeId}</div>
          <div class="text-[10px] text-neutral-400">${p.cafeCode || p.cafeId}</div>
        </td>
        <td class="py-3 px-4 font-sans">
          <div class="text-neutral-200 font-semibold">${p.supplierInvoiceNumber || p.invoiceId || '—'}</div>
          <div class="text-[10px] text-primary-400">${p.poReferenceId ? `PO: ${p.poReferenceId}` : ''}</div>
        </td>
        <td class="py-3 px-4 font-sans text-neutral-300">
          <span class="px-2 py-0.5 rounded bg-neutral-800 text-[10px] font-semibold text-neutral-300 border border-neutral-700">
            ${p.paymentMethod || 'BANK_TRANSFER'}
          </span>
        </td>
        <td class="py-3 px-4 text-right font-bold text-emerald-400">
          ${p.grossAmountFormatted || '₹0'}
        </td>
        <td class="py-3 px-4 text-right text-neutral-400 font-bold">
          ${p.remainingInvoiceBalanceFormatted || '₹0'}
        </td>
        <td class="py-3 px-4 text-center font-sans">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
            SETTLED
          </span>
        </td>
        <td class="py-3 px-4 text-center font-sans">
          <div class="flex items-center justify-center gap-1.5">
            <button 
              data-payment-id="${p.paymentId}" 
              class="btn-view-payment px-2.5 py-1 text-[11px] font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 active:scale-95 transition-all shadow"
            >
              View
            </button>
            <button 
              data-receipt-id="${p.paymentId}" 
              class="btn-download-receipt px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 rounded border border-emerald-800/40 active:scale-95 transition-all shadow"
              title="Download Official PDF Receipt"
            >
              📥 PDF
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  // Render Mobile Cards
  if (cards) {
    cards.innerHTML = payments.map((p) => `
      <div class="p-3.5 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-white font-mono">${p.paymentReference || p.paymentId}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
            SETTLED
          </span>
        </div>
        <div class="text-[11px] text-neutral-300 flex items-center justify-between">
          <span>Date: ${formatDate(p.paymentDate)}</span>
          <span class="text-neutral-400">${p.paymentMethod || 'BANK_TRANSFER'}</span>
        </div>
        <div class="text-[11px] text-neutral-300">
          <span class="text-neutral-400">Café:</span> ${p.cafeName || p.cafeId}
        </div>
        <div class="text-[11px] text-neutral-300 flex items-center justify-between">
          <span>Invoice: ${p.supplierInvoiceNumber || p.invoiceId || '—'}</span>
          <span class="text-primary-400">${p.poReferenceId ? `PO: ${p.poReferenceId}` : ''}</span>
        </div>
        <div class="p-2 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between">
          <div>
            <div class="text-[10px] text-neutral-400 uppercase font-bold">Paid Amount</div>
            <div class="text-sm font-black text-emerald-400 font-mono">${p.grossAmountFormatted || '₹0'}</div>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-neutral-400 uppercase font-bold">Remaining Bal</div>
            <div class="text-xs font-bold text-neutral-300 font-mono">${p.remainingInvoiceBalanceFormatted || '₹0'}</div>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 pt-1">
          <button 
            data-payment-id="${p.paymentId}" 
            class="btn-view-payment flex-1 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700"
          >
            View Details
          </button>
          <button 
            data-receipt-id="${p.paymentId}" 
            class="btn-download-receipt px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/40 rounded-lg border border-emerald-800/50 flex items-center gap-1"
          >
            📥 Receipt
          </button>
        </div>
      </div>
    `).join("");
  }

  // Attach button events
  document.querySelectorAll(".btn-view-payment").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.getAttribute("data-payment-id");
      if (pid) openPaymentDetailModal(pid);
    });
  });

  document.querySelectorAll(".btn-download-receipt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.getAttribute("data-receipt-id");
      if (pid) downloadPaymentReceipt(pid);
    });
  });
}

function updatePagination(pagination) {
  if (!pagination) return;
  const info = document.getElementById("pagination-info");
  const pages = document.getElementById("pagination-pages");
  const prevBtn = document.getElementById("btn-prev-page");
  const nextBtn = document.getElementById("btn-next-page");

  const startRecord = (pagination.page - 1) * pagination.limit + 1;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.total);

  if (info) info.textContent = pagination.total > 0 ? `Showing ${startRecord}–${endRecord} of ${pagination.total}` : "Showing 0 of 0";
  if (pages) pages.textContent = `Page ${pagination.page} of ${pagination.totalPages || 1}`;

  if (prevBtn) prevBtn.disabled = !pagination.hasPrev;
  if (nextBtn) nextBtn.disabled = !pagination.hasNext;
}

async function openPaymentDetailModal(paymentId) {
  const modal = document.getElementById("modal-payment-detail");
  const body = document.getElementById("modal-payment-body");
  const title = document.getElementById("modal-payment-title");
  const downloadBtn = document.getElementById("btn-modal-download-receipt");

  if (!modal || !body) return;

  modal.classList.remove("hidden");
  body.innerHTML = `
    <div class="py-12 text-center text-neutral-400">
      <div class="inline-block animate-spin text-2xl mb-2">🔄</div>
      <p class="font-semibold">Loading payment details...</p>
    </div>
  `;

  try {
    const res = await api.get(`/api/v1/vendor/payments/${paymentId}`);
    if (res.data?.success && res.data.data) {
      const p = res.data.data;

      if (title) title.innerHTML = `<span>Payment Voucher: <span class="font-mono text-emerald-400">${p.paymentReference || p.paymentId}</span></span>`;

      if (downloadBtn) {
        downloadBtn.onclick = () => downloadPaymentReceipt(p.paymentId);
      }

      body.innerHTML = `
        <!-- ZONE 1: PAYMENT IDENTITY & TIMESTAMPS -->
        <div class="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Voucher Reference</div>
              <div class="text-base font-black text-white font-mono">${p.paymentReference || p.paymentId}</div>
            </div>
            <div class="text-right">
              <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
                CLEARED & SETTLED
              </span>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-neutral-800/80 text-[11px]">
            <div>
              <span class="text-neutral-400 block text-[10px] uppercase">Payment Date</span>
              <span class="font-semibold text-white">${formatDate(p.paymentDate)}</span>
            </div>
            <div>
              <span class="text-neutral-400 block text-[10px] uppercase">Payment Method</span>
              <span class="font-semibold text-white">${p.paymentMethod || 'BANK_TRANSFER'}</span>
            </div>
            <div>
              <span class="text-neutral-400 block text-[10px] uppercase">Settlement Ref (UTR)</span>
              <span class="font-mono text-neutral-200">${p.settlementReference || 'N/A'}</span>
            </div>
            <div>
              <span class="text-neutral-400 block text-[10px] uppercase">Posting Timestamp</span>
              <span class="font-mono text-neutral-300">${new Date(p.paymentTimestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        <!-- ZONE 2: PARTICIPATING ENTITIES -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
            <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Paying Entity</div>
            <div class="font-bold text-white">${p.cafeName || p.cafeId}</div>
            <div class="text-[11px] text-neutral-400">Branch Code: ${p.cafeCode || p.cafeId}</div>
            <div class="text-[11px] text-neutral-400">Zamorin Hospitality Private Limited</div>
          </div>

          <div class="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
            <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Beneficiary (Payee)</div>
            <div class="font-bold text-white">${p.vendorName}</div>
            <div class="text-[11px] font-mono text-neutral-300">Vendor ID: ${p.vendorId}</div>
            <div class="text-[11px] text-neutral-400">Commercial Bank Account Verified on File</div>
          </div>
        </div>

        <!-- ZONE 3: FINANCIAL SETTLEMENT SUMMARY -->
        <div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40">
          <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Disbursed Settlement Value</div>
          <div class="text-2xl font-black text-emerald-300 font-mono">${p.grossAmountFormatted || '₹0'}</div>
          <p class="text-[11px] text-neutral-400 mt-1">Full amount posted to vendor ledger subledger account.</p>
        </div>

        <!-- ZONE 4: LINKED COMMERCIAL INVOICE & PO -->
        <div class="space-y-2">
          <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-300">Invoice Allocation Breakdown</h4>
          ${p.linkedInvoice ? `
            <div class="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-neutral-400 text-[10px] uppercase block">Supplier Invoice No</span>
                  <span class="text-xs font-bold text-white font-mono">${p.linkedInvoice.supplierInvoiceNumber || p.linkedInvoice.invoiceId}</span>
                </div>
                <div class="text-right">
                  <span class="text-neutral-400 text-[10px] uppercase block">Invoice Date</span>
                  <span class="text-xs text-neutral-200">${formatDate(p.linkedInvoice.invoiceDate)}</span>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-800/80 text-center">
                <div class="p-2 rounded bg-neutral-900 border border-neutral-800">
                  <div class="text-[9px] uppercase font-bold text-neutral-400">Total Billed</div>
                  <div class="text-xs font-bold text-white font-mono mt-0.5">${p.linkedInvoice.totalAmountFormatted}</div>
                </div>
                <div class="p-2 rounded bg-neutral-900 border border-neutral-800">
                  <div class="text-[9px] uppercase font-bold text-emerald-400">Settled Here</div>
                  <div class="text-xs font-bold text-emerald-300 font-mono mt-0.5">${p.allocatedAmountFormatted}</div>
                </div>
                <div class="p-2 rounded bg-neutral-900 border border-neutral-800">
                  <div class="text-[9px] uppercase font-bold text-neutral-400">Remaining Bal</div>
                  <div class="text-xs font-bold text-neutral-200 font-mono mt-0.5">${p.linkedInvoice.remainingBalanceFormatted}</div>
                </div>
              </div>

              ${p.linkedInvoice.poReferenceId ? `
                <div class="text-[11px] text-neutral-400 pt-1">
                  Reference PO: <span class="font-mono text-primary-400 font-semibold">${p.linkedInvoice.poReferenceId}</span>
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-400 text-xs">
              Direct subledger settlement payment. No individual invoice allocated.
            </div>
          `}
        </div>

        <!-- ZONE 5: VENDOR-SAFE SYSTEM NOTES (REDACTED) -->
        <div class="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400">
          <span class="font-bold text-neutral-300 block mb-0.5">Authorised Voucher Notes:</span>
          <span>${p.paymentNotes || 'Direct banking remittance approved by Zamorin Hospitality Accounts.'}</span>
        </div>
      `;
    }
  } catch (err) {
    body.innerHTML = `
      <div class="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200">
        Failed to load payment detail: ${err.message || 'Server error'}
      </div>
    `;
  }
}

function closeModal() {
  document.getElementById("modal-payment-detail")?.classList.add("hidden");
}

async function downloadPaymentReceipt(paymentId) {
  try {
    const res = await api.get(`/api/v1/vendor/payments/${paymentId}/receipt`, {
      responseType: "blob",
    });
    const blob = new Blob([res.data], { type: "application/pdf" });
    downloadBlob(blob, `PaymentReceipt-${paymentId}.pdf`);
  } catch (err) {
    console.error("Failed to download payment receipt PDF:", err);
    alert("Unable to download payment receipt. Please verify authorization and try again.");
  }
}

export const wireVendorPayments = initVendorPayments;


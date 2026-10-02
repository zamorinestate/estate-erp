// =============================================================================
// ZAMORIN CAFÉ ERP — VEN-SCR-010: DOCUMENTS CENTRE
//
// Centralized commercial document repository for vendors:
// - Purchase Orders, Intake Receipts (GRNs) & signed physical notes
// - AP Invoices, Payment Settlement Vouchers & Adjustments (Credit/Debit Notes)
// - Contracted Rate Schedules, Rate Cards & Master Supply Agreements
// - Statutory documents (GST certificates, TDS statements, PAN)
// - 5 Summary KPI Cards: Total Docs, PO/GRN Docs, Financial/Tax Docs, Agreements, Authorized Cafés
// - Multi-criteria filtering: Category, date range, café scope, sorting
// - Universal search: Title, reference number, related ID, café name, description
// - Single-click vector PDF / original attachment download
// - Standard CSV register export
// - Zero vendor mutation capability (strict read-only access)
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentDocumentsData = null;
let currentSelectedCafe = "ALL";
let currentSelectedCategory = "ALL";
let currentSelectedDateRange = "ALL";
let currentSearchTerm = "";
let currentSortBy = "date_desc";
let currentPage = 1;
let currentLimit = 50;

function formatDate(dateStr) {
  if (!dateStr || dateStr === "—") return "—";
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

function getCategoryBadge(category) {
  const cat = String(category || '').toUpperCase();
  switch (cat) {
    case 'PURCHASE_ORDER':
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-blue-950 text-blue-300 border border-blue-800">PO Record</span>';
    case 'GOODS_RECEIPT':
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-teal-950 text-teal-300 border border-teal-800">GRN Intake</span>';
    case 'INVOICE':
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-indigo-950 text-indigo-300 border border-indigo-800">Tax Invoice</span>';
    case 'PAYMENT_RECEIPT':
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-950 text-emerald-300 border border-emerald-800">Payment Voucher</span>';
    case 'ADJUSTMENT':
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-950 text-amber-300 border border-amber-800">Adjustment Note</span>';
    case 'RATE_SCHEDULE':
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-violet-950 text-violet-300 border border-violet-800">Rate Schedule</span>';
    case 'TAX_STATUTORY':
    case 'AGREEMENT':
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-purple-950 text-purple-300 border border-purple-800">Statutory / Legal</span>';
    default:
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-neutral-800 text-neutral-300 border border-neutral-700">Commercial Doc</span>';
  }
}

export function renderVendorDocuments() {
  return `
    <div id="vendor-documents-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-950/40 via-indigo-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-300">READ-ONLY DOCUMENTS CENTRE</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-blue-500/20 text-blue-200 border border-blue-500/40">VEN-SCR-010</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Centralized repository for official purchase orders, GRN receipts, tax invoices, settlement vouchers, and rate agreements.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-export-documents-xlsx" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
            <span>📥</span> Export Excel
          </button>
          <button id="btn-refresh-documents" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
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
            <span>Documents Centre</span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span id="vendor-id-badge" class="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 font-semibold">—</span>
            <span id="vendor-gst-badge" class="px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono text-[11px]">—</span>
            <span id="badge-total-documents-count" class="px-2.5 py-1 rounded-md bg-blue-950/60 text-blue-300 border border-blue-800/50 text-[11px] font-semibold">0 Documents Total</span>
          </div>
        </div>

        <!-- CAFÉ SCOPE SELECTOR -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-2">
          <label for="select-cafe-scope" class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Café Scope:</label>
          <select id="select-cafe-scope" class="bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-primary-500 shadow-inner min-w-[200px]">
            <option value="ALL">All Authorized Cafés</option>
          </select>
        </div>
      </header>

      <!-- 5 AUTHORITATIVE SUMMARY KPI CARDS -->
      <section aria-label="Document Summary Metrics" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        
        <!-- CARD 1: TOTAL DOCUMENTS -->
        <div id="card-total-documents" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-blue-900/40 relative overflow-hidden group hover:border-blue-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center justify-between">
            <span>Total Documents</span>
            <span class="text-blue-500/60 text-base">📁</span>
          </div>
          <div id="val-total-documents" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Commercial files indexed</div>
        </div>

        <!-- CARD 2: ORDERS & INTAKE -->
        <div id="card-po-grn-docs" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-teal-900/40 relative overflow-hidden group hover:border-teal-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-teal-400 uppercase tracking-wider flex items-center justify-between">
            <span>Orders & Intake</span>
            <span class="text-teal-500/60 text-base">📦</span>
          </div>
          <div id="val-po-grn-docs" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">PO & GRN delivery records</div>
        </div>

        <!-- CARD 3: FINANCE & TAX -->
        <div id="card-finance-tax-docs" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-indigo-900/40 relative overflow-hidden group hover:border-indigo-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center justify-between">
            <span>Finance & Tax</span>
            <span class="text-indigo-500/60 text-base">💳</span>
          </div>
          <div id="val-finance-tax-docs" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Invoices, payments & tax</div>
        </div>

        <!-- CARD 4: AGREEMENTS & PRICING -->
        <div id="card-agreements-docs" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-violet-900/40 relative overflow-hidden group hover:border-violet-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-violet-400 uppercase tracking-wider flex items-center justify-between">
            <span>Rate Schedules</span>
            <span class="text-violet-500/60 text-base">🏷️</span>
          </div>
          <div id="val-agreements-docs" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Rate cards & agreements</div>
        </div>

        <!-- CARD 5: AUTHORIZED CAFÉS -->
        <div id="card-authorized-cafes" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-cyan-900/40 relative overflow-hidden group hover:border-cyan-700/60 transition-all shadow-md col-span-2 sm:col-span-1">
          <div class="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
            <span>Locations</span>
            <span class="text-cyan-500/60 text-base">📍</span>
          </div>
          <div id="val-authorized-cafes" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Authorized café scopes</div>
        </div>

      </section>

      <!-- MULTI-CRITERIA FILTER & SEARCH TOOLBAR -->
      <section class="filter-toolbar bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 backdrop-blur-md shadow-lg flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        
        <!-- SEARCH INPUT -->
        <div class="relative flex-1">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 text-sm">🔍</span>
          <input 
            type="text" 
            id="input-documents-search" 
            placeholder="Search by Title, Ref Number, Related Record, Café, Description..." 
            class="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
          />
        </div>

        <!-- FILTER GROUP -->
        <div class="flex flex-wrap items-center gap-2.5">
          
          <!-- CATEGORY FILTER -->
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-neutral-400 uppercase">Category:</span>
            <select id="select-document-category" class="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="ALL">All Categories</option>
              <option value="PURCHASE_ORDER">Purchase Orders</option>
              <option value="GOODS_RECEIPT">Goods Receipts (GRN)</option>
              <option value="INVOICE">Tax Invoices</option>
              <option value="PAYMENT_RECEIPT">Payment Receipts</option>
              <option value="ADJUSTMENT">Adjustments & Notes</option>
              <option value="RATE_SCHEDULE">Rate Schedules</option>
              <option value="TAX_STATUTORY">Tax & Statutory</option>
              <option value="AGREEMENT">Agreements</option>
            </select>
          </div>

          <!-- DATE RANGE FILTER -->
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-neutral-400 uppercase">Date:</span>
            <select id="select-document-date-range" class="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="ALL">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="1y">Last 1 Year</option>
            </select>
          </div>

          <!-- SORT SELECTOR -->
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-neutral-400 uppercase">Sort:</span>
            <select id="select-document-sort" class="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="name_asc">Title (A-Z)</option>
              <option value="type">Category</option>
            </select>
          </div>

        </div>
      </section>

      <!-- DOCUMENTS REGISTER CONTENT AREA -->
      <main id="documents-content-area" class="space-y-4">
        <!-- Injected via JavaScript -->
        <div class="p-8 text-center text-neutral-400 bg-neutral-900/40 rounded-xl border border-neutral-800">
          <div class="inline-block animate-spin text-2xl mb-2">🔄</div>
          <p class="text-xs">Loading commercial documents...</p>
        </div>
      </main>

      <!-- DOCUMENT DETAIL & PREVIEW MODAL -->
      <div id="vendor-document-detail-modal" class="hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div class="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
          
          <!-- MODAL HEADER -->
          <div class="p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-blue-400 text-lg font-bold">
                📄
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 id="modal-doc-title" class="text-base sm:text-lg font-black text-white leading-tight">Document Record</h3>
                  <span id="modal-doc-category-badge">—</span>
                </div>
                <div class="text-xs text-neutral-400 mt-0.5 flex items-center gap-2">
                  <span>Document ID: <strong id="modal-doc-id" class="text-neutral-200 font-mono">—</strong></span>
                  <span>•</span>
                  <span>Format: <strong id="modal-doc-format" class="text-neutral-200 font-mono">PDF</strong></span>
                </div>
              </div>
            </div>
            <button id="btn-close-doc-modal" class="text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800 transition-colors">
              ✕
            </button>
          </div>

          <!-- MODAL BODY -->
          <div class="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs text-neutral-300">
            <div class="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <span class="text-neutral-500 block text-[10px]">Reference Number:</span>
                  <span id="modal-doc-ref" class="font-mono font-bold text-white text-xs">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">Related Record ID:</span>
                  <span id="modal-doc-related" class="font-mono text-neutral-300">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">Café Location:</span>
                  <span id="modal-doc-cafe" class="font-semibold text-cyan-300">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">Document Date:</span>
                  <span id="modal-doc-date" class="font-mono text-neutral-300">—</span>
                </div>
              </div>
              <div class="pt-2 border-t border-neutral-800">
                <span class="text-neutral-500 block text-[10px]">Description & Commercial Context:</span>
                <p id="modal-doc-desc" class="text-neutral-300 text-xs mt-0.5">—</p>
              </div>
            </div>

            <!-- SECURITY / IMMUTABILITY STRIP -->
            <div class="p-3 rounded-xl border border-neutral-800 bg-neutral-950/80 text-[11px] text-neutral-400 flex items-start gap-2.5">
              <span class="text-base text-blue-400">🛡️</span>
              <p>
                <strong>System Certified Read-Only Copy:</strong> This document represents an authoritative commercial record registered within the Zamorin Hospitality ERP system. All files are immutable and cryptographically indexed.
              </p>
            </div>
          </div>

          <!-- MODAL FOOTER -->
          <div class="p-4 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between">
            <span class="text-[11px] text-neutral-500">Read-Only Vendor Record • Zamorin Café ERP</span>
            <div class="flex items-center gap-2">
              <button id="btn-modal-download-file" class="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow flex items-center gap-1.5 transition-all">
                <span>📥</span> Download File
              </button>
              <button id="btn-modal-close-footer" class="px-3 py-1.5 text-xs font-semibold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>

        </div>
      </div>

    </div>
  `;
}

export async function initVendorDocuments() {
  const container = document.getElementById("vendor-documents-container");
  if (!container) return;

  wireEvents();
  await loadVendorIdentityAndCafes();
  await loadVendorDocuments();
}

function wireEvents() {
  const btnExportXlsx = document.getElementById("btn-export-documents-xlsx");
  const btnRefresh = document.getElementById("btn-refresh-documents");
  const selectCafe = document.getElementById("select-cafe-scope");
  const inputSearch = document.getElementById("input-documents-search");
  const selectCategory = document.getElementById("select-document-category");
  const selectDateRange = document.getElementById("select-document-date-range");
  const selectSort = document.getElementById("select-document-sort");

  btnExportXlsx?.addEventListener("click", handleExportExcel);
  btnRefresh?.addEventListener("click", () => {
    loadVendorDocuments();
  });

  selectCafe?.addEventListener("change", (e) => {
    currentSelectedCafe = e.target.value;
    loadVendorDocuments();
  });

  let debounceTimer = null;
  inputSearch?.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearchTerm = e.target.value.trim();
      loadVendorDocuments();
    }, 300);
  });

  selectCategory?.addEventListener("change", (e) => {
    currentSelectedCategory = e.target.value;
    loadVendorDocuments();
  });

  selectDateRange?.addEventListener("change", (e) => {
    currentSelectedDateRange = e.target.value;
    loadVendorDocuments();
  });

  selectSort?.addEventListener("change", (e) => {
    currentSortBy = e.target.value;
    loadVendorDocuments();
  });

  document.getElementById("btn-close-doc-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-modal-close-footer")?.addEventListener("click", closeModal);
}

function closeModal() {
  const modal = document.getElementById("vendor-document-detail-modal");
  if (modal) modal.classList.add("hidden");
}

async function loadVendorIdentityAndCafes() {
  try {
    const res = await api.get("/api/v1/vendor/me");
    if (res && res.success && res.data) {
      const { vendor, authorizedCafes } = res.data;

      const compName = document.getElementById("vendor-company-name");
      if (compName && vendor) {
        compName.innerHTML = `<span>${vendor.tradeName || vendor.name || 'Vendor Documents'}</span>`;
      }

      const idBadge = document.getElementById("vendor-id-badge");
      if (idBadge && vendor) idBadge.textContent = vendor.vendorId;

      const gstBadge = document.getElementById("vendor-gst-badge");
      if (gstBadge && vendor) gstBadge.textContent = `GST: ${vendor.gstNumber || 'Unregistered'}`;

      const selectCafe = document.getElementById("select-cafe-scope");
      if (selectCafe && Array.isArray(authorizedCafes)) {
        selectCafe.innerHTML = `<option value="ALL">All Authorized Cafés (${authorizedCafes.length})</option>`;
        authorizedCafes.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.cafeId;
          opt.textContent = `${c.name || c.displayName || c.cafeId} (${c.cafeId})`;
          selectCafe.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.error("[VEN-SCR-010] Failed to load vendor identity:", err);
  }
}

async function loadVendorDocuments() {
  const contentArea = document.getElementById("documents-content-area");
  if (!contentArea) return;

  contentArea.innerHTML = `
    <div class="p-8 text-center text-neutral-400 bg-neutral-900/40 rounded-xl border border-neutral-800">
      <div class="inline-block animate-spin text-2xl mb-2">🔄</div>
      <p class="text-xs">Loading commercial documents...</p>
    </div>
  `;

  try {
    const queryParams = new URLSearchParams({
      cafeId: currentSelectedCafe,
      category: currentSelectedCategory,
      dateRange: currentSelectedDateRange,
      sortBy: currentSortBy,
      page: String(currentPage),
      limit: String(currentLimit),
    });

    if (currentSearchTerm) {
      queryParams.append("search", currentSearchTerm);
    }

    const res = await api.get(`/api/v1/vendor/documents?${queryParams.toString()}`);
    if (!res || !res.success) {
      throw new Error(res?.message || "Failed to load documents");
    }

    currentDocumentsData = res;
    renderSummaryKpis(res.summary);
    renderDocumentsRegister(res.data, contentArea);

    const countBadge = document.getElementById("badge-total-documents-count");
    if (countBadge) {
      countBadge.textContent = `${res.pagination?.totalCount ?? res.data?.length ?? 0} Documents Total`;
    }
  } catch (err) {
    console.error("[VEN-SCR-010] Error loading documents:", err);
    contentArea.innerHTML = `
      <div class="p-8 text-center bg-rose-950/20 border border-rose-800/40 rounded-xl text-rose-300">
        <span class="text-2xl block mb-2">⚠️</span>
        <h4 class="font-bold text-sm">Failed to Load Documents Register</h4>
        <p class="text-xs mt-1 text-rose-400">${err.message || 'An unexpected error occurred.'}</p>
        <button id="btn-retry-docs" class="mt-4 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold border border-neutral-700">
          Retry
        </button>
      </div>
    `;
    document.getElementById("btn-retry-docs")?.addEventListener("click", loadVendorDocuments);
  }
}

function renderSummaryKpis(summary = {}) {
  const valTotal = document.getElementById("val-total-documents");
  const valPoGrn = document.getElementById("val-po-grn-docs");
  const valFinanceTax = document.getElementById("val-finance-tax-docs");
  const valAgreements = document.getElementById("val-agreements-docs");
  const valCafes = document.getElementById("val-authorized-cafes");

  if (valTotal) valTotal.textContent = Number(summary.totalDocuments || 0).toLocaleString("en-IN");
  if (valPoGrn) valPoGrn.textContent = Number(summary.poAndGrnDocuments || 0).toLocaleString("en-IN");
  if (valFinanceTax) valFinanceTax.textContent = Number(summary.financialAndTaxDocuments || 0).toLocaleString("en-IN");
  if (valAgreements) valAgreements.textContent = Number(summary.agreementsDocuments || 0).toLocaleString("en-IN");
  if (valCafes) valCafes.textContent = Number(summary.authorizedCafesCount || 0).toLocaleString("en-IN");
}

function renderDocumentsRegister(documents = [], container) {
  if (!documents || documents.length === 0) {
    container.innerHTML = `
      <div class="p-12 text-center bg-neutral-900/40 rounded-xl border border-neutral-800 text-neutral-400 space-y-3">
        <span class="text-3xl block">📁</span>
        <h4 class="font-bold text-sm text-neutral-200">No Documents Found</h4>
        <p class="text-xs max-w-md mx-auto text-neutral-400">
          No commercial records match the selected filter criteria or search query. Adjust the filters above.
        </p>
      </div>
    `;
    return;
  }

  // DESKTOP TABLE + MOBILE CARDS
  container.innerHTML = `
    <!-- DESKTOP TABLE -->
    <div class="hidden md:block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/70 backdrop-blur-md shadow-xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-neutral-800 bg-neutral-950/80 text-neutral-400 uppercase text-[10px] tracking-wider">
              <th class="py-3 px-3.5 font-bold">Document Title & Details</th>
              <th class="py-3 px-3.5 font-bold">Category</th>
              <th class="py-3 px-3.5 font-bold">Reference #</th>
              <th class="py-3 px-3.5 font-bold">Related Record</th>
              <th class="py-3 px-3.5 font-bold">Café Location</th>
              <th class="py-3 px-3.5 font-bold">Date</th>
              <th class="py-3 px-3.5 font-bold text-center">Format</th>
              <th class="py-3 px-3.5 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody id="documents-table-tbody" class="divide-y divide-neutral-800/60 text-neutral-200 font-sans">
            <!-- Injected via helper -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- MOBILE CARDS -->
    <div id="documents-mobile-list" class="grid grid-cols-1 gap-3 md:hidden">
      <!-- Injected via helper -->
    </div>
  `;

  const tbody = document.getElementById("documents-table-tbody");
  const mobileList = document.getElementById("documents-mobile-list");

  documents.forEach((d) => {
    // 1. Desktop Table Row
    const tr = document.createElement("tr");
    tr.className = "hover:bg-neutral-800/40 transition-colors group";
    tr.innerHTML = `
      <td class="py-3 px-3.5">
        <div class="font-bold text-white text-xs">${escapeHtml(d.title)}</div>
        <div class="text-[10px] text-neutral-400 truncate max-w-xs">${escapeHtml(d.description || '')}</div>
      </td>
      <td class="py-3 px-3.5">
        ${getCategoryBadge(d.category)}
      </td>
      <td class="py-3 px-3.5 font-mono text-[11px] text-blue-300 font-semibold">
        ${escapeHtml(d.referenceNumber || '—')}
      </td>
      <td class="py-3 px-3.5 font-mono text-[11px] text-neutral-400">
        ${escapeHtml(d.relatedId || '—')}
      </td>
      <td class="py-3 px-3.5 text-neutral-300 text-[11px]">
        ${escapeHtml(d.cafeName || d.cafeId || 'All Cafés')}
      </td>
      <td class="py-3 px-3.5 font-mono text-[11px] text-neutral-300">
        ${formatDate(d.documentDate)}
      </td>
      <td class="py-3 px-3.5 text-center font-mono text-[10px] text-neutral-400">
        <span class="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700">${escapeHtml(d.fileType || 'PDF')}</span>
      </td>
      <td class="py-3 px-3.5 text-right space-x-1">
        <button class="btn-doc-details px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 text-[10px] font-semibold transition-all" data-doc-id="${escapeHtml(d.docId)}">
          Details
        </button>
        <button class="btn-doc-download px-2.5 py-1 bg-blue-950/70 hover:bg-blue-900 text-blue-300 rounded border border-blue-800/50 text-[10px] font-semibold transition-all" data-download-url="${escapeHtml(d.downloadUrl)}" data-filename="${escapeHtml(d.referenceNumber || d.docId)}.pdf">
          📥 Download
        </button>
      </td>
    `;
    tbody.appendChild(tr);

    // 2. Mobile Card
    const card = document.createElement("div");
    card.className = "p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-3 shadow-md";
    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <span class="font-mono text-[10px] text-blue-400">${escapeHtml(d.referenceNumber || d.docId)}</span>
          <h4 class="font-bold text-white text-sm mt-0.5">${escapeHtml(d.title)}</h4>
          <span class="text-[10px] text-neutral-400">${escapeHtml(d.cafeName || 'All Cafés')}</span>
        </div>
        ${getCategoryBadge(d.category)}
      </div>
      <div class="text-[11px] text-neutral-300 pt-1 border-t border-neutral-800">
        ${escapeHtml(d.description || '')}
      </div>
      <div class="flex items-center justify-between pt-2 border-t border-neutral-800/60 text-xs">
        <span class="text-neutral-400 font-mono text-[10px]">${formatDate(d.documentDate)}</span>
        <div class="flex gap-2">
          <button class="btn-doc-details px-2.5 py-1 bg-neutral-800 text-neutral-200 rounded border border-neutral-700 text-xs font-semibold" data-doc-id="${escapeHtml(d.docId)}">
            Details
          </button>
          <button class="btn-doc-download px-2.5 py-1 bg-blue-900 text-blue-200 rounded border border-blue-700 text-xs font-semibold" data-download-url="${escapeHtml(d.downloadUrl)}" data-filename="${escapeHtml(d.referenceNumber || d.docId)}.pdf">
            📥 Download
          </button>
        </div>
      </div>
    `;
    mobileList.appendChild(card);
  });

  // Wire buttons
  container.querySelectorAll(".btn-doc-details").forEach((btn) => {
    btn.addEventListener("click", () => {
      const docId = btn.getAttribute("data-doc-id");
      showDocumentModal(docId);
    });
  });

  container.querySelectorAll(".btn-doc-download").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-download-url");
      const filename = btn.getAttribute("data-filename");
      downloadDocumentFile(url, filename);
    });
  });
}

function showDocumentModal(docId) {
  if (!currentDocumentsData || !currentDocumentsData.data) return;
  const doc = currentDocumentsData.data.find((d) => d.docId === docId);
  if (!doc) return;

  const modal = document.getElementById("vendor-document-detail-modal");
  if (!modal) return;

  modal.classList.remove("hidden");

  document.getElementById("modal-doc-title").textContent = doc.title;
  document.getElementById("modal-doc-category-badge").innerHTML = getCategoryBadge(doc.category);
  document.getElementById("modal-doc-id").textContent = doc.docId;
  document.getElementById("modal-doc-format").textContent = doc.fileType || 'PDF';
  document.getElementById("modal-doc-ref").textContent = doc.referenceNumber || '—';
  document.getElementById("modal-doc-related").textContent = doc.relatedId || '—';
  document.getElementById("modal-doc-cafe").textContent = doc.cafeName || doc.cafeId || 'All Cafés';
  document.getElementById("modal-doc-date").textContent = formatDate(doc.documentDate);
  document.getElementById("modal-doc-desc").textContent = doc.description || 'No additional commercial notes.';

  const btnDownload = document.getElementById("btn-modal-download-file");
  if (btnDownload) {
    btnDownload.onclick = () => {
      downloadDocumentFile(doc.downloadUrl, `${doc.referenceNumber || doc.docId}.pdf`);
    };
  }
}

async function downloadDocumentFile(downloadUrl, filename = "document.pdf") {
  if (!downloadUrl) return;
  try {
    const blob = await downloadBlob(downloadUrl);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[VEN-SCR-010] Error downloading document:", err);
    alert("Failed to download document file. Please retry.");
  }
}

async function handleExportExcel() {
  try {
    const queryParams = new URLSearchParams({
      cafeId: currentSelectedCafe,
      category: currentSelectedCategory,
      dateRange: currentSelectedDateRange,
    });
    if (currentSearchTerm) {
      queryParams.append("search", currentSearchTerm);
    }

    const blob = await downloadBlob(`/api/v1/vendor/documents/csv?${queryParams.toString()}`);
    const text = await blob.text();
    const xlsxBlob = new Blob([text], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;" });
    const url = window.URL.createObjectURL(xlsxBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VendorDocuments-${currentSelectedCafe}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[VEN-SCR-010] Error exporting Excel:", err);
    alert("Failed to export documents Excel. Please retry.");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

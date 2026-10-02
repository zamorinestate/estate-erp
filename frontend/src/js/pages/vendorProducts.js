// =============================================================================
// ZAMORIN CAFÉ ERP — VEN-SCR-009: PRODUCTS & APPROVED PRICING
//
// Authoritative, strictly read-only visibility into approved vendor catalogue:
// - Contracted procurement purchase rates (INR / Paisa)
// - Tax classifications (GST % and HSN / SAC codes)
// - Packaging specifications, UOMs, MOQs, and delivery lead times
// - Historical price revisions and agreement references
// - 4 Summary KPI Cards: Total Products, Active Products, Categories, Avg Lead Time
// - Multi-criteria filtering: Category, status, café scope, sorting
// - Universal search: Item code, vendor SKU, product name, category, brand
// - 6-Zone detail view with historical rate progression
// - Official Vector A4 PDF Rate Schedule and standard CSV exports
// - Strict margin redaction: Zero retail prices, markups, or competitor rates
// - Zero vendor mutation capability (strict read-only access)
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentProductsData = null;
let currentSelectedCafe = "ALL";
let currentSelectedCategory = "ALL";
let currentSelectedStatus = "ALL";
let currentSearchTerm = "";
let currentSortBy = "name_asc";
let currentPage = 1;
let currentLimit = 50;

function formatCurrency(paisa) {
  const amount = Number(paisa || 0) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === "N/A" || dateStr === "Present") return dateStr || "—";
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

export function renderVendorProducts() {
  return `
    <div id="vendor-products-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-950/40 via-purple-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center font-bold text-lg border border-violet-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-violet-300">READ-ONLY PRODUCTS & APPROVED PRICING</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-violet-500/20 text-violet-200 border border-violet-500/40">VEN-SCR-009</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Authoritative visibility into contracted procurement rates, packaging specifications, and historical rate schedules. Retail margins are strictly redacted.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-export-products-xlsx" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
            <span>📥</span> Export Excel
          </button>
          <button id="btn-refresh-products" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
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
            <span>Products & Approved Pricing</span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span id="vendor-id-badge" class="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 font-semibold">—</span>
            <span id="vendor-gst-badge" class="px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono text-[11px]">—</span>
            <span id="badge-total-products-count" class="px-2.5 py-1 rounded-md bg-violet-950/60 text-violet-300 border border-violet-800/50 text-[11px] font-semibold">0 Products Listed</span>
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

      <!-- 4 AUTHORITATIVE SUMMARY KPI CARDS -->
      <section aria-label="Product Summary Metrics" class="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
        
        <!-- CARD 1: TOTAL PRODUCTS -->
        <div id="card-total-products" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-violet-900/40 relative overflow-hidden group hover:border-violet-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-violet-400 uppercase tracking-wider flex items-center justify-between">
            <span>Total Products</span>
            <span class="text-violet-500/60 text-base">📦</span>
          </div>
          <div id="val-total-products" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Approved supplier items</div>
        </div>

        <!-- CARD 2: ACTIVE PRODUCTS -->
        <div id="card-active-products" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-emerald-900/40 relative overflow-hidden group hover:border-emerald-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
            <span>Active Items</span>
            <span class="text-emerald-500/60 text-base">✅</span>
          </div>
          <div id="val-active-products" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Procurement active</div>
        </div>

        <!-- CARD 3: CATEGORIES -->
        <div id="card-categories-count" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-cyan-900/40 relative overflow-hidden group hover:border-cyan-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
            <span>Categories</span>
            <span class="text-cyan-500/60 text-base">🏷️</span>
          </div>
          <div id="val-categories-count" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Product classifications</div>
        </div>

        <!-- CARD 4: AVG LEAD TIME -->
        <div id="card-avg-lead-time" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-blue-900/40 relative overflow-hidden group hover:border-blue-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center justify-between">
            <span>Avg Lead Time</span>
            <span class="text-blue-500/60 text-base">⏱️</span>
          </div>
          <div id="val-avg-lead-time" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0 d</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Average fulfillment window</div>
        </div>

      </section>

      <!-- MULTI-CRITERIA FILTER & SEARCH TOOLBAR -->
      <section class="filter-toolbar bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 backdrop-blur-md shadow-lg flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        
        <!-- SEARCH INPUT -->
        <div class="relative flex-1">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 text-sm">🔍</span>
          <input 
            type="text" 
            id="input-products-search" 
            placeholder="Search by Item Code, Vendor SKU, Product Name, Category, Brand..." 
            class="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 transition-colors shadow-inner"
          />
        </div>

        <!-- FILTER GROUP -->
        <div class="flex flex-wrap items-center gap-2.5">
          
          <!-- CATEGORY FILTER -->
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-neutral-400 uppercase">Category:</span>
            <select id="select-product-category" class="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
              <option value="ALL">All Categories</option>
            </select>
          </div>

          <!-- STATUS FILTER -->
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-neutral-400 uppercase">Status:</span>
            <select id="select-product-status" class="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="DISCONTINUED">Discontinued</option>
            </select>
          </div>

          <!-- SORT SELECTOR -->
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-neutral-400 uppercase">Sort:</span>
            <select id="select-product-sort" class="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500">
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="price_asc">Price (Low to High)</option>
              <option value="price_desc">Price (High to Low)</option>
              <option value="lead_time">Lead Time (Fastest)</option>
            </select>
          </div>

        </div>
      </section>

      <!-- PRODUCTS REGISTER CONTENT AREA -->
      <main id="products-content-area" class="space-y-4">
        <!-- Injected via JavaScript: Loading, Empty, or Table/Card views -->
        <div class="p-8 text-center text-neutral-400 bg-neutral-900/40 rounded-xl border border-neutral-800">
          <div class="inline-block animate-spin text-2xl mb-2">🔄</div>
          <p class="text-xs">Loading approved products and rate schedules...</p>
        </div>
      </main>

      <!-- 6-ZONE PRODUCT DETAIL MODAL (INITIALLY HIDDEN) -->
      <div id="vendor-product-detail-modal" class="hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div class="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
          
          <!-- MODAL HEADER -->
          <div class="p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-violet-950/60 border border-violet-800/60 flex items-center justify-center text-violet-400 text-lg font-bold">
                🏷️
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 id="modal-product-name" class="text-base sm:text-lg font-black text-white leading-tight">Product Specification</h3>
                  <span id="modal-product-status-badge" class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800">ACTIVE</span>
                </div>
                <div class="text-xs text-neutral-400 mt-0.5 flex items-center gap-2">
                  <span>Item ID: <strong id="modal-product-item-id" class="text-neutral-200 font-mono">—</strong></span>
                  <span>•</span>
                  <span>Vendor SKU: <strong id="modal-product-vendor-sku" class="text-neutral-200 font-mono">—</strong></span>
                </div>
              </div>
            </div>
            <button id="btn-close-product-modal" class="text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800 transition-colors">
              ✕
            </button>
          </div>

          <!-- MODAL BODY: 6 ZONES -->
          <div class="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-neutral-300">
            
            <!-- ZONE 1: PRODUCT IDENTITY -->
            <div class="zone-card p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
              <div class="text-[11px] font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>ZONE 1</span>
                <span class="text-neutral-600">•</span>
                <span>PRODUCT IDENTITY & CLASSIFICATION</span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <span class="text-neutral-500 block text-[10px]">Brand / Supplier:</span>
                  <span id="modal-brand" class="font-semibold text-neutral-200">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">Category:</span>
                  <span id="modal-category" class="font-semibold text-neutral-200">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">Agreement Validity:</span>
                  <span id="modal-validity" class="font-semibold text-neutral-200">—</span>
                </div>
              </div>
            </div>

            <!-- ZONE 2: PROCUREMENT SPECIFICATIONS -->
            <div class="zone-card p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
              <div class="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>ZONE 2</span>
                <span class="text-neutral-600">•</span>
                <span>PACKAGING & PROCUREMENT SPECIFICATIONS</span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <span class="text-neutral-500 block text-[10px]">Unit of Measure (UOM):</span>
                  <span id="modal-uom" class="font-semibold text-neutral-200 font-mono">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">Pack Size:</span>
                  <span id="modal-pack-size" class="font-semibold text-neutral-200">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">Min. Order Qty (MOQ):</span>
                  <span id="modal-moq" class="font-semibold text-neutral-200 font-mono">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">Fulfillment Lead Time:</span>
                  <span id="modal-lead-time" class="font-semibold text-neutral-200 font-mono">—</span>
                </div>
              </div>
            </div>

            <!-- ZONE 3: APPROVED PRICING & TAXATION -->
            <div class="zone-card p-4 rounded-xl bg-neutral-950/60 border border-emerald-900/40 bg-gradient-to-br from-emerald-950/20 to-neutral-950 space-y-2">
              <div class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>ZONE 3</span>
                <span class="text-neutral-600">•</span>
                <span>APPROVED PROCUREMENT RATE & TAXATION</span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <span class="text-neutral-500 block text-[10px]">Approved Purchase Rate:</span>
                  <span id="modal-approved-rate" class="font-bold text-emerald-300 font-mono text-sm">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">GST Rate (%):</span>
                  <span id="modal-gst-rate" class="font-semibold text-neutral-200 font-mono">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">HSN / SAC Code:</span>
                  <span id="modal-hsn-sac" class="font-semibold text-neutral-200 font-mono">—</span>
                </div>
                <div>
                  <span class="text-neutral-500 block text-[10px]">Rate Effective Date:</span>
                  <span id="modal-effective-date" class="font-semibold text-neutral-200">—</span>
                </div>
              </div>
            </div>

            <!-- ZONE 4: APPLICABLE CAFÉS -->
            <div class="zone-card p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
              <div class="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>ZONE 4</span>
                <span class="text-neutral-600">•</span>
                <span>AUTHORIZED CAFÉ LOCATIONS</span>
              </div>
              <div id="modal-applicable-cafes" class="flex flex-wrap gap-2 pt-1">
                <span class="text-neutral-500">Loading authorized cafés...</span>
              </div>
            </div>

            <!-- ZONE 5: HISTORICAL PRICE REVISIONS -->
            <div class="zone-card p-4 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
              <div class="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>ZONE 5</span>
                <span class="text-neutral-600">•</span>
                <span>RATE REVISION AUDIT TRAIL</span>
              </div>
              <div id="modal-price-history-container" class="pt-1">
                <table class="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr class="border-b border-neutral-800 text-neutral-400">
                      <th class="py-1.5 font-semibold">Effective Period</th>
                      <th class="py-1.5 font-semibold">Approved Rate</th>
                      <th class="py-1.5 font-semibold">Previous Rate</th>
                      <th class="py-1.5 font-semibold">Revision Reason</th>
                      <th class="py-1.5 font-semibold">Agreement Ref</th>
                    </tr>
                  </thead>
                  <tbody id="modal-price-history-tbody" class="divide-y divide-neutral-900">
                    <!-- Injected rows -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- ZONE 6: STATUTORY & MARGIN REDACTION NOTICE -->
            <div class="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/80 text-[11px] text-neutral-400 flex items-start gap-2.5">
              <span class="text-base text-violet-400">🛡️</span>
              <p>
                <strong>Strict Confidentiality & Margin Redaction:</strong> This rate schedule constitutes authoritative procurement pricing agreed between the vendor and Zamorin Hospitality Private Limited. Internal markups, retail menu pricing, contribution margins, and competitor rates are strictly excluded in accordance with commercial data governance protocols.
              </p>
            </div>

          </div>

          <!-- MODAL FOOTER -->
          <div class="p-4 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between">
            <span class="text-[11px] text-neutral-500">Read-Only Vendor Record • Zamorin Café ERP</span>
            <div class="flex items-center gap-2">
              <button id="btn-modal-download-product-pdf" class="px-3.5 py-1.5 text-xs font-semibold text-violet-200 bg-violet-950 hover:bg-violet-900 border border-violet-800 rounded-lg shadow flex items-center gap-1.5 transition-all">
                <span>📄</span> Download Rate Schedule PDF
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

export async function initVendorProducts() {
  const container = document.getElementById("vendor-products-container");
  if (!container) return;

  wireEvents();
  await loadVendorIdentityAndCafes();
  await loadVendorProducts();
}

function wireEvents() {
  const btnExportXlsx = document.getElementById("btn-export-products-xlsx");
  const btnRefresh = document.getElementById("btn-refresh-products");
  const selectCafe = document.getElementById("select-cafe-scope");
  const inputSearch = document.getElementById("input-products-search");
  const selectCategory = document.getElementById("select-product-category");
  const selectStatus = document.getElementById("select-product-status");
  const selectSort = document.getElementById("select-product-sort");

  btnExportXlsx?.addEventListener("click", handleExportExcel);
  btnRefresh?.addEventListener("click", () => {
    loadVendorProducts();
  });

  selectCafe?.addEventListener("change", (e) => {
    currentSelectedCafe = e.target.value;
    loadVendorProducts();
  });

  let debounceTimer = null;
  inputSearch?.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearchTerm = e.target.value.trim();
      loadVendorProducts();
    }, 300);
  });

  selectCategory?.addEventListener("change", (e) => {
    currentSelectedCategory = e.target.value;
    loadVendorProducts();
  });

  selectStatus?.addEventListener("change", (e) => {
    currentSelectedStatus = e.target.value;
    loadVendorProducts();
  });

  selectSort?.addEventListener("change", (e) => {
    currentSortBy = e.target.value;
    loadVendorProducts();
  });

  // Modal close handlers
  document.getElementById("btn-close-product-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-modal-close-footer")?.addEventListener("click", closeModal);
}

function closeModal() {
  const modal = document.getElementById("vendor-product-detail-modal");
  if (modal) modal.classList.add("hidden");
}

async function loadVendorIdentityAndCafes() {
  try {
    const res = await api.get("/api/v1/vendor/me");
    if (res && res.success && res.data) {
      const { vendor, authorizedCafes } = res.data;
      
      const compName = document.getElementById("vendor-company-name");
      if (compName && vendor) {
        compName.innerHTML = `<span>${vendor.tradeName || vendor.name || 'Vendor Catalogue'}</span>`;
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
    console.error("[VEN-SCR-009] Failed to load vendor identity:", err);
  }
}

async function loadVendorProducts() {
  const contentArea = document.getElementById("products-content-area");
  if (!contentArea) return;

  contentArea.innerHTML = `
    <div class="p-8 text-center text-neutral-400 bg-neutral-900/40 rounded-xl border border-neutral-800">
      <div class="inline-block animate-spin text-2xl mb-2">🔄</div>
      <p class="text-xs">Loading approved products and rate schedules...</p>
    </div>
  `;

  try {
    const queryParams = new URLSearchParams({
      cafeId: currentSelectedCafe,
      category: currentSelectedCategory,
      status: currentSelectedStatus,
      sortBy: currentSortBy,
      page: String(currentPage),
      limit: String(currentLimit),
    });

    if (currentSearchTerm) {
      queryParams.append("search", currentSearchTerm);
    }

    const res = await api.get(`/api/v1/vendor/products?${queryParams.toString()}`);
    if (!res || !res.success) {
      throw new Error(res?.message || "Failed to load products");
    }

    currentProductsData = res;
    renderSummaryKpis(res.summary);
    populateCategoryFilter(res.data);
    renderProductsRegister(res.data, contentArea);

    const countBadge = document.getElementById("badge-total-products-count");
    if (countBadge) {
      countBadge.textContent = `${res.pagination?.totalCount ?? res.data?.length ?? 0} Products Listed`;
    }
  } catch (err) {
    console.error("[VEN-SCR-009] Error loading products:", err);
    contentArea.innerHTML = `
      <div class="p-8 text-center bg-rose-950/20 border border-rose-800/40 rounded-xl text-rose-300">
        <span class="text-2xl block mb-2">⚠️</span>
        <h4 class="font-bold text-sm">Failed to Load Products Register</h4>
        <p class="text-xs mt-1 text-rose-400">${err.message || 'An unexpected error occurred.'}</p>
        <button id="btn-retry-products" class="mt-4 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold border border-neutral-700">
          Retry
        </button>
      </div>
    `;
    document.getElementById("btn-retry-products")?.addEventListener("click", loadVendorProducts);
  }
}

function renderSummaryKpis(summary = {}) {
  const valTotal = document.getElementById("val-total-products");
  const valActive = document.getElementById("val-active-products");
  const valCategories = document.getElementById("val-categories-count");
  const valLeadTime = document.getElementById("val-avg-lead-time");

  if (valTotal) valTotal.textContent = Number(summary.totalProducts || 0).toLocaleString("en-IN");
  if (valActive) valActive.textContent = Number(summary.activeProducts || 0).toLocaleString("en-IN");
  if (valCategories) valCategories.textContent = Number(summary.categoriesCount || 0).toLocaleString("en-IN");
  if (valLeadTime) valLeadTime.textContent = `${Number(summary.averageLeadTimeDays || 0).toFixed(1)} d`;
}

function populateCategoryFilter(products = []) {
  const selectCategory = document.getElementById("select-product-category");
  if (!selectCategory || selectCategory.options.length > 1) return;

  const cats = new Set();
  products.forEach((p) => {
    if (p.category) cats.add(p.category);
  });

  cats.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    selectCategory.appendChild(opt);
  });
}

function renderProductsRegister(products = [], container) {
  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="p-12 text-center bg-neutral-900/40 rounded-xl border border-neutral-800 text-neutral-400 space-y-3">
        <span class="text-3xl block">📦</span>
        <h4 class="font-bold text-sm text-neutral-200">No Products Found</h4>
        <p class="text-xs max-w-md mx-auto text-neutral-400">
          No approved products matched your filter criteria or search query. Adjust the filters or search term above.
        </p>
      </div>
    `;
    return;
  }

  // DESKTOP TABLE VIEW + MOBILE CARDS
  container.innerHTML = `
    <!-- DESKTOP TABLE (HIDDEN ON MOBILE) -->
    <div class="hidden md:block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/70 backdrop-blur-md shadow-xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-neutral-800 bg-neutral-950/80 text-neutral-400 uppercase text-[10px] tracking-wider">
              <th class="py-3 px-3.5 font-bold">Item Code / SKU</th>
              <th class="py-3 px-3.5 font-bold">Product Name & Category</th>
              <th class="py-3 px-3.5 font-bold">UOM & Pack Size</th>
              <th class="py-3 px-3.5 font-bold">HSN / SAC</th>
              <th class="py-3 px-3.5 font-bold">GST %</th>
              <th class="py-3 px-3.5 font-bold text-right">Approved Rate</th>
              <th class="py-3 px-3.5 font-bold text-center">MOQ</th>
              <th class="py-3 px-3.5 font-bold text-center">Lead Time</th>
              <th class="py-3 px-3.5 font-bold text-center">Status</th>
              <th class="py-3 px-3.5 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody id="products-table-tbody" class="divide-y divide-neutral-800/60 text-neutral-200 font-sans">
            <!-- Injected via helper -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- MOBILE CARDS (HIDDEN ON DESKTOP) -->
    <div id="products-mobile-list" class="grid grid-cols-1 gap-3 md:hidden">
      <!-- Injected via helper -->
    </div>
  `;

  const tbody = document.getElementById("products-table-tbody");
  const mobileList = document.getElementById("products-mobile-list");

  products.forEach((p) => {
    const rateDisplay = formatCurrency(p.approvedPurchaseRatePaisa);
    const statusClass = p.status === 'ACTIVE' 
      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
      : 'bg-neutral-800 text-neutral-400 border-neutral-700';

    // 1. Table Row
    const tr = document.createElement("tr");
    tr.className = "hover:bg-neutral-800/40 transition-colors group";
    tr.innerHTML = `
      <td class="py-3 px-3.5">
        <div class="font-mono font-bold text-violet-300 text-xs">${escapeHtml(p.itemId)}</div>
        <div class="font-mono text-[10px] text-neutral-500">SKU: ${escapeHtml(p.vendorSku || p.itemId)}</div>
      </td>
      <td class="py-3 px-3.5">
        <div class="font-bold text-white text-xs">${escapeHtml(p.productName)}</div>
        <div class="text-[10px] text-neutral-400">${escapeHtml(p.category)} • ${escapeHtml(p.brand || 'Supplier')}</div>
      </td>
      <td class="py-3 px-3.5 font-mono text-[11px] text-neutral-300">
        <div>${escapeHtml(p.uom)}</div>
        <div class="text-[10px] text-neutral-500">${escapeHtml(p.packSize)}</div>
      </td>
      <td class="py-3 px-3.5 font-mono text-[11px] text-neutral-400">
        ${escapeHtml(p.hsnSac || '—')}
      </td>
      <td class="py-3 px-3.5 font-mono text-[11px] text-neutral-300">
        ${p.gstRatePercent !== undefined ? p.gstRatePercent : 5}%
      </td>
      <td class="py-3 px-3.5 text-right font-mono font-bold text-emerald-400 text-xs">
        ${rateDisplay}
      </td>
      <td class="py-3 px-3.5 text-center font-mono text-[11px] text-neutral-300">
        ${p.moq || 1}
      </td>
      <td class="py-3 px-3.5 text-center font-mono text-[11px] text-neutral-300">
        ${p.leadTimeDays || 2} d
      </td>
      <td class="py-3 px-3.5 text-center">
        <span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded border ${statusClass}">
          ${p.status || 'ACTIVE'}
        </span>
      </td>
      <td class="py-3 px-3.5 text-right space-x-1">
        <button class="btn-view-details px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 text-[10px] font-semibold transition-all" data-item-id="${escapeHtml(p.itemId)}">
          Specs & Rates
        </button>
        <button class="btn-download-pdf px-2 py-1 bg-violet-950/60 hover:bg-violet-900 text-violet-300 rounded border border-violet-800/50 text-[10px] font-semibold transition-all" data-item-id="${escapeHtml(p.itemId)}" title="Download PDF Rate Schedule">
          📄 PDF
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
          <span class="font-mono text-xs font-bold text-violet-400">${escapeHtml(p.itemId)}</span>
          <h4 class="font-bold text-white text-sm mt-0.5">${escapeHtml(p.productName)}</h4>
          <span class="text-[10px] text-neutral-400">${escapeHtml(p.category)}</span>
        </div>
        <span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded border ${statusClass}">
          ${p.status || 'ACTIVE'}
        </span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-neutral-800/80">
        <div>
          <span class="text-neutral-500 block text-[10px]">Approved Rate:</span>
          <span class="font-mono font-bold text-emerald-400">${rateDisplay} / ${escapeHtml(p.uom)}</span>
        </div>
        <div>
          <span class="text-neutral-500 block text-[10px]">Pack / MOQ:</span>
          <span class="font-mono text-neutral-300">${escapeHtml(p.packSize)} (MOQ: ${p.moq || 1})</span>
        </div>
      </div>
      <div class="flex items-center justify-between pt-2 border-t border-neutral-800/60">
        <span class="text-[10px] text-neutral-400 font-mono">Lead Time: ${p.leadTimeDays || 2} Days</span>
        <div class="flex gap-2">
          <button class="btn-view-details px-2.5 py-1 bg-neutral-800 text-neutral-200 rounded border border-neutral-700 text-xs font-semibold" data-item-id="${escapeHtml(p.itemId)}">
            Specs & Rates
          </button>
          <button class="btn-download-pdf px-2 py-1 bg-violet-950 text-violet-300 rounded border border-violet-800 text-xs font-semibold" data-item-id="${escapeHtml(p.itemId)}">
            📄 PDF
          </button>
        </div>
      </div>
    `;
    mobileList.appendChild(card);
  });

  // Attach action listeners
  container.querySelectorAll(".btn-view-details").forEach((btn) => {
    btn.addEventListener("click", () => {
      const itemId = btn.getAttribute("data-item-id");
      showProductDetails(itemId);
    });
  });

  container.querySelectorAll(".btn-download-pdf").forEach((btn) => {
    btn.addEventListener("click", () => {
      const itemId = btn.getAttribute("data-item-id");
      downloadProductRatePdf(itemId);
    });
  });
}

async function showProductDetails(itemId) {
  if (!itemId) return;

  const modal = document.getElementById("vendor-product-detail-modal");
  if (!modal) return;

  modal.classList.remove("hidden");

  // Reset modal values
  document.getElementById("modal-product-name").textContent = "Loading...";
  document.getElementById("modal-product-item-id").textContent = itemId;
  document.getElementById("modal-product-vendor-sku").textContent = "—";
  document.getElementById("modal-approved-rate").textContent = "—";
  document.getElementById("modal-applicable-cafes").innerHTML = '<span class="text-neutral-500">Loading authorized cafés...</span>';
  document.getElementById("modal-price-history-tbody").innerHTML = '';

  try {
    const res = await api.get(`/api/v1/vendor/products/${itemId}`);
    if (!res || !res.success || !res.data) {
      throw new Error(res?.message || "Failed to load product details");
    }

    const { itemIdentity, procurementSpec, pricingAndTax, applicableCafes, priceHistory } = res.data;

    // Header & Zone 1
    document.getElementById("modal-product-name").textContent = itemIdentity.productName || itemId;
    document.getElementById("modal-product-item-id").textContent = itemIdentity.itemId || itemId;
    document.getElementById("modal-product-vendor-sku").textContent = itemIdentity.vendorSku || itemId;
    document.getElementById("modal-brand").textContent = itemIdentity.brand || 'Commercial Supplier';
    document.getElementById("modal-category").textContent = itemIdentity.category || 'FOOD_BEVERAGE';
    document.getElementById("modal-validity").textContent = pricingAndTax.priceValidity || 'Active Agreement';

    const statusBadge = document.getElementById("modal-product-status-badge");
    if (statusBadge) {
      statusBadge.textContent = itemIdentity.status || 'ACTIVE';
      statusBadge.className = itemIdentity.status === 'ACTIVE'
        ? 'px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800'
        : 'px-2 py-0.5 text-[10px] font-bold rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700';
    }

    // Zone 2: Procurement Specs
    document.getElementById("modal-uom").textContent = procurementSpec.uom || 'UNIT';
    document.getElementById("modal-pack-size").textContent = procurementSpec.packSize || '1 UNIT';
    document.getElementById("modal-moq").textContent = procurementSpec.moq || 1;
    document.getElementById("modal-lead-time").textContent = `${procurementSpec.leadTimeDays || 2} Days`;

    // Zone 3: Pricing & Tax
    document.getElementById("modal-approved-rate").textContent = `${formatCurrency(pricingAndTax.approvedPurchaseRatePaisa)} / ${procurementSpec.uom || 'UNIT'}`;
    document.getElementById("modal-gst-rate").textContent = `${pricingAndTax.gstRatePercent !== undefined ? pricingAndTax.gstRatePercent : 5}%`;
    document.getElementById("modal-hsn-sac").textContent = pricingAndTax.hsnSac || 'N/A';
    document.getElementById("modal-effective-date").textContent = formatDate(pricingAndTax.effectiveDate);

    // Zone 4: Applicable Cafés
    const cafesDiv = document.getElementById("modal-applicable-cafes");
    if (cafesDiv) {
      if (Array.isArray(applicableCafes) && applicableCafes.length > 0) {
        cafesDiv.innerHTML = applicableCafes.map((c) => `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 font-mono text-[11px] text-cyan-300">
            <span>📍</span>
            <span>${escapeHtml(c.cafeName || c.cafeId)}</span>
          </span>
        `).join('');
      } else {
        cafesDiv.innerHTML = '<span class="text-neutral-500">All Authorized Cafés</span>';
      }
    }

    // Zone 5: Price History
    const historyTbody = document.getElementById("modal-price-history-tbody");
    if (historyTbody) {
      if (Array.isArray(priceHistory) && priceHistory.length > 0) {
        historyTbody.innerHTML = priceHistory.map((ph) => `
          <tr class="hover:bg-neutral-900/60 transition-colors">
            <td class="py-2 text-neutral-300 font-mono">${formatDate(ph.effectiveFrom)} → ${formatDate(ph.effectiveTo)}</td>
            <td class="py-2 font-mono font-bold text-emerald-400">${formatCurrency(ph.approvedRatePaisa)}</td>
            <td class="py-2 font-mono text-neutral-400">${ph.previousRatePaisa !== null ? formatCurrency(ph.previousRatePaisa) : '—'}</td>
            <td class="py-2 text-neutral-300">${escapeHtml(ph.changeReason || 'Rate update')}</td>
            <td class="py-2 font-mono text-neutral-400">${escapeHtml(ph.agreementReference || 'Contract')}</td>
          </tr>
        `).join('');
      } else {
        historyTbody.innerHTML = `
          <tr>
            <td colspan="5" class="py-3 text-center text-neutral-500">No historical rate revisions recorded. Current rate is initial agreement.</td>
          </tr>
        `;
      }
    }

    // Wire Modal PDF download button
    const btnModalPdf = document.getElementById("btn-modal-download-product-pdf");
    if (btnModalPdf) {
      btnModalPdf.onclick = () => downloadProductRatePdf(itemId);
    }

  } catch (err) {
    console.error("[VEN-SCR-009] Error loading product details:", err);
    document.getElementById("modal-product-name").textContent = "Error loading details";
  }
}

async function downloadProductRatePdf(itemId) {
  if (!itemId) return;
  try {
    const blob = await downloadBlob(`/api/v1/vendor/products/${itemId}/pdf`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RateSchedule-${itemId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[VEN-SCR-009] Error downloading product PDF:", err);
    alert("Failed to download PDF rate schedule. Please retry.");
  }
}

async function handleExportExcel() {
  try {
    const queryParams = new URLSearchParams({
      cafeId: currentSelectedCafe,
      category: currentSelectedCategory,
      status: currentSelectedStatus,
    });
    if (currentSearchTerm) {
      queryParams.append("search", currentSearchTerm);
    }

    const blob = await downloadBlob(`/api/v1/vendor/products/csv?${queryParams.toString()}`);
    const text = await blob.text();
    const xlsxBlob = new Blob([text], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;" });
    const url = window.URL.createObjectURL(xlsxBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VendorProducts-${currentSelectedCafe}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[VEN-SCR-009] Error exporting Excel:", err);
    alert("Failed to export products Excel. Please retry.");
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

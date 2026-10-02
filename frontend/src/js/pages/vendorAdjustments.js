// =============================================================================
// ZAMORIN CAFE ERP — VEN-SCR-008: RETURNS, DEBIT NOTES, CREDIT NOTES & ADJUSTMENTS
//
// Authoritative, strictly read-only visibility into commercial adjustments:
// - Physical Returns from rejected delivery receipts
// - Statutory Debit Notes & Credit Notes
// - Rate Adjustments, Quantity Adjustments & Authorised Holds
// - 9 Summary KPI Cards: Total Returns, Return Value, Debit Notes, Debit Note Value,
//   Credit Notes, Credit Note Value, Other Adjustments, Open & Completed Adjustments
// - Multi-criteria filtering: Transaction family, status, café scope, sorting
// - Universal search: Reference, PO, GRN, invoice number, reason, café
// - 6-Zone detail view with affected item breakdowns and financial effects
// - Official Vector A4 PDF and standard CSV exports
// - Zero vendor mutation capability (strict read-only access)
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentAdjustmentsData = null;
let currentSelectedCafe = "ALL";
let currentSelectedType = "ALL";
let currentSelectedStatus = "ALL";
let currentSearchTerm = "";
let currentSortBy = "date_desc";
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

export function renderVendorAdjustments() {
  return `
    <div id="vendor-adjustments-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-rose-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-lg border border-rose-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-rose-300">READ-ONLY RETURNS & COMMERCIAL ADJUSTMENTS</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-rose-500/20 text-rose-200 border border-rose-500/40">VEN-SCR-008</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Transparent visibility into goods returns, debit notes, credit notes, and commercial adjustments resulting from procurement.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-export-adjustments-xlsx" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
            <span>📥</span> Export Excel
          </button>
          <button id="btn-refresh-adjustments" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
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
            <span>Returns, Notes & Adjustments</span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span id="vendor-id-badge" class="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 font-semibold">—</span>
            <span id="vendor-gst-badge" class="px-2.5 py-1 rounded-md bg-neutral-800/60 text-neutral-300 border border-neutral-700/50 font-mono text-[11px]">—</span>
            <span id="badge-total-adjustments-count" class="px-2.5 py-1 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/50 text-[11px] font-semibold">0 Adjustments</span>
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

      <!-- 9 AUTHORITATIVE SUMMARY KPI CARDS -->
      <section aria-label="Adjustment Summary Metrics" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        
        <!-- CARD 1: TOTAL RETURNS -->
        <div id="card-total-returns" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-amber-900/40 relative overflow-hidden group hover:border-amber-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
            <span>Total Returns</span>
            <span class="text-amber-500/60 text-base">📦</span>
          </div>
          <div id="val-total-returns" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Physical goods returns</div>
        </div>

        <!-- CARD 2: RETURN VALUE -->
        <div id="card-return-value" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-amber-900/40 relative overflow-hidden group hover:border-amber-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center justify-between">
            <span>Return Value</span>
            <span class="text-amber-500/60 text-base">₹</span>
          </div>
          <div id="val-return-value" class="text-xl sm:text-2xl font-black text-amber-200 mt-1.5 font-mono">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Rejected goods value</div>
        </div>

        <!-- CARD 3: DEBIT NOTES -->
        <div id="card-debit-notes" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-rose-900/40 relative overflow-hidden group hover:border-rose-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-rose-400 uppercase tracking-wider flex items-center justify-between">
            <span>Debit Notes</span>
            <span class="text-rose-500/60 text-base">📝</span>
          </div>
          <div id="val-debit-notes" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Direct debit entries</div>
        </div>

        <!-- CARD 4: DEBIT NOTE VALUE -->
        <div id="card-debit-note-val" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-rose-900/40 relative overflow-hidden group hover:border-rose-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-rose-300 uppercase tracking-wider flex items-center justify-between">
            <span>Debit Note Value</span>
            <span class="text-rose-500/60 text-base">₹</span>
          </div>
          <div id="val-debit-note-val" class="text-xl sm:text-2xl font-black text-rose-200 mt-1.5 font-mono">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Payable reduction</div>
        </div>

        <!-- CARD 5: CREDIT NOTES -->
        <div id="card-credit-notes" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-emerald-900/40 relative overflow-hidden group hover:border-emerald-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
            <span>Credit Notes</span>
            <span class="text-emerald-500/60 text-base">📑</span>
          </div>
          <div id="val-credit-notes" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Issued credit notes</div>
        </div>

        <!-- CARD 6: CREDIT NOTE VALUE -->
        <div id="card-credit-note-val" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-emerald-900/40 relative overflow-hidden group hover:border-emerald-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-emerald-300 uppercase tracking-wider flex items-center justify-between">
            <span>Credit Note Value</span>
            <span class="text-emerald-500/60 text-base">₹</span>
          </div>
          <div id="val-credit-note-val" class="text-xl sm:text-2xl font-black text-emerald-200 mt-1.5 font-mono">₹0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Applied credit relief</div>
        </div>

        <!-- CARD 7: OTHER ADJUSTMENTS -->
        <div id="card-other-adjustments" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-sky-900/40 relative overflow-hidden group hover:border-sky-700/60 transition-all shadow-md">
          <div class="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center justify-between">
            <span>Other Adjustments</span>
            <span class="text-sky-500/60 text-base">⚖️</span>
          </div>
          <div id="val-other-adjustments" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Holds & rate variances</div>
        </div>

        <!-- CARD 8: OPEN ADJUSTMENTS -->
        <div id="card-open-adjustments" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-amber-900/30 relative overflow-hidden group hover:border-amber-700/50 transition-all shadow-md">
          <div class="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center justify-between">
            <span>Open Adjustments</span>
            <span class="text-amber-500/60 text-base">⏳</span>
          </div>
          <div id="val-open-adjustments" class="text-xl sm:text-2xl font-black text-amber-300 mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Pending / on-hold</div>
        </div>

        <!-- CARD 9: COMPLETED ADJUSTMENTS -->
        <div id="card-completed-adjustments" class="kpi-card p-4 rounded-xl bg-neutral-900/60 border border-teal-900/40 relative overflow-hidden group hover:border-teal-700/60 transition-all shadow-md col-span-2 sm:col-span-1">
          <div class="text-[11px] font-bold text-teal-400 uppercase tracking-wider flex items-center justify-between">
            <span>Completed</span>
            <span class="text-teal-500/60 text-base">✅</span>
          </div>
          <div id="val-completed-adjustments" class="text-xl sm:text-2xl font-black text-white mt-1.5 font-mono">0</div>
          <div class="text-[10px] text-neutral-400 mt-0.5">Applied / settled</div>
        </div>

      </section>

      <!-- FILTER & SEARCH CONTROLS -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <!-- SEARCH INPUT -->
        <div class="flex-1 relative">
          <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500 text-sm">🔍</span>
          <input 
            type="text" 
            id="input-search-adjustments" 
            placeholder="Search reference, PO, GRN, invoice number, reason, café..." 
            class="w-full pl-10 pr-4 py-2.5 bg-neutral-950 border border-neutral-700/80 rounded-xl text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all shadow-inner"
          />
        </div>

        <!-- DROPDOWN FILTERS -->
        <div class="flex flex-wrap items-center gap-2.5">
          <!-- TYPE FILTER -->
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-neutral-400 font-semibold">Type:</span>
            <select id="select-type-filter" class="bg-neutral-950 border border-neutral-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Types</option>
              <option value="GOODS_RETURN">Goods Return</option>
              <option value="DEBIT_NOTE">Debit Note</option>
              <option value="CREDIT_NOTE">Credit Note</option>
              <option value="RATE_ADJUSTMENT">Rate Adjustment</option>
              <option value="QUANTITY_ADJUSTMENT">Quantity Adjustment</option>
              <option value="OTHER_ADJUSTMENT">Other Adjustments</option>
            </select>
          </div>

          <!-- STATUS FILTER -->
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-neutral-400 font-semibold">Status:</span>
            <select id="select-status-filter" class="bg-neutral-950 border border-neutral-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="ALL">All Statuses</option>
              <option value="APPLIED">Applied</option>
              <option value="SETTLED">Settled</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="OPEN">Open</option>
            </select>
          </div>

          <!-- SORT FILTER -->
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-neutral-400 font-semibold">Sort:</span>
            <select id="select-sort-filter" class="bg-neutral-950 border border-neutral-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-white focus:outline-none focus:border-primary-500 shadow-inner">
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="amount_desc">Amount (Highest First)</option>
              <option value="amount_asc">Amount (Lowest First)</option>
            </select>
          </div>
        </div>
      </section>

      <!-- ADJUSTMENTS REGISTER (TABLE / CARDS) -->
      <section class="bg-neutral-900/80 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl">
        <div class="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold text-white tracking-wide">Adjustments Register</h2>
            <span id="badge-filtered-count" class="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[11px] font-mono font-bold">0 records</span>
          </div>
          <div class="text-[11px] text-neutral-400 font-medium hidden sm:block">
            Immutable subledger & physical delivery records
          </div>
        </div>

        <!-- DESKTOP TABLE -->
        <div class="hidden lg:block overflow-x-auto">
          <table id="table-adjustments-desktop" class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-neutral-800 bg-neutral-950/60 text-[11px] uppercase tracking-wider text-neutral-400 font-bold">
                <th class="py-3 px-4">Reference</th>
                <th class="py-3 px-4">Type</th>
                <th class="py-3 px-4">Date</th>
                <th class="py-3 px-4">Café</th>
                <th class="py-3 px-4">PO / GRN</th>
                <th class="py-3 px-4">Invoice</th>
                <th class="py-3 px-4 text-right">Amount</th>
                <th class="py-3 px-4">Reason</th>
                <th class="py-3 px-4 text-center">Status</th>
                <th class="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody id="tbody-adjustments" class="divide-y divide-neutral-800/70 text-xs text-neutral-300 font-normal">
              <tr>
                <td colspan="10" class="py-12 text-center text-neutral-500 font-medium">Loading adjustments register...</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- MOBILE CARDS -->
        <div id="cards-adjustments-mobile" class="block lg:hidden p-4 space-y-3">
          <div class="py-12 text-center text-neutral-500 font-medium">Loading adjustments register...</div>
        </div>

        <!-- EMPTY STATE -->
        <div id="empty-adjustments-state" class="hidden p-12 text-center">
          <div class="w-16 h-16 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 text-neutral-400 flex items-center justify-center mx-auto text-2xl mb-3 shadow-inner">
            ⚖️
          </div>
          <h3 class="text-sm font-bold text-white tracking-wide">No Adjustments Found</h3>
          <p class="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">There are no physical returns, debit notes, or accounting adjustments matching the selected criteria.</p>
        </div>
      </section>

      <!-- 6-ZONE ADJUSTMENT DETAIL MODAL -->
      <div id="modal-adjustment-detail" class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm hidden">
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
          
          <!-- MODAL HEADER -->
          <div class="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-900/95 backdrop-blur z-10">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm border border-indigo-500/40">
                ⚖️
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 id="modal-title-ref" class="text-sm sm:text-base font-black text-white font-mono">—</h3>
                  <span id="modal-badge-status" class="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-neutral-800 text-neutral-200 border border-neutral-700">STATUS</span>
                </div>
                <p id="modal-subtitle-type" class="text-xs text-neutral-400 mt-0.5">Adjustment Record</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-modal-download-pdf" class="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 shadow">
                <span>📄</span> Download PDF
              </button>
              <button id="btn-close-adjustment-modal" class="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center text-sm font-bold transition-all">
                ✕
              </button>
            </div>
          </div>

          <!-- MODAL BODY: 6 AUTHORITATIVE ZONES -->
          <div class="p-5 sm:p-6 space-y-5 flex-1">
            
            <!-- ZONE 1 & 2: IDENTITY & FINANCIAL EFFECT -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <!-- ZONE 1: IDENTITY -->
              <div class="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5">
                <span class="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">Zone 1 • Identity & Scope</span>
                <div class="space-y-1.5 text-xs">
                  <div class="flex justify-between">
                    <span class="text-neutral-400">Reference:</span>
                    <span id="detail-ref" class="font-mono text-white font-bold">—</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-neutral-400">Transaction Family:</span>
                    <span id="detail-type" class="text-white font-semibold">—</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-neutral-400">Record Date:</span>
                    <span id="detail-date" class="text-white font-mono">—</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-neutral-400">Issuing Café:</span>
                    <span id="detail-cafe" class="text-white font-semibold">—</span>
                  </div>
                </div>
              </div>

              <!-- ZONE 2: FINANCIAL EFFECT -->
              <div class="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5">
                <span class="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">Zone 2 • Accounting Direction</span>
                <div class="space-y-1.5 text-xs">
                  <div class="flex justify-between items-baseline">
                    <span class="text-neutral-400">Adjustment Amount:</span>
                    <span id="detail-amount" class="text-base font-black text-rose-300 font-mono">₹0</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-neutral-400">Accounting Direction:</span>
                    <span id="detail-direction" class="font-bold text-amber-300 font-mono uppercase">—</span>
                  </div>
                  <div class="p-2 rounded bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-300">
                    <span class="font-semibold text-neutral-200">Balance Effect:</span>
                    <span id="detail-effect" class="block mt-0.5 text-neutral-300">—</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ZONE 3: REFERENCE CHAIN -->
            <div class="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5">
              <span class="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">Zone 3 • Procurement Reference Chain</span>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div class="p-2.5 rounded bg-neutral-900/80 border border-neutral-800">
                  <span class="text-[10px] text-neutral-500 block">Purchase Order</span>
                  <span id="detail-po" class="font-mono text-white font-semibold block mt-0.5">—</span>
                </div>
                <div class="p-2.5 rounded bg-neutral-900/80 border border-neutral-800">
                  <span class="text-[10px] text-neutral-500 block">GRN Receipt</span>
                  <span id="detail-grn" class="font-mono text-white font-semibold block mt-0.5">—</span>
                </div>
                <div class="p-2.5 rounded bg-neutral-900/80 border border-neutral-800">
                  <span class="text-[10px] text-neutral-500 block">Supplier Invoice</span>
                  <span id="detail-invoice" class="font-mono text-white font-semibold block mt-0.5">—</span>
                </div>
              </div>
            </div>

            <!-- ZONE 4: AFFECTED LINE ITEMS (IF GOODS RETURN) -->
            <div id="modal-zone-items" class="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5 hidden">
              <span class="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">Zone 4 • Affected Line Items & Returned Quantities</span>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="border-b border-neutral-800 text-[10px] uppercase text-neutral-400 font-bold">
                      <th class="py-2 px-2">Item ID</th>
                      <th class="py-2 px-2">Description</th>
                      <th class="py-2 px-2 text-right">Qty</th>
                      <th class="py-2 px-2 text-right">Unit Price</th>
                      <th class="py-2 px-2 text-right">Total</th>
                      <th class="py-2 px-2">Reason / Disposition</th>
                    </tr>
                  </thead>
                  <tbody id="detail-items-tbody" class="divide-y divide-neutral-800 text-neutral-300">
                    <!-- Populated dynamically -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- ZONE 5: AUTHORISED REASON -->
            <div class="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1.5">
              <span class="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">Zone 5 • Authorised Commercial Reason</span>
              <p id="detail-reason" class="text-xs text-neutral-200 leading-relaxed font-normal bg-neutral-900 p-2.5 rounded border border-neutral-800">
                —
              </p>
            </div>

            <!-- ZONE 6: STATUTORY DOCUMENTS & TIMELINE -->
            <div class="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5">
              <span class="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">Zone 6 • Audit Timeline & Document Reference</span>
              <div id="detail-timeline-container" class="space-y-2 text-xs">
                <!-- Timeline items -->
              </div>
            </div>

          </div>

          <!-- MODAL FOOTER -->
          <div class="p-4 border-t border-neutral-800 flex justify-end bg-neutral-900 sticky bottom-0">
            <button id="btn-modal-close-footer" class="px-4 py-2 text-xs font-semibold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-all">
              Close
            </button>
          </div>

        </div>
      </div>

    </div>
  `;
}

export async function initVendorAdjustments() {
  const container = document.getElementById("vendor-adjustments-container");
  if (!container) return;

  // Load Vendor Identity & Scope
  try {
    const meRes = await api.get("/api/v1/vendor/me");
    if (meRes?.success && meRes?.data) {
      const v = meRes.data;
      const compName = document.getElementById("vendor-company-name");
      const idBadge = document.getElementById("vendor-id-badge");
      const gstBadge = document.getElementById("vendor-gst-badge");
      const cafeSelect = document.getElementById("select-cafe-scope");

      if (compName) compName.innerHTML = `<span>Returns, Notes & Adjustments</span> <span class="text-xs font-normal text-neutral-400">(${v.name || v.vendorId})</span>`;
      if (idBadge) idBadge.textContent = v.vendorId || "—";
      if (gstBadge) gstBadge.textContent = `GST: ${v.gstNumber || "Unregistered"}`;

      if (cafeSelect && Array.isArray(v.approvedCafes)) {
        cafeSelect.innerHTML = `<option value="ALL">All Authorized Cafés</option>` +
          v.approvedCafes.map((c) => `<option value="${c.cafeId}">${c.cafeName || c.cafeId}</option>`).join("");
      }
    }
  } catch (err) {
    console.error("Failed to load vendor identity:", err);
  }

  // Wire Event Listeners
  const cafeSelect = document.getElementById("select-cafe-scope");
  if (cafeSelect) {
    cafeSelect.addEventListener("change", (e) => {
      currentSelectedCafe = e.target.value;
      currentPage = 1;
      fetchAndRenderAdjustments();
    });
  }

  const typeSelect = document.getElementById("select-type-filter");
  if (typeSelect) {
    typeSelect.addEventListener("change", (e) => {
      currentSelectedType = e.target.value;
      currentPage = 1;
      fetchAndRenderAdjustments();
    });
  }

  const statusSelect = document.getElementById("select-status-filter");
  if (statusSelect) {
    statusSelect.addEventListener("change", (e) => {
      currentSelectedStatus = e.target.value;
      currentPage = 1;
      fetchAndRenderAdjustments();
    });
  }

  const sortSelect = document.getElementById("select-sort-filter");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      currentSortBy = e.target.value;
      fetchAndRenderAdjustments();
    });
  }

  const searchInput = document.getElementById("input-search-adjustments");
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearchTerm = e.target.value.trim();
        currentPage = 1;
        fetchAndRenderAdjustments();
      }, 300);
    });
  }

  const refreshBtn = document.getElementById("btn-refresh-adjustments");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      fetchAndRenderAdjustments();
    });
  }

  const exportXlsxBtn = document.getElementById("btn-export-adjustments-xlsx");
  if (exportXlsxBtn) {
    exportXlsxBtn.addEventListener("click", async () => {
      try {
        const queryParams = new URLSearchParams({
          cafeId: currentSelectedCafe,
          type: currentSelectedType,
          status: currentSelectedStatus,
          search: currentSearchTerm,
        });
        const blob = await api.getBlob(`/api/v1/vendor/adjustments/csv?${queryParams.toString()}`);
        const text = await blob.text();
        const xlsxBlob = new Blob([text], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;" });
        downloadBlob(xlsxBlob, `VendorAdjustments-${new Date().toISOString().slice(0, 10)}.xlsx`);
      } catch (err) {
        console.error("Excel export failed:", err);
      }
    });
  }

  // Modal Close Handlers
  const modal = document.getElementById("modal-adjustment-detail");
  const closeBtn = document.getElementById("btn-close-adjustment-modal");
  const closeFooterBtn = document.getElementById("btn-modal-close-footer");

  if (closeBtn) closeBtn.addEventListener("click", () => modal?.classList.add("hidden"));
  if (closeFooterBtn) closeFooterBtn.addEventListener("click", () => modal?.classList.add("hidden"));
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }

  // Initial Fetch
  await fetchAndRenderAdjustments();
}

async function fetchAndRenderAdjustments() {
  const tbody = document.getElementById("tbody-adjustments");
  const mobileContainer = document.getElementById("cards-adjustments-mobile");
  const emptyState = document.getElementById("empty-adjustments-state");
  const filteredBadge = document.getElementById("badge-filtered-count");

  try {
    const queryParams = new URLSearchParams({
      cafeId: currentSelectedCafe,
      type: currentSelectedType,
      status: currentSelectedStatus,
      search: currentSearchTerm,
      sortBy: currentSortBy,
      page: currentPage,
      limit: currentLimit,
    });

    const res = await api.get(`/api/v1/vendor/adjustments?${queryParams.toString()}`);
    if (!res?.success) throw new Error(res?.error?.message || "Failed to load adjustments");

    currentAdjustmentsData = res;
    const { summary, data: adjustments, pagination } = res;

    // Render 9 Summary KPI Cards
    if (summary) {
      updateKpiCard("val-total-returns", summary.totalReturns || 0);
      updateKpiCard("val-return-value", summary.returnValueFormatted || "₹0");
      updateKpiCard("val-debit-notes", summary.debitNotesCount || 0);
      updateKpiCard("val-debit-note-val", summary.debitNotesValueFormatted || "₹0");
      updateKpiCard("val-credit-notes", summary.creditNotesCount || 0);
      updateKpiCard("val-credit-note-val", summary.creditNotesValueFormatted || "₹0");
      updateKpiCard("val-other-adjustments", summary.otherAdjustmentsCount || 0);
      updateKpiCard("val-open-adjustments", summary.openAdjustmentsCount || 0);
      updateKpiCard("val-completed-adjustments", summary.completedAdjustmentsCount || 0);

      const totalCountBadge = document.getElementById("badge-total-adjustments-count");
      if (totalCountBadge) totalCountBadge.textContent = `${summary.totalAdjustmentsCount || 0} Adjustments`;
    }

    if (filteredBadge) filteredBadge.textContent = `${pagination?.totalCount || adjustments.length} records`;

    if (!adjustments || adjustments.length === 0) {
      if (tbody) tbody.innerHTML = "";
      if (mobileContainer) mobileContainer.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    // Render Desktop Table Rows
    if (tbody) {
      tbody.innerHTML = adjustments
        .map((adj) => {
          const typeBadge = getTypeBadge(adj.type, adj.typeLabel);
          const statusBadge = getStatusBadge(adj.status);
          const directionBadge = adj.accountingDirection === "DEBIT"
            ? `<span class="text-rose-400 font-mono text-[10px] font-bold">DR</span>`
            : adj.accountingDirection === "CREDIT"
            ? `<span class="text-emerald-400 font-mono text-[10px] font-bold">CR</span>`
            : `<span class="text-neutral-400 font-mono text-[10px] font-bold">MEMO</span>`;

          return `
            <tr class="hover:bg-neutral-800/40 transition-colors cursor-pointer group" data-adj-id="${adj.adjustmentId}">
              <td class="py-3 px-4 font-mono font-bold text-white group-hover:text-primary-300">
                ${escapeHtml(adj.reference)}
              </td>
              <td class="py-3 px-4">
                <div class="flex items-center gap-1.5">
                  ${typeBadge}
                  ${directionBadge}
                </div>
              </td>
              <td class="py-3 px-4 font-mono text-neutral-300 whitespace-nowrap">
                ${formatDate(adj.date)}
              </td>
              <td class="py-3 px-4 text-neutral-200">
                ${escapeHtml(adj.cafeName)}
              </td>
              <td class="py-3 px-4 font-mono text-neutral-400 text-[11px]">
                ${adj.purchaseOrderId ? escapeHtml(adj.purchaseOrderId) : "—"}
                ${adj.grnId ? `<span class="block text-[10px] text-neutral-500">${escapeHtml(adj.grnId)}</span>` : ""}
              </td>
              <td class="py-3 px-4 font-mono text-neutral-300 text-[11px]">
                ${adj.supplierInvoiceNumber ? escapeHtml(adj.supplierInvoiceNumber) : "—"}
              </td>
              <td class="py-3 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                ${adj.amountFormatted}
              </td>
              <td class="py-3 px-4 max-w-xs truncate text-neutral-400" title="${escapeHtml(adj.reason || '')}">
                ${escapeHtml(adj.reason || "—")}
              </td>
              <td class="py-3 px-4 text-center">
                ${statusBadge}
              </td>
              <td class="py-3 px-4 text-center whitespace-nowrap">
                <div class="flex items-center justify-center gap-1.5">
                  <button class="btn-view-adj-detail px-2 py-1 text-[11px] font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 transition-all" data-adj-id="${adj.adjustmentId}">
                    View
                  </button>
                  <button class="btn-download-adj-pdf px-2 py-1 text-[11px] font-semibold text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/80 rounded border border-indigo-800/60 transition-all" data-adj-id="${adj.adjustmentId}" title="Download PDF">
                    PDF
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("");

      // Wire Desktop Row Click Events
      tbody.querySelectorAll("tr").forEach((row) => {
        row.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          const adjId = row.getAttribute("data-adj-id");
          if (adjId) openAdjustmentDetailModal(adjId);
        });
      });

      tbody.querySelectorAll(".btn-view-adj-detail").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const adjId = btn.getAttribute("data-adj-id");
          if (adjId) openAdjustmentDetailModal(adjId);
        });
      });

      tbody.querySelectorAll(".btn-download-adj-pdf").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const adjId = btn.getAttribute("data-adj-id");
          if (adjId) downloadAdjustmentPdf(adjId);
        });
      });
    }

    // Render Mobile Cards
    if (mobileContainer) {
      mobileContainer.innerHTML = adjustments
        .map((adj) => {
          const typeBadge = getTypeBadge(adj.type, adj.typeLabel);
          const statusBadge = getStatusBadge(adj.status);

          return `
            <div class="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 hover:border-neutral-700 transition-all space-y-3" data-adj-id="${adj.adjustmentId}">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-bold text-white text-sm">${escapeHtml(adj.reference)}</span>
                  ${typeBadge}
                </div>
                ${statusBadge}
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span class="text-neutral-500 text-[10px] block">Date:</span>
                  <span class="font-mono text-neutral-300">${formatDate(adj.date)}</span>
                </div>
                <div>
                  <span class="text-neutral-500 text-[10px] block">Amount:</span>
                  <span class="font-mono font-bold text-white">${adj.amountFormatted}</span>
                </div>
                <div>
                  <span class="text-neutral-500 text-[10px] block">Café:</span>
                  <span class="text-neutral-300 truncate block">${escapeHtml(adj.cafeName)}</span>
                </div>
                <div>
                  <span class="text-neutral-500 text-[10px] block">PO / Invoice:</span>
                  <span class="font-mono text-neutral-400 text-[11px] block">${adj.purchaseOrderId || adj.supplierInvoiceNumber || "—"}</span>
                </div>
              </div>
              <div class="text-[11px] text-neutral-400 truncate">
                ${escapeHtml(adj.reason || "—")}
              </div>
              <div class="pt-2 border-t border-neutral-800/80 flex items-center justify-end gap-2">
                <button class="btn-mobile-view px-3 py-1 text-xs font-semibold text-neutral-200 bg-neutral-800 rounded border border-neutral-700" data-adj-id="${adj.adjustmentId}">
                  Details
                </button>
                <button class="btn-mobile-pdf px-3 py-1 text-xs font-semibold text-indigo-300 bg-indigo-950/60 rounded border border-indigo-800/60" data-adj-id="${adj.adjustmentId}">
                  PDF
                </button>
              </div>
            </div>
          `;
        })
        .join("");

      mobileContainer.querySelectorAll(".btn-mobile-view").forEach((btn) => {
        btn.addEventListener("click", () => {
          const adjId = btn.getAttribute("data-adj-id");
          if (adjId) openAdjustmentDetailModal(adjId);
        });
      });

      mobileContainer.querySelectorAll(".btn-mobile-pdf").forEach((btn) => {
        btn.addEventListener("click", () => {
          const adjId = btn.getAttribute("data-adj-id");
          if (adjId) downloadAdjustmentPdf(adjId);
        });
      });
    }

  } catch (err) {
    console.error("Failed to load adjustments:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-rose-400 font-medium">Failed to load adjustments: ${escapeHtml(err.message || 'Error')}</td></tr>`;
    }
  }
}

async function openAdjustmentDetailModal(adjustmentId) {
  const modal = document.getElementById("modal-adjustment-detail");
  if (!modal) return;

  try {
    const res = await api.get(`/api/v1/vendor/adjustments/${encodeURIComponent(adjustmentId)}`);
    if (!res?.success || !res?.data) throw new Error(res?.error?.message || "Adjustment details not found");

    const d = res.data;
    const { identity, financial, references, affectedItems, authorisedReason, timeline } = d;

    // Header
    const titleRef = document.getElementById("modal-title-ref");
    const subType = document.getElementById("modal-subtitle-type");
    const badgeStatus = document.getElementById("modal-badge-status");

    if (titleRef) titleRef.textContent = identity.reference || identity.adjustmentId;
    if (subType) subType.textContent = identity.typeLabel || identity.type;
    if (badgeStatus) {
      badgeStatus.className = `px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${getStatusClasses(identity.status)}`;
      badgeStatus.textContent = identity.status;
    }

    // Zone 1: Identity
    setModalText("detail-ref", identity.reference);
    setModalText("detail-type", identity.typeLabel);
    setModalText("detail-date", formatDate(identity.date));
    setModalText("detail-cafe", identity.cafeName);

    // Zone 2: Financial
    setModalText("detail-amount", financial.amountFormatted);
    setModalText("detail-direction", financial.accountingDirection);
    setModalText("detail-effect", financial.financialEffect);

    // Zone 3: References
    setModalText("detail-po", references.purchaseOrderId || "None");
    setModalText("detail-grn", references.grnId || "None");
    setModalText("detail-invoice", references.supplierInvoiceNumber ? `${references.supplierInvoiceNumber} (${references.invoiceDate || 'No date'})` : "None");

    // Zone 4: Affected Line Items
    const itemsZone = document.getElementById("modal-zone-items");
    const itemsTbody = document.getElementById("detail-items-tbody");
    if (itemsZone && itemsTbody) {
      if (affectedItems && affectedItems.length > 0) {
        itemsZone.classList.remove("hidden");
        itemsTbody.innerHTML = affectedItems
          .map(
            (item) => `
            <tr>
              <td class="py-2 px-2 font-mono text-neutral-400">${escapeHtml(item.itemId)}</td>
              <td class="py-2 px-2 font-medium text-white">${escapeHtml(item.itemName)}</td>
              <td class="py-2 px-2 text-right font-mono">${item.qty}</td>
              <td class="py-2 px-2 text-right font-mono">${formatCurrency(item.unitPricePaisa)}</td>
              <td class="py-2 px-2 text-right font-mono font-bold text-white">${formatCurrency(item.totalPaisa)}</td>
              <td class="py-2 px-2 text-neutral-400 text-[11px]">${escapeHtml(item.reason || item.disposition || '—')}</td>
            </tr>
          `
          )
          .join("");
      } else {
        itemsZone.classList.add("hidden");
      }
    }

    // Zone 5: Reason
    setModalText("detail-reason", authorisedReason || "No notes available.");

    // Zone 6: Timeline
    const timelineContainer = document.getElementById("detail-timeline-container");
    if (timelineContainer) {
      if (timeline && timeline.length > 0) {
        timelineContainer.innerHTML = timeline
          .map(
            (t) => `
            <div class="flex items-center gap-2 text-xs">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span class="font-semibold text-neutral-200">${escapeHtml(t.label)}</span>
              <span class="text-neutral-500 font-mono text-[11px]">• ${formatDate(t.timestamp)}</span>
            </div>
          `
          )
          .join("");
      } else {
        timelineContainer.innerHTML = `<span class="text-neutral-500 italic">No milestone events logged.</span>`;
      }
    }

    // Wire Modal PDF Download
    const modalPdfBtn = document.getElementById("btn-modal-download-pdf");
    if (modalPdfBtn) {
      modalPdfBtn.onclick = () => downloadAdjustmentPdf(identity.adjustmentId);
    }

    modal.classList.remove("hidden");
  } catch (err) {
    console.error("Failed to load adjustment details:", err);
  }
}

async function downloadAdjustmentPdf(adjustmentId) {
  try {
    const blob = await api.getBlob(`/api/v1/vendor/adjustments/${encodeURIComponent(adjustmentId)}/pdf`);
    downloadBlob(blob, `Adjustment-${adjustmentId}.pdf`);
  } catch (err) {
    console.error("PDF download failed:", err);
  }
}

function updateKpiCard(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = value;
}

function setModalText(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = text || "—";
}

function getTypeBadge(type, label) {
  const t = String(type || '').toUpperCase();
  if (t === 'GOODS_RETURN') {
    return `<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-950/70 text-amber-300 border border-amber-800/60">${label || 'Goods Return'}</span>`;
  }
  if (t === 'DEBIT_NOTE') {
    return `<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-rose-950/70 text-rose-300 border border-rose-800/60">${label || 'Debit Note'}</span>`;
  }
  if (t === 'CREDIT_NOTE') {
    return `<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">${label || 'Credit Note'}</span>`;
  }
  if (t === 'RATE_ADJUSTMENT') {
    return `<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-sky-950/70 text-sky-300 border border-sky-800/60">${label || 'Rate Adj'}</span>`;
  }
  if (t === 'QUANTITY_ADJUSTMENT') {
    return `<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-purple-950/70 text-purple-300 border border-purple-800/60">${label || 'Qty Adj'}</span>`;
  }
  return `<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-neutral-800 text-neutral-300 border border-neutral-700">${label || 'Adjustment'}</span>`;
}

function getStatusBadge(status) {
  const s = String(status || '').toUpperCase();
  const classes = getStatusClasses(s);
  return `<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${classes}">${s}</span>`;
}

function getStatusClasses(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'APPLIED' || s === 'SETTLED' || s === 'COMPLETED') {
    return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
  }
  if (s === 'ON_HOLD' || s === 'DISPUTED') {
    return 'bg-rose-950/60 text-rose-300 border-rose-800/60';
  }
  if (s === 'OPEN' || s === 'PENDING') {
    return 'bg-amber-950/60 text-amber-300 border-amber-800/60';
  }
  return 'bg-neutral-800 text-neutral-300 border-neutral-700';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

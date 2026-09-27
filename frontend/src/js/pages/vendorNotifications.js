// =============================================================================
// ZAMORIN CAFÉ ERP — VEN-SCR-012: NOTIFICATIONS & OPERATIONAL FEED
//
// Read-Only real-time operational dispatches, commercial alerts, and audit milestones:
// - 4 KPI Summary Cards: Total Notifications, Unread / New, Commercial Alerts, Operational Dispatches
// - Multi-criteria filtering: Café scope, category, priority, read status, date range
// - Universal text search: Title, message, reference entity ID
// - Safe deep link routing: Purchase Orders, Deliveries, Invoices, Payments, Adjustments, Documents
// - Safe RFC 4180 CSV export
// - Strictly read-only: Zero mutation forms or mark-as-read writes permitted
// =============================================================================

import { api, downloadBlob } from "../apiClient.js";
import { state } from "../state.js";

let currentNotificationsData = null;
let currentSelectedCafe = "ALL";
let currentSelectedCategory = "ALL";
let currentSelectedPriority = "ALL";
let currentSelectedReadStatus = "ALL";
let currentSelectedDateRange = "ALL";
let currentCustomStart = "";
let currentCustomEnd = "";
let currentSearchTerm = "";
let currentPage = 1;
let currentLimit = 20;

function getCategoryBadge(category) {
  const cat = String(category || "").toUpperCase();
  switch (cat) {
    case "COMMERCIAL":
    case "BILLING":
    case "PRICING":
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-indigo-950 text-indigo-300 border border-indigo-800">Commercial</span>';
    case "OPERATIONAL":
    case "DELIVERY":
    case "ORDER":
    case "GRN":
    case "LOGISTICS":
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-teal-950 text-teal-300 border border-teal-800">Operational</span>';
    case "FINANCE":
    case "PAYMENT":
    case "TAX":
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-950 text-emerald-300 border border-emerald-800">Finance</span>';
    case "COMPLIANCE":
    case "LEGAL":
    case "STATUTORY":
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-purple-950 text-purple-300 border border-purple-800">Compliance</span>';
    default:
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-neutral-800 text-neutral-300 border border-neutral-700">Notice</span>';
  }
}

function getPriorityBadge(priority) {
  const p = String(priority || "NORMAL").toUpperCase();
  switch (p) {
    case "CRITICAL":
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-red-950 text-red-300 border border-red-800 animate-pulse">Critical</span>';
    case "HIGH":
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-950 text-amber-300 border border-amber-800">High</span>';
    case "LOW":
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-neutral-800 text-neutral-400 border border-neutral-700">Low</span>';
    default:
      return '<span class="inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-blue-950 text-blue-300 border border-blue-800">Normal</span>';
  }
}

function getDeepLinkActionLabel(targetScreen) {
  switch (targetScreen) {
    case "vendor-orders":
      return "View Purchase Order →";
    case "vendor-deliveries":
      return "View Delivery / GRN →";
    case "vendor-invoices":
      return "View Invoice →";
    case "vendor-payments":
      return "View Payment Settlement →";
    case "vendor-adjustments":
      return "View Adjustment Note →";
    case "vendor-documents":
      return "View Documents Centre →";
    case "vendor-reports":
      return "View Commercial Reports →";
    default:
      return "Open Details →";
  }
}

export function renderVendorNotifications() {
  return `
    <div id="vendor-notifications-container" class="vendor-workspace-root min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      <!-- PERSISTENT READ-ONLY ACCESS BANNER -->
      <div class="read-only-strip flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-950/40 via-indigo-900/20 to-neutral-900/60 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-500/40 shadow-inner">
            🔒
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-300">READ-ONLY NOTIFICATIONS FEED</span>
              <span class="inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-blue-500/20 text-blue-200 border border-blue-500/40">VEN-SCR-012</span>
            </div>
            <p class="text-xs text-neutral-300 hidden sm:block">Real-time read-only operational dispatch events, commercial notices, and audit milestones.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-export-notifications-csv" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
            <span>📥</span> Export CSV
          </button>
          <button id="btn-refresh-notifications" class="px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all rounded-lg border border-neutral-700 flex items-center gap-1.5 shadow">
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
            <span>VENDOR COLLABORATION PORTAL</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">Notifications & Operational Dispatches</h1>
          <p class="text-xs sm:text-sm text-neutral-400 mt-1">Chronological alerts, PO dispatches, delivery verifications, payment settlements, and compliance events.</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="px-3.5 py-2 rounded-xl bg-neutral-800/80 border border-neutral-700 text-right">
            <span class="block text-[10px] text-neutral-400 uppercase font-semibold">Workspace Mode</span>
            <span class="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Feed • Read-Only
            </span>
          </div>
        </div>
      </header>

      <!-- 4 AUTHORITATIVE KPI SUMMARY CARDS -->
      <div id="vendor-notifications-kpi-grid" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- KPI 1: Total Notifications -->
        <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-md">
          <div class="flex items-center justify-between text-neutral-400 text-xs font-medium mb-1">
            <span>Total Alerts</span>
            <span class="text-base">🔔</span>
          </div>
          <div id="kpi-total-notifications" class="text-2xl sm:text-3xl font-bold text-white tracking-tight">0</div>
          <p class="text-[11px] text-neutral-400 mt-1">All audit notifications</p>
        </div>

        <!-- KPI 2: Unread / New Alerts -->
        <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-md">
          <div class="flex items-center justify-between text-neutral-400 text-xs font-medium mb-1">
            <span>Unread / New</span>
            <span class="text-base">✨</span>
          </div>
          <div id="kpi-unread-notifications" class="text-2xl sm:text-3xl font-bold text-blue-400 tracking-tight">0</div>
          <p class="text-[11px] text-neutral-400 mt-1">Pending review</p>
        </div>

        <!-- KPI 3: Commercial Alerts -->
        <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-md">
          <div class="flex items-center justify-between text-neutral-400 text-xs font-medium mb-1">
            <span>Commercial Alerts</span>
            <span class="text-base">💳</span>
          </div>
          <div id="kpi-commercial-alerts" class="text-2xl sm:text-3xl font-bold text-indigo-400 tracking-tight">0</div>
          <p class="text-[11px] text-neutral-400 mt-1">Invoices, payments & notes</p>
        </div>

        <!-- KPI 4: Operational Dispatches -->
        <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-md">
          <div class="flex items-center justify-between text-neutral-400 text-xs font-medium mb-1">
            <span>Operational Dispatches</span>
            <span class="text-base">📦</span>
          </div>
          <div id="kpi-operational-dispatches" class="text-2xl sm:text-3xl font-bold text-teal-400 tracking-tight">0</div>
          <p class="text-[11px] text-neutral-400 mt-1">Orders, delivery & intake</p>
        </div>
      </div>

      <!-- FILTER & SEARCH CONTROLS -->
      <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-md space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <!-- Café Scope Filter -->
          <div>
            <label for="sel-notification-cafe" class="block text-xs font-medium text-neutral-400 mb-1">Café Scope</label>
            <select id="sel-notification-cafe" class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="ALL">All Authorized Cafés</option>
            </select>
          </div>

          <!-- Category Filter -->
          <div>
            <label for="sel-notification-category" class="block text-xs font-medium text-neutral-400 mb-1">Category</label>
            <select id="sel-notification-category" class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="ALL">All Categories</option>
              <option value="COMMERCIAL">Commercial (Invoices / Bills)</option>
              <option value="OPERATIONAL">Operational (Orders / GRN)</option>
              <option value="FINANCE">Finance (Settlements / Payments)</option>
              <option value="COMPLIANCE">Compliance & Statutory</option>
            </select>
          </div>

          <!-- Priority Filter -->
          <div>
            <label for="sel-notification-priority" class="block text-xs font-medium text-neutral-400 mb-1">Priority</label>
            <select id="sel-notification-priority" class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical Alerts</option>
              <option value="HIGH">High Priority</option>
              <option value="NORMAL">Normal Priority</option>
              <option value="LOW">Low Priority</option>
            </select>
          </div>

          <!-- Read Status Filter -->
          <div>
            <label for="sel-notification-read" class="block text-xs font-medium text-neutral-400 mb-1">Status</label>
            <select id="sel-notification-read" class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="ALL">All Statuses</option>
              <option value="UNREAD">Unread / New Only</option>
              <option value="READ">Read / Historical</option>
            </select>
          </div>

          <!-- Date Period Filter -->
          <div>
            <label for="sel-notification-date" class="block text-xs font-medium text-neutral-400 mb-1">Time Range</label>
            <select id="sel-notification-date" class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="LAST_7_DAYS">Last 7 Days</option>
              <option value="LAST_30_DAYS">Last 30 Days</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="CUSTOM">Custom Date Range...</option>
            </select>
          </div>
        </div>

        <!-- Custom Date Range Row (Hidden by default) -->
        <div id="notification-custom-date-row" class="hidden pt-3 border-t border-neutral-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          <div>
            <label for="input-notification-start-date" class="block text-xs font-medium text-neutral-400 mb-1">Start Date</label>
            <input type="date" id="input-notification-start-date" class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label for="input-notification-end-date" class="block text-xs font-medium text-neutral-400 mb-1">End Date</label>
            <input type="date" id="input-notification-end-date" class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
          </div>
        </div>

        <!-- Universal Search Input -->
        <div class="relative">
          <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500 text-sm">🔍</span>
          <input
            type="text"
            id="input-notification-search"
            placeholder="Search alerts by title, message, reference PO, invoice or GRN..."
            class="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <!-- NOTIFICATIONS FEED CONTAINER -->
      <div class="bg-neutral-900/80 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        <div class="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-white uppercase tracking-wider">Operational Feed</span>
            <span id="notification-count-badge" class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">0 events</span>
          </div>
          <div class="text-xs text-neutral-500">
            Sorted by newest first
          </div>
        </div>

        <!-- Feed List -->
        <div id="notifications-feed-list" class="divide-y divide-neutral-800/60">
          <!-- Dynamic Items Rendered Here -->
        </div>

        <!-- Empty State -->
        <div id="notifications-empty-state" class="hidden p-12 text-center space-y-3">
          <div class="text-4xl">📭</div>
          <h3 class="text-sm font-semibold text-neutral-300">No Notifications Found</h3>
          <p class="text-xs text-neutral-500 max-w-sm mx-auto">No notifications match your active search filters or date range constraints.</p>
        </div>

        <!-- Pagination Controls -->
        <div class="px-5 py-4 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-400">
          <div id="notification-pagination-info">Showing 0 of 0 events</div>
          <div class="flex items-center gap-2">
            <button id="btn-notification-prev" class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed border border-neutral-700 transition">
              Previous
            </button>
            <span id="notification-page-indicator" class="font-mono px-2 py-1 bg-neutral-800/60 rounded text-neutral-300 border border-neutral-700/60">1</span>
            <button id="btn-notification-next" class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed border border-neutral-700 transition">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function initVendorNotifications() {
  const container = document.getElementById("vendor-notifications-container");
  if (!container) return;

  // Setup Event Listeners
  setupEventListeners();

  // Populate Cafes dropdown
  populateCafeFilter();

  // Fetch initial notifications data
  await loadVendorNotifications();
}

function setupEventListeners() {
  // Cafe Filter
  const cafeSel = document.getElementById("sel-notification-cafe");
  if (cafeSel) {
    cafeSel.addEventListener("change", (e) => {
      currentSelectedCafe = e.target.value;
      currentPage = 1;
      loadVendorNotifications();
    });
  }

  // Category Filter
  const catSel = document.getElementById("sel-notification-category");
  if (catSel) {
    catSel.addEventListener("change", (e) => {
      currentSelectedCategory = e.target.value;
      currentPage = 1;
      loadVendorNotifications();
    });
  }

  // Priority Filter
  const prioSel = document.getElementById("sel-notification-priority");
  if (prioSel) {
    prioSel.addEventListener("change", (e) => {
      currentSelectedPriority = e.target.value;
      currentPage = 1;
      loadVendorNotifications();
    });
  }

  // Read Status Filter
  const readSel = document.getElementById("sel-notification-read");
  if (readSel) {
    readSel.addEventListener("change", (e) => {
      currentSelectedReadStatus = e.target.value;
      currentPage = 1;
      loadVendorNotifications();
    });
  }

  // Date Filter
  const dateSel = document.getElementById("sel-notification-date");
  const customDateRow = document.getElementById("notification-custom-date-row");
  if (dateSel) {
    dateSel.addEventListener("change", (e) => {
      currentSelectedDateRange = e.target.value;
      if (currentSelectedDateRange === "CUSTOM") {
        customDateRow?.classList.remove("hidden");
      } else {
        customDateRow?.classList.add("hidden");
        currentCustomStart = "";
        currentCustomEnd = "";
        currentPage = 1;
        loadVendorNotifications();
      }
    });
  }

  // Custom Date inputs
  const startInput = document.getElementById("input-notification-start-date");
  const endInput = document.getElementById("input-notification-end-date");
  if (startInput && endInput) {
    const handleCustomChange = () => {
      currentCustomStart = startInput.value;
      currentCustomEnd = endInput.value;
      if (currentCustomStart && currentCustomEnd) {
        currentPage = 1;
        loadVendorNotifications();
      }
    };
    startInput.addEventListener("change", handleCustomChange);
    endInput.addEventListener("change", handleCustomChange);
  }

  // Search Input with Debounce
  const searchInput = document.getElementById("input-notification-search");
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearchTerm = e.target.value.trim();
        currentPage = 1;
        loadVendorNotifications();
      }, 300);
    });
  }

  // Pagination buttons
  const btnPrev = document.getElementById("btn-notification-prev");
  const btnNext = document.getElementById("btn-notification-next");
  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadVendorNotifications();
      }
    });
  }
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (currentNotificationsData?.pagination?.hasNext) {
        currentPage++;
        loadVendorNotifications();
      }
    });
  }

  // Refresh Button
  const btnRefresh = document.getElementById("btn-refresh-notifications");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      loadVendorNotifications();
    });
  }

  // CSV Export Button
  const btnExport = document.getElementById("btn-export-notifications-csv");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      exportNotificationsCsv();
    });
  }
}

function populateCafeFilter() {
  const sel = document.getElementById("sel-notification-cafe");
  if (!sel) return;

  const approvedCafes = state.approvedCafes || state.user?.approvedCafeIds || [];
  sel.innerHTML = '<option value="ALL">All Authorized Cafés</option>';

  if (Array.isArray(approvedCafes)) {
    approvedCafes.forEach((cafe) => {
      const opt = document.createElement("option");
      if (typeof cafe === "object" && cafe !== null) {
        opt.value = cafe.cafeId;
        opt.textContent = cafe.displayName || cafe.name || cafe.cafeId;
      } else {
        opt.value = cafe;
        opt.textContent = cafe;
      }
      sel.appendChild(opt);
    });
  }
}

async function loadVendorNotifications() {
  const feedList = document.getElementById("notifications-feed-list");
  const emptyState = document.getElementById("notifications-empty-state");
  if (!feedList) return;

  feedList.innerHTML = `
    <div class="p-8 text-center text-neutral-400">
      <div class="inline-block animate-spin text-xl mb-2">🔄</div>
      <p class="text-xs">Loading operational dispatches and alerts...</p>
    </div>
  `;
  emptyState?.classList.add("hidden");

  try {
    const params = new URLSearchParams();
    if (currentSelectedCafe && currentSelectedCafe !== "ALL") {
      params.append("cafeId", currentSelectedCafe);
    }
    if (currentSelectedCategory && currentSelectedCategory !== "ALL") {
      params.append("category", currentSelectedCategory);
    }
    if (currentSelectedPriority && currentSelectedPriority !== "ALL") {
      params.append("priority", currentSelectedPriority);
    }
    if (currentSelectedReadStatus && currentSelectedReadStatus !== "ALL") {
      params.append("readStatus", currentSelectedReadStatus);
    }
    if (currentSelectedDateRange && currentSelectedDateRange !== "ALL") {
      params.append("dateRange", currentSelectedDateRange);
    }
    if (currentCustomStart) {
      params.append("customStart", currentCustomStart);
    }
    if (currentCustomEnd) {
      params.append("customEnd", currentCustomEnd);
    }
    if (currentSearchTerm) {
      params.append("search", currentSearchTerm);
    }
    params.append("page", String(currentPage));
    params.append("limit", String(currentLimit));

    const res = await api.get(`/api/v1/vendor/notifications?${params.toString()}`);
    if (!res || !res.success) {
      throw new Error(res?.error?.message || "Failed to load notifications.");
    }

    currentNotificationsData = res.data;
    renderKPIs(res.data.kpis || {});
    renderFeedRows(res.data.rows || res.data.notifications || []);
    renderPagination(res.data.pagination || {});
  } catch (err) {
    feedList.innerHTML = `
      <div class="p-8 text-center text-red-400 space-y-2">
        <div class="text-2xl">⚠️</div>
        <p class="text-xs font-semibold">Unable to load notifications</p>
        <p class="text-[11px] text-neutral-400">${err.message || "Please check your network or try again."}</p>
      </div>
    `;
  }
}

function renderKPIs(kpis) {
  const elTotal = document.getElementById("kpi-total-notifications");
  const elUnread = document.getElementById("kpi-unread-notifications");
  const elCommercial = document.getElementById("kpi-commercial-alerts");
  const elOperational = document.getElementById("kpi-operational-dispatches");

  if (elTotal) elTotal.textContent = Number(kpis.totalNotifications || 0).toLocaleString("en-IN");
  if (elUnread) elUnread.textContent = Number(kpis.unreadNotifications || 0).toLocaleString("en-IN");
  if (elCommercial) elCommercial.textContent = Number(kpis.commercialAlerts || 0).toLocaleString("en-IN");
  if (elOperational) elOperational.textContent = Number(kpis.operationalDispatches || 0).toLocaleString("en-IN");
}

function renderFeedRows(rows) {
  const feedList = document.getElementById("notifications-feed-list");
  const emptyState = document.getElementById("notifications-empty-state");
  const countBadge = document.getElementById("notification-count-badge");
  if (!feedList) return;

  if (countBadge) {
    countBadge.textContent = `${rows.length} events`;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    feedList.innerHTML = "";
    emptyState?.classList.remove("hidden");
    return;
  }

  emptyState?.classList.add("hidden");

  feedList.innerHTML = rows
    .map((item) => {
      const isUnread = !item.isRead;
      const unreadStatusBadge = isUnread
        ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-blue-900/60 text-blue-300 border border-blue-700/60"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>New</span>'
        : '<span class="inline-block px-2 py-0.5 text-[9px] font-medium uppercase rounded bg-neutral-800 text-neutral-400 border border-neutral-700">Read</span>';

      const actionLabel = getDeepLinkActionLabel(item.targetScreen);
      const safeDeepLink = item.targetScreen ? `#${item.targetScreen}` : "#vendor-dashboard";

      return `
        <div class="notification-item p-4 sm:p-5 hover:bg-neutral-800/40 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4 ${isUnread ? "bg-blue-950/10" : ""}">
          <div class="space-y-2 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              ${getCategoryBadge(item.category)}
              ${getPriorityBadge(item.priority)}
              ${unreadStatusBadge}
              <span class="inline-block px-2 py-0.5 text-[9px] font-medium rounded bg-neutral-800/80 text-neutral-300 border border-neutral-700">
                📍 ${item.cafeName || "Global"}
              </span>
              <span class="text-[11px] text-neutral-500 font-mono">
                🕒 ${item.createdAtFormatted || "—"}
              </span>
            </div>

            <div>
              <h4 class="text-sm font-bold text-white tracking-tight">${item.title || "Notification"}</h4>
              <p class="text-xs text-neutral-300 mt-1 leading-relaxed">${item.message || ""}</p>
            </div>

            ${
              item.sourceEntityId
                ? `
              <div class="text-[11px] font-mono text-neutral-400 flex items-center gap-1.5">
                <span class="text-neutral-500">Ref:</span>
                <span class="text-neutral-300 font-semibold">${item.sourceEntityId}</span>
              </div>
            `
                : ""
            }
          </div>

          <div class="flex items-center md:self-center gap-2">
            <a
              href="${safeDeepLink}"
              class="px-3.5 py-1.5 text-xs font-semibold text-blue-300 bg-blue-950/40 hover:bg-blue-900/60 active:scale-95 transition-all rounded-lg border border-blue-800/60 flex items-center gap-1 shadow-sm"
              title="Navigate to related workspace module"
            >
              ${actionLabel}
            </a>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPagination(pagination) {
  const infoEl = document.getElementById("notification-pagination-info");
  const indicator = document.getElementById("notification-page-indicator");
  const btnPrev = document.getElementById("btn-notification-prev");
  const btnNext = document.getElementById("btn-notification-next");

  const total = pagination.total || 0;
  const page = pagination.page || 1;
  const limit = pagination.limit || 20;
  const totalPages = pagination.totalPages || 1;

  const startRecord = total > 0 ? (page - 1) * limit + 1 : 0;
  const endRecord = Math.min(total, page * limit);

  if (infoEl) infoEl.textContent = `Showing ${startRecord} - ${endRecord} of ${total} events`;
  if (indicator) indicator.textContent = `${page} / ${totalPages}`;
  if (btnPrev) btnPrev.disabled = !pagination.hasPrev;
  if (btnNext) btnNext.disabled = !pagination.hasNext;
}

async function exportNotificationsCsv() {
  try {
    const params = new URLSearchParams();
    if (currentSelectedCafe && currentSelectedCafe !== "ALL") {
      params.append("cafeId", currentSelectedCafe);
    }
    const token = state.token || "";
    const res = await fetch(`/api/v1/vendor/notifications/csv?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Export failed with HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `zamorin-vendor-notifications-${dateStr}.csv`);
  } catch (err) {
    alert(`CSV export failed: ${err.message}`);
  }
}

// =============================================================================
// ZAMORIN CAFE ERP — ADM-SCR-003 / SCR-004: ATTENDANCE & SHIFTS
// Canonical Attendance Engine + Single-Cafe Cafe Operations Projection
// + Master Parity UX Reflection
// =============================================================================

import { apiGet, apiPost, apiPatch } from "../../apiClient.js";
import { showToast, openModal, confirmAction, renderChildHeader } from "../../components.js";
import { state } from "../../state.js";
import { ROLES } from "../../navigation.js";
import { navigate } from "../../router.js";
import { openAttendanceEvidenceViewer } from "./attendanceEvidenceViewer.js";
import { generateQrSvg } from "../../utils/qrCodeGen.js";
import { renderAttendanceQrScannerPage, wireAttendanceQrScannerPage, cleanupAttendanceQrScannerPage } from "../../pages/attendanceQrScannerPage.js";

let activeSubTab = "overview"; // 'overview' | 'live' | 'roster' | 'calendar360' | 'exceptions' | 'policies' | 'closure' | 'analytics'
let liveFilterStatus = "ALL"; // 'ALL' | 'NEEDS_ATTENTION' | 'PRESENT' | 'LATE' | 'MISSING_PUNCH' | 'ABSENT' | 'ON_LEAVE' | 'OVERTIME'
let liveSearchQuery = "";
let cachedOverview = null;
let cachedLiveAttendance = [];
let cachedRoster = null;
let cachedServerTime = null;
let selectedUserId = "";
let selectedRosterCafe = "";
let selectedRosterWeekOffset = 0;
let selectedCalendarMonth = new Date().toISOString().slice(0, 7);
let cachedCalendar360 = { userId: "", month: "", records: [], summary: null };

let cachedShifts = [];
let cachedExceptions = [];
let cachedOvertime = [];
let cachedOrphanReconciliation = null;

const CAFE_NAMES = {};

let rosterPublishedMap = {};

let cafeRosterSchedules = {};
let cachedCafes = [];
let cachedEmployees = [];
let rosterLoadPromise = null;

function toIstTimeInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function istDateTimeToIso(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function getCurrentIstDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function loadCafesList() {
  if (cachedCafes.length) return cachedCafes;
  try {
    const res = await apiGet("/cafes");
    cachedCafes = res?.data || res?.cafes || (Array.isArray(res) ? res : []);
    cachedCafes.forEach(c => {
      const id = c.cafeId || c.code || c.id || c._id;
      if (id) CAFE_NAMES[id] = c.name || id;
    });
  } catch (err) {
    cachedCafes = [];
  }
  return cachedCafes;
}

export function setAttendanceActiveTab(tab) {
  const norm = (tab || "overview").toLowerCase();
  const aliasMap = {
    "shifts": "shifts",
    "shift": "shifts",
    "templates": "shifts",
    "rosters": "roster",
    "daily": "live",
    "approvals": "exceptions",
    "exceptions": "exceptions",
    "reports": "analytics",
    "analytics": "analytics",
    "history": "calendar360",
    "calendar360": "calendar360",
    "calendar": "calendar360",
    "rules": "policies",
    "compliance": "policies",
    "policies": "policies",
    "timesheets": "closure",
    "closure": "closure",
    "qr-scanner": "qrScanner",
    "qrscanner": "qrScanner",
    "qr": "qrScanner",
    "scanner": "qrScanner",
  };
  activeSubTab = aliasMap[norm] || norm || "overview";
}

export function renderAttendance(subroute) {
  if (subroute !== undefined) {
    setAttendanceActiveTab(subroute);
  }
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isPrimary = state.user?.isPrimaryMaster === true;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;
  const isOwner = role === ROLES.OWNER;

  const assignedCafe = state.user?.primaryCafeId || state.user?.assignedCafeIds?.[0] || state.currentCafeId || "";
  const cafeDisplayName = state.user?.primaryCafeName || CAFE_NAMES[assignedCafe] || (assignedCafe ? `Outlet ${assignedCafe}` : "Assigned Outlet");
  const operatorName = state.user?.name || state.user?.fullName || (isCafeAdmin ? "Duty Lead" : "Zamorin Master");
  const operatorEmpId = state.user?.permanentEmployeeId || state.user?.employeeId || state.user?.userId || "";

  if (activeSubTab && activeSubTab !== "overview") {
    return `
      <div class="page-enter attendance-page-container" style="max-width:1400px; margin:0 auto; padding-bottom:60px;">
        <div id="attendance-subpanel-root">
          ${renderActiveSubpanel()}
        </div>
      </div>
    `;
  }

  return `
    <div class="page-enter attendance-page-container" style="max-width:1400px; margin:0 auto; padding-bottom:60px;">
      <!-- Page Header & Context Strip -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:18px; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
        <div>
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:4px;">
            <h1 class="page-title" style="font-size:23px; font-weight:800; margin:0; color:var(--ink); letter-spacing:-0.3px;">Attendance &amp; Shifts</h1>
            <span class="status info" style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">SCR-004</span>
            ${
              isCafeAdmin
                ? `<span class="status warning" style="font-size:10px; font-weight:800; letter-spacing:0.5px;">CAFE OPERATIONS</span>`
                : isPrimary
                ? `<span class="status success" style="font-size:10px; font-weight:800;">PRIMARY MASTER</span>`
                : `<span class="status info" style="font-size:10px; font-weight:800;">OPERATIONAL MASTER</span>`
            }
          </div>

          <p style="font-size:12.5px; color:var(--muted); margin:0 0 8px;">
            ${
              isCafeAdmin
                ? `Today's attendance, live presence, roster, exceptions and attendance operations for this cafe.`
                : `Multi-Café Workforce Presence, Shift Matrix, Employee 360 Calendar, Overtime Governance &amp; Period Closure`
            }
          </p>

          <!-- Fixed Context Strip for Cafe Operations & Master -->
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:12px; color:var(--ink);">
            <div style="display:inline-flex; align-items:center; gap:6px; background:var(--surface-sunken); padding:4px 10px; border-radius:6px; border:1px solid var(--line);">
              <span style="font-weight:700; color:var(--bronze-600);">📍 ${isCafeAdmin ? cafeDisplayName : "All Outlets (Portfolio)"}</span>
              ${isCafeAdmin ? `<span style="font-size:11px; color:var(--muted);">· Main Counter Mobile</span>` : ""}
            </div>

            <div style="display:inline-flex; align-items:center; gap:5px; background:var(--surface-sunken); padding:4px 10px; border-radius:6px; border:1px solid var(--line);">
              <span>👤 <strong>${operatorName}</strong></span>
              <span style="font-size:11px; color:var(--muted); font-family:var(--font-mono);">(${operatorEmpId})</span>
            </div>

            <div style="display:inline-flex; align-items:center; gap:5px; background:var(--surface-sunken); padding:4px 10px; border-radius:6px; border:1px solid var(--line); font-family:var(--font-mono); font-size:11.5px;">
              <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--color-success, #2E7D32);"></span>
              <span>Server Time: <strong id="server-time-indicator">Loading…</strong></span>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button class="btn btn-secondary" id="btn-attendance-qr-scanner" data-attendance-hub-tile="qrScanner" type="button" style="font-size:12.5px; padding:7px 14px; display:inline-flex; align-items:center; gap:6px;">
            📱 <span>Attendance QR &amp; Scanner</span>
          </button>
          <button class="btn btn-ghost" id="refresh-attendance-btn" type="button" style="font-size:12.5px; padding:7px 14px;">
            🔄 Refresh
          </button>
        </div>
      </div>

      <!-- Subpanel Content Container -->
      <div id="attendance-subpanel-root">
        ${renderActiveSubpanel()}
      </div>
    </div>
  `;
}

function renderActiveSubpanel() {
  if (activeSubTab === "overview") {
    return renderOverviewSubpanel();
  }

  const role = state.role || state.user?.role || ROLES.MASTER;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;

  const submodules = {
    live: {
      title: isCafeAdmin ? "Live Attendance & Shift Status" : "Live Multi-Café Attendance",
      icon: "🟢",
      actionsHtml: `
        <button class="btn btn-secondary btn-sm" id="btn-live-show-attendance-qr" type="button" style="font-size:12px; font-weight:700; margin-right:8px;">📱 Attendance QR</button>
        <button class="btn btn-primary btn-sm" id="open-manual-attendance-btn" type="button" style="font-size:12px; font-weight:700;">${isCafeAdmin ? "+ Manual Attendance" : "+ Master Manual Punch"}</button>
      `
    },
    roster: {
      title: "Shifts & Scheduling Roster",
      icon: "📅",
      desc: "Weekly shift rosters, opening/closing coverage and staff assignments.",
      actionsHtml: `<button class="btn btn-primary btn-sm" id="open-create-roster-btn" type="button" style="font-size:12px; font-weight:700;">+ Create Shift Roster</button>`
    },
    shifts: {
      title: "Shift Master & Templates",
      icon: "⏰",
      desc: "Configure standard café shift templates, working hours, grace periods and meal break allowances.",
      actionsHtml: `<button class="btn btn-primary btn-sm" id="open-create-shift-template-btn" type="button" style="font-size:12px; font-weight:700;">+ New Shift Template</button>`
    },
    calendar360: {
      title: isCafeAdmin ? "Attendance History & Records" : "Employee 360° Attendance History",
      icon: "👤",
      desc: "Monthly punch cards, timesheets, leave balances and individual records.",
      actionsHtml: `<button class="btn btn-ghost btn-sm" id="export-history-btn" type="button" style="font-size:12px;">📊 Export Timesheets</button>`
    },
    exceptions: {
      title: "Attendance Exceptions & Overtime",
      icon: "⚠️",
      desc: "Missing checkouts, late punches, overtime requests and supervisor approvals.",
      actionsHtml: `<button class="btn btn-primary btn-sm" id="open-manual-attendance-btn" type="button" style="font-size:12px; font-weight:700;">${isCafeAdmin ? "+ Manual Attendance" : "+ Master Manual Punch"}</button>`
    },
    policies: {
      title: isCafeAdmin ? "Attendance Policies & Guidelines" : "Attendance Policies & Compliance Evidence",
      icon: "📜",
      desc: "Grace periods, half-day deduction rules, OT formulas and statutory proofs.",
      actionsHtml: `<button class="btn btn-ghost btn-sm" id="export-policy-btn" type="button" style="font-size:12px;">📄 Print Compliance Policy</button>`
    },
    closure: {
      title: "Payroll Period Timesheet Closure",
      icon: "🔒",
      desc: "Month-end timesheet locks, adjustments reconciliation and payroll handoff.",
      actionsHtml: `<button class="btn btn-primary btn-sm" id="close-period-btn" type="button" style="font-size:12px; font-weight:700;">🔒 Close Timesheet Period</button>`
    },
    analytics: {
      title: "Punctuality & Labour Hours Analytics",
      icon: "📈",
      desc: "Average shift adherence, OT trends, absenteeism rates and peak hour staffing.",
      actionsHtml: `
        <button class="btn btn-secondary btn-sm" id="btn-analytics-attendance-qr-scanner" data-attendance-hub-tile="qrScanner" type="button" style="font-size:12px; font-weight:700; margin-right:8px;">📱 Attendance QR &amp; Scanner</button>
        <button class="btn btn-ghost btn-sm" id="export-analytics-btn" type="button" style="font-size:12px;">📈 Export CSV</button>
      `
    },
    qrScanner: {
      title: "Attendance QR & Scanner",
      icon: "📱",
      desc: "Secure Attendance Presence Verification — Live rotating QR, kiosk display & diagnostic verification scanner",
      actionsHtml: `<button class="btn btn-ghost btn-sm" id="btn-qr-sub-refresh" type="button" style="font-size:12px;">🔄 Refresh Status</button>`
    },
  };

  const cur = submodules[activeSubTab] || { title: "Submodule", icon: "📁", desc: "", actionsHtml: "" };

  let bodyHtml = "";
  switch (activeSubTab) {
    case "live":
      bodyHtml = renderLiveSubpanel();
      break;
    case "roster":
      bodyHtml = renderRosterSubpanel();
      break;
    case "shifts":
      bodyHtml = renderShiftsMasterSubpanel();
      break;
    case "calendar360":
      bodyHtml = renderCalendar360Subpanel();
      break;
    case "exceptions":
      bodyHtml = renderExceptionsSubpanel();
      break;
    case "policies":
      bodyHtml = renderPoliciesSubpanel();
      break;
    case "closure":
      bodyHtml = renderClosureSubpanel();
      break;
    case "analytics":
      bodyHtml = renderAnalyticsSubpanel();
      break;
    case "qrScanner":
      bodyHtml = renderAttendanceQrScannerPage();
      break;
    default:
      bodyHtml = renderOverviewSubpanel();
  }

  return `
    <div style="display:flex; flex-direction:column; gap:16px;">
      ${renderChildHeader({
        parentLabel: "Attendance & Shifts",
        parentRoute: "attendance",
        childTitle: cur.title,
        icon: cur.icon,
        description: cur.desc,
        backBtnId: "attendance-back-to-hub-btn",
        actionsHtml: cur.actionsHtml || ""
      })}
      <div>
        ${bodyHtml}
      </div>
    </div>
  `;
}

// =============================================================================
// 1. OVERVIEW & PRESENCE SUBPANEL
// =============================================================================
function renderOverviewSubpanel() {
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;

  const ov = cachedOverview || {
    kpis: {
      scheduledToday: 0,
      presentNow: 0,
      onTime: 0,
      late: 0,
      absent: 0,
      onLeave: 0,
      missingPunches: 0,
      overtimePending: 0,
    },
    cafeWorkforce: (cachedCafes || []).map(c => ({
      cafeId: c.cafeId || c.code,
      cafeName: c.name || 'Outlet',
      scheduled: 0,
      present: 0,
      adequacyStatus: "ADEQUATE"
    })),
    needsAttention: [],
  };

  const totalExceptions = (ov.kpis.missingPunches || 0) + (ov.kpis.overtimePending || 0) + (ov.kpis.late || 0);

  const attendanceTiles = [
    { id: "live", icon: "🟢", title: isCafeAdmin ? "Live Attendance" : "Live Multi-Café Attendance", subtitle: "Real-time employee clock-ins, biometric scans & duty floor", badge: `${ov.kpis.presentNow || 0} Present`, badgeType: "success" },
    { id: "roster", icon: "📅", title: "Shifts & Roster", subtitle: "Weekly shift schedules, opening/closing coverage & staff shifts", badge: `${ov.kpis.scheduledToday || 0} Rostered`, badgeType: "accent" },
    { id: "shifts", icon: "⏰", title: "Shift Master", subtitle: "Standard shift templates, timing & grace periods", badge: `${cachedShifts.length || 0} Templates`, badgeType: "accent" },
    { id: "calendar360", icon: "👤", title: isCafeAdmin ? "Attendance History" : "Employee Attendance (360)", subtitle: "Monthly punch cards, timesheets & individual attendance", badge: "360 History", badgeType: "" },
    { id: "exceptions", icon: "⚠️", title: "Exceptions & Overtime", subtitle: "Missing checkouts, late punches & overtime authorizations", badge: `${totalExceptions} Items`, badgeType: totalExceptions > 0 ? "warning" : "success" },
    { id: "policies", icon: "📜", title: isCafeAdmin ? "Attendance Rules" : "Runtime Controls", subtitle: "QR, GPS, selfie evidence and configured attendance controls", badge: "Controls", badgeType: "" },
    ...(!isCafeAdmin ? [{ id: "closure", icon: "🔒", title: "Period Closure", subtitle: "Primary-Master attendance period lock and controlled reopen", badge: "Governance", badgeType: "" }] : []),
    { id: "analytics", icon: "📈", title: "Attendance Analytics", subtitle: "Metrics derived from the attendance records currently loaded", badge: "Live Data", badgeType: "" },
    { id: "qrScanner", icon: "📱", title: "Attendance QR & Scanner", subtitle: "Rotating QR display and diagnostic verification scanner", badge: "Secure QR", badgeType: "" },
  ];

  return `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <!-- Control Centre Button Hub Section -->
      <div class="module-hub-section">
        <h3 class="module-hub-section-title">Attendance &amp; Workforce Roster Workspaces</h3>
        <div class="module-tile-grid">
          ${attendanceTiles.map((t) => `
            <button class="module-hub-tile" data-attendance-hub-tile="${t.id}" type="button">
              <div class="module-tile-icon-box">${t.icon}</div>
              <div class="module-tile-content">
                <div class="module-tile-title-row">
                  <span class="module-tile-title">${t.title}</span>
                  ${t.badge ? `<span class="module-tile-badge ${t.badgeType}">${t.badge}</span>` : ""}
                </div>
                <div class="module-tile-sub">${t.subtitle}</div>
              </div>
            </button>
          `).join("")}
        </div>
      </div>

      <!-- Top Readiness Strip -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:var(--surface-sunken); padding:12px 18px; border-radius:var(--radius-sm, 8px); border:1px solid var(--line);">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:20px;">${totalExceptions > 0 ? "⚠️" : "✅"}</span>
        <div>
          <strong style="font-size:14px; color:var(--ink);">
            ${totalExceptions > 0 ? `${totalExceptions} Attendance Items Require Operational Attention` : "Attendance Operations Clear"}
          </strong>
          <div style="font-size:12px; color:var(--muted);">
            ${totalExceptions > 0 ? "Review exception queue, missing checkouts, and pending overtime records below." : "All scheduled staff present and accounted for with zero active exceptions."}
          </div>
        </div>
      </div>

      <div style="display:flex; gap:8px;">
        <button class="btn btn-sm btn-ghost view-filter-btn" data-filter="LATE" type="button">Late (${ov.kpis.late})</button>
        <button class="btn btn-sm btn-ghost view-filter-btn" data-filter="MISSING_PUNCH" type="button">Missing Punch (${ov.kpis.missingPunches})</button>
        <button class="btn btn-sm btn-ghost view-filter-btn" data-filter="OVERTIME" type="button">Overtime (${ov.kpis.overtimePending})</button>
      </div>
    </div>

    <!-- Interactive Top KPI Grid (Clickable Filters) -->
    <div class="attendance-kpi-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(135px, 1fr)); gap:12px; margin-bottom:24px;">
      ${clickableKpiCard("Scheduled Today", ov.kpis.scheduledToday, "Rostered Shifts", "var(--ink)", "ALL")}
      ${clickableKpiCard("Present Now", ov.kpis.presentNow, "Checked In / Floor", "var(--color-success, #2E7D32)", "PRESENT")}
      ${clickableKpiCard("On Time", ov.kpis.onTime, "Punctual Check-in", "var(--ink)", "PRESENT")}
      ${clickableKpiCard("Late Arrivals", ov.kpis.late, "Grace Exceeded", ov.kpis.late > 0 ? "var(--color-warning, #ED6C02)" : "var(--muted)", "LATE")}
      ${clickableKpiCard("Absent", ov.kpis.absent, "Unexcused", ov.kpis.absent > 0 ? "var(--color-danger, #D32F2F)" : "var(--muted)", "ABSENT")}
      ${clickableKpiCard("On Leave", ov.kpis.onLeave, "Approved Time Off", "var(--ink)", "ON_LEAVE")}
      ${clickableKpiCard("Missing Checkout", ov.kpis.missingPunches, "Pending Punch", ov.kpis.missingPunches > 0 ? "var(--color-danger)" : "var(--muted)", "MISSING_PUNCH")}
      ${clickableKpiCard("Overtime Pending", ov.kpis.overtimePending, isCafeAdmin ? "Awaiting Review" : "Awaiting Decision", "var(--color-accent-amber, #C89D5C)", "OVERTIME")}
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:20px; margin-bottom:24px;">
      <!-- Staffing Panel: Single Cafe vs Multi-Cafe -->
      <div class="card" style="padding:20px;">
        <h3 style="font-size:15px; font-weight:700; margin:0 0 12px; color:var(--ink); display:flex; justify-content:space-between; align-items:center;">
          <span>${isCafeAdmin ? "Today's Staffing & Shift Coverage" : "Café Workforce & Staffing Adequacy"}</span>
          <span style="font-size:11.5px; font-weight:600; color:var(--muted);">Week of 17 Aug 2026</span>
        </h3>

        ${
          isCafeAdmin
            ? `
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="background:var(--surface-sunken); padding:14px; border-radius:6px; border:1px solid var(--line);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <strong style="font-size:14px; color:var(--ink);">Morning Roastery Shift (06:30 – 15:00)</strong>
                <span class="status success" style="font-size:11px;">ON FLOOR</span>
              </div>
              <div style="font-size:12.5px; color:var(--muted); display:flex; justify-content:space-between; align-items:center;">
                <span>Scheduled: <strong style="color:var(--ink);">4 Staff</strong></span>
                <span>Present: <strong style="color:var(--color-success);">4 Checked In</strong></span>
                <span>Ends in: <strong>2h 45m</strong></span>
              </div>
            </div>

            <div style="background:var(--surface-sunken); padding:14px; border-radius:6px; border:1px solid var(--line);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <strong style="font-size:14px; color:var(--ink);">Evening Closing Shift (13:00 – 21:30)</strong>
                <span class="status info" style="font-size:11px;">UPCOMING</span>
              </div>
              <div style="font-size:12.5px; color:var(--muted); display:flex; justify-content:space-between; align-items:center;">
                <span>Scheduled: <strong style="color:var(--ink);">2 Staff</strong></span>
                <span>Starts in: <strong style="color:var(--bronze-600);">3h 15m</strong></span>
                <span>Coverage: <strong>Optimal</strong></span>
              </div>
            </div>
          </div>
        `
            : `
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${ov.cafeWorkforce
              .map(
                (c) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--surface-sunken); border-radius:6px; border:1px solid var(--line);">
                <div>
                  <strong style="font-size:13.5px; color:var(--ink);">${c.cafeName}</strong>
                  <div style="font-size:11px; color:var(--muted); font-family:var(--font-mono);">${c.cafeId}</div>
                </div>
                <div style="text-align:right;">
                  <span class="status ${c.adequacyStatus === "ADEQUATE" ? "success" : "danger"}" style="font-size:10.5px;">${c.adequacyStatus}</span>
                  <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Rostered: ${c.scheduled} · Present: ${c.present}</div>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        `
        }
      </div>

      <!-- Kiosk / QR / Server Time Health -->
      <div class="card" style="padding:20px;">
        <h3 style="font-size:15px; font-weight:700; margin:0 0 12px; color:var(--ink);">Attendance Kiosk &amp; Verification Health</h3>

        <div style="display:flex; flex-direction:column; gap:12px; font-size:12.5px;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid var(--border-subtle);">
            <span>Rotating QR Code Token</span>
            <span class="status success" style="font-size:11px;">ACTIVE (45s Cycle)</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid var(--border-subtle);">
            <span>Server Time Synchronization</span>
            <span class="status success" style="font-size:11px;">LOCKED TO SERVER (IST)</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid var(--border-subtle);">
            <span>GPS Geofence Accuracy</span>
            <strong style="color:var(--ink);">50m Radius (Enforced)</strong>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid var(--border-subtle);">
            <span>Live Selfie Privacy</span>
            <strong style="color:var(--color-success);">Short-Lived Signed Storage</strong>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span>Last Successful Attendance Punch</span>
            <span style="font-family:var(--font-mono); color:var(--muted);">${(() => { const last = cachedLiveAttendance[cachedLiveAttendance.length - 1]; return last ? `${last.checkInAt || '—'} IST (${last.name || last.userId})` : '—'; })()}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Needs Attention Exception Queue -->
    <div class="card" style="padding:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
        <div>
          <h3 style="font-size:15px; font-weight:700; margin:0 0 2px; color:var(--ink);">Prioritised Attendance Exception Queue</h3>
          <p style="font-size:12px; color:var(--muted); margin:0;">Real-time exceptions requiring operational action or review</p>
        </div>
        <span class="status warning" style="font-size:11px;">${ov.needsAttention.length} Pending</span>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        ${ov.needsAttention
          .map(
            (item) => `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:12px 14px; background:var(--surface-sunken); border-radius:6px; border:1px solid var(--line);">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <strong style="font-size:13.5px; color:var(--ink);">${item.userName}</strong>
                <span style="font-size:11px; font-family:var(--font-mono); font-weight:700; color:var(--color-accent-amber);">${item.userId}</span>
                <span class="status ${item.severity === "HIGH" ? "danger" : "warning"}" style="font-size:10px;">${item.type.replace(/_/g, " ")}</span>
              </div>
              <div style="font-size:12px; color:var(--muted); margin-top:3px;">
                ${item.role} · ${item.shiftName} · <span style="color:var(--color-warning); font-weight:600;">${item.status}</span> · <span style="font-family:var(--font-mono);">${item.age}</span>
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:10px;">
              <span class="status info" style="font-size:11px;">${item.nextAction}</span>
              <button class="btn btn-sm btn-primary action-exception-btn" data-user="${item.userId}" data-type="${item.type}" type="button">
                Action
              </button>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function clickableKpiCard(title, value, subtitle, valColor, filterStatus) {
  return `
    <div class="card kpi-card-clickable" data-kpi-filter="${filterStatus}" style="padding:14px 16px; cursor:pointer; transition:transform 0.1s ease, border-color 0.15s ease;">
      <div style="font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.4px; margin-bottom:4px;">${title}</div>
      <div style="font-size:23px; font-weight:800; color:${valColor}; font-family:var(--font-mono); line-height:1.1;">${value}</div>
      <div style="font-size:11px; color:var(--muted); margin-top:4px;">${subtitle}</div>
    </div>
  `;
}

// =============================================================================
// 2. LIVE ATTENDANCE SUBPANEL
// =============================================================================
function renderLiveSubpanel() {
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;

  const fallbackCafe = state.user?.assignedCafeIds?.[0] || state.currentCafeId || "";
  const records = cachedLiveAttendance.length > 0 ? cachedLiveAttendance : [];


  // Filter records
  const filtered = records.filter((r) => {
    if (liveFilterStatus === "PRESENT" && r.status !== "CHECKED_IN" && r.status !== "ON_BREAK") return false;
    if (liveFilterStatus === "LATE" && !r.isLate) return false;
    if (liveFilterStatus === "MISSING_PUNCH" && r.status !== "MISSED_PUNCH") return false;
    if (liveFilterStatus === "ABSENT" && r.status !== "ABSENT") return false;
    if (liveFilterStatus === "ON_LEAVE" && r.status !== "ON_LEAVE") return false;

    if (liveSearchQuery) {
      const q = liveSearchQuery.toLowerCase();
      const matchName = (r.name || "").toLowerCase().includes(q);
      const matchId = (r.userId || "").toLowerCase().includes(q);
      const matchRole = (r.role || "").toLowerCase().includes(q);
      if (!matchName && !matchId && !matchRole) return false;
    }
    return true;
  });

  return `
    <div class="card" style="padding:22px;">
      <!-- Filter and Search Bar -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
        <input type="text" id="live-search-input" class="input" placeholder="Search staff by name or EMP ID..." value="${liveSearchQuery}" style="max-width:340px; font-size:13px;" />

        <!-- Quick Filter Chips -->
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${renderFilterChip("ALL", "All Staff")}
          ${renderFilterChip("PRESENT", "Present")}
          ${renderFilterChip("LATE", "Late")}
          ${renderFilterChip("MISSING_PUNCH", "Missing Punch")}
          ${renderFilterChip("ABSENT", "Absent")}
          ${renderFilterChip("ON_LEAVE", "On Leave")}
        </div>
      </div>

      <!-- Live Attendance Table -->
      <div class="table-wrap">
        <table class="table" style="width:100%;">
          <thead>
            <tr>
              <th>Employee</th>
              ${!isCafeAdmin ? "<th>Location</th>" : ""}
              <th>Status</th>
              <th>Check-In</th>
              <th>Check-Out</th>
              <th>Hours</th>
              <th>Source</th>
              <th>Markers</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--muted);">No attendance records found matching current criteria.</td></tr>`
                : filtered
                    .map(
                      (r) => `
              <tr>
                <td>
                  <strong style="color:var(--ink); font-size:13.5px;">${r.name || r.userId}</strong>
                  <div style="font-size:11.5px; color:var(--color-accent-amber); font-family:var(--font-mono); font-weight:700;">${r.userId}</div>
                </td>
                ${!isCafeAdmin ? `<td><div style="font-size:12.5px; font-family:var(--font-mono);">${r.cafeId}</div></td>` : ""}
                <td>
                  <span class="status ${r.status === "CHECKED_IN" ? "success" : r.status === "ON_BREAK" ? "warning" : r.status === "MISSED_PUNCH" ? "danger" : "info"}" style="font-size:11px; font-weight:700;">
                    ${r.status}
                  </span>
                </td>
                <td style="font-family:var(--font-mono); font-size:12.5px;">${r.checkInAt || "—"}</td>
                <td style="font-family:var(--font-mono); font-size:12.5px;">${r.checkOutAt || "—"}</td>
                <td style="font-family:var(--font-mono); font-size:12.5px;">${((r.regularMinutes || 0) / 60).toFixed(1)} hrs</td>
                <td>
                  <span style="font-size:11px; font-family:var(--font-mono); background:var(--surface-sunken); padding:2px 6px; border-radius:4px; border:1px solid var(--line);">
                    ${r.source || (r.isManualEntry ? "MANUAL" : "QR")}
                  </span>
                </td>
                <td>
                  ${r.isLate ? `<span class="status warning" style="font-size:10px;">LATE</span> ` : ""}
                  ${r.isManualEntry ? `<span class="status info" style="font-size:10px;">MANUAL</span>` : ""}
                </td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn btn-ghost btn-sm view-employee-history-btn" data-user="${r.userId}" type="button" style="font-size:11.5px; padding:4px 8px;">
                    ${isCafeAdmin ? "History" : "360 History"}
                  </button>
                  <button class="btn btn-sm btn-secondary edit-attendance-record-btn" data-attendance-id="${r.attendanceId || r._id}" data-user="${r.userId}" type="button" style="font-size:11.5px; padding:4px 8px; margin-left:4px;">
                    ✏️ Edit
                  </button>
                  <button class="btn btn-sm btn-ghost view-evidence-btn" data-attendance-id="${r.attendanceId || r._id}" data-user="${r.userId}" type="button" title="View Presence Evidence" style="font-size:11.5px; padding:4px 8px; margin-left:4px;">
                    📷 Evidence
                  </button>
                </td>
              </tr>
            `
                    )
                    .join("")
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderFilterChip(filterKey, label) {
  const isSelected = liveFilterStatus === filterKey;
  return `
    <button class="btn btn-sm ${isSelected ? "btn-primary" : "btn-ghost"} live-filter-chip" data-filter="${filterKey}" type="button" style="font-size:12px; padding:4px 10px;">
      ${label}
    </button>
  `;
}

// =============================================================================
// 3. SHIFTS & ROSTER SUBPANEL
// =============================================================================
function calculateShiftHours(shiftStr) {
  if (!shiftStr || shiftStr === "OFF" || shiftStr === "LEAVE") return 0;
  const parts = shiftStr.split("-").map(s => s.trim());
  if (parts.length !== 2) return 8.5;
  const [startH, startM] = parts[0].split(":").map(Number);
  const [endH, endM] = parts[1].split(":").map(Number);
  if (isNaN(startH) || isNaN(endH)) return 8.5;
  let startMinutes = startH * 60 + (startM || 0);
  let endMinutes = endH * 60 + (endM || 0);
  if (endMinutes < startMinutes) endMinutes += 24 * 60; // Overnight shift
  return Math.round(((endMinutes - startMinutes) / 60) * 10) / 10;
}

function renderRosterSubpanel() {
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;
  const activeCafeId = getActiveRosterCafeId();
  const weekStartDate = getRosterWeekStartDate();
  const cafeName = CAFE_NAMES[activeCafeId] || state.currentCafeName || (activeCafeId ? `Outlet ${activeCafeId}` : "Assigned Outlet");
  const isCurrentRoster =
    cachedRoster &&
    String(cachedRoster.cafeId || "") === String(activeCafeId || "") &&
    String(cachedRoster.weekStartDate || "") === String(weekStartDate);
  const isPublished = Boolean(isCurrentRoster && cachedRoster.status === "PUBLISHED");

  const staff = cafeRosterSchedules[activeCafeId] || [];

  // Calculate dates from the current server-targeted roster week.
  const baseDate = new Date(`${weekStartDate}T12:00:00+05:30`);
  const endDate = new Date(baseDate);
  endDate.setDate(endDate.getDate() + 6);

  const startStr = baseDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const endStr = endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const dayLabels = [
    { key: "mon", label: `Mon (${baseDate.getDate()})` },
    { key: "tue", label: `Tue (${new Date(baseDate.getTime() + 86400000).getDate()})` },
    { key: "wed", label: `Wed (${new Date(baseDate.getTime() + 86400000 * 2).getDate()})` },
    { key: "thu", label: `Thu (${new Date(baseDate.getTime() + 86400000 * 3).getDate()})` },
    { key: "fri", label: `Fri (${new Date(baseDate.getTime() + 86400000 * 4).getDate()})` },
    { key: "sat", label: `Sat (${new Date(baseDate.getTime() + 86400000 * 5).getDate()})` },
    { key: "sun", label: `Sun (${endDate.getDate()})` },
  ];

  // Compute daily coverage
  const dailyCoverage = dayLabels.map(d => {
    const onDuty = staff.filter(s => s[d.key] && s[d.key] !== "OFF" && s[d.key] !== "LEAVE");
    const totalHours = onDuty.reduce((sum, s) => sum + calculateShiftHours(s[d.key]), 0);
    return { day: d.label, count: onDuty.length, hours: totalHours };
  });

  return `
    <div class="card" style="padding:22px;">
      <!-- Control Strip & Multi-Cafe Filter -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:12px; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <h3 style="font-size:17px; font-weight:800; margin:0; color:var(--ink);">
              Weekly Shift Roster — ${cafeName}
            </h3>
            <span class="status ${isPublished ? "success" : "warning"}" id="roster-status-badge" style="font-size:11px; font-weight:700;">
              ${isPublished ? "🟢 PUBLISHED" : "🟡 DRAFT"}
            </span>
          </div>
          <p style="font-size:12.5px; color:var(--muted); margin:0;">
            Week of ${startStr} – ${endStr} · Click any shift cell to edit timing or assign coverage.
          </p>
        </div>

        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          ${
            !isCafeAdmin
              ? `
              <div style="display:inline-flex; align-items:center; gap:6px; background:var(--surface-sunken); padding:4px 8px; border-radius:6px; border:1px solid var(--line);">
                <span style="font-size:12px; font-weight:700; color:var(--ink);">🏛️ Switch Café:</span>
                <select id="roster-cafe-select" class="input" style="font-size:12.5px; padding:4px 8px; width:auto; font-weight:600;">
                  ${cachedCafes.length ? cachedCafes.map(c => {
                    const cid = c.cafeId || c.code || c.id || c._id;
                    return `<option value="${cid}" ${activeCafeId === cid ? "selected" : ""}>${cid} · ${c.name || 'Outlet'}</option>`;
                  }).join('') : `<option value="${activeCafeId}" selected>${activeCafeId || 'All Cafes'}</option>`}
                </select>
              </div>
            `
              : ""
          }

          <!-- Week Navigation -->
          <div style="display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:6px; overflow:hidden; background:var(--surface-sunken);">
            <button class="btn btn-ghost" id="roster-prev-week-btn" type="button" style="padding:6px 12px; font-size:12px;" title="Previous Week">◀ Prev Week</button>
            <button class="btn btn-ghost" id="roster-today-btn" type="button" style="padding:6px 12px; font-size:12px; font-weight:700; border-left:1px solid var(--line); border-right:1px solid var(--line);" title="Current Week">This Week</button>
            <button class="btn btn-ghost" id="roster-next-week-btn" type="button" style="padding:6px 12px; font-size:12px;" title="Next Week">Next Week ▶</button>
          </div>
        </div>
      </div>

      <!-- Action Toolbar -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" id="add-staff-roster-btn" type="button" style="font-size:12px; font-weight:700;">
            + Add Staff to Roster
          </button>
          <button class="btn btn-ghost btn-sm" id="export-roster-csv-btn" type="button" style="font-size:12px;">
            📥 Export Loaded Roster
          </button>
        </div>

        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn ${isPublished ? "btn-secondary" : "btn-primary"} btn-sm" id="publish-roster-btn" type="button" ${isPublished ? "disabled" : ""} style="font-size:12.5px; font-weight:700;">
            ${isPublished ? "✓ Published" : "🚀 Publish & Notify"}
          </button>
        </div>
      </div>

      <!-- Shift Legend Strip -->
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:14px; font-size:11.5px; background:var(--surface-sunken); padding:8px 12px; border-radius:6px; border:1px solid var(--line);">
        <span style="font-weight:700; color:var(--ink);">Shift Legend:</span>
        <span style="display:inline-flex; align-items:center; gap:4px;"><span class="status info" style="font-size:10.5px;">06:30 - 15:00</span> 🌅 Morning Opening</span>
        <span style="display:inline-flex; align-items:center; gap:4px;"><span class="status info" style="font-size:10.5px;">10:00 - 18:30</span> ☀️ Mid / Rush</span>
        <span style="display:inline-flex; align-items:center; gap:4px;"><span class="status info" style="font-size:10.5px;">13:00 - 21:30</span> 🌆 Evening Closing</span>
        <span style="display:inline-flex; align-items:center; gap:4px;"><span class="status info" style="font-size:10.5px;">21:00 - 05:30</span> 🌙 Night Prep</span>
        <span style="display:inline-flex; align-items:center; gap:4px;"><span class="status neutral" style="font-size:10.5px;">OFF</span> 🏖️ Weekly Off</span>
        <span style="display:inline-flex; align-items:center; gap:4px;"><span class="status warning" style="font-size:10.5px;">LEAVE</span> 🌴 Approved Leave</span>
      </div>

      <!-- Roster Interactive Table -->
      <div class="table-wrap">
        <table class="table" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:var(--surface-sunken);">
              <th style="padding:10px 12px; text-align:left; min-width:180px;">Staff Member</th>
              ${dayLabels.map(d => `<th style="padding:10px 12px; text-align:center;">${d.label}</th>`).join("")}
              <th style="padding:10px 12px; text-align:center; min-width:100px;">Weekly Hours</th>
              <th style="padding:10px 12px; text-align:center; width:60px;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${staff
              .map((s, sIndex) => {
                let totalHours = 0;
                dayLabels.forEach(d => {
                  totalHours += calculateShiftHours(s[d.key]);
                });
                const isOvertime = totalHours > 48;

                return `
                <tr style="border-bottom:1px solid var(--line);">
                  <td style="padding:10px 12px;">
                    <div style="font-weight:700; color:var(--ink); font-size:13px;">${s.name}</div>
                    <div style="display:flex; gap:6px; align-items:center; margin-top:2px;">
                      <span style="font-size:11px; color:var(--color-accent-amber); font-family:var(--font-mono); font-weight:700;">${s.id}</span>
                      <span style="font-size:11px; color:var(--muted);">· ${s.role}</span>
                    </div>
                  </td>
                  ${dayLabels
                    .map(d => {
                      const val = s[d.key] || "OFF";
                      const isOff = val === "OFF";
                      const isLeave = val === "LEAVE";
                      const statusClass = isOff ? "neutral" : isLeave ? "warning" : "info";

                      return `
                        <td style="padding:8px 6px; text-align:center; vertical-align:middle;">
                          <button class="roster-shift-btn status ${statusClass}" 
                            data-staff-index="${sIndex}" 
                            data-staff-id="${s.id}" 
                            data-staff-name="${s.name}" 
                            data-day-key="${d.key}" 
                            data-day-label="${d.label}" 
                            data-current-shift="${val}" 
                            type="button" 
                            style="cursor:pointer; border:1px solid rgba(0,0,0,0.08); padding:5px 8px; border-radius:4px; font-weight:700; font-size:11.5px; width:100%; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; gap:4px; transition:transform 0.1s, box-shadow 0.1s;"
                            title="Click to edit shift for ${s.name} on ${d.label}">
                            <span>${val}</span>
                            <span style="opacity:0.5; font-size:10px;">✎</span>
                          </button>
                        </td>
                      `;
                    })
                    .join("")}
                  <td style="padding:10px 12px; text-align:center; font-family:var(--font-mono); font-weight:700; font-size:13px;">
                    <span style="color:${isOvertime ? "var(--color-warning)" : "var(--ink)"};">
                      ${totalHours.toFixed(1)} hrs
                    </span>
                    ${isOvertime ? `<div style="font-size:10px; color:var(--color-warning); font-weight:800;">OT RISK</div>` : ""}
                  </td>
                  <td style="padding:10px 12px; text-align:center;">
                    <button class="btn btn-ghost btn-xs remove-staff-roster-btn" data-staff-index="${sIndex}" type="button" style="color:var(--color-danger); font-size:13px;" title="Remove from this week's roster">✕</button>
                  </td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
          <!-- Daily Staff Coverage Row -->
          <tfoot>
            <tr style="background:var(--surface-sunken); font-weight:700; border-top:2px solid var(--line);">
              <td style="padding:10px 12px; font-size:12px; color:var(--ink);">
                🛡️ Daily Coverage Count
              </td>
              ${dailyCoverage
                .map(dc => `
                <td style="padding:10px 6px; text-align:center; font-size:11.5px;">
                  <div style="color:${dc.count >= 2 ? "var(--color-success)" : "var(--color-warning)"}; font-weight:800;">
                    ${dc.count} Staff
                  </div>
                  <div style="font-size:10.5px; color:var(--muted); font-family:var(--font-mono);">
                    ${dc.hours.toFixed(1)}h total
                  </div>
                </td>
              `)
                .join("")}
              <td style="padding:10px 12px; text-align:center; font-size:12px; color:var(--ink); font-family:var(--font-mono);">
                ${staff.reduce((total, s) => total + dayLabels.reduce((dSum, d) => dSum + calculateShiftHours(s[d.key]), 0), 0).toFixed(1)}h
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

// =============================================================================
// 3b. SHIFT MASTER SUBPANEL (P1)
// =============================================================================
function renderShiftsMasterSubpanel() {
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;
  const activeCafeId = isCafeAdmin
    ? (state.user?.assignedCafeIds?.[0] || state.currentCafeId || "")
    : (selectedRosterCafe || state.currentCafeId || cachedCafes[0]?.cafeId || cachedCafes[0]?.code || "");

  const shifts = (cachedShifts || []).filter(s => {
    if (!activeCafeId) return true;
    return !s.cafeId || s.cafeId === activeCafeId;
  });

  return `
    <div class="card" style="padding:22px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:12px; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
        <div>
          <h3 style="font-size:17px; font-weight:800; margin:0 0 4px; color:var(--ink);">Shift Master &amp; Standard Templates</h3>
          <p style="font-size:12.5px; color:var(--muted); margin:0;">Standard working hours, grace tolerances, and cafe-specific shift policies.</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          ${!isCafeAdmin ? `
            <div style="display:inline-flex; align-items:center; gap:6px; background:var(--surface-sunken); padding:4px 8px; border-radius:6px; border:1px solid var(--line);">
              <span style="font-size:12px; font-weight:700; color:var(--ink);">🏛️ Outlet:</span>
              <select id="shift-cafe-select" class="input" style="font-size:12.5px; padding:4px 8px; width:auto; font-weight:600;">
                <option value="">All Outlets (Portfolio)</option>
                ${cachedCafes.map(c => {
                  const cid = c.cafeId || c.code || c.id || c._id;
                  return `<option value="${cid}" ${activeCafeId === cid ? "selected" : ""}>${cid} · ${c.name || 'Outlet'}</option>`;
                }).join('')}
              </select>
            </div>
          ` : ''}
          <button class="btn btn-primary btn-sm" id="open-create-shift-btn" type="button" style="font-size:12px; font-weight:700;">+ New Shift Template</button>
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table class="table" style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border-subtle); text-align:left; font-size:11.5px; color:var(--muted); text-transform:uppercase;">
              <th style="padding:10px 12px;">Shift ID</th>
              <th style="padding:10px 12px;">Name</th>
              <th style="padding:10px 12px;">Scope / Café</th>
              <th style="padding:10px 12px;">Working Hours</th>
              <th style="padding:10px 12px;">Grace</th>
              <th style="padding:10px 12px;">Default</th>
              <th style="padding:10px 12px;">Status</th>
              <th style="padding:10px 12px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${shifts.length === 0 ? `
              <tr>
                <td colspan="8" style="padding:32px 12px; text-align:center; color:var(--muted);">
                  <div style="font-size:24px; margin-bottom:6px;">⏰</div>
                  <div style="font-weight:700; color:var(--ink);">No Shift Templates Configured</div>
                  <div style="font-size:12px; margin-top:2px;">Click "+ New Shift Template" to define operational shifts for this café.</div>
                </td>
              </tr>
            ` : shifts.map((s) => `
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:10px 12px; font-family:var(--font-mono); font-weight:700; color:var(--ink); font-size:12px;">${s.shiftId}</td>
                <td style="padding:10px 12px; font-weight:700; color:var(--ink);">${s.name}</td>
                <td style="padding:10px 12px; color:var(--muted); font-size:12px;">${s.cafeId ? (CAFE_NAMES[s.cafeId] || s.cafeId) : '<span class="status info" style="font-size:10px;">ORG-WIDE</span>'}</td>
                <td style="padding:10px 12px; font-family:var(--font-mono); font-size:12.5px;">${s.startTime} – ${s.endTime}</td>
                <td style="padding:10px 12px; font-size:12px; color:var(--muted);">${s.graceMinutes ?? 15} min</td>
                <td style="padding:10px 12px;">${s.isDefault ? '<span class="status success" style="font-size:10.5px; font-weight:700;">DEFAULT</span>' : '<span style="color:var(--muted); font-size:11.5px;">—</span>'}</td>
                <td style="padding:10px 12px;">
                  <span class="status ${s.isActive !== false ? 'success' : 'neutral'}" style="font-size:11px; font-weight:700;">
                    ${s.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </td>
                <td style="padding:10px 12px; text-align:right;">
                  <div style="display:inline-flex; gap:6px;">
                    <button class="btn btn-ghost btn-sm edit-shift-template-btn" data-shift-id="${s.shiftId}" type="button" style="font-size:11.5px; padding:4px 8px;">Edit</button>
                    ${s.isActive !== false ? `
                      <button class="btn btn-ghost btn-sm deactivate-shift-btn" data-shift-id="${s.shiftId}" type="button" style="font-size:11.5px; padding:4px 8px; color:var(--color-danger);">Deactivate</button>
                    ` : `
                      <button class="btn btn-ghost btn-sm activate-shift-btn" data-shift-id="${s.shiftId}" type="button" style="font-size:11.5px; padding:4px 8px; color:var(--color-success);">Activate</button>
                    `}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// =============================================================================
// 4. ATTENDANCE HISTORY & 360° SUBPANEL
// =============================================================================
function renderCalendar360Subpanel() {
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;

  const rosterStaff = Object.values(cafeRosterSchedules || {}).flat();
  const staffMap = new Map();
  for (const staff of rosterStaff) {
    const id = staff?.id || staff?.userId || staff?.employeeId;
    if (id && !staffMap.has(id)) staffMap.set(id, { id, name: staff.name || id, role: staff.role || "" });
  }
  for (const row of cachedLiveAttendance || []) {
    const id = row?.userId || row?.employeeId;
    if (id && !staffMap.has(id)) staffMap.set(id, { id, name: row.name || id, role: row.role || "" });
  }
  const staffList = [...staffMap.values()];

  if (!selectedUserId && staffList.length > 0) {
    selectedUserId = staffList[0].id;
  }

  const employee = staffMap.get(selectedUserId) || {
    id: selectedUserId || "",
    name: selectedUserId || "Select an employee",
    role: "",
  };

  const activeData =
    cachedCalendar360.userId === selectedUserId &&
    cachedCalendar360.month === selectedCalendarMonth
      ? cachedCalendar360
      : { records: [], summary: null };

  const records = activeData.records || [];
  const summary = activeData.summary || {};
  const [year, month] = selectedCalendarMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingSlots = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  const recordsByDate = new Map(records.filter(r => r?.businessDate).map(r => [String(r.businessDate), r]));

  const monthOptions = Array.from({ length: 12 }, (_, index) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - index);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-IN", { month: "long", year: "numeric" });
    return `<option value="${value}" ${selectedCalendarMonth === value ? "selected" : ""}>${label}</option>`;
  }).join("");

  const calendarCells = [];
  for (let i = 0; i < leadingSlots; i++) {
    calendarCells.push('<div aria-hidden="true" style="min-height:92px; opacity:0.18; background:var(--surface-sunken); border-radius:6px;"></div>');
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const record = recordsByDate.get(dateKey);
    const attendanceId = String(record?.attendanceId || record?._id || "").replace(/"/g, "&quot;");
    const status = String(record?.status || "").toUpperCase();
    const isLate = record?.isLate === true || Number(record?.lateMinutes || 0) > 0;
    const checkIn = record?.checkInAt
      ? new Date(record.checkInAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })
      : "—";
    const checkOut = record?.checkOutAt
      ? new Date(record.checkOutAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })
      : "—";
    const inEvidence = record?.attendanceEvidence?.checkIn || null;
    const outEvidence = record?.attendanceEvidence?.checkOut || null;
    const hasInSelfie = Boolean(inEvidence?.photoFileId || inEvidence?.selfieMediaId || record?.selfieFileId);
    const hasOutSelfie = Boolean(outEvidence?.photoFileId || outEvidence?.selfieMediaId);

    let statusText = "No record";
    let statusColor = "var(--muted)";
    let borderColor = "var(--line)";
    if (status === "CHECKED_OUT") {
      statusText = isLate ? "Late · Complete" : "Complete";
      statusColor = isLate ? "var(--color-warning)" : "var(--color-success)";
      borderColor = isLate ? "var(--color-warning)" : "var(--line)";
    } else if (status === "CHECKED_IN" || status === "ON_BREAK") {
      statusText = isLate ? "Late · Present" : "Present";
      statusColor = isLate ? "var(--color-warning)" : "var(--color-success)";
      borderColor = isLate ? "var(--color-warning)" : "var(--line)";
    } else if (status === "ABSENT") {
      statusText = "Absent";
      statusColor = "var(--color-danger)";
    } else if (status === "ON_LEAVE") {
      statusText = "Leave";
      statusColor = "var(--brand-gold)";
    }

    calendarCells.push(`
      <div
        class="calendar-day-card"
        data-date="${dateKey}"
        data-attendance-id="${attendanceId}"
        style="padding:10px; border:1px solid ${borderColor}; border-radius:6px; background:var(--surface-sunken); min-height:92px; cursor:${record ? "pointer" : "default"}; transition:transform 0.15s ease, box-shadow 0.15s ease;"
        title="${record ? "Open authoritative check-in/check-out evidence" : "No attendance record"}"
      >
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted);">
          <strong>${day}</strong>
          ${isLate ? '<span style="color:var(--color-warning); font-weight:700;">!</span>' : ""}
        </div>
        <div style="font-size:11.5px; font-weight:700; color:${statusColor}; margin-top:6px;">${statusText}</div>
        ${record ? `<div style="font-size:10.5px; color:var(--muted); font-family:var(--font-mono); margin-top:3px;">${checkIn} – ${checkOut}</div>` : ""}
        ${record ? `<div style="font-size:9.5px; color:var(--muted); margin-top:4px;">${hasInSelfie ? "📷 IN" : ""}${hasInSelfie && hasOutSelfie ? " · " : ""}${hasOutSelfie ? "📷 OUT" : ""}</div>` : ""}
      </div>
    `);
  }

  return `
    <div class="card" style="padding:22px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:12px; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
        <div>
          <h3 style="font-size:17px; font-weight:800; margin:0 0 2px; color:var(--ink);">
            ${isCafeAdmin ? "Staff Attendance History" : "Employee Attendance 360°"} — ${employee.name}${employee.id ? ` (${employee.id})` : ""}
          </h3>
          <p style="font-size:12.5px; color:var(--muted); margin:0;">
            ${monthLabel} · Authoritative punches and secure presence evidence.
          </p>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:6px;">
            <label style="font-size:12px; font-weight:700; color:var(--ink);">Employee:</label>
            <select id="calendar-user-select" class="input" style="font-size:12.5px; width:auto; font-weight:600;">
              ${staffList.length
                ? staffList.map(s => `<option value="${s.id}" ${selectedUserId === s.id ? "selected" : ""}>${s.name} (${s.id}${s.role ? ` — ${s.role}` : ""})</option>`).join("")
                : '<option value="">No employee records available</option>'}
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <label style="font-size:12px; font-weight:700; color:var(--ink);">Month:</label>
            <select id="calendar-month-select" class="input" style="font-size:12.5px; width:auto; font-weight:600;">
              ${monthOptions}
            </select>
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:20px;">
        <div style="padding:10px 14px; background:var(--surface-sunken); border-radius:6px; border:1px solid var(--line);">
          <div style="font-size:11px; color:var(--muted);">Total Worked</div>
          <strong style="font-size:16px; color:var(--ink); font-family:var(--font-mono);">${summary.totalHoursWorked ?? "0.0"}h</strong>
        </div>
        <div style="padding:10px 14px; background:var(--surface-sunken); border-radius:6px; border:1px solid var(--line);">
          <div style="font-size:11px; color:var(--muted);">Overtime</div>
          <strong style="font-size:16px; color:var(--color-accent-amber); font-family:var(--font-mono);">${summary.totalOvertimeHours ?? "0.0"}h</strong>
        </div>
        <div style="padding:10px 14px; background:var(--surface-sunken); border-radius:6px; border:1px solid var(--line);">
          <div style="font-size:11px; color:var(--muted);">Days Present</div>
          <strong style="font-size:16px; color:var(--color-success); font-family:var(--font-mono);">${summary.daysPresent ?? 0}</strong>
        </div>
        <div style="padding:10px 14px; background:var(--surface-sunken); border-radius:6px; border:1px solid var(--line);">
          <div style="font-size:11px; color:var(--muted);">Late Arrivals</div>
          <strong style="font-size:16px; color:var(--color-warning); font-family:var(--font-mono);">${summary.daysLate ?? 0}</strong>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:8px; margin-bottom:8px;">
        ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => `<div style="font-size:10.5px; font-weight:700; color:var(--muted); text-align:center;">${day}</div>`).join("")}
        ${calendarCells.join("")}
      </div>
      <div style="font-size:11px; color:var(--muted); margin-top:12px;">
        📷 IN / OUT indicates stored secure selfie evidence. Click a recorded day to open the Check-In / Check-Out evidence viewer.
      </div>
    </div>
  `;
}

// =============================================================================
// 5. EXCEPTIONS & OVERTIME SUBPANEL
// =============================================================================
function renderExceptionsSubpanel() {
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isPrimary = state.user?.isPrimaryMaster === true;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;

  const otRecords = cachedOvertime || [];
  const exceptions = cachedExceptions || [];

  return `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <!-- Overtime Decision Queue -->
      <div class="card" style="padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
          <div>
            <h3 style="font-size:16px; font-weight:800; margin:0 0 2px; color:var(--ink);">Overtime Governance &amp; Decision Queue</h3>
            <p style="font-size:12px; color:var(--muted); margin:0;">
              ${isCafeAdmin ? "Review & recommend overtime for Primary Master decision" : "CAFE_ADMIN verify → Primary Master final decision"}
            </p>
          </div>
          <span class="status ${otRecords.length > 0 ? 'warning' : 'success'}" style="font-size:11px; font-weight:700;">
            ${otRecords.length} Records
          </span>
        </div>

        <div style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse; font-size:12.5px;">
            <thead>
              <tr style="border-bottom:2px solid var(--border-subtle); text-align:left; font-size:11px; color:var(--muted); text-transform:uppercase;">
                <th style="padding:8px 10px;">Employee</th>
                <th style="padding:8px 10px;">Date</th>
                <th style="padding:8px 10px;">Café</th>
                <th style="padding:8px 10px;">Shift</th>
                <th style="padding:8px 10px;">Worked</th>
                <th style="padding:8px 10px;">Detected OT</th>
                <th style="padding:8px 10px;">Approved OT</th>
                <th style="padding:8px 10px;">Status</th>
                <th style="padding:8px 10px; text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${otRecords.length === 0 ? `
                <tr>
                  <td colspan="9" style="padding:24px; text-align:center; color:var(--muted);">
                    All overtime claims have been processed.
                  </td>
                </tr>
              ` : otRecords.map((r) => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:8px 10px; font-weight:700; color:var(--ink);">${r.userId}</td>
                  <td style="padding:8px 10px; font-family:var(--font-mono); font-size:12px;">${r.businessDate}</td>
                  <td style="padding:8px 10px; color:var(--muted);">${r.cafeId || '—'}</td>
                  <td style="padding:8px 10px;">${r.shiftName || 'Standard'}</td>
                  <td style="padding:8px 10px; font-family:var(--font-mono);">${r.totalWorkedMinutes || 0}m</td>
                  <td style="padding:8px 10px; font-weight:700; color:var(--warning); font-family:var(--font-mono);">${r.detectedOvertimeMinutes || 0}m</td>
                  <td style="padding:8px 10px; font-weight:700; color:var(--color-success); font-family:var(--font-mono);">${r.approvedOvertimeMinutes || 0}m</td>
                  <td style="padding:8px 10px;">
                    <span class="status ${r.overtimeStatus === 'APPROVED_BY_PRIMARY' ? 'success' : (r.overtimeStatus === 'REJECTED' ? 'danger' : 'warning')}" style="font-size:10.5px; font-weight:700;">
                      ${r.overtimeStatus || 'PENDING_REVIEW'}
                    </span>
                  </td>
                  <td style="padding:8px 10px; text-align:right;">
                    <div style="display:inline-flex; gap:6px;">
                      ${isCafeAdmin && r.overtimeStatus === 'PENDING_REVIEW' ? `
                        <button class="btn btn-primary btn-sm recommend-ot-row-btn" data-attendance-id="${r.attendanceId}" type="button" style="font-size:11px; padding:3px 8px;">Recommend</button>
                      ` : ''}
                      ${(isPrimary || role === ROLES.MASTER || role === ROLES.OWNER) && r.overtimeStatus !== 'APPROVED_BY_PRIMARY' ? `
                        <button class="btn btn-primary btn-sm approve-ot-row-btn" data-attendance-id="${r.attendanceId}" data-detected="${r.detectedOvertimeMinutes || 0}" type="button" style="font-size:11px; padding:3px 8px;">Approve</button>
                        <button class="btn btn-ghost btn-sm reject-ot-row-btn" data-attendance-id="${r.attendanceId}" type="button" style="font-size:11px; padding:3px 8px; color:var(--color-danger);">Reject</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Attendance Exceptions -->
      <div class="card" style="padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
          <div>
            <h3 style="font-size:16px; font-weight:800; margin:0 0 2px; color:var(--ink);">Unresolved Attendance Exceptions</h3>
            <p style="font-size:12px; color:var(--muted); margin:0;">Lateness, missing checkouts, conflicts, and validation warnings.</p>
          </div>
          <span class="status ${exceptions.length > 0 ? 'warning' : 'success'}" style="font-size:11px; font-weight:700;">
            ${exceptions.length} Exceptions
          </span>
        </div>

        <div style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse; font-size:12.5px;">
            <thead>
              <tr style="border-bottom:2px solid var(--border-subtle); text-align:left; font-size:11px; color:var(--muted); text-transform:uppercase;">
                <th style="padding:8px 10px;">ID</th>
                <th style="padding:8px 10px;">Type</th>
                <th style="padding:8px 10px;">Severity</th>
                <th style="padding:8px 10px;">Employee</th>
                <th style="padding:8px 10px;">Date</th>
                <th style="padding:8px 10px;">Status</th>
                <th style="padding:8px 10px;">Description</th>
                <th style="padding:8px 10px; text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${exceptions.length === 0 ? `
                <tr>
                  <td colspan="8" style="padding:24px; text-align:center; color:var(--muted);">
                    No unresolved attendance exceptions found.
                  </td>
                </tr>
              ` : exceptions.map((e) => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:8px 10px; font-family:var(--font-mono); font-size:11.5px; color:var(--muted);">${e.exceptionId || '—'}</td>
                  <td style="padding:8px 10px; font-weight:700; color:var(--ink);">${e.type}</td>
                  <td style="padding:8px 10px;">
                    <span class="status ${e.severity === 'HIGH' ? 'danger' : (e.severity === 'MEDIUM' ? 'warning' : 'info')}" style="font-size:10px; font-weight:700;">
                      ${e.severity}
                    </span>
                  </td>
                  <td style="padding:8px 10px; font-weight:600;">${e.userId}</td>
                  <td style="padding:8px 10px; font-family:var(--font-mono); font-size:12px;">${e.businessDate}</td>
                  <td style="padding:8px 10px;">
                    <span class="status ${e.status === 'RESOLVED' ? 'success' : (e.status === 'DISMISSED' ? 'neutral' : 'warning')}" style="font-size:10.5px; font-weight:700;">
                      ${e.status}
                    </span>
                  </td>
                  <td style="padding:8px 10px; color:var(--muted); max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${e.description || ''}">
                    ${e.description || '—'}
                  </td>
                  <td style="padding:8px 10px; text-align:right;">
                    ${e.status !== 'RESOLVED' && e.status !== 'DISMISSED' ? `
                      <button class="btn btn-primary btn-sm resolve-exception-row-btn" data-exception-id="${e.exceptionId}" type="button" style="font-size:11px; padding:3px 8px;">Resolve</button>
                    ` : '<span style="font-size:11px; color:var(--muted);">Completed</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// 6. ATTENDANCE RULES / POLICIES SUBPANEL
// =============================================================================
function renderPoliciesSubpanel() {
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isPrimary = state.user?.isPrimaryMaster === true;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;
  const scopedCafeId =
    (state.selectedCafeId && state.selectedCafeId !== "ALL" ? state.selectedCafeId : "") ||
    state.currentCafeId ||
    state.user?.primaryCafeId ||
    state.user?.assignedCafeIds?.[0] ||
    "";
  const scopedCafe = (cachedCafes || []).find((c) =>
    String(c.cafeId || c.code || c.id || "").toUpperCase() === String(scopedCafeId).toUpperCase()
  ) || null;
  const geofenceRadius = Number(
    scopedCafe?.address?.geofenceRadiusMetres ?? scopedCafe?.geofenceRadiusMetres
  );
  const geofenceConfigured =
    Number.isFinite(Number(scopedCafe?.address?.latitude)) &&
    Number.isFinite(Number(scopedCafe?.address?.longitude)) &&
    Number.isFinite(geofenceRadius);
  const geofenceDisplay = geofenceConfigured
    ? `${Math.round(geofenceRadius)} m`
    : (scopedCafeId ? "Not configured" : "Per café");
  const orphanPolicy = cachedOrphanReconciliation?.policy || null;
  const orphanGraceDisplay = Number.isFinite(Number(orphanPolicy?.graceMinutes))
    ? `${Number(orphanPolicy.graceMinutes)} minutes`
    : "Preview to load";
  const orphanEligible = Number(cachedOrphanReconciliation?.eligibleOrphans || 0);
  const orphanDeleted = Number(cachedOrphanReconciliation?.deleted || 0);
  const orphanLinkedProtected = Number(cachedOrphanReconciliation?.linkedProtected || 0);
  const orphanScanned = Number(cachedOrphanReconciliation?.scanned || 0);
  const staleReservationsLinked = Number(cachedOrphanReconciliation?.staleReservationsLinked || 0);
  const staleReservationsCommitted = Number(cachedOrphanReconciliation?.staleReservationsCommitted || 0);
  const staleReservationsQuarantined = Number(cachedOrphanReconciliation?.staleReservationsQuarantined || 0);

  return `
    <div style="display:flex; flex-direction:column; gap:16px; width:100%; min-width:0;">
      <!-- TOP EXECUTIVE POLICY METRIC STRIP -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
        <div class="card" style="padding:14px 16px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Geofence Security</div>
          <div style="font-size:22px; font-weight:800; color:var(--ink); font-family:var(--font-heading); margin-top:4px;">${geofenceDisplay} <span style="font-size:12px; font-weight:600; color:var(--muted);">Configured</span></div>
          <div style="font-size:11.5px; color:#059669; font-weight:600; margin-top:2px;">${geofenceConfigured ? "● High-Accuracy GPS Required" : "● Configure café latitude, longitude and radius"}</div>
        </div>

        <div class="card" style="padding:14px 16px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Rotating QR Token</div>
          <div style="font-size:22px; font-weight:800; color:var(--bronze-600); font-family:var(--font-heading); margin-top:4px;">45 Seconds</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Anti-buddy punching refresh</div>
        </div>

        <div class="card" style="padding:14px 16px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Late Grace Window</div>
          <div style="font-size:22px; font-weight:800; color:var(--ink); font-family:var(--font-heading); margin-top:4px;">15 Minutes</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Automatic delay flag threshold</div>
        </div>

        <div class="card" style="padding:14px 16px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Statutory Status</div>
          <div style="font-size:22px; font-weight:800; color:#059669; font-family:var(--font-heading); margin-top:4px;">Not Evaluated</div>
          <div style="font-size:11.5px; color:#059669; font-weight:600; margin-top:2px;">● Legal compliance is reported in the dedicated compliance workspace</div>
        </div>
      </div>

      <!-- MAIN 4-POLICY CARD GRID -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(380px, 1fr)); gap:16px;">
        <!-- Card 1: Frontline Verification Parameters -->
        <div class="card" style="padding:20px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div>
              <h3 style="font-size:15.5px; font-weight:800; margin:0 0 2px; color:var(--ink);">
                ${isCafeAdmin ? "Attendance Rules (Operational Summary)" : "Frontline Clock-In Verification Policies"}
              </h3>
              <p style="font-size:12px; color:var(--muted); margin:0;">
                ${isCafeAdmin ? "Configured clock-in and verification parameters for this cafe (Read-Only)." : "Configurable clock-in security parameters."}
              </p>
            </div>
            <span class="status success" style="font-size:10px; font-weight:700;">ACTIVE</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px; font-size:12.5px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Geofence Radius &amp; Accuracy</span>
              <strong style="color:var(--ink); font-family:var(--font-mono);">${geofenceDisplay} (${geofenceConfigured ? "GPS Required" : "Configuration Required"})</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Rotating QR Code Interval</span>
              <strong style="color:var(--ink); font-family:var(--font-mono);">45 Seconds Auto-Rotation</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Late Grace Window</span>
              <strong style="color:var(--ink); font-family:var(--font-mono);">15 Minutes</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Unpaid Break Rule</span>
              <strong style="color:var(--ink); font-family:var(--font-mono);">Defined by published shift / roster</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted);">Private Selfie Capture</span>
              <strong style="color:#059669; font-weight:700;">Enabled (Signed Private Storage)</strong>
            </div>
          </div>
        </div>

        <!-- Card 2: Evidence Retention & Privacy -->
        <div class="card" style="padding:20px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div>
              <h3 style="font-size:15.5px; font-weight:800; margin:0 0 2px; color:var(--ink);">Evidence Retention &amp; Privacy Standards</h3>
              <p style="font-size:12px; color:var(--muted); margin:0;">Private attendance evidence · authenticated access · governance-controlled retention</p>
            </div>
            <span class="status info" style="font-size:10px; font-weight:700;">PRIVACY SAFE</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px; font-size:12.5px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Selfie Storage Consumed</span>
              <strong style="font-family:var(--font-mono); color:var(--ink);">Not calculated here</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Retention / Purge Eligibility</span>
              <strong style="color:var(--warning); font-family:var(--font-mono);">Policy-driven</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Active Evidence Holds</span>
              <strong style="color:#059669; font-weight:700;">Not loaded in this view</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted);">Biometric Identity Storage</span>
              <strong style="color:#059669; font-weight:700;">No facial-recognition template is created by the attendance punch flow</strong>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px; padding:10px; background:var(--surface-sunken); border-radius:8px; border:1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; gap:10px; font-size:11.5px;">
              <span style="color:var(--muted);">Orphan upload grace policy</span>
              <strong style="color:var(--ink); font-family:var(--font-mono);">${orphanGraceDisplay}</strong>
            </div>
            ${isPrimary && cachedOrphanReconciliation ? `
              <div style="display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px;">
                <div style="padding:7px; border:1px solid var(--line); border-radius:6px; text-align:center;"><strong>${orphanScanned}</strong><div style="font-size:10px;color:var(--muted);">Scanned</div></div>
                <div style="padding:7px; border:1px solid var(--line); border-radius:6px; text-align:center;"><strong>${orphanLinkedProtected}</strong><div style="font-size:10px;color:var(--muted);">Linked Protected</div></div>
                <div style="padding:7px; border:1px solid var(--line); border-radius:6px; text-align:center;"><strong>${orphanEligible}</strong><div style="font-size:10px;color:var(--muted);">Eligible Orphans</div></div>
                <div style="padding:7px; border:1px solid var(--line); border-radius:6px; text-align:center;"><strong>${orphanDeleted}</strong><div style="font-size:10px;color:var(--muted);">Deleted</div></div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px;">
                <div style="padding:7px; border:1px solid var(--line); border-radius:6px; text-align:center;"><strong>${staleReservationsLinked}</strong><div style="font-size:10px;color:var(--muted);">Stale Reserved + Linked</div></div>
                <div style="padding:7px; border:1px solid var(--line); border-radius:6px; text-align:center;"><strong>${staleReservationsCommitted}</strong><div style="font-size:10px;color:var(--muted);">Reservations Repaired</div></div>
                <div style="padding:7px; border:1px solid var(--line); border-radius:6px; text-align:center;"><strong>${staleReservationsQuarantined}</strong><div style="font-size:10px;color:var(--muted);">Reserved Quarantine</div></div>
              </div>
            ` : ""}
            ${isPrimary ? `
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn btn-secondary" id="preview-orphan-evidence-btn" type="button" style="font-size:11.5px;">
                  Preview Orphan Reconciliation
                </button>
                ${cachedOrphanReconciliation?.dryRun === true && orphanEligible > 0 ? `
                  <button class="btn btn-danger" id="execute-orphan-evidence-btn" type="button" style="font-size:11.5px;">
                    Delete ${orphanEligible} Expired Unlinked Upload${orphanEligible === 1 ? "" : "s"}
                  </button>
                ` : ""}
              </div>
            ` : `
              <div style="font-size:11.5px; color:var(--muted);">
                Orphan evidence reconciliation is restricted to the Primary Master.
              </div>
            `}
            <div style="font-size:10.8px; color:var(--muted); line-height:1.45;">
              This workflow only deletes expired uploads that are unlinked and not punch-reserved. Stale reservations already referenced by Attendance are repaired to COMMITTED; stale reservations without a committed Attendance reference remain quarantined and are never auto-deleted. Committed attendance evidence purge remains disabled pending a formal retention policy.
            </div>
          </div>
        </div>

        <!-- Card 3: Compliance Scope -->
        <div class="card" style="padding:20px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div>
              <h3 style="font-size:15.5px; font-weight:800; margin:0 0 2px; color:var(--ink);">Compliance Scope</h3>
              <p style="font-size:12px; color:var(--muted); margin:0;">Attendance controls do not independently certify statutory compliance.</p>
            </div>
            <span class="status info" style="font-size:10px; font-weight:700;">SEPARATE REVIEW</span>
          </div>
          <div style="font-size:12.5px; color:var(--muted); line-height:1.55;">
            Working-hour limits, wage floors, overtime multipliers and jurisdiction-specific legal conclusions must come from the canonical compliance and payroll configuration. No legal pass/fail percentage is manufactured in this attendance view.
          </div>
        </div>

        <!-- Card 4: Runtime Evidence Integrity -->
        <div class="card" style="padding:20px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div>
              <h3 style="font-size:15.5px; font-weight:800; margin:0 0 2px; color:var(--ink);">Runtime Evidence Integrity</h3>
              <p style="font-size:12px; color:var(--muted); margin:0;">Controls enforced by the current QR → GPS → selfie punch path.</p>
            </div>
            <span class="status success" style="font-size:10px; font-weight:700;">ENFORCED</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px; font-size:12.5px;">
            <div style="display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Rotating café challenge</span><strong>Required</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Server-side geofence verification</span><strong>Required</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid var(--line); padding-bottom:8px;">
              <span style="color:var(--muted);">Distinct Check-In / Check-Out selfies</span><strong>Required</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:12px;">
              <span style="color:var(--muted);">Evidence viewing</span><strong>Authenticated &amp; audited</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// 7. PERIOD CLOSURE SUBPANEL (Master Only)
// =============================================================================
function renderClosureSubpanel() {
  const isPrimary = state.user?.isPrimaryMaster === true;
  const periodKey = state.currentPeriodKey || new Date().toISOString().slice(0, 7);
  const totalLoggedMinutes = (cachedLiveAttendance || []).reduce(
    (sum, record) => sum + (Number(record.regularMinutes) || 0),
    0
  );
  const pendingOvertime = (cachedOvertime || []).filter(
    (record) => !["APPROVED_BY_PRIMARY", "REJECTED"].includes(String(record.overtimeStatus || "").toUpperCase())
  ).length;
  const openExceptions = (cachedExceptions || []).filter(
    (record) => !["RESOLVED", "DISMISSED", "CLOSED"].includes(String(record.status || "").toUpperCase())
  ).length;
  const workforce = cachedOverview?.cafeWorkforce || [];

  return `
    <div style="display:flex; flex-direction:column; gap:16px; width:100%; min-width:0;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
        <div class="card" style="padding:16px;">
          <div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">Target Period</div>
          <div style="font-size:22px; font-weight:800; color:var(--ink); margin-top:4px;">${periodKey}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:3px;">Status is server-authoritative and changes only through the lock/reopen APIs.</div>
        </div>
        <div class="card" style="padding:16px;">
          <div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">Loaded Regular Hours</div>
          <div style="font-size:22px; font-weight:800; color:var(--ink); margin-top:4px;">${(totalLoggedMinutes / 60).toFixed(1)} h</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:3px;">From the attendance records currently loaded in this workspace.</div>
        </div>
        <div class="card" style="padding:16px;">
          <div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">Open Exceptions</div>
          <div style="font-size:22px; font-weight:800; color:${openExceptions ? "var(--warning)" : "var(--ink)"}; margin-top:4px;">${openExceptions}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:3px;">Review before locking where operationally required.</div>
        </div>
        <div class="card" style="padding:16px;">
          <div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">Pending Overtime</div>
          <div style="font-size:22px; font-weight:800; color:${pendingOvertime ? "var(--warning)" : "var(--ink)"}; margin-top:4px;">${pendingOvertime}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:3px;">No readiness percentage is inferred from this count.</div>
        </div>
      </div>

      <div class="card" style="padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
          <div>
            <h3 style="font-size:16px; font-weight:800; margin:0 0 3px; color:var(--ink);">Published-Roster Coverage</h3>
            <p style="font-size:12px; color:var(--muted); margin:0;">Scheduled and currently present counts reported by the attendance overview endpoint.</p>
          </div>
          <span class="status info" style="font-size:10.5px;">AUTHORITATIVE COUNTS</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table" style="width:100%; border-collapse:collapse; font-size:12.5px;">
            <thead>
              <tr style="border-bottom:1px solid var(--line); text-align:left;">
                <th style="padding:9px;">Café</th>
                <th style="padding:9px; text-align:right;">Scheduled</th>
                <th style="padding:9px; text-align:right;">Present</th>
                <th style="padding:9px; text-align:right;">Coverage State</th>
              </tr>
            </thead>
            <tbody>
              ${workforce.length ? workforce.map((row) => `
                <tr style="border-bottom:1px solid var(--line);">
                  <td style="padding:9px; font-weight:700;">${row.cafeId || "—"} · ${row.cafeName || "Outlet"}</td>
                  <td style="padding:9px; text-align:right;">${Number(row.scheduled) || 0}</td>
                  <td style="padding:9px; text-align:right;">${Number(row.present) || 0}</td>
                  <td style="padding:9px; text-align:right;">${row.adequacyStatus || "NO_DATA"}</td>
                </tr>
              `).join("") : `
                <tr><td colspan="4" style="padding:20px; text-align:center; color:var(--muted);">No published-roster coverage data is loaded for this scope.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="padding:20px;">
        <h3 style="font-size:16px; font-weight:800; margin:0 0 6px; color:var(--ink);">Period Governance</h3>
        <p style="font-size:12.5px; color:var(--muted); margin:0 0 14px; line-height:1.5;">
          Locking makes the attendance period immutable for ordinary corrections. Reopening requires Primary Master authority and a recorded reason.
          Payroll processing is a separate downstream workflow; this screen does not claim that payroll has been transferred or completed.
        </p>
        ${isPrimary ? `
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn btn-primary" id="lock-period-btn" type="button">🔒 Lock Attendance Period</button>
            <button class="btn btn-secondary" id="reopen-period-btn" type="button">Reopen Locked Period</button>
          </div>
        ` : `
          <div style="font-size:12px; color:var(--muted); padding:10px; background:var(--surface-sunken); border-radius:6px;">
            Period lock and reopen actions require Primary Master authority.
          </div>
        `}
      </div>
    </div>
  `;
}
function renderAnalyticsSubpanel() {
  const records = cachedLiveAttendance || [];
  const checkInRecords = records.filter((r) => r.checkInAt || ["CHECKED_IN", "CHECKED_OUT", "ON_BREAK"].includes(r.status));
  const lateCount = checkInRecords.filter((r) => Boolean(r.isLate)).length;
  const onTimeCount = checkInRecords.length - lateCount;
  const onTimeRate = checkInRecords.length ? (onTimeCount / checkInRecords.length) * 100 : null;
  const totalRegularMinutes = records.reduce((sum, r) => sum + (Number(r.regularMinutes) || 0), 0);
  const approvedOvertimeMinutes = records.reduce(
    (sum, r) => sum + (Number(r.approvedOvertimeMinutes) || 0),
    0
  );
  const manualEntries = records.filter((r) => Boolean(r.isManualEntry)).length;
  const manualRate = records.length ? (manualEntries / records.length) * 100 : null;

  const cafeIds = [...new Set(records.map((r) => r.cafeId).filter(Boolean))];
  const cafeRows = cafeIds.map((cafeId) => {
    const cafeRecords = records.filter((r) => r.cafeId === cafeId);
    const cafeCheckIns = cafeRecords.filter((r) => r.checkInAt || ["CHECKED_IN", "CHECKED_OUT", "ON_BREAK"].includes(r.status));
    const cafeLate = cafeCheckIns.filter((r) => Boolean(r.isLate)).length;
    const cafeOnTimeRate = cafeCheckIns.length ? ((cafeCheckIns.length - cafeLate) / cafeCheckIns.length) * 100 : null;
    const regularMinutes = cafeRecords.reduce((sum, r) => sum + (Number(r.regularMinutes) || 0), 0);
    const overtimeMinutes = cafeRecords.reduce((sum, r) => sum + (Number(r.approvedOvertimeMinutes) || 0), 0);
    return {
      cafeId,
      cafeName: CAFE_NAMES[cafeId] || cachedCafes.find((c) => (c.cafeId || c.code) === cafeId)?.name || "Outlet",
      records: cafeRecords.length,
      regularHours: regularMinutes / 60,
      overtimeHours: overtimeMinutes / 60,
      onTimeRate: cafeOnTimeRate,
    };
  });

  return `
    <div style="display:flex; flex-direction:column; gap:16px; width:100%; min-width:0;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
        <div class="card" style="padding:16px;">
          <div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">On-Time Rate</div>
          <div style="font-size:22px; font-weight:800; color:var(--ink); margin-top:4px;">${onTimeRate === null ? "No data" : `${onTimeRate.toFixed(1)}%`}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:3px;">${checkInRecords.length} loaded check-in records · ${lateCount} late.</div>
        </div>
        <div class="card" style="padding:16px;">
          <div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">Regular Hours</div>
          <div style="font-size:22px; font-weight:800; color:var(--ink); margin-top:4px;">${(totalRegularMinutes / 60).toFixed(1)} h</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:3px;">Sum of regularMinutes in loaded attendance records.</div>
        </div>
        <div class="card" style="padding:16px;">
          <div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">Approved Overtime</div>
          <div style="font-size:22px; font-weight:800; color:var(--ink); margin-top:4px;">${(approvedOvertimeMinutes / 60).toFixed(1)} h</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:3px;">Only approvedOvertimeMinutes are counted.</div>
        </div>
        <div class="card" style="padding:16px;">
          <div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">Manual Entry Rate</div>
          <div style="font-size:22px; font-weight:800; color:var(--ink); margin-top:4px;">${manualRate === null ? "No data" : `${manualRate.toFixed(1)}%`}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:3px;">${manualEntries} of ${records.length} loaded records.</div>
        </div>
      </div>

      <div class="card" style="padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
          <div>
            <h3 style="font-size:16px; font-weight:800; margin:0 0 3px; color:var(--ink);">Loaded Attendance by Café</h3>
            <p style="font-size:12px; color:var(--muted); margin:0;">This table reports only records returned by the live attendance endpoint for the current scope.</p>
          </div>
          <button class="btn btn-secondary btn-sm" id="export-analytics-btn" type="button">Export Loaded Data CSV</button>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table" style="width:100%; border-collapse:collapse; font-size:12.5px;">
            <thead>
              <tr style="border-bottom:1px solid var(--line); text-align:left;">
                <th style="padding:9px;">Café</th>
                <th style="padding:9px; text-align:right;">Records</th>
                <th style="padding:9px; text-align:right;">Regular Hours</th>
                <th style="padding:9px; text-align:right;">Approved OT</th>
                <th style="padding:9px; text-align:right;">On-Time Rate</th>
              </tr>
            </thead>
            <tbody>
              ${cafeRows.length ? cafeRows.map((row) => `
                <tr style="border-bottom:1px solid var(--line);">
                  <td style="padding:9px; font-weight:700;">${row.cafeId} · ${row.cafeName}</td>
                  <td style="padding:9px; text-align:right;">${row.records}</td>
                  <td style="padding:9px; text-align:right;">${row.regularHours.toFixed(1)}</td>
                  <td style="padding:9px; text-align:right;">${row.overtimeHours.toFixed(1)}</td>
                  <td style="padding:9px; text-align:right;">${row.onTimeRate === null ? "—" : `${row.onTimeRate.toFixed(1)}%`}</td>
                </tr>
              `).join("") : `
                <tr><td colspan="5" style="padding:22px; text-align:center; color:var(--muted);">No authoritative attendance records are loaded for analytics.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <div style="font-size:11.5px; color:var(--muted); padding:10px 12px; background:var(--surface-sunken); border:1px solid var(--line); border-radius:8px;">
        No benchmark, target, forecast, labour recommendation, or compliance score is inferred by this view.
      </div>
    </div>
  `;
}
export function wireAttendance(root, subroute) {
  if (subroute !== undefined) {
    activeSubTab = subroute || "overview";
  }

  root.querySelectorAll("[data-attendance-hub-tile]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tileId = e.currentTarget.dataset.attendanceHubTile;
      navigate("attendance/" + tileId);
    });
  });

  root.querySelectorAll("#btn-attendance-qr-scanner, #btn-show-attendance-qr, #btn-live-show-attendance-qr, #btn-analytics-attendance-qr-scanner").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate("attendance/qr-scanner");
    });
  });

  root.querySelector("#attendance-back-to-hub-btn")?.addEventListener("click", () => {
    navigate("attendance");
  });

  root.querySelectorAll(".attendance-nav-tab").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      activeSubTab = e.currentTarget.dataset.tab;
      rerender(root);
    });
  });

  const refreshBtn = root.querySelector("#refresh-attendance-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      await loadLiveAttendanceData();
      rerender(root);
      showToast("Workforce attendance refreshed.", "info");
    });
  }

  root.querySelector("#open-manual-attendance-btn")?.addEventListener("click", () => {
    openScopedManualAttendanceModal(root);
  });

  wireAttendanceSubpanelActions(root);

  if (!cachedOverview) {
    loadLiveAttendanceData().then(() => {
      if (state.route?.startsWith("attendance") || state.route === "staff-attendance") {
        rerender(root);
      }
    });
  }
}

function getActiveRosterCafeId() {
  const role = state.role || state.user?.role || ROLES.MASTER;
  if (role === ROLES.CAFE_ADMIN) {
    return state.user?.assignedCafeIds?.[0] || state.user?.primaryCafeId || state.currentCafeId || "";
  }
  return selectedRosterCafe || state.currentCafeId || state.user?.primaryCafeId || cachedCafes[0]?.cafeId || cachedCafes[0]?.code || "";
}

function getRosterWeekStartDate(offset = selectedRosterWeekOffset) {
  const today = new Date(`${getCurrentIstDateKey()}T12:00:00+05:30`);
  const day = today.getDay();
  const mondayDelta = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + mondayDelta + (Number(offset) || 0) * 7);
  return today.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function getRosterDateKeys(weekStartDate) {
  const base = new Date(`${weekStartDate}T12:00:00+05:30`);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(base);
    d.setDate(base.getDate() + index);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  });
}

async function loadEmployeeDirectory() {
  try {
    const res = await apiGet("/employees?limit=200");
    const employees = res?.data?.employees || res?.data || res?.employees || (Array.isArray(res) ? res : []);
    cachedEmployees = Array.isArray(employees) ? employees : [];
  } catch (err) {
    cachedEmployees = [];
  }
  return cachedEmployees;
}

function normaliseRosterRows(roster, employees = cachedEmployees) {
  const employeeMap = new Map();
  for (const employee of employees || []) {
    const id = employee?.userId || employee?.employeeId || employee?.id || employee?._id;
    if (!id) continue;
    employeeMap.set(String(id).toUpperCase(), employee);
  }

  const weekStartDate = roster?.weekStartDate || getRosterWeekStartDate();
  const dates = getRosterDateKeys(weekStartDate);
  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const rows = new Map();

  for (const assignment of roster?.assignments || []) {
    const userId = String(assignment?.userId || "").trim().toUpperCase();
    const dayIndex = dates.indexOf(String(assignment?.date || ""));
    if (!userId || dayIndex < 0) continue;

    const employee = employeeMap.get(userId);
    if (!rows.has(userId)) {
      rows.set(userId, {
        id: userId,
        name: employee?.name || employee?.fullName || employee?.displayName || userId,
        role: assignment?.assignedRole || employee?.designation || employee?.role || "",
        mon: "OFF", tue: "OFF", wed: "OFF", thu: "OFF", fri: "OFF", sat: "OFF", sun: "OFF",
      });
    }

    const row = rows.get(userId);
    row[dayKeys[dayIndex]] = `${assignment.startTime} - ${assignment.endTime}`;
    if (!row.role && assignment?.assignedRole) row.role = assignment.assignedRole;
  }

  return [...rows.values()];
}

function serializeRosterRows(cafeId, weekStartDate) {
  const rows = cafeRosterSchedules[cafeId] || [];
  const dates = getRosterDateKeys(weekStartDate);
  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const assignments = [];

  for (const row of rows) {
    for (let index = 0; index < dayKeys.length; index += 1) {
      const value = String(row?.[dayKeys[index]] || "").trim().toUpperCase();
      if (!value || value === "OFF" || value === "LEAVE") continue;

      const match = value.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
      if (!match) {
        throw new Error(`Invalid shift time for ${row.id} on ${dates[index]}. Use HH:MM - HH:MM.`);
      }

      assignments.push({
        userId: row.id,
        date: dates[index],
        startTime: match[1],
        endTime: match[2],
        assignedRole: row.role || null,
      });
    }
  }

  return assignments;
}

async function loadRosterData({ cafeId = getActiveRosterCafeId(), weekStartDate = getRosterWeekStartDate() } = {}) {
  if (!cafeId) {
    cachedRoster = null;
    return null;
  }

  if (rosterLoadPromise) return rosterLoadPromise;

  rosterLoadPromise = (async () => {
    const [rosterRes] = await Promise.all([
      apiGet(`/attendance/roster?cafeId=${encodeURIComponent(cafeId)}&weekStartDate=${encodeURIComponent(weekStartDate)}`),
      cachedEmployees.length ? Promise.resolve(cachedEmployees) : loadEmployeeDirectory(),
    ]);

    const roster = rosterRes?.data?.roster || null;
    cachedRoster = roster;
    cafeRosterSchedules[cafeId] = normaliseRosterRows(roster || { cafeId, weekStartDate, assignments: [] });
    rosterPublishedMap[cafeId] = roster?.status === "PUBLISHED";
    return roster;
  })();

  try {
    return await rosterLoadPromise;
  } finally {
    rosterLoadPromise = null;
  }
}

async function saveCurrentRosterDraft() {
  const cafeId = getActiveRosterCafeId();
  const weekStartDate = getRosterWeekStartDate();

  if (!cafeId) {
    throw new Error("Select an authorised café before saving a roster.");
  }
  if (cachedRoster?.status === "PUBLISHED") {
    throw new Error("Published rosters are immutable. Create or select a draft week before editing.");
  }

  const assignments = serializeRosterRows(cafeId, weekStartDate);
  const res = await apiPost("/attendance/roster", { cafeId, weekStartDate, assignments });
  const roster = res?.data?.roster;
  if (!roster) {
    throw new Error("Roster save did not return an authoritative roster.");
  }

  cachedRoster = roster;
  cafeRosterSchedules[cafeId] = normaliseRosterRows(roster);
  rosterPublishedMap[cafeId] = roster.status === "PUBLISHED";
  return roster;
}

async function loadLiveAttendanceData() {
  try {
    await loadCafesList();

    const role = state.role || state.user?.role || ROLES.MASTER;
    const isCafeAdmin = role === ROLES.CAFE_ADMIN;
    const scopedCafeId = state.user?.assignedCafeIds?.[0] || state.user?.primaryCafeId || state.currentCafeId || "";
    const cafeQuery = isCafeAdmin && scopedCafeId ? `?cafeId=${encodeURIComponent(scopedCafeId)}` : "";

    const [ovRes, liveRes, timeRes, shiftsRes, otRes, excRes] = await Promise.all([
      apiGet(`/attendance/overview${cafeQuery}`).catch(() => null),
      apiGet(`/attendance/live${cafeQuery}`).catch(() => null),
      apiGet("/attendance/server-time").catch(() => null),
      apiGet(`/shifts${cafeQuery}`).catch(() => null),
      apiGet(`/attendance/overtime${cafeQuery}`).catch(() => null),
      apiGet(`/attendance/exceptions${cafeQuery}`).catch(() => null),
    ]);

    if (ovRes?.data) cachedOverview = ovRes.data;
    if (liveRes?.data?.attendance) cachedLiveAttendance = liveRes.data.attendance;
    if (timeRes?.data) cachedServerTime = timeRes.data;
    if (shiftsRes?.data?.shifts) cachedShifts = shiftsRes.data.shifts;
    else if (Array.isArray(shiftsRes?.data)) cachedShifts = shiftsRes.data;
    if (otRes?.data?.records) cachedOvertime = otRes.data.records;
    if (excRes?.data?.exceptions) cachedExceptions = excRes.data.exceptions;
  } catch (err) {
    console.warn("Attendance data load notice:", err);
  }
}

async function loadCalendar360Data() {
  if (!selectedUserId || !selectedCalendarMonth) {
    cachedCalendar360 = { userId: "", month: "", records: [], summary: null };
    return;
  }

  const [year, month] = selectedCalendarMonth.split("-").map(Number);
  const res = await apiGet(
    `/attendance/calendar-360/${encodeURIComponent(selectedUserId)}?year=${year}&month=${month}`
  );

  cachedCalendar360 = {
    userId: selectedUserId,
    month: selectedCalendarMonth,
    records: res?.data?.records || [],
    summary: res?.data?.summary || null,
  };
}

function rerender(root) {
  if (!state.route?.startsWith("attendance") && state.route !== "staff-attendance") return;
  const subpanelRoot = root?.querySelector ? root.querySelector("#attendance-subpanel-root") : null;
  if (subpanelRoot) {
    subpanelRoot.innerHTML = renderActiveSubpanel();
    root.querySelectorAll("[data-attendance-hub-tile]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tileId = e.currentTarget.dataset.attendanceHubTile;
        navigate("attendance/" + tileId);
      });
    });
    root.querySelector("#attendance-back-to-hub-btn")?.addEventListener("click", () => {
      navigate("attendance");
    });
    wireAttendanceSubpanelActions(root);
  } else {
    root.innerHTML = renderAttendance();
    wireAttendance(root);
  }
}

function wireAttendanceSubpanelActions(root) {
  if (activeSubTab === "roster") {
    const cafeId = getActiveRosterCafeId();
    const weekStartDate = getRosterWeekStartDate();
    const rosterMatches =
      cachedRoster &&
      String(cachedRoster.cafeId || "") === String(cafeId || "") &&
      String(cachedRoster.weekStartDate || "") === String(weekStartDate);

    if (cafeId && !rosterMatches && !rosterLoadPromise) {
      loadRosterData({ cafeId, weekStartDate })
        .then(() => rerender(root))
        .catch((err) => showToast(err?.message || "Unable to load the authoritative weekly roster.", "error"));
    }
  }

  if (
    activeSubTab === "calendar360" &&
    selectedUserId &&
    (cachedCalendar360.userId !== selectedUserId || cachedCalendar360.month !== selectedCalendarMonth)
  ) {
    loadCalendar360Data()
      .then(() => rerender(root))
      .catch((err) => showToast(err?.message || "Unable to load employee attendance history.", "error"));
  }

  // Clickable KPI filters
  root.querySelectorAll(".kpi-card-clickable").forEach((card) => {
    card.addEventListener("click", (e) => {
      const filter = e.currentTarget.dataset.kpiFilter;
      if (filter === "OVERTIME") {
        activeSubTab = "exceptions";
      } else {
        liveFilterStatus = filter;
        activeSubTab = "live";
      }
      rerender(root);
    });
  });

  // Filter chips
  root.querySelectorAll(".live-filter-chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      liveFilterStatus = e.currentTarget.dataset.filter;
      rerender(root);
    });
  });

  // Top readiness filter buttons
  root.querySelectorAll(".view-filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const filter = e.currentTarget.dataset.filter;
      if (filter === "OVERTIME") {
        activeSubTab = "exceptions";
      } else {
        liveFilterStatus = filter;
        activeSubTab = "live";
      }
      rerender(root);
    });
  });

  // Live search input
  const searchInput = root.querySelector("#live-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      liveSearchQuery = e.target.value;
      rerender(root);
    });
  }

  // Attendance History / 360 buttons
  root.querySelectorAll(".view-employee-history-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      selectedUserId = e.currentTarget.dataset.user;
      activeSubTab = "calendar360";
      cachedCalendar360 = { userId: "", month: "", records: [], summary: null };
      rerender(root);
    });
  });

  // Wire QR Scanner subpanel if active
  if (activeSubTab === "qrScanner") {
    wireAttendanceQrScannerPage(root);
  }

  // Edit Attendance Record button (P0-A01)
  root.querySelectorAll(".edit-attendance-record-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const attId = e.currentTarget.dataset.attendanceId;
      openEditAttendanceModal(root, attId);
    });
  });

  // View Presence Evidence button
  root.querySelectorAll(".view-evidence-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const attId = e.currentTarget.dataset.attendanceId;
      if (attId) {
        openAttendanceEvidenceViewer({ attendanceId: attId });
      } else {
        showToast("No attendance ID associated with this row.", "warning");
      }
    });
  });

  // Show Attendance QR modal button
  root.querySelectorAll("#btn-show-attendance-qr, #btn-live-show-attendance-qr").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = state.role || state.user?.role || ROLES.MASTER;
      const isCafeAdmin = role === ROLES.CAFE_ADMIN;
      const activeCafe = isCafeAdmin
        ? (state.user?.primaryCafeId || state.user?.assignedCafeIds?.[0] || state.currentCafeId || "")
        : (selectedRosterCafe || state.currentCafeId || state.user?.primaryCafeId || cachedCafes[0]?.cafeId || cachedCafes[0]?.code || "");
      openAttendanceQrModal({ cafeId: activeCafe, cafeName: CAFE_NAMES[activeCafe] || state.currentCafeName || activeCafe });
    });
  });

  // Overtime decision / recommendation buttons
  root.querySelector("#recommend-ot-btn")?.addEventListener("click", async () => {
    const otRecord = cachedLiveAttendance.find(r => r.overtimeMinutes > 0);
    const otName = otRecord ? (otRecord.name || otRecord.userId) : "employee";
    const otId = otRecord?.attendanceId || otRecord?.userId || "";
    confirmAction(`Verify and recommend overtime for ${otName} to Master?`, async () => {
      await apiPost("/api/v1/attendance/overtime/decide", { attendanceId: otId, decision: "VERIFY_ADMIN", reason: "Peak coverage recommendation" });
      showToast("Overtime verified and recommended to Master for final decision.", "success");
      await loadLiveAttendanceData();
      rerender(root);
    });
  });

  root.querySelector("#approve-ot-btn")?.addEventListener("click", async () => {
    const otRecord = cachedLiveAttendance.find(r => r.overtimeMinutes > 0);
    const otName = otRecord ? (otRecord.name || otRecord.userId) : "employee";
    const otId = otRecord?.attendanceId || otRecord?.userId || "";
    const otMins = otRecord ? Math.round(otRecord.overtimeMinutes) : 0;
    confirmAction(`Approve ${otMins} minutes overtime for ${otName}?`, async () => {
      await apiPost("/api/v1/attendance/overtime/decide", { attendanceId: otId, decision: "APPROVE", approvedMinutes: otMins, reason: "Peak coverage" });
      showToast("Overtime approved with Master authority.", "success");
      await loadLiveAttendanceData();
      rerender(root);
    });
  });

  root.querySelector("#reject-ot-btn")?.addEventListener("click", async () => {
    const otRecord = cachedLiveAttendance.find(r => r.overtimeMinutes > 0);
    const otName = otRecord ? (otRecord.name || otRecord.userId) : "employee";
    const otId = otRecord?.attendanceId || otRecord?.userId || "";
    confirmAction(`Reject overtime claim for ${otName}?`, async () => {
      await apiPost("/api/v1/attendance/overtime/decide", { attendanceId: otId, decision: "REJECT", reason: "Overtime unverified" });
      showToast("Overtime rejected.", "info");
      await loadLiveAttendanceData();
      rerender(root);
    });
  });

  // Primary Master: expired orphan attendance evidence reconciliation
  root.querySelector("#preview-orphan-evidence-btn")?.addEventListener("click", async () => {
    try {
      const res = await apiPost("/attendance/evidence/orphans/reconcile", { execute: false });
      cachedOrphanReconciliation = res?.data || null;
      showToast(
        `Preview complete: ${Number(res?.data?.eligibleOrphans || 0)} expired unlinked upload(s) eligible; ${Number(res?.data?.staleReservationsQuarantined || 0)} stale reservation(s) quarantined.`,
        "info"
      );
      rerender(root);
    } catch (err) {
      showToast(err?.message || "Unable to preview orphan attendance evidence.", "error");
    }
  });

  root.querySelector("#execute-orphan-evidence-btn")?.addEventListener("click", () => {
    const eligible = Number(cachedOrphanReconciliation?.eligibleOrphans || 0);
    if (!eligible) {
      showToast("Run the preview first. No eligible orphan evidence is currently loaded.", "warning");
      return;
    }

    confirmAction(
      `Delete ${eligible} expired, unlinked attendance selfie upload(s)? Linked attendance evidence is protected and will not be deleted.`,
      async () => {
        try {
          const res = await apiPost("/attendance/evidence/orphans/reconcile", {
            execute: true,
            confirmation: "DELETE_EXPIRED_UNLINKED_ATTENDANCE_SELFIES",
          });
          cachedOrphanReconciliation = res?.data || null;
          showToast(
            `Orphan reconciliation completed: ${Number(res?.data?.deleted || 0)} file(s) deleted.`,
            "success"
          );
          rerender(root);
        } catch (err) {
          showToast(err?.message || "Unable to reconcile orphan attendance evidence.", "error");
        }
      }
    );
  });

  // Open Manual Attendance Modal (Both in Header and Child Header)
  root.querySelectorAll("#open-manual-attendance-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openScopedManualAttendanceModal(root);
    });
  });

  // Roster Café Switching
  const rosterCafeSel = root.querySelector("#roster-cafe-select");
  if (rosterCafeSel) {
    rosterCafeSel.addEventListener("change", async (e) => {
      selectedRosterCafe = e.target.value;
      cachedRoster = null;
      try {
        await loadRosterData();
        rerender(root);
      } catch (err) {
        showToast(err?.message || "Unable to load the selected café roster.", "error");
      }
    });
  }

  async function moveRosterWeek(nextOffset) {
    selectedRosterWeekOffset = nextOffset;
    cachedRoster = null;
    try {
      await loadRosterData();
      rerender(root);
    } catch (err) {
      showToast(err?.message || "Unable to load the selected roster week.", "error");
    }
  }

  root.querySelector("#roster-prev-week-btn")?.addEventListener("click", () => {
    moveRosterWeek(selectedRosterWeekOffset - 1);
  });
  root.querySelector("#roster-today-btn")?.addEventListener("click", () => {
    moveRosterWeek(0);
  });
  root.querySelector("#roster-next-week-btn")?.addEventListener("click", () => {
    moveRosterWeek(selectedRosterWeekOffset + 1);
  });

  // Click-to-edit is allowed only while the authoritative roster is a draft.
  root.querySelectorAll(".roster-shift-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (cachedRoster?.status === "PUBLISHED") {
        showToast("Published rosters are immutable.", "info");
        return;
      }
      const target = e.currentTarget;
      openEditShiftModal({
        root,
        staffIndex: Number(target.dataset.staffIndex),
        staffId: target.dataset.staffId,
        staffName: target.dataset.staffName,
        dayKey: target.dataset.dayKey,
        dayLabel: target.dataset.dayLabel,
        currentShift: target.dataset.currentShift,
      });
    });
  });

  root.querySelectorAll(".remove-staff-roster-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (cachedRoster?.status === "PUBLISHED") {
        showToast("Published rosters are immutable.", "info");
        return;
      }

      const activeCafeId = getActiveRosterCafeId();
      const staffList = cafeRosterSchedules[activeCafeId] || [];
      const idx = Number(e.currentTarget.dataset.staffIndex);
      const removed = staffList[idx];
      if (!removed) return;

      confirmAction(`Remove ${removed.name || removed.id} from this week's draft roster?`, async () => {
        const snapshot = staffList.map((row) => ({ ...row }));
        staffList.splice(idx, 1);
        try {
          await saveCurrentRosterDraft();
          showToast(`${removed.name || removed.id} removed from the draft roster.`, "success");
          rerender(root);
        } catch (err) {
          cafeRosterSchedules[activeCafeId] = snapshot;
          showToast(err?.message || "Failed to save the roster change.", "error");
          rerender(root);
        }
      });
    });
  });

  root.querySelector("#add-staff-roster-btn")?.addEventListener("click", () => {
    if (cachedRoster?.status === "PUBLISHED") {
      showToast("Published rosters are immutable.", "info");
      return;
    }
    openAddStaffToRosterModal(root);
  });

  root.querySelector("#export-roster-csv-btn")?.addEventListener("click", () => {
    exportRosterCsv();
  });

  root.querySelector("#publish-roster-btn")?.addEventListener("click", () => {
    if (cachedRoster?.status === "PUBLISHED") return;

    confirmAction("Publish this authoritative weekly roster and queue staff notifications?", async () => {
      try {
        let roster = cachedRoster;
        if (!roster?.rosterId) {
          roster = await saveCurrentRosterDraft();
        }

        const res = await apiPost(`/attendance/roster/${encodeURIComponent(roster.rosterId)}/publish`);
        const publishedRoster = res?.data?.roster;
        if (!publishedRoster || publishedRoster.status !== "PUBLISHED") {
          throw new Error("Roster publish did not return a published authoritative record.");
        }

        cachedRoster = publishedRoster;
        const activeCafeId = getActiveRosterCafeId();
        cafeRosterSchedules[activeCafeId] = normaliseRosterRows(publishedRoster);
        rosterPublishedMap[activeCafeId] = true;
        showToast("Weekly roster published. Staff notification delivery has been queued.", "success");
        rerender(root);
      } catch (err) {
        showToast(err?.message || "Roster publish failed. No success state was applied.", "error");
      }
    });
  });

  // Shift Master: Create Shift Template Modal
  root.querySelectorAll("#open-create-shift-btn, #open-create-shift-template-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openCreateShiftTemplateModal(root);
    });
  });

  // Shift Master: Edit Shift Template
  root.querySelectorAll(".edit-shift-template-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const shiftId = e.currentTarget.dataset.shiftId;
      const shift = (cachedShifts || []).find(s => s.shiftId === shiftId);
      if (shift) {
        openCreateShiftTemplateModal(root, shift);
      } else {
        showToast("Shift template details not found in cache.", "warning");
      }
    });
  });

  // Shift Master: Deactivate Shift Template
  root.querySelectorAll(".deactivate-shift-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const shiftId = e.currentTarget.dataset.shiftId;
      confirmAction(`Deactivate shift template ${shiftId}?`, async () => {
        try {
          await apiPatch(`/shifts/${shiftId}/deactivate`);
          showToast(`Shift template ${shiftId} deactivated.`, "success");
          await loadLiveAttendanceData();
          rerender(root);
        } catch (err) {
          showToast(err.message || "Failed to deactivate shift template.", "error");
        }
      });
    });
  });

  // Shift Master: Activate Shift Template
  root.querySelectorAll(".activate-shift-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const shiftId = e.currentTarget.dataset.shiftId;
      confirmAction(`Activate shift template ${shiftId}?`, async () => {
        try {
          await apiPatch(`/shifts/${shiftId}/activate`);
          showToast(`Shift template ${shiftId} activated.`, "success");
          await loadLiveAttendanceData();
          rerender(root);
        } catch (err) {
          showToast(err.message || "Failed to activate shift template.", "error");
        }
      });
    });
  });

  // Shift Master: Outlet Selection Filter
  root.querySelector("#shift-cafe-select")?.addEventListener("change", (e) => {
    selectedRosterCafe = e.target.value;
    rerender(root);
  });

  // Overtime Queue: Frontline Admin Recommendation
  root.querySelectorAll(".recommend-ot-row-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const attendanceId = e.currentTarget.dataset.attendanceId;
      confirmAction("Verify and recommend this overtime record to Master?", async () => {
        try {
          await apiPost("/attendance/overtime/decide", {
            attendanceId,
            decision: "VERIFY_ADMIN",
            reason: "Frontline admin operational verification",
          });
          showToast("Overtime verified and recommended to Master.", "success");
          await loadLiveAttendanceData();
          rerender(root);
        } catch (err) {
          showToast(err.message || "Failed to recommend overtime.", "error");
        }
      });
    });
  });

  // Overtime Queue: Master/Owner Approval
  root.querySelectorAll(".approve-ot-row-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const attendanceId = e.currentTarget.dataset.attendanceId;
      const detected = Number(e.currentTarget.dataset.detected) || 0;
      confirmAction(`Approve ${detected} minutes overtime with Master authority?`, async () => {
        try {
          await apiPost("/attendance/overtime/decide", {
            attendanceId,
            decision: "APPROVE",
            approvedMinutes: detected,
            reason: "Approved with Master authority for operational coverage",
          });
          showToast("Overtime approved successfully.", "success");
          await loadLiveAttendanceData();
          rerender(root);
        } catch (err) {
          showToast(err.message || "Failed to approve overtime.", "error");
        }
      });
    });
  });

  // Overtime Queue: Master/Owner Rejection
  root.querySelectorAll(".reject-ot-row-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const attendanceId = e.currentTarget.dataset.attendanceId;
      confirmAction("Reject this overtime claim?", async () => {
        try {
          await apiPost("/attendance/overtime/decide", {
            attendanceId,
            decision: "REJECT",
            reason: "Overtime rejected during audit review",
          });
          showToast("Overtime rejected.", "info");
          await loadLiveAttendanceData();
          rerender(root);
        } catch (err) {
          showToast(err.message || "Failed to reject overtime.", "error");
        }
      });
    });
  });

  // Exceptions Queue: Resolve Row Action
  root.querySelectorAll(".resolve-exception-row-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const exceptionId = e.currentTarget.dataset.exceptionId;
      openResolveExceptionModal(root, exceptionId);
    });
  });

  // Calendar 360: Employee Selection
  const calUserSel = root.querySelector("#calendar-user-select");
  if (calUserSel) {
    calUserSel.addEventListener("change", async (e) => {
      selectedUserId = e.target.value;
      cachedCalendar360 = { userId: "", month: "", records: [], summary: null };
      rerender(root);
    });
  }

  // Calendar 360: Month Selection
  const calMonthSel = root.querySelector("#calendar-month-select");
  if (calMonthSel) {
    calMonthSel.addEventListener("change", async (e) => {
      selectedCalendarMonth = e.target.value;
      cachedCalendar360 = { userId: "", month: "", records: [], summary: null };
      rerender(root);
    });
  }

  // Calendar 360: Export Timesheets Action
  root.querySelectorAll("#export-history-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      exportTimesheetsCsv();
    });
  });

  // Calendar 360: Click a recorded day to inspect the exact Check-In / Check-Out evidence.
  root.querySelectorAll(".calendar-day-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      const attendanceId = e.currentTarget.dataset.attendanceId;
      if (attendanceId) {
        openAttendanceEvidenceViewer({ attendanceId });
      }
    });
  });

  // Exceptions & Overtime: Resolve Attendance Exception Action
  root.querySelectorAll(".resolve-exception-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const empId = e.currentTarget.dataset.empId || "";
      const empName = e.currentTarget.dataset.empName || empId || "";
      openResolveExceptionModal(root, empId, empName);
    });
  });

  // Policies: Print Compliance Document Action
  root.querySelectorAll("#export-policy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openCompliancePolicyModal(root);
    });
  });

  // Closure: Close Period Modal Action
  root.querySelectorAll("#close-period-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openCloseTimesheetPeriodModal(root);
    });
  });

  // Closure: server-authoritative period lock / reopen actions.
  root.querySelector("#reopen-period-btn")?.addEventListener("click", () => {
    openReopenTimesheetPeriodModal(root);
  });

  root.querySelector("#lock-period-btn")?.addEventListener("click", () => {
    openCloseTimesheetPeriodModal(root);
  });

  // Analytics: Export Analytics CSV Actions
  root.querySelectorAll("#export-analytics-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      exportAnalyticsCsv();
    });
  });

  // Roster: Create Shift Roster Action
  root.querySelectorAll("#open-create-roster-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openCreateShiftRosterModal(root);
    });
  });
}

// Modal: Resolve Attendance Exception (Real API)
function openResolveExceptionModal(root, exceptionId) {
  const exc = (cachedExceptions || []).find(e => e.exceptionId === exceptionId);
  const typeStr = exc ? exc.type : "Attendance Exception";
  const userStr = exc ? exc.userId : "Staff";

  openModal({
    title: `Resolve Attendance Exception — ${typeStr}`,
    maxWidth: "520px",
    body: `
      <div style="display:flex; flex-direction:column; gap:14px; font-size:12.5px;">
        <div style="background:var(--surface-sunken); padding:12px; border-radius:8px; border:1px solid var(--line);">
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:700;">Exception Notice</div>
          <div style="font-size:14px; font-weight:800; color:var(--ink); margin-top:2px;">
            ${userStr} · ${typeStr}
          </div>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;">
            ${exc?.description || 'Review exception conditions and authorize resolution.'}
          </div>
        </div>

        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Resolution Action *</label>
          <select id="modal-resolve-action" class="input" style="font-size:12.5px; width:100%; box-sizing:border-box;">
            <option value="RESOLVE">RESOLVE (Acknowledge and Clear Exception)</option>
            <option value="DISMISS">DISMISS (Not an operational violation)</option>
          </select>
        </div>

        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Mandatory Reason / Notes *</label>
          <textarea id="modal-resolve-notes" class="input" rows="3" placeholder="e.g. Verified with supervisor; approved prep coverage" style="font-size:12px; width:100%; box-sizing:border-box;" required></textarea>
        </div>
      </div>
    `,
    saveLabel: "Submit Resolution",
    cancelLabel: "Cancel",
    onSave: async () => {
      const action = document.querySelector("#modal-resolve-action")?.value || "RESOLVE";
      const reason = document.querySelector("#modal-resolve-notes")?.value?.trim();
      if (!reason) {
        showToast("A mandatory reason is required to resolve or dismiss an exception.", "error");
        return;
      }
      try {
        const res = await apiPost(`/attendance/exceptions/${exceptionId}/resolve`, { action, reason });
        if (res?.success) {
          showToast(`Exception ${action.toLowerCase()}d successfully.`, "success");
          await loadLiveAttendanceData();
          rerender(root);
        }
      } catch (err) {
        showToast(err.message || "Failed to resolve exception.", "error");
      }
    },
  });
}

// Modal: Close & Lock Timesheet Period (Real API)
function openCloseTimesheetPeriodModal(root) {
  const periodKey = state.currentPeriodKey || new Date().toISOString().slice(0, 7);
  const periodId = `PER-${periodKey}`;

  openModal({
    title: `🔒 Close & Lock Payroll Period — ${periodKey}`,
    maxWidth: "560px",
    body: `
      <div style="display:flex; flex-direction:column; gap:14px; font-size:12.5px;">
        <div style="background:var(--surface-sunken); padding:12px; border-radius:8px; border:1px solid var(--line);">
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:700;">Target Cycle</div>
          <div style="font-size:15px; font-weight:800; color:var(--ink); margin-top:2px;">
            Period: ${periodKey} (${periodId})
          </div>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;">
            Closing locks timesheets against all edits and prepares data for Payroll Run.
          </div>
        </div>

        <div style="padding:12px; background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.2); border-radius:8px;">
          <div style="font-weight:700; color:#059669; margin-bottom:4px;">Pre-Closure Status:</div>
          <ul style="margin:0; padding-left:18px; color:var(--ink); font-size:12px; line-height:1.6;">
            <li>Review open attendance exceptions and pending overtime before locking.</li>
            <li>Primary Master authority is required for the server-side lock.</li>
          </ul>
        </div>

        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Closure Remarks *</label>
          <textarea id="modal-close-remarks" class="input" rows="2" placeholder="e.g. Monthly timesheet audited and closed for payroll handoff" style="font-size:12px; width:100%; box-sizing:border-box;"></textarea>
        </div>
      </div>
    `,
    saveLabel: "🔒 Lock Period & Finalize",
    cancelLabel: "Cancel",
    onSave: async () => {
      const remarks = document.querySelector("#modal-close-remarks")?.value?.trim() || "Period closed by Primary Master";
      try {
        const res = await apiPost(`/attendance/periods/${periodId}/close`, { remarks });
        if (res?.success) {
          showToast(`Period ${periodKey} locked successfully.`, "success");
          await loadLiveAttendanceData();
          rerender(root);
        }
      } catch (err) {
        showToast(err.message || "Failed to close period.", "error");
      }
    },
  });
}

// Modal: Create or Edit Shift Template (P1)

function openReopenTimesheetPeriodModal(root) {
  const periodKey = state.currentPeriodKey || new Date().toISOString().slice(0, 7);
  const periodId = `PER-${periodKey}`;

  openModal({
    title: `Reopen Attendance Period — ${periodKey}`,
    maxWidth: "520px",
    body: `
      <div style="display:flex; flex-direction:column; gap:12px; font-size:12.5px;">
        <div style="padding:12px; background:var(--surface-sunken); border:1px solid var(--line); border-radius:8px;">
          Reopening allows controlled attendance corrections again. The server records the Primary Master, timestamp and mandatory reason.
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px;">Mandatory Reopen Reason *</label>
          <textarea id="modal-reopen-reason" class="input" rows="3" placeholder="Explain why the locked attendance period must be reopened." style="width:100%; box-sizing:border-box;" required></textarea>
        </div>
      </div>
    `,
    saveLabel: "Reopen Period",
    cancelLabel: "Cancel",
    onSave: async () => {
      const reason = document.querySelector("#modal-reopen-reason")?.value?.trim();
      if (!reason) {
        showToast("A reason is required to reopen the attendance period.", "error");
        return;
      }
      try {
        const res = await apiPost(`/attendance/periods/${periodId}/reopen`, { reason });
        if (res?.success) {
          showToast(`Attendance period ${periodKey} reopened.`, "success");
          await loadLiveAttendanceData();
          rerender(root);
        }
      } catch (err) {
        showToast(err.message || "Failed to reopen attendance period.", "error");
      }
    },
  });
}

function openCreateShiftTemplateModal(root, shiftToEdit = null) {
  const isEditing = Boolean(shiftToEdit);
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;
  const activeCafeId = isCafeAdmin
    ? (state.user?.assignedCafeIds?.[0] || state.currentCafeId || "")
    : (selectedRosterCafe || state.currentCafeId || "");

  openModal({
    title: isEditing ? `Edit Shift Template — ${shiftToEdit.name}` : "Create New Shift Template",
    maxWidth: "520px",
    body: `
      <div style="display:flex; flex-direction:column; gap:14px; font-size:12.5px;">
        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Shift Name *</label>
          <input type="text" id="modal-shift-name" class="input" placeholder="e.g. Morning Roastery Shift" value="${shiftToEdit?.name || ''}" style="width:100%; box-sizing:border-box; font-size:12.5px;" required />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Start Time (HH:MM) *</label>
            <input type="time" id="modal-shift-start" class="input" value="${shiftToEdit?.startTime || '09:00'}" style="width:100%; box-sizing:border-box; font-size:12.5px;" required />
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">End Time (HH:MM) *</label>
            <input type="time" id="modal-shift-end" class="input" value="${shiftToEdit?.endTime || '17:30'}" style="width:100%; box-sizing:border-box; font-size:12.5px;" required />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Grace Minutes</label>
            <input type="number" id="modal-shift-grace" class="input" value="${shiftToEdit?.graceMinutes ?? 15}" min="0" max="60" style="width:100%; box-sizing:border-box; font-size:12.5px;" />
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Café Scope</label>
            <select id="modal-shift-cafe" class="input" style="width:100%; box-sizing:border-box; font-size:12.5px;" ${isCafeAdmin ? 'disabled' : ''}>
              <option value="">Org-Wide (All Cafés)</option>
              ${cachedCafes.map(c => {
                const cid = c.cafeId || c.code || c.id || c._id;
                const isSel = (shiftToEdit?.cafeId === cid) || (!shiftToEdit && activeCafeId === cid);
                return `<option value="${cid}" ${isSel ? 'selected' : ''}>${cid} · ${c.name || 'Outlet'}</option>`;
              }).join('')}
            </select>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="modal-shift-default" ${shiftToEdit?.isDefault ? 'checked' : ''} />
          <label for="modal-shift-default" style="font-weight:600; color:var(--ink); cursor:pointer;">Set as Default Shift for this café</label>
        </div>

        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Description</label>
          <textarea id="modal-shift-desc" class="input" rows="2" placeholder="Operational details, opening checklist duties..." style="width:100%; box-sizing:border-box; font-size:12px;">${shiftToEdit?.description || ''}</textarea>
        </div>
      </div>
    `,
    saveLabel: isEditing ? "Save Changes" : "Create Shift Template",
    cancelLabel: "Cancel",
    onSave: async () => {
      const name = document.querySelector("#modal-shift-name")?.value?.trim();
      const startTime = document.querySelector("#modal-shift-start")?.value?.trim();
      const endTime = document.querySelector("#modal-shift-end")?.value?.trim();
      const graceMinutes = Number(document.querySelector("#modal-shift-grace")?.value) || 15;
      const cafeId = isCafeAdmin ? activeCafeId : (document.querySelector("#modal-shift-cafe")?.value || null);
      const isDefault = document.querySelector("#modal-shift-default")?.checked || false;
      const description = document.querySelector("#modal-shift-desc")?.value?.trim() || "";

      if (!name || !startTime || !endTime) {
        showToast("Shift name, start time, and end time are required.", "error");
        return;
      }

      try {
        if (isEditing) {
          const res = await apiPatch(`/shifts/${shiftToEdit.shiftId}`, {
            name, startTime, endTime, graceMinutes, cafeId, isDefault, description,
          });
          if (res?.success) showToast("Shift template updated successfully.", "success");
        } else {
          const res = await apiPost("/shifts", {
            name, startTime, endTime, graceMinutes, cafeId, isDefault, description,
          });
          if (res?.success) showToast("Shift template created successfully.", "success");
        }
        await loadLiveAttendanceData();
        rerender(root);
      } catch (err) {
        showToast(err.message || "Failed to save shift template.", "error");
      }
    },
  });
}

// Modal: Interactive Edit Attendance Record (P0-A01 Master & Admin Edit with Live Recalculation)
function openEditAttendanceModal(root, attendanceId) {
  const record = cachedLiveAttendance.find(r => (r.attendanceId === attendanceId || r._id === attendanceId));
  if (!record) {
    showToast("Attendance record not found.", "error");
    return;
  }

  const role = state.role || state.user?.role || ROLES.MASTER;
  const currentStatus = record.status || "CHECKED_IN";
  if (currentStatus === "ON_LEAVE") {
    showToast("Approved leave records must be changed through the leave approval/reconciliation workflow.", "info");
    return;
  }
  const checkInVal = toIstTimeInput(record.checkInAt);
  const checkOutVal = toIstTimeInput(record.checkOutAt);
  const breakMinutesVal = record.breakMinutes ?? 0;
  const approvedOtVal = record.approvedOvertimeMinutes ?? 0;
  const businessDate = record.businessDate || getCurrentIstDateKey();

  openModal({
    title: `Edit Attendance Record — ${record.name || record.userId} (${record.attendanceId || attendanceId})`,
    maxWidth: "580px",
    body: `
      <div style="display:flex; flex-direction:column; gap:14px; font-size:12.5px;">
        <!-- Context Banner -->
        <div style="background:var(--surface-sunken); padding:12px 14px; border-radius:8px; border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:700;">Employee &amp; Outlet Target</div>
            <div style="font-size:14px; font-weight:800; color:var(--ink); margin-top:2px;">
              ${record.name || record.userId} <span style="font-size:12px; color:var(--color-accent-amber); font-family:var(--font-mono);">(${record.userId})</span>
            </div>
            <div style="font-size:12px; color:var(--muted); margin-top:2px;">
              Outlet: <strong>${record.cafeId || 'Outlet'}</strong> · Date: <strong>${businessDate}</strong>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:var(--muted);">Current Status</div>
            <span class="status info" style="font-size:11px; font-weight:700;">${currentStatus}</span>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Attendance Status *</label>
            <select id="edit-att-status" class="input" style="font-size:12.5px; width:100%;">
              <option value="CHECKED_IN" ${currentStatus === "CHECKED_IN" ? "selected" : ""}>CHECKED_IN</option>
              <option value="CHECKED_OUT" ${currentStatus === "CHECKED_OUT" ? "selected" : ""}>CHECKED_OUT</option>
              <option value="ON_BREAK" ${currentStatus === "ON_BREAK" ? "selected" : ""}>ON_BREAK</option>
              <option value="HALF_DAY" ${currentStatus === "HALF_DAY" ? "selected" : ""}>HALF_DAY</option>
              <option value="MANUALLY_CORRECTED" ${currentStatus === "MANUALLY_CORRECTED" ? "selected" : ""}>MANUALLY_CORRECTED</option>
              <option value="ABSENT" ${currentStatus === "ABSENT" ? "selected" : ""}>ABSENT</option>
              <option value="MISSED_PUNCH" ${currentStatus === "MISSED_PUNCH" ? "selected" : ""}>MISSED_PUNCH</option>
            </select>
          </div>

          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Break Minutes</label>
            <input type="number" id="edit-att-break" class="input" min="0" value="${breakMinutesVal}" style="font-size:12.5px; width:100%;" />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Clock-In Time (IST)</label>
            <input type="time" id="edit-att-in" class="input" value="${checkInVal}" style="font-size:12.5px; width:100%;" />
          </div>

          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Clock-Out Time (IST)</label>
            <input type="time" id="edit-att-out" class="input" value="${checkOutVal}" style="font-size:12.5px; width:100%;" />
          </div>
        </div>

        <!-- Live Recalculation Engine Preview Box -->
        <div id="edit-att-preview-box" style="background:var(--surface-sunken); padding:12px; border-radius:6px; border:1px solid var(--line);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase;">Live Authoritative Recalculation Preview</span>
            <span class="status info" style="font-size:10px;">ENGINE VERIFIED</span>
          </div>
          <div id="edit-att-preview-metrics" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; font-size:11.5px; text-align:center;">
            <div style="background:var(--surface); padding:6px; border-radius:4px; border:1px solid var(--line);">
              <div style="color:var(--muted);">Total Worked</div>
              <strong id="prev-worked" style="color:var(--ink); font-size:13px;">—</strong>
            </div>
            <div style="background:var(--surface); padding:6px; border-radius:4px; border:1px solid var(--line);">
              <div style="color:var(--muted);">Payable</div>
              <strong id="prev-payable" style="color:#059669; font-size:13px;">—</strong>
            </div>
            <div style="background:var(--surface); padding:6px; border-radius:4px; border:1px solid var(--line);">
              <div style="color:var(--muted);">Overtime</div>
              <strong id="prev-ot" style="color:var(--color-accent-amber); font-size:13px;">—</strong>
            </div>
            <div style="background:var(--surface); padding:6px; border-radius:4px; border:1px solid var(--line);">
              <div style="color:var(--muted);">Lateness</div>
              <strong id="prev-late" style="color:var(--color-warning); font-size:13px;">—</strong>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--ink);">Mandatory Operational Reason for Correction *</label>
          <textarea id="edit-att-reason" class="input" rows="2" placeholder="e.g. Approved adjustment following timesheet audit / biometric reader glitch" style="font-size:12px; width:100%; resize:none;" required></textarea>
        </div>
      </div>
    `,
    saveLabel: "Save Correction (Audit Sealed)",
    cancelLabel: "Cancel",
    onSave: async () => {
      const status = document.querySelector("#edit-att-status")?.value;
      const inTime = document.querySelector("#edit-att-in")?.value;
      const outTime = document.querySelector("#edit-att-out")?.value;
      const breakMins = Number(document.querySelector("#edit-att-break")?.value) || 0;
      const reason = document.querySelector("#edit-att-reason")?.value;

      if (!reason || !reason.trim()) {
        showToast("A mandatory operational reason is required for attendance correction.", "error");
        return false;
      }

      try {
        const payload = {
          status,
          breakMinutes: breakMins,
          reason: reason.trim(),
        };
        const checkInIso = istDateTimeToIso(businessDate, inTime);
        const checkOutIso = istDateTimeToIso(businessDate, outTime);
        if (checkInIso) payload.checkInAt = checkInIso;
        if (checkOutIso) payload.checkOutAt = checkOutIso;

        const targetId = record.attendanceId || attendanceId;
        await apiPatch(`/attendance/${targetId}`, payload);

        showToast("Attendance record successfully updated with full audit trail.", "success");
        await loadLiveAttendanceData();
        rerender(root);
      } catch (err) {
        showToast(err.message || "Failed to update attendance record.", "error");
        return false;
      }
    },
  });

  const updatePreview = async () => {
    const inTime = document.querySelector("#edit-att-in")?.value;
    const outTime = document.querySelector("#edit-att-out")?.value;
    const breakMins = Number(document.querySelector("#edit-att-break")?.value) || 0;

    if (!inTime) return;
    try {
      const checkInIso = istDateTimeToIso(businessDate, inTime);
      const checkOutIso = istDateTimeToIso(businessDate, outTime);
      const res = await apiPost("/attendance/preview-recalculation", {
        checkInAt: checkInIso,
        checkOutAt: checkOutIso,
        breakMinutes: breakMins,
        scheduledStartAt: record.scheduledStartAt || null,
        scheduledEndAt: record.scheduledEndAt || null,
        approvedOvertimeMinutes: approvedOtVal,
      });
      if (res?.data?.metrics) {
        const m = res.data.metrics;
        const prevWorked = document.querySelector("#prev-worked");
        const prevPayable = document.querySelector("#prev-payable");
        const prevOt = document.querySelector("#prev-ot");
        const prevLate = document.querySelector("#prev-late");
        if (prevWorked) prevWorked.innerText = `${Math.floor(m.totalWorkedMinutes / 60)}h ${m.totalWorkedMinutes % 60}m`;
        if (prevPayable) prevPayable.innerText = `${Math.floor(m.payableMinutes / 60)}h ${m.payableMinutes % 60}m`;
        if (prevOt) prevOt.innerText = `${m.overtimeMinutes}m`;
        if (prevLate) prevLate.innerText = m.isLate ? `${m.lateMinutes}m Late` : "On Time";
      }
    } catch {}
  };

  setTimeout(() => {
    document.querySelector("#edit-att-in")?.addEventListener("change", updatePreview);
    document.querySelector("#edit-att-out")?.addEventListener("change", updatePreview);
    document.querySelector("#edit-att-break")?.addEventListener("input", updatePreview);
    updatePreview();
  }, 100);
}

// Scoped Manual Attendance Modal with Dynamic Staff Loading & Operator Session Attribution
async function openScopedManualAttendanceModal(root) {
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;
  const assignedCafe =
    state.user?.assignedCafeIds?.[0] ||
    state.currentCafeId ||
    cachedCafes[0]?.cafeId ||
    cachedCafes[0]?.code ||
    '';

  if (!assignedCafe || assignedCafe === 'ALL') {
    showToast('A valid café context is required before recording manual attendance.', 'error');
    return;
  }

  const cafeName = CAFE_NAMES[assignedCafe] || state.currentCafeName || `Outlet ${assignedCafe}`;

  // Fetch real employees to eliminate empty staff dropdown
  let employeeList = [];
  try {
    const empRes = await apiGet("/employees?limit=200");
    const payload = empRes?.data?.employees || empRes?.data || empRes?.employees || (Array.isArray(empRes) ? empRes : []);
    employeeList = Array.isArray(payload) ? payload : [];
  } catch {
    employeeList = [];
  }

  const renderStaffOptions = (filterCafeId) => {
    let filtered = employeeList;
    if (filterCafeId) {
      const normalizedCafeId = String(filterCafeId).toUpperCase();
      filtered = employeeList.filter((employee) => {
        const assigned = new Set([
          ...(employee?.assignedCafeIds || []),
          employee?.primaryCafeId,
          employee?.cafeId,
        ].filter(Boolean).map((id) => String(id).toUpperCase()));
        return assigned.has(normalizedCafeId);
      });
    }
    if (filtered.length === 0) {
      return '<option value="">No employees found for selected outlet</option>';
    }
    return filtered.map(s => `<option value="${s.userId || s.id || s._id}">${s.name || s.fullName || s.userId} (${s.userId || s.id}${s.designation ? ' — ' + s.designation : ''})</option>`).join('');
  };

  openModal({
    title: isCafeAdmin ? "Record Manual Attendance · Single Café" : "Master Manual Attendance Entry",
    maxWidth: "540px",
    body: `
      <div style="display:flex; flex-direction:column; gap:14px; font-size:12.5px;">
        <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:6px; border:1px solid var(--line);">
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:700;">Operating Scope &amp; Provenance</div>
          <div style="font-size:13px; font-weight:700; color:var(--ink); margin-top:2px;">
            ${isCafeAdmin ? `${cafeName} (${assignedCafe})` : "All Outlets (Master Authority)"}
          </div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">
            Attributed to Operator Session: <strong style="font-family:var(--font-mono);">${state.user?.employeeId || state.user?.userId || "Unknown Operator"}</strong>
          </div>
        </div>

        ${!isCafeAdmin ? `
          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px;">Target Café*</label>
            <select id="modal-man-cafe" class="input" style="font-size:12.5px; width:100%;">
              ${cachedCafes.length ? cachedCafes.map(c => {
                const cid = c.cafeId || c.code || c.id || c._id;
                return `<option value="${cid}" ${cid === assignedCafe ? "selected" : ""}>${c.name || cid} (${cid})</option>`;
              }).join('') : `<option value="${assignedCafe}">${assignedCafe}</option>`}
            </select>
          </div>
        ` : ""}

        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px;">Target Employee*</label>
          <select id="modal-man-user" class="input" style="font-size:12.5px; width:100%;">
            ${renderStaffOptions(assignedCafe)}
          </select>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px;">Action Type*</label>
            <select id="modal-man-event" class="input" style="font-size:12.5px; width:100%;">
              <option value="CHECK_OUT">Record Check-Out</option>
              <option value="CHECK_IN">Record Check-In</option>
            </select>
          </div>

          <div class="form-group" style="margin:0;">
            <label style="font-weight:700; display:block; margin-bottom:4px;">Effective Time (IST)</label>
            <input type="text" id="modal-man-time" class="input" value="${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}" style="font-family:var(--font-mono); font-size:12.5px; width:100%;" />
          </div>
        </div>

        <div style="background:var(--surface-sunken); padding:12px; border-radius:6px; border:1px solid var(--line); font-size:12px; color:var(--muted);">
          The server will validate the employee's current attendance state and café assignment before committing this manual punch. Leave and full-day corrections use their dedicated workflows.
        </div>

        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px;">Mandatory Operational Reason*</label>
          <textarea id="modal-man-reason" class="input" rows="2" placeholder="e.g. Employee forgot to punch out at end of evening rush / Kiosk connection glitch" style="font-size:12px; width:100%; resize:none;" required></textarea>
        </div>
      </div>
    `,
    saveLabel: "Record Audited Entry",
    cancelLabel: "Cancel",
    onSave: async () => {
      const selectedCafe = document.querySelector("#modal-man-cafe")?.value || assignedCafe;
      const userId = document.querySelector("#modal-man-user")?.value;
      const eventType = document.querySelector("#modal-man-event")?.value;
      const effectiveTime = document.querySelector("#modal-man-time")?.value;
      const reason = document.querySelector("#modal-man-reason")?.value;

      if (!userId) {
        showToast("Please select a valid employee.", "error");
        return false;
      }

      if (!reason || !reason.trim()) {
        showToast("A mandatory operational reason is required for manual attendance.", "error");
        return false;
      }

      try {
        const effectiveTimestamp = istDateTimeToIso(getCurrentIstDateKey(), effectiveTime);
        if (!effectiveTimestamp) {
          showToast("Enter a valid effective time in HH:MM format.", "error");
          return false;
        }

        await apiPost("/attendance/master-manual", {
          userId,
          cafeId: selectedCafe,
          eventType,
          time: effectiveTimestamp,
          reason: reason.trim(),
        });
        showToast("Manual attendance successfully recorded with full audit trail.", "success");
        await loadLiveAttendanceData();
        rerender(root);
      } catch (err) {
        showToast(err.message || "Failed to record manual attendance.", "error");
        return false;
      }
    },
  });

  setTimeout(() => {
    document.querySelector("#modal-man-cafe")?.addEventListener("change", (e) => {
      const userSel = document.querySelector("#modal-man-user");
      if (userSel) {
        userSel.innerHTML = renderStaffOptions(e.target.value);
      }
    });
  }, 100);
}

// Modal: Interactive Click-to-Edit Shift
function openEditShiftModal({ root, staffIndex, staffId, staffName, dayKey, dayLabel, currentShift }) {
  const activeCafeId = getActiveRosterCafeId();
  const staffList = cafeRosterSchedules[activeCafeId] || [];
  const staffMember = staffList[staffIndex];

  let selectedShift = currentShift || "OFF";

  openModal({
    title: `Edit Shift — ${staffName} (${dayLabel})`,
    maxWidth: "520px",
    body: `
      <div style="display:flex; flex-direction:column; gap:16px; font-size:12.5px;">
        <div style="background:var(--surface-sunken); padding:12px; border-radius:8px; border:1px solid var(--line);">
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:700;">Shift Assignment Target</div>
          <div style="font-size:14px; font-weight:800; color:var(--ink); margin-top:2px;">
            ${staffName} <span style="font-size:12px; color:var(--color-accent-amber); font-family:var(--font-mono);">(${staffId})</span> · ${staffMember?.role || "Barista"}
          </div>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;">
            Target Day: <strong style="color:var(--ink);">${dayLabel}</strong> · Current Shift: <strong style="color:var(--color-accent-amber);">${currentShift}</strong>
          </div>
        </div>

        <div>
          <label style="font-weight:700; display:block; margin-bottom:8px; color:var(--ink);">Choose Shift Preset:</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <button type="button" class="btn btn-ghost shift-preset-btn ${selectedShift === "06:30 - 15:00" ? "btn-primary" : ""}" data-shift="06:30 - 15:00" style="padding:8px 10px; font-size:12px; justify-content:flex-start; text-align:left;">
              <div>🌅 <strong>Morning Opening</strong></div>
              <div style="font-size:10.5px; opacity:0.8; font-family:var(--font-mono);">06:30 – 15:00 (8.5h)</div>
            </button>

            <button type="button" class="btn btn-ghost shift-preset-btn ${selectedShift === "10:00 - 18:30" ? "btn-primary" : ""}" data-shift="10:00 - 18:30" style="padding:8px 10px; font-size:12px; justify-content:flex-start; text-align:left;">
              <div>☀️ <strong>Mid / Rush Shift</strong></div>
              <div style="font-size:10.5px; opacity:0.8; font-family:var(--font-mono);">10:00 – 18:30 (8.5h)</div>
            </button>

            <button type="button" class="btn btn-ghost shift-preset-btn ${selectedShift === "13:00 - 21:30" ? "btn-primary" : ""}" data-shift="13:00 - 21:30" style="padding:8px 10px; font-size:12px; justify-content:flex-start; text-align:left;">
              <div>🌆 <strong>Evening Closing</strong></div>
              <div style="font-size:10.5px; opacity:0.8; font-family:var(--font-mono);">13:00 – 21:30 (8.5h)</div>
            </button>

            <button type="button" class="btn btn-ghost shift-preset-btn ${selectedShift === "21:00 - 05:30" ? "btn-primary" : ""}" data-shift="21:00 - 05:30" style="padding:8px 10px; font-size:12px; justify-content:flex-start; text-align:left;">
              <div>🌙 <strong>Night Roastery</strong></div>
              <div style="font-size:10.5px; opacity:0.8; font-family:var(--font-mono);">21:00 – 05:30 (8.5h)</div>
            </button>

            <button type="button" class="btn btn-ghost shift-preset-btn ${selectedShift === "OFF" ? "btn-primary" : ""}" data-shift="OFF" style="padding:8px 10px; font-size:12px; justify-content:flex-start; text-align:left;">
              <div>🏖️ <strong>Weekly Off</strong></div>
              <div style="font-size:10.5px; opacity:0.8;">Rest / Weekly Day Off</div>
            </button>

          </div>
        </div>

        <div style="border-top:1px solid var(--line); padding-top:12px;">
          <label style="font-weight:700; display:block; margin-bottom:6px; color:var(--ink);">Or Custom Shift Timing:</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
              <label style="font-size:11px; color:var(--muted); display:block; margin-bottom:2px;">Start Time</label>
              <input type="time" id="modal-custom-start" class="input" value="${currentShift.includes("-") ? currentShift.split("-")[0].trim() : "07:00"}" style="width:100%; box-sizing:border-box; font-size:12.5px;" />
            </div>
            <div>
              <label style="font-size:11px; color:var(--muted); display:block; margin-bottom:2px;">End Time</label>
              <input type="time" id="modal-custom-end" class="input" value="${currentShift.includes("-") ? currentShift.split("-")[1].trim() : "15:30"}" style="width:100%; box-sizing:border-box; font-size:12.5px;" />
            </div>
          </div>
        </div>
      </div>
    `,
    saveLabel: "Update Shift",
    cancelLabel: "Cancel",
    onSave: async () => {
      if (!staffMember) return false;
      const previousShift = staffMember[dayKey];
      staffMember[dayKey] = selectedShift;
      try {
        await saveCurrentRosterDraft();
        showToast(`Shift saved for ${staffName} on ${dayLabel}.`, "success");
        rerender(root);
      } catch (err) {
        staffMember[dayKey] = previousShift;
        showToast(err?.message || "Failed to save the shift change.", "error");
        return false;
      }
    },
  });

  // Wire preset buttons inside modal
  const modalEl = document.querySelector(".modal-card") || document;
  modalEl.querySelectorAll(".shift-preset-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      selectedShift = e.currentTarget.dataset.shift;
      modalEl.querySelectorAll(".shift-preset-btn").forEach((b) => b.classList.remove("btn-primary"));
      e.currentTarget.classList.add("btn-primary");
    });
  });

  const startIn = modalEl.querySelector("#modal-custom-start");
  const endIn = modalEl.querySelector("#modal-custom-end");
  const handleCustomChange = () => {
    if (startIn?.value && endIn?.value) {
      selectedShift = `${startIn.value} - ${endIn.value}`;
      modalEl.querySelectorAll(".shift-preset-btn").forEach((b) => b.classList.remove("btn-primary"));
    }
  };
  startIn?.addEventListener("change", handleCustomChange);
  endIn?.addEventListener("change", handleCustomChange);
}

// Modal: Add Staff to Weekly Shift Roster
async function openAddStaffToRosterModal(root) {
  const activeCafeId = getActiveRosterCafeId();
  if (!activeCafeId) {
    showToast("Select an authorised café before editing a roster.", "error");
    return;
  }

  const staffList = cafeRosterSchedules[activeCafeId] || (cafeRosterSchedules[activeCafeId] = []);
  if (!cachedEmployees.length) {
    await loadEmployeeDirectory();
  }

  const existingIds = new Set(staffList.map((row) => String(row.id || "").toUpperCase()));
  const employees = (cachedEmployees || []).filter((employee) => {
    const userId = String(employee?.userId || employee?.employeeId || employee?.id || employee?._id || "").toUpperCase();
    if (!userId || existingIds.has(userId)) return false;

    const assigned = new Set([
      ...(employee?.assignedCafeIds || []),
      employee?.primaryCafeId,
      employee?.cafeId,
    ].filter(Boolean).map((id) => String(id).toUpperCase()));

    return assigned.has(String(activeCafeId).toUpperCase());
  });

  const shifts = (cachedShifts || []).filter((shift) =>
    shift?.isActive !== false && (!shift?.cafeId || String(shift.cafeId) === String(activeCafeId))
  );

  if (!employees.length) {
    showToast("No additional authoritative employees are available for this café.", "info");
    return;
  }
  if (!shifts.length) {
    showToast("Configure an active shift template before assigning staff to the roster.", "error");
    return;
  }

  openModal({
    title: `Add Staff Assignment · ${CAFE_NAMES[activeCafeId] || activeCafeId}`,
    maxWidth: "540px",
    body: `
      <div style="display:flex; flex-direction:column; gap:14px; font-size:12.5px;">
        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px;">Employee *</label>
          <select id="modal-add-staff-select" class="input" style="width:100%;">
            ${employees.map((employee) => {
              const id = employee.userId || employee.employeeId || employee.id || employee._id;
              const name = employee.name || employee.fullName || id;
              return `<option value="${id}">${name} (${id})</option>`;
            }).join("")}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px;">First Assignment Day *</label>
          <select id="modal-add-staff-day" class="input" style="width:100%;">
            <option value="mon">Monday</option><option value="tue">Tuesday</option>
            <option value="wed">Wednesday</option><option value="thu">Thursday</option>
            <option value="fri">Friday</option><option value="sat">Saturday</option>
            <option value="sun">Sunday</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px;">Shift Template *</label>
          <select id="modal-add-staff-shift" class="input" style="width:100%;">
            ${shifts.map((shift, index) =>
              `<option value="${index}">${shift.name || shift.shiftId} · ${shift.startTime} – ${shift.endTime}</option>`
            ).join("")}
          </select>
        </div>
        <div style="font-size:11.5px; color:var(--muted);">
          This creates one real roster assignment. Add or edit other days from the weekly grid.
        </div>
      </div>
    `,
    saveLabel: "Save Assignment",
    cancelLabel: "Cancel",
    onSave: async () => {
      const employeeId = document.getElementById("modal-add-staff-select")?.value || "";
      const dayKey = document.getElementById("modal-add-staff-day")?.value || "mon";
      const shiftIndex = Number(document.getElementById("modal-add-staff-shift")?.value || 0);
      const employee = employees.find((item) =>
        String(item?.userId || item?.employeeId || item?.id || item?._id) === String(employeeId)
      );
      const shift = shifts[shiftIndex];
      if (!employee || !shift) {
        showToast("Select a valid employee and shift template.", "error");
        return false;
      }

      const row = {
        id: employee.userId || employee.employeeId || employee.id || employee._id,
        name: employee.name || employee.fullName || employeeId,
        role: employee.designation || employee.role || "",
        mon: "OFF", tue: "OFF", wed: "OFF", thu: "OFF", fri: "OFF", sat: "OFF", sun: "OFF",
      };
      row[dayKey] = `${shift.startTime} - ${shift.endTime}`;
      staffList.push(row);

      try {
        await saveCurrentRosterDraft();
        showToast(`${row.name} added to the draft roster.`, "success");
        rerender(root);
      } catch (err) {
        staffList.pop();
        showToast(err?.message || "Failed to save the roster assignment.", "error");
        return false;
      }
    },
  });
}


function exportRosterCsv() {
  const activeCafeId = state.role === ROLES.CAFE_ADMIN
    ? (state.user?.assignedCafeIds?.[0] || state.currentCafeId || "")
    : (selectedRosterCafe || state.currentCafeId || cachedCafes[0]?.cafeId || cachedCafes[0]?.code || "");
  const staffList = cafeRosterSchedules[activeCafeId] || Object.values(cafeRosterSchedules)[0] || [];

  const headers = ["Employee ID", "Staff Name", "Role", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Total Hours"];
  const rows = staffList.map((s) => {
    const tot = calculateShiftHours(s.mon) + calculateShiftHours(s.tue) + calculateShiftHours(s.wed) + calculateShiftHours(s.thu) + calculateShiftHours(s.fri) + calculateShiftHours(s.sat) + calculateShiftHours(s.sun);
    return [s.id, s.name, s.role, s.mon, s.tue, s.wed, s.thu, s.fri, s.sat, s.sun, tot.toFixed(1)];
  });

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Zamorin_Shift_Roster_${activeCafeId}_Week.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Weekly Shift Roster CSV exported successfully.", "success");
}

// Modal: Create Weekly Shift Roster
function openCreateShiftRosterModal(root) {
  const role = state.role || state.user?.role || ROLES.MASTER;
  const isCafeAdmin = role === ROLES.CAFE_ADMIN;
  const assignedCafe = state.user?.assignedCafeIds?.[0] || state.user?.primaryCafeId || state.currentCafeId || "";
  const defaultMonday = getRosterWeekStartDate(0);

  openModal({
    title: "Create or Open Weekly Roster",
    maxWidth: "540px",
    body: `
      <div style="display:flex; flex-direction:column; gap:14px; font-size:12.5px;">
        <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:8px; border:1px solid var(--line);">
          Select a café and Monday. If a roster already exists, it will be opened without overwriting assignments.
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px;">Target Café *</label>
          <select id="modal-roster-cafe" class="input" style="width:100%;">
            ${cachedCafes.length ? cachedCafes.map((cafe) => {
              const cid = cafe.cafeId || cafe.code || cafe.id || cafe._id;
              const disabled = isCafeAdmin && String(cid) !== String(assignedCafe) ? "disabled" : "";
              return `<option value="${cid}" ${String(cid) === String(assignedCafe) ? "selected" : ""} ${disabled}>${cafe.name || cid} (${cid})</option>`;
            }).join("") : `<option value="${assignedCafe}">${assignedCafe || "Current Outlet"}</option>`}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-weight:700; display:block; margin-bottom:4px;">Week Starting Monday *</label>
          <input type="date" id="modal-roster-week-start" class="input" value="${defaultMonday}" style="width:100%;" />
        </div>
      </div>
    `,
    saveLabel: "Open Roster",
    cancelLabel: "Cancel",
    onSave: async () => {
      const cafeId = document.getElementById("modal-roster-cafe")?.value || assignedCafe;
      const weekStartDate = document.getElementById("modal-roster-week-start")?.value || "";
      if (!cafeId || !weekStartDate) {
        showToast("Café and week-start date are required.", "error");
        return false;
      }

      try {
        const existingRes = await apiGet(
          `/attendance/roster?cafeId=${encodeURIComponent(cafeId)}&weekStartDate=${encodeURIComponent(weekStartDate)}`
        );
        let roster = existingRes?.data?.roster || null;

        if (!roster?.rosterId) {
          const createRes = await apiPost("/attendance/roster", {
            cafeId,
            weekStartDate,
            assignments: [],
          });
          roster = createRes?.data?.roster || null;
        }

        if (!roster) throw new Error("Roster could not be opened.");

        selectedRosterCafe = cafeId;
        const currentMonday = new Date(`${getRosterWeekStartDate(0)}T12:00:00+05:30`);
        const targetMonday = new Date(`${weekStartDate}T12:00:00+05:30`);
        selectedRosterWeekOffset = Math.round((targetMonday - currentMonday) / (7 * 86400000));
        cachedRoster = roster;
        cafeRosterSchedules[cafeId] = normaliseRosterRows(roster);
        rosterPublishedMap[cafeId] = roster.status === "PUBLISHED";
        showToast(roster.status === "PUBLISHED" ? "Published roster opened." : "Draft roster opened.", "success");
        activeSubTab = "roster";
        rerender(root);
      } catch (err) {
        showToast(err?.message || "Unable to create or open the roster.", "error");
        return false;
      }
    },
  });
}


// Utility: Export Timesheets CSV
function exportTimesheetsCsv() {
  const headers = ["Employee ID", "Employee Name", "Role", "Café", "Date", "Shift", "Clock In", "Clock Out", "Total Hours", "Status"];
  const cafeId = state.currentCafeId || state.user?.assignedCafeIds?.[0] || "";
  const rows = cachedLiveAttendance.length > 0
    ? cachedLiveAttendance.map(a => [
        a.userId || a.employeeId || "",
        a.name || a.employeeName || "",
        a.role || "",
        a.cafeId || cafeId,
        a.date || new Date().toISOString().slice(0, 10),
        a.shift || "Standard",
        a.checkInAt || "—",
        a.checkOutAt || "—",
        ((a.regularMinutes || 0) / 60).toFixed(2),
        a.status || "PRESENT"
      ])
    : [];
  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Zamorin_Attendance_Timesheets_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Attendance Timesheets CSV exported successfully.", "success");
}

// Modal: Official Attendance & Statutory Compliance Certificate
function openCompliancePolicyModal(root) {
  const scopedCafeId =
    (state.selectedCafeId && state.selectedCafeId !== "ALL" ? state.selectedCafeId : "") ||
    state.currentCafeId ||
    state.user?.primaryCafeId ||
    state.user?.assignedCafeIds?.[0] ||
    "";
  const cafe = (cachedCafes || []).find((c) => (c.cafeId || c.code || c.id) === scopedCafeId) || null;
  const radius = Number(cafe?.address?.geofenceRadiusMetres ?? cafe?.geofenceRadiusMetres);
  const geofenceConfigured =
    Number.isFinite(Number(cafe?.address?.latitude)) &&
    Number.isFinite(Number(cafe?.address?.longitude)) &&
    Number.isFinite(radius);

  openModal({
    title: "Attendance Runtime Controls Summary",
    maxWidth: "720px",
    body: `
      <div style="display:flex; flex-direction:column; gap:14px; font-size:12.5px;">
        <div style="padding:12px; background:var(--surface-sunken); border:1px solid var(--line); border-radius:8px;">
          This document describes controls implemented by the attendance application. It is <strong>not</strong> a legal, labour-law, privacy, payroll, or statutory compliance certification.
        </div>
        <div class="card" style="padding:14px;">
          <strong style="display:block; margin-bottom:8px;">Secure Punch Controls</strong>
          <div style="display:grid; grid-template-columns:1fr auto; gap:8px 14px;">
            <span>Rotating café QR challenge</span><strong>Required</strong>
            <span>Signed employee/transition scan grant</span><strong>Required</strong>
            <span>Server-side GPS geofence verification</span><strong>Required</strong>
            <span>Distinct Check-In and Check-Out selfie evidence</span><strong>Required</strong>
            <span>Attendance evidence access</span><strong>Authenticated &amp; scoped</strong>
          </div>
        </div>
        <div class="card" style="padding:14px;">
          <strong style="display:block; margin-bottom:8px;">Selected Café Geofence</strong>
          <div>${scopedCafeId || "No café selected"} · ${geofenceConfigured ? `${Math.round(radius)} m configured radius` : "geofence configuration unavailable in this view"}</div>
        </div>
        <div class="card" style="padding:14px;">
          <strong style="display:block; margin-bottom:6px;">Evidence Retention</strong>
          <div style="color:var(--muted); line-height:1.5;">
            This screen does not invent a retention period or purge count. Physical deletion remains disabled until an explicit retention cutoff and verified provider deletion workflow are configured.
          </div>
        </div>
      </div>
    `,
    saveLabel: "🖨️ Print Runtime Controls",
    cancelLabel: "Close",
    onSave: async () => {
      window.print();
      return false;
    },
  });
}
function exportAnalyticsCsv() {
  const records = cachedLiveAttendance || [];
  if (!records.length) {
    showToast("No authoritative attendance records are loaded for export.", "info");
    return;
  }

  const escapeCsv = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const cafeIds = [...new Set(records.map((r) => r.cafeId).filter(Boolean))];
  const rows = cafeIds.map((cafeId) => {
    const cafeRecords = records.filter((r) => r.cafeId === cafeId);
    const checkIns = cafeRecords.filter((r) => r.checkInAt || ["CHECKED_IN", "CHECKED_OUT", "ON_BREAK"].includes(r.status));
    const late = checkIns.filter((r) => Boolean(r.isLate)).length;
    const regularMinutes = cafeRecords.reduce((sum, r) => sum + (Number(r.regularMinutes) || 0), 0);
    const approvedOt = cafeRecords.reduce((sum, r) => sum + (Number(r.approvedOvertimeMinutes) || 0), 0);
    const manual = cafeRecords.filter((r) => Boolean(r.isManualEntry)).length;
    return [
      cafeId,
      CAFE_NAMES[cafeId] || cachedCafes.find((c) => (c.cafeId || c.code) === cafeId)?.name || "Outlet",
      cafeRecords.length,
      checkIns.length,
      late,
      (regularMinutes / 60).toFixed(2),
      (approvedOt / 60).toFixed(2),
      manual,
      checkIns.length ? (((checkIns.length - late) / checkIns.length) * 100).toFixed(1) : "",
    ];
  });

  const headers = [
    "Outlet ID",
    "Outlet Name",
    "Attendance Records",
    "Check-In Records",
    "Late Records",
    "Regular Hours",
    "Approved Overtime Hours",
    "Manual Entries",
    "On-Time Rate %",
  ];
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `Zamorin_Attendance_Analytics_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  showToast("Loaded attendance analytics exported.", "success");
}

// =============================================================================
// MODAL: ROTATING ATTENDANCE QR DISPLAY (STAFF CHECK-IN / CHECK-OUT)
// =============================================================================
export function openAttendanceQrModal({ cafeId, cafeName } = {}) {
  let existing = document.getElementById("attendance-qr-modal");
  if (existing) {
    if (typeof existing._cleanup === "function") existing._cleanup();
    existing.remove();
  }

  const activeCafeId = cafeId || state.user?.primaryCafeId || state.user?.assignedCafeIds?.[0] || state.currentCafeId || "";
  if (!activeCafeId) {
    showToast("Select an authorised café before opening the attendance QR.", "warning");
    return;
  }
  const activeCafeName = cafeName || CAFE_NAMES[activeCafeId] || state.currentCafeName || activeCafeId;

  const modal = document.createElement("div");
  modal.id = "attendance-qr-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:1060; padding:16px; backdrop-filter:blur(4px);";

  let rotationTimer = null;
  let countdownTimer = null;
  let countdownSeconds = 45;

  const cleanup = () => {
    if (rotationTimer) clearInterval(rotationTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    rotationTimer = null;
    countdownTimer = null;
  };
  modal._cleanup = cleanup;

  const close = () => {
    cleanup();
    modal.remove();
  };

  modal.innerHTML = `
    <div class="card" id="attendance-qr-card" style="width:100%; max-width:440px; padding:24px; background:var(--bg-surface-1, #18181b); border-radius:var(--radius-lg, 12px); box-shadow:var(--shadow-2xl); border:1px solid var(--border-subtle, #3f3f46); text-align:center; color:var(--text-primary, #f4f4f5);">
      <div class="flex items-center justify-between" style="margin-bottom:12px;">
        <div style="font-size:15px; font-weight:800; color:var(--brand-gold, #c89d5c); display:flex; align-items:center; gap:6px;">
          <span>📱</span>
          <span>Attendance Punch QR</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-xs btn-ghost" id="qr-modal-fullscreen-btn" type="button" title="Toggle Fullscreen" style="font-size:12px;">⛶</button>
          <button class="btn btn-xs btn-ghost" id="qr-modal-close-btn" type="button" style="font-size:16px;">✕</button>
        </div>
      </div>

      <div style="font-size:18px; font-weight:800; color:#ffffff; margin-bottom:2px;" id="qr-modal-cafe-title">
        ${activeCafeName}
      </div>
      <div style="font-size:11.5px; color:var(--text-muted, #a1a1aa); font-family:var(--font-mono, monospace); margin-bottom:16px;">
        Café ID: ${activeCafeId} · IST Synced
      </div>

      <!-- Rotating QR Container -->
      <div id="qr-modal-svg-wrap" style="background:#ffffff; padding:14px; border-radius:12px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:16px; min-width:240px; min-height:240px; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <div class="za-spinner" style="width:32px; height:32px; border:3px solid rgba(0,0,0,0.1); border-top-color:#c89d5c; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
      </div>

      <div style="font-size:12.5px; font-weight:600; color:var(--text-secondary, #d4d4d8); margin-bottom:14px;">
        Staff scan this QR code using their mobile Attendance Check-In / Check-Out
      </div>

      <div class="flex justify-between items-center" style="padding:10px 14px; background:var(--bg-surface-2, #27272a); border-radius:8px; font-size:12px;">
        <span>Auto-rotates in: <strong id="qr-modal-timer" style="color:var(--brand-gold, #c89d5c); font-family:var(--font-mono, monospace); font-size:13px;">45s</strong></span>
        <span id="qr-modal-status" class="badge badge-mint" style="font-size:10.5px;">● ACTIVE</span>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#qr-modal-close-btn")?.addEventListener("click", close);
  modal.querySelector("#qr-modal-fullscreen-btn")?.addEventListener("click", () => {
    const card = modal.querySelector("#attendance-qr-card");
    if (!document.fullscreenElement) {
      card?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  const svgWrap = modal.querySelector("#qr-modal-svg-wrap");
  const timerEl = modal.querySelector("#qr-modal-timer");
  const statusEl = modal.querySelector("#qr-modal-status");

  async function fetchChallenge() {
    if (statusEl) {
      statusEl.className = "badge badge-gold";
      statusEl.textContent = "● ROTATING";
    }

    try {
      const res = await apiGet(`/attendance/qr/active?cafeId=${encodeURIComponent(activeCafeId)}`);
      if (res?.data?.qrToken) {
        countdownSeconds = Math.max(1, res.data.remainingSeconds || res.data.secondsRemaining || 45);
        if (svgWrap) {
          const qrPayload = res.data.attendanceUrl || res.data.opaqueToken || res.data.qrToken;
          const svg = generateQrSvg(qrPayload, { size: 240, margin: 2 });
          svgWrap.innerHTML = svg;
        }
        if (statusEl) {
          statusEl.className = "badge badge-mint";
          statusEl.textContent = "● ACTIVE";
        }
      }
    } catch (err) {
      if (statusEl) {
        statusEl.className = "badge badge-coral";
        statusEl.textContent = "● ERROR";
      }
      if (svgWrap) {
        svgWrap.innerHTML = `<div style="color:#ef4444; font-size:12px; font-weight:700;">Challenge Error</div>`;
      }
    }
  }

  fetchChallenge();

  countdownTimer = setInterval(() => {
    countdownSeconds -= 1;
    if (timerEl) timerEl.textContent = `${Math.max(0, countdownSeconds)}s`;
    if (countdownSeconds <= 0) {
      fetchChallenge();
    }
  }, 1000);
}





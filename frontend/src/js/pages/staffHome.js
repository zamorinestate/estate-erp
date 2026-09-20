// =============================================================================
// PAGE: Staff Home / Employee Self-Service Dashboard (EMP-SCR-001)
//
// Complete production-grade Employee Self-Service dashboard for Zamorin Cafe ERP.
// Strictly SELF-SERVICE ONLY. Conforms to 100% Zamorin Design System tokens.
// =============================================================================

import { state } from "../state.js";
import { navigate } from "../router.js";
import { icon } from "../icons.js";
import { apiGet, apiPost, API_BASE_URL, getAccessToken } from "../apiClient.js";
import { showToast } from "../components.js";
import { setSettingsActiveSection } from "./settingsShared.js";
import { openVerificationModal } from "../modules/attendance/staffAttendance.js";
import { setupModalA11y } from "../utils/modalA11y.js";

const PRIVACY_MODE_KEY = "zamorin-staff-privacy-mode";

export function isPrivacyModeActive() {
  return localStorage.getItem(PRIVACY_MODE_KEY) === "true";
}

export function togglePrivacyMode() {
  const current = isPrivacyModeActive();
  localStorage.setItem(PRIVACY_MODE_KEY, current ? "false" : "true");
  return !current;
}

export function formatPaise(paise, privacy = false) {
  if (privacy && isPrivacyModeActive()) {
    return "₹ ••,•••";
  }
  const inr = ((paise || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return "₹ " + inr;
}

export const DEFAULT_STAFF_DATA = {
  employee: {
    id: "",
    badgeId: "",
    name: "Staff Member",
    preferredName: "Staff",
    avatarInitials: "ST",
    designation: "Team Member",
    cafeName: "Zamorin Cafe",
  },
  todayShift: {
    startTime: "—",
    endTime: "—",
    dutyDesignation: "No Shift Scheduled",
    cafeName: "—",
    attendanceState: "NO_SHIFT",
  },
  nextShift: {
    day: "None",
    startTime: "—",
    endTime: "—",
    dutyDesignation: "No Upcoming Shift",
    date: "—",
  },
  attendanceSummary: {
    presentDays: 0,
    lateDays: 0,
    overtimeHours: 0,
  },
  leaveSummary: {
    casualLeaveBalance: 0,
    totalAvailableDays: 0,
  },
  payslipSummary: {
    periodName: "Current",
    status: "No Payslips",
    netPayPaise: 0,
  },
  loanSummary: {
    hasActiveLoan: false,
    outstandingPaise: 0,
  },
  actionRequired: [],
  announcements: [],
  weekSchedule: [],
};

export const STAFF_DIRECTORY = [];
export let activeStaffEmployeeId = "";

export function getInitialStaffData() {
  const u = state.user || state.auth?.user || {};
  if (u.name || u.userId) {
    return {
      ...DEFAULT_STAFF_DATA,
      employee: {
        id: u.userId || "",
        badgeId: u.userId || "STAFF",
        name: u.name || u.fullName || "Staff Member",
        preferredName: u.preferredName || u.name || "Staff",
        avatarInitials: u.name ? u.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() : "ST",
        designation: u.designation || "Team Member",
        cafeName: u.primaryCafeName || (u.primaryCafeId ? `Outlet ${u.primaryCafeId}` : "Zamorin Cafe"),
      },
    };
  }
  return DEFAULT_STAFF_DATA;
}

export function renderStaffHome() {
  const currentData = (activeStaffEmployeeId && STAFF_DIRECTORY.find((s) => s.employee.id === activeStaffEmployeeId)) || getInitialStaffData();
  return `
    <div class="page-enter staff-dashboard-root" id="staff-dashboard-container" style="max-width:1240px; margin:0 auto; padding:12px 16px 40px 16px;">
      <!-- Dynamic Dashboard Mount -->
      <div id="staff-dashboard-content">
        ${renderDashboardBody(currentData)}
      </div>
    </div>
  `;
}

function renderLoadingSkeleton() {
  return `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div class="card card-skeleton" style="height:76px; border-radius:var(--radius-lg);"></div>
      <div class="card card-skeleton" style="height:180px; border-radius:var(--radius-lg);"></div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
        <div class="card card-skeleton" style="height:140px;"></div>
        <div class="card card-skeleton" style="height:140px;"></div>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
        <div class="card card-skeleton" style="height:120px;"></div>
        <div class="card card-skeleton" style="height:120px;"></div>
        <div class="card card-skeleton" style="height:120px;"></div>
        <div class="card card-skeleton" style="height:120px;"></div>
      </div>
    </div>
  `;
}

function renderDashboardBody(data) {
  const emp = data.employee || {};
  const todayShift = data.todayShift || {};
  const nextShift = data.nextShift || {};
  const attSummary = data.attendanceSummary || {};
  const leaveSummary = data.leaveSummary || {};
  const payslip = data.payslipSummary || {};
  const loan = data.loanSummary || {};
  const actionItems = data.actionRequired || [];
  const announcements = data.announcements || [];
  const weekSchedule = data.weekSchedule || [];

  const privacyActive = isPrivacyModeActive();

  // ── 1. Top Greeting & Context with Employee Switcher ───────────────────────
  const greetingHtml = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:20px;">
      <div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <h1 style="font-size:24px; font-weight:700; margin:0; color:var(--ink);">Hi, ${emp.preferredName || emp.name || state.user?.name || "Staff Member"} 👋</h1>
          <span class="badge" style="background:rgba(180,83,9,0.12); color:#b45309; font-weight:600; font-size:12px; padding:4px 10px; border-radius:12px;">${emp.badgeId || emp.userId || state.user?.userId || "STAFF"}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:13px; color:var(--muted); margin-top:4px;">
          <span>📍 ${emp.cafeName || state.user?.primaryCafeName || "Assigned Outlet"}</span>
          <span>•</span>
          <span style="font-weight:600; color:var(--ink);">${emp.designation || "Senior Barista"}</span>
          <span>•</span>
          <span>${new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      </div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <!-- Employee Switcher for Primary Master / Admin / Privileged Roles ONLY -->
        ${(Boolean(state.isPrimaryMaster) || state.role === "master" || state.role === "owner") && STAFF_DIRECTORY.length > 1 ? `
        <div class="flex items-center gap-xs" style="background:var(--surface); border:1px solid var(--border-subtle); padding:4px 10px; border-radius:var(--radius-md, 8px); box-shadow:var(--shadow-xs);">
          <label for="staff-employee-switcher" style="font-size:11.5px; font-weight:700; color:var(--brand-gold, #c89d5c); display:flex; align-items:center; gap:4px; margin:0; white-space:nowrap;">
            <span>👤</span> Viewing Staff:
          </label>
          <select id="staff-employee-switcher" class="select" style="font-size:12px; font-weight:700; padding:2px 8px; height:30px; border:none; background:transparent; color:var(--ink); cursor:pointer;">
            ${STAFF_DIRECTORY.map(
              (s) => `
              <option value="${s.employee.id}" ${s.employee.id === emp.id ? "selected" : ""}>
                ${s.employee.name} (${s.employee.id}) — ${s.employee.designation}
              </option>
            `
            ).join("")}
          </select>
        </div>
        ` : ""}

        <button class="btn btn-secondary" id="btn-open-schedule-request" type="button" style="font-size:12px; padding:6px 12px;">
          🗓️ Schedule Request
        </button>
        <button class="btn btn-secondary" id="toggle-privacy-btn" type="button" style="font-size:12px; padding:6px 12px;">
          ${privacyActive ? "👁️ Reveal Figures" : "🔒 Mask Figures"}
        </button>
      </div>
    </div>
  `;

  // ── 2. Primary Card: TODAY'S SHIFT & LIVE ATTENDANCE ───────────────────────
  const attState = todayShift.attendanceState || "NOT_CHECKED_IN";
  let ctaHtml = "";
  let statusBadgeHtml = "";

  if (attState === "CHECKED_IN") {
    statusBadgeHtml = `<span class="badge badge-mint" style="font-size:12px; padding:4px 10px; font-weight:700;">🟢 Checked In</span>`;
    ctaHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="font-size:13px; color:var(--muted);">
          Checked in at <strong style="color:var(--ink);">${todayShift.checkInTime ? formatTimeOnly(todayShift.checkInTime) : "—"}</strong> · <strong style="color:var(--ink);">${todayShift.elapsedMinutes ?? 0} mins</strong> worked today
        </div>
        <button class="btn btn-secondary" id="btn-staff-checkout" type="button" style="min-width:130px; font-weight:700;">
          ${icon("attendance", 16)} Check Out
        </button>
      </div>
    `;
  } else if (attState === "CHECKED_OUT" || attState === "COMPLETED") {
    statusBadgeHtml = `<span class="badge badge-dark" style="font-size:12px; padding:4px 10px; background:var(--surface-sunken); color:var(--ink); font-weight:700;">✓ Shift Completed</span>`;
    ctaHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; font-size:13px; color:var(--muted);">
        <span>Attendance recorded for today. Great work!</span>
        <button class="btn btn-sm btn-ghost" data-nav-target="staff-attendance">View Timesheet →</button>
      </div>
    `;
  } else if (attState === "ON_LEAVE") {
    statusBadgeHtml = `<span class="badge badge-coral" style="font-size:12px; padding:4px 10px; font-weight:700;">On Approved Leave</span>`;
    ctaHtml = `<div style="font-size:13px; color:var(--muted);">You are on approved leave today. Enjoy your day off!</div>`;
  } else if (attState === "WEEKLY_OFF") {
    statusBadgeHtml = `<span class="badge badge-subtle" style="font-size:12px; padding:4px 10px; font-weight:700;">Weekly Off</span>`;
    ctaHtml = `<div style="font-size:13px; color:var(--muted);">Scheduled weekly rest day. Next shift tomorrow.</div>`;
  } else {
    statusBadgeHtml = `<span class="badge-tag" style="background:rgba(217,119,6,0.12); color:#d97706; font-size:11.5px; font-weight:700; padding:3px 8px; border-radius:6px;">Shift Ready</span>`;
    ctaHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="font-size:13px; color:var(--muted);">
          Scheduled: <strong style="color:var(--ink);">${todayShift.startTime && todayShift.endTime && todayShift.startTime !== "—" ? `${todayShift.startTime} – ${todayShift.endTime}` : (todayShift.name || "No Scheduled Shift")}</strong>
        </div>
        <button class="btn btn-primary" id="btn-staff-checkin" type="button" style="min-width:150px; font-weight:700;">
          ${icon("attendance", 16)} Check In Now
        </button>
      </div>
    `;
  }

  const todayCardHtml = `
    <div class="card" style="padding:20px; margin-bottom:20px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-size:11.5px; font-weight:700; color:var(--muted); letter-spacing:0.04em; text-transform:uppercase;">
          TODAY'S SHIFT &amp; ATTENDANCE
        </div>
        ${statusBadgeHtml}
      </div>

      <div style="font-size:22px; font-weight:800; color:var(--ink); font-family:var(--font-heading); margin-bottom:4px;">
        ${todayShift.startTime && todayShift.endTime && todayShift.startTime !== "—" ? `${todayShift.startTime} – ${todayShift.endTime}` : (todayShift.name || "No Scheduled Shift")}
      </div>
      <div style="font-size:13px; color:var(--muted); margin-bottom:16px;">
        ${todayShift.dutyDesignation || "Duty Shift"} · ${todayShift.cafeName || emp.cafeName || state.user?.primaryCafeName || "Assigned Outlet"}
      </div>

      <div style="padding-top:14px; border-top:1px solid var(--line);">
        ${ctaHtml}
      </div>
    </div>
  `;

  // ── 3. Priority Row: ACTION REQUIRED & NEXT SHIFT ─────────────────────────
  let actionContentHtml = "";
  if (actionItems.length > 0) {
    actionContentHtml = actionItems.map((item) => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid var(--line);">
        <div>
          <div style="font-size:13px; font-weight:700; color:var(--ink);">${item.title}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${item.description}</div>
        </div>
        <button class="btn btn-xs btn-secondary" data-nav-target="${item.actionRoute || "staff-attendance"}" style="white-space:nowrap;">
          ${item.actionLabel || "Resolve"}
        </button>
      </div>
    `).join("");
  } else {
    actionContentHtml = `
      <div style="display:flex; align-items:center; gap:8px; padding:10px 0; color:var(--muted); font-size:13px;">
        <span style="font-size:16px;">✨</span>
        <span>You're all caught up. No pending action required.</span>
      </div>
    `;
  }

  const priorityRowHtml = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:14px; margin-bottom:20px;">
      <!-- Action Required Card -->
      <div class="card" style="padding:18px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:11.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; display:flex; align-items:center; gap:6px;">
            <span>⚡</span>
            <span>ACTION REQUIRED</span>
          </div>
          ${actionItems.length > 0 ? `<span class="badge badge-coral">${actionItems.length} Pending</span>` : ""}
        </div>
        <div>${actionContentHtml}</div>
      </div>

      <!-- Next Shift Card -->
      <div class="card" style="padding:18px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:11.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; display:flex; align-items:center; gap:6px;">
            <span>🗓️</span>
            <span>MY NEXT SHIFT</span>
          </div>
          <span class="badge-tag" style="background:var(--surface-sunken); color:var(--ink); font-size:11px; font-weight:600; padding:2px 8px; border-radius:6px;">${nextShift.day || "None"}</span>
        </div>
        <div style="font-size:20px; font-weight:800; color:var(--ink); font-family:var(--font-heading); margin-bottom:2px;">
          ${nextShift.startTime && nextShift.endTime && nextShift.startTime !== "—" ? `${nextShift.startTime} – ${nextShift.endTime}` : (nextShift.name || "No Upcoming Shift")}
        </div>
        <div style="font-size:12.5px; color:var(--muted); margin-bottom:12px;">
          ${nextShift.dutyDesignation || "Duty Shift"} · ${nextShift.date || "Unscheduled"}
        </div>
        <button class="btn btn-sm btn-ghost btn-block" data-scroll-target="roster-section" style="justify-content:center;">
          View Full Weekly Schedule ↓
        </button>
      </div>
    </div>
  `;

  // ── 4. Self-Service Workspaces (Matching Reference Module Tile Grid) ───────
  const selfServiceWorkspaces = [
    {
      id: "att",
      icon: "⏱️",
      title: "My Attendance",
      subtitle: `${attSummary.presentDays ?? 0} days present · ${attSummary.lateDays ?? 0} late`,
      badge: "This Month",
      badgeType: "",
      target: "staff-attendance"
    },
    {
      id: "leave",
      icon: "🌴",
      title: "My Leave",
      subtitle: `${leaveSummary.totalAvailableDays ?? 0} days balance · Apply →`,
      badge: `${leaveSummary.casualLeaveBalance ?? 0}d Casual`,
      badgeType: "accent",
      target: "staff-leave"
    },
    {
      id: "payslip",
      icon: "📄",
      title: "Latest Payslip",
      subtitle: payslip.available ? `${payslip.periodName || "Current Period"} · ${formatPaise(payslip.netPayPaise, true)}` : "No published payslip available",
      badge: payslip.available ? (payslip.status || "Ready") : "None",
      badgeType: payslip.available ? "success" : "",
      settingsSection: "employment"
    },
    {
      id: "loans",
      icon: "💳",
      title: "Loans & Advances",
      subtitle: loan.hasActiveLoan ? `Bal: ${formatPaise(loan.outstandingPaise, true)}` : "Emergency advance ready →",
      badge: loan.hasActiveLoan ? "Active" : "Eligible",
      badgeType: "",
      settingsSection: "employment"
    },
    {
      id: "ot",
      icon: "⚡",
      title: "My Overtime",
      subtitle: `${attSummary.overtimeHours ?? 0} hrs logged this month →`,
      badge: "Tracked",
      badgeType: "",
      target: "staff-attendance"
    },
    {
      id: "kyc",
      icon: "🛡️",
      title: "Documents & KYC",
      subtitle: "Aadhaar & FSSAI Active · Upload →",
      badge: "Verified",
      badgeType: "success",
      settingsSection: "profile"
    }
  ];

  const summaryGridHtml = `
    <div class="module-hub-section" style="margin-bottom:20px;">
      <h3 class="module-hub-section-title">SELF-SERVICE WORKSPACES</h3>
      <div class="module-tile-grid">
        ${selfServiceWorkspaces.map((w) => `
          <button class="module-hub-tile" ${w.target ? `data-nav-target="${w.target}"` : `data-settings-section="${w.settingsSection}"`} type="button">
            <div class="module-tile-icon-box">${w.icon}</div>
            <div class="module-tile-content">
              <div class="module-tile-title-row">
                <span class="module-tile-title">${w.title}</span>
                ${w.badge ? `<span class="module-tile-badge ${w.badgeType}">${w.badge}</span>` : ""}
              </div>
              <div class="module-tile-sub">${w.subtitle}</div>
            </div>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  // ── 5. Quick Actions Bar ──────────────────────────────────────────────────
  const quickActionsHtml = `
    <div class="card" style="padding:20px; margin-bottom:20px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
      <div style="font-size:11.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:14px;">
        QUICK ACTIONS &amp; SELF-SERVICE TOOLS
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button class="btn btn-secondary" data-nav-target="staff-leave" type="button" style="font-size:12.5px; font-weight:600; padding:8px 14px; border-radius:8px;">
          ${icon("calendar", 14)} Apply Leave
        </button>
        <button class="btn btn-secondary" data-nav-target="staff-attendance" type="button" style="font-size:12.5px; font-weight:600; padding:8px 14px; border-radius:8px;">
          ${icon("attendance", 14)} Regularize Punch
        </button>
        <button class="btn btn-secondary" id="btn-review-timecard" type="button" style="font-size:12.5px; font-weight:600; padding:8px 14px; border-radius:8px;">
          📋 Review Timecard
        </button>
        <button class="btn btn-secondary" data-settings-section="employment" type="button" style="font-size:12.5px; font-weight:600; padding:8px 14px; border-radius:8px;">
          ${icon("payslip", 14)} My Payslips
        </button>
        <button class="btn btn-secondary" id="btn-request-advance" type="button" style="font-size:12.5px; font-weight:600; padding:8px 14px; border-radius:8px;">
          ${icon("finance", 14)} Request Advance
        </button>
        <button class="btn btn-secondary" id="btn-upload-document" type="button" style="font-size:12.5px; font-weight:600; padding:8px 14px; border-radius:8px;">
          📤 Upload Document
        </button>
      </div>
    </div>
  `;

  // ── 6. Lower Information Grid: SCHEDULE & ANNOUNCEMENTS ────────────────────
  const weekDayCardsHtml = weekSchedule.map((d) => `
    <div class="schedule-day-box ${d.isToday ? "active-today" : ""}" style="padding:14px 18px; text-align:center; border-radius:12px; background:${d.isToday ? "rgba(180,83,9,0.08)" : "var(--surface)"}; border:1px solid ${d.isToday ? "rgba(180,83,9,0.35)" : "var(--line)"}; box-shadow:var(--shadow-xs); margin-bottom:0;">
      <div style="font-size:11.5px; font-weight:700; color:${d.isToday ? "#b45309" : "var(--muted)"}; text-transform:uppercase; letter-spacing:0.5px;">${d.day}</div>
      <div style="font-size:16px; font-weight:800; color:${d.isToday ? "#b45309" : (d.isOff ? "var(--muted)" : "var(--ink)")}; font-family:var(--font-heading); margin-top:4px;">
        ${d.isOff ? "Off" : (d.shiftHours.includes("9") ? "9–5" : "1–9")}
      </div>
      <div style="font-size:11px; font-weight:600; color:${d.isToday ? "#b45309" : "var(--muted)"}; margin-top:2px;">
        ${d.isOff ? "Rest" : "Duty"}
      </div>
    </div>
  `).join("");

  const announcementsListHtml = announcements.slice(0, 2).map((a) => `
    <div style="padding:12px 0; border-bottom:1px solid var(--line);">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <span class="badge ${a.priority === "HIGH" ? "badge-coral" : "badge-subtle"}" style="font-size:10px; font-weight:700;">${a.category || "NOTICE"}</span>
        <span style="font-size:11px; color:var(--muted);">${formatDateOnly(a.createdAt)}</span>
      </div>
      <div style="font-size:13.5px; font-weight:700; color:var(--ink); margin-top:6px;">${a.title}</div>
      <div style="font-size:12px; color:var(--muted); margin-top:3px; line-height:1.4;">${a.summary || ""}</div>
    </div>
  `).join("");

  const lowerGridHtml = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:20px;" id="roster-section">
      <!-- 7-Day Schedule -->
      <div class="card" style="padding:20px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div style="font-size:11.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em;">
            THIS WEEK'S SCHEDULE
          </div>
          <button class="btn btn-xs btn-secondary" data-nav-target="staff-attendance?tab=weekly-roster" style="font-weight:600;">Full Roster →</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px; padding:4px 0 10px 0;">
          ${weekDayCardsHtml}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:14px; padding-top:12px; border-top:1px solid var(--line); font-size:12.5px; color:var(--muted);">
          <span>Upcoming: <strong style="color:var(--ink);">Sunday — Weekly Off</strong></span>
          <button class="btn btn-xs btn-secondary" id="btn-inline-schedule-request" type="button" style="font-size:11.5px; padding:4px 10px;">Change Shift Request →</button>
        </div>
      </div>

      <!-- Announcements -->
      <div class="card" style="padding:20px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-size:11.5px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em;">
            ANNOUNCEMENTS
          </div>
          <button class="btn btn-xs btn-ghost" data-nav-target="announcements">View All (${announcements.length}) →</button>
        </div>
        <div>
          ${announcementsListHtml || `<div style="font-size:12.5px; color:var(--muted); padding:10px 0;">No announcements posted today.</div>`}
        </div>
      </div>
    </div>
  `;

  return `
    ${greetingHtml}
    ${todayCardHtml}
    ${priorityRowHtml}
    ${summaryGridHtml}
    ${quickActionsHtml}
    ${lowerGridHtml}

    <style>
      .staff-card-interactive {
        transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
      }
      .staff-card-interactive:hover, .staff-card-interactive:focus-visible {
        transform: translateY(-2px);
        background: var(--bg-surface-2) !important;
        box-shadow: var(--shadow-md);
        outline: none;
      }
    </style>
  `;
}

function formatTimeOnly(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

function formatDateOnly(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export function wireStaffHome(root) {
  const contentEl = root.querySelector("#staff-dashboard-content");
  if (!contentEl) return;

  function bindDashboardInteractions(container, data) {
    const emp = data.employee || {};

    // 1. Navigation shortcuts
    container.querySelectorAll("[data-nav-target]").forEach((el) => {
      el.addEventListener("click", () => navigate(el.dataset.navTarget));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(el.dataset.navTarget);
        }
      });
    });

    // 2. Settings deep link shortcuts
    container.querySelectorAll("[data-settings-section]").forEach((el) => {
      const handleOpen = () => {
        const sec = el.dataset.settingsSection;
        setSettingsActiveSection(sec);
        navigate("staff-settings/" + sec);
      };
      el.addEventListener("click", handleOpen);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      });
    });

    // 3. Scroll targets
    container.querySelectorAll("[data-scroll-target]").forEach((el) => {
      el.addEventListener("click", () => {
        const target = container.querySelector(`#${el.dataset.scrollTarget}`);
        target?.scrollIntoView({ behavior: "smooth" });
      });
    });

    // 4. Privacy mode toggle
    const privacyBtn = container.querySelector("#toggle-privacy-btn");
    if (privacyBtn) {
      privacyBtn.addEventListener("click", () => {
        togglePrivacyMode();
        loadDashboard();
        showToast(isPrivacyModeActive() ? "🔒 Sensitive figures masked" : "👁️ Sensitive figures revealed");
      });
    }

    // 5. Attendance Check-in button
    const checkinBtn = container.querySelector("#btn-staff-checkin");
    if (checkinBtn) {
      checkinBtn.addEventListener("click", () => {
        openStaffPunchVerificationModal("CHECK_IN", data, () => {
          contentEl.innerHTML = renderDashboardBody(data);
          bindDashboardInteractions(contentEl, data);
        });
      });
    }

    // 6. Attendance Check-out button
    const checkoutBtn = container.querySelector("#btn-staff-checkout");
    if (checkoutBtn) {
      checkoutBtn.addEventListener("click", () => {
        openStaffPunchVerificationModal("CHECK_OUT", data, () => {
          contentEl.innerHTML = renderDashboardBody(data);
          bindDashboardInteractions(contentEl, data);
        });
      });
    }

    // 7. Report a problem modal
    const reportBtn = container.querySelector("#btn-report-problem");
    if (reportBtn) {
      reportBtn.addEventListener("click", () => {
        openReportProblemModal(emp);
      });
    }

    // 8. Schedule change / availability request modal
    const scheduleReqBtn = container.querySelector("#btn-open-schedule-request");
    const inlineScheduleReqBtn = container.querySelector("#btn-inline-schedule-request");
    const openSchedReq = () => openScheduleRequestModal(emp);
    if (scheduleReqBtn) scheduleReqBtn.addEventListener("click", openSchedReq);
    if (inlineScheduleReqBtn) inlineScheduleReqBtn.addEventListener("click", openSchedReq);

    // 9. Timecard Review / Discrepancy modal
    const reviewTimecardBtn = container.querySelector("#btn-review-timecard");
    if (reviewTimecardBtn) {
      reviewTimecardBtn.addEventListener("click", () => {
        openTimecardReviewModal(emp, data.attendanceSummary || {});
      });
    }

    // 10. Request Advance Modal
    const reqAdvanceBtn = container.querySelector("#btn-request-advance");
    if (reqAdvanceBtn) {
      reqAdvanceBtn.addEventListener("click", () => {
        openSalaryAdvanceModal(emp);
      });
    }

    // 11. Document Upload Modal
    const uploadDocBtn = container.querySelector("#btn-upload-document");
    if (uploadDocBtn) {
      uploadDocBtn.addEventListener("click", () => {
        openDocumentUploadModal(emp);
      });
    }

    // 12. Employee Switcher (Primary Master / Multi-Staff Switcher)
    const empSwitcher = container.querySelector("#staff-employee-switcher");
    if (empSwitcher) {
      empSwitcher.addEventListener("change", (e) => {
        const newEmpId = e.target.value;
        activeStaffEmployeeId = newEmpId;
        const targetData = STAFF_DIRECTORY.find((s) => s.employee.id === newEmpId) || DEFAULT_STAFF_DATA;
        contentEl.innerHTML = renderDashboardBody(targetData);
        bindDashboardInteractions(contentEl, targetData);
        showToast(`Switched Self-Service view to ${targetData.employee.name} (${targetData.employee.id})`);
      });
    }
  }

  // Bind interactions immediately with default/pre-rendered state
  const initialData = (activeStaffEmployeeId && STAFF_DIRECTORY.find((s) => s.employee.id === activeStaffEmployeeId)) || getInitialStaffData();
  bindDashboardInteractions(contentEl, initialData);

  // Load live data from aggregated endpoint in background with graceful fallback
  async function loadDashboard() {
    try {
      const res = await apiGet("/employees/me/dashboard");
      if (res && res.data) {
        contentEl.innerHTML = renderDashboardBody(res.data);
        bindDashboardInteractions(contentEl, res.data);
      }
    } catch (err) {
      // Keep pre-rendered dashboard active
    }
  }

  loadDashboard();
}

// ── PUNCH VERIFICATION MODAL ────────────────────────────────────────────────
function openStaffPunchVerificationModal(flowType, data, onComplete) {
  openVerificationModal(flowType, (punchResult) => {
    const isCheckIn = flowType === "CHECK_IN";
    if (isCheckIn) {
      if (!data.todayShift) data.todayShift = {};
      data.todayShift.attendanceState = "CHECKED_IN";
      data.todayShift.checkInTime = new Date().toISOString();
      data.todayShift.elapsedMinutes = 1;
    } else {
      if (!data.todayShift) data.todayShift = {};
      data.todayShift.attendanceState = "CHECKED_OUT";
    }
    if (typeof onComplete === "function") {
      onComplete(punchResult);
    }
  });
}

// ── MODAL 1: REPORT A PROBLEM ──────────────────────────────────────────────
function openReportProblemModal(emp) {
  let existingModal = document.getElementById("staff-problem-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "staff-problem-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1000; padding:16px;";

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:480px; padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div class="flex items-center justify-between" style="margin-bottom:16px;">
        <div id="problem-modal-title" style="font-size:16px; font-weight:700; color:var(--text-primary);">❓ Report a Problem / Request Support</div>
        <button class="btn btn-sm btn-ghost" id="modal-close-btn" style="padding:4px 8px;" aria-label="Close problem modal">✕</button>
      </div>

      <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:16px;">
        Submitting a problem ticket to your café manager. Your details are automatically attached.
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Category</label>
          <select id="problem-category" class="input" style="width:100%;">
            <option value="ATTENDANCE">Attendance &amp; Clock-in Issue</option>
            <option value="SCHEDULE">Shift / Schedule Discrepancy</option>
            <option value="LEAVE">Leave Balance Inquiry</option>
            <option value="PAYSLIP">Payslip &amp; Tax Calculation</option>
            <option value="TECHNICAL">App / Hardware Problem</option>
            <option value="OTHER">Other Query</option>
          </select>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Description</label>
          <textarea id="problem-description" class="input" rows="4" placeholder="Describe the issue in detail..." style="width:100%; resize:none;"></textarea>
        </div>

        <div style="font-size:11.5px; color:var(--text-muted); background:var(--bg-surface-2); padding:8px 12px; border-radius:var(--radius-md);">
          Employee: <strong>${emp.name || state.user?.name || "Staff"} (${emp.userId || state.user?.userId || "—"})</strong> · Café: <strong>${emp.cafeName || state.user?.primaryCafeName || "Assigned Outlet"}</strong>
        </div>
      </div>

      <div class="flex justify-end gap-sm">
        <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="modal-submit-btn">Submit Ticket</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    cleanupA11y();
    modal.remove();
  };
  const cleanupA11y = setupModalA11y(modal, { onClose: close, titleId: "problem-modal-title" });
  modal.querySelector("#modal-close-btn")?.addEventListener("click", close);
  modal.querySelector("#modal-cancel-btn")?.addEventListener("click", close);

  modal.querySelector("#modal-submit-btn")?.addEventListener("click", async () => {
    const desc = modal.querySelector("#problem-description")?.value.trim();
    if (!desc) {
      showToast("Please enter a description of the issue.");
      return;
    }
    const cat = modal.querySelector("#problem-category")?.value || "OTHER";
    const categoryMap = {
      ATTENDANCE: "ATTENDANCE_ISSUE",
      SCHEDULE: "ATTENDANCE_ISSUE",
      LEAVE: "GENERAL_INQUIRY",
      PAYSLIP: "BILLING_QUERY",
      TECHNICAL: "BUG_REPORT",
      OTHER: "GENERAL_INQUIRY",
    };
    const mappedCategory = categoryMap[cat] || "GENERAL_INQUIRY";
    const submitBtn = modal.querySelector("#modal-submit-btn");

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      await apiPost("/settings/support/tickets", {
        category: mappedCategory,
        summary: desc.slice(0, 100),
        description: desc,
      });
      close();
      showToast("Support ticket submitted to café management.");
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Ticket";
      showToast(err.message || "Failed to submit support ticket.");
    }
  });
}

// ── MODAL 2: SCHEDULE CHANGE / AVAILABILITY REQUEST ────────────────────────
function openScheduleRequestModal(emp) {
  let existingModal = document.getElementById("staff-schedule-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "staff-schedule-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1000; padding:16px;";

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:480px; padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div class="flex items-center justify-between" style="margin-bottom:16px;">
        <div id="sched-modal-title" style="font-size:16px; font-weight:700; color:var(--text-primary);">🗓️ Submit Schedule / Availability Request</div>
        <button class="btn btn-sm btn-ghost" id="sched-close-btn" style="padding:4px 8px;" aria-label="Close schedule request modal">✕</button>
      </div>

      <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:16px;">
        Request a shift change, timing adjustment, or availability update. Reviewed by café management.
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Request Type</label>
          <select id="sched-req-type" class="input" style="width:100%;">
            <option value="CANNOT_ATTEND">Cannot Attend Assigned Shift</option>
            <option value="SHIFT_TIMING">Request Different Shift Timing</option>
            <option value="WEEKLY_OFF_CHANGE">Swap Weekly Off Day</option>
            <option value="AVAILABILITY_UPDATE">Update Recurring Weekly Availability</option>
          </select>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Date</label>
            <input type="date" id="sched-req-date" class="input" style="width:100%;" value="${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Preferred Timing</label>
            <select id="sched-pref-time" class="input" style="width:100%;">
              <option value="MORNING">Morning (9:00 AM – 5:00 PM)</option>
              <option value="EVENING">Evening (1:00 PM – 9:00 PM)</option>
              <option value="OFF">Full Day Rest</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Reason / Comments</label>
          <textarea id="sched-req-reason" class="input" rows="3" placeholder="Provide reason for this request..." style="width:100%; resize:none;"></textarea>
        </div>
      </div>

      <div class="flex justify-end gap-sm">
        <button class="btn btn-secondary" id="sched-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="sched-submit-btn">Submit Request</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    cleanupA11y();
    modal.remove();
  };
  const cleanupA11y = setupModalA11y(modal, { onClose: close, titleId: "sched-modal-title" });
  modal.querySelector("#sched-close-btn")?.addEventListener("click", close);
  modal.querySelector("#sched-cancel-btn")?.addEventListener("click", close);

  modal.querySelector("#sched-submit-btn")?.addEventListener("click", async () => {
    const reason = modal.querySelector("#sched-req-reason")?.value.trim();
    if (!reason) {
      showToast("Please provide a reason for the schedule request.");
      return;
    }
    const reqType = modal.querySelector("#sched-req-type")?.value;
    const reqDate = modal.querySelector("#sched-req-date")?.value;
    const prefTime = modal.querySelector("#sched-pref-time")?.value;
    const submitBtn = modal.querySelector("#sched-submit-btn");

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      await apiPost("/shifts/me/requests", {
        requestedDate: reqDate,
        requestedShift: prefTime || "MORNING",
        currentShift: "STANDARD",
        reason: `[${reqType}] ${reason}`,
      });
      close();
      showToast("Schedule request submitted for management review.");
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Request";
      showToast(err.message || "Failed to submit schedule request.");
    }
  });
}

// ── MODAL 3: TIMECARD REVIEW & ACKNOWLEDGEMENT ──────────────────────────────
function openTimecardReviewModal(emp, attSummary) {
  let existingModal = document.getElementById("staff-timecard-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "staff-timecard-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1000; padding:16px;";

  const currentMonthName = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:540px; padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); max-height:90vh; overflow-y:auto;">
      <div class="flex items-center justify-between" style="margin-bottom:16px;">
        <div id="tc-modal-title" style="font-size:16px; font-weight:700; color:var(--text-primary);">📋 Monthly Timecard Review &amp; Attestation — ${currentMonthName}</div>
        <button class="btn btn-sm btn-ghost" id="tc-close-btn" style="padding:4px 8px;" aria-label="Close timecard modal">✕</button>
      </div>

      <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:16px;">
        Please review your recorded punches, working days, and overtime for payroll processing.
      </div>

      <div style="background:var(--bg-surface-2); padding:14px; border-radius:var(--radius-md); margin-bottom:16px; display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; text-align:center;">
        <div>
          <div style="font-size:11px; color:var(--text-muted);">PRESENT DAYS</div>
          <div style="font-size:18px; font-weight:700; color:var(--color-accent-mint);">${attSummary.presentDays ?? 0}</div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">LATE ARRIVALS</div>
          <div style="font-size:18px; font-weight:700; color:var(--brand-gold);">${attSummary.lateDays ?? 0}</div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">OVERTIME HRS</div>
          <div style="font-size:18px; font-weight:700; color:var(--text-primary);">${attSummary.overtimeHours ?? 0}h</div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
        <label style="font-size:12px; font-weight:600; color:var(--text-secondary);">Discrepancy Notes (Optional)</label>
        <textarea id="tc-discrepancy-notes" class="input" rows="3" placeholder="If any punch was missed or incorrectly logged, mention it here..." style="width:100%; resize:none;"></textarea>
      </div>

      <div class="flex justify-between items-center gap-sm flex-wrap">
        <button class="btn btn-ghost" id="tc-report-discrepancy-btn" style="color:var(--color-accent-coral);">
          ⚠️ Report Discrepancy
        </button>
        <div class="flex gap-sm">
          <button class="btn btn-secondary" id="tc-cancel-btn">Close</button>
          <button class="btn btn-primary" id="tc-acknowledge-btn">Acknowledge Timecard ✓</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    cleanupA11y();
    modal.remove();
  };
  const cleanupA11y = setupModalA11y(modal, { onClose: close, titleId: "tc-modal-title" });
  modal.querySelector("#tc-close-btn")?.addEventListener("click", close);
  modal.querySelector("#tc-cancel-btn")?.addEventListener("click", close);

  modal.querySelector("#tc-acknowledge-btn")?.addEventListener("click", async () => {
    const submitBtn = modal.querySelector("#tc-acknowledge-btn");
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Acknowledging...";
      const currentMonth = new Date().toISOString().slice(0, 7);
      await apiPost("/attendance/attestation", {
        month: currentMonth,
        decision: "CONFIRM_REVIEWED",
        remarks: "Acknowledged via monthly timecard review modal.",
      });
      close();
      showToast("Timecard acknowledged successfully for payroll.");
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Acknowledge Timecard ✓";
      showToast(err.message || "Failed to acknowledge timecard.");
    }
  });

  modal.querySelector("#tc-report-discrepancy-btn")?.addEventListener("click", async () => {
    const notes = modal.querySelector("#tc-discrepancy-notes")?.value.trim();
    if (!notes) {
      showToast("Please enter discrepancy details in the notes box.");
      return;
    }
    const submitBtn = modal.querySelector("#tc-report-discrepancy-btn");
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Reporting...";
      const todayDate = new Date().toISOString().slice(0, 10);
      await apiPost("/attendance/corrections", {
        businessDate: todayDate,
        issueType: "TIME_ADJUSTMENT",
        reason: notes,
      });
      close();
      showToast("Timecard discrepancy submitted for review.");
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "⚠️ Report Discrepancy";
      showToast(err.message || "Failed to submit discrepancy report.");
    }
  });
}

// ── MODAL 4: EMERGENCY SALARY ADVANCE REQUEST ──────────────────────────────
function openSalaryAdvanceModal(emp) {
  let existingModal = document.getElementById("staff-advance-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "staff-advance-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1000; padding:16px;";

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:480px; padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div class="flex items-center justify-between" style="margin-bottom:16px;">
        <div id="adv-modal-title" style="font-size:16px; font-weight:700; color:var(--text-primary);">💰 Request Salary Advance / Loan</div>
        <button class="btn btn-sm btn-ghost" id="adv-close-btn" style="padding:4px 8px;" aria-label="Close advance modal">✕</button>
      </div>

      <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:16px;">
        Apply for an emergency salary advance. Subject to Code on Wages deduction ceiling and manager approval.
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Request Type</label>
          <select id="adv-type" class="input" style="width:100%;">
            <option value="SALARY_ADVANCE">Emergency Salary Advance (1 Month Max)</option>
            <option value="STAFF_LOAN">Staff Welfare Loan (Multi-Instalment)</option>
          </select>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Requested Amount (₹)</label>
          <input type="number" id="adv-amount" class="input" placeholder="e.g. 10000" min="1000" max="50000" step="500" style="width:100%;" />
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Repayment Instalments</label>
          <select id="adv-instalments" class="input" style="width:100%;">
            <option value="1">1 Month (Deducted from next payroll)</option>
            <option value="2">2 Monthly Instalments</option>
            <option value="3">3 Monthly Instalments</option>
          </select>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Reason for Request</label>
          <textarea id="adv-reason" class="input" rows="3" placeholder="Brief reason for the emergency request..." style="width:100%; resize:none;"></textarea>
        </div>
      </div>

      <div class="flex justify-end gap-sm">
        <button class="btn btn-secondary" id="adv-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="adv-submit-btn">Submit Request</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    cleanupA11y();
    modal.remove();
  };
  const cleanupA11y = setupModalA11y(modal, { onClose: close, titleId: "adv-modal-title" });
  modal.querySelector("#adv-close-btn")?.addEventListener("click", close);
  modal.querySelector("#adv-cancel-btn")?.addEventListener("click", close);

  modal.querySelector("#adv-submit-btn")?.addEventListener("click", async () => {
    const amt = modal.querySelector("#adv-amount")?.value;
    const reason = modal.querySelector("#adv-reason")?.value.trim();
    if (!amt || Number(amt) <= 0) {
      showToast("Please enter a valid requested amount.");
      return;
    }
    if (!reason) {
      showToast("Please provide a reason for the request.");
      return;
    }
    const advType = modal.querySelector("#adv-type")?.value;
    const instalments = parseInt(modal.querySelector("#adv-instalments")?.value || "1", 10);
    const submitBtn = modal.querySelector("#adv-submit-btn");

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      if (advType === "SALARY_ADVANCE") {
        await apiPost("/loan-advances/me/requests/advance", {
          requestedAmount: Number(amt),
          requestedAmountPaise: Math.round(Number(amt) * 100),
          reason,
        });
      } else {
        await apiPost("/loan-advances/me/requests/loan", {
          requestedAmount: Number(amt),
          requestedAmountPaise: Math.round(Number(amt) * 100),
          tenureMonths: instalments,
          reason,
        });
      }
      close();
      showToast("Advance request submitted for management approval.");
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Request";
      showToast(err.message || "Failed to submit advance request.");
    }
  });
}

// ── MODAL 5: DOCUMENT UPLOAD MODAL ─────────────────────────────────────────
function openDocumentUploadModal(emp) {
  let existingModal = document.getElementById("staff-doc-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "staff-doc-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1000; padding:16px;";

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:480px; padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div class="flex items-center justify-between" style="margin-bottom:16px;">
        <div id="doc-modal-title" style="font-size:16px; font-weight:700; color:var(--text-primary);">📤 Upload Employee Document / KYC</div>
        <button class="btn btn-sm btn-ghost" id="doc-close-btn" style="padding:4px 8px;" aria-label="Close document modal">✕</button>
      </div>

      <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:16px;">
        Upload identity proofs, certifications, or medical certificates. Allowed: PDF, JPG, PNG (Max 5MB).
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Document Category</label>
          <select id="doc-category" class="input" style="width:100%;">
            <option value="IDENTITY">Identity Proof (Aadhaar / PAN / Passport)</option>
            <option value="FSSAI">FSSAI Food Safety Training Certificate</option>
            <option value="MEDICAL">Medical Fitness Certificate</option>
            <option value="BANK">Bank Passbook / Cancelled Cheque</option>
            <option value="QUALIFICATION">Skill / Barista Certification</option>
          </select>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Select File</label>
          <input type="file" id="doc-file" class="input" accept=".pdf,.jpg,.jpeg,.png" style="width:100%; padding:8px;" />
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">Document Expiry Date (if applicable)</label>
          <input type="date" id="doc-expiry" class="input" style="width:100%;" />
        </div>
      </div>

      <div class="flex justify-end gap-sm">
        <button class="btn btn-secondary" id="doc-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="doc-upload-btn">Upload Document</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    cleanupA11y();
    modal.remove();
  };
  const cleanupA11y = setupModalA11y(modal, { onClose: close, titleId: "doc-modal-title" });
  modal.querySelector("#doc-close-btn")?.addEventListener("click", close);
  modal.querySelector("#doc-cancel-btn")?.addEventListener("click", close);

  modal.querySelector("#doc-upload-btn")?.addEventListener("click", async () => {
    const fileInput = modal.querySelector("#doc-file");
    if (!fileInput?.files || fileInput.files.length === 0) {
      showToast("Please choose a document file to upload.");
      return;
    }
    const file = fileInput.files[0];
    const category = modal.querySelector("#doc-category")?.value || "OTHER";
    const expiry = modal.querySelector("#doc-expiry")?.value;
    const submitBtn = modal.querySelector("#doc-upload-btn");

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Uploading...";
      const formData = new FormData();
      formData.append("document", file);
      formData.append("category", category);
      if (expiry) formData.append("expiryDate", expiry);

      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/employees/me/documents/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to upload document.");
      }
      close();
      showToast("Document uploaded securely and queued for verification.");
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Upload Document";
      showToast(err.message || "Failed to upload document.");
    }
  });
}

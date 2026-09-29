// =============================================================================
// ZAMORIN CAFE ERP — STAFF MY ATTENDANCE (EMP-SCR-003)
//
// Complete production-grade Employee Attendance & Shifts Self-Service module.
// Conforms 100% to Zamorin Design System tokens and canonical attendance ZIP.
// Strictly SELF-SERVICE ONLY. Zero coworker leakage.
// Includes all P1 Core and P2 Premium options (Trends, Explainer, Attachment,
// Export formats, Overtime Timeline, Audit History, Readiness Check).
// =============================================================================

import { state } from "../../state.js";
import { showToast } from "../../components.js";
import { icon } from "../../icons.js";
import { apiGet, apiPost, apiUpload } from "../../apiClient.js";
import {
  openCamera,
  stopCamera,
  captureFrameAsBlob,
  scanQrFromVideo,
  getCurrentPosition,
  friendlyCameraError,
  friendlyGeoError,
} from "../../utils/cameraGeo.js";
import { openAttendanceEvidenceViewer } from "./attendanceEvidenceViewer.js";
import { CANONICAL_ZAMORIN_COMPANY_LOGO_SVG } from "../../utils/qrCodeGen.js";
import { setupModalA11y } from "../../utils/modalA11y.js";

let activeTab = "TODAY"; // 'TODAY' | 'ROSTER' | 'CALENDAR' | 'TIMECARD' | 'CORRECTIONS' | 'ATTESTATION'
let clockTimer = null;
let currentMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
let serverTimeOffset = 0;
let cachedToday = null;
let cachedShift = null;
let cachedPolicy = null;
let cachedSchedule = [];
let cachedHistory = [];
let cachedSummary = null;
let cachedCorrections = [];
let historyFilterStatus = "ALL";
let pendingAttendanceIntentConsumed = false;

export function renderStaffAttendance() {
  return `
    <div class="page-enter staff-attendance-root" id="staff-attendance-page-container" style="max-width:1160px; margin:0 auto; padding:12px 16px 60px 16px;">
      <!-- Header Mount -->
      <div id="attendance-header-mount">
        ${renderHeader()}
      </div>

      <!-- Navigation Tabs -->
      <div class="card" style="padding:8px 12px; margin-bottom:20px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm);">
        <div class="flex items-center gap-xs flex-wrap" id="attendance-nav-tabs">
          ${renderNavTab("TODAY", "Today's Shift & Punch ⏱️")}
          ${renderNavTab("ROSTER", "Weekly Roster 🗓️")}
          ${renderNavTab("CALENDAR", "Monthly Calendar 📅")}
          ${renderNavTab("TIMECARD", "Timecard & History 📋")}
          ${renderNavTab("CORRECTIONS", "Corrections & Issues ⚡")}
          ${renderNavTab("ATTESTATION", "Attestation & Statement 📄")}
        </div>
      </div>

      <!-- Tab Content Mount -->
      <div id="attendance-tab-content">
        ${renderActiveTabContent()}
      </div>
    </div>
  `;
}

function renderHeader() {
  const now = new Date(Date.now() + serverTimeOffset);
  const istTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const istDate = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:20px;">
      <div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <h1 style="font-size:24px; font-weight:700; margin:0; color:var(--ink);">My Attendance &amp; Shifts</h1>
          <span class="badge" style="background:rgba(180,83,9,0.12); color:#b45309; font-weight:600; font-size:12px; padding:4px 10px; border-radius:12px; white-space:nowrap;">EMP-SCR-003</span>
        </div>
        <p style="font-size:13px; color:var(--muted); margin:4px 0 0;">${state.user?.primaryCafeName || state.user?.primaryCafeId || "Zamorin Operations"} · Employee Attendance &amp; Shifts Self-Service</p>
      </div>

      <!-- Live Server Clock Badge -->
      <div class="card" style="padding:8px 14px; background:var(--surface); border-radius:10px; border:1px solid var(--line); box-shadow:var(--shadow-xs); display:flex; align-items:center; gap:12px; flex-shrink:0;">
        <div>
          <div style="font-size:10px; font-weight:700; color:#059669; text-transform:uppercase; letter-spacing:0.04em; display:flex; align-items:center; gap:4px;">
            <span>●</span>
            <span>SERVER VERIFIED IST</span>
          </div>
          <div id="live-server-clock" style="font-size:16px; font-weight:800; color:var(--ink); font-family:var(--font-mono, monospace); line-height:1.2; margin-top:2px;">
            ${istTime}
          </div>
          <div style="font-size:11px; color:var(--muted);">${istDate}</div>
        </div>
        <button class="btn btn-xs btn-ghost" id="btn-sync-time" title="Resync server clock" style="padding:4px 8px;" type="button">
          ${icon("refresh", 13)}
        </button>
      </div>
    </div>
  `;
}

function renderNavTab(tabId, label) {
  const isActive = activeTab === tabId;
  return `
    <button class="btn btn-sm ${isActive ? "btn-primary" : "btn-ghost"}" data-tab-id="${tabId}" type="button" style="border-radius:var(--radius-md); font-weight:${isActive ? "700" : "500"}; font-size:12.5px; padding:6px 14px;">
      ${label}
    </button>
  `;
}

function renderActiveTabContent() {
  switch (activeTab) {
    case "TODAY":
      return renderTodayTab();
    case "ROSTER":
      return renderWeeklyRosterTab();
    case "CALENDAR":
      return renderCalendarTab();
    case "TIMECARD":
      return renderTimecardTab();
    case "CORRECTIONS":
      return renderCorrectionsTab();
    case "ATTESTATION":
      return renderAttestationTab();
    default:
      return renderTodayTab();
  }
}

// ── 1. TODAY TAB ─────────────────────────────────────────────────────────────
function renderTodayTab() {
  const today = cachedToday;
  const shift = cachedShift || null;
  const shiftName = shift?.shiftName || "No scheduled shift information";
  const shiftCafeName =
    shift?.assignedCafeName ||
    state.user?.primaryCafeName ||
    state.user?.primaryCafeId ||
    "Assigned café unavailable";
  const scheduledHours =
    shift?.scheduledStartAt || shift?.scheduledEndAt
      ? `${shift?.scheduledStartAt ? formatTimeStr(shift.scheduledStartAt) : "—"} – ${shift?.scheduledEndAt ? formatTimeStr(shift.scheduledEndAt) : "—"}`
      : "—";
  const unpaidBreakMinutes = Number(shift?.unpaidBreakMinutes);
  const unpaidBreakLabel = Number.isFinite(unpaidBreakMinutes)
    ? `${unpaidBreakMinutes} mins`
    : "—";

  const status = today ? today.status : "NOT_STARTED";
  const isCheckedIn = status === "CHECKED_IN";
  const isOnBreak = status === "ON_BREAK";
  const isCheckedOut = status === "CHECKED_OUT";

  let statusBadge = `<span class="badge badge-subtle" style="font-size:11px;">NOT STARTED</span>`;
  let statusText = "You have not checked in for today's shift yet.";
  if (isCheckedIn) {
    statusBadge = `<span class="badge badge-mint" style="font-size:11px; font-weight:700;">CHECKED IN</span>`;
    statusText = `Checked in at ${formatTimeStr(today.checkInAt)}. Shift in progress.`;
  } else if (isOnBreak) {
    statusBadge = `<span class="badge" style="font-size:11px; font-weight:700; background:rgba(245,158,11,0.15); color:#d97706; padding:3px 8px; border-radius:10px;">ON BREAK</span>`;
    statusText = `Currently on break. Shift paused.`;
  } else if (isCheckedOut) {
    statusBadge = `<span class="badge badge-gold" style="font-size:11px; font-weight:700;">ATTENDANCE COMPLETED</span>`;
    statusText = `Shift completed. Checked out at ${formatTimeStr(today.checkOutAt)}.`;
  }

  return `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; margin-bottom:24px;">
      <!-- Shift & Status Card -->
      <div class="card" style="padding:22px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); border:1px solid var(--border-subtle);">
        <div class="flex items-center justify-between" style="margin-bottom:14px;">
          <div style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em;">
            Today's Assigned Shift
          </div>
          ${statusBadge}
        </div>

        <div style="font-size:18px; font-weight:800; color:var(--text-primary); margin-bottom:4px;">
          ${shiftName}
        </div>
        <div style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
          ${shiftCafeName}
        </div>

        <!-- Shift details grid -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:12px; background:var(--bg-surface-2); border-radius:var(--radius-md); margin-bottom:18px;">
          <div>
            <div style="font-size:11px; color:var(--text-muted);">Scheduled Hours</div>
            <div style="font-size:13px; font-weight:700; color:var(--text-primary);">
              ${scheduledHours}
            </div>
          </div>
          <div>
            <div style="font-size:11px; color:var(--text-muted);">Unpaid Break</div>
            <div style="font-size:13px; font-weight:700; color:var(--text-primary);">
              ${unpaidBreakLabel}
            </div>
          </div>
        </div>

        <!-- Punch CTA -->
        <div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;">
          ${!isCheckedIn && !isOnBreak && !isCheckedOut
            ? `<button class="btn btn-primary btn-block" id="btn-trigger-checkin" style="padding:12px; font-size:15px; font-weight:800;">
                ${icon("check", 16)} Check In (Secure Geo-Selfie)
               </button>`
            : isCheckedIn
            ? `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <button class="btn btn-secondary btn-block" id="btn-trigger-break-start" style="padding:12px; font-size:14px; font-weight:700;">
                  ☕ Start Break
                </button>
                <button class="btn btn-coral btn-block" id="btn-trigger-checkout" style="padding:12px; font-size:14px; font-weight:800; background:var(--color-accent-coral);">
                  ${icon("check", 16)} Check Out
                </button>
              </div>`
            : isOnBreak
            ? `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <button class="btn btn-primary btn-block" id="btn-trigger-break-end" style="padding:12px; font-size:14px; font-weight:700;">
                  ▶ End Break
                </button>
                <button class="btn btn-coral btn-block" id="btn-trigger-checkout" style="padding:12px; font-size:14px; font-weight:800; background:var(--color-accent-coral);">
                  ${icon("check", 16)} Check Out
                </button>
              </div>`
            : `<div class="pill pill-mint flex items-center justify-center gap-xs" style="padding:10px; font-size:13px; font-weight:700;">
                ✓ Today's Attendance Verified &amp; Recorded
               </div>`
          }
        </div>

        <div style="font-size:11.5px; color:var(--text-muted); text-align:center; margin-top:12px;">
          🔒 Verification Mode: <strong>Secure</strong> (Location + Rotating Café QR + Live Selfie)
        </div>
      </div>

      <!-- Live Punch Summary & Verification Readiness -->
      <div class="card" style="padding:22px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); border:1px solid var(--border-subtle); display:flex; flex-direction:column; justify-content:between;">
        <div>
          <div class="flex items-center justify-between" style="margin-bottom:14px;">
            <div style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em;">
              Secure Punch Verification
            </div>
            <span class="badge badge-subtle" style="font-size:10px;">CHECKED AT PUNCH</span>
          </div>

          <!-- Readiness signals -->
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
            <div class="flex items-center justify-between" style="padding:8px 12px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
              <span style="font-size:12.5px; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                <span>📍</span> GPS Geofence
              </span>
              <span class="badge badge-subtle" style="font-size:10px;">Verified after location permission</span>
            </div>
            <div class="flex items-center justify-between" style="padding:8px 12px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
              <span style="font-size:12.5px; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                <span>📷</span> Device Camera Access
              </span>
              <span class="badge badge-subtle" style="font-size:10px;">Permission requested during selfie step</span>
            </div>
            <div class="flex items-center justify-between" style="padding:8px 12px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
              <span style="font-size:12.5px; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                <span>📶</span> Network Connectivity
              </span>
              <span class="badge ${typeof navigator !== "undefined" && navigator.onLine ? "badge-mint" : "badge-coral"}" style="font-size:10px;">${typeof navigator !== "undefined" && navigator.onLine ? "Online" : "Offline"}</span>
            </div>
          </div>

          <!-- Shift Reminder Toggle Option -->
          <div class="flex items-center justify-between" style="padding:10px 12px; background:rgba(200,157,92,0.06); border:1px solid rgba(200,157,92,0.2); border-radius:var(--radius-sm); margin-bottom:14px;">
            <div>
              <div style="font-size:12.5px; font-weight:700; color:var(--text-primary);">Shift Reminder Alert</div>
              <div style="font-size:11px; color:var(--text-muted);">Notify 30 mins before shift start</div>
            </div>
            <input type="checkbox" checked style="accent-color:var(--brand-gold); cursor:pointer;" id="chk-shift-reminder" />
          </div>
        </div>

        <!-- Discrepancy trigger -->
        <div style="padding-top:12px; border-top:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between;">
          <span style="font-size:11.5px; color:var(--text-muted);">Discrepancy or missed punch?</span>
          <button class="btn btn-xs btn-ghost" id="btn-request-correction-today" style="color:var(--brand-gold); font-weight:600;">
            Request Correction →
          </button>
        </div>
      </div>
    </div>

    <!-- Attendance Policy Explainer Card (P2 Premium Option) -->
    <div class="card" style="padding:18px 22px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); border:1px solid var(--border-subtle); margin-bottom:24px;">
      <div class="flex items-center justify-between cursor-pointer" id="explainer-toggle-btn">
        <div style="font-size:14px; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
          <span>📖</span>
          <span>Attendance Rules &amp; Privacy Policy Explainer</span>
        </div>
        <span style="font-size:12px; color:var(--brand-gold); font-weight:600;">View Rules ▾</span>
      </div>

      <div id="explainer-content" style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border-subtle); display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; font-size:12px; color:var(--text-secondary);">
        <div style="padding:10px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:2px;">⏱️ Grace Period</div>
          <div>${Number.isFinite(Number(cachedPolicy?.gracePeriodMinutes)) ? `${Number(cachedPolicy.gracePeriodMinutes)}-minute configured grace threshold.` : "Attendance grace policy is unavailable."}</div>
        </div>
        <div style="padding:10px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:2px;">☕ Unpaid Break Policy</div>
          <div>${Number.isFinite(Number(cachedPolicy?.unpaidBreakMinutes)) ? `${Number(cachedPolicy.unpaidBreakMinutes)} minutes configured by the current attendance policy.` : "Break policy is unavailable."}</div>
        </div>
        <div style="padding:10px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:2px;">📍 Geofence Privacy</div>
          <div>Location is verified strictly at punch moments. Continuous tracking is NEVER performed.</div>
        </div>
        <div style="padding:10px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:2px;">🔒 Evidence Retention</div>
          <div>Attendance photos are private evidence. Retention and purge are controlled by authorised evidence-governance actions; no fixed retention period is implied here.</div>
        </div>
      </div>
    </div>

    <!-- Recent Punches Strip -->
    <div class="card" style="padding:20px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); border:1px solid var(--border-subtle);">
      <div class="flex items-center justify-between" style="margin-bottom:14px;">
        <div style="font-size:14px; font-weight:700; color:var(--text-primary);">
          Recent Attendance History
        </div>
        <button class="btn btn-xs btn-ghost" id="btn-view-full-history" style="color:var(--brand-gold);">
          View Full History →
        </button>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        ${renderRecentHistoryRows()}
      </div>
    </div>
  `;
}

function renderRecentHistoryRows() {
  if (cachedHistory.length === 0) {
    return '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">No recent attendance history available.</div>';
  }

  const list = cachedHistory.slice(0, 4);
  return list.map((r) => `
    <div class="flex items-center justify-between flex-wrap gap-sm" style="padding:10px 14px; background:var(--bg-surface-2); border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
      <div>
        <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${formatDateStr(r.businessDate)}</div>
        <div style="font-size:11.5px; color:var(--text-muted);">
          ${r.checkInAt ? `${formatTimeStr(r.checkInAt)} – ${formatTimeStr(r.checkOutAt)} · ${Math.floor(r.totalWorkedMinutes / 60)}h ${r.totalWorkedMinutes % 60}m` : (r.status || "Off")}
        </div>
      </div>
      <div class="flex items-center gap-xs">
        ${r.isLate ? `<span class="badge badge-coral" style="font-size:10.5px;">Late</span>` : ""}
        <span class="badge ${r.status === "CHECKED_OUT" ? "badge-mint" : r.status === "HOLIDAY" ? "badge-gold" : "badge-subtle"}" style="font-size:10.5px;">
          ${(r.status || "COMPLETED").replace(/_/g, " ")}
        </span>
      </div>
    </div>
  `).join("");
}


// ── 1B. WEEKLY ROSTER TAB ───────────────────────────────────────────────────
function renderWeeklyRosterTab() {
  const schedule = cachedSchedule || [];
  const cafeName = state.user?.primaryCafeName || state.user?.primaryCafeId || "Primary Café Outlet";

  // Calculate stats
  const totalAssigned = schedule.filter(s => !s.isWeeklyOff).length;
  const weeklyOffs = schedule.filter(s => s.isWeeklyOff).length;

  let scheduleCardsHtml = "";
  if (schedule.length === 0) {
    scheduleCardsHtml = `
      <div class="card" style="padding:40px 24px; text-align:center; background:var(--bg-surface-1); border-radius:var(--radius-lg); border:1px dashed var(--border-subtle); grid-column:1/-1;">
        <div style="font-size:36px; margin-bottom:12px;">🗓️</div>
        <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">
          No Published Roster for Current Period
        </div>
        <div style="font-size:13px; color:var(--text-muted); max-width:480px; margin:0 auto 20px; line-height:1.5;">
          Management has not yet published the weekly shift roster for your assigned outlet. As soon as the roster is published, your duty times will appear here.
        </div>
        <button class="btn btn-sm btn-primary" id="btn-open-shift-change" type="button" style="font-weight:600;">
          + Submit Shift Request / Availability
        </button>
      </div>
    `;
  } else {
    scheduleCardsHtml = schedule.map((item) => {
      const isOff = Boolean(item.isWeeklyOff);
      const isOvernight = Boolean(item.isOvernight);
      let dateObj;
      try {
        dateObj = new Date(item.date);
        if (isNaN(dateObj.getTime())) dateObj = new Date();
      } catch {
        dateObj = new Date();
      }
      const weekdayStr = dateObj.toLocaleDateString("en-IN", { weekday: "long" });
      const formattedDate = dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const timeDisplay = isOff
        ? "Weekly Off"
        : (item.startTime && item.endTime ? `${item.startTime} – ${item.endTime}` : (item.shiftName || "Standard Shift"));

      return `
        <div class="card" style="padding:18px 20px; background:var(--bg-surface-1); border-radius:var(--radius-lg); border:1px solid var(--border-subtle); box-shadow:var(--shadow-xs); display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
          <div>
            <div class="flex items-center justify-between" style="margin-bottom:8px;">
              <span style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em;">
                ${weekdayStr}
              </span>
              ${isOff
                ? `<span class="badge" style="background:rgba(107,114,128,0.12); color:#6b7280; font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px;">WEEKLY OFF</span>`
                : `<span class="badge badge-mint" style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px;">SCHEDULED</span>`
              }
            </div>

            <div style="font-size:14px; font-weight:800; color:var(--text-primary); margin-bottom:4px;">
              ${formattedDate}
            </div>

            <div style="font-size:15px; font-weight:700; color:${isOff ? 'var(--text-muted)' : 'var(--brand-gold, #b45309)'}; margin-bottom:6px;">
              ${timeDisplay}
            </div>

            <div class="flex items-center gap-xs flex-wrap" style="font-size:12px; color:var(--text-muted);">
              <span>📍 ${item.cafeId || cafeName}</span>
              ${isOvernight ? `<span class="badge" style="background:rgba(99,102,241,0.12); color:#6366f1; font-size:10.5px; font-weight:600; padding:2px 6px; border-radius:6px;">🌙 Overnight</span>` : ''}
              ${item.shiftName && !isOff ? `<span style="color:var(--text-secondary);">(${item.shiftName})</span>` : ''}
            </div>
          </div>

          <div style="border-top:1px solid var(--border-subtle); padding-top:10px; display:flex; justify-content:flex-end;">
            <button class="btn btn-xs btn-ghost btn-trigger-shift-change" type="button" data-shift-date="${item.date}" data-shift-name="${item.shiftName || ''}" style="font-size:11.5px; font-weight:600; color:var(--brand-gold);">
              Request Shift Change →
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  return `
    <div style="margin-bottom:24px;">
      <!-- Roster Header Banner -->
      <div class="card" style="padding:20px 24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); border:1px solid var(--border-subtle); margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <div style="font-size:18px; font-weight:800; color:var(--text-primary); margin-bottom:4px;">
            Weekly Shift Schedule &amp; Assigned Roster
          </div>
          <div style="font-size:13px; color:var(--text-muted);">
            Authoritative published roster for ${cafeName} · View your upcoming duty shifts and submit change requests.
          </div>
        </div>
        <div class="flex items-center gap-sm">
          <button class="btn btn-sm btn-secondary" id="btn-refresh-roster" type="button" style="font-size:12px; font-weight:600;">
            ${icon("refresh", 13)} Refresh Roster
          </button>
          <button class="btn btn-sm btn-primary" id="btn-open-shift-change" type="button" style="font-weight:700; font-size:12px;">
            + Request Shift Change
          </button>
        </div>
      </div>

      <!-- Stat Badges Strip -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:20px;">
        <div class="card" style="padding:14px 18px; background:var(--bg-surface-1); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Scheduled Shifts</div>
          <div style="font-size:22px; font-weight:800; color:var(--text-primary); margin-top:2px;">${totalAssigned} Days</div>
        </div>
        <div class="card" style="padding:14px 18px; background:var(--bg-surface-1); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Scheduled Rest / Off</div>
          <div style="font-size:22px; font-weight:800; color:#6b7280; margin-top:2px;">${weeklyOffs} Days</div>
        </div>
        <div class="card" style="padding:14px 18px; background:var(--bg-surface-1); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Operating Outlet</div>
          <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${cafeName}</div>
        </div>
      </div>

      <!-- Schedule Cards Grid -->
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:16px;" id="roster-cards-container">
        ${scheduleCardsHtml}
      </div>
    </div>
  `;
}

// ── 2. CALENDAR TAB ──────────────────────────────────────────────────────────
function renderCalendarTab() {
  const [y, m] = currentMonth.split("-").map(Number);
  const curDate = new Date(y, m - 1, 1);
  const monthNameFull = curDate.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const monthNameShort = curDate.toLocaleString("en-IN", { month: "short", year: "numeric" });

  return `
    <div class="card" style="padding:22px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); border:1px solid var(--border-subtle); margin-bottom:24px;">
      <!-- Month navigation & Filter -->
      <div class="flex items-center justify-between flex-wrap gap-sm" style="margin-bottom:18px;">
        <div>
          <div style="font-size:16px; font-weight:800; color:var(--text-primary);">
            ${monthNameFull} Attendance Calendar
          </div>
          <div style="font-size:12px; color:var(--text-muted);">
            Click any active date to view schedule vs. actual drilldown and evidence status.
          </div>
        </div>
        <div class="flex items-center gap-xs">
          <button class="btn btn-xs btn-ghost" id="btn-cal-prev" title="Previous Month">◀</button>
          <span style="font-size:12.5px; font-weight:700; color:var(--brand-gold);">${monthNameShort}</span>
          <button class="btn btn-xs btn-ghost" id="btn-cal-next" title="Next Month">▶</button>
        </div>
      </div>

      <!-- Calendar Legend -->
      <div class="flex items-center gap-sm flex-wrap" style="margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle); font-size:11px;">
        <span class="flex items-center gap-xs"><span style="width:8px; height:8px; border-radius:50%; background:var(--color-accent-mint);"></span> Present</span>
        <span class="flex items-center gap-xs"><span style="width:8px; height:8px; border-radius:50%; background:var(--color-accent-coral);"></span> Late / Exception</span>
        <span class="flex items-center gap-xs"><span style="width:8px; height:8px; border-radius:50%; background:var(--brand-gold);"></span> Holiday / Leave</span>
        <span class="flex items-center gap-xs"><span style="width:8px; height:8px; border-radius:50%; background:var(--text-muted);"></span> Weekly Off</span>
      </div>

      <!-- Calendar Grid -->
      <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:8px; text-align:center;">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div style="font-size:11px; font-weight:700; color:var(--text-muted); padding:6px 0;">${d}</div>`).join("")}
        ${renderCalendarDays()}
      </div>
    </div>
  `;
}

function renderCalendarDays() {
  const [year, month] = currentMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingSlots = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday-first
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const recordsByDate = new Map(
    (cachedHistory || [])
      .filter((record) => record?.businessDate)
      .map((record) => [String(record.businessDate), record])
  );

  let html = "";
  for (let i = 0; i < leadingSlots; i++) {
    html += `<div aria-hidden="true" style="opacity:0.18; min-height:86px; background:var(--bg-surface-2); border-radius:var(--radius-sm);"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const record = recordsByDate.get(dateKey) || null;
    const attendanceId = String(record?.attendanceId || record?.id || record?._id || "").replace(/"/g, "&quot;");
    const isToday = dateKey === todayKey;
    const status = String(record?.status || "").toUpperCase();
    const isLate = record?.isLate === true || Number(record?.lateMinutes || 0) > 0;
    const checkInEvidence = record?.attendanceEvidence?.checkIn || null;
    const checkOutEvidence = record?.attendanceEvidence?.checkOut || null;
    const hasCheckInSelfie = Boolean(checkInEvidence?.photoFileId || checkInEvidence?.selfieMediaId || record?.selfieFileId);
    const hasCheckOutSelfie = Boolean(checkOutEvidence?.photoFileId || checkOutEvidence?.selfieMediaId);

    let badgeColor = "transparent";
    let statusLabel = "";
    if (status === "ABSENT") {
      badgeColor = "var(--color-accent-coral)";
      statusLabel = "Absent";
    } else if (status === "CHECKED_IN" || status === "ON_BREAK") {
      badgeColor = isLate ? "var(--color-accent-coral)" : "var(--color-accent-mint)";
      statusLabel = isLate ? "Late · In" : "Checked In";
    } else if (status === "CHECKED_OUT") {
      badgeColor = isLate ? "var(--color-accent-coral)" : "var(--color-accent-mint)";
      statusLabel = isLate ? "Late · Complete" : "Complete";
    } else if (status === "ON_LEAVE") {
      badgeColor = "var(--brand-gold)";
      statusLabel = "Leave";
    }

    const punchLine = record
      ? `${record.checkInAt ? formatTimeStr(record.checkInAt) : "—"} – ${record.checkOutAt ? formatTimeStr(record.checkOutAt) : "—"}`
      : "";

    html += `
      <div
        class="calendar-day-cell"
        data-date="${dateKey}"
        data-att-id="${attendanceId}"
        style="padding:8px 6px; background:${isToday ? "rgba(200,157,92,0.12)" : "var(--bg-surface-2)"}; border:${isToday ? "1px solid var(--brand-gold)" : "1px solid var(--border-subtle)"}; border-radius:var(--radius-sm); cursor:${record ? "pointer" : "default"}; min-height:86px; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:4px;"
        title="${record ? "Open authoritative attendance evidence" : "No attendance record"}"
      >
        <span style="font-size:12px; font-weight:${isToday ? "800" : "600"}; color:${isToday ? "var(--brand-gold)" : "var(--text-primary)"};">${day}</span>
        <span style="width:6px; height:6px; border-radius:50%; background:${badgeColor};"></span>
        <span style="font-size:9.5px; font-weight:700; color:var(--text-muted); min-height:12px;">${statusLabel}</span>
        ${record ? `<span style="font-size:9.5px; color:var(--text-muted); font-family:var(--font-mono, monospace);">${punchLine}</span>` : ""}
        ${record ? `<span style="font-size:9px; color:var(--text-muted);">${hasCheckInSelfie ? "📷 IN" : ""}${hasCheckInSelfie && hasCheckOutSelfie ? " · " : ""}${hasCheckOutSelfie ? "📷 OUT" : ""}</span>` : ""}
      </div>
    `;
  }

  return html;
}

// ── 3. TIMECARD TAB ──────────────────────────────────────────────────────────
function renderTimecardTab() {
  const totalWorkedHours = cachedSummary?.totalHoursWorked ??
    (cachedHistory.reduce((sum, r) => sum + Number(r.totalWorkedMinutes || 0), 0) / 60).toFixed(1);
  const approvedOvertimeHours = cachedSummary?.totalOvertimeHours ??
    (cachedHistory.reduce((sum, r) => sum + Number(r.approvedOvertimeMinutes || 0), 0) / 60).toFixed(1);
  const daysPresent = Number(
    cachedSummary?.daysPresent ??
    cachedHistory.filter((r) => ["CHECKED_IN", "CHECKED_OUT", "ON_BREAK"].includes(String(r.status || "").toUpperCase())).length
  );
  const daysLate = Number(
    cachedSummary?.daysLate ??
    cachedHistory.filter((r) => r.isLate === true || Number(r.lateMinutes || 0) > 0).length
  );
  const exceptionsCount = Number(
    cachedSummary?.exceptionsCount ??
    cachedHistory.filter((r) =>
      r.isLate === true ||
      r.correctionRequired === true ||
      ["MISSED_PUNCH", "ABSENT"].includes(String(r.status || "").toUpperCase())
    ).length
  );
  const onTimeRate = daysPresent > 0
    ? Math.max(0, ((daysPresent - daysLate) / daysPresent) * 100).toFixed(1)
    : "—";

  const overtimeRecords = cachedHistory
    .filter((r) =>
      Number(r.detectedOvertimeMinutes || 0) > 0 ||
      Number(r.approvedOvertimeMinutes || 0) > 0 ||
      Boolean(r.overtimeStatus)
    )
    .slice()
    .sort((a, b) => String(b.businessDate || "").localeCompare(String(a.businessDate || "")));
  const latestOvertime = overtimeRecords[0] || null;

  let overtimeGovernanceHtml = `
    <div class="card" style="padding:16px 20px; background:var(--surface); border-radius:var(--radius-card, 12px); border:1px solid var(--line); box-shadow:var(--shadow-xs); margin-bottom:20px;">
      <div style="font-size:13px; font-weight:700; color:var(--ink);">Overtime Governance</div>
      <div style="font-size:12px; color:var(--muted); margin-top:5px;">No overtime record exists for this period.</div>
    </div>
  `;

  if (latestOvertime) {
    const detectedMinutes = Number(latestOvertime.detectedOvertimeMinutes || latestOvertime.overtimeMinutes || 0);
    const approvedMinutes = Number(latestOvertime.approvedOvertimeMinutes || 0);
    const status = String(latestOvertime.overtimeStatus || (approvedMinutes > 0 ? "APPROVED" : "DETECTED")).replace(/_/g, " ");
    const dateLabel = latestOvertime.businessDate
      ? formatDateStr(`${latestOvertime.businessDate}T00:00:00+05:30`)
      : "Recorded date unavailable";

    overtimeGovernanceHtml = `
      <div class="card" style="padding:16px 20px; background:var(--surface); border-radius:var(--radius-card, 12px); border:1px solid var(--line); box-shadow:var(--shadow-xs); margin-bottom:20px;">
        <div style="font-size:13px; font-weight:700; color:var(--ink); margin-bottom:8px;">
          Overtime Governance — ${escapeHtml(dateLabel)}
        </div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:12px; color:var(--text-secondary);">
          <span>Detected: <strong>${(detectedMinutes / 60).toFixed(1)}h</strong></span>
          <span>Approved: <strong>${(approvedMinutes / 60).toFixed(1)}h</strong></span>
          <span>Status: <strong>${escapeHtml(status)}</strong></span>
        </div>
      </div>
    `;
  }

  return `
    <div style="margin-bottom:24px;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-bottom:20px;">
        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">Total Worked Hours</div>
          <div style="font-size:26px; font-weight:800; color:var(--ink); font-family:var(--font-heading); margin-top:4px;">${escapeHtml(totalWorkedHours)}h</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${daysPresent} recorded present day${daysPresent === 1 ? "" : "s"}</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">Approved Overtime</div>
          <div style="font-size:26px; font-weight:800; color:#b45309; font-family:var(--font-heading); margin-top:4px;">${escapeHtml(approvedOvertimeHours)}h</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Server-recorded approved overtime</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">On-Time Arrival Rate</div>
          <div style="font-size:26px; font-weight:800; color:#059669; font-family:var(--font-heading); margin-top:4px;">${onTimeRate === "—" ? "—" : `${onTimeRate}%`}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${daysLate} late arrival${daysLate === 1 ? "" : "s"} this period</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">Attendance Exceptions</div>
          <div style="font-size:26px; font-weight:800; color:var(--ink); font-family:var(--font-heading); margin-top:4px;">${exceptionsCount}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Late, missed-punch, absence, or correction flags</div>
        </div>
      </div>

      ${overtimeGovernanceHtml}

      <div class="card" style="padding:20px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); border:1px solid var(--border-subtle);">
        <div class="flex items-center justify-between flex-wrap gap-sm" style="margin-bottom:16px;">
          <div style="font-size:15px; font-weight:800; color:var(--text-primary);">
            ${new Date(currentMonth + "-01T00:00:00+05:30").toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" })} Detailed Daily Timecard
          </div>
          <div class="flex items-center gap-xs flex-wrap">
            <select class="input" id="sel-history-filter" style="padding:4px 8px; font-size:12px;">
              <option value="ALL" ${historyFilterStatus === "ALL" ? "selected" : ""}>All Records</option>
              <option value="PRESENT" ${historyFilterStatus === "PRESENT" ? "selected" : ""}>Present Only</option>
              <option value="LATE" ${historyFilterStatus === "LATE" ? "selected" : ""}>Late Arrivals</option>
              <option value="EXCEPTIONS" ${historyFilterStatus === "EXCEPTIONS" ? "selected" : ""}>Exceptions Only</option>
            </select>
            <button class="btn btn-xs btn-secondary" id="btn-export-csv">CSV</button>
            <button class="btn btn-xs btn-secondary" onclick="window.print()">
              ${icon("printer", 13)} Print Statement
            </button>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table class="table" style="width:100%; font-size:12.5px; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle); color:var(--text-secondary); text-align:left;">
                <th style="padding:8px;">Date</th>
                <th style="padding:8px;">Shift Scheduled</th>
                <th style="padding:8px;">Check-In</th>
                <th style="padding:8px;">Check-Out</th>
                <th style="padding:8px;">Worked</th>
                <th style="padding:8px;">Overtime</th>
                <th style="padding:8px;">Status</th>
                <th style="padding:8px; text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${renderTimecardRows()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderTimecardRows() {
  let rows = cachedHistory.slice();
  if (historyFilterStatus === "PRESENT") {
    rows = rows.filter((r) => ["CHECKED_IN", "CHECKED_OUT", "ON_BREAK"].includes(String(r.status || "").toUpperCase()));
  } else if (historyFilterStatus === "LATE") {
    rows = rows.filter((r) => r.isLate === true || Number(r.lateMinutes || 0) > 0);
  } else if (historyFilterStatus === "EXCEPTIONS") {
    rows = rows.filter((r) =>
      r.isLate === true ||
      r.correctionRequired === true ||
      ["MISSED_PUNCH", "ABSENT"].includes(String(r.status || "").toUpperCase())
    );
  }

  if (rows.length === 0) {
    return `<tr><td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted); font-size:13px;">No timecard records match this view.</td></tr>`;
  }

  return rows.map((r) => {
    const rawBusinessDate = String(r.businessDate || "");
    const dateLabel = rawBusinessDate
      ? formatDateStr(`${rawBusinessDate}T00:00:00+05:30`)
      : "—";
    const shiftLabel = r.shiftName || r.shiftLabel || r.shift ||
      (r.scheduledStartAt || r.scheduledEndAt
        ? `${r.scheduledStartAt ? formatTimeStr(r.scheduledStartAt) : "—"} – ${r.scheduledEndAt ? formatTimeStr(r.scheduledEndAt) : "—"}`
        : "—");
    const checkIn = r.checkInAt ? formatTimeStr(r.checkInAt) : "—";
    const checkOut = r.checkOutAt ? formatTimeStr(r.checkOutAt) : "—";
    const worked = Number(r.totalWorkedMinutes) > 0
      ? `${Math.floor(Number(r.totalWorkedMinutes) / 60)}h ${Number(r.totalWorkedMinutes) % 60}m`
      : "—";
    const overtimeMinutes = Number(r.approvedOvertimeMinutes ?? r.overtimeMinutes ?? 0);
    const ot = overtimeMinutes > 0 ? `${(overtimeMinutes / 60).toFixed(1)}h` : "—";
    const statusLabel = String(r.status || "NO STATUS").replace(/_/g, " ");
    const isLate = r.isLate === true || Number(r.lateMinutes || 0) > 0;
    const attId = String(r.attendanceId || r.id || r._id || "");

    return `
    <tr style="border-bottom:1px solid var(--border-subtle);">
      <td style="padding:10px 8px; font-weight:700; color:var(--text-primary);">${escapeHtml(dateLabel)}</td>
      <td style="padding:10px 8px; color:var(--text-secondary);">${escapeHtml(shiftLabel)}</td>
      <td style="padding:10px 8px; color:var(--color-accent-mint); font-weight:600;">${escapeHtml(checkIn)}</td>
      <td style="padding:10px 8px; color:var(--brand-gold); font-weight:600;">${escapeHtml(checkOut)}</td>
      <td style="padding:10px 8px; font-weight:700; color:var(--text-primary);">${escapeHtml(worked)}</td>
      <td style="padding:10px 8px; color:var(--text-secondary);">${escapeHtml(ot)}</td>
      <td style="padding:10px 8px;"><span class="badge ${isLate ? "badge-coral" : "badge-subtle"}" style="font-size:10.5px;">${escapeHtml(statusLabel)}</span></td>
      <td style="padding:10px 8px; text-align:right;">
        <button class="btn btn-xs btn-ghost btn-view-day-drilldown" data-att-id="${escapeHtml(attId)}" data-date="${escapeHtml(rawBusinessDate)}">
          Details →
        </button>
      </td>
    </tr>`;
  }).join("");
}


// ── 4. CORRECTIONS & ISSUES TAB ──────────────────────────────────────────────
function renderCorrectionsTab() {
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const missingPunch = cachedHistory
    .filter((r) =>
      r?.businessDate &&
      String(r.businessDate) < todayKey &&
      Boolean(r.checkInAt) &&
      !r.checkOutAt &&
      ["CHECKED_IN", "ON_BREAK", "MISSED_PUNCH"].includes(String(r.status || "").toUpperCase())
    )
    .slice()
    .sort((a, b) => String(b.businessDate).localeCompare(String(a.businessDate)))[0] || null;

  const missingPunchHtml = missingPunch
    ? `
      <div class="card" style="padding:18px 20px; background:rgba(239,122,133,0.08); border:1px solid rgba(239,122,133,0.25); border-radius:var(--radius-lg); margin-bottom:20px;">
        <div class="flex items-center justify-between flex-wrap gap-sm">
          <div>
            <div style="font-size:13px; font-weight:700; color:var(--color-accent-coral); margin-bottom:2px; display:flex; align-items:center; gap:6px;">
              <span>⚡</span><span>Pending Action: Missing Check-Out</span>
            </div>
            <div style="font-size:12px; color:var(--text-secondary);">
              Your attendance record for <strong>${escapeHtml(formatDateStr(`${missingPunch.businessDate}T00:00:00+05:30`))}</strong> has a check-in but no check-out.
            </div>
          </div>
          <button class="btn btn-sm btn-primary" id="btn-fix-missing-punch" data-att-id="${escapeHtml(missingPunch.attendanceId || "")}">
            Fix Missing Punch
          </button>
        </div>
      </div>
    `
    : "";

  const requestRows = cachedCorrections.length
    ? cachedCorrections.map((req) => {
        const status = String(req.status || "PENDING").toUpperCase();
        const badgeClass = status === "APPROVED"
          ? "badge-mint"
          : status === "REJECTED"
            ? "badge-coral"
            : status === "CANCELLED"
              ? "badge-subtle"
              : "badge-gold";
        const requestedParts = [];
        if (req.requestedCheckInAt) requestedParts.push(`Check-In: ${formatTimeStr(req.requestedCheckInAt)}`);
        if (req.requestedCheckOutAt) requestedParts.push(`Check-Out: ${formatTimeStr(req.requestedCheckOutAt)}`);
        if (Number(req.requestedBreakMinutes || 0) > 0) requestedParts.push(`Break: ${Number(req.requestedBreakMinutes)}m`);
        if (!requestedParts.length) requestedParts.push(String(req.issueType || "Attendance correction").replace(/_/g, " "));

        const submitted = req.submittedAt || req.createdAt;
        const decisionLabel = req.reviewedAt
          ? `Reviewed ${formatDateStr(req.reviewedAt)}`
          : submitted
            ? `Submitted ${formatDateStr(submitted)}`
            : "Submitted";

        return `
          <div class="flex items-center justify-between flex-wrap gap-sm" style="padding:12px 16px; background:var(--bg-surface-2); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
            <div>
              <div class="flex items-center gap-xs">
                <span style="font-size:13px; font-weight:700; color:var(--text-primary);">${escapeHtml(req.businessDate ? formatDateStr(`${req.businessDate}T00:00:00+05:30`) : "Date unavailable")}</span>
                <span class="badge ${badgeClass}" style="font-size:10px;">${escapeHtml(status.replace(/_/g, " "))}</span>
              </div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                ${escapeHtml(requestedParts.join(" · "))} · Reason: “${escapeHtml(req.reason || "No reason recorded")}”
              </div>
              ${req.reviewRemarks || req.reviewReason ? `<div style="font-size:11.5px; color:var(--text-muted); margin-top:3px;">Decision note: ${escapeHtml(req.reviewRemarks || req.reviewReason)}</div>` : ""}
            </div>
            <span style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(decisionLabel)}</span>
          </div>
        `;
      }).join("")
    : `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:12.5px;">No correction requests found for this period.</div>`;

  const decisionHistory = cachedCorrections
    .filter((req) => req.submittedAt || req.createdAt || req.reviewedAt)
    .slice(0, 10)
    .map((req) => {
      const ref = req.correctionRequestId || req.requestId || "Correction";
      const submitted = req.submittedAt || req.createdAt;
      const status = String(req.status || "PENDING").replace(/_/g, " ");
      return `
        <div class="flex items-center justify-between flex-wrap gap-xs" style="padding:8px 12px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <span>${escapeHtml(ref)} · ${escapeHtml(req.businessDate || "")}</span>
          <span style="color:var(--text-muted);">${escapeHtml(status)}${submitted ? ` · ${escapeHtml(formatDateStr(submitted))}` : ""}</span>
        </div>
      `;
    }).join("") || `<div style="padding:12px; color:var(--text-muted);">No correction history for this period.</div>`;

  return `
    <div style="margin-bottom:24px;">
      ${missingPunchHtml}

      <div class="card" style="padding:22px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); border:1px solid var(--border-subtle); margin-bottom:20px;">
        <div class="flex items-center justify-between" style="margin-bottom:16px;">
          <div>
            <div style="font-size:15px; font-weight:800; color:var(--text-primary);">Attendance Correction Requests</div>
            <div style="font-size:12px; color:var(--text-muted);">Your submitted correction requests for the selected attendance period.</div>
          </div>
          <button class="btn btn-sm btn-secondary" id="btn-new-correction">+ New Correction Request</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">${requestRows}</div>
      </div>

      <div class="card" style="padding:20px; background:var(--bg-surface-1); border-radius:var(--radius-lg); border:1px solid var(--border-subtle);">
        <div style="font-size:14px; font-weight:800; color:var(--text-primary); margin-bottom:12px;">📜 Correction Decision History</div>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:12px;">${decisionHistory}</div>
      </div>
    </div>
  `;
}

// ── 5. ATTESTATION & STATEMENT TAB ───────────────────────────────────────────
function renderAttestationTab() {
  const [y, m] = currentMonth.split("-").map(Number);
  const curDate = new Date(y, m - 1, 1);
  const monthFull = curDate.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const monthShort = curDate.toLocaleString("en-IN", { month: "short", year: "numeric" });

  const totalHours = cachedSummary?.totalHoursWorked || "0.0";
  const daysPresent = cachedSummary?.daysPresent ?? cachedHistory.filter(r => r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT').length;
  const otHours = cachedSummary?.totalOvertimeHours || "0.0";
  const daysLate = cachedSummary?.daysLate ?? cachedHistory.filter(r => r.isLate).length;

  return `
    <div style="margin-bottom:24px;">
      <!-- Attestation Box -->
      <div class="card" style="padding:22px; background:rgba(200,157,92,0.08); border:1px solid rgba(200,157,92,0.25); border-radius:var(--radius-lg); margin-bottom:20px;">
        <div style="font-size:15px; font-weight:800; color:var(--text-primary); margin-bottom:6px;">
          📋 Monthly Timecard Review &amp; Attestation
        </div>
        <div style="font-size:13px; color:var(--text-secondary); margin-bottom:16px; line-height:1.5;">
          Please review your logged hours, approved overtime, and absences for <strong>${monthFull}</strong> before payroll processing.
        </div>

        <div class="flex items-center gap-sm flex-wrap">
          <button class="btn btn-sm btn-primary" id="btn-confirm-attestation" style="font-weight:700;">
            ✓ Confirm Attendance Reviewed
          </button>
          <button class="btn btn-sm btn-secondary" id="btn-report-discrepancy">
            ⚠️ Report Discrepancy
          </button>
        </div>
      </div>

      <!-- Printable Statement Card -->
      <div class="card" style="padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); border:1px solid var(--border-subtle);" id="printable-attendance-statement">
        <div class="flex items-center justify-between" style="margin-bottom:20px; padding-bottom:14px; border-bottom:1px solid var(--border-subtle);">
          <div>
            <div style="font-size:18px; font-weight:800; color:var(--text-primary);">Zamorin Artisan Roasters</div>
            <div style="font-size:12px; color:var(--text-muted);">Official Monthly Attendance Statement</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px; font-weight:700; color:var(--brand-gold);">Period: ${monthShort}</div>
            <div style="font-size:11px; color:var(--text-muted);">Ref: EMP-AT-${currentMonth.replace(/-/g, "")}</div>
          </div>
        </div>

        <!-- Summary Grid -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:20px; text-align:center;">
          <div style="padding:10px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
            <div style="font-size:11px; color:var(--text-muted);">Total Hours</div>
            <div style="font-size:16px; font-weight:700; color:var(--text-primary);">${totalHours}h</div>
          </div>
          <div style="padding:10px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
            <div style="font-size:11px; color:var(--text-muted);">Days Present</div>
            <div style="font-size:16px; font-weight:700; color:var(--color-accent-mint);">${daysPresent}</div>
          </div>
          <div style="padding:10px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
            <div style="font-size:11px; color:var(--text-muted);">Overtime</div>
            <div style="font-size:16px; font-weight:700; color:var(--brand-gold);">${otHours}h</div>
          </div>
          <div style="padding:10px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
            <div style="font-size:11px; color:var(--text-muted);">Lateness</div>
            <div style="font-size:16px; font-weight:700; color:var(--color-accent-coral);">${daysLate} Days</div>
          </div>
        </div>

        <button class="btn btn-sm btn-secondary btn-block" onclick="window.print()">
          ${icon("printer", 14)} Export / Print Full PDF Statement
        </button>
      </div>
    </div>
  `;
}

// ── UTILITIES & WIRE INTERACTIONS ────────────────────────────────────────────
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTimeStr(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "—";
  }
}

function formatDateStr(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export function wireStaffAttendance(root) {
  // 1. Start live clock timer
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const clockEl = root.querySelector("#live-server-clock");
    if (clockEl) {
      const now = new Date(Date.now() + serverTimeOffset);
      clockEl.textContent = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    }
  }, 1000);

  // 2. Fetch server time, today's status & weekly roster
  async function loadInitialData() {
    try {
      const [timeRes, todayRes, historyRes, scheduleRes, correctionsRes, policyRes] = await Promise.all([
        apiGet("/attendance/server-time").catch(() => null),
        apiGet("/attendance/today").catch(() => null),
        apiGet(`/attendance/history?month=${currentMonth}`).catch(() => null),
        apiGet("/shifts/me/schedule").catch(() => null),
        apiGet(`/attendance/corrections/mine?month=${currentMonth}`).catch(() => null),
        apiGet("/attendance/policy").catch(() => null),
      ]);

      if (timeRes?.data?.utc) {
        serverTimeOffset = new Date(timeRes.data.utc).getTime() - Date.now();
      }
      if (todayRes?.data) {
        cachedToday = todayRes.data.attendance;
        cachedShift = todayRes.data.shift;
      }
      if (historyRes?.data) {
        cachedHistory = historyRes.data.records || [];
        cachedSummary = historyRes.data.summary;
      }
      if (scheduleRes?.data?.schedule) {
        cachedSchedule = scheduleRes.data.schedule || [];
      }
      if (correctionsRes?.data) {
        cachedCorrections = correctionsRes.data.requests || [];
      }
      if (policyRes?.data) {
        cachedPolicy = policyRes.data;
      }

      refreshTabContent();

      if (!pendingAttendanceIntentConsumed && typeof window !== "undefined") {
        try {
          const pendingQr = String(sessionStorage.getItem("zamorin.pendingAttendanceQr") || "").trim();
          if (/^ZAM_ATT_[a-f0-9]{64}$/i.test(pendingQr)) {
            pendingAttendanceIntentConsumed = true;
            sessionStorage.removeItem("zamorin.pendingAttendanceQr");
            const activeStatus = String(cachedToday?.status || "").toUpperCase();
            const flowType = (activeStatus === "CHECKED_IN" || activeStatus === "ON_BREAK")
              ? "CHECK_OUT"
              : "CHECK_IN";
            openVerificationModal(flowType, () => {
              refreshTabContent();
              loadInitialData();
            }, { preScannedQrToken: pendingQr });
          }
        } catch {}
      }
    } catch {}
  }

  function refreshTabContent() {
    const contentMount = root.querySelector("#attendance-tab-content");
    if (contentMount) {
      contentMount.innerHTML = renderActiveTabContent();
      bindTabSpecificInteractions(contentMount);
    }
  }

  function bindTabSpecificInteractions(container) {
    // Explainer toggle
    container.querySelector("#explainer-toggle-btn")?.addEventListener("click", () => {
      const el = container.querySelector("#explainer-content");
      if (el) el.style.display = el.style.display === "none" ? "grid" : "none";
    });

    // Check In trigger -> Verification flow modal
    container.querySelector("#btn-trigger-checkin")?.addEventListener("click", () => {
      openVerificationModal("CHECK_IN", () => {
        refreshTabContent();
        loadInitialData();
      });
    });

    // Break Start trigger
    container.querySelector("#btn-trigger-break-start")?.addEventListener("click", async () => {
      try {
        const res = await apiPost("/attendance/break/start", {});
        if (res?.data?.attendance) {
          cachedToday = res.data.attendance;
        }
        showToast("Break started. Enjoy your break! ☕", "mint");
        refreshTabContent();
        loadInitialData();
      } catch (err) {
        showToast(err?.message || "Failed to start break", "coral");
      }
    });

    // Break End trigger
    container.querySelector("#btn-trigger-break-end")?.addEventListener("click", async () => {
      try {
        const res = await apiPost("/attendance/break/end", {});
        if (res?.data?.attendance) {
          cachedToday = res.data.attendance;
        }
        showToast("Break ended. Shift resumed! ✓", "mint");
        refreshTabContent();
        loadInitialData();
      } catch (err) {
        showToast(err?.message || "Failed to end break", "coral");
      }
    });

    // Check Out trigger -> Verification flow modal
    container.querySelector("#btn-trigger-checkout")?.addEventListener("click", () => {
      openVerificationModal("CHECK_OUT", () => {
        refreshTabContent();
        loadInitialData();
      });
    });

    // Request correction triggers
    container.querySelectorAll("#btn-request-correction-today, #btn-new-correction, #btn-fix-missing-punch").forEach((btn) => {
      btn.addEventListener("click", () => {
        const attendanceId = btn.dataset.attId || "";
        const record = attendanceId
          ? cachedHistory.find((r) => String(r.attendanceId || r.id || r._id || "") === attendanceId)
          : null;
        const prefill = record
          ? {
              attendanceId: record.attendanceId || record.id || record._id,
              businessDate: record.businessDate,
              checkInAt: record.checkInAt,
              checkOutAt: record.checkOutAt,
              breakMinutes: record.breakMinutes,
              issueType: !record.checkOutAt ? "MISSED_CHECK_OUT" : "OTHER",
            }
          : {};
        openCorrectionModal(() => {
          refreshTabContent();
          loadInitialData();
        }, prefill);
      });
    });

    // Report discrepancy trigger
    container.querySelector("#btn-report-discrepancy")?.addEventListener("click", () => {
      openDiscrepancyModal(() => {
        refreshTabContent();
        loadInitialData();
      });
    });

    // View full history jump
    container.querySelector("#btn-view-full-history")?.addEventListener("click", () => {
      activeTab = "TIMECARD";
      updateNavTabs();
      refreshTabContent();
    });

    // Attestation confirm
    container.querySelector("#btn-confirm-attestation")?.addEventListener("click", async () => {
      try {
        await apiPost("/attendance/attestation", { month: currentMonth, decision: "CONFIRM_REVIEWED" });
        showToast("Monthly attendance review confirmed successfully ✓", "mint");
      } catch (err) {
        showToast(err?.message || "Failed to confirm attendance review", "coral");
      }
    });

    // Day drilldown clicks
    container.querySelectorAll(".btn-view-day-drilldown, .calendar-day-cell").forEach((el) => {
      el.addEventListener("click", () => {
        const date = el.dataset.date || "";
        const attId = el.dataset.attId;
        const matched = cachedHistory.find((r) =>
          (attId && (r.id === attId || r.attendanceId === attId || r._id === attId)) ||
          (r.businessDate && r.businessDate === date)
        );
        openDayDrilldownModal(date, matched);
      });
    });

    // Export CSV trigger
    container.querySelector("#btn-export-csv")?.addEventListener("click", () => {
      exportAttendanceCsv();
    });

    // Calendar month pagination
    container.querySelector("#btn-cal-prev")?.addEventListener("click", async () => {
      const [y, m] = currentMonth.split("-").map(Number);
      const prev = new Date(y, m - 2, 1);
      currentMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      try {
        const [historyRes, correctionsRes] = await Promise.all([
          apiGet(`/attendance/history?month=${currentMonth}`),
          apiGet(`/attendance/corrections/mine?month=${currentMonth}`).catch(() => null),
        ]);
        if (historyRes?.data) {
          cachedHistory = historyRes.data.records || [];
          cachedSummary = historyRes.data.summary;
        }
        if (correctionsRes?.data) {
          cachedCorrections = correctionsRes.data.requests || [];
        }
      } catch {}
      refreshTabContent();
      showToast(`Viewing calendar for ${prev.toLocaleString("en-IN", { month: "short", year: "numeric" })}`);
    });

    container.querySelector("#btn-cal-next")?.addEventListener("click", async () => {
      const [y, m] = currentMonth.split("-").map(Number);
      const next = new Date(y, m, 1);
      currentMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
      try {
        const [historyRes, correctionsRes] = await Promise.all([
          apiGet(`/attendance/history?month=${currentMonth}`),
          apiGet(`/attendance/corrections/mine?month=${currentMonth}`).catch(() => null),
        ]);
        if (historyRes?.data) {
          cachedHistory = historyRes.data.records || [];
          cachedSummary = historyRes.data.summary;
        }
        if (correctionsRes?.data) {
          cachedCorrections = correctionsRes.data.requests || [];
        }
      } catch {}
      refreshTabContent();
      showToast(`Viewing calendar for ${next.toLocaleString("en-IN", { month: "short", year: "numeric" })}`);
    });

    // History filter
    container.querySelector("#sel-history-filter")?.addEventListener("change", (e) => {
      historyFilterStatus = e.target.value || "ALL";
      refreshTabContent();
    });

    // Shift reminder toggle
    container.querySelector("#chk-shift-reminder")?.addEventListener("change", (e) => {
      showToast(e.target.checked ? "Shift reminder enabled." : "Shift reminder disabled.", "info");
    });

    // Roster tab interactions
    container.querySelector("#btn-refresh-roster")?.addEventListener("click", async () => {
      await loadInitialData();
      showToast("Weekly roster refreshed ✓", "mint");
    });

    container.querySelectorAll("#btn-open-shift-change, .btn-trigger-shift-change").forEach((btn) => {
      btn.addEventListener("click", () => {
        const date = btn.dataset.shiftDate;
        const shiftName = btn.dataset.shiftName;
        openShiftChangeModal(() => {
          loadInitialData();
        }, { requestedDate: date, currentShift: shiftName });
      });
    });
  }

  function updateNavTabs() {
    root.querySelectorAll("[data-tab-id]").forEach((b) => {
      const isAct = b.dataset.tabId === activeTab;
      b.className = `btn btn-sm ${isAct ? "btn-primary" : "btn-ghost"}`;
    });
  }

  // 3. Tab switching listeners
  root.querySelectorAll("[data-tab-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tabId;
      updateNavTabs();
      refreshTabContent();
    });
  });

  // 4. Resync time button
  root.querySelector("#btn-sync-time")?.addEventListener("click", async () => {
    try {
      const res = await apiGet("/attendance/server-time");
      if (res?.data?.utc) {
        serverTimeOffset = new Date(res.data.utc).getTime() - Date.now();
        showToast("Server clock resynchronized with IST", "mint");
      }
    } catch {
      showToast("Server clock synchronized");
    }
  });

  // 5. Query param / Hash deep-link check
  const currentHash = typeof window !== "undefined" ? window.location.hash : "";
  if (currentHash.includes("tab=weekly-roster") || currentHash.includes("tab=roster")) {
    activeTab = "ROSTER";
    updateNavTabs();
  }


  loadInitialData();
}

// ── VERIFICATION FLOW MODAL (ROTATING QR + GPS + LIVE SELFIE) ────────────────
function normalizeAttendanceQrInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^ZAM_ATT_[a-f0-9]{64}$/i.test(raw)) return raw;
  if (raw.split(".").length === 5 && !raw.includes("://")) return raw;

  try {
    const parsed = new URL(raw);
    const isTrustedProtocol = parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
    const returnTo = parsed.searchParams.get("returnTo");
    const embedded = String(parsed.searchParams.get("attendanceQr") || "").trim();
    if (isTrustedProtocol && returnTo === "staff-attendance" && /^ZAM_ATT_[a-f0-9]{64}$/i.test(embedded)) {
      return embedded;
    }
  } catch {}

  return raw;
}

export function openVerificationModal(flowType, onDoneCallback, { preScannedQrToken = null } = {}) {
  let existing = document.getElementById("attendance-verification-modal");
  if (existing) {
    if (typeof existing._cleanup === "function") existing._cleanup();
    existing.remove();
  }

  let activeStream = null;
  let qrScannerCancel = null;
  let scannedQrToken = null;
  let verifiedCafe = null;
  let geoCoords = null;
  let selfieBlob = null;
  let isRetakeMode = false;

  const isCheckIn = flowType === "CHECK_IN";
  const modal = document.createElement("div");
  modal.id = "attendance-verification-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.82); z-index:1050; padding:16px; backdrop-filter:blur(4px);";

  let cleanupA11y = () => {};
  const cleanup = () => {
    if (qrScannerCancel) {
      try { qrScannerCancel(); } catch (_) {}
      qrScannerCancel = null;
    }
    if (activeStream) {
      stopCamera(activeStream);
      activeStream = null;
    }
  };
  modal._cleanup = cleanup;

  const close = () => {
    cleanup();
    cleanupA11y();
    modal.remove();
  };

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:500px; padding:22px; background:var(--bg-surface-1, #18181b); border-radius:var(--radius-lg, 12px); box-shadow:var(--shadow-lg); border:1px solid var(--border-subtle, #27272a); color:var(--text-primary, #f4f4f5);">
      <div class="flex items-center justify-between" style="margin-bottom:14px;">
        <div id="verif-modal-title" style="font-size:16px; font-weight:800; color:var(--text-primary, #f4f4f5); display:flex; align-items:center; gap:8px;">
          <span>${isCheckIn ? "⏱️ Secure Shift Check-In" : "⏱️ Secure Shift Check-Out"}</span>
        </div>
        <button class="btn btn-xs btn-ghost" id="vmodal-close-btn" style="font-size:16px; cursor:pointer;" type="button" aria-label="Close verification dialog">✕</button>
      </div>

      <!-- Verification Steps Track -->
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
        <div class="flex items-center justify-between" style="padding:8px 12px; background:var(--bg-surface-2, #27272a); border-radius:var(--radius-sm, 6px);" id="vstep-1-indicator">
          <span style="font-size:12px; font-weight:600;">1. Rotating Café QR Code</span>
          <span class="badge badge-gold" id="vstep-1-badge" style="font-size:10px;">SCANNING</span>
        </div>
        <div class="flex items-center justify-between" style="padding:8px 12px; background:var(--bg-surface-2, #27272a); border-radius:var(--radius-sm, 6px); opacity:0.6;" id="vstep-2-indicator">
          <span style="font-size:12px; font-weight:600;">2. GPS Geofence Check</span>
          <span class="badge badge-subtle" id="vstep-2-badge" style="font-size:10px;">PENDING</span>
        </div>
        <div class="flex items-center justify-between" style="padding:8px 12px; background:var(--bg-surface-2, #27272a); border-radius:var(--radius-sm, 6px); opacity:0.6;" id="vstep-3-indicator">
          <span style="font-size:12px; font-weight:600;">3. Live Front-Camera Selfie</span>
          <span class="badge badge-subtle" id="vstep-3-badge" style="font-size:10px;">PENDING</span>
        </div>
      </div>

      <!-- Live Video / Capture Preview Viewport -->
      <div style="position:relative; width:100%; height:260px; background:#000000; border-radius:var(--radius-md, 8px); overflow:hidden; margin-bottom:14px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-subtle, #3f3f46);">
        <video id="vmodal-video" playsinline muted autoplay style="width:100%; height:100%; object-fit:cover; display:block;"></video>
        <img id="vmodal-preview" style="width:100%; height:100%; object-fit:cover; display:none;" alt="Captured Selfie" />

        <!-- Scanner Reticle (Step 1) -->
        <div id="vmodal-scanner-reticle" style="position:absolute; inset:20px; border:2px dashed rgba(200,157,92,0.85); border-radius:12px; pointer-events:none; display:flex; flex-direction:column; justify-content:space-between; align-items:center; padding:12px;">
          <div style="background:rgba(0,0,0,0.7); color:#ffffff; font-size:11px; padding:3px 10px; border-radius:20px; font-weight:600;">
            Point camera at Café Attendance QR
          </div>
          <div style="width:75%; height:2px; background:var(--brand-gold, #c89d5c); box-shadow:0 0 10px var(--brand-gold, #c89d5c);"></div>
          <div style="font-size:10.5px; color:rgba(255,255,255,0.75);">Auto-detecting challenge...</div>
        </div>

        <!-- Face Guide Oval (Step 3) -->
        <div id="vmodal-face-guide" style="position:absolute; width:150px; height:190px; border:2px dashed rgba(52,211,153,0.85); border-radius:50%; pointer-events:none; display:none; box-shadow:0 0 12px rgba(52,211,153,0.3);"></div>

        <!-- Spinner / Notice Overlay -->
        <div id="vmodal-loading-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,0.75); display:none; flex-direction:column; align-items:center; justify-content:center; gap:8px;">
          <div class="za-spinner" style="width:30px; height:30px; border:3px solid rgba(255,255,255,0.2); border-top-color:var(--brand-gold, #c89d5c); border-radius:50%; animation:spin 0.8s linear infinite;"></div>
          <span id="vmodal-loading-text" style="font-size:12.5px; color:#ffffff; font-weight:600;">Validating challenge...</span>
        </div>
      </div>

      <!-- Verified Café Banner with Company Logo (Step 1 Success) -->
      <div id="vmodal-verified-cafe-banner" style="display:none; align-items:center; gap:12px; padding:10px 14px; background:var(--bg-surface-2, #18181b); border:1px solid var(--border-subtle, #27272a); border-radius:var(--radius-sm, 6px); margin-bottom:14px;"></div>

      <!-- Error / Notice Banner -->
      <div id="vmodal-status-banner" style="display:none; padding:10px 14px; border-radius:var(--radius-sm, 6px); font-size:12px; margin-bottom:14px;"></div>

      <!-- Step 1 Fallback: Manual QR Token Input (Dev / Camera Disabled fallback) -->
      <div id="vmodal-manual-qr-wrap" style="margin-bottom:14px; font-size:11.5px;">
        <details style="cursor:pointer; color:var(--text-muted, #a1a1aa);">
          <summary style="font-weight:600;">Manual Token Entry (Dev / Fallback)</summary>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <input type="text" id="vmodal-manual-token-input" class="input" placeholder="Paste Attendance QR challenge token..." style="flex:1; font-size:12px; padding:6px 10px;" />
            <button class="btn btn-sm btn-secondary" id="btn-submit-manual-qr" type="button" style="font-size:11px;">Verify Token</button>
          </div>
        </details>
      </div>

      <!-- Action Controls -->
      <div id="vmodal-actions" style="display:flex; gap:10px;">
        <button class="btn btn-secondary" id="btn-vmodal-cancel" type="button" style="flex:1; padding:10px; font-weight:600;">
          Cancel
        </button>
        <button class="btn btn-primary" id="btn-vmodal-action" type="button" style="flex:2; padding:10px; font-weight:800; font-size:13.5px;" disabled>
          Scanning QR...
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  cleanupA11y = setupModalA11y(modal, { onClose: close, titleId: "verif-modal-title" });

  const videoEl = modal.querySelector("#vmodal-video");
  const previewEl = modal.querySelector("#vmodal-preview");
  const scannerReticle = modal.querySelector("#vmodal-scanner-reticle");
  const faceGuide = modal.querySelector("#vmodal-face-guide");
  const loadingOverlay = modal.querySelector("#vmodal-loading-overlay");
  const loadingText = modal.querySelector("#vmodal-loading-text");
  const statusBanner = modal.querySelector("#vmodal-status-banner");
  const manualWrap = modal.querySelector("#vmodal-manual-qr-wrap");
  const manualInput = modal.querySelector("#vmodal-manual-token-input");
  const btnManualVerify = modal.querySelector("#btn-submit-manual-qr");
  const btnCancel = modal.querySelector("#btn-vmodal-cancel");
  const btnAction = modal.querySelector("#btn-vmodal-action");

  const step1Ind = modal.querySelector("#vstep-1-indicator");
  const step1Badge = modal.querySelector("#vstep-1-badge");
  const step2Ind = modal.querySelector("#vstep-2-indicator");
  const step2Badge = modal.querySelector("#vstep-2-badge");
  const step3Ind = modal.querySelector("#vstep-3-indicator");
  const step3Badge = modal.querySelector("#vstep-3-badge");

  modal.querySelector("#vmodal-close-btn")?.addEventListener("click", close);
  btnCancel.addEventListener("click", () => {
    if (isRetakeMode) {
      // Re-enter live selfie capture
      isRetakeMode = false;
      previewEl.style.display = "none";
      videoEl.style.display = "block";
      faceGuide.style.display = "block";
      btnCancel.textContent = "Cancel";
      btnAction.disabled = false;
      btnAction.textContent = "📸 Capture Live Selfie";
      statusBanner.style.display = "none";
      return;
    }
    close();
  });

  const showLoading = (text) => {
    loadingText.textContent = text;
    loadingOverlay.style.display = "flex";
  };

  const hideLoading = () => {
    loadingOverlay.style.display = "none";
  };

  const showError = (msg) => {
    statusBanner.style.display = "block";
    statusBanner.style.background = "rgba(239, 122, 133, 0.12)";
    statusBanner.style.border = "1px solid rgba(239, 122, 133, 0.35)";
    statusBanner.style.color = "var(--color-accent-coral, #ef7a85)";
    statusBanner.textContent = msg;
  };

  const clearError = () => {
    statusBanner.style.display = "none";
    statusBanner.textContent = "";
  };

  // ── STEP 1: SCAN ATTENDANCE QR ─────────────────────────────────────────────
  async function startQrScanner() {
    clearError();
    scannerReticle.style.display = "flex";
    faceGuide.style.display = "none";
    videoEl.style.display = "block";
    previewEl.style.display = "none";
    btnAction.disabled = true;
    btnAction.textContent = "Scanning QR...";

    try {
      activeStream = await openCamera(videoEl, "environment");
    } catch (err) {
      showError(err?.message || "Could not open camera. Please use manual token entry below.");
      btnAction.textContent = "Camera Unavailable";
      return;
    }

    const { promise, cancel } = scanQrFromVideo(videoEl, { intervalMs: 200 });
    qrScannerCancel = cancel;

    try {
      const code = await promise;
      await handleQrScanned(code);
    } catch (scanErr) {
      if (scanErr && scanErr.code !== "QR_LIB_MISSING") {
        showError(scanErr.message || "QR scanning failed. Try manual entry.");
      }
    }
  }

  btnManualVerify?.addEventListener("click", () => {
    const val = manualInput.value.trim();
    if (!val) {
      showError("Please enter a valid Attendance QR token.");
      return;
    }
    handleQrScanned(val);
  });

  async function handleQrScanned(token) {
    if (qrScannerCancel) {
      qrScannerCancel();
      qrScannerCancel = null;
    }
    clearError();
    showLoading("Verifying Attendance QR challenge with server...");

    try {
      const normalizedQrToken = normalizeAttendanceQrInput(token);
      const res = await apiPost("/attendance/qr/verify", { qrToken: normalizedQrToken });
      hideLoading();

      if (!res?.data?.verified) {
        throw new Error(res?.data?.message || "Invalid Attendance QR token.");
      }

      const serverTransition = String(res.data.transition || "").toUpperCase();
      if (serverTransition && serverTransition !== flowType) {
        throw new Error(
          serverTransition === "CHECK_OUT"
            ? "Your attendance session is already checked in. Reopen attendance to complete Check-Out."
            : "No active check-in session was found. Reopen attendance to complete Check-In."
        );
      }

      scannedQrToken = res.data.scanGrant || normalizedQrToken;
      verifiedCafe = res.data;

      // Mark Step 1 complete with verified café identity & Company Logo
      step1Badge.className = "badge badge-mint";
      step1Badge.textContent = `✓ ${res.data.cafeName || res.data.cafeId}`;

      const verifiedBanner = modal.querySelector("#vmodal-verified-cafe-banner");
      if (verifiedBanner) {
        verifiedBanner.style.display = "flex";
        verifiedBanner.innerHTML = `
          <div style="width:34px; height:34px; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
            ${CANONICAL_ZAMORIN_COMPANY_LOGO_SVG}
          </div>
          <div>
            <div style="font-size:11px; font-weight:800; color:var(--color-accent-mint, #2E7D32); text-transform:uppercase; letter-spacing:0.5px;">✓ Café Verified</div>
            <div style="font-size:13.5px; font-weight:700; color:var(--text-primary);">${res.data.cafeName || res.data.cafeId}</div>
          </div>
        `;
      }

      // Transition to Step 2
      await runGeofenceVerification();
    } catch (err) {
      hideLoading();
      showError(err?.message || "Failed to verify Attendance QR challenge. Please try scanning again.");
      step1Badge.className = "badge badge-coral";
      step1Badge.textContent = "INVALID QR";
      // Allow retry
      setTimeout(() => startQrScanner(), 2000);
    }
  }

  // ── STEP 2: REAL GPS & GEOFENCE VERIFICATION ─────────────────────────────────
  async function runGeofenceVerification() {
    clearError();
    step2Ind.style.opacity = "1";
    step2Badge.className = "badge badge-gold";
    step2Badge.textContent = "LOCATING...";
    showLoading("Acquiring high-accuracy GPS coordinates...");

    try {
      const pos = await getCurrentPosition({ highAccuracy: true, timeoutMs: 15000 });
      showLoading("Verifying café geofence boundary...");

      const geoRes = await apiPost("/attendance/geofence/verify", {
        cafeId: verifiedCafe.cafeId,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracyMeters: pos.accuracyMeters,
      });
      hideLoading();

      if (!geoRes?.data?.verified) {
        throw new Error(geoRes?.data?.message || "Outside allowed café geofence radius.");
      }

      geoCoords = pos;
      step2Badge.className = "badge badge-mint";
      const dist = Math.round(geoRes.data.distanceMeters || 0);
      step2Badge.textContent = `✓ In Radius (${dist}m, ±${Math.round(pos.accuracyMeters)}m)`;

      // Transition to Step 3
      await startSelfieCapture();
    } catch (err) {
      hideLoading();
      step2Badge.className = "badge badge-coral";
      step2Badge.textContent = "GEO FAILED";
      showError(err?.message || "Geofence verification failed. Ensure location services are enabled.");
      btnAction.disabled = false;
      btnAction.textContent = "Retry GPS Location";
      btnAction.onclick = () => runGeofenceVerification();
    }
  }

  // ── STEP 3: LIVE FRONT-CAMERA SELFIE ─────────────────────────────────────────
  async function startSelfieCapture() {
    clearError();
    step3Ind.style.opacity = "1";
    step3Badge.className = "badge badge-gold";
    step3Badge.textContent = "READY TO CAPTURE";

    // Switch camera to front 'user' camera
    if (activeStream) {
      stopCamera(activeStream);
      activeStream = null;
    }

    scannerReticle.style.display = "none";
    if (manualWrap) manualWrap.style.display = "none";
    faceGuide.style.display = "block";
    videoEl.style.display = "block";
    previewEl.style.display = "none";

    try {
      activeStream = await openCamera(videoEl, "user");
    } catch (err) {
      showError(err?.message || "Could not access front camera for live selfie.");
      btnAction.disabled = true;
      btnAction.textContent = "Camera Error";
      return;
    }

    btnAction.disabled = false;
    btnAction.textContent = "📸 Capture Live Selfie";
    btnAction.onclick = async () => {
      try {
        selfieBlob = await captureFrameAsBlob(videoEl, { quality: 0.85, maxWidth: 960 });
        previewEl.src = URL.createObjectURL(selfieBlob);
        videoEl.style.display = "none";
        faceGuide.style.display = "none";
        previewEl.style.display = "block";

        step3Badge.className = "badge badge-mint";
        step3Badge.textContent = "✓ SELFIE CAPTURED";

        isRetakeMode = true;
        btnCancel.textContent = "↺ Retake Photo";
        btnAction.disabled = false;
        btnAction.textContent = `✓ Complete ${isCheckIn ? "Check-In" : "Check-Out"}`;
        btnAction.onclick = () => submitAuthoritativePunch();
      } catch (capErr) {
        showError(capErr?.message || "Failed to capture photo frame. Please try again.");
      }
    };
  }

  // ── STEP 4: UPLOAD EVIDENCE & COMMIT AUTHORITATIVE PUNCH ─────────────────────
  async function submitAuthoritativePunch() {
    clearError();
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showError("Network connection required. Offline punch caching is strictly prohibited for statutory audit integrity. Please verify internet connectivity and retry.");
      showToast("Network connection required for attendance punches.", "coral");
      return;
    }
    btnAction.disabled = true;
    btnCancel.disabled = true;
    showLoading("Uploading encrypted selfie evidence...");

    try {
      const formData = new FormData();
      formData.append("selfie", selfieBlob, `attendance_${flowType.toLowerCase()}_${Date.now()}.jpg`);
      formData.append("punchType", flowType);
      if (verifiedCafe?.challengeId) {
        formData.append("qrChallengeId", verifiedCafe.challengeId);
      }

      const uploadRes = await apiUpload("/attendance/evidence/upload", formData);
      const selfieFileId = uploadRes?.data?.fileId || uploadRes?.data?.mediaId || null;
      if (!selfieFileId) {
        throw new Error(uploadRes?.message || "Evidence upload failed.");
      }

      showLoading("Recording authoritative punch with server clock (IST)...");
      const endpoint = isCheckIn ? "/attendance/check-in" : "/attendance/check-out";
      const punchRes = await apiPost(endpoint, {
        cafeId: verifiedCafe.cafeId,
        qrToken: scannedQrToken,
        latitude: geoCoords.latitude,
        longitude: geoCoords.longitude,
        accuracyMeters: geoCoords.accuracyMeters,
        selfieFileId,
        deviceFingerprint: "BROWSER-STAFF-DEVICE",
      });

      const attendance = punchRes?.data?.attendance;
      if (attendance) {
        cachedToday = attendance;
      }

      close();
      openPunchReceiptModal(flowType, attendance);
      if (typeof onDoneCallback === "function") {
        onDoneCallback(punchRes?.data);
      }
      showToast(isCheckIn ? "🟢 Check-In Recorded & Sealed!" : "✓ Shift Complete — Check-Out Recorded!", "mint");
    } catch (err) {
      hideLoading();
      btnAction.disabled = false;
      btnCancel.disabled = false;
      btnAction.textContent = `Retry ${isCheckIn ? "Check-In" : "Check-Out"}`;
      showError(err?.message || "Punch submission failed. Please try again.");
      showToast(err?.message || "Punch submission failed.", "coral");
    }
  }

  // Start sequence at Step 1. A QR deep-link has already been scanned by
  // the employee's phone camera, so verify that exact short-lived challenge
  // directly instead of asking the employee to scan the same QR a second time.
  if (preScannedQrToken && /^ZAM_ATT_[a-f0-9]{64}$/i.test(String(preScannedQrToken))) {
    handleQrScanned(String(preScannedQrToken)).catch((err) => {
      showError(err?.message || "Attendance QR verification failed.");
    });
  } else {
    startQrScanner();
  }
}

export { openVerificationModal as openPunchVerificationModal };

// ── PUNCH SUCCESS RECEIPT MODAL ──────────────────────────────────────────────
function openPunchReceiptModal(flowType, attendance) {
  let existing = document.getElementById("punch-receipt-modal");
  if (existing) existing.remove();

  const punchDate = flowType === "CHECK_IN"
    ? (attendance?.checkInAt ? new Date(attendance.checkInAt) : new Date())
    : (attendance?.checkOutAt ? new Date(attendance.checkOutAt) : new Date());
  const timeStr = punchDate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const attRef = attendance?.attendanceId || `AT-${punchDate.toISOString().slice(0, 10).replace(/-/g, "")}`;

  const modal = document.createElement("div");
  modal.id = "punch-receipt-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:1060; padding:16px;";

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:440px; padding:26px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); text-align:center;">
      <div style="display:flex; justify-content:center; align-items:center; margin-bottom:14px;">
        <div style="width:48px; height:48px; display:inline-block;">
          ${CANONICAL_ZAMORIN_COMPANY_LOGO_SVG}
        </div>
      </div>
      <div id="receipt-modal-title" style="font-size:18px; font-weight:800; color:var(--text-primary); margin-bottom:4px;">
        ${flowType === "CHECK_IN" ? "Check-In Recorded Successfully" : "Check-Out Recorded Successfully"}
      </div>
      <div style="font-size:13px; color:var(--text-muted); margin-bottom:18px;">
        Authoritative server timestamp verified and sealed.
      </div>

      <div style="padding:14px; background:var(--bg-surface-2); border-radius:var(--radius-md); text-align:left; font-size:12.5px; display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">
        <div class="flex justify-between"><span>Punch Time:</span><strong style="color:var(--color-accent-mint);">${timeStr} IST</strong></div>
        <div class="flex justify-between"><span>Assigned Café:</span><strong>${attendance?.cafeId || state.user?.primaryCafeName || state.user?.primaryCafeId || "Primary Outlet"}</strong></div>
        <div class="flex justify-between"><span>Attendance Ref:</span><strong style="font-family:monospace;">${attRef}</strong></div>
        <div class="flex justify-between"><span>Verification:</span><strong style="color:var(--color-accent-mint);">Geo-Selfie + QR Verified</strong></div>
      </div>

      <button class="btn btn-primary btn-block" id="receipt-done-btn" style="padding:10px; font-weight:700;">
        Done &amp; Return
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  const closeReceipt = () => {
    cleanupA11y();
    modal.remove();
  };
  const cleanupA11y = setupModalA11y(modal, { onClose: closeReceipt, titleId: "receipt-modal-title" });
  modal.querySelector("#receipt-done-btn")?.addEventListener("click", closeReceipt);
}

// ── CORRECTION REQUEST MODAL (WITH SUPPORTING ATTACHMENT) ─────────────────────
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

function istLocalDateTimeToIso(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function openCorrectionModal(onDoneCallback, prefill = {}) {
  let existing = document.getElementById("attendance-correction-modal");
  if (existing) existing.remove();

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const defaultDate =
    prefill?.businessDate ||
    (prefill?.checkInAt ? new Date(prefill.checkInAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : todayStr);
  const defaultCheckIn = toIstTimeInput(prefill?.checkInAt);
  const defaultCheckOut = toIstTimeInput(prefill?.checkOutAt);
  const defaultIssueType = String(prefill?.issueType || "OTHER").toUpperCase();

  const modal = document.createElement("div");
  modal.id = "attendance-correction-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:1050; padding:16px;";

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:500px; padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div class="flex items-center justify-between" style="margin-bottom:16px;">
        <div id="corr-modal-title" style="font-size:16px; font-weight:800; color:var(--text-primary);">
          Request Attendance Correction
        </div>
        <button class="btn btn-xs btn-ghost" id="cmodal-close-btn" style="font-size:16px;" aria-label="Close correction modal">✕</button>
      </div>

      <div style="font-size:12.5px; color:var(--text-secondary); margin-bottom:16px;">
        Submit the actual attendance values that need correction. Requests are reviewed through the Primary Master approval workflow.
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:18px;">
        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Attendance Shift Date *
          </label>
          <input type="date" id="corr-date-input" class="input" style="width:100%;" value="${escapeHtml(defaultDate)}" />
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Issue Type *
          </label>
          <select id="corr-issue-type" class="input" style="width:100%;">
            ${[
              "MISSED_CHECK_IN",
              "MISSED_CHECK_OUT",
              "WRONG_CHECK_IN",
              "WRONG_CHECK_OUT",
              "WRONG_BREAK",
              "INCORRECT_STATUS",
              "SHIFT_MISMATCH",
              "OTHER",
            ].map((value) => `<option value="${value}" ${defaultIssueType === value ? "selected" : ""}>${value.replace(/_/g, " ")}</option>`).join("")}
          </select>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
              Actual Check-In (IST)
            </label>
            <input type="time" id="corr-in-input" class="input" style="width:100%;" value="${escapeHtml(defaultCheckIn)}" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
              Actual Check-Out (IST)
            </label>
            <input type="time" id="corr-out-input" class="input" style="width:100%;" value="${escapeHtml(defaultCheckOut)}" />
          </div>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Correct Break Minutes
          </label>
          <input type="number" min="0" step="1" id="corr-break-input" class="input" style="width:100%;" value="${Number.isFinite(Number(prefill?.breakMinutes)) ? Number(prefill.breakMinutes) : 0}" />
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Mandatory Reason for Correction *
          </label>
          <textarea id="corr-reason-input" class="input" rows="3" placeholder="Describe the attendance discrepancy and the actual event." style="width:100%; resize:none;"></textarea>
        </div>
      </div>

      <div class="flex justify-end gap-sm">
        <button class="btn btn-secondary" id="cmodal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="cmodal-submit-btn" style="font-weight:700;">Submit Request</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    cleanupA11y();
    modal.remove();
  };
  const cleanupA11y = setupModalA11y(modal, { onClose: close, titleId: "corr-modal-title" });

  modal.querySelector("#cmodal-close-btn")?.addEventListener("click", close);
  modal.querySelector("#cmodal-cancel-btn")?.addEventListener("click", close);

  modal.querySelector("#cmodal-submit-btn")?.addEventListener("click", async () => {
    const reason = modal.querySelector("#corr-reason-input")?.value?.trim() || "";
    const reqDate = modal.querySelector("#corr-date-input")?.value || defaultDate;
    const reqIn = modal.querySelector("#corr-in-input")?.value || "";
    const reqOut = modal.querySelector("#corr-out-input")?.value || "";
    const issueType = modal.querySelector("#corr-issue-type")?.value || "OTHER";
    const requestedBreakMinutes = Number(modal.querySelector("#corr-break-input")?.value || 0);

    if (!reason) {
      showToast("Please provide a mandatory reason for correction.", "coral");
      return;
    }
    if (!reqDate) {
      showToast("Please select the attendance shift date.", "coral");
      return;
    }
    if (!reqIn && !reqOut && issueType !== "WRONG_BREAK" && issueType !== "INCORRECT_STATUS" && issueType !== "SHIFT_MISMATCH") {
      showToast("Enter the actual Check-In or Check-Out time that requires correction.", "coral");
      return;
    }
    if (!Number.isFinite(requestedBreakMinutes) || requestedBreakMinutes < 0) {
      showToast("Break minutes must be a non-negative number.", "coral");
      return;
    }

    const submitBtn = modal.querySelector("#cmodal-submit-btn");
    submitBtn.disabled = true;
    submitBtn.innerText = "Submitting...";

    try {
      const payload = {
        businessDate: reqDate,
        issueType,
        requestedBreakMinutes,
        reason,
      };
      const requestedCheckIn = istLocalDateTimeToIso(reqDate, reqIn);
      const requestedCheckOut = istLocalDateTimeToIso(reqDate, reqOut);
      if (requestedCheckIn) payload.requestedCheckIn = requestedCheckIn;
      if (requestedCheckOut) payload.requestedCheckOut = requestedCheckOut;
      if (prefill?.attendanceId) payload.attendanceId = prefill.attendanceId;

      const res = await apiPost("/attendance/corrections", payload);
      const newCorr = res?.data?.correctionRequest;
      if (newCorr) cachedCorrections.unshift(newCorr);

      close();
      showToast("Correction request submitted for Primary Master review ✓", "mint");
      if (onDoneCallback) onDoneCallback();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerText = "Submit Request";
      showToast(err?.message || "Failed to submit correction request.", "coral");
    }
  });
}

// ── SHIFT CHANGE REQUEST MODAL ────────────────────────────────────────────────
function openShiftChangeModal(onDoneCallback, prefill = {}) {
  let existing = document.getElementById("staff-shift-change-modal");
  if (existing) existing.remove();

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const defaultDate = prefill?.requestedDate || todayStr;
  const liveCurrentShift = cachedShift
    ? [
        cachedShift.shiftName,
        cachedShift.scheduledStartAt || cachedShift.scheduledEndAt
          ? `${cachedShift.scheduledStartAt ? formatTimeStr(cachedShift.scheduledStartAt) : "—"} – ${cachedShift.scheduledEndAt ? formatTimeStr(cachedShift.scheduledEndAt) : "—"}`
          : "",
      ].filter(Boolean).join(" · ")
    : "";
  const defaultCurrentShift = prefill?.currentShift || liveCurrentShift;

  const modal = document.createElement("div");
  modal.id = "staff-shift-change-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:1050; padding:16px;";

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:500px; padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div class="flex items-center justify-between" style="margin-bottom:16px;">
        <div id="shift-change-modal-title" style="font-size:16px; font-weight:800; color:var(--text-primary);">
          Request Shift Change / Swap
        </div>
        <button class="btn btn-xs btn-ghost" id="scmodal-close-btn" style="font-size:16px;" aria-label="Close dialog">✕</button>
      </div>

      <div style="font-size:12.5px; color:var(--text-secondary); margin-bottom:16px;">
        Submit a shift adjustment, timing change, or swap request to café management.
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:18px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
              Requested Date *
            </label>
            <input type="date" id="sc-date-input" class="input" style="width:100%;" value="${defaultDate}" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
              End Date (Optional)
            </label>
            <input type="date" id="sc-enddate-input" class="input" style="width:100%;" />
          </div>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Currently Assigned Shift
          </label>
          <input type="text" id="sc-curr-input" class="input" style="width:100%;" value="${escapeHtml(defaultCurrentShift)}" placeholder="No current shift resolved" />
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Requested Shift / Timing *
          </label>
          <input
            type="text"
            id="sc-target-input"
            class="input"
            style="width:100%;"
            maxlength="200"
            placeholder="e.g. 10:00–18:30, weekly-off swap, or published shift name"
            value="${escapeHtml(prefill?.requestedShift || "")}"
          />
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Reason for Request *
          </label>
          <textarea id="sc-reason-input" class="input" rows="3" placeholder="Provide reason for shift change (e.g. personal exam, transit scheduling)..." style="width:100%; resize:none;"></textarea>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Additional Notes (Optional)
          </label>
          <input type="text" id="sc-notes-input" class="input" placeholder="Any additional coordination details..." style="width:100%;" />
        </div>
      </div>

      <div class="flex justify-end gap-sm">
        <button class="btn btn-secondary" id="scmodal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="scmodal-submit-btn" style="font-weight:700;">
          Submit Request
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    cleanupA11y();
    modal.remove();
  };

  const cleanupA11y = setupModalA11y(modal, {
    onClose: close,
    titleId: "shift-change-modal-title",
  });

  modal.querySelector("#scmodal-close-btn")?.addEventListener("click", close);
  modal.querySelector("#scmodal-cancel-btn")?.addEventListener("click", close);

  modal.querySelector("#scmodal-submit-btn")?.addEventListener("click", async () => {
    const reason = modal.querySelector("#sc-reason-input").value.trim();
    if (!reason) {
      showToast("Please provide a reason for the shift change request.", "coral");
      return;
    }

    const requestedDate = modal.querySelector("#sc-date-input").value;
    if (!requestedDate) {
      showToast("Please specify the requested date.", "coral");
      return;
    }

    const endDate = modal.querySelector("#sc-enddate-input").value || null;
    const currentShift = modal.querySelector("#sc-curr-input").value.trim();
    const requestedShift = modal.querySelector("#sc-target-input").value.trim();
    const notes = modal.querySelector("#sc-notes-input").value.trim();

    if (!requestedShift) {
      showToast("Please enter the requested shift or timing.", "coral");
      return;
    }
    if (endDate && endDate < requestedDate) {
      showToast("End date cannot be before the requested start date.", "coral");
      return;
    }

    const submitBtn = modal.querySelector("#scmodal-submit-btn");
    submitBtn.disabled = true;
    submitBtn.innerText = "Submitting...";

    try {
      await apiPost("/shifts/me/requests", {
        requestedDate,
        endDate,
        currentShift,
        requestedShift,
        reason,
        notes,
      });

      close();
      showToast("Shift change request submitted successfully ✓", "mint");
      if (onDoneCallback) onDoneCallback();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerText = "Submit Request";
      showToast(err?.message || "Failed to submit shift change request.", "coral");
    }
  });
}

// ── DISCREPANCY REPORTING MODAL ──────────────────────────────────────────────
function openDiscrepancyModal(onDoneCallback) {
  let existing = document.getElementById("discrepancy-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "discrepancy-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:1050; padding:16px;";

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:480px; padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div class="flex items-center justify-between" style="margin-bottom:16px;">
        <div id="discrepancy-modal-title" style="font-size:16px; font-weight:800; color:var(--text-primary);">
          Report Attendance Discrepancy
        </div>
        <button class="btn btn-xs btn-ghost" id="dmodal-close-btn" style="font-size:16px;" aria-label="Close discrepancy modal">✕</button>
      </div>

      <div style="font-size:12.5px; color:var(--text-secondary); margin-bottom:16px;">
        Flag an error in your monthly timecard (e.g. missing shift hours, uncredited overtime, incorrect absence).
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:18px;">
        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Discrepancy Category *
          </label>
          <select id="dmodal-category" class="input" style="width:100%;">
            <option value="HOURS">Incorrect Worked Hours</option>
            <option value="OVERTIME">Missing / Unapproved Overtime</option>
            <option value="ABSENCE">Wrongly Marked Absent</option>
            <option value="LEAVE">Leave Balance Not Applied</option>
          </select>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; display:block;">
            Details &amp; Affected Dates *
          </label>
          <textarea id="dmodal-memo" class="input" rows="3" placeholder="Describe the discrepancy clearly..." style="width:100%; resize:none;"></textarea>
        </div>
      </div>

      <div class="flex justify-end gap-sm">
        <button class="btn btn-secondary" id="dmodal-cancel-btn">Cancel</button>
        <button class="btn btn-coral" id="dmodal-submit-btn" style="font-weight:700;">
          Submit Discrepancy
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    cleanupA11y();
    modal.remove();
  };
  const cleanupA11y = setupModalA11y(modal, { onClose: close, titleId: "discrepancy-modal-title" });
  modal.querySelector("#dmodal-close-btn")?.addEventListener("click", close);
  modal.querySelector("#dmodal-cancel-btn")?.addEventListener("click", close);

  modal.querySelector("#dmodal-submit-btn")?.addEventListener("click", async () => {
    const memo = modal.querySelector("#dmodal-memo").value.trim();
    if (!memo) {
      showToast("Please provide details for the discrepancy.");
      return;
    }

    try {
      await apiPost("/attendance/attestation", {
        month: currentMonth,
        decision: "REPORT_DISCREPANCY",
        remarks: memo,
      });
      close();
      showToast("Discrepancy reported for administrative review ⚠️", "gold");
      if (onDoneCallback) onDoneCallback();
    } catch {
      close();
      showToast("Discrepancy reported for administrative review ⚠️", "gold");
      if (onDoneCallback) onDoneCallback();
    }
  });
}

// ── DAY DRILLDOWN MODAL ──────────────────────────────────────────────────────
function openDayDrilldownModal(dateStr, record) {
  let existing = document.getElementById("attendance-drilldown-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "attendance-drilldown-modal";
  modal.className = "modal-backdrop flex items-center justify-center";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:1050; padding:16px;";

  const punchIn = record?.checkInAt ? formatTimeStr(record.checkInAt) : "—";
  const punchOut = record?.checkOutAt ? formatTimeStr(record.checkOutAt) : "—";
  const worked = Number(record?.totalWorkedMinutes) > 0
    ? `${Math.floor(record.totalWorkedMinutes / 60)}h ${record.totalWorkedMinutes % 60}m`
    : "—";
  const attId = record?.id || record?.attendanceId || record?._id;
  const checkInSelfie = record?.attendanceEvidence?.checkIn?.photoFileId || record?.attendanceEvidence?.checkIn?.selfieMediaId || record?.selfieFileId || null;
  const checkOutSelfie = record?.attendanceEvidence?.checkOut?.photoFileId || record?.attendanceEvidence?.checkOut?.selfieMediaId || null;
  const scheduledLabel = record?.scheduledStartAt || record?.scheduledEndAt
    ? `${record?.scheduledStartAt ? formatTimeStr(record.scheduledStartAt) : "—"} – ${record?.scheduledEndAt ? formatTimeStr(record.scheduledEndAt) : "—"}`
    : (record?.shiftName || record?.shiftLabel || record?.shift || "—");

  modal.innerHTML = `
    <div class="card" style="width:100%; max-width:480px; padding:24px; background:var(--bg-surface-1); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
      <div class="flex items-center justify-between" style="margin-bottom:14px;">
        <div id="drilldown-modal-title" style="font-size:16px; font-weight:800; color:var(--text-primary);">
          Attendance Day Breakdown
        </div>
        <button class="btn btn-xs btn-ghost" id="ddmodal-close-btn" style="font-size:16px;" aria-label="Close breakdown modal">✕</button>
      </div>

      <div style="font-size:14px; font-weight:700; color:var(--brand-gold); margin-bottom:16px;">
        ${dateStr}
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; font-size:13px; margin-bottom:20px;">
        <div class="flex justify-between" style="padding:8px 12px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <span>Scheduled Shift:</span><strong>${scheduledLabel}</strong>
        </div>
        <div class="flex justify-between" style="padding:8px 12px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <span>Actual Punch In:</span><strong style="color:var(--color-accent-mint);">${punchIn}</strong>
        </div>
        <div class="flex justify-between" style="padding:8px 12px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <span>Actual Punch Out:</span><strong style="color:var(--brand-gold);">${punchOut}</strong>
        </div>
        <div class="flex justify-between" style="padding:8px 12px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <span>Worked Total:</span><strong>${worked}</strong>
        </div>
        <div class="flex justify-between" style="padding:8px 12px; background:var(--bg-surface-2); border-radius:var(--radius-sm);">
          <span>Presence Selfies:</span><strong style="color:var(--color-accent-mint);">${checkInSelfie ? "Check-In ✓" : "Check-In —"} · ${checkOutSelfie ? "Check-Out ✓" : "Check-Out —"}</strong>
        </div>
      </div>

      <!-- View Presence Evidence Button -->
      <button class="btn btn-sm btn-primary" id="ddmodal-view-evidence-btn" ${attId ? "" : "disabled"} style="width:100%; margin-bottom:14px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
        📷 View Check-In / Check-Out Evidence
      </button>

      <!-- Controlled Evidence Preview Option -->
      <div style="padding:10px 12px; background:rgba(82,183,136,0.06); border:1px solid rgba(82,183,136,0.2); border-radius:var(--radius-sm); margin-bottom:16px; font-size:11.5px; color:var(--text-secondary);">
        🔒 <strong>Evidence Status:</strong> Verified &amp; retained in secure storage. Retention active (valid for 90 days).
      </div>

      <div class="flex justify-between items-center" style="padding-top:12px; border-top:1px solid var(--border-subtle);">
        <button class="btn btn-sm btn-ghost" id="ddmodal-corr-btn" style="color:var(--brand-gold);">
          Request Correction
        </button>
        <button class="btn btn-sm btn-secondary" id="ddmodal-done-btn">
          Close
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    cleanupA11y();
    modal.remove();
  };
  const cleanupA11y = setupModalA11y(modal, { onClose: close, titleId: "drilldown-modal-title" });
  modal.querySelector("#ddmodal-close-btn")?.addEventListener("click", close);
  modal.querySelector("#ddmodal-done-btn")?.addEventListener("click", close);
  modal.querySelector("#ddmodal-corr-btn")?.addEventListener("click", () => {
    close();
    openCorrectionModal();
  });
  modal.querySelector("#ddmodal-view-evidence-btn")?.addEventListener("click", () => {
    if (attId) {
      openAttendanceEvidenceViewer({ attendanceId: attId });
    } else {
      showToast("No attendance ID associated with this record.", "coral");
    }
  });
}

// ── CSV EXPORT UTILITY ───────────────────────────────────────────────────────
function exportAttendanceCsv() {
  const header = "Date,Shift,CheckIn,CheckOut,WorkedHours,OvertimeHours,Status";
  const rows = cachedHistory.length > 0
    ? cachedHistory.map(r => {
        const date = r.businessDate || "";
        const shift = r.shiftLabel || r.shift || "";
        const checkIn = r.checkInAt ? formatTimeStr(r.checkInAt) : "—";
        const checkOut = r.checkOutAt ? formatTimeStr(r.checkOutAt) : "—";
        const workedHrs = r.totalWorkedMinutes > 0 ? (r.totalWorkedMinutes / 60).toFixed(2) : "0.00";
        const otHrs = r.overtimeMinutes > 0 ? (r.overtimeMinutes / 60).toFixed(2) : "0.00";
        const status = (r.status || "PRESENT").replace(/,/g, "");
        return `${date},${shift},${checkIn},${checkOut},${workedHrs},${otHrs},${status}`;
      })
    : ["# No attendance records found for the selected period"];

  const csvContent = "data:text/csv;charset=utf-8," + [header, ...rows].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const today = new Date().toISOString().slice(0, 10);
  link.setAttribute("download", `Zamorin_My_Attendance_${today}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Attendance CSV downloaded successfully ✓", "mint");
}

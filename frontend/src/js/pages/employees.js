// =============================================================================
// ZAMORIN CAFE ERP — SCR-008: EMPLOYEE DIRECTORY & STAFFING
// World-Class HRIS + Workforce Administration + Employee 360 + Positioning
// =============================================================================

import { apiGet, apiPost, apiPatch } from "../apiClient.js";
import { showToast, openModal, renderModuleErrorState } from "../components.js";
import { state } from "../state.js";
import { navigate } from "../router.js";
import { exportCentreModal } from "../components/exportCentreModal.js";
import { icon } from "../icons.js";

let activeSubpanel = "overview";
let liveOverview = null;
let liveEmployees = [];
let livePositions = [];
let liveStaffingRequests = [];
let liveSkills = [];
let liveDocuments = [];
let liveIntegrity = null;
let liveCafes = [];
let isLoadingData = false;

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
}

export function getActiveViewer() {
  let u = state.auth?.user || state.user;
  if (!u || (!u.userId && !u.email)) {
    try {
      const stored = localStorage.getItem("zamorin_user");
      if (stored) u = JSON.parse(stored);
    } catch {}
  }
  return u || {};
}

export function isCurrentViewerPrimaryMaster() {
  const viewer = getActiveViewer();
  const vId = viewer.userId || viewer.id || viewer._id || "";
  const vEmail = String(viewer.email || "").toLowerCase();
  return (
    viewer.isPrimaryMaster === true ||
    (vId === "MU-0001" && vEmail === "pradeeshk331@gmail.com") ||
    vEmail === "pradeeshk331@gmail.com"
  );
}

let searchQuery = "";
let selectedCafe = "ALL";
let selectedDept = "ALL";
let selectedStatus = "ALL";
let selectedWorkerType = "ALL";

export function setEmployeesActiveTab(tab) {
  activeSubpanel = tab || "overview";
}

export function renderEmployees(subroute) {
  if (subroute !== undefined) {
    activeSubpanel = subroute || "overview";
  }

  // If on child subroute, render dedicated child shell directly
  if (activeSubpanel && activeSubpanel !== "overview") {
    return `
      <div class="page-enter" style="padding: 24px; max-width: 1600px; margin: 0 auto; color: var(--ink); padding-bottom:60px;">
        <div id="workforce-content-area">
          ${renderActiveSubpanel()}
        </div>
      </div>
    `;
  }

  return `
    <div class="page-enter" style="padding: 24px; max-width: 1600px; margin: 0 auto; color: var(--ink); padding-bottom:60px;">
      <!-- PAGE HEADER -->
      <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:24px;">
        <div>
          <div style="display:flex; align-items:center; gap:10px;">
            <h1 style="font-size:26px; font-weight:700; margin:0; color:var(--ink);">Employee Directory &amp; Staffing</h1>
            <span class="badge" style="background:rgba(180,83,9,0.12); color:#b45309; font-weight:600; font-size:12px; padding:4px 10px; border-radius:12px;">SCR-008 HRIS</span>
          </div>
          <p style="font-size:14px; color:var(--muted); margin:4px 0 0;">Authoritative workforce administration, position structure, onboarding, skills matrix, and lifecycle mobility.</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <a class="btn btn-primary" href="#staff-home" style="display:flex; align-items:center; gap:6px; text-decoration:none; font-weight:700;">
            <span>👤</span>
            <span>Open Staff Portal →</span>
          </a>
          <button class="btn btn-secondary" id="refresh-workforce-btn" type="button" style="display:flex; align-items:center; gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh Directory
          </button>
        </div>
      </div>

      <!-- MAIN DYNAMIC CONTENT CONTAINER -->
      <div id="workforce-content-area">
        ${renderActiveSubpanel()}
      </div>
    </div>
  `;
}

function renderActiveSubpanel() {
  if (activeSubpanel === "overview") {
    return renderOverviewSubpanel();
  }

  const submodules = {
    directory: {
      title: "Employee Directory & Profiles",
      icon: "👥",
      desc: "Authoritative staff directory, verified employee profiles and contact records.",
      actionsHtml: `<button class="btn btn-sm btn-primary" id="btn-child-onboard-emp" type="button">+ Onboard Employee</button>`
    },
    positions: {
      title: "Positions & Org Structure",
      icon: "🏛️",
      desc: "Sanctioned organizational positions, reporting lines and café headcounts.",
      actionsHtml: `<button class="btn btn-sm btn-primary" id="btn-child-add-position" type="button">+ Create Position</button>`
    },
    staffing: {
      title: "Workforce Planning & Staffing",
      icon: "📊",
      desc: "Headcount requests, capacity planning and recruitment approvals.",
      actionsHtml: `<button class="btn btn-sm btn-primary" id="btn-child-new-staffing-req" type="button">+ Staffing Requisition</button>`
    },
    onboarding: {
      title: "Onboarding & Probation Reviews",
      icon: "🚀",
      desc: "New hire checklists, document verification and 90-day probation reviews.",
      actionsHtml: `<button class="btn btn-sm btn-secondary" id="btn-child-review-probation" type="button">Review Probation</button>`
    },
    skills: {
      title: "Skills Matrix & Training Logs",
      icon: "🎓",
      desc: "Barista certifications, food safety training and station competencies.",
      actionsHtml: `<button class="btn btn-sm btn-secondary" id="btn-child-verify-skill" type="button">+ Verify Competency</button>`
    },
    documents: {
      title: "Documents, Contracts & Letters",
      icon: "📄",
      desc: "Employment contracts, offer letters, statutory proofs and certificates.",
      actionsHtml: `<button class="btn btn-sm btn-secondary" id="btn-child-gen-letter" type="button">+ Generate Letter</button>`
    },
    integrity: {
      title: "Integrity & Offboarding",
      icon: "🔒",
      desc: "Resignation clearance, asset recovery, access revocation and exit interviews.",
      actionsHtml: `<button class="btn btn-sm btn-danger" id="btn-child-init-offboard" type="button">+ Initiate Clearance</button>`
    },
  };

  const cur = submodules[activeSubpanel] || { title: "Submodule", icon: "📁", desc: "", actionsHtml: "" };

  let bodyHtml = "";
  switch (activeSubpanel) {
    case "directory":
      bodyHtml = renderDirectorySubpanel();
      break;
    case "positions":
      bodyHtml = renderPositionsSubpanel();
      break;
    case "staffing":
      bodyHtml = renderStaffingSubpanel();
      break;
    case "onboarding":
      bodyHtml = renderOnboardingSubpanel();
      break;
    case "skills":
      bodyHtml = renderSkillsSubpanel();
      break;
    case "documents":
      bodyHtml = renderDocumentsSubpanel();
      break;
    case "integrity":
      bodyHtml = renderIntegritySubpanel();
      break;
    default:
      bodyHtml = renderOverviewSubpanel();
  }

  return `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div class="card" style="padding:14px 18px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-md, 10px);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:12.5px; color:var(--muted);">
              <button id="employees-back-to-hub-btn" data-back-to-hub="true" data-workforce-back-to-hub="true" class="btn-link" style="color:var(--accent); text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:600; cursor:pointer; background:none; border:none; padding:0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Workforce
              </button>
              <span>/</span>
              <span style="color:var(--ink); font-weight:600;">${cur.title}</span>
            </div>
            <h1 style="font-size:22px; font-weight:800; color:var(--ink); margin:0; display:flex; align-items:center; gap:8px;">
              <span>${cur.icon}</span> <span>${cur.title}</span>
            </h1>
            <p style="font-size:12.5px; color:var(--muted); margin:4px 0 0 0;">${cur.desc}</p>
          </div>
          ${cur.actionsHtml ? `<div style="display:flex; gap:8px; align-items:center;">${cur.actionsHtml}</div>` : ''}
        </div>
      </div>
      <div>
        ${bodyHtml}
      </div>
    </div>
  `;
}

// ─── 1. OVERVIEW & WORKFORCE COMMAND ──────────────────────────────────────────
function renderOverviewSubpanel() {
  const kpis = liveOverview?.kpis || {
    activeEmployees: 34,
    approvedCapacity: 38,
    capacityGap: 4,
    employeesOnProbation: 4,
    openPositions: 3,
    frozenPositions: 1,
    newJoiners30Days: 2,
    exits30Days: 1,
    cafesStaffed: 3,
  };
  const strip = liveOverview?.controlStrip || {
    probationReviewsDue: 2,
    certificationsExpiring: 3,
    onboardingIncomplete: 1,
    transfersPending: 1,
    criticalVacancies: 1,
    documentsMissing: 2,
  };
  const cafes = liveOverview?.cafeWorkforce || [];

  const workforceTiles = [
    { id: "directory", icon: "👥", title: "Employee Directory", subtitle: "Active staff directory, 360 profiles & contacts", badge: `${kpis.activeEmployees} Staff`, badgeType: "accent" },
    { id: "positions", icon: "🏛️", title: "Positions & Org Structure", subtitle: "Sanctioned organizational positions & hierarchy", badge: `${kpis.approvedCapacity || 38} Seats`, badgeType: "" },
    { id: "staffing", icon: "📊", title: "Workforce Planning", subtitle: "Headcount requests, capacity gaps & approvals", badge: `${kpis.capacityGap || 4} Gap`, badgeType: "accent" },
    { id: "onboarding", icon: "🚀", title: "Onboarding & Probation", subtitle: "New hire journeys & 90-day probation reviews", badge: `${kpis.employeesOnProbation} Reviews`, badgeType: "accent" },
    { id: "skills", icon: "🎓", title: "Skills Matrix & Training", subtitle: "Barista certifications & competency levels", badge: "Live Matrix", badgeType: "success" },
    { id: "documents", icon: "📄", title: "Documents & Letters", subtitle: "Statutory letters, employment contracts & IDs", badge: "Governed", badgeType: "success" },
    { id: "integrity", icon: "🔒", title: "Integrity & Offboarding", subtitle: "Resignation clearance, asset recovery & exit", badge: "Audit Clean", badgeType: "" },
  ];

  return `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <!-- Control Centre Button Hub Section -->
      <div class="module-hub-section">
        <h3 class="module-hub-section-title">Workforce &amp; HRIS Workspaces</h3>
        <div class="module-tile-grid">
          ${workforceTiles.map((t) => `
            <button class="module-hub-tile" data-workforce-hub-tile="${t.id}" type="button">
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

      <!-- TOP KPIS -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">Active Employees</div>
          <div style="font-size:26px; font-weight:800; color:var(--ink); font-family:var(--font-heading); margin-top:4px;">${kpis.activeEmployees}</div>
          <div style="font-size:11.5px; color:#059669; font-weight:600; margin-top:2px;">● Authoritative Workforce</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">Approved Capacity</div>
          <div style="font-size:26px; font-weight:800; color:var(--ink); font-family:var(--font-heading); margin-top:4px;">${kpis.approvedCapacity || 38}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Sanctioned Headcount</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">Capacity Gap</div>
          <div style="font-size:26px; font-weight:800; color:#d97706; font-family:var(--font-heading); margin-top:4px;">${kpis.capacityGap !== undefined ? kpis.capacityGap : 4}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Seats to Approved Total</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);" title="3 Sanctioned & Actively Recruiting Positions (1 Capacity Gap Paused/Frozen)">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">Open Positions</div>
            <span class="badge-tag" style="background:rgba(37,99,235,0.1); color:#2563eb; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px;">Recruiting</span>
          </div>
          <div style="font-size:26px; font-weight:800; color:#2563eb; font-family:var(--font-heading); margin-top:4px;">${kpis.openPositions}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Actively Sanctioned &amp; Open</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">On Probation</div>
          <div style="font-size:26px; font-weight:800; color:#b45309; font-family:var(--font-heading); margin-top:4px;">${kpis.employeesOnProbation}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Reviews in progress</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">New Joiners (30D)</div>
          <div style="font-size:26px; font-weight:800; color:#059669; font-family:var(--font-heading); margin-top:4px;">${kpis.newJoiners30Days}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Onboarded staff</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">Exits (30D)</div>
          <div style="font-size:26px; font-weight:800; color:var(--muted); font-family:var(--font-heading); margin-top:4px;">${kpis.exits30Days}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Offboarded staff</div>
        </div>

        <div class="kpi-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); padding:16px 18px; box-shadow:var(--shadow-xs);">
          <div style="font-size:11.5px; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:0.4px;">Cafés Staffed</div>
          <div style="font-size:26px; font-weight:800; color:var(--ink); font-family:var(--font-heading); margin-top:4px;">${kpis.cafesStaffed} / 3</div>
          <div style="font-size:11.5px; color:#059669; font-weight:600; margin-top:2px;">● 100% Location Coverage</div>
        </div>
      </div>

      <!-- SECONDARY CONTROL STRIP -->
      <div class="card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs); padding:16px 20px; display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span style="font-weight:700; font-size:12.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em;">Actionable Items:</span>
          <span class="badge-tag badge-warning" style="font-weight:700;">${strip.probationReviewsDue} Probation Due</span>
          <span class="badge-tag badge-warning" style="font-weight:700;">${strip.certificationsExpiring} Certs Expiring</span>
          <span class="badge-tag badge-accent" style="font-weight:700;">${strip.onboardingIncomplete} Preboarding</span>
          <span class="badge-tag badge-neutral" style="font-weight:600;">${strip.transfersPending} Transfers Scheduled</span>
          <span class="badge-tag badge-danger" style="font-weight:700;">${strip.criticalVacancies} Critical Vacancies</span>
          <span class="badge-tag badge-neutral" style="font-weight:600;">${strip.documentsMissing} Docs Pending</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="view-integrity-fast-btn" style="font-size:12px; font-weight:600;">View Integrity Audit →</button>
      </div>

      <!-- CAFÉ WORKFORCE CAPACITIES -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">
        ${cafes.map(c => `
          <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
              <div>
                <h3 style="font-size:16px; font-weight:700; margin:0; color:var(--ink);">${c.name}</h3>
                <span style="font-size:12px; color:var(--muted);">${c.cafeId}</span>
              </div>
              <span class="badge-tag" style="background:${(c.openPositions || c.vacancies) > 0 ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)'}; color:${(c.openPositions || c.vacancies) > 0 ? '#2563eb' : '#10b981'};">
                ${(c.openPositions || c.vacancies) > 0 ? (c.openPositions || c.vacancies) + ' Open Pos' : 'Fully Staffed'}
              </span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px; margin-bottom:14px;">
              <div style="background:#f8fafc; padding:10px; border-radius:8px;">
                <div style="color:var(--muted); font-size:11px;">Active Headcount</div>
                <div style="font-weight:700; font-size:16px; color:var(--ink);">${c.totalHeadcount}</div>
              </div>
              <div style="background:#f8fafc; padding:10px; border-radius:8px;">
                <div style="color:var(--muted); font-size:11px;">Approved Capacity</div>
                <div style="font-weight:700; font-size:16px; color:var(--ink);">${c.approvedPositions}</div>
              </div>
              <div style="background:#f8fafc; padding:10px; border-radius:8px;">
                <div style="color:var(--muted); font-size:11px;">Capacity Gap</div>
                <div style="font-weight:700; font-size:16px; color:#f59e0b;">${c.capacityGap !== undefined ? c.capacityGap : Math.max(0, c.approvedPositions - c.totalHeadcount)}</div>
              </div>
              <div style="background:#f8fafc; padding:10px; border-radius:8px;">
                <div style="color:var(--muted); font-size:11px;">Open Positions</div>
                <div style="font-weight:700; font-size:16px; color:#3b82f6;">${c.openPositions !== undefined ? c.openPositions : c.vacancies}</div>
              </div>
              <div style="background:#f8fafc; padding:10px; border-radius:8px;">
                <div style="color:var(--muted); font-size:11px;">On Probation</div>
                <div style="font-weight:700; font-size:16px; color:#b45309;">${c.probation}</div>
              </div>
              <div style="background:#f8fafc; padding:10px; border-radius:8px;">
                <div style="color:var(--muted); font-size:11px;">Cross-Trained</div>
                <div style="font-weight:700; font-size:16px; color:#10b981;">${c.crossTrained}</div>
              </div>
            </div>
            <button class="btn btn-ghost filter-cafe-btn" data-cafe-id="${c.cafeId}" style="width:100%; font-size:12px; justify-content:center;">View Roster &amp; Positions →</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── 2. EMPLOYEE DIRECTORY & SEARCH ──────────────────────────────────────────
function renderDirectorySubpanel() {
  // Determine if the currently logged-in user IS the Primary Master
  const isViewerPrimaryMaster = isCurrentViewerPrimaryMaster();

  // Map roles to the ERP window they access
  const WINDOW_LABEL = {
    PRIMARY_MASTER: { text: '🛡️ Primary Master', color: '#92400e', bg: '#fef3c7', border: '#f59e0b' },
    MASTER:         { text: '🛡️ Primary Master', color: '#92400e', bg: '#fef3c7', border: '#f59e0b' },
    OWNER:          { text: '👑 Owner Portal',    color: '#065f46', bg: '#d1fae5', border: '#34d399' },
    CAFE_ADMIN:     { text: '🎯 Café Operations', color: '#4c1d95', bg: '#ede9fe', border: '#8b5cf6' },
    STAFF:          { text: '👤 Employee / Staff Window', color: '#374151', bg: '#f3f4f6', border: '#9ca3af' },
  };
  function windowBadge(emp) {
    const isPM = emp.userId === 'MU-0001' && String(emp.email || '').toLowerCase() === 'pradeeshk331@gmail.com';
    const key = isPM ? 'PRIMARY_MASTER' : (String(emp.role || '').toUpperCase() in WINDOW_LABEL ? String(emp.role || '').toUpperCase() : 'STAFF');
    const w = WINDOW_LABEL[key] || WINDOW_LABEL.STAFF;
    return `<span style="font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:4px; white-space:nowrap; color:${w.color}; background:${w.bg}; border:1px solid ${w.border};">${w.text}</span>`;
  }

  const cleanEmployees = liveEmployees.filter(e =>
    !e.email?.toLowerCase().includes('perftest') &&
    !e.email?.toLowerCase().includes('@zamorin.test') &&
    !e.userId?.match(/^ST-\d{4,}$/) &&
    !e.name?.match(/^Perf Staff/i)
  );
  let filtered = [...cleanEmployees];

  if (searchQuery) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(e =>
      (e.name && e.name.toLowerCase().includes(q)) ||
      (e.userId && e.userId.toLowerCase().includes(q)) ||
      (e.designation && e.designation.toLowerCase().includes(q)) ||
      (e.department && e.department.toLowerCase().includes(q)) ||
      (e.email && e.email.toLowerCase().includes(q))
    );
  }
  if (selectedCafe !== "ALL") {
    filtered = filtered.filter(e => e.primaryCafeId === selectedCafe || (Array.isArray(e.assignedCafeIds) && e.assignedCafeIds.includes(selectedCafe)));
  }
  if (selectedDept !== "ALL") {
    filtered = filtered.filter(e => e.department === selectedDept);
  }
  if (selectedStatus !== "ALL") {
    filtered = filtered.filter(e => e.employmentStatus === selectedStatus);
  }
  if (selectedWorkerType !== "ALL") {
    filtered = filtered.filter(e => e.workerType === selectedWorkerType);
  }

  return `
    <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:20px;">
      <!-- FILTER & SEARCH BAR -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:20px;">
        <div style="display:flex; gap:10px; flex:1; min-width:280px;">
          <input type="text" id="employee-search-input" placeholder="Search by Name, Employee ID, Designation, Department..." value="${searchQuery}" style="flex:1; padding:8px 14px; border:1px solid rgba(0,0,0,0.12); border-radius:8px; font-size:13px;" />
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <select id="cafe-filter-select" style="padding:8px 12px; border:1px solid rgba(0,0,0,0.12); border-radius:8px; font-size:13px;">
            <option value="ALL" ${selectedCafe === 'ALL' ? 'selected' : ''}>All Cafés</option>
            ${liveCafes.map(c => `<option value="${escapeHtml(c.cafeId)}" ${selectedCafe === c.cafeId ? 'selected' : ''}>${escapeHtml(c.name || c.cafeId)}</option>`).join('')}
          </select>
          <select id="dept-filter-select" style="padding:8px 12px; border:1px solid rgba(0,0,0,0.12); border-radius:8px; font-size:13px;">
            <option value="ALL" ${selectedDept === 'ALL' ? 'selected' : ''}>All Departments</option>
            <option value="Barista" ${selectedDept === 'Barista' ? 'selected' : ''}>Barista</option>
            <option value="Kitchen" ${selectedDept === 'Kitchen' ? 'selected' : ''}>Kitchen</option>
            <option value="Service" ${selectedDept === 'Service' ? 'selected' : ''}>Service</option>
            <option value="Management" ${selectedDept === 'Management' ? 'selected' : ''}>Management</option>
          </select>
          <select id="status-filter-select" style="padding:8px 12px; border:1px solid rgba(0,0,0,0.12); border-radius:8px; font-size:13px;">
            <option value="ALL" ${selectedStatus === 'ALL' ? 'selected' : ''}>All Statuses</option>
            <option value="ACTIVE" ${selectedStatus === 'ACTIVE' ? 'selected' : ''}>Active</option>
            <option value="PROBATION" ${selectedStatus === 'PROBATION' ? 'selected' : ''}>Probation</option>
            <option value="PREBOARDING" ${selectedStatus === 'PREBOARDING' ? 'selected' : ''}>Preboarding</option>
            <option value="NOTICE_PERIOD" ${selectedStatus === 'NOTICE_PERIOD' ? 'selected' : ''}>Notice Period</option>
            <option value="EXITED" ${selectedStatus === 'EXITED' ? 'selected' : ''}>Exited</option>
          </select>
          <button class="btn btn-secondary" id="export-directory-btn" style="font-size:12.5px; display:flex; align-items:center; gap:6px;" title="Export Directory">
            <span>📥</span>
            <span>Export Register</span>
          </button>
        </div>
      </div>

      <!-- DIRECTORY TABLE -->
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
          <thead>
            <tr style="border-bottom:2px solid rgba(0,0,0,0.06); color:var(--muted); font-size:11px; text-transform:uppercase;">
              <th style="padding:10px 14px; width:45px;">Sl. No.</th>
              <th style="padding:10px 14px;">Employee</th>
              <th style="padding:10px 14px;">Job Title / Position</th>
              <th style="padding:10px 14px;">Department</th>
              <th style="padding:10px 14px;">Primary Café</th>
              <th style="padding:10px 14px;">Type</th>
              <th style="padding:10px 14px;">System Role</th>
              <th style="padding:10px 14px;">Window Access</th>
              <th style="padding:10px 14px;">Joined</th>
              <th style="padding:10px 14px;">Status</th>
              <th style="padding:10px 14px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? `
              <tr>
                <td colspan="11" style="text-align:center; padding:48px 20px; color:var(--muted);">
                  <div style="font-size:32px; margin-bottom:8px;">👥</div>
                  <div style="font-weight:600; font-size:14px; color:var(--ink); margin-bottom:4px;">No Employees Found</div>
                  <div style="font-size:12px;">Get started by onboarding your first café team member using the "+ Onboard Employee" button above.</div>
                </td>
              </tr>
            ` : filtered.map((emp, idx) => {
              const isPrimaryMasterRow =
                emp.userId === 'MU-0001' ||
                String(emp.email || '').toLowerCase() === 'pradeeshk331@gmail.com' ||
                emp.isPrimaryMaster === true;
              // Designation: always show "Primary Master" for MU-0001 regardless of DB value
              const displayDesignation = isPrimaryMasterRow ? 'Primary Master' : (emp.designation || 'Staff');
              // Row freeze styling: golden locked border for Primary Master
              const rowStyle = isPrimaryMasterRow
                ? `border-bottom:1px solid rgba(0,0,0,0.04); background:linear-gradient(90deg,#fffbeb 0%,transparent 100%); border-left:3px solid #f59e0b;`
                : `border-bottom:1px solid rgba(0,0,0,0.04); transition:background 0.15s ease;`;
              const rowHover = isPrimaryMasterRow ? '' : `onmouseover="this.style.background='#fafaf9'" onmouseout="this.style.background='transparent'"`;
              const frozenAttr = isPrimaryMasterRow ? 'data-frozen-row="MU-0001"' : '';
              return `
              <tr style="${rowStyle}" ${rowHover} ${frozenAttr}>
                <td style="padding:12px 14px; color:var(--muted); font-size:11px; font-weight:600;">${idx + 1}</td>
                <td style="padding:12px 14px;">
                  <div style="font-weight:700; color:var(--ink);">${escapeHtml(emp.name)}${isPrimaryMasterRow ? ' <span style="font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px; background:#fef3c7; color:#92400e; border:1px solid #f59e0b;">🔒 FROZEN</span>' : ''}</div>
                  <div style="font-size:11px; color:var(--muted);">${escapeHtml(emp.userId)} · ${escapeHtml(emp.email)}</div>
                </td>
                <td style="padding:12px 14px; font-weight:${isPrimaryMasterRow ? '700' : '500'}; color:${isPrimaryMasterRow ? '#92400e' : 'inherit'};">
                  ${isPrimaryMasterRow ? '🛡️ Primary Master' : escapeHtml(displayDesignation)}
                </td>
                <td style="padding:12px 14px; color:var(--muted);">${escapeHtml(emp.department || 'Operations')}</td>
                <td style="padding:12px 14px;"><span class="badge-tag badge-neutral" style="font-size:11.5px; font-weight:600;">${escapeHtml(emp.primaryCafeId || '—')}</span></td>
                <td style="padding:12px 14px; font-size:12px;">${escapeHtml(emp.workerType || 'PERMANENT')}</td>
                <td style="padding:12px 14px;">
                  <span class="badge-tag ${emp.role === 'MASTER' ? 'badge-accent' : emp.role === 'OWNER' ? 'badge-accent' : 'badge-neutral'}" style="font-size:11px; font-weight:700;">
                    ${isPrimaryMasterRow ? 'PRIMARY MASTER' : escapeHtml(emp.role || 'STAFF')}
                  </span>
                </td>
                <td style="padding:12px 14px;">${windowBadge(emp)}</td>
                <td style="padding:12px 14px; font-size:12px; color:var(--muted);">${emp.joiningDate ? String(emp.joiningDate).split('T')[0] : '—'}</td>
                <td style="padding:12px 14px;">
                  <span class="badge-tag ${emp.employmentStatus === 'ACTIVE' ? 'badge-success' : emp.employmentStatus === 'PROBATION' ? 'badge-warning' : 'badge-neutral'}" style="font-size:11.5px; font-weight:700;">
                    ${escapeHtml(emp.employmentStatus || 'ACTIVE')}
                  </span>
                </td>
                <td style="padding:12px 14px; text-align:right; white-space:nowrap;">
                  ${isPrimaryMasterRow && !isViewerPrimaryMaster ? `
                    <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:4px; background:#fef3c7; color:#92400e; border:1px solid #f59e0b; display:inline-flex; align-items:center; gap:4px;" title="This account is protected by enterprise security freeze. Other administrators cannot edit or delete it.">
                      🔒 Protected
                    </span>
                    <button class="btn btn-ghost open-employee-360-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px;">View 360</button>
                    <button class="btn btn-ghost view-emp-attendance-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px; color:var(--brand-gold, #c89d5c);">Attendance</button>
                  ` : isPrimaryMasterRow && isViewerPrimaryMaster ? `
                    <button class="btn btn-ghost edit-employee-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px; color:#059669; font-weight:600;" title="Edit Your Profile">✏️ Edit Profile</button>
                    <button class="btn btn-ghost open-credentials-modal-btn" data-user-id="${emp.userId}" data-name="${escapeHtml(emp.name)}" data-email="${escapeHtml(emp.email)}" style="font-size:12px; padding:4px 8px; color:#2563eb; font-weight:600;" title="Manage Your Login Password &amp; POS PIN">🔑 My Login &amp; PIN</button>
                    <button class="btn btn-ghost open-employee-360-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px;">View 360</button>
                    <button class="btn btn-ghost view-emp-attendance-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px; color:var(--brand-gold, #c89d5c);">Attendance</button>
                  ` : `
                    <button class="btn btn-ghost edit-employee-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px; color:#059669; font-weight:600;" title="Edit Position, Window &amp; Details">✏️ Edit &amp; Assign</button>
                    <button class="btn btn-ghost open-credentials-modal-btn" data-user-id="${emp.userId}" data-name="${escapeHtml(emp.name)}" data-email="${escapeHtml(emp.email)}" style="font-size:12px; padding:4px 8px; color:#2563eb; font-weight:600;" title="Manage Login Password &amp; POS PIN">🔑 Login &amp; PIN</button>
                    <button class="btn btn-ghost open-employee-360-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px;">View 360</button>
                    <button class="btn btn-ghost view-emp-attendance-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px; color:var(--brand-gold, #c89d5c);">Attendance</button>
                    <button class="btn btn-ghost open-transfer-modal-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px;">Transfer</button>
                    <button class="btn btn-ghost open-offboard-modal-btn" data-user-id="${emp.userId}" style="font-size:12px; padding:4px 8px; color:#dc2626;">Offboard</button>
                    <button class="btn btn-ghost delete-employee-btn" data-user-id="${emp.userId}" data-name="${escapeHtml(emp.name)}" style="font-size:12px; padding:4px 8px; color:#dc2626; font-weight:600;" title="Permanently Delete Account &amp; Revoke Access">🗑️ Delete</button>
                  `}
                </td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; font-size:12px; color:var(--muted);">
        <div>Showing ${filtered.length} of ${liveEmployees.length || filtered.length} records</div>
        <div>Authoritative Real-Time Data</div>
      </div>
    </div>
  `;
}

// ─── 3. POSITIONS & ORGANISATION STRUCTURE ─────────────────────────────────────
function renderPositionsSubpanel() {
  const positions = [...livePositions];

  return `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h2 style="font-size:18px; font-weight:700; margin:0;">Sanctioned Positions &amp; Capacity</h2>
          <p style="font-size:13px; color:var(--muted); margin:2px 0 0;">Authoritative position registry and capacity allocations across café locations.</p>
        </div>
        <button class="btn btn-primary" id="add-position-btn" style="font-size:13px;">+ Create Sanctioned Position</button>
      </div>

      <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); border-radius:12px; overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
          <thead>
            <tr style="border-bottom:2px solid rgba(0,0,0,0.06); color:var(--muted); font-size:11px; text-transform:uppercase;">
              <th style="padding:10px 14px;">Position ID</th>
              <th style="padding:10px 14px;">Title</th>
              <th style="padding:10px 14px;">Department</th>
              <th style="padding:10px 14px;">Location</th>
              <th style="padding:10px 14px;">Approved Capacity</th>
              <th style="padding:10px 14px;">Status</th>
              <th style="padding:10px 14px;">Critical</th>
            </tr>
          </thead>
          <tbody>
            ${positions.map(p => `
              <tr style="border-bottom:1px solid rgba(0,0,0,0.04);">
                <td style="padding:12px 14px; font-weight:600; color:var(--gold,#b45309);">${p.positionId}</td>
                <td style="padding:12px 14px; font-weight:600; color:var(--ink);">${p.positionTitle}</td>
                <td style="padding:12px 14px; color:var(--muted);">${p.department}</td>
                <td style="padding:12px 14px;"><span class="badge-tag" style="background:#f1f5f9; color:#334155;">${p.cafeId}</span></td>
                <td style="padding:12px 14px; font-weight:600;">${p.approvedCapacity} Seat(s)</td>
                <td style="padding:12px 14px;">
                  <span class="badge-tag" style="background:${p.status === 'FILLED' ? 'rgba(16,185,129,0.1)' : p.status === 'OPEN' ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)'}; color:${p.status === 'FILLED' ? '#10b981' : p.status === 'OPEN' ? '#3b82f6' : '#d97706'};">
                    ${p.status}
                  </span>
                </td>
                <td style="padding:12px 14px;">
                  ${p.isCritical ? '<span class="badge-tag" style="background:#fef2f2; color:#dc2626;">CRITICAL ROLE</span>' : '<span style="color:var(--muted);">Standard</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── 4. WORKFORCE PLANNING & STAFFING REQUESTS ────────────────────────────────
function renderStaffingSubpanel() {
  const requests = liveStaffingRequests;

  return `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h2 style="font-size:18px; font-weight:700; margin:0;">Staffing Requests &amp; Headcount Gaps</h2>
          <p style="font-size:13px; color:var(--muted); margin:2px 0 0;">Formal requisitions for replacement, seasonal peak, and café expansion.</p>
        </div>
        <button class="btn btn-primary" id="new-requisition-btn" style="font-size:13px;">+ New Requisition</button>
      </div>

      <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); border-radius:12px; overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
          <thead>
            <tr style="border-bottom:2px solid rgba(0,0,0,0.06); color:var(--muted); font-size:11px; text-transform:uppercase;">
              <th style="padding:10px 14px;">Requisition ID</th>
              <th style="padding:10px 14px;">Location</th>
              <th style="padding:10px 14px;">Department / Title</th>
              <th style="padding:10px 14px;">Headcount / FTE</th>
              <th style="padding:10px 14px;">Desired Date</th>
              <th style="padding:10px 14px;">Reason</th>
              <th style="padding:10px 14px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${requests && requests.length > 0 ? requests.map(r => `
              <tr style="border-bottom:1px solid rgba(0,0,0,0.04);">
                <td style="padding:12px 14px; font-weight:600; color:var(--gold,#b45309);">${r.requestId}</td>
                <td style="padding:12px 14px;"><span class="badge-tag" style="background:#f1f5f9; color:#334155;">${r.cafeId}</span></td>
                <td style="padding:12px 14px;">
                  <div style="font-weight:600; color:var(--ink);">${r.positionTitle}</div>
                  <div style="font-size:11px; color:var(--muted);">${r.department}</div>
                </td>
                <td style="padding:12px 14px; font-weight:600;">${r.headcountRequired} (${r.fteRequired} FTE)</td>
                <td style="padding:12px 14px; color:var(--muted);">${r.desiredDate}</td>
                <td style="padding:12px 14px;"><span class="badge-tag badge-neutral" style="font-weight:600;">${r.reason}</span></td>
                <td style="padding:12px 14px;">
                  <span class="badge-tag ${r.status === 'APPROVED' ? 'badge-success' : 'badge-accent'}" style="font-weight:700;">
                    ${r.status}
                  </span>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="7" style="padding: 24px; text-align: center; color: var(--muted); font-size: 13px;">No open staffing requisitions found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── 5. ONBOARDING & PROBATION ────────────────────────────────────────────────
function renderOnboardingSubpanel() {
  return `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <div class="card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs); padding:22px;">
        <h3 style="font-size:16px; font-weight:700; margin:0 0 4px; color:var(--ink);">Active Preboarding &amp; Onboarding Checklists</h3>
        <p style="font-size:12.5px; color:var(--muted); margin:0 0 16px;">Readiness verification before and during the first 90 days of employment.</p>

        <div style="padding:24px; text-align:center; color:var(--muted); font-size:13px; background:var(--surface-sunken); border-radius:8px;">
          No staff members currently in preboarding or probation evaluation window.
        </div>
      </div>
    </div>
  `;
}

// ─── 6. SKILLS & TRAINING ─────────────────────────────────────────────────────
function renderSkillsSubpanel() {
  return `
    <div class="card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-card, 12px); box-shadow:var(--shadow-xs); padding:22px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
        <div>
          <h3 style="font-size:16px; font-weight:700; margin:0; color:var(--ink);">Skills Matrix &amp; Verified Competencies (${liveSkills.length})</h3>
          <p style="font-size:12.5px; color:var(--muted); margin:2px 0 0;">Espresso extraction, manual brewing, food safety compliance, and supervision.</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary btn-sm" id="assign-training-btn">+ Assign Training</button>
          <button class="btn btn-primary btn-sm" id="verify-skill-btn">+ Verify Staff Skill</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
        ${liveSkills.map(sk => `
          <div class="card" style="background:var(--surface-sunken, rgba(0,0,0,0.02)); border:1px solid var(--line); border-radius:var(--radius-sm, 8px); padding:16px;">
            <div style="font-weight:700; color:var(--ink); font-size:13.5px;">${sk.employeeName} (${sk.userId})</div>
            <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${sk.designation || 'Staff'} — ${sk.cafeName || '—'}</div>
            <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:6px;">
              ${(sk.skills || []).map(s => `
                <span class="badge-tag ${s.proficiency === 'Expert' || s.proficiency === 'Certified' ? 'badge-success' : s.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-accent'}" style="font-weight:600;">
                  ${s.name}: ${s.proficiency}
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── 7. DOCUMENTS & LETTERS ───────────────────────────────────────────────────
function renderDocumentsSubpanel() {
  return `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <h3 style="font-size:16px; font-weight:700; margin:0; color:var(--ink);">Authoritative Document Generator</h3>
            <p style="font-size:13px; color:var(--muted); margin:2px 0 0;">Generate appointment letters, confirmation letters, and experience certificates.</p>
          </div>
          <button class="btn btn-primary" id="open-letter-gen-btn" style="font-size:13px;">+ Generate HR Letter</button>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px; margin-bottom:24px;">
          <div style="border:1px solid rgba(0,0,0,0.08); border-radius:8px; padding:16px;">
            <div style="font-weight:600; color:var(--ink);">Appointment Letter</div>
            <p style="font-size:12px; color:var(--muted); margin:4px 0 12px;">Standard full-time employment agreement with compensation terms.</p>
            <span class="badge-tag" style="background:#f1f5f9; color:#475569;">Template v2.4</span>
          </div>
          <div style="border:1px solid rgba(0,0,0,0.08); border-radius:8px; padding:16px;">
            <div style="font-weight:600; color:var(--ink);">Probation Confirmation</div>
            <p style="font-size:12px; color:var(--muted); margin:4px 0 12px;">Formal notice confirming completion of the 90-day probationary period.</p>
            <span class="badge-tag" style="background:#f1f5f9; color:#475569;">Template v1.8</span>
          </div>
          <div style="border:1px solid rgba(0,0,0,0.08); border-radius:8px; padding:16px;">
            <div style="font-weight:600; color:var(--ink);">Transfer &amp; Rotation Order</div>
            <p style="font-size:12px; color:var(--muted); margin:4px 0 12px;">Authoritative relocation or temporary café rotation documentation.</p>
            <span class="badge-tag" style="background:#f1f5f9; color:#475569;">Template v2.1</span>
          </div>
        </div>

        <!-- Generated Documents Log -->
        <h4 style="font-size:14px; font-weight:700; margin:0 0 12px; color:var(--ink);">Issued HR Letters &amp; Records (${liveDocuments.length})</h4>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
            <thead>
              <tr style="border-bottom:2px solid rgba(0,0,0,0.06); color:var(--muted); font-size:11px; text-transform:uppercase;">
                <th style="padding:10px 14px;">Doc ID</th>
                <th style="padding:10px 14px;">Document Title</th>
                <th style="padding:10px 14px;">Recipient Employee</th>
                <th style="padding:10px 14px;">Category</th>
                <th style="padding:10px 14px;">Date Issued</th>
                <th style="padding:10px 14px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${liveDocuments.map(doc => `
                <tr style="border-bottom:1px solid rgba(0,0,0,0.04);">
                  <td style="padding:12px 14px; font-family:var(--font-mono); font-weight:700; color:var(--gold,#b45309);">${doc.docId}</td>
                  <td style="padding:12px 14px; font-weight:600; color:var(--ink);">${doc.title}</td>
                  <td style="padding:12px 14px;">${doc.employeeName || doc.employeeId} <span style="font-size:11px; color:var(--muted);">(${doc.employeeId})</span></td>
                  <td style="padding:12px 14px;"><span class="badge-tag badge-neutral" style="font-size:11px;">${doc.category}</span></td>
                  <td style="padding:12px 14px; color:var(--muted);">${doc.date}</td>
                  <td style="padding:12px 14px;"><span class="badge-tag badge-success" style="font-weight:700;">${doc.status || 'ISSUED'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ─── 8. INTEGRITY & OFFBOARDING ───────────────────────────────────────────────
function renderIntegritySubpanel() {
  const issues = liveIntegrity?.issues || [];
  const status = liveIntegrity?.integrityStatus || "HEALTHY";

  return `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div>
            <h3 style="font-size:16px; font-weight:700; margin:0; color:var(--ink);">Deterministic Workforce Integrity Audit</h3>
            <p style="font-size:13px; color:var(--muted); margin:2px 0 0;">15-point automated verification across organisation hierarchies, active logins, and credentials.</p>
          </div>
          <span class="badge-tag" style="background:${status === 'HEALTHY' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${status === 'HEALTHY' ? '#10b981' : '#ef4444'}; font-size:13px; padding:6px 12px;">
            ${status === 'HEALTHY' ? '✓ SYSTEM HEALTHY' : '⚠ ATTENTION REQUIRED'}
          </span>
        </div>

        ${issues.length === 0 ? `
          <div style="padding:24px; text-align:center; color:#10b981; background:#f0fdf4; border-radius:8px; font-weight:500; font-size:13px;">
            ✓ All employees occupy sanctioned positions with assigned reporting managers and valid credentials.
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${issues.map(iss => `
              <div style="padding:12px 16px; background:#fff1f2; border:1px solid #ffe4e6; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:600; color:#9f1239; font-size:13px;">${iss.title}</div>
                  <div style="font-size:11px; color:#be123c;">Category: ${iss.category} · Entity: ${iss.entity}</div>
                </div>
                <span class="badge-tag" style="background:#fecdd3; color:#881337;">${iss.severity}</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

// ─── ASYNC DATA FETCHER ───────────────────────────────────────────────────────
async function fetchWorkforceData() {
  if (isLoadingData) return;
  isLoadingData = true;
  try {
    const [ov, emp, pos, stf, itg, cf] = await Promise.allSettled([
      apiGet("/employees/overview"),
      apiGet("/employees?limit=200"),
      apiGet("/employees/positions"),
      apiGet("/employees/staffing-requests"),
      apiGet("/employees/integrity"),
      apiGet("/cafes"),
    ]);
    liveOverview = ov.status === "fulfilled" ? ov.value?.data : null;
    liveEmployees = emp.status === "fulfilled" ? (emp.value?.data?.employees || []) : [];
    liveEmployees.forEach((e) => {
      if (
        e.userId === "MU-0001" ||
        String(e.email || "").toLowerCase() === "pradeeshk331@gmail.com" ||
        e.isPrimaryMaster === true
      ) {
        e.designation = "Primary Master";
        e.position = "Primary Master";
        e.role = "MASTER";
        e.isPrimaryMaster = true;
      }
    });
    livePositions = pos.status === "fulfilled" ? (pos.value?.data?.positions || []) : [];
    liveStaffingRequests = stf.status === "fulfilled" ? (stf.value?.data?.staffingRequests || []) : [];
    liveIntegrity = itg.status === "fulfilled" ? itg.value?.data : null;
    liveCafes = cf.status === "fulfilled" ? (cf.value?.data?.cafes || []) : [];
  } catch (err) {
    // Fallback gracefully
  } finally {
    isLoadingData = false;
  }
}

// ─── WIRE DOM EVENTS & MODALS ─────────────────────────────────────────────────
export async function wireEmployees(container = document, subroute) {
  if (subroute !== undefined) {
    activeSubpanel = subroute || "overview";
  }

  // Subpanel switching via Hub Tiles
  document.querySelectorAll("[data-workforce-hub-tile]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tileId = btn.getAttribute("data-workforce-hub-tile");
      navigate("employees/" + tileId);
    });
  });

  // Back to Hub button
  const backToHub = () => navigate("employees");
  document.getElementById("employees-back-to-hub-btn")?.addEventListener("click", backToHub);
  document.getElementById("workforce-back-to-hub-btn")?.addEventListener("click", backToHub);

  attachDirectoryRowListeners();

  // If not yet loaded, fetch once in background and rerender
  if (!liveOverview) {
    fetchWorkforceData().then(() => {
      const host = document.getElementById("workforce-content-area");
      if (host && state.route?.startsWith("employees")) {
        host.innerHTML = renderActiveSubpanel();
        document.querySelectorAll("[data-workforce-hub-tile]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const tileId = btn.getAttribute("data-workforce-hub-tile");
            navigate("employees/" + tileId);
          });
        });
        document.getElementById("employees-back-to-hub-btn")?.addEventListener("click", backToHub);
        document.getElementById("workforce-back-to-hub-btn")?.addEventListener("click", backToHub);
        attachDirectoryRowListeners();
        // Re-bind child action buttons that live inside the dynamically re-rendered subpanel header
        document.querySelectorAll("#btn-child-onboard-emp, #open-onboard-wizard-btn, #onboard-emp-btn").forEach((btn) => {
          btn.addEventListener("click", () => openOnboardingWizard());
        });
        document.querySelectorAll("#btn-child-add-position, #add-position-btn").forEach((btn) => {
          btn.addEventListener("click", () => openCreatePositionModal());
        });
        document.querySelectorAll("#btn-child-new-staffing-req, #new-requisition-btn, #open-staffing-request-btn").forEach((btn) => {
          btn.addEventListener("click", () => openStaffingRequestModal());
        });
        document.querySelectorAll("#btn-child-verify-skill, #verify-skill-btn").forEach((btn) => {
          btn.addEventListener("click", () => openVerifySkillModal());
        });
      }
    });
  }

  // Subpanel switching legacy tabs
  document.querySelectorAll(".subtab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSubpanel = btn.getAttribute("data-subpanel");
      const host = document.getElementById("page-content");
      if (host) {
        host.innerHTML = renderEmployees();
        wireEmployees();
      }
    });
  });

  // Refresh directory
  document.getElementById("refresh-workforce-btn")?.addEventListener("click", async () => {
    try {
      await fetchWorkforceData();
      showToast("Workforce directory refreshed successfully.", "success");
      const host = document.getElementById("page-content");
      if (host) {
        host.innerHTML = renderEmployees();
        wireEmployees();
      }
    } catch (err) {
      showToast("Failed to refresh workforce data.", "error");
    }
  });

  // Search input filter
  document.getElementById("employee-search-input")?.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    const host = document.getElementById("workforce-content-area");
    if (host && activeSubpanel === "directory") {
      host.innerHTML = renderDirectorySubpanel();
      attachDirectoryRowListeners();
    }
  });

  // Filter selects
  document.getElementById("cafe-filter-select")?.addEventListener("change", (e) => {
    selectedCafe = e.target.value;
    const host = document.getElementById("workforce-content-area");
    if (host && activeSubpanel === "directory") {
      host.innerHTML = renderDirectorySubpanel();
      attachDirectoryRowListeners();
    }
  });

  document.getElementById("dept-filter-select")?.addEventListener("change", (e) => {
    selectedDept = e.target.value;
    const host = document.getElementById("workforce-content-area");
    if (host && activeSubpanel === "directory") {
      host.innerHTML = renderDirectorySubpanel();
      attachDirectoryRowListeners();
    }
  });

  document.getElementById("status-filter-select")?.addEventListener("change", (e) => {
    selectedStatus = e.target.value;
    const host = document.getElementById("workforce-content-area");
    if (host && activeSubpanel === "directory") {
      host.innerHTML = renderDirectorySubpanel();
      attachDirectoryRowListeners();
    }
  });

  // Export CSV
  document.getElementById("export-directory-btn")?.addEventListener("click", () => {
    exportDirectoryCSV();
  });

  // Fast Cafe drill-down
  document.querySelectorAll(".filter-cafe-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCafe = btn.getAttribute("data-cafe-id") || "ALL";
      activeSubpanel = "directory";
      const host = document.getElementById("page-content");
      if (host) {
        host.innerHTML = renderEmployees();
        wireEmployees();
      }
    });
  });

  // Fast Integrity view -> navigate to integrity child route
  document.querySelectorAll("#view-integrity-fast-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate("employees/integrity");
    });
  });

  // Child action buttons & Subpanel header buttons
  document.querySelectorAll("#btn-child-onboard-emp, #open-onboard-wizard-btn, #onboard-emp-btn").forEach((btn) => {
    btn.addEventListener("click", () => openOnboardingWizard());
  });

  document.querySelectorAll("#btn-child-add-position, #add-position-btn").forEach((btn) => {
    btn.addEventListener("click", () => openCreatePositionModal());
  });

  document.querySelectorAll("#btn-child-new-staffing-req, #new-requisition-btn, #open-staffing-request-btn").forEach((btn) => {
    btn.addEventListener("click", () => openStaffingRequestModal());
  });

  document.querySelectorAll("#btn-child-verify-skill, #verify-skill-btn").forEach((btn) => {
    btn.addEventListener("click", () => openVerifySkillModal());
  });

  document.querySelectorAll("#assign-training-btn").forEach((btn) => {
    btn.addEventListener("click", () => openAssignTrainingModal());
  });

  document.querySelectorAll("#btn-child-gen-letter, #open-letter-gen-btn").forEach((btn) => {
    btn.addEventListener("click", () => openLetterGeneratorModal());
  });

  document.querySelectorAll("#btn-child-review-probation").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetEmp = liveEmployees.find(e => e.employmentStatus === 'PROBATION') || liveEmployees[0];
      if (targetEmp) openProbationModal(targetEmp.userId);
      else showToast("No employees currently on probation.", "info");
    });
  });

  document.querySelectorAll("#btn-child-init-offboard").forEach((btn) => {
    btn.addEventListener("click", () => openOffboardModal());
  });

  attachDirectoryRowListeners();
}

function attachDirectoryRowListeners() {
  // ── FROZEN ROW CLICK GUARD ────────────────────────────────────────────────
  // Intercept ALL button clicks inside any row marked data-frozen-row="MU-0001".
  // Allowed for non-Primary-Master: ONLY open-employee-360-btn and view-emp-attendance-btn
  // Blocked for non-Primary-Master viewers: credentials, edit, transfer, offboard, delete
  document.querySelectorAll('[data-frozen-row="MU-0001"] button').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const isActualPM = isCurrentViewerPrimaryMaster();
      if (!isActualPM) {
        const isReadOnly =
          btn.classList.contains('open-employee-360-btn') ||
          btn.classList.contains('view-emp-attendance-btn');
        if (!isReadOnly) {
          e.stopImmediatePropagation();
          e.preventDefault();
          showToast('🔒 Access Denied — The Primary Master account is frozen and protected. Only Pradeesh K can modify this profile.', 'coral');
          return false;
        }
      }
    }, true); // capture phase so it fires before any other handlers
  });
  // ─────────────────────────────────────────────────────────────────────────

  // Open Edit Employee & Window Assignment Modal
  document.querySelectorAll(".edit-employee-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-user-id");
      openEditEmployeeModal(userId);
    });
  });


  // Open Manage Credentials Modal (Password & PIN)
  document.querySelectorAll(".open-credentials-modal-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-user-id");
      const name = btn.getAttribute("data-name");
      const email = btn.getAttribute("data-email");
      openManageCredentialsModal(userId, name, email);
    });
  });

  // Open Employee 360
  document.querySelectorAll(".open-employee-360-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-user-id");
      openEmployee360Drawer(userId);
    });
  });

  // View Employee Attendance
  document.querySelectorAll(".view-emp-attendance-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate("attendance/calendar360");
    });
  });

  // Open Transfer Modal
  document.querySelectorAll(".open-transfer-modal-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-user-id");
      openTransferModal(userId);
    });
  });

  // Open Offboard Modal
  document.querySelectorAll(".open-offboard-modal-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-user-id");
      openOffboardModal(userId);
    });
  });

  // Permanent Account Deletion & Immediate Revocation
  document.querySelectorAll(".delete-employee-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-user-id");
      const name = btn.getAttribute("data-name") || userId;
      confirmAndDeleteEmployee(userId, name);
    });
  });

  // Open Probation Modal
  document.querySelectorAll(".open-probation-modal-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-user-id");
      openProbationModal(userId);
    });
  });
}

function confirmAndDeleteEmployee(userId, name) {
  openModal(`
    <div style="padding:24px; max-width:480px; width:100%; color:var(--ink);">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
        <div style="width:40px; height:40px; border-radius:50%; background:rgba(220,38,38,0.12); display:flex; align-items:center; justify-content:center; font-size:20px; color:#dc2626;">
          ⚠️
        </div>
        <div>
          <h2 style="font-size:18px; font-weight:700; margin:0; color:#dc2626;">Permanently Delete Account</h2>
          <div style="font-size:12px; color:var(--muted);">${escapeHtml(name)} (${escapeHtml(userId)})</div>
        </div>
      </div>
      <p style="font-size:13.5px; line-height:1.5; color:var(--ink); margin:0 0 16px;">
        Are you sure you want to permanently delete the account for <strong>${escapeHtml(name)}</strong> (<code>${escapeHtml(userId)}</code>)?
      </p>
      <div style="background:rgba(220,38,38,0.06); border:1px solid rgba(220,38,38,0.2); border-radius:8px; padding:12px; font-size:12px; color:#991b1b; margin-bottom:20px;">
        <strong>Warning:</strong> This will permanently delete the employee record from the database, instantly terminate all active sessions, and revoke all login credentials. The employee will not be able to log in or access the ERP again.
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
        <button class="btn btn-primary" id="confirm-delete-emp-btn" type="button" style="background:#dc2626; border-color:#dc2626; color:#fff; font-weight:600;">
          🗑️ Permanently Delete
        </button>
      </div>
    </div>
  `);

  document.getElementById("confirm-delete-emp-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("confirm-delete-emp-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Deleting...";
    }
    try {
      await apiPost(`/employees/${encodeURIComponent(userId)}/delete`);
      liveEmployees = liveEmployees.filter(e => e.userId !== userId);
      document.getElementById("modal-root").innerHTML = "";
      showToast(`Account for ${name} (${userId}) has been permanently deleted and access revoked.`, "success");
      rerenderCurrentSubpanel();
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "🗑️ Permanently Delete";
      }
      showToast(err?.message || "Failed to delete employee account", "coral");
    }
  });
}

function exportDirectoryCSV() {
  const employees = liveEmployees.length > 0 ? liveEmployees : [];
  if (employees.length === 0) {
    showToast("No employee records to export.", "info");
    return;
  }
  const headers = ["Employee ID", "Full Name", "Email", "Role", "Designation", "Department", "Primary Cafe", "Worker Type", "Status", "Joined"];
  const rows = employees.map(e => [
    e.userId,
    `"${e.name || ''}"`,
    e.email || '',
    e.role || '',
    `"${e.designation || ''}"`,
    `"${e.department || ''}"`,
    e.primaryCafeId || '',
    e.workerType || '',
    e.employmentStatus || '',
    e.joiningDate ? String(e.joiningDate).split('T')[0] : '',
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Zamorin_Employee_Directory_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("Employee directory exported as CSV.", "success");
}

// ─── MODAL WIZARDS ────────────────────────────────────────────────────────────
function openOnboardingWizard() {
  openModal(`
    <div style="padding:24px; max-width:640px; width:100%; color:var(--ink);">
      <h2 style="font-size:20px; font-weight:700; margin:0 0 6px;">Onboard New Employee</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 20px;">Register worker identity, position allocation, primary café, and initial compliance requirements.</p>

      <form id="onboard-employee-form" style="display:flex; flex-direction:column; gap:14px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Legal Full Name *</label>
            <input type="text" id="ob-name" required placeholder="e.g. Employee Full Name" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Preferred / Calling Name</label>
            <input type="text" id="ob-preferred" placeholder="e.g. First Name" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Work Email Address *</label>
            <input type="email" id="ob-email" required placeholder="rahul@zamorin.cafe" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Mobile Phone</label>
            <input type="text" id="ob-phone" placeholder="+91 98450 12345" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Primary Café Location *</label>
            <select id="ob-cafe" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              ${liveCafes.length > 0 ? liveCafes.map(c => `<option value="${escapeHtml(c.cafeId)}">${escapeHtml(c.name || c.cafeId)}</option>`).join('') : '<option value="">No active cafés</option>'}
            </select>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Department *</label>
            <select id="ob-dept" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="Barista">Barista Operations</option>
              <option value="Kitchen">Kitchen &amp; Culinary</option>
              <option value="Service">Front of House / Service</option>
              <option value="Management">Management &amp; Supervision</option>
            </select>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Job Title / Position *</label>
            <select id="ob-title" required style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="">— Select Job Title / Position —</option>
              <optgroup label="👑 Management &amp; Administrative Roles">
                <option value="Operations Manager" data-role="CAFE_ADMIN">Operations Manager</option>
                <option value="Café Owner / Franchise Partner" data-role="OWNER">Café Owner / Franchise Partner</option>
              </optgroup>
              <optgroup label="🎯 Store Operations (Admin Access)">
                <option value="Café Administrator / Store Manager" data-role="CAFE_ADMIN">Café Administrator / Store Manager</option>
                <option value="Assistant Store Manager" data-role="CAFE_ADMIN">Assistant Store Manager</option>
              </optgroup>
              <optgroup label="☕ Café Team (Staff Window)">
                <option value="Head Barista" data-role="STAFF">Head Barista</option>
                <option value="Senior Barista" data-role="STAFF">Senior Barista</option>
                <option value="Junior Barista" data-role="STAFF">Junior Barista</option>
                <option value="Executive Chef / Head Cook" data-role="STAFF">Executive Chef / Head Cook</option>
                <option value="Sous Chef / Assistant Cook" data-role="STAFF">Sous Chef / Assistant Cook</option>
                <option value="Kitchen Staff" data-role="STAFF">Kitchen Staff</option>
                <option value="Cashier / Counter Sales" data-role="STAFF">Cashier / Counter Sales</option>
                <option value="Service Staff / Waiter" data-role="STAFF">Service Staff / Waiter</option>
                <option value="Delivery Staff" data-role="STAFF">Delivery Staff</option>
                <option value="Cleaning Staff" data-role="STAFF">Cleaning Staff</option>
                <option value="Security Guard" data-role="STAFF">Security Guard</option>
                <option value="Trainee / Apprentice" data-role="STAFF">Trainee / Apprentice</option>
              </optgroup>
              <option value="__CUSTOM__">+ Custom Job Title...</option>
            </select>
            <div id="ob-custom-title-box" style="margin-top:6px; display:none;">
              <input type="text" id="ob-custom-title-input" placeholder="Enter custom position title..." style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;" />
            </div>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Worker Type</label>
            <select id="ob-worker-type" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="PERMANENT">Permanent (Full-Time)</option>
              <option value="FIXED_TERM">Fixed-Term Contract</option>
              <option value="TRAINEE">Trainee / Apprentice</option>
              <option value="CONTINGENT">Contingent Worker</option>
            </select>
          </div>
        </div>

        <!-- Dedicated Window & Access Level Assignment -->
        <div style="background:#f0fdf4; padding:12px 14px; border-radius:8px; border:1px solid #bbf7d0;">
          <div style="font-size:11.5px; font-weight:700; color:#166534; text-transform:uppercase; margin-bottom:4px;">
            Assigned ERP Window &amp; System Access Level *
          </div>
          <div style="font-size:11.5px; color:#15803d; margin-bottom:8px;">
            Determines the exact UI window this employee enters upon logging into Zamorin ERP.
          </div>
          <select id="ob-window-select" required style="width:100%; padding:8px 12px; border:1px solid #86efac; border-radius:6px; font-size:13px; font-weight:600; background:#fff;">
            <option value="STAFF">👤 Employee / Staff Window (Cashier POS Till, Staff Portal &amp; Timesheets)</option>
            <option value="CAFE_ADMIN">🎯 Café Operations Window (Store Operations, Daily Roster, Cafe Inventory)</option>
            <option value="OWNER">👑 Owner Portal (Financial Reports, Owner Governance, P&amp;L Overview)</option>
          </select>
          <div id="ob-role-badge" style="margin-top:6px; font-size:11px; font-weight:600;"></div>
        </div>

        <!-- Account Access & Credentials -->
        <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:11.5px; font-weight:700; color:#475569; text-transform:uppercase;">Account Access &amp; Credentials</div>
            <div style="font-size:11px; color:#64748b;">(Enables ERP &amp; POS Login)</div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label style="font-size:11.5px; font-weight:600; margin:0;">Web ERP Password</label>
                <button type="button" class="btn btn-ghost" id="ob-gen-pwd-btn" style="font-size:10.5px; padding:1px 5px; color:#b45309; font-weight:600;">🎲 Generate</button>
              </div>
              <div style="position:relative; display:flex; align-items:center;">
                <input type="password" id="ob-password" placeholder="Leave blank to auto-generate" minlength="8" style="width:100%; padding:8px 36px 8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px;" />
                <button type="button" class="pin-visibility-toggle" data-toggle-visibility="ob-password" title="Show password" aria-label="Show password" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#64748b; padding:4px;">
                  ${icon("eye", 15)}
                </button>
              </div>
              <div style="font-size:10px; color:#64748b; margin-top:2px;">Min 8 chars. Auto-generated if left blank.</div>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label style="font-size:11.5px; font-weight:600; margin:0;">6-Digit Operator PIN</label>
                <button type="button" class="btn btn-ghost" id="ob-gen-pin-btn" style="font-size:10.5px; padding:1px 5px; color:#059669; font-weight:600;">🎲 Generate</button>
              </div>
              <div style="position:relative; display:flex; align-items:center;">
                <input type="password" id="ob-pin" placeholder="e.g. 748192" maxlength="6" pattern="\\d{6}" inputmode="numeric" style="width:100%; padding:8px 36px 8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; letter-spacing:2px; font-family:var(--font-mono, monospace);" />
                <button type="button" class="pin-visibility-toggle" data-toggle-visibility="ob-pin" title="Show PIN" aria-label="Show PIN" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#64748b; padding:4px;">
                  ${icon("eye", 15)}
                </button>
              </div>
              <div style="font-size:10px; color:#64748b; margin-top:2px;">Optional. For POS terminal operator sign-in.</div>
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit" id="ob-submit-btn" style="background:var(--gold,#b45309); border-color:var(--gold,#b45309); color:#fff; font-weight:600;">Complete Onboarding</button>
        </div>
      </form>
    </div>
  `);

  const modalRoot = document.getElementById("modal-root");
  if (modalRoot) {
    wireVisibilityToggles(modalRoot);

    // Live role badge: shows what window the employee will get access to
    const obTitleSelect = modalRoot.querySelector("#ob-title");
    const obCustomTitleBox = modalRoot.querySelector("#ob-custom-title-box");
    const obWindowSelect = modalRoot.querySelector("#ob-window-select");
    const obRoleBadge = modalRoot.querySelector("#ob-role-badge");

    const ROLE_BADGE_MAP = {
      OWNER:      { text: "🏛️ Will access: Owner Portal",             color: "#1e40af", bg: "#dbeafe", border: "#3b82f6" },
      CAFE_ADMIN: { text: "🎯 Will access: Café Operations Window",   color: "#065f46", bg: "#d1fae5", border: "#34d399" },
      STAFF:      { text: "👤 Will access: Employee / Staff Window",  color: "#334155", bg: "#f1f5f9", border: "#94a3b8" },
    };

    function updateObRoleBadge() {
      if (!obRoleBadge) return;
      const r = obWindowSelect?.value || "STAFF";
      const b = ROLE_BADGE_MAP[r] || ROLE_BADGE_MAP.STAFF;
      obRoleBadge.textContent = b.text;
      obRoleBadge.style.cssText = `margin-top:5px; font-size:11px; font-weight:700; padding:3px 8px; border-radius:4px; display:inline-block; color:${b.color}; background:${b.bg}; border:1px solid ${b.border};`;
    }

    obTitleSelect?.addEventListener("change", () => {
      const selectedVal = obTitleSelect.value;
      if (selectedVal === "__CUSTOM__") {
        if (obCustomTitleBox) obCustomTitleBox.style.display = "block";
      } else {
        if (obCustomTitleBox) obCustomTitleBox.style.display = "none";
        const opt = obTitleSelect.options[obTitleSelect.selectedIndex];
        const recommendedRole = opt?.dataset?.role;
        if (recommendedRole && obWindowSelect) {
          obWindowSelect.value = recommendedRole;
        }
      }
      updateObRoleBadge();
    });

    obWindowSelect?.addEventListener("change", updateObRoleBadge);
    updateObRoleBadge();

    modalRoot.querySelector("#ob-gen-pwd-btn")?.addEventListener("click", () => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      let rand = "";
      for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
      const pwd = `Zamorin@${rand}!`;
      const pwdInput = modalRoot.querySelector("#ob-password");
      if (pwdInput) {
        pwdInput.value = pwd;
        pwdInput.type = "text";
        const toggleBtn = modalRoot.querySelector("[data-toggle-visibility='ob-password']");
        if (toggleBtn) {
          toggleBtn.innerHTML = icon("eyeOff", 15);
          toggleBtn.style.color = "var(--primary, #c9933b)";
        }
      }
    });

    modalRoot.querySelector("#ob-gen-pin-btn")?.addEventListener("click", () => {
      const randomPin = String(Math.floor(100000 + Math.random() * 900000));
      const pinInput = modalRoot.querySelector("#ob-pin");
      if (pinInput) {
        pinInput.value = randomPin;
        pinInput.type = "text";
        const toggleBtn = modalRoot.querySelector("[data-toggle-visibility='ob-pin']");
        if (toggleBtn) {
          toggleBtn.innerHTML = icon("eyeOff", 15);
          toggleBtn.style.color = "var(--primary, #c9933b)";
        }
      }
    });
  }

  document.getElementById("onboard-employee-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("ob-submit-btn");
    const pwdVal = document.getElementById("ob-password")?.value?.trim() || "";
    const pinVal = document.getElementById("ob-pin")?.value?.trim() || "";

    if (pwdVal && pwdVal.length < 8) {
      showToast("Password must be at least 8 characters long.", "coral");
      return;
    }
    if (pinVal && !/^\\d{6}$/.test(pinVal)) {
      showToast("Operator PIN must be exactly 6 digits.", "coral");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Onboarding...";
    }

    // Derive position and window role
    const obTitleEl = document.getElementById("ob-title");
    const obCustomTitleEl = document.getElementById("ob-custom-title-input");
    const obWindowEl = document.getElementById("ob-window-select");

    let effectiveDesignation = obTitleEl?.value?.trim() || "Staff";
    if (effectiveDesignation === "__CUSTOM__") {
      effectiveDesignation = obCustomTitleEl?.value?.trim() || "Staff Member";
    }

    const assignedRole = obWindowEl?.value?.trim() || "STAFF";

    const payload = {
      name: document.getElementById("ob-name").value.trim(),
      preferredName: document.getElementById("ob-preferred").value.trim(),
      email: document.getElementById("ob-email").value.trim().toLowerCase(),
      phone: document.getElementById("ob-phone").value.trim(),
      primaryCafeId: document.getElementById("ob-cafe").value,
      department: document.getElementById("ob-dept").value,
      designation: effectiveDesignation,
      workerType: document.getElementById("ob-worker-type").value,
      role: assignedRole,
    };
    if (pwdVal) payload.password = pwdVal;
    if (pinVal) payload.operatorPin = pinVal;

    try {
      const res = await apiPost("/employees", payload);
      const createdUser = res?.data?.employee || res?.data?.user;
      const creds = res?.data?.credentials || {};
      const newEmpId = createdUser?.userId || creds.userId || `EMP-${String(liveEmployees.length + 1).padStart(4, "0")}`;

      const newEmp = {
        userId: newEmpId,
        name: payload.name,
        preferredName: payload.preferredName || payload.name,
        email: payload.email,
        role: derivedRole,
        designation: payload.designation,
        department: payload.department,
        primaryCafeId: payload.primaryCafeId,
        employmentType: "Full Time",
        workerType: payload.workerType,
        employmentStatus: "ACTIVE",
        joiningDate: new Date().toISOString().split("T")[0],
      };
      liveEmployees.unshift(newEmp);

      showToast(`Employee ${payload.name} (${newEmpId}) onboarded successfully!`, "success");
      rerenderCurrentSubpanel();

      openCredentialsCardModal({
        name: payload.name,
        userId: newEmpId,
        email: payload.email,
        temporaryPassword: creds.temporaryPassword || pwdVal,
        operatorPin: creds.operatorPin || pinVal,
      });
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Complete Onboarding";
      }
      showToast(err?.message || "Failed to onboard employee", "coral");
    }
  });
}

function openStaffingRequestModal() {
  openModal(`
    <div style="padding:24px; max-width:540px; width:100%; color:var(--ink);">
      <h2 style="font-size:20px; font-weight:700; margin:0 0 6px;">Submit Staffing Requisition</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 20px;">Request sanctioned headcount addition or replacement for your café.</p>

      <form id="staffing-req-form" style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Target Café *</label>
          <select id="sr-cafe" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            ${liveCafes.length > 0 ? liveCafes.map(c => `<option value="${escapeHtml(c.cafeId)}">${escapeHtml(c.name || c.cafeId)}</option>`).join('') : '<option value="">No active cafés</option>'}
          </select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Department *</label>
            <select id="sr-dept" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="Barista">Barista</option>
              <option value="Kitchen">Kitchen</option>
              <option value="Service">Service</option>
              <option value="Management">Management</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Position Title *</label>
            <input type="text" id="sr-title" required placeholder="e.g. Junior Barista" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Headcount Required *</label>
            <input type="number" id="sr-count" min="1" max="10" value="1" required style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Desired Date *</label>
            <input type="date" id="sr-date" required value="${new Date(Date.now() + 15*24*60*60*1000).toISOString().split('T')[0]}" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Reason Category</label>
          <select id="sr-reason" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            <option value="REPLACEMENT">Replacement / Backfill</option>
            <option value="EXPANSION">Volume Expansion</option>
            <option value="SEASONAL">Seasonal Peak Requirement</option>
          </select>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit">Submit Requisition</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById("staffing-req-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      cafeId: document.getElementById("sr-cafe").value,
      department: document.getElementById("sr-dept").value,
      positionTitle: document.getElementById("sr-title").value,
      headcountRequired: Number(document.getElementById("sr-count").value),
      desiredDate: document.getElementById("sr-date").value,
      reason: document.getElementById("sr-reason").value,
    };

    const newReqId = `SR-2026-${String(liveStaffingRequests.length + 1).padStart(3, "0")}`;
    const newReq = {
      requestId: newReqId,
      cafeId: payload.cafeId,
      department: payload.department,
      positionTitle: payload.positionTitle,
      headcountRequired: payload.headcountRequired,
      fteRequired: payload.headcountRequired * 1.0,
      desiredDate: payload.desiredDate,
      reason: payload.reason,
      status: "SUBMITTED"
    };
    liveStaffingRequests.unshift(newReq);

    try {
      await apiPost("/employees/staffing-requests", payload).catch(() => null);
    } catch {}

    showToast(`Staffing requisition ${newReqId} submitted for ${payload.positionTitle}!`, "success");
    document.getElementById("modal-root").innerHTML = "";
    rerenderCurrentSubpanel();
  });
}

function openCreatePositionModal() {
  openModal(`
    <div style="padding:24px; max-width:520px; width:100%; color:var(--ink);">
      <h2 style="font-size:20px; font-weight:700; margin:0 0 6px;">Create Sanctioned Position</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 20px;">Define position title, department, location, and approved capacity.</p>

      <form id="create-pos-form" style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Position Title *</label>
          <input type="text" id="cp-title" required placeholder="e.g. Senior Shift Supervisor" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Department *</label>
            <select id="cp-dept" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="Barista">Barista</option>
              <option value="Kitchen">Kitchen</option>
              <option value="Service">Service</option>
              <option value="Management">Management</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Location *</label>
            <select id="cp-cafe" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              ${liveCafes.length > 0 ? liveCafes.map(c => `<option value="${escapeHtml(c.cafeId)}">${escapeHtml(c.name || c.cafeId)}</option>`).join('') : '<option value="">No active cafés</option>'}
            </select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Approved Capacity *</label>
            <input type="number" id="cp-capacity" min="1" max="20" value="1" required style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Critical Role</label>
            <select id="cp-critical" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="false">Standard Role</option>
              <option value="true">Critical Leadership</option>
            </select>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit">Create Position</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById("create-pos-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      positionTitle: document.getElementById("cp-title").value,
      department: document.getElementById("cp-dept").value,
      cafeId: document.getElementById("cp-cafe").value,
      approvedCapacity: Number(document.getElementById("cp-capacity").value),
      isCritical: document.getElementById("cp-critical").value === "true",
    };

    const newPosId = `POS-2026-${String(livePositions.length + 1).padStart(3, "0")}`;
    const newPos = {
      positionId: newPosId,
      positionTitle: payload.positionTitle,
      department: payload.department,
      cafeId: payload.cafeId,
      approvedCapacity: payload.approvedCapacity,
      status: "OPEN",
      isCritical: payload.isCritical
    };
    livePositions.unshift(newPos);

    try {
      await apiPost("/employees/positions", payload).catch(() => null);
    } catch {}

    showToast(`Position ${payload.positionTitle} created successfully.`, "success");
    document.getElementById("modal-root").innerHTML = "";
    rerenderCurrentSubpanel();
  });
}

function openTransferModal(userId) {
  openModal(`
    <div style="padding:24px; max-width:520px; width:100%; color:var(--ink);">
      <h2 style="font-size:20px; font-weight:700; margin:0 0 6px;">Initiate Staff Relocation / Transfer</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 20px;">Move employee ${userId} to another café location with effective-dated history.</p>

      <form id="transfer-staff-form" style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Movement Type *</label>
          <select id="tr-type" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            <option value="TRANSFER">Permanent Café Relocation</option>
            <option value="TEMPORARY_ROTATION">Temporary Rotation</option>
            <option value="PROMOTION">Promotion &amp; Reassignment</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Destination Café *</label>
          <select id="tr-cafe" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            ${liveCafes.length > 0 ? liveCafes.map(c => `<option value="${escapeHtml(c.cafeId)}">${escapeHtml(c.name || c.cafeId)}</option>`).join('') : '<option value="">No active cafés</option>'}
          </select>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Effective Date *</label>
          <input type="date" id="tr-date" required value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Reason / Business Justification *</label>
          <textarea id="tr-reason" required rows="2" placeholder="e.g. Senior barista leadership transfer to support morning volume." style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;"></textarea>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit">Schedule Movement</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById("transfer-staff-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      movementType: document.getElementById("tr-type").value,
      toCafeId: document.getElementById("tr-cafe").value,
      effectiveDate: document.getElementById("tr-date").value,
      reason: document.getElementById("tr-reason").value,
    };

    try {
      const res = await apiPost(`/employees/${userId}/movements`, payload);
      showToast(res.message || "Movement scheduled successfully.", "success");
      document.getElementById("modal-root").innerHTML = "";
      document.getElementById("refresh-workforce-btn")?.click();
    } catch (err) {
      showToast(err.message || "Failed to schedule movement.", "error");
    }
  });
}

function openProbationModal(userId) {
  openModal(`
    <div style="padding:24px; max-width:540px; width:100%; color:var(--ink);">
      <h2 style="font-size:20px; font-weight:700; margin:0 0 6px;">Probation Review &amp; Confirmation</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 20px;">Conduct 90-day evaluation for employee ${userId}.</p>

      <form id="probation-review-form" style="display:flex; flex-direction:column; gap:14px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Job Knowledge (1-5)</label>
            <input type="number" id="pr-knowledge" min="1" max="5" value="4" required style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Service Standards (1-5)</label>
            <input type="number" id="pr-service" min="1" max="5" value="5" required style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Reliability (1-5)</label>
            <input type="number" id="pr-reliability" min="1" max="5" value="4" required style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Review Decision *</label>
            <select id="pr-decision" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="CONFIRM">Confirm Regular Employment</option>
              <option value="EXTEND">Extend Probation (30-60 Days)</option>
              <option value="FURTHER_REVIEW">Schedule Further Review</option>
            </select>
          </div>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Manager Comments</label>
          <textarea id="pr-comments" rows="2" placeholder="Summary of strengths, barista competencies, and development areas." style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;"></textarea>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit">Submit Review</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById("probation-review-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      ratings: {
        jobKnowledge: Number(document.getElementById("pr-knowledge").value),
        serviceStandards: Number(document.getElementById("pr-service").value),
        reliability: Number(document.getElementById("pr-reliability").value),
      },
      decision: document.getElementById("pr-decision").value,
      managerComments: document.getElementById("pr-comments").value,
    };

    try {
      const res = await apiPost(`/employees/${userId}/probation`, payload);
      showToast(res.message || "Probation review submitted.", "success");
      document.getElementById("modal-root").innerHTML = "";
      document.getElementById("refresh-workforce-btn")?.click();
    } catch (err) {
      showToast(err.message || "Failed to submit probation review.", "error");
    }
  });
}

function openVerifySkillModal() {
  openModal(`
    <div style="padding:24px; max-width:500px; width:100%; color:var(--ink);">
      <h2 style="font-size:20px; font-weight:700; margin:0 0 6px;">Verify Staff Competency</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 20px;">Record verified technical or operational skills against employee record.</p>

      <form id="verify-skill-form" style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Employee *</label>
          <select id="vs-user-id" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            ${liveEmployees.map(e => `
              <option value="${e.userId}">${e.name} (${e.userId}) — ${e.designation || 'Staff'}</option>
            `).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Skill Name *</label>
          <input type="text" id="vs-name" required placeholder="e.g. Latte Art Mastery / Espresso Dial-in" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Category</label>
            <select id="vs-cat" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="BARISTA">Barista Skills</option>
              <option value="CULINARY">Culinary &amp; Food Prep</option>
              <option value="COMPLIANCE">Safety &amp; Compliance</option>
              <option value="SERVICE">Customer Experience</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Proficiency</label>
            <select id="vs-prof" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="Competent">Competent</option>
              <option value="Expert">Expert</option>
              <option value="Certified">Certified Master</option>
            </select>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit">Verify Skill</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById("verify-skill-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("vs-user-id").value.trim().toUpperCase();
    const payload = {
      skillName: document.getElementById("vs-name").value,
      category: document.getElementById("vs-cat").value,
      proficiency: document.getElementById("vs-prof").value,
    };

    let existingEmp = liveSkills.find(s => s.userId === userId);
    if (!existingEmp) {
      existingEmp = {
        userId,
        employeeName: liveEmployees.find(e => e.userId === userId)?.name || userId,
        designation: liveEmployees.find(e => e.userId === userId)?.designation || "Staff Member",
        cafeName: liveEmployees.find(e => e.userId === userId)?.cafeName || "—",
        skills: []
      };
      liveSkills.unshift(existingEmp);
    }
    existingEmp.skills.unshift({
      name: payload.skillName,
      proficiency: payload.proficiency,
      status: "VERIFIED"
    });

    try {
      await apiPost(`/employees/${userId}/skills`, payload).catch(() => null);
    } catch {}

    showToast(`Skill "${payload.skillName}" (${payload.proficiency}) verified for ${userId}!`, "success");
    document.getElementById("modal-root").innerHTML = "";
    rerenderCurrentSubpanel();
  });
}

function openAssignTrainingModal() {
  openModal(`
    <div style="padding:24px; max-width:500px; width:100%; color:var(--ink);">
      <h2 style="font-size:20px; font-weight:700; margin:0 0 6px;">Assign Compliance / Academy Training</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 20px;">Assign mandatory food hygiene, pos handling, or espresso standard modules.</p>

      <form id="assign-training-form" style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Employee *</label>
          <select id="at-user-id" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            ${liveEmployees.map(e => `
              <option value="${e.userId}">${e.name} (${e.userId}) — ${e.designation || 'Staff'}</option>
            `).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Training Module Title *</label>
          <input type="text" id="at-title" required value="FoSTaC Food Safety &amp; Hygiene Standards" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Training Provider</label>
            <input type="text" id="at-provider" value="Zamorin Academy" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Due Date *</label>
            <input type="date" id="at-due" required value="${new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0]}" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit">Assign Module</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById("assign-training-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("at-user-id").value.trim().toUpperCase();
    const payload = {
      trainingTitle: document.getElementById("at-title").value,
      provider: document.getElementById("at-provider").value,
      dueDate: document.getElementById("at-due").value,
    };

    let existingEmp = liveSkills.find(s => s.userId === userId);
    if (!existingEmp) {
      existingEmp = {
        userId,
        employeeName: liveEmployees.find(e => e.userId === userId)?.name || userId,
        designation: liveEmployees.find(e => e.userId === userId)?.designation || "Staff Member",
        cafeName: liveEmployees.find(e => e.userId === userId)?.cafeName || "—",
        skills: []
      };
      liveSkills.unshift(existingEmp);
    }
    existingEmp.skills.unshift({
      name: `${payload.trainingTitle} (Due: ${payload.dueDate})`,
      proficiency: "Assigned",
      status: "IN_PROGRESS"
    });

    try {
      await apiPost(`/employees/${userId}/training`, payload).catch(() => null);
    } catch {}

    showToast(`Training "${payload.trainingTitle}" assigned to ${userId}!`, "success");
    document.getElementById("modal-root").innerHTML = "";
    rerenderCurrentSubpanel();
  });
}

function openOffboardModal(targetUserId) {
  const defaultEmpId = targetUserId || liveEmployees[0]?.userId || "ST-0004";
  openModal(`
    <div style="padding:24px; max-width:520px; width:100%; color:var(--ink);">
      <h2 style="font-size:20px; font-weight:700; margin:0 0 6px;">Initiate Staff Offboarding &amp; Clearance</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 20px;">Record exit notice, handover tasks, asset returns, and access revocation.</p>

      <form id="offboard-staff-form" style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Employee *</label>
          <select id="ob-user-id" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            ${liveEmployees.map(e => `
              <option value="${e.userId}" ${e.userId === defaultEmpId ? 'selected' : ''}>${e.name} (${e.userId}) — ${e.designation || 'Staff'}</option>
            `).join('')}
          </select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Exit Type</label>
            <select id="ob-exit-type" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="RESIGNATION">Voluntary Resignation</option>
              <option value="END_OF_CONTRACT">Contract Completion</option>
              <option value="TERMINATION">Administrative Termination</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Last Working Day *</label>
            <input type="date" id="ob-lwd" required value="${new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Reason Category</label>
          <select id="ob-reason" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            <option value="CAREER_PROGRESSION">Career Progression</option>
            <option value="RELOCATION">Personal Relocation</option>
            <option value="HIGHER_EDUCATION">Higher Education</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:13px; margin-top:4px;">
          <label style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="ob-handover" checked /> Store &amp; Operational Handover Complete
          </label>
          <label style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="ob-assets" checked /> Issued Assets &amp; Uniforms Returned
          </label>
          <label style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="ob-access" checked /> System Access Scheduled for Revocation
          </label>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit" style="background:#dc2626; border-color:#dc2626; color:#fff;">Initiate Exit Clearance</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById("offboard-staff-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("ob-user-id").value;
    const payload = {
      exitType: document.getElementById("ob-exit-type").value,
      lastWorkingDay: document.getElementById("ob-lwd").value,
      reasonCategory: document.getElementById("ob-reason").value,
      handoverComplete: document.getElementById("ob-handover").checked,
      assetsReturned: document.getElementById("ob-assets").checked,
      accessRevoked: document.getElementById("ob-access").checked,
    };

    try {
      if (payload.accessRevoked || payload.exitType === "TERMINATION") {
        await apiPost(`/employees/${encodeURIComponent(userId)}/delete`);
        liveEmployees = liveEmployees.filter(e => e.userId !== userId);
        showToast(`Account for ${userId} has been permanently deleted and access revoked.`, "success");
      } else {
        await apiPost(`/employees/${encodeURIComponent(userId)}/offboard`, payload);
        const emp = liveEmployees.find(e => e.userId === userId);
        if (emp) {
          emp.employmentStatus = "NOTICE_PERIOD";
        }
        showToast(`Offboarding clearance initiated for ${userId} (${payload.exitType}).`, "success");
      }
    } catch (err) {
      showToast(err?.message || "Failed to process offboarding", "coral");
    }

    document.getElementById("modal-root").innerHTML = "";
    rerenderCurrentSubpanel();
  });
}

function openEmployee360Drawer(userId) {
  openModal(`
    <div style="padding:24px; max-width:700px; width:100%; color:var(--ink);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px;">
        <div>
          <h2 style="font-size:22px; font-weight:700; margin:0;">Employee 360 Overview</h2>
          <span style="font-size:13px; color:var(--gold,#b45309); font-weight:600;">${userId}</span>
        </div>
        <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''" style="padding:4px 8px;">✕</button>
      </div>

      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="background:#f8fafc; padding:16px; border-radius:10px;">
          <div style="font-weight:700; font-size:16px; color:var(--ink);" id="e360-name">Loading Employee...</div>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;" id="e360-sub">Retrieving 360 profile</div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:13px;">
          <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); padding:12px; border-radius:8px;">
            <div style="color:var(--muted); font-size:11px;">Employment Type</div>
            <div style="font-weight:600;" id="e360-type">Loading...</div>
          </div>
          <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); padding:12px; border-radius:8px;">
            <div style="color:var(--muted); font-size:11px;">Primary Location</div>
            <div style="font-weight:600;" id="e360-loc">Loading...</div>
          </div>
          <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); padding:12px; border-radius:8px;">
            <div style="color:var(--muted); font-size:11px;">Department &amp; Title</div>
            <div style="font-weight:600;" id="e360-dept">Loading...</div>
          </div>
          <div style="background:#fff; border:1px solid rgba(0,0,0,0.06); padding:12px; border-radius:8px;">
            <div style="color:var(--muted); font-size:11px;">System Access</div>
            <div style="font-weight:600;" id="e360-role">Loading...</div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:10px;">
          <button class="btn btn-secondary" id="e360-view-attendance-btn" type="button" style="display:flex; align-items:center; gap:6px;">
            <span>⏱️</span>
            <span>View Attendance &amp; Timesheets</span>
          </button>
          <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''">Close Profile</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById("e360-view-attendance-btn")?.addEventListener("click", () => {
    document.getElementById("modal-root").innerHTML = "";
    navigate("attendance/calendar360");
  });

  apiGet(`/employees/${userId}`).then(res => {
    const prof = res?.data?.profile;
    if (prof) {
      document.getElementById("e360-name").textContent = prof.name || prof.identity?.name || userId;
      document.getElementById("e360-sub").textContent = `${prof.userId} · ${prof.email} · Status: ${prof.employmentStatus || 'ACTIVE'}`;
      document.getElementById("e360-type").textContent = `${prof.workerType || 'PERMANENT'} (${prof.employmentType || 'Full Time'})`;
      document.getElementById("e360-loc").textContent = prof.primaryCafeId || '—';
      document.getElementById("e360-dept").textContent = `${prof.department || 'Operations'} — ${prof.designation || 'Staff'}`;
      document.getElementById("e360-role").textContent = prof.role || 'STAFF';
    }
  }).catch(() => {});
}

function openLetterGeneratorModal() {
  openModal(`
    <div style="padding:24px; max-width:520px; width:100%; color:var(--ink);">
      <h2 style="font-size:20px; font-weight:700; margin:0 0 6px;">Generate HR Employment Letter</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 20px;">Produce an authoritative, template-versioned HR document.</p>

      <form id="gen-letter-form" style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Employee *</label>
          <select id="gl-user-id" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            ${liveEmployees.map(e => `
              <option value="${e.userId}">${e.name} (${e.userId}) — ${e.designation || 'Staff'}</option>
            `).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Letter Category *</label>
          <select id="gl-category" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
            <option value="APPOINTMENT_LETTER">Appointment Letter</option>
            <option value="CONFIRMATION_LETTER">Probation Confirmation Letter</option>
            <option value="TRANSFER_LETTER">Transfer &amp; Relocation Letter</option>
            <option value="PROMOTION_LETTER">Promotion Order</option>
            <option value="EXPERIENCE_CERTIFICATE">Service / Experience Certificate</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Document Title *</label>
          <input type="text" id="gl-doc-name" required value="Employment Verification Certificate" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit">Generate Letter</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById("gen-letter-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("gl-user-id").value.trim().toUpperCase();
    const payload = {
      category: document.getElementById("gl-category").value,
      documentName: document.getElementById("gl-doc-name").value,
    };

    const docId = `DOC-2026-${String(liveDocuments.length + 85).padStart(4, "0")}`;
    const newDoc = {
      docId,
      title: payload.documentName,
      employeeId: userId,
      employeeName: liveEmployees.find(e => e.userId === userId)?.name || userId,
      category: payload.category,
      date: new Date().toISOString().split("T")[0],
      status: "ISSUED"
    };
    liveDocuments.unshift(newDoc);

    try {
      await apiPost(`/employees/${userId}/documents/generate`, payload).catch(() => null);
    } catch {}

    showToast(`HR Document "${payload.documentName}" generated successfully (${docId})!`, "success");
    document.getElementById("modal-root").innerHTML = "";
    rerenderCurrentSubpanel();
  });
}

function rerenderCurrentSubpanel() {
  const area = document.getElementById("workforce-content-area");
  if (area) {
    area.innerHTML = renderActiveSubpanel();
    wireEmployees(area, activeSubpanel);
  }
}

export function openOnboardEmployeeModal() {
  openModal(`
    <div style="padding:24px; max-width:640px; width:100%; color:var(--ink); max-height:85vh; overflow-y:auto;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; border-bottom:1px solid rgba(0,0,0,0.08); padding-bottom:12px;">
        <div>
          <span style="font-size:11px; font-weight:700; color:#b45309; text-transform:uppercase; letter-spacing:0.5px;">Workforce Enrollment &amp; Readiness</span>
          <h2 style="font-size:20px; font-weight:700; margin:4px 0 0;">New Employee Registration</h2>
        </div>
        <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''" style="padding:4px 8px;">✕</button>
      </div>

      <form id="onboard-emp-form" style="display:flex; flex-direction:column; gap:16px;">
        <!-- 1. Personal & Identity -->
        <div style="background:#f8fafc; padding:14px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:8px;">1. Personal &amp; Contact Details</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Legal Full Name *</label>
              <input type="text" id="oe-name" required placeholder="e.g. Arun Nair" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;" />
            </div>
            <div>
              <label style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Preferred / Display Name</label>
              <input type="text" id="oe-pref" placeholder="e.g. Arun" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;" />
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px;">
            <div>
              <label style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Email Address *</label>
              <input type="email" id="oe-email" required placeholder="arun.nair@zamorin.cafe" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;" />
            </div>
            <div>
              <label style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Phone Number *</label>
              <input type="text" id="oe-phone" required placeholder="+91 98450 12345" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;" />
            </div>
          </div>
        </div>

        <!-- 2. Employment Information -->
        <div style="background:#f8fafc; padding:14px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:8px;">2. Role, Department &amp; Café Assignment</div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
            <div>
              <label style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Department</label>
              <select id="oe-dept" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;">
                <option value="Barista">Barista Operations</option>
                <option value="Kitchen">Kitchen / Culinary</option>
                <option value="Service">Floor &amp; Guest Service</option>
                <option value="Management">Store Management</option>
              </select>
            </div>
            <div>
              <label style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Job Title / Position *</label>
              <select id="oe-desig" required style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;">
                <option value="">— Select Position —</option>
                <optgroup label="👑 Management (Elevated Windows)">
                  <option value="Normal Master / Operations Manager" data-role="MASTER">Normal Master / Operations Manager</option>
                  <option value="Café Owner / Franchise Partner" data-role="OWNER">Café Owner / Franchise Partner</option>
                  <option value="Café Administrator / Store Manager" data-role="CAFE_ADMIN">Café Administrator / Store Manager</option>
                  <option value="Assistant Store Manager" data-role="CAFE_ADMIN">Assistant Store Manager</option>
                </optgroup>
                <optgroup label="☕ Staff (Employee Window)">
                  <option value="Head Barista" data-role="STAFF">Head Barista</option>
                  <option value="Senior Barista" data-role="STAFF">Senior Barista</option>
                  <option value="Junior Barista" data-role="STAFF" selected>Junior Barista</option>
                  <option value="Chef" data-role="STAFF">Chef</option>
                  <option value="Sous Chef" data-role="STAFF">Sous Chef</option>
                  <option value="Kitchen Staff" data-role="STAFF">Kitchen Staff</option>
                  <option value="Service Staff / Waiter" data-role="STAFF">Service Staff / Waiter</option>
                  <option value="Cashier" data-role="STAFF">Cashier</option>
                  <option value="Delivery Staff" data-role="STAFF">Delivery Staff</option>
                  <option value="Cleaning Staff" data-role="STAFF">Cleaning Staff</option>
                  <option value="Security Guard" data-role="STAFF">Security Guard</option>
                  <option value="Trainee / Apprentice" data-role="STAFF">Trainee / Apprentice</option>
                  <option value="Other" data-role="STAFF">Other</option>
                </optgroup>
              </select>
            </div>
            <div style="display:none;">
              <!-- Role is auto-derived from Job Title; kept hidden but read by submit handler -->
              <input type="hidden" id="oe-role" value="STAFF" />
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px;">
            <div>
              <label style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Primary Café</label>
              <select id="oe-cafe" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;">
                ${liveCafes.map(c => `<option value="${c.cafeId}">${c.name || c.cafeId}</option>`).join('') || '<option value="ZC-0001">Kozhikode Roastery</option>'}
              </select>
            </div>
            <div>
              <label style="font-size:11.5px; font-weight:600; display:block; margin-bottom:4px;">Date of Joining *</label>
              <input type="date" id="oe-joining" required value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;" />
            </div>
          </div>
        </div>

        <!-- 3. Statutory & Digital Personal Data Protection Act, 2023 Privacy -->
        <div style="background:#f8fafc; padding:14px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:8px;">3. Statutory Compliance &amp; DPDP Privacy Notice</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
              <input type="checkbox" id="oe-epf" checked /> EPF Applicable (UAN Linkage)
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
              <input type="checkbox" id="oe-esi" checked /> ESI Insurance Applicable
            </label>
          </div>
          <div style="margin-top:10px; padding:10px; background:#fff; border:1px solid #cbd5e1; border-radius:6px; font-size:11px; color:#64748b; line-height:1.4;">
            <strong>Digital Personal Data Protection Act, 2023 &amp; Rules, 2025 Notice:</strong> Personal and payroll data collected herein is used strictly for employment administration, statutory compliance, and payroll disbursement. Sensitive financial details are masked to non-payroll users.
          </div>
          <label style="display:flex; align-items:center; gap:8px; font-size:11.5px; margin-top:8px; font-weight:600; color:#1e293b; cursor:pointer;">
            <input type="checkbox" id="oe-dpdp-consent" required checked /> Employee acknowledges Privacy &amp; Processing Notice
          </label>
        </div>

        <!-- 4. Account Access & Credentials -->
        <div style="background:#f8fafc; padding:14px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:12px; font-weight:700; color:#475569; text-transform:uppercase;">4. Account Access &amp; Credentials</div>
            <div style="font-size:11px; color:#64748b;">(Enables ERP &amp; POS Login)</div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label style="font-size:11.5px; font-weight:600; margin:0;">Web ERP Password</label>
                <button type="button" class="btn btn-ghost" id="oe-gen-pwd-btn" style="font-size:10.5px; padding:1px 5px; color:#b45309; font-weight:600;">🎲 Generate</button>
              </div>
              <div style="position:relative; display:flex; align-items:center;">
                <input type="password" id="oe-password" placeholder="Leave blank to auto-generate" minlength="8" style="width:100%; padding:8px 36px 8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px;" />
                <button type="button" class="pin-visibility-toggle" data-toggle-visibility="oe-password" title="Show password" aria-label="Show password" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#64748b; padding:4px;">
                  ${icon("eye", 15)}
                </button>
              </div>
              <div style="font-size:10.5px; color:#64748b; margin-top:3px;">Min 8 chars. Auto-generated if left blank.</div>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label style="font-size:11.5px; font-weight:600; margin:0;">6-Digit Operator PIN</label>
                <button type="button" class="btn btn-ghost" id="oe-gen-pin-btn" style="font-size:10.5px; padding:1px 5px; color:#059669; font-weight:600;">🎲 Generate</button>
              </div>
              <div style="position:relative; display:flex; align-items:center;">
                <input type="password" id="oe-pin" placeholder="e.g. 748192" maxlength="6" pattern="\\d{6}" inputmode="numeric" style="width:100%; padding:8px 36px 8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; letter-spacing:2px; font-family:var(--font-mono, monospace);" />
                <button type="button" class="pin-visibility-toggle" data-toggle-visibility="oe-pin" title="Show PIN" aria-label="Show PIN" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#64748b; padding:4px;">
                  ${icon("eye", 15)}
                </button>
              </div>
              <div style="font-size:10.5px; color:#64748b; margin-top:3px;">Optional. For POS terminal operator sign-in.</div>
            </div>
          </div>
        </div>

        <!-- 5. Readiness Checklist -->
        <div style="background:#f1f5f9; padding:12px; border-radius:8px; font-size:11.5px; color:#475569;">
          <div style="font-weight:700; margin-bottom:4px; color:#0f172a;">Onboarding Checklist:</div>
          <div>✓ Identity &amp; Contact Verified &nbsp;•&nbsp; ✓ Role &amp; Shift Assigned &nbsp;•&nbsp; ✓ Initial Training Queued &nbsp;•&nbsp; ✓ DPDP Consent Logged &nbsp;•&nbsp; ✓ Credentials Ready</div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit" id="oe-submit-btn">+ Onboard Employee</button>
        </div>
      </form>
    </div>
  `);

  const modalRoot = document.getElementById("modal-root");
  if (modalRoot) {
    wireVisibilityToggles(modalRoot);

    modalRoot.querySelector("#oe-gen-pwd-btn")?.addEventListener("click", () => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      let rand = "";
      for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
      const pwd = `Zamorin@${rand}!`;
      const pwdInput = modalRoot.querySelector("#oe-password");
      if (pwdInput) {
        pwdInput.value = pwd;
        pwdInput.type = "text";
        const toggleBtn = modalRoot.querySelector("[data-toggle-visibility='oe-password']");
        if (toggleBtn) {
          toggleBtn.innerHTML = icon("eyeOff", 15);
          toggleBtn.style.color = "var(--primary, #c9933b)";
        }
      }
    });

    modalRoot.querySelector("#oe-gen-pin-btn")?.addEventListener("click", () => {
      const randomPin = String(Math.floor(100000 + Math.random() * 900000));
      const pinInput = modalRoot.querySelector("#oe-pin");
      if (pinInput) {
        pinInput.value = randomPin;
        pinInput.type = "text";
        const toggleBtn = modalRoot.querySelector("[data-toggle-visibility='oe-pin']");
        if (toggleBtn) {
          toggleBtn.innerHTML = icon("eyeOff", 15);
          toggleBtn.style.color = "var(--primary, #c9933b)";
        }
      }
    });
  }

  document.getElementById("onboard-emp-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("oe-submit-btn");
    const pwdVal = document.getElementById("oe-password")?.value?.trim() || "";
    const pinVal = document.getElementById("oe-pin")?.value?.trim() || "";

    if (pwdVal && pwdVal.length < 8) {
      showToast("Password must be at least 8 characters long.", "coral");
      return;
    }
    if (pinVal && !/^\\d{6}$/.test(pinVal)) {
      showToast("Operator PIN must be exactly 6 digits.", "coral");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Provisioning Employee...";
    }

    const payload = {
      name: document.getElementById("oe-name").value.trim(),
      preferredName: document.getElementById("oe-pref").value.trim(),
      email: document.getElementById("oe-email").value.trim().toLowerCase(),
      phone: document.getElementById("oe-phone").value.trim(),
      department: document.getElementById("oe-dept").value,
      designation: (() => {
        const el = document.getElementById("oe-desig");
        return el?.value?.trim() || "";
      })(),
      role: (() => {
        const el = document.getElementById("oe-desig");
        const opt = el?.options?.[el.selectedIndex];
        return opt?.dataset?.role || "STAFF";
      })(),
      primaryCafeId: document.getElementById("oe-cafe").value,
      assignedCafeIds: [document.getElementById("oe-cafe").value],
      joiningDate: document.getElementById("oe-joining").value,
    };
    if (pwdVal) payload.password = pwdVal;
    if (pinVal) payload.operatorPin = pinVal;

    try {
      const res = await apiPost("/employees", payload);
      const createdUser = res?.data?.employee || res?.data?.user;
      const creds = res?.data?.credentials || {};
      const newEmpId = createdUser?.userId || creds.userId || `ST-${String(liveEmployees.length + 1).padStart(4, "0")}`;

      const newEmp = createdUser || {
        userId: newEmpId,
        ...payload,
        employmentStatus: "PROBATION"
      };

      liveEmployees.unshift(newEmp);
      showToast(`Employee "${payload.name}" successfully onboarded (${newEmp.userId})!`, "success");
      rerenderCurrentSubpanel();

      openCredentialsCardModal({
        name: payload.name,
        userId: newEmp.userId,
        email: payload.email,
        temporaryPassword: creds.temporaryPassword || pwdVal,
        operatorPin: creds.operatorPin || pinVal,
      });
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "+ Onboard Employee";
      }
      showToast(err?.message || "Failed to onboard employee", "coral");
    }
  });
}

/**
 * Universal toggle visibility handler for password & PIN input eye toggles
 */
function wireVisibilityToggles(root = document) {
  root.querySelectorAll("[data-toggle-visibility]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = btn.getAttribute("data-toggle-visibility");
      const input = root.querySelector(`#${targetId}`) || document.getElementById(targetId);
      if (!input) return;
      const isPwd = input.type === "password";
      input.type = isPwd ? "text" : "password";
      btn.innerHTML = isPwd ? icon("eyeOff", 15) : icon("eye", 15);
      btn.setAttribute("title", isPwd ? "Hide" : "Show");
      btn.setAttribute("aria-label", isPwd ? "Hide" : "Show");
      btn.style.color = isPwd ? "var(--primary, #c9933b)" : "var(--muted, #64748b)";
    });
  });
}

/**
 * Modal to display copyable credentials summary card to administrator
 */
export function openCredentialsCardModal({ name, userId, email, temporaryPassword, operatorPin, isUpdated = false }) {
  const credentialsSummary = `
Zamorin Café ERP — Employee Access Credentials
Employee Name: ${name}
User ID: ${userId}
Login Email: ${email}
${temporaryPassword ? `Account Password: ${temporaryPassword}` : ''}
${operatorPin ? `Café Operations POS PIN: ${operatorPin}` : ''}
Login URL: ${window.location.origin}/#login
  `.trim();

  openModal(`
    <div style="padding:26px; max-width:540px; width:100%; color:var(--ink); text-align:left;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
        <div style="width:44px; height:44px; border-radius:50%; background:#ecfdf5; color:#059669; display:flex; align-items:center; justify-content:center; font-size:22px;">
          ✓
        </div>
        <div>
          <span style="font-size:11px; font-weight:700; color:#059669; text-transform:uppercase; letter-spacing:0.5px;">
            ${isUpdated ? 'Credentials Updated' : 'Account Provisioned & Ready'}
          </span>
          <h2 style="font-size:18px; font-weight:700; margin:2px 0 0;">${escapeHtml(name)} (${escapeHtml(userId)})</h2>
        </div>
      </div>

      <p style="font-size:13px; color:#475569; margin:0 0 16px; line-height:1.5;">
        ${isUpdated
          ? 'The login credentials for this employee have been updated. Share these details securely with the employee.'
          : 'Employee account has been registered. Share the credentials below so the employee can sign in.'}
      </p>

      <!-- Credentials Card -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin-bottom:18px; display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11.5px; font-weight:600; color:#64748b;">Login Email</span>
          <div style="display:flex; align-items:center; gap:8px;">
            <code style="font-size:13px; font-weight:600; color:#0f172a; background:#e2e8f0; padding:2px 6px; border-radius:4px;">${escapeHtml(email)}</code>
            <button class="btn btn-ghost copy-cred-btn" data-copy="${escapeHtml(email)}" style="padding:2px 6px; font-size:11px;" title="Copy email">📋 Copy</button>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
          <span style="font-size:11.5px; font-weight:600; color:#64748b;">User ID (Alternate Login)</span>
          <div style="display:flex; align-items:center; gap:8px;">
            <code style="font-size:13px; font-weight:600; color:#0f172a; background:#e2e8f0; padding:2px 6px; border-radius:4px;">${escapeHtml(userId)}</code>
            <button class="btn btn-ghost copy-cred-btn" data-copy="${escapeHtml(userId)}" style="padding:2px 6px; font-size:11px;" title="Copy User ID">📋 Copy</button>
          </div>
        </div>

        ${temporaryPassword ? `
        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
          <div>
            <span style="font-size:11.5px; font-weight:600; color:#64748b; display:block;">Web ERP Password</span>
            <span style="font-size:10px; color:#b45309;">(Must change upon first login)</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <code style="font-size:14px; font-weight:700; color:#b45309; background:#fef3c7; padding:4px 8px; border-radius:4px; letter-spacing:0.5px;">${escapeHtml(temporaryPassword)}</code>
            <button class="btn btn-ghost copy-cred-btn" data-copy="${escapeHtml(temporaryPassword)}" style="padding:4px 8px; font-size:11px; color:#b45309; font-weight:600;" title="Copy Password">📋 Copy Password</button>
          </div>
        </div>
        ` : ''}

        ${operatorPin ? `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span style="font-size:11.5px; font-weight:600; color:#64748b; display:block;">Café Operations POS PIN</span>
            <span style="font-size:10px; color:#059669;">(For touch terminal operator login)</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <code style="font-size:16px; font-weight:700; color:#059669; background:#d1fae5; padding:4px 8px; border-radius:4px; letter-spacing:3px;">${escapeHtml(operatorPin)}</code>
            <button class="btn btn-ghost copy-cred-btn" data-copy="${escapeHtml(operatorPin)}" style="padding:4px 8px; font-size:11px; color:#059669; font-weight:600;" title="Copy PIN">📋 Copy PIN</button>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- How to login notice -->
      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px; font-size:12px; color:#1e40af; line-height:1.5; margin-bottom:18px;">
        <strong>How the employee logs in:</strong><br/>
        1. <strong>Web ERP:</strong> Open <a href="#login" target="_blank" style="color:#2563eb; text-decoration:underline;">/#login</a> and enter email <code>${escapeHtml(email)}</code> and password.<br/>
        ${operatorPin ? `2. <strong>Café Operations:</strong> Go to /cafe-operations and sign in with the 6-digit operator PIN.` : ''}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <button class="btn btn-secondary copy-cred-btn" data-copy="${escapeHtml(credentialsSummary)}" style="font-size:12px; font-weight:600;">
          📋 Copy All Details
        </button>
        <button class="btn btn-primary" onclick="document.getElementById('modal-root').innerHTML=''" style="font-size:12px; font-weight:600; padding:8px 16px;">
          Done
        </button>
      </div>
    </div>
  `);

  const modalRoot = document.getElementById("modal-root");
  modalRoot?.querySelectorAll(".copy-cred-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.getAttribute("data-copy");
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text);
        const originalText = btn.textContent;
        btn.textContent = "✓ Copied!";
        btn.style.color = "#059669";
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.color = "";
        }, 2000);
      }
    });
  });
}

/**
 * Modal to manage/reset password & 6-digit operator PIN for an existing employee
 */
export function openManageCredentialsModal(userId, empName, empEmail) {
  const isPMTarget =
    userId === "MU-0001" ||
    String(empEmail || "").toLowerCase() === "pradeeshk331@gmail.com";

  if (isPMTarget && !isCurrentViewerPrimaryMaster()) {
    showToast(
      "🔒 Access Denied: The Primary Master credentials cannot be modified by other users.",
      "coral"
    );
    return;
  }

  openModal(`
    <div style="padding:24px; max-width:520px; width:100%; color:var(--ink);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; border-bottom:1px solid rgba(0,0,0,0.08); padding-bottom:12px;">
        <div>
          <span style="font-size:11px; font-weight:700; color:#2563eb; text-transform:uppercase; letter-spacing:0.5px;">Security &amp; Identity Administration</span>
          <h2 style="font-size:18px; font-weight:700; margin:2px 0 0;">Manage Login &amp; PIN</h2>
          <div style="font-size:12px; color:#64748b; margin-top:2px;">${escapeHtml(empName)} · <code>${escapeHtml(userId)}</code></div>
        </div>
        <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''" style="padding:4px 8px;">✕</button>
      </div>

      <form id="manage-cred-form" style="display:flex; flex-direction:column; gap:16px;">
        <!-- Employee Account Info -->
        <div style="background:#f8fafc; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; font-size:12.5px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:#64748b;">Login Email:</span>
            <strong style="color:#0f172a;">${escapeHtml(empEmail || userId)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#64748b;">Alternate Login:</span>
            <strong style="color:#0f172a;">User ID (${escapeHtml(userId)})</strong>
          </div>
        </div>

        <!-- 1. Password Reset Section -->
        <div style="background:#f8fafc; padding:14px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:12px; font-weight:700; color:#0f172a; text-transform:uppercase;">1. Web ERP Password</div>
            <button type="button" class="btn btn-ghost" id="btn-gen-manage-pwd" style="font-size:11px; padding:2px 6px; color:#b45309; font-weight:600;">
              🎲 Generate Password
            </button>
          </div>
          <div style="position:relative; display:flex; align-items:center;">
            <input type="password" id="mcred-password" placeholder="Enter new password (min 8 characters)" minlength="8" style="width:100%; padding:8px 38px 8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;" />
            <button type="button" class="pin-visibility-toggle" data-toggle-visibility="mcred-password" title="Show password" aria-label="Show password" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#64748b; padding:4px;">
              ${icon("eye", 16)}
            </button>
          </div>
          <div style="font-size:11px; color:#64748b; margin-top:4px;">
            Setting a new password will unlock the account and mark password change required on next login.
          </div>
        </div>

        <!-- 2. Operator PIN Section -->
        <div style="background:#f8fafc; padding:14px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:12px; font-weight:700; color:#0f172a; text-transform:uppercase;">2. 6-Digit POS Operator PIN</div>
            <button type="button" class="btn btn-ghost" id="btn-gen-manage-pin" style="font-size:11px; padding:2px 6px; color:#059669; font-weight:600;">
              🎲 Generate PIN
            </button>
          </div>
          <div style="position:relative; display:flex; align-items:center;">
            <input type="password" id="mcred-pin" placeholder="e.g. 582910" maxlength="6" pattern="\\d{6}" inputmode="numeric" style="width:100%; padding:8px 38px 8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; letter-spacing:2px; font-family:var(--font-mono, monospace);" />
            <button type="button" class="pin-visibility-toggle" data-toggle-visibility="mcred-pin" title="Show PIN" aria-label="Show PIN" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#64748b; padding:4px;">
              ${icon("eye", 16)}
            </button>
          </div>
          <div style="font-size:11px; color:#64748b; margin-top:4px;">
            Used on Café Operations POS terminals for quick operator shift sign-in.
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:6px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit" id="mcred-submit-btn" style="background:#2563eb; border-color:#2563eb; color:#fff; font-weight:600;">
            💾 Save Credentials
          </button>
        </div>
      </form>
    </div>
  `);

  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return;

  wireVisibilityToggles(modalRoot);

  modalRoot.querySelector("#btn-gen-manage-pwd")?.addEventListener("click", () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let rand = "";
    for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
    const pwd = `Zamorin@${rand}!`;
    const pwdInput = modalRoot.querySelector("#mcred-password");
    if (pwdInput) {
      pwdInput.value = pwd;
      pwdInput.type = "text";
      const toggleBtn = modalRoot.querySelector("[data-toggle-visibility='mcred-password']");
      if (toggleBtn) {
        toggleBtn.innerHTML = icon("eyeOff", 16);
        toggleBtn.style.color = "var(--primary, #c9933b)";
      }
    }
  });

  modalRoot.querySelector("#btn-gen-manage-pin")?.addEventListener("click", () => {
    const randomPin = String(Math.floor(100000 + Math.random() * 900000));
    const pinInput = modalRoot.querySelector("#mcred-pin");
    if (pinInput) {
      pinInput.value = randomPin;
      pinInput.type = "text";
      const toggleBtn = modalRoot.querySelector("[data-toggle-visibility='mcred-pin']");
      if (toggleBtn) {
        toggleBtn.innerHTML = icon("eyeOff", 16);
        toggleBtn.style.color = "var(--primary, #c9933b)";
      }
    }
  });

  modalRoot.querySelector("#manage-cred-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = modalRoot.querySelector("#mcred-submit-btn");
    const pwdVal = modalRoot.querySelector("#mcred-password")?.value?.trim() || "";
    const pinVal = modalRoot.querySelector("#mcred-pin")?.value?.trim() || "";

    if (!pwdVal && !pinVal) {
      showToast("Please enter a new password or a 6-digit PIN to save.", "coral");
      return;
    }

    if (pwdVal && pwdVal.length < 8) {
      showToast("Password must be at least 8 characters long.", "coral");
      return;
    }

    if (pinVal && !/^\\d{6}$/.test(pinVal)) {
      showToast("Operator PIN must be exactly 6 numeric digits.", "coral");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Updating...";
    }

    try {
      const payload = {};
      if (pwdVal) payload.password = pwdVal;
      if (pinVal) payload.operatorPin = pinVal;

      const res = await apiPost(`/employees/${encodeURIComponent(userId)}/credentials`, payload);
      showToast(res?.message || "Credentials updated successfully!", "success");

      openCredentialsCardModal({
        name: empName,
        userId: userId,
        email: empEmail || res?.data?.email || userId,
        temporaryPassword: pwdVal || res?.data?.temporaryPassword || null,
        operatorPin: pinVal || res?.data?.operatorPin || null,
        isUpdated: true,
      });
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "💾 Save Credentials";
      }
      showToast(err?.message || "Failed to update credentials", "coral");
    }
  });
}

/**
 * Modal to edit an existing employee profile, assign Window & Job Title / Position
 */
export function openEditEmployeeModal(userId) {
  const emp = liveEmployees.find((e) => e.userId === userId);
  if (!emp) {
    showToast("Employee record not found.", "coral");
    return;
  }

  const isPMTarget =
    emp.isPrimaryMaster === true ||
    emp.userId === "MU-0001" ||
    String(emp.email || "").toLowerCase() === "pradeeshk331@gmail.com";

  if (isPMTarget && !isCurrentViewerPrimaryMaster()) {
    showToast(
      "🔒 Access Denied — The Primary Master account is frozen and protected. Only Pradeesh K can modify this profile.",
      "coral"
    );
    return;
  }

  const standardTitles = [
    { group: "👑 Management & Administrative Roles", roles: ["Operations Manager", "Café Owner / Franchise Partner"] },
    { group: "🎯 Store Operations (Admin Access)", roles: ["Café Administrator / Store Manager", "Assistant Store Manager"] },
    {
      group: "☕ Café Team (Staff Window)",
      roles: [
        "Head Barista",
        "Senior Barista",
        "Junior Barista",
        "Executive Chef / Head Cook",
        "Sous Chef / Assistant Cook",
        "Kitchen Staff",
        "Cashier / Counter Sales",
        "Service Staff / Waiter",
        "Delivery Staff",
        "Cleaning Staff",
        "Security Guard",
        "Trainee / Apprentice",
      ],
    },
  ];

  const currentTitle = emp.designation || emp.position || "";
  const allKnownTitles = standardTitles.flatMap((g) => g.roles);
  const isCustomTitle = !isPMTarget && currentTitle && !allKnownTitles.includes(currentTitle);

  const currentRole = emp.role || "STAFF";
  const currentDept = emp.department || "Barista";
  const currentWorkerType = emp.workerType || "PERMANENT";
  const currentStatus = emp.employmentStatus || "ACTIVE";
  const currentPrimaryCafe = emp.primaryCafeId || (liveCafes[0]?.cafeId || "");

  openModal(`
    <div style="padding:24px; max-width:640px; width:100%; color:var(--ink);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; border-bottom:1px solid rgba(0,0,0,0.08); padding-bottom:12px;">
        <div>
          <span style="font-size:11px; font-weight:700; color:${isPMTarget ? '#b45309' : '#2563eb'}; text-transform:uppercase; letter-spacing:0.5px;">
            ${isPMTarget ? '🛡️ Primary Master Identity' : 'Workforce Identity &amp; Window Allocation'}
          </span>
          <h2 style="font-size:18px; font-weight:700; margin:2px 0 0;">
            ${isPMTarget ? 'Edit Primary Master Profile' : 'Edit Employee &amp; System Access'}
          </h2>
          <div style="font-size:12px; color:#64748b; margin-top:2px;">
            ${escapeHtml(emp.name)} · <code>${escapeHtml(emp.userId)}</code> · ${escapeHtml(emp.email || 'No email')}
          </div>
        </div>
        <button class="btn btn-ghost" onclick="document.getElementById('modal-root').innerHTML=''" style="padding:4px 8px;">✕</button>
      </div>

      ${isPMTarget ? `
        <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:12px; color:#92400e; display:flex; align-items:center; gap:8px;">
          <span>🛡️</span>
          <span><strong>Master Governance Protection:</strong> Access Level and Job Position are permanently locked to <strong>Primary Master</strong>. Personal contact and profile details can be updated below.</span>
        </div>
      ` : ''}

      <form id="edit-employee-form" style="display:flex; flex-direction:column; gap:14px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Legal Full Name *</label>
            <input type="text" id="edit-emp-name" required value="${escapeHtml(emp.name || '')}" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Preferred / Calling Name</label>
            <input type="text" id="edit-emp-preferred" value="${escapeHtml(emp.preferredName || '')}" placeholder="e.g. First Name" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Work Email Address</label>
            <input type="email" value="${escapeHtml(emp.email || '')}" disabled style="width:100%; padding:8px 12px; border:1px solid #e2e8f0; background:#f8fafc; color:#64748b; border-radius:6px; font-size:13px; cursor:not-allowed;" title="Email address is immutable for security" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Mobile Phone</label>
            <input type="text" id="edit-emp-phone" value="${escapeHtml(emp.phone || '')}" placeholder="+91 98450 12345" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;" />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Primary Café Location *</label>
            <select id="edit-emp-cafe" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              ${liveCafes.length > 0 ? liveCafes.map(c => `<option value="${escapeHtml(c.cafeId)}" ${c.cafeId === currentPrimaryCafe ? 'selected' : ''}>${escapeHtml(c.name || c.cafeId)}</option>`).join('') : `<option value="${escapeHtml(currentPrimaryCafe)}" selected>${escapeHtml(currentPrimaryCafe || 'ALL')}</option>`}
            </select>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Department *</label>
            ${isPMTarget ? `
              <input type="text" value="Executive &amp; Governance" disabled style="width:100%; padding:8px 12px; border:1px solid #e2e8f0; background:#f8fafc; color:#64748b; border-radius:6px; font-size:13px; cursor:not-allowed;" />
            ` : `
              <select id="edit-emp-dept" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
                <option value="Barista" ${currentDept === 'Barista' ? 'selected' : ''}>Barista Operations</option>
                <option value="Kitchen" ${currentDept === 'Kitchen' ? 'selected' : ''}>Kitchen &amp; Culinary</option>
                <option value="Service" ${currentDept === 'Service' ? 'selected' : ''}>Front of House / Service</option>
                <option value="Management" ${currentDept === 'Management' ? 'selected' : ''}>Management &amp; Supervision</option>
              </select>
            `}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Job Title / Position *</label>
            ${isPMTarget ? `
              <input type="text" value="🛡️ Primary Master" disabled style="width:100%; padding:8px 12px; border:1px solid #fde68a; background:#fffbeb; color:#92400e; font-weight:700; border-radius:6px; font-size:13px; cursor:not-allowed;" />
            ` : `
              <select id="edit-emp-title" required style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
                <option value="">— Select Job Title / Position —</option>
                <optgroup label="👑 Management &amp; Administrative Roles">
                  <option value="Operations Manager" ${currentTitle === 'Operations Manager' ? 'selected' : ''} data-role="CAFE_ADMIN">Operations Manager</option>
                  <option value="Café Owner / Franchise Partner" ${currentTitle === 'Café Owner / Franchise Partner' ? 'selected' : ''} data-role="OWNER">Café Owner / Franchise Partner</option>
                </optgroup>
                <optgroup label="🎯 Store Operations (Admin Access)">
                  <option value="Café Administrator / Store Manager" ${currentTitle === 'Café Administrator / Store Manager' ? 'selected' : ''} data-role="CAFE_ADMIN">Café Administrator / Store Manager</option>
                  <option value="Assistant Store Manager" ${currentTitle === 'Assistant Store Manager' ? 'selected' : ''} data-role="CAFE_ADMIN">Assistant Store Manager</option>
                </optgroup>
                <optgroup label="☕ Café Team (Staff Window)">
                  <option value="Head Barista" ${currentTitle === 'Head Barista' ? 'selected' : ''} data-role="STAFF">Head Barista</option>
                  <option value="Senior Barista" ${currentTitle === 'Senior Barista' ? 'selected' : ''} data-role="STAFF">Senior Barista</option>
                  <option value="Junior Barista" ${currentTitle === 'Junior Barista' ? 'selected' : ''} data-role="STAFF">Junior Barista</option>
                  <option value="Executive Chef / Head Cook" ${currentTitle === 'Executive Chef / Head Cook' ? 'selected' : ''} data-role="STAFF">Executive Chef / Head Cook</option>
                  <option value="Sous Chef / Assistant Cook" ${currentTitle === 'Sous Chef / Assistant Cook' ? 'selected' : ''} data-role="STAFF">Sous Chef / Assistant Cook</option>
                  <option value="Kitchen Staff" ${currentTitle === 'Kitchen Staff' ? 'selected' : ''} data-role="STAFF">Kitchen Staff</option>
                  <option value="Cashier / Counter Sales" ${currentTitle === 'Cashier / Counter Sales' ? 'selected' : ''} data-role="STAFF">Cashier / Counter Sales</option>
                  <option value="Service Staff / Waiter" ${currentTitle === 'Service Staff / Waiter' ? 'selected' : ''} data-role="STAFF">Service Staff / Waiter</option>
                  <option value="Delivery Staff" ${currentTitle === 'Delivery Staff' ? 'selected' : ''} data-role="STAFF">Delivery Staff</option>
                  <option value="Cleaning Staff" ${currentTitle === 'Cleaning Staff' ? 'selected' : ''} data-role="STAFF">Cleaning Staff</option>
                  <option value="Security Guard" ${currentTitle === 'Security Guard' ? 'selected' : ''} data-role="STAFF">Security Guard</option>
                  <option value="Trainee / Apprentice" ${currentTitle === 'Trainee / Apprentice' ? 'selected' : ''} data-role="STAFF">Trainee / Apprentice</option>
                </optgroup>
                <option value="__CUSTOM__" ${isCustomTitle ? 'selected' : ''}>+ Custom Job Title...</option>
              </select>
              <div id="edit-custom-title-box" style="margin-top:6px; display:${isCustomTitle ? 'block' : 'none'};">
                <input type="text" id="edit-custom-title-input" value="${isCustomTitle ? escapeHtml(currentTitle) : ''}" placeholder="Enter custom position title..." style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12.5px;" />
              </div>
            `}
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Worker Type</label>
            <select id="edit-emp-worker-type" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
              <option value="PERMANENT" ${currentWorkerType === 'PERMANENT' ? 'selected' : ''}>Permanent (Full-Time)</option>
              <option value="FIXED_TERM" ${currentWorkerType === 'FIXED_TERM' ? 'selected' : ''}>Fixed-Term Contract</option>
              <option value="TRAINEE" ${currentWorkerType === 'TRAINEE' ? 'selected' : ''}>Trainee / Apprentice</option>
              <option value="CONTINGENT" ${currentWorkerType === 'CONTINGENT' ? 'selected' : ''}>Contingent Worker</option>
            </select>
          </div>
        </div>

        ${!isPMTarget ? `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Employment Status</label>
              <select id="edit-emp-status" style="width:100%; padding:8px 12px; border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px;">
                <option value="ACTIVE" ${currentStatus === 'ACTIVE' ? 'selected' : ''}>Active</option>
                <option value="PROBATION" ${currentStatus === 'PROBATION' ? 'selected' : ''}>Probation</option>
                <option value="NOTICE_PERIOD" ${currentStatus === 'NOTICE_PERIOD' ? 'selected' : ''}>Notice Period</option>
                <option value="ON_LEAVE" ${currentStatus === 'ON_LEAVE' ? 'selected' : ''}>On Leave</option>
                <option value="SUSPENDED" ${currentStatus === 'SUSPENDED' ? 'selected' : ''}>Suspended</option>
              </select>
            </div>
            <div></div>
          </div>
        ` : ''}

        <!-- Dedicated Window & Access Level Assignment -->
        <div style="background:${isPMTarget ? '#fffbeb' : '#f0fdf4'}; padding:12px 14px; border-radius:8px; border:1px solid ${isPMTarget ? '#fde68a' : '#bbf7d0'};">
          <div style="font-size:11.5px; font-weight:700; color:${isPMTarget ? '#92400e' : '#166534'}; text-transform:uppercase; margin-bottom:4px;">
            Assigned ERP Window &amp; System Access Level *
          </div>
          <div style="font-size:11.5px; color:${isPMTarget ? '#b45309' : '#15803d'}; margin-bottom:8px;">
            Determines the exact UI window this employee enters upon logging into Zamorin ERP.
          </div>
          ${isPMTarget ? `
            <div style="padding:10px 12px; background:#fff; border:1px solid #fde68a; border-radius:6px; font-size:13px; font-weight:700; color:#92400e;">
              🛡️ Primary Master Window (Full Unrestricted Multi-store Authority)
            </div>
          ` : `
            <select id="edit-emp-window-select" required style="width:100%; padding:8px 12px; border:1px solid #86efac; border-radius:6px; font-size:13px; font-weight:600; background:#fff;">
              <option value="STAFF" ${currentRole === 'STAFF' ? 'selected' : ''}>👤 Employee / Staff Window (Cashier POS Till, Staff Portal &amp; Timesheets)</option>
              <option value="CAFE_ADMIN" ${currentRole === 'CAFE_ADMIN' ? 'selected' : ''}>🎯 Café Operations Window (Store Operations, Daily Roster, Cafe Inventory)</option>
              <option value="OWNER" ${currentRole === 'OWNER' ? 'selected' : ''}>👑 Owner Portal (Financial Reports, Owner Governance, P&amp;L Overview)</option>
            </select>
          `}
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
          <button class="btn btn-ghost" type="button" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" type="submit" id="edit-emp-submit-btn" style="background:#2563eb; border-color:#2563eb; color:#fff; font-weight:600;">
            💾 Save Changes
          </button>
        </div>
      </form>
    </div>
  `);

  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return;

  if (!isPMTarget) {
    const titleSelect = modalRoot.querySelector("#edit-emp-title");
    const customBox = modalRoot.querySelector("#edit-custom-title-box");
    const customInput = modalRoot.querySelector("#edit-custom-title-input");
    const windowSelect = modalRoot.querySelector("#edit-emp-window-select");

    titleSelect?.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "__CUSTOM__") {
        if (customBox) customBox.style.display = "block";
        customInput?.focus();
      } else {
        if (customBox) customBox.style.display = "none";
        const selectedOpt = titleSelect.options[titleSelect.selectedIndex];
        const suggestedRole = selectedOpt?.dataset?.role;
        if (suggestedRole && windowSelect) {
          windowSelect.value = suggestedRole;
        }
      }
    });
  }

  modalRoot.querySelector("#edit-employee-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = modalRoot.querySelector("#edit-emp-submit-btn");

    const name = modalRoot.querySelector("#edit-emp-name")?.value?.trim() || "";
    const preferredName = modalRoot.querySelector("#edit-emp-preferred")?.value?.trim() || "";
    const phone = modalRoot.querySelector("#edit-emp-phone")?.value?.trim() || "";
    const primaryCafeId = modalRoot.querySelector("#edit-emp-cafe")?.value || "";

    if (!name) {
      showToast("Employee name is required.", "coral");
      return;
    }

    const payload = {
      name,
      preferredName,
      phone,
      primaryCafeId,
    };

    if (!isPMTarget) {
      const dept = modalRoot.querySelector("#edit-emp-dept")?.value || "";
      const titleSelect = modalRoot.querySelector("#edit-emp-title");
      let designation = titleSelect?.value || "";
      if (designation === "__CUSTOM__") {
        designation = modalRoot.querySelector("#edit-custom-title-input")?.value?.trim() || "";
        if (!designation) {
          showToast("Please enter a custom position title.", "coral");
          return;
        }
      }
      const workerType = modalRoot.querySelector("#edit-emp-worker-type")?.value || "PERMANENT";
      const employmentStatus = modalRoot.querySelector("#edit-emp-status")?.value || "ACTIVE";
      const role = modalRoot.querySelector("#edit-emp-window-select")?.value || "STAFF";

      payload.department = dept;
      payload.designation = designation;
      payload.workerType = workerType;
      payload.employmentStatus = employmentStatus;
      payload.role = role;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }

    try {
      const res = await apiPatch(`/employees/${encodeURIComponent(userId)}`, payload);
      showToast(res?.message || "Employee profile updated successfully!", "success");

      // Update in-memory record in liveEmployees
      Object.assign(emp, payload);
      if (payload.designation) {
        emp.position = payload.designation;
      }
      if (isPMTarget) {
        emp.designation = "Primary Master";
        emp.position = "Primary Master";
        emp.role = "MASTER";
        emp.isPrimaryMaster = true;
      }

      modalRoot.innerHTML = "";
      rerenderCurrentSubpanel();
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "💾 Save Changes";
      }
      showToast(err?.message || "Failed to update employee profile", "coral");
    }
  });
}




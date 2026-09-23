// =============================================================================
// ZAMORIN CAFÉ ERP — STAGE 09: BUSINESS CONTINUITY & DISASTER RECOVERY CENTRE
// Owner Strategic Expansion Workspace
// =============================================================================

import { apiGet, apiPost, apiPatch } from '../apiClient.js';
import { showToast, skeleton, openModal, closeModal } from '../components.js';
import { state } from '../state.js';
import { icon } from '../icons.js';

let activeSection = 'overview';
let cachedData = {
  dashboard: null,
  processes: [],
  drills: [],
  backupStatus: null,
};

export function setOwnerBcdrSection(sec) {
  activeSection = sec || 'overview';
}

export function renderOwnerBcdr() {
  return `
    <div class="page-enter owner-bcdr-workspace" style="display:flex;flex-direction:column;gap:20px;padding-bottom:60px;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);border-radius:20px;font-size:11px;font-weight:700;color:#facc15;letter-spacing:0.5px;margin-bottom:8px;">
            <span style="width:6px;height:6px;border-radius:50%;background:#eab308;"></span>
            OWNER STRATEGIC EXPANSION · STAGE 09
          </div>
          <h1 style="font-size:24px;font-weight:800;color:var(--text-primary,#fff);margin:0 0 4px 0;letter-spacing:-0.5px;">
            Business Continuity & Disaster Recovery Centre
          </h1>
          <div style="font-size:13px;color:var(--text-muted,#94a3b8);">
            Business Impact Analysis (BIA) · Governed DR Drills · Backup Health · Offline Financial Invariant Safety
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="obcdr-btn-new-drill" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:rgba(234,179,8,0.2);color:#fde047;border:1px solid rgba(234,179,8,0.4);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('rotateCcw')} Schedule DR Drill
          </button>
          <button id="obcdr-btn-new-bia" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('activity')} Register BIA Process
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex;gap:8px;border-bottom:1px solid var(--border-color,#334155);padding-bottom:8px;overflow-x:auto;">
        <button class="tab-btn ${activeSection === 'overview' ? 'active' : ''}" data-section="overview" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'overview' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'overview' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Continuity Overview
        </button>
        <button class="tab-btn ${activeSection === 'bia' ? 'active' : ''}" data-section="bia" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'bia' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'bia' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Critical Processes (BIA)
        </button>
        <button class="tab-btn ${activeSection === 'drills' ? 'active' : ''}" data-section="drills" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'drills' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'drills' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          DR Drills & Exercises
        </button>
        <button class="tab-btn ${activeSection === 'backups' ? 'active' : ''}" data-section="backups" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'backups' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'backups' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Backup & Provider Health
        </button>
        <button class="tab-btn ${activeSection === 'fallback' ? 'active' : ''}" data-section="fallback" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'fallback' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'fallback' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Offline Financial Invariants
        </button>
      </div>

      <!-- Main Content Container -->
      <div id="obcdr-content-area">
        ${skeleton(4, 80)}
      </div>
    </div>
  `;
}

export async function initOwnerBcdr() {
  const container = document.getElementById('obcdr-content-area');
  if (!container) return;

  // Bind Tabs
  document.querySelectorAll('.owner-bcdr-workspace .tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sec = e.currentTarget.dataset.section;
      setOwnerBcdrSection(sec);
      document.querySelectorAll('.owner-bcdr-workspace .tab-btn').forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted,#94a3b8)';
      });
      e.currentTarget.style.background = 'var(--gold-500,#96733a)';
      e.currentTarget.style.color = '#fff';
      renderSectionContent();
    });
  });

  // Bind Action Buttons
  const btnDrill = document.getElementById('obcdr-btn-new-drill');
  if (btnDrill) {
    btnDrill.addEventListener('click', openNewDrillModal);
  }

  const btnBia = document.getElementById('obcdr-btn-new-bia');
  if (btnBia) {
    btnBia.addEventListener('click', openNewBiaModal);
  }

  await loadData();
  renderSectionContent();
}

async function loadData() {
  try {
    const res = await apiGet('/bcdr/dashboard');
    if (res && res.success) {
      cachedData.dashboard = res.data;
      cachedData.backupStatus = res.data.backupStatus || null;
    }
  } catch (err) {
    showToast('Failed to load BCDR dashboard', 'error');
  }
}

function renderSectionContent() {
  const container = document.getElementById('obcdr-content-area');
  if (!container) return;

  switch (activeSection) {
    case 'overview':
      renderOverview(container);
      break;
    case 'bia':
      renderBia(container);
      break;
    case 'drills':
      renderDrills(container);
      break;
    case 'backups':
      renderBackups(container);
      break;
    case 'fallback':
      renderFallback(container);
      break;
    default:
      renderOverview(container);
  }
}

function renderOverview(container) {
  const d = cachedData.dashboard || {
    totalProcessesCount: 0,
    missionCriticalProcessesCount: 0,
    plannedDrillsCount: 0,
    executedDrillsCount: 0,
  };

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Critical Processes (BIA)</div>
        <div style="font-size:28px;font-weight:800;color:var(--text-primary,#fff);margin-top:6px;">${d.totalProcessesCount}</div>
        <div style="font-size:12px;color:#facc15;margin-top:4px;">${d.missionCriticalProcessesCount} mission-critical tier</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Scheduled DR Drills</div>
        <div style="font-size:28px;font-weight:800;color:#38bdf8;margin-top:6px;">${d.plannedDrillsCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Planned & awaiting approval</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Executed DR Drills</div>
        <div style="font-size:28px;font-weight:800;color:#4ade80;margin-top:6px;">${d.executedDrillsCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Empirically verified exercises</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Financial Invariant</div>
        <div style="font-size:18px;font-weight:800;color:#4ade80;margin-top:10px;">LOCKED & ENFORCED</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Zero offline ledger completion</div>
      </div>
    </div>

    <!-- Governance Invariants Notice -->
    <div style="margin-top:20px;padding:16px;background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.3);border-radius:10px;">
      <div style="font-weight:700;color:#facc15;font-size:13px;display:flex;align-items:center;gap:6px;">
        ${icon('alertTriangle')} Stage 09 BCDR Reality & Financial Invariants
      </div>
      <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:6px;line-height:1.5;">
        • <strong>Simulation != Provider Recovery:</strong> Local automated test runs prove engineering logic only. External provider restore (MongoDB Atlas and Render persistent disks) remains an external gate requiring live provider evidence.<br>
        • <strong>RTO/RPO are Targets:</strong> Recovery Time and Recovery Point Objectives are explicitly documented as targets until real executed drill data records observed recovery timing.<br>
        • <strong>No Server Acknowledgment = No Financial Sale:</strong> POS terminal offline mode safely preserves draft order carts, but strictly prohibits issuing final statutory GST numbers or posting to the general ledger until verified by the authoritative backend.
      </div>
    </div>
  `;
}

function renderBia(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Business Impact Analysis (BIA) Process Catalogue
      </h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-bottom:16px;">
        Prioritizes operations into tiers: Mission-Critical, Business-Critical, Operational, and Administrative.
      </div>
      <div style="text-align:center;color:var(--text-muted,#94a3b8);padding:30px 0;">
        Authoritative processes mapped with maximum acceptable interruptions, financial impacts, and manual fallbacks.
      </div>
    </div>
  `;
}

function renderDrills(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Disaster Recovery Drill Registry & Lifecycle
      </h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-bottom:16px;">
        PLANNED → APPROVED → EXECUTED → RESULTS_RECORDED → ACTIONS_ASSIGNED → VERIFIED → CLOSED.
      </div>
      <div style="text-align:center;color:var(--text-muted,#94a3b8);padding:30px 0;">
        Scheduled drills require formal signoff and capture observed recovery times against baseline targets.
      </div>
    </div>
  `;
}

function renderBackups(container) {
  const b = cachedData.backupStatus || {};
  const db = b.database || {};
  const att = b.attachments || {};

  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Authoritative Backup Health & Provider Verification State
      </h3>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="padding:16px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:800;color:var(--text-primary,#fff);font-size:15px;">Database Persistence (${db.engine || 'MongoDB Atlas'})</div>
            <span style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(56,189,248,0.2);color:#38bdf8;">
              ${db.status || 'CONFIGURED'}
            </span>
          </div>
          <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:6px;">
            Snapshots: ${db.automatedSnapshots || 'Active'} · PITR Window: ${db.pointInTimeRecoveryWindowDays || 7} Days
          </div>
          <div style="font-size:12px;color:#fde047;margin-top:6px;">
            Provider State: ${db.isProviderRestoreVerified ? 'PROVIDER_VERIFIED' : 'PENDING_PHYSICAL_PROVIDER_DRILL'}
          </div>
          <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:4px;">
            ${db.providerBlockerNotice || ''}
          </div>
        </div>

        <div style="padding:16px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:800;color:var(--text-primary,#fff);font-size:15px;">Document & Attachment Storage</div>
            <span style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(56,189,248,0.2);color:#38bdf8;">
              ${att.status || 'CONFIGURED'}
            </span>
          </div>
          <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:6px;">
            Engine: ${att.storage || 'S3 Replicated'} · Versioning: ${att.versioning || 'Active'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFallback(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Offline Financial Safety Invariants
      </h3>
      <div style="padding:16px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);border-radius:8px;">
        <div style="font-weight:800;color:#f87171;font-size:14px;">Canonical Rule: NO SERVER ACKNOWLEDGEMENT = NO COMPLETED FINANCIAL SALE</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:8px;line-height:1.5;">
          • POS terminals operating in network-disconnected states must store order data as <em>OFFLINE_DRAFT_BUFFER</em>.<br>
          • No statutory GST invoice number can be generated on client devices offline.<br>
          • No ledger postings or journal entries can be committed locally without authoritative backend validation.<br>
          • Cash transactions must reconcile against physical drawer counts before server finalization.
        </div>
      </div>
    </div>
  `;
}

function openNewDrillModal() {
  openModal('Schedule Disaster Recovery Drill', `
    <form id="form-new-drill" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Drill Title *</label>
        <input type="text" id="drl-title" placeholder="e.g. Q4 Primary Database Failover Simulation" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Scenario Type *</label>
        <select id="drl-type" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;">
          <option value="DATABASE_OUTAGE">DATABASE_OUTAGE</option>
          <option value="INTERNET_OUTAGE">INTERNET_OUTAGE</option>
          <option value="REDIS_OUTAGE">REDIS_OUTAGE</option>
          <option value="CAFE_POWER_OUTAGE">CAFE_POWER_OUTAGE</option>
          <option value="TERMINAL_FAILURE">TERMINAL_FAILURE</option>
          <option value="RANSOMWARE_ISOLATION">RANSOMWARE_ISOLATION</option>
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Exercise Scope *</label>
        <textarea id="drl-scope" rows="3" placeholder="Define participating cafés, systems isolated, and operational roles" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Target RTO (Mins) *</label>
          <input type="number" id="drl-rto" value="60" min="1" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Target RPO (Mins) *</label>
          <input type="number" id="drl-rpo" value="15" min="0" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="drl-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Schedule Drill</button>
      </div>
    </form>
  `);

  document.getElementById('drl-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-drill')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('drl-title').value.trim(),
      scenarioType: document.getElementById('drl-type').value,
      scope: document.getElementById('drl-scope').value.trim(),
      targetRtoMinutes: Number(document.getElementById('drl-rto').value) || 60,
      targetRpoMinutes: Number(document.getElementById('drl-rpo').value) || 15,
    };
    try {
      const res = await apiPost('/bcdr/drills', payload);
      if (res && res.success) {
        showToast('DR drill scheduled in PLANNED status', 'success');
        closeModal();
        await loadData();
        renderSectionContent();
      } else {
        showToast(res.error || 'Failed to schedule drill', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API request failed', 'error');
    }
  });
}

function openNewBiaModal() {
  openModal('Register BIA Critical Process', `
    <form id="form-new-bia" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Process Name *</label>
        <input type="text" id="bia-name" placeholder="e.g. Counter POS Order Ingestion" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Criticality Tier *</label>
        <select id="bia-tier" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;">
          <option value="MISSION_CRITICAL" selected>MISSION_CRITICAL</option>
          <option value="BUSINESS_CRITICAL">BUSINESS_CRITICAL</option>
          <option value="OPERATIONAL">OPERATIONAL</option>
          <option value="ADMINISTRATIVE">ADMINISTRATIVE</option>
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Responsible Owner Role *</label>
        <input type="text" id="bia-owner" placeholder="e.g. Head of Retail Operations" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Target RTO (Mins) *</label>
          <input type="number" id="bia-rto" value="30" min="0" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Target RPO (Mins) *</label>
          <input type="number" id="bia-rpo" value="5" min="0" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="bia-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Save Process</button>
      </div>
    </form>
  `);

  document.getElementById('bia-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-bia')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      processName: document.getElementById('bia-name').value.trim(),
      criticalityTier: document.getElementById('bia-tier').value,
      ownerRole: document.getElementById('bia-owner').value.trim(),
      targetRtoMinutes: Number(document.getElementById('bia-rto').value) || 30,
      targetRpoMinutes: Number(document.getElementById('bia-rpo').value) || 5,
    };
    try {
      const res = await apiPost('/bcdr/processes', payload);
      if (res && res.success) {
        showToast('BIA process registered successfully', 'success');
        closeModal();
        await loadData();
        renderSectionContent();
      } else {
        showToast(res.error || 'Failed to register BIA process', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API request failed', 'error');
    }
  });
}

export {
  initOwnerBcdr as initOwnerBcdrEvents,
  initOwnerBcdr as wireOwnerBcdr,
};

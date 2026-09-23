// =============================================================================
// ZAMORIN CAFÉ ERP — STAGE 07: ASSET RELIABILITY & PREVENTIVE MAINTENANCE CENTRE
// Owner Strategic Expansion Workspace
// =============================================================================

import { apiGet, apiPost, apiPatch } from '../apiClient.js';
import { showToast, skeleton, openModal, closeModal } from '../components.js';
import { state } from '../state.js';
import { icon } from '../icons.js';

let activeSection = 'overview';
let cachedData = {
  dashboard: null,
  breakdowns: [],
  workOrders: [],
  calibrations: [],
};

export function setOwnerAssetReliabilitySection(sec) {
  activeSection = sec || 'overview';
}

export function renderOwnerAssetReliability() {
  return `
    <div class="page-enter owner-asset-reliability-workspace" style="display:flex;flex-direction:column;gap:20px;padding-bottom:60px;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(14,165,233,0.12);border:1px solid rgba(14,165,233,0.3);border-radius:20px;font-size:11px;font-weight:700;color:#38bdf8;letter-spacing:0.5px;margin-bottom:8px;">
            <span style="width:6px;height:6px;border-radius:50%;background:#0ea5e9;"></span>
            OWNER STRATEGIC EXPANSION · STAGE 07
          </div>
          <h1 style="font-size:24px;font-weight:800;color:var(--text-primary,#fff);margin:0 0 4px 0;letter-spacing:-0.5px;">
            Asset Reliability & Preventive Maintenance Centre
          </h1>
          <div style="font-size:13px;color:var(--text-muted,#94a3b8);">
            Equipment Work Orders · Breakdown Triage · Food-Safety Isolation · MTBF/MTTR Calculations · CAPEX Linkage
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="oar-btn-new-breakdown" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.4);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('alertTriangle')} Log Breakdown
          </button>
          <button id="oar-btn-new-wo" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('tools')} Create Work Order
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex;gap:8px;border-bottom:1px solid var(--border-color,#334155);padding-bottom:8px;overflow-x:auto;">
        <button class="tab-btn ${activeSection === 'overview' ? 'active' : ''}" data-section="overview" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'overview' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'overview' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Reliability Overview
        </button>
        <button class="tab-btn ${activeSection === 'breakdowns' ? 'active' : ''}" data-section="breakdowns" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'breakdowns' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'breakdowns' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Breakdowns & Triage
        </button>
        <button class="tab-btn ${activeSection === 'workOrders' ? 'active' : ''}" data-section="workOrders" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'workOrders' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'workOrders' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Work Orders & Maintenance
        </button>
        <button class="tab-btn ${activeSection === 'calibrations' ? 'active' : ''}" data-section="calibrations" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'calibrations' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'calibrations' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Calibration Log
        </button>
        <button class="tab-btn ${activeSection === 'replacement' ? 'active' : ''}" data-section="replacement" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'replacement' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'replacement' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Replacement & CAPEX
        </button>
      </div>

      <!-- Main Content Container -->
      <div id="oar-content-area">
        ${skeleton(4, 80)}
      </div>
    </div>
  `;
}

export async function initOwnerAssetReliability() {
  const container = document.getElementById('oar-content-area');
  if (!container) return;

  // Bind Tab switching
  document.querySelectorAll('.owner-asset-reliability-workspace .tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sec = e.currentTarget.dataset.section;
      setOwnerAssetReliabilitySection(sec);
      document.querySelectorAll('.owner-asset-reliability-workspace .tab-btn').forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted,#94a3b8)';
      });
      e.currentTarget.style.background = 'var(--gold-500,#96733a)';
      e.currentTarget.style.color = '#fff';
      renderSectionContent();
    });
  });

  // Bind Header Buttons
  const btnNewBreakdown = document.getElementById('oar-btn-new-breakdown');
  if (btnNewBreakdown) {
    btnNewBreakdown.addEventListener('click', openNewBreakdownModal);
  }

  const btnNewWo = document.getElementById('oar-btn-new-wo');
  if (btnNewWo) {
    btnNewWo.addEventListener('click', openNewWorkOrderModal);
  }

  await loadData();
  renderSectionContent();
}

async function loadData() {
  try {
    const res = await apiGet('/asset-reliability/dashboard');
    if (res && res.success) {
      cachedData.dashboard = res.data;
    }
  } catch (err) {
    showToast('Failed to load asset reliability dashboard', 'error');
  }
}

function renderSectionContent() {
  const container = document.getElementById('oar-content-area');
  if (!container) return;

  switch (activeSection) {
    case 'overview':
      renderOverview(container);
      break;
    case 'breakdowns':
      renderBreakdowns(container);
      break;
    case 'workOrders':
      renderWorkOrders(container);
      break;
    case 'calibrations':
      renderCalibrations(container);
      break;
    case 'replacement':
      renderReplacement(container);
      break;
    default:
      renderOverview(container);
  }
}

function renderOverview(container) {
  const d = cachedData.dashboard || {
    totalAssetsCount: 0,
    criticalAssetsCount: 0,
    activeBreakdownsCount: 0,
    openWorkOrdersCount: 0,
    foodSafetyReviewCandidatesCount: 0,
  };

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Tracked Assets</div>
        <div style="font-size:28px;font-weight:800;color:var(--text-primary,#fff);margin-top:6px;">${d.totalAssetsCount}</div>
        <div style="font-size:12px;color:#38bdf8;margin-top:4px;">${d.criticalAssetsCount} critical priority</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Active Breakdowns</div>
        <div style="font-size:28px;font-weight:800;color:#f87171;margin-top:6px;">${d.activeBreakdownsCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Under active triage & repair</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Open Work Orders</div>
        <div style="font-size:28px;font-weight:800;color:#fbbf24;margin-top:6px;">${d.openWorkOrdersCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Governed maintenance lifecycle</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Food Safety Reviews</div>
        <div style="font-size:28px;font-weight:800;color:#c084fc;margin-top:6px;">${d.foodSafetyReviewCandidatesCount}</div>
        <div style="font-size:12px;color:#c084fc;margin-top:4px;">Stage 01 linked candidates</div>
      </div>
    </div>

    <!-- Governance Invariant Card -->
    <div style="margin-top:20px;padding:16px;background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.3);border-radius:10px;">
      <div style="font-weight:700;color:#38bdf8;font-size:13px;display:flex;align-items:center;gap:6px;">
        ${icon('info')} Stage 07 Reliability & Maintenance Governance Invariants
      </div>
      <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:6px;line-height:1.5;">
        • Authoritative MTBF and MTTR metrics are zero-denominator safe; never displaying NaN or Infinity.<br>
        • Equipment failure does not automatically declare a food-safety violation; it establishes a governed review candidate.<br>
        • Replacement indicators are decision support tools; they never execute automatic disposal and link directly to Stage 03 CAPEX approval workflows.
      </div>
    </div>
  `;
}

function renderBreakdowns(container) {
  const d = cachedData.dashboard || {};
  const list = d.recentBreakdowns || [];

  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Equipment Breakdown & Triage Registry
      </h3>
      ${
        list.length === 0
          ? `<div style="text-align:center;color:var(--text-muted,#94a3b8);padding:30px 0;">No active equipment breakdowns recorded.</div>`
          : `
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${list
              .map(
                (b) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);">
                <div>
                  <div style="font-weight:700;color:var(--text-primary,#fff);font-size:14px;">${b.title}</div>
                  <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">
                    Asset: <strong>${b.assetId}</strong> · Cafe: ${b.cafeId} · Downtime: ${b.downtimeMinutes || 0} mins
                  </div>
                  ${
                    b.foodSafetyRiskIdentified
                      ? `<span style="display:inline-block;margin-top:6px;padding:2px 8px;background:rgba(168,85,247,0.2);color:#c084fc;border-radius:4px;font-size:11px;font-weight:700;">Stage 01 Food Safety Candidate</span>`
                      : ''
                  }
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                  <span style="padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;background:rgba(239,68,68,0.2);color:#fca5a5;">
                    ${b.status}
                  </span>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
      }
    </div>
  `;
}

function renderWorkOrders(container) {
  const d = cachedData.dashboard || {};
  const list = d.recentWorkOrders || [];

  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Maintenance Work Orders (Governed Lifecycle)
      </h3>
      ${
        list.length === 0
          ? `<div style="text-align:center;color:var(--text-muted,#94a3b8);padding:30px 0;">No open maintenance work orders.</div>`
          : `
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${list
              .map(
                (w) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);">
                <div>
                  <div style="font-weight:700;color:var(--text-primary,#fff);font-size:14px;">${w.title} (${w.workOrderId})</div>
                  <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">
                    Asset: <strong>${w.assetId}</strong> · Type: ${w.workType} · Priority: ${w.priority}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                  <span style="padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;background:rgba(251,191,36,0.2);color:#fcd34d;">
                    ${w.status}
                  </span>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
      }
    </div>
  `;
}

function renderCalibrations(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Measuring & Probe Equipment Calibration Registry
      </h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-bottom:16px;">
        Thermometers, weighing scales, and precision instruments require periodic ISO/FSSAI accredited calibration verification.
      </div>
      <div style="text-align:center;color:var(--text-muted,#94a3b8);padding:30px 0;">
        Authoritative calibration logs linked to Asset Master and Stage 01 Hygiene audits.
      </div>
    </div>
  `;
}

function renderReplacement(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Asset Replacement Indicators & Stage 03 CAPEX Linkage
      </h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-bottom:16px;">
        Evaluates cumulative maintenance spend vs original acquisition cost and failure frequency without opaque AI claims.
      </div>
      <div style="padding:16px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);">
        <div style="font-weight:700;color:var(--gold-400,#c9a86a);font-size:13px;">Decision Support Only</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">
          Flagged assets do not trigger automatic disposal. Replacement recommendations seamlessly initiate Stage 03 CAPEX requests requiring dual-level governance approval.
        </div>
      </div>
    </div>
  `;
}

function openNewBreakdownModal() {
  openModal('Log Equipment Breakdown', `
    <form id="form-new-breakdown" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Asset ID *</label>
        <input type="text" id="bd-assetId" placeholder="e.g. AST-001" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Issue Title *</label>
        <input type="text" id="bd-title" placeholder="e.g. Espresso Group Head Pressure Loss" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Failure Description *</label>
        <textarea id="bd-description" rows="3" placeholder="Describe symptoms, temperature fluctuations, or unusual sounds" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;"></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="bd-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Submit Breakdown</button>
      </div>
    </form>
  `);

  document.getElementById('bd-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-breakdown')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      assetId: document.getElementById('bd-assetId').value.trim(),
      title: document.getElementById('bd-title').value.trim(),
      failureDescription: document.getElementById('bd-description').value.trim(),
    };
    try {
      const res = await apiPost('/asset-reliability/breakdowns', payload);
      if (res && res.success) {
        showToast('Equipment breakdown logged successfully', 'success');
        closeModal();
        await loadData();
        renderSectionContent();
      } else {
        showToast(res.error || 'Failed to log breakdown', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API request failed', 'error');
    }
  });
}

function openNewWorkOrderModal() {
  openModal('Create Maintenance Work Order', `
    <form id="form-new-wo" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Asset ID *</label>
        <input type="text" id="wo-assetId" placeholder="e.g. AST-001" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Work Order Title *</label>
        <input type="text" id="wo-title" placeholder="e.g. Quarterly Descaling and Gasket Replacement" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Work Type</label>
        <select id="wo-type" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;">
          <option value="PREVENTIVE_MAINTENANCE">PREVENTIVE_MAINTENANCE</option>
          <option value="CORRECTIVE_REPAIR">CORRECTIVE_REPAIR</option>
          <option value="INSPECTION">INSPECTION</option>
          <option value="CALIBRATION">CALIBRATION</option>
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Description *</label>
        <textarea id="wo-description" rows="3" placeholder="Service instructions, required parts, safety notes" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;"></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="wo-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Create Work Order</button>
      </div>
    </form>
  `);

  document.getElementById('wo-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-wo')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      assetId: document.getElementById('wo-assetId').value.trim(),
      title: document.getElementById('wo-title').value.trim(),
      workType: document.getElementById('wo-type').value,
      description: document.getElementById('wo-description').value.trim(),
    };
    try {
      const res = await apiPost('/asset-reliability/work-orders', payload);
      if (res && res.success) {
        showToast('Work order created successfully', 'success');
        closeModal();
        await loadData();
        renderSectionContent();
      } else {
        showToast(res.error || 'Failed to create work order', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API request failed', 'error');
    }
  });
}

export {
  initOwnerAssetReliability as initOwnerAssetReliabilityEvents,
  initOwnerAssetReliability as wireOwnerAssetReliability,
};

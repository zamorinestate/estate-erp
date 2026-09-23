// =============================================================================
// ZAMORIN CAFÉ ERP — STAGE 08: DATA PRIVACY & CYBERSECURITY GOVERNANCE
// Owner Strategic Expansion Workspace
// =============================================================================

import { apiGet, apiPost, apiPatch } from '../apiClient.js';
import { showToast, skeleton, openModal, closeModal } from '../components.js';
import { state } from '../state.js';
import { icon } from '../icons.js';

let activeSection = 'overview';
let cachedData = {
  dashboard: null,
  dpdpSchedule: [],
  processingRegisters: [],
  processors: [],
  securityControls: [],
};

export function setOwnerPrivacyCyberSection(sec) {
  activeSection = sec || 'overview';
}

export function renderOwnerPrivacyCyber() {
  return `
    <div class="page-enter owner-privacy-cyber-workspace" style="display:flex;flex-direction:column;gap:20px;padding-bottom:60px;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(20,184,166,0.12);border:1px solid rgba(20,184,166,0.3);border-radius:20px;font-size:11px;font-weight:700;color:#2dd4bf;letter-spacing:0.5px;margin-bottom:8px;">
            <span style="width:6px;height:6px;border-radius:50%;background:#14b8a6;"></span>
            OWNER STRATEGIC EXPANSION · STAGE 08
          </div>
          <h1 style="font-size:24px;font-weight:800;color:var(--text-primary,#fff);margin:0 0 4px 0;letter-spacing:-0.5px;">
            Data Privacy & Cybersecurity Governance
          </h1>
          <div style="font-size:13px;color:var(--text-muted,#94a3b8);">
            DPDP Phased Commencement Readiness · NIST CSF 2.0 Governance Taxonomy · Personal Data RoPA · Statutory Retention
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="opc-btn-new-incident" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.4);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('shieldAlert')} Log Privacy Incident
          </button>
          <button id="opc-btn-new-ropa" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('document')} Register Data Process (RoPA)
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex;gap:8px;border-bottom:1px solid var(--border-color,#334155);padding-bottom:8px;overflow-x:auto;">
        <button class="tab-btn ${activeSection === 'overview' ? 'active' : ''}" data-section="overview" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'overview' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'overview' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Governance Overview
        </button>
        <button class="tab-btn ${activeSection === 'dpdp' ? 'active' : ''}" data-section="dpdp" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'dpdp' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'dpdp' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          DPDP Phased Schedule
        </button>
        <button class="tab-btn ${activeSection === 'ropa' ? 'active' : ''}" data-section="ropa" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'ropa' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'ropa' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Personal Data RoPA
        </button>
        <button class="tab-btn ${activeSection === 'processors' ? 'active' : ''}" data-section="processors" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'processors' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'processors' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Third-Party Processors
        </button>
        <button class="tab-btn ${activeSection === 'nist' ? 'active' : ''}" data-section="nist" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'nist' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'nist' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          NIST CSF 2.0 Controls
        </button>
      </div>

      <!-- Main Content Area -->
      <div id="opc-content-area">
        ${skeleton(4, 80)}
      </div>
    </div>
  `;
}

export async function initOwnerPrivacyCyber() {
  const container = document.getElementById('opc-content-area');
  if (!container) return;

  // Bind Tabs
  document.querySelectorAll('.owner-privacy-cyber-workspace .tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sec = e.currentTarget.dataset.section;
      setOwnerPrivacyCyberSection(sec);
      document.querySelectorAll('.owner-privacy-cyber-workspace .tab-btn').forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted,#94a3b8)';
      });
      e.currentTarget.style.background = 'var(--gold-500,#96733a)';
      e.currentTarget.style.color = '#fff';
      renderSectionContent();
    });
  });

  // Bind Action Buttons
  const btnIncident = document.getElementById('opc-btn-new-incident');
  if (btnIncident) {
    btnIncident.addEventListener('click', openNewIncidentModal);
  }

  const btnRopa = document.getElementById('opc-btn-new-ropa');
  if (btnRopa) {
    btnRopa.addEventListener('click', openNewRopaModal);
  }

  await loadData();
  renderSectionContent();
}

async function loadData() {
  try {
    const res = await apiGet('/privacy-cyber/dashboard');
    if (res && res.success) {
      cachedData.dashboard = res.data;
      cachedData.dpdpSchedule = res.data.dpdpSchedule || [];
    }
  } catch (err) {
    showToast('Failed to load privacy & cybersecurity dashboard', 'error');
  }
}

function renderSectionContent() {
  const container = document.getElementById('opc-content-area');
  if (!container) return;

  switch (activeSection) {
    case 'overview':
      renderOverview(container);
      break;
    case 'dpdp':
      renderDpdp(container);
      break;
    case 'ropa':
      renderRopa(container);
      break;
    case 'processors':
      renderProcessors(container);
      break;
    case 'nist':
      renderNist(container);
      break;
    default:
      renderOverview(container);
  }
}

function renderOverview(container) {
  const d = cachedData.dashboard || {
    totalDataProcessingActivitiesCount: 0,
    activeThirdPartyProcessorsCount: 0,
    activePrivacyIncidentsCount: 0,
    pendingDataPrincipalRequestsCount: 0,
    totalSecurityControlsCount: 0,
  };

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Data Processing Activities (RoPA)</div>
        <div style="font-size:28px;font-weight:800;color:var(--text-primary,#fff);margin-top:6px;">${d.totalDataProcessingActivitiesCount}</div>
        <div style="font-size:12px;color:#2dd4bf;margin-top:4px;">Governed purposes & retention</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Third-Party Processors</div>
        <div style="font-size:28px;font-weight:800;color:var(--text-primary,#fff);margin-top:6px;">${d.activeThirdPartyProcessorsCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Contracted cloud & services</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Active Privacy Incidents</div>
        <div style="font-size:28px;font-weight:800;color:${d.activePrivacyIncidentsCount > 0 ? '#f87171' : '#4ade80'};margin-top:6px;">${d.activePrivacyIncidentsCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Under active containment</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">NIST CSF 2.0 Controls</div>
        <div style="font-size:28px;font-weight:800;color:#38bdf8;margin-top:6px;">${d.totalSecurityControlsCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Across 6 core functions</div>
      </div>
    </div>

    <!-- Legal Invariants Notice -->
    <div style="margin-top:20px;padding:16px;background:rgba(20,184,166,0.06);border:1px solid rgba(20,184,166,0.3);border-radius:10px;">
      <div style="font-weight:700;color:#2dd4bf;font-size:13px;display:flex;align-items:center;gap:6px;">
        ${icon('info')} DPDP 2026/2027 Regulatory Reality & Retention Invariants
      </div>
      <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:6px;line-height:1.5;">
        • <strong>Phased Commencement:</strong> Digital Personal Data Protection Act provisions are not uniformly enforced today. Institutional provisions are in force; principal processing obligations and rights commence in future tranches (November 2026 and May 2027).<br>
        • <strong>Statutory Retention Overrides Automated Erasure:</strong> Personal data embedded in tax invoices, GST returns, or statutory payroll records is legally protected from erasure during statutory limitation periods.<br>
        • <strong>NIST CSF 2.0:</strong> Used as an internal governance framework taxonomy, not a statutory Indian enactment or external certification.
      </div>
    </div>
  `;
}

function renderDpdp(container) {
  const schedule = cachedData.dpdpSchedule || [];

  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        DPDP Act 2023 & Rules: Official Phased Commencement Schedule
      </h3>
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${schedule
          .map(
            (s) => `
          <div style="padding:16px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="font-weight:800;color:var(--text-primary,#fff);font-size:15px;">${s.description}</div>
              <span style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;background:${s.currentStatus === 'IN_FORCE' ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)'};color:${s.currentStatus === 'IN_FORCE' ? '#86efac' : '#fde047'};">
                ${s.currentStatus}
              </span>
            </div>
            <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:6px;">
              Commencement Date: <strong>${s.officialCommencementDate}</strong> · Act Sections: ${s.actSections} · Rules: ${s.rules}
            </div>
            <div style="font-size:12px;color:var(--gold-400,#c9a86a);margin-top:6px;">
              ${s.notes}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderRopa(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Record of Processing Activities (RoPA)
      </h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-bottom:16px;">
        Every personal data processing activity is mapped to a lawful purpose, specific statutory retention basis, and security classification.
      </div>
      <div style="text-align:center;color:var(--text-muted,#94a3b8);padding:30px 0;">
        Personal data inventory maintained with tenant cryptographic isolation and role-based access control.
      </div>
    </div>
  `;
}

function renderProcessors(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Third-Party Data Processors & Sub-Processors
      </h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-bottom:16px;">
        Governance of cloud infrastructure, data centers, and external enterprise software partners with mandatory deletion certificates.
      </div>
      <div style="text-align:center;color:var(--text-muted,#94a3b8);padding:30px 0;">
        Cloud storage constrained to MeitY empaneled domestic Indian data centers.
      </div>
    </div>
  `;
}

function renderNist(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        NIST Cybersecurity Framework (CSF 2.0) Internal Governance
      </h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:16px;">
        <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);text-align:center;">
          <div style="font-weight:800;color:#38bdf8;">GOVERN</div>
          <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:4px;">Policy & Risk Strategy</div>
        </div>
        <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);text-align:center;">
          <div style="font-weight:800;color:#38bdf8;">IDENTIFY</div>
          <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:4px;">Asset & Data Inventory</div>
        </div>
        <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);text-align:center;">
          <div style="font-weight:800;color:#38bdf8;">PROTECT</div>
          <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:4px;">Access & Cryptography</div>
        </div>
        <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);text-align:center;">
          <div style="font-weight:800;color:#38bdf8;">DETECT</div>
          <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:4px;">Anomalies & Audits</div>
        </div>
        <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);text-align:center;">
          <div style="font-weight:800;color:#38bdf8;">RESPOND</div>
          <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:4px;">Incident Containment</div>
        </div>
        <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);text-align:center;">
          <div style="font-weight:800;color:#38bdf8;">RECOVER</div>
          <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:4px;">Restoration & Lessons</div>
        </div>
      </div>
    </div>
  `;
}

function openNewIncidentModal() {
  openModal('Log Privacy Incident', `
    <form id="form-new-incident" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Incident Title *</label>
        <input type="text" id="inc-title" placeholder="e.g. Inadvertent Email Recipient Exposure" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Description *</label>
        <textarea id="inc-desc" rows="3" placeholder="Describe detected privacy breach, affected systems, and timestamps" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;"></textarea>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Severity</label>
        <select id="inc-sev" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;">
          <option value="LOW">LOW</option>
          <option value="MEDIUM" selected>MEDIUM</option>
          <option value="HIGH">HIGH</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="inc-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Submit Incident</button>
      </div>
    </form>
  `);

  document.getElementById('inc-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-incident')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('inc-title').value.trim(),
      description: document.getElementById('inc-desc').value.trim(),
      severity: document.getElementById('inc-sev').value,
    };
    try {
      const res = await apiPost('/privacy-cyber/incidents', payload);
      if (res && res.success) {
        showToast('Privacy incident recorded successfully', 'success');
        closeModal();
        await loadData();
        renderSectionContent();
      } else {
        showToast(res.error || 'Failed to report incident', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API request failed', 'error');
    }
  });
}

function openNewRopaModal() {
  openModal('Register Personal Data Process (RoPA)', `
    <form id="form-new-ropa" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Process Name *</label>
        <input type="text" id="ropa-name" placeholder="e.g. Employee Payroll Disbursement" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Business Owner *</label>
        <input type="text" id="ropa-owner" placeholder="e.g. Head of Human Resources" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Data Principal Type *</label>
        <select id="ropa-type" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;">
          <option value="EMPLOYEE">EMPLOYEE</option>
          <option value="CUSTOMER">CUSTOMER</option>
          <option value="SUPPLIER_CONTACT">SUPPLIER_CONTACT</option>
          <option value="CONTRACTOR">CONTRACTOR</option>
          <option value="CANDIDATE">CANDIDATE</option>
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Purpose *</label>
        <input type="text" id="ropa-purpose" placeholder="e.g. Monthly salary calculation, statutory tax deduction" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Retention Period (Years) *</label>
        <input type="number" id="ropa-retention" min="1" max="50" value="8" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Retention Legal Basis *</label>
        <input type="text" id="ropa-basis" placeholder="e.g. Income Tax Act 1961 s. 44AA & EPF Scheme 1952" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="ropa-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Save RoPA Entry</button>
      </div>
    </form>
  `);

  document.getElementById('ropa-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-ropa')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      processName: document.getElementById('ropa-name').value.trim(),
      businessOwner: document.getElementById('ropa-owner').value.trim(),
      dataPrincipalType: document.getElementById('ropa-type').value,
      purpose: document.getElementById('ropa-purpose').value.trim(),
      retentionPeriodYears: Number(document.getElementById('ropa-retention').value) || 8,
      retentionBasis: document.getElementById('ropa-basis').value.trim(),
    };
    try {
      const res = await apiPost('/privacy-cyber/processing-registers', payload);
      if (res && res.success) {
        showToast('RoPA process registered successfully', 'success');
        closeModal();
        await loadData();
        renderSectionContent();
      } else {
        showToast(res.error || 'Failed to save RoPA entry', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API request failed', 'error');
    }
  });
}

export {
  initOwnerPrivacyCyber as initOwnerPrivacyCyberEvents,
  initOwnerPrivacyCyber as wireOwnerPrivacyCyber,
};

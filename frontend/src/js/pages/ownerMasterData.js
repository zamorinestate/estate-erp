// =============================================================================
// ZAMORIN CAFÉ ERP — STAGE 10: MASTER DATA GOVERNANCE CENTRE
// Owner Strategic Expansion Workspace
// =============================================================================

import { apiGet, apiPost, apiPatch } from '../apiClient.js';
import { showToast, skeleton, openModal, closeModal } from '../components.js';
import { state } from '../state.js';
import { icon } from '../icons.js';

let activeSection = 'overview';
let cachedData = {
  dashboard: null,
  domains: [],
};

export function setOwnerMasterDataSection(sec) {
  activeSection = sec || 'overview';
}

export function renderOwnerMasterData() {
  return `
    <div class="page-enter owner-master-data-workspace" style="display:flex;flex-direction:column;gap:20px;padding-bottom:60px;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.3);border-radius:20px;font-size:11px;font-weight:700;color:#fb923c;letter-spacing:0.5px;margin-bottom:8px;">
            <span style="width:6px;height:6px;border-radius:50%;background:#f97316;"></span>
            OWNER STRATEGIC EXPANSION · STAGE 10
          </div>
          <h1 style="font-size:24px;font-weight:800;color:var(--text-primary,#fff);margin:0 0 4px 0;letter-spacing:-0.5px;">
            Master Data Governance Centre
          </h1>
          <div style="font-size:13px;color:var(--text-muted,#94a3b8);">
            14 Canonical Domains · Governed Duplicate Merging · Immutability of Financial History · Maker-Checker Change Requests
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="omd-btn-new-cr" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:rgba(249,115,22,0.2);color:#fdba74;border:1px solid rgba(249,115,22,0.4);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('edit')} Submit Change Request
          </button>
          <button id="omd-btn-new-dup" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('search')} Match Duplicate Candidate
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex;gap:8px;border-bottom:1px solid var(--border-color,#334155);padding-bottom:8px;overflow-x:auto;">
        <button class="tab-btn ${activeSection === 'overview' ? 'active' : ''}" data-section="overview" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'overview' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'overview' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Governance Overview
        </button>
        <button class="tab-btn ${activeSection === 'domains' ? 'active' : ''}" data-section="domains" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'domains' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'domains' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          14 Canonical Domains
        </button>
        <button class="tab-btn ${activeSection === 'duplicates' ? 'active' : ''}" data-section="duplicates" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'duplicates' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'duplicates' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Duplicate Candidates & Merges
        </button>
        <button class="tab-btn ${activeSection === 'changes' ? 'active' : ''}" data-section="changes" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'changes' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'changes' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          High-Risk Change Requests
        </button>
      </div>

      <!-- Main Content Container -->
      <div id="omd-content-area">
        ${skeleton(4, 80)}
      </div>
    </div>
  `;
}

export async function initOwnerMasterData() {
  const container = document.getElementById('omd-content-area');
  if (!container) return;

  // Bind Tabs
  document.querySelectorAll('.owner-master-data-workspace .tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sec = e.currentTarget.dataset.section;
      setOwnerMasterDataSection(sec);
      document.querySelectorAll('.owner-master-data-workspace .tab-btn').forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted,#94a3b8)';
      });
      e.currentTarget.style.background = 'var(--gold-500,#96733a)';
      e.currentTarget.style.color = '#fff';
      renderSectionContent();
    });
  });

  // Bind Header Buttons
  const btnCr = document.getElementById('omd-btn-new-cr');
  if (btnCr) {
    btnCr.addEventListener('click', openNewChangeRequestModal);
  }

  const btnDup = document.getElementById('omd-btn-new-dup');
  if (btnDup) {
    btnDup.addEventListener('click', openNewDuplicateModal);
  }

  await loadData();
  renderSectionContent();
}

async function loadData() {
  try {
    const [dashRes, domRes] = await Promise.all([
      apiGet('/master-data/dashboard'),
      apiGet('/master-data/domains'),
    ]);
    if (dashRes && dashRes.success) cachedData.dashboard = dashRes.data;
    if (domRes && domRes.success) cachedData.domains = domRes.data || [];
  } catch (err) {
    showToast('Failed to load master data governance', 'error');
  }
}

function renderSectionContent() {
  const container = document.getElementById('omd-content-area');
  if (!container) return;

  switch (activeSection) {
    case 'overview':
      renderOverview(container);
      break;
    case 'domains':
      renderDomains(container);
      break;
    case 'duplicates':
      renderDuplicates(container);
      break;
    case 'changes':
      renderChanges(container);
      break;
    default:
      renderOverview(container);
  }
}

function renderOverview(container) {
  const d = cachedData.dashboard || {
    totalDomainsDeclared: 14,
    openDuplicateCandidatesCount: 0,
    pendingChangeRequestsCount: 0,
    resolvedMergesCount: 0,
  };

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Master Domains Declared</div>
        <div style="font-size:28px;font-weight:800;color:var(--text-primary,#fff);margin-top:6px;">${d.totalDomainsDeclared}</div>
        <div style="font-size:12px;color:#fb923c;margin-top:4px;">Single canonical source per domain</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Open Duplicate Candidates</div>
        <div style="font-size:28px;font-weight:800;color:#facc15;margin-top:6px;">${d.openDuplicateCandidatesCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Awaiting human review</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Pending Change Requests</div>
        <div style="font-size:28px;font-weight:800;color:#38bdf8;margin-top:6px;">${d.pendingChangeRequestsCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Maker-checker review queue</div>
      </div>

      <div style="background:var(--surface-color,#1e293b);padding:18px;border-radius:10px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Resolved Merges</div>
        <div style="font-size:28px;font-weight:800;color:#4ade80;margin-top:6px;">${d.resolvedMergesCount}</div>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">Redirected via alias records</div>
      </div>
    </div>

    <!-- Governance Invariants Notice -->
    <div style="margin-top:20px;padding:16px;background:rgba(249,115,22,0.06);border:1px solid rgba(249,115,22,0.3);border-radius:10px;">
      <div style="font-weight:700;color:#fb923c;font-size:13px;display:flex;align-items:center;gap:6px;">
        ${icon('info')} Stage 10 Master Data Governance Invariants
      </div>
      <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:6px;line-height:1.5;">
        • <strong>Statutory & Financial Immutability:</strong> Historical transactions, tax invoices, GST invoice numbering, and journals are strictly NEVER rewritten or merged. Merges establish governed alias redirects.<br>
        • <strong>Zero Auto-Merge:</strong> Duplicate matches require explicit survivor selection, impact analysis, and human approval before execution.<br>
        • <strong>Maker-Checker Approval:</strong> High-risk modifications to supplier banking details, GSTIN, and tax codes require dual independent authorization.
      </div>
    </div>
  `;
}

function renderDomains(container) {
  const list = cachedData.domains || [];

  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        14 Canonical Master Data Domains & Systems of Record
      </h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
        ${list
          .map(
            (d) => `
          <div style="padding:14px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);">
            <div style="font-weight:800;color:var(--text-primary,#fff);font-size:14px;">${d.domainName}</div>
            <div style="font-size:12px;color:#fb923c;margin-top:4px;">Domain Code: ${d.domainCode}</div>
            <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">
              Model of Record: <strong>${d.canonicalModel}</strong>
            </div>
            <div style="font-size:11px;color:var(--gold-400,#c9a86a);margin-top:4px;">
              Steward: ${d.businessOwner}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderDuplicates(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        Duplicate Candidate Registry & Governed Merge Workflow
      </h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-bottom:16px;">
        CANDIDATE → REVIEW → SURVIVOR_SELECTION → IMPACT_ANALYSIS → APPROVED → MERGED.
      </div>
      <div style="text-align:center;color:var(--text-muted,#94a3b8);padding:30px 0;">
        All merges preserve historical financial records and redirect references seamlessly through canonical aliases.
      </div>
    </div>
  `;
}

function renderChanges(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:10px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:var(--text-primary,#fff);margin:0 0 16px 0;">
        High-Risk Master Change Requests (Maker-Checker)
      </h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-bottom:16px;">
        Supplier banking details, GSTIN, and tax codes require independent review before updating the canonical database.
      </div>
      <div style="text-align:center;color:var(--text-muted,#94a3b8);padding:30px 0;">
        Maker-checker separation strictly enforced on all sensitive fields.
      </div>
    </div>
  `;
}

function openNewDuplicateModal() {
  openModal('Match Duplicate Candidate', `
    <form id="form-new-dup" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Domain *</label>
        <select id="dup-domain" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;">
          <option value="SUPPLIER">SUPPLIER (Vendor Master)</option>
          <option value="EMPLOYEE">EMPLOYEE (User Master)</option>
          <option value="ASSET">ASSET (Asset Master)</option>
          <option value="INGREDIENT">INGREDIENT (Inventory)</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Record A ID *</label>
          <input type="text" id="dup-recA" placeholder="e.g. VEN-0001" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Record B ID *</label>
          <input type="text" id="dup-recB" placeholder="e.g. VEN-0002" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
        </div>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Match Confidence % *</label>
        <input type="number" id="dup-conf" min="0" max="100" value="95" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="dup-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Record Candidate</button>
      </div>
    </form>
  `);

  document.getElementById('dup-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-dup')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      domainCode: document.getElementById('dup-domain').value,
      recordAId: document.getElementById('dup-recA').value.trim(),
      recordBId: document.getElementById('dup-recB').value.trim(),
      matchConfidencePercentage: Number(document.getElementById('dup-conf').value) || 95,
      matchMethod: 'EXACT_PHONE_AND_TAX_ID',
    };
    try {
      const res = await apiPost('/master-data/duplicates', payload);
      if (res && res.success) {
        showToast('Duplicate candidate recorded into review queue', 'success');
        closeModal();
        await loadData();
        renderSectionContent();
      } else {
        showToast(res.error || 'Failed to record candidate', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API request failed', 'error');
    }
  });
}

function openNewChangeRequestModal() {
  openModal('Submit Master Change Request', `
    <form id="form-new-cr" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Domain *</label>
        <select id="cr-domain" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;">
          <option value="SUPPLIER">SUPPLIER (Vendor Master)</option>
          <option value="CAFE">CAFE (Café Master)</option>
          <option value="TAX_CODE">TAX_CODE (Tax Classification)</option>
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Record ID *</label>
        <input type="text" id="cr-id" placeholder="e.g. VEN-0001" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Field Name *</label>
        <input type="text" id="cr-field" placeholder="e.g. gstin or bankDetails.accountNumber" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Proposed Value *</label>
        <input type="text" id="cr-val" placeholder="New verified value" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Reason & Justification *</label>
        <textarea id="cr-reason" rows="2" placeholder="Supporting documentation rationale" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;"></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="cr-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Submit Request</button>
      </div>
    </form>
  `);

  document.getElementById('cr-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-cr')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      domainCode: document.getElementById('cr-domain').value,
      recordId: document.getElementById('cr-id').value.trim(),
      fieldName: document.getElementById('cr-field').value.trim(),
      proposedValue: document.getElementById('cr-val').value.trim(),
      reason: document.getElementById('cr-reason').value.trim(),
    };
    try {
      const res = await apiPost('/master-data/change-requests', payload);
      if (res && res.success) {
        showToast('Change request submitted for maker-checker approval', 'success');
        closeModal();
        await loadData();
        renderSectionContent();
      } else {
        showToast(res.error || 'Failed to submit change request', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API request failed', 'error');
    }
  });
}

export {
  initOwnerMasterData as initOwnerMasterDataEvents,
  initOwnerMasterData as wireOwnerMasterData,
};

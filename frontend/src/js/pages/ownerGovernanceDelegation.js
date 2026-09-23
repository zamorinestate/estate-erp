// =============================================================================
// ZAMORIN CAFÉ ERP — STAGE 15: CORPORATE GOVERNANCE & DELEGATION CENTRE
// Owner Strategic Expansion Workspace
// =============================================================================

import { apiGet, apiPost } from '../apiClient.js';
import { showToast, skeleton, openModal, closeModal } from '../components.js';
import { icon } from '../icons.js';

let activeSection = 'overview';
let cachedDashboard = null;

export function setOwnerGovernanceDelegationSection(sec) {
  activeSection = sec || 'overview';
}

export function renderOwnerGovernanceDelegation() {
  return `
    <div class="page-enter owner-governance-workspace" style="display:flex;flex-direction:column;gap:20px;padding-bottom:60px;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);border-radius:20px;font-size:11px;font-weight:700;color:#818cf8;letter-spacing:0.5px;margin-bottom:8px;">
            <span style="width:6px;height:6px;border-radius:50%;background:#6366f1;"></span>
            OWNER STRATEGIC EXPANSION · STAGE 15
          </div>
          <h1 style="font-size:24px;font-weight:800;color:var(--text-primary,#fff);margin:0 0 4px 0;letter-spacing:-0.5px;">
            Corporate Governance, Delegation & Authority Centre
          </h1>
          <div style="font-size:13px;color:var(--text-muted,#94a3b8);">
            Meetings & Immutable Minutes · Delegation of Authority Engine · Authorised Signatories · Sec 184 Conflicts
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="ogd-btn-delegation" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.4);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('users')} Grant Delegation
          </button>
          <button id="ogd-btn-meeting" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('calendar')} Schedule Meeting
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex;gap:8px;border-bottom:1px solid var(--border-color,#334155);padding-bottom:8px;overflow-x:auto;">
        <button class="tab-btn ${activeSection === 'overview' ? 'active' : ''}" data-section="overview" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'overview' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'overview' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Governance Dashboard
        </button>
        <button class="tab-btn ${activeSection === 'delegations' ? 'active' : ''}" data-section="delegations" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'delegations' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'delegations' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Delegation of Authority Engine
        </button>
        <button class="tab-btn ${activeSection === 'conflicts' ? 'active' : ''}" data-section="conflicts" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'conflicts' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'conflicts' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Section 184 Conflicts & Disclosures
        </button>
      </div>

      <!-- Content Area -->
      <div id="ogd-content-area">
        ${skeleton(4, 80)}
      </div>
    </div>
  `;
}

export async function initOwnerGovernanceDelegation() {
  const container = document.getElementById('ogd-content-area');
  if (!container) return;

  // Bind Tabs
  document.querySelectorAll('.owner-governance-workspace .tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sec = e.currentTarget.dataset.section;
      setOwnerGovernanceDelegationSection(sec);
      document.querySelectorAll('.owner-governance-workspace .tab-btn').forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted,#94a3b8)';
      });
      e.currentTarget.style.background = 'var(--gold-500,#96733a)';
      e.currentTarget.style.color = '#fff';
      renderSection();
    });
  });

  const btnDel = document.getElementById('ogd-btn-delegation');
  if (btnDel) btnDel.addEventListener('click', openDelegationModal);

  const btnMtg = document.getElementById('ogd-btn-meeting');
  if (btnMtg) btnMtg.addEventListener('click', openMeetingModal);

  await loadData();
  renderSection();
}

async function loadData() {
  try {
    const res = await apiGet('/governance-delegation/dashboard');
    if (res && res.success) cachedDashboard = res.data;
  } catch (err) {
    console.warn('Governance load notice:', err.message);
  }
}

function renderSection() {
  const container = document.getElementById('ogd-content-area');
  if (!container) return;

  if (activeSection === 'overview') {
    renderOverview(container);
  } else if (activeSection === 'delegations') {
    renderDelegations(container);
  } else if (activeSection === 'conflicts') {
    renderConflicts(container);
  }
}

function renderOverview(container) {
  const d = cachedDashboard || {
    legalStructure: { status: 'LEGAL_STRUCTURE_VERIFICATION_REQUIRED', message: 'Statutory verification pending.' },
    meetingsCount: 0,
    openResolutionsCount: 0,
    activeDelegationsCount: 0,
    activeSignatoriesCount: 0,
    activeConflictsCount: 0
  };

  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:16px;border-radius:8px;border:1px solid var(--border-color,#334155);margin-bottom:16px;">
      <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;">LEGAL ENTITY STRUCTURE</div>
      <div style="font-size:16px;font-weight:800;color:${d.legalStructure?.status === 'STATUTORY_STRUCTURE_CONFIRMED' ? '#4ade80' : '#fb923c'};margin-top:4px;">
        ${d.legalStructure?.legalEntityName || 'Zamorin Hospitality'} · ${d.legalStructure?.status}
      </div>
      <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:4px;">
        ${d.legalStructure?.message || 'Companies Act 2013 secretarial standards · Applicability verification pending.'}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;">
      <div style="background:var(--surface-color,#1e293b);padding:16px;border-radius:8px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;">MEETINGS LOGGED</div>
        <div style="font-size:24px;font-weight:800;color:#fff;margin-top:6px;">${d.meetingsCount}</div>
      </div>
      <div style="background:var(--surface-color,#1e293b);padding:16px;border-radius:8px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;">OPEN RESOLUTIONS</div>
        <div style="font-size:24px;font-weight:800;color:#818cf8;margin-top:6px;">${d.openResolutionsCount}</div>
      </div>
      <div style="background:var(--surface-color,#1e293b);padding:16px;border-radius:8px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;">ACTIVE DELEGATIONS</div>
        <div style="font-size:24px;font-weight:800;color:#38bdf8;margin-top:6px;">${d.activeDelegationsCount}</div>
      </div>
      <div style="background:var(--surface-color,#1e293b);padding:16px;border-radius:8px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;">SIGNATORIES RECORDED</div>
        <div style="font-size:24px;font-weight:800;color:#4ade80;margin-top:6px;">${d.activeSignatoriesCount}</div>
      </div>
    </div>
  `;
}

function renderDelegations(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:8px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 12px 0;">Delegation of Authority Governance</h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);line-height:1.6;">
        <strong>Strict Invariants:</strong><br/>
        • Least privilege and server-side monetary ceilings (below, at, above) strictly enforced.<br/>
        • Strict café scoping: delegates can NEVER exercise org-wide authority beyond assigned café.<br/>
        • Zero Primary Master escalation: delegation can NEVER grant technical root or deployment credentials.<br/>
        • Sub-delegation is PROHIBITED by default unless explicitly documented in source resolution.
      </div>
    </div>
  `;
}

function renderConflicts(container) {
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:8px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 12px 0;">Companies Act Section 184 Disclosure Register</h3>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);line-height:1.6;">
        Disclosures by directors and key managerial personnel are maintained in the governance register. When transactions involve declared related parties, conflict warnings are surfaced automatically, and interested parties must abstain from voting.
      </div>
    </div>
  `;
}

function openDelegationModal() {
  openModal('Grant Governed Delegation of Authority', `
    <form id="form-new-del" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Delegate User ID *</label>
        <input type="text" id="del-usr" placeholder="e.g. USR-MANAGER-01" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Module *</label>
        <select id="del-mod" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;">
          <option value="FINANCE_EXPENSE">Finance & Expense Approvals</option>
          <option value="PROCUREMENT">Purchase Order Approvals</option>
          <option value="REFUND">Service Recovery Refunds</option>
          <option value="COMPLIANCE">Compliance Approvals</option>
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Max Monetary Limit (₹)</label>
        <input type="number" id="del-amt" value="25000" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Reason & Justification *</label>
        <input type="text" id="del-rsn" placeholder="e.g. Leave coverage for Store Manager" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="del-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Grant Delegation</button>
      </div>
    </form>
  `);

  document.getElementById('del-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-del')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      delegateUserId: document.getElementById('del-usr').value.trim(),
      module: document.getElementById('del-mod').value,
      actionPermissions: ['EXPENSE_APPROVE'],
      cafeScope: ['CAFE-001'],
      maxMonetaryAmount: Number(document.getElementById('del-amt').value) || null,
      startAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
      reason: document.getElementById('del-rsn').value.trim(),
      sourceAuthorityType: 'INTERNAL_POLICY'
    };
    try {
      const res = await apiPost('/governance-delegation/delegations', payload);
      if (res && res.success) {
        showToast('Delegation granted with strict time and monetary bounds', 'success');
        closeModal();
        await loadData();
        renderSection();
      } else {
        showToast(res.error || 'Failed to grant delegation', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API error', 'error');
    }
  });
}

function openMeetingModal() {
  openModal('Schedule Governance Meeting', `
    <form id="form-new-mtg" style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Meeting Title *</label>
        <input type="text" id="mtg-ttl" value="Q3 Strategic Review & Capex Meeting" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Meeting Type *</label>
        <select id="mtg-typ" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;">
          <option value="MANAGEMENT_MEETING">Executive Management Meeting</option>
          <option value="BOARD_MEETING">Statutory Board Meeting</option>
          <option value="COMMITTEE_MEETING">Governance Committee</option>
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="mtg-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Cancel</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Schedule Meeting</button>
      </div>
    </form>
  `);

  document.getElementById('mtg-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-new-mtg')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      meetingTitle: document.getElementById('mtg-ttl').value.trim(),
      meetingType: document.getElementById('mtg-typ').value,
      scheduledDate: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
      noticePeriodDays: 7
    };
    try {
      const res = await apiPost('/governance-delegation/meetings', payload);
      if (res && res.success) {
        showToast('Meeting scheduled compliantly', 'success');
        closeModal();
        await loadData();
        renderSection();
      } else {
        showToast(res.error || 'Failed to schedule meeting', 'error');
      }
    } catch (err) {
      showToast(err.message || 'API error', 'error');
    }
  });
}

export {
  initOwnerGovernanceDelegation as initOwnerGovernanceDelegationEvents,
  initOwnerGovernanceDelegation as wireOwnerGovernanceDelegation,
};

// =============================================================================
// ZAMORIN CAFÉ ERP — STAGE 05: SUPPLIER & PROCUREMENT INTELLIGENCE
// Owner Strategic Expansion Workspace
// =============================================================================

import { apiGet, apiPost, apiPatch } from '../apiClient.js';
import { showToast, skeleton, openModal, closeModal } from '../components.js';
import { state } from '../state.js';
import { icon } from '../icons.js';

let activeSection = 'overview';
let cachedData = {
  analytics: null,
  dependencyRisk: null,
  selectedSupplier360: null,
  actionPlans: [],
};
let selectedVendorId = '';

export function setOwnerSupplierSection(sec) {
  activeSection = sec || 'overview';
}

export function renderOwnerSupplierIntelligence() {
  return `
    <div class="page-enter owner-supplier-workspace" style="display:flex;flex-direction:column;gap:20px;padding-bottom:60px;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:20px;font-size:11px;font-weight:700;color:#60a5fa;letter-spacing:0.5px;margin-bottom:8px;">
            <span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;"></span>
            OWNER STRATEGIC EXPANSION · STAGE 05
          </div>
          <h1 style="font-size:24px;font-weight:800;color:var(--text-primary,#fff);margin:0 0 4px 0;letter-spacing:-0.5px;">
            Supplier & Procurement Intelligence
          </div>
          <div style="font-size:13px;color:var(--text-muted,#94a3b8);">
            Supplier 360 Dossiers · Defensible OTIF Delivery Tracking · Transparent Scorecards · Dependency Risk
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="osi-btn-new-action-plan" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;">
            ${icon('plus')} New Supplier Action Plan
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex;gap:8px;border-bottom:1px solid var(--border-color,#334155);padding-bottom:8px;overflow-x:auto;">
        <button class="tab-btn ${activeSection === 'overview' ? 'active' : ''}" data-section="overview" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'overview' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'overview' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Procurement Analytics
        </button>
        <button class="tab-btn ${activeSection === 'supplier360' ? 'active' : ''}" data-section="supplier360" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'supplier360' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'supplier360' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Supplier 360 Dossier
        </button>
        <button class="tab-btn ${activeSection === 'dependency' ? 'active' : ''}" data-section="dependency" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'dependency' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'dependency' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Dependency & Concentration Risk
        </button>
        <button class="tab-btn ${activeSection === 'actionPlans' ? 'active' : ''}" data-section="actionPlans" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'actionPlans' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'actionPlans' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Corrective Action Plans (CAPA)
        </button>
      </div>

      <!-- Main Content Area -->
      <div id="osi-content-container">
        ${skeleton(4, 80)}
      </div>
    </div>
  `;
}

export function initOwnerSupplierIntelligenceEvents() {
  const tabs = document.querySelectorAll('.owner-supplier-workspace .tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      const section = e.currentTarget.dataset.section;
      setOwnerSupplierSection(section);
      tabs.forEach((t) => {
        const isCurrent = t.dataset.section === section;
        t.style.background = isCurrent ? 'var(--gold-500,#96733a)' : 'transparent';
        t.style.color = isCurrent ? '#fff' : 'var(--text-muted,#94a3b8)';
      });
      loadActiveSectionContent();
    });
  });

  const btnNewPlan = document.getElementById('osi-btn-new-action-plan');
  if (btnNewPlan) {
    btnNewPlan.addEventListener('click', openCreateActionPlanModal);
  }

  loadActiveSectionContent();
}

async function loadActiveSectionContent() {
  const container = document.getElementById('osi-content-container');
  if (!container) return;

  container.innerHTML = skeleton(3, 100);

  try {
    if (activeSection === 'overview') {
      const res = await apiGet('/api/v1/supplier-intelligence/analytics');
      cachedData.analytics = res?.data || res;
      renderAnalyticsSection(container);
    } else if (activeSection === 'supplier360') {
      renderSupplier360Section(container);
    } else if (activeSection === 'dependency') {
      const res = await apiGet('/api/v1/supplier-intelligence/dependency-risk');
      cachedData.dependencyRisk = res?.data || res;
      renderDependencyRiskSection(container);
    } else if (activeSection === 'actionPlans') {
      renderActionPlansSection(container);
    }
  } catch (err) {
    container.innerHTML = `
      <div style="padding:30px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;text-align:center;color:#fca5a5;">
        <div style="font-weight:700;font-size:16px;margin-bottom:8px;">Failed to load Supplier Intelligence data</div>
        <div style="font-size:13px;margin-bottom:16px;">${err.message || 'Server error or access denied.'}</div>
        <button id="osi-btn-retry" class="btn btn-secondary" style="padding:6px 14px;border-radius:6px;">Retry</button>
      </div>
    `;
    const retryBtn = document.getElementById('osi-btn-retry');
    if (retryBtn) retryBtn.addEventListener('click', loadActiveSectionContent);
  }
}

function renderAnalyticsSection(container) {
  const data = cachedData.analytics || {};
  const topVendors = data.topVendors || [];
  const spendByCategory = data.spendByCategory || [];

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px;">
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Total Spend</div>
        <div style="font-size:24px;font-weight:800;color:#fff;margin-top:6px;">₹${(data.totalSpendRupees || 0).toLocaleString('en-IN')}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Across all approved purchase orders</div>
      </div>
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Purchase Orders</div>
        <div style="font-size:24px;font-weight:800;color:#38bdf8;margin-top:6px;">${data.totalPOsCount || 0}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Total PO transactions recorded</div>
      </div>
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Emergency Purchases</div>
        <div style="font-size:24px;font-weight:800;color:${(data.emergencyPurchasesCount || 0) > 0 ? '#fbbf24' : '#34d399'};margin-top:6px;">
          ${data.emergencyPurchasesCount || 0}
        </div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Urgent non-scheduled procurement</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;">
      <!-- Top Vendors -->
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 16px 0;">Top Suppliers by Spend</h3>
        ${
          topVendors.length === 0
            ? `<div style="color:var(--text-muted,#94a3b8);font-size:13px;">No supplier spend records found.</div>`
            : topVendors
                .map(
                  (v) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-weight:700;color:#fff;font-size:13px;">${v.vendorName}</div>
              <div style="font-size:11px;color:var(--text-muted,#94a3b8);">${v.shareOfSpendPercent}% of total spend</div>
            </div>
            <div style="font-weight:800;color:#38bdf8;font-size:13px;">₹${(v.spendRupees || 0).toLocaleString('en-IN')}</div>
          </div>
        `
                )
                .join('')
        }
      </div>

      <!-- Spend by Category -->
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 16px 0;">Spend by Category</h3>
        ${
          spendByCategory.length === 0
            ? `<div style="color:var(--text-muted,#94a3b8);font-size:13px;">No category breakdown available.</div>`
            : spendByCategory
                .map(
                  (c) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-weight:700;color:#fff;font-size:13px;">${c.category}</div>
              <div style="font-size:11px;color:var(--text-muted,#94a3b8);">${c.sharePercent}% of total spend</div>
            </div>
            <div style="font-weight:800;color:#a78bfa;font-size:13px;">₹${(c.spendRupees || 0).toLocaleString('en-IN')}</div>
          </div>
        `
                )
                .join('')
        }
      </div>
    </div>
  `;
}

function renderSupplier360Section(container) {
  container.innerHTML = `
    <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);margin-bottom:20px;">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <input id="osi-360-input-vendor" type="text" class="form-control" placeholder="Enter Vendor ID (e.g. VEN-0001 or Name)" style="flex:1;min-width:250px;background:rgba(0,0,0,0.2);color:#fff;border:1px solid var(--border-color,#334155);padding:8px 12px;border-radius:8px;font-size:13px;" value="${selectedVendorId}">
        <button id="osi-360-btn-fetch" class="btn btn-primary" style="padding:8px 18px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;">
          Fetch 360° Dossier
        </button>
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-top:8px;">
        Banking details are strictly masked unless privileged VENDOR_BANKING_READ permission is present.
      </div>
    </div>

    <div id="osi-360-result-container">
      ${
        cachedData.selectedSupplier360
          ? render360DossierHTML(cachedData.selectedSupplier360)
          : `<div style="text-align:center;padding:40px;color:var(--text-muted,#94a3b8);font-size:14px;">Enter a Vendor ID above to inspect the 360° intelligence dossier.</div>`
      }
    </div>
  `;

  const btnFetch = document.getElementById('osi-360-btn-fetch');
  const inputVendor = document.getElementById('osi-360-input-vendor');

  if (btnFetch && inputVendor) {
    btnFetch.addEventListener('click', async () => {
      const vid = inputVendor.value.trim();
      if (!vid) {
        showToast('Please enter a Vendor ID', 'warning');
        return;
      }
      selectedVendorId = vid;
      const resContainer = document.getElementById('osi-360-result-container');
      if (resContainer) resContainer.innerHTML = skeleton(4, 90);
      try {
        const res = await apiGet(`/api/v1/supplier-intelligence/suppliers/${encodeURIComponent(vid)}/360`);
        cachedData.selectedSupplier360 = res?.data || res;
        if (resContainer) resContainer.innerHTML = render360DossierHTML(cachedData.selectedSupplier360);
      } catch (err) {
        if (resContainer) {
          resContainer.innerHTML = `
            <div style="padding:20px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#fca5a5;text-align:center;">
              ${err.message || 'Vendor 360 record not found.'}
            </div>
          `;
        }
      }
    });
  }
}

function render360DossierHTML(dossier) {
  const sup = dossier.supplier || {};
  const spend = dossier.spendMetrics || {};
  const del = dossier.deliveryMetrics || {};
  const qual = dossier.qualityMetrics || {};
  const score = dossier.scorecard || {};

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
      <!-- Supplier Profile -->
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h3 style="font-size:16px;font-weight:800;color:#fff;margin:0 0 4px 0;">${sup.name || 'Unknown'}</h3>
            <div style="font-size:12px;color:#94a3b8;">ID: ${sup.vendorId || 'N/A'} · ${sup.supplierType || 'GOODS'}</div>
          </div>
          <span style="padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);color:#34d399;">
            ${sup.status || 'ACTIVE'}
          </span>
        </div>

        <div style="margin-top:16px;font-size:12px;display:flex;flex-direction:column;gap:8px;color:#cbd5e1;">
          <div><strong>FSSAI Number:</strong> ${sup.fssai?.licenseNumber || 'Not Recorded'}</div>
          <div><strong>GSTIN:</strong> ${sup.gstin || 'Not Recorded'}</div>
          <div><strong>Category:</strong> ${sup.category || 'FOOD_BEVERAGE'}</div>
          <div style="color:#f59e0b;font-size:11px;margin-top:6px;padding:6px;background:rgba(245,158,11,0.08);border-radius:6px;">
            ${sup.bankDetailsRestricted ? '🔒 Bank details restricted to Master authority' : 'Bank accounts verified'}
          </div>
        </div>
      </div>

      <!-- Scorecard Summary -->
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 12px 0;">Scorecard Performance</h3>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
          <div style="font-size:36px;font-weight:900;color:#38bdf8;">${score.overallScore ?? 'N/A'}</div>
          <div>
            <div style="font-weight:700;color:#fff;font-size:13px;">Grade: ${score.grade || 'UNRATED'}</div>
            <div style="font-size:11px;color:#94a3b8;">${score.formula || ''}</div>
          </div>
        </div>
        <div style="font-size:12px;display:flex;flex-direction:column;gap:6px;color:#94a3b8;">
          <div>Quality Score: <strong style="color:#fff;">${score.components?.quality?.score ?? 'N/A'}/100</strong></div>
          <div>Delivery OTIF: <strong style="color:#fff;">${score.components?.delivery?.score !== null ? score.components?.delivery?.score + '%' : 'UNAVAILABLE'}</strong></div>
          <div>Compliance Score: <strong style="color:#fff;">${score.components?.compliance?.score ?? 'N/A'}/100</strong></div>
        </div>
      </div>

      <!-- Delivery Performance (Zero Fabrication) -->
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 12px 0;">Delivery Performance (OTIF)</h3>
        ${
          del.status === 'UNAVAILABLE'
            ? `<div style="padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;font-size:12px;color:#94a3b8;line-height:1.5;">
                 <strong>Metric Status: UNAVAILABLE</strong><br>
                 ${del.reason}
               </div>`
            : `<div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
                 <div>On-Time Rate: <strong style="color:#34d399;">${del.onTimeDeliveryPercent}%</strong></div>
                 <div>In-Full Rate: <strong style="color:#38bdf8;">${del.fullDeliveryPercent}%</strong></div>
                 <div>Calculated OTIF: <strong style="color:#f59e0b;">${del.otifPercent}%</strong></div>
                 <div style="font-size:11px;color:#94a3b8;">Evaluated across ${del.ordersEvaluated} completed shipments</div>
               </div>`
        }
      </div>

      <!-- Quality & Safety Incidents -->
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 12px 0;">Quality & Safety Linkage</h3>
        <div style="font-size:12px;display:flex;flex-direction:column;gap:6px;color:#cbd5e1;">
          <div>Total Delivered: <strong>${qual.totalDeliveredQty || 0} units</strong></div>
          <div>Total Rejected: <strong>${qual.totalRejectedQty || 0} units</strong></div>
          <div>Rejection Rate: <strong style="color:${qual.rejectionRatePercent > 2 ? '#f87171' : '#34d399'};">${qual.rejectionRatePercent || 0}%</strong></div>
          <div>Linked Food Safety Incidents: <strong>${qual.linkedSafetyIncidentsCount || 0}</strong></div>
        </div>
      </div>
    </div>
  `;
}

function renderDependencyRiskSection(container) {
  const risk = cachedData.dependencyRisk || {};
  const singleSources = risk.singleSourceItems || [];

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:24px;">
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Top 3 Spend Concentration</div>
        <div style="font-size:26px;font-weight:800;color:${risk.top3ConcentrationPercent > 70 ? '#f87171' : '#38bdf8'};margin-top:6px;">
          ${risk.top3ConcentrationPercent || 0}%
        </div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Risk Level: <strong>${risk.concentrationRiskLevel || 'NORMAL'}</strong></div>
      </div>
      <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);font-weight:700;text-transform:uppercase;">Single-Source Items</div>
        <div style="font-size:26px;font-weight:800;color:${(risk.singleSourceItemsCount || 0) > 0 ? '#fbbf24' : '#34d399'};margin-top:6px;">
          ${risk.singleSourceItemsCount || 0}
        </div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Items dependent on a sole supplier</div>
      </div>
    </div>

    <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 16px 0;">Single-Source Item Dependency Catalogue</h3>
      ${
        singleSources.length === 0
          ? `<div style="color:var(--text-muted,#94a3b8);font-size:13px;">No single-source item dependencies identified. Diversification is healthy.</div>`
          : singleSources
              .map(
                (item) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div>
            <div style="font-weight:700;color:#fff;font-size:13px;">${item.itemCode}</div>
            <div style="font-size:11px;color:#94a3b8;">Sole Supplier: ${item.soleSupplier?.vendorName} (${item.soleSupplier?.vendorId})</div>
          </div>
          <span style="padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(245,158,11,0.15);color:#fbbf24;">
            ${item.dependencyExposure}
          </span>
        </div>
      `
              )
              .join('')
      }
    </div>
  `;
}

function renderActionPlansSection(container) {
  container.innerHTML = `
    <div style="background:var(--surface-card,#1e293b);padding:20px;border-radius:12px;border:1px solid var(--border-color,#334155);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:700;color:#fff;margin:0;">Supplier Corrective Action Plans (CAPA)</h3>
      </div>
      <div style="color:var(--text-muted,#94a3b8);font-size:13px;">
        Track supplier findings, required actions, due dates, verification notes, and formal closure.
      </div>
    </div>
  `;
}

function openCreateActionPlanModal() {
  const content = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="font-size:12px;font-weight:700;color:#fff;">Action ID *</label>
        <input id="osi-modal-action-id" type="text" class="form-control" value="CAPA-SUP-${Date.now().toString().slice(-4)}" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid #475569;border-radius:6px;">
      </div>
      <div>
        <label style="font-size:12px;font-weight:700;color:#fff;">Vendor ID *</label>
        <input id="osi-modal-vendor-id" type="text" class="form-control" placeholder="e.g. VEN-0001" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid #475569;border-radius:6px;">
      </div>
      <div>
        <label style="font-size:12px;font-weight:700;color:#fff;">Title *</label>
        <input id="osi-modal-title" type="text" class="form-control" placeholder="Action plan summary" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid #475569;border-radius:6px;">
      </div>
      <div>
        <label style="font-size:12px;font-weight:700;color:#fff;">Finding Observation *</label>
        <textarea id="osi-modal-finding" rows="2" class="form-control" placeholder="Root defect or observation" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid #475569;border-radius:6px;"></textarea>
      </div>
      <div>
        <label style="font-size:12px;font-weight:700;color:#fff;">Action Required *</label>
        <textarea id="osi-modal-action-req" rows="2" class="form-control" placeholder="Specific corrective action required from vendor" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid #475569;border-radius:6px;"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12px;font-weight:700;color:#fff;">Category</label>
          <select id="osi-modal-category" class="form-select" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid #475569;border-radius:6px;">
            <option value="QUALITY_DEFECT">Quality Defect</option>
            <option value="DELIVERY_DELAY">Delivery Delay</option>
            <option value="PRICE_VARIANCE">Price Variance</option>
            <option value="COMPLIANCE_GAP">Compliance Gap</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#fff;">Due Date *</label>
          <input id="osi-modal-due-date" type="date" class="form-control" value="${new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]}" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid #475569;border-radius:6px;">
        </div>
      </div>
    </div>
  `;

  openModal({
    title: 'New Supplier Corrective Action Plan (CAPA)',
    content,
    confirmText: 'Create Action Plan',
    onConfirm: async () => {
      const actionId = document.getElementById('osi-modal-action-id')?.value.trim();
      const vendorId = document.getElementById('osi-modal-vendor-id')?.value.trim();
      const title = document.getElementById('osi-modal-title')?.value.trim();
      const finding = document.getElementById('osi-modal-finding')?.value.trim();
      const actionRequired = document.getElementById('osi-modal-action-req')?.value.trim();
      const category = document.getElementById('osi-modal-category')?.value;
      const dueDate = document.getElementById('osi-modal-due-date')?.value;

      if (!actionId || !vendorId || !title || !finding || !actionRequired || !dueDate) {
        showToast('All required fields must be completed', 'error');
        return false;
      }

      try {
        await apiPost('/api/v1/supplier-intelligence/action-plans', {
          actionId,
          vendorId,
          title,
          finding,
          actionRequired,
          category,
          dueDate: new Date(dueDate),
          responsibleOwner: state.currentUser?.fullName || 'Owner Procurement Lead',
        });
        showToast('Supplier Action Plan registered successfully', 'success');
        closeModal();
        loadActiveSectionContent();
      } catch (err) {
        showToast(err.message || 'Failed to create action plan', 'error');
        return false;
      }
    },
  });
}

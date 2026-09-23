// =============================================================================
// ZAMORIN CAFÉ ERP — STAGE 12: MENU ENGINEERING & PRICING INTELLIGENCE
// Owner Strategic Expansion Workspace
// =============================================================================

import { apiGet, apiPost } from '../apiClient.js';
import { showToast, skeleton, openModal, closeModal } from '../components.js';
import { icon } from '../icons.js';

let activeSection = 'matrix';
let cachedMatrix = null;
let cachedLabelling = null;

export function setOwnerMenuPricingSection(sec) {
  activeSection = sec || 'matrix';
}

export function renderOwnerMenuPricing() {
  return `
    <div class="page-enter owner-menu-pricing-workspace" style="display:flex;flex-direction:column;gap:20px;padding-bottom:60px;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);border-radius:20px;font-size:11px;font-weight:700;color:#facc15;letter-spacing:0.5px;margin-bottom:8px;">
            <span style="width:6px;height:6px;border-radius:50%;background:#eab308;"></span>
            OWNER STRATEGIC EXPANSION · STAGE 12
          </div>
          <h1 style="font-size:24px;font-weight:800;color:var(--text-primary,#fff);margin:0 0 4px 0;letter-spacing:-0.5px;">
            Menu Engineering & Pricing Intelligence
          </h1>
          <div style="font-size:13px;color:var(--text-muted,#94a3b8);">
            Popularity vs Contribution Matrix · Non-Mutating Price Simulations · FSSAI 2020 Menu Labelling
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="omp-btn-simulate" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
            ${icon('calculator')} Simulate Price Scenario
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex;gap:8px;border-bottom:1px solid var(--border-color,#334155);padding-bottom:8px;overflow-x:auto;">
        <button class="tab-btn ${activeSection === 'matrix' ? 'active' : ''}" data-section="matrix" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'matrix' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'matrix' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          Menu Engineering Matrix
        </button>
        <button class="tab-btn ${activeSection === 'labelling' ? 'active' : ''}" data-section="labelling" style="padding:8px 16px;border-radius:6px;border:none;background:${activeSection === 'labelling' ? 'var(--gold-500,#96733a)' : 'transparent'};color:${activeSection === 'labelling' ? '#fff' : 'var(--text-muted,#94a3b8)'};font-weight:700;font-size:13px;cursor:pointer;">
          FSSAI 2020 Labelling Applicability
        </button>
      </div>

      <!-- Content Area -->
      <div id="omp-content-area">
        ${skeleton(4, 80)}
      </div>
    </div>
  `;
}

export async function initOwnerMenuPricing() {
  const container = document.getElementById('omp-content-area');
  if (!container) return;

  // Bind Tabs
  document.querySelectorAll('.owner-menu-pricing-workspace .tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sec = e.currentTarget.dataset.section;
      setOwnerMenuPricingSection(sec);
      document.querySelectorAll('.owner-menu-pricing-workspace .tab-btn').forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted,#94a3b8)';
      });
      e.currentTarget.style.background = 'var(--gold-500,#96733a)';
      e.currentTarget.style.color = '#fff';
      renderSection();
    });
  });

  const btnSim = document.getElementById('omp-btn-simulate');
  if (btnSim) {
    btnSim.addEventListener('click', openSimulateModal);
  }

  await loadData();
  renderSection();
}

async function loadData() {
  try {
    const [matrixRes, labellingRes] = await Promise.all([
      apiGet('/menu-pricing/matrix'),
      apiGet('/menu-pricing/labelling/applicability')
    ]);
    if (matrixRes && matrixRes.success) cachedMatrix = matrixRes.data;
    if (labellingRes && labellingRes.success) cachedLabelling = labellingRes.data;
  } catch (err) {
    console.warn('Menu pricing load notice:', err.message);
  }
}

function renderSection() {
  const container = document.getElementById('omp-content-area');
  if (!container) return;

  if (activeSection === 'matrix') {
    renderMatrix(container);
  } else if (activeSection === 'labelling') {
    renderLabelling(container);
  }
}

function renderMatrix(container) {
  const items = cachedMatrix?.items || [];
  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:8px;border:1px solid var(--border-color,#334155);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="font-size:16px;font-weight:700;color:#fff;margin:0;">
          Popularity vs Contribution Matrix (Star / Plowhorse / Puzzle / Dog)
        </h3>
        <div style="font-size:12px;color:var(--text-muted,#94a3b8);">
          Avg Units Threshold: <strong>${cachedMatrix?.averageUnitsSoldThreshold || 0}</strong> | Avg Contribution: <strong>₹${cachedMatrix?.averageContributionThreshold || 0}</strong>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
        ${items.map(i => `
          <div style="padding:14px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border-color,#334155);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div style="font-weight:700;color:#fff;">${i.itemName}</div>
              <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(234,179,8,0.2);color:#facc15;">
                ${i.quadrant}
              </span>
            </div>
            <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-top:6px;">
              Price: ₹${i.sellingPrice} | Cost: ${i.isCostAvailable ? `₹${i.recipeCost}` : '<span style="color:#fb923c;">Unavailable</span>'}
            </div>
            <div style="font-size:12px;color:#38bdf8;margin-top:2px;">
              Contribution: ${i.contributionAmount !== null ? `₹${i.contributionAmount} (${i.contributionMarginPercent}%)` : 'Incomplete Data'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderLabelling(container) {
  const lab = cachedLabelling || {
    fssaiLicenceType: 'STATE_LICENCE',
    totalActiveOutlets: 1,
    isMandatoryMenuLabellingApplicable: false,
    applicabilityRationale: 'Evaluating establishment FSSAI licence and outlet count.'
  };

  container.innerHTML = `
    <div style="background:var(--surface-color,#1e293b);padding:20px;border-radius:8px;border:1px solid var(--border-color,#334155);">
      <h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 12px 0;">
        FSSAI Labelling & Display Regulations, 2020 Applicability Engine
      </h3>
      <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid var(--border-color,#334155);margin-bottom:16px;">
        <div style="font-weight:700;color:${lab.isMandatoryMenuLabellingApplicable ? '#facc15' : '#38bdf8'};">
          ${lab.isMandatoryMenuLabellingApplicable ? 'QUALIFYING ESTABLISHMENT (MANDATORY MENU LABELLING)' : 'EXEMPT / VOLUNTARY ADHERENCE'}
        </div>
        <div style="font-size:13px;color:var(--text-muted,#94a3b8);margin-top:6px;">
          ${lab.applicabilityRationale}
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);line-height:1.6;">
        <strong>Statutory Baseline:</strong> Under FSSAI Labelling and Display Regulations 2020, food service establishments having a Central FSSAI licence or operating 10 or more outlets are required to display calorific value, portion size, allergen declarations, and adult calorie reference statement.<br/>
        <strong>Zero False Nutrition Data:</strong> Missing calories or unverified allergens are strictly designated as "UNAVAILABLE / REQUIRES VERIFIED NUTRITION DATA".
      </div>
    </div>
  `;
}

function openSimulateModal() {
  openModal('Simulate Price Scenario', `
    <form id="form-sim-price" style="display:flex;flex-direction:column;gap:14px;">
      <div style="font-size:12px;color:#38bdf8;padding:8px;background:rgba(56,189,248,0.1);border-radius:6px;">
        Pure mathematical sandbox. Never alters POS, taxes, or historical sales.
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Current Price (₹) *</label>
        <input type="number" id="sim-curr" value="180" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Proposed Price (₹) *</label>
        <input type="number" id="sim-prop" value="195" required style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Expected Volume Change (%)</label>
        <input type="number" id="sim-vol" value="-5" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-color,#334155);background:var(--surface-color,#1e293b);color:#fff;" />
      </div>
      <div id="sim-results" style="display:none;padding:12px;background:rgba(0,0,0,0.3);border-radius:6px;border:1px solid var(--border-color,#334155);"></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" id="sim-cancel" class="btn btn-secondary" style="padding:8px 14px;background:transparent;border:1px solid var(--border-color,#334155);color:var(--text-muted,#94a3b8);border-radius:6px;">Close</button>
        <button type="submit" class="btn btn-primary" style="padding:8px 14px;background:var(--gold-500,#96733a);color:#fff;border:none;border-radius:6px;font-weight:700;">Calculate Projection</button>
      </div>
    </form>
  `);

  document.getElementById('sim-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-sim-price')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      menuItemId: 'SIMULATED-ITEM',
      currentPrice: Number(document.getElementById('sim-curr').value),
      proposedPrice: Number(document.getElementById('sim-prop').value),
      expectedVolumeChangePercent: Number(document.getElementById('sim-vol').value),
      currentRecipeCost: 65,
      currentUnitsSold: 100
    };
    try {
      const res = await apiPost('/menu-pricing/simulate', payload);
      if (res && res.success) {
        const d = res.data;
        const resBox = document.getElementById('sim-results');
        resBox.style.display = 'block';
        resBox.innerHTML = `
          <div style="font-weight:700;color:#facc15;margin-bottom:6px;">Simulation Output:</div>
          <div style="font-size:12px;color:#fff;">Projected Revenue: ₹${d.projectedRevenue} (Delta: ₹${d.priceDelta} / unit)</div>
          <div style="font-size:12px;color:#38bdf8;margin-top:4px;">Projected Contribution: ₹${d.projectedContribution} (Food Cost: ${d.projectedFoodCostPercent}%)</div>
        `;
      }
    } catch (err) {
      showToast(err.message || 'Simulation error', 'error');
    }
  });
}

export {
  initOwnerMenuPricing as initOwnerMenuPricingEvents,
  initOwnerMenuPricing as wireOwnerMenuPricing,
};

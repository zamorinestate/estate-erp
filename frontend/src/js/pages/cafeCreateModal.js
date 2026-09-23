// =============================================================================
// ZAMORIN CAFÉ ERP — MULTI-STEP CAFÉ REGISTRATION & ONBOARDING WIZARD
// Part A Specification: Sections 3 - 19
// Structured Step-by-Step Provisioning with Readiness Profile & Credentials
// =============================================================================

'use strict';

import { apiPost } from '../apiClient.js';
import { showToast } from '../components.js';
import { icon } from '../icons.js';
import { openCafeAccessManagementModal } from './cafeAccessManagementModal.js';
import { openQrViewerModal, downloadQrSvg, printQrCard } from '../utils/qrCodeGen.js';

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openCafeCreateModal(mountParent = document.body, opts = {}) {
  let modalMount = document.getElementById('zamorin-cafe-create-modal-mount');
  if (!modalMount) {
    modalMount = document.createElement('div');
    modalMount.id = 'zamorin-cafe-create-modal-mount';
    (mountParent || document.body).appendChild(modalMount);
  }

  renderMultiStepWizard(modalMount, opts);
}

function renderMultiStepWizard(container, opts) {
  let currentStep = 1;
  const totalSteps = 6;

  // Wizard state accumulator
  const formData = {
    // Step 1: Establishment Identity
    name: '',
    displayName: '',
    legalName: '',
    cafeType: 'STANDARD_CAFE',
    dietaryType: 'MIXED',
    openingDate: new Date().toISOString().split('T')[0],
    initialStatus: 'ACTIVE',

    // Step 2: Legal Constitution & Ownership
    constitution: 'PRIVATE_LIMITED',
    pan: '',
    cin: '',
    udyamNumber: '',

    // Step 3: Premises & Location
    addressLine1: '',
    landmark: '',
    city: '',
    district: '',
    state: 'Kerala',
    pincode: '',
    possessionType: 'RENTED',

    // Step 4: Contact & Operations
    phone: '',
    email: '',
    managerName: '',
    emergencyName: '',
    emergencyPhone: '',
    openingTime: '07:00',
    closingTime: '23:00',
    seatingCapacity: 48,

    // Step 5: GST & FSSAI Statutory
    gstApplicable: true,
    gstin: '',
    fssaiRequired: true,
    fssaiNumber: '',
    fssaiKindOfBusiness: 'RESTAURANT',
    fssaiType: 'STATE_LICENCE',
    fssaiExpiryDate: '',

    // Step 6: Hardware Profile
    hardware: {
      posTerminal: true,
      thermalPrinter: true,
      barcodeScanner: false,
      weighingScale: false,
      customerDisplay: true,
    }
  };

  function render() {
    container.innerHTML = `
      <div class="modal-backdrop" id="cafe-create-backdrop" style="position:fixed;inset:0;background:rgba(18,17,16,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);">
        <div class="modal-card card" style="width:880px;max-width:96vw;max-height:92vh;overflow-y:auto;padding:26px;background:var(--surface-raised, #242220);border:1px solid var(--line-strong, #3d3935);box-shadow:var(--shadow-2xl);border-radius:12px;">

          <!-- Top Bar -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--line, #33302c);padding-bottom:12px;">
            <div>
              <div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:var(--bronze-500, #b17d38);text-transform:uppercase;">
                <span>☕</span> CAFÉ PORTFOLIO ONBOARDING WIZARD
              </div>
              <h2 style="margin:2px 0 0;font-size:19px;font-weight:800;color:var(--ink, #ede8e1);">New Establishment Registration</h2>
            </div>
            <button class="btn btn-xs btn-ghost" id="wiz-close-x-btn" type="button" style="font-size:16px;line-height:1;padding:4px 8px;cursor:pointer;">✕</button>
          </div>

          <!-- Wizard Step Indicator Progress -->
          <div style="display:grid;grid-template-columns:repeat(${totalSteps}, 1fr);gap:6px;margin-bottom:20px;">
            ${[
              '1. Identity',
              '2. Legal',
              '3. Premises',
              '4. Contacts',
              '5. Compliance',
              '6. Hardware'
            ].map((label, idx) => {
              const stepNum = idx + 1;
              const isActive = stepNum === currentStep;
              const isPast = stepNum < currentStep;
              return `
                <div style="text-align:center;">
                  <div style="height:4px;border-radius:2px;background:${isActive ? 'var(--bronze-500, #c89650)' : (isPast ? '#10b981' : 'var(--line, #33302c)')};margin-bottom:4px;transition:background 0.2s;"></div>
                  <div style="font-size:10px;font-weight:${isActive ? '800' : '600'};color:${isActive ? 'var(--ink, #ede8e1)' : (isPast ? '#10b981' : 'var(--muted, #9e978e)')};">
                    ${label}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Error Banner -->
          <div id="wiz-err-banner" style="display:none;margin-bottom:16px;padding:10px 14px;background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.3);border-radius:8px;color:#ef4444;font-size:12.5px;"></div>

          <!-- Form Step Content -->
          <form id="wiz-form" autocomplete="off">
            <div id="wiz-step-container">
              ${renderStepContent(currentStep, formData)}
            </div>

            <!-- Footer Controls -->
            <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line, #33302c);padding-top:16px;margin-top:20px;">
              <div>
                ${currentStep > 1 ? `
                  <button type="button" class="btn btn-sm btn-secondary" id="wiz-prev-btn">
                    ← Back to Step ${currentStep - 1}
                  </button>
                ` : `
                  <button type="button" class="btn btn-sm btn-ghost" id="wiz-cancel-btn">Cancel</button>
                `}
              </div>

              <div style="display:flex;gap:10px;align-items:center;">
                <span style="font-size:11.5px;color:var(--muted);">Step ${currentStep} of ${totalSteps}</span>
                ${currentStep < totalSteps ? `
                  <button type="button" class="btn btn-sm btn-primary" id="wiz-next-btn" style="font-weight:700;">
                    Next Step →
                  </button>
                ` : `
                  <button type="submit" class="btn btn-sm btn-primary" id="wiz-submit-btn" style="font-weight:700;background:var(--bronze-500);border-color:var(--bronze-400);">
                    + Complete Registration &amp; Provision Access
                  </button>
                `}
              </div>
            </div>
          </form>

        </div>
      </div>
    `;

    bindStepEvents();
  }

  function renderStepContent(step, data) {
    switch (step) {
      case 1:
        return `
          <div class="space-y-4">
            <div style="font-size:13px;font-weight:800;color:var(--bronze-400);text-transform:uppercase;margin-bottom:10px;">
              Establishment Identity &amp; Classification
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Café / Outlet Trade Name *</label>
                <input type="text" id="wiz-f-name" class="form-control" value="${escHtml(data.name)}" placeholder="e.g. Calicut Beach Roastery" required style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Branch Name *</label>
                <input type="text" id="wiz-f-display" class="form-control" value="${escHtml(data.displayName)}" placeholder="e.g. Beach Road Flagship" required style="width:100%;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Legal Business Name</label>
                <input type="text" id="wiz-f-legal" class="form-control" value="${escHtml(data.legalName)}" placeholder="e.g. Zamorin Estate Private Limited" style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Establishment Category</label>
                <select id="wiz-f-type" class="form-control" style="width:100%;">
                  <option value="CAFE" ${data.cafeType === 'CAFE' ? 'selected' : ''}>Café</option>
                  <option value="RESTAURANT" ${data.cafeType === 'RESTAURANT' ? 'selected' : ''}>Restaurant</option>
                  <option value="CAFE_AND_RESTAURANT" ${data.cafeType === 'CAFE_AND_RESTAURANT' ? 'selected' : ''}>Café &amp; Restaurant</option>
                  <option value="STANDARD_CAFE" ${data.cafeType === 'STANDARD_CAFE' ? 'selected' : ''}>Standard Café</option>
                  <option value="BAKERY" ${data.cafeType === 'BAKERY' ? 'selected' : ''}>Bakery &amp; Patisserie</option>
                  <option value="QSR" ${data.cafeType === 'QSR' ? 'selected' : ''}>Quick Service Restaurant (QSR)</option>
                  <option value="KIOSK" ${data.cafeType === 'KIOSK' ? 'selected' : ''}>Kiosk / Express Bar</option>
                  <option value="FOOD_COURT" ${data.cafeType === 'FOOD_COURT' ? 'selected' : ''}>Food Court Outlet</option>
                  <option value="CAMPUS_CAFE" ${data.cafeType === 'CAMPUS_CAFE' ? 'selected' : ''}>Campus / Institutional Canteen</option>
                  <option value="OTHER" ${data.cafeType === 'OTHER' ? 'selected' : ''}>Other Food Service Establishment</option>
                </select>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Dietary Classification</label>
                <select id="wiz-f-diet" class="form-control" style="width:100%;">
                  <option value="MIXED" ${data.dietaryType === 'MIXED' ? 'selected' : ''}>Mixed (Veg &amp; Non-Veg)</option>
                  <option value="PURE_VEG" ${data.dietaryType === 'PURE_VEG' ? 'selected' : ''}>Pure Vegetarian</option>
                </select>
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Opening / Effective Date</label>
                <input type="date" id="wiz-f-date" class="form-control" value="${data.openingDate}" style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Initial Readiness State</label>
                <select id="wiz-f-status" class="form-control" style="width:100%;">
                  <option value="ACTIVE" ${data.initialStatus === 'ACTIVE' ? 'selected' : ''}>ACTIVE (Live Operations)</option>
                  <option value="CONFIGURING" ${data.initialStatus === 'CONFIGURING' ? 'selected' : ''}>CONFIGURING (Setup Phase)</option>
                  <option value="DRAFT" ${data.initialStatus === 'DRAFT' ? 'selected' : ''}>DRAFT (Planning)</option>
                </select>
              </div>
            </div>
          </div>
        `;

      case 2:
        return `
          <div class="space-y-4">
            <div style="font-size:13px;font-weight:800;color:var(--bronze-400);text-transform:uppercase;margin-bottom:10px;">
              Legal Constitution &amp; Ownership
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Legal Constitution</label>
                <select id="wiz-f-const" class="form-control" style="width:100%;">
                  <option value="PRIVATE_LIMITED" ${data.constitution === 'PRIVATE_LIMITED' ? 'selected' : ''}>Private Limited Company</option>
                  <option value="PROPRIETORSHIP" ${data.constitution === 'PROPRIETORSHIP' ? 'selected' : ''}>Sole Proprietorship</option>
                  <option value="PARTNERSHIP" ${data.constitution === 'PARTNERSHIP' ? 'selected' : ''}>Partnership Firm</option>
                  <option value="LLP" ${data.constitution === 'LLP' ? 'selected' : ''}>Limited Liability Partnership (LLP)</option>
                  <option value="PUBLIC_LIMITED" ${data.constitution === 'PUBLIC_LIMITED' ? 'selected' : ''}>Public Limited Company</option>
                  <option value="TRUST_SOCIETY" ${data.constitution === 'TRUST_SOCIETY' ? 'selected' : ''}>Trust / Society / Cooperative</option>
                </select>
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Entity PAN (Permanent Account Number)</label>
                <input type="text" id="wiz-f-pan" class="form-control" value="${escHtml(data.pan)}" placeholder="e.g. AABCZ1234M" maxlength="10" style="width:100%;text-transform:uppercase;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Corporate Identification Number (CIN / LLPIN)</label>
                <input type="text" id="wiz-f-cin" class="form-control" value="${escHtml(data.cin)}" placeholder="e.g. U55101KA2024PTC189201" style="width:100%;text-transform:uppercase;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Udyam / MSME Registration Number</label>
                <input type="text" id="wiz-f-udyam" class="form-control" value="${escHtml(data.udyamNumber)}" placeholder="e.g. UDYAM-KR-03-0000000" style="width:100%;text-transform:uppercase;" />
              </div>
            </div>
            <p style="font-size:11.5px;color:var(--muted);margin-top:6px;">
              ℹ️ Constitutional documents and regulatory thresholds are configuration-driven according to FSSAI/FoSCoS rules.
            </p>
          </div>
        `;

      case 3:
        return `
          <div class="space-y-4">
            <div style="font-size:13px;font-weight:800;color:var(--bronze-400);text-transform:uppercase;margin-bottom:10px;">
              Premises &amp; Physical Location Profile
            </div>
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Door, Building &amp; Street Address *</label>
                <input type="text" id="wiz-f-addr" class="form-control" value="${escHtml(data.addressLine1)}" placeholder="Door No., Street, Premises" required style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Landmark</label>
                <input type="text" id="wiz-f-landmark" class="form-control" value="${escHtml(data.landmark)}" placeholder="Near Beach Road Circle" style="width:100%;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">City / Town *</label>
                <input type="text" id="wiz-f-city" class="form-control" value="${escHtml(data.city)}" placeholder="Kozhikode" required style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">District</label>
                <input type="text" id="wiz-f-district" class="form-control" value="${escHtml(data.district)}" placeholder="Kozhikode" style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">State *</label>
                <input type="text" id="wiz-f-state" class="form-control" value="${escHtml(data.state)}" required style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">PIN Code</label>
                <input type="text" id="wiz-f-pin" class="form-control" value="${escHtml(data.pincode)}" placeholder="673001" maxlength="6" style="width:100%;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Premises Possession Status</label>
                <select id="wiz-f-possession" class="form-control" style="width:100%;">
                  <option value="RENTED" ${data.possessionType === 'RENTED' ? 'selected' : ''}>Rented / Leased Premises</option>
                  <option value="OWNED" ${data.possessionType === 'OWNED' ? 'selected' : ''}>Owned Freehold</option>
                  <option value="FRANCHISE" ${data.possessionType === 'FRANCHISE' ? 'selected' : ''}>Franchise Operated</option>
                </select>
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Timezone</label>
                <input type="text" class="form-control" value="Asia/Kolkata (IST)" readonly style="width:100%;color:var(--muted);" />
              </div>
            </div>
          </div>
        `;

      case 4:
        return `
          <div class="space-y-4">
            <div style="font-size:13px;font-weight:800;color:var(--bronze-400);text-transform:uppercase;margin-bottom:10px;">
              Operational Contact &amp; Trading Parameters
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Operational Phone *</label>
                <input type="text" id="wiz-f-phone" class="form-control" value="${escHtml(data.phone)}" placeholder="+91 98450 00000" required style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Branch Email</label>
                <input type="email" id="wiz-f-email" class="form-control" value="${escHtml(data.email)}" placeholder="beach.branch@zamorin.cafe" style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Branch In-Charge / Manager</label>
                <input type="text" id="wiz-f-manager" class="form-control" value="${escHtml(data.managerName)}" placeholder="Rahul K" style="width:100%;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Opening Time</label>
                <input type="time" id="wiz-f-opentime" class="form-control" value="${data.openingTime}" style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Closing Time</label>
                <input type="time" id="wiz-f-closetime" class="form-control" value="${data.closingTime}" style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Seating Capacity (Covers)</label>
                <input type="number" id="wiz-f-seats" class="form-control" value="${data.seatingCapacity}" min="0" style="width:100%;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Emergency Contact Person</label>
                <input type="text" id="wiz-f-emgname" class="form-control" value="${escHtml(data.emergencyName)}" placeholder="e.g. Operations Director" style="width:100%;" />
              </div>
              <div class="form-group">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:var(--ink);">Emergency Contact Mobile</label>
                <input type="text" id="wiz-f-emgphone" class="form-control" value="${escHtml(data.emergencyPhone)}" placeholder="+91 98450 11111" style="width:100%;" />
              </div>
            </div>
          </div>
        `;

      case 5:
        return `
          <div class="space-y-4">
            <div style="font-size:13px;font-weight:800;color:var(--bronze-400);text-transform:uppercase;margin-bottom:10px;">
              GST, FSSAI &amp; Statutory Compliance
            </div>
            
            <!-- GST Subsection -->
            <div style="background:var(--surface, #1b1a18);padding:14px;border-radius:8px;border:1px solid var(--line, #33302c);margin-bottom:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <label style="font-size:12px;font-weight:700;color:var(--ink);cursor:pointer;display:flex;align-items:center;gap:8px;">
                  <input type="checkbox" id="wiz-f-gstapp" ${data.gstApplicable ? 'checked' : ''} />
                  <span>GST Applicable &amp; Registered</span>
                </label>
                <span class="status info" style="font-size:10px;">Statutory</span>
              </div>
              <div id="wiz-gst-fields" style="display:${data.gstApplicable ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:14px;">
                <div class="form-group">
                  <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;color:var(--muted);">GSTIN (15-digit GST Identifier)</label>
                  <input type="text" id="wiz-f-gstin" class="form-control" value="${escHtml(data.gstin)}" placeholder="32AAAAA0000A1Z5" maxlength="15" style="width:100%;text-transform:uppercase;" />
                </div>
                <div class="form-group">
                  <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;color:var(--muted);">GST Taxpayer Classification</label>
                  <select class="form-control" style="width:100%;">
                    <option value="REGULAR">Regular Taxpayer</option>
                    <option value="COMPOSITION">Composition Scheme</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- FSSAI Subsection -->
            <div style="background:var(--surface, #1b1a18);padding:14px;border-radius:8px;border:1px solid var(--line, #33302c);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <label style="font-size:12px;font-weight:700;color:var(--ink);cursor:pointer;display:flex;align-items:center;gap:8px;">
                  <input type="checkbox" id="wiz-f-fssaiapp" ${data.fssaiRequired ? 'checked' : ''} />
                  <span>FSSAI Food Safety Licence / Registration</span>
                </label>
                <span class="status success" style="font-size:10px;">FoSCoS Regulated</span>
              </div>
              <div id="wiz-fssai-fields" style="display:${data.fssaiRequired ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:14px;">
                <div class="form-group">
                  <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;color:var(--muted);">FSSAI Licence Number (14 digits)</label>
                  <input type="text" id="wiz-f-fssainum" class="form-control" value="${escHtml(data.fssaiNumber)}" placeholder="10024000000000" maxlength="14" style="width:100%;" />
                </div>
                <div class="form-group">
                  <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;color:var(--muted);">FSSAI Kind of Business (Regulatory)</label>
                  <select id="wiz-f-fssaikob" class="form-control" style="width:100%;">
                    <option value="RESTAURANT" ${data.fssaiKindOfBusiness === 'RESTAURANT' ? 'selected' : ''}>Food Services — Restaurants &amp; Cafés</option>
                    <option value="FOOD_VENDING_ESTABLISHMENT" ${data.fssaiKindOfBusiness === 'FOOD_VENDING_ESTABLISHMENT' ? 'selected' : ''}>Food Vending / Kiosks / Express</option>
                    <option value="CLUB_CANTEEN_CATERER" ${data.fssaiKindOfBusiness === 'CLUB_CANTEEN_CATERER' ? 'selected' : ''}>Club / Canteen / Catering Services</option>
                  </select>
                </div>
                <div class="form-group">
                  <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;color:var(--muted);">FSSAI 2026 Category (Perpetual Regime)</label>
                  <select id="wiz-f-fssaitype" class="form-control" style="width:100%;">
                    <option value="REGISTRATION" ${data.fssaiType === 'REGISTRATION' ? 'selected' : ''}>Registration (Turnover ≤ ₹1.5 Cr)</option>
                    <option value="STATE_LICENCE" ${data.fssaiType === 'STATE_LICENCE' ? 'selected' : ''}>State Licence (Turnover ₹1.5 Cr - ₹50 Cr)</option>
                    <option value="CENTRAL_LICENCE" ${data.fssaiType === 'CENTRAL_LICENCE' ? 'selected' : ''}>Central Licence (Turnover > ₹50 Cr)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;color:var(--muted);">Applicable Statutory Annual Fee</label>
                  <input type="text" id="wiz-f-fssaifee" class="form-control" value="${data.fssaiType === 'REGISTRATION' ? '₹100 / annum (Perpetual)' : (data.fssaiType === 'CENTRAL_LICENCE' ? '₹7,500 / annum (Perpetual)' : (data.fssaiKindOfBusiness === 'RESTAURANT' ? '₹5,000 / annum (Perpetual)' : '₹2,000 / annum (Perpetual)'))}" readonly style="width:100%;color:var(--muted);" />
                </div>
              </div>
            </div>
          </div>
        `;

      case 6:
        return `
          <div class="space-y-4">
            <div style="font-size:13px;font-weight:800;color:var(--bronze-400);text-transform:uppercase;margin-bottom:10px;">
              Hardware Readiness &amp; Review
            </div>

            <div style="background:var(--surface, #1b1a18);padding:14px;border-radius:8px;border:1px solid var(--line, #33302c);margin-bottom:14px;">
              <div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:8px;">Present On-Site Hardware Profile</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink);cursor:pointer;">
                  <input type="checkbox" id="wiz-h-pos" ${data.hardware.posTerminal ? 'checked' : ''} /> POS Terminal / Register
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink);cursor:pointer;">
                  <input type="checkbox" id="wiz-h-printer" ${data.hardware.thermalPrinter ? 'checked' : ''} /> Thermal Receipt Printer (58/80mm)
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink);cursor:pointer;">
                  <input type="checkbox" id="wiz-h-customer" ${data.hardware.customerDisplay ? 'checked' : ''} /> Customer Display Screen
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink);cursor:pointer;">
                  <input type="checkbox" id="wiz-h-scanner" ${data.hardware.barcodeScanner ? 'checked' : ''} /> Barcode / QR Scanner
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink);cursor:pointer;">
                  <input type="checkbox" id="wiz-h-scale" ${data.hardware.weighingScale ? 'checked' : ''} /> Weighing Scale
                </label>
              </div>
            </div>

            <!-- Readiness Review Summary Card -->
            <div style="background:var(--surface-sunken, #121110);border:1px solid var(--line-strong, #3d3935);border-radius:8px;padding:14px;">
              <div style="font-size:11.5px;font-weight:800;color:var(--bronze-400);text-transform:uppercase;margin-bottom:8px;">
                Onboarding Readiness Profile
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
                <div><span style="color:var(--muted);">Establishment:</span> <strong style="color:var(--ink);">${escHtml(data.name || '—')}</strong></div>
                <div><span style="color:var(--muted);">Branch:</span> <strong style="color:var(--ink);">${escHtml(data.displayName || '—')}</strong></div>
                <div><span style="color:var(--muted);">Location:</span> <strong style="color:var(--ink);">${escHtml(data.city)}, ${escHtml(data.state)}</strong></div>
                <div><span style="color:var(--muted);">GSTIN:</span> <strong style="color:var(--ink);">${escHtml(data.gstin || 'Not Applicable')}</strong></div>
                <div><span style="color:var(--muted);">FSSAI:</span> <strong style="color:var(--ink);">${escHtml(data.fssaiNumber || 'Registration Pending')}</strong></div>
                <div><span style="color:var(--muted);">PIN &amp; QR:</span> <strong style="color:#10b981;">Auto-generated on Submission</strong></div>
              </div>
            </div>
          </div>
        `;

      default:
        return '';
    }
  }

  function saveCurrentStepData() {
    switch (currentStep) {
      case 1:
        formData.name = container.querySelector('#wiz-f-name')?.value?.trim() || '';
        formData.displayName = container.querySelector('#wiz-f-display')?.value?.trim() || formData.name;
        formData.legalName = container.querySelector('#wiz-f-legal')?.value?.trim() || '';
        formData.cafeType = container.querySelector('#wiz-f-type')?.value || 'STANDARD_CAFE';
        formData.dietaryType = container.querySelector('#wiz-f-diet')?.value || 'MIXED';
        formData.openingDate = container.querySelector('#wiz-f-date')?.value || '';
        formData.initialStatus = container.querySelector('#wiz-f-status')?.value || 'ACTIVE';
        break;

      case 2:
        formData.constitution = container.querySelector('#wiz-f-const')?.value || 'PRIVATE_LIMITED';
        formData.pan = container.querySelector('#wiz-f-pan')?.value?.trim() || '';
        formData.cin = container.querySelector('#wiz-f-cin')?.value?.trim() || '';
        formData.udyamNumber = container.querySelector('#wiz-f-udyam')?.value?.trim() || '';
        break;

      case 3:
        formData.addressLine1 = container.querySelector('#wiz-f-addr')?.value?.trim() || '';
        formData.landmark = container.querySelector('#wiz-f-landmark')?.value?.trim() || '';
        formData.city = container.querySelector('#wiz-f-city')?.value?.trim() || '';
        formData.district = container.querySelector('#wiz-f-district')?.value?.trim() || '';
        formData.state = container.querySelector('#wiz-f-state')?.value?.trim() || 'Kerala';
        formData.pincode = container.querySelector('#wiz-f-pin')?.value?.trim() || '';
        formData.possessionType = container.querySelector('#wiz-f-possession')?.value || 'RENTED';
        break;

      case 4:
        formData.phone = container.querySelector('#wiz-f-phone')?.value?.trim() || '';
        formData.email = container.querySelector('#wiz-f-email')?.value?.trim() || '';
        formData.managerName = container.querySelector('#wiz-f-manager')?.value?.trim() || '';
        formData.openingTime = container.querySelector('#wiz-f-opentime')?.value || '07:00';
        formData.closingTime = container.querySelector('#wiz-f-closetime')?.value || '23:00';
        formData.seatingCapacity = Number(container.querySelector('#wiz-f-seats')?.value) || 0;
        formData.emergencyName = container.querySelector('#wiz-f-emgname')?.value?.trim() || '';
        formData.emergencyPhone = container.querySelector('#wiz-f-emgphone')?.value?.trim() || '';
        break;

      case 5:
        formData.gstApplicable = container.querySelector('#wiz-f-gstapp')?.checked ?? true;
        formData.gstin = container.querySelector('#wiz-f-gstin')?.value?.trim() || '';
        formData.fssaiRequired = container.querySelector('#wiz-f-fssaiapp')?.checked ?? true;
        formData.fssaiNumber = container.querySelector('#wiz-f-fssainum')?.value?.trim() || '';
        formData.fssaiKindOfBusiness = container.querySelector('#wiz-f-fssaikob')?.value || 'RESTAURANT';
        formData.fssaiType = container.querySelector('#wiz-f-fssaitype')?.value || 'STATE_LICENCE';
        formData.fssaiExpiryDate = container.querySelector('#wiz-f-fssaiexp')?.value || '';
        break;

      case 6:
        formData.hardware = {
          posTerminal: container.querySelector('#wiz-h-pos')?.checked ?? true,
          thermalPrinter: container.querySelector('#wiz-h-printer')?.checked ?? true,
          customerDisplay: container.querySelector('#wiz-h-customer')?.checked ?? true,
          barcodeScanner: container.querySelector('#wiz-h-scanner')?.checked ?? false,
          weighingScale: container.querySelector('#wiz-h-scale')?.checked ?? false,
        };
        break;
    }
  }

  function validateStep(step) {
    saveCurrentStepData();
    const errBanner = container.querySelector('#wiz-err-banner');
    if (errBanner) errBanner.style.display = 'none';

    if (step === 1) {
      if (!formData.name) {
        showStepError('Please enter the Café / Outlet Trade Name.');
        return false;
      }
    } else if (step === 3) {
      if (!formData.addressLine1) {
        showStepError('Please enter the door/building/street address.');
        return false;
      }
      if (!formData.city) {
        showStepError('Please specify the City / Town location.');
        return false;
      }
    } else if (step === 4) {
      if (!formData.phone) {
        showStepError('Operational Phone number is mandatory for branch communications.');
        return false;
      }
    }
    return true;
  }

  function showStepError(msg) {
    const errBanner = container.querySelector('#wiz-err-banner');
    if (errBanner) {
      errBanner.textContent = msg;
      errBanner.style.display = 'block';
    }
  }

  function bindStepEvents() {
    const closeBtn = container.querySelector('#wiz-close-x-btn');
    const cancelBtn = container.querySelector('#wiz-cancel-btn');
    const closeWizard = () => { container.innerHTML = ''; };

    closeBtn?.addEventListener('click', closeWizard);
    cancelBtn?.addEventListener('click', closeWizard);

    const prevBtn = container.querySelector('#wiz-prev-btn');
    prevBtn?.addEventListener('click', () => {
      saveCurrentStepData();
      if (currentStep > 1) {
        currentStep--;
        render();
      }
    });

    const nextBtn = container.querySelector('#wiz-next-btn');
    nextBtn?.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        if (currentStep < totalSteps) {
          currentStep++;
          render();
        }
      }
    });

    // Step 5 toggle visibility
    const gstCheck = container.querySelector('#wiz-f-gstapp');
    gstCheck?.addEventListener('change', (e) => {
      const gF = container.querySelector('#wiz-gst-fields');
      if (gF) gF.style.display = e.target.checked ? 'grid' : 'none';
    });

    const fssaiCheck = container.querySelector('#wiz-f-fssaiapp');
    fssaiCheck?.addEventListener('change', (e) => {
      const fF = container.querySelector('#wiz-fssai-fields');
      if (fF) fF.style.display = e.target.checked ? 'grid' : 'none';
    });

    const updateFeeDisplay = () => {
      const kob = container.querySelector('#wiz-f-fssaikob')?.value || 'RESTAURANT';
      const tier = container.querySelector('#wiz-f-fssaitype')?.value || 'STATE_LICENCE';
      const feeInput = container.querySelector('#wiz-f-fssaifee');
      if (!feeInput) return;
      if (tier === 'REGISTRATION') {
        feeInput.value = '₹100 / annum (Perpetual)';
      } else if (tier === 'CENTRAL_LICENCE') {
        feeInput.value = '₹7,500 / annum (Perpetual)';
      } else {
        const fee = kob === 'RESTAURANT' ? 5000 : 2000;
        feeInput.value = `₹${fee.toLocaleString('en-IN')} / annum (Perpetual)`;
      }
    };

    container.querySelector('#wiz-f-fssaikob')?.addEventListener('change', updateFeeDisplay);
    container.querySelector('#wiz-f-fssaitype')?.addEventListener('change', updateFeeDisplay);

    // Final form submission
    const form = container.querySelector('#wiz-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateStep(currentStep)) return;

      const submitBtn = container.querySelector('#wiz-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Configuring &amp; Provisioning Location...</span>`;
      }

      try {
        const res = await apiPost('/cafes', {
          body: {
            name: formData.name,
            displayName: formData.displayName,
            legalName: formData.legalName,
            cafeType: formData.cafeType,
            status: formData.initialStatus,
            openingDate: formData.openingDate,
            address: formData.addressLine1,
            landmark: formData.landmark,
            city: formData.city,
            district: formData.district,
            state: formData.state,
            pincode: formData.pincode,
            phone: formData.phone,
            email: formData.email,
            managerName: formData.managerName,
            openingTime: formData.openingTime,
            closingTime: formData.closingTime,
            gstin: formData.gstin,
            fssaiNumber: formData.fssaiNumber,
            fssaiKindOfBusiness: formData.fssaiKindOfBusiness || 'RESTAURANT',
            fssaiType: formData.fssaiType || 'STATE_LICENCE',
            seatingCapacity: formData.seatingCapacity,
            hardwareProfile: formData.hardware,
          },
        });

        const cafe = res?.data?.cafe;
        const access = res?.data?.access;

        showToast(`Café "${formData.name}" onboarded & access provisioned!`, 'success');
        renderSuccessScreen(container, { cafe, access }, opts);
      } catch (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>+ Complete Registration &amp; Provision Access</span>`;
        }
        showStepError(err?.message || 'Failed to provision café. Please verify fields and retry.');
      }
    });
  }

  render();
}

function renderSuccessScreen(container, { cafe, access }, opts) {
  let pinRevealed = false;
  const pin = access?.permanentCafePin || '••••••';
  const cafeId = cafe?.cafeId || access?.cafeId || 'ZC-0000';
  const qrUrl = access?.qrUrl || '';
  const linkUrl = access?.linkUrl || '';

  container.innerHTML = `
    <div class="modal-backdrop" style="position:fixed;inset:0;background:rgba(18,17,16,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);">
      <div class="modal-card card" style="width:780px;max-width:96vw;max-height:92vh;overflow-y:auto;padding:28px;background:var(--surface-raised, #242220);border:1px solid var(--bronze-500, #b17d38);box-shadow:var(--shadow-2xl);border-radius:var(--radius-lg, 12px);">

        <!-- Header -->
        <div style="text-align:center;margin-bottom:24px;border-bottom:1px solid var(--line, #33302c);padding-bottom:18px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.3);border-radius:50%;color:#10b981;font-size:24px;margin-bottom:10px;">
            ✓
          </div>
          <h2 style="margin:0 0 6px;font-size:22px;font-weight:800;color:var(--ink, #ede8e1);">Café Created Successfully</h2>
          <div style="font-size:13.5px;color:var(--muted, #9e978e);display:flex;align-items:center;justify-content:center;gap:8px;">
            <strong style="color:var(--ink);">${escHtml(cafe?.name)}</strong>
            <span>·</span>
            <span style="font-family:var(--font-mono);font-weight:700;color:var(--bronze-500);">${escHtml(cafeId)}</span>
            <span>·</span>
            <span class="status success" style="font-size:10.5px;font-weight:700;">ACCESS READY</span>
          </div>
        </div>

        <!-- Credentials Grid -->
        <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:24px;">

          <!-- Card 1: Official Café Identifier & Secure Context -->
          <div style="background:var(--surface, #1b1a18);border:1px solid var(--line, #33302c);border-radius:10px;padding:18px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
              <div>
                <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:var(--bronze-400);">
                  OFFICIAL CAFÉ IDENTIFIER &amp; ONE-TIME SETUP CODE
                </div>
                <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">
                  🔒 Official unique ID. Users authenticate with ERP credentials after resolving Café context via QR/Link.
                </div>
              </div>
              <span class="status success" style="font-size:10.5px;font-weight:700;">PROVISIONED</span>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-sunken, #121110);border:1px solid var(--line-strong, #3d3935);border-radius:8px;padding:12px 18px;">
              <div>
                <div style="font-size:11px;color:var(--muted);">OFFICIAL CAFÉ ID:</div>
                <div id="succ-cafe-id-display" style="font-family:var(--font-mono);font-size:22px;font-weight:800;letter-spacing:0.1em;color:var(--ink);">
                  ${escHtml(cafeId)}
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-xs btn-primary" id="succ-copy-id-btn" type="button">Copy Café ID</button>
              </div>
            </div>
          </div>

          <!-- Card 2: Dedicated QR Credential -->
          <div style="background:var(--surface, #1b1a18);border:1px solid var(--line, #33302c);border-radius:10px;padding:18px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
              <div>
                <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:var(--bronze-400);">
                  DEDICATED CAFÉ OPERATIONS QR CODE
                </div>
                <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">
                  High-entropy access credential. Resolves directly to the ${escHtml(cafe?.name)} gateway.
                </div>
              </div>
              <span class="status info" style="font-size:10.5px;font-weight:700;">QR v1 ACTIVE</span>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-sunken, #121110);border:1px solid var(--line-strong, #3d3935);border-radius:8px;padding:12px 18px;gap:12px;flex-wrap:wrap;">
              <div style="font-family:var(--font-mono);font-size:11.5px;color:var(--muted);word-break:break-all;flex:1;">
                ${escHtml(qrUrl)}
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-xs btn-primary" id="succ-view-qr-btn" type="button">View QR</button>
                <button class="btn btn-xs btn-secondary" id="succ-fs-qr-btn" type="button">Full Screen</button>
                <button class="btn btn-xs btn-secondary" id="succ-dl-qr-btn" type="button">Download</button>
                <button class="btn btn-xs btn-secondary" id="succ-print-qr-btn" type="button">Print Card</button>
                <button class="btn btn-xs btn-ghost" id="succ-copy-qr-btn" type="button">Copy URL</button>
              </div>
            </div>
          </div>

          <!-- Card 3: Dedicated Login Link -->
          <div style="background:var(--surface, #1b1a18);border:1px solid var(--line, #33302c);border-radius:10px;padding:18px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
              <div>
                <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:var(--bronze-400);">
                  DEDICATED OPERATIONS LOGIN LINK
                </div>
                <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">
                  Opaque browser link for desktop / register access without typing.
                </div>
              </div>
              <span class="status info" style="font-size:10.5px;font-weight:700;">LINK v1 ACTIVE</span>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-sunken, #121110);border:1px solid var(--line-strong, #3d3935);border-radius:8px;padding:12px 18px;gap:12px;flex-wrap:wrap;">
              <div style="font-family:var(--font-mono);font-size:11.5px;color:var(--muted);word-break:break-all;flex:1;">
                ${escHtml(linkUrl)}
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-xs btn-secondary" id="succ-copy-link-btn" type="button">Copy Link</button>
                <a href="${escHtml(linkUrl)}" target="_blank" rel="noopener" class="btn btn-xs btn-ghost" style="text-decoration:none;">Open →</a>
              </div>
            </div>
          </div>

        </div>

        <!-- Footer Navigation -->
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line, #33302c);padding-top:18px;flex-wrap:wrap;gap:10px;">
          <button class="btn btn-sm btn-ghost" id="succ-create-another-btn" type="button">
            + Create Another Café
          </button>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-sm btn-secondary" id="succ-view-access-btn" type="button">
              View Café Access →
            </button>
            <button class="btn btn-sm btn-primary" id="succ-done-btn" type="button" style="font-weight:700;">
              Done / Return to Cafés
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  // Copy Official Café ID
  container.querySelector('#succ-copy-id-btn')?.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cafeId);
      showToast(`Official Café ID ${cafeId} copied to clipboard!`, 'info');
    }
  });

  // QR Modal View
  container.querySelector('#succ-view-qr-btn')?.addEventListener('click', () => {
    openQrViewerModal({
      title: `${cafe?.name || 'Café'} — Operations QR`,
      value: qrUrl,
      cafeId: cafeId,
      fullScreen: false,
    });
  });

  // Full Screen QR
  container.querySelector('#succ-fs-qr-btn')?.addEventListener('click', () => {
    openQrViewerModal({
      title: `${cafe?.name || 'Café'} — Operations QR`,
      value: qrUrl,
      cafeId: cafeId,
      fullScreen: true,
    });
  });

  // Download QR SVG
  container.querySelector('#succ-dl-qr-btn')?.addEventListener('click', () => {
    downloadQrSvg(qrUrl, `${cafeId}_Operations_QR.svg`, {
      title: `${cafe?.name} Operations QR`,
      subtitle: `Official ID: ${cafeId} · Operations QR Gateway`,
    });
    showToast('Operations QR SVG downloaded.', 'success');
  });

  // Print QR Card
  container.querySelector('#succ-print-qr-btn')?.addEventListener('click', () => {
    printQrCard({
      title: `${cafe?.name} Operations QR`,
      subtitle: `Official ID: ${cafeId} · Scan for Café Gateway`,
      value: qrUrl,
    });
  });

  // Copy QR URL
  container.querySelector('#succ-copy-qr-btn')?.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(qrUrl);
      showToast('Operations QR URL copied to clipboard!', 'info');
    }
  });

  // Copy Link URL
  container.querySelector('#succ-copy-link-btn')?.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(linkUrl);
      showToast('Dedicated login link copied to clipboard!', 'info');
    }
  });

  // Create Another
  container.querySelector('#succ-create-another-btn')?.addEventListener('click', () => {
    openCafeCreateModal(container.parentElement, opts);
  });

  // Open Full Access Management
  container.querySelector('#succ-view-access-btn')?.addEventListener('click', () => {
    container.innerHTML = '';
    openCafeAccessManagementModal(cafeId, container.parentElement);
  });

  // Done button
  container.querySelector('#succ-done-btn')?.addEventListener('click', () => {
    container.innerHTML = '';
    if (typeof opts.onSuccess === 'function') {
      opts.onSuccess(cafe);
    }
  });
}

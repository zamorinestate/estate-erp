// =============================================================================
// ZAMORIN CAFÉ ERP — MULTI-STEP CAFÉ ONBOARDING & ACCESS PACK HANDOVER WIZARD
// Authoritative Lifecycle: Details → Validate → Preview → Confirm → Provision → Access Pack
// Fully conforms to Design Tokens (Dark Navy / Bronze Zamorin Theme)
// =============================================================================

'use strict';

import { apiPost } from '../apiClient.js';
import { showToast } from '../components.js';
import { openCafeAccessManagementModal } from './cafeAccessManagementModal.js';
import { generateQrSvg, downloadQrSvg, downloadQrPng, openQrViewerModal } from '../utils/qrCodeGen.js';

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function copyToClipboard(text, successMsg, btnEl) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast(successMsg, 'success');
    if (btnEl) {
      const orig = btnEl.innerHTML;
      btnEl.innerHTML = `Copied ✓`;
      setTimeout(() => { btnEl.innerHTML = orig; }, 2000);
    }
  } catch {
    showToast('Clipboard access unavailable. Please copy manually.', 'warning');
  }
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
  // Steps: 1. Identity, 2. Legal, 3. Premises, 4. Contacts, 5. Compliance, 6. Operations & Hardware, 7. Review & Preview
  let currentStep = 1;
  const totalSteps = 7;

  const formData = {
    // 1. Identity
    name: '',
    displayName: '',
    legalName: '',
    branchName: '',
    cafeType: 'STANDARD_CAFE',
    establishmentCategory: 'Café',
    dietaryType: 'MIXED',
    openingDate: new Date().toISOString().split('T')[0],
    initialStatus: 'ACTIVE',

    // 2. Legal & Statutory
    constitution: 'PRIVATE_LIMITED',
    legalOwnerName: 'Zamorin Speciality Coffee & Kitchens Pvt. Ltd.',
    pan: '',
    cin: '',
    udyamNumber: '',

    // 3. Premises & Location
    addressLine1: '',
    landmark: '',
    city: '',
    district: '',
    state: 'Kerala',
    stateCode: '32',
    pincode: '',
    country: 'India',
    possessionType: 'RENTED',
    latitude: null,
    longitude: null,
    geofenceRadiusMetres: 100,

    // 4. Contacts
    phone: '',
    alternatePhone: '',
    email: '',
    managerName: '',
    emergencyName: '',
    emergencyPhone: '',

    // 5. Compliance
    gstApplicable: true,
    gstin: '',
    fssaiRequired: true,
    fssaiNumber: '',
    fssaiKindOfBusiness: 'RESTAURANT',
    fssaiType: 'STATE_LICENCE',

    // 6. Operations & Hardware
    seatingCapacity: 48,
    openingTime: '07:00',
    closingTime: '23:00',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    hardware: {
      posTerminal: true,
      thermalPrinter: true,
      kitchenPrinter: true,
      barcodeScanner: false,
      weighingScale: false,
      customerDisplay: true,
    },
  };

  function saveCurrentStepData() {
    if (currentStep === 1) {
      formData.name = container.querySelector('#wiz-f-name')?.value?.trim() || formData.name;
      formData.displayName = container.querySelector('#wiz-f-display')?.value?.trim() || formData.displayName;
      formData.legalName = container.querySelector('#wiz-f-legal')?.value?.trim() || formData.legalName;
      formData.branchName = container.querySelector('#wiz-f-branch')?.value?.trim() || formData.branchName;
      formData.cafeType = container.querySelector('#wiz-f-type')?.value || formData.cafeType;
      formData.dietaryType = container.querySelector('#wiz-f-diet')?.value || formData.dietaryType;
      formData.openingDate = container.querySelector('#wiz-f-date')?.value || formData.openingDate;
      formData.initialStatus = container.querySelector('#wiz-f-status')?.value || formData.initialStatus;
    } else if (currentStep === 2) {
      formData.constitution = container.querySelector('#wiz-f-const')?.value || formData.constitution;
      formData.legalOwnerName = container.querySelector('#wiz-f-owner')?.value?.trim() || formData.legalOwnerName;
      formData.pan = container.querySelector('#wiz-f-pan')?.value?.trim().toUpperCase() || formData.pan;
      formData.cin = container.querySelector('#wiz-f-cin')?.value?.trim().toUpperCase() || formData.cin;
      formData.udyamNumber = container.querySelector('#wiz-f-udyam')?.value?.trim() || formData.udyamNumber;
    } else if (currentStep === 3) {
      formData.addressLine1 = container.querySelector('#wiz-f-addr')?.value?.trim() || formData.addressLine1;
      formData.landmark = container.querySelector('#wiz-f-landmark')?.value?.trim() || formData.landmark;
      formData.city = container.querySelector('#wiz-f-city')?.value?.trim() || formData.city;
      formData.district = container.querySelector('#wiz-f-dist')?.value?.trim() || formData.district;
      formData.state = container.querySelector('#wiz-f-state')?.value || formData.state;
      formData.pincode = container.querySelector('#wiz-f-pin')?.value?.trim() || formData.pincode;
      formData.possessionType = container.querySelector('#wiz-f-poss')?.value || formData.possessionType;
      const latitudeValue = container.querySelector('#wiz-f-latitude')?.value?.trim();
      const longitudeValue = container.querySelector('#wiz-f-longitude')?.value?.trim();
      const radiusValue = container.querySelector('#wiz-f-geofence-radius')?.value?.trim();
      formData.latitude = latitudeValue ? Number(latitudeValue) : null;
      formData.longitude = longitudeValue ? Number(longitudeValue) : null;
      formData.geofenceRadiusMetres = radiusValue ? Number(radiusValue) : 100;
    } else if (currentStep === 4) {
      formData.phone = container.querySelector('#wiz-f-phone')?.value?.trim() || formData.phone;
      formData.alternatePhone = container.querySelector('#wiz-f-altphone')?.value?.trim() || formData.alternatePhone;
      formData.email = container.querySelector('#wiz-f-email')?.value?.trim() || formData.email;
      formData.managerName = container.querySelector('#wiz-f-mgr')?.value?.trim() || formData.managerName;
      formData.emergencyName = container.querySelector('#wiz-f-emg-name')?.value?.trim() || formData.emergencyName;
      formData.emergencyPhone = container.querySelector('#wiz-f-emg-phone')?.value?.trim() || formData.emergencyPhone;
    } else if (currentStep === 5) {
      formData.gstApplicable = Boolean(container.querySelector('#wiz-f-gstapp')?.checked);
      formData.gstin = container.querySelector('#wiz-f-gstin')?.value?.trim().toUpperCase() || formData.gstin;
      formData.fssaiRequired = Boolean(container.querySelector('#wiz-f-fssaiapp')?.checked);
      formData.fssaiNumber = container.querySelector('#wiz-f-fssainum')?.value?.trim() || formData.fssaiNumber;
      formData.fssaiKindOfBusiness = container.querySelector('#wiz-f-fssaikob')?.value || formData.fssaiKindOfBusiness;
      formData.fssaiType = container.querySelector('#wiz-f-fssaitype')?.value || formData.fssaiType;
    } else if (currentStep === 6) {
      formData.seatingCapacity = parseInt(container.querySelector('#wiz-f-seats')?.value || '48', 10);
      formData.openingTime = container.querySelector('#wiz-f-opentime')?.value || formData.openingTime;
      formData.closingTime = container.querySelector('#wiz-f-closetime')?.value || formData.closingTime;
      if (container.querySelector('#wiz-h-pos')) {
        formData.hardware.posTerminal = container.querySelector('#wiz-h-pos').checked;
        formData.hardware.thermalPrinter = container.querySelector('#wiz-h-printer').checked;
        formData.hardware.kitchenPrinter = container.querySelector('#wiz-h-kprinter').checked;
        formData.hardware.barcodeScanner = container.querySelector('#wiz-h-scanner').checked;
        formData.hardware.customerDisplay = container.querySelector('#wiz-h-display').checked;
      }
    }
  }

  function validateStep(step) {
    saveCurrentStepData();
    hideStepError();

    if (step === 1) {
      if (!formData.name) return showStepError('Café Trade Name is required.');
      if (!formData.displayName) return showStepError('Branch / Display Name is required.');
    } else if (step === 2) {
      if (formData.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.pan)) {
        return showStepError('Invalid PAN format (e.g. ABCDE1234F).');
      }
    } else if (step === 3) {
      if (!formData.addressLine1) return showStepError('Premises / Street address is required.');
      if (!formData.city) return showStepError('City is required.');
      if (!formData.pincode || !/^\d{6}$/.test(formData.pincode)) {
        return showStepError('A valid 6-digit PIN code is required.');
      }
      const hasLat = Number.isFinite(formData.latitude);
      const hasLng = Number.isFinite(formData.longitude);
      if (formData.initialStatus !== 'DRAFT' && (!hasLat || !hasLng)) {
        return showStepError('Attendance geofence coordinates are required before an operational café can be created. Use Current Location or enter latitude and longitude.');
      }
      if (hasLat && (formData.latitude < -90 || formData.latitude > 90)) {
        return showStepError('Latitude must be between -90 and 90.');
      }
      if (hasLng && (formData.longitude < -180 || formData.longitude > 180)) {
        return showStepError('Longitude must be between -180 and 180.');
      }
      if (!Number.isFinite(formData.geofenceRadiusMetres) || formData.geofenceRadiusMetres < 10 || formData.geofenceRadiusMetres > 1000) {
        return showStepError('Attendance geofence radius must be between 10 and 1000 metres.');
      }
    } else if (step === 4) {
      if (!formData.phone || !/^\+?[0-9\s-]{10,15}$/.test(formData.phone)) {
        return showStepError('A valid primary contact phone number is required (min 10 digits).');
      }
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        return showStepError('Official email address format is invalid.');
      }
    } else if (step === 5) {
      if (formData.gstApplicable && formData.gstin) {
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gstin)) {
          return showStepError('Invalid GSTIN format (15 characters alphanumeric).');
        }
      }
      if (formData.fssaiRequired && formData.fssaiNumber) {
        if (!/^\d{14}$/.test(formData.fssaiNumber)) {
          return showStepError('FSSAI Registration/Licence number must be exactly 14 numeric digits.');
        }
      }
    }
    return true;
  }

  function showStepError(msg) {
    const banner = container.querySelector('#wiz-err-banner');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = 'block';
      banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return false;
  }

  function hideStepError() {
    const banner = container.querySelector('#wiz-err-banner');
    if (banner) banner.style.display = 'none';
  }

  function render() {
    container.innerHTML = `
      <div class="modal-backdrop" id="cafe-create-backdrop" style="position:fixed;inset:0;background:rgba(11,20,36,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);">
        <div class="modal-card card" style="width:880px;max-width:96vw;max-height:92vh;overflow-y:auto;padding:26px;background:#1a2740;border:1px solid #3d4f6f;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);border-radius:12px;color:#ede8e1;">

          <!-- Top Bar -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid #29374f;padding-bottom:12px;">
            <div>
              <div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#b17d38;text-transform:uppercase;">
                <span>☕</span> ZAMORIN CAFÉ ERP · PRIMARY MASTER
              </div>
              <h2 style="margin:2px 0 0;font-size:19px;font-weight:800;color:#ede8e1;">New Café Establishment Onboarding</h2>
            </div>
            <button class="btn btn-xs btn-ghost" id="wiz-close-x-btn" type="button" style="font-size:16px;line-height:1;padding:4px 8px;cursor:pointer;color:#9e978e;">✕</button>
          </div>

          <!-- Wizard Step Indicator Progress -->
          <div style="display:grid;grid-template-columns:repeat(${totalSteps}, 1fr);gap:6px;margin-bottom:20px;">
            ${[
              '1. Identity',
              '2. Legal',
              '3. Premises',
              '4. Contacts',
              '5. Compliance',
              '6. Operations',
              '7. Review'
            ].map((label, idx) => {
              const stepNum = idx + 1;
              const isActive = stepNum === currentStep;
              const isPast = stepNum < currentStep;
              return `
                <div style="text-align:center;">
                  <div style="height:4px;border-radius:2px;background:${isActive ? '#b17d38' : (isPast ? '#1e7a4c' : '#29374f')};margin-bottom:4px;transition:background 0.2s;"></div>
                  <div style="font-size:10px;font-weight:${isActive ? '800' : '600'};color:${isActive ? '#ede8e1' : (isPast ? '#10b981' : '#8892a0')};">
                    ${label}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Error Banner -->
          <div id="wiz-err-banner" style="display:none;margin-bottom:16px;padding:10px 14px;background:rgba(220,38,38,0.18);border:1px solid rgba(220,38,38,0.4);border-radius:8px;color:#fca5a5;font-size:12.5px;"></div>

          <!-- Step Content Container -->
          <form id="wiz-form" autocomplete="off">
            <div id="wiz-step-container">
              ${renderStepContent(currentStep, formData)}
            </div>

            <!-- Footer Controls -->
            <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #29374f;padding-top:16px;margin-top:20px;">
              <div>
                ${currentStep > 1 ? `
                  <button type="button" class="btn btn-sm btn-secondary" id="wiz-prev-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">
                    ← Back to Step ${currentStep - 1}
                  </button>
                ` : `
                  <button type="button" class="btn btn-sm btn-ghost" id="wiz-cancel-btn" style="color:#8892a0;">Cancel</button>
                `}
              </div>

              <div style="display:flex;gap:10px;align-items:center;">
                <span style="font-size:11.5px;color:#8892a0;">Step ${currentStep} of ${totalSteps}</span>
                ${currentStep < totalSteps ? `
                  <button type="button" class="btn btn-sm btn-primary" id="wiz-next-btn" style="font-weight:700;background:#b17d38;border-color:#c99a5c;color:#101a30;">
                    ${currentStep === 6 ? 'Review & Preview →' : 'Next Step →'}
                  </button>
                ` : `
                  <button type="button" class="btn btn-sm btn-primary" id="wiz-open-confirm-btn" style="font-weight:800;background:#b17d38;border-color:#c99a5c;color:#101a30;padding:8px 18px;">
                    CONFIRM &amp; CREATE CAFÉ →
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
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="font-size:13px;font-weight:800;color:#c99a5c;text-transform:uppercase;">
              Establishment Identity &amp; Classification
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Café / Restaurant Trade Name *</label>
                <input type="text" id="wiz-f-name" class="input" value="${escHtml(data.name)}" placeholder="e.g. Zamorin Café — Alangad" required style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Branch / Display Name *</label>
                <input type="text" id="wiz-f-display" class="input" value="${escHtml(data.displayName)}" placeholder="e.g. Alangad High Street Outlet" required style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Legal Entity Name</label>
                <input type="text" id="wiz-f-legal" class="input" value="${escHtml(data.legalName)}" placeholder="e.g. Zamorin Speciality Coffee &amp; Kitchens Pvt. Ltd." style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Establishment Category</label>
                <select id="wiz-f-type" class="input" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;">
                  <option value="STANDARD_CAFE" ${data.cafeType === 'STANDARD_CAFE' ? 'selected' : ''}>Standard Café</option>
                  <option value="CAFE" ${data.cafeType === 'CAFE' ? 'selected' : ''}>Café &amp; Roastery</option>
                  <option value="RESTAURANT" ${data.cafeType === 'RESTAURANT' ? 'selected' : ''}>Restaurant &amp; Dine-in</option>
                  <option value="CAFE_AND_RESTAURANT" ${data.cafeType === 'CAFE_AND_RESTAURANT' ? 'selected' : ''}>Café &amp; Restaurant</option>
                  <option value="KIOSK" ${data.cafeType === 'KIOSK' ? 'selected' : ''}>Kiosk / Express Bar</option>
                  <option value="FOOD_COURT" ${data.cafeType === 'FOOD_COURT' ? 'selected' : ''}>Food Court Outlet</option>
                  <option value="CAMPUS_CAFE" ${data.cafeType === 'CAMPUS_CAFE' ? 'selected' : ''}>Campus / Institutional Café</option>
                </select>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Dietary Classification</label>
                <select id="wiz-f-diet" class="input" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;">
                  <option value="MIXED" ${data.dietaryType === 'MIXED' ? 'selected' : ''}>Mixed (Veg &amp; Non-Veg)</option>
                  <option value="PURE_VEG" ${data.dietaryType === 'PURE_VEG' ? 'selected' : ''}>Pure Vegetarian</option>
                </select>
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Opening / Launch Date</label>
                <input type="date" id="wiz-f-date" class="input" value="${data.openingDate}" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Initial Operational Status</label>
                <select id="wiz-f-status" class="input" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;">
                  <option value="ACTIVE" ${data.initialStatus === 'ACTIVE' ? 'selected' : ''}>ACTIVE (Operational)</option>
                  <option value="CONFIGURING" ${data.initialStatus === 'CONFIGURING' ? 'selected' : ''}>CONFIGURING (Pre-launch)</option>
                  <option value="DRAFT" ${data.initialStatus === 'DRAFT' ? 'selected' : ''}>DRAFT (Planning)</option>
                </select>
              </div>
            </div>
          </div>
        `;

      case 2:
        return `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="font-size:13px;font-weight:800;color:#c99a5c;text-transform:uppercase;">
              Legal Constitution &amp; Statutory Identifiers
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Legal Constitution Structure</label>
                <select id="wiz-f-const" class="input" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;">
                  <option value="PRIVATE_LIMITED" ${data.constitution === 'PRIVATE_LIMITED' ? 'selected' : ''}>Private Limited Company</option>
                  <option value="PROPRIETORSHIP" ${data.constitution === 'PROPRIETORSHIP' ? 'selected' : ''}>Sole Proprietorship</option>
                  <option value="PARTNERSHIP" ${data.constitution === 'PARTNERSHIP' ? 'selected' : ''}>Partnership Firm</option>
                  <option value="LLP" ${data.constitution === 'LLP' ? 'selected' : ''}>Limited Liability Partnership (LLP)</option>
                </select>
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Legal Owner / Entity Name</label>
                <input type="text" id="wiz-f-owner" class="input" value="${escHtml(data.legalOwnerName)}" placeholder="e.g. Zamorin Speciality Coffee Pvt. Ltd." style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Permanent Account Number (PAN)</label>
                <input type="text" id="wiz-f-pan" class="input" value="${escHtml(data.pan)}" placeholder="ABCDE1234F" maxlength="10" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;text-transform:uppercase;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Corporate Identity (CIN)</label>
                <input type="text" id="wiz-f-cin" class="input" value="${escHtml(data.cin)}" placeholder="U55101KL2024PTC..." maxlength="21" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;text-transform:uppercase;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">MSME / Udyam Number</label>
                <input type="text" id="wiz-f-udyam" class="input" value="${escHtml(data.udyamNumber)}" placeholder="UDYAM-KL-..." style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
            </div>
          </div>
        `;

      case 3:
        return `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="font-size:13px;font-weight:800;color:#c99a5c;text-transform:uppercase;">
              Premises &amp; Physical Location
            </div>
            <div>
              <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Premises, Building &amp; Street Address *</label>
              <input type="text" id="wiz-f-addr" class="input" value="${escHtml(data.addressLine1)}" placeholder="e.g. Ground Floor, Heritage Square, Alangad Main Road" required style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Area / Landmark</label>
                <input type="text" id="wiz-f-landmark" class="input" value="${escHtml(data.landmark)}" placeholder="e.g. Near Junction Roundabout" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">City / Town *</label>
                <input type="text" id="wiz-f-city" class="input" value="${escHtml(data.city)}" placeholder="e.g. Alangad" required style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">District</label>
                <input type="text" id="wiz-f-dist" class="input" value="${escHtml(data.district)}" placeholder="e.g. Ernakulam" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">State</label>
                <select id="wiz-f-state" class="input" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;">
                  <option value="Kerala" ${data.state === 'Kerala' ? 'selected' : ''}>Kerala (32)</option>
                  <option value="Karnataka" ${data.state === 'Karnataka' ? 'selected' : ''}>Karnataka (29)</option>
                  <option value="Tamil Nadu" ${data.state === 'Tamil Nadu' ? 'selected' : ''}>Tamil Nadu (33)</option>
                  <option value="Maharashtra" ${data.state === 'Maharashtra' ? 'selected' : ''}>Maharashtra (27)</option>
                </select>
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">PIN Code *</label>
                <input type="text" id="wiz-f-pin" class="input" value="${escHtml(data.pincode)}" placeholder="683511" maxlength="6" required style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
            </div>

            <div style="background:#101a30;border:1px solid #3d4f6f;border-radius:8px;padding:14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
                <div>
                  <div style="font-size:12px;font-weight:800;color:#c99a5c;">Attendance Geofence *</div>
                  <div style="font-size:11px;color:#8892a0;margin-top:2px;">Used for employee QR → GPS → live selfie Check-In and Check-Out.</div>
                </div>
                <button type="button" class="btn btn-sm btn-secondary" id="wiz-use-current-location-btn">📍 Use Current Location</button>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div>
                  <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Latitude</label>
                  <input type="number" id="wiz-f-latitude" step="0.000001" min="-90" max="90" class="input" value="${data.latitude ?? ''}" placeholder="10.786730" style="width:100%;background:#1a2740;border:1px solid #29374f;color:#ede8e1;padding:8px 10px;border-radius:6px;" />
                </div>
                <div>
                  <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Longitude</label>
                  <input type="number" id="wiz-f-longitude" step="0.000001" min="-180" max="180" class="input" value="${data.longitude ?? ''}" placeholder="76.654793" style="width:100%;background:#1a2740;border:1px solid #29374f;color:#ede8e1;padding:8px 10px;border-radius:6px;" />
                </div>
                <div>
                  <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Allowed Radius (metres)</label>
                  <input type="number" id="wiz-f-geofence-radius" min="10" max="1000" step="1" class="input" value="${data.geofenceRadiusMetres ?? 100}" style="width:100%;background:#1a2740;border:1px solid #29374f;color:#ede8e1;padding:8px 10px;border-radius:6px;" />
                </div>
              </div>
              <div id="wiz-geofence-location-status" style="font-size:11px;color:#8892a0;margin-top:8px;">
                Set the café's physical attendance point. The browser may ask for location permission.
              </div>
            </div>
          </div>
        `;

      case 4:
        return `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="font-size:13px;font-weight:800;color:#c99a5c;text-transform:uppercase;">
              Official Contacts &amp; Store Management
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Primary Store Contact Phone *</label>
                <input type="tel" id="wiz-f-phone" class="input" value="${escHtml(data.phone)}" placeholder="+91 98470 12345" required style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Alternate / WhatsApp Number</label>
                <input type="tel" id="wiz-f-altphone" class="input" value="${escHtml(data.alternatePhone)}" placeholder="+91 98470 54321" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Official Store Email Address</label>
                <input type="email" id="wiz-f-email" class="input" value="${escHtml(data.email)}" placeholder="alangad@zamorin.cafe" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Designated Store Manager / Admin</label>
                <input type="text" id="wiz-f-mgr" class="input" value="${escHtml(data.managerName)}" placeholder="e.g. Anand Varma" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Emergency Contact Name</label>
                <input type="text" id="wiz-f-emg-name" class="input" value="${escHtml(data.emergencyName)}" placeholder="e.g. Operations Lead" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Emergency Phone Number</label>
                <input type="tel" id="wiz-f-emg-phone" class="input" value="${escHtml(data.emergencyPhone)}" placeholder="+91 94470 99999" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
            </div>
          </div>
        `;

      case 5:
        return `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="font-size:13px;font-weight:800;color:#c99a5c;text-transform:uppercase;">
              GSTIN &amp; FSSAI Statutory Compliance (2026 Framework)
            </div>

            <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:14px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#ede8e1;cursor:pointer;">
                <input type="checkbox" id="wiz-f-gstapp" ${data.gstApplicable ? 'checked' : ''} style="width:16px;height:16px;" />
                GST Registration Applicable for this Location
              </label>
              <div id="wiz-gst-fields" style="display:${data.gstApplicable ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:14px;margin-top:12px;">
                <div>
                  <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">GSTIN (15 Digits)</label>
                  <input type="text" id="wiz-f-gstin" class="input" value="${escHtml(data.gstin)}" placeholder="32AAAAA0000A1Z5" maxlength="15" style="width:100%;background:#1a2740;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;text-transform:uppercase;" />
                </div>
                <div>
                  <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Taxpayer Category</label>
                  <input type="text" class="input" value="REGULAR (Tax Invoice / Credit Note)" readonly style="width:100%;background:#1a2740;border:1px solid #29374f;color:#8892a0;padding:8px 12px;border-radius:6px;" />
                </div>
              </div>
            </div>

            <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:14px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#ede8e1;cursor:pointer;">
                <input type="checkbox" id="wiz-f-fssaiapp" ${data.fssaiRequired ? 'checked' : ''} style="width:16px;height:16px;" />
                FSSAI Food Safety Licence Applicable
              </label>
              <div id="wiz-fssai-fields" style="display:${data.fssaiRequired ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:14px;margin-top:12px;">
                <div>
                  <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">FSSAI Licence Number (14 Digits)</label>
                  <input type="text" id="wiz-fssainum" class="input" value="${escHtml(data.fssaiNumber)}" placeholder="11324001000123" maxlength="14" style="width:100%;background:#1a2740;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
                </div>
                <div>
                  <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Kind of Business (FoSCoS 2026)</label>
                  <select id="wiz-f-fssaikob" class="input" style="width:100%;background:#1a2740;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;">
                    <option value="RESTAURANT" ${data.fssaiKindOfBusiness === 'RESTAURANT' ? 'selected' : ''}>Food Service / Restaurant</option>
                    <option value="FOOD_SERVICE" ${data.fssaiKindOfBusiness === 'FOOD_SERVICE' ? 'selected' : ''}>Café &amp; Snack Bar</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        `;

      case 6:
        return `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="font-size:13px;font-weight:800;color:#c99a5c;text-transform:uppercase;">
              Operations Profile &amp; Hardware Readiness
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Seating Capacity</label>
                <input type="number" id="wiz-f-seats" class="input" value="${data.seatingCapacity}" min="0" max="500" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Daily Opening Hour</label>
                <input type="time" id="wiz-f-opentime" class="input" value="${data.openingTime}" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;color:#ede8e1;">Daily Closing Hour</label>
                <input type="time" id="wiz-f-closetime" class="input" value="${data.closingTime}" style="width:100%;background:#101a30;border:1px solid #29374f;color:#ede8e1;padding:8px 12px;border-radius:6px;" />
              </div>
            </div>

            <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:14px;margin-top:4px;">
              <div style="font-size:12px;font-weight:700;color:#c99a5c;margin-bottom:8px;">HARDWARE READINESS AT LAUNCH</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#ede8e1;cursor:pointer;">
                  <input type="checkbox" id="wiz-h-pos" ${data.hardware.posTerminal ? 'checked' : ''} /> POS Terminal Device Available
                </label>
                <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#ede8e1;cursor:pointer;">
                  <input type="checkbox" id="wiz-h-printer" ${data.hardware.thermalPrinter ? 'checked' : ''} /> Thermal Receipt Printer Available
                </label>
                <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#ede8e1;cursor:pointer;">
                  <input type="checkbox" id="wiz-h-kprinter" ${data.hardware.kitchenPrinter ? 'checked' : ''} /> Kitchen Order Printer (KOT) Available
                </label>
                <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#ede8e1;cursor:pointer;">
                  <input type="checkbox" id="wiz-h-scanner" ${data.hardware.barcodeScanner ? 'checked' : ''} /> Barcode / QR Scanner Device
                </label>
                <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#ede8e1;cursor:pointer;">
                  <input type="checkbox" id="wiz-h-display" ${data.hardware.customerDisplay ? 'checked' : ''} /> Customer Facing Display
                </label>
              </div>
            </div>
          </div>
        `;

      case 7:
        // REVIEW & PREVIEW SCREEN (Section 5)
        return `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #29374f;padding-bottom:8px;">
              <div>
                <div style="font-size:11px;font-weight:700;color:#b17d38;letter-spacing:0.08em;text-transform:uppercase;">STEP 3 — REVIEW &amp; PREVIEW</div>
                <h3 style="margin:2px 0 0;font-size:16px;font-weight:800;color:#ede8e1;">Final Pre-Creation Verification</h3>
              </div>
              <span class="status info" style="font-size:11px;font-weight:700;background:rgba(44,92,158,0.25);color:#93c5fd;border:1px solid rgba(44,92,158,0.5);padding:3px 8px;border-radius:4px;">READ-ONLY PREVIEW</span>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              
              <!-- 1. Café Identity -->
              <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:12px;">
                <div style="font-size:11px;font-weight:700;color:#c99a5c;text-transform:uppercase;margin-bottom:6px;">1. Café Identity</div>
                <div style="font-size:14px;font-weight:800;color:#ede8e1;">${escHtml(data.name)}</div>
                <div style="font-size:12px;color:#8892a0;">Branch: ${escHtml(data.displayName)}</div>
                <div style="font-size:11px;color:#8892a0;margin-top:4px;">Type: ${escHtml(data.cafeType)} · Dietary: ${escHtml(data.dietaryType)}</div>
                <div style="font-size:11px;color:#8892a0;">Launch Date: ${escHtml(data.openingDate)} · Status: <span style="color:#10b981;font-weight:700;">${escHtml(data.initialStatus)}</span></div>
              </div>

              <!-- 2. Address & Location -->
              <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:12px;">
                <div style="font-size:11px;font-weight:700;color:#c99a5c;text-transform:uppercase;margin-bottom:6px;">2. Premises &amp; Location</div>
                <div style="font-size:12.5px;font-weight:700;color:#ede8e1;">${escHtml(data.addressLine1)}</div>
                ${data.landmark ? `<div style="font-size:11px;color:#8892a0;">Landmark: ${escHtml(data.landmark)}</div>` : ''}
                <div style="font-size:12px;color:#ede8e1;margin-top:2px;">${escHtml(data.city)}, ${escHtml(data.state)} — ${escHtml(data.pincode)}</div>
                <div style="font-size:11px;color:#8892a0;">Possession: ${escHtml(data.possessionType)}</div>
              </div>

              <!-- 3. Contacts -->
              <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:12px;">
                <div style="font-size:11px;font-weight:700;color:#c99a5c;text-transform:uppercase;margin-bottom:6px;">3. Store Contacts</div>
                <div style="font-size:12.5px;color:#ede8e1;">Primary: <strong>${escHtml(data.phone)}</strong></div>
                ${data.alternatePhone ? `<div style="font-size:11.5px;color:#8892a0;">WhatsApp: ${escHtml(data.alternatePhone)}</div>` : ''}
                ${data.email ? `<div style="font-size:11.5px;color:#8892a0;">Email: ${escHtml(data.email)}</div>` : ''}
                <div style="font-size:11px;color:#8892a0;margin-top:2px;">Emergency: ${escHtml(data.emergencyName || 'None')} (${escHtml(data.emergencyPhone || '—')})</div>
              </div>

              <!-- 4. GST & Tax Compliance -->
              <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:12px;">
                <div style="font-size:11px;font-weight:700;color:#c99a5c;text-transform:uppercase;margin-bottom:6px;">4. GST &amp; Tax Compliance</div>
                <div style="font-size:12.5px;color:#ede8e1;">GSTIN: <strong>${escHtml(data.gstin || 'NOT APPLICABLE')}</strong></div>
                <div style="font-size:11.5px;color:#8892a0;">State Code: ${escHtml(data.stateCode)} (Kerala)</div>
                <div style="font-size:11px;color:#8892a0;">PAN: ${escHtml(data.pan || '—')} · CIN: ${escHtml(data.cin || '—')}</div>
              </div>

              <!-- 5. FSSAI Compliance -->
              <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:12px;">
                <div style="font-size:11px;font-weight:700;color:#c99a5c;text-transform:uppercase;margin-bottom:6px;">5. FSSAI Food Safety</div>
                <div style="font-size:12.5px;color:#ede8e1;">Licence Number: <strong>${escHtml(data.fssaiNumber || 'REGISTRATION REQUIRED')}</strong></div>
                <div style="font-size:11.5px;color:#8892a0;">Type: ${escHtml(data.fssaiType)} · Kind: ${escHtml(data.fssaiKindOfBusiness)}</div>
                <div style="font-size:11px;color:#10b981;">Perpetual Regime (2026 FoSCoS Framework)</div>
              </div>

              <!-- 6. Operations Configuration -->
              <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:12px;">
                <div style="font-size:11px;font-weight:700;color:#c99a5c;text-transform:uppercase;margin-bottom:6px;">6. Operations Configuration</div>
                <div style="font-size:12.5px;color:#ede8e1;">Hours: ${escHtml(data.openingTime)} – ${escHtml(data.closingTime)} · Seats: ${data.seatingCapacity}</div>
                <div style="font-size:11.5px;color:#8892a0;">Inventory: Main Store &amp; Cold Storage (Zero Fake Stock)</div>
                <div style="font-size:11px;color:#8892a0;">Sequences: FY-aware Tax Invoices &amp; Receipts</div>
              </div>

              <!-- 7. Initial Admin / Manager -->
              <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:12px;">
                <div style="font-size:11px;font-weight:700;color:#c99a5c;text-transform:uppercase;margin-bottom:6px;">7. Designated Store Manager</div>
                <div style="font-size:12.5px;font-weight:800;color:#ede8e1;">${escHtml(data.managerName || 'Pending Assignment')}</div>
                <div style="font-size:11.5px;color:#8892a0;">Role: Store Manager / Café Operations Admin</div>
                <div style="font-size:11px;color:#8892a0;">Staff Assignment: Scoped post-creation</div>
              </div>

              <!-- 8. Café Operations Access Preview -->
              <div style="background:#101a30;border:1px solid #b17d38;border-radius:8px;padding:12px;">
                <div style="font-size:11px;font-weight:700;color:#b17d38;text-transform:uppercase;margin-bottom:6px;">8. Café Operations Access Preview</div>
                <div style="font-size:12px;color:#ede8e1;">✓ Sequential Café ID will be generated (e.g. ZC-0007)</div>
                <div style="font-size:12px;color:#ede8e1;">✓ Fixed 6-digit PIN will be server-generated (bcrypt-12)</div>
                <div style="font-size:12px;color:#ede8e1;">✓ Unique QR &amp; Dedicated Login Link provisioned</div>
              </div>

            </div>
          </div>
        `;

      default:
        return '';
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

    const useCurrentLocationBtn = container.querySelector('#wiz-use-current-location-btn');
    useCurrentLocationBtn?.addEventListener('click', () => {
      const statusEl = container.querySelector('#wiz-geofence-location-status');
      if (!navigator.geolocation) {
        if (statusEl) statusEl.textContent = 'Geolocation is not supported by this browser.';
        return;
      }

      useCurrentLocationBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Acquiring high-accuracy café coordinates…';
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latInput = container.querySelector('#wiz-f-latitude');
          const lngInput = container.querySelector('#wiz-f-longitude');
          if (latInput) latInput.value = Number(position.coords.latitude).toFixed(6);
          if (lngInput) lngInput.value = Number(position.coords.longitude).toFixed(6);
          formData.latitude = Number(position.coords.latitude);
          formData.longitude = Number(position.coords.longitude);
          if (statusEl) statusEl.textContent = `Location captured (±${Math.round(position.coords.accuracy || 0)} m). Verify the point before creating the café.`;
          useCurrentLocationBtn.disabled = false;
        },
        (error) => {
          if (statusEl) statusEl.textContent = error?.message || 'Unable to capture current location. Enter coordinates manually.';
          useCurrentLocationBtn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
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

    // Open Confirmation Dialog from Preview Step (Step 4 of lifecycle)
    const openConfirmBtn = container.querySelector('#wiz-open-confirm-btn');
    openConfirmBtn?.addEventListener('click', () => {
      showConfirmationWarningDialog();
    });
  }

  // Confirmation Warning Modal (Section 6)
  function showConfirmationWarningDialog() {
    let confirmMount = document.getElementById('wiz-confirm-dialog-mount');
    if (!confirmMount) {
      confirmMount = document.createElement('div');
      confirmMount.id = 'wiz-confirm-dialog-mount';
      document.body.appendChild(confirmMount);
    }

    confirmMount.innerHTML = `
      <div class="modal-backdrop" style="position:fixed;inset:0;background:rgba(11,20,36,0.9);z-index:10005;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);">
        <div class="modal-card card" style="width:520px;max-width:95vw;padding:26px;background:#1a2740;border:1.5px solid #b17d38;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);border-radius:12px;color:#ede8e1;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
            <div style="width:42px;height:42px;border-radius:50%;background:rgba(177,125,56,0.18);border:1px solid #b17d38;display:flex;align-items:center;justify-content:center;font-size:20px;color:#c99a5c;">
              🔒
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;color:#c99a5c;letter-spacing:0.08em;text-transform:uppercase;">PRIMARY MASTER CONFIRMATION</div>
              <h3 style="margin:0;font-size:17px;font-weight:800;color:#ede8e1;">Create this Café and provision its Café Operations access?</h3>
            </div>
          </div>

          <p style="font-size:13px;color:#c5c0b8;line-height:1.5;margin-bottom:14px;">
            Confirming this creation will immediately provision the permanent operational infrastructure for <strong>${escHtml(formData.name)}</strong>:
          </p>

          <div style="background:#101a30;border:1px solid #29374f;border-radius:8px;padding:12px 14px;margin-bottom:18px;font-size:12.5px;color:#c5c0b8;display:flex;flex-direction:column;gap:6px;">
            <div>✓ Sequential Permanent Café ID</div>
            <div>✓ Dedicated Café Operations Login 2.0 page</div>
            <div>✓ Dedicated high-entropy Opaque Login Link</div>
            <div>✓ Unique QR Code Credential</div>
            <div>✓ Fixed 6-digit Café Operations PIN (hashed via bcrypt-12)</div>
            <div>✓ CaféAccess record &amp; FY sequence counters</div>
            <div>✓ Neutral zero-opening-stock inventory configuration</div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button type="button" class="btn btn-sm btn-ghost" id="wiz-conf-cancel-btn" style="color:#8892a0;">Back to Edit</button>
            <button type="button" class="btn btn-sm btn-primary" id="wiz-conf-commit-btn" style="font-weight:800;background:#b17d38;border-color:#c99a5c;color:#101a30;padding:8px 18px;">
              ✓ Yes, Confirm &amp; Create Café
            </button>
          </div>
        </div>
      </div>
    `;

    confirmMount.querySelector('#wiz-conf-cancel-btn')?.addEventListener('click', () => {
      confirmMount.innerHTML = '';
    });

    confirmMount.querySelector('#wiz-conf-commit-btn')?.addEventListener('click', async () => {
      const commitBtn = confirmMount.querySelector('#wiz-conf-commit-btn');
      if (commitBtn) {
        commitBtn.disabled = true;
        commitBtn.innerHTML = `Provisioning Café...`;
      }

      try {
        const res = await apiPost('/cafes', {
          body: {
            name: formData.name,
            displayName: formData.displayName,
            legalName: formData.legalName,
            branchName: formData.branchName,
            cafeType: formData.cafeType,
            status: formData.initialStatus,
            openingDate: formData.openingDate,
            addressLine1: formData.addressLine1,
            address: {
              line1: formData.addressLine1,
              street: formData.addressLine1,
              landmark: formData.landmark,
              city: formData.city,
              district: formData.district,
              state: formData.state,
              stateCode: formData.stateCode,
              pinCode: formData.pincode,
              pincode: formData.pincode,
              country: formData.country,
              latitude: formData.latitude,
              longitude: formData.longitude,
              geofenceRadiusMetres: formData.geofenceRadiusMetres,
            },
            landmark: formData.landmark,
            city: formData.city,
            district: formData.district,
            state: formData.state,
            stateCode: formData.stateCode,
            pincode: formData.pincode,
            country: formData.country,
            latitude: formData.latitude,
            longitude: formData.longitude,
            geofenceRadiusMetres: formData.geofenceRadiusMetres,
            phone: formData.phone,
            alternatePhone: formData.alternatePhone,
            email: formData.email,
            managerName: formData.managerName,
            emergencyName: formData.emergencyName,
            emergencyPhone: formData.emergencyPhone,
            openingTime: formData.openingTime,
            closingTime: formData.closingTime,
            seatingCapacity: formData.seatingCapacity,
            gstin: formData.gstin,
            fssaiNumber: formData.fssaiNumber,
            fssaiKindOfBusiness: formData.fssaiKindOfBusiness,
            fssaiType: formData.fssaiType,
            hardwareProfile: formData.hardware,
          },
        });

        confirmMount.innerHTML = '';
        const cafe = res?.data?.cafe;
        const access = res?.data?.access;
        const operationsPin = res?.data?.operationsPin || res?.data?.access?.operationsPin;

        showToast(`Café "${formData.name}" created & access provisioned!`, 'success');
        renderAccessPackScreen(container, { cafe, access, operationsPin }, opts);
      } catch (err) {
        confirmMount.innerHTML = '';
        showStepError(err?.message || 'Failed to provision café. Please verify fields and retry.');
      }
    });
  }

  render();
}

// =============================================================================
// CAFÉ OPERATIONS ACCESS PACK SCREEN (Sections 10 to 53)
// =============================================================================

function renderAccessPackScreen(container, { cafe, access, operationsPin }, opts) {
  let pinRevealed = false;
  let pinSavedAcknowledged = false;
  const rawPin = operationsPin || access?.operationsPin || '••••••';
  const cafeId = cafe?.cafeId || access?.cafeId || 'ZC-0000';
  const cafeName = cafe?.name || 'Zamorin Café';
  const city = cafe?.address?.city || cafe?.city || '';
  const dedicatedLoginUrl = access?.dedicatedLoginUrl || `${window.location.origin}/cafe-operations/login?cafe=${encodeURIComponent(cafeId)}`;

  // Generate crisp QR SVG for the dedicated login URL
  const qrSvg = generateQrSvg(dedicatedLoginUrl, { size: 190 });

  container.innerHTML = `
    <div class="modal-backdrop" id="access-pack-backdrop" style="position:fixed;inset:0;background:rgba(11,20,36,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);">
      <div class="modal-card card" style="width:960px;max-width:96vw;max-height:94vh;overflow-y:auto;padding:32px;background:#1a2740;border:1.5px solid #b17d38;box-shadow:0 30px 60px -15px rgba(0,0,0,0.8);border-radius:14px;color:#ede8e1;">

        <!-- Header (Section 10 & 11) -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #29374f;padding-bottom:20px;margin-bottom:22px;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(30,122,76,0.25);border:1px solid #1e7a4c;color:#10b981;font-size:16px;font-weight:900;">✓</span>
              <span style="font-size:13px;font-weight:800;letter-spacing:0.08em;color:#10b981;text-transform:uppercase;">CAFÉ CREATED SUCCESSFULLY</span>
            </div>
            <h1 style="margin:0 0 4px;font-size:24px;font-weight:800;color:#ede8e1;">${escHtml(cafeName)}</h1>
            <div style="font-size:13.5px;color:#c5c0b8;">Café Operations access has been provisioned and is ready for handover.</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <span class="status success" style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:4px;background:rgba(30,122,76,0.25);border:1px solid #1e7a4c;color:#10b981;">CAFÉ ACTIVE</span>
            <span class="status info" style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:4px;background:rgba(44,92,158,0.25);border:1px solid #2c5c9e;color:#93c5fd;">LOGIN READY</span>
            <span class="status info" style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:4px;background:rgba(44,92,158,0.25);border:1px solid #2c5c9e;color:#93c5fd;">QR ACTIVE</span>
            <span class="status success" style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:4px;background:rgba(177,125,56,0.25);border:1px solid #b17d38;color:#c99a5c;">PIN SET</span>
          </div>
        </div>

        <!-- Main Cards Grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px;">
          
          <!-- Card 1: Café Identity Card (Section 12) -->
          <div style="background:#101a30;border:1px solid #29374f;border-radius:10px;padding:18px;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#b17d38;text-transform:uppercase;margin-bottom:8px;">
                CAFÉ IDENTITY &amp; PERMANENT ID
              </div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;background:#1a2740;border:1px solid #29374f;border-radius:8px;padding:10px 14px;margin-bottom:12px;">
                <div>
                  <div style="font-size:10.5px;color:#8892a0;text-transform:uppercase;font-weight:700;">Official Café ID</div>
                  <div style="font-family:monospace;font-size:22px;font-weight:800;color:#c99a5c;letter-spacing:0.08em;">${escHtml(cafeId)}</div>
                </div>
                <button type="button" class="btn btn-xs btn-primary" id="pack-copy-id-btn" style="background:#b17d38;border-color:#c99a5c;color:#101a30;font-weight:700;">Copy ID</button>
              </div>
              <div style="font-size:12px;color:#c5c0b8;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <div><span style="color:#8892a0;">Type:</span> ${escHtml(cafe?.cafeType || 'Standard Café')}</div>
                <div><span style="color:#8892a0;">Location:</span> ${escHtml(city || 'Kerala')}</div>
                <div><span style="color:#8892a0;">Manager:</span> ${escHtml(cafe?.contactProfile?.primaryContact?.name || cafe?.managerName || 'Assigned')}</div>
                <div><span style="color:#8892a0;">Contact:</span> ${escHtml(cafe?.contacts?.primaryPhone || cafe?.phone || '—')}</div>
                <div><span style="color:#8892a0;">Created:</span> Just now</div>
                <div><span style="color:#8892a0;">Status:</span> <strong style="color:#10b981;">ACTIVE</strong></div>
              </div>
            </div>
          </div>

          <!-- Card 2: QR Code Card (Section 15, 16) -->
          <div style="background:#101a30;border:1px solid #29374f;border-radius:10px;padding:18px;display:flex;align-items:center;gap:18px;">
            <div style="background:#ffffff;padding:10px;border-radius:8px;display:inline-block;box-shadow:0 4px 12px rgba(0,0,0,0.3);flex-shrink:0;">
              ${qrSvg}
            </div>
            <div style="display:flex;flex-direction:column;justify-content:center;gap:8px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#b17d38;text-transform:uppercase;">
                DEDICATED OPERATIONS QR CODE
              </div>
              <div style="font-size:11.5px;color:#c5c0b8;line-height:1.4;">
                Resolves directly to ${escHtml(cafeName)} login context. Does not contain credentials or PIN.
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                <button type="button" class="btn btn-xs btn-secondary" id="pack-dl-svg-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Download SVG</button>
                <button type="button" class="btn btn-xs btn-secondary" id="pack-dl-png-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Download PNG</button>
                <button type="button" class="btn btn-xs btn-secondary" id="pack-print-qr-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Print QR Card</button>
              </div>
            </div>
          </div>

        </div>

        <!-- Row 2: Login Link & PIN Cards -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px;">

          <!-- Card 3: Dedicated Login Link (Section 13, 14) -->
          <div style="background:#101a30;border:1px solid #29374f;border-radius:10px;padding:18px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#b17d38;text-transform:uppercase;margin-bottom:4px;">
              CAFÉ OPERATIONS LOGIN LINK
            </div>
            <div style="font-size:11.5px;color:#8892a0;margin-bottom:10px;">
              Dedicated browser entry link with ${escHtml(cafeId)} preloaded.
            </div>
            <div style="background:#1a2740;border:1px solid #29374f;border-radius:6px;padding:8px 12px;font-family:monospace;font-size:11.5px;color:#93c5fd;word-break:break-all;margin-bottom:10px;">
              ${escHtml(dedicatedLoginUrl)}
            </div>
            <div style="display:flex;gap:8px;">
              <button type="button" class="btn btn-xs btn-secondary" id="pack-copy-link-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Copy Login Link</button>
              <button type="button" class="btn btn-xs btn-secondary" id="pack-open-link-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Open Login Page ↗</button>
              <button type="button" class="btn btn-xs btn-ghost" id="pack-share-link-btn" style="color:#8892a0;">Share</button>
            </div>
          </div>

          <!-- Card 4: Café Operations PIN Card (Section 17, 18, 19, 20) -->
          <div style="background:#101a30;border:1.5px solid #b17d38;border-radius:10px;padding:18px;position:relative;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#b17d38;text-transform:uppercase;margin-bottom:4px;">
                  CAFÉ OPERATIONS PIN
                </div>
                <div style="font-size:11.5px;color:#8892a0;margin-bottom:10px;">
                  Fixed 6-digit store PIN. Stored as one-way hash (bcrypt-12).
                </div>
              </div>
              <span class="status success" style="font-size:10px;font-weight:700;background:rgba(177,125,56,0.25);border:1px solid #b17d38;color:#c99a5c;">ONE-TIME VIEW</span>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;background:#1a2740;border:1px solid #3d4f6f;border-radius:8px;padding:10px 16px;margin-bottom:10px;">
              <div id="pack-pin-display" style="font-family:monospace;font-size:24px;font-weight:800;letter-spacing:0.25em;color:#ede8e1;">
                ••••••
              </div>
              <div style="display:flex;gap:8px;">
                <button type="button" class="btn btn-xs btn-secondary" id="pack-reveal-pin-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Reveal PIN</button>
                <button type="button" class="btn btn-xs btn-primary" id="pack-copy-pin-btn" style="background:#b17d38;border-color:#c99a5c;color:#101a30;font-weight:700;">Copy PIN</button>
              </div>
            </div>

            <div style="font-size:11px;color:#eab308;display:flex;align-items:center;gap:6px;">
              <span>⚠️</span> Shown during initial setup only. If lost, a new PIN must be manually reset by Primary Master.
            </div>
          </div>

        </div>

        <!-- Row 3: Readiness Checklist & Progress (Section 37, 38) -->
        <div style="background:#101a30;border:1px solid #29374f;border-radius:10px;padding:18px;margin-bottom:22px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#b17d38;text-transform:uppercase;">
                CAFÉ READINESS ENGINE
              </div>
              <div style="font-size:14px;font-weight:800;color:#ede8e1;">9 of 12 Readiness Criteria Met</div>
            </div>
            <span class="status info" style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:4px;background:rgba(44,92,158,0.25);border:1px solid #2c5c9e;color:#93c5fd;">SETUP IN PROGRESS</span>
          </div>
          <div style="height:8px;border-radius:4px;background:#1a2740;overflow:hidden;margin-bottom:12px;">
            <div style="width:75%;height:100%;background:linear-gradient(90deg, #b17d38, #10b981);border-radius:4px;"></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:8px;font-size:11.5px;color:#c5c0b8;">
            <div><span style="color:#10b981;">✓</span> Identity &amp; Location Configured</div>
            <div><span style="color:#10b981;">✓</span> GSTIN Compliance Registered</div>
            <div><span style="color:#10b981;">✓</span> FoSCoS 2026 Perpetual FSSAI</div>
            <div><span style="color:#10b981;">✓</span> FY-Aware Invoice Sequences</div>
            <div><span style="color:#10b981;">✓</span> Zero Fake Stock Inventory Rules</div>
            <div><span style="color:#10b981;">✓</span> Dedicated Login Gateway Active</div>
            <div><span style="color:#10b981;">✓</span> High-Entropy QR Context Active</div>
            <div><span style="color:#10b981;">✓</span> Fixed Operations PIN Initialized</div>
            <div><span style="color:#10b981;">✓</span> Store Management Designated</div>
            <div><span style="color:#eab308;">⏳</span> Staff Role Assignments Pending</div>
            <div><span style="color:#eab308;">⏳</span> POS Hardware Terminal Enrollment</div>
            <div><span style="color:#eab308;">⏳</span> Test Operational Shift Verification</div>
          </div>
        </div>

        <!-- Handover Documents & Bulk Copy Actions (Section 20 to 25) -->
        <div style="display:flex;justify-content:space-between;align-items:center;background:#101a30;border:1px solid #29374f;border-radius:10px;padding:16px 20px;margin-bottom:22px;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:12px;font-weight:700;color:#c99a5c;text-transform:uppercase;">Handover Packs &amp; Clipboard Actions</div>
            <div style="font-size:11.5px;color:#8892a0;">Public handover materials strictly exclude the secret Café PIN.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-xs btn-secondary" id="pack-copy-details-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Copy Access Details</button>
            <button type="button" class="btn btn-xs btn-secondary" id="pack-copy-details-pin-btn" style="background:#29374f;border-color:#3d4f6f;color:#eab308;">Copy Details + PIN (Sensitive)</button>
            <button type="button" class="btn btn-xs btn-primary" id="pack-dl-pack-btn" style="background:#b17d38;border-color:#c99a5c;color:#101a30;font-weight:700;">Download Access Pack</button>
            <button type="button" class="btn btn-xs btn-secondary" id="pack-setup-sheet-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Private Setup Sheet</button>
          </div>
        </div>

        <!-- Next Actions & Operational Handoff (Section 28 to 36) -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;border-top:1px solid #29374f;padding-top:18px;">
          <button type="button" class="btn btn-sm btn-secondary" id="pack-assign-admin-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Assign Café Admin</button>
          <button type="button" class="btn btn-sm btn-secondary" id="pack-add-staff-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Add / Assign Employees</button>
          <button type="button" class="btn btn-sm btn-secondary" id="pack-devices-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Configure POS / Devices</button>
          <button type="button" class="btn btn-sm btn-secondary" id="pack-test-login-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">Test Café Login ↗</button>
        </div>

        <!-- Usability Safeguard & Finish (Section 26 & 27) -->
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #29374f;padding-top:18px;flex-wrap:wrap;gap:14px;">
          <label style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:#c99a5c;cursor:pointer;">
            <input type="checkbox" id="pack-ack-pin-check" style="width:18px;height:18px;" />
            I have securely saved the Café PIN.
          </label>

          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-sm btn-secondary" id="pack-manage-access-btn" style="background:#29374f;border-color:#3d4f6f;color:#ede8e1;">
              Go to Café Access Governance →
            </button>
            <button type="button" class="btn btn-sm btn-primary" id="pack-finish-btn" style="font-weight:800;background:#1e7a4c;border-color:#22c55e;color:#ffffff;padding:8px 24px;">
              Finish Handover
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  // --- Event Bindings ---

  // Copy Official Café ID
  const copyIdBtn = container.querySelector('#pack-copy-id-btn');
  copyIdBtn?.addEventListener('click', () => {
    copyToClipboard(cafeId, `Café ID ${cafeId} copied!`, copyIdBtn);
  });

  // Reveal / Hide PIN Toggle
  const revealPinBtn = container.querySelector('#pack-reveal-pin-btn');
  const pinDisplay = container.querySelector('#pack-pin-display');
  revealPinBtn?.addEventListener('click', () => {
    pinRevealed = !pinRevealed;
    if (pinRevealed) {
      pinDisplay.textContent = rawPin;
      revealPinBtn.textContent = 'Hide PIN';
    } else {
      pinDisplay.textContent = '••••••';
      revealPinBtn.textContent = 'Reveal PIN';
    }
  });

  // Copy PIN with Safety Warning Toast (Section 19)
  const copyPinBtn = container.querySelector('#pack-copy-pin-btn');
  copyPinBtn?.addEventListener('click', () => {
    copyToClipboard(rawPin, 'Café PIN copied. Clipboard contents may remain available to other applications on this device.', copyPinBtn);
  });

  // Copy Login Link
  const copyLinkBtn = container.querySelector('#pack-copy-link-btn');
  copyLinkBtn?.addEventListener('click', () => {
    copyToClipboard(dedicatedLoginUrl, 'Dedicated Café Operations login link copied!', copyLinkBtn);
  });

  // Open Login Page (Section 14 & 35)
  container.querySelector('#pack-open-link-btn')?.addEventListener('click', () => {
    window.open(dedicatedLoginUrl, '_blank');
  });

  // Share Link
  container.querySelector('#pack-share-link-btn')?.addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({
        title: `${cafeName} — Café Operations Login`,
        text: `Café Operations login gateway for ${cafeName} (${cafeId})`,
        url: dedicatedLoginUrl,
      }).catch(() => {});
    } else {
      copyToClipboard(dedicatedLoginUrl, 'Login link copied to clipboard!', container.querySelector('#pack-share-link-btn'));
    }
  });

  // Download QR SVG
  container.querySelector('#pack-dl-svg-btn')?.addEventListener('click', () => {
    downloadQrSvg(dedicatedLoginUrl, { filename: `ZAMORIN_${cafeId}_QR.svg`, size: 500 });
  });

  // Download QR PNG
  container.querySelector('#pack-dl-png-btn')?.addEventListener('click', () => {
    downloadQrPng(dedicatedLoginUrl, { filename: `ZAMORIN_${cafeId}_QR.png`, size: 600 });
  });

  // Print Public QR Card (Section 25)
  container.querySelector('#pack-print-qr-btn')?.addEventListener('click', () => {
    printPublicQrCard({ cafeName, cafeId, dedicatedLoginUrl, city });
  });

  // Copy Access Details without PIN (Section 20 & 58)
  const copyDetailsBtn = container.querySelector('#pack-copy-details-btn');
  copyDetailsBtn?.addEventListener('click', () => {
    const text = `ZAMORIN CAFÉ ERP\nCafé Operations Access\n\nCafé: ${cafeName}\nCafé ID: ${cafeId}\nLocation: ${city ? `${city}, Kerala` : 'Kerala'}\nLogin: ${dedicatedLoginUrl}\nStatus: ACTIVE\n\nFor security, the Café PIN is not included.\nUse the separate Copy PIN action.`;
    copyToClipboard(text, 'Access details copied (PIN excluded for safety).', copyDetailsBtn);
  });

  // Copy Access Details + PIN (Section 21 - Sensitive confirmation required)
  const copyDetailsPinBtn = container.querySelector('#pack-copy-details-pin-btn');
  copyDetailsPinBtn?.addEventListener('click', () => {
    if (window.confirm('This will place the Café PIN on your system clipboard. Continue?')) {
      const text = `ZAMORIN CAFÉ ERP\nCafé Operations Access (CONFIDENTIAL)\n\nCafé: ${cafeName}\nCafé ID: ${cafeId}\nLocation: ${city ? `${city}, Kerala` : 'Kerala'}\nLogin: ${dedicatedLoginUrl}\nCafé Operations PIN: ${rawPin}\nStatus: ACTIVE\n\nCONFIDENTIAL — Do not share or display publicly.`;
      copyToClipboard(text, 'Access details + PIN copied to clipboard.', copyDetailsPinBtn);
    }
  });

  // Download General Access Pack PDF / Printable (Section 23)
  container.querySelector('#pack-dl-pack-btn')?.addEventListener('click', () => {
    printAccessPackDocument({ cafeName, cafeId, city, dedicatedLoginUrl, address: cafe?.address?.line1 || cafe?.addressLine1 || '' });
  });

  // Private Confidential Setup Sheet (Section 24)
  container.querySelector('#pack-setup-sheet-btn')?.addEventListener('click', () => {
    printConfidentialSetupSheet({ cafeName, cafeId, city, dedicatedLoginUrl, rawPin, address: cafe?.address?.line1 || cafe?.addressLine1 || '' });
  });

  // Assign Café Admin (Section 28)
  container.querySelector('#pack-assign-admin-btn')?.addEventListener('click', () => {
    window.location.hash = 'users';
    container.innerHTML = '';
  });

  // Add Employees (Section 30)
  container.querySelector('#pack-add-staff-btn')?.addEventListener('click', () => {
    window.location.hash = 'users';
    container.innerHTML = '';
  });

  // Configure Devices (Section 32)
  container.querySelector('#pack-devices-btn')?.addEventListener('click', () => {
    window.location.hash = 'devices';
    container.innerHTML = '';
  });

  // Test Café Login (Section 35)
  container.querySelector('#pack-test-login-btn')?.addEventListener('click', () => {
    window.open(dedicatedLoginUrl, '_blank');
  });

  // Go to Café Access Governance
  container.querySelector('#pack-manage-access-btn')?.addEventListener('click', () => {
    container.innerHTML = '';
    openCafeAccessManagementModal(document.body, cafeId);
  });

  // Checkbox Acknowledgement (Section 26)
  const ackCheck = container.querySelector('#pack-ack-pin-check');
  ackCheck?.addEventListener('change', (e) => {
    pinSavedAcknowledged = e.target.checked;
  });

  // Finish button with Leave-Without-Saving Safeguard (Section 27)
  container.querySelector('#pack-finish-btn')?.addEventListener('click', () => {
    if (!pinSavedAcknowledged) {
      if (window.confirm('The Café PIN will not be available in plaintext after this setup screen. If it is lost, a new PIN must be reset.\n\nDo you want to leave anyway?')) {
        container.innerHTML = '';
        if (typeof opts.onSuccess === 'function') opts.onSuccess(cafe);
      }
    } else {
      container.innerHTML = '';
      if (typeof opts.onSuccess === 'function') opts.onSuccess(cafe);
    }
  });
}

// =============================================================================
// PRINTABLE DOCUMENT GENERATORS (Section 23, 24, 25)
// =============================================================================

function printPublicQrCard({ cafeName, cafeId, dedicatedLoginUrl, city }) {
  const qrSvg = generateQrSvg(dedicatedLoginUrl, { size: 240 });
  const w = window.open('', '_blank');
  if (!w) return showToast('Please allow popups to print the QR Card.', 'warning');

  w.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Zamorin Café — ${escHtml(cafeName)} QR Card</title>
        <style>
          @page { size: A5 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; color: #101a30; margin: 0; padding: 20px; background: #ffffff; }
          .card { border: 2.5px solid #b17d38; border-radius: 14px; padding: 28px 24px; max-width: 440px; margin: 0 auto; }
          .header { font-size: 18px; font-weight: 800; letter-spacing: 0.1em; color: #101a30; margin-bottom: 2px; }
          .subtitle { font-size: 13px; font-weight: 700; color: #b17d38; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 14px; }
          .divider { height: 2px; background: linear-gradient(90deg, transparent, #b17d38, transparent); margin: 12px 0 16px; }
          .cafe-name { font-size: 22px; font-weight: 800; color: #101a30; margin: 0 0 4px; }
          .cafe-id { font-family: monospace; font-size: 15px; font-weight: 700; color: #b17d38; margin-bottom: 16px; }
          .qr-box { display: inline-block; padding: 12px; background: #ffffff; border: 1.5px solid #e7e2d5; border-radius: 10px; margin-bottom: 16px; }
          .instructions { font-size: 14px; font-weight: 700; color: #101a30; margin-bottom: 6px; }
          .sub-instructions { font-size: 12px; color: #555; line-height: 1.4; margin-bottom: 16px; }
          .footer-note { font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 10px; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">ZAMORIN ESTATE PVT. LTD.</div>
          <div class="subtitle">CAFÉ OPERATIONS</div>
          <div class="divider"></div>
          <div class="cafe-name">${escHtml(cafeName)}</div>
          <div class="cafe-id">Branch ID: ${escHtml(cafeId)} ${city ? `· ${escHtml(city)}` : ''}</div>
          <div class="qr-box">${qrSvg}</div>
          <div class="instructions">Scan to open this Café's Operations Login</div>
          <div class="sub-instructions">
            Enter your Employee ID, Café PIN and Employee PIN.<br>
            Official store terminals and cashier tablets only.
          </div>
          <div class="footer-note">🔒 Safe Gateway Locator · Does not contain credentials or secret keys.</div>
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  w.document.close();
}

function printAccessPackDocument({ cafeName, cafeId, city, dedicatedLoginUrl, address }) {
  const qrSvg = generateQrSvg(dedicatedLoginUrl, { size: 200 });
  const w = window.open('', '_blank');
  if (!w) return showToast('Please allow popups to download Access Pack.', 'warning');

  w.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Zamorin Café — ${escHtml(cafeName)} Access Pack</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #101a30; margin: 0; padding: 24px; background: #ffffff; }
          .header { border-bottom: 2px solid #b17d38; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: baseline; }
          .brand { font-size: 20px; font-weight: 800; color: #101a30; }
          .title { font-size: 13px; font-weight: 700; color: #b17d38; text-transform: uppercase; letter-spacing: 0.08em; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 13px; font-weight: 800; color: #b17d38; text-transform: uppercase; border-bottom: 1px solid #e7e2d5; padding-bottom: 4px; margin-bottom: 8px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; }
          .label { color: #666; font-size: 11px; text-transform: uppercase; font-weight: 600; }
          .val { font-weight: 700; color: #101a30; }
          .qr-container { text-align: center; margin: 20px 0; }
          .login-box { background: #faf9f5; border: 1px solid #d7d0bd; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #101a30; word-break: break-all; margin: 10px 0; }
          .notice { font-size: 11px; color: #666; border-top: 1px solid #eee; padding-top: 12px; margin-top: 30px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">ZAMORIN ESTATE PVT. LTD.</div>
            <div class="title">Café Operations Access Pack</div>
          </div>
          <div style="font-family: monospace; font-size: 16px; font-weight: 800; color: #b17d38;">${escHtml(cafeId)}</div>
        </div>

        <div class="section">
          <div class="section-title">Establishment Details</div>
          <div class="grid">
            <div><div class="label">Café Trade Name</div><div class="val">${escHtml(cafeName)}</div></div>
            <div><div class="label">Official Café ID</div><div class="val" style="font-family:monospace; color:#b17d38;">${escHtml(cafeId)}</div></div>
            <div><div class="label">Premises Address</div><div class="val">${escHtml(address || 'On File')}</div></div>
            <div><div class="label">City / Location</div><div class="val">${escHtml(city || 'Kerala')}</div></div>
            <div><div class="label">Access Status</div><div class="val" style="color:#1e7a4c;">ACTIVE (OPERATIONAL)</div></div>
            <div><div class="label">Issued Date</div><div class="val">${new Date().toLocaleDateString('en-IN')}</div></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Operations Login Link</div>
          <div class="login-box">${escHtml(dedicatedLoginUrl)}</div>
          <div style="font-size:12px; color:#555;">Open this dedicated URL on in-store registers, cashier POS tablets, or store desktops.</div>
        </div>

        <div class="qr-container">
          <div style="display:inline-block; padding:12px; border:1.5px solid #d7d0bd; border-radius:10px;">${qrSvg}</div>
          <div style="font-size:13px; font-weight:700; margin-top:8px;">Dedicated Branch Operations QR Code</div>
        </div>

        <div class="section">
          <div class="section-title">Store Onboarding Instructions</div>
          <ol style="font-size: 12.5px; color: #333; line-height: 1.5; padding-left: 20px;">
            <li>Store Manager signs in using Employee ID, Café PIN and Personal Employee PIN.</li>
            <li>Register store POS devices and thermal receipt printers via Device Enrollment.</li>
            <li>Assign and verify cashier staff accounts for till shift handovers.</li>
            <li>For security, the fixed store PIN is distributed separately through authorized Primary Master handover.</li>
          </ol>
        </div>

        <div class="notice">
          🔒 Official Zamorin Café ERP Handover Pack · Strictly confidential to authorized store management and governance teams.
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  w.document.close();
}

function printConfidentialSetupSheet({ cafeName, cafeId, city, dedicatedLoginUrl, rawPin, address }) {
  const qrSvg = generateQrSvg(dedicatedLoginUrl, { size: 180 });
  const w = window.open('', '_blank');
  if (!w) return showToast('Please allow popups to view Setup Sheet.', 'warning');

  w.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>CONFIDENTIAL SETUP SHEET — ${escHtml(cafeId)}</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #101a30; margin: 0; padding: 24px; background: #ffffff; position: relative; }
          .watermark { position: fixed; top: 40%; left: 5%; right: 5%; text-align: center; font-size: 42px; font-weight: 900; color: rgba(220,38,38,0.08); transform: rotate(-25deg); pointer-events: none; }
          .header { border-bottom: 2.5px solid #dc2626; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: baseline; }
          .brand { font-size: 18px; font-weight: 800; color: #dc2626; }
          .subtitle { font-size: 12px; font-weight: 700; color: #666; text-transform: uppercase; }
          .pin-box { border: 2.5px solid #dc2626; background: #fef2f2; border-radius: 10px; padding: 18px 24px; text-align: center; margin: 24px 0; }
          .pin-val { font-family: monospace; font-size: 36px; font-weight: 900; letter-spacing: 0.3em; color: #dc2626; margin: 6px 0; }
          .warning { font-size: 12px; color: #b91c1c; font-weight: 600; line-height: 1.4; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; margin: 16px 0; }
          .label { color: #666; font-size: 11px; text-transform: uppercase; font-weight: 600; }
          .val { font-weight: 700; color: #101a30; }
          .notice { font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 14px; margin-top: 24px; text-align: center; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="watermark">CONFIDENTIAL — DO NOT DISPLAY PUBLICLY</div>
        <div class="header">
          <div>
            <div class="brand">CONFIDENTIAL CAFÉ SETUP SHEET</div>
            <div class="subtitle">PRIMARY MASTER GOVERNANCE EYES ONLY</div>
          </div>
          <div style="font-family: monospace; font-size: 16px; font-weight: 800; color: #dc2626;">${escHtml(cafeId)}</div>
        </div>

        <div class="grid">
          <div><div class="label">Café Name</div><div class="val">${escHtml(cafeName)}</div></div>
          <div><div class="label">Official ID</div><div class="val">${escHtml(cafeId)}</div></div>
          <div><div class="label">Premises Address</div><div class="val">${escHtml(address || 'On File')}</div></div>
          <div><div class="label">City / State</div><div class="val">${escHtml(city || 'Kerala')}</div></div>
        </div>

        <div class="pin-box">
          <div style="font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #991b1b;">
            FIXED CAFÉ OPERATIONS PIN
          </div>
          <div class="pin-val">${escHtml(rawPin)}</div>
          <div class="warning">
            ⚠️ This PIN is displayed only during initial establishment setup. It is stored as a one-way cryptographic hash (bcrypt-12) and cannot be recovered in plaintext later. If lost, a new PIN must be manually reset by the Primary Master.
          </div>
        </div>

        <div style="text-align: center; margin: 20px 0;">
          <div style="display:inline-block; padding:10px; border:1px solid #ddd; border-radius:8px;">${qrSvg}</div>
          <div style="font-family:monospace; font-size:11px; color:#555; margin-top:6px;">${escHtml(dedicatedLoginUrl)}</div>
        </div>

        <div class="notice">
          ⚠️ STRICTLY CONFIDENTIAL · DO NOT LEAVE UNATTENDED OR DISPLAY IN PUBLIC STORE AREAS.
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  w.document.close();
}

// =============================================================================
// ZAMORIN CAFE ERP — CAFE OPERATIONS OPERATOR SIGN-IN PAGE (v2.0 Premium)
//
// Premium dark glassmorphism design with amber-gold accent theme.
// Animated background, glowing PIN dots, ripple keypad, full auth flow.
//
// SECURITY INVARIANTS:
//  - Does NOT accept personal account password — PIN only
//  - Does NOT show employee list / dropdown (privacy requirement §27)
//  - Forgot PIN -> safe guidance message only, no reset on shared device (§21)
//  - Return to Attendance Kiosk link present (§39)
//  - Connection/trust status shown (§61)
//  - PIN never logged, never stored in plaintext (§77)
// =============================================================================

'use strict';

import { getCanonicalDeviceId } from '../apiClient.js';

// Ensure the CSS is loaded
(function ensureCss() {
  if (!document.querySelector('link[data-co-login-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/src/styles/cafeOpsLogin.css';
    link.setAttribute('data-co-login-css', '1');
    document.head.appendChild(link);
  }
})();

let signInError = '';
let signInBusy = false;
let signInForgotVisible = false;
let pinDigits = [];

let activeOnlineHandler = null;
let activeOfflineHandler = null;

function removeWindowListeners() {
  if (activeOnlineHandler) {
    window.removeEventListener('online', activeOnlineHandler);
    activeOnlineHandler = null;
  }
  if (activeOfflineHandler) {
    window.removeEventListener('offline', activeOfflineHandler);
    activeOfflineHandler = null;
  }
}

function getDeviceContext() {
  try {
    const id = getCanonicalDeviceId() || '';
    const cafe = localStorage.getItem('zamorin_bound_cafe_name') || (id ? 'Bound Outlet' : 'Unassigned Device');
    const cafeId = localStorage.getItem('zamorin_bound_cafe_id') || '';
    return { id, cafe, cafeId };
  } catch {
    return { id: '', cafe: 'Unassigned Device', cafeId: '' };
  }
}

function getOnlineStatus() {
  return navigator.onLine
    ? { label: 'Online',  cls: 'online' }
    : { label: 'Offline', cls: 'offline' };
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderPinDots(count) {
  return Array.from({ length: 6 }, (_, i) =>
    `<span class="co-pin-dot ${i < count ? 'filled' : 'empty'}"></span>`
  ).join('');
}

function renderKeypad(disabled) {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '\u232b'];
  return keys.map((k) => {
    if (k === '') return `<div class="co-key-placeholder"></div>`;
    const isBack = k === '\u232b';
    return `<button type="button" class="co-key${isBack ? ' backspace' : ''}" data-key="${isBack ? 'back' : k}" ${disabled ? 'disabled' : ''} aria-label="${isBack ? 'Backspace' : k}">${k}</button>`;
  }).join('');
}

export function renderCafeOperatorSignIn({ notice = '' } = {}) {
  const { id: deviceId, cafe: cafeName, cafeId } = getDeviceContext();
  const online = getOnlineStatus();
  const pinCount = pinDigits.length;

  return `
    <div class="co-login-page" data-page="cafe-operator-signin">
      <div class="co-bg-canvas"></div>
      <div class="co-orb co-orb-1"></div>
      <div class="co-orb co-orb-2"></div>
      <div class="co-card" role="main">
        <div class="co-brand">
          <img src="/src/assets/zamorin-estate-mark.png" alt="Zamorin" class="co-brand-logo" onerror="this.style.display='none'" />
          <div class="co-brand-name">Zamorin</div>
          <div class="co-brand-tag">Cafe Operations</div>
        </div>
        <div class="co-device-strip">
          <div class="co-device-info">
            <div class="co-device-cafe">📍 ${esc(cafeName)}${cafeId ? ` <span style="font-size:10px;opacity:0.6;">(${esc(cafeId)})</span>` : ''}</div>
            <div class="co-device-id">Device: ${esc(deviceId) || '\u2014'}</div>
          </div>
          <span class="co-online-badge ${online.cls}" id="co-online-badge">${online.label}</span>
        </div>
        <div class="co-section-title">Operator Sign-In</div>
        ${notice ? `<div class="co-alert co-alert-info" role="status">${esc(notice)}</div>` : ''}
        ${signInError ? `<div class="co-alert co-alert-error" role="alert">${esc(signInError)}</div>` : ''}
        <form id="co-signin-form" autocomplete="off" novalidate>
          <div class="co-field">
            <label class="co-label" for="co-employee-id">Employee ID</label>
            <input id="co-employee-id" class="co-input" type="text" autocomplete="off" spellcheck="false" inputmode="text" placeholder="e.g. ST-0001" ${signInBusy ? 'disabled' : ''} />
          </div>
          <div class="co-field">
            <label class="co-label">Operator PIN (6 digits)</label>
            <div id="co-pin-row" class="co-pin-row" aria-label="PIN digits entered: ${pinCount} of 6">
              ${renderPinDots(pinCount)}
            </div>
            <input id="co-pin-hidden" type="password" inputmode="numeric" maxlength="6" autocomplete="off" aria-hidden="true" tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;" />
          </div>
          <div id="co-keypad" class="co-keypad" role="group" aria-label="PIN keypad" ${signInBusy ? 'style="opacity:0.4;pointer-events:none;"' : ''}>
            ${renderKeypad(signInBusy)}
          </div>
          <button id="co-signin-btn" type="submit" class="co-btn-primary" ${signInBusy ? 'disabled' : ''}>
            ${signInBusy ? `<span class="co-spinner"></span><span>Signing in...</span>` : 'Sign In to Cafe Operations'}
          </button>
        </form>
        <div class="co-footer">
          <button type="button" id="co-forgot-btn" class="co-link" ${signInBusy ? 'disabled' : ''}>Forgot Operator PIN?</button>
          ${signInForgotVisible ? `
            <div class="co-forgot-panel" role="note" aria-live="polite">
              <strong>Forgot your PIN?</strong><br/>
              Contact your cafe administrator or reset it through your personal account.<br/>
              <em style="font-size:11px;">Do not share your PIN with anyone.</em>
            </div>
          ` : ''}
          <div class="co-divider"></div>
          <button type="button" id="co-return-kiosk-btn" class="co-link" ${signInBusy ? 'disabled' : ''}>← Return to Attendance Kiosk</button>
        </div>
      </div>
    </div>
  `;
}

export function wireCafeOperatorSignIn(root, { onSignIn, onReturnKiosk } = {}) {
  pinDigits = [];
  signInError = '';
  signInBusy = false;
  signInForgotVisible = false;

  const rerender = () => {
    root.innerHTML = renderCafeOperatorSignIn();
    wireCafeOperatorSignIn(root, { onSignIn, onReturnKiosk });
  };

  const keypad = root.querySelector('#co-keypad');
  if (keypad) {
    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.co-key');
      if (!btn || signInBusy) return;
      const key = btn.dataset.key;
      if (key === 'back') {
        pinDigits.pop();
      } else if (pinDigits.length < 6 && /^\d$/.test(key)) {
        pinDigits.push(key);
      }
      const pinRow = root.querySelector('#co-pin-row');
      if (pinRow) {
        pinRow.innerHTML = renderPinDots(pinDigits.length);
        pinRow.setAttribute('aria-label', `PIN digits entered: ${pinDigits.length} of 6`);
      }
    });
  }

  root.addEventListener('keydown', (e) => {
    if (document.activeElement === root.querySelector('#co-employee-id')) return;
    if (signInBusy) return;
    if (/^\d$/.test(e.key) && pinDigits.length < 6) {
      pinDigits.push(e.key);
      const pinRow = root.querySelector('#co-pin-row');
      if (pinRow) { pinRow.innerHTML = renderPinDots(pinDigits.length); }
    } else if (e.key === 'Backspace') {
      pinDigits.pop();
      const pinRow = root.querySelector('#co-pin-row');
      if (pinRow) { pinRow.innerHTML = renderPinDots(pinDigits.length); }
    }
  });

  removeWindowListeners();
  const updateBadge = () => {
    const badge = root.querySelector('#co-online-badge');
    if (!badge) return;
    const s = getOnlineStatus();
    badge.textContent = s.label;
    badge.className = `co-online-badge ${s.cls}`;
  };
  activeOnlineHandler = updateBadge;
  activeOfflineHandler = updateBadge;
  window.addEventListener('online', activeOnlineHandler);
  window.addEventListener('offline', activeOfflineHandler);

  const form = root.querySelector('#co-signin-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (signInBusy) return;
      const employeeId = (root.querySelector('#co-employee-id')?.value || '').trim();
      const pin = pinDigits.join('');
      if (!employeeId) { signInError = 'Please enter your Employee ID.'; rerender(); return; }
      if (pin.length !== 6) { signInError = 'Please enter your full 6-digit Operator PIN.'; rerender(); return; }
      if (typeof onSignIn !== 'function') { signInError = 'Authentication service is unavailable.'; rerender(); return; }
      signInBusy = true;
      signInError = '';
      rerender();
      try {
        await onSignIn({ employeeId, pin });
        pinDigits = [];
        signInBusy = false;
        signInError = '';
      } catch (err) {
        signInBusy = false;
        signInError = err?.message || 'Operator code not recognised. Please try again.';
        pinDigits = [];
        rerender();
      }
    });
  }

  const forgotBtn = root.querySelector('#co-forgot-btn');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', () => {
      signInForgotVisible = !signInForgotVisible;
      rerender();
    });
  }

  const kioskBtn = root.querySelector('#co-return-kiosk-btn');
  if (kioskBtn) {
    kioskBtn.addEventListener('click', () => {
      pinDigits = [];
      signInError = '';
      if (typeof onReturnKiosk === 'function') {
        onReturnKiosk();
      } else {
        window.location.hash = 'kiosk-attendance';
      }
    });
  }
}

export function resetCafeOperatorSignInUi() {
  pinDigits = [];
  signInError = '';
  signInBusy = false;
  signInForgotVisible = false;
  removeWindowListeners();
}

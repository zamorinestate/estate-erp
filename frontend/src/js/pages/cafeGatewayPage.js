// =============================================================================
// ZAMORIN CAFÉ ERP — PUBLIC CAFÉ OPERATIONS GATEWAY SCREEN
// P0 Canonical Gateway Architecture: PIN / QR / Link Entry & Authoritative Auth
// =============================================================================

'use strict';

import { apiPost, setCafeOpsSessionToken, setCafeOpsDeviceToken, setSessionId, getCanonicalDeviceId } from '../apiClient.js';
import { startCafeOpsInactivityTimer } from '../cafeOpsInactivity.js';
import { setState } from '../state.js';
import { renderShell, navigate } from '../router.js';

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPinDots(count) {
  return Array.from({ length: 6 }, (_, i) =>
    `<span style="
      display:inline-block; width:14px; height:14px; border-radius:50%;
      background:${i < count ? 'var(--ink, #ede8e1)' : 'transparent'};
      border:2px solid ${i < count ? 'var(--ink, #ede8e1)' : 'var(--line-strong, #3d3935)'};
      margin:0 5px; transition:background 0.12s ease;
    "></span>`
  ).join('');
}

/**
 * State container for the active gateway session.
 */
let gatewayState = {
  gatewayContextToken: null,
  cafe: null,
  expiresAt: null,
  pinDigits: [],
  employeeId: '',
  isEnteringCafePin: false,
  error: '',
  busy: false,
};

/**
 * Sets or clears the active gateway context token in memory.
 */
export function setActiveGatewayContext({ gatewayContextToken, cafe, expiresAt } = {}) {
  gatewayState.gatewayContextToken = gatewayContextToken || null;
  gatewayState.cafe = cafe || null;
  gatewayState.expiresAt = expiresAt || null;
  gatewayState.error = '';
  gatewayState.pinDigits = [];
}

export function getActiveGatewayContext() {
  return {
    gatewayContextToken: gatewayState.gatewayContextToken,
    cafe: gatewayState.cafe,
    expiresAt: gatewayState.expiresAt,
  };
}

export function getActiveGatewayContextToken() {
  return gatewayState.gatewayContextToken;
}

/**
 * Renders the HTML markup for the public Café Operations Gateway page.
 */
export function renderCafeGatewayPage() {
  const { cafe, gatewayContextToken, isEnteringCafePin, pinDigits, employeeId, error, busy } = gatewayState;
  const pinCount = pinDigits.length;

  return `
    <div class="login-screen" data-page="cafe-gateway" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg-app, #121110);padding:16px;">
      <div class="login-card card" style="width:440px;max-width:96vw;background:var(--surface-raised, #242220);border:1px solid var(--line-strong, #3d3935);box-shadow:var(--shadow-2xl, 0 20px 25px -5px rgba(0,0,0,0.5));border-radius:14px;padding:32px;color:var(--ink, #ede8e1);">
        
        <!-- Zamorin Brand Header -->
        <div class="login-brand" style="text-align:center;margin-bottom:24px;">
          <img src="/src/assets/zamorin-estate-mark.png" alt="Zamorin Café ERP" class="login-mark" style="width:48px;height:48px;margin:0 auto 10px auto;display:block;" />
          <h1 class="login-wordmark" style="font-size:22px;font-weight:800;letter-spacing:0.04em;margin:0 0 2px 0;color:var(--ink, #ede8e1);">Zamorin</h1>
          <div class="login-sub" style="font-weight:800;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--bronze-400, #d4a359);">
            Café Operations Gateway
          </div>
        </div>

        ${error ? `
          <div class="alert danger" style="margin-bottom:18px;padding:12px 14px;border-radius:8px;background:rgba(220,38,38,0.15);border:1px solid var(--danger, #dc2626);color:#fca5a5;font-size:13px;text-align:center;" role="alert">
            ${escHtml(error)}
          </div>
        ` : ''}

        ${!gatewayContextToken || isEnteringCafePin ? `
          <!-- Gateway Mode 1: Branch Location Resolution Required -->
          <div id="gw-pin-container" style="text-align:center;">
            <div style="font-size:14px;font-weight:700;margin-bottom:6px;color:var(--ink);">Branch Location Resolution Required</div>
            <p style="font-size:12.5px;color:var(--muted, #9e978e);margin:0 0 18px 0;line-height:1.5;">
              Please scan the official branch QR code or open your unique Café login URL to sign into this location.
            </p>

            <div style="background:var(--surface, #1e1d1b);border:1px solid var(--line, #33302c);border-radius:10px;padding:16px;margin-bottom:20px;text-align:left;">
              <div style="font-size:12px;font-weight:700;color:var(--bronze-400, #d4a359);margin-bottom:4px;">Initial Outlet Commissioning</div>
              <div style="font-size:11.5px;color:var(--muted);margin-bottom:12px;">If you have a one-time short-lived setup code for new register setup, enter it below:</div>
              <div style="display:flex;gap:8px;">
                <input type="text" id="gw-setup-code-input" class="input" placeholder="Enter setup code" maxlength="12" style="flex:1;text-align:center;font-family:var(--font-mono);letter-spacing:0.1em;background:var(--surface-sunken, #121110);border:1px solid var(--line-strong, #3d3935);color:var(--ink);border-radius:6px;padding:8px;" />
                <button type="button" id="gw-setup-code-submit-btn" class="btn btn-primary" style="padding:8px 16px;font-weight:700;">Resolve</button>
              </div>
            </div>

            <div style="border-top:1px solid var(--line, #33302c);padding-top:16px;margin-top:16px;text-align:center;">
              <a href="#login" style="font-size:12px;color:var(--muted);text-decoration:none;">← Return to Main Login</a>
            </div>
          </div>
        ` : `
          <!-- Gateway Mode 2: Authoritative Employee Authentication Screen -->
          <div id="gw-auth-container">
            
            <!-- Resolved Café Identity Context Banner (Display only) -->
            <div style="background:var(--surface-sunken, #121110);border:1px solid var(--line-strong, #3d3935);border-radius:10px;padding:14px 16px;margin-bottom:20px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--bronze-400, #d4a359);margin-bottom:4px;">
                You are signing into:
              </div>
              <div style="font-size:17px;font-weight:800;color:var(--ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span>${escHtml(cafe?.displayName || cafe?.name || 'Zamorin Café')}</span>
                <span style="font-family:var(--font-mono, monospace);font-size:13px;color:var(--muted);font-weight:600;">(${escHtml(cafe?.cafeId)})</span>
              </div>
              ${cafe?.city ? `
                <div style="font-size:12px;color:var(--muted);margin-top:2px;">
                  📍 ${escHtml(cafe.city)} Branch
                </div>
              ` : ''}
              <div style="font-size:10.5px;color:rgba(16,185,129,0.9);font-weight:600;margin-top:6px;display:flex;align-items:center;gap:4px;">
                <span>🔒</span> Authoritative Gateway Session Active
              </div>
            </div>

            <!-- Employee Credentials Form -->
            <form id="gw-employee-form" autocomplete="off">
              <div class="form-group" style="margin-bottom:16px;">
                <label for="gw-emp-id" style="font-size:12px;font-weight:700;display:block;margin-bottom:6px;color:var(--ink);">
                  Employee Identifier
                </label>
                <input
                  type="text"
                  id="gw-emp-id"
                  class="form-control"
                  placeholder="e.g. EMP-001 or MU-0001"
                  value="${escHtml(employeeId)}"
                  required
                  style="width:100%;text-transform:uppercase;background:var(--surface, #1e1d1b);border:1px solid var(--line-strong, #3d3935);color:var(--ink);padding:10px 12px;border-radius:8px;font-family:var(--font-mono, monospace);font-size:14px;"
                />
              </div>

              <!-- Operator PIN Keypad / Input -->
              <div class="form-group" style="margin-bottom:20px;">
                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px;color:var(--ink);text-align:center;">
                  Operator PIN (6 Digits)
                </label>
                <div id="gw-pin-dots" style="display:flex;justify-content:center;align-items:center;min-height:30px;margin-bottom:14px;">
                  ${renderPinDots(pinCount)}
                </div>

                <!-- Keypad -->
                <div id="gw-keypad" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;max-width:260px;margin:0 auto;">
                  ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `
                    <button type="button" class="btn btn-secondary gw-key-btn" data-key="${n}" style="height:46px;font-size:17px;font-weight:700;border-radius:8px;background:var(--surface, #1e1d1b);border:1px solid var(--line, #33302c);color:var(--ink);">
                      ${n}
                    </button>
                  `).join('')}
                  <button type="button" class="btn btn-ghost gw-key-btn" data-key="clear" style="height:46px;font-size:11px;font-weight:600;border-radius:8px;color:var(--muted);">
                    CLEAR
                  </button>
                  <button type="button" class="btn btn-secondary gw-key-btn" data-key="0" style="height:46px;font-size:17px;font-weight:700;border-radius:8px;background:var(--surface, #1e1d1b);border:1px solid var(--line, #33302c);color:var(--ink);">
                    0
                  </button>
                  <button type="button" class="btn btn-secondary gw-key-btn" data-key="back" style="height:46px;font-size:16px;border-radius:8px;background:var(--surface, #1e1d1b);border:1px solid var(--line, #33302c);color:var(--ink);">
                    ⌫
                  </button>
                </div>
              </div>

              <!-- Submit -->
              <button
                type="submit"
                id="gw-signin-submit-btn"
                class="btn btn-primary"
                ${busy || pinCount !== 6 ? 'disabled' : ''}
                style="width:100%;height:44px;font-weight:700;font-size:14px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;"
              >
                ${busy
                  ? `<span class="spinner" style="width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;"></span><span>Authorising Session…</span>`
                  : `Sign In to Café Operations →`
                }
              </button>
            </form>

            <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line, #33302c);padding-top:14px;margin-top:18px;">
              <button type="button" id="gw-switch-pin-btn" class="btn btn-xs btn-ghost" style="color:var(--muted);font-size:12px;">
                ↻ Change Location / PIN
              </button>
              <button type="button" id="gw-login-staff-btn" class="btn btn-xs btn-ghost" style="font-size:12px;color:var(--bronze-400, #d4a359);font-weight:600;cursor:pointer;">
                Staff &amp; Manager Login →
              </button>
            </div>

          </div>
        `}

      </div>
    </div>
  `;
}

/**
 * Wires interactivity on the rendered Café Gateway page.
 */
export function wireCafeGatewayPage(container, { onSignInSuccess } = {}) {
  const rerender = () => {
    container.innerHTML = renderCafeGatewayPage();
    wireCafeGatewayPage(container, { onSignInSuccess });
  };

  // Keep employeeId input synchronized
  const empInput = container.querySelector('#gw-emp-id');
  if (empInput) {
    empInput.addEventListener('input', (e) => {
      gatewayState.employeeId = e.target.value.trim().toUpperCase();
    });
  }

  // Keypad button handling
  const keypad = container.querySelector('#gw-keypad');
  if (keypad) {
    keypad.addEventListener('click', async (e) => {
      const btn = e.target.closest('.gw-key-btn');
      if (!btn || gatewayState.busy) return;
      const key = btn.dataset.key;

      if (key === 'back') {
        gatewayState.pinDigits.pop();
      } else if (key === 'clear') {
        gatewayState.pinDigits = [];
      } else if (/^\d$/.test(key) && gatewayState.pinDigits.length < 6) {
        gatewayState.pinDigits.push(key);
      }

      // Update dots live
      const dots = container.querySelector('#gw-pin-dots');
      if (dots) {
        dots.innerHTML = renderPinDots(gatewayState.pinDigits.length);
      }

      // Update submit button state in Mode 2
      const submitBtn = container.querySelector('#gw-signin-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = gatewayState.busy || gatewayState.pinDigits.length !== 6;
      }
    });
  }

  // One-time setup code submission for initial commissioning
  const setupCodeBtn = container.querySelector('#gw-setup-code-submit-btn');
  const setupCodeInput = container.querySelector('#gw-setup-code-input');
  setupCodeBtn?.addEventListener('click', async () => {
    const code = setupCodeInput?.value?.trim();
    if (!code) {
      gatewayState.error = 'Please enter your one-time setup code.';
      rerender();
      return;
    }
    gatewayState.busy = true;
    gatewayState.error = '';
    rerender();

    try {
      const res = await apiPost('/cafe-access/resolve', {
        method: 'SETUP_CODE',
        credential: code,
      });

      const data = res?.data || res;
      if (!data?.gatewayContextToken) {
        throw new Error('Cafe Operations access is unavailable.');
      }

      gatewayState.gatewayContextToken = data.gatewayContextToken;
      gatewayState.cafe = data.cafe;
      gatewayState.expiresAt = data.expiresAt;
      gatewayState.isEnteringCafePin = false;
      gatewayState.pinDigits = [];
      gatewayState.busy = false;
      gatewayState.error = '';
      rerender();
    } catch (err) {
      gatewayState.busy = false;
      gatewayState.error = err?.message || 'Invalid or expired setup code.';
      rerender();
    }
  });


  // Mode 2: Employee Sign-In form submission
  const form = container.querySelector('#gw-employee-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (gatewayState.busy) return;

      const employeeId = gatewayState.employeeId || container.querySelector('#gw-emp-id')?.value?.trim().toUpperCase();
      const pin = gatewayState.pinDigits.join('');

      if (!employeeId) {
        gatewayState.error = 'Please enter your Employee Identifier.';
        rerender();
        return;
      }

      if (pin.length !== 6) {
        gatewayState.error = 'Please enter your full 6-digit Operator PIN.';
        rerender();
        return;
      }

      gatewayState.busy = true;
      gatewayState.error = '';
      rerender();

      try {
        const deviceId = getCanonicalDeviceId();
        const res = await apiPost('/cafe-operations/operator/signin', {
          gatewayContextToken: gatewayState.gatewayContextToken,
          operatorUserId: employeeId,
          pin,
          deviceId,
        });

        const data = res?.data || res;
        const sessionToken = data?.sessionToken || data?.operatorSession?.sessionToken;

        if (sessionToken) {
          // P0-06: Store authoritative CafeOps session token immediately
          setCafeOpsSessionToken(sessionToken);
        }

        if (data?.trustedDeviceToken) {
          setCafeOpsDeviceToken(data.trustedDeviceToken);
        }

        if (data?.operatorSession?.operatorSessionId) {
          setSessionId(data.operatorSession.operatorSessionId);
        }

        // Cache for display only — NEVER security authorization authority
        const cafeId = data?.operatorSession?.cafeId || gatewayState.cafe?.cafeId;
        const cafeName = gatewayState.cafe?.displayName || gatewayState.cafe?.name || cafeId;
        if (cafeId) {
          // DISPLAY CACHE ONLY — NEVER AUTHORIZATION AUTHORITY
          try { localStorage.setItem('zamorin_bound_cafe_id', cafeId); } catch {}
        }
        if (cafeName) {
          // DISPLAY CACHE ONLY — NEVER AUTHORIZATION AUTHORITY
          try { localStorage.setItem('zamorin_bound_cafe_name', cafeName); } catch {}
        }

        // Update application state
        setState({
          auth: {
            authenticated: true,
            user: {
              userId: data?.operatorSession?.operatorUserId || employeeId,
              name: data?.operatorSession?.operatorName || employeeId,
              role: 'CAFE_ADMIN',
            },
            loading: false,
          },
          user: {
            userId: data?.operatorSession?.operatorUserId || employeeId,
            name: data?.operatorSession?.operatorName || employeeId,
            role: 'CAFE_ADMIN',
          },
          role: 'cafe_admin',
          route: 'dashboard',
        });

        startCafeOpsInactivityTimer();

        if (typeof onSignInSuccess === 'function') {
          onSignInSuccess(data);
        } else {
          renderShell();
          navigate('dashboard');
        }
      } catch (err) {
        gatewayState.busy = false;
        gatewayState.pinDigits = [];
        const code = err?.code || '';
        if (code === 'GATEWAY_CONTEXT_EXPIRED' || err?.message?.includes('expired')) {
          gatewayState.error = 'This access session has expired. Please start again.';
          gatewayState.gatewayContextToken = null;
        } else if (code === 'WRONG_CAFE_ACCESS' || code === 'CAFE_MISMATCH') {
          gatewayState.error = 'Your account is not authorised for this café.';
        } else {
          gatewayState.error = err?.message || 'Cafe Operations access is unavailable.';
        }
        rerender();
      }
    });
  }

  // Switch Location / Re-scan button
  container.querySelector('#gw-switch-pin-btn')?.addEventListener('click', () => {
    gatewayState.gatewayContextToken = null;
    gatewayState.isEnteringCafePin = false;
    gatewayState.pinDigits = [];
    gatewayState.error = '';
    rerender();
  });

  // Staff & Manager Login with bound cafe context
  container.querySelector('#gw-login-staff-btn')?.addEventListener('click', () => {
    const cafeContext = gatewayState.cafe;
    import('../main.js').then(({ mountAuthScreen }) => {
      mountAuthScreen('login', { cafeContext });
    }).catch(() => {
      window.location.hash = '#login';
    });
  });
}

/**
 * Resolves a QR or Link token and mounts the public gateway screen.
 */
export async function mountPublicCafeGateway(mountParent, { method, token } = {}) {
  const container = mountParent || document.getElementById('app') || document.body;

  if (method && token) {
    // Show resolving state
    container.innerHTML = `
      <div class="login-screen" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg-app, #121110);">
        <div class="login-card card" style="width:400px;max-width:96vw;background:var(--surface-raised, #242220);border:1px solid var(--line-strong, #3d3935);border-radius:12px;padding:32px;text-align:center;color:var(--ink, #ede8e1);">
          <div style="width:40px;height:40px;border:3px solid var(--bronze-500, #b17d38);border-right-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin:0 auto 16px auto;"></div>
          <h3 style="margin:0 0 6px 0;font-size:17px;font-weight:700;color:var(--ink);">Connecting to Café Gateway…</h3>
          <p style="margin:0;font-size:12px;color:var(--muted);">Validating secure access credential</p>
        </div>
      </div>
    `;

    try {
      const res = await apiPost('/cafe-access/resolve', {
        method: String(method).toUpperCase(),
        credential: token,
      });

      const data = res?.data || res;
      if (!data?.gatewayContextToken) {
        throw new Error('Cafe Operations access is unavailable.');
      }

      setActiveGatewayContext({
        gatewayContextToken: data.gatewayContextToken,
        cafe: data.cafe,
        expiresAt: data.expiresAt,
      });

      // Clear raw token from browser address bar
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState({}, '', '/#cafe-gateway');
      }

      container.innerHTML = renderCafeGatewayPage();
      wireCafeGatewayPage(container);
    } catch (err) {
      setActiveGatewayContext({ gatewayContextToken: null, cafe: null });
      gatewayState.error = err?.message || 'Cafe Operations access is unavailable.';
      gatewayState.isEnteringCafePin = true;
      container.innerHTML = renderCafeGatewayPage();
      wireCafeGatewayPage(container);
    }
  } else {
    // Direct gateway mount
    container.innerHTML = renderCafeGatewayPage();
    wireCafeGatewayPage(container);
  }
}

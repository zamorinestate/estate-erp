// =============================================================================
// ZAMORIN CAFÉ ERP — CAFÉ OPERATIONS LOGIN 2.0
// -----------------------------------------------------------------------------
// Same visual design system as Login 2.0 with the 4-part authentication contract:
// 1. Café Selector
// 2. Employee / Staff ID
// 3. Café 6-Digit PIN
// 4. Employee 6-Digit PIN
// =============================================================================

"use strict";

import { apiGet, apiPost, setAccessToken, setSessionId, setCafeOpsSessionToken } from "../apiClient.js";
import { state, setState } from "../state.js";
import { getFixedPageBackground } from "./login2.js";

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ensureCafeOpsCss() {
  if (typeof document === "undefined") return;
  if (!document.querySelector('link[data-cafe-ops-login2-css="1"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/src/styles/cafeOperationsLogin2.css";
    link.setAttribute("data-cafe-ops-login2-css", "1");
    document.head.appendChild(link);
  }
}

export function renderCafeOperationsLogin2({ preselectedCafeId = "", notice = "", error = "" } = {}) {
  ensureCafeOpsCss();

  const currentBg = typeof getFixedPageBackground === "function" ? getFixedPageBackground() : "/src/assets/estate-landscape-bg.jpg";
  const bgStyle = currentBg && (currentBg.startsWith("/") || currentBg.startsWith("http"))
    ? `background-image: url('${currentBg}'); background-size: cover; background-position: center;`
    : "";

  return `
    <div class="l2-bg-layer" style="${bgStyle}"></div>
    <div class="l2-bg-overlay"></div>

    <div class="l2-glass-wrapper">
      <div class="light-glass-container auth-shell-container" id="cafe-ops-login-view" role="main">
        
        <!-- Header & Logo matching approved Login 2.0 -->
        <div class="l2-brand-header">
          <img src="/src/assets/zamorin-logo-horizontal.svg" alt="Zamorin Estate" class="l2-brand-logo-horizontal" />
        </div>

        <div class="login-header" style="margin-bottom: 8px;">
          <h2 style="font-size: 20px; font-weight: 800; letter-spacing: 0.04em;">ZAMORIN ESTATE PVT. LTD.</h2>
          <p class="login-subtitle" style="font-weight: 700; color: #b17d38; letter-spacing: 0.08em; text-transform: uppercase;">CAFÉ OPERATIONS</p>
        </div>

        ${notice ? `<div class="l2-notice-banner">${escHtml(notice)}</div>` : ""}
        <div id="col-error-banner" class="l2-error-banner" style="${error ? "" : "display:none;"}" role="alert">
          ${escHtml(error)}
        </div>

        <form id="col-login-form" novalidate autocomplete="off">
          
          <!-- FIELD 1: CAFÉ SELECTOR -->
          <div class="light-input-group">
            <div class="light-input-icon left" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
            <select id="col-cafe-select" class="light-select" aria-label="Café" required>
              <option value="">Loading authorised cafés...</option>
            </select>
            <div class="light-input-icon right" style="pointer-events: none;" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          <!-- FIELD 2: EMPLOYEE / STAFF ID -->
          <div class="light-input-group">
            <div class="light-input-icon left" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <input 
              type="text" 
              id="col-user-id" 
              placeholder="Enter Employee / Staff ID" 
              aria-label="Employee / Staff ID" 
              required 
              autocomplete="username" 
              spellcheck="false" 
            />
          </div>

          <!-- FIELD 3: CAFÉ 6-DIGIT PIN -->
          <div class="light-input-group">
            <div class="light-input-icon left" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <input 
              type="password" 
              id="col-cafe-pin" 
              placeholder="Café 6-Digit PIN" 
              aria-label="Café 6-Digit PIN" 
              maxlength="6" 
              inputmode="numeric" 
              pattern="[0-9]*" 
              required 
              autocomplete="off" 
            />
            <button 
              type="button" 
              class="light-input-icon right col-toggle-pin" 
              id="col-toggle-cafe-pin" 
              aria-label="Show Café PIN"
            >
              <svg class="col-eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>

          <!-- FIELD 4: EMPLOYEE 6-DIGIT PIN -->
          <div class="light-input-group">
            <div class="light-input-icon left" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                <circle cx="12" cy="16" r="1.5" fill="currentColor"></circle>
              </svg>
            </div>
            <input 
              type="password" 
              id="col-employee-pin" 
              placeholder="Employee 6-Digit PIN" 
              aria-label="Employee 6-Digit PIN" 
              maxlength="6" 
              inputmode="numeric" 
              pattern="[0-9]*" 
              required 
              autocomplete="current-password" 
            />
            <button 
              type="button" 
              class="light-input-icon right col-toggle-pin" 
              id="col-toggle-emp-pin" 
              aria-label="Show Employee PIN"
            >
              <svg class="col-eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>

          <!-- PRIMARY ACTION: SIGN IN TO CAFÉ OPERATIONS -->
          <div style="margin-top: 14px;">
            <button type="submit" id="col-submit-btn" class="light-btn btn-pill-lime" style="width: 100%; font-weight: 700; letter-spacing: 0.02em;">
              SIGN IN TO CAFÉ OPERATIONS
            </button>
          </div>
        </form>

        <!-- FOOTER / RETURN TO NORMAL LOGIN -->
        <div class="auth-footer" style="margin-top: 14px; text-align: center;">
          <a href="#/login" class="btn-pill-white" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; padding: 7px 18px;">
            ← Normal Enterprise Login
          </a>
        </div>

      </div>
    </div>
  `;
}

export function wireCafeOperationsLogin2(root = document, { onSignIn } = {}) {
  ensureCafeOpsCss();

  const form = root.querySelector("#col-login-form");
  const cafeSelect = root.querySelector("#col-cafe-select");
  const userIdInput = root.querySelector("#col-user-id");
  const cafePinInput = root.querySelector("#col-cafe-pin");
  const empPinInput = root.querySelector("#col-employee-pin");
  const submitBtn = root.querySelector("#col-submit-btn");
  const errorBanner = root.querySelector("#col-error-banner");

  const toggleCafePinBtn = root.querySelector("#col-toggle-cafe-pin");
  const toggleEmpPinBtn = root.querySelector("#col-toggle-emp-pin");

  function showError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg || "Unable to sign in. Please verify your Café, ID and PINs.";
    errorBanner.style.display = "block";
  }

  function hideError() {
    if (!errorBanner) return;
    errorBanner.textContent = "";
    errorBanner.style.display = "none";
  }

  // Set up PIN toggle buttons (masked by default)
  function setupPinToggle(btn, input, labelPrefix) {
    if (!btn || !input) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const isMasked = input.type === "password";
      input.type = isMasked ? "text" : "password";
      btn.setAttribute("aria-label", isMasked ? `Hide ${labelPrefix} PIN` : `Show ${labelPrefix} PIN`);
      
      const eyeIcon = btn.querySelector("svg");
      if (eyeIcon) {
        eyeIcon.innerHTML = isMasked
          ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
          : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
      }
    });
  }

  setupPinToggle(toggleCafePinBtn, cafePinInput, "Café");
  setupPinToggle(toggleEmpPinBtn, empPinInput, "Employee");

  // Numeric enforcement for PIN inputs (preserves strings with leading zeros)
  [cafePinInput, empPinInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", (e) => {
      const sanitized = e.target.value.replace(/\D/g, "").slice(0, 6);
      if (e.target.value !== sanitized) {
        e.target.value = sanitized;
      }
      hideError();
    });
  });

  userIdInput?.addEventListener("input", () => hideError());
  cafeSelect?.addEventListener("change", () => hideError());

  // Determine preselected cafe from URL search query or hash
  let targetCafeParam = "";
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hashQuery = window.location.hash.includes("?")
      ? window.location.hash.substring(window.location.hash.indexOf("?") + 1)
      : "";
    const hashParams = new URLSearchParams(hashQuery);
    targetCafeParam = (urlParams.get("cafe") || hashParams.get("cafe") || "").trim().toUpperCase();
  } catch {}

  // Load Authorised Active Cafés dynamically
  async function loadCafes() {
    try {
      let cafes = [];
      try {
        const res = await apiGet("/auth/cafe-operations/cafes");
        cafes = res?.data?.cafes || res?.data || res?.cafes || [];
      } catch {
        // Fallback to canonical alias
        const res = await apiGet("/cafe-operations/cafes");
        cafes = res?.data?.cafes || res?.data || res?.cafes || [];
      }

      if (!Array.isArray(cafes) || cafes.length === 0) {
        if (cafeSelect) {
          cafeSelect.innerHTML = `<option value="">No active cafés available</option>`;
        }
        return;
      }

      const optionsHtml = [
        `<option value="">Select Café...</option>`,
        ...cafes.map((c) => {
          const cafeId = escHtml(c.cafeId);
          const name = escHtml(c.displayName || c.name);
          const code = escHtml(c.code || c.cafeId);
          const isSelected = targetCafeParam && (targetCafeParam === c.cafeId.toUpperCase() || targetCafeParam === (c.code || "").toUpperCase());
          return `<option value="${cafeId}" ${isSelected ? "selected" : ""}>${name} — ${code}</option>`;
        }),
      ].join("");

      if (cafeSelect) {
        cafeSelect.innerHTML = optionsHtml;
        if (targetCafeParam) {
          const matched = cafes.find(
            (c) => c.cafeId.toUpperCase() === targetCafeParam || (c.code || "").toUpperCase() === targetCafeParam
          );
          if (matched) {
            cafeSelect.value = matched.cafeId;
          }
        }
      }
    } catch (err) {
      if (cafeSelect) {
        cafeSelect.innerHTML = `<option value="">Unable to load cafés</option>`;
      }
    }
  }

  loadCafes();

  // Submission Handling
  let isSubmitting = false;

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    hideError();

    const cafeId = (cafeSelect?.value || "").trim();
    const userId = (userIdInput?.value || "").trim();
    const cafePin = (cafePinInput?.value || "").trim();
    const employeePin = (empPinInput?.value || "").trim();

    // Client-side validations
    if (!cafeId) {
      showError("Please select a Café.");
      cafeSelect?.focus();
      return;
    }
    if (!userId) {
      showError("Please enter your Employee / Staff ID.");
      userIdInput?.focus();
      return;
    }
    if (!/^\d{6}$/.test(cafePin)) {
      showError("Café PIN must be exactly 6 numeric digits.");
      cafePinInput?.focus();
      return;
    }
    if (!/^\d{6}$/.test(employeePin)) {
      showError("Employee PIN must be exactly 6 numeric digits.");
      empPinInput?.focus();
      return;
    }

    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Signing In...";
    }

    try {
      const payload = {
        cafeId,
        userId,
        cafePin,
        employeePin,
      };

      let res = null;
      try {
        res = await apiPost("/auth/cafe-operations/login", payload, { allowRefreshRetry: false });
      } catch (postErr) {
        if (postErr?.status === 404) {
          res = await apiPost("/cafe-operations/login", payload, { allowRefreshRetry: false });
        } else {
          throw postErr;
        }
      }

      if (!res?.success) {
        const errorMsg = res?.error?.message || "Unable to sign in. Please verify your Café, ID and PINs.";
        showError(errorMsg);
        return;
      }

      // Successful 4-part authentication
      const data = res.data || {};
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        try { localStorage.setItem("zamorin_token", data.accessToken); } catch {}
      }

      if (data.session?.sessionId) {
        setSessionId(data.session.sessionId);
      }

      if (data.session?.sessionToken) {
        setCafeOpsSessionToken(data.session.sessionToken);
      }

      const boundCafeId = data.cafe?.cafeId || data.user?.boundCafeId || cafeId;
      const boundCafeName = data.cafe?.displayName || data.cafe?.name || data.user?.boundCafeName || "";

      try {
        localStorage.setItem("zamorin_bound_cafe_id", boundCafeId);
        if (boundCafeName) {
          localStorage.setItem("zamorin_bound_cafe_name", boundCafeName);
        }
      } catch {}

      if (data.user) {
        const rawRole = (data.user.role || "STAFF").toLowerCase();
        const canonicalRole = (rawRole === "admin" || rawRole === "cafe_admin") ? "cafe_admin" : rawRole;
        setState({
          auth: {
            authenticated: true,
            loading: false,
            user: data.user,
            error: null,
          },
          role: canonicalRole,
          user: data.user,
          selectedCafeId: boundCafeId,
          currentCafeId: boundCafeId,
        });
        try { localStorage.setItem("zamorin_user", JSON.stringify(data.user)); } catch {}
      }

      if (typeof onSignIn === "function") {
        await onSignIn(data);
      } else {
        const userRole = (data?.user?.role || state.user?.role || "").toUpperCase();
        const targetRoute = userRole === "STAFF" ? "staff-home" : "dashboard";
        const { renderShell, navigate } = await import("../router.js");
        renderShell();
        navigate(targetRoute);
      }

    } catch (err) {
      let msg = "Unable to sign in. Please verify your Café, ID and PINs.";
      if (err?.data?.error?.message) {
        msg = err.data.error.message;
      } else if (err?.status !== 401 && err?.status !== 403 && err?.message && !err?.message.includes("session")) {
        msg = err.message;
      }
      showError(msg);
    } finally {
      isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "SIGN IN TO CAFÉ OPERATIONS";
      }
    }
  });
}

// =============================================================================
// COMPONENT: Universal Change Password Modal (SCR-028 / Part G P0 Fix)
//
// Authoritative universal password change implementation with:
// - Current password verification
// - Show / hide eye toggles on all 3 fields
// - Real-time password strength meter (OWASP compliant)
// - Matching confirmation check
// - Caps Lock detection & warning
// - Backend integration with POST /api/v1/auth/password/change
// - Safe error handling with no secret leakage
// =============================================================================

import { apiPost, clearAllAuthTokens, clearAccessToken, clearApiCacheAndInFlight } from "../apiClient.js";
import { openModal, closeModal, showToast } from "../components.js";

/**
 * Evaluates password strength score (0-4) using modern NIST SP 800-63B guidelines
 * (Length-first, passphrase support, zero forced composition rules)
 */
function evaluatePasswordStrength(password) {
  const p = password || "";
  const len = p.length;

  const criteria = {
    length15: len >= 15,
    length20: len >= 20,
    hasSpacesOrSymbols: /[ \t!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p),
    notRepetitive: !/^(.)\1+$/.test(p) && len >= 15,
  };

  let score = 0;
  if (len >= 15) score += 1;
  if (len >= 18) score += 1;
  if (len >= 22 || criteria.length20) score += 1;
  if (criteria.hasSpacesOrSymbols && len >= 16) score += 1;

  let label = "Too Short (min 15 chars)";
  let color = "#ef4444"; // red
  if (len < 15) {
    label = "Too Short (min 15 chars)";
    color = "#ef4444";
  } else if (score >= 4 || len >= 24) {
    label = "Very Strong Passphrase";
    color = "#10b981"; // green
  } else if (score >= 3 || len >= 18) {
    label = "Strong";
    color = "#059669"; // emerald
  } else {
    label = "Acceptable (15+ chars)";
    color = "#f59e0b"; // amber
  }

  return { score, label, color, criteria };
}

/**
 * Opens the universal Change Password modal
 */
export function openChangePasswordModal() {
  const bodyHtml = `
    <form id="universal-change-password-form" style="display:flex; flex-direction:column; gap:16px; font-size:13px;" onsubmit="return false;">
      <p style="margin:0; color:var(--muted); line-height:1.4;">
        For your security, enter your current password followed by a strong new password meeting enterprise complexity standards.
      </p>

      <div id="caps-lock-warning" style="display:none; background:rgba(245,158,11,0.15); border:1px solid #f59e0b; color:#b45309; padding:8px 12px; border-radius:6px; font-size:12px; font-weight:600;">
        ⚠️ Warning: Caps Lock is ON
      </div>

      <!-- Current Password -->
      <div>
        <label style="display:block; font-weight:700; color:var(--ink); margin-bottom:4px;">
          Current Password <span style="color:#ef4444;">*</span>
        </label>
        <div style="position:relative; display:flex; align-items:center;">
          <input 
            type="password" 
            id="pwd-current" 
            class="input" 
            placeholder="Enter current password" 
            required 
            autocomplete="current-password"
            style="width:100%; padding-right:38px; font-family:var(--font-mono); font-size:13px;" 
          />
          <button 
            type="button" 
            data-toggle-visibility="pwd-current" 
            title="Toggle visibility"
            style="position:absolute; right:8px; background:none; border:none; color:var(--muted); cursor:pointer; padding:4px; font-size:16px;"
          >👁</button>
        </div>
      </div>

      <!-- New Password -->
      <div>
        <label style="display:block; font-weight:700; color:var(--ink); margin-bottom:4px;">
          New Password <span style="color:#ef4444;">*</span>
        </label>
        <div style="position:relative; display:flex; align-items:center;">
          <input 
            type="password" 
            id="pwd-new" 
            class="input" 
            placeholder="Enter new password (min 15 characters)" 
            required 
            autocomplete="new-password"
            style="width:100%; padding-right:38px; font-family:var(--font-mono); font-size:13px;" 
          />
          <button 
            type="button" 
            data-toggle-visibility="pwd-new" 
            title="Toggle visibility"
            style="position:absolute; right:8px; background:none; border:none; color:var(--muted); cursor:pointer; padding:4px; font-size:16px;"
          >👁</button>
        </div>

        <!-- Strength Meter -->
        <div style="margin-top:6px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px;">
            <span style="color:var(--muted);">Strength: <strong id="pwd-strength-label" style="color:#ef4444;">Too Short</strong></span>
            <span style="color:var(--muted); font-size:10.5px;">NIST SP 800-63B (15-char Single Factor)</span>
          </div>
          <div style="height:5px; background:var(--line); border-radius:3px; overflow:hidden;">
            <div id="pwd-strength-bar" style="height:100%; width:10%; background:#ef4444; transition:width 0.2s, background-color 0.2s;"></div>
          </div>
        </div>

        <!-- Criteria Checklist (NIST SP 800-63B single factor aligned) -->
        <div id="pwd-criteria-list" style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:8px; font-size:11px; color:var(--muted);">
          <span id="crit-length15">○ At least 15 characters</span>
          <span id="crit-length20">○ 20+ char passphrase</span>
          <span id="crit-symbols">○ Spaces &amp; symbols allowed</span>
          <span id="crit-nonrepetitive">○ Non-repetitive phrase</span>
        </div>
      </div>

      <!-- Confirm New Password -->
      <div>
        <label style="display:block; font-weight:700; color:var(--ink); margin-bottom:4px;">
          Confirm New Password <span style="color:#ef4444;">*</span>
        </label>
        <div style="position:relative; display:flex; align-items:center;">
          <input 
            type="password" 
            id="pwd-confirm" 
            class="input" 
            placeholder="Confirm new password" 
            required 
            autocomplete="new-password"
            style="width:100%; padding-right:38px; font-family:var(--font-mono); font-size:13px;" 
          />
          <button 
            type="button" 
            data-toggle-visibility="pwd-confirm" 
            title="Toggle visibility"
            style="position:absolute; right:8px; background:none; border:none; color:var(--muted); cursor:pointer; padding:4px; font-size:16px;"
          >👁</button>
        </div>
        <div id="pwd-match-error" style="display:none; color:#ef4444; font-size:11px; margin-top:4px; font-weight:600;">
          ❌ Passwords do not match.
        </div>
      </div>

      <!-- Revoke Other Sessions Option -->
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; color:var(--ink); margin-top:4px;">
        <input type="checkbox" id="pwd-revoke-others" checked />
        <span>Sign out of all other active sessions across devices</span>
      </label>

      <div id="pwd-submit-error" style="display:none; background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#dc2626; padding:8px 12px; border-radius:6px; font-size:12px;"></div>
    </form>
  `;

  openModal({
    title: "Change Account Password",
    body: bodyHtml,
    maxWidth: "480px",
    saveLabel: "Update Password",
    cancelLabel: "Cancel",
    onSave: async () => {
      const currentInput = document.getElementById("pwd-current");
      const newInput = document.getElementById("pwd-new");
      const confirmInput = document.getElementById("pwd-confirm");
      const revokeCheckbox = document.getElementById("pwd-revoke-others");
      const errorBox = document.getElementById("pwd-submit-error");

      const currentPassword = currentInput?.value || "";
      const newPassword = newInput?.value || "";
      const confirmPassword = confirmInput?.value || "";
      const revokeOtherSessions = Boolean(revokeCheckbox?.checked);

      if (!currentPassword) {
        const msg = "Please enter your current password.";
        if (errorBox) {
          errorBox.textContent = msg;
          errorBox.style.display = "block";
        }
        showToast(msg, "warning");
        currentInput?.focus();
        return false;
      }

      if (!newPassword || newPassword.length < 15) {
        const msg = "New password must be at least 15 characters long for security compliance.";
        if (errorBox) {
          errorBox.textContent = msg;
          errorBox.style.display = "block";
        }
        showToast(msg, "warning");
        newInput?.focus();
        return false;
      }

      if (newPassword !== confirmPassword) {
        const msg = "New passwords do not match.";
        if (errorBox) {
          errorBox.textContent = msg;
          errorBox.style.display = "block";
        }
        showToast(msg, "danger");
        confirmInput?.focus();
        return false;
      }

      try {
        const res = await apiPost("/auth/password/change", {
          currentPassword,
          newPassword,
          revokeOtherSessions,
        });

        if (res && res.success !== false) {
          showToast("Password changed successfully! Signing out to activate new password...", "mint");
          closeModal();
          clearAllAuthTokens();
          clearAccessToken();
          clearApiCacheAndInFlight();
          setTimeout(() => {
            window.location.hash = "#login";
            window.location.reload();
          }, 1000);
          return true;
        } else {
          const msg = res?.error?.message || res?.message || "Failed to change password.";
          if (errorBox) {
            errorBox.textContent = msg;
            errorBox.style.display = "block";
          }
          showToast(msg, "error");
          return false;
        }
      } catch (err) {
        const msg = err.message || "Failed to update password. Check your current password.";
        if (errorBox) {
          errorBox.textContent = msg;
          errorBox.style.display = "block";
        }
        showToast(msg, "error");
        return false;
      }
    },
  });

  // Wire interactive controls inside the modal
  setTimeout(() => {
    // 1. Password visibility toggles
    document.querySelectorAll("[data-toggle-visibility]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.toggleVisibility;
        const input = document.getElementById(targetId);
        if (!input) return;
        if (input.type === "password") {
          input.type = "text";
          btn.textContent = "🙈";
        } else {
          input.type = "password";
          btn.textContent = "👁";
        }
      });
    });

    // 2. Caps lock warning
    const warning = document.getElementById("caps-lock-warning");
    const checkCapsLock = (e) => {
      if (warning) {
        warning.style.display = e.getModifierState("CapsLock") ? "block" : "none";
      }
    };
    ["pwd-current", "pwd-new", "pwd-confirm"].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("keydown", checkCapsLock);
      el?.addEventListener("keyup", checkCapsLock);
    });

    // 3. Live strength meter & criteria
    const newPwdInput = document.getElementById("pwd-new");
    const strengthBar = document.getElementById("pwd-strength-bar");
    const strengthLabel = document.getElementById("pwd-strength-label");
    const critLength15 = document.getElementById("crit-length15");
    const critLength20 = document.getElementById("crit-length20");
    const critSymbols = document.getElementById("crit-symbols");
    const critNonRep = document.getElementById("crit-nonrepetitive");

    const updateCriteria = () => {
      const val = newPwdInput?.value || "";
      const { score, label, color, criteria } = evaluatePasswordStrength(val);

      if (strengthBar) {
        const pct = Math.max(10, Math.min(100, score * 25));
        strengthBar.style.width = `${pct}%`;
        strengthBar.style.backgroundColor = color;
      }
      if (strengthLabel) {
        strengthLabel.textContent = label;
        strengthLabel.style.color = color;
      }

      if (critLength15) critLength15.innerHTML = criteria.length15 ? "<span style='color:#10b981'>✓</span> At least 15 characters" : "○ At least 15 characters";
      if (critLength20) critLength20.innerHTML = criteria.length20 ? "<span style='color:#10b981'>✓</span> 20+ char passphrase" : "○ 20+ char passphrase";
      if (critSymbols) critSymbols.innerHTML = criteria.hasSpacesOrSymbols ? "<span style='color:#10b981'>✓</span> Spaces &amp; symbols allowed" : "○ Spaces &amp; symbols allowed";
      if (critNonRep) critNonRep.innerHTML = criteria.notRepetitive ? "<span style='color:#10b981'>✓</span> Non-repetitive phrase" : "○ Non-repetitive phrase";
    };

    newPwdInput?.addEventListener("input", updateCriteria);

    // 4. Matching confirmation check
    const confirmPwdInput = document.getElementById("pwd-confirm");
    const matchError = document.getElementById("pwd-match-error");

    const checkMatch = () => {
      const p1 = newPwdInput?.value || "";
      const p2 = confirmPwdInput?.value || "";
      if (p2 && p1 !== p2) {
        if (matchError) matchError.style.display = "block";
      } else {
        if (matchError) matchError.style.display = "none";
      }
    };

    confirmPwdInput?.addEventListener("input", checkMatch);
    newPwdInput?.addEventListener("input", checkMatch);
  }, 50);
}

// =============================================================================
// ZAMORIN CAFE ERP — ENTRY POINT
//
// DIRECT DASHBOARD ENTRY & ZERO-COLLATERAL-CHANGE PROGRAMME
// -----------------------------------------------------------------------------
// In development & local preview mode:
//   1. On boot, loads the canonical MASTER (Primary Master) role context.
//   2. Seamlessly synchronizes with any active session from /api/v1/auth/me.
//   3. Shows a top banner indicating active role with instant view switching.
//   4. Directly mounts and renders the Command Centre Dashboard.
//
// PRODUCTION SECURITY:
//   1. DEV PREVIEW personas are NEVER used on public/production origins.
//   2. Production requires a valid authenticated /api/v1/auth/me session.
//   3. Unauthenticated production users are sent to the real login screen.
//   4. Development step-up auto-approval is restricted to localhost only.
// =============================================================================

import { state, setState, applyTheme, toggleTheme, isDarkTheme } from "./state.js";
import { NAVIGATION, ROLES, isRouteAllowed } from "./navigation.js";
import {
  apiGet,
  apiPost,
  getAccessToken,
  getOrCreateDeviceId,
  setStepUpAuthenticationHandler,
  setAccessToken,
  clearAllAuthTokens,
  addSessionExpirationListener,
  setSessionState,
  SessionState,
} from "./apiClient.js";
import { registerServiceWorker } from "./updateManager.js";
import { initLanguage } from "./i18n.js";
import {
  renderLoginPage2,
  wireLoginPage2,
  renderPasswordResetRequest2,
  wirePasswordResetRequest2,
  renderPasswordResetVerify2,
  wirePasswordResetVerify2,
  renderPasswordResetFinal2,
  wirePasswordResetFinal2,
  renderMfaChallenge2,
  wireMfaChallenge2,
  renderMfaReenrollment2,
  wireMfaReenrollment2,
  showGlassAlert,
  abortActivePasskeyRequests,
} from "./pages/login2.js?v=3.6.0";

// Lazy-loaded Router Module: Prevents 75+ admin pages (4.5 MB) from loading during initial login screen display
let routerModulePromise = null;
export function getRouter() {
  if (!routerModulePromise) {
    routerModulePromise = import("./router.js?v=3.9.0");
  }
  return routerModulePromise;
}

export async function renderShell() {
  const router = await getRouter();
  return router.renderShell();
}

export async function navigate(route, replace = false) {
  const router = await getRouter();
  return router.navigate(route, replace);
}

let cafeGatewayModulePromise = null;
async function getCafeGateway() {
  if (!cafeGatewayModulePromise) {
    cafeGatewayModulePromise = import("./pages/cafeGatewayPage.js");
  }
  return cafeGatewayModulePromise;
}

if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
  import("./responsiveAuditor.js").catch(() => {});
}

// =============================================================================
// DEVELOPMENT PREVIEW USERS
// =============================================================================
//
// These fixtures are strictly development/local-preview identities.
//
// IMPORTANT:
// They must NEVER be used as an authentication fallback on public,
// staging, preview-deployment, or production origins.
// =============================================================================

export const DEV_PREVIEW_USERS = Object.freeze({
  master: Object.freeze({
    _id: "MU-0001",
    id: "MU-0001",
    name: "Zamorin Primary Master",
    email: "pradeeshk331@gmail.com",
    role: "MASTER",
    designation: "Primary Master",
    position: "Primary Master",
    organisationId: "ZAMORIN",
    status: "ACTIVE",
    isPrimaryMaster: true,
    isDevPreview: true,
  }),


  owner: Object.freeze({
    _id: "OU-0001",
    id: "OU-0001",
    name: "Café Owner",
    email: "owner@example.com",
    role: "OWNER",
    designation: "Café Owner / Franchise Partner",
    position: "Café Owner / Franchise Partner",
    organisationId: "ZAMORIN",
    status: "ACTIVE",
    isDevPreview: true,
  }),

  cafe_admin: Object.freeze({
    _id: "AU-0001",
    id: "AU-0001",
    name: "Cafe Admin (Ops)",
    email: "admin@example.com",
    role: "CAFE_ADMIN",
    primaryCafeId: "",
    primaryCafeName: "",
    assignedCafeIds: [],
    organisationId: "ZAMORIN",
    status: "ACTIVE",
    isDevPreview: true,
  }),

  staff: Object.freeze({
    _id: "SU-0001",
    id: "SU-0001",
    name: "Normal Employee / Staff",
    email: "staff@example.com",
    role: "STAFF",
    primaryCafeId: "",
    assignedCafeIds: [],
    organisationId: "ZAMORIN",
    status: "ACTIVE",
    isDevPreview: true,
  }),
});

// =============================================================================
// DEVELOPMENT ROLE RESOLUTION
// =============================================================================

export function getRequestedDevRole() {
  if (typeof window === "undefined") {
    return "master";
  }

  const params = new URLSearchParams(window.location.search);

  const requested = (
    params.get("role") ||
    params.get("devRole") ||
    localStorage.getItem("zamorin-dev-role") ||
    "master"
  ).toLowerCase();

  const authority = (params.get("authority") || "").toLowerCase();

  if (
    requested === "staff" ||
    requested === "employee" ||
    requested === "normal-employee"
  ) {
    return "staff";
  }

  if (requested === "owner") {
    return "owner";
  }

  if (
    requested === "admin" ||
    requested === "cafe_admin" ||
    requested === "cafe-admin"
  ) {
    return "cafe_admin";
  }


  if (requested === "master") {
    return "master";
  }

  return null;
}

// =============================================================================
// ENVIRONMENT SECURITY
// =============================================================================

export function isLocalDevelopmentOrigin() {
  if (typeof window === "undefined") {
    return true;
  }

  const hostname = window.location.hostname;

  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0"
  );
}

export function isDirectDashboardAllowed() {
  if (typeof window === "undefined") {
    return true;
  }

  return isLocalDevelopmentOrigin();
}

export function renderProductionFailClosedScreen() {
  if (typeof document === "undefined") {
    return;
  }

  const appEl = document.getElementById("app");

  if (!appEl) {
    return;
  }

  appEl.innerHTML = `
    <div
      style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        font-family: sans-serif;
        background: #0b0f19;
        color: #f8fafc;
        text-align: center;
        padding: 24px;
      "
    >
      <h1 style="color: #ef4444; margin-bottom: 12px;">
        Production Security Guard
      </h1>

      <p
        style="
          color: #94a3b8;
          max-width: 480px;
          line-height: 1.5;
        "
      >
        Fail-closed: Direct dashboard bypass is strictly forbidden in
        production environments. Please authenticate with valid credentials.
      </p>
    </div>
  `;
}

export function renderFrontendOnlyScreen() {
  if (typeof document === "undefined") return;
  const appEl = document.getElementById("app");
  if (!appEl) return;
  appEl.className = "auth-screen";
  appEl.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--paper,#f5f5f7);color:var(--ink,#1d1d1f);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <section style="width:min(560px,100%);padding:28px;border:1px solid var(--line,rgba(60,60,67,.16));border-radius:24px;background:var(--surface-raised,#fff);box-shadow:0 18px 50px rgba(0,0,0,.10);">
        <h1 style="margin:0 0 10px;font-size:28px;">Frontend-only mode</h1>
        <p style="margin:0;color:var(--muted,#636366);line-height:1.55;">Server-backed features are unavailable. Preserved data is not exposed to this frontend.</p>
      </section>
    </main>
  `;
}

// =============================================================================
// AUTHENTICATION HELPERS
// =============================================================================

export async function handleLoginSubmit({
  organisationId,
  email,
  password,
  rememberDevice = false,
  targetCafeId = null,
}) {
  const payload = {
    organisationId,
    email,
    password,
    identifier: email,
    rememberDevice: Boolean(rememberDevice),
    device: {
      deviceId: getOrCreateDeviceId(),
      deviceName: "Browser Client",
      deviceType: "DESKTOP",
    },
  };

  if (targetCafeId) {
    payload.targetCafeId = String(targetCafeId).trim().toUpperCase();
  }

  const result = await apiPost("/auth/login", payload, {
    timeoutMs: 60000,
  });

  if (result?.data?.accessToken) {
    setAccessToken(result.data.accessToken);
  }

  return result;
}

export async function handlePasswordResetRequest({
  organisationId,
  email,
}) {
  const result = await apiPost("/auth/password/forgot", {
    organisationId,
    email,
  });

  return result;
}

export async function handlePasswordResetVerify({
  organisationId,
  email,
  code,
}) {
  const result = await apiPost("/auth/password/reset/verify", {
    organisationId,
    email,
    code,
  });

  const challengeId = result?.data?.challengeId;
  const resetToken = result?.data?.resetToken;

  if (!challengeId || !resetToken) {
    throw new Error(
      "Password reset credentials missing in response."
    );
  }

  return {
    challengeId,
    resetToken,
  };
}

export async function handlePasswordResetFinal({
  organisationId,
  challengeId,
  resetToken,
  newPassword,
}) {
  const result = await apiPost("/auth/password/reset", {
    organisationId,
    challengeId,
    resetToken,
    newPassword,
  });

  return result;
}

export function getSafeInternalRedirect(target) {
  if (!target || typeof target !== "string") return null;
  const trimmed = target.trim();
  // Disallow protocol-relative URLs (//example.com, \example.com)
  if (trimmed.startsWith("//") || trimmed.startsWith("\\\\") || trimmed.startsWith("/\\")) return null;
  // Disallow absolute URI schemes (http:, https:, javascript:, data:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  // Disallow control characters
  if (/[\r\n\0]/.test(trimmed)) return null;

  // Safe internal hash route: e.g. "#pos", "#settings", "#vendors", "pos", "settings"
  if (trimmed.startsWith("#")) {
    const rawRoute = trimmed.slice(1).replace(/^\/+/, "");
    return rawRoute || null;
  }
  // Safe relative internal pathname: e.g. "/pos", "/vendors", "/settings"
  if (trimmed.startsWith("/")) {
    const rawRoute = trimmed.slice(1);
    return rawRoute || null;
  }
  // Simple internal route key: e.g. "pos", "vendors"
  if (/^[a-zA-Z0-9_\-\/]+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function resolveAuthenticatedRole(user) {
  const rawRole = String(user?.role || "").toUpperCase();

  if (rawRole === "PRIMARY_MASTER" || rawRole === "MASTER") {
    const isPrimaryMaster = user?.isPrimaryMaster === true;
    if (!isPrimaryMaster) {
      // Defense in depth: a non-primary MASTER is a retired/invalid account
      // state. The backend rejects it; the frontend also refuses to grant
      // Primary-Master navigation if such a payload ever reaches the client.
      return {
        role: "staff",
        isPrimaryMaster: false,
      };
    }
    return {
      role: "master",
      isPrimaryMaster: true,
    };
  }

  if (rawRole === "OWNER") {
    return {
      role: "owner",
      isPrimaryMaster: false,
    };
  }

  if (rawRole === "CAFE_ADMIN" || rawRole === "ADMIN") {
    return {
      role: "cafe_admin",
      isPrimaryMaster: false,
    };
  }

  if (rawRole === "STAFF" || rawRole === "EMPLOYEE") {
    return {
      role: "staff",
      isPrimaryMaster: false,
    };
  }

  if (rawRole === "VENDOR") {
    return {
      role: "vendor",
      isPrimaryMaster: false,
    };
  }

  // Fail closed to the least-privileged application navigation context.
  return {
    role: "staff",
    isPrimaryMaster: false,
  };
}

async function enforceRequiredPasswordChange(user, explicitRequirement = false) {
  const mustChangePassword =
    explicitRequirement === true ||
    user?.mustChangePassword === true;

  if (!mustChangePassword) {
    return false;
  }

  abortActivePasskeyRequests();
  const { role, isPrimaryMaster } = resolveAuthenticatedRole(user);

  setSessionState(SessionState.AUTHENTICATED);
  setState({
    auth: {
      authenticated: true,
      user,
      loading: false,
      passwordChangeRequired: true,
    },
    user,
    role,
    isPrimaryMaster,
  });

  try {
    if (typeof localStorage !== "undefined" && user) {
      localStorage.removeItem("zamorin-dev-role");
      localStorage.setItem("zamorin_user", JSON.stringify(user));
    }
  } catch {}

  const { openChangePasswordModal } =
    await import("./components/changePasswordModal.js");

  openChangePasswordModal({ forced: true });
  return true;
}

// =============================================================================
// AUTHENTICATION SCREEN
// =============================================================================

// =============================================================================
// BACKEND HEALTH WARM-UP (NON-BLOCKING & ASYNCHRONOUS)
// =============================================================================
let warmupTriggered = false;

export function triggerBackendWarmup() {
  if (warmupTriggered) return;
  warmupTriggered = true;

  try {
    const apiBase = window.ZAMORIN_API_BASE_URL || "/api/v1";
    // Non-blocking fetch with ZERO credentials to wake up backend during cold starts
    fetch(`${apiBase}/health/live`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
    }).catch(() => {});

    // Also trigger direct Render backend wake-up to eliminate cold-start wait
    fetch("/api/v1/health/live", {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      mode: "no-cors",
    }).catch(() => {});
  } catch {}
}

export function mountAuthScreen(screen = "login", params = {}) {
  if (typeof document === "undefined") return;
  abortActivePasskeyRequests();

  const appEl = document.getElementById("app");
  if (!appEl) return;

  // Authentication screens must never display the development banner.
  document.getElementById("zamorin-dev-preview-banner")?.remove();

  appEl.className = "auth-screen";
  document.body?.classList.add("auth-page");
  delete appEl.dataset.shellRole;

  if (screen === "login") {
    // Non-blocking wake-up call to backend
    triggerBackendWarmup();

    const activeCafe = params.cafeContext || null;
    const existingOrgId = appEl.querySelector("#l2-org-id")?.value;
    const existingEmail = appEl.querySelector("#l2-email")?.value;
    const existingPassword = appEl.querySelector("#l2-password")?.value;
    const hasPreRenderedDom = Boolean(appEl.querySelector("#l2-login-form"));
    const hasUnsupportedLegacyAuthControls = Boolean(
      appEl.querySelector(
        "#l2-social-google, #l2-social-apple, #l2-social-facebook, #l2-to-register-btn"
      )
    );

    if (!hasPreRenderedDom || hasUnsupportedLegacyAuthControls || params.notice || params.error || activeCafe) {
      appEl.innerHTML = renderLoginPage2({
        ...params,
        organisationId: params.organisationId ?? existingOrgId ?? "",
        email: params.email ?? existingEmail ?? "",
        cafeContext: activeCafe,
      });
      if (existingPassword && appEl.querySelector("#l2-password")) {
        appEl.querySelector("#l2-password").value = existingPassword;
      }
    }
    wireLoginPage2(appEl, {
      onSubmit: async ({ organisationId, email, password, rememberDevice, targetCafeId }) => {
        await handleCompleteLoginFlow({ organisationId, email, password, rememberDevice, targetCafeId });
      },
      onForgotPassword: ({ organisationId, email }) => {
        mountAuthScreen("forgot", { organisationId, email });
      },
      onCafeOps: () => {
        window.location.href = "/cafe-operations/cafe-operations.html";
      },
      onPasskeySuccess: async (user) => {
        await handleAuthenticatedUserSession(user);
      }
    });

    // Input-focus socket & TLS pre-warming: keeps the HTTP/2 connection open and warm while user types
    const emailEl = appEl.querySelector("#l2-email");
    const pwdEl = appEl.querySelector("#l2-password");
    if (emailEl || pwdEl) {
      let focusWarmDone = false;
      const warmOnFocus = () => {
        if (focusWarmDone) return;
        focusWarmDone = true;
        try {
          fetch("/api/v1/health/live", { method: "HEAD", cache: "no-store" }).catch(() => {});
        } catch {}
      };
      emailEl?.addEventListener("focus", warmOnFocus, { once: true });
      pwdEl?.addEventListener("focus", warmOnFocus, { once: true });
    }
  } else if (screen === "mfa") {
    const isSetup = Boolean(params.mfaSetupRequired);
    const challengeToken = params.mfaChallengeToken || params.tempToken || "";
    const rememberDevice = Boolean(params.rememberDevice);

    if (isSetup && !params.mfaSetupPrepared) {
      appEl.innerHTML = renderMfaChallenge2({
        ...params,
        setupLoading: true,
      });

      apiPost(
        "/auth/mfa/setup",
        { mfaSetupToken: challengeToken },
        { timeoutMs: 60000 }
      ).then((preparation) => {
        mountAuthScreen("mfa", {
          ...params,
          mfaSetupPrepared: true,
          manualEntrySecret:
            preparation?.data?.manualEntrySecret || "",
          otpauthUri:
            preparation?.data?.otpauthUri || "",
        });
      }).catch((error) => {
        mountAuthScreen("login", {
          email: params.email || "",
          error:
            error?.userMessage ||
            error?.message ||
            "Unable to start multi-factor authentication setup. Please sign in again.",
        });
      });
      return;
    }

    const handleMfaSubmit = async ({ code, recoveryCode }) => {
      try {
        const endpoint = isSetup ? "/auth/mfa/confirm" : "/auth/mfa/verify";
        const payload = isSetup
          ? { mfaSetupToken: challengeToken, code, rememberDevice }
          : {
              mfaChallengeToken: challengeToken,
              ...(recoveryCode ? { recoveryCode } : { code }),
              rememberDevice,
            };

        const res = await apiPost(endpoint, payload, { timeoutMs: 60000 });

        const accessToken = res?.data?.accessToken || res?.data?.token;
        if (accessToken) {
          setAccessToken(accessToken);
        }

        const user = res?.data?.user;
        if (
          res?.data?.mfaReenrollmentRequired &&
          res?.data?.mfaReenrollmentAuthorizationToken
        ) {
          const preparation = await apiPost(
            "/auth/mfa/re-enroll/start",
            {
              mfaReenrollmentAuthorizationToken:
                res.data.mfaReenrollmentAuthorizationToken,
            },
            { timeoutMs: 60000 }
          );

          mountAuthScreen("mfa-reenroll", {
            stage: "confirm",
            email: user?.email || params.email || "",
            manualEntrySecret:
              preparation?.data?.manualEntrySecret || "",
            otpauthUri:
              preparation?.data?.otpauthUri || "",
            mfaReenrollmentToken:
              preparation?.data?.mfaReenrollmentToken || "",
          });
          return;
        }

        if (user) {
          await handleAuthenticatedUserSession(user);
          return;
        }
        window.location.hash = "#dashboard";
        await boot();
      } catch (err) {
        if (
          err?.code === "MFA_TOKEN_EXPIRED" ||
          err?.code === "INVALID_OR_EXPIRED_SESSION" ||
          err?.code === "AUTH_TOKEN_EXPIRED" ||
          (err?.message && (err.message.includes("expired") || err.message.includes("Expired")) && (err.message.includes("token") || err.message.includes("challenge")))
        ) {
          mountAuthScreen("login", {
            notice: "Your verification session has expired. Please sign in again.",
          });
          return;
        }
        throw new Error(err.userMessage || err.message || "Invalid or expired MFA verification credential.");
      }
    };

    appEl.innerHTML = renderMfaChallenge2({
      ...params,
      manualEntrySecret: params.manualEntrySecret || "",
      setupLoading: false,
    });
    wireMfaChallenge2(appEl, {
      onSubmit: handleMfaSubmit,
      onBack: () => mountAuthScreen("login"),
    });
  } else if (screen === "mfa-reenroll") {
    const stage = params.stage || "confirm";
    appEl.innerHTML = renderMfaReenrollment2({
      email: params.email || "",
      stage,
      manualEntrySecret: params.manualEntrySecret || "",
      recoveryCodes: params.recoveryCodes || [],
    });

    wireMfaReenrollment2(appEl, {
      stage,
      onConfirm: async ({ password, code }) => {
        const res = await apiPost(
          "/auth/mfa/re-enroll/confirm",
          {
            password,
            code,
            mfaReenrollmentToken:
              params.mfaReenrollmentToken || "",
          },
          { timeoutMs: 60000 }
        );

        mountAuthScreen("mfa-reenroll", {
          stage: "done",
          email: params.email || "",
          recoveryCodes:
            res?.data?.recoveryCodes || [],
        });
      },
      onContinue: async () => {
        const me = await apiGet("/auth/me", { timeoutMs: 60000 });
        const user = me?.data?.user;
        if (!user) {
          throw new Error("Authenticated profile could not be loaded.");
        }
        await handleAuthenticatedUserSession(user);
      },
    });
  } else if (screen === "forgot") {
    appEl.innerHTML = renderPasswordResetRequest2(params);
    wirePasswordResetRequest2(appEl, {
      onSubmit: async ({ organisationId, email }) => {
        const res = await handlePasswordResetRequest({ organisationId, email });
        mountAuthScreen("verify", { organisationId, email, challengeId: res?.data?.challengeId });
      },
      onBack: () => mountAuthScreen("login")
    });
  } else if (screen === "verify") {
    appEl.innerHTML = renderPasswordResetVerify2(params);
    wirePasswordResetVerify2(appEl, {
      onSubmit: async ({ code }) => {
        const res = await handlePasswordResetVerify({
          organisationId: params.organisationId,
          email: params.email,
          challengeId: params.challengeId,
          code
        });
        mountAuthScreen("reset", {
          organisationId: params.organisationId,
          resetToken: res.resetToken,
          challengeId: res.challengeId
        });
      },
      onResend: async () => {
        const res = await handlePasswordResetRequest({
          organisationId: params.organisationId || "ZAMORIN",
          email: params.email,
        });
        if (res?.data?.challengeId) {
          params.challengeId = res.data.challengeId;
        }
      },
      onBack: () => mountAuthScreen("forgot")
    });
  } else if (screen === "reset") {
    appEl.innerHTML = renderPasswordResetFinal2(params);
    wirePasswordResetFinal2(appEl, {
      onSubmit: async ({ newPassword }) => {
        await handlePasswordResetFinal({
          organisationId: params.organisationId,
          challengeId: params.challengeId,
          resetToken: params.resetToken,
          newPassword
        });
        mountAuthScreen("login", { notice: "Password updated successfully. Please sign in with your new password." });
      },
      onCancel: () => mountAuthScreen("login")
    });
  }
}

async function handleCompleteLoginFlow({ organisationId, email, password, rememberDevice = false, targetCafeId = null }) {
  try {
    const loginPayload = {
      organisationId,
      email,
      password,
      rememberDevice: Boolean(rememberDevice),
      identifier: email,
      device: {
        deviceId: getOrCreateDeviceId(),
        deviceName: "Browser Client",
        deviceType: "DESKTOP",
      },
    };
    if (targetCafeId) {
      loginPayload.targetCafeId = String(targetCafeId).trim().toUpperCase();
    }

    let res;
    try {
      res = await apiPost(
        "/auth/login",
        loginPayload,
        { timeoutMs: 95000 }
      );
    } catch (primaryLoginErr) {
      if (
        primaryLoginErr?.isTimeoutError ||
        primaryLoginErr?.code === "REQUEST_TIMEOUT" ||
        primaryLoginErr?.code === "NETWORK_UNAVAILABLE" ||
        primaryLoginErr?.status === 502 ||
        primaryLoginErr?.status === 504
      ) {
        // Cold-start auto-retry: first request triggered spin-up, retry succeeds immediately
        res = await apiPost(
          "/auth/login",
          loginPayload,
          { timeoutMs: 95000 }
        );
      } else {
        throw primaryLoginErr;
      }
    }

    // Check if MFA is required (200/202 responses with challenge tokens)
    const isMfa = Boolean(
      res?.data?.mfaRequired ||
      res?.data?.requiresMfa ||
      res?.data?.mfaChallengeToken ||
      res?.data?.mfaSetupToken ||
      res?.status === 202 ||
      (res?.data?.challengeId && !res?.data?.accessToken)
    );

    if (isMfa) {
      const mfaChallengeToken = res?.data?.mfaChallengeToken || res?.data?.mfaSetupToken || res?.data?.tempToken || res?.data?.token || "";
      const isSetup = Boolean(res?.data?.mfaSetupRequired || res?.data?.mfaSetupToken);
      mountAuthScreen("mfa", {
        organisationId,
        email,
        challengeId: res?.data?.challengeId || res?.data?.userId || "",
        tempToken: mfaChallengeToken,
        mfaChallengeToken,
        mfaSetupRequired: isSetup,
        rememberDevice: Boolean(rememberDevice || res?.data?.rememberDevice),
      });
      return { mfaRequired: true };
    }

    const accessToken = res?.data?.accessToken || res?.data?.token;
    if (accessToken) {
      setAccessToken(accessToken);
    }
    const user = res?.data?.user;
    if (user) {
      const passwordChangeRequired = await enforceRequiredPasswordChange(
        user,
        res?.data?.mustChangePassword === true
      );
      if (passwordChangeRequired) {
        return { success: true, user, passwordChangeRequired: true };
      }
      await handleAuthenticatedUserSession(user);
      return { success: true, user };
    }
    if (typeof window !== "undefined") {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", "/#dashboard");
      } else {
        window.location.hash = "#dashboard";
      }
    }
    boot();
    return { success: true };
  } catch (err) {
    // Intercept MFA continuation responses (403 with MFA_REQUIRED / MFA_SETUP_REQUIRED)
    // MFA_REQUIRED is a continuation state, NOT an authentication failure or failed attempt.
    if (
      err?.code === "MFA_REQUIRED" ||
      err?.code === "MFA_SETUP_REQUIRED" ||
      err?.data?.mfaChallengeToken ||
      err?.data?.mfaSetupToken ||
      err?.data?.requiresMfa ||
      err?.data?.mfaRequired ||
      (err?.status === 403 && (err?.message?.includes("Multi-factor") || err?.message?.includes("MFA")))
    ) {
      const mfaChallengeToken = err?.data?.mfaChallengeToken || err?.data?.mfaSetupToken || err?.data?.tempToken || "";
      const isSetup = err?.code === "MFA_SETUP_REQUIRED" || Boolean(err?.data?.mfaSetupRequired);
      mountAuthScreen("mfa", {
        organisationId,
        email,
        challengeId: err?.data?.challengeId || err?.data?.userId || "",
        tempToken: mfaChallengeToken,
        mfaChallengeToken,
        mfaSetupRequired: isSetup,
        rememberDevice: Boolean(rememberDevice || err?.data?.rememberDevice),
      });
      return { mfaRequired: true };
    }

    throw err;
  }
}

async function handleAuthenticatedUserSession(user) {
  if (await enforceRequiredPasswordChange(user)) {
    return;
  }

  abortActivePasskeyRequests();
  const { role, isPrimaryMaster } = resolveAuthenticatedRole(user);
  const landingRoute = (role === "staff") ? "staff-home" : (role === "vendor" ? "vendor-dashboard" : "dashboard");

  let targetRoute = landingRoute;
  if (typeof window !== "undefined") {
    const searchParams = new URLSearchParams(window.location.search);
    const candidate = searchParams.get("returnTo") || searchParams.get("redirect") || searchParams.get("next");
    const safeTarget = getSafeInternalRedirect(candidate);
    if (safeTarget && isRouteAllowed(role, safeTarget, isPrimaryMaster)) {
      targetRoute = safeTarget;
    }
  }

  // Clear any residual dev/preview role overrides so the authenticated employee profile is strictly authoritative
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("zamorin-dev-role");
      localStorage.setItem("zamorin_user", JSON.stringify(user));
    }
  } catch {}

  setSessionState(SessionState.AUTHENTICATED);

  setState({
    auth: { authenticated: true, user, loading: false },
    user,
    role,
    isPrimaryMaster,
    route: targetRoute,
  });

  if (typeof window !== "undefined") {
    if (window.history && window.history.replaceState) {
      // Transition browser out of /login into root single-page route
      window.history.replaceState(null, "", `/#${targetRoute}`);
    } else {
      window.location.hash = `#${targetRoute}`;
    }
  }

  renderShell();
  loadAvailableCafes().catch(() => {});
  registerServiceWorker().catch(() => {});
}

function renderDevPreviewBanner() {
  document.getElementById("zamorin-dev-preview-banner")?.remove();
}

// =============================================================================
// LOADING SCREEN
// =============================================================================

function renderLoadingScreen() {
  const appEl =
    document.getElementById("app");

  if (!appEl) {
    return;
  }

  appEl.innerHTML = `
    <div
      style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        font-family: sans-serif;
        background: #0b0f19;
        color: #f8fafc;
      "
    >
      <div
        style="
          width: 44px;
          height: 44px;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: #d4a359;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        "
      ></div>

      <p
        style="
          margin-top: 16px;
          color: #94a3b8;
          font-size: 14px;
          font-weight: 500;
        "
      >
        Loading Zamorin Café ERP...
      </p>

      <style>
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      </style>
    </div>
  `;
}

// =============================================================================
// STEP-UP AUTHENTICATION
// =============================================================================
//
// The historical development environment automatically approved step-up
// authentication.
//
// SECURITY REQUIREMENT:
// Never install that auto-approver on Vercel, staging, production,
// or another remote/public host.
//
// Production therefore retains apiClient.js's normal step-up behaviour.
// =============================================================================

if (isDirectDashboardAllowed()) {
  setStepUpAuthenticationHandler(
    async () => Promise.resolve()
  );
}

// =============================================================================
// CAFE PORTFOLIO & SCOPE INITIALIZATION
// =============================================================================

export async function loadAvailableCafes() {
  try {
    const res = await apiGet("/cafes");
    const list = res?.data?.cafes || res?.data || [];
    if (Array.isArray(list) && list.length > 0) {
      state.cafes = list;
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("zamorin_cafes", JSON.stringify(list));
        }
      } catch {}

      const savedCafe = typeof localStorage !== "undefined" ? localStorage.getItem("zamorin-selected-cafe-id") : null;
      if (savedCafe && (savedCafe === "ALL" || list.some((c) => (c.cafeId || c.id || c.code) === savedCafe))) {
        state.selectedCafeId = savedCafe;
        state.currentCafeId = savedCafe === "ALL" ? "" : savedCafe;
      } else if (state.role === "owner" && list.length === 1) {
        const singleId = list[0].cafeId || list[0].id || list[0].code;
        state.selectedCafeId = singleId;
        state.currentCafeId = singleId;
      } else if (!state.selectedCafeId) {
        state.selectedCafeId = "ALL";
        state.currentCafeId = "";
      }

      if (state.user && state.selectedCafeId && state.selectedCafeId !== "ALL") {
        const found = list.find((c) => (c.cafeId || c.id || c.code) === state.selectedCafeId);
        if (found) {
          state.user.primaryCafeId = found.cafeId || found.id || found.code;
          state.user.primaryCafeName = found.name || found.displayName || state.user.primaryCafeName;
        }
      }

      if (typeof document !== "undefined") {
        const sel = document.getElementById("global-cafe-selector");
        if (sel) {
          const isOwner = state.role === "owner";
          const allLabel = isOwner ? "🏠 All Assigned Cafés (Portfolio)" : "🏠 All Cafés (Global Portfolio)";
          const options = [
            `<option value="ALL" ${state.selectedCafeId === "ALL" ? "selected" : ""}>${allLabel}</option>`,
            ...list.map((c) => {
              const cId = c.cafeId || c.id || c.code;
              const cName = c.name || c.displayName || "Outlet";
              const isSel = state.selectedCafeId === cId;
              return `<option value="${cId}" ${isSel ? "selected" : ""}>☕ ${cId} · ${cName}</option>`;
            }),
          ].join("");
          sel.innerHTML = options;
          sel.value = state.selectedCafeId || "ALL";
        }
      }
      return list;
    }
  } catch (_err) {
    try {
      if (typeof localStorage !== "undefined") {
        const cached = JSON.parse(localStorage.getItem("zamorin_cafes") || "[]");
        if (Array.isArray(cached) && cached.length) {
          state.cafes = cached;
        }
      }
    } catch {}
  }
  return state.cafes || [];
}

// =============================================================================
// AUTHENTICATED SESSION BOOT
// =============================================================================

function applyAuthenticatedUser(
  user,
  requestedRoute = ""
) {
  abortActivePasskeyRequests();
  const {
    role,
    isPrimaryMaster,
  } = resolveAuthenticatedRole(user);

  const roleNavigation =
    NAVIGATION[role] ||
    NAVIGATION.staff;

  const defaultRoute =
    roleNavigation?.items?.[0]?.route ||
    (
      role === "staff"
        ? "staff-home"
        : "dashboard"
    );

  const initialRoute =
    requestedRoute &&
    isRouteAllowed(
      role,
      requestedRoute,
      isPrimaryMaster
    )
      ? requestedRoute
      : defaultRoute;

  setState({
    auth: {
      authenticated: true,
      loading: false,
      user,
      authentication: null,
      error: null,
    },

    user,
    isPrimaryMaster,
    role,
    route: initialRoute,
  });

  try {
    if (typeof localStorage !== "undefined" && user) {
      localStorage.setItem("zamorin_user", JSON.stringify(user));
    }
  } catch {}

  loadAvailableCafes().catch(() => {});

  return {
    role,
    isPrimaryMaster,
    initialRoute,
  };
}

// =============================================================================
// APPLICATION BOOT (FAST-PATH ZERO-LATENCY)
// =============================================================================

async function boot() {
  try {
    initLanguage();

    // Apply one canonical appearance state before the first render. This keeps
    // data-theme, html.dark, state, and both storage keys synchronized.
    applyTheme(state.settings.theme || "paper", { persist: true, notify: false });

    document.documentElement.setAttribute(
      "data-font-size",
      state.settings.fontSize || "normal"
    );

    if (!isLocalDevelopmentOrigin()) {
      renderFrontendOnlyScreen();
      return;
    }

    // Permanently ensure no dev preview banner exists
    document.getElementById("zamorin-dev-preview-banner")?.remove();

    const urlHash =
      typeof window !== "undefined" && window.location.hash
        ? window.location.hash.replace(/^#\/?/, "")
        : "";

    const cleanHash = (urlHash || "").replace(/^\//, "");

    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;

    // Direct Café Access QR / Link / PIN Gateway Routing (P0-02, P0-02B, REC-03)
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const isCShortPath = pathname.startsWith("/c/") || urlHash.startsWith("c/") || cleanHash.startsWith("c/");
    const isQrPath = isCShortPath || pathname.startsWith("/cafe-access/qr/") || urlHash.startsWith("cafe-access/qr/") || cleanHash.startsWith("cafe-access/qr/");
    const isLinkPath = pathname.startsWith("/cafe-access/link/") || urlHash.startsWith("cafe-access/link/") || cleanHash.startsWith("cafe-access/link/");
    const isGatewayPath = pathname === "/cafe-gateway" || urlHash === "cafe-gateway" || cleanHash === "cafe-gateway";

    if (isQrPath || isLinkPath || isGatewayPath) {
      let token = null;
      if (pathname.startsWith("/c/")) token = pathname.slice("/c/".length);
      else if (urlHash.startsWith("c/")) token = urlHash.slice("c/".length);
      else if (cleanHash.startsWith("c/")) token = cleanHash.slice("c/".length);
      else if (pathname.startsWith("/cafe-access/qr/")) token = pathname.slice("/cafe-access/qr/".length);
      else if (urlHash.startsWith("cafe-access/qr/")) token = urlHash.slice("cafe-access/qr/".length);
      else if (cleanHash.startsWith("cafe-access/qr/")) token = cleanHash.slice("cafe-access/qr/".length);
      else if (pathname.startsWith("/cafe-access/link/")) token = pathname.slice("/cafe-access/link/".length);
      else if (urlHash.startsWith("cafe-access/link/")) token = urlHash.slice("cafe-access/link/".length);
      else if (cleanHash.startsWith("cafe-access/link/")) token = cleanHash.slice("cafe-access/link/".length);

      const method = isQrPath ? "QR" : isLinkPath ? "LINK" : null;

      const { mountPublicCafeGateway } = await getCafeGateway();
      mountPublicCafeGateway(document.getElementById("app"), { method, token });
      return;
    }

    // Direct Auth Screen Routing (0ms instant mount)
    // Handle /login2 alias -> redirect to canonical /login
    if (pathname === "/login2" || urlHash === "login2" || cleanHash === "login2") {
      if (typeof window !== "undefined" && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", "/login");
      }
    }

    // Café Operations Login 2.0 — always public, bypass session check
    const isCafeOpsLogin =
      pathname === "/cafe-operations/login" ||
      pathname.startsWith("/cafe-operations/login") ||
      cleanHash === "cafe-operations/login" ||
      cleanHash.startsWith("cafe-operations/login") ||
      cleanHash === "cafe-operations-login" ||
      cleanHash === "cafe-operator-signin";

    if (isCafeOpsLogin) {
      const urlParams = new URLSearchParams(window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''));
      const preselectedCafeId = urlParams.get('cafe') || '';
      const { renderCafeOperationsLogin2, wireCafeOperationsLogin2 } = await import("./pages/cafeOperationsLogin2.js?v=2.1.0");
      const appEl = document.getElementById("app");
      if (appEl) {
        appEl.innerHTML = renderCafeOperationsLogin2({ preselectedCafeId });
        wireCafeOperationsLogin2(appEl, {
          onSignIn: async (authData) => {
            const userRole = (authData?.user?.role || state.user?.role || "").toUpperCase();
            const targetRoute = userRole === "STAFF" ? "staff-home" : "dashboard";
            await renderShell();
            await navigate(targetRoute);
          },
        });
      }
      return;
    }

    // If already authenticated in memory, mount the app shell immediately
    if (state.auth?.authenticated && state.user) {
      if (pathname === "/login" || pathname === "/login2") {
        if (typeof window !== "undefined" && window.history && window.history.replaceState) {
          window.history.replaceState(null, "", `/#${state.route || "dashboard"}`);
        }
      }
      renderShell();
      loadAvailableCafes().catch(() => {});
      registerServiceWorker().catch(() => {});
      return;
    }


    // Local development / automated testing persona resolution
    if (isDirectDashboardAllowed() && (params?.get("role") || params?.get("devRole") || (typeof localStorage !== "undefined" && localStorage.getItem("zamorin-dev-role")))) {
      const devKey = getRequestedDevRole();
      const devUser = devKey ? DEV_PREVIEW_USERS[devKey] : null;
      if (!devUser) {
        mountAuthScreen("login", { notice: "This development role is not available." });
        return;
      }
      const canonicalRole = devKey;
      const isPrimary = Boolean(devUser?.isPrimaryMaster);
      const roleNavigation = NAVIGATION[canonicalRole] || NAVIGATION.master;
      const defaultRoute = roleNavigation?.items?.[0]?.route || (canonicalRole === "staff" ? "staff-home" : "dashboard");
      const initialRoute = urlHash ? (isRouteAllowed(canonicalRole, urlHash, isPrimary) ? urlHash : defaultRoute) : defaultRoute;

      setState({
        auth: {
          authenticated: true,
          loading: false,
          user: devUser,
          authentication: null,
          error: null,
        },
        user: devUser,
        isPrimaryMaster: isPrimary,
        role: canonicalRole,
        route: initialRoute,
      });

      renderShell();

      // Local preview never embeds or submits real credentials.
      // Backend-authenticated development sessions must be obtained through the normal login flow.
      loadAvailableCafes().catch(() => {});
      registerServiceWorker().catch(() => {});
      return;
    }

    if (urlHash === "forgot") {
      mountAuthScreen("forgot");
      return;
    }
    if (urlHash === "mfa") {
      mountAuthScreen("mfa");
      return;
    }
    if (urlHash === "cafe-gateway" || urlHash.startsWith("cafe-access/") || urlHash.startsWith("c/")) {
      const isCShort = urlHash.startsWith("c/");
      const isQr = isCShort || urlHash.startsWith("cafe-access/qr/");
      const isLink = urlHash.startsWith("cafe-access/link/");
      const token = isCShort ? urlHash.slice("c/".length) : isQr ? urlHash.slice("cafe-access/qr/".length) : isLink ? urlHash.slice("cafe-access/link/".length) : null;
      const method = isQr ? "QR" : isLink ? "LINK" : null;
      const { mountPublicCafeGateway } = await getCafeGateway();
      mountPublicCafeGateway(document.getElementById("app"), { method, token });
      return;
    }
    if (
      urlHash === "cafe-operations/login" ||
      urlHash.startsWith("cafe-operations/login") ||
      urlHash === "cafe-operations-login" ||
      urlHash === "cafe-operator-signin"
    ) {
      const urlParams = new URLSearchParams(window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''));
      const preselectedCafeId = urlParams.get('cafe') || '';
      const { renderCafeOperationsLogin2, wireCafeOperationsLogin2 } = await import("./pages/cafeOperationsLogin2.js?v=2.1.0");
      const appEl = document.getElementById("app");
      if (appEl) {
        appEl.innerHTML = renderCafeOperationsLogin2({ preselectedCafeId });
        wireCafeOperationsLogin2(appEl, {
          onSignIn: () => {
            window.location.hash = "dashboard";
          },
        });
      }
      return;
    }

    const isExplicitAppHash = Boolean(
      urlHash &&
      !["login", "login2", "forgot", "mfa", "cafe-gateway", "cafe-operator-signin", "cafe-operations/login", "cafe-operations-login"].includes(urlHash) &&
      !urlHash.startsWith("cafe-operations/login") &&
      !urlHash.startsWith("cafe-access/") &&
      !urlHash.startsWith("c/")
    );

    const isLoginRoute = !isExplicitAppHash && (
      !urlHash ||
      urlHash === "login" ||
      urlHash === "login2" ||
      pathname === "/" ||
      pathname === "/login" ||
      pathname === "/login2" ||
      params?.get("auth") === "login"
    ) && urlHash !== "cafe-operator-signin";


    if (isLoginRoute) {
      // Mount login screen synchronously with ZERO latency (0ms perceived load)
      mountAuthScreen("login");

      // Non-blocking background session probe (HttpOnly cookies or active session)
      apiGet("/auth/me", { allowRefreshRetry: false }).then(async (payload) => {
        if (payload?.data?.user) {
          if (await enforceRequiredPasswordChange(payload.data.user)) {
            return;
          }
          applyAuthenticatedUser(payload.data.user, urlHash);
          if (pathname === "/login" || pathname === "/login2") {
            if (typeof window !== "undefined" && window.history && window.history.replaceState) {
              window.history.replaceState(null, "", `/#${urlHash || state.route || "dashboard"}`);
            }
          }
          renderShell();
          loadAvailableCafes().catch(() => {});
          registerServiceWorker().catch(() => {});
        }
      }).catch(() => {
        // Unauthenticated session - user remains on already-mounted instant login screen
      });

      // Idle pre-warming of router in background for instant post-login dashboard transition
      if (typeof window !== "undefined") {
        setTimeout(() => { getRouter().catch(() => {}); }, 1500);
      }
      return;
    }

    // Explicit app route requested while unauthenticated in memory:
    // Validate active backend session before rendering requested route
    try {
      const payload = await apiGet("/auth/me", { allowRefreshRetry: false });
      if (payload?.data?.user) {
        if (await enforceRequiredPasswordChange(payload.data.user)) {
          return;
        }
        applyAuthenticatedUser(payload.data.user, urlHash);
        if (pathname === "/login" || pathname === "/login2") {
          if (typeof window !== "undefined" && window.history && window.history.replaceState) {
            window.history.replaceState(null, "", `/#${urlHash || state.route || "dashboard"}`);
          }
        }
        renderShell();
        loadAvailableCafes().catch(() => {});
        registerServiceWorker().catch(() => {});
        return;
      }
    } catch (_err) {
      clearAllAuthTokens();
    }

    // Unauthenticated fallback: Mount login screen immediately with ZERO latency!
    clearAllAuthTokens();
    setState({
      auth: {
        authenticated: false,
        loading: false,
        user: null,
        authentication: null,
        error: null,
      },
      user: null,
      role: null,
      isPrimaryMaster: false,
    });

    mountAuthScreen("login");
    registerServiceWorker().catch(() => {});
  } catch (bootErr) {
    console.error("[Zamorin Boot Error]", bootErr);
    mountAuthScreen("login");
  }
}

// =============================================================================
// HASH ROUTING & SAFETY NETS
// =============================================================================

if (typeof window !== "undefined") {
  window.zamorinMountAuthScreen = mountAuthScreen;

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (reason && (reason.name === "ApiClientError" || reason.status === 401 || reason.status === 403)) {
      event.preventDefault();
    }
  });

  window.addEventListener("hashchange", async () => {
    abortActivePasskeyRequests();
    const rawHash = window.location.hash.replace(/^#/, "");
    if (rawHash === "login" || rawHash === "login2") {
      if (rawHash === "login2" && typeof window !== "undefined" && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", "/login");
      }
      mountAuthScreen("login");
    } else if (rawHash === "forgot") {
      mountAuthScreen("forgot");
    } else if (rawHash === "mfa") {
      mountAuthScreen("mfa");
    } else if (rawHash === "register") {
      mountAuthScreen("login", {
        notice: "Self-registration is disabled. Contact Café Administration for account access.",
      });
    } else if (rawHash === "cafe-gateway" || rawHash.startsWith("cafe-access/") || rawHash.startsWith("c/")) {
      const isCShort = rawHash.startsWith("c/");
      const isQr = isCShort || rawHash.startsWith("cafe-access/qr/");
      const isLink = rawHash.startsWith("cafe-access/link/");
      const token = isCShort ? rawHash.slice("c/".length) : isQr ? rawHash.slice("cafe-access/qr/".length) : isLink ? rawHash.slice("cafe-access/link/".length) : null;
      const method = isQr ? "QR" : isLink ? "LINK" : null;
      const { mountPublicCafeGateway } = await getCafeGateway();
      mountPublicCafeGateway(document.getElementById("app"), { method, token });
    } else if (
      rawHash === "cafe-operations/login" ||
      rawHash.startsWith("cafe-operations/login") ||
      rawHash === "cafe-operations-login" ||
      rawHash === "cafe-operator-signin"
    ) {
      const urlParams = new URLSearchParams(window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''));
      const preselectedCafeId = urlParams.get('cafe') || '';
      const { renderCafeOperationsLogin2, wireCafeOperationsLogin2 } = await import("./pages/cafeOperationsLogin2.js?v=2.1.0");
      const appEl = document.getElementById("app");
      if (appEl) {
        appEl.innerHTML = renderCafeOperationsLogin2({ preselectedCafeId });
        wireCafeOperationsLogin2(appEl, {
          onSignIn: async (authData) => {
            const userRole = (authData?.user?.role || state.user?.role || "").toUpperCase();
            const targetRoute = userRole === "STAFF" ? "staff-home" : "dashboard";
            await renderShell();
            await navigate(targetRoute);
          },
        });
      }
    } else if (rawHash && state.route !== rawHash) {
      navigate(rawHash);
    }
  });
}

// =============================================================================
// APPLICATION START
// =============================================================================

// Session expiry automatic routing to canonical Login 2.0
if (typeof window !== "undefined") {
  addSessionExpirationListener(() => {
    const rawHash = (window.location.hash || "").replace(/^#/, "");
    const pathname = window.location.pathname;
    const isLogin = rawHash === "login" || rawHash === "login2" || pathname === "/login" || pathname === "/login2";
    if (isLogin && state.auth?.authenticated === false) {
      return;
    }

    clearAllAuthTokens();
    setState({
      auth: { authenticated: false, loading: false, user: null, authentication: null, error: null },
      user: null,
      isPrimaryMaster: false,
      route: "login",
    });
    mountAuthScreen("login", { notice: "Your session has expired. Please sign in again." });
  });
}

// =============================================================================
// FLOWBITE DARK MODE SWITCHER
// =============================================================================
export function initDarkModeSwitcher() {
  const themeToggleDarkIcon = document.getElementById("theme-toggle-dark-icon");
  const themeToggleLightIcon = document.getElementById("theme-toggle-light-icon");
  const themeToggleBtn = document.getElementById("theme-toggle");

  const syncIcons = () => {
    const dark = isDarkTheme(state.settings.theme);
    if (themeToggleDarkIcon) themeToggleDarkIcon.classList.toggle("hidden", dark);
    if (themeToggleLightIcon) themeToggleLightIcon.classList.toggle("hidden", !dark);
    themeToggleBtn?.setAttribute("aria-pressed", dark ? "true" : "false");
    themeToggleBtn?.setAttribute(
      "title",
      dark ? "Switch to Apple Light appearance" : "Switch to Apple Dark appearance"
    );
  };

  // Re-apply the canonical ERP preference here for legacy pages that still call
  // the older Flowbite initializer after the application shell has mounted.
  applyTheme(state.settings.theme || "paper", { persist: true, notify: false });
  syncIcons();

  if (themeToggleBtn && !themeToggleBtn.dataset.flowbiteWired) {
    themeToggleBtn.dataset.flowbiteWired = "true";
    themeToggleBtn.addEventListener("click", () => {
      toggleTheme();
      syncIcons();
      window.dispatchEvent(new CustomEvent("zamorin:theme-changed", {
        detail: { theme: state.settings.theme }
      }));
    });
  }

  if (typeof window !== "undefined" && !window.__zamorinThemeIconListener) {
    window.__zamorinThemeIconListener = true;
    window.addEventListener("zamorin:theme-changed", syncIcons);
  }
}

if (typeof window !== "undefined") {
  window.initDarkModeSwitcher = initDarkModeSwitcher;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      boot();
      initDarkModeSwitcher();
    }, { once: true });
  } else {
    boot();
    initDarkModeSwitcher();
  }
}




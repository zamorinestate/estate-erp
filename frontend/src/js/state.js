// =============================================================================
// ZAMORIN CAFE ERP — APP STATE
// A deliberately tiny store: current role, current route, session, settings.
// =============================================================================

import { ROLES } from "./navigation.js";

const listeners = new Set();

export const THEMES = Object.freeze({
  LIGHT: "paper",
  SOFT_LIGHT: "pearl",
  DARK: "midnight",
  DEEP_DARK: "noir",
});

const THEME_ALIASES = Object.freeze({
  light: THEMES.LIGHT,
  "apple-light": THEMES.LIGHT,
  dark: THEMES.DARK,
  "apple-dark": THEMES.DARK,
});

const VALID_THEMES = new Set(Object.values(THEMES));
const DARK_THEMES = new Set([THEMES.DARK, THEMES.DEEP_DARK]);

export function normalizeTheme(theme) {
  const value = String(theme || "").trim().toLowerCase();
  if (VALID_THEMES.has(value)) return value;
  return THEME_ALIASES[value] || THEMES.LIGHT;
}

export function isDarkTheme(theme) {
  return DARK_THEMES.has(normalizeTheme(theme));
}

function storedTheme() {
  if (typeof localStorage === "undefined") return THEMES.LIGHT;
  return normalizeTheme(
    localStorage.getItem("zamorin-theme") ||
    localStorage.getItem("color-theme") ||
    THEMES.LIGHT
  );
}

export const state = {
  auth: {
    authenticated: false,
    loading: true,
    user: null,
    error: null,
  },
  session: {
    state: "AUTHENTICATED", // INITIALISING | AUTHENTICATED | REFRESHING | EXPIRED | SIGNED_OUT | DEV_PREVIEW
    deviceId: null,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    lastSync: Date.now(),
  },
  role: null, // Derived from backend authenticated identity (/auth/me)
  originalRole: null,
  activeWorkspace: null,
  supervisedEmployeeId: null,
  isTrainingMode: false,
  route: "dashboard",
  cafes: [],
  selectedCafeId: (typeof localStorage !== "undefined" && localStorage.getItem("zamorin-selected-cafe-id")) || "ALL",
  currentCafeId: (typeof localStorage !== "undefined" && localStorage.getItem("zamorin-selected-cafe-id") && localStorage.getItem("zamorin-selected-cafe-id") !== "ALL") ? localStorage.getItem("zamorin-selected-cafe-id") : "",
  attendance: {
    status: "not_checked_in", // not_checked_in | checked_in | checked_out
    checkInAt: null,
    checkOutAt: null,
  },
  settings: {
    theme: storedTheme(),
    fontSize: (typeof localStorage !== "undefined" && localStorage.getItem("zamorin-font-size")) || "standard",
    language: "en",
    notifications: {
      roster: true,
      leave: true,
      payslip: false,
    },
  },
};

export function applyTheme(theme, { persist = true, notify = false } = {}) {
  const normalized = normalizeTheme(theme);
  const dark = isDarkTheme(normalized);

  state.settings.theme = normalized;

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = normalized;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  }

  if (persist && typeof localStorage !== "undefined") {
    localStorage.setItem("zamorin-theme", normalized);
    // Keep the legacy Flowbite storage key synchronized so old controls cannot
    // fight with the canonical ERP appearance state.
    localStorage.setItem("color-theme", dark ? "dark" : "light");
  }

  if (notify) {
    listeners.forEach((fn) => fn(state));
  }

  return normalized;
}

export function setTheme(theme) {
  return applyTheme(theme, { persist: true, notify: true });
}

export function toggleTheme() {
  return setTheme(isDarkTheme(state.settings.theme) ? THEMES.LIGHT : THEMES.DARK);
}

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function setSettings(patch) {
  Object.assign(state.settings, patch);
  if (Object.prototype.hasOwnProperty.call(patch || {}, "theme")) {
    applyTheme(patch.theme, { persist: true, notify: false });
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

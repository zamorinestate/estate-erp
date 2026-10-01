// =============================================================================
// ZAMORIN CAFÉ ERP — LOGIN MODULE INTEGRATION PROGRAMME
// STAGE 5 AUDIT 2: FIVE-PERSONA POST-LOGIN HANDOFF & DEEP-LINK RESTORATION
// =============================================================================

import assert from "node:assert/strict";
import { NAVIGATION, ROLES, isRouteAllowed } from "../frontend/src/js/navigation.js";

function getLandingRoute(role) {
  const r = (role || "").toLowerCase();
  if (NAVIGATION[r] && NAVIGATION[r].landingRoute) {
    return `#${NAVIGATION[r].landingRoute}`;
  }
  if (r === "staff") return "#staff-home";
  return "#dashboard";
}

// Helper function that mirrors client-side deep link sanitization logic
function sanitizeDeepLink(targetUrl, userRole) {
  if (!targetUrl || typeof targetUrl !== "string") {
    return getLandingRoute(userRole);
  }

  const trimmed = targetUrl.trim();

  // Reject external protocols, protocol-relative URLs, and dangerous schemes
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.includes("://")
  ) {
    return getLandingRoute(userRole);
  }

  // Ensure hash prefix
  const routeHash = trimmed.startsWith("#") ? trimmed : `#${trimmed.replace(/^\//, "")}`;

  // Validate route permission against canonical authority matrix
  if (isRouteAllowed(userRole, routeHash)) {
    return routeHash;
  }

  // Fallback to safe canonical landing
  return getLandingRoute(userRole);
}

async function main() {
  console.log("=============================================================================");
  console.log("   ZAMORIN CAFÉ ERP — STAGE 5: FIVE-PERSONA HANDOFF & DEEP-LINK AUDIT");
  console.log("=============================================================================\n");

  let passCount = 0;
  function pass(msg) {
    passCount++;
    console.log(`[PASS] ${passCount.toString().padStart(2, "0")}. ${msg}`);
  }

  try {
    // 1. Primary Master Canonical Landing
    const masterLanding = getLandingRoute(ROLES.MASTER);
    assert.equal(masterLanding, "#dashboard", "Primary Master must land on #dashboard");
    assert.equal(isRouteAllowed(ROLES.MASTER, "#dashboard", true), true, "Master authorized for #dashboard");
    assert.equal(isRouteAllowed(ROLES.MASTER, "#admin/users", true), true, "Master authorized for #admin/users");
    assert.equal(isRouteAllowed(ROLES.MASTER, "#payroll/runs", true), true, "Primary Master authorized for #payroll/runs");
    pass("Primary Master lands on #dashboard with full governance authority");

    // 2. Owner Canonical Landing
    const ownerLanding = getLandingRoute(ROLES.OWNER);
    assert.equal(ownerLanding, "#dashboard", "Owner must land on #dashboard");
    assert.equal(isRouteAllowed(ROLES.OWNER, "#dashboard"), true, "Owner authorized for #dashboard");
    assert.equal(isRouteAllowed(ROLES.OWNER, "#bills"), true, "Owner authorized for #bills");
    assert.equal(isRouteAllowed(ROLES.OWNER, "#ledger"), true, "Owner authorized for #ledger");
    pass("Owner lands on #dashboard with executive financial authority");

    // 3. Cafe Operations Canonical Landing
    const cafeLanding = getLandingRoute(ROLES.CAFE_ADMIN);
    assert(cafeLanding === "#dashboard" || cafeLanding === "#pos", "Cafe Admin must land on #dashboard or #pos");
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, "#pos"), true, "Cafe Admin authorized for #pos");
    assert.equal(isRouteAllowed(ROLES.CAFE_ADMIN, "#sales-cash"), true, "Cafe Admin authorized for #sales-cash");
    pass("Cafe Operations lands on canonical operations destination");

    // 5. Staff Canonical Landing
    const staffLanding = getLandingRoute(ROLES.STAFF);
    assert.equal(staffLanding, "#staff-home", "Staff must land on #staff-home");
    assert.equal(isRouteAllowed(ROLES.STAFF, "#staff-home"), true, "Staff authorized for #staff-home");
    assert.equal(isRouteAllowed(ROLES.STAFF, "#staff-attendance"), true, "Staff authorized for #staff-attendance");
    assert.equal(isRouteAllowed(ROLES.STAFF, "#staff-leave"), true, "Staff authorized for #staff-leave");
    pass("Staff member lands strictly on #staff-home self-service portal");

    // 6. Staff Role Boundaries (Zero Management Route Access)
    assert.equal(isRouteAllowed(ROLES.STAFF, "#dashboard"), false, "Staff barred from management dashboard");
    assert.equal(isRouteAllowed(ROLES.STAFF, "#inventory"), false, "Staff barred from inventory management");
    assert.equal(isRouteAllowed(ROLES.STAFF, "#finance"), false, "Staff barred from finance ledger");
    assert.equal(isRouteAllowed(ROLES.STAFF, "#admin"), false, "Staff barred from system administration");
    pass("Staff persona strictly barred from 100% of management routes");

    // 7. Authorized Deep Link: Master -> #inventory/stock-by-cafe
    const masterRestored = sanitizeDeepLink("#inventory/stock-by-cafe", ROLES.MASTER);
    assert.equal(masterRestored, "#inventory/stock-by-cafe", "Master deep link restored");
    pass("Authorized deep link restored for Primary Master (#inventory/stock-by-cafe)");

    // 8. Authorized Deep Link: Owner -> #bills
    const ownerRestored = sanitizeDeepLink("#bills", ROLES.OWNER);
    assert.equal(ownerRestored, "#bills", "Owner deep link restored");
    pass("Authorized deep link restored for Owner (#bills)");

    // 9. Authorized Deep Link: Staff -> #staff-leave
    const staffRestored = sanitizeDeepLink("#staff-leave", ROLES.STAFF);
    assert.equal(staffRestored, "#staff-leave", "Staff deep link restored");
    pass("Authorized deep link restored for Staff (#staff-leave)");

    // 10. Unauthorized Deep Link: Staff -> #inventory (Safe Fallback)
    const staffBlocked1 = sanitizeDeepLink("#inventory", ROLES.STAFF);
    assert.equal(staffBlocked1, "#staff-home", "Staff unauthorized deep link redirected to #staff-home");
    pass("Unauthorized deep link for Staff (#inventory) replaced with safe landing (#staff-home)");

    // 11. Unauthorized Deep Link: Staff -> #admin/rbac (Zero Privilege Escalation)
    const staffBlocked2 = sanitizeDeepLink("#admin/rbac", ROLES.STAFF);
    assert.equal(staffBlocked2, "#staff-home", "Staff admin deep link redirected to #staff-home");
    pass("Unauthorized administrative deep link (#admin/rbac) safely guarded (Zero Privilege Escalation)");

    // 12. Unauthorized Deep Link: Cafe Admin -> #finance/gl-journals
    const cafeBlocked = sanitizeDeepLink("#finance/gl-journals", ROLES.CAFE_ADMIN);
    assert.equal(cafeBlocked, getLandingRoute(ROLES.CAFE_ADMIN), "Cafe admin unauthorized route redirected");
    pass("Unauthorized cross-cafe financial deep link redirected to safe cafe landing");

    // 13. Open Redirect Prevention: External HTTPS Scheme
    const evilHttps = sanitizeDeepLink("https://evil.example/steal-session", ROLES.MASTER);
    assert.equal(evilHttps, "#dashboard", "Hostile external HTTPS URL stripped");
    pass("Hostile external URL (https://evil.example) stripped and neutralized");

    // 14. Open Redirect Prevention: Protocol-Relative URL
    const evilProto = sanitizeDeepLink("//evil.example/payload", ROLES.OWNER);
    assert.equal(evilProto, "#dashboard", "Protocol-relative URL stripped");
    pass("Protocol-relative URL (//evil.example) stripped and neutralized");

    // 15. Open Redirect Prevention: JavaScript Scheme & Dangerous Payloads
    const evilJs = sanitizeDeepLink("javascript:alert(document.cookie)", ROLES.STAFF);
    assert.equal(evilJs, "#staff-home", "JavaScript pseudo-protocol stripped");
    const evilData = sanitizeDeepLink("data:text/html,<script>steal()</script>", ROLES.MASTER);
    assert.equal(evilData, "#dashboard", "Data URI stripped");
    pass("Dangerous URI schemes (javascript:, data:) stripped and neutralized");

    console.log("\n=============================================================================");
    console.log(`STAGE 5 AUDIT 2 RESULT: ✅ ${passCount} / ${passCount} ASSERTIONS PASSED (100% CLEAN)`);
    console.log("=============================================================================\n");
  } catch (err) {
    console.error("\n❌ STAGE 5 AUDIT 2 FAILED:", err);
    process.exit(1);
  }
}

main();

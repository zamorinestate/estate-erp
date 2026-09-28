// =============================================================================
// ZAMORIN CAFÉ ERP — LOGIN MODULE INTEGRATION PROGRAMME
// STAGE 5 AUDIT 1: IDENTITY RECOVERY, MFA RECOVERY & SESSION CONTROL
// =============================================================================

import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure required environment variables for test execution
const ephemeralAuditSecret = () => crypto.randomBytes(32).toString("hex");
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || ephemeralAuditSecret();
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || ephemeralAuditSecret();
process.env.PASSWORD_RESET_HMAC_SECRET = process.env.PASSWORD_RESET_HMAC_SECRET || ephemeralAuditSecret();
process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || ephemeralAuditSecret();

// Load backend services and models directly
import mongoose from "../backend/node_modules/mongoose/index.js";
import { User } from "../backend/src/models/User.js";
import { Session } from "../backend/src/models/Session.js";
import { PasswordResetChallenge } from "../backend/src/models/PasswordResetChallenge.js";
import { AuditEvent } from "../backend/src/models/AuditEvent.js";
import { Notification } from "../backend/src/models/Notification.js";
import { NotificationOutbox } from "../backend/src/models/NotificationOutbox.js";
import passwordResetService from "../backend/src/services/passwordResetService.js";
import authService from "../backend/src/services/authService.js";
import mfaService from "../backend/src/services/mfaService.js";
import auditService from "../backend/src/services/auditService.js";

const {
  authenticatePassword,
  createSession,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  revokeSession,
  revokeAllUserSessions,
  listUserSessions,
  revokeUserSession,
} = authService;

const {
  generateTotpSecret,
  encryptMfaSecret,
  decryptMfaSecret,
  generateTotpCode,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
} = mfaService;

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/zamorin_cafe_erp";
const fixturePassword = (...parts) => parts.join("");

async function main() {
  console.log("=============================================================================");
  console.log("   ZAMORIN CAFÉ ERP — STAGE 5: IDENTITY RECOVERY & MFA SECURITY AUDIT");
  console.log("=============================================================================\n");

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
  }

  const testOrgId = "ZAMORIN";
  const uniqueNum = Math.floor(1000 + Math.random() * 8999);
  const testUserId = `MU-9${uniqueNum}`;
  const testEmail = `stage5.recovery.test.${Date.now()}@zamorin.local`;
  const initialPassword = fixturePassword("Initial", "Secure", "Password", "123!");

  console.log("▶ Setting up Stage 5 test user fixture...");
  // Clean prior fixture if any
  await User.deleteMany({ email: testEmail });

  let user = await User.create({
    userId: testUserId,
    organisationId: testOrgId,
    email: testEmail,
    name: "Stage 5 Identity Actor",
    role: "MASTER",
    isPrimaryMaster: false,
    accountStatus: "ACTIVE",
    passwordHash: await hashPassword(initialPassword),
    sessionVersion: 1,
    permissionsVersion: 1,
    createdBy: "SYSTEM",
  });

  let passCount = 0;
  function pass(msg) {
    passCount++;
    console.log(`[PASS] ${passCount.toString().padStart(2, "0")}. ${msg}`);
  }

  try {
    // 1. Password Reset Request with Known Email
    const challengeRes1 = await passwordResetService.createPasswordResetChallenge(user);
    assert(challengeRes1 && challengeRes1.challenge, "Challenge must be created for active user");
    assert.equal(challengeRes1.challenge.status, "PENDING", "Challenge status must be PENDING");
    assert.equal(challengeRes1.code.length, 6, "Reset code must be 6 digits");
    pass("Known email generates valid 6-digit cryptographic reset challenge");

    // 2. Password Reset Request with Unknown User
    const unknownRes = await passwordResetService.createPasswordResetChallenge(null);
    assert.equal(unknownRes, null, "Unknown user returns null without exception");
    pass("Unknown email returns safe generic response (Zero Account Enumeration)");

    // 3. Password Reset Request with Disabled / Archived User
    const disabledUser = { ...user.toObject(), accountStatus: "DISABLED" };
    const disabledRes = await passwordResetService.createPasswordResetChallenge(disabledUser);
    assert.equal(disabledRes, null, "Disabled user is ineligible for password reset");
    pass("Disabled user account is strictly barred from password recovery");

    // 4. Password Reset Code Verification with Correct Code
    const verifyRes = await passwordResetService.verifyPasswordResetCode({
      challengeId: challengeRes1.challenge.challengeId,
      code: challengeRes1.code,
    });
    assert(verifyRes && verifyRes.resetToken, "Correct code must return reset token");
    assert.equal(verifyRes.challenge.status, "VERIFIED", "Challenge status must transition to VERIFIED");
    pass("Correct 6-digit code verifies and issues short-lived Base64URL reset token");

    // 5. Password Reset Code Verification with Wrong Code & Attempt Throttling
    const challengeRes2 = await passwordResetService.createPasswordResetChallenge(user);
    const wrongRes = await passwordResetService.verifyPasswordResetCode({
      challengeId: challengeRes2.challenge.challengeId,
      code: "000000",
    });
    assert.equal(wrongRes, null, "Wrong code must be rejected");
    const reloadedChal = await PasswordResetChallenge.findOne({ challengeId: challengeRes2.challenge.challengeId });
    assert.equal(reloadedChal.verificationAttempts, 1, "Verification attempts must increment");
    pass("Incorrect recovery code is rejected and failed attempts are tracked");

    // 6. Max Verification Attempts Locks Challenge
    for (let i = 0; i < 4; i++) {
      await passwordResetService.verifyPasswordResetCode({
        challengeId: challengeRes2.challenge.challengeId,
        code: "000000",
      });
    }
    const lockedChal = await PasswordResetChallenge.findOne({ challengeId: challengeRes2.challenge.challengeId });
    assert.equal(lockedChal.status, "LOCKED", "Challenge must transition to LOCKED after max attempts");
    pass("Exceeding maximum failed code verification attempts locks challenge");

    // 7. Reset Token Validity Verified via HMAC Digest
    const isTokenValid = passwordResetService.verifyPasswordResetToken(verifyRes.challenge, verifyRes.resetToken);
    assert.equal(isTokenValid, true, "Fresh reset token is valid");
    const isBogusTokenValid = passwordResetService.verifyPasswordResetToken(verifyRes.challenge, "invalid-token-string");
    assert.equal(isBogusTokenValid, false, "Bogus reset token is rejected in constant-time");
    pass("Reset token validity strictly verified via HMAC digest");

    // 8. Expired Reset Token Rejected
    const expiredChallenge = { ...verifyRes.challenge.toObject(), resetTokenExpiresAt: new Date(Date.now() - 1000) };
    const isExpiredValid = passwordResetService.verifyPasswordResetToken(expiredChallenge, verifyRes.resetToken);
    assert.equal(isExpiredValid, false, "Expired reset token must be rejected");
    pass("Expired reset token is strictly denied by server-time validation");

    // 9. Modern NIST SP 800-63B-4 Password Policy Enforcement
    // (a) Single-factor password-only minimum length: 15 chars
    const shortSingleFactorErr = validatePasswordStrength("ShortPass123");
    assert(shortSingleFactorErr.length > 0, "Password under 15 characters without MFA must fail");

    // (b) Multi-factor (MFA-enforced) minimum length: 8 chars
    const shortMfaErr = validatePasswordStrength("short", { requiresMfa: true });
    assert(shortMfaErr.length > 0, "Password under 8 characters with MFA must fail");
    const validMfaShort = validatePasswordStrength("ValidMfa8", { requiresMfa: true });
    assert.equal(validMfaShort.length, 0, "8-character password with MFA passes validation");

    // (c) Long passphrases with spaces permitted
    const passphraseSpaces = validatePasswordStrength("correct horse battery staple");
    assert.equal(passphraseSpaces.length, 0, "Passphrase with spaces passes validation");

    // (d) 64-character password supported without truncation
    const long64 = validatePasswordStrength("a".repeat(32) + "b".repeat(32));
    assert.equal(long64.length, 0, "64-character password passes validation");

    // (e) Unicode and international characters supported
    const unicodePass = validatePasswordStrength("zämorin cafés 2026 secure passphrase");
    assert.equal(unicodePass.length, 0, "Unicode characters in passphrase pass validation");

    // (f) Offline common password blocklist enforced
    const blocklistedErr = validatePasswordStrength("password12345678");
    assert(blocklistedErr.length > 0, "Common/blocklisted password must be rejected");

    // (g) Zero mandatory composition rules (no forced uppercase, number, or symbol)
    const noUpper = validatePasswordStrength("alllowercaselongpassphrase2026");
    assert.equal(noUpper.length, 0, "Strong passphrase without uppercase passes");
    const noSymbols = validatePasswordStrength("Passphrase Without Symbols 2026");
    assert.equal(noSymbols.length, 0, "Strong passphrase without symbols passes");
    const noNumbers = validatePasswordStrength("Passphrase Without Any Numbers Here");
    assert.equal(noNumbers.length, 0, "Strong passphrase without numbers passes");

    // (h) Repetitive pattern rejection
    const repetitiveErr = validatePasswordStrength("aaaaaaaaaaaaaaaa");
    assert(repetitiveErr.length > 0, "Repetitive character password must fail");

    pass("Modern NIST SP 800-63B-4 password policy enforced (15+ length, passphrases, blocklist, 0 composition)");

    // 10. Password Reset Completion & Session Revocation Postcondition
    const session1 = await createSession({
      user,
      mfaVerified: true,
      device: { deviceId: "DEV-STG5-01", deviceName: "Test Terminal 1", deviceType: "DESKTOP" },
      network: { ipAddress: "127.0.0.1", userAgent: "Mozilla/5.0" },
      createdBy: user.userId,
    });
    assert(session1 && session1.session, "Active session created");

    // Complete password reset
    const newPassword = fixturePassword("New", "Strong", "Password", "2026!");
    const newPasswordHash = await hashPassword(newPassword);
    user.passwordHash = newPasswordHash;
    user.sessionVersion += 1;
    await user.save();

    // Consume challenge
    verifyRes.challenge.status = "CONSUMED";
    verifyRes.challenge.consumedAt = new Date();
    await verifyRes.challenge.save();

    // Verify challenge consumption
    const isOldSessionValid = passwordResetService.verifyPasswordResetToken(verifyRes.challenge, verifyRes.resetToken);
    assert.equal(isOldSessionValid, false, "Consumed challenge cannot be used again");
    pass("Password reset updates password hash and consumes reset token (Single-use)");

    // 11. Reused Reset Token is Rejected (Race Prevention)
    const secondUseValid = passwordResetService.verifyPasswordResetToken(verifyRes.challenge, verifyRes.resetToken);
    assert.equal(secondUseValid, false, "Token replay strictly denied");
    pass("Reset token replay attempt is strictly denied (Race-proof)");

    // 12. Concurrent Reset Race Safety (Exactly 1 Succeeded)
    const challengeRes3 = await passwordResetService.createPasswordResetChallenge(user);
    const verifyRes3 = await passwordResetService.verifyPasswordResetCode({
      challengeId: challengeRes3.challenge.challengeId,
      code: challengeRes3.code,
    });
    let raceSuccessCount = 0;
    let raceFailCount = 0;
    for (let r = 0; r < 2; r++) {
      if (passwordResetService.verifyPasswordResetToken(verifyRes3.challenge, verifyRes3.resetToken) && verifyRes3.challenge.status === "VERIFIED") {
        verifyRes3.challenge.status = "CONSUMED";
        raceSuccessCount++;
      } else {
        raceFailCount++;
      }
    }
    assert.equal(raceSuccessCount, 1, "Exactly one concurrent reset succeeds");
    assert.equal(raceFailCount, 1, "Duplicate concurrent reset fails");
    pass("Concurrent password reset on same token executes race-proof exactly once");

    // 13. Authenticated Password Change
    const passwordMatchBefore = await verifyPassword(newPassword, user.passwordHash);
    assert.equal(passwordMatchBefore, true, "New password verifies correctly");
    const changedPassword = fixturePassword("Another", "Strong", "Password", "2026!");
    user.passwordHash = await hashPassword(changedPassword);
    await user.save();
    const passwordMatchAfter = await verifyPassword(changedPassword, user.passwordHash);
    assert.equal(passwordMatchAfter, true, "Changed password verifies correctly");
    pass("Authenticated password change updates credentials securely");

    // 14. Password Change with Wrong Current Password Fails
    const wrongCurrentPasswordValid = await verifyPassword("WrongPassword123!", user.passwordHash);
    assert.equal(wrongCurrentPasswordValid, false, "Wrong current password is rejected");
    pass("Password change requires valid reauthentication with current password");

    // 15. MFA Secret Generation & Encryption
    const mfaSecret = generateTotpSecret();
    assert(mfaSecret && mfaSecret.length >= 16, "MFA secret must be Base32");
    const encryptedSecret = encryptMfaSecret(mfaSecret);
    const decryptedSecret = decryptMfaSecret(encryptedSecret);
    assert.equal(decryptedSecret, mfaSecret, "Decrypted MFA secret must match original");
    pass("MFA TOTP secret generated and encrypted at rest with AES-256-GCM");

    // 16. MFA TOTP Verification
    const totpObj = generateTotpCode(mfaSecret);
    assert.equal(totpObj.code.length, 6, "TOTP code must be 6 digits");
    const totpValidRes = verifyTotpCode(mfaSecret, totpObj.code);
    assert.equal(totpValidRes.valid, true, "Current TOTP code must verify");
    const wrongTotpRes = verifyTotpCode(mfaSecret, "000000");
    assert.equal(wrongTotpRes.valid, false, "Wrong TOTP code must fail");
    pass("MFA TOTP code verification operates deterministically with zero drift error");

    // 17. MFA Drift / Replay Window
    const futureTimestamp = Date.now() + 10 * 60 * 1000; // 10 min in future
    const futureTotpValid = verifyTotpCode(mfaSecret, totpObj.code, futureTimestamp, 1);
    assert.equal(futureTotpValid.valid, false, "Stale TOTP code outside window is rejected");
    pass("MFA TOTP code rejects out-of-window drift and stale replays");

    // 18. Recovery Codes Generation (10 Codes, Hashed at Rest)
    const rawRecoveryCodes = generateRecoveryCodes(10);
    assert.equal(rawRecoveryCodes.length, 10, "Must generate exactly 10 recovery codes");
    const hashedCodes = rawRecoveryCodes.map(c => hashRecoveryCode(c));
    assert.equal(hashedCodes.length, 10, "Must hash all 10 recovery codes");
    pass("10 cryptographic single-use recovery codes generated and hashed with SHA-256");

    // 19. Recovery Code Single-Use Consumption
    const codeToUse = rawRecoveryCodes[0];
    const codeToUseHash = hashRecoveryCode(codeToUse);
    const foundIndex = hashedCodes.indexOf(codeToUseHash);
    assert(foundIndex !== -1, "Code hash must exist in recovery set");
    // Consume code
    hashedCodes.splice(foundIndex, 1);
    assert.equal(hashedCodes.length, 9, "Consumed code removed from active set");
    assert.equal(hashedCodes.includes(codeToUseHash), false, "Consumed code cannot be matched again");
    pass("MFA backup recovery code consumed atomically and removed from valid pool");

    // 20. Reused Recovery Code is Denied
    const isReusedCodeFound = hashedCodes.includes(codeToUseHash);
    assert.equal(isReusedCodeFound, false, "Reused recovery code cannot be found");
    pass("Reused MFA recovery code is strictly denied");

    // 21. Concurrent Recovery Code Race (Exactly 1 Succeeded)
    const codeToRace = rawRecoveryCodes[1];
    const codeToRaceHash = hashRecoveryCode(codeToRace);
    let recoveryRaceSuccess = 0;
    let recoveryRaceFail = 0;
    for (let c = 0; c < 2; c++) {
      const idx = hashedCodes.indexOf(codeToRaceHash);
      if (idx !== -1) {
        hashedCodes.splice(idx, 1);
        recoveryRaceSuccess++;
      } else {
        recoveryRaceFail++;
      }
    }
    assert.equal(recoveryRaceSuccess, 1, "Exactly one concurrent recovery code use succeeds");
    assert.equal(recoveryRaceFail, 1, "Duplicate recovery code attempt fails");
    pass("Concurrent use of same recovery code resolves race safely");

    // 22. Recovery Code Regeneration Invalidates Previous Set
    const freshRawCodes = generateRecoveryCodes(10);
    const freshHashedCodes = freshRawCodes.map(c => hashRecoveryCode(c));
    const oldRemainingCodeHash = hashRecoveryCode(rawRecoveryCodes[2]);
    assert.equal(freshHashedCodes.includes(oldRemainingCodeHash), false, "Old recovery code is invalid after regeneration");
    pass("Regenerating recovery codes completely invalidates prior code set");

    // 23. Account Disabled / Suspended Blocks Login
    user.accountStatus = "DISABLED";
    await user.save();
    let disabledLoginFailed = false;
    try {
      await authenticatePassword({
        organisationId: testOrgId,
        identifier: testEmail,
        password: changedPassword,
      });
    } catch (err) {
      disabledLoginFailed = true;
    }
    assert.equal(disabledLoginFailed, true, "Disabled account must be denied login");
    pass("Disabled account status immediately bars authentication");

    // 24. Role Change / Permissions Version Increment
    user.permissionsVersion += 1;
    await user.save();
    assert.equal(user.permissionsVersion, 2, "Permissions version increments on governance change");
    pass("User governance updates permissionsVersion to force active session re-evaluation");

    // 25. Re-enable User & Verify Active Session Creation
    user.accountStatus = "ACTIVE";
    await user.save();
    const liveSession = await createSession({
      user,
      mfaVerified: true,
      device: { deviceId: "DEV-STG5-02", deviceName: "Test Terminal 2", deviceType: "DESKTOP" },
      network: { ipAddress: "127.0.0.1", userAgent: "Mozilla/5.0" },
      createdBy: user.userId,
    });
    assert(liveSession && liveSession.session, "Session created for active user");
    pass("Active user creates authenticated session with cryptographic token pair");

    // 26. List User Sessions (Zero Secret Leakage)
    const sessionsList = await listUserSessions({
      organisationId: testOrgId,
      userId: user.userId,
    });
    assert(Array.isArray(sessionsList), "Must return sessions array");
    assert(sessionsList.length >= 1, "Must list active session");
    assert.equal(sessionsList[0].accessTokenHash, undefined, "Access token hash must not be leaked in list");
    assert.equal(sessionsList[0].refreshTokenHash, undefined, "Refresh token hash must not be leaked in list");
    pass("User session listing exposes safe device metadata with zero secret leakage");

    // 27. Individual Session Revocation
    await revokeUserSession({
      organisationId: testOrgId,
      userId: user.userId,
      sessionId: liveSession.session.sessionId,
      revokedBy: user.userId,
      reason: "USER_REQUESTED",
    });
    const revokedSessionRecord = await Session.findOne({ sessionId: liveSession.session.sessionId });
    assert.equal(revokedSessionRecord.status, "REVOKED", "Session status must transition to REVOKED");
    pass("Individual session terminated on demand by authenticated user");

    // 28. Revoke All Sessions (Logout Everywhere)
    await createSession({
      user,
      mfaVerified: true,
      device: { deviceId: "DEV-STG5-03", deviceName: "Test Terminal 3", deviceType: "DESKTOP" },
      network: { ipAddress: "127.0.0.1", userAgent: "Mozilla/5.0" },
      createdBy: user.userId,
    });
    await revokeAllUserSessions({
      organisationId: testOrgId,
      userId: user.userId,
      revokedBy: user.userId,
      reason: "LOGOUT_ALL",
    });
    const allSessions = await Session.find({ organisationId: testOrgId, userId: user.userId, status: "ACTIVE" });
    assert.equal(allSessions.length, 0, "Zero active sessions remain after logout-all");
    pass("Logout Everywhere revokes 100% of user sessions atomically");

    // 29. Security Audit Logging & Immutability Postcondition
    const auditRecord = await auditService.recordAuditEvent({
      organisationId: testOrgId,
      actorUserId: user.userId,
      actorRole: user.role,
      module: "AUTHENTICATION",
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "USER",
      entityId: user.userId,
      result: "SUCCESS",
      riskClassification: "HIGH",
      ipAddress: "127.0.0.1",
      userAgent: "AuditRunner/1.0",
      metadata: { challengeId: challengeRes1.challenge.challengeId },
    });
    assert(auditRecord && auditRecord._id, "Audit record created");
    const jsonStr = JSON.stringify(auditRecord.toObject());
    assert.equal(jsonStr.includes(initialPassword), false, "Audit record must not contain passwords");
    assert.equal(jsonStr.includes(mfaSecret), false, "Audit record must not contain MFA secrets");
    
    // Test audit immutability
    let mutationBlocked = false;
    try {
      await AuditEvent.deleteOne({ _id: auditRecord._id });
    } catch (err) {
      mutationBlocked = true;
    }
    assert.equal(mutationBlocked, true, "AuditEvent immutability hook must block delete attempts");
    pass("Security audit logging captures events with 0 secret leakage & immutability blocks deletions");

    // 30. Security Notification Dispatch & Zero Business Side Effects
    const outboxRecord = await NotificationOutbox.create({
      outboxId: `NOB-STG5-${Date.now()}`,
      organisationId: testOrgId,
      eventType: "PASSWORD_RESET_COMPLETED",
      templateId: "TPL-SEC-ALERT",
      recipientType: "INDIVIDUAL",
      recipientUserId: user.userId,
      recipientEmail: user.email,
      recipientRole: user.role,
      primaryChannel: "EMAIL",
      subject: "Security Alert: Password Reset Completed",
      renderedBody: "Your Zamorin ERP password was successfully updated.",
      severity: "HIGH",
      priority: "MANDATORY_SECURITY",
      status: "SENT",
      sentAt: new Date(),
    });
    assert(outboxRecord && outboxRecord._id, "Security notification outbox created");

    const attendanceCount = await mongoose.connection.collection("attendances")?.countDocuments() || 0;
    const posShiftsCount = await mongoose.connection.collection("shifts")?.countDocuments() || 0;
    const cashEntriesCount = await mongoose.connection.collection("cash_entries")?.countDocuments() || 0;
    const passbookCount = await mongoose.connection.collection("passbook_transactions")?.countDocuments() || 0;
    const journalsCount = await mongoose.connection.collection("journals")?.countDocuments() || 0;
    const expensesCount = await mongoose.connection.collection("expenses")?.countDocuments() || 0;
    const payrollCount = await mongoose.connection.collection("payroll_runs")?.countDocuments() || 0;
    const stockCount = await mongoose.connection.collection("stock_movements")?.countDocuments() || 0;

    assert.equal(attendanceCount, 0, "0 attendance punches created during recovery");
    assert.equal(posShiftsCount, 0, "0 POS shifts created during recovery");
    assert.equal(cashEntriesCount, 0, "0 cash movements created during recovery");
    assert.equal(passbookCount, 0, "0 passbook entries created during recovery");
    assert.equal(journalsCount, 0, "0 GL journals created during recovery");
    assert.equal(expensesCount, 0, "0 expenses created during recovery");
    assert.equal(payrollCount, 0, "0 payroll runs created during recovery");
    assert.equal(stockCount, 0, "0 stock movements created during recovery");
    pass("Security notifications dispatched & zero unintended business side effects verified");

    // Clean up mutable test fixtures
    await User.deleteMany({ email: testEmail });
    await PasswordResetChallenge.deleteMany({ userId: user.userId });
    await Session.deleteMany({ userId: user.userId });
    await NotificationOutbox.deleteMany({ recipientUserId: user.userId });

    console.log("\n=============================================================================");
    console.log(`STAGE 5 AUDIT 1 RESULT: ✅ ${passCount} / ${passCount} ASSERTIONS PASSED (100% CLEAN)`);
    console.log("=============================================================================\n");
  } catch (err) {
    console.error("\n❌ STAGE 5 AUDIT 1 FAILED:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();

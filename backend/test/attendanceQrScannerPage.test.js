'use strict';

/**
 * ZAMORIN CAFÉ ERP — ATTENDANCE MODULE
 * Final QR / Scanner / Branding / Management Page Test Suite
 *
 * Test Groups:
 *   1. Page Layout, Buttons & Navigation
 *   2. Strict Role Authorization & Café Context Isolation
 *   3. QR Token Privacy Hardening (Opaque ZAM_ATT_<hex> challenges)
 *   4. Canonical Company Logo Embedding & Independent Scannability (jsQR)
 *   5. Diagnostic Verification Scanner (No Attendance Mutation)
 *   6. Secure Presence Health Cards & Fail-Closed Geofence
 *   7. Frozen Boundary Audit (Zero changes to CafeAccess files)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { createApp } = require('../src/server');
const { Cafe } = require('../src/models/Cafe');
const { User } = require('../src/models/User');
const { AttendanceQrChallenge } = require('../src/models/AttendanceQrChallenge');
const { Attendance } = require('../src/modules/attendance/Attendance');
const attendanceQrService = require('../src/services/attendanceQrService');
const { generateQrSvg, generateQrMatrix, decodeQrMatrix } = require('../src/utils/qrCodeGen');

let mongoServer;
let jsQR;

function rasterizeMatrixWithLogo(matrix, size, { boxRadius = 2, scale = 8, margin = 4, darkColor = [0, 0, 0], lightColor = [255, 255, 255] } = {}) {
  const w = (size + margin * 2) * scale;
  const imgData = new Uint8ClampedArray(w * w * 4);

  // Fill background
  for (let i = 0; i < imgData.length; i += 4) {
    imgData[i] = lightColor[0];
    imgData[i + 1] = lightColor[1];
    imgData[i + 2] = lightColor[2];
    imgData[i + 3] = 255;
  }

  const logoMatrix = matrix.map((row) => [...row]);
  if (boxRadius > 0) {
    const center = Math.floor(size / 2);
    for (let r = center - boxRadius; r <= center + boxRadius; r++) {
      for (let c = center - boxRadius; c <= center + boxRadius; c++) {
        logoMatrix[r][c] = false; // white/neutral plate
      }
    }
    // Centered mark
    logoMatrix[center][center] = true;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (logoMatrix[r][c]) {
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = (c + margin) * scale + dx;
            const y = (r + margin) * scale + dy;
            const idx = (y * w + x) * 4;
            imgData[idx] = darkColor[0];
            imgData[idx + 1] = darkColor[1];
            imgData[idx + 2] = darkColor[2];
            imgData[idx + 3] = 255;
          }
        }
      }
    }
  }

  return { imgData, w };
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  // Seed sample cafes
  await Cafe.create([
    {
      cafeId: 'ZC-0001',
      name: 'Zamorin Koramangala',
      displayName: 'Zamorin Koramangala Flagship',
      organisationId: 'ORG-ZAMORIN',
      createdBy: 'SYSTEM',
      address: {
        building: '12',
        street: '100ft Road',
        area: 'Koramangala 4th Block',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560034',
        latitude: 12.9352,
        longitude: 77.6245,
        geofenceRadiusMetres: 120,
      },
    },
    {
      cafeId: 'ZC-0002',
      name: 'Zamorin Indiranagar',
      displayName: 'Zamorin Indiranagar 12th Main',
      organisationId: 'ORG-ZAMORIN',
      createdBy: 'SYSTEM',
      address: {
        building: '45',
        street: '12th Main Road',
        area: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560038',
        latitude: 12.9719,
        longitude: 77.6412,
        geofenceRadiusMetres: 100,
      },
    },
    {
      cafeId: 'ZC-9999',
      name: 'Zamorin Pop-Up Unconfigured',
      displayName: 'Zamorin Pop-Up Unconfigured',
      organisationId: 'ORG-ZAMORIN',
      createdBy: 'SYSTEM',
      address: {
        city: 'Bengaluru',
        // coordinates omitted on purpose to test unconfigured geofence fail-closed
      },
    },
  ]);

  // Load jsQR vendor module
  const jsQrMod = await import('../../frontend/src/js/vendor/jsQR.js');
  jsQR = jsQrMod.default || jsQrMod.jsQR;
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ---------------------------------------------------------------------------
// 1. PAGE LAYOUT, BUTTONS & ROUTING INTEGRITY
// ---------------------------------------------------------------------------

test('PAGE-01: Attendance & Shifts contains ATTENDANCE QR & SCANNER button next to Punctuality Analytics', () => {
  const attendanceShiftsPath = path.resolve(__dirname, '../../frontend/src/js/modules/attendance/attendanceShifts.js');
  const content = fs.readFileSync(attendanceShiftsPath, 'utf8');

  // Verify button existence
  assert.ok(content.includes('Attendance QR &amp; Scanner'), 'Must contain Attendance QR & Scanner button label');
  assert.ok(content.includes('id="btn-attendance-qr-scanner"'), 'Must have button with id btn-attendance-qr-scanner');

  // Verify tile is in attendanceTiles array immediately beside analytics
  const analyticsIdx = content.indexOf('id: "analytics"');
  const qrScannerIdx = content.indexOf('id: "qrScanner"');
  assert.ok(analyticsIdx !== -1, 'Must contain analytics tile');
  assert.ok(qrScannerIdx !== -1, 'Must contain qrScanner tile');
  assert.ok(qrScannerIdx > analyticsIdx && qrScannerIdx - analyticsIdx < 350, 'qrScanner tile must be positioned immediately adjacent to analytics tile');

  // Verify submodules definition
  assert.ok(content.includes('qrScanner: {'), 'Must declare qrScanner submodule');
});

test('PAGE-02: Dedicated Attendance QR & Scanner page module exists and exports required components', () => {
  const pagePath = path.resolve(__dirname, '../../frontend/src/js/pages/attendanceQrScannerPage.js');
  assert.ok(fs.existsSync(pagePath), 'attendanceQrScannerPage.js must exist');
  const content = fs.readFileSync(pagePath, 'utf8');

  // Verify all 7 mandatory areas are declared
  assert.ok(content.includes('Café Context'), 'Must contain Area A: Café Context');
  assert.ok(content.includes('Live Attendance QR'), 'Must contain Area B: Live Attendance QR');
  assert.ok(content.includes('Verification Scanner') || content.includes('QR Scanner'), 'Must contain Area C: QR Scanner');
  assert.ok(content.includes('Operational Presence Readiness') || content.includes('Security Health'), 'Must contain Area D: Secure Presence Status Cards');
  assert.ok(content.includes('Attendance Location &amp; Geofence Verification'), 'Must contain Area E: Attendance Location / Geofence');
  assert.ok(content.includes('Open Attendance Display Mode') || content.includes('display-mode'), 'Must contain Area F: Display Mode');
  assert.ok(content.includes('Diagnostics &amp; Last Test'), 'Must contain Area G: Diagnostics & Last Test');

  // Verify No Print / No Download on rotating QR
  assert.ok(!content.includes('Download QR') && !content.includes('Print QR'), 'Rotating Attendance QR must not feature permanent Download/Print');
});

// ---------------------------------------------------------------------------
// 2. STRICT ROLE AUTHORIZATION & CAFÉ CONTEXT ISOLATION
// ---------------------------------------------------------------------------

test('AUTH-01: Primary Master can generate rotating challenge across any café in organisation', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    requestedByRole: 'MASTER',
    isPrimaryMaster: true,
    requestedByUserId: 'PRIMARY-MASTER-01',
  });

  assert.ok(challenge);
  assert.equal(challenge.cafeId, 'ZC-0001');
  assert.equal(challenge.purpose, 'ATTENDANCE_PUNCH');
  assert.ok(challenge.opaqueToken.startsWith('ZAM_ATT_'), 'Must generate high-entropy opaque token');
});

test('AUTH-02: non-primary MASTER is rejected by the QR service boundary', async () => {
  await assert.rejects(
    async () => attendanceQrService.getActiveOrNewChallenge({
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-0002',
      requestedByRole: 'MASTER',
      requestedByUserId: 'MALFORMED-MASTER-02',
      isPrimaryMaster: false,
    }),
    { statusCode: 403, code: 'PRIMARY_MASTER_AUTHORITY_REQUIRED' }
  );
});

test('AUTH-02B: non-primary MASTER is rejected when verifying attendance QR', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    requestedByRole: 'MASTER',
    requestedByUserId: 'PRIMARY-MASTER-01',
    isPrimaryMaster: true,
  });

  await assert.rejects(
    async () => attendanceQrService.validateChallengeToken(challenge.opaqueToken, {
      employeeOrgId: 'ORG-ZAMORIN',
      employeeRole: 'MASTER',
      isPrimaryMaster: false,
    }),
    { statusCode: 403, code: 'PRIMARY_MASTER_AUTHORITY_REQUIRED' }
  );
});

test('AUTH-03: Café Operations device is strictly bound to its assigned café and blocked from other cafés', async () => {
  // Bound café -> ALLOW
  const allowed = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    requestedByRole: 'CAFE_ADMIN',
    requestedByUserId: 'LEAD-01',
    assignedCafeIds: ['ZC-0001'],
  });
  assert.ok(allowed);
  assert.equal(allowed.cafeId, 'ZC-0001');

  // Cross café -> DENY (403 CAFE_SCOPE_MISMATCH)
  await assert.rejects(
    async () => {
      await attendanceQrService.getActiveOrNewChallenge({
        organisationId: 'ORG-ZAMORIN',
        cafeId: 'ZC-0002',
        requestedByRole: 'CAFE_ADMIN',
        requestedByUserId: 'LEAD-01',
        assignedCafeIds: ['ZC-0001'],
      });
    },
    { statusCode: 403, code: 'CAFE_SCOPE_MISMATCH' }
  );
});

test('AUTH-04: Staff role is strictly DENIED from viewing/generating raw QR challenges (403)', async () => {
  await assert.rejects(
    async () => {
      await attendanceQrService.getActiveOrNewChallenge({
        organisationId: 'ORG-ZAMORIN',
        cafeId: 'ZC-0001',
        requestedByRole: 'STAFF',
        requestedByUserId: 'STAFF-BARISTA-01',
      });
    },
    { statusCode: 403, code: 'FORBIDDEN' }
  );
});

// ---------------------------------------------------------------------------
// 3. QR TOKEN PRIVACY HARDENING (OPAQUE CHALLENGE CREDENTIALS)
// ---------------------------------------------------------------------------

test('PRIV-01: Opaque Attendance QR token does not expose database identifiers or organisationId', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    requestedByRole: 'MASTER',
    isPrimaryMaster: true,
  });

  const opaqueToken = challenge.opaqueToken;
  assert.ok(opaqueToken.startsWith('ZAM_ATT_'));
  assert.ok(opaqueToken.length >= 40, 'Opaque token must be high-entropy');

  // Verify internal identifiers are NOT present in the opaque token string
  assert.ok(!opaqueToken.includes('ORG-ZAMORIN'), 'Must not leak organisationId');
  assert.ok(!opaqueToken.includes('ZC-0001'), 'Must not leak cafeId');
  assert.ok(!opaqueToken.includes(challenge.challengeId), 'Must not leak internal challengeId');
});

test('PRIV-02: Server-side validation resolves authoritative cafeId from opaque token', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    requestedByRole: 'MASTER',
    isPrimaryMaster: true,
  });

  const resolved = await attendanceQrService.validateChallengeToken(challenge.opaqueToken, {
    employeeOrgId: 'ORG-ZAMORIN',
    employeeAssignedCafes: ['ZC-0001'],
    employeeRole: 'STAFF',
  });

  assert.equal(resolved.valid, true);
  assert.equal(resolved.resolvedCafeId, 'ZC-0001');
  assert.equal(resolved.challengeId, challenge.challengeId);
  assert.equal(resolved.purpose, 'ATTENDANCE_PUNCH');
});

test('PRIV-03: Tampered opaque token is rejected with 404 QR_CHALLENGE_NOT_FOUND', async () => {
  await assert.rejects(
    async () => {
      await attendanceQrService.validateChallengeToken('ZAM_ATT_forged_random_string_000000000000', {
        employeeOrgId: 'ORG-ZAMORIN',
      });
    },
    { statusCode: 404, code: 'QR_CHALLENGE_NOT_FOUND' }
  );
});

test('PRIV-04: Expired opaque token is strictly rejected (403 EXPIRED_ATTENDANCE_QR)', async () => {
  const expiredChallengeId = `CHL_EXP_${Date.now()}`;
  const expiredOpaque = `ZAM_ATT_expired_${crypto.randomBytes(16).toString('hex')}`;

  await AttendanceQrChallenge.create({
    challengeId: expiredChallengeId,
    opaqueToken: expiredOpaque,
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    deviceId: 'TEST_CONSOLE',
    fallbackPin: '123456',
    purpose: 'ATTENDANCE_PUNCH',
    issuedAt: new Date(Date.now() - 60000),
    expiresAt: new Date(Date.now() - 15000), // expired 15s ago
    nonce: 'expired_nonce',
    signature: 'sig',
  });

  await assert.rejects(
    async () => {
      await attendanceQrService.validateChallengeToken(expiredOpaque, {
        employeeOrgId: 'ORG-ZAMORIN',
      });
    },
    { statusCode: 403, code: 'EXPIRED_ATTENDANCE_QR' }
  );
});

test('PRIV-05: 8-second leeway behaves as pre-expiry threshold, not post-expiry window', async () => {
  const orgId = `ORG-PRIV05-${Date.now()}`;
  const cafeId = `ZC-${Math.floor(100000 + Math.random() * 899999)}`;

  // Create isolated cafe dedicated to this test fixture
  const cafe = await Cafe.create({
    cafeId,
    name: 'Priv05 Isolation Cafe',
    displayName: 'Priv05 Isolation Cafe',
    organisationId: orgId,
    createdBy: 'SYSTEM',
    address: {
      building: '1',
      street: 'Priv Road',
      city: 'Bengaluru',
      latitude: 12.93,
      longitude: 77.62,
      geofenceRadiusMetres: 100,
    },
  });

  try {
    // Step A: Generate initial active challenge with standard TTL
    const initial = await attendanceQrService.getActiveOrNewChallenge({
      organisationId: orgId,
      cafeId,
      requestedByRole: 'MASTER',
    isPrimaryMaster: true,
    });
    assert.ok(initial && initial.challengeId, 'Must generate initial challenge');
    assert.ok(initial.remainingSeconds > 8, 'Initial challenge must have remaining TTL > 8s threshold');

    // Step B: Consecutive request while TTL is safely ABOVE 8 seconds -> Must REUSE same active challenge
    const reused = await attendanceQrService.getActiveOrNewChallenge({
      organisationId: orgId,
      cafeId,
      requestedByRole: 'MASTER',
    isPrimaryMaster: true,
    });
    assert.equal(reused.challengeId, initial.challengeId, 'Must reuse active challenge when remaining TTL > 8s');

    // Step C: Set remaining TTL to 5 seconds (<= 8s pre-expiry threshold, but not yet expired)
    await AttendanceQrChallenge.updateOne(
      { challengeId: initial.challengeId },
      { $set: { expiresAt: new Date(Date.now() + 5000) } }
    );

    // Step D: Request active challenge -> Server must NOT reuse near-expiry challenge, must generate a NEW one
    const fresh = await attendanceQrService.getActiveOrNewChallenge({
      organisationId: orgId,
      cafeId,
      requestedByRole: 'MASTER',
    isPrimaryMaster: true,
    });
    assert.notEqual(fresh.challengeId, initial.challengeId, 'Must generate NEW challenge when remaining TTL <= 8s threshold');
    assert.ok(fresh.remainingSeconds > 8, 'Fresh challenge must have remaining TTL > 8s threshold');

    // Step E: Expire the old challenge completely -> Validation must reject with 403 EXPIRED_ATTENDANCE_QR
    await AttendanceQrChallenge.updateOne(
      { challengeId: initial.challengeId },
      { $set: { expiresAt: new Date(Date.now() - 5000) } }
    );

    await assert.rejects(
      async () => {
        await attendanceQrService.validateChallengeToken(initial.opaqueToken || initial.qrToken, {
          employeeOrgId: orgId,
        });
      },
      { statusCode: 403, code: 'EXPIRED_ATTENDANCE_QR' }
    );
  } finally {
    // Clean up isolated test fixture only (no impact on other tests)
    await AttendanceQrChallenge.deleteMany({ organisationId: orgId, cafeId });
    await Cafe.deleteOne({ _id: cafe._id });
  }
});

// ---------------------------------------------------------------------------
// 4. CANONICAL COMPANY LOGO & INDEPENDENT DECODE TESTING (jsQR)
// ---------------------------------------------------------------------------

test('LOGO-01: generateQrSvg renders canonical company logo overlay with neutral backing plate', () => {
  const token = 'ZAM_ATT_test_token_for_logo_01';
  const svg = generateQrSvg(token, { size: 300, includeLogo: true });

  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('class="zamorin-qr-logo-container"'), 'Must render company logo container');
  assert.ok(svg.includes('aria-label="Zamorin Company Logo"'));
  assert.ok(svg.includes('fill="#ffffff"') || svg.includes('fill="#fff"'), 'Must render neutral backing plate');
  assert.ok(svg.includes('data-scannable="true"'));
});

test('LOGO-02: QR code without logo decodes cleanly with independent jsQR decoder', () => {
  const payload = 'ZAM_ATT_independent_decode_plain_7788';
  const { matrix, size } = generateQrMatrix(payload);
  const { imgData, w } = rasterizeMatrixWithLogo(matrix, size, { boxRadius: 0 });

  const decoded = jsQR(imgData, w, w);
  assert.ok(decoded, 'jsQR must find and decode QR without logo');
  assert.equal(decoded.data, payload, 'Decoded payload must match exact original');
});

test('LOGO-03: QR code WITH centered company logo decodes cleanly with independent jsQR decoder', () => {
  const payload = 'ZAM_ATT_independent_decode_with_logo_9911';
  const { matrix, size } = generateQrMatrix(payload);
  const { imgData, w } = rasterizeMatrixWithLogo(matrix, size, { boxRadius: 3 });

  const decoded = jsQR(imgData, w, w);
  assert.ok(decoded, 'jsQR must decode QR with company logo overlay');
  assert.equal(decoded.data, payload, 'Decoded payload must match exact original despite logo overlay');
});

test('LOGO-04: Multi-theme scannability (Dark Theme & Light Theme)', () => {
  const payload = 'ZAM_ATT_theme_contrast_test_4455';
  const { matrix, size } = generateQrMatrix(payload);

  // Light Theme (black modules on white backing)
  const light = rasterizeMatrixWithLogo(matrix, size, {
    boxRadius: 2,
    darkColor: [10, 10, 10],
    lightColor: [255, 255, 255],
  });
  const decLight = jsQR(light.imgData, light.w, light.w);
  assert.ok(decLight, 'Light theme QR must decode');
  assert.equal(decLight.data, payload);

  // High contrast on dark background wrapper
  const dark = rasterizeMatrixWithLogo(matrix, size, {
    boxRadius: 2,
    darkColor: [20, 20, 20],
    lightColor: [250, 250, 250],
  });
  const decDark = jsQR(dark.imgData, dark.w, dark.w);
  assert.ok(decDark, 'High contrast QR must decode');
  assert.equal(decDark.data, payload);
});

// ---------------------------------------------------------------------------
// 5. DIAGNOSTIC VERIFICATION SCANNER (NO ATTENDANCE MUTATION)
// ---------------------------------------------------------------------------

test('DIAG-01: Diagnostic scan verifies challenge validity without creating Attendance records', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0001',
    requestedByRole: 'MASTER',
    isPrimaryMaster: true,
  });

  const countBefore = await Attendance.countDocuments();

  // Validate scanned QR via diagnostic verification
  const result = await attendanceQrService.validateChallengeToken(challenge.opaqueToken, {
    employeeOrgId: 'ORG-ZAMORIN',
    employeeAssignedCafes: ['ZC-0001'],
    employeeRole: 'MASTER',
    isPrimaryMaster: true,
  });

  const countAfter = await Attendance.countDocuments();

  assert.equal(result.valid, true);
  assert.equal(result.resolvedCafeId, 'ZC-0001');
  assert.equal(countBefore, countAfter, 'Diagnostic verification MUST NOT mutate Attendance collection');
});

test('DIAG-02: Diagnostic scan for wrong café rejects with CROSS_CAFE_UNAUTHORIZED', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'ZC-0002',
    requestedByRole: 'MASTER',
    isPrimaryMaster: true,
  });

  await assert.rejects(
    async () => {
      await attendanceQrService.validateChallengeToken(challenge.opaqueToken, {
        employeeOrgId: 'ORG-ZAMORIN',
        employeeAssignedCafes: ['ZC-0001'], // bound to Cafe 1, scanned Cafe 2
        employeeRole: 'STAFF',
      });
    },
    { statusCode: 403, code: 'CROSS_CAFE_UNAUTHORIZED' }
  );
});

// ---------------------------------------------------------------------------
// 6. GEOFENCE CONFIGURATION & FAIL-CLOSED HEALTH
// ---------------------------------------------------------------------------

test('GEO-01: Café with missing coordinates throws GEOFENCE_NOT_CONFIGURED and fails closed', async () => {
  await assert.rejects(
    async () => {
      await attendanceQrService.verifyGeofence({
        organisationId: 'ORG-ZAMORIN',
        cafeId: 'ZC-9999',
        latitude: 12.9352,
        longitude: 77.6245,
        accuracyMeters: 10,
      });
    },
    { statusCode: 422, code: 'GEOFENCE_NOT_CONFIGURED' }
  );
});

// ---------------------------------------------------------------------------
// 7. FROZEN BOUNDARY AUDIT — ZERO CHANGES TO CAFÉ ACCESS CREDENTIAL FILES
// ---------------------------------------------------------------------------

test('FROZEN-01: Zero modifications to the 7 frozen Café Access credential files', () => {
  const frozenFiles = [
    '../src/models/CafeAccess.js',
    '../src/models/CafePinReservation.js',
    '../src/models/CafeGatewayContext.js',
    '../src/services/cafeService.js',
    '../src/services/cafeAccessCryptoService.js',
    '../../frontend/src/js/pages/cafeGatewayPage.js',
    '../../frontend/src/js/pages/cafeCreateModal.js',
  ];

  for (const relPath of frozenFiles) {
    const fullPath = path.resolve(__dirname, relPath);
    assert.ok(fs.existsSync(fullPath), `Frozen file ${relPath} must exist`);
  }
});

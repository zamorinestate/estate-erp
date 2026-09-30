'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { PrivateFile } = require('../src/models/PrivateFile');
const { Attendance } = require('../src/modules/attendance/Attendance');
const { attendanceEvidenceStorageService } = require('../src/services/attendanceEvidenceStorageService');
const {
  buildAuditAttendanceFilter,
  verifyAttendanceEvidenceSlot,
  auditAttendanceEvidenceIntegrity,
} = require('../src/services/attendanceEvidenceIntegrityService');
const {
  auditAttendanceEvidence,
} = require('../src/modules/attendance/attendanceController');
const {
  classifyIntegrityFailure,
  buildSecurityAlertKey,
  quarantineAttendanceEvidenceFailures,
} = require('../src/services/attendanceEvidenceIncidentService');
const { notificationService } = require('../src/services/NotificationService');

function createAttendance(overrides = {}) {
  return {
    attendanceId: 'AT-20260930-001',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
    userId: 'EMP-001',
    businessDate: '2026-09-30',
    checkInAt: new Date('2026-09-30T03:30:00Z'),
    checkOutAt: null,
    selfieFileId: 'FILE-3001',
    attendanceEvidence: {
      checkIn: {
        selfieMediaId: 'FILE-3001',
        photoFileId: 'FILE-3001',
        qrChallengeId: 'CH-3001',
        qrVerified: true,
        geofenceVerified: true,
        latitude: 11.8745,
        longitude: 75.3704,
        accuracyMeters: 8,
        distanceMeters: 0,
        geofencePolicyVersion: 1,
        cafeLatitude: 11.8745,
        cafeLongitude: 75.3704,
        allowedRadiusMeters: 100,
        deviceId: 'OPS-CONSOLE-01',
        serverTimestamp: new Date('2026-09-30T03:31:00Z'),
      },
      checkOut: null,
    },
    ...overrides,
  };
}

function jpegBytes(label) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from(String(label), 'utf8'),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function createPrivateFile(buffer, overrides = {}) {
  return {
    _id: 'PF-3001',
    fileId: 'FILE-3001',
    organisationId: 'ORG-ZAMORIN',
    uploadedByUserId: 'EMP-001',
    storagePath: 'ORG-ZAMORIN/CAFE-KNR-01/attendance_evidence/FILE-3001.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    attendanceContext: {
      proofSnapshotVersion: 1,
      challengeId: 'CH-3001',
      cafeId: 'CAFE-KNR-01',
      punchType: 'CHECK_IN',
      boundAt: new Date('2026-09-30T03:30:30Z'),
      grantIssuedAt: new Date('2026-09-30T03:30:00Z'),
      grantExpiresAt: new Date('2026-09-30T03:32:00Z'),
      deviceId: 'OPS-CONSOLE-01',
      proofPurpose: 'ATTENDANCE_PUNCH',
    },
    attendanceLink: {
      status: 'COMMITTED',
      attendanceId: 'AT-20260930-001',
      punchType: 'CHECK_IN',
    },
    attendanceCleanup: {
      status: null,
    },
    ...overrides,
  };
}

test('EVI-001: exact attendance/private-file/storage chain passes forensic verification', async () => {
  const originals = {
    findOne: PrivateFile.findOne,
    read: attendanceEvidenceStorageService.readObjectBuffer,
  };
  const bytes = jpegBytes('forensic-selfie-bytes-001');

  PrivateFile.findOne = async () => createPrivateFile(bytes);
  attendanceEvidenceStorageService.readObjectBuffer = async () => bytes;

  try {
    const result = await verifyAttendanceEvidenceSlot({
      organisationId: 'ORG-ZAMORIN',
      attendance: createAttendance(),
      punchType: 'CHECK_IN',
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.failedChecks.length, 0);
    assert.equal(result.storage.actualSizeBytes, bytes.length);
    assert.equal(
      result.storage.actualSha256,
      crypto.createHash('sha256').update(bytes).digest('hex')
    );
  } finally {
    PrivateFile.findOne = originals.findOne;
    attendanceEvidenceStorageService.readObjectBuffer = originals.read;
  }
});

test('EVI-002: tampered storage bytes fail SHA-256 and size integrity checks', async () => {
  const originals = {
    findOne: PrivateFile.findOne,
    read: attendanceEvidenceStorageService.readObjectBuffer,
  };
  const originalBytes = jpegBytes('original-evidence');
  const tamperedBytes = jpegBytes('tampered-evidence-with-different-length');

  PrivateFile.findOne = async () => createPrivateFile(originalBytes);
  attendanceEvidenceStorageService.readObjectBuffer = async () => tamperedBytes;

  try {
    const result = await verifyAttendanceEvidenceSlot({
      organisationId: 'ORG-ZAMORIN',
      attendance: createAttendance(),
      punchType: 'CHECK_IN',
    });

    assert.equal(result.status, 'FAIL');
    assert.ok(result.failedChecks.includes('storage_size_matches_metadata'));
    assert.ok(result.failedChecks.includes('storage_sha256_matches_metadata'));
  } finally {
    PrivateFile.findOne = originals.findOne;
    attendanceEvidenceStorageService.readObjectBuffer = originals.read;
  }
});

test('EVI-003: mismatched employee/cafe/challenge/link identity fails closed', async () => {
  const originals = {
    findOne: PrivateFile.findOne,
    read: attendanceEvidenceStorageService.readObjectBuffer,
  };
  const bytes = jpegBytes('identity-evidence');

  PrivateFile.findOne = async () => createPrivateFile(bytes, {
    uploadedByUserId: 'EMP-OTHER',
    attendanceContext: {
      challengeId: 'CH-OTHER',
      cafeId: 'CAFE-OTHER',
      punchType: 'CHECK_OUT',
    },
    attendanceLink: {
      status: 'COMMITTED',
      attendanceId: 'AT-OTHER',
      punchType: 'CHECK_OUT',
    },
  });
  attendanceEvidenceStorageService.readObjectBuffer = async () => bytes;

  try {
    const result = await verifyAttendanceEvidenceSlot({
      organisationId: 'ORG-ZAMORIN',
      attendance: createAttendance(),
      punchType: 'CHECK_IN',
    });

    assert.equal(result.status, 'FAIL');
    for (const expected of [
      'employee_binding',
      'cafe_binding',
      'punch_binding',
      'challenge_binding',
      'link_attendance_id',
      'link_punch_type',
    ]) {
      assert.ok(result.failedChecks.includes(expected), expected);
    }
  } finally {
    PrivateFile.findOne = originals.findOne;
    attendanceEvidenceStorageService.readObjectBuffer = originals.read;
  }
});



test('EVI-003A: durable QR proof snapshot fails on device, purpose, or temporal tampering', async () => {
  const originals = {
    findOne: PrivateFile.findOne,
    read: attendanceEvidenceStorageService.readObjectBuffer,
  };
  const bytes = jpegBytes('proof-snapshot-evidence');

  PrivateFile.findOne = async () => createPrivateFile(bytes, {
    attendanceContext: {
      challengeId: 'CH-3001',
      cafeId: 'CAFE-KNR-01',
      punchType: 'CHECK_IN',
      boundAt: new Date('2026-09-30T03:35:00Z'),
      grantIssuedAt: new Date('2026-09-30T03:36:00Z'),
      grantExpiresAt: new Date('2026-09-30T03:34:00Z'),
      deviceId: 'DIFFERENT-DEVICE',
      proofPurpose: null,
    },
  });
  attendanceEvidenceStorageService.readObjectBuffer = async () => bytes;

  try {
    const result = await verifyAttendanceEvidenceSlot({
      organisationId: 'ORG-ZAMORIN',
      attendance: createAttendance(),
      punchType: 'CHECK_IN',
    });

    assert.equal(result.status, 'FAIL');
    for (const expected of [
      'proof_purpose',
      'device_binding',
      'grant_temporal_order',
      'punch_after_evidence_binding',
    ]) {
      assert.ok(result.failedChecks.includes(expected), expected);
    }
  } finally {
    PrivateFile.findOne = originals.findOne;
    attendanceEvidenceStorageService.readObjectBuffer = originals.read;
  }
});



test('EVI-003B: legacy evidence can still be streamed without new proof snapshot fields', async () => {
  const originals = {
    findOne: PrivateFile.findOne,
    read: attendanceEvidenceStorageService.readObjectBuffer,
  };
  const bytes = jpegBytes('legacy-evidence');

  const legacyFile = createPrivateFile(bytes);
  delete legacyFile.attendanceContext.proofSnapshotVersion;
  delete legacyFile.attendanceContext.grantIssuedAt;
  delete legacyFile.attendanceContext.deviceId;
  delete legacyFile.attendanceContext.proofPurpose;

  PrivateFile.findOne = async () => legacyFile;
  attendanceEvidenceStorageService.readObjectBuffer = async () => bytes;

  try {
    const result = await verifyAttendanceEvidenceSlot({
      organisationId: 'ORG-ZAMORIN',
      attendance: createAttendance(),
      punchType: 'CHECK_IN',
      verifyStorageBytes: false,
      requireProofSnapshot: false,
    });

    assert.equal(result.status, 'PASS');
    assert.equal(
      result.checks.some((check) => check.name === 'proof_snapshot_version'),
      false
    );
  } finally {
    PrivateFile.findOne = originals.findOne;
    attendanceEvidenceStorageService.readObjectBuffer = originals.read;
  }
});



test('EVI-003C: geofence snapshot detects distance or radius tampering independently', async () => {
  const originals = {
    findOne: PrivateFile.findOne,
    read: attendanceEvidenceStorageService.readObjectBuffer,
  };
  const bytes = jpegBytes('geofence-forensic-evidence');

  PrivateFile.findOne = async () => createPrivateFile(bytes);
  attendanceEvidenceStorageService.readObjectBuffer = async () => bytes;

  const attendance = createAttendance();
  attendance.attendanceEvidence.checkIn.cafeLatitude = 11.8755;
  attendance.attendanceEvidence.checkIn.distanceMeters = 999;
  attendance.attendanceEvidence.checkIn.allowedRadiusMeters = 10;

  try {
    const result = await verifyAttendanceEvidenceSlot({
      organisationId: 'ORG-ZAMORIN',
      attendance,
      punchType: 'CHECK_IN',
    });

    assert.equal(result.status, 'FAIL');
    assert.ok(result.failedChecks.includes('geofence_distance_recomputed'));
    assert.ok(result.failedChecks.includes('geofence_within_snapshot_radius'));
  } finally {
    PrivateFile.findOne = originals.findOne;
    attendanceEvidenceStorageService.readObjectBuffer = originals.read;
  }
});



test('EVI-003D: forensic audit detects MIME metadata that disagrees with image bytes', async () => {
  const originals = {
    findOne: PrivateFile.findOne,
    read: attendanceEvidenceStorageService.readObjectBuffer,
  };
  const bytes = jpegBytes('mime-integrity-evidence');

  PrivateFile.findOne = async () => createPrivateFile(bytes, {
    mimeType: 'image/png',
  });
  attendanceEvidenceStorageService.readObjectBuffer = async () => bytes;

  try {
    const result = await verifyAttendanceEvidenceSlot({
      organisationId: 'ORG-ZAMORIN',
      attendance: createAttendance(),
      punchType: 'CHECK_IN',
    });

    assert.equal(result.status, 'FAIL');
    assert.ok(result.failedChecks.includes('storage_mime_matches_signature'));
  } finally {
    PrivateFile.findOne = originals.findOne;
    attendanceEvidenceStorageService.readObjectBuffer = originals.read;
  }
});



test('EVI-003E: media retrieval verifies MIME signature and disables content sniffing', () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '../src/modules/attendance/attendanceController.js'),
    'utf8'
  );

  assert.match(controllerSource, /ATTENDANCE_EVIDENCE_MIME_INTEGRITY_FAILURE/);
  assert.match(controllerSource, /setHeader\('Content-Type', detectedMime\)/);
  assert.match(controllerSource, /setHeader\('X-Content-Type-Options', 'nosniff'\)/);
});

test('EVI-004: audit filter is organisation scoped and optionally attendance/cafe scoped', () => {
  const filter = buildAuditAttendanceFilter({
    organisationId: 'org-zamorin',
    attendanceId: 'at-20260930-001',
    cafeId: 'cafe-knr-01',
  });

  assert.equal(filter.organisationId, 'ORG-ZAMORIN');
  assert.equal(filter.attendanceId, 'AT-20260930-001');
  assert.equal(filter.cafeId, 'CAFE-KNR-01');
  assert.ok(Array.isArray(filter.$or) && filter.$or.length >= 5);
});

test('EVI-005: batch audit reports pass/fail without returning image bytes', async () => {
  const originals = {
    attendanceFind: Attendance.find,
    privateFindOne: PrivateFile.findOne,
    read: attendanceEvidenceStorageService.readObjectBuffer,
  };
  const bytes = jpegBytes('batch-evidence');

  Attendance.find = () => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => [createAttendance()],
  });
  PrivateFile.findOne = async () => createPrivateFile(bytes);
  attendanceEvidenceStorageService.readObjectBuffer = async () => bytes;

  try {
    const result = await auditAttendanceEvidenceIntegrity({
      organisationId: 'ORG-ZAMORIN',
      batchSize: 10,
    });

    assert.equal(result.recordsScanned, 1);
    assert.equal(result.evidenceSlotsScanned, 1);
    assert.equal(result.passed, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.integrityOk, true);
    assert.equal(JSON.stringify(result).includes('batch-evidence'), false);
  } finally {
    Attendance.find = originals.attendanceFind;
    PrivateFile.findOne = originals.privateFindOne;
    attendanceEvidenceStorageService.readObjectBuffer = originals.read;
  }
});

test('EVI-006: forensic audit controller is Primary-Master only', async () => {
  const request = {
    auth: {
      organisationId: 'ORG-ZAMORIN',
      userId: 'MASTER-LEGACY',
      role: 'MASTER',
      isPrimaryMaster: false,
    },
    body: {},
  };

  await assert.rejects(
    async () => new Promise((resolve, reject) => {
      auditAttendanceEvidence(request, {}, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }),
    { statusCode: 403, code: 'PRIMARY_MASTER_AUTHORITY_REQUIRED' }
  );
});

test('EVI-007: Primary Master UI and router expose the read-only forensic audit path', () => {
  const root = path.join(__dirname, '../..');
  const frontend = fs.readFileSync(
    path.join(root, 'frontend/src/js/modules/attendance/attendanceShifts.js'),
    'utf8'
  );
  const routes = fs.readFileSync(
    path.join(__dirname, '../src/modules/attendance/attendanceRoutes.js'),
    'utf8'
  );

  assert.match(frontend, /run-evidence-integrity-audit-btn/);
  assert.match(frontend, /\/attendance\/evidence\/integrity\/audit/);
  assert.match(routes, /router\.post\('\/evidence\/integrity\/audit', auditAttendanceEvidence\)/);
});

test('EVI-008: evidence viewer surfaces server integrity failures instead of generic broken-image errors', () => {
  const root = path.join(__dirname, '../..');
  const viewer = fs.readFileSync(
    path.join(root, 'frontend/src/js/modules/attendance/attendanceEvidenceViewer.js'),
    'utf8'
  );

  assert.match(viewer, /code\.startsWith\('ATTENDANCE_EVIDENCE_'\)/);
  assert.match(viewer, /failed its integrity verification and cannot be displayed/i);
});

test('EVI-009: Café Operations kiosk and Primary Master use canonical attendance QR flows', () => {
  const root = path.join(__dirname, '../..');
  const kiosk = fs.readFileSync(
    path.join(root, 'frontend/cafe-operations/js/screens/attendanceKiosk.js'),
    'utf8'
  );
  const cafeOpsApi = fs.readFileSync(
    path.join(root, 'frontend/cafe-operations/js/api/cafeOpsApi.js'),
    'utf8'
  );
  const deviceRoutes = fs.readFileSync(
    path.join(__dirname, '../src/cafe-operations/routes/deviceEnrollmentRoutes.js'),
    'utf8'
  );
  const masterAttendance = fs.readFileSync(
    path.join(root, 'frontend/src/js/modules/attendance/attendanceShifts.js'),
    'utf8'
  );

  assert.match(cafeOpsApi, /attendanceQr:\s*\(\)\s*=>\s*apiRequest\('\/devices\/attendance\/qr'/);
  assert.match(kiosk, /body\.attendanceUrl/);
  assert.match(kiosk, /QRCode\.toDataURL\(body\.attendanceUrl/);
  assert.match(deviceRoutes, /router\.get\('\/attendance\/qr',\s*deviceContext/);
  assert.match(deviceRoutes, /requestedByRole:\s*'CAFE_ADMIN'/);
  assert.match(deviceRoutes, /assignedCafeIds:\s*\[device\.cafeId\]/);
  assert.match(masterAttendance, /\/attendance\/qr\/active\?cafeId=/);
  assert.match(masterAttendance, /res\.data\.attendanceUrl\s*\|\|\s*res\.data\.opaqueToken\s*\|\|\s*res\.data\.qrToken/);
});

test('EVI-010: employee QR deep-link drives QR + GPS + fresh selfie for both Check-In and Check-Out', () => {
  const root = path.join(__dirname, '../..');
  const staff = fs.readFileSync(
    path.join(root, 'frontend/src/js/modules/attendance/staffAttendance.js'),
    'utf8'
  );
  const main = fs.readFileSync(
    path.join(root, 'frontend/src/js/main.js'),
    'utf8'
  );

  assert.match(main, /zamorin\.pendingAttendanceQr/);
  assert.match(main, /returnTo/);
  assert.match(main, /staff-attendance/);
  assert.match(staff, /preScannedQrToken/);
  assert.match(staff, /apiPost\("\/attendance\/qr\/verify"/);
  assert.match(staff, /scannedQrToken\s*=\s*res\.data\.scanGrant/);
  assert.match(staff, /getCurrentPosition\(\{\s*highAccuracy:\s*true/);
  assert.match(staff, /apiPost\("\/attendance\/geofence\/verify"/);
  assert.match(staff, /openCamera\(videoEl,\s*"user"\)/);
  assert.match(staff, /captureFrameAsBlob/);
  assert.match(staff, /apiUpload\("\/attendance\/evidence\/upload"/);
  assert.match(staff, /formData\.append\("punchType",\s*flowType\)/);
  assert.match(staff, /formData\.append\("scanGrant",\s*scannedQrToken\)/);
  assert.match(staff, /isCheckIn\s*\?\s*"\/attendance\/check-in"\s*:\s*"\/attendance\/check-out"/);
  assert.match(staff, /qrToken:\s*scannedQrToken/);
  assert.match(staff, /latitude:\s*geoCoords\.latitude/);
  assert.match(staff, /longitude:\s*geoCoords\.longitude/);
  assert.match(staff, /accuracyMeters:\s*geoCoords\.accuracyMeters/);
  assert.match(staff, /selfieFileId/);
  assert.match(staff, /"📷 IN"/);
  assert.match(staff, /"📷 OUT"/);
});

test('EVI-011: evidence integrity failures are quarantined and security-alerted without image bytes', async () => {
  const originals = {
    findOne: Attendance.findOne,
    updateOne: Attendance.updateOne,
    publishNotification: notificationService.publishNotification,
  };

  const attendance = createAttendance({
    _id: 'ATT-DOC-901',
    attendanceId: 'AT-20260930-901',
    userId: 'EMP-901',
    cafeId: 'CAFE-KNR-01',
    attendanceEvidence: {
      checkIn: {
        selfieMediaId: 'FILE-901',
        photoFileId: 'FILE-901',
        verificationStatus: 'VERIFIED',
      },
      checkOut: null,
    },
    selfieFileId: 'FILE-901',
  });

  Attendance.findOne = () => ({
    lean: async () => attendance,
  });

  const updates = [];
  Attendance.updateOne = async (filter, update) => {
    updates.push({ filter, update });
    return { matchedCount: 1, modifiedCount: 1 };
  };

  const alerts = [];
  notificationService.publishNotification = async (payload) => {
    alerts.push(payload);
    return { success: true, recipientCount: 1, outboxQueued: 1, inAppDelivered: 1 };
  };

  const request = {
    auth: {
      organisationId: 'ORG-ZAMORIN',
      userId: 'MU-PRIMARY-01',
      role: 'MASTER',
      isPrimaryMaster: true,
    },
    correlationId: 'CORR-EVI-901',
    method: 'POST',
    originalUrl: '/api/v1/attendance/evidence/integrity/audit',
    get: () => null,
  };

  try {
    const result = await quarantineAttendanceEvidenceFailures({
      request,
      failures: [{
        attendanceId: 'AT-20260930-901',
        punchType: 'CHECK_IN',
        fileId: 'FILE-901',
        failedChecks: ['storage_sha256_matches_metadata', 'employee_binding'],
      }],
    });

    assert.equal(result.attempted, 1);
    assert.equal(result.quarantined, 1);
    assert.equal(result.auditEventsRecorded, 1);
    assert.equal(result.alertsQueued, 1);

    const quarantineUpdate = updates.find(
      (entry) => entry.update?.$set?.['attendanceEvidence.checkIn.integrityState'] === 'QUARANTINED'
    );
    assert.ok(quarantineUpdate);
    assert.equal(
      quarantineUpdate.update.$set['attendanceEvidence.checkIn.verificationStatus'],
      'FLAGGED'
    );
    assert.deepEqual(
      quarantineUpdate.update.$set['attendanceEvidence.checkIn.integrityFailedChecks'],
      ['storage_sha256_matches_metadata', 'employee_binding']
    );

    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].includePrimaryMaster, true);
    assert.equal(alerts[0].templateId, 'SECURITY_ALERT');
    assert.equal(alerts[0].sourceModule, 'ATTENDANCE');
    assert.equal(alerts[0].acknowledgementRequired, true);
    assert.equal(JSON.stringify(alerts[0]).includes('forensic-selfie-bytes'), false);
  } finally {
    Attendance.findOne = originals.findOne;
    Attendance.updateOne = originals.updateOne;
    notificationService.publishNotification = originals.publishNotification;
  }
});

test('EVI-012: integrity failure classification and alert key are deterministic', () => {
  assert.equal(
    classifyIntegrityFailure(['storage_sha256_matches_metadata']),
    'CRITICAL'
  );
  assert.equal(
    classifyIntegrityFailure(['geofence_distance_recomputed']),
    'HIGH'
  );

  const input = {
    attendanceId: 'AT-20260930-901',
    punchType: 'CHECK_IN',
    fileId: 'FILE-901',
    failedChecks: ['employee_binding', 'storage_sha256_matches_metadata'],
  };
  assert.equal(buildSecurityAlertKey(input), buildSecurityAlertKey(input));
  assert.match(buildSecurityAlertKey(input), /^ATTENDANCE_EVIDENCE_INTEGRITY_[a-f0-9]{24}$/);
});

test('EVI-013: audit-event model remains insert-only across query, document, and bulk mutation paths', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/models/AuditEvent.js'),
    'utf8'
  );

  for (const operation of [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ]) {
    assert.ok(source.includes(`'${operation}'`), `AuditEvent must block ${operation}`);
  }

  assert.match(source, /Block document-instance deleteOne/);
  assert.match(source, /Block save\(\) on modified \(existing\) documents/);
  assert.match(source, /Block bulkWrite mutations/);
});

test('EVI-014: evidence media endpoint refuses quarantined evidence before byte streaming', () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '../src/modules/attendance/attendanceController.js'),
    'utf8'
  );

  const quarantineCheck = controllerSource.indexOf('ATTENDANCE_EVIDENCE_QUARANTINED');
  const byteRead = controllerSource.indexOf(
    'attendanceEvidenceStorageService.readObjectBuffer',
    quarantineCheck
  );

  assert.ok(quarantineCheck >= 0);
  assert.ok(byteRead > quarantineCheck);
  assert.match(controllerSource, /integrityState \|\| ''\)\.toUpperCase\(\) === 'QUARANTINED'/);
});

test('EVI-015: Primary Master integrity panel surfaces quarantine, audit-event, and security-alert counts', () => {
  const frontend = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/js/modules/attendance/attendanceShifts.js'),
    'utf8'
  );

  assert.match(frontend, /integrityQuarantined/);
  assert.match(frontend, /integrityAuditEvents/);
  assert.match(frontend, /integrityAlertsQueued/);
  assert.match(frontend, />Quarantined</);
  assert.match(frontend, />Audit Events</);
  assert.match(frontend, />Security Alerts</);
  assert.match(frontend, /Primary Master security alert\(s\) queued/);
});

test('EVI-016: quarantine incident payload never includes evidence image bytes or reusable QR credentials', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/services/attendanceEvidenceIncidentService.js'),
    'utf8'
  );

  assert.equal(source.includes('readObjectBuffer'), false);
  assert.equal(source.includes('qrToken'), false);
  assert.equal(source.includes('scanGrant'), false);
  assert.match(source, /failedChecks/);
  assert.match(source, /correlationId/);
  assert.match(source, /includePrimaryMaster:\s*true/);
});

test('EVI-017: historical evidence without new snapshots is reported as legacy, not corrupted', async () => {
  const originals = {
    attendanceFind: Attendance.find,
    privateFindOne: PrivateFile.findOne,
  };
  const bytes = jpegBytes('legacy-audit-evidence');
  const attendance = createAttendance();
  delete attendance.attendanceEvidence.checkIn.geofencePolicyVersion;
  delete attendance.attendanceEvidence.checkIn.cafeLatitude;
  delete attendance.attendanceEvidence.checkIn.cafeLongitude;
  delete attendance.attendanceEvidence.checkIn.allowedRadiusMeters;

  const legacyFile = createPrivateFile(bytes);
  delete legacyFile.attendanceContext.proofSnapshotVersion;
  delete legacyFile.attendanceContext.grantIssuedAt;
  delete legacyFile.attendanceContext.deviceId;
  delete legacyFile.attendanceContext.proofPurpose;

  Attendance.find = () => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => [attendance],
  });
  PrivateFile.findOne = async () => legacyFile;

  try {
    const result = await auditAttendanceEvidenceIntegrity({
      organisationId: 'ORG-ZAMORIN',
      verifyStorageBytes: false,
    });

    assert.equal(result.failed, 0);
    assert.equal(result.passed, 1);
    assert.equal(result.integrityOk, true);
    assert.equal(result.legacyProofSnapshots, 1);
    assert.equal(result.legacyGeofenceSnapshots, 1);
  } finally {
    Attendance.find = originals.attendanceFind;
    PrivateFile.findOne = originals.privateFindOne;
  }
});

test('EVI-018: Primary Master UI states that legacy evidence is not quarantined solely for age', () => {
  const frontend = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/js/modules/attendance/attendanceShifts.js'),
    'utf8'
  );

  assert.match(frontend, /Legacy coverage:/);
  assert.match(frontend, /not quarantined solely for age/);
  assert.match(frontend, /legacyProofSnapshots/);
  assert.match(frontend, /legacyGeofenceSnapshots/);
});


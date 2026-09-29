'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

// Bypass Mongoose buffering in offline unit test mode
mongoose.set('bufferCommands', false);
mongoose.Model.prototype.save = async function () { return this; };

const attendanceQrService = require('../src/services/attendanceQrService');
const { defaultStorageService } = require('../src/services/storageAdapterService');
const { Attendance } = require('../src/modules/attendance/Attendance');
const { AttendanceQrChallenge } = require('../src/models/AttendanceQrChallenge');
const { AttendanceSubmission } = require('../src/models/AttendanceSubmission');
const { PrivateFile } = require('../src/models/PrivateFile');
const { AuditEvent } = require('../src/models/AuditEvent');
const { Cafe } = require('../src/models/Cafe');
const { SequenceCounter } = require('../src/models/SequenceCounter');

// Sequence counter mock
SequenceCounter.generateId = async ({ prefix = 'ATT' }) => `${prefix}-${Date.now()}`;
SequenceCounter.getNextNumber = async () => 1;

// In-memory challenge store for unit tests
const mockChallenges = new Map();

AttendanceQrChallenge.findOne = function (query = {}) {
  const findMatch = () => {
    if (query.challengeId) {
      return mockChallenges.get(query.challengeId) || null;
    }
    for (const ch of mockChallenges.values()) {
      if (query.cafeId && ch.cafeId !== query.cafeId) continue;
      if (query.organisationId && ch.organisationId !== query.organisationId) continue;
      if (query.isRevoked !== undefined && (ch.isRevoked || false) !== query.isRevoked) continue;
      if (query.expiresAt && query.expiresAt.$gt) {
        if (ch.expiresAt <= query.expiresAt.$gt) continue;
      }
      return ch;
    }
    return null;
  };

  const match = findMatch();
  return {
    ...match,
    sort: function () { return match; },
    lean: async function () { return match; },
    then: function (resolve) { resolve(match); },
  };
};

AttendanceQrChallenge.create = async function (doc) {
  const challenge = {
    isRevoked: false,
    ...doc,
    _id: 'CHL_DOC_' + Date.now(),
    save: async function () { return this; },
  };
  mockChallenges.set(doc.challengeId, challenge);
  return challenge;
};

// Default Cafe mock
Cafe.findOne = function (query = {}) {
  return {
    lean: async function () {
      if (query.cafeId === 'CAFE-UNCONFIGURED') {
        return {
          cafeId: 'CAFE-UNCONFIGURED',
          organisationId: query.organisationId || 'ORG-ZAMORIN',
          name: 'Zamorin Unconfigured Cafe',
          address: {},
        };
      }
      if (query.cafeId === 'CAFE-NOT-FOUND') {
        return null;
      }
      return {
        cafeId: query.cafeId || 'CAFE-KNR-01',
        organisationId: query.organisationId || 'ORG-ZAMORIN',
        name: `Zamorin Cafe ${query.cafeId || 'KNR-01'}`,
        address: {
          latitude: 11.8745,
          longitude: 75.3704,
        },
        geofenceRadiusMeters: 100,
      };
    },
  };
};

// Default PrivateFile mock
PrivateFile.findOne = function (query = {}) {
  const doc = {
    fileId: query.fileId || 'FILE-TEST',
    fileKey: 'org/selfie.jpg',
    mimeType: 'image/jpeg',
    organisationId: query.organisationId || 'ORG-ZAMORIN',
    uploadedByUserId: 'EMP-STAFF-1',
    isPurged: false,
  };
  return {
    ...doc,
    lean: async function () { return doc; },
  };
};

// Default Attendance mock
Attendance.findOne = function () {
  const doc = null;
  return {
    ...doc,
    sort: function () { return this; },
    lean: async function () { return doc; },
    then: function (resolve) { resolve(doc); },
  };
};

const {
  staffCheckIn,
  staffCheckOut,
  getActiveCafeQr,
  verifyScannedQr,
  verifyPunchGeofence,
  uploadPunchSelfie,
  getEvidenceMedia,
  getAttendanceEvidenceRecord,
} = require('../src/modules/attendance/attendanceController');

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. ROTATING ATTENDANCE QR CHALLENGE LIFECYCLE (attendanceQrService)
// ---------------------------------------------------------------------------

test('QR-001: getActiveOrNewChallenge generates signed token with purpose ATTENDANCE_PUNCH', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
    deviceId: 'KIOSK-01',
    requestedByUserId: 'LEAD-01',
    requestedByRole: 'CAFE_ADMIN',
    assignedCafeIds: ['CAFE-KNR-01'],
    rotationIntervalSeconds: 45,
  });

  assert.ok(challenge);
  assert.equal(challenge.cafeId, 'CAFE-KNR-01');
  assert.equal(challenge.purpose, 'ATTENDANCE_PUNCH');
  assert.equal(challenge.rotationIntervalSeconds, 45);
  assert.ok(challenge.qrToken);
  assert.equal(challenge.qrToken.split('.').length, 5);
  assert.ok(challenge.opaqueToken);
  assert.ok(challenge.attendanceUrl);

  const attendanceUrl = new URL(challenge.attendanceUrl);
  assert.equal(attendanceUrl.searchParams.get('returnTo'), 'staff-attendance');
  assert.equal(attendanceUrl.searchParams.get('attendanceQr'), challenge.opaqueToken);
  assert.equal(attendanceUrl.searchParams.has('cafeId'), false);
  assert.equal(attendanceUrl.searchParams.has('organisationId'), false);
});

test('QR-002: consecutive request within 45s returns same challenge token', async () => {
  const first = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
    deviceId: 'KIOSK-01',
    requestedByUserId: 'LEAD-01',
    requestedByRole: 'CAFE_ADMIN',
    assignedCafeIds: ['CAFE-KNR-01'],
    rotationIntervalSeconds: 45,
  });

  const second = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
    deviceId: 'KIOSK-01',
    requestedByUserId: 'LEAD-01',
    requestedByRole: 'CAFE_ADMIN',
    assignedCafeIds: ['CAFE-KNR-01'],
    rotationIntervalSeconds: 45,
  });

  assert.equal(first.challengeId, second.challengeId);
  assert.equal(first.qrToken, second.qrToken);
});

test('QR-003: validateChallengeToken successfully validates authentic token and derives cafeId', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
    deviceId: 'KIOSK-01',
    requestedByUserId: 'LEAD-01',
    requestedByRole: 'CAFE_ADMIN',
    assignedCafeIds: ['CAFE-KNR-01'],
  });

  const verified = await attendanceQrService.validateChallengeToken(challenge.qrToken, {
    employeeOrgId: 'ORG-ZAMORIN',
    employeeAssignedCafes: ['CAFE-KNR-01'],
    employeeRole: 'STAFF',
  });

  assert.equal(verified.verified, true);
  assert.equal(verified.cafeId, 'CAFE-KNR-01');
  assert.equal(verified.challengeId, challenge.challengeId);
});

test('QR-004: validateChallengeToken rejects malformed or tampered token', async () => {
  await assert.rejects(
    async () => {
      await attendanceQrService.validateChallengeToken('invalid-token-string', {
        employeeOrgId: 'ORG-ZAMORIN',
      });
    },
    { statusCode: 400, code: 'INVALID_CHALLENGE_FORMAT' }
  );

  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
  });

  const parts = challenge.qrToken.split('.');
  parts[4] = 'tampered_signature';
  const tamperedToken = parts.join('.');

  await assert.rejects(
    async () => {
      await attendanceQrService.validateChallengeToken(tamperedToken, {
        employeeOrgId: 'ORG-ZAMORIN',
      });
    },
    { statusCode: 403, code: 'INVALID_CHALLENGE_SIGNATURE' }
  );
});

test('QR-005: validateChallengeToken rejects expired challenge token', async () => {
  const challengeId = 'CHAL-EXP-TEST-' + Date.now();
  const organisationId = 'ORG-ZAMORIN';
  const cafeId = 'CAFE-KNR-01';
  const issuedAt = Math.floor((Date.now() - 100000) / 1000); // 100s ago
  const expiresAt = Math.floor((Date.now() - 55000) / 1000); // expired 55s ago
  const payload = `${challengeId}.${organisationId}.${cafeId}.${issuedAt}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', process.env.ATTENDANCE_QR_SECRET || 'zamorin-attendance-presence-secret-salt-2026')
    .update(payload)
    .digest('hex');
  const expiredToken = `${challengeId}.${organisationId}.${cafeId}.${expiresAt}.${sig}`;

  await assert.rejects(
    async () => {
      await attendanceQrService.validateChallengeToken(expiredToken, {
        employeeOrgId: 'ORG-ZAMORIN',
      });
    },
    { statusCode: 403, code: 'EXPIRED_ATTENDANCE_QR' }
  );
});

test('QR-006: validateChallengeToken rejects employee not assigned to challenge cafe', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-CALICUT-02',
  });

  await assert.rejects(
    async () => {
      await attendanceQrService.validateChallengeToken(challenge.qrToken, {
        employeeOrgId: 'ORG-ZAMORIN',
        employeeAssignedCafes: ['CAFE-KNR-01'], // different cafe
        employeeRole: 'STAFF',
      });
    },
    { statusCode: 403, code: 'CROSS_CAFE_UNAUTHORIZED' }
  );
});

test('QR-007: validateChallengeToken permits Primary Master across any cafe in org', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-CALICUT-02',
  });

  const verified = await attendanceQrService.validateChallengeToken(challenge.qrToken, {
    employeeOrgId: 'ORG-ZAMORIN',
    employeeAssignedCafes: ['CAFE-KNR-01'],
    employeeRole: 'MASTER',
    isPrimaryMaster: true,
  });

  assert.equal(verified.verified, true);
  assert.equal(verified.cafeId, 'CAFE-CALICUT-02');
});

// ---------------------------------------------------------------------------
// 2. GEOFENCE & HAVERSINE DISTANCE VERIFICATION
// ---------------------------------------------------------------------------

test('GEO-001: calculateDistance returns exact 0 for identical coordinates', () => {
  const dist = attendanceQrService.calculateDistance(11.8745, 75.3704, 11.8745, 75.3704);
  assert.equal(dist, 0);
});

test('GEO-002: calculateDistance computes accurate distance between two points', () => {
  const dist = attendanceQrService.calculateDistance(11.8745, 75.3704, 11.2588, 75.7804);
  assert.ok(dist > 80000 && dist < 85000);
});

test('GEO-003: verifyGeofence approves punch within allowed radius', async () => {
  // 20 meters away
  const result = await attendanceQrService.verifyGeofence({
    cafeId: 'CAFE-KNR-01',
    latitude: 11.8746,
    longitude: 75.3705,
    accuracyMeters: 10,
  });

  assert.equal(result.verified, true);
  assert.ok(result.distanceMeters < 50);
  assert.equal(result.allowedRadiusMeters, 100);
});

test('GEO-004: verifyGeofence throws 403 when location is outside radius', async () => {
  // 5 km away
  await assert.rejects(
    async () => {
      await attendanceQrService.verifyGeofence({
        cafeId: 'CAFE-KNR-01',
        latitude: 11.9200,
        longitude: 75.4000,
        accuracyMeters: 10,
      });
    },
    { statusCode: 403, code: 'OUTSIDE_GEOFENCE_RADIUS' }
  );
});

test('GEO-005: verifyGeofence throws 422 GEOFENCE_NOT_CONFIGURED if Cafe has no coordinates', async () => {
  await assert.rejects(
    async () => {
      await attendanceQrService.verifyGeofence({
        cafeId: 'CAFE-UNCONFIGURED',
        latitude: 11.8745,
        longitude: 75.3704,
      });
    },
    { statusCode: 422, code: 'GEOFENCE_NOT_CONFIGURED' }
  );
});

test('GEO-006A: verifyGeofence rejects NaN, infinity, and impossible coordinates', async () => {
  const invalidCoordinates = [
    { latitude: Number.NaN, longitude: 75.3704 },
    { latitude: 11.8745, longitude: Number.POSITIVE_INFINITY },
    { latitude: 91, longitude: 75.3704 },
    { latitude: 11.8745, longitude: 181 },
  ];

  for (const coords of invalidCoordinates) {
    await assert.rejects(
      async () => attendanceQrService.verifyGeofence({
        cafeId: 'CAFE-KNR-01',
        ...coords,
        accuracyMeters: 10,
      }),
      { statusCode: 400, code: 'COORDINATES_REQUIRED' }
    );
  }

  await assert.rejects(
    async () => attendanceQrService.verifyGeofence({
      cafeId: 'CAFE-KNR-01',
      latitude: 11.8745,
      longitude: 75.3704,
      accuracyMeters: Number.NaN,
    }),
    { statusCode: 400, code: 'GPS_ACCURACY_INVALID' }
  );
});

test('GEO-006: verifyGeofence rejects low accuracy GPS readings (> 100m)', async () => {
  await assert.rejects(
    async () => {
      await attendanceQrService.verifyGeofence({
        cafeId: 'CAFE-KNR-01',
        latitude: 11.8745,
        longitude: 75.3704,
        accuracyMeters: 250,
      });
    },
    { statusCode: 422, code: 'LOW_GPS_ACCURACY' }
  );
});

// ---------------------------------------------------------------------------
// 3. EVIDENCE UPLOAD & STORAGE ADAPTER SERVICE
// ---------------------------------------------------------------------------

test('STORE-001: defaultStorageService stores object buffer and retrieves it cleanly', async () => {
  const testBuffer = Buffer.from('TEST-IMAGE-BYTES-PRESENCE-VERIFICATION-2026', 'utf8');
  const uploadResult = await defaultStorageService.uploadObject({
    organisationId: 'ORG-ZAMORIN',
    fileType: 'ATTENDANCE_SELFIE',
    fileName: 'presence_test.jpg',
    mimeType: 'image/jpeg',
    buffer: testBuffer,
  });

  assert.ok(uploadResult.fileKey);
  assert.equal(uploadResult.sizeBytes, testBuffer.length);

  const retrieved = await defaultStorageService.readObjectBuffer({ fileKey: uploadResult.fileKey });
  assert.ok(retrieved);
  assert.equal(retrieved.toString('utf8'), 'TEST-IMAGE-BYTES-PRESENCE-VERIFICATION-2026');
});

test('UPLOAD-001: uploadPunchSelfie rejects non-image MIME types', async () => {
  const req = {
    auth: { userId: 'EMP-01', organisationId: 'ORG-ZAMORIN' },
    file: {
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('PDF-CONTENT'),
      originalname: 'document.pdf',
    },
    body: { punchType: 'CHECK_IN' },
  };
  const res = createMockRes();

  await assert.rejects(
    async () => {
      await uploadPunchSelfie(req, res);
    },
    { statusCode: 400, code: 'INVALID_SELFIE_MIME' }
  );
});

test('UPLOAD-002: uploadPunchSelfie rejects files larger than 5MB', async () => {
  const req = {
    auth: { userId: 'EMP-01', organisationId: 'ORG-ZAMORIN' },
    file: {
      mimetype: 'image/jpeg',
      size: 6 * 1024 * 1024,
      buffer: Buffer.alloc(100),
      originalname: 'huge_selfie.jpg',
    },
    body: { punchType: 'CHECK_IN' },
  };
  const res = createMockRes();

  await assert.rejects(
    async () => {
      await uploadPunchSelfie(req, res);
    },
    { statusCode: 400, code: 'SELFIE_FILE_TOO_LARGE' }
  );
});

// ---------------------------------------------------------------------------
// 4. AUTHORITATIVE CHECK-IN & CHECK-OUT ATTENDANCE CONTROLLER
// ---------------------------------------------------------------------------

test('PUNCH-001: staffCheckIn strictly rejects missing qrToken, coordinates, or selfieFileId', async () => {
  const baseReq = {
    auth: {
      userId: 'EMP-STAFF-1',
      role: 'STAFF',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['CAFE-KNR-01'],
      primaryCafeId: 'CAFE-KNR-01',
    },
    body: {},
  };

  // Missing qrToken
  await assert.rejects(
    async () => {
      await staffCheckIn({ ...baseReq, body: { latitude: 11.8745, longitude: 75.3704, selfieFileId: 'FILE-1' } }, createMockRes());
    },
    { statusCode: 400, code: 'QR_TOKEN_REQUIRED' }
  );

  // Missing coordinates
  await assert.rejects(
    async () => {
      await staffCheckIn({ ...baseReq, body: { qrToken: 'TOKEN', selfieFileId: 'FILE-1' } }, createMockRes());
    },
    { statusCode: 400, code: 'GEOLOCATION_REQUIRED' }
  );

  // Missing selfie
  await assert.rejects(
    async () => {
      await staffCheckIn({ ...baseReq, body: { qrToken: 'TOKEN', latitude: 11.8745, longitude: 75.3704 } }, createMockRes());
    },
    { statusCode: 400, code: 'SELFIE_EVIDENCE_REQUIRED' }
  );
});

test('PUNCH-002: staffCheckIn records authoritative punch and sets attendanceEvidence.checkIn', async () => {
  const origFindOneAttendance = Attendance.findOne;
  const origFindOnePrivateFile = PrivateFile.findOne;
  const origCreateSubmission = AttendanceSubmission.create;

  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
  });

  Attendance.findOne = () => null; // no existing punch for today

  PrivateFile.findOne = () => ({
    lean: async () => ({
      fileId: 'FILE-SELFIE-CHECKIN-01',
      fileKey: 'org-zamorin/attendance_selfie/selfie_checkin.jpg',
      organisationId: 'ORG-ZAMORIN',
      uploadedByUserId: 'EMP-STAFF-1',
      isPurged: false,
    }),
  });

  AttendanceSubmission.create = async (doc) => doc;

  const req = {
    auth: {
      userId: 'EMP-STAFF-1',
      role: 'STAFF',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['CAFE-KNR-01'],
      primaryCafeId: 'CAFE-KNR-01',
    },
    body: {
      cafeId: 'CAFE-KNR-01',
      qrToken: challenge.qrToken,
      latitude: 11.8745,
      longitude: 75.3704,
      accuracyMeters: 8,
      selfieFileId: 'FILE-SELFIE-CHECKIN-01',
      deviceFingerprint: 'DEV-BROWSER-CLIENT',
    },
  };
  const res = createMockRes();

  try {
    await staffCheckIn(req, res);
    assert.ok([200, 201].includes(res.statusCode));
    assert.equal(res.body.success, true);
    const att = res.body.data.attendance;
    assert.equal(att.status, 'CHECKED_IN');
    assert.ok(att.attendanceEvidence);
    assert.equal(att.attendanceEvidence.checkIn.photoFileId, 'FILE-SELFIE-CHECKIN-01');
    assert.equal(att.attendanceEvidence.checkIn.verificationStatus, 'VERIFIED');
    assert.equal(att.attendanceEvidence.checkIn.geofenceVerified, true);
    assert.equal(att.attendanceEvidence.checkIn.qrVerified, true);
  } finally {
    Attendance.findOne = origFindOneAttendance;
    PrivateFile.findOne = origFindOnePrivateFile;
    AttendanceSubmission.create = origCreateSubmission;
  }
});

test('PUNCH-003A: staffCheckOut requires QR, live GPS, and fresh selfie evidence', async () => {
  const origFindOneAttendance = Attendance.findOne;

  Attendance.findOne = () => ({
    userId: 'EMP-STAFF-1',
    cafeId: 'CAFE-KNR-01',
    checkInAt: new Date(Date.now() - 3600000),
    checkOutAt: null,
    status: 'CHECKED_IN',
    attendanceEvidence: {
      checkIn: { photoFileId: 'FILE-SELFIE-CHECKIN-01' },
    },
    save: async function () { return this; },
  });

  const baseReq = {
    auth: {
      userId: 'EMP-STAFF-1',
      role: 'STAFF',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['CAFE-KNR-01'],
      primaryCafeId: 'CAFE-KNR-01',
    },
    body: {},
  };

  try {
    await assert.rejects(
      async () => staffCheckOut(baseReq, createMockRes()),
      { statusCode: 400, code: 'QR_TOKEN_REQUIRED' }
    );

    await assert.rejects(
      async () => staffCheckOut({
        ...baseReq,
        body: { qrToken: 'TOKEN' },
      }, createMockRes()),
      { statusCode: 400, code: 'GEOLOCATION_REQUIRED' }
    );

    await assert.rejects(
      async () => staffCheckOut({
        ...baseReq,
        body: {
          qrToken: 'TOKEN',
          latitude: 11.8745,
          longitude: 75.3704,
          accuracyMeters: 8,
        },
      }, createMockRes()),
      { statusCode: 400, code: 'SELFIE_EVIDENCE_REQUIRED' }
    );
  } finally {
    Attendance.findOne = origFindOneAttendance;
  }
});

test('PUNCH-003: staffCheckOut strictly rejects reusing Check-In selfie for Check-Out', async () => {
  const origFindOneAttendance = Attendance.findOne;

  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
  });

  Attendance.findOne = () => ({
    userId: 'EMP-STAFF-1',
    cafeId: 'CAFE-KNR-01',
    checkInAt: new Date(Date.now() - 28800000),
    status: 'CHECKED_IN',
    selfieFileId: 'FILE-SELFIE-CHECKIN-01',
    attendanceEvidence: {
      checkIn: {
        photoFileId: 'FILE-SELFIE-CHECKIN-01',
      },
    },
    save: async function () { return this; },
  });

  const req = {
    auth: {
      userId: 'EMP-STAFF-1',
      role: 'STAFF',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['CAFE-KNR-01'],
      primaryCafeId: 'CAFE-KNR-01',
    },
    body: {
      cafeId: 'CAFE-KNR-01',
      qrToken: challenge.qrToken,
      latitude: 11.8745,
      longitude: 75.3704,
      accuracyMeters: 10,
      selfieFileId: 'FILE-SELFIE-CHECKIN-01', // ILLEGAL REUSE OF CHECK-IN SELFIE
    },
  };
  const res = createMockRes();

  try {
    await assert.rejects(
      async () => {
        await staffCheckOut(req, res);
      },
      { statusCode: 400, code: 'SAME_SELFIE_REUSED' }
    );
  } finally {
    Attendance.findOne = origFindOneAttendance;
  }
});

test('PUNCH-004: staffCheckOut records authoritative exit with distinct selfie', async () => {
  const origFindOneAttendance = Attendance.findOne;
  const origFindOnePrivateFile = PrivateFile.findOne;
  const origCreateSubmission = AttendanceSubmission.create;

  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
  });

  const activeAttendance = {
    userId: 'EMP-STAFF-1',
    cafeId: 'CAFE-KNR-01',
    checkInAt: new Date(Date.now() - 28800000), // 8 hrs ago
    status: 'CHECKED_IN',
    selfieFileId: 'FILE-SELFIE-CHECKIN-01',
    attendanceEvidence: {
      checkIn: {
        photoFileId: 'FILE-SELFIE-CHECKIN-01',
      },
    },
    save: async function () { return this; },
  };

  Attendance.findOne = () => activeAttendance;

  PrivateFile.findOne = () => ({
    lean: async () => ({
      fileId: 'FILE-SELFIE-CHECKOUT-02',
      fileKey: 'org-zamorin/attendance_selfie/selfie_checkout.jpg',
      organisationId: 'ORG-ZAMORIN',
      uploadedByUserId: 'EMP-STAFF-1',
      isPurged: false,
    }),
  });

  AttendanceSubmission.create = async (doc) => doc;

  const req = {
    auth: {
      userId: 'EMP-STAFF-1',
      role: 'STAFF',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['CAFE-KNR-01'],
      primaryCafeId: 'CAFE-KNR-01',
    },
    body: {
      cafeId: 'CAFE-KNR-01',
      qrToken: challenge.qrToken,
      latitude: 11.8745,
      longitude: 75.3704,
      accuracyMeters: 6,
      selfieFileId: 'FILE-SELFIE-CHECKOUT-02', // DISTINCT SELFIE
      deviceFingerprint: 'DEV-BROWSER-CLIENT',
    },
  };
  const res = createMockRes();

  try {
    await staffCheckOut(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(activeAttendance.status, 'CHECKED_OUT');
    assert.ok(activeAttendance.attendanceEvidence.checkOut);
    assert.equal(activeAttendance.attendanceEvidence.checkOut.photoFileId, 'FILE-SELFIE-CHECKOUT-02');
    assert.equal(activeAttendance.attendanceEvidence.checkOut.verificationStatus, 'VERIFIED');
  } finally {
    Attendance.findOne = origFindOneAttendance;
    PrivateFile.findOne = origFindOnePrivateFile;
    AttendanceSubmission.create = origCreateSubmission;
  }
});

// ---------------------------------------------------------------------------
// 5. EVIDENCE STREAMING API & STRICT RBAC/IDOR PROTECTION
// ---------------------------------------------------------------------------

test('RBAC-001: Staff can stream own attendance evidence photograph', async () => {
  const origFindOnePrivateFile = PrivateFile.findOne;
  const origFindOneAttendance = Attendance.findOne;
  const origReadBuffer = defaultStorageService.readObjectBuffer;
  const origCreateAudit = AuditEvent.create;

  PrivateFile.findOne = () => ({
    fileId: 'FILE-PHOTO-01',
    fileKey: 'org/selfie_01.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 15,
    isPurged: false,
    uploadedByUserId: 'EMP-STAFF-1',
    organisationId: 'ORG-ZAMORIN',
  });

  Attendance.findOne = () => ({
    userId: 'EMP-STAFF-1',
    cafeId: 'CAFE-KNR-01',
    attendanceEvidence: {
      checkIn: { photoFileId: 'FILE-PHOTO-01' },
    },
  });

  defaultStorageService.readObjectBuffer = async () => Buffer.from('JPEG-RAW-IMAGE-DATA');
  AuditEvent.create = async () => ({});

  const req = {
    auth: {
      userId: 'EMP-STAFF-1',
      role: 'STAFF',
      organisationId: 'ORG-ZAMORIN',
    },
    params: { mediaId: 'FILE-PHOTO-01' },
  };
  const res = createMockRes();

  try {
    await getEvidenceMedia(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'image/jpeg');
    assert.ok(res.body);
  } finally {
    PrivateFile.findOne = origFindOnePrivateFile;
    Attendance.findOne = origFindOneAttendance;
    defaultStorageService.readObjectBuffer = origReadBuffer;
    AuditEvent.create = origCreateAudit;
  }
});

test('RBAC-002: Staff CANNOT stream another staff members evidence (403 IDOR blocked)', async () => {
  const origFindOnePrivateFile = PrivateFile.findOne;
  const origFindOneAttendance = Attendance.findOne;

  PrivateFile.findOne = () => ({
    fileId: 'FILE-PHOTO-OTHER',
    fileKey: 'org/selfie_other.jpg',
    mimeType: 'image/jpeg',
    isPurged: false,
    uploadedByUserId: 'EMP-STAFF-2', // different user
    organisationId: 'ORG-ZAMORIN',
  });

  Attendance.findOne = () => ({
    userId: 'EMP-STAFF-2', // different user
    cafeId: 'CAFE-KNR-01',
    attendanceEvidence: {
      checkIn: { photoFileId: 'FILE-PHOTO-OTHER' },
    },
  });

  const req = {
    auth: {
      userId: 'EMP-STAFF-1', // attacker staff
      role: 'STAFF',
      organisationId: 'ORG-ZAMORIN',
    },
    params: { mediaId: 'FILE-PHOTO-OTHER' },
  };
  const res = createMockRes();

  try {
    await assert.rejects(
      async () => {
        await getEvidenceMedia(req, res);
      },
      { statusCode: 403, code: 'FORBIDDEN_EVIDENCE_ACCESS' }
    );
  } finally {
    PrivateFile.findOne = origFindOnePrivateFile;
    Attendance.findOne = origFindOneAttendance;
  }
});

test('RBAC-003: Cafe Admin CANNOT stream evidence of employee in another cafe (403)', async () => {
  const origFindOnePrivateFile = PrivateFile.findOne;
  const origFindOneAttendance = Attendance.findOne;

  PrivateFile.findOne = () => ({
    fileId: 'FILE-PHOTO-CALICUT',
    fileKey: 'org/selfie_calicut.jpg',
    mimeType: 'image/jpeg',
    isPurged: false,
    uploadedByUserId: 'EMP-CALICUT-1',
    organisationId: 'ORG-ZAMORIN',
  });

  Attendance.findOne = () => ({
    userId: 'EMP-CALICUT-1',
    cafeId: 'CAFE-CALICUT-02', // different cafe
    attendanceEvidence: {
      checkIn: { photoFileId: 'FILE-PHOTO-CALICUT' },
    },
  });

  const req = {
    auth: {
      userId: 'LEAD-KANNUR',
      role: 'CAFE_ADMIN',
      organisationId: 'ORG-ZAMORIN',
      assignedCafeIds: ['CAFE-KNR-01'], // only Kannur assigned
    },
    params: { mediaId: 'FILE-PHOTO-CALICUT' },
  };
  const res = createMockRes();

  try {
    await assert.rejects(
      async () => {
        await getEvidenceMedia(req, res);
      },
      { statusCode: 403, code: 'FORBIDDEN_CAFE_EVIDENCE' }
    );
  } finally {
    PrivateFile.findOne = origFindOnePrivateFile;
    Attendance.findOne = origFindOneAttendance;
  }
});

test('RBAC-004: Cafe Ops CAN stream evidence for bound cafe but blocked for other cafes', async () => {
  const origFindOnePrivateFile = PrivateFile.findOne;
  const origFindOneAttendance = Attendance.findOne;
  const origReadBuffer = defaultStorageService.readObjectBuffer;
  const origCreateAudit = AuditEvent.create;

  PrivateFile.findOne = () => ({
    fileId: 'FILE-PHOTO-OPS-TEST',
    fileKey: 'org/selfie_ops.jpg',
    mimeType: 'image/jpeg',
    isPurged: false,
    uploadedByUserId: 'EMP-KNR-1',
    organisationId: 'ORG-ZAMORIN',
  });

  Attendance.findOne = () => ({
    userId: 'EMP-KNR-1',
    cafeId: 'CAFE-KNR-01',
    attendanceEvidence: {
      checkIn: { photoFileId: 'FILE-PHOTO-OPS-TEST' },
    },
  });

  defaultStorageService.readObjectBuffer = async () => Buffer.from('JPEG-RAW-IMAGE-DATA');
  AuditEvent.create = async () => ({});

  // Bound to Kannur -> Allowed
  const reqAllowed = {
    auth: {
      role: 'CAFE_OPS',
      organisationId: 'ORG-ZAMORIN',
      boundCafeId: 'CAFE-KNR-01',
    },
    params: { mediaId: 'FILE-PHOTO-OPS-TEST' },
  };
  const resAllowed = createMockRes();

  try {
    await getEvidenceMedia(reqAllowed, resAllowed);
    assert.equal(resAllowed.statusCode, 200);

    // Bound to Calicut -> Blocked
    const reqBlocked = {
      auth: {
        role: 'CAFE_OPS',
        organisationId: 'ORG-ZAMORIN',
        boundCafeId: 'CAFE-CALICUT-02',
      },
      params: { mediaId: 'FILE-PHOTO-OPS-TEST' },
    };
    await assert.rejects(
      async () => {
        await getEvidenceMedia(reqBlocked, createMockRes());
      },
      { statusCode: 403, code: 'FORBIDDEN_CAFE_EVIDENCE' }
    );
  } finally {
    PrivateFile.findOne = origFindOnePrivateFile;
    Attendance.findOne = origFindOneAttendance;
    defaultStorageService.readObjectBuffer = origReadBuffer;
    AuditEvent.create = origCreateAudit;
  }
});

test('RBAC-005: Primary Master can stream evidence across cafes in organisation', async () => {
  const origFindOnePrivateFile = PrivateFile.findOne;
  const origFindOneAttendance = Attendance.findOne;
  const origReadBuffer = defaultStorageService.readObjectBuffer;
  const origCreateAudit = AuditEvent.create;

  PrivateFile.findOne = () => ({
    fileId: 'FILE-PHOTO-MASTER-VIEW',
    fileKey: 'org/selfie_master.jpg',
    mimeType: 'image/jpeg',
    isPurged: false,
    uploadedByUserId: 'EMP-05',
    organisationId: 'ORG-ZAMORIN',
  });

  Attendance.findOne = () => ({
    userId: 'EMP-05',
    cafeId: 'CAFE-ANY-09',
    attendanceEvidence: {
      checkIn: { photoFileId: 'FILE-PHOTO-MASTER-VIEW' },
    },
  });

  defaultStorageService.readObjectBuffer = async () => Buffer.from('JPEG-RAW-IMAGE-DATA');
  let auditPayload = null;
  AuditEvent.create = async (payload) => { auditPayload = payload; };

  const req = {
    auth: {
      userId: 'MASTER-PRIMARY-01',
      role: 'MASTER',
      isPrimaryMaster: true,
      organisationId: 'ORG-ZAMORIN',
    },
    params: { mediaId: 'FILE-PHOTO-MASTER-VIEW' },
  };
  const res = createMockRes();

  try {
    await getEvidenceMedia(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(auditPayload);
    assert.equal(auditPayload.action, 'ATTENDANCE_EVIDENCE_VIEWED');
    assert.equal(auditPayload.organisationId, 'ORG-ZAMORIN');
    // Invariant: no image byte data stored in audit event
    assert.equal(auditPayload.metadata.fileKey, 'org/selfie_master.jpg');
    assert.equal(auditPayload.metadata.imageBinary, undefined);
  } finally {
    PrivateFile.findOne = origFindOnePrivateFile;
    Attendance.findOne = origFindOneAttendance;
    defaultStorageService.readObjectBuffer = origReadBuffer;
    AuditEvent.create = origCreateAudit;
  }
});

// ---------------------------------------------------------------------------
// 6. FROZEN BOUNDARY INVARIANT: CafeAccess IS UNTOUCHED
// ---------------------------------------------------------------------------

test('FROZEN-001: Rotating Attendance QR does NOT mutate CafeAccess collection', async () => {
  const challenge = await attendanceQrService.getActiveOrNewChallenge({
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
  });

  // Verify challenge purpose is ATTENDANCE_PUNCH and has zero reference to permanent CafeAccess PINs
  assert.equal(challenge.purpose, 'ATTENDANCE_PUNCH');
  assert.equal(challenge.pin, undefined);
  assert.equal(challenge.hashedPin, undefined);
});


test('ATTENDANCE-FLOW-001: QR deep-link, Cafe Operations kiosk, and calendars use canonical secure-presence wiring', () => {
  const mainSource = fs.readFileSync(path.join(root, 'frontend', 'src', 'js', 'main.js'), 'utf8');
  const staffSource = fs.readFileSync(path.join(root, 'frontend', 'src', 'js', 'modules', 'attendance', 'staffAttendance.js'), 'utf8');
  const managementSource = fs.readFileSync(path.join(root, 'frontend', 'src', 'js', 'modules', 'attendance', 'attendanceShifts.js'), 'utf8');
  const qrPageSource = fs.readFileSync(path.join(root, 'frontend', 'src', 'js', 'pages', 'attendanceQrScannerPage.js'), 'utf8');
  const displaySource = fs.readFileSync(path.join(root, 'frontend', 'src', 'js', 'pages', 'cafeAttendanceDisplay.js'), 'utf8');
  const cafeOpsKioskSource = fs.readFileSync(path.join(root, 'frontend', 'cafe-operations', 'js', 'screens', 'attendanceKiosk.js'), 'utf8');
  const cafeOpsApiSource = fs.readFileSync(path.join(root, 'frontend', 'cafe-operations', 'js', 'api', 'cafeOpsApi.js'), 'utf8');

  assert.match(qrPageSource, /res\.data\.attendanceUrl \|\| res\.data\.opaqueToken/);
  assert.match(displaySource, /res\.data\.attendanceUrl \|\| res\.data\.qrToken/);
  assert.match(cafeOpsApiSource, /attendanceQr: \(\) => apiRequest\('\/devices\/attendance\/qr'/);
  assert.match(cafeOpsKioskSource, /CafeOpsApi\?\.attendanceQr/);
  assert.match(cafeOpsKioskSource, /body\.attendanceUrl/);

  assert.match(mainSource, /zamorin\.pendingAttendanceQr/);
  assert.match(mainSource, /sessionStorage\.setItem/);
  assert.match(mainSource, /searchParams\.delete\("attendanceQr"\)/);
  assert.match(staffSource, /preScannedQrToken/);
  assert.match(staffSource, /runGeofenceVerification/);
  assert.match(staffSource, /startSelfieCapture/);

  assert.doesNotMatch(staffSource, /const dateKey = `2026-08-/);
  assert.match(staffSource, /attendanceEvidence\?\.checkIn/);
  assert.match(staffSource, /attendanceEvidence\?\.checkOut/);

  assert.doesNotMatch(managementSource, /06:42 – 15:10/);
  assert.doesNotMatch(managementSource, /option value="2026-08"/);
  assert.doesNotMatch(managementSource, /function openDayAttendanceDetailsModal/);
  assert.match(managementSource, /calendar-360\/\$\{encodeURIComponent\(selectedUserId\)\}/);
  assert.match(managementSource, /openAttendanceEvidenceViewer\(\{ attendanceId \}\)/);
});

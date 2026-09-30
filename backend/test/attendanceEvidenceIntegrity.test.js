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
      },
      checkOut: null,
    },
    ...overrides,
  };
}

function createPrivateFile(buffer, overrides = {}) {
  return {
    _id: 'PF-3001',
    fileId: 'FILE-3001',
    organisationId: 'ORG-ZAMORIN',
    uploadedByUserId: 'EMP-001',
    storagePath: 'ORG-ZAMORIN/CAFE-KNR-01/attendance_evidence/FILE-3001.jpg',
    sizeBytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    attendanceContext: {
      challengeId: 'CH-3001',
      cafeId: 'CAFE-KNR-01',
      punchType: 'CHECK_IN',
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
  const bytes = Buffer.from('forensic-selfie-bytes-001');

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
  const originalBytes = Buffer.from('original-evidence');
  const tamperedBytes = Buffer.from('tampered-evidence-with-different-length');

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
  const bytes = Buffer.from('identity-evidence');

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
  const bytes = Buffer.from('batch-evidence');

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
    async () => auditAttendanceEvidence(request, {}),
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


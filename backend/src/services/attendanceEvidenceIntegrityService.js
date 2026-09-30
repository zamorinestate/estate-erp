'use strict';

const crypto = require('node:crypto');
const { PrivateFile } = require('../models/PrivateFile');
const { Attendance } = require('../modules/attendance/Attendance');
const { attendanceEvidenceStorageService } = require('./attendanceEvidenceStorageService');

const DEFAULT_INTEGRITY_BATCH_SIZE = 25;
const MAX_INTEGRITY_BATCH_SIZE = 100;

function normalizeId(value) {
  return String(value || '').trim().toUpperCase();
}

function clampBatchSize(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_INTEGRITY_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_INTEGRITY_BATCH_SIZE, parsed));
}

function resolveEvidenceFileId(attendance, punchType) {
  const type = normalizeId(punchType);
  if (type === 'CHECK_IN') {
    return normalizeId(
      attendance?.attendanceEvidence?.checkIn?.selfieMediaId ||
      attendance?.attendanceEvidence?.checkIn?.photoFileId ||
      attendance?.selfieFileId
    );
  }
  if (type === 'CHECK_OUT') {
    return normalizeId(
      attendance?.attendanceEvidence?.checkOut?.selfieMediaId ||
      attendance?.attendanceEvidence?.checkOut?.photoFileId
    );
  }
  return '';
}

function getEvidenceSlot(attendance, punchType) {
  return normalizeId(punchType) === 'CHECK_OUT'
    ? attendance?.attendanceEvidence?.checkOut || null
    : attendance?.attendanceEvidence?.checkIn || null;
}

function pushCheck(checks, name, ok, details = {}) {
  checks.push({
    name,
    ok: Boolean(ok),
    ...details,
  });
}

async function loadPrivateFile(query) {
  const result = PrivateFile.findOne(query);
  return result && typeof result.lean === 'function'
    ? result.lean()
    : result;
}

async function verifyAttendanceEvidenceSlot({
  organisationId,
  attendance,
  punchType,
  verifyStorageBytes = true,
} = {}) {
  const orgId = normalizeId(organisationId);
  const type = normalizeId(punchType);
  if (!orgId) throw new TypeError('organisationId is required.');
  if (!attendance) throw new TypeError('attendance is required.');
  if (!['CHECK_IN', 'CHECK_OUT'].includes(type)) {
    throw new TypeError('punchType must be CHECK_IN or CHECK_OUT.');
  }

  const slot = getEvidenceSlot(attendance, type);
  const fileId = resolveEvidenceFileId(attendance, type);
  const attendanceId = normalizeId(attendance.attendanceId);
  const employeeUserId = normalizeId(attendance.userId);
  const cafeId = normalizeId(attendance.cafeId);
  const checks = [];

  const transitionExists = type === 'CHECK_IN'
    ? Boolean(attendance.checkInAt)
    : Boolean(attendance.checkOutAt);

  if (!transitionExists) {
    return {
      punchType: type,
      attendanceId,
      fileId: fileId || null,
      status: 'NOT_APPLICABLE',
      checks,
    };
  }

  pushCheck(
    checks,
    'attendance_evidence_reference_present',
    Boolean(fileId),
    { expected: 'referenced selfie file', actual: fileId || null }
  );

  if (!fileId) {
    return {
      punchType: type,
      attendanceId,
      fileId: null,
      status: 'FAIL',
      checks,
    };
  }

  const privateFile = await loadPrivateFile({
    organisationId: orgId,
    fileId,
  });

  pushCheck(checks, 'private_file_metadata_present', Boolean(privateFile));
  if (!privateFile) {
    return {
      punchType: type,
      attendanceId,
      fileId,
      status: 'FAIL',
      checks,
    };
  }

  const context = privateFile.attendanceContext || {};
  const link = privateFile.attendanceLink || {};
  const cleanup = privateFile.attendanceCleanup || {};
  const slotChallengeId = String(slot?.qrChallengeId || '').trim();

  pushCheck(checks, 'employee_binding', normalizeId(privateFile.uploadedByUserId) === employeeUserId);
  pushCheck(checks, 'cafe_binding', normalizeId(context.cafeId) === cafeId);
  pushCheck(checks, 'punch_binding', normalizeId(context.punchType) === type);
  pushCheck(
    checks,
    'challenge_binding',
    Boolean(slotChallengeId) && String(context.challengeId || '').trim() === slotChallengeId
  );
  pushCheck(checks, 'link_status_committed', normalizeId(link.status) === 'COMMITTED');
  pushCheck(checks, 'link_attendance_id', normalizeId(link.attendanceId) === attendanceId);
  pushCheck(checks, 'link_punch_type', normalizeId(link.punchType) === type);
  pushCheck(checks, 'cleanup_not_claimed', normalizeId(cleanup.status) !== 'CLAIMED');

  const storagePath = String(privateFile.storagePath || privateFile.fileKey || '').trim();
  const storedSha256 = String(privateFile.sha256 || '').trim().toLowerCase();
  const expectedSize = Number(privateFile.sizeBytes);

  pushCheck(checks, 'storage_path_present', Boolean(storagePath));
  pushCheck(checks, 'sha256_metadata_present', /^[a-f0-9]{64}$/.test(storedSha256));
  pushCheck(checks, 'size_metadata_valid', Number.isFinite(expectedSize) && expectedSize > 0);

  let storage = {
    checked: Boolean(verifyStorageBytes),
    exists: null,
    actualSizeBytes: null,
    actualSha256: null,
  };

  if (verifyStorageBytes && storagePath) {
    const buffer = await attendanceEvidenceStorageService.readObjectBuffer({
      fileKey: storagePath,
    });

    const exists = Buffer.isBuffer(buffer) && buffer.length > 0;
    storage.exists = exists;
    pushCheck(checks, 'storage_object_present', exists);

    if (exists) {
      storage.actualSizeBytes = buffer.length;
      storage.actualSha256 = crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex');

      pushCheck(
        checks,
        'storage_size_matches_metadata',
        Number.isFinite(expectedSize) && buffer.length === expectedSize,
        { expected: expectedSize, actual: buffer.length }
      );
      pushCheck(
        checks,
        'storage_sha256_matches_metadata',
        /^[a-f0-9]{64}$/.test(storedSha256) &&
          storage.actualSha256 === storedSha256
      );
    }
  }

  const failedChecks = checks.filter((check) => check.ok !== true).map((check) => check.name);

  return {
    punchType: type,
    attendanceId,
    fileId,
    status: failedChecks.length ? 'FAIL' : 'PASS',
    failedChecks,
    storage,
    checks,
  };
}

function buildAuditAttendanceFilter({ organisationId, attendanceId, cafeId }) {
  const filter = {
    organisationId: normalizeId(organisationId),
  };

  if (attendanceId) {
    filter.attendanceId = normalizeId(attendanceId);
  }
  if (cafeId) {
    filter.cafeId = normalizeId(cafeId);
  }

  filter.$or = [
    { 'attendanceEvidence.checkIn.selfieMediaId': { $ne: null } },
    { 'attendanceEvidence.checkIn.photoFileId': { $ne: null } },
    { 'attendanceEvidence.checkOut.selfieMediaId': { $ne: null } },
    { 'attendanceEvidence.checkOut.photoFileId': { $ne: null } },
    { selfieFileId: { $ne: null } },
    { checkInSource: 'SELF' },
    { checkOutSource: 'SELF' },
  ];

  return filter;
}

async function auditAttendanceEvidenceIntegrity({
  organisationId,
  attendanceId,
  cafeId,
  batchSize,
  verifyStorageBytes = true,
} = {}) {
  const orgId = normalizeId(organisationId);
  if (!orgId) throw new TypeError('organisationId is required.');

  const resolvedBatchSize = clampBatchSize(batchSize);
  const query = Attendance.find(
    buildAuditAttendanceFilter({
      organisationId: orgId,
      attendanceId,
      cafeId,
    })
  )
    .sort({ businessDate: -1, checkInAt: -1 })
    .limit(resolvedBatchSize);

  const records = typeof query.lean === 'function' ? await query.lean() : await query;

  const result = {
    organisationId: orgId,
    attendanceId: attendanceId ? normalizeId(attendanceId) : null,
    cafeId: cafeId ? normalizeId(cafeId) : null,
    batchSize: resolvedBatchSize,
    verifyStorageBytes: Boolean(verifyStorageBytes),
    recordsScanned: 0,
    evidenceSlotsScanned: 0,
    passed: 0,
    failed: 0,
    notApplicable: 0,
    failures: [],
    records: [],
  };

  for (const attendance of records || []) {
    result.recordsScanned += 1;
    const recordResult = {
      attendanceId: normalizeId(attendance.attendanceId),
      userId: normalizeId(attendance.userId),
      cafeId: normalizeId(attendance.cafeId),
      businessDate: attendance.businessDate || null,
      evidence: [],
    };

    for (const type of ['CHECK_IN', 'CHECK_OUT']) {
      const transitionExists = type === 'CHECK_IN'
        ? Boolean(attendance.checkInAt)
        : Boolean(attendance.checkOutAt);
      if (!transitionExists) continue;

      const verified = await verifyAttendanceEvidenceSlot({
        organisationId: orgId,
        attendance,
        punchType: type,
        verifyStorageBytes,
      });

      result.evidenceSlotsScanned += 1;
      if (verified.status === 'PASS') result.passed += 1;
      else if (verified.status === 'NOT_APPLICABLE') result.notApplicable += 1;
      else {
        result.failed += 1;
        result.failures.push({
          attendanceId: recordResult.attendanceId,
          punchType: type,
          fileId: verified.fileId,
          failedChecks: verified.failedChecks || [],
        });
      }
      recordResult.evidence.push(verified);
    }

    result.records.push(recordResult);
  }

  result.integrityOk = result.failed === 0;
  return result;
}

module.exports = {
  DEFAULT_INTEGRITY_BATCH_SIZE,
  MAX_INTEGRITY_BATCH_SIZE,
  resolveEvidenceFileId,
  buildAuditAttendanceFilter,
  verifyAttendanceEvidenceSlot,
  auditAttendanceEvidenceIntegrity,
};

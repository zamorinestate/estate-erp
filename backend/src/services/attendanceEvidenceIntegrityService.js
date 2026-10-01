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

function calculateDistanceMetres(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMetres = 6371000;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLon = toRad(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(deltaLon / 2) ** 2;
  return earthRadiusMetres * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function detectEvidenceImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) return 'image/png';
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  return null;
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
  requireProofSnapshot = true,
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

  const snapshotVersion = Number(context.proofSnapshotVersion || 0);
  const shouldVerifyProofSnapshot = requireProofSnapshot || snapshotVersion >= 1;

  if (shouldVerifyProofSnapshot) {
    const boundAt = context.boundAt ? new Date(context.boundAt) : null;
    const grantIssuedAt = context.grantIssuedAt ? new Date(context.grantIssuedAt) : null;
    const grantExpiresAt = context.grantExpiresAt ? new Date(context.grantExpiresAt) : null;
    const serverTimestamp = slot?.serverTimestamp ? new Date(slot.serverTimestamp) : null;
    const proofDatesValid = [boundAt, grantIssuedAt, grantExpiresAt]
      .every((value) => value instanceof Date && !Number.isNaN(value.getTime()));

    pushCheck(checks, 'proof_snapshot_version', snapshotVersion >= 1);
    pushCheck(checks, 'proof_purpose', context.proofPurpose === 'ATTENDANCE_PUNCH');
    pushCheck(
      checks,
      'device_binding',
      Boolean(String(context.deviceId || '').trim()) &&
        String(context.deviceId || '').trim() === String(slot?.deviceId || '').trim()
    );
    pushCheck(checks, 'grant_timing_present', proofDatesValid);
    pushCheck(
      checks,
      'grant_temporal_order',
      proofDatesValid &&
        grantIssuedAt.getTime() <= boundAt.getTime() &&
        boundAt.getTime() <= grantExpiresAt.getTime()
    );
    pushCheck(
      checks,
      'punch_after_evidence_binding',
      !serverTimestamp ||
        Number.isNaN(serverTimestamp.getTime()) ||
        !boundAt ||
        Number.isNaN(boundAt.getTime())
        ? false
        : serverTimestamp.getTime() >= boundAt.getTime()
    );
  }

  const geofenceSnapshotVersion = Number(slot?.geofencePolicyVersion || 0);
  const shouldVerifyGeofenceSnapshot = requireProofSnapshot || geofenceSnapshotVersion >= 1;
  if (shouldVerifyGeofenceSnapshot) {
    const employeeLatitude = Number(slot?.latitude);
    const employeeLongitude = Number(slot?.longitude);
    const cafeLatitude = Number(slot?.cafeLatitude);
    const cafeLongitude = Number(slot?.cafeLongitude);
    const allowedRadiusMeters = Number(slot?.allowedRadiusMeters);
    const storedDistanceMeters = Number(slot?.distanceMeters);

    const coordinatesValid =
      Number.isFinite(employeeLatitude) &&
      employeeLatitude >= -90 &&
      employeeLatitude <= 90 &&
      Number.isFinite(employeeLongitude) &&
      employeeLongitude >= -180 &&
      employeeLongitude <= 180 &&
      Number.isFinite(cafeLatitude) &&
      cafeLatitude >= -90 &&
      cafeLatitude <= 90 &&
      Number.isFinite(cafeLongitude) &&
      cafeLongitude >= -180 &&
      cafeLongitude <= 180;

    const policyValid =
      geofenceSnapshotVersion >= 1 &&
      coordinatesValid &&
      Number.isFinite(allowedRadiusMeters) &&
      allowedRadiusMeters > 0 &&
      Number.isFinite(storedDistanceMeters) &&
      storedDistanceMeters >= 0;

    pushCheck(checks, 'geofence_snapshot_version', geofenceSnapshotVersion >= 1);
    pushCheck(checks, 'geofence_snapshot_coordinates_valid', coordinatesValid);
    pushCheck(checks, 'geofence_snapshot_radius_valid', Number.isFinite(allowedRadiusMeters) && allowedRadiusMeters > 0);

    if (policyValid) {
      const recomputedDistance = Math.round(
        calculateDistanceMetres(
          employeeLatitude,
          employeeLongitude,
          cafeLatitude,
          cafeLongitude
        )
      );

      pushCheck(
        checks,
        'geofence_distance_recomputed',
        recomputedDistance === Math.round(storedDistanceMeters),
        { expected: Math.round(storedDistanceMeters), actual: recomputedDistance }
      );
      pushCheck(
        checks,
        'geofence_within_snapshot_radius',
        recomputedDistance <= allowedRadiusMeters
      );
      pushCheck(checks, 'geofence_verified_flag', slot?.geofenceVerified === true);
    }
  }

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

      const detectedMime = detectEvidenceImageMime(buffer);
      const metadataMime = String(privateFile.mimeType || '').trim().toLowerCase() === 'image/jpg'
        ? 'image/jpeg'
        : String(privateFile.mimeType || '').trim().toLowerCase();
      pushCheck(
        checks,
        'storage_mime_matches_signature',
        Boolean(detectedMime) && detectedMime === metadataMime,
        { expected: metadataMime || null, actual: detectedMime }
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
    proofSnapshotVersion: snapshotVersion,
    geofencePolicyVersion: Number(slot?.geofencePolicyVersion || 0),
    legacyProofSnapshot: snapshotVersion < 1,
    legacyGeofenceSnapshot: Number(slot?.geofencePolicyVersion || 0) < 1,
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
    legacyProofSnapshots: 0,
    legacyGeofenceSnapshots: 0,
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
        // Historical evidence created before proof/geofence snapshot versioning
        // remains auditable without being falsely classified as corrupted.
        // Versioned evidence still self-enables all strict snapshot checks.
        requireProofSnapshot: false,
      });

      result.evidenceSlotsScanned += 1;
      if (verified.legacyProofSnapshot) result.legacyProofSnapshots += 1;
      if (verified.legacyGeofenceSnapshot) result.legacyGeofenceSnapshots += 1;
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

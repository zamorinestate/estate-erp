'use strict';

const crypto = require('node:crypto');
const { PrivateFile } = require('../models/PrivateFile');
const { Attendance } = require('../modules/attendance/Attendance');
const { attendanceEvidenceStorageService } = require('./attendanceEvidenceStorageService');

const DEFAULT_ORPHAN_GRACE_MINUTES = 60;
const MIN_ORPHAN_GRACE_MINUTES = 5;
const MAX_ORPHAN_GRACE_MINUTES = 24 * 60;
const DEFAULT_ORPHAN_BATCH_SIZE = 100;
const MAX_ORPHAN_BATCH_SIZE = 500;
const CLAIM_STALE_MINUTES = 15;

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function resolveOrphanGraceMinutes(overrideValue) {
  return clampInteger(
    overrideValue ?? process.env.ATTENDANCE_ORPHAN_GRACE_MINUTES,
    DEFAULT_ORPHAN_GRACE_MINUTES,
    MIN_ORPHAN_GRACE_MINUTES,
    MAX_ORPHAN_GRACE_MINUTES
  );
}

function resolveBatchSize(overrideValue) {
  return clampInteger(
    overrideValue,
    DEFAULT_ORPHAN_BATCH_SIZE,
    1,
    MAX_ORPHAN_BATCH_SIZE
  );
}

function buildAttendanceEvidenceReferenceQuery(organisationId, fileId) {
  return {
    organisationId,
    $or: [
      { 'attendanceEvidence.checkIn.selfieMediaId': fileId },
      { 'attendanceEvidence.checkIn.photoFileId': fileId },
      { 'attendanceEvidence.checkOut.selfieMediaId': fileId },
      { 'attendanceEvidence.checkOut.photoFileId': fileId },
      { selfieFileId: fileId },
      { 'rawTimeEvents.selfieFileId': fileId },
    ],
  };
}

async function isEvidenceLinked(organisationId, fileId) {
  const result = await Attendance.exists(
    buildAttendanceEvidenceReferenceQuery(organisationId, fileId)
  );
  return Boolean(result);
}

function buildReservationAttendanceReferenceQuery({
  organisationId,
  fileId,
  attendanceId,
  punchType,
}) {
  const normalizedPunchType = String(punchType || '').trim().toUpperCase();
  const normalizedAttendanceId = String(attendanceId || '').trim().toUpperCase();

  if (!normalizedAttendanceId || !['CHECK_IN', 'CHECK_OUT'].includes(normalizedPunchType)) {
    return null;
  }

  const evidencePaths = normalizedPunchType === 'CHECK_IN'
    ? [
        { 'attendanceEvidence.checkIn.selfieMediaId': fileId },
        { 'attendanceEvidence.checkIn.photoFileId': fileId },
        { selfieFileId: fileId },
        {
          rawTimeEvents: {
            $elemMatch: {
              eventType: 'CHECK_IN',
              selfieFileId: fileId,
            },
          },
        },
      ]
    : [
        { 'attendanceEvidence.checkOut.selfieMediaId': fileId },
        { 'attendanceEvidence.checkOut.photoFileId': fileId },
        {
          rawTimeEvents: {
            $elemMatch: {
              eventType: 'CHECK_OUT',
              selfieFileId: fileId,
            },
          },
        },
      ];

  return {
    organisationId,
    attendanceId: normalizedAttendanceId,
    $or: evidencePaths,
  };
}

async function isReservationBackedByAttendance(organisationId, reservation) {
  const query = buildReservationAttendanceReferenceQuery({
    organisationId,
    fileId: String(reservation?.fileId || '').trim().toUpperCase(),
    attendanceId: reservation?.attendanceLink?.attendanceId,
    punchType: reservation?.attendanceLink?.punchType,
  });

  if (!query) return false;
  return Boolean(await Attendance.exists(query));
}

async function queryCandidates(filter, batchSize) {
  const query = PrivateFile.find(filter)
    .sort({ 'attendanceContext.grantExpiresAt': 1, createdAt: 1 })
    .limit(batchSize);

  return typeof query.lean === 'function' ? query.lean() : query;
}

async function reconcileStaleAttendanceEvidenceReservations({
  organisationId,
  nowDate,
  cutoff,
  staleClaimCutoff,
  batchSize,
  dryRun,
}) {
  const query = PrivateFile.find({
    organisationId,
    'attendanceContext.challengeId': { $ne: null },
    'attendanceContext.grantExpiresAt': { $ne: null, $lte: cutoff },
    'attendanceLink.status': 'RESERVED',
    'attendanceLink.reservedAt': { $ne: null, $lte: staleClaimCutoff },
  })
    .sort({ 'attendanceLink.reservedAt': 1, createdAt: 1 })
    .limit(batchSize);

  const rows = typeof query.lean === 'function' ? await query.lean() : await query;
  const reservations = (rows || []).filter(
    (row) => row?.attendanceLink?.status === 'RESERVED'
  );

  const result = {
    scanned: reservations.length,
    linked: 0,
    committed: 0,
    quarantinedUnlinked: 0,
    conflicts: 0,
    invalid: 0,
  };

  for (const reservation of reservations) {
    const fileId = String(reservation.fileId || '').trim().toUpperCase();
    if (!fileId) {
      result.invalid += 1;
      continue;
    }

    const linked = await isReservationBackedByAttendance(
      organisationId,
      reservation
    );
    if (!linked) {
      // Fail closed: only the exact reserved attendance ID + transition may
      // prove this reservation committed. Any missing, mismatched, or corrupted
      // linkage remains quarantined and undeletable for manual investigation.
      result.quarantinedUnlinked += 1;
      continue;
    }

    result.linked += 1;
    if (dryRun) continue;

    const update = await PrivateFile.updateOne(
      {
        _id: reservation._id,
        organisationId,
        'attendanceLink.status': 'RESERVED',
        'attendanceLink.claimId': reservation.attendanceLink?.claimId || null,
      },
      {
        $set: {
          'attendanceLink.status': 'COMMITTED',
          'attendanceLink.committedAt': nowDate,
        },
      }
    );

    const changed = Boolean(
      update &&
      (
        update.modifiedCount === 1 ||
        update.matchedCount === 1 ||
        update.nModified === 1 ||
        update.n === 1
      )
    );

    if (changed) {
      result.committed += 1;
    } else {
      result.conflicts += 1;
    }
  }

  return result;
}

async function reconcileExpiredOrphanAttendanceEvidence({
  organisationId,
  actorUserId = 'SYSTEM',
  now = new Date(),
  graceMinutes,
  batchSize,
  dryRun = true,
} = {}) {
  const normalizedOrganisationId = String(organisationId || '').trim().toUpperCase();
  if (!normalizedOrganisationId) {
    throw new TypeError('organisationId is required for attendance evidence reconciliation.');
  }

  const resolvedGraceMinutes = resolveOrphanGraceMinutes(graceMinutes);
  const resolvedBatchSize = resolveBatchSize(batchSize);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.getTime())) {
    throw new TypeError('now must be a valid Date.');
  }

  const cutoff = new Date(nowDate.getTime() - resolvedGraceMinutes * 60 * 1000);
  const staleClaimCutoff = new Date(nowDate.getTime() - CLAIM_STALE_MINUTES * 60 * 1000);

  const reservationRepair = await reconcileStaleAttendanceEvidenceReservations({
    organisationId: normalizedOrganisationId,
    nowDate,
    cutoff,
    staleClaimCutoff,
    batchSize: resolvedBatchSize,
    dryRun: Boolean(dryRun),
  });

  const candidateFilter = {
    organisationId: normalizedOrganisationId,
    'attendanceContext.challengeId': { $ne: null },
    'attendanceContext.grantExpiresAt': { $ne: null, $lte: cutoff },
    'attendanceLink.status': { $nin: ['RESERVED', 'COMMITTED'] },
    $or: [
      { 'attendanceCleanup.status': { $ne: 'CLAIMED' } },
      { 'attendanceCleanup.claimedAt': { $lte: staleClaimCutoff } },
    ],
  };

  const candidates = await queryCandidates(candidateFilter, resolvedBatchSize);
  const summary = {
    dryRun: Boolean(dryRun),
    policy: {
      graceMinutes: resolvedGraceMinutes,
      cutoff: cutoff.toISOString(),
      claimStaleMinutes: CLAIM_STALE_MINUTES,
      batchSize: resolvedBatchSize,
    },
    scanned: Array.isArray(candidates) ? candidates.length : 0,
    staleReservationsScanned: reservationRepair.scanned,
    staleReservationsLinked: reservationRepair.linked,
    staleReservationsCommitted: reservationRepair.committed,
    staleReservationsQuarantined: reservationRepair.quarantinedUnlinked,
    staleReservationConflicts: reservationRepair.conflicts,
    staleReservationInvalid: reservationRepair.invalid,
    linkedProtected: 0,
    eligibleOrphans: 0,
    deleted: 0,
    storageAlreadyMissing: 0,
    claimConflicts: 0,
    metadataDeleteConflicts: 0,
    failed: 0,
    failures: [],
  };

  for (const candidate of candidates || []) {
    const fileId = String(candidate.fileId || '').trim().toUpperCase();
    const storagePath = String(candidate.storagePath || '').trim();
    if (!fileId || !storagePath) {
      summary.failed += 1;
      summary.failures.push({ fileId: fileId || null, code: 'INVALID_PRIVATE_FILE_METADATA' });
      continue;
    }

    if (await isEvidenceLinked(normalizedOrganisationId, fileId)) {
      summary.linkedProtected += 1;
      continue;
    }

    summary.eligibleOrphans += 1;
    if (dryRun) continue;

    const claimId = crypto.randomUUID();
    const claimed = await PrivateFile.findOneAndUpdate(
      {
        _id: candidate._id,
        organisationId: normalizedOrganisationId,
        'attendanceContext.grantExpiresAt': { $ne: null, $lte: cutoff },
        'attendanceLink.status': { $nin: ['RESERVED', 'COMMITTED'] },
        $or: [
          { 'attendanceCleanup.status': { $ne: 'CLAIMED' } },
          { 'attendanceCleanup.claimedAt': { $lte: staleClaimCutoff } },
        ],
      },
      {
        $set: {
          'attendanceCleanup.status': 'CLAIMED',
          'attendanceCleanup.claimId': claimId,
          'attendanceCleanup.claimedAt': nowDate,
          'attendanceCleanup.claimedByUserId': String(actorUserId || 'SYSTEM').trim().toUpperCase(),
          'attendanceCleanup.lastAttemptAt': nowDate,
          'attendanceCleanup.lastError': '',
        },
        $inc: {
          'attendanceCleanup.attemptCount': 1,
        },
      },
      { new: true }
    );

    if (!claimed) {
      summary.claimConflicts += 1;
      continue;
    }

    // Recheck after acquiring the metadata claim. The same PrivateFile row is
    // also protected by attendanceLink RESERVED/COMMITTED states, so a punch
    // that wins the linkage reservation cannot be claimed by this cleanup flow.
    if (await isEvidenceLinked(normalizedOrganisationId, fileId)) {
      summary.linkedProtected += 1;
      await PrivateFile.updateOne(
        { _id: candidate._id, 'attendanceCleanup.claimId': claimId },
        { $unset: { attendanceCleanup: '' } }
      );
      continue;
    }

    try {
      const storageWasPreviouslyDeleted =
        candidate.attendanceCleanup?.status === 'STORAGE_DELETED';

      let storageExists = false;
      if (!storageWasPreviouslyDeleted) {
        storageExists = await attendanceEvidenceStorageService.objectExists({
          fileKey: storagePath,
        });

        if (storageExists) {
          const deleted = await attendanceEvidenceStorageService.deleteObject({
            fileKey: storagePath,
          });
          if (!deleted) {
            throw new Error('ATTENDANCE_ORPHAN_STORAGE_DELETE_FAILED');
          }

          const stillExists = await attendanceEvidenceStorageService.objectExists({
            fileKey: storagePath,
          });
          if (stillExists) {
            throw new Error('ATTENDANCE_ORPHAN_STORAGE_STILL_EXISTS');
          }
        } else {
          summary.storageAlreadyMissing += 1;
        }
      } else {
        summary.storageAlreadyMissing += 1;
      }

      await PrivateFile.updateOne(
        { _id: candidate._id, 'attendanceCleanup.claimId': claimId },
        {
          $set: {
            'attendanceCleanup.status': 'STORAGE_DELETED',
            'attendanceCleanup.storageDeletedAt': nowDate,
            'attendanceCleanup.lastError': '',
          },
        }
      );

      const metadataDelete = await PrivateFile.deleteOne({
        _id: candidate._id,
        organisationId: normalizedOrganisationId,
        'attendanceCleanup.claimId': claimId,
      });

      if (!metadataDelete || metadataDelete.deletedCount !== 1) {
        summary.metadataDeleteConflicts += 1;
        continue;
      }

      summary.deleted += 1;
    } catch (err) {
      summary.failed += 1;
      const failureCode = String(err?.code || err?.message || 'ATTENDANCE_ORPHAN_RECONCILIATION_FAILED')
        .slice(0, 200);
      summary.failures.push({ fileId, code: failureCode });

      await PrivateFile.updateOne(
        { _id: candidate._id, 'attendanceCleanup.claimId': claimId },
        {
          $set: {
            'attendanceCleanup.status': 'FAILED',
            'attendanceCleanup.lastAttemptAt': nowDate,
            'attendanceCleanup.lastError': failureCode,
          },
        }
      ).catch(() => {});
    }
  }

  return summary;
}

module.exports = {
  DEFAULT_ORPHAN_GRACE_MINUTES,
  MIN_ORPHAN_GRACE_MINUTES,
  MAX_ORPHAN_GRACE_MINUTES,
  DEFAULT_ORPHAN_BATCH_SIZE,
  MAX_ORPHAN_BATCH_SIZE,
  CLAIM_STALE_MINUTES,
  resolveOrphanGraceMinutes,
  buildAttendanceEvidenceReferenceQuery,
  buildReservationAttendanceReferenceQuery,
  reconcileStaleAttendanceEvidenceReservations,
  reconcileExpiredOrphanAttendanceEvidence,
};

'use strict';

const crypto = require('node:crypto');
const { Attendance } = require('../modules/attendance/Attendance');
const { recordRequestAudit } = require('./auditService');
const { notificationService } = require('./NotificationService');

const CRITICAL_FAILURE_CHECKS = new Set([
  'private_file_metadata_present',
  'employee_binding',
  'cafe_binding',
  'punch_binding',
  'challenge_binding',
  'link_status_committed',
  'link_attendance_id',
  'link_punch_type',
  'storage_object_present',
  'storage_sha256_matches_metadata',
  'storage_mime_matches_signature',
]);

function normalizeId(value) {
  return String(value || '').trim().toUpperCase();
}

function sanitizeFailureChecks(checks) {
  return [...new Set((checks || [])
    .map((check) => String(check || '').trim())
    .filter(Boolean))]
    .slice(0, 40);
}

function classifyIntegrityFailure(failedChecks = []) {
  return failedChecks.some((check) => CRITICAL_FAILURE_CHECKS.has(check))
    ? 'CRITICAL'
    : 'HIGH';
}

function getEvidenceSlot(attendance, punchType) {
  const type = normalizeId(punchType);
  if (type === 'CHECK_IN') return attendance?.attendanceEvidence?.checkIn || null;
  if (type === 'CHECK_OUT') return attendance?.attendanceEvidence?.checkOut || null;
  return null;
}

function resolveSlotFileId(attendance, punchType) {
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

function buildSecurityAlertKey({ attendanceId, punchType, fileId, failedChecks }) {
  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      attendanceId: normalizeId(attendanceId),
      punchType: normalizeId(punchType),
      fileId: normalizeId(fileId),
      failedChecks: sanitizeFailureChecks(failedChecks).sort(),
    }))
    .digest('hex')
    .slice(0, 24);

  return `ATTENDANCE_EVIDENCE_INTEGRITY_${fingerprint}`;
}

async function quarantineAttendanceEvidenceFailures({
  request,
  failures = [],
} = {}) {
  if (!request?.auth?.organisationId || !request?.auth?.userId) {
    throw new TypeError('Authenticated request context is required.');
  }

  const organisationId = normalizeId(request.auth.organisationId);
  const actorUserId = normalizeId(request.auth.userId);
  const now = new Date();

  const summary = {
    attempted: 0,
    quarantined: 0,
    alreadyQuarantined: 0,
    notQuarantinable: 0,
    auditEventsRecorded: 0,
    alertsQueued: 0,
    processingFailures: [],
  };

  for (const rawFailure of failures || []) {
    summary.attempted += 1;

    const attendanceId = normalizeId(rawFailure?.attendanceId);
    const punchType = normalizeId(rawFailure?.punchType);
    const fileId = normalizeId(rawFailure?.fileId);
    const failedChecks = sanitizeFailureChecks(rawFailure?.failedChecks);
    const severity = classifyIntegrityFailure(failedChecks);

    if (!attendanceId || !['CHECK_IN', 'CHECK_OUT'].includes(punchType)) {
      summary.notQuarantinable += 1;
      summary.processingFailures.push({
        attendanceId: attendanceId || null,
        punchType: punchType || null,
        code: 'INVALID_INTEGRITY_FAILURE_REFERENCE',
      });
      continue;
    }

    try {
      const query = Attendance.findOne({
        organisationId,
        attendanceId,
      });
      const attendance = query && typeof query.lean === 'function'
        ? await query.lean()
        : await query;

      if (!attendance) {
        summary.notQuarantinable += 1;
        summary.processingFailures.push({
          attendanceId,
          punchType,
          code: 'ATTENDANCE_RECORD_NOT_FOUND',
        });
        continue;
      }

      const slot = getEvidenceSlot(attendance, punchType);
      const slotFileId = resolveSlotFileId(attendance, punchType);
      const exactFileMatches = !fileId || slotFileId === fileId;

      if (!slot || !exactFileMatches) {
        summary.notQuarantinable += 1;
      } else if (
        String(slot.verificationStatus || '').toUpperCase() === 'FLAGGED' &&
        String(slot.integrityState || '').toUpperCase() === 'QUARANTINED'
      ) {
        summary.alreadyQuarantined += 1;
      } else {
        const slotPath = punchType === 'CHECK_IN'
          ? 'attendanceEvidence.checkIn'
          : 'attendanceEvidence.checkOut';

        const update = await Attendance.updateOne(
          {
            _id: attendance._id,
            organisationId,
            attendanceId,
          },
          {
            $set: {
              [`${slotPath}.verificationStatus`]: 'FLAGGED',
              [`${slotPath}.integrityState`]: 'QUARANTINED',
              [`${slotPath}.integrityLastCheckedAt`]: now,
              [`${slotPath}.integrityFailedChecks`]: failedChecks,
            },
          }
        );

        const matched = Boolean(
          update &&
          (
            update.modifiedCount === 1 ||
            update.matchedCount === 1 ||
            update.nModified === 1 ||
            update.n === 1
          )
        );

        if (!matched) {
          summary.processingFailures.push({
            attendanceId,
            punchType,
            fileId: fileId || null,
            code: 'ATTENDANCE_QUARANTINE_UPDATE_CONFLICT',
          });
          continue;
        }

        summary.quarantined += 1;
      }

      let auditEvent = null;
      try {
        auditEvent = await recordRequestAudit({
          request,
          module: 'ATTENDANCE',
          action: 'ATTENDANCE_EVIDENCE_INTEGRITY_FAILURE_QUARANTINED',
          entityType: 'AttendanceEvidence',
          entityId: `${attendanceId}:${punchType}`,
          cafeId: attendance.cafeId || null,
          reason: 'Attendance evidence integrity verification failed and was quarantined.',
          result: 'FAILURE',
          riskClassification: severity,
          metadata: {
            attendanceId,
            punchType,
            fileId: fileId || slotFileId || null,
            failedChecks,
            integrityState: 'QUARANTINED',
            employeeUserId: attendance.userId || null,
          },
        });
        summary.auditEventsRecorded += 1;
      } catch (auditError) {
        summary.processingFailures.push({
          attendanceId,
          punchType,
          fileId: fileId || null,
          code: 'INTEGRITY_AUDIT_EVENT_WRITE_FAILED',
          detail: String(auditError?.message || 'audit write failed').slice(0, 180),
        });
      }

      if (auditEvent?.auditEventId && slot) {
        const slotPath = punchType === 'CHECK_IN'
          ? 'attendanceEvidence.checkIn'
          : 'attendanceEvidence.checkOut';
        await Attendance.updateOne(
          { _id: attendance._id, organisationId, attendanceId },
          {
            $set: {
              [`${slotPath}.integrityAuditEventId`]: auditEvent.auditEventId,
            },
          }
        ).catch(() => {});
      }

      try {
        const alertKey = buildSecurityAlertKey({
          attendanceId,
          punchType,
          fileId: fileId || slotFileId,
          failedChecks,
        });

        const notification = await notificationService.publishNotification({
          eventType: 'ATTENDANCE_EVIDENCE_INTEGRITY_FAILURE',
          organisationId,
          cafeId: attendance.cafeId || null,
          actorUserId,
          includePrimaryMaster: true,
          // All integrity-failure notifications are SECURITY-category alerts.
          // The audit event preserves the finer HIGH/CRITICAL risk classification.
          severity: 'CRITICAL',
          priority: 'CRITICAL',
          templateId: 'SECURITY_ALERT',
          templateData: {
            title: 'Attendance evidence integrity failure',
            message: `Evidence for ${attendanceId} ${punchType} failed integrity checks: ${failedChecks.join(', ') || 'unknown check'}.`,
            actionRequired: 'Review the quarantined attendance evidence and investigate before relying on or releasing it.',
            link: '/#attendance-shifts',
          },
          channels: ['IN_APP', 'EMAIL'],
          correlationId: request.correlationId || null,
          idempotencyKey: alertKey,
          processImmediately: false,
          sourceModule: 'ATTENDANCE',
          sourceEntityType: 'ATTENDANCE_EVIDENCE',
          sourceEntityId: `${attendanceId}:${punchType}`,
          deepLink: '/#attendance-shifts',
          acknowledgementRequired: true,
          mandatory: true,
        });

        if ((notification?.recipientCount || 0) > 0) {
          summary.alertsQueued += 1;
        }
      } catch (notificationError) {
        summary.processingFailures.push({
          attendanceId,
          punchType,
          fileId: fileId || null,
          code: 'PRIMARY_MASTER_SECURITY_ALERT_FAILED',
          detail: String(notificationError?.message || 'notification failed').slice(0, 180),
        });
      }
    } catch (error) {
      summary.processingFailures.push({
        attendanceId,
        punchType,
        fileId: fileId || null,
        code: 'INTEGRITY_QUARANTINE_PROCESSING_FAILED',
        detail: String(error?.message || 'quarantine processing failed').slice(0, 180),
      });
    }
  }

  return summary;
}

module.exports = {
  CRITICAL_FAILURE_CHECKS,
  classifyIntegrityFailure,
  buildSecurityAlertKey,
  quarantineAttendanceEvidenceFailures,
};

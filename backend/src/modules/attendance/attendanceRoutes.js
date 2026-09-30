'use strict';

/**
 * ATTENDANCE & SHIFTS ROUTES (SCREEN 004)
 * Mounted at: /api/v1/attendance (registered in routes/index.js)
 */

const express = require('express');
const multer = require('multer');

const ATTENDANCE_SELFIE_MAX_BYTES = 5 * 1024 * 1024;
const attendanceSelfieUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ATTENDANCE_SELFIE_MAX_BYTES,
    files: 1,
    fields: 4,
  },
});

const {
  authenticate,
} = require('../../middleware/authenticate');

const {
  getAttendanceOverview,
  getLiveAttendance,
  recordMasterManualAttendance,
  getEmployeeMonthlyCalendar,
  getRoster,
  saveRoster,
  publishRoster,
  listShiftsForRoster,
  decideOvertime,
  getOvertimeList,
  getExceptionList,
  resolveException,
  closePeriod,
  reopenPeriod,
  purgeSelfieEvidence,
  getAttendanceEvidenceRetentionReadinessStatus,
  manageAttendanceEvidenceHold,
  reconcileOrphanSelfieEvidence,
  auditAttendanceEvidence,
  releaseAttendanceEvidenceQuarantine,
  getServerTime,
  getStaffPolicy,
  getStaffToday,
  staffCheckIn,
  staffCheckOut,
  staffStartBreak,
  staffEndBreak,
  correctAttendance,
  previewRecalculation,
  getStaffHistory,
  requestStaffCorrection,
  getStaffCorrections,
  getPendingCorrections,
  reviewStaffCorrection,
  recordStaffAttestation,
  getActiveCafeQr,
  verifyScannedQr,
  verifyPunchGeofence,
  uploadPunchSelfie,
  getEvidenceMedia,
  getAttendanceEvidenceRecord,
} = require('./attendanceController');

const { attachDeviceContext } = require('../../middleware/deviceContext');

const router = express.Router();

router.use(authenticate);
router.use(attachDeviceContext);

// Staff Self-Service Endpoints
router.get('/server-time', getServerTime);
router.get('/policy', getStaffPolicy);
router.get('/today', getStaffToday);
router.get('/history', getStaffHistory);
router.post('/check-in', staffCheckIn);
router.post('/check-out', staffCheckOut);
router.post('/break/start', staffStartBreak);
router.post('/break/end', staffEndBreak);
router.post('/corrections', requestStaffCorrection);
router.get('/corrections/mine', getStaffCorrections);
router.get('/corrections/pending', getPendingCorrections);
router.post('/corrections/:requestId/review', reviewStaffCorrection);
router.post('/attestation', recordStaffAttestation);

// Secure Presence & Rotating QR Verification
router.get('/qr/active', getActiveCafeQr);
router.post('/qr/verify', verifyScannedQr);
router.post('/geofence/verify', verifyPunchGeofence);
router.post(
  '/evidence/upload',
  attendanceSelfieUpload.single('selfie'),
  uploadPunchSelfie
);
router.get('/evidence/media/:mediaId', getEvidenceMedia);
router.get('/evidence/record/:attendanceId', getAttendanceEvidenceRecord);

// Overview & Live Presence
router.get('/overview', getAttendanceOverview);
router.get('/live', getLiveAttendance);
router.get('/', getLiveAttendance);

// Master & Management Attendance Mutation & Correction
router.post('/master-manual', recordMasterManualAttendance);
router.post('/manual', recordMasterManualAttendance);
router.patch('/:attendanceId', correctAttendance);
router.patch('/:attendanceId/correct', correctAttendance);
router.post('/preview-recalculation', previewRecalculation);

// Employee Attendance 360 Calendar
router.get('/calendar-360/:userId', getEmployeeMonthlyCalendar);

// Shift Roster
router.get('/roster/shifts', listShiftsForRoster);
router.get('/roster', getRoster);
router.post('/roster', saveRoster);
router.post('/roster/:rosterId/publish', publishRoster);

// Overtime & Exceptions
router.get('/overtime', getOvertimeList);
router.post('/overtime/decide', decideOvertime);
router.get('/exceptions', getExceptionList);
router.post('/exceptions/:exceptionId/resolve', resolveException);

// Period Closure & Reopen
router.post('/periods/:periodId/close', closePeriod);
router.post('/periods/:periodId/reopen', reopenPeriod);

// Privacy, Selfie Evidence Governance & Forensic Integrity (Primary Master)
router.post('/evidence/integrity/audit', auditAttendanceEvidence);
router.post('/evidence/integrity/release', releaseAttendanceEvidenceQuarantine);
router.get('/evidence/retention/readiness', getAttendanceEvidenceRetentionReadinessStatus);
router.post('/evidence/retention/hold', manageAttendanceEvidenceHold);
router.post('/evidence/orphans/reconcile', reconcileOrphanSelfieEvidence);
router.post('/evidence/purge', purgeSelfieEvidence);

module.exports = router;
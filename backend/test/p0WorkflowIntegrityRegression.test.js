'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const approvalController = read('backend/src/controllers/approvalController.js');
const leaveController = read('backend/src/controllers/leaveController.js');
const shiftController = read('backend/src/controllers/shiftChangeController.js');
const payrollQueryController = read('backend/src/controllers/payrollQueryController.js');
const loanAdvanceController = read('backend/src/controllers/loanAdvanceController.js');
const settingsController = read('backend/src/controllers/settingsController.js');
const attendanceController = read('backend/src/modules/attendance/attendanceController.js');
const companyIdentityService = read('backend/src/services/companyIdentityService.js');
const notificationService = read('backend/src/services/NotificationService.js');
const outboxWorker = read('backend/src/services/notificationOutboxWorker.js');
const outboxModel = read('backend/src/models/NotificationOutbox.js');
const serverSource = read('backend/src/server.js');
const cafeService = read('backend/src/services/cafeService.js');
const cafeController = read('backend/src/controllers/cafeController.js');
const cafeCreateModal = read('frontend/src/js/pages/cafeCreateModal.js');
const administrationPage = read('frontend/src/js/pages/administration.js');
const staffAttendancePage = read('frontend/src/js/modules/attendance/staffAttendance.js');
const attendanceShiftsPage = read('frontend/src/js/modules/attendance/attendanceShifts.js');
const staffHomePage = read('frontend/src/js/pages/staffHome.js');
const attendanceRoutes = read('backend/src/modules/attendance/attendanceRoutes.js');
const correctionModel = read('backend/src/models/AttendanceCorrectionRequest.js');
const errorHandlerSource = read('backend/src/middleware/errorHandler.js');
const attendanceQrService = read('backend/src/services/attendanceQrService.js');
const mainFrontend = read('frontend/src/js/main.js');
const cafeOpsApi = read('frontend/cafe-operations/js/api/cafeOpsApi.js');
const cafeOpsAttendanceKiosk = read('frontend/cafe-operations/js/screens/attendanceKiosk.js');
const cafeOpsDeviceRoutes = read('backend/src/cafe-operations/routes/deviceEnrollmentRoutes.js');

test('P0-WF-001: approval notification outbox is queued, never pre-marked SENT', () => {
  const helperStart = approvalController.indexOf('async function sendNotificationAndOutbox');
  const helperEnd = approvalController.indexOf('function normalizeId', helperStart);
  const helper = approvalController.slice(helperStart, helperEnd);
  assert.ok(helper.includes("status: 'QUEUED'"));
  assert.equal(helper.includes("status: 'SENT'"), false);
  assert.equal(helper.includes('sentAt: new Date()'), false);
});

test('P0-WF-002: other direct notification outbox producers do not claim SENT before provider delivery', () => {
  for (const source of [payrollQueryController, loanAdvanceController, settingsController, attendanceController]) {
    assert.equal(/NotificationOutbox\.create\([\s\S]{0,1600}status:\s*'SENT'/.test(source), false);
  }
});

test('P0-WF-003: leave request and approval are committed in one MongoDB transaction', () => {
  const start = leaveController.indexOf('const applyLeave');
  const end = leaveController.indexOf('// 6. GET /api/v1/leave/requests', start);
  const block = leaveController.slice(start, end);
  assert.ok(block.includes('session.withTransaction'));
  assert.ok(block.includes('await leave.save({ session })'));
  assert.ok(block.includes('await approval.save({ session })'));
  assert.ok(block.includes("sequenceKey: 'APPROVAL'"));
  assert.equal(block.includes("|| 'ZC-0001'"), false);
});

test('P0-WF-004: leave submission rejects client cafe outside authenticated assignments', () => {
  const start = leaveController.indexOf('const applyLeave');
  const end = leaveController.indexOf('// 6. GET /api/v1/leave/requests', start);
  const block = leaveController.slice(start, end);
  assert.ok(block.includes('CAFE_ACCESS_DENIED'));
  assert.ok(block.includes('CAFE_SCOPE_REQUIRED'));
});

test('P0-WF-005: shift-change request and approval are committed atomically', () => {
  const start = shiftController.indexOf('const createSelfShiftChangeRequest');
  const end = shiftController.indexOf('// 2.', start);
  const block = shiftController.slice(start, end);
  assert.ok(block.includes('session.withTransaction'));
  assert.ok(block.includes('await shiftRequest.save({ session })'));
  assert.ok(block.includes('await approval.save({ session })'));
  assert.ok(block.includes("sequenceKey: 'SHIFT_CHANGE_REQUEST'"));
  assert.equal(block.includes("|| 'ZC-0001'"), false);
});

test('P0-WF-006: shift-change cafe scope is fail-closed', () => {
  const start = shiftController.indexOf('const createSelfShiftChangeRequest');
  const end = shiftController.indexOf('// 2.', start);
  const block = shiftController.slice(start, end);
  assert.ok(block.includes('CAFE_ACCESS_DENIED'));
  assert.ok(block.includes('CAFE_SCOPE_REQUIRED'));
});


test('P0-WF-007: company identity lookup is strictly organisation scoped', () => {
  assert.ok(companyIdentityService.includes("organisationId: normalizedOrganisationId"));
  assert.ok(companyIdentityService.includes("status: 'CURRENT'"));
  assert.equal(companyIdentityService.includes("$or: [{ organisationId }, { status: 'CURRENT' }]"), false);
});

test('P0-WF-008: outlet branding lookup cannot resolve a cafe from another organisation', () => {
  assert.ok(companyIdentityService.includes("Cafe.findOne({ organisationId: normalizedOrganisationId, cafeId })"));
  assert.equal(companyIdentityService.includes("Cafe.findOne({ cafeId })"), false);
  assert.ok(companyIdentityService.includes("'ORGANISATION_REQUIRED'"));
});


test('P0-WF-009: approval decision and target entity use canonical retryable transaction wrapper', () => {
  const start = approvalController.indexOf('const decideApproval');
  const block = approvalController.slice(start);
  assert.ok(approvalController.includes("executeTransactionWithRetry"));
  assert.ok(block.includes('executeTransactionWithRetry'));
  assert.ok(block.includes('applyApprovalEntityDecision'));
  assert.ok(block.includes("maxTransientRetries: 5"));
  assert.ok(block.includes("maxCommitRetries: 3"));
  assert.equal(block.includes('[EXPENSE_SYNC_WARN]'), false);
  assert.equal(block.includes('[SHIFT_SYNC_WARN]'), false);
  assert.equal(block.includes('[PROFILE_SYNC_WARN]'), false);
});

test('P0-WF-010: profile change request persists proposed values and Approval atomically', () => {
  assert.ok(settingsController.includes('session.withTransaction'));
  assert.ok(settingsController.includes('proposedValues: newValues || {}'));
  assert.ok(settingsController.includes('await pcr.save({ session })'));
  assert.ok(settingsController.includes('await approval.save({ session })'));
  assert.equal(settingsController.includes('APP-344807-'), false);
});

test('P0-WF-011: attendance correction create/review paths are transactionally coupled to Approval', () => {
  const createStart = attendanceController.indexOf('const requestStaffCorrection = asyncHandler');
  const reviewStart = attendanceController.indexOf('const reviewStaffCorrection = asyncHandler');
  const createBlock = attendanceController.slice(createStart, reviewStart);
  const reviewEnd = attendanceController.indexOf('// 16.', reviewStart);
  const reviewBlock = attendanceController.slice(reviewStart, reviewEnd);

  assert.ok(createBlock.includes('session.withTransaction'));
  assert.ok(createBlock.includes('await approval.save({ session })'));
  assert.equal(createBlock.includes("|| 'ZC-0001'"), false);
  assert.ok(createBlock.includes("'CAFE_SCOPE_REQUIRED'"));

  assert.ok(reviewBlock.includes('session.withTransaction'));
  assert.ok(reviewBlock.includes("'PRIMARY_MASTER_AUTHORITY_REQUIRED'"));
  assert.ok(reviewBlock.includes('await approval.save({ session })'));
  assert.equal(reviewBlock.includes('[ATTENDANCE_APPROVAL_SYNC_WARN]'), false);
});

test('P0-WF-012: outbox has durable lease fields and atomic claim processing', () => {
  assert.ok(outboxModel.includes('lockedBy'));
  assert.ok(outboxModel.includes('lockedUntil'));
  assert.ok(outboxModel.includes('leaseVersion'));
  assert.ok(notificationService.includes('findOneAndUpdate'));
  assert.ok(notificationService.includes("status: 'PROCESSING'"));
  assert.ok(notificationService.includes('processDueOutbox'));
  assert.ok(notificationService.includes('quarantineExpiredProcessingLeases'));
});

test('P0-WF-013: production server lifecycle starts and stops the outbox worker', () => {
  assert.ok(serverSource.includes('startNotificationOutboxWorker();'));
  assert.ok(serverSource.includes('await stopNotificationOutboxWorker();'));
  assert.ok(outboxWorker.includes("JOB-NOTIFICATION-OUTBOX-DISPATCH"));
  assert.ok(outboxWorker.includes('setInterval'));
});


test('P0-WF-014: operational café lifecycle is fail-closed without attendance geofence', () => {
  assert.ok(cafeService.includes("'CAFE_GEOFENCE_REQUIRED'"));
  assert.ok(cafeService.includes('Attendance geofence coordinates are missing or invalid.'));
  assert.ok(cafeService.includes('Café activation requires valid latitude and longitude'));
  assert.ok(cafeService.includes('geofenceRadiusMetres < 10'));
  assert.ok(cafeService.includes('geofenceRadiusMetres > 1000'));
});

test('P0-WF-015: café edits merge address before $set so geofence is not erased', () => {
  const start = cafeController.indexOf('const updateCafe = asyncHandler');
  const end = cafeController.indexOf('const changeCafeStatus = asyncHandler', start);
  const block = cafeController.slice(start, end);

  assert.ok(block.includes('...(existingCafe.address?.toObject'));
  assert.ok(block.includes('...updates.address'));
  assert.ok(block.includes('normalizeCafeGeofenceAddress(mergedAddress, { required: true })'));
  assert.equal(
    /\$set:\s*updates/.test(block),
    true,
    'Merged updates should be persisted only after server-side address/geofence normalization'
  );
});

test('P0-WF-016: Primary Master café create/edit UI exposes geofence capture and radius controls', () => {
  assert.ok(cafeCreateModal.includes('wiz-f-latitude'));
  assert.ok(cafeCreateModal.includes('wiz-f-longitude'));
  assert.ok(cafeCreateModal.includes('wiz-f-geofence-radius'));
  assert.ok(cafeCreateModal.includes('wiz-use-current-location-btn'));
  assert.ok(cafeCreateModal.includes('navigator.geolocation.getCurrentPosition'));

  assert.ok(administrationPage.includes('edit-cafe-latitude'));
  assert.ok(administrationPage.includes('edit-cafe-longitude'));
  assert.ok(administrationPage.includes('edit-cafe-geofence-radius'));
  assert.ok(administrationPage.includes('edit-cafe-use-location'));
});


test('P0-WF-017: staff attendance UI contains no synthetic attendance/timecard facts', () => {
  for (const forbidden of [
    '148.5h',
    '94.2%',
    '14 Aug 2026',
    '08 Aug 2026',
    'In Radius (8m)',
    'ALL SIGNALS READY',
    'retained for 90 days',
    'valid for 90 days',
    'Morning Shift (09:00 – 17:00)',
  ]) {
    assert.equal(
      staffAttendancePage.includes(forbidden),
      false,
      `Synthetic attendance value must not return: ${forbidden}`
    );
  }

  assert.ok(staffAttendancePage.includes('/attendance/policy'));
  assert.ok(staffAttendancePage.includes('/attendance/corrections/mine?month='));
  assert.ok(staffAttendancePage.includes('istLocalDateTimeToIso'));
  assert.ok(staffAttendancePage.includes('T${timeStr}:00+05:30'));
});

test('P0-WF-018: employee correction read contract is self-scoped and persists break minutes', () => {
  assert.ok(attendanceRoutes.includes("router.get('/corrections/mine', getStaffCorrections)"));
  assert.ok(correctionModel.includes('requestedBreakMinutes'));
  const start = attendanceController.indexOf('const getStaffCorrections = asyncHandler');
  const end = attendanceController.indexOf('// 15b.', start);
  const block = attendanceController.slice(start, end);
  assert.ok(block.includes('organisationId'));
  assert.ok(block.includes('userId'));
  assert.ok(block.includes('businessDate'));
});

test('P0-WF-019: missing attendance evidence never defaults to verified', () => {
  assert.ok(attendanceController.includes('qrVerified: checkInEvidence?.qrVerified ?? false'));
  assert.ok(attendanceController.includes('geofenceVerified: checkInEvidence?.geofenceVerified ?? false'));
  assert.ok(attendanceController.includes('qrVerified: checkOutEvidence?.qrVerified ?? false'));
  assert.ok(attendanceController.includes('geofenceVerified: checkOutEvidence?.geofenceVerified ?? false'));
});

test('P0-WF-020: today endpoint does not manufacture a shift when roster resolution fails', () => {
  const start = attendanceController.indexOf('const getStaffToday = asyncHandler');
  const end = attendanceController.indexOf('// 12. POST /api/v1/attendance/check-in', start);
  const block = attendanceController.slice(start, end);
  assert.equal(block.includes("'SH-MRN-01'"), false);
  assert.equal(block.includes("'Morning Roastery Shift'"), false);
  assert.equal(block.includes('T09:00:00.000Z'), false);
  assert.equal(block.includes('T17:30:00.000Z'), false);
  assert.ok(block.includes('} : null;'));
});

test('P0-WF-021: staff shift-request surfaces do not submit fabricated STANDARD/MORNING values', () => {
  const attendanceShiftStart = staffAttendancePage.indexOf('function openShiftChangeModal');
  const attendanceShiftBlock = staffAttendancePage.slice(attendanceShiftStart);
  assert.equal(attendanceShiftBlock.includes('Morning Shift (09:00 – 17:00)'), false);
  assert.equal(attendanceShiftBlock.includes('Morning Duty Shift (07:00 – 15:30)'), false);

  const homeShiftStart = staffHomePage.indexOf('function openScheduleRequestModal');
  const homeShiftEnd = staffHomePage.indexOf('// ── MODAL 3:', homeShiftStart);
  const homeShiftBlock = staffHomePage.slice(homeShiftStart, homeShiftEnd);
  assert.equal(homeShiftBlock.includes('currentShift: "STANDARD"'), false);
  assert.equal(homeShiftBlock.includes('prefTime || "MORNING"'), false);
});


test('P0-WF-022: attendance selfie FormData is parsed by bounded multipart middleware', () => {
  assert.ok(attendanceRoutes.includes("const multer = require('multer')"));
  assert.ok(attendanceRoutes.includes('storage: multer.memoryStorage()'));
  assert.ok(attendanceRoutes.includes('const ATTENDANCE_SELFIE_MAX_BYTES = 5 * 1024 * 1024'));
  assert.ok(attendanceRoutes.includes('fileSize: ATTENDANCE_SELFIE_MAX_BYTES'));
  assert.ok(attendanceRoutes.includes("attendanceSelfieUpload.single('selfie')"));
  assert.ok(attendanceController.includes('if (request.file)'));
  assert.ok(attendanceController.includes('request.file.buffer'));
});

test('P0-WF-023: check-in and check-out keep distinct selfie evidence and expose it from the calendar', () => {
  const checkInStart = attendanceController.indexOf('const staffCheckIn = asyncHandler');
  const checkOutStart = attendanceController.indexOf('const staffCheckOut = asyncHandler');
  const checkInBlock = attendanceController.slice(checkInStart, checkOutStart);
  const checkOutEnd = attendanceController.indexOf('// 13a.', checkOutStart) > checkOutStart
    ? attendanceController.indexOf('// 13a.', checkOutStart)
    : attendanceController.indexOf('// 13c.', checkOutStart);
  const checkOutBlock = attendanceController.slice(checkOutStart, checkOutEnd > checkOutStart ? checkOutEnd : undefined);

  assert.ok(checkInBlock.includes("'SELFIE_EVIDENCE_REQUIRED'"));
  assert.ok(checkInBlock.includes('attendanceEvidence: {'));
  assert.ok(checkInBlock.includes('checkIn: checkInEvidence'));

  assert.ok(checkOutBlock.includes("'SELFIE_EVIDENCE_REQUIRED'"));
  assert.ok(checkOutBlock.includes("'SAME_SELFIE_REUSED'"));
  assert.ok(checkOutBlock.includes('attendance.attendanceEvidence.checkOut = checkOutEvidence'));

  assert.ok(attendanceController.includes('selfieMediaId: checkInEvidence?.selfieMediaId || attendance.selfieFileId'));
  assert.ok(attendanceController.includes('selfieMediaId: checkOutEvidence?.selfieMediaId || null'));

  assert.ok(staffAttendancePage.includes('📷 IN'));
  assert.ok(staffAttendancePage.includes('📷 OUT'));
  assert.ok(staffAttendancePage.includes('openAttendanceEvidenceViewer({ attendanceId: attId })'));
});

test('P0-WF-024: both management and Café Operations QR displays use the canonical staff attendance deep-link', () => {
  assert.ok(attendanceQrService.includes("returnTo=staff-attendance&attendanceQr="));
  assert.ok(mainFrontend.includes('sessionStorage.setItem("zamorin.pendingAttendanceQr", attendanceQr)'));
  assert.ok(staffAttendancePage.includes('sessionStorage.getItem("zamorin.pendingAttendanceQr")'));
  assert.ok(staffAttendancePage.includes('{ preScannedQrToken: pendingQr }'));

  assert.ok(cafeOpsApi.includes("attendanceQr: () => apiRequest('/devices/attendance/qr', { method: 'GET' })"));
  assert.ok(cafeOpsAttendanceKiosk.includes('global.CafeOpsApi.attendanceQr()'));
  assert.ok(cafeOpsAttendanceKiosk.includes('body.attendanceUrl'));
  assert.equal(cafeOpsAttendanceKiosk.includes('const QR_ROTATE_SECONDS = 30'), false);
  assert.ok(cafeOpsAttendanceKiosk.includes('body.remainingSeconds'));
  assert.ok(cafeOpsAttendanceKiosk.includes("Date.parse(body.expiresAt || '')"));
  assert.ok(cafeOpsAttendanceKiosk.includes('scheduleQrRefresh(root, qrExpiresAtMs - Date.now() + 250)'));
  assert.ok(cafeOpsDeviceRoutes.includes("router.get('/attendance/qr', deviceContext"));
  assert.ok(cafeOpsDeviceRoutes.includes('attendanceQrService.getActiveOrNewChallenge'));
  assert.ok(cafeOpsDeviceRoutes.includes('attendanceUrl: challenge.attendanceUrl'));
});


test('P0-WF-025: attendance media streaming cannot expose unlinked private files or retired Master authority', () => {
  const mediaStart = attendanceController.indexOf('const getEvidenceMedia = asyncHandler');
  const mediaEnd = attendanceController.indexOf('/**\n * GET /api/v1/attendance/evidence/record', mediaStart);
  const mediaBlock = attendanceController.slice(mediaStart, mediaEnd);

  assert.ok(mediaBlock.includes('fileId: mediaId.trim().toUpperCase(),'));
  assert.ok(mediaBlock.includes('organisationId,'));
  assert.ok(mediaBlock.includes("if (!attendance)"));
  assert.ok(mediaBlock.includes("'ATTENDANCE_EVIDENCE_NOT_FOUND'"));
  assert.ok(mediaBlock.includes("role === 'MASTER' && request.auth.isPrimaryMaster !== true"));
  assert.ok(mediaBlock.includes("'PRIMARY_MASTER_AUTHORITY_REQUIRED'"));

  const recordStart = attendanceController.indexOf('const getAttendanceEvidenceRecord = asyncHandler');
  const recordBlock = attendanceController.slice(recordStart);
  assert.ok(recordBlock.includes("role === 'MASTER' && request.auth.isPrimaryMaster !== true"));
  assert.ok(recordBlock.includes("'PRIMARY_MASTER_AUTHORITY_REQUIRED'"));
});


test('P0-WF-026: attendance policy UI does not manufacture geofence, retention, or compliance metrics', () => {
  for (const forbidden of [
    '50 Meters',
    '14.2 MB',
    '148 Photos',
    '100% Compliant',
    '0 Open Disputes',
    'Retention purge executed: 148 expired selfies deleted',
  ]) {
    assert.equal(
      attendanceShiftsPage.includes(forbidden),
      false,
      `Attendance governance UI must not fabricate: ${forbidden}`
    );
  }

  assert.ok(attendanceShiftsPage.includes('const geofenceDisplay = geofenceConfigured'));
  assert.ok(attendanceShiftsPage.includes('scopedCafe?.address?.geofenceRadiusMetres'));
  assert.ok(attendanceShiftsPage.includes('No legal pass/fail percentage is manufactured'));
  assert.ok(attendanceShiftsPage.includes('Distinct Check-In / Check-Out selfies'));
});


test('P0-WF-027: multipart limit failures are translated to controlled client errors', () => {
  assert.ok(errorHandlerSource.includes("error.name === 'MulterError'"));
  assert.ok(errorHandlerSource.includes("error.code === 'LIMIT_FILE_SIZE'"));
  assert.ok(errorHandlerSource.includes("code = 'UPLOAD_FILE_TOO_LARGE'"));
  assert.ok(errorHandlerSource.includes("statusCode = 413"));
  assert.ok(errorHandlerSource.includes("code = 'MULTIPART_UPLOAD_INVALID'"));
});

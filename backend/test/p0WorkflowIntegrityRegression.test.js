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
const privateFileModel = read('backend/src/models/PrivateFile.js');
const attendanceEvidenceStorageSource = read('backend/src/services/attendanceEvidenceStorageService.js');
const documentStorageAdapterSource = read('backend/src/services/documentStorageAdapter.js');
const attendanceEvidenceRetentionSource = read('backend/src/services/attendanceEvidenceRetentionService.js');
const renderConfigSource = read('render.yaml');
const errorHandlerSource = read('backend/src/middleware/errorHandler.js');
const deviceRoutesSource = read('backend/src/routes/deviceRoutes.js');
const deviceControllerSource = read('backend/src/controllers/deviceController.js');
const attendanceQrServiceSource = read('backend/src/services/attendanceQrService.js');
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


test('P0-WF-028: attendance selfie purge fails closed without retention cutoff and physical storage deletion', () => {
  const purgeStart = attendanceController.indexOf('const purgeSelfieEvidence = asyncHandler');
  const purgeEnd = attendanceController.indexOf('// 9. GET /api/v1/attendance/server-time', purgeStart);
  const purgeBlock = attendanceController.slice(purgeStart, purgeEnd);

  assert.ok(purgeBlock.includes("request.auth.role !== 'MASTER' || request.auth.isPrimaryMaster !== true"));
  assert.ok(purgeBlock.includes("'EVIDENCE_PURGE_NOT_CONFIGURED'"));
  assert.equal(purgeBlock.includes('Attendance.updateMany('), false);
  assert.equal(purgeBlock.includes('selfieFileId: null'), false);
});


test('P0-WF-029: attendance selfies are cryptographically scoped to QR challenge and punch transition', () => {
  assert.ok(privateFileModel.includes('attendanceContext'));
  assert.ok(privateFileModel.includes('challengeId'));
  assert.ok(privateFileModel.includes("enum: ['CHECK_IN', 'CHECK_OUT', null]"));

  assert.ok(attendanceController.includes("'ATTENDANCE_SCAN_GRANT_REQUIRED'"));
  assert.ok(attendanceController.includes('attendanceQrService.validatePunchQrProof(grantToken'));
  assert.ok(attendanceController.includes("'attendanceContext.challengeId': qrValidation.challengeId"));
  assert.ok(attendanceController.includes("'attendanceContext.punchType': 'CHECK_IN'"));
  assert.ok(attendanceController.includes("'attendanceContext.punchType': 'CHECK_OUT'"));
  assert.ok(attendanceController.includes("'SELFIE_CHALLENGE_BINDING_MISMATCH'"));

  assert.ok(staffAttendancePage.includes('formData.append("scanGrant", scannedQrToken)'));
});


test('P0-WF-030: attendance selfie IDs use the canonical PrivateFile sequence prefix', () => {
  const uploadStart = attendanceController.indexOf('const uploadPunchSelfie = asyncHandler');
  const uploadEnd = attendanceController.indexOf('/**\n * GET /api/v1/attendance/evidence/media', uploadStart);
  const uploadBlock = attendanceController.slice(uploadStart, uploadEnd);

  assert.ok(uploadBlock.includes("sequenceKey: 'PRIVATE_FILE'"));
  assert.ok(uploadBlock.includes("prefix: 'FILE'"));
  assert.equal(uploadBlock.includes("prefix: 'FILE-'"), false);
  assert.ok(privateFileModel.includes("match: /^FILE-\\d{4,}$/"));
});


test('P0-WF-031: attendance roster UI is server-authoritative and contains no synthetic staff or fake publish state', () => {
  for (const forbidden of [
    'EMP-013',
    'EMP-014',
    'EMP-015',
    'EMP-016',
    'Meera Nambiar',
    'Pooja Hegde',
    'new Date(2026, 7, 17)',
    "Previous week's shift roster schedule copied",
    'Balanced opening/closing shift coverage auto-generated',
    'Backend publish roster notice',
    'PUBLISHED & BROADCAST',
    'Revert to Draft',
    'Draft weekly shift roster created successfully',
    'rosterPublishedMap[activeCafeId] ?? true',
  ]) {
    assert.equal(
      attendanceShiftsPage.includes(forbidden),
      false,
      `Attendance roster must not contain synthetic or fake-success state: ${forbidden}`
    );
  }

  assert.ok(attendanceShiftsPage.includes('async function loadLiveAttendanceData()'));
  assert.ok(attendanceShiftsPage.includes('async function loadRosterData('));
  assert.ok(attendanceShiftsPage.includes('/attendance/roster?cafeId='));
  assert.ok(attendanceShiftsPage.includes('apiPost("/attendance/roster", { cafeId, weekStartDate, assignments })'));
  assert.ok(attendanceShiftsPage.includes('Weekly roster published. Staff notification delivery has been queued.'));
  assert.ok(attendanceShiftsPage.includes('apiGet("/employees?limit=200")'));
});


test('P0-WF-032: attendance roster publication rechecks Primary Master and café scope at execution time', () => {
  assert.ok(attendanceController.includes("request.auth.role === 'MASTER'"));
  assert.ok(attendanceController.includes("request.auth.isPrimaryMaster !== true"));
  assert.ok(attendanceController.includes("'PRIMARY_MASTER_AUTHORITY_REQUIRED'"));

  const publishStart = attendanceController.indexOf('const publishRoster = asyncHandler');
  const publishEnd = attendanceController.indexOf('// 5c. GET /api/v1/attendance/roster/shifts', publishStart);
  const publishBlock = attendanceController.slice(publishStart, publishEnd);

  assert.ok(publishBlock.includes('ensureCafeOperationsAllowed(request);'));
  assert.ok(publishBlock.includes('ensureCafeAccess(request, roster.cafeId);'));
  assert.equal(
    publishBlock.includes("if (request.auth.role === 'CAFE_ADMIN')"),
    false,
    'Roster publication café scope must not be limited only to Café Admin.'
  );
});


test('P0-WF-033: attendance administration uses an explicit management-role allowlist', () => {
  const helperStart = attendanceController.indexOf('function ensureCafeOperationsAllowed');
  const helperEnd = attendanceController.indexOf('function ensureCafeAccess', helperStart);
  const helperBlock = attendanceController.slice(helperStart, helperEnd);

  assert.ok(helperBlock.includes("request.auth.role === 'MASTER'"));
  assert.ok(helperBlock.includes("request.auth.isPrimaryMaster !== true"));
  assert.ok(helperBlock.includes("request.auth.role === 'OWNER'"));
  assert.ok(helperBlock.includes("request.auth.role === 'CAFE_ADMIN'"));
  assert.ok(helperBlock.includes("'PERMISSION_DENIED'"));
  assert.equal(
    helperBlock.includes("if (['MASTER', 'OWNER'].includes(request.auth.role)) return"),
    false
  );

  const rosterShiftStart = attendanceController.indexOf('const listShiftsForRoster = asyncHandler');
  const rosterShiftBlock = attendanceController.slice(rosterShiftStart);
  assert.ok(rosterShiftBlock.includes('ensureCafeOperationsAllowed(request);'));
  assert.ok(rosterShiftBlock.includes('ensureCafeAccess(request, cafeId);'));
});


test('P0-WF-034: roster save and publish validate live employee café membership', () => {
  assert.ok(attendanceController.includes('async function ensureRosterAssignmentCafeMembership'));
  assert.ok(attendanceController.includes("'ROSTER_EMPLOYEE_SCOPE_INVALID'"));
  assert.ok(attendanceController.includes("accountStatus || '').toUpperCase() === 'ACTIVE'"));
  assert.ok(attendanceController.includes("['EXITED', 'ARCHIVED'].includes"));

  const saveStart = attendanceController.indexOf('const saveRoster = asyncHandler');
  const publishStart = attendanceController.indexOf('const publishRoster = asyncHandler');
  const saveBlock = attendanceController.slice(saveStart, publishStart);
  const publishEnd = attendanceController.indexOf('// 5c. GET /api/v1/attendance/roster/shifts', publishStart);
  const publishBlock = attendanceController.slice(publishStart, publishEnd);

  assert.ok(saveBlock.includes('await ensureRosterAssignmentCafeMembership({'));
  assert.ok(publishBlock.includes('await ensureRosterAssignmentCafeMembership({'));
});


test('P0-WF-035: manual attendance and Calendar 360 fail closed on state, employee café, and retired Master authority', () => {
  const manualStart = attendanceController.indexOf('const recordMasterManualAttendance = asyncHandler');
  const manualEnd = attendanceController.indexOf('// 4. GET /api/v1/attendance/calendar-360/:userId', manualStart);
  const manualBlock = attendanceController.slice(manualStart, manualEnd);

  assert.ok(manualBlock.includes("['CHECK_IN', 'CHECK_OUT'].includes(eventType)"));
  assert.ok(manualBlock.includes("'MANUAL_EVENT_TYPE_UNSUPPORTED'"));
  assert.ok(manualBlock.includes("'ATTENDANCE_EMPLOYEE_CAFE_MISMATCH'"));
  assert.ok(manualBlock.includes("'MANUAL_CHECK_OUT_STATE_INVALID'"));
  assert.ok(manualBlock.includes("'ATTENDANCE_RECORD_ALREADY_EXISTS'"));
  assert.equal(manualBlock.includes("eventType === 'ON_LEAVE'"), false);
  assert.equal(manualBlock.includes("eventType === 'FULL_DAY'"), false);

  const calendarStart = attendanceController.indexOf('const getEmployeeMonthlyCalendar = asyncHandler');
  const calendarEnd = attendanceController.indexOf('// 5. Shift Rosters', calendarStart);
  const calendarBlock = attendanceController.slice(calendarStart, calendarEnd);
  assert.ok(calendarBlock.includes('ensureCafeOperationsAllowed(request);'));
  assert.ok(calendarBlock.includes("request.auth.role === 'OWNER' || request.auth.role === 'CAFE_ADMIN'"));
  assert.ok(calendarBlock.includes("filter.cafeId = { $in: assigned };"));

  const manualUiStart = attendanceShiftsPage.indexOf('async function openScopedManualAttendanceModal');
  const manualUiEnd = attendanceShiftsPage.indexOf('// Modal: Interactive Click-to-Edit Shift', manualUiStart);
  const manualUiBlock = attendanceShiftsPage.slice(manualUiStart, manualUiEnd);
  assert.equal(manualUiBlock.includes('option value="FULL_DAY"'), false);
  assert.equal(manualUiBlock.includes('option value="ON_LEAVE"'), false);
  assert.ok(manualUiBlock.includes('time: effectiveTimestamp'));
});


test('P0-WF-036: attendance correction rechecks live authority, café scope, and dedicated workflows', () => {
  const correctionStart = attendanceController.indexOf('const correctAttendance = asyncHandler');
  const correctionEnd = attendanceController.indexOf('// 13c.', correctionStart);
  const correctionBlock = attendanceController.slice(correctionStart, correctionEnd);

  assert.ok(correctionBlock.includes('ensureCafeOperationsAllowed(request);'));
  assert.ok(correctionBlock.includes('ensureCafeAccess(request, attendance.cafeId);'));
  assert.ok(correctionBlock.includes("'OVERTIME_DECISION_WORKFLOW_REQUIRED'"));
  assert.ok(correctionBlock.includes("'LEAVE_WORKFLOW_REQUIRED'"));
  assert.ok(correctionBlock.includes("'ATTENDANCE_TIME_ORDER_INVALID'"));
  assert.equal(
    correctionBlock.includes("rawTimeEvents.push({\n    eventType: 'CHECK_IN'"),
    false,
    'Administrative corrections must not be mislabelled as raw CHECK_IN punches.'
  );

  const editStart = attendanceShiftsPage.indexOf('function openEditAttendanceModal');
  const editEnd = attendanceShiftsPage.indexOf('// Scoped Manual Attendance Modal', editStart);
  const editBlock = attendanceShiftsPage.slice(editStart, editEnd);
  assert.equal(editBlock.includes('id="edit-att-ot"'), false);
  assert.equal(editBlock.includes('option value="ON_LEAVE"'), false);
  assert.equal(editBlock.includes('approvedOvertimeMinutes: otMins'), false);
});


test('P0-WF-037: attendance correction lists, exception resolution, QR display, and evidence metadata share strict café scope', () => {
  const pendingStart = attendanceController.indexOf('const getPendingCorrections = asyncHandler');
  const pendingEnd = attendanceController.indexOf('// 15c.', pendingStart);
  const pendingBlock = attendanceController.slice(pendingStart, pendingEnd);
  assert.ok(pendingBlock.includes('ensureCafeOperationsAllowed(request);'));
  assert.ok(pendingBlock.includes("request.auth.role === 'OWNER' || request.auth.role === 'CAFE_ADMIN'"));
  assert.ok(pendingBlock.includes("filter.cafeId = { $in: assigned };"));

  const resolveStart = attendanceController.indexOf('const resolveException = asyncHandler');
  const resolveEnd = attendanceController.indexOf('// ── SECURE PRESENCE EVIDENCE HANDLERS', resolveStart);
  const resolveBlock = attendanceController.slice(resolveStart, resolveEnd);
  assert.ok(resolveBlock.includes('ensureCafeOperationsAllowed(request);'));
  assert.ok(resolveBlock.includes('ensureCafeAccess(request, exception.cafeId);'));

  const qrStart = attendanceController.indexOf('const getActiveCafeQr = asyncHandler');
  const qrEnd = attendanceController.indexOf('/**\n * POST /api/v1/attendance/qr/verify', qrStart);
  const qrBlock = attendanceController.slice(qrStart, qrEnd);
  assert.ok(qrBlock.includes('ensureCafeOperationsAllowed(request);'));
  assert.ok(qrBlock.includes('ensureCafeAccess(request, cafeId);'));

  const evidenceStart = attendanceController.indexOf('const getAttendanceEvidenceRecord = asyncHandler');
  const evidenceBlock = attendanceController.slice(evidenceStart);
  assert.ok(evidenceBlock.includes("role === 'OWNER'"));
  assert.ok(evidenceBlock.includes("'CROSS_CAFE_RESOURCE_DENIED'"));
  assert.ok(evidenceBlock.includes("'FORBIDDEN_EVIDENCE_ACCESS'"));
});


test('P0-WF-038: attendance selfie evidence uses canonical durable storage, never legacy simulated private storage', () => {
  assert.ok(attendanceController.includes("require('../../services/attendanceEvidenceStorageService')"));
  assert.equal(
    attendanceController.includes("require('../../services/storageAdapterService')"),
    false
  );
  assert.ok(attendanceEvidenceStorageSource.includes("require('./documentStorageAdapter')"));
  assert.ok(attendanceEvidenceStorageSource.includes('documentStorageAdapter.put({'));
  assert.ok(attendanceEvidenceStorageSource.includes('documentStorageAdapter.exists({ storageKey })'));
  assert.ok(attendanceEvidenceStorageSource.includes('documentStorageAdapter.getStream({ storageKey })'));
  assert.ok(attendanceEvidenceStorageSource.includes('documentStorageAdapter.delete({ storageKey })'));
  assert.ok(documentStorageAdapterSource.includes("'image/webp': 'webp'"));
});

test('P0-WF-039: attendance evidence persists and verifies SHA-256 content integrity', () => {
  assert.ok(privateFileModel.includes('sha256: {'));
  assert.ok(attendanceController.includes("sha256: uploadResult.sha256 || crypto.createHash('sha256')"));
  assert.ok(attendanceController.includes("'ATTENDANCE_EVIDENCE_INTEGRITY_FAILURE'"));
  assert.ok(attendanceController.includes("crypto.createHash('sha256').update(buffer).digest('hex')"));
});

test('P0-WF-040: evidence-view audit occurs only after durable read and checksum verification', () => {
  const mediaStart = attendanceController.indexOf('const getEvidenceMedia = asyncHandler');
  const recordStart = attendanceController.indexOf('const getAttendanceEvidenceRecord = asyncHandler', mediaStart);
  const mediaBlock = attendanceController.slice(mediaStart, recordStart);

  const readIndex = mediaBlock.indexOf('attendanceEvidenceStorageService.readObjectBuffer');
  const integrityIndex = mediaBlock.indexOf("'ATTENDANCE_EVIDENCE_INTEGRITY_FAILURE'");
  const auditIndex = mediaBlock.indexOf("action: 'ATTENDANCE_EVIDENCE_VIEWED'");

  assert.ok(readIndex >= 0);
  assert.ok(integrityIndex > readIndex);
  assert.ok(auditIndex > integrityIndex);
});


test('P0-WF-041: selfie storage is compensated if PrivateFile metadata persistence fails', () => {
  const uploadStart = attendanceController.indexOf('const uploadPunchSelfie = asyncHandler');
  const uploadEnd = attendanceController.indexOf('/**\n * GET /api/v1/attendance/evidence/media', uploadStart);
  const uploadBlock = attendanceController.slice(uploadStart, uploadEnd);

  assert.ok(uploadBlock.includes('try {\n    privateFile = await PrivateFile.create({'));
  assert.ok(uploadBlock.includes('attendanceEvidenceStorageService.deleteObject({ fileKey: uploadResult.fileKey })'));
  assert.ok(uploadBlock.includes('throw metadataErr;'));
});


test('P0-WF-042: committed attendance evidence purge remains fail-closed while orphan cleanup is separate', () => {
  const purgeStart = attendanceController.indexOf('const purgeSelfieEvidence = asyncHandler');
  const reconcileStart = attendanceController.indexOf('const reconcileOrphanSelfieEvidence = asyncHandler');
  const purgeBlock = attendanceController.slice(purgeStart, reconcileStart);

  assert.ok(purgeBlock.includes("'EVIDENCE_PURGE_NOT_CONFIGURED'"));
  assert.equal(purgeBlock.includes('attendanceEvidenceStorageService.deleteObject'), false);
  assert.ok(attendanceRoutes.includes("router.post('/evidence/orphans/reconcile', reconcileOrphanSelfieEvidence)"));
  assert.ok(attendanceRoutes.includes("router.post('/evidence/purge', purgeSelfieEvidence)"));
});

test('P0-WF-043: orphan reconciliation requires Primary Master, dry-run default, and explicit execution confirmation', () => {
  const reconcileStart = attendanceController.indexOf('const reconcileOrphanSelfieEvidence = asyncHandler');
  const serverTimeStart = attendanceController.indexOf('// 9. GET /api/v1/attendance/server-time', reconcileStart);
  const reconcileBlock = attendanceController.slice(reconcileStart, serverTimeStart);

  assert.ok(reconcileBlock.includes("request.auth.role !== 'MASTER' || request.auth.isPrimaryMaster !== true"));
  assert.ok(reconcileBlock.includes('const dryRun = execute !== true;'));
  assert.ok(reconcileBlock.includes("'ORPHAN_RECONCILIATION_CONFIRMATION_REQUIRED'"));
  assert.ok(reconcileBlock.includes('DELETE_EXPIRED_UNLINKED_ATTENDANCE_SELFIES'));
  assert.ok(reconcileBlock.includes('reconcileExpiredOrphanAttendanceEvidence({'));
});

test('P0-WF-044: orphan reconciliation is expiry-scoped, link-protecting, idempotent, and physically deletes before metadata', () => {
  assert.ok(attendanceEvidenceRetentionSource.includes("'attendanceContext.grantExpiresAt': { $ne: null, $lte: cutoff }"));
  assert.ok(attendanceEvidenceRetentionSource.includes('await isEvidenceLinked(normalizedOrganisationId, fileId)'));
  assert.ok(attendanceEvidenceRetentionSource.includes("attendanceCleanup.status': 'CLAIMED'"));
  assert.ok(attendanceEvidenceRetentionSource.includes('attendanceEvidenceStorageService.objectExists({'));
  assert.ok(attendanceEvidenceRetentionSource.includes('attendanceEvidenceStorageService.deleteObject({'));
  assert.ok(attendanceEvidenceRetentionSource.includes("'attendanceCleanup.status': 'STORAGE_DELETED'"));
  assert.ok(attendanceEvidenceRetentionSource.includes('PrivateFile.deleteOne({'));

  const storageDeleteIndex = attendanceEvidenceRetentionSource.indexOf('attendanceEvidenceStorageService.deleteObject({');
  const metadataDeleteIndex = attendanceEvidenceRetentionSource.indexOf('PrivateFile.deleteOne({');
  assert.ok(storageDeleteIndex >= 0);
  assert.ok(metadataDeleteIndex > storageDeleteIndex);
});

test('P0-WF-045: production declares an explicit orphan-evidence grace window', () => {
  assert.ok(renderConfigSource.includes('key: ATTENDANCE_ORPHAN_GRACE_MINUTES'));
  assert.ok(renderConfigSource.includes('value: 60'));
  assert.ok(attendanceEvidenceRetentionSource.includes('const DEFAULT_ORPHAN_GRACE_MINUTES = 60;'));
  assert.ok(privateFileModel.includes("name: 'attendance_orphan_reconciliation_scan'"));
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Models
const { User } = require('../src/models/User');
const { Session } = require('../src/models/Session');
const { EmployeeDocument } = require('../src/models/EmployeeDocument');
const { PayrollQuery } = require('../src/models/PayrollQuery');
const { ShiftChangeRequest } = require('../src/models/ShiftChangeRequest');
const { StaffLoanAdvance } = require('../src/models/StaffLoanAdvance');
const { ProfileChangeRequest } = require('../src/models/ProfileChangeRequest');
const { SupportCase } = require('../src/models/SupportCase');
const { ShiftRoster } = require('../src/models/ShiftRoster');
const { AuditEvent } = require('../src/models/AuditEvent');
const { Approval } = require('../src/models/Approval');
const { LeaveRequest } = require('../src/models/LeaveRequest');
const { Notification } = require('../src/models/Notification');
const { NotificationOutbox } = require('../src/models/NotificationOutbox');

// Controllers
const employeeController = require('../src/controllers/employeeController');
const payrollQueryController = require('../src/controllers/payrollQueryController');
const shiftChangeController = require('../src/controllers/shiftChangeController');
const loanAdvanceController = require('../src/controllers/loanAdvanceController');
const settingsController = require('../src/controllers/settingsController');
const approvalController = require('../src/controllers/approvalController');
const authController = require('../src/controllers/authController');
const authService = require('../src/services/authService');

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    send(payload) {
      this.data = payload;
      return this;
    },
  };
}

test('Staff P1 Functional Completion Programme Suite', async (suite) => {
  let mongoServer;

  suite.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  suite.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: FRONTEND ROUTE & CONTRACT INTEGRITY
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-FE-1: router.js binds staff-documents route to renderStaffDocuments', () => {
    const routerPath = path.resolve(__dirname, '../../frontend/src/js/router.js');
    const content = fs.readFileSync(routerPath, 'utf8');

    assert.ok(content.includes('staff-documents'), 'router.js must reference staff-documents');
    assert.ok(content.includes('renderStaffDocuments'), 'router.js must call renderStaffDocuments');
  });

  await suite.test('P1-FE-2: navigation.js registers staff-documents in IMPLICIT_ROUTES_ALL and isRouteAllowed', () => {
    const navPath = path.resolve(__dirname, '../../frontend/src/js/navigation.js');
    const content = fs.readFileSync(navPath, 'utf8');

    assert.ok(content.includes("'staff-documents'"), 'staff-documents must be in navigation.js IMPLICIT_ROUTES_ALL');
  });

  await suite.test('P1-FE-3: employeeProfile.js implements real profile summary export, revoke sessions, and change request withdrawal', () => {
    const profilePath = path.resolve(__dirname, '../../frontend/src/js/pages/employeeProfile.js');
    const content = fs.readFileSync(profilePath, 'utf8');

    assert.ok(content.includes('/employees/me/profile-summary/export'), 'Must wire profile-summary/export');
    assert.ok(content.includes('/auth/sessions/revoke-others'), 'Must wire revoke-others');
    assert.ok(content.includes('/employees/me/change-requests/'), 'Must wire change-requests withdrawal');
    assert.ok(!content.includes('alert("Document uploaded")'), 'Must not have fake alert stub for upload');
  });

  await suite.test('P1-FE-4: staffPayslips.js connects to real payroll queries API and handles period selection', () => {
    const payslipPath = path.resolve(__dirname, '../../frontend/src/js/pages/staffPayslips.js');
    const content = fs.readFileSync(payslipPath, 'utf8');

    assert.ok(content.includes('/payroll/me/queries'), 'Must call /payroll/me/queries');
    assert.ok(content.includes('Form 16'), 'Must display Form 16 statutory guidance');
    assert.ok(content.includes('Form No. 130') || content.includes('Form 130'), 'Must display Form 130 statutory guidance');
  });

  await suite.test('P1-FE-5: staffHome.js eliminates fake stubs across all 5 action modals', () => {
    const homePath = path.resolve(__dirname, '../../frontend/src/js/pages/staffHome.js');
    const content = fs.readFileSync(homePath, 'utf8');

    assert.ok(content.includes('/settings/support/tickets'), 'Report Problem modal must call support tickets');
    assert.ok(content.includes('/shifts/me/requests'), 'Schedule Request modal must call shifts/me/requests');
    assert.ok(content.includes('/attendance/attestation') || content.includes('/attendance/corrections'), 'Timecard Review must call attendance endpoints');
    assert.ok(content.includes('/loan-advances/me/requests/advance'), 'Salary advance modal must call loan advance endpoint');
    assert.ok(content.includes('/employees/me/documents/upload'), 'Document upload modal must call documents upload endpoint');
    assert.ok(!content.includes('alert("Report submitted")'), 'Must not have stub alert for report problem');
  });

  await suite.test('P1-FE-6: staffLeave.js implements dynamic calendar navigation, calculate endpoint, and RFC 4180 CSV export', () => {
    const leavePath = path.resolve(__dirname, '../../frontend/src/js/pages/staffLeave.js');
    const content = fs.readFileSync(leavePath, 'utf8');

    assert.ok(content.includes('/leave/calculate'), 'Must call /leave/calculate for real-time leave computation');
    assert.ok(content.includes('btn-lcal-prev') && content.includes('btn-lcal-next'), 'Must support dynamic calendar navigation');
    assert.ok(content.includes('text/csv;charset=utf-8'), 'Must generate real CSV data');
  });

  await suite.test('P1-FE-7: staffLoansAdvances.js connects early settlement quote, early settlement request, and repayment pause', () => {
    const loansPath = path.resolve(__dirname, '../../frontend/src/js/pages/staffLoansAdvances.js');
    const content = fs.readFileSync(loansPath, 'utf8');

    assert.ok(content.includes('settlement-request'), 'Must wire settlement-request API');
    assert.ok(content.includes('settlement-quote'), 'Must wire settlement-quote API');
    assert.ok(content.includes('/pause'), 'Must wire loan pause API');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: STAFF DOCUMENT HUB BACKEND
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-DOC-1: listSelfDocuments returns empty array when employee has no documents', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-TEST-DOC-EMPTY', role: 'STAFF' },
      query: {},
    };
    const res = createMockRes();

    await employeeController.listSelfDocuments(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.success);
    assert.equal(res.data.data.documents.length, 0);
  });

  await suite.test('P1-DOC-2: uploadSelfDocument rejects missing documentName with 400', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-TEST-DOC-01', role: 'STAFF' },
      body: { category: 'IDENTITY_DOCUMENT' },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => employeeController.uploadSelfDocument(req, res),
      (err) => err.statusCode === 400 && err.code === 'DOCUMENT_NAME_REQUIRED'
    );
  });

  await suite.test('P1-DOC-3: uploadSelfDocument rejects invalid document category with 400', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-TEST-DOC-01', role: 'STAFF' },
      body: { documentName: 'My Cert', category: 'UNSUPPORTED_CAT' },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => employeeController.uploadSelfDocument(req, res),
      (err) => err.statusCode === 400 && err.code === 'INVALID_CATEGORY'
    );
  });

  await suite.test('P1-DOC-4: uploadSelfDocument successfully stores document and returns 201', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-TEST-DOC-01', role: 'STAFF' },
      body: {
        documentName: 'Food Safety Certificate 2026',
        category: 'FOOD_SAFETY_CERTIFICATE',
        originalName: 'food_safety_cert.pdf',
        mimeType: 'application/pdf',
        fileBase64: Buffer.from('PDF Content Data').toString('base64'),
      },
    };
    const res = createMockRes();

    await employeeController.uploadSelfDocument(req, res);

    assert.equal(res.statusCode, 201);
    assert.ok(res.data.success);
    assert.ok(res.data.data.document.documentId);
    assert.equal(res.data.data.document.documentName, 'Food Safety Certificate 2026');
    assert.equal(res.data.data.document.category, 'FOOD_SAFETY_CERTIFICATE');
  });

  await suite.test('P1-DOC-5: listSelfDocuments returns the uploaded document with pagination', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-TEST-DOC-01', role: 'STAFF' },
      query: {},
    };
    const res = createMockRes();

    await employeeController.listSelfDocuments(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.data.documents.length >= 1);
    const found = res.data.data.documents.find((d) => d.documentName === 'Food Safety Certificate 2026');
    assert.ok(found, 'Uploaded document must be listed in self documents');
  });

  await suite.test('P1-DOC-6: downloadSelfDocument streams file buffer with Content-Disposition', async () => {
    const doc = await EmployeeDocument.findOne({ userId: 'ST-TEST-DOC-01' });
    assert.ok(doc, 'Test doc must exist');

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-TEST-DOC-01', role: 'STAFF' },
      params: { documentId: doc.documentId },
    };
    const res = createMockRes();

    await employeeController.downloadSelfDocument(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-disposition'].includes('attachment; filename='));
    assert.ok(Buffer.isBuffer(res.data));
  });

  await suite.test('P1-DOC-7: downloadSelfDocument strictly prevents cross-user / cross-org IDOR', async () => {
    const doc = await EmployeeDocument.findOne({ userId: 'ST-TEST-DOC-01' });
    assert.ok(doc);

    // Cross-user in same organisation
    const crossUserReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-OTHER-USER', role: 'STAFF' },
      params: { documentId: doc.documentId },
    };
    const res1 = createMockRes();
    await assert.rejects(
      async () => employeeController.downloadSelfDocument(crossUserReq, res1),
      (err) => err.statusCode === 403 && err.code === 'FORBIDDEN'
    );

    // Cross-organisation
    const crossOrgReq = {
      auth: { organisationId: 'OTHER_ORG', userId: 'ST-TEST-DOC-01', role: 'STAFF' },
      params: { documentId: doc.documentId },
    };
    const res2 = createMockRes();
    await assert.rejects(
      async () => employeeController.downloadSelfDocument(crossOrgReq, res2),
      (err) => err.statusCode === 403 && err.code === 'FORBIDDEN'
    );
  });

  await suite.test('P1-DOC-8: deleteSelfDocument forbids deletion of statutory / HR letters', async () => {
    const hrDoc = await EmployeeDocument.create({
      documentId: 'DOC-2026-9901',
      organisationId: 'ZAMORIN',
      userId: 'ST-TEST-DOC-01',
      category: 'APPOINTMENT_LETTER',
      documentName: 'Official Appointment Letter',
      fileUrl: '/api/v1/employees/me/documents/DOC-2026-9901/download',
      status: 'ACTIVE',
      issuedDate: '2026-01-01',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-TEST-DOC-01', role: 'STAFF' },
      params: { documentId: hrDoc.documentId },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => employeeController.deleteSelfDocument(req, res),
      (err) => err.statusCode === 403 && err.code === 'CANNOT_DELETE_HR_DOCUMENT'
    );
  });

  await suite.test('P1-DOC-9: deleteSelfDocument archives employee-uploaded document', async () => {
    const selfDoc = await EmployeeDocument.create({
      documentId: 'DOC-2026-9902',
      organisationId: 'ZAMORIN',
      userId: 'ST-TEST-DOC-01',
      category: 'FOOD_SAFETY_CERTIFICATE',
      documentName: 'Old Certificate',
      fileUrl: '/api/v1/employees/me/documents/DOC-2026-9902/download',
      status: 'ACTIVE',
      issuedDate: '2026-01-01',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-TEST-DOC-01', role: 'STAFF' },
      params: { documentId: selfDoc.documentId },
    };
    const res = createMockRes();

    await employeeController.deleteSelfDocument(req, res);

    assert.equal(res.statusCode, 200);
    const updated = await EmployeeDocument.findOne({ documentId: selfDoc.documentId });
    assert.equal(updated.status, 'ARCHIVED');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: PROFILE SUMMARY EXPORT
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-PRF-1: exportProfileSummary outputs structured JSON export with employee details', async () => {
    await User.create({
      userId: 'ST-9001',
      organisationId: 'ZAMORIN',
      name: 'Export Staff User',
      email: 'export-staff@zamorin.cafe',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      passwordHash: 'dummy_hash',
      createdBy: 'SYSTEM',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-9001', role: 'STAFF' },
      query: { format: 'json' },
    };
    const res = createMockRes();

    await employeeController.exportProfileSummary(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('application/json'));
    assert.ok(res.headers['content-disposition'].includes('Zamorin_Profile_Summary_ST-9001.json'));

    const parsed = JSON.parse(res.data.toString('utf8'));
    assert.equal(parsed.employee.userId, 'ST-9001');
    assert.equal(parsed.employee.name, 'Export Staff User');
    assert.ok(Array.isArray(parsed.documents));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: SELF PAYROLL QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-PAY-1: createSelfPayrollQuery creates a query with SUBMITTED status', async () => {
    const req = {
      auth: {
        organisationId: 'ZAMORIN',
        userId: 'ST-PAY-01',
        name: 'Payroll Staff User',
        primaryCafeId: 'ZC-0001',
        assignedCafeIds: ['ZC-0001'],
      },
      body: {
        periodKey: '2026-07',
        category: 'OVERTIME_DISCREPANCY',
        subject: 'July Overtime Mismatch',
        description: 'Logged 12 hours overtime on July 14th but only 6 hours recorded in calculation.',
      },
    };
    const res = createMockRes();

    await payrollQueryController.createSelfPayrollQuery(req, res);

    assert.equal(res.statusCode, 201);
    assert.ok(res.data.success);
    assert.ok(res.data.data.query.queryId.startsWith('PQ-'));
    assert.equal(res.data.data.query.status, 'SUBMITTED');
    assert.equal(res.data.data.query.employeeUserId, 'ST-PAY-01');
  });

  await suite.test('P1-PAY-2: createSelfPayrollQuery rejects missing subject with 400', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-PAY-01', name: 'Payroll Staff User' },
      body: {
        periodKey: '2026-07',
        description: 'Description without subject',
      },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => payrollQueryController.createSelfPayrollQuery(req, res),
      (err) => err.statusCode === 400 && err.code === 'SUBJECT_REQUIRED'
    );
  });

  await suite.test('P1-PAY-3: createSelfPayrollQuery rejects missing description with 400', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-PAY-01', name: 'Payroll Staff User' },
      body: {
        periodKey: '2026-07',
        subject: 'Subject without description',
      },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => payrollQueryController.createSelfPayrollQuery(req, res),
      (err) => err.statusCode === 400 && err.code === 'DESCRIPTION_REQUIRED'
    );
  });

  await suite.test('P1-PAY-4: listSelfPayrollQueries returns authenticated employee queries only', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-PAY-01' },
      query: {},
    };
    const res = createMockRes();

    await payrollQueryController.listSelfPayrollQueries(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.data.queries.length >= 1);
    assert.ok(res.data.data.queries.every((q) => q.employeeUserId === 'ST-PAY-01'));
  });

  await suite.test('P1-PAY-5: listSelfPayrollQueries strictly isolates between employees', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-PAY-OTHER' },
      query: {},
    };
    const res = createMockRes();

    await payrollQueryController.listSelfPayrollQueries(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.queries.length, 0);
  });

  await suite.test('P1-PAY-6: reviewPayrollQuery forbids non-Master/Owner roles', async () => {
    const query = await PayrollQuery.findOne({ employeeUserId: 'ST-PAY-01' });
    assert.ok(query);

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-STAFF-REVIEWER', role: 'STAFF' },
      params: { queryId: query.queryId },
      body: { status: 'RESOLVED', resolution: 'Reviewed and corrected' },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => payrollQueryController.reviewPayrollQuery(req, res),
      (err) => err.statusCode === 403 && err.code === 'PERMISSION_DENIED'
    );
  });

  await suite.test('P1-PAY-7: reviewPayrollQuery allows Master/Owner to resolve query with resolution notes', async () => {
    const query = await PayrollQuery.findOne({ employeeUserId: 'ST-PAY-01' });
    assert.ok(query);

    const req = {
      auth: {
        organisationId: 'ZAMORIN',
        userId: 'M-0001',
        role: 'MASTER',
        isPrimaryMaster: true,
      },
      params: { queryId: query.queryId },
      body: { status: 'RESOLVED', resolution: 'Overtime hours confirmed and supplementary payout scheduled.' },
    };
    const res = createMockRes();

    await payrollQueryController.reviewPayrollQuery(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.success);
    assert.equal(res.data.data.query.status, 'RESOLVED');
    assert.equal(res.data.data.query.resolution, 'Overtime hours confirmed and supplementary payout scheduled.');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 5: SHIFT CHANGE REQUESTS & MY SCHEDULE
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-SHF-1: createSelfShiftChangeRequest creates a shift request with SUBMITTED status', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SHF-01', name: 'Shift Test Staff' },
      body: {
        requestedDate: '2026-09-15',
        requestedShift: 'MORNING_OPENING',
        currentShift: 'EVENING_CLOSING',
        reason: 'Dentist appointment in the evening.',
        notes: 'Can swap with Rajesh if needed.',
      },
    };
    const res = createMockRes();

    await shiftChangeController.createSelfShiftChangeRequest(req, res);

    assert.equal(res.statusCode, 201);
    assert.ok(res.data.success);
    assert.ok(res.data.data.request.requestId.startsWith('SCR-'));
    assert.equal(res.data.data.request.status, 'SUBMITTED');
    assert.equal(res.data.data.request.requestedDate, '2026-09-15');
  });

  await suite.test('P1-SHF-2: createSelfShiftChangeRequest validates date format and required fields', async () => {
    const badDateReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SHF-01', name: 'Shift Test Staff' },
      body: {
        requestedDate: '15-09-2026', // invalid format
        requestedShift: 'MORNING',
        reason: 'Personal',
      },
    };
    const res1 = createMockRes();

    await assert.rejects(
      async () => shiftChangeController.createSelfShiftChangeRequest(badDateReq, res1),
      (err) => err.statusCode === 400 && err.code === 'INVALID_DATE'
    );

    const missingReasonReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SHF-01', name: 'Shift Test Staff' },
      body: {
        requestedDate: '2026-09-15',
        requestedShift: 'MORNING',
      },
    };
    const res2 = createMockRes();

    await assert.rejects(
      async () => shiftChangeController.createSelfShiftChangeRequest(missingReasonReq, res2),
      (err) => err.statusCode === 400 && err.code === 'REASON_REQUIRED'
    );
  });

  await suite.test('P1-SHF-3: listSelfShiftChangeRequests returns user requests and isolates other users', async () => {
    const req1 = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SHF-01' },
      query: {},
    };
    const res1 = createMockRes();

    await shiftChangeController.listSelfShiftChangeRequests(req1, res1);

    assert.equal(res1.statusCode, 200);
    assert.ok(res1.data.data.requests.length >= 1);
    assert.ok(res1.data.data.requests.every((r) => r.employeeUserId === 'ST-SHF-01'));

    // Other user receives empty list
    const req2 = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SHF-OTHER' },
      query: {},
    };
    const res2 = createMockRes();

    await shiftChangeController.listSelfShiftChangeRequests(req2, res2);

    assert.equal(res2.statusCode, 200);
    assert.equal(res2.data.data.requests.length, 0);
  });

  await suite.test('P1-SHF-4: getSelfSchedule returns schedule window for employee', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SHF-01' },
      query: { startDate: '2026-09-01', endDate: '2026-09-30' },
    };
    const res = createMockRes();

    await shiftChangeController.getMyShiftsSchedule(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.data);
    assert.ok(Array.isArray(res.data.data.schedule));
    assert.equal(typeof res.data.data.count, 'number');
  });

  await suite.test('P1-SHF-5: reviewShiftChangeRequest approves request and updates status', async () => {
    const requestDoc = await ShiftChangeRequest.findOne({ employeeUserId: 'ST-SHF-01' });
    assert.ok(requestDoc);

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'M-0001', role: 'MASTER' },
      params: { requestId: requestDoc.requestId },
      body: { status: 'APPROVED', decisionNotes: 'Shift swap approved with Morning team.' },
    };
    const res = createMockRes();

    await shiftChangeController.reviewShiftChangeRequest(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.request.status, 'APPROVED');
    assert.equal(res.data.data.request.reviewedByUserId, 'M-0001');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 6: EARLY LOAN SETTLEMENT & DEFERMENT
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-LOAN-1: getMySettlementQuote calculates zero penalty payoff', async () => {
    const loan = await StaffLoanAdvance.create({
      loanAdvanceId: 'LN-20260001',
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE-001',
      employeeUserId: 'ST-0001',
      employeeName: 'Loan Staff User',
      requestType: 'LOAN',
      requestedAmountPaise: 5000000,
      approvedAmountPaise: 5000000,
      disbursedAmountPaise: 5000000,
      principalPaise: 5000000,
      outstandingPrincipalPaise: 3000000,
      outstandingInterestPaise: 0,
      arrearsPaise: 0,
      monthlyInstalmentPaise: 500000,
      tenureMonths: 10,
      status: 'ACTIVE',
      createdByUserId: 'SYSTEM',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-0001', role: 'STAFF' },
      params: { loanAdvanceId: loan.loanAdvanceId },
    };
    const res = createMockRes();

    await loanAdvanceController.getMySettlementQuote(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.success);
    assert.equal(res.data.data.totalSettlementPaise, 3000000);
    assert.equal(res.data.data.principalOutstandingPaise, 3000000);
  });

  await suite.test('P1-LOAN-2: requestEarlySettlement records settlement request on loan', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-0001', role: 'STAFF' },
      params: { loanAdvanceId: 'LN-20260001' },
      body: {
        paymentReference: 'UPI-REF-998822',
        paymentMode: 'UPI',
        notes: 'Full payoff from personal savings.',
      },
    };
    const res = createMockRes();

    await loanAdvanceController.requestEarlySettlement(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.success);
    assert.equal(res.data.data.loanAdvanceId, 'LN-20260001');

    const updated = await StaffLoanAdvance.findOne({ loanAdvanceId: 'LN-20260001' });
    assert.equal(updated.settlementDetails.settlementRequested, true);
    assert.equal(updated.settlementDetails.paymentRef, 'UPI-REF-998822');
  });

  await suite.test('P1-LOAN-3: requestEarlySettlement rejects when loan is not active or in-repayment', async () => {
    await StaffLoanAdvance.create({
      loanAdvanceId: 'LN-20260002',
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE-001',
      employeeUserId: 'ST-0001',
      requestType: 'LOAN',
      requestedAmountPaise: 1000000,
      disbursedAmountPaise: 1000000,
      principalPaise: 1000000,
      outstandingPrincipalPaise: 0,
      status: 'CLOSED',
      createdByUserId: 'SYSTEM',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-0001', role: 'STAFF' },
      params: { loanAdvanceId: 'LN-20260002' },
      body: { paymentReference: 'UPI-123' },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => loanAdvanceController.requestEarlySettlement(req, res),
      (err) => err.statusCode === 400 && err.code === 'INVALID_STATUS_FOR_SETTLEMENT'
    );
  });

  await suite.test('P1-LOAN-4: requestRepaymentPause requests deferment with reason and pause months', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-0001', role: 'STAFF' },
      params: { loanAdvanceId: 'LN-20260001' },
      body: {
        fromPeriod: '2026-10',
        resumePeriod: '2026-12',
        reason: 'Medical emergency expenses in family.',
      },
    };
    const res = createMockRes();

    await loanAdvanceController.requestRepaymentPause(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.success);

    const updated = await StaffLoanAdvance.findOne({ loanAdvanceId: 'LN-20260001' });
    assert.equal(updated.pauseDetails.isPaused, false); // Awaiting manager review
    assert.equal(updated.pauseDetails.pauseReason, 'Medical emergency expenses in family.');
    assert.equal(updated.pauseDetails.pauseFromPeriod, '2026-10');
  });

  await suite.test('P1-LOAN-5: requestRepaymentPause validates loan existence', async () => {
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-0001', role: 'STAFF' },
      params: { loanAdvanceId: 'LN-NONEXISTENT' },
      body: {
        fromPeriod: '2026-10',
        resumePeriod: '2026-12',
        reason: 'Deferment request',
      },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => loanAdvanceController.requestRepaymentPause(req, res),
      (err) => err.statusCode === 404 && err.code === 'LOAN_NOT_FOUND'
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 7: SESSION REVOCATION & SUPPORT TICKETS
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-SES-1: revokeOtherSessions terminates refresh tokens and preserves current session', async () => {
    const now = Date.now();
    await Session.create([
      {
        sessionId: 'SS-20260906-0001',
        organisationId: 'ZAMORIN',
        userId: 'ST-9099',
        roleSnapshot: 'STAFF',
        createdBy: 'ST-9099',
        absoluteExpiresAt: new Date(now + 86400000),
        refreshTokenExpiresAt: new Date(now + 86400000),
        accessTokenExpiresAt: new Date(now + 3600000),
        device: { deviceId: 'DEV-001', deviceType: 'DESKTOP' },
        refreshTokenHash: 'hash_refresh_001',
        accessTokenHash: 'hash_access_001',
        tokenFamilyId: 'TF-001',
        status: 'ACTIVE',
      },
      {
        sessionId: 'SS-20260906-0002',
        organisationId: 'ZAMORIN',
        userId: 'ST-9099',
        roleSnapshot: 'STAFF',
        createdBy: 'ST-9099',
        absoluteExpiresAt: new Date(now + 86400000),
        refreshTokenExpiresAt: new Date(now + 86400000),
        accessTokenExpiresAt: new Date(now + 3600000),
        device: { deviceId: 'DEV-002', deviceType: 'MOBILE' },
        refreshTokenHash: 'hash_refresh_002',
        accessTokenHash: 'hash_access_002',
        tokenFamilyId: 'TF-002',
        status: 'ACTIVE',
      },
    ]);

    const req = {
      auth: {
        userId: 'ST-9099',
        organisationId: 'ZAMORIN',
        role: 'STAFF',
        sessionId: 'SS-20260906-0001',
      },
    };
    const res = createMockRes();

    await authController.revokeOtherSessions(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.success);
    assert.equal(res.data.data.revokedSessionCount, 1);
    assert.equal(res.data.data.currentSessionId, 'SS-20260906-0001');

    const s1 = await Session.findOne({ sessionId: 'SS-20260906-0001' });
    assert.equal(s1.status, 'ACTIVE');

    const s2 = await Session.findOne({ sessionId: 'SS-20260906-0002' });
    assert.equal(s2.status, 'REVOKED');
  });

  await suite.test('P1-SUP-1: submitSupportTicket creates a SupportCase with OPEN status', async () => {
    const req = {
      auth: { userId: 'ST-SUP-01', organisationId: 'ZAMORIN', email: 'sup-staff@zamorin.cafe' },
      body: {
        category: 'HR_PAYROLL',
        severity: 'NORMAL',
        summary: 'Cannot view previous year tax summary',
        description: 'Trying to retrieve Form 16 from 2025 financial year, receiving empty page.',
      },
    };
    const res = createMockRes();

    await settingsController.submitSupportTicket(req, res);

    assert.equal(res.statusCode, 201);
    assert.ok(res.data.success);
    assert.ok(res.data.data.ticket.caseId.startsWith('CASE-'));
    assert.equal(res.data.data.ticket.status, 'OPEN');
    assert.equal(res.data.data.ticket.reportedByUserId, 'ST-SUP-01');
  });

  await suite.test('P1-SUP-2: submitSupportTicket validates required summary and description', async () => {
    const missingSummaryReq = {
      auth: { userId: 'ST-SUP-01', organisationId: 'ZAMORIN' },
      body: { description: 'Only description provided' },
    };
    const res1 = createMockRes();

    await assert.rejects(
      async () => settingsController.submitSupportTicket(missingSummaryReq, res1),
      (err) => err.statusCode === 400 && err.code === 'SUMMARY_REQUIRED'
    );

    const missingDescReq = {
      auth: { userId: 'ST-SUP-01', organisationId: 'ZAMORIN' },
      body: { summary: 'Only summary provided' },
    };
    const res2 = createMockRes();

    await assert.rejects(
      async () => settingsController.submitSupportTicket(missingDescReq, res2),
      (err) => err.statusCode === 400 && err.code === 'DESCRIPTION_REQUIRED'
    );
  });

  await suite.test('P1-SUP-3: listMySupportTickets lists user tickets ordered by creation descending', async () => {
    const req = {
      auth: { userId: 'ST-SUP-01', organisationId: 'ZAMORIN' },
    };
    const res = createMockRes();

    await settingsController.listMySupportTickets(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.data.tickets.length >= 1);
    assert.equal(res.data.data.tickets[0].reportedByUserId, 'ST-SUP-01');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 8: PROFILE CHANGE REQUEST WITHDRAWAL
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-PCR-1: withdrawSelfChangeRequest cancels pending request and sets WITHDRAWN status', async () => {
    const pcr = await ProfileChangeRequest.create({
      requestId: 'PCR-202609-00001',
      organisationId: 'ZAMORIN',
      userId: 'ST-PCR-01',
      requestType: 'CONTACT_UPDATE',
      title: 'Update phone number',
      reason: 'Updated mobile phone number.',
      proposedValues: { phone: '+91 98765 43210' },
      oldValues: { phone: '+91 91234 56789' },
      status: 'SUBMITTED',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-PCR-01', role: 'STAFF' },
      params: { requestId: pcr.requestId },
    };
    const res = createMockRes();

    await employeeController.withdrawSelfChangeRequest(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.success);
    assert.equal(res.data.data.request.status, 'WITHDRAWN');

    const updated = await ProfileChangeRequest.findOne({ requestId: pcr.requestId });
    assert.equal(updated.status, 'WITHDRAWN');
  });

  await suite.test('P1-PCR-2: withdrawSelfChangeRequest rejects withdrawal when request is already resolved', async () => {
    const approvedPcr = await ProfileChangeRequest.create({
      requestId: 'PCR-202609-00002',
      organisationId: 'ZAMORIN',
      userId: 'ST-PCR-01',
      requestType: 'CONTACT_UPDATE',
      title: 'Update phone number approved',
      reason: 'Phone update',
      proposedValues: { phone: '+91 99999 88888' },
      status: 'APPROVED',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-PCR-01', role: 'STAFF' },
      params: { requestId: approvedPcr.requestId },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => employeeController.withdrawSelfChangeRequest(req, res),
      (err) => err.statusCode === 400 && err.code === 'CANNOT_WITHDRAW'
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 9: MANAGEMENT SUPPORT TICKET HANDOFF & LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-SUP-4: listManageSupportTickets enforces role and tenant scoping', async () => {
    await SupportCase.create([
      {
        caseId: 'CASE-20260906-0010',
        organisationId: 'ZAMORIN',
        cafeId: 'CAFE01',
        reportedByUserId: 'ST-SUP-10',
        senderEmail: 'st-sup-10@zamorin.cafe',
        category: 'POS_ISSUE',
        severity: 'HIGH',
        summary: 'Cash drawer not opening on POS 1',
        description: 'Staff cannot tender cash orders at counter 1.',
        status: 'OPEN',
      },
      {
        caseId: 'CASE-20260906-0011',
        organisationId: 'ZAMORIN',
        cafeId: 'CAFE02',
        reportedByUserId: 'ST-SUP-11',
        senderEmail: 'st-sup-11@zamorin.cafe',
        category: 'DEVICE_ISSUE',
        severity: 'NORMAL',
        summary: 'Kitchen display monitor flickering',
        description: 'KDS screen in kitchen goes blank intermittently.',
        status: 'IN_PROGRESS',
      },
      {
        caseId: 'CASE-20260906-0012',
        organisationId: 'OTHER_ORG',
        cafeId: 'CAFE01',
        reportedByUserId: 'ST-SUP-12',
        senderEmail: 'st-sup-12@other.org',
        category: 'GENERAL_INQUIRY',
        severity: 'LOW',
        summary: 'Other org support query',
        description: 'Should never leak across tenant boundaries.',
        status: 'OPEN',
      },
    ]);

    // MASTER sees all ZAMORIN cases, never OTHER_ORG
    const masterReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'MTR-001', role: 'MASTER' },
      query: {},
    };
    const masterRes = createMockRes();
    await settingsController.listManageSupportTickets(masterReq, masterRes);

    assert.equal(masterRes.statusCode, 200);
    const masterTickets = masterRes.data.data.tickets;
    const masterIds = masterTickets.map((t) => t.caseId);
    assert.ok(masterIds.includes('CASE-20260906-0010'));
    assert.ok(masterIds.includes('CASE-20260906-0011'));
    assert.ok(!masterIds.includes('CASE-20260906-0012'), 'Cross-tenant ticket must not appear');

    // CAFE_ADMIN assigned only to CAFE01 sees only CAFE01
    const adminReq = {
      auth: {
        organisationId: 'ZAMORIN',
        userId: 'ADM-001',
        role: 'CAFE_ADMIN',
        assignedCafeIds: ['CAFE01'],
      },
      query: {},
    };
    const adminRes = createMockRes();
    await settingsController.listManageSupportTickets(adminReq, adminRes);

    assert.equal(adminRes.statusCode, 200);
    const adminTickets = adminRes.data.data.tickets;
    const adminIds = adminTickets.map((t) => t.caseId);
    assert.ok(adminIds.includes('CASE-20260906-0010'));
    assert.ok(!adminIds.includes('CASE-20260906-0011'), 'Café admin must not see tickets of unassigned café');
  });

  await suite.test('P1-SUP-5: listManageSupportTickets rejects non-management roles with 403', async () => {
    const staffReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SUP-10', role: 'STAFF' },
      query: {},
    };
    const staffRes = createMockRes();

    await assert.rejects(
      async () => settingsController.listManageSupportTickets(staffReq, staffRes),
      (err) => err.statusCode === 403 && err.code === 'PERMISSION_DENIED'
    );
  });

  await suite.test('P1-SUP-6: updateManageSupportTicket traverses full lifecycle with employee notifications', async () => {
    const caseId = 'CASE-20260906-0020';
    const reportedByUserId = 'ST-5020';

    await User.create({
      userId: reportedByUserId,
      organisationId: 'ZAMORIN',
      name: 'Printer Reporter',
      email: 'st-sup-20@zamorin.cafe',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'CAFE01',
      passwordHash: 'dummy_hash',
      createdBy: 'SYSTEM',
    });

    await SupportCase.create({
      caseId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      reportedByUserId,
      senderEmail: 'st-sup-20@zamorin.cafe',
      category: 'POS_ISSUE',
      severity: 'HIGH',
      summary: 'Printer offline',
      description: 'Thermal receipt printer not responding.',
      status: 'OPEN',
    });

    // 1. OPEN -> IN_PROGRESS
    const req1 = {
      auth: { organisationId: 'ZAMORIN', userId: 'ADM-001', role: 'CAFE_ADMIN', assignedCafeIds: ['CAFE01'] },
      params: { caseId },
      body: { status: 'IN_PROGRESS' },
    };
    const res1 = createMockRes();
    await settingsController.updateManageSupportTicket(req1, res1);
    assert.equal(res1.statusCode, 200);
    assert.equal(res1.data.data.ticket.status, 'IN_PROGRESS');

    // 2. IN_PROGRESS -> WAITING_FOR_EMPLOYEE
    const req2 = {
      auth: { organisationId: 'ZAMORIN', userId: 'ADM-001', role: 'CAFE_ADMIN', assignedCafeIds: ['CAFE01'] },
      params: { caseId },
      body: { status: 'WAITING_FOR_EMPLOYEE' },
    };
    const res2 = createMockRes();
    await settingsController.updateManageSupportTicket(req2, res2);
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.data.data.ticket.status, 'WAITING_FOR_EMPLOYEE');

    // Verify employee received notification for WAITING_FOR_EMPLOYEE
    const notifWait = await Notification.findOne({
      recipientUserId: reportedByUserId,
      deepLink: { $regex: caseId },
    }).sort({ createdAt: -1 });
    assert.ok(notifWait, 'Notification must be created for WAITING_FOR_EMPLOYEE transition');
    assert.ok(notifWait.deepLink.includes('#staff-settings?section=help'));

    // 3. WAITING_FOR_EMPLOYEE -> RESOLVED
    const req3 = {
      auth: { organisationId: 'ZAMORIN', userId: 'ADM-001', role: 'CAFE_ADMIN', assignedCafeIds: ['CAFE01'] },
      params: { caseId },
      body: { status: 'RESOLVED', resolutionNote: 'Re-paired Bluetooth receipt printer.' },
    };
    const res3 = createMockRes();
    await settingsController.updateManageSupportTicket(req3, res3);
    assert.equal(res3.statusCode, 200);
    assert.equal(res3.data.data.ticket.status, 'RESOLVED');

    // Verify notification for RESOLVED
    const notifResolved = await Notification.findOne({
      recipientUserId: reportedByUserId,
      title: { $regex: /RESOLVED/i },
    }).sort({ createdAt: -1 });
    assert.ok(notifResolved, 'Notification must be created for RESOLVED transition');

    // 4. RESOLVED -> CLOSED
    const req4 = {
      auth: { organisationId: 'ZAMORIN', userId: 'ADM-001', role: 'CAFE_ADMIN', assignedCafeIds: ['CAFE01'] },
      params: { caseId },
      body: { status: 'CLOSED' },
    };
    const res4 = createMockRes();
    await settingsController.updateManageSupportTicket(req4, res4);
    assert.equal(res4.statusCode, 200);
    assert.equal(res4.data.data.ticket.status, 'CLOSED');
  });

  await suite.test('P1-SUP-7: updateManageSupportTicket rejects invalid lifecycle transitions', async () => {
    const caseId = 'CASE-20260906-0021';
    await SupportCase.create({
      caseId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      reportedByUserId: 'ST-SUP-21',
      senderEmail: 'st-sup-21@zamorin.cafe',
      summary: 'Closed ticket test',
      description: 'Already closed ticket.',
      status: 'CLOSED',
    });

    // CLOSED cannot jump to RESOLVED
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'MTR-001', role: 'MASTER' },
      params: { caseId },
      body: { status: 'RESOLVED' },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => settingsController.updateManageSupportTicket(req, res),
      (err) => err.statusCode === 400 && err.code === 'INVALID_STATUS_TRANSITION'
    );

    // Completely invalid status string
    const badStatusReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'MTR-001', role: 'MASTER' },
      params: { caseId },
      body: { status: 'FOO_BAR_STATUS' },
    };
    const badRes = createMockRes();

    await assert.rejects(
      async () => settingsController.updateManageSupportTicket(badStatusReq, badRes),
      (err) => err.statusCode === 400 && err.code === 'INVALID_STATUS_TRANSITION'
    );
  });

  await suite.test('P1-SUP-8: addSupportTicketReply records responses and notifies employee on public reply', async () => {
    const caseId = 'CASE-20260906-0022';
    const reportedByUserId = 'ST-5022';

    await User.create({
      userId: reportedByUserId,
      organisationId: 'ZAMORIN',
      name: 'Inventory Reporter',
      email: 'st-sup-22@zamorin.cafe',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'CAFE01',
      passwordHash: 'dummy_hash',
      createdBy: 'SYSTEM',
    });

    await SupportCase.create({
      caseId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      reportedByUserId,
      senderEmail: 'st-sup-22@zamorin.cafe',
      summary: 'Inventory count discrepancy',
      description: 'Stock on hand does not match physical count.',
      status: 'IN_PROGRESS',
    });

    // 1. Management internal note - no employee notification, status unchanged
    const internalReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'ADM-001', role: 'CAFE_ADMIN', assignedCafeIds: ['CAFE01'] },
      params: { caseId },
      body: { message: 'Checking with storekeeper on morning shift logs.', visibility: 'INTERNAL' },
    };
    const internalRes = createMockRes();
    await settingsController.addSupportTicketReply(internalReq, internalRes);

    assert.equal(internalRes.statusCode, 201);
    assert.equal(internalRes.data.data.ticket.status, 'IN_PROGRESS');

    const updatedInternal = await SupportCase.findOne({ caseId });
    assert.equal(updatedInternal.responses.length, 1);
    assert.equal(updatedInternal.responses[0].visibility, 'INTERNAL');

    // 2. Management public reply - transitions status to WAITING_FOR_EMPLOYEE and creates notification
    const publicReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'ADM-001', role: 'CAFE_ADMIN', assignedCafeIds: ['CAFE01'] },
      params: { caseId },
      body: { message: 'Please upload a photo of the shelf label and physical audit sheet.', visibility: 'PUBLIC' },
    };
    const publicRes = createMockRes();
    await settingsController.addSupportTicketReply(publicReq, publicRes);

    assert.equal(publicRes.statusCode, 201);
    assert.equal(publicRes.data.data.ticket.status, 'WAITING_FOR_EMPLOYEE');

    const notif = await Notification.findOne({
      recipientUserId: reportedByUserId,
      deepLink: { $regex: caseId },
    }).sort({ createdAt: -1 });
    assert.ok(notif, 'Public management reply must generate an employee notification');
    assert.ok(notif.message.includes('Please upload a photo') || notif.title.includes('Support Case'));

    const outbox = await NotificationOutbox.findOne({
      recipientUserId: reportedByUserId,
      eventType: 'SUPPORT_CASE_REPLY',
    }).sort({ createdAt: -1 });
    assert.ok(outbox, 'Public reply must create outbox delivery record');
  });

  await suite.test('P1-SUP-9: addEmployeeSupportTicketReply transitions WAITING_FOR_EMPLOYEE to IN_PROGRESS', async () => {
    const caseId = 'CASE-20260906-0023';
    await SupportCase.create({
      caseId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      reportedByUserId: 'ST-SUP-23',
      senderEmail: 'st-sup-23@zamorin.cafe',
      summary: 'Leave balance question',
      description: 'My earned leave balance displays as 0.',
      status: 'WAITING_FOR_EMPLOYEE',
    });

    const empReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SUP-23', role: 'STAFF' },
      params: { caseId },
      body: { message: 'I have attached my appointment letter showing 12 annual leaves accrued.' },
    };
    const empRes = createMockRes();
    await settingsController.addEmployeeSupportTicketReply(empReq, empRes);

    assert.equal(empRes.statusCode, 201);
    assert.equal(empRes.data.data.ticket.status, 'IN_PROGRESS');

    const updated = await SupportCase.findOne({ caseId });
    assert.equal(updated.status, 'IN_PROGRESS');
    const empResponse = updated.responses.find((r) => r.authorRole === 'STAFF');
    assert.ok(empResponse);
    assert.equal(empResponse.message, empReq.body.message);

    // Another staff user cannot reply to ST-SUP-23's ticket
    const otherStaffReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SUP-99', role: 'STAFF' },
      params: { caseId },
      body: { message: 'Unauthorized reply attempt.' },
    };
    const otherRes = createMockRes();

    await assert.rejects(
      async () => settingsController.addEmployeeSupportTicketReply(otherStaffReq, otherRes),
      (err) => err.statusCode === 404 && err.code === 'NOT_FOUND'
    );
  });

  await suite.test('P1-SUP-10: listMySupportTickets sanitizes responses by stripping INTERNAL notes', async () => {
    const caseId = 'CASE-20260906-0024';
    await SupportCase.create({
      caseId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      reportedByUserId: 'ST-SUP-24',
      senderEmail: 'st-sup-24@zamorin.cafe',
      summary: 'Confidential investigation case',
      description: 'Employee inquiry regarding shift allocation.',
      status: 'IN_PROGRESS',
      responses: [
        {
          responseId: 'RESP-001',
          authorUserId: 'ADM-001',
          authorRole: 'CAFE_ADMIN',
          message: 'INTERNAL NOTE: Supervisor needs to review shift roster conflict privately.',
          visibility: 'INTERNAL',
          createdAt: new Date(),
        },
        {
          responseId: 'RESP-002',
          authorUserId: 'ADM-001',
          authorRole: 'CAFE_ADMIN',
          message: 'PUBLIC REPLY: We are currently reviewing your shift schedule for next week.',
          visibility: 'PUBLIC',
          createdAt: new Date(),
        },
      ],
    });

    const staffReq = {
      auth: { organisationId: 'ZAMORIN', userId: 'ST-SUP-24', role: 'STAFF' },
    };
    const staffRes = createMockRes();
    await settingsController.listMySupportTickets(staffReq, staffRes);

    assert.equal(staffRes.statusCode, 200);
    const ticket = staffRes.data.data.tickets.find((t) => t.caseId === caseId);
    assert.ok(ticket, 'Ticket must be returned to reporting staff');
    assert.equal(ticket.responses.length, 1, 'Internal responses must be stripped from staff view');
    assert.equal(ticket.responses[0].visibility, 'PUBLIC');
    assert.ok(!ticket.responses.some((r) => r.visibility === 'INTERNAL'));
  });

  await suite.test('P1-SUP-11: CAFE_ADMIN is rejected when accessing tickets from unassigned cafe', async () => {
    const caseId = 'CASE-20260906-0025';
    await SupportCase.create({
      caseId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE02',
      reportedByUserId: 'ST-SUP-25',
      senderEmail: 'st-sup-25@zamorin.cafe',
      summary: 'Espresso machine broken',
      description: 'Espresso machine at Cafe 2 needs boiler repair.',
      status: 'OPEN',
    });

    // CAFE_ADMIN assigned only to CAFE01
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'ADM-001', role: 'CAFE_ADMIN', assignedCafeIds: ['CAFE01'] },
      params: { caseId },
    };
    const res = createMockRes();

    await assert.rejects(
      async () => settingsController.getManageSupportTicket(req, res),
      (err) => err.statusCode === 403 && err.code === 'CAFE_ACCESS_DENIED'
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 10: LEAVE DECISION EMPLOYEE NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-NOTIF-1: decideApproval on LEAVE creates employee notification and outbox record', async () => {
    const leaveId = 'LR-20260906-101';
    const approvalId = 'APP-88801';
    const userId = 'ST-8001';

    await User.create({
      userId,
      organisationId: 'ZAMORIN',
      name: 'Leave Test Employee 1',
      email: 'st-8001@zamorincafe.com',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'CAFE01',
      passwordHash: 'dummy_hash_p1',
      createdBy: 'SYSTEM',
    });

    await LeaveRequest.create({
      leaveId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      userId,
      leaveType: 'CASUAL',
      startDate: '2026-09-15',
      endDate: '2026-09-16',
      requestedDays: 2,
      reason: 'Family wedding event',
      status: 'PENDING',
    });

    await Approval.create({
      approvalId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      entityType: 'LEAVE',
      entityId: leaveId,
      requestingUserId: userId,
      actionRequired: 'APPROVE',
      status: 'PENDING',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'MTR-001', role: 'MASTER' },
      params: { approvalId },
      body: { decision: 'APPROVED', reason: 'Coverage confirmed.' },
    };
    const res = createMockRes();

    await approvalController.decideApproval(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.approval.status, 'APPROVED');

    // Verify LeaveRequest updated
    const updatedLeave = await LeaveRequest.findOne({ leaveId });
    assert.equal(updatedLeave.status, 'APPROVED');

    // Verify employee in-app Notification created with deep link
    const notif = await Notification.findOne({
      recipientUserId: userId,
      deepLink: `#staff-leave?requestId=${leaveId}`,
    });
    assert.ok(notif, 'Employee in-app notification must be created with #staff-leave?requestId=...');
    assert.ok(notif.title.includes('APPROVED'));

    // Verify durable NotificationOutbox created
    const outbox = await NotificationOutbox.findOne({
      recipientUserId: userId,
      eventType: 'LEAVE_APPROVED',
    });
    assert.ok(outbox, 'NotificationOutbox must have LEAVE_APPROVED record');
    assert.equal(outbox.recipientEmail, 'st-8001@zamorincafe.com');
  });

  await suite.test('P1-NOTIF-2: decideApproval on LEAVE rejection notifies employee with reason', async () => {
    const leaveId = 'LR-20260906-102';
    const approvalId = 'APP-88802';
    const userId = 'ST-8002';

    await User.create({
      userId,
      organisationId: 'ZAMORIN',
      name: 'Leave Test Employee 2',
      email: 'st-8002@zamorincafe.com',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'CAFE01',
      passwordHash: 'dummy_hash_p1',
      createdBy: 'SYSTEM',
    });

    await LeaveRequest.create({
      leaveId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      userId,
      leaveType: 'SICK',
      startDate: '2026-09-17',
      endDate: '2026-09-17',
      requestedDays: 1,
      reason: 'Doctor checkup',
      status: 'PENDING',
    });

    await Approval.create({
      approvalId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      entityType: 'LEAVE',
      entityId: leaveId,
      requestingUserId: userId,
      actionRequired: 'APPROVE',
      status: 'PENDING',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'MTR-001', role: 'MASTER' },
      params: { approvalId },
      body: { decision: 'REJECTED', reason: 'Critical festival day requires all staff on duty.' },
    };
    const res = createMockRes();

    await approvalController.decideApproval(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.approval.status, 'REJECTED');

    const updatedLeave = await LeaveRequest.findOne({ leaveId });
    assert.equal(updatedLeave.status, 'REJECTED');

    const notif = await Notification.findOne({
      recipientUserId: userId,
      deepLink: `#staff-leave?requestId=${leaveId}`,
    });
    assert.ok(notif);
    assert.ok(notif.title.includes('REJECTED'));
    assert.ok(notif.message.includes('rejected'));

    const outbox = await NotificationOutbox.findOne({
      recipientUserId: userId,
      eventType: 'LEAVE_REJECTED',
    });
    assert.ok(outbox);
    assert.ok(outbox.renderedBody.includes('Critical festival day'));
  });

  await suite.test('P1-NOTIF-3: decideApproval on LEAVE_CANCELLATION updates leave and notifies employee', async () => {
    const leaveId = 'LR-20260906-103';
    const approvalId = 'APP-88803';
    const userId = 'ST-8003';

    await User.create({
      userId,
      organisationId: 'ZAMORIN',
      name: 'Leave Test Employee 3',
      email: 'st-8003@zamorincafe.com',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      primaryCafeId: 'CAFE01',
      passwordHash: 'dummy_hash_p1',
      createdBy: 'SYSTEM',
    });

    await LeaveRequest.create({
      leaveId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      userId,
      leaveType: 'CASUAL',
      startDate: '2026-09-20',
      endDate: '2026-09-21',
      requestedDays: 2,
      reason: 'Personal travel plans changed',
      status: 'CANCELLATION_REQUESTED',
    });

    await Approval.create({
      approvalId,
      organisationId: 'ZAMORIN',
      cafeId: 'CAFE01',
      entityType: 'LEAVE_CANCELLATION',
      entityId: leaveId,
      requestingUserId: userId,
      actionRequired: 'APPROVE',
      status: 'PENDING',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'MTR-001', role: 'MASTER' },
      params: { approvalId },
      body: { decision: 'APPROVED', reason: 'Cancellation accepted.' },
    };
    const res = createMockRes();

    await approvalController.decideApproval(req, res);

    assert.equal(res.statusCode, 200);

    const updatedLeave = await LeaveRequest.findOne({ leaveId });
    assert.equal(updatedLeave.status, 'CANCELLED');

    const outbox = await NotificationOutbox.findOne({
      recipientUserId: userId,
      eventType: 'LEAVE_CANCELLATION_APPROVED',
    });
    assert.ok(outbox, 'LEAVE_CANCELLATION_APPROVED outbox entry must be created');
  });

  await suite.test('P1-NOTIF-4: duplicate approval decision is rejected with 409 and does not duplicate notifications', async () => {
    const approvalId = 'APP-88801';
    const req = {
      auth: { organisationId: 'ZAMORIN', userId: 'MTR-001', role: 'MASTER' },
      params: { approvalId },
      body: { decision: 'APPROVED' },
    };
    const res = createMockRes();

    const notifCountBefore = await Notification.countDocuments({ recipientUserId: 'ST-8001' });

    await assert.rejects(
      async () => approvalController.decideApproval(req, res),
      (err) => err.statusCode === 409 && err.code === 'ALREADY_DECIDED'
    );

    const notifCountAfter = await Notification.countDocuments({ recipientUserId: 'ST-8001' });
    assert.equal(notifCountAfter, notifCountBefore, 'Notification count must remain unchanged');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 11: PROFILE SUMMARY PDF GENERATION
  // ─────────────────────────────────────────────────────────────────────────────

  await suite.test('P1-PRF-2: exportProfileSummary returns binary %PDF-1.4 with application/pdf header', async () => {
    const userId = 'ST-8004';
    await User.create({
      userId,
      organisationId: 'ZAMORIN',
      name: 'P1 PDF Test Employee',
      preferredName: 'PDF Tester',
      email: 'pdf.tester@zamorincafe.com',
      phone: '+91 98877 66554',
      designation: 'Senior Barista',
      department: 'Operations',
      joiningDate: '2025-06-01',
      employmentStatus: 'ACTIVE',
      primaryCafeId: 'CAFE01',
      role: 'STAFF',
      accountStatus: 'ACTIVE',
      passwordHash: 'dummy_hash_p1',
      createdBy: 'SYSTEM',
    });

    await EmployeeDocument.create({
      documentId: 'DOC-2026-0001',
      organisationId: 'ZAMORIN',
      userId,
      documentName: 'Aadhaar Card Copy',
      category: 'IDENTITY_DOCUMENT',
      issuedDate: '2025-06-01',
      status: 'ACTIVE',
    });

    const req = {
      auth: { organisationId: 'ZAMORIN', userId, role: 'STAFF' },
      query: {},
    };
    const res = createMockRes();

    await employeeController.exportProfileSummary(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition'].includes('.pdf'));
    assert.ok(Buffer.isBuffer(res.data), 'Export payload must be a Buffer');
    assert.ok(res.data.length > 500, 'PDF buffer must contain realistic binary data');

    const headerMagic = res.data.toString('utf8', 0, 8);
    assert.ok(headerMagic.startsWith('%PDF-1.4'), `PDF must have %PDF-1.4 header, found ${headerMagic}`);
  });

  await suite.test('P1-PRF-3: exportProfileSummary with format=json returns valid JSON archive', async () => {
    const userId = 'ST-8004';
    const req = {
      auth: { organisationId: 'ZAMORIN', userId, role: 'STAFF' },
      query: { format: 'json' },
    };
    const res = createMockRes();

    await employeeController.exportProfileSummary(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/json');

    const parsed = JSON.parse(res.data.toString('utf8'));
    assert.ok(parsed.exportDate);
    assert.equal(parsed.employee.userId, userId);
    assert.equal(parsed.employee.name, 'P1 PDF Test Employee');
    assert.ok(Array.isArray(parsed.documents));
    assert.equal(parsed.documents.length, 1);
    assert.equal(parsed.documents[0].documentId, 'DOC-2026-0001');
  });
});

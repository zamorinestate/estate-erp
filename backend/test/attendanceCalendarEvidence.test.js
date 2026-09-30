'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { Attendance } = require('../src/modules/attendance/Attendance');
const {
  getEmployeeMonthlyCalendar,
} = require('../src/modules/attendance/attendanceController');

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('CAL-EVI-001: employee monthly calendar preserves both Check-In and Check-Out selfie references', async () => {
  const originalFind = Attendance.find;
  const record = {
    attendanceId: 'AT-20260930-901',
    organisationId: 'ORG-ZAMORIN',
    cafeId: 'CAFE-KNR-01',
    userId: 'EMP-901',
    businessDate: '2026-09-30',
    status: 'CHECKED_OUT',
    checkInAt: new Date('2026-09-30T03:30:00Z'),
    checkOutAt: new Date('2026-09-30T12:30:00Z'),
    totalWorkedMinutes: 540,
    approvedOvertimeMinutes: 0,
    selfieFileId: 'FILE-IN-901',
    attendanceEvidence: {
      checkIn: {
        selfieMediaId: 'FILE-IN-901',
        photoFileId: 'FILE-IN-901',
        qrChallengeId: 'CH-IN-901',
      },
      checkOut: {
        selfieMediaId: 'FILE-OUT-901',
        photoFileId: 'FILE-OUT-901',
        qrChallengeId: 'CH-OUT-901',
      },
    },
  };

  Attendance.find = () => ({
    sort() { return this; },
    lean: async () => [record],
  });

  const request = {
    params: { userId: 'EMP-901' },
    query: { year: '2026', month: '9' },
    auth: {
      organisationId: 'ORG-ZAMORIN',
      userId: 'EMP-901',
      role: 'STAFF',
    },
  };
  const response = mockResponse();

  try {
    await getEmployeeMonthlyCalendar(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.records.length, 1);
    const returned = response.body.data.records[0];
    assert.equal(returned.attendanceEvidence.checkIn.selfieMediaId, 'FILE-IN-901');
    assert.equal(returned.attendanceEvidence.checkOut.selfieMediaId, 'FILE-OUT-901');
  } finally {
    Attendance.find = originalFind;
  }
});

test('CAL-EVI-002: Calendar 360 renders separate IN/OUT evidence markers and opens evidence viewer by attendance ID', () => {
  const frontend = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/js/modules/attendance/attendanceShifts.js'),
    'utf8'
  );

  assert.ok(frontend.includes('hasInSelfie'));
  assert.ok(frontend.includes('hasOutSelfie'));
  assert.match(frontend, /"📷 IN"/);
  assert.match(frontend, /"📷 OUT"/);
  assert.match(frontend, /calendar-day-card/);
  assert.match(
    frontend,
    /openAttendanceEvidenceViewer({s*attendanceIds*})/
  );
});

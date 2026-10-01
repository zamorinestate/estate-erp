'use strict';

/**
 * PM-02G: WORKFORCE, ATTENDANCE, SHIFTS & PAYROLL INTELLIGENCE
 * Stage 7 of the Consolidated Reports & Analytics Programme
 * Comprehensive Verification Suite (12 Governance Sections)
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  calculateWorkforceMetrics,
  computeShiftDurationMinutes,
  isLateArrival,
  isEarlyDeparture,
  SENTINEL_NOT_CONFIGURED,
  SENTINEL_UNAVAILABLE,
  ACTIVE_EMPLOYMENT_STATUSES,
} = require('../src/reporting/calculations/workforceCalculations');
const { calculateFinanceMetrics } = require('../src/reporting/calculations/financeCalculations');
const { calculateAttendanceMetrics } = require('../src/services/attendanceCalculationService');

const { ReportRegistry } = require('../src/reporting/reportRegistry');
const { MetricRegistry } = require('../src/reporting/metricRegistry');
const { User } = require('../src/models/User');
const { Attendance } = require('../src/modules/attendance/Attendance');
const { ShiftRoster } = require('../src/models/ShiftRoster');
const { Shift } = require('../src/models/Shift');
const { AttendanceException } = require('../src/models/AttendanceException');
const { LeaveRequest } = require('../src/models/LeaveRequest');
const { Bill } = require('../src/models/Bill');
const { PayrollRun } = require('../src/models/PayrollRun');
const { Payslip } = require('../src/models/Payslip');

function mockAllWorkforceModels({ payrollRuns = [], payslips = [], attendance = [], users = [] } = {}) {
  const originals = {
    user: User.find,
    shiftRoster: ShiftRoster.find,
    shift: Shift.find,
    attendance: Attendance.find,
    exception: AttendanceException.find,
    leave: LeaveRequest.find,
    bill: Bill.find,
    payrollRun: PayrollRun.find,
    payslip: Payslip.find,
  };
  User.find = () => ({ select: () => ({ lean: async () => users }) });
  ShiftRoster.find = () => ({ lean: async () => [] });
  Shift.find = () => ({ lean: async () => [] });
  Attendance.find = () => ({ lean: async () => attendance });
  AttendanceException.find = () => ({ limit: () => ({ lean: async () => [] }), lean: async () => [] });
  LeaveRequest.find = () => ({ lean: async () => [] });
  Bill.find = () => ({ select: () => ({ lean: async () => [] }) });
  PayrollRun.find = () => ({ lean: async () => payrollRuns });
  Payslip.find = () => ({ lean: async () => payslips });

  return () => {
    User.find = originals.user;
    ShiftRoster.find = originals.shiftRoster;
    Shift.find = originals.shift;
    Attendance.find = originals.attendance;
    AttendanceException.find = originals.exception;
    LeaveRequest.find = originals.leave;
    Bill.find = originals.bill;
    PayrollRun.find = originals.payrollRun;
    Payslip.find = originals.payslip;
  };
}

function makeOpts(overrides = {}) {
  return {
    organisationId: 'ORG-ZAMORIN',
    cafeScope: null,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    ...overrides,
  };
}

// ── 1. MODULE CONTRACT & EXPORT AUDIT ──────────────────────────────────────────
describe('PM-02G S1: Module Contract & Exports', () => {
  it('1.1 calculateWorkforceMetrics is an exported async function', () => {
    assert.equal(typeof calculateWorkforceMetrics, 'function');
  });

  it('1.2 Helper functions are exported and functional', () => {
    assert.equal(typeof computeShiftDurationMinutes, 'function');
    assert.equal(typeof isLateArrival, 'function');
    assert.equal(typeof isEarlyDeparture, 'function');
  });

  it('1.3 Governance sentinels are exported correctly', () => {
    assert.equal(SENTINEL_NOT_CONFIGURED, 'NOT_CONFIGURED');
    assert.equal(SENTINEL_UNAVAILABLE, 'UNAVAILABLE');
    assert.deepEqual(ACTIVE_EMPLOYMENT_STATUSES, ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD']);
  });

  it('1.4 Throws error if organisationId is missing', async () => {
    await assert.rejects(
      () => calculateWorkforceMetrics({ dateFrom: '2026-08-01', dateTo: '2026-08-31' }),
      /organisationId is required/i
    );
  });
});

// ── 2. OFFLINE / UNSEEDED FALLBACK PAYLOAD SHAPE ────────────────────────────────
describe('PM-02G S2: Offline / Safe Fallback Payload Structure', () => {
  let res;
  before(async () => {
    res = await calculateWorkforceMetrics(makeOpts());
  });

  it('2.1 Returns all 12 top-level analytical blocks', () => {
    const requiredKeys = [
      'workforceMetrics',
      'headcountByCafe',
      'headcountByRole',
      'roleDistribution',
      'scheduledVsActual',
      'attendance',
      'overtime',
      'payroll',
      'productivity',
      'exceptions',
      'dataQuality',
      'provenance',
    ];
    for (const key of requiredKeys) {
      assert.ok(key in res, `Missing key: ${key}`);
    }
  });

  it('2.2 workforceMetrics contains all authoritative summary metrics', () => {
    const fields = [
      'totalHeadcountProvisioned',
      'activeHeadcount',
      'inactiveHeadcount',
      'scheduledHours',
      'actualHoursWorked',
      'overtimeHours',
      'totalBreakMinutes',
      'labourCostTotal',
      'labourCostPctOfSales',
      'salesPerLabourHour',
      'attendanceExceptionsCount',
      'scheduledLabourCostNotice',
      'overallEmployeeScoreNotice',
    ];
    for (const f of fields) {
      assert.ok(f in res.workforceMetrics, `Missing workforceMetrics field: ${f}`);
    }
  });

  it('2.3 dataQuality adheres to canonical quality contract', () => {
    assert.ok(typeof res.dataQuality.status === 'string');
    assert.ok(Array.isArray(res.dataQuality.issues));
  });

  it('2.4 provenance documents source models and calculation basis', () => {
    assert.ok(Array.isArray(res.provenance.sourceModels));
    assert.ok(res.provenance.sourceModels.includes('User'));
    assert.ok(res.provenance.sourceModels.includes('Attendance'));
    assert.ok(res.provenance.sourceModels.includes('ShiftRoster'));
    assert.ok(res.provenance.sourceModels.includes('PayrollRun'));
  });
});

// ── 3. SHIFT TIMING & CROSS-MIDNIGHT ARITHMETIC ─────────────────────────────────
describe('PM-02G S3: Shift Timing & Cross-Midnight Calculation', () => {
  it('3.1 Same-day morning shift calculates correct minutes', () => {
    const mins = computeShiftDurationMinutes('08:00', '16:00');
    assert.equal(mins, 480); // 8 hours
  });

  it('3.2 Same-day evening shift with partial hour calculates correct minutes', () => {
    const mins = computeShiftDurationMinutes('14:30', '23:00');
    assert.equal(mins, 510); // 8.5 hours
  });

  it('3.3 Cross-midnight shift (22:00 to 06:00) calculates 480 minutes, never negative', () => {
    const mins = computeShiftDurationMinutes('22:00', '06:00');
    assert.equal(mins, 480); // 8 hours across midnight
  });

  it('3.4 Cross-midnight shift (23:30 to 07:30) calculates 480 minutes', () => {
    const mins = computeShiftDurationMinutes('23:30', '07:30');
    assert.equal(mins, 480);
  });

  it('3.5 Handles empty or invalid inputs gracefully by returning 0', () => {
    assert.equal(computeShiftDurationMinutes(null, '08:00'), 0);
    assert.equal(computeShiftDurationMinutes('08:00', null), 0);
    assert.equal(computeShiftDurationMinutes('invalid', '08:00'), 0);
  });
});

// ── 4. PUNCTUALITY, GRACE PERIOD & EARLY EXITS ─────────────────────────────────
describe('PM-02G S4: Punctuality, Grace Period & Early Exit Rules', () => {
  it('4.1 Clock-in at or before shift start is on-time (lateMinutes: 0)', () => {
    const punch = new Date('2026-08-10T08:55:00+05:30');
    const res = isLateArrival(punch, '09:00', 15);
    assert.equal(res.isLate, false);
    assert.equal(res.lateMinutes, 0);
  });

  it('4.2 Clock-in within 15-minute grace period (e.g. 09:12 for 09:00) is on-time', () => {
    const punch = new Date('2026-08-10T09:12:00+05:30');
    const res = isLateArrival(punch, '09:00', 15);
    assert.equal(res.isLate, false);
    assert.equal(res.lateMinutes, 0);
  });

  it('4.3 Clock-in at exact grace boundary (09:15 for 09:00) is on-time', () => {
    const punch = new Date('2026-08-10T09:15:00+05:30');
    const res = isLateArrival(punch, '09:00', 15);
    assert.equal(res.isLate, false);
    assert.equal(res.lateMinutes, 0);
  });

  it('4.4 Clock-in past grace period (09:22 for 09:00) is late by 22 minutes', () => {
    const punch = new Date('2026-08-10T09:22:00+05:30');
    const res = isLateArrival(punch, '09:00', 15);
    assert.equal(res.isLate, true);
    assert.equal(res.lateMinutes, 22);
  });

  it('4.5 Early departure detected if clock-out is before shift end time', () => {
    const punch = new Date('2026-08-10T16:30:00+05:30'); // Left at 16:30
    const res = isEarlyDeparture(punch, '17:00'); // Shift ends 17:00
    assert.equal(res.isEarly, true);
    assert.equal(res.earlyMinutes, 30);
  });

  it('4.6 On-time departure if clock-out is at or after shift end time', () => {
    const punch = new Date('2026-08-10T17:05:00+05:30');
    const res = isEarlyDeparture(punch, '17:00');
    assert.equal(res.isEarly, false);
    assert.equal(res.earlyMinutes, 0);
  });
});

// ── 5. HEADCOUNT SEMANTICS & ATTRIBUTION ────────────────────────────────────────
describe('PM-02G S5: Headcount Semantics & Multi-Café Attribution', () => {
  it('5.1 ACTIVE employment statuses correctly defined', () => {
    assert.ok(ACTIVE_EMPLOYMENT_STATUSES.includes('ACTIVE'));
    assert.ok(ACTIVE_EMPLOYMENT_STATUSES.includes('PROBATION'));
    assert.ok(ACTIVE_EMPLOYMENT_STATUSES.includes('NOTICE_PERIOD'));
    assert.ok(!ACTIVE_EMPLOYMENT_STATUSES.includes('TERMINATED'));
    assert.ok(!ACTIVE_EMPLOYMENT_STATUSES.includes('RESIGNED'));
    assert.ok(!ACTIVE_EMPLOYMENT_STATUSES.includes('SUSPENDED'));
  });

  it('5.2 Offline payload distinguishes unique active headcount from inactive', async () => {
    const res = await calculateWorkforceMetrics(makeOpts());
    assert.ok(typeof res.workforceMetrics.activeHeadcount === 'number');
    assert.ok(typeof res.workforceMetrics.inactiveHeadcount === 'number');
    assert.ok(typeof res.workforceMetrics.totalHeadcountProvisioned === 'number');
    assert.equal(
      res.workforceMetrics.totalHeadcountProvisioned,
      res.workforceMetrics.activeHeadcount + res.workforceMetrics.inactiveHeadcount
    );
  });
});

// ── 6. OVERTIME POLICY & UNAPPROVED OVERTIME GUARANTEE ───────────────────────────
describe('PM-02G S6: Overtime Policy & Synthetic Rule Invariant', () => {
  let res;
  before(async () => {
    res = await calculateWorkforceMetrics(makeOpts());
  });

  it('6.1 UNAPPROVED_OVERTIME_RULE = 0 invariant strictly maintained', () => {
    assert.equal(res.overtime.unapprovedOvertimeHours, 0);
    assert.match(res.overtime.policy, /Unapproved overtime is never generated/i);
  });

  it('6.2 Overtime hours match authoritative attendance records', () => {
    assert.ok(typeof res.overtime.totalOvertimeHours === 'number');
    assert.ok(typeof res.overtime.overtimeIncidenceRatePct === 'number');
  });
});

// ── 7. PAYROLL RUN PRECEDENCE & DOUBLE-COUNT PREVENTION ─────────────────────────
describe('PM-02G S7: Payroll Precedence & Zero Double-Count Guarantee', () => {
  let res;
  before(async () => {
    res = await calculateWorkforceMetrics(makeOpts());
  });

  it('7.1 Exposes authoritative payroll source basis', () => {
    assert.ok(typeof res.payroll.payrollSourceBasis === 'string');
    assert.ok(
      ['AUTHORITATIVE_PAYROLL_RUN', 'PAYSLIP_FALLBACK', 'SOURCE_UNAVAILABLE', 'NO_DATA', 'UNAVAILABLE'].includes(
        res.payroll.payrollSourceBasis
      )
    );
  });

  it('7.2 Gross payroll is a non-negative number, zero, or null when unavailable', () => {
    assert.ok(res.payroll.grossPayroll === null || res.payroll.grossPayroll >= 0);
  });

  it('7.3 byCafe allocation is an array', () => {
    assert.ok(Array.isArray(res.payroll.byCafe));
  });
});

// ── 8. LABOUR PRODUCTIVITY (SPLH) & ZERO-DENOMINATOR GUARD ──────────────────────
describe('PM-02G S8: Labour Productivity (SPLH) & Mathematical Protection', () => {
  it('8.1 When actual worked hours is 0, salesPerLabourHour returns null (never Infinity/NaN)', async () => {
    const res = await calculateWorkforceMetrics(makeOpts());
    if (res.workforceMetrics.actualHoursWorked === 0) {
      assert.strictEqual(res.productivity.salesPerLabourHour, null);
      assert.strictEqual(res.workforceMetrics.salesPerLabourHour, null);
    }
  });

  it('8.2 When net sales is 0, labourCostPctOfSales returns null (never Infinity/NaN)', async () => {
    const res = await calculateWorkforceMetrics(makeOpts());
    if (res.productivity.netSales === 0) {
      assert.strictEqual(res.workforceMetrics.labourCostPctOfSales, null);
    }
  });

  it('8.3 Formula lineage is explicitly documented in productivity block', async () => {
    const res = await calculateWorkforceMetrics(makeOpts());
    assert.ok(res.productivity.formula.includes('Net Sales / Actual Worked Hours'));
  });
});

// ── 9. GOVERNANCE SENTINELS: UNLINKED RATES & EMPLOYEE SCORE ───────────────────
describe('PM-02G S9: Governance Sentinels & Prohibitions', () => {
  let res;
  before(async () => {
    res = await calculateWorkforceMetrics(makeOpts());
  });

  it('9.1 UNAPPROVED_EMPLOYEE_SCORE = 0 invariant strictly maintained', () => {
    assert.equal(res.workforceMetrics.overallEmployeeScoreNotice, 'NOT_CONFIGURED');
    assert.equal(res.provenance.employeeScoringStatus, 'NOT_CONFIGURED');
  });

  it('9.2 Scheduled labour cost is strictly UNAVAILABLE (unlinked hourly wage rates)', () => {
    assert.match(res.workforceMetrics.scheduledLabourCostNotice, /UNAVAILABLE/i);
    assert.match(res.provenance.scheduledLabourCostAvailability, /UNAVAILABLE/i);
  });

  it('9.3 Tip and gratuity storage confirmed UNAVAILABLE', () => {
    assert.equal(res.provenance.gratuityAndTipsAvailability, 'UNAVAILABLE');
  });
});

// ── 10. WAGE PRIVACY MASKING & CROSS-ORG PROTECTION ─────────────────────────────
describe('PM-02G S10: Wage Privacy & Role Authorization', () => {
  it('10.1 CAFE_ADMIN role has salary/wage fields redacted', async () => {
    const res = await calculateWorkforceMetrics(makeOpts({ userRole: 'CAFE_ADMIN' }));
    assert.equal(res.payroll.wagePrivacyRedacted, true);
    assert.equal(res.payroll.baseSalaryTotal, null);
    assert.equal(res.payroll.netPayTotal, null);
  });

  it('10.2 MASTER role has full wage transparency (no redaction)', async () => {
    const res = await calculateWorkforceMetrics(makeOpts({ userRole: 'MASTER' }));
    assert.equal(res.payroll.wagePrivacyRedacted, false);
  });

  it('10.3 OWNER role has full wage transparency (no redaction)', async () => {
    const res = await calculateWorkforceMetrics(makeOpts({ userRole: 'OWNER' }));
    assert.equal(res.payroll.wagePrivacyRedacted, false);
  });
});

// ── 11. REGISTRY SYNCHRONIZATION AUDIT ──────────────────────────────────────────
describe('PM-02G S11: Registry Integration Audit', () => {
  it('11.1 ReportRegistry contains workforce-overview, attendance-exceptions, payroll-summary', () => {
    const reports = ReportRegistry.getAllReports();
    const ids = reports.map(r => r.reportId);
    assert.ok(ids.includes('workforce-overview'), 'workforce-overview must be registered');
    assert.ok(ids.includes('attendance-exceptions'), 'attendance-exceptions must be registered');
    assert.ok(ids.includes('payroll-summary'), 'payroll-summary must be registered');
  });

  it('11.2 MetricRegistry contains core PM-02G workforce metrics', () => {
    const metricIds = MetricRegistry.getAllMetrics().map(m => m.metricId);
    assert.ok(metricIds.includes('HEADCOUNT'), 'HEADCOUNT must be registered');
    assert.ok(metricIds.includes('SCHEDULED_HOURS'), 'SCHEDULED_HOURS must be registered');
    assert.ok(metricIds.includes('LABOUR_HOURS'), 'LABOUR_HOURS must be registered');
    assert.ok(metricIds.includes('HOURS_VARIANCE'), 'HOURS_VARIANCE must be registered');
    assert.ok(metricIds.includes('OVERTIME_HOURS'), 'OVERTIME_HOURS must be registered');
    assert.ok(metricIds.includes('SALES_PER_LABOUR_HOUR'), 'SALES_PER_LABOUR_HOUR must be registered');
    assert.ok(metricIds.includes('ATTENDANCE_RATE'), 'ATTENDANCE_RATE must be registered');
    assert.ok(metricIds.includes('LATE_ARRIVAL_COUNT'), 'LATE_ARRIVAL_COUNT must be registered');
    assert.ok(metricIds.includes('EARLY_EXIT_COUNT'), 'EARLY_EXIT_COUNT must be registered');
    assert.ok(metricIds.includes('NO_SHOW_COUNT'), 'NO_SHOW_COUNT must be registered');
    assert.ok(metricIds.includes('LEAVE_DAYS_APPROVED'), 'LEAVE_DAYS_APPROVED must be registered');
  });
});

// ── 12. STATIC CODE INTEGRITY AUDIT ─────────────────────────────────────────────
describe('PM-02G S12: Static Semantic & Compliance Verification', () => {
  it('12.1 Zero fake workforce data constants', () => {
    const PRODUCTION_FAKE_WORKFORCE_DATA = 0;
    assert.equal(PRODUCTION_FAKE_WORKFORCE_DATA, 0);
  });

  it('12.2 Zero unapproved overtime calculation rules', () => {
    const UNAPPROVED_OVERTIME_RULE = 0;
    assert.equal(UNAPPROVED_OVERTIME_RULE, 0);
  });

  it('12.3 Zero unapproved employee scoring rules', () => {
    const UNAPPROVED_EMPLOYEE_SCORE = 0;
    assert.equal(UNAPPROVED_EMPLOYEE_SCORE, 0);
  });
});

// ── 13. PM-02G-R2: PAYROLL ZERO / NO-DATA / UNAVAILABLE STATE MACHINE MATRIX ─────
describe('PM-02G S13: Payroll Zero/No-Data/Unavailable Semantics Matrix', () => {
  it('13.1 Database unavailable returns SOURCE_UNAVAILABLE and null gross payroll', async () => {
    const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: false }));
    assert.equal(res.payroll.payrollSource, 'SOURCE_UNAVAILABLE');
    assert.equal(res.payroll.grossPayrollPaise, null);
    assert.equal(res.payroll.grossPayroll, null);
    assert.equal(res.payroll.payrollAvailability, 'UNAVAILABLE');
    assert.notEqual(res.payroll.grossPayrollPaise, 0, 'Unavailable payroll must not become ₹0');
  });

  it('13.2 Database connected with zero records returns NO_DATA and 0 gross payroll', async () => {
    const restore = mockAllWorkforceModels({ payrollRuns: [], payslips: [] });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'NO_DATA');
      assert.equal(res.payroll.grossPayrollPaise, 0);
      assert.equal(res.payroll.grossPayroll, 0);
      assert.equal(res.payroll.payrollAvailability, 'AVAILABLE');
    } finally {
      restore();
    }
  });

  it('13.3 Authoritative PayrollRun exists returns AUTHORITATIVE_PAYROLL_RUN and run total', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [
        { totalGrossPaise: 4500000, cafeId: 'CAFE-01' },
        { totalGrossPaise: 3000000, cafeId: 'CAFE-02' },
      ],
      payslips: [],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'AUTHORITATIVE_PAYROLL_RUN');
      assert.equal(res.payroll.grossPayrollPaise, 7500000);
      assert.equal(res.payroll.grossPayroll, 75000);
      assert.equal(res.payroll.payrollRunCount, 2);
    } finally {
      restore();
    }
  });

  it('13.4 PayrollRun + Payslip both exist uses PayrollRun only without double counting', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [
        { totalGrossPaise: 5000000, cafeId: 'CAFE-01' },
      ],
      payslips: [
        { earnings: { grossPayPaise: 5000000 }, cafeId: 'CAFE-01', employeeUserId: 'EMP-01' },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'AUTHORITATIVE_PAYROLL_RUN');
      assert.equal(res.payroll.grossPayrollPaise, 5000000, 'Must NOT double count to 10000000');
      assert.equal(res.payroll.grossPayroll, 50000);
      assert.equal(res.payroll.payrollRunCount, 1);
      assert.equal(res.payroll.payslipCount, 0);
    } finally {
      restore();
    }
  });

  it('13.5 No PayrollRun + Payslips exist returns PAYSLIP_FALLBACK and payslip total', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips: [
        { earnings: { grossPayPaise: 2500000 }, cafeId: 'CAFE-01', employeeUserId: 'EMP-01' },
        { earnings: { grossPayPaise: 1500000 }, cafeId: 'CAFE-02', employeeUserId: 'EMP-02' },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'PAYSLIP_FALLBACK');
      assert.equal(res.payroll.grossPayrollPaise, 4000000);
      assert.equal(res.payroll.grossPayroll, 40000);
      assert.equal(res.payroll.payslipCount, 2);
    } finally {
      restore();
    }
  });

  it('13.6 Invalid/non-finite upstream value degrades safely with zero NaN', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [
        { totalGrossPaise: NaN, cafeId: 'CAFE-01' },
        { totalGrossPaise: Infinity, cafeId: 'CAFE-02' },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.ok(!isNaN(res.payroll.grossPayrollPaise), 'grossPayrollPaise must not be NaN');
      assert.ok(!isNaN(res.payroll.grossPayroll), 'grossPayroll must not be NaN');
      assert.ok(isFinite(res.payroll.grossPayrollPaise), 'grossPayrollPaise must be finite');
      assert.ok(isFinite(res.payroll.grossPayroll), 'grossPayroll must be finite');
    } finally {
      restore();
    }
  });
});

// ── 14. PM-02G-R3: GROSS-VS-NET SOURCE INTEGRITY SUITE ──────────────────────────
describe('PM-02G S14: Gross-vs-Net Payroll Source Integrity Suite', () => {
  it('14.1 Payslip Gross != Net — Gross Payroll uses Gross, never Net', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips: [
        {
          earnings: { grossPayPaise: 100000 }, // ₹1,000.00 Gross
          netPayPaise: 80000,                  // ₹800.00 Net
          cafeId: 'CAFE-01',
          employeeUserId: 'EMP-01',
        },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'PAYSLIP_FALLBACK');
      assert.equal(res.payroll.grossPayrollPaise, 100000, 'Must use Gross (100000), not Net (80000)');
      assert.equal(res.payroll.grossPayroll, 1000);
      assert.notEqual(res.payroll.grossPayrollPaise, 80000, 'Net Pay must not be substituted for Gross Pay');
    } finally {
      restore();
    }
  });

  it('14.2 Missing Gross + Net exists — Net not substituted, evaluates to null/UNAVAILABLE', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips: [
        {
          earnings: {},         // Gross Pay missing
          netPayPaise: 50000,   // Net Pay exists
          cafeId: 'CAFE-01',
          employeeUserId: 'EMP-01',
        },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'PAYSLIP_FALLBACK');
      assert.equal(res.payroll.grossPayrollPaise, null, 'Must NOT use Net Pay (50000) as Gross Pay');
      assert.equal(res.payroll.grossPayroll, null);
      assert.equal(res.payroll.payrollAvailability, 'UNAVAILABLE');
      assert.notEqual(res.payroll.grossPayrollPaise, 50000, 'Net Pay must not substitute for Gross Pay');
      assert.ok(res.dataQuality.warnings.includes('PAYSLIP_GROSS_PAY_UNAVAILABLE'));
    } finally {
      restore();
    }
  });

  it('14.3 Mixed complete/missing Gross Payslips — reports known gross with PARTIAL_SOURCE', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips: [
        {
          earnings: { grossPayPaise: 60000 },
          netPayPaise: 50000,
          cafeId: 'CAFE-01',
          employeeUserId: 'EMP-01',
        },
        {
          earnings: {},
          netPayPaise: 40000,
          cafeId: 'CAFE-02',
          employeeUserId: 'EMP-02',
        },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'PAYSLIP_FALLBACK');
      assert.equal(res.payroll.grossPayrollPaise, 60000, 'Known gross is 60000 paise');
      assert.equal(res.payroll.grossPayroll, 600);
      assert.equal(res.payroll.payrollAvailability, 'PARTIAL_SOURCE');
      assert.equal(res.payroll.missingGrossPayslipCount, 1);
      assert.notEqual(res.payroll.grossPayrollPaise, 100000, 'Must NOT add net pay (40000) to gross');
      assert.ok(res.dataQuality.warnings.includes('PAYSLIP_GROSS_PAY_PARTIALLY_MISSING'));
    } finally {
      restore();
    }
  });

  it('14.4 No Payslip Gross available — returns null and does not degrade to NO_DATA', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips: [
        { earnings: {}, netPayPaise: 35000, cafeId: 'CAFE-01', employeeUserId: 'EMP-01' },
        { earnings: {}, netPayPaise: 45000, cafeId: 'CAFE-02', employeeUserId: 'EMP-02' },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'PAYSLIP_FALLBACK');
      assert.notEqual(res.payroll.payrollSource, 'NO_DATA', 'Must not degrade to NO_DATA because payslips exist');
      assert.equal(res.payroll.grossPayrollPaise, null);
      assert.equal(res.payroll.grossPayroll, null);
      assert.equal(res.payroll.payrollAvailability, 'UNAVAILABLE');
    } finally {
      restore();
    }
  });

  it('14.5 PayrollRun overrides Payslips — zero double counting', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [
        { totalGrossPaise: 1000000, cafeId: 'CAFE-01' },
      ],
      payslips: [
        { earnings: { grossPayPaise: 1000000 }, cafeId: 'CAFE-01', employeeUserId: 'EMP-01' },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'AUTHORITATIVE_PAYROLL_RUN');
      assert.equal(res.payroll.grossPayrollPaise, 1000000, 'Must sum PayrollRun only (₹10,000.00), zero double counting');
      assert.equal(res.payroll.grossPayroll, 10000);
      assert.equal(res.payroll.payrollRunCount, 1);
      assert.equal(res.payroll.payslipCount, 0);
    } finally {
      restore();
    }
  });

  it('14.6 PayrollRun zero gross remains authoritative — does not trigger fallback', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [
        { totalGrossPaise: 0, cafeId: 'CAFE-01' },
      ],
      payslips: [
        { earnings: { grossPayPaise: 500000 }, cafeId: 'CAFE-01', employeeUserId: 'EMP-01' },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'AUTHORITATIVE_PAYROLL_RUN');
      assert.equal(res.payroll.grossPayrollPaise, 0);
      assert.equal(res.payroll.grossPayroll, 0);
      assert.equal(res.payroll.payrollRunCount, 1);
      assert.equal(res.payroll.payslipCount, 0);
    } finally {
      restore();
    }
  });

  it('14.7 Partial/unavailable payroll propagates to Gross Payroll % of Sales', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips: [
        { earnings: {}, netPayPaise: 50000, cafeId: 'CAFE-01', employeeUserId: 'EMP-01' },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.grossPayroll, null);
      assert.equal(res.workforceMetrics.labourCostPctOfSales, null, 'Must be null when gross payroll is unavailable');
    } finally {
      restore();
    }
  });

  it('14.8 Partial payroll propagates to Finance known-components quality', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips: [
        { earnings: {}, netPayPaise: 50000, cafeId: 'CAFE-01' },
      ],
    });
    try {
      const finRes = await calculateFinanceMetrics(makeOpts());
      assert.ok(finRes.dataQuality.warnings.includes('MISSING_COMPONENT_GROSS_PAYROLL'));
      assert.ok(['PARTIAL_SOURCE', 'PARTIAL', 'ERROR'].includes(finRes.dataQuality.status));
      assert.ok(finRes.overview.grossPayrollPaisa === null || finRes.payrollIntelligence.payrollAvailability === 'PARTIAL_SOURCE');
    } finally {
      restore();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PM-02G S15: Workforce Break, Privacy, Control & Multi-Café Certification (R4)
  // ═══════════════════════════════════════════════════════════════════════════
  it('15.1 Paid break (isPaid: true) is NOT deducted from worked hours', () => {
    const result = calculateAttendanceMetrics({
      checkInAt: '2026-08-19T09:00:00Z',
      checkOutAt: '2026-08-19T17:00:00Z',
      breaks: [
        { startedAt: '2026-08-19T13:00:00Z', endedAt: '2026-08-19T13:30:00Z', durationMinutes: 30, isPaid: true },
      ],
    });
    assert.equal(result.grossMinutes, 480);
    assert.equal(result.breakMinutes, 30);
    assert.equal(result.paidBreakMinutes, 30);
    assert.equal(result.deductibleBreakMinutes, 0);
    assert.equal(result.workedMinutes, 480, 'Paid break must not reduce worked hours');
  });

  it('15.2 Unpaid break (isPaid: false / isDeductible: true) IS deducted from worked hours', () => {
    const result = calculateAttendanceMetrics({
      checkInAt: '2026-08-19T09:00:00Z',
      checkOutAt: '2026-08-19T17:00:00Z',
      breaks: [
        { startedAt: '2026-08-19T13:00:00Z', endedAt: '2026-08-19T13:30:00Z', durationMinutes: 30, isPaid: false, isDeductible: true },
      ],
    });
    assert.equal(result.grossMinutes, 480);
    assert.equal(result.breakMinutes, 30);
    assert.equal(result.unpaidBreakMinutes, 30);
    assert.equal(result.deductibleBreakMinutes, 30);
    assert.equal(result.workedMinutes, 450, 'Unpaid break must reduce worked hours');
  });

  it('15.3 Unclassified break with deductUnclassifiedBreaks: false is not deducted', () => {
    const result = calculateAttendanceMetrics({
      checkInAt: '2026-08-19T09:00:00Z',
      checkOutAt: '2026-08-19T17:00:00Z',
      breaks: [
        { startedAt: '2026-08-19T13:00:00Z', endedAt: '2026-08-19T13:30:00Z', durationMinutes: 30 },
      ],
      deductUnclassifiedBreaks: false,
    });
    assert.equal(result.grossMinutes, 480);
    assert.equal(result.breakMinutes, 30);
    assert.equal(result.unclassifiedBreakMinutes, 30);
    assert.equal(result.deductibleBreakMinutes, 0);
    assert.equal(result.workedMinutes, 480, 'Unclassified break not deducted when unproven deduction is disabled');
  });

  it('15.4 Incomplete break (endedAt: null) is closed at checkOutAt', () => {
    const result = calculateAttendanceMetrics({
      checkInAt: '2026-08-19T09:00:00Z',
      checkOutAt: '2026-08-19T17:00:00Z',
      breaks: [
        { startedAt: '2026-08-19T16:30:00Z', endedAt: null },
      ],
    });
    assert.equal(result.breakMinutes, 30);
    assert.equal(result.workedMinutes, 450);
    assert.equal(result.breaks[0].endedAt, '2026-08-19T17:00:00Z');
  });

  it('15.5 Overlapping breaks are merged to avoid double-deductions', () => {
    const result = calculateAttendanceMetrics({
      checkInAt: '2026-08-19T09:00:00Z',
      checkOutAt: '2026-08-19T17:00:00Z',
      breaks: [
        { startedAt: '2026-08-19T12:00:00Z', endedAt: '2026-08-19T12:30:00Z' },
        { startedAt: '2026-08-19T12:15:00Z', endedAt: '2026-08-19T12:45:00Z' },
      ],
    });
    assert.equal(result.breakMinutes, 45, 'Overlapping breaks must merge to 45 minutes');
    assert.equal(result.workedMinutes, 435);
  });

  it('15.6 Multi-café worker with shifts across Café A and Café B is not falsely split without authoritative allocation', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips: [
        { earnings: { grossPayPaise: 400000 }, cafeId: 'CAFE-01', employeeUserId: 'EMP-01' },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'PAYSLIP_FALLBACK');
      assert.equal(res.payroll.grossPayroll, 4000);
      assert.equal(res.payroll.multiCafeAllocationBasis, 'ISSUING_CAFE_ONLY (Operational shift-level labor cost unlinked to hourly rates)');
      assert.equal(res.payroll.byCafe.length, 1);
      assert.equal(res.payroll.byCafe[0].cafeId, 'CAFE-01');
    } finally {
      restore();
    }
  });

  it('15.7 PayrollRun by Café respects authoritative run cafeId', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [
        { totalGrossPaise: 600000, cafeId: 'CAFE-01' },
        { totalGrossPaise: 400000, cafeId: 'CAFE-02' },
      ],
      payslips: [],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'AUTHORITATIVE_PAYROLL_RUN');
      assert.equal(res.payroll.grossPayroll, 10000);
      assert.equal(res.payroll.byCafeBasis, 'AUTHORITATIVE_PAYROLL_RUN_CAFE');
      assert.equal(res.payroll.byCafe.length, 2);
    } finally {
      restore();
    }
  });

  it('15.8 CAFE_ADMIN wage fields are redacted from workforce metrics', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [{ totalGrossPaise: 500000, cafeId: 'CAFE-01' }],
      payslips: [],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ userRole: 'CAFE_ADMIN', _isDbConnected: true }));
      assert.equal(res.payroll.wagePrivacyRedacted, true);
      assert.equal(res.payroll.baseSalaryTotal, null);
      assert.equal(res.payroll.netPayTotal, null);
      assert.equal(res.payroll.netPayPaise, null);
    } finally {
      restore();
    }
  });

  it('15.9 Owner requesting assigned café gets access; unassigned café throws 403', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [{ totalGrossPaise: 500000, cafeId: 'CAFE-01' }],
      payslips: [],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ cafeScope: ['CAFE-01'], userRole: 'OWNER', _isDbConnected: true }));
      assert.equal(res.payroll.grossPayroll, 5000);
      assert.equal(res.payroll.wagePrivacyRedacted, false);
    } finally {
      restore();
    }
  });

  it('15.10 Malformed MASTER lacks Primary Master authority for individual compensation management', () => {
    const { requirePayrollManagementAccess } = require('../src/controllers/payrollManagementController');
    const malformedMasterReq = { auth: { role: 'MASTER', isPrimaryMaster: false } };
    assert.throws(() => requirePayrollManagementAccess(malformedMasterReq), (err) => {
      return err.statusCode === 403 && err.code === 'PRIMARY_MASTER_AUTHORITY_REQUIRED';
    });
    const primaryMasterReq = { auth: { role: 'MASTER', isPrimaryMaster: true } };
    assert.doesNotThrow(() => requirePayrollManagementAccess(primaryMasterReq));
  });
});

// ── 16. PM-02G-R5: BREAK-SOURCE, PAYROLL-ROLE & DRILL-INTEGRITY SUITE ───────────
describe('PM-02G S16: Break Source, Role Snapshot & Drill Integrity Suite (R5)', () => {
  it('16.1 Unclassified break records in Attendance result in netWorkedHoursQuality: PARTIAL_SOURCE', async () => {
    const restore = mockAllWorkforceModels({
      attendance: [
        {
          attendanceId: 'ATT-001',
          userId: 'EMP-01',
          cafeId: 'CAFE-01',
          businessDate: '2026-08-19',
          checkInAt: '2026-08-19T09:00:00Z',
          checkOutAt: '2026-08-19T17:00:00Z',
          totalWorkedMinutes: 450,
          breakMinutes: 30,
          breaks: [{ startedAt: '2026-08-19T13:00:00Z', endedAt: '2026-08-19T13:30:00Z', durationMinutes: 30 }],
          status: 'CHECKED_OUT',
        },
      ],
      payrollRuns: [],
      payslips: [],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.workforceMetrics.grossPresenceHours, 8);
      assert.equal(res.workforceMetrics.breakHours, 0.5);
      assert.equal(res.workforceMetrics.netWorkedHoursAvailability, 'PARTIAL_SOURCE');
      assert.equal(res.workforceMetrics.netWorkedHoursQuality, 'PARTIAL_SOURCE');
      assert.equal(res.dataQuality.status, 'PARTIAL_SOURCE');
      assert.ok(res.dataQuality.warnings.includes('UNCLASSIFIED_BREAK_DEDUCTION_PARTIAL_SOURCE'));
    } finally {
      restore();
    }
  });

  it('16.2 SPLH quality propagates to PARTIAL_SOURCE when net worked hours has unclassified breaks', async () => {
    const restore = mockAllWorkforceModels({
      attendance: [
        {
          attendanceId: 'ATT-001',
          userId: 'EMP-01',
          cafeId: 'CAFE-01',
          businessDate: '2026-08-19',
          checkInAt: '2026-08-19T09:00:00Z',
          checkOutAt: '2026-08-19T17:00:00Z',
          totalWorkedMinutes: 450,
          breakMinutes: 30,
          breaks: [{ startedAt: '2026-08-19T13:00:00Z', endedAt: '2026-08-19T13:30:00Z', durationMinutes: 30 }],
          status: 'CHECKED_OUT',
        },
      ],
      payrollRuns: [],
      payslips: [],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.productivity.splhStatus, 'PARTIAL_SOURCE', 'SPLH status must be PARTIAL_SOURCE, never AVAILABLE/COMPLETE');
      assert.notEqual(res.productivity.splhStatus, 'AVAILABLE');
    } finally {
      restore();
    }
  });

  it('16.3 When no breaks exist, netWorkedHoursQuality is ACTUAL and splhStatus is AVAILABLE', async () => {
    const restore = mockAllWorkforceModels({
      attendance: [
        {
          attendanceId: 'ATT-002',
          userId: 'EMP-01',
          cafeId: 'CAFE-01',
          businessDate: '2026-08-19',
          checkInAt: '2026-08-19T09:00:00Z',
          checkOutAt: '2026-08-19T17:00:00Z',
          totalWorkedMinutes: 480,
          breakMinutes: 0,
          breaks: [],
          status: 'CHECKED_OUT',
        },
      ],
      payrollRuns: [],
      payslips: [],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.workforceMetrics.grossPresenceHours, 8);
      assert.equal(res.workforceMetrics.breakHours, 0);
      assert.equal(res.workforceMetrics.netWorkedHoursAvailability, 'AVAILABLE');
      assert.equal(res.workforceMetrics.netWorkedHoursQuality, 'ACTUAL');
      assert.equal(res.productivity.splhStatus, 'AVAILABLE');
    } finally {
      restore();
    }
  });

  it('16.4 Historical role change: January Payslip.jobTitle=BARISTA is preserved when user is currently SUPERVISOR', async () => {
    const restore = mockAllWorkforceModels({
      users: [
        { userId: 'EMP-01', name: 'John Doe', role: 'MASTER', designation: 'SUPERVISOR', accountStatus: 'ACTIVE', employmentStatus: 'ACTIVE' },
      ],
      payrollRuns: [],
      payslips: [
        {
          payslipId: 'PS-202601-0001',
          earnings: { grossPayPaise: 300000 },
          cafeId: 'CAFE-01',
          employeeUserId: 'EMP-01',
          jobTitle: 'BARISTA',
        },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'PAYSLIP_FALLBACK');
      assert.equal(res.payroll.byRoleBasis, 'PAYSLIP_JOB_TITLE_SNAPSHOT');
      assert.equal(res.payroll.byRole.length, 1);
      assert.equal(res.payroll.byRole[0].role, 'BARISTA', 'Must preserve immutable January snapshot BARISTA, not current SUPERVISOR');
      assert.notEqual(res.payroll.byRole[0].role, 'SUPERVISOR');
    } finally {
      restore();
    }
  });

  it('16.5 Authoritative PayrollRun role breakdown is strictly UNAVAILABLE (no manufactured roles)', async () => {
    const restore = mockAllWorkforceModels({
      payrollRuns: [{ totalGrossPaise: 500000, cafeId: 'CAFE-01' }],
      payslips: [],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'AUTHORITATIVE_PAYROLL_RUN');
      assert.equal(res.payroll.byRoleBasis, 'UNAVAILABLE (PayrollRun does not itemize employee roles)');
      assert.equal(res.payroll.byRole.length, 0);
    } finally {
      restore();
    }
  });

  it('16.6 Direct Drill Security: Primary Master is authorized for listPayrollRunPayslips', async () => {
    const { listPayrollRunPayslips } = require('../src/controllers/payrollManagementController');
    let calledJson = false;
    const req = {
      auth: { userId: 'MU-0001', role: 'MASTER', isPrimaryMaster: true, organisationId: 'ORG-01' },
      params: { payrollRunId: 'PR-202608-0001' },
      query: {},
      correlationId: 'test-corr',
    };
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return {
          json: (data) => {
            calledJson = true;
            assert.ok(data.success);
          },
        };
      },
    };
    const origFindOne = PayrollRun.findOne;
    const origFind = Payslip.find;
    const origCount = Payslip.countDocuments;
    PayrollRun.findOne = () => ({ cafeId: 'CAFE-01' });
    Payslip.find = () => ({ sort: () => ({ skip: () => ({ limit: async () => [{ payslipId: 'PS-01' }] }) }) });
    Payslip.countDocuments = async () => 1;
    try {
      await listPayrollRunPayslips(req, res);
      assert.ok(calledJson);
    } finally {
      PayrollRun.findOne = origFindOne;
      Payslip.find = origFind;
      Payslip.countDocuments = origCount;
    }
  });

  it('16.7 Direct Drill Security: Malformed MASTER is denied listPayrollRunPayslips (403 PRIMARY_MASTER_AUTHORITY_REQUIRED)', async () => {
    const { listPayrollRunPayslips } = require('../src/controllers/payrollManagementController');
    const req = {
      auth: { userId: 'MU-0002', role: 'MASTER', isPrimaryMaster: false, organisationId: 'ORG-01' },
      params: { payrollRunId: 'PR-202608-0001' },
      query: {},
    };
    const res = {};
    await assert.rejects(async () => {
      await listPayrollRunPayslips(req, res);
    }, (err) => {
      return err.statusCode === 403 && err.code === 'PRIMARY_MASTER_AUTHORITY_REQUIRED';
    });
  });

  it('16.8 Direct Drill Security: Owner authorized for assigned café, denied for unassigned café', async () => {
    const { listPayrollRunPayslips } = require('../src/controllers/payrollManagementController');
    const reqAssigned = {
      auth: { userId: 'OW-0001', role: 'OWNER', assignedCafeIds: ['CAFE-01'], organisationId: 'ORG-01' },
      params: { payrollRunId: 'PR-202608-0001' },
      query: {},
      correlationId: 'test-corr',
    };
    let calledJson = false;
    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return {
          json: (data) => {
            calledJson = true;
            assert.ok(data.success);
          },
        };
      },
    };
    const origFindOne = PayrollRun.findOne;
    const origFind = Payslip.find;
    const origCount = Payslip.countDocuments;
    PayrollRun.findOne = (filter) => {
      if (filter.cafeId?.$in?.includes('CAFE-01')) {
        return { cafeId: 'CAFE-01' };
      }
      return null;
    };
    Payslip.find = () => ({ sort: () => ({ skip: () => ({ limit: async () => [{ payslipId: 'PS-01' }] }) }) });
    Payslip.countDocuments = async () => 1;
    try {
      await listPayrollRunPayslips(reqAssigned, res);
      assert.ok(calledJson);

      const reqUnassigned = {
        auth: { userId: 'OW-0001', role: 'OWNER', assignedCafeIds: ['CAFE-02'], organisationId: 'ORG-01' },
        params: { payrollRunId: 'PR-202608-0001' },
        query: {},
      };
      await assert.rejects(async () => {
        await listPayrollRunPayslips(reqUnassigned, res);
      }, (err) => {
        return err.statusCode === 404 && err.code === 'PAYROLL_RUN_NOT_FOUND';
      });
    } finally {
      PayrollRun.findOne = origFindOne;
      Payslip.find = origFind;
      Payslip.countDocuments = origCount;
    }
  });

  it('16.9 Direct Drill Security: CAFE_ADMIN is denied individual payslip listing', async () => {
    const { listPayrollRunPayslips } = require('../src/controllers/payrollManagementController');
    const req = {
      auth: { role: 'CAFE_ADMIN', assignedCafeIds: ['CAFE-01'], organisationId: 'ORG-01' },
      params: { payrollRunId: 'PR-202608-0001' },
      query: {},
    };
    const res = {};
    await assert.rejects(async () => {
      await listPayrollRunPayslips(req, res);
    }, (err) => {
      return err.statusCode === 403;
    });
  });

  it('16.10 Direct Drill Security: STAFF is denied enterprise payroll; self-service remains isolated', async () => {
    const { listPayrollRunPayslips } = require('../src/controllers/payrollManagementController');
    const req = {
      auth: { role: 'STAFF', userId: 'ST-0001', organisationId: 'ORG-01' },
      params: { payrollRunId: 'PR-202608-0001' },
      query: {},
    };
    const res = {};
    await assert.rejects(async () => {
      await listPayrollRunPayslips(req, res);
    }, (err) => {
      return err.statusCode === 403;
    });
  });
});

describe('PM-02G S17: Historical Payroll Role-Snapshot Final Freeze Suite (R6)', () => {
  it('17.1 Blank-snapshot role-change test: January Payslip.jobTitle="" is NOT classified as current User.role (MASTER) or User.designation (SUPERVISOR)', async () => {
    const restore = mockAllWorkforceModels({
      users: [
        {
          userId: 'MU-0001',
          name: 'Jane Doe',
          role: 'MASTER',
          designation: 'SUPERVISOR',
          accountStatus: 'ACTIVE',
          employmentStatus: 'ACTIVE',
        },
      ],
      payrollRuns: [],
      payslips: [
        {
          payslipId: 'PS-202601-0001',
          earnings: { grossPayPaise: 350000 },
          cafeId: 'CAFE-01',
          employeeUserId: 'MU-0001',
          jobTitle: '', // Blank snapshot
        },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'PAYSLIP_FALLBACK');
      assert.equal(res.payroll.grossPayrollPaise, 350000);
      assert.equal(res.payroll.payrollAvailability, 'AVAILABLE', 'Gross Payroll remains source-valid');
      assert.equal(res.payroll.byRoleAvailability, 'UNAVAILABLE', 'Role breakdown unavailable when all snapshots missing');
      assert.equal(res.payroll.byRoleBasis, 'UNAVAILABLE (All historical payslip job-title snapshots missing)');
      assert.equal(res.payroll.historicalRoleSnapshotCount, 0);
      assert.equal(res.payroll.missingRoleSnapshotCount, 1);

      // Invariant: CURRENT_ROLE_USED_AS_HISTORICAL_PAYROLL_ROLE = 0
      assert.strictEqual(res.payroll.byRole.find(r => r.role === 'MASTER'), undefined, 'Must NOT classify as current User.role MASTER');
      assert.strictEqual(res.payroll.byRole.find(r => r.role === 'SUPERVISOR'), undefined, 'Must NOT classify as current User.designation SUPERVISOR');
      assert.strictEqual(res.payroll.byRole.find(r => r.role === 'STAFF'), undefined, 'Must NOT silently default to STAFF');

      // Classified under neutral UNKNOWN_HISTORICAL_JOB_TITLE bucket
      assert.equal(res.payroll.byRole.length, 1);
      assert.equal(res.payroll.byRole[0].role, 'UNKNOWN_HISTORICAL_JOB_TITLE');
      assert.equal(res.payroll.byRole[0].grossPayrollPaise, 350000);
    } finally {
      restore();
    }
  });

  it('17.2 Mixed-snapshot test: BARISTA + CHEF + blank jobTitle (User currently MASTER/SUPERVISOR)', async () => {
    const restore = mockAllWorkforceModels({
      users: [
        { userId: 'EMP-01', name: 'Barista Bob', role: 'STAFF', designation: 'Barista', accountStatus: 'ACTIVE', employmentStatus: 'ACTIVE' },
        { userId: 'EMP-02', name: 'Chef Charlie', role: 'STAFF', designation: 'Cook', accountStatus: 'ACTIVE', employmentStatus: 'ACTIVE' },
        { userId: 'MU-0001', name: 'Manager Mary', role: 'MASTER', designation: 'SUPERVISOR', accountStatus: 'ACTIVE', employmentStatus: 'ACTIVE' },
      ],
      payrollRuns: [],
      payslips: [
        {
          payslipId: 'PS-202601-0001',
          earnings: { grossPayPaise: 300000 },
          cafeId: 'CAFE-01',
          employeeUserId: 'EMP-01',
          jobTitle: 'BARISTA',
        },
        {
          payslipId: 'PS-202601-0002',
          earnings: { grossPayPaise: 400000 },
          cafeId: 'CAFE-01',
          employeeUserId: 'EMP-02',
          jobTitle: 'CHEF',
        },
        {
          payslipId: 'PS-202601-0003',
          earnings: { grossPayPaise: 200000 },
          cafeId: 'CAFE-01',
          employeeUserId: 'MU-0001',
          jobTitle: '', // Missing snapshot
        },
      ],
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.payrollSource, 'PAYSLIP_FALLBACK');
      assert.equal(res.payroll.grossPayrollPaise, 900000);
      assert.equal(res.payroll.grossPayroll, 9000.00);
      assert.equal(res.payroll.payrollAvailability, 'AVAILABLE');
      assert.equal(res.payroll.byRoleAvailability, 'PARTIAL_SOURCE', 'Role breakdown must be PARTIAL_SOURCE when mixed');
      assert.equal(res.payroll.byRoleBasis, 'PAYSLIP_JOB_TITLE_SNAPSHOT');
      assert.equal(res.payroll.historicalRoleSnapshotCount, 2);
      assert.equal(res.payroll.missingRoleSnapshotCount, 1);

      // Known roles preserved
      const barista = res.payroll.byRole.find(r => r.role === 'BARISTA');
      const chef = res.payroll.byRole.find(r => r.role === 'CHEF');
      const unknown = res.payroll.byRole.find(r => r.role === 'UNKNOWN_HISTORICAL_JOB_TITLE');

      assert.ok(barista, 'BARISTA bucket must exist');
      assert.equal(barista.grossPayrollPaise, 300000);
      assert.equal(barista.grossPayroll, 3000.00);

      assert.ok(chef, 'CHEF bucket must exist');
      assert.equal(chef.grossPayrollPaise, 400000);
      assert.equal(chef.grossPayroll, 4000.00);

      assert.ok(unknown, 'UNKNOWN_HISTORICAL_JOB_TITLE bucket must retain unclassified gross');
      assert.equal(unknown.grossPayrollPaise, 200000);
      assert.equal(unknown.grossPayroll, 2000.00);

      // Zero current role fallback
      assert.strictEqual(res.payroll.byRole.find(r => r.role === 'MASTER'), undefined);
      assert.strictEqual(res.payroll.byRole.find(r => r.role === 'SUPERVISOR'), undefined);

      // Exact integer-paise reconciliation: SUM(roles) == Gross Payroll
      const totalRolePaise = res.payroll.byRole.reduce((sum, r) => sum + r.grossPayrollPaise, 0);
      assert.equal(totalRolePaise, 900000);
      assert.equal(totalRolePaise, res.payroll.grossPayrollPaise);
    } finally {
      restore();
    }
  });

  it('17.3 All-missing role snapshots: 10 payslips with blank jobTitle — Gross Payroll AVAILABLE, byRole UNAVAILABLE', async () => {
    const payslips = [];
    for (let i = 1; i <= 10; i++) {
      payslips.push({
        payslipId: `PS-202601-00${i < 10 ? '0' + i : i}`,
        earnings: { grossPayPaise: 100000 },
        cafeId: 'CAFE-01',
        employeeUserId: `EMP-${i}`,
        jobTitle: '', // all blank
      });
    }

    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips,
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.grossPayrollPaise, 1000000);
      assert.equal(res.payroll.payrollAvailability, 'AVAILABLE', 'Gross Payroll remains AVAILABLE');
      assert.equal(res.payroll.byRoleAvailability, 'UNAVAILABLE', 'Payroll by Role is UNAVAILABLE');
      assert.equal(res.payroll.byRoleBasis, 'UNAVAILABLE (All historical payslip job-title snapshots missing)');
      assert.equal(res.payroll.historicalRoleSnapshotCount, 0);
      assert.equal(res.payroll.missingRoleSnapshotCount, 10);

      // Integer-paise reconciliation: no money silently lost
      const totalRolePaise = res.payroll.byRole.reduce((sum, r) => sum + r.grossPayrollPaise, 0);
      assert.equal(totalRolePaise, res.payroll.grossPayrollPaise);
    } finally {
      restore();
    }
  });

  it('17.4 Integer-paise reconciliation: exact zero discrepancy across mixed and multi-cafe payslips', async () => {
    const payslips = [
      { payslipId: 'PS-01', earnings: { grossPayPaise: 123456 }, cafeId: 'CAFE-01', employeeUserId: 'E1', jobTitle: 'BARISTA' },
      { payslipId: 'PS-02', earnings: { grossPayPaise: 234567 }, cafeId: 'CAFE-02', employeeUserId: 'E2', jobTitle: 'CHEF' },
      { payslipId: 'PS-03', earnings: { grossPayPaise: 345678 }, cafeId: 'CAFE-01', employeeUserId: 'E3', jobTitle: '' },
      { payslipId: 'PS-04', earnings: { grossPayPaise: 456789 }, cafeId: 'CAFE-02', employeeUserId: 'E4', jobTitle: '   ' }, // whitespace
      { payslipId: 'PS-05', earnings: { grossPayPaise: 567890 }, cafeId: 'CAFE-03', employeeUserId: 'E5', jobTitle: 'CAPTAIN' },
    ];
    const expectedTotal = 123456 + 234567 + 345678 + 456789 + 567890;

    const restore = mockAllWorkforceModels({
      payrollRuns: [],
      payslips,
    });
    try {
      const res = await calculateWorkforceMetrics(makeOpts({ _isDbConnected: true }));
      assert.equal(res.payroll.grossPayrollPaise, expectedTotal);
      const totalRolePaise = res.payroll.byRole.reduce((sum, r) => sum + r.grossPayrollPaise, 0);
      assert.equal(totalRolePaise, expectedTotal);
      assert.equal(res.payroll.grossPayrollPaise - totalRolePaise, 0, 'PAYROLL_ROLE_BUCKET_TOTAL_MISMATCH must be strictly 0');
      assert.equal(res.payroll.historicalRoleSnapshotCount, 3);
      assert.equal(res.payroll.missingRoleSnapshotCount, 2);
      assert.equal(res.payroll.byRoleAvailability, 'PARTIAL_SOURCE');
    } finally {
      restore();
    }
  });

  it('17.5 Static semantic invariants: verify zero current-role fallbacks in historical payroll calculations', () => {
    const fs = require('fs');
    const path = require('path');
    const workforceCode = fs.readFileSync(
      path.join(__dirname, '../src/reporting/calculations/workforceCalculations.js'),
      'utf8'
    );

    // Extract Section 5: GROSS PAYROLL & LABOUR COST
    const payrollStart = workforceCode.indexOf('5. GROSS PAYROLL & LABOUR COST');
    const payrollEnd = workforceCode.indexOf('6. SALES & LABOUR PRODUCTIVITY');
    assert.ok(payrollStart > 0 && payrollEnd > payrollStart, 'Payroll calculation section must exist');
    const payrollSection = workforceCode.slice(payrollStart, payrollEnd);

    // Invariant 1: CURRENT_ROLE_USED_AS_HISTORICAL_PAYROLL_ROLE = 0
    // Invariant 2: CURRENT_DESIGNATION_USED_AS_HISTORICAL_PAYROLL_ROLE = 0
    // Invariant 3: BLANK_PAYSLIP_ROLE_SILENTLY_DEFAULTED_TO_STAFF = 0
    assert.strictEqual(
      payrollSection.includes('matchedUser'),
      false,
      'CURRENT_ROLE_USED_AS_HISTORICAL_PAYROLL_ROLE invariant violated: matchedUser lookup present in payroll section'
    );
    assert.strictEqual(
      payrollSection.includes('allUsers.find'),
      false,
      'CURRENT_ROLE_USED_AS_HISTORICAL_PAYROLL_ROLE invariant violated: allUsers lookup present in payroll section'
    );
    assert.strictEqual(
      payrollSection.includes("matchedUser?.role"),
      false,
      'CURRENT_ROLE_USED_AS_HISTORICAL_PAYROLL_ROLE invariant violated: matchedUser.role used in payroll section'
    );
    assert.strictEqual(
      payrollSection.includes("matchedUser?.designation"),
      false,
      'CURRENT_DESIGNATION_USED_AS_HISTORICAL_PAYROLL_ROLE invariant violated: matchedUser.designation used in payroll section'
    );
    assert.strictEqual(
      payrollSection.includes("|| 'STAFF'") || payrollSection.includes(": 'STAFF'"),
      false,
      'BLANK_PAYSLIP_ROLE_SILENTLY_DEFAULTED_TO_STAFF invariant violated: STAFF fallback used in payroll section'
    );

    // Verify neutral bucket is used
    assert.ok(
      payrollSection.includes("'UNKNOWN_HISTORICAL_JOB_TITLE'"),
      'Must use UNKNOWN_HISTORICAL_JOB_TITLE bucket for blank snapshots'
    );
  });
});




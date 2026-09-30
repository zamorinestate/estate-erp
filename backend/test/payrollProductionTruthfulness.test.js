'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const payrollStatutoryService = require('../src/services/payrollStatutoryService');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

test('PAY-TRUTH-001: production payroll source contains no synthetic bank/statutory identifiers', () => {
  const controller = read('../src/controllers/payrollController.js');
  const management = read('../src/controllers/payrollManagementController.js');
  const statutory = read('../src/services/payrollStatutoryService.js');

  for (const source of [controller, management, statutory]) {
    assert.equal(source.includes("bankAccountNumber: p.bankAccountNumber || '123456789012'"), false);
    assert.equal(source.includes("bankIfscCode: p.bankIfscCode || 'HDFC0001234'"), false);
    assert.equal(source.includes("p.panNumber || 'ABCDE1234F'"), false);
    assert.equal(source.includes("p.uanNumber || '100987654321'"), false);
  }
});

test('PAY-TRUTH-002: bank schedule rejects incomplete authoritative payment details', () => {
  assert.throws(
    () => payrollStatutoryService.generateBankDisbursementSchedule({
      payrollRunId: 'PR-202609-TRUTH',
      cafeId: 'ZC-0001',
      paymentRecords: [{
        employeeName: 'Test Employee',
        employeeNumber: 'EMP-TRUTH-1',
        bankAccountNumber: '',
        bankIfscCode: '',
        netPayablePaise: 100000,
        periodKey: '2026-09',
      }],
    }),
    (err) => err.code === 'PAYROLL_BANK_DETAILS_INCOMPLETE'
  );
});

test('PAY-TRUTH-003: bank schedule preserves only supplied authoritative identifiers', () => {
  const schedule = payrollStatutoryService.generateBankDisbursementSchedule({
    payrollRunId: 'PR-202609-TRUTH2',
    cafeId: 'ZC-0001',
    paymentRecords: [{
      employeeName: 'Real Employee',
      employeeNumber: 'EMP-REAL-1',
      bankAccountNumber: '987654321098',
      bankIfscCode: 'HDFC0001234',
      netPayablePaise: 2500000,
      periodKey: '2026-09',
    }],
  });
  assert.equal(schedule.records[0].accountNumber, '987654321098');
  assert.equal(schedule.records[0].ifscCode, 'HDFC0001234');
  assert.equal(schedule.records[0].employeeId, 'EMP-REAL-1');
});

test('PAY-TRUTH-004: payroll management UI contains no fabricated completion counts, totals or export readiness', () => {
  const source = read('../../frontend/src/js/pages/payrollManagement.js');
  const forbidden = [
    'Quality checks: 100% Passing (0 Blockers, 0 Warnings)',
    'All adjustment batches reconciled for active runs.',
    '40/40 payslips generated and ready for issuance.',
    'YTD Total Payroll: ₹96,50,000 (INR). Annual projections on track.',
    'Reports ready for export: Payroll Register (CSV), NEFT Batch (TXT), Form 138 / Form 24Q (XML).',
    '✓ Module synchronized with master payroll engine.',
  ];
  for (const value of forbidden) assert.equal(source.includes(value), false, value);
  assert.ok(source.includes('AUTHORITATIVE SOURCE NOT WIRED IN THIS VIEW'));
  assert.ok(source.includes('No synthetic totals, readiness percentages, employee counts, statutory forms, or payment identifiers are generated here.'));
});

test('PAY-TRUTH-005: payment management uses employee-master bank profiles instead of generated masks', () => {
  const source = read('../src/controllers/payrollManagementController.js');
  assert.ok(source.includes("const { User } = require('../models/User')"));
  assert.ok(source.includes('BANK_DETAILS_REQUIRED'));
  assert.ok(source.includes('PAYROLL_PAYMENT_PROFILE_INCOMPLETE'));
  assert.equal(source.includes("'••••' + String(1000 + idx * 17).slice(-4)"), false);
});

test('PAY-TRUTH-006: payslip PDF renders unavailable markers instead of invented PII', async () => {
  const result = await payrollStatutoryService.renderZamorinCorporatePayslipPdf({
    employeeName: 'Truth Test',
    employeeNumber: 'EMP-TRUTH-2',
    periodKey: '2026-09',
    cafeId: 'ZC-0001',
    earnings: {},
    deductions: {},
    attendanceSummary: {},
  }, { tradeName: 'Zamorin Café' });
  const text = result.buffer.toString('latin1');
  assert.equal(text.includes('123456789012'), false);
  assert.equal(text.includes('ABCDE1234F'), false);
  assert.equal(text.includes('100987654321'), false);
});

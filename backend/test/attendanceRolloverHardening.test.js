'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getKolkataBusinessDate } = require('../src/services/attendanceRolloverService');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

test('ATT-ROLL-001: Kolkata rollover date is timezone-canonical', () => {
  assert.equal(
    getKolkataBusinessDate(new Date('2026-09-30T20:00:00Z')),
    '2026-10-01'
  );
});

test('ATT-ROLL-002: stale attendance is marked MISSED_PUNCH without synthetic checkout evidence', () => {
  const source = read('../src/services/attendanceRolloverService.js');
  const updateStart = source.indexOf('const result = await Attendance.updateOne');
  const updateEnd = source.indexOf('if (result.modifiedCount === 1)', updateStart);
  const updateBlock = source.slice(updateStart, updateEnd);

  assert.ok(updateBlock.includes("status: 'MISSED_PUNCH'"));
  assert.ok(updateBlock.includes('correctionRequired: true'));
  assert.ok(updateBlock.includes("updatedBy: 'SYSTEM'"));
  assert.equal(updateBlock.includes('checkOutAt:'), true, 'Expected-state filter must require checkOutAt:null');
  const setStart = updateBlock.indexOf('$set:');
  const setBlock = updateBlock.slice(setStart);
  assert.equal(setBlock.includes('checkOutAt:'), false, 'Rollover must never invent a checkout timestamp');
  assert.equal(setBlock.includes('rawTimeEvents'), false);
  assert.equal(setBlock.includes('attendanceEvidence'), false);
  assert.equal(setBlock.includes('selfie'), false);
});

test('ATT-ROLL-003: rollover selects only prior-business-date open unlocked records', () => {
  const source = read('../src/services/attendanceRolloverService.js');
  assert.ok(source.includes("businessDate: { $lt: currentBusinessDate }"));
  assert.ok(source.includes("status: { $in: ['CHECKED_IN', 'ON_BREAK'] }"));
  assert.ok(source.includes('checkOutAt: null'));
  assert.ok(source.includes('isLocked: { $ne: true }'));
});

test('ATT-ROLL-004: rollover requires production transactions and writes a canonical audit invariant', () => {
  const source = read('../src/services/attendanceRolloverService.js');
  assert.ok(source.includes("requireTransactions: process.env.NODE_ENV === 'production'"));
  assert.ok(source.includes("action: 'ATTENDANCE_MISSED_PUNCH_ROLLOVER'"));
  assert.ok(source.includes('NO_CHECKOUT_TIMESTAMP_QR_GPS_OR_SELFIE_WAS_FABRICATED'));
});

test('ATT-ROLL-005: scheduled job description no longer claims an automatic checkout', () => {
  const registry = read('../src/services/scheduledJobRegistry.js');
  const worker = read('../src/services/scheduledOperationsWorker.js');
  assert.ok(registry.includes("name: 'Attendance Rollover & Missed-Punch Detection'"));
  assert.ok(registry.includes("runtimeWiring: 'WIRED'"));
  assert.ok(worker.includes("jobId: 'JOB-ATTENDANCE-AUTO-CHECKOUT'"));
  assert.ok(worker.includes('dailyHour: 4'));
  assert.ok(worker.includes('attendanceRolloverService.markStaleOpenAttendance'));
});

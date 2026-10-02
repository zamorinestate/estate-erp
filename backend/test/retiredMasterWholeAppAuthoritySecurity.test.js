'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { assertCanonicalMasterState } = require('../src/utils/cafeScope');

describe('Whole-Application Authority Sweep & Retired MASTER Eradication Security Boundary (Issue #41)', () => {
  describe('Central Invariant Assertions', () => {
    it('allows explicitly attested Primary Master authority (role: MASTER + isPrimaryMaster: true)', () => {
      const result = assertCanonicalMasterState({
        userId: 'MU-PRIMARY-001',
        role: 'MASTER',
        isPrimaryMaster: true,
      });
      assert.equal(result, 'MASTER');
    });

    it('rejects retired MASTER (isPrimaryMaster: false) with RETIRED_MASTER_ACCOUNT_DENIED', () => {
      assert.throws(
        () =>
          assertCanonicalMasterState({
            userId: 'MU-RETIRED-002',
            role: 'MASTER',
            isPrimaryMaster: false,
          }),
        (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
      );
    });

    it('rejects unattested MASTER (missing isPrimaryMaster) with RETIRED_MASTER_ACCOUNT_DENIED', () => {
      assert.throws(
        () =>
          assertCanonicalMasterState({
            userId: 'MU-UNATTESTED-003',
            role: 'MASTER',
          }),
        (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
      );
    });

    it('rejects missing authentication fail-closed with UNAUTHENTICATED', () => {
      assert.throws(
        () => assertCanonicalMasterState(null),
        (err) => err.statusCode === 401 && err.code === 'UNAUTHENTICATED'
      );
      assert.throws(
        () => assertCanonicalMasterState(undefined),
        (err) => err.statusCode === 401 && err.code === 'UNAUTHENTICATED'
      );
    });

    it('preserves legitimate non-MASTER roles without alteration', () => {
      assert.equal(assertCanonicalMasterState({ role: 'OWNER' }), 'OWNER');
      assert.equal(assertCanonicalMasterState({ role: 'CAFE_ADMIN' }), 'CAFE_ADMIN');
      assert.equal(assertCanonicalMasterState({ role: 'STAFF' }), 'STAFF');
    });
  });

  describe('Tranche A: Information Discovery Controllers', () => {
    const controllers = ['searchController.js', 'notificationController.js', 'userController.js'];

    for (const file of controllers) {
      it(`${file} imports and uses assertCanonicalMasterState`, () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers', file), 'utf8');
        assert.ok(source.includes('assertCanonicalMasterState'), `${file} must import assertCanonicalMasterState`);
        assert.ok(
          source.includes('assertCanonicalMasterState('),
          `${file} must invoke assertCanonicalMasterState`
        );
      });
    }

    it('notificationController.js does not contain hardcoded MU-0001 recipient fallback', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/notificationController.js'), 'utf8');
      assert.ok(!source.includes("recipientUserId: 'MU-0001'"), 'Must not have hardcoded MU-0001 recipient fallback');
    });
  });

  describe('Tranche B: People / HR Controllers', () => {
    const controllers = [
      'holidayController.js',
      'payrollController.js',
      'employeeController.js',
      'leaveController.js',
      'shiftChangeController.js',
    ];

    for (const file of controllers) {
      it(`${file} imports and uses assertCanonicalMasterState`, () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers', file), 'utf8');
        assert.ok(source.includes('assertCanonicalMasterState'), `${file} must import assertCanonicalMasterState`);
        assert.ok(
          source.includes('assertCanonicalMasterState('),
          `${file} must invoke assertCanonicalMasterState`
        );
      });
    }

    it('payrollController.js does not contain userId === "MU-0001" identity fallback', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/payrollController.js'), 'utf8');
      assert.ok(!source.includes("userId === 'MU-0001'"), 'payrollController must not check userId === MU-0001');
    });

    it('employeeController.js enforces Primary Master attestation for caller credentials', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/employeeController.js'), 'utf8');
      assert.ok(!source.includes("callerId === 'MU-0001'"), 'employeeController must not grant caller power via MU-0001');
      assert.ok(source.includes("req.auth?.role === 'MASTER' && req.auth?.isPrimaryMaster === true"));
    });

    it('attendanceController.js queries only Primary Master for notifications', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../src/modules/attendance/attendanceController.js'), 'utf8');
      assert.ok(source.includes("isPrimaryMaster: true"), 'Must filter isPrimaryMaster: true for masterUsers');
      assert.ok(!source.includes("recipientUserIds.add('MU-0001')"), 'Must not add hardcoded MU-0001 recipient');
    });
  });

  describe('Tranche C: Governance & Administration Controllers', () => {
    const controllers = ['auditController.js', 'adminGovernanceController.js', 'trashController.js'];

    for (const file of controllers) {
      it(`${file} imports and uses assertCanonicalMasterState`, () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers', file), 'utf8');
        assert.ok(source.includes('assertCanonicalMasterState'), `${file} must import assertCanonicalMasterState`);
        assert.ok(
          source.includes('assertCanonicalMasterState('),
          `${file} must invoke assertCanonicalMasterState`
        );
      });
    }

    it('auditController.js has completely removed SENSITIVE_AUDIT_MODULES and isNormalMaster bypass', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/auditController.js'), 'utf8');
      assert.ok(!source.includes('SENSITIVE_AUDIT_MODULES'), 'SENSITIVE_AUDIT_MODULES must be eradicated');
      assert.ok(!source.includes('isNormalMaster'), 'isNormalMaster must not exist in auditController');
    });
  });

  describe('Tranche D: Operations & Extended Domain Controllers', () => {
    const controllers = [
      'inventoryController.js',
      'procurementController.js',
      'menuController.js',
      'cashController.js',
      'qualityController.js',
      'revenueShareController.js',
      'foodSafetyGovernanceController.js',
      'customerController.js',
      'settingsController.js',
    ];

    for (const file of controllers) {
      it(`${file} imports and uses assertCanonicalMasterState`, () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers', file), 'utf8');
        assert.ok(source.includes('assertCanonicalMasterState'), `${file} must import assertCanonicalMasterState`);
        assert.ok(
          source.includes('assertCanonicalMasterState('),
          `${file} must invoke assertCanonicalMasterState`
        );
      });
    }

    it('customerController.js restricts loyalty programme publication strictly to Primary Master', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/customerController.js'), 'utf8');
      assert.ok(
        source.includes("request.auth?.role !== 'MASTER' || request.auth.isPrimaryMaster !== true"),
        'Loyalty programme publish must require Primary Master'
      );
    });

    it('settingsController.js queries isPrimaryMaster: true for Master notifications', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/settingsController.js'), 'utf8');
      assert.ok(
        source.includes("isPrimaryMaster: true"),
        'Settings master notification query must require isPrimaryMaster: true'
      );
    });
  });

  describe('Frontend Retired Persona Freezes', () => {
    it('frontend dashboardMaster.js contains zero isNormalMaster references', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../frontend/src/js/pages/dashboardMaster.js'),
        'utf8'
      );
      assert.ok(!source.includes('isNormalMaster'), 'dashboardMaster.js must contain zero isNormalMaster references');
    });

    it('frontend attendanceShifts.js contains zero isNormalMaster references', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../frontend/src/js/modules/attendance/attendanceShifts.js'),
        'utf8'
      );
      assert.ok(!source.includes('isNormalMaster'), 'attendanceShifts.js must contain zero isNormalMaster references');
    });
  });
});

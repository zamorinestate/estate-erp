'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { assertCanonicalMasterState } = require('../src/utils/cafeScope');

describe('Retired MASTER transaction-scope security boundary', () => {
  it('allows explicitly attested Primary Master authority', () => {
    assert.equal(
      assertCanonicalMasterState({
        userId: 'MU-PRIMARY-TXN',
        role: 'MASTER',
        isPrimaryMaster: true,
      }),
      'MASTER'
    );
  });

  it('rejects non-primary and unattested MASTER authority fail-closed', () => {
    for (const auth of [
      { userId: 'MU-RETIRED-TXN', role: 'MASTER', isPrimaryMaster: false },
      { userId: 'MU-UNATTESTED-TXN', role: 'MASTER' },
    ]) {
      assert.throws(
        () => assertCanonicalMasterState(auth),
        (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
      );
    }
  });

  it('does not alter legitimate non-MASTER actor roles', () => {
    assert.equal(assertCanonicalMasterState({ role: 'OWNER' }), 'OWNER');
    assert.equal(assertCanonicalMasterState({ role: 'CAFE_ADMIN' }), 'CAFE_ADMIN');
    assert.equal(assertCanonicalMasterState({ role: 'STAFF' }), 'STAFF');
  });

  it('rejects missing authentication context', () => {
    assert.throws(
      () => assertCanonicalMasterState(null),
      (err) => err.statusCode === 401 && err.code === 'UNAUTHENTICATED'
    );
  });

  const guardedControllers = [
    'posController.js',
    'billController.js',
    'vendorController.js',
    'vendorLedgerController.js',
    'dailyCloseController.js',
    'departmentOrderController.js',
    'assetController.js',
    'financeController.js',
  ];

  for (const controllerFile of guardedControllers) {
    it(`guards every async endpoint in ${controllerFile}`, () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../src/controllers', controllerFile),
        'utf8'
      );

      const handlerCount = (
        source.match(/asyncHandler\(\s*async \(request, response\) => \{/g) || []
      ).length;
      const guardCount = (
        source.match(/assertCanonicalMasterState\(request\.auth\);/g) || []
      ).length;

      assert.ok(handlerCount > 0, `${controllerFile} must expose at least one async endpoint`);
      assert.equal(
        guardCount,
        handlerCount,
        `${controllerFile} must guard every async endpoint against retired MASTER authority`
      );
    });
  }
});

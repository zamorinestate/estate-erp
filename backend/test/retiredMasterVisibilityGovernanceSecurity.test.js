'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const procurementController = require('../src/controllers/procurementController');

function invokeController(controllerFn, req, res = {}) {
  return new Promise((resolve, reject) => {
    const next = (err) => {
      if (err) reject(err);
      else resolve(res);
    };
    Promise.resolve(controllerFn(req, res, next)).then(() => resolve(res)).catch(reject);
  });
}

describe('Primary Master visibility & governance boundary', () => {
  const guardedControllers = [
    'procurementController.js',
    'notificationController.js',
    'searchController.js',
    'userController.js',
    'auditController.js',
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

      assert.ok(handlerCount > 0);
      assert.ok(
        guardCount >= handlerCount,
        `${controllerFile} must reject retired MASTER state at every async entry point`
      );
    });
  }

  it('retired non-primary MASTER is rejected before procurement approval reads the database', async () => {
    const req = {
      auth: {
        userId: 'MU-RETIRED-PROC',
        role: 'MASTER',
        isPrimaryMaster: false,
        organisationId: 'ORG-TEST',
      },
      params: { purchaseOrderId: 'PO-NOT-READ' },
      body: {},
    };

    await assert.rejects(
      () => invokeController(procurementController.approveOrder, req),
      (err) => err.statusCode === 403 && err.code === 'RETIRED_MASTER_ACCOUNT_DENIED'
    );
  });

  it('audit controller contains no supported secondary-MASTER persona logic', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/controllers/auditController.js'),
      'utf8'
    );
    assert.equal(source.includes('isNormalMaster'), false);
    assert.equal(source.includes(['Normal', 'Master'].join(' ')), false);
    assert.equal(source.includes('SENSITIVE_AUDIT_MODULES'), false);
  });

  it('notification controller has no hard-coded MU-0001 recipient fallback', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/controllers/notificationController.js'),
      'utf8'
    );
    assert.equal(source.includes("recipientUserId: 'MU-0001'"), false);
  });
});

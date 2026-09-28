'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateProposedRole } = require('../src/services/userGovernanceService');
const { authorize, canAccessCafe } = require('../src/middleware/authorize');
const OfflineSyncService = require('../src/services/offlineSyncService');
const { resolveEffectiveCafeScope } = require('../src/utils/cafeScope');
const { requireCafeOperationsDevice } = require('../src/middleware/deviceAuthorization');
const expenseController = require('../src/controllers/expenseController');
const procurementController = require('../src/controllers/procurementController');
const vendorController = require('../src/controllers/vendorController');
const cashController = require('../src/controllers/cashController');
const companyIdentityController = require('../src/controllers/companyIdentityController');
const posController = require('../src/controllers/posController');
const { ApprovalPolicyService } = require('../src/services/approvalPolicyService');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'dist',
  'build',
  '.next',
  '.cache',
]);
const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.md', '.txt', '.yml', '.yaml', '.ps1',
  '.html', '.css', '.scss', '.xml', '.sh',
]);

function invokeController(controllerFn, request) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve(this);
        return this;
      },
    };
    const next = (err) => {
      if (err) reject(err);
      else resolve(response);
    };
    Promise.resolve(controllerFn(request, response, next)).catch(reject);
  });
}

const FORBIDDEN = [
  // Catch every retired alias family without embedding the forbidden phrase
  // directly in this guard file: spaces, camelCase, dots, hyphens, underscores.
  new RegExp(['normal', 'master'].join('[\\s._-]*'), 'ig'),
  new RegExp(['master', 'normal'].join('[\\s._-]+'), 'ig'),
  new RegExp(['secondary', 'master'].join('[\\s_-]+'), 'ig'),
  new RegExp(['master', 'secondary'].join('[\\s_-]+'), 'ig'),
  new RegExp(['secondary', 'master'].join(''), 'ig'),
  new RegExp(['master', 'operational'].join('[\\s()_-]*'), 'ig'),
];

function walk(dir, findings) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full, findings);
      continue;
    }

    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch (_) {
      continue;
    }

    const hits = [];
    for (const pattern of FORBIDDEN) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) hits.push(pattern.source);
    }

    if (hits.length) {
      findings.push({
        file: path.relative(REPO_ROOT, full).replace(/\\/g, '/'),
        hits,
      });
    }
  }
}

test('Retired alternate MASTER persona is absent from the repository', () => {
  const findings = [];
  walk(REPO_ROOT, findings);

  assert.deepEqual(
    findings,
    [],
    'Retired alternate MASTER persona references remain:\n' +
      findings.map((f) => `- ${f.file}: ${f.hits.join(', ')}`).join('\n')
  );
});

test('Malformed non-primary MASTER frontend context fails closed', async () => {
  const { isRouteAllowed, getGroupedNavItems } = await import('../../frontend/src/js/navigation.js');

  for (const route of ['dashboard', 'passbook', 'admin', 'notifications', 'staff-home']) {
    assert.equal(
      isRouteAllowed('master', route, false),
      false,
      `non-primary MASTER must be denied route ${route}`
    );
  }

  assert.deepEqual(
    getGroupedNavItems('master', false),
    {},
    'non-primary MASTER must receive no sidebar navigation groups'
  );

  assert.equal(isRouteAllowed('master', 'dashboard', true), true);
  assert.equal(isRouteAllowed('master', 'passbook', true), true);
  assert.ok(Object.keys(getGroupedNavItems('master', true)).length > 0);
});

test('MASTER role is singleton-only in governance policy', () => {
  assert.throws(
    () => validateProposedRole('MASTER'),
    (err) => {
      assert.equal(err.code, 'MASTER_SINGLETON_ROLE_RESTRICTED');
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  for (const role of ['OWNER', 'CAFE_ADMIN', 'STAFF', 'VENDOR']) {
    assert.doesNotThrow(() => validateProposedRole(role));
  }
});

test('Malformed non-primary MASTER authorization context fails closed', async () => {
  const malformedAuth = {
    userId: 'MU-MALFORMED-01',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
    assignedCafeIds: ['ZC-0001'],
  };

  assert.equal(
    canAccessCafe(malformedAuth, 'ZC-0001'),
    false,
    'malformed MASTER must not inherit café-wide access'
  );

  let nextCalled = false;
  let statusCode = null;
  let payload = null;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  await authorize(['MASTER'])(
    { auth: malformedAuth, method: 'GET', originalUrl: '/test' },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.equal(
    payload?.error?.code,
    'PRIMARY_MASTER_AUTHORITY_REQUIRED'
  );

  const primaryAuth = {
    ...malformedAuth,
    userId: 'MU-0001',
    isPrimaryMaster: true,
  };

  assert.equal(canAccessCafe(primaryAuth, 'ZC-0001'), true);

  nextCalled = false;
  statusCode = null;
  payload = null;
  await authorize(['MASTER'])(
    { auth: primaryAuth, method: 'GET', originalUrl: '/test' },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(statusCode, null);
  assert.equal(payload, null);
});


test('Malformed non-primary MASTER direct expense mutations fail closed', async () => {
  const malformedAuth = {
    userId: 'MU-MALFORMED-EXPENSE',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
    assignedCafeIds: ['ZC-0001'],
  };

  await assert.rejects(
    () =>
      invokeController(expenseController.reverseExpense, {
        auth: malformedAuth,
        params: { expenseId: 'EX-MALFORMED-001' },
        body: { reason: 'Unauthorized reversal attempt' },
      }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );

  await assert.rejects(
    () =>
      invokeController(expenseController.createOperationalAdvance, {
        auth: malformedAuth,
        body: {
          recipientUserId: 'ADM-001',
          cafeId: 'ZC-0001',
          purpose: 'Unauthorized advance attempt',
          amount: 1000,
          returnDueDate: '2026-10-15',
        },
      }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );
});

test('Malformed non-primary MASTER shared scope/device helpers fail closed', () => {
  const malformedAuth = {
    userId: 'MU-MALFORMED-SCOPE',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
    assignedCafeIds: ['ZC-0001'],
    primaryCafeId: 'ZC-0001',
  };

  assert.throws(
    () => resolveEffectiveCafeScope({
      auth: malformedAuth,
      query: { cafeId: 'ZC-0001' },
      body: {},
      params: {},
      headers: {},
    }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );

  let nextCalled = false;
  let statusCode = null;
  let payload = null;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  requireCafeOperationsDevice(
    { auth: malformedAuth, params: {}, query: {}, body: {} },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.equal(payload?.error, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');

  nextCalled = false;
  statusCode = null;
  payload = null;
  requireCafeOperationsDevice(
    {
      auth: { ...malformedAuth, isPrimaryMaster: true },
      params: {},
      query: {},
      body: {},
    },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(statusCode, null);
  assert.equal(payload, null);
});

test('Malformed non-primary MASTER procurement/vendor governance mutations fail closed', async () => {
  const auth = {
    userId: 'MU-MALFORMED-PROCUREMENT',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
    assignedCafeIds: ['ZC-0001'],
  };

  const cases = [
    {
      fn: procurementController.approveOrder,
      request: { auth, params: { purchaseOrderId: 'PO-MALFORMED-001' }, body: {} },
    },
    {
      fn: procurementController.masterApproveOrderAndBill,
      request: { auth, params: { purchaseOrderId: 'PO-MALFORMED-001' }, body: {} },
    },
    {
      fn: vendorController.masterApproveInvoiceAndPostInventory,
      request: { auth, params: { poId: 'PO-MALFORMED-001' }, body: {} },
    },
    {
      fn: vendorController.retryFailedInventoryPosting,
      request: { auth, params: { poId: 'PO-MALFORMED-001' }, body: {} },
    },
    {
      fn: vendorController.approveBankChangeRequest,
      request: { auth, params: { vendorId: 'VEN-MALFORMED-001' }, body: {} },
    },
  ];

  for (const entry of cases) {
    await assert.rejects(
      () => invokeController(entry.fn, entry.request),
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
        return true;
      }
    );
  }
});

test('Malformed non-primary MASTER approval-policy governance fails closed', async () => {
  await assert.rejects(
    () =>
      ApprovalPolicyService.setPolicy({
        organisationId: 'ORG-ZAMORIN',
        cafeId: 'ZC-0001',
        workflowType: 'EXPENSE',
        role: 'CAFE_ADMIN',
        maxAmountPaisa: 500000,
        auth: {
          userId: 'MU-MALFORMED-POLICY',
          role: 'MASTER',
          isPrimaryMaster: false,
        },
      }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );
});

test('Malformed non-primary MASTER direct cash governance fails closed', async () => {
  const auth = {
    userId: 'MU-MALFORMED-CASH',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
    assignedCafeIds: ['ZC-0001'],
  };

  await assert.rejects(
    () =>
      invokeController(cashController.createCashTransaction, {
        auth,
        headers: {},
        body: {
          cafeId: 'ZC-0001',
          transactionType: 'CASH_IN',
          category: 'TEST',
          amount: 100,
          paymentMethod: 'CASH',
        },
        query: {},
        params: {},
      }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );

  await assert.rejects(
    () =>
      invokeController(cashController.reverseCashTransaction, {
        auth,
        headers: {},
        body: { reason: 'Unauthorized reversal' },
        query: {},
        params: { cashTransactionId: 'CT-MALFORMED-001' },
      }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );
});

test('Organisation identity requires real Primary Master role, not a stray flag', async () => {
  const malformedMaster = {
    userId: 'MU-MALFORMED-IDENTITY',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
  };

  for (const [fn, request] of [
    [companyIdentityController.getCompanyIdentity, { auth: malformedMaster }],
    [companyIdentityController.getCompanyIdentityHistory, { auth: malformedMaster }],
    [
      companyIdentityController.unlockCompanyIdentity,
      { auth: malformedMaster, body: {} },
    ],
    [
      companyIdentityController.updateCompanyIdentity,
      {
        auth: malformedMaster,
        body: {
          updates: { legalName: 'Unauthorized' },
          changeReason: 'Unauthorized identity mutation',
        },
      },
    ],
  ]) {
    await assert.rejects(
      () => invokeController(fn, request),
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
        return true;
      }
    );
  }

  const forgedFlagAuth = {
    userId: 'ADM-FORGED-PRIMARY-FLAG',
    organisationId: 'ORG-ZAMORIN',
    role: 'CAFE_ADMIN',
    isPrimaryMaster: true,
  };

  await assert.rejects(
    () =>
      invokeController(companyIdentityController.unlockCompanyIdentity, {
        auth: forgedFlagAuth,
        body: {},
      }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );
});

test('Malformed non-primary MASTER cannot use offline POS review governance', async () => {
  const malformedMaster = {
    userId: 'MU-MALFORMED-OFFLINE',
    organisationId: 'ORG-ZAMORIN',
    role: 'MASTER',
    isPrimaryMaster: false,
    assignedCafeIds: [],
  };

  await assert.rejects(
    () => OfflineSyncService.getPendingReviews({
      organisationId: malformedMaster.organisationId,
      authUser: malformedMaster,
    }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );

  await assert.rejects(
    () => OfflineSyncService.reviewItem({
      reviewId: 'REV-MALFORMED-MASTER',
      action: 'ESCALATE',
      reason: 'Must be rejected before lookup',
      authContext: malformedMaster,
    }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );

  await assert.rejects(
    () => invokeController(posController.getPendingOfflineReviews, {
      auth: malformedMaster,
      query: {},
      params: {},
      body: {},
    }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );

  await assert.rejects(
    () => invokeController(posController.reviewOfflineOrder, {
      auth: malformedMaster,
      params: { reviewId: 'REV-MALFORMED-MASTER' },
      query: {},
      body: { action: 'ESCALATE', reason: 'Must be rejected at controller boundary' },
    }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'PRIMARY_MASTER_AUTHORITY_REQUIRED');
      return true;
    }
  );
});


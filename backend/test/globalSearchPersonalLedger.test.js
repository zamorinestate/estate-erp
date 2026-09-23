'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { performGlobalSearch } = require('../src/controllers/searchController');
const { User } = require('../src/models/User');
const { MenuItem } = require('../src/models/MenuItem');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { Vendor } = require('../src/models/Vendor');
const { Bill } = require('../src/models/Bill');
const { PersonalLedger } = require('../src/models/PersonalLedger');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { TaxInvoice } = require('../src/models/TaxInvoice');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { Customer } = require('../src/models/Customer');
const { Asset } = require('../src/models/Asset');
const { Cafe } = require('../src/models/Cafe');

function mockFind(model, rows, observed, key) {
  const original = model.find;

  model.find = (filter) => {
    observed[`${key}Called`] = true;
    observed[`${key}Filter`] = filter;

    const query = {
      select() { return query; },
      limit() { return query; },
      async lean() { return rows; },
    };

    return query;
  };

  return () => {
    model.find = original;
  };
}

async function runSearch(role, userId) {
  const observed = {
    ledgerCalled: false,
    ledgerFilter: null,
  };

  const restores = [
    mockFind(User, [], observed, 'users'),
    mockFind(MenuItem, [], observed, 'menu'),
    mockFind(GlobalInventoryItem, [], observed, 'inventory'),
    mockFind(Vendor, [], observed, 'vendors'),
    mockFind(Bill, [], observed, 'bills'),
    mockFind(PurchaseOrder, [], observed, 'pos'),
    mockFind(TaxInvoice, [], observed, 'invoices'),
    mockFind(BusinessDocument, [], observed, 'docs'),
    mockFind(Customer, [], observed, 'customers'),
    mockFind(Asset, [], observed, 'assets'),
    mockFind(Cafe, [], observed, 'cafes'),
    mockFind(
      PersonalLedger,
      [{
        ledgerEntryId: 'PL-20260811-0001',
        entryType: 'DEBIT',
        category: 'BANK',
        amountPaisa: 125000,
        businessDate: '2026-08-11',
        description: 'Bank transfer',
        counterparty: 'Example Bank',
        externalReference: 'UTR-SEARCH-001',
      }],
      observed,
      'ledger'
    ),
  ];

  let statusCode = 200;
  let body = null;

  const request = {
    query: { q: 'bank' },
    auth: {
      organisationId: 'ORG-TEST',
      userId,
      role,
      assignedCafeIds: ['CF-0001'],
    },
    correlationId: 'CORR-TEST',
  };

  const response = {
    status(code) {
      statusCode = code;
      return response;
    },
    json(value) {
      body = value;
      return response;
    },
  };

try {
await new Promise((resolve, reject) => {
const originalJson = response.json;
response.json = (value) => {
originalJson.call(response, value);
resolve();
return response;
};
performGlobalSearch(request, response, reject);
});
  } finally {
    for (const restore of restores.reverse()) {
      restore();
    }
  }

  return { observed, statusCode, body };
}

test(
  'Global Search exposes own Personal Ledger to MASTER only',
  async (t) => {
    for (const allowed of [
      {
        role: 'MASTER',
        userId: 'MU-0001',
      },
    ]) {
      await t.test(
        `${allowed.role} queries Personal Ledger scoped to self`,
        async () => {
          const result = await runSearch(
            allowed.role,
            allowed.userId
          );

          assert.equal(result.statusCode, 200);
          assert.equal(
            result.observed.ledgerCalled,
            true
          );
          assert.equal(
            result.observed.ledgerFilter.ownerUserId,
            allowed.userId
          );

          const items =
            result.body.data.results.PERSONAL_LEDGER;
          assert.ok(items);
          assert.equal(items.length, 1);
          assert.equal(
            items[0].id,
            'PL-20260811-0001'
          );
          assert.equal(
            items[0].title,
            'Bank transfer'
          );
          assert.equal(
            items[0].route,
            'ledger'
          );
        }
      );
    }

    for (const denied of [
      {
        role: 'OWNER',
        userId: 'OW-0001',
      },
      {
        role: 'CAFE_ADMIN',
        userId: 'CA-0001',
      },
      {
        role: 'STAFF',
        userId: 'ST-0001',
      },
    ]) {
      await t.test(
        `${denied.role} never queries Personal Ledger`,
        async () => {
          const result = await runSearch(
            denied.role,
            denied.userId
          );

          assert.equal(result.statusCode, 200);
          assert.equal(
            result.observed.ledgerCalled,
            false
          );
          assert.equal(
            Object.hasOwn(
              result.body.data.results,
              'PERSONAL_LEDGER'
            ),
            false
          );
        }
      );
    }
  }
);

test(
  'Global Search employee directory is MASTER and OWNER only',
  async (t) => {
    for (const allowed of [
      { role: 'MASTER', userId: 'MU-0001' },
      { role: 'OWNER', userId: 'OW-0001' },
    ]) {
      await t.test(
        `${allowed.role} may query the employee directory`,
        async () => {
          const result = await runSearch(
            allowed.role,
            allowed.userId
          );

          assert.equal(
            result.observed.usersCalled,
            true
          );
        }
      );
    }

    for (const denied of [
      { role: 'CAFE_ADMIN', userId: 'CA-0001' },
      { role: 'STAFF', userId: 'ST-0001' },
    ]) {
      await t.test(
        `${denied.role} does not query the employee directory`,
        async () => {
          const result = await runSearch(
            denied.role,
            denied.userId
          );

          assert.equal(
            Boolean(result.observed.usersCalled),
            false
          );
        }
      );
    }
  }
);

test(
  'Global Search result groups follow role permissions',
  async (t) => {
    const cases = [
      {
        role: 'MASTER',
        userId: 'MU-0001',
        expected: { menu: true, inventory: true, vendors: true, bills: true },
      },
      {
        role: 'OWNER',
        userId: 'OW-0001',
        expected: { menu: true, inventory: true, vendors: true, bills: true },
      },
      {
        role: 'CAFE_ADMIN',
        userId: 'CA-0001',
        expected: { menu: true, inventory: true, vendors: false, bills: true },
      },
      {
        role: 'STAFF',
        userId: 'ST-0001',
        expected: { menu: false, inventory: false, vendors: false, bills: false },
      },
    ];

    for (const item of cases) {
      await t.test(
        `${item.role} only queries permitted Global Search groups`,
        async () => {
          const result = await runSearch(item.role, item.userId);

          for (const [key, expected] of Object.entries(item.expected)) {
            assert.equal(Boolean(result.observed[`${key}Called`]), expected);
          }

          if (item.role === 'CAFE_ADMIN') {
            assert.deepEqual(
              result.observed.billsFilter.cafeId,
              { $in: ['CF-0001'] }
            );
          }
        }
      );
    }
  }
);

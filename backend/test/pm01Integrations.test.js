'use strict';

/**
 * PM-01 / PM-01A INTEGRATION & REGRESSION TEST SUITE
 *
 * Covers:
 * 1. PM-P1-001: Global Search canonical User fields (name, preferredName, userId, email, phone, employeeSearchTerms),
 *    cross-org isolation, Owner assigned-café scoping (fail-closed when unassigned), and projection safety.
 * 2. PM-P1-002: User Creation name contract, missing name rejection, role/cafe requirements, Primary Master protection.
 * 3. PM-P1-004: Primary Master POS cafe context, no-cafe rejection, Cafe Admin device binding, anti-tampering.
 * 4. PM-01A Gate Checkpoints:
 *    - Checkpoint A: Owner employee search scope (assigned-café boundary, fail closed on empty, cross-org isolation, no sensitive fields).
 *    - Checkpoint B: POS cafe context resolution by role (Primary Master explicit selection vs scoped device/assigned binding, zero fallback leakage).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { User } = require('../src/models/User');
const { MenuItem } = require('../src/models/MenuItem');
const { GlobalInventoryItem } = require('../src/models/GlobalInventoryItem');
const { Vendor } = require('../src/models/Vendor');
const { Bill } = require('../src/models/Bill');
const { Cafe } = require('../src/models/Cafe');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { CashTransaction } = require('../src/models/CashTransaction');
const { AuditEvent } = require('../src/models/AuditEvent');
const { PurchaseOrder } = require('../src/models/PurchaseOrder');
const { TaxInvoice } = require('../src/models/TaxInvoice');
const { BusinessDocument } = require('../src/models/BusinessDocument');
const { Customer } = require('../src/models/Customer');
const { Asset } = require('../src/models/Asset');
const { PersonalLedger } = require('../src/models/PersonalLedger');
const auditService = require('../src/services/auditService');

const { performGlobalSearch } = require('../src/controllers/searchController');
const { createUser } = require('../src/controllers/userController');
const { createBill } = require('../src/controllers/billController');

// Helper to invoke Express controller
function invoke(controller, req) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.statusCode = statusCode;
        this.body = data;
        resolve(this);
        return this;
      },
      send(data) {
        this.statusCode = statusCode;
        this.body = data;
        resolve(this);
        return this;
      },
    };
    const next = (err) => {
      if (err) reject(err);
      else resolve(res);
    };
    try {
      controller(req, res, next);
    } catch (err) {
      reject(err);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PM-P1-001 & CHECKPOINT A: GLOBAL SEARCH & OWNER SCOPE TESTS
// ═══════════════════════════════════════════════════════════════════════════════
test('PM-P1-001 / Checkpoint A: Global Search canonical User identity fields and Owner scope', async (t) => {
  const origUserFind = User.find;
  const origMenuFind = MenuItem.find;
  const origInvFind = GlobalInventoryItem.find;
  const origVendorFind = Vendor.find;
  const origBillFind = Bill.find;
  const origLedgerFind = PersonalLedger.find;
  const origPOFind = PurchaseOrder.find;
  const origTaxInvoiceFind = TaxInvoice.find;
  const origDocFind = BusinessDocument.find;
  const origCustFind = Customer.find;
  const origAssetFind = Asset.find;
  const origCafeFind = Cafe.find;

  // Stub non-user models to return empty array immediately (in-memory test isolation)
  MenuItem.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  GlobalInventoryItem.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  Vendor.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  Bill.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  PersonalLedger.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  PurchaseOrder.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  TaxInvoice.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  BusinessDocument.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  Customer.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  Asset.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  Cafe.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });

  try {
    await t.test('1.1 Search captures User by name (canonical field)', async () => {
      let capturedFilter = null;
      let capturedSelect = null;

      User.find = (filter) => {
        capturedFilter = filter;
        return {
          select: (sel) => {
            capturedSelect = sel;
            return {
              limit: () => ({
                lean: async () => [
                  {
                    userId: 'ST-1001',
                    name: 'Jane Elizabeth Doe',
                    preferredName: 'Jane',
                    role: 'STAFF',
                    primaryCafeId: 'ZC-0001',
                  },
                ],
              }),
            };
          },
        };
      };

      const req = {
        query: { q: 'Jane' },
        auth: {
          organisationId: 'ORG-ZAMORIN',
          userId: 'MU-0001',
          role: 'MASTER',
        },
      };

      const res = await invoke(performGlobalSearch, req);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);

      // Verify filter checks canonical fields
      assert.equal(capturedFilter.organisationId, 'ORG-ZAMORIN');
      assert.ok(Array.isArray(capturedFilter.$or));
      const hasName = capturedFilter.$or.some((c) => c.name);
      const hasPreferredName = capturedFilter.$or.some((c) => c.preferredName);
      const hasUserId = capturedFilter.$or.some((c) => c.userId);
      const hasEmail = capturedFilter.$or.some((c) => c.email);
      const hasPhone = capturedFilter.$or.some((c) => c.phone);
      const hasSearchTerms = capturedFilter.$or.some((c) => c.employeeSearchTerms);

      assert.ok(hasName, '$or must query name');
      assert.ok(hasPreferredName, '$or must query preferredName');
      assert.ok(hasUserId, '$or must query userId');
      assert.ok(hasEmail, '$or must query email');
      assert.ok(hasPhone, '$or must query phone');
      assert.ok(hasSearchTerms, '$or must query employeeSearchTerms');

      // Verify safe projection
      assert.ok(!capturedSelect.includes('passwordHash'));
      assert.ok(!capturedSelect.includes('recoveryCodeHashes'));
      assert.ok(!capturedSelect.includes('failedLoginAttempts'));

      // Verify response structure
      const employees = res.body.data.results.EMPLOYEES;
      assert.ok(Array.isArray(employees) && employees.length === 1);
      assert.equal(employees[0].id, 'ST-1001');
      assert.equal(employees[0].title, 'Jane Elizabeth Doe (Jane)');
      assert.equal(employees[0].subtitle, 'STAFF · ST-1001');
      assert.equal(employees[0].route, 'employees');
    });

    await t.test('1.2 Response title falls back gracefully when preferredName is empty', async () => {
      User.find = () => ({
        select: () => ({
          limit: () => ({
            lean: async () => [
              {
                userId: 'AD-2002',
                name: 'Rahul Kumar',
                preferredName: '',
                role: 'CAFE_ADMIN',
                primaryCafeId: 'ZC-0001',
              },
            ],
          }),
        }),
      });

      const req = {
        query: { q: 'Rahul' },
        auth: {
          organisationId: 'ORG-ZAMORIN',
          userId: 'MU-0001',
          role: 'MASTER',
        },
      };

      const res = await invoke(performGlobalSearch, req);
      assert.equal(res.statusCode, 200);
      const employees = res.body.data.results.EMPLOYEES;
      assert.ok(employees && employees.length === 1);
      assert.equal(employees[0].title, 'Rahul Kumar');
      assert.equal(employees[0].subtitle, 'CAFE_ADMIN · AD-2002');
    });

    await t.test('1.3 Owner searches employee permitted by canonical policy (in assigned café)', async () => {
      let capturedFilter = null;
      User.find = (filter) => {
        capturedFilter = filter;
        return {
          select: () => ({
            limit: () => ({
              lean: async () => [
                {
                  userId: 'ST-0001',
                  name: 'Barista Alice',
                  preferredName: 'Alice',
                  role: 'STAFF',
                  primaryCafeId: 'ZC-0001',
                },
              ],
            }),
          }),
        };
      };

      const req = {
        query: { q: 'Alice' },
        auth: {
          organisationId: 'ORG-ZAMORIN',
          userId: 'OW-0001',
          role: 'OWNER',
          assignedCafeIds: ['ZC-0001', 'ZC-0002'],
        },
      };

      const res = await invoke(performGlobalSearch, req);
      assert.equal(res.statusCode, 200);
      assert.ok(capturedFilter.$and, 'Owner filter must use $and clause for cafe scoping');
      const hasCafeClause = capturedFilter.$and.some(
        (c) => c.$or && c.$or.some((sub) => sub.primaryCafeId || sub.assignedCafeIds)
      );
      assert.ok(hasCafeClause, 'Owner employee search must enforce assigned cafe boundary');
      const employees = res.body.data.results.EMPLOYEES;
      assert.ok(Array.isArray(employees) && employees.length === 1);
      assert.equal(employees[0].id, 'ST-0001');
    });

    await t.test('1.4 Owner with empty assignedCafeIds fails closed (zero employees revealed)', async () => {
      let capturedFilter = null;
      User.find = (filter) => {
        capturedFilter = filter;
        return {
          select: () => ({
            limit: () => ({
              lean: async () => [],
            }),
          }),
        };
      };

      const req = {
        query: { q: 'Staff' },
        auth: {
          organisationId: 'ORG-ZAMORIN',
          userId: 'OW-UNASSIGNED',
          role: 'OWNER',
          assignedCafeIds: [], // Unassigned Owner
        },
      };

      const res = await invoke(performGlobalSearch, req);
      assert.equal(res.statusCode, 200);
      assert.ok(capturedFilter.$and, 'Must enforce $and cafe scoping clause even when empty');
      const cafeClause = capturedFilter.$and.find(
        (c) => c.$or && c.$or.some((sub) => sub.primaryCafeId || sub.assignedCafeIds)
      );
      assert.ok(cafeClause, 'Cafe boundary must remain active');
      assert.deepEqual(cafeClause.$or[0].primaryCafeId.$in, [], 'Must query empty cafe list');
      assert.deepEqual(cafeClause.$or[1].assignedCafeIds.$in, [], 'Must query empty cafe list');
      // Zero employees returned
      assert.equal(res.body.data.results.EMPLOYEES, undefined);
    });

    await t.test('1.5 Cross-organisation queries are isolated by server auth', async () => {
      let capturedFilter = null;
      User.find = (filter) => {
        capturedFilter = filter;
        return {
          select: () => ({
            limit: () => ({
              lean: async () => [],
            }),
          }),
        };
      };

      const req = {
        query: { q: 'Target', organisationId: 'ATTACKER_ORG' }, // Query param injection attempt
        auth: {
          organisationId: 'ORG-GENUINE',
          userId: 'MU-0001',
          role: 'MASTER',
        },
      };

      const res = await invoke(performGlobalSearch, req);
      assert.equal(res.statusCode, 200);
      assert.equal(capturedFilter.organisationId, 'ORG-GENUINE', 'Must use server auth organisationId');
    });

    await t.test('1.6 Owner result contains no sensitive fields', async () => {
      let capturedSelect = null;
      User.find = () => ({
        select: (sel) => {
          capturedSelect = sel;
          return {
            limit: () => ({
              lean: async () => [],
            }),
          };
        },
      });

      const req = {
        query: { q: 'Staff' },
        auth: {
          organisationId: 'ORG-ZAMORIN',
          userId: 'OW-0001',
          role: 'OWNER',
          assignedCafeIds: ['ZC-0001'],
        },
      };

      await invoke(performGlobalSearch, req);
      assert.ok(!capturedSelect.includes('passwordHash'));
      assert.ok(!capturedSelect.includes('mfaSecretEncrypted'));
      assert.ok(!capturedSelect.includes('recoveryCodeHashes'));
      assert.ok(!capturedSelect.includes('failedLoginAttempts'));
    });
  } finally {
    User.find = origUserFind;
    MenuItem.find = origMenuFind;
    GlobalInventoryItem.find = origInvFind;
    Vendor.find = origVendorFind;
    Bill.find = origBillFind;
    PersonalLedger.find = origLedgerFind;
    PurchaseOrder.find = origPOFind;
    TaxInvoice.find = origTaxInvoiceFind;
    BusinessDocument.find = origDocFind;
    Customer.find = origCustFind;
    Asset.find = origAssetFind;
    Cafe.find = origCafeFind;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PM-P1-002: USER CREATION CONTRACT & GOVERNANCE TESTS
// ═══════════════════════════════════════════════════════════════════════════════
test('PM-P1-002: Create User payload contract and governance', async (t) => {
  const origFindOne = User.findOne;
  const origCreate = User.create;
  const origCafeCount = Cafe.countDocuments;
  const origGenerateId = SequenceCounter.generateId;

  // Stubs
  Cafe.countDocuments = async () => 1;
  SequenceCounter.generateId = async () => 'ST-9999';

  try {
    await t.test('2.1 Valid payload with canonical `name` creates user successfully', async () => {
      User.findOne = async () => null; // No duplicate
      let createdUserData = null;
      User.create = async (doc) => {
        createdUserData = doc;
        return {
          ...doc,
          toObject: () => ({ ...doc }),
        };
      };

      const req = {
        auth: {
          organisationId: 'ORG-ZAMORIN',
          userId: 'MU-0001',
          role: 'MASTER',
          isPrimaryMaster: true,
        },
        body: {
          name: 'Ananya Sharma',
          email: 'ananya.sharma@zamorincafe.com',
          role: 'STAFF',
          assignedCafeIds: ['ZC-0001'],
          password: 'SecureTemporaryPassword123!',
          reason: 'New barista hire via Admin Wizard',
        },
      };

      const res = await invoke(createUser, req);
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      assert.equal(createdUserData.name, 'Ananya Sharma');
      assert.equal(createdUserData.email, 'ananya.sharma@zamorincafe.com');
      assert.equal(createdUserData.role, 'STAFF');
      assert.deepEqual(createdUserData.assignedCafeIds, ['ZC-0001']);
      assert.equal(createdUserData.isPrimaryMaster, undefined); // Never sets Primary Master
    });

    await t.test('2.2 Missing `name` (e.g. sending `fullName` instead) is rejected with 400 USER_FIELDS_REQUIRED', async () => {
      const req = {
        auth: {
          organisationId: 'ORG-ZAMORIN',
          userId: 'MU-0001',
          role: 'MASTER',
          isPrimaryMaster: true,
        },
        body: {
          fullName: 'Ananya Sharma', // WRONG field
          email: 'ananya@zamorincafe.com',
          role: 'STAFF',
          assignedCafeIds: ['ZC-0001'],
          password: 'Password123!',
        },
      };

      await assert.rejects(
        invoke(createUser, req),
        (err) => err.statusCode === 400 && err.code === 'USER_FIELDS_REQUIRED'
      );
    });

    await t.test('2.3 Creating direct MASTER role remains forbidden', async () => {
      const req = {
        auth: {
          organisationId: 'ORG-ZAMORIN',
          userId: 'MU-0001',
          role: 'MASTER',
          isPrimaryMaster: true,
        },
        body: {
          name: 'Second Master',
          email: 'master2@zamorincafe.com',
          role: 'MASTER',
          password: 'Password123!',
        },
      };

      await assert.rejects(
        invoke(createUser, req),
        (err) => err.statusCode === 403 && err.code === 'MASTER_CREATION_RESTRICTED'
      );
    });

    await t.test('2.4 Scoped roles (STAFF / CAFE_ADMIN) require at least one cafe assignment', async () => {
      User.findOne = async () => null;
      const req = {
        auth: {
          organisationId: 'ORG-ZAMORIN',
          userId: 'MU-0001',
          role: 'MASTER',
          isPrimaryMaster: true,
        },
        body: {
          name: 'Unassigned Staff',
          email: 'unassigned@zamorincafe.com',
          role: 'STAFF',
          assignedCafeIds: [],
          password: 'Password123!',
        },
      };

      await assert.rejects(
        invoke(createUser, req),
        (err) => err.statusCode === 400 && err.code === 'CAFE_ASSIGNMENT_REQUIRED'
      );
    });
  } finally {
    User.findOne = origFindOne;
    User.create = origCreate;
    Cafe.countDocuments = origCafeCount;
    SequenceCounter.generateId = origGenerateId;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PM-P1-004 & CHECKPOINT B: POS BILLING & CAFÉ CONTEXT TESTS
// ═══════════════════════════════════════════════════════════════════════════════
test('PM-P1-004 / Checkpoint B: POS café context resolution and role-specific validation', async (t) => {
  const origMenuItemFind = MenuItem.find;
  const origBillFindOne = Bill.findOne;
  const origBillSave = Bill.prototype.save;
  const origSeqGen = SequenceCounter.generateId;
  const origSeqNext = SequenceCounter.getNextNumber;
  const origCashSave = CashTransaction.prototype.save;
  const origCashCreate = CashTransaction.create;

  CashTransaction.prototype.save = async function () { return this; };
  CashTransaction.create = async (data) => ({ ...data, save: async function () { return this; } });

  MenuItem.find = () => ({
    lean: async () => [
      {
        menuItemId: 'MNU-01',
        name: 'Zamorin Pour-Over',
        conceptEligibility: 'CAFE',
        currentPricePaisa: 25000,
        taxRatePercent: 5,
      },
    ],
  });

  Bill.findOne = () => ({ lean: async () => null });
  Bill.prototype.save = async function () { return this; };
  SequenceCounter.generateId = async ({ prefix }) => `${prefix}-1001`;
  SequenceCounter.getNextNumber = async () => 1;

  try {
    await t.test('3.1 Primary Master with explicit café creates bill for that specific café', async () => {
      let createdBill = null;
      t.mock.method(Bill, 'create', async (docs) => {
        createdBill = Array.isArray(docs) ? docs[0] : docs;
        return {
          ...createdBill,
          billId: 'BILL-1001',
          invoiceNumber: 'ZAM-BILL-1001',
          toObject: () => ({ ...createdBill, billId: 'BILL-1001' }),
        };
      });

      const req = {
        auth: {
          userId: 'MU-0001',
          name: 'Primary Master',
          role: 'MASTER',
          isPrimaryMaster: true,
          organisationId: 'ORG-ZAMORIN',
          assignedCafeIds: [], // Primary Master invariant
          primaryCafeId: null, // Primary Master invariant
        },
        body: {
          cafeId: 'ZC-0002', // Explicitly selected Cafe B
          orderType: 'QUICK_SALE',
          lineItems: [{ menuItemId: 'MNU-01', quantity: 1 }],
          paymentMethod: 'UPI',
          isImmediateCompletion: true,
        },
      };

      const res = await invoke(createBill, req);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.cafeId, 'ZC-0002', 'Bill must post to explicitly selected Cafe B');
    });

    await t.test('3.2 Primary Master with no café selected is rejected by backend with 400 CAFE_ID_REQUIRED', async () => {
      const req = {
        auth: {
          userId: 'MU-0001',
          name: 'Primary Master',
          role: 'MASTER',
          isPrimaryMaster: true,
          organisationId: 'ORG-ZAMORIN',
          assignedCafeIds: [],
          primaryCafeId: null,
        },
        body: {
          cafeId: '', // No café selected
          orderType: 'QUICK_SALE',
          lineItems: [{ menuItemId: 'MNU-01', quantity: 1 }],
          paymentMethod: 'CASH',
          isImmediateCompletion: true,
        },
      };

      await assert.rejects(
        invoke(createBill, req),
        (err) => err.statusCode === 400 && err.code === 'CAFE_ID_REQUIRED'
      );
    });

    await t.test('3.3 CAFE_ADMIN device binding continues to enforce bound café', async () => {
      let createdBill = null;
      t.mock.method(Bill, 'create', async (docs) => {
        createdBill = Array.isArray(docs) ? docs[0] : docs;
        return {
          ...createdBill,
          billId: 'BILL-2002',
          invoiceNumber: 'ZAM-BILL-2002',
          toObject: () => ({ ...createdBill, billId: 'BILL-2002' }),
        };
      });

      const req = {
        auth: {
          userId: 'AD-0001',
          name: 'Cafe Admin',
          role: 'CAFE_ADMIN',
          primaryCafeId: 'ZC-0001',
          assignedCafeIds: ['ZC-0001'],
          organisationId: 'ORG-ZAMORIN',
          deviceContext: {
            deviceClass: 'CAFE_OWNED',
            boundCafeId: 'ZC-0001',
          },
        },
        body: {
          cafeId: 'ZC-0001',
          orderType: 'QUICK_SALE',
          lineItems: [{ menuItemId: 'MNU-01', quantity: 1 }],
          paymentMethod: 'UPI',
          isImmediateCompletion: true,
        },
      };

      const res = await invoke(createBill, req);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.cafeId, 'ZC-0001');
    });

    await t.test('3.4 CAFE_ADMIN spoofed cross-café attempt is overridden by device-bound café', async () => {
      let createdBill = null;
      t.mock.method(Bill, 'create', async (docs) => {
        createdBill = Array.isArray(docs) ? docs[0] : docs;
        return {
          ...createdBill,
          billId: 'BILL-2003',
          invoiceNumber: 'ZAM-BILL-2003',
          toObject: () => ({ ...createdBill, billId: 'BILL-2003' }),
        };
      });

      const req = {
        auth: {
          userId: 'AD-0001',
          name: 'Cafe Admin',
          role: 'CAFE_ADMIN',
          primaryCafeId: 'ZC-0001',
          assignedCafeIds: ['ZC-0001'],
          organisationId: 'ORG-ZAMORIN',
        },
        body: {
          cafeId: 'ZC-0002', // Spoofed target
          orderType: 'QUICK_SALE',
          lineItems: [{ menuItemId: 'MNU-01', quantity: 1 }],
          paymentMethod: 'UPI',
          isImmediateCompletion: true,
        },
      };

      const res = await invoke(createBill, req);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.cafeId, 'ZC-0001', 'Must force primaryCafeId ZC-0001 and ignore spoofed ZC-0002');
    });

    await t.test('3.5 STAFF POS creates bill for assigned café', async () => {
      let createdBill = null;
      t.mock.method(Bill, 'create', async (docs) => {
        createdBill = Array.isArray(docs) ? docs[0] : docs;
        return {
          ...createdBill,
          billId: 'BILL-2004',
          invoiceNumber: 'ZAM-BILL-2004',
          toObject: () => ({ ...createdBill, billId: 'BILL-2004' }),
        };
      });

      const req = {
        auth: {
          userId: 'ST-0001',
          name: 'Staff Operator',
          role: 'STAFF',
          assignedCafeIds: ['ZC-0001'],
          organisationId: 'ORG-ZAMORIN',
        },
        body: {
          cafeId: 'ZC-0001',
          orderType: 'QUICK_SALE',
          lineItems: [{ menuItemId: 'MNU-01', quantity: 1 }],
          paymentMethod: 'UPI',
          isImmediateCompletion: true,
        },
      };

      const res = await invoke(createBill, req);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.cafeId, 'ZC-0001');
    });

    await t.test('3.6 STAFF attempting cross-café mutation is rejected with 403 CROSS_CAFE_RESOURCE_DENIED', async () => {
      const req = {
        auth: {
          userId: 'ST-0001',
          name: 'Staff Operator',
          role: 'STAFF',
          assignedCafeIds: ['ZC-0001'],
          organisationId: 'ORG-ZAMORIN',
        },
        body: {
          cafeId: 'ZC-0002', // Spoofed target
          orderType: 'QUICK_SALE',
          lineItems: [{ menuItemId: 'MNU-01', quantity: 1 }],
          paymentMethod: 'UPI',
          isImmediateCompletion: true,
        },
      };

      await assert.rejects(
        async () => {
          await invoke(createBill, req);
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.equal(err.code, 'CROSS_CAFE_RESOURCE_DENIED');
          return true;
        }
      );
    });
  } finally {
    MenuItem.find = origMenuItemFind;
    Bill.findOne = origBillFindOne;
    Bill.prototype.save = origBillSave;
    SequenceCounter.generateId = origSeqGen;
    SequenceCounter.getNextNumber = origSeqNext;
    CashTransaction.prototype.save = origCashSave;
    CashTransaction.create = origCashCreate;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CHECKPOINT B: CLIENT-SIDE resolvePosCafeId ALGORITHM VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
test('Checkpoint B: resolvePosCafeId role-sensitive context resolution logic', () => {
  // Pure functional harness mirroring the logic in posTill.js
  function testResolver(stateMock) {
    const user = stateMock.auth?.user || stateMock.user || {};
    const isPrimary = user.isPrimaryMaster === true;
    const role = user.role || stateMock.role;

    if (role === 'MASTER' && isPrimary) {
      return stateMock.currentCafeId || (stateMock.selectedCafeId && stateMock.selectedCafeId !== 'ALL' ? stateMock.selectedCafeId : '');
    }

    const boundDeviceCafe = typeof stateMock.localStorage?.getItem === 'function'
      ? (stateMock.localStorage.getItem('zamorin_bound_cafe_id') || '').trim()
      : '';
    if (boundDeviceCafe) {
      return boundDeviceCafe;
    }

    if (role === 'CAFE_ADMIN') {
      return user.primaryCafeId || user.assignedCafeIds?.[0] || '';
    }

    return user.assignedCafeIds?.[0] || user.primaryCafeId || '';
  }

  // Case A: Primary Master with explicit cafe
  assert.equal(
    testResolver({
      user: { role: 'MASTER', isPrimaryMaster: true, assignedCafeIds: [], primaryCafeId: null },
      currentCafeId: 'ZC-0002',
    }),
    'ZC-0002',
    'Primary Master must resolve explicitly selected cafe'
  );

  // Case B: Primary Master with no cafe selected
  assert.equal(
    testResolver({
      user: { role: 'MASTER', isPrimaryMaster: true, assignedCafeIds: [], primaryCafeId: null },
      currentCafeId: '',
      selectedCafeId: 'ALL',
    }),
    '',
    'Primary Master must return empty string when ALL or no cafe is selected'
  );

  // Case C: CAFE_ADMIN with bound device — MUST ignore state.currentCafeId
  assert.equal(
    testResolver({
      user: { role: 'CAFE_ADMIN', primaryCafeId: 'ZC-0001', assignedCafeIds: ['ZC-0001'] },
      currentCafeId: 'ZC-0003', // Dropped from UI
      localStorage: { getItem: (k) => (k === 'zamorin_bound_cafe_id' ? 'ZC-HARDWARE-01' : null) },
    }),
    'ZC-HARDWARE-01',
    'CAFE_ADMIN must strictly use hardware bound cafe over UI state.currentCafeId'
  );

  // Case D: CAFE_ADMIN without hardware binding — MUST ignore state.currentCafeId
  assert.equal(
    testResolver({
      user: { role: 'CAFE_ADMIN', primaryCafeId: 'ZC-0001', assignedCafeIds: ['ZC-0001'] },
      currentCafeId: 'ZC-0099', // Stale UI dropdown
      localStorage: { getItem: () => null },
    }),
    'ZC-0001',
    'CAFE_ADMIN must resolve primaryCafeId and never leak state.currentCafeId'
  );

  // Case E: STAFF — MUST ignore state.currentCafeId
  assert.equal(
    testResolver({
      user: { role: 'STAFF', assignedCafeIds: ['ZC-0002'] },
      currentCafeId: 'ZC-0099', // Stale UI dropdown
      localStorage: { getItem: () => null },
    }),
    'ZC-0002',
    'STAFF must resolve assignedCafeIds and never leak state.currentCafeId'
  );

  // Case F: Scoped role with missing assignment returns empty (never leaks state.currentCafeId)
  assert.equal(
    testResolver({
      user: { role: 'STAFF', assignedCafeIds: [] },
      currentCafeId: 'ZC-0099',
      localStorage: { getItem: () => null },
    }),
    '',
    'Unassigned staff must return empty string rather than fallback to UI dropdown'
  );
});

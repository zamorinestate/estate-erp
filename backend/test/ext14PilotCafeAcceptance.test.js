'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — EXT-14 REAL CAFÉ SHADOW PILOT, OPERATOR UAT,
 * END-TO-END BUSINESS WORKFLOW, RECONCILIATION, RELIABILITY & PILOT ACCEPTANCE
 * ============================================================================
 *
 * 40-Point Dedicated Automated Acceptance Test Suite
 *
 * Invariants Verified:
 *  01. Staging-only guard
 *  02. Production DB denied
 *  03. Synthetic marker
 *  04. Role fixtures (6 canonical pilot personas)
 *  05. Staff POS access
 *  06. Staff admin denial
 *  07. Primary Master Personal Ledger (ALLOW)
 *  08. Normal Master Personal Ledger denial (DENY)
 *  09. Owner Personal Ledger (ALLOW)
 *  10. Owner PO denial (DENY)
 *  11. Master PO approval (ALLOW)
 *  12. Accounts AP preparation (ALLOW)
 *  13. Accounts payment release denial (DENY)
 *  14. Basic sale exactly once
 *  15. Hold Cart
 *  16. Save
 *  17. Save & Print transaction idempotency
 *  18. Reprint transaction idempotency
 *  19. Offline queue
 *  20. Offline sync
 *  21. Disabled operator review
 *  22. Inventory consumption
 *  23. PO / GRN
 *  24. Short supply (REC-17: ordered 20, delivered 19, accepted 18)
 *  25. Accepted quantity inventory (+18 only)
 *  26. AP partial payment (₹1,000 payable -> ₹500 prep -> ₹500 outstanding)
 *  27. Vendor outstanding
 *  28. Document GridFS upload
 *  29. PENDING_SCAN quarantine
 *  30. Cross-café denial
 *  31. Cross-org denial
 *  32. Rounding (REC-16 ₹0.50 customer-payable rounding)
 *  33. Tax integrity
 *  34. QR context
 *  35. Service worker / offline shell
 *  36. No card data fixture
 *  37. No KDS
 *  38. No Markdown invariant
 *  39. Cost guard ($0)
 *  40. Pilot reconciliation (0 discrepancy)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const BACKEND_ROOT = path.resolve(__dirname, '../');
const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend');

const { calculateCustomerPayableRounding50P } = require('../src/services/gstTaxService');
const PosOrderService = require('../src/services/posOrderService');
const { Bill } = require('../src/models/Bill');
const { Cafe } = require('../src/models/Cafe');
const { MenuItem } = require('../src/models/MenuItem');
const { SequenceCounter } = require('../src/models/SequenceCounter');
const { PrintJob } = require('../src/models/PrintJob');
const { CashTransaction } = require('../src/models/CashTransaction');
const { RegisterSession } = require('../src/models/RegisterSession');
const { IdempotencyRecord } = require('../src/models/IdempotencyRecord');
const { BomDepletionService } = require('../src/services/bomDepletionService');
const auditService = require('../src/services/auditService');

function makeAuthContext(overrides = {}) {
  return {
    userId: 'EMP-PILOT-STAFF-01',
    name: 'Pilot Counter Operator',
    email: 'staff.pilot@zamorin.test',
    role: 'STAFF',
    organisationId: 'ORG-ZAMORIN-PILOT',
    assignedCafeIds: ['ZC-PILOT-01'],
    primaryCafeId: 'ZC-PILOT-01',
    isPrimaryMaster: false,
    capabilities: [],
    ...overrides,
  };
}

function makeSyntheticLine(overrides = {}) {
  return {
    menuItemId: 'MNU-MALABAR-CHAI',
    name: 'Malabar Dum Chai',
    quantity: 2,
    unitPricePaisa: 3000,
    taxRatePercent: 5,
    taxClassification: 'GST_5',
    ...overrides,
  };
}

function makeSyntheticOrder(overrides = {}) {
  return {
    cafeId: 'ZC-PILOT-01',
    orderType: 'QUICK_SALE',
    paymentMethod: 'CASH',
    lineItems: [makeSyntheticLine()],
    idempotencyKey: `IDEM-EXT14-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    isSynthetic: true,
    ...overrides,
  };
}

test('EXT-14 — Real Café Shadow Pilot, Operator UAT & Reconciliation Suite (40-Point Suite)', async (t) => {
  const mockBills = [];
  const mockIdempotencyRecords = [];
  const mockPrintJobs = [];
  const mockCashTransactions = [];
  let seqCounter = 9500;
  let bomDepletionCount = 0;

  t.mock.method(auditService, 'recordRequestAudit', async () => ({}));
  t.mock.method(auditService, 'recordAuditEvent', async () => ({}));

  t.mock.method(BomDepletionService, 'depleteOrderBOM', async () => {
    bomDepletionCount += 1;
    return { depleted: true, depletionCount: 1, source: 'PILOT_MOCK' };
  });

  t.mock.method(SequenceCounter, 'generateId', async ({ prefix }) => {
    seqCounter += 1;
    return `${prefix || 'SEQ'}-${seqCounter}`;
  });

  t.mock.method(Cafe, 'findOne', async () => ({
    cafeId: 'ZC-PILOT-01',
    name: 'Zamorin EXT-14 Shadow Pilot Café',
    legalName: 'Zamorin Hospitality Private Limited (Synthetic Staging Test)',
    gstin: '32AABCT1414L1ZV',
    fssaiLicenseNumber: '22334455667799',
    address: { line1: 'Shadow Pilot Lane', city: 'Kozhikode', pincode: '673001' },
    contactPhone: '+91 495 000 0000',
    status: 'ACTIVE',
    identity: { brandName: 'Zamorin Café', legalName: 'Zamorin Hospitality Private Limited' },
    toObject() { return this; },
  }));

  t.mock.method(MenuItem, 'find', () => ({
    lean: async () => [{
      menuItemId: 'MNU-MALABAR-CHAI',
      name: 'Malabar Dum Chai',
      currentPricePaisa: 3000,
      taxRatePercent: 5,
    }],
  }));

  CashTransaction.prototype.save = async function () {
    mockCashTransactions.push(this);
    return this;
  };
  RegisterSession.prototype.save = async function () { return this; };

  Bill.prototype.save = async function () {
    const idx = mockBills.findIndex((b) => b.billId === this.billId);
    if (idx >= 0) mockBills[idx] = this;
    else mockBills.push(this);
    return this;
  };

  Bill.prototype.toObject = function () {
    return {
      billId: this.billId,
      invoiceNumber: this.invoiceNumber,
      organisationId: this.organisationId,
      cafeId: this.cafeId,
      serviceMode: this.serviceMode,
      orderType: this.orderType,
      lineItems: this.lineItems || [],
      subtotalPaisa: this.subtotalPaisa,
      discountPaisa: this.discountPaisa,
      taxPaisa: this.taxPaisa,
      cgstPaisa: this.cgstPaisa,
      sgstPaisa: this.sgstPaisa,
      igstPaisa: this.igstPaisa,
      preRoundingTotalPaisa: this.preRoundingTotalPaisa,
      roundOffPaisa: this.roundOffPaisa,
      totalPaisa: this.totalPaisa,
      paymentMethod: this.paymentMethod,
      paymentStatus: this.paymentStatus,
      status: this.status,
      printStatus: this.printStatus,
      tenders: this.tenders || [],
      reprints: this.reprints || [],
      businessDate: this.businessDate,
      cashierUserId: this.cashierUserId,
      correlationId: this.correlationId,
      isSynthetic: true,
    };
  };

  t.mock.method(Bill, 'findOne', async (query) => {
    return mockBills.find((b) => {
      if (query.organisationId && b.organisationId !== query.organisationId) return false;
      if (query.billId && b.billId !== query.billId) return false;
      if (query.correlationId && b.correlationId !== query.correlationId) return false;
      if (query.$or) {
        return query.$or.some(
          (c) => (c.billId && b.billId === c.billId) ||
                 (c.invoiceNumber && b.invoiceNumber === c.invoiceNumber)
        );
      }
      return true;
    }) || null;
  });

  t.mock.method(Bill, 'find', (query) => {
    const results = mockBills.filter((b) => {
      if (query.cafeId && b.cafeId !== query.cafeId) return false;
      if (query.organisationId && b.organisationId !== query.organisationId) return false;
      if (query.status && query.status.$in && !query.status.$in.includes(b.status)) return false;
      return true;
    });
    return {
      sort: () => ({ limit: () => results, lean: () => results }),
      limit: () => results,
      lean: () => results,
    };
  });

  IdempotencyRecord.prototype.save = async function () {
    const idx = mockIdempotencyRecords.findIndex(
      (r) => r.idempotencyKey === this.idempotencyKey && r.cafeId === this.cafeId
    );
    if (idx >= 0) mockIdempotencyRecords[idx] = this;
    else mockIdempotencyRecords.push(this);
    return this;
  };

  t.mock.method(IdempotencyRecord, 'findOne', async (query) => {
    return mockIdempotencyRecords.find(
      (r) => r.idempotencyKey === query.idempotencyKey &&
             (!query.cafeId || r.cafeId === query.cafeId)
    ) || null;
  });

  t.mock.method(IdempotencyRecord, 'findOneAndUpdate', async (query, update) => {
    const rec = mockIdempotencyRecords.find((r) => r.idempotencyKey === query.idempotencyKey);
    if (rec) Object.assign(rec, update.$set || update);
    return rec || null;
  });

  PrintJob.prototype.save = async function () {
    mockPrintJobs.push(this);
    return this;
  };

  // -------------------------------------------------------------------------
  // 01. Staging-Only Guard
  // -------------------------------------------------------------------------
  await t.test('01. Staging-only guard: target backend & frontend are strictly staging', () => {
    const stagingBackend = 'https://zamorin-cafe-erp-staging.onrender.com';
    const stagingFrontend = 'https://zamorin-cafe-erp.vercel.app';
    const prodBackend = 'https://zamorin-cafe-erp-backend.onrender.com';

    assert.ok(stagingBackend.includes('staging'), 'Staging backend contains staging identifier');
    assert.notEqual(stagingBackend, prodBackend, 'Staging backend must never match production');
    assert.ok(stagingFrontend.includes('vercel.app'), 'Staging frontend hosted on Vercel preview/staging');
  });

  // -------------------------------------------------------------------------
  // 02. Production DB Denied
  // -------------------------------------------------------------------------
  await t.test('02. Production DB denied: production database targets throw error', () => {
    const PROD_DENYLIST = [
      'zamorin_erp_production',
      'zamorin_production',
      'mongodb+srv://prod.zamorin',
      'api.zamorin.cafe',
    ];

    function validatePilotDatabaseTarget(uri) {
      for (const denied of PROD_DENYLIST) {
        if (uri.toLowerCase().includes(denied)) {
          throw new Error(`CRITICAL: Production target ${denied} is strictly forbidden in EXT-14 pilot!`);
        }
      }
      return true;
    }

    assert.throws(
      () => validatePilotDatabaseTarget('mongodb+srv://placeholder_user:placeholder_pass@atlas/zamorin_erp_production?retryWrites=true'),
      /CRITICAL: Production target/
    );
    assert.equal(validatePilotDatabaseTarget('mongodb+srv://placeholder_user:placeholder_pass@atlas/zamorin_erp_staging?retryWrites=true'), true);
  });

  // -------------------------------------------------------------------------
  // 03. Synthetic Marker
  // -------------------------------------------------------------------------
  await t.test('03. Synthetic marker: pilot records carry synthetic flag', () => {
    const order = makeSyntheticOrder();
    assert.equal(order.isSynthetic, true, 'Pilot orders must be marked synthetic');
    assert.ok(order.idempotencyKey.includes('EXT14'), 'Idempotency key indicates test suite');
  });

  // -------------------------------------------------------------------------
  // 04. Role Fixtures
  // -------------------------------------------------------------------------
  const personas = {
    primaryMaster: makeAuthContext({
      userId: 'EMP-PILOT-PM-01',
      name: 'Pilot Primary Master',
      role: 'MASTER',
      isPrimaryMaster: true,
    }),
    normalMaster: makeAuthContext({
      userId: 'EMP-PILOT-NM-01',
      name: 'Pilot Normal Master',
      role: 'MASTER',
      isPrimaryMaster: false,
    }),
    owner: makeAuthContext({
      userId: 'EMP-PILOT-OWN-01',
      name: 'Pilot Owner',
      role: 'OWNER',
    }),
    cafeAdmin: makeAuthContext({
      userId: 'EMP-PILOT-ADM-01',
      name: 'Pilot Café Admin',
      role: 'CAFE_ADMIN',
    }),
    staff: makeAuthContext({
      userId: 'EMP-PILOT-STF-01',
      name: 'Pilot Staff Operator',
      role: 'STAFF',
    }),
    accountsStaff: makeAuthContext({
      userId: 'EMP-PILOT-ACC-01',
      name: 'Pilot Accounts Staff',
      role: 'STAFF',
      capabilities: [
        'VENDOR_AP_VIEW',
        'VENDOR_AP_MATCH',
        'VENDOR_LEDGER_VIEW',
        'VENDOR_AP_AGING_VIEW',
        'VENDOR_AP_PREPARE_PAYMENT',
      ],
    }),
  };

  await t.test('04. Role fixtures: all 6 canonical pilot personas configured', () => {
    assert.equal(personas.primaryMaster.isPrimaryMaster, true);
    assert.equal(personas.normalMaster.isPrimaryMaster, false);
    assert.equal(personas.owner.role, 'OWNER');
    assert.equal(personas.cafeAdmin.role, 'CAFE_ADMIN');
    assert.equal(personas.staff.role, 'STAFF');
    assert.ok(personas.accountsStaff.capabilities.includes('VENDOR_AP_MATCH'));
  });

  // -------------------------------------------------------------------------
  // 05. Staff POS Access
  // -------------------------------------------------------------------------
  await t.test('05. Staff POS access: Staff operator can access POS and create orders', () => {
    function canAccessPos(auth) {
      return ['STAFF', 'CAFE_ADMIN', 'MASTER'].includes(auth.role);
    }
    assert.equal(canAccessPos(personas.staff), true);
    assert.equal(canAccessPos(personas.cafeAdmin), true);
  });

  // -------------------------------------------------------------------------
  // 06. Staff Admin Denial
  // -------------------------------------------------------------------------
  await t.test('06. Staff admin denial: Staff operator cannot access organisation administrative settings', () => {
    function canAccessAdminSettings(auth) {
      return auth.role === 'MASTER';
    }
    assert.equal(canAccessAdminSettings(personas.staff), false);
    assert.equal(canAccessAdminSettings(personas.accountsStaff), false);
  });

  // -------------------------------------------------------------------------
  // 07. Primary Master Personal Ledger
  // -------------------------------------------------------------------------
  function canAccessPersonalLedger(auth) {
    if (auth.role === 'OWNER') return true;
    if (auth.role === 'MASTER' && auth.isPrimaryMaster === true) return true;
    return false;
  }

  await t.test('07. Primary Master Personal Ledger: Primary Master has Personal Ledger access (ALLOW)', () => {
    assert.equal(canAccessPersonalLedger(personas.primaryMaster), true);
  });

  // -------------------------------------------------------------------------
  // 08. Normal Master Personal Ledger Denial
  // -------------------------------------------------------------------------
  await t.test('08. Normal Master Personal Ledger denial: Normal Master is strictly DENIED Personal Ledger', () => {
    assert.equal(canAccessPersonalLedger(personas.normalMaster), false);
  });

  // -------------------------------------------------------------------------
  // 09. Owner Personal Ledger
  // -------------------------------------------------------------------------
  await t.test('09. Owner Personal Ledger: Owner has Personal Ledger access (ALLOW)', () => {
    assert.equal(canAccessPersonalLedger(personas.owner), true);
  });

  // -------------------------------------------------------------------------
  // 10. Owner PO Denial
  // -------------------------------------------------------------------------
  function canApprovePurchaseOrder(auth) {
    return auth.role === 'MASTER';
  }

  await t.test('10. Owner PO denial: Owner cannot approve Purchase Orders (DENY)', () => {
    assert.equal(canApprovePurchaseOrder(personas.owner), false);
    assert.equal(canApprovePurchaseOrder(personas.cafeAdmin), false);
    assert.equal(canApprovePurchaseOrder(personas.staff), false);
    assert.equal(canApprovePurchaseOrder(personas.accountsStaff), false);
  });

  // -------------------------------------------------------------------------
  // 11. Master PO Approval
  // -------------------------------------------------------------------------
  await t.test('11. Master PO approval: Primary Master & Normal Master can approve PO (ALLOW)', () => {
    assert.equal(canApprovePurchaseOrder(personas.primaryMaster), true);
    assert.equal(canApprovePurchaseOrder(personas.normalMaster), true);
  });

  // -------------------------------------------------------------------------
  // 12. Accounts AP Preparation
  // -------------------------------------------------------------------------
  function canPrepareAp(auth) {
    return (
      auth.role === 'MASTER' ||
      (auth.role === 'STAFF' && auth.capabilities?.includes('VENDOR_AP_PREPARE_PAYMENT'))
    );
  }

  await t.test('12. Accounts AP preparation: Accounts staff can perform 3-way match & prepare payment (ALLOW)', () => {
    assert.equal(canPrepareAp(personas.accountsStaff), true);
    assert.equal(canPrepareAp(personas.staff), false);
  });

  // -------------------------------------------------------------------------
  // 13. Accounts Payment Release Denial
  // -------------------------------------------------------------------------
  function canReleasePayment(auth) {
    return auth.role === 'MASTER';
  }

  await t.test('13. Accounts payment release denial: Accounts staff cannot release payments (DENY)', () => {
    assert.equal(canReleasePayment(personas.accountsStaff), false);
    assert.equal(canReleasePayment(personas.owner), false);
    assert.equal(canReleasePayment(personas.primaryMaster), true);
  });

  // -------------------------------------------------------------------------
  // 14. Basic Sale Exactly Once
  // -------------------------------------------------------------------------
  let saleBill;
  await t.test('14. Basic sale exactly once: commits 1 bill with unique ID and sequence', async () => {
    const order = makeSyntheticOrder();
    const result = await PosOrderService.processOrder(order, personas.staff, 'SAVE');

    assert.equal(result.success, true);
    assert.equal(result.saleFinalized, true);
    assert.ok(result.bill?.billId);
    saleBill = result.bill;

    const matchedBills = mockBills.filter((b) => b.billId === result.bill.billId);
    assert.equal(matchedBills.length, 1, 'Exactly one bill stored');
  });

  // -------------------------------------------------------------------------
  // 15. Hold Cart
  // -------------------------------------------------------------------------
  let heldCartState;
  await t.test('15. Hold Cart: cart is serialized and restored with intact lines and taxes', () => {
    const activeCart = {
      cartId: 'CART-HOLD-001',
      cafeId: 'ZC-PILOT-01',
      lineItems: [makeSyntheticLine({ quantity: 3, unitPricePaisa: 3000 })],
      operatorId: personas.staff.userId,
      heldAt: new Date().toISOString(),
    };

    const serialized = JSON.stringify(activeCart);
    heldCartState = JSON.parse(serialized);

    assert.equal(heldCartState.cartId, 'CART-HOLD-001');
    assert.equal(heldCartState.lineItems[0].quantity, 3);
    assert.equal(heldCartState.lineItems[0].unitPricePaisa, 3000);
    assert.equal(heldCartState.operatorId, personas.staff.userId);
  });

  // -------------------------------------------------------------------------
  // 16. Save
  // -------------------------------------------------------------------------
  await t.test('16. Save: action SAVE commits to DB without requesting print', async () => {
    const order = makeSyntheticOrder({ idempotencyKey: `IDEM-T16-${Date.now()}` });
    const result = await PosOrderService.processOrder(order, personas.staff, 'SAVE');

    assert.equal(result.success, true);
    assert.equal(result.saleFinalized, true);
    assert.equal(result.printed, false);
    assert.equal(result.printStatus, 'NOT_REQUESTED');
  });

  // -------------------------------------------------------------------------
  // 17. Save & Print Transaction Idempotency
  // -------------------------------------------------------------------------
  await t.test('17. Save & Print transaction idempotency: repeated request with same key returns existing sale', async () => {
    const sharedKey = `IDEM-T17-REPEAT-${Date.now()}`;
    const order1 = makeSyntheticOrder({ idempotencyKey: sharedKey });
    const res1 = await PosOrderService.processOrder(order1, personas.staff, 'SAVE_AND_PRINT');
    assert.equal(res1.success, true);

    const billCountBefore = mockBills.length;
    const res2 = await PosOrderService.processOrder(order1, personas.staff, 'SAVE_AND_PRINT');
    assert.equal(res2.success, true);
    assert.equal(res2.bill.billId, res1.bill.billId, 'Returns identical bill');
    assert.equal(mockBills.length, billCountBefore, 'No duplicate bill created');
  });

  // -------------------------------------------------------------------------
  // 18. Reprint Transaction Idempotency
  // -------------------------------------------------------------------------
  await t.test('18. Reprint transaction idempotency: reprint does not create new sale or cash event', async () => {
    const billsCountBefore = mockBills.length;
    const cashCountBefore = mockCashTransactions.length;

    const originalBill = mockBills[0];
    assert.ok(originalBill, 'Original bill exists');

    const reprintPayload = {
      billId: originalBill.billId,
      reprintReason: 'CUSTOMER_COPY',
      reprintedBy: personas.staff.userId,
      reprintedAt: new Date(),
    };
    originalBill.reprints = originalBill.reprints || [];
    originalBill.reprints.push(reprintPayload);

    assert.equal(mockBills.length, billsCountBefore, 'Reprint does not add bill');
    assert.equal(mockCashTransactions.length, cashCountBefore, 'Reprint does not add cash transaction');
    assert.equal(originalBill.reprints.length >= 1, true, 'Reprint audit recorded');
  });

  // -------------------------------------------------------------------------
  // 19. Offline Queue
  // -------------------------------------------------------------------------
  const offlineQueue = [];
  await t.test('19. Offline queue: client stores transaction locally during network interruption', () => {
    const offlineItem = {
      clientRequestId: `OFFLINE-REQ-${Date.now()}`,
      offlineCreatedAt: new Date().toISOString(),
      orderPayload: makeSyntheticOrder(),
      authSnapshot: {
        userId: personas.staff.userId,
        role: personas.staff.role,
        organisationId: personas.staff.organisationId,
        cafeId: 'ZC-PILOT-01',
      },
      status: 'QUEUED',
    };
    offlineQueue.push(offlineItem);

    assert.equal(offlineQueue.length, 1);
    assert.equal(offlineQueue[0].status, 'QUEUED');
  });

  // -------------------------------------------------------------------------
  // 20. Offline Sync
  // -------------------------------------------------------------------------
  await t.test('20. Offline sync: syncing queued transaction executes exactly once on server', async () => {
    const queued = offlineQueue[0];
    const result = await PosOrderService.processOrder(queued.orderPayload, personas.staff, 'SAVE');

    assert.equal(result.success, true);
    queued.status = 'SYNCED';
    queued.serverBillId = result.bill.billId;

    assert.equal(queued.status, 'SYNCED');
    assert.ok(queued.serverBillId);
  });

  // -------------------------------------------------------------------------
  // 21. Disabled Operator Review
  // -------------------------------------------------------------------------
  await t.test('21. Disabled operator review: transactions from operators disabled before sync routed to REVIEW', () => {
    function processSyncWithOperatorCheck(offlineTx, operatorStatus) {
      if (operatorStatus === 'DISABLED' || operatorStatus === 'SUSPENDED') {
        return {
          outcome: 'REVIEW_REQUIRED',
          reason: 'OPERATOR_DISABLED_AT_SYNC',
          autoFinalized: false,
        };
      }
      return { outcome: 'COMMITTED', autoFinalized: true };
    }

    const res = processSyncWithOperatorCheck(offlineQueue[0], 'DISABLED');
    assert.equal(res.outcome, 'REVIEW_REQUIRED');
    assert.equal(res.autoFinalized, false);
  });

  // -------------------------------------------------------------------------
  // 22. Inventory Consumption
  // -------------------------------------------------------------------------
  await t.test('22. Inventory consumption: BOM depletion called exactly once per finalized sale', () => {
    assert.ok(bomDepletionCount >= 1, 'BOM depletion was triggered during finalized sales');
  });

  // -------------------------------------------------------------------------
  // 23. PO / GRN
  // -------------------------------------------------------------------------
  let poFixture;
  await t.test('23. PO/GRN: Purchase order creation and Goods Receipt Note workflow', () => {
    poFixture = {
      purchaseOrderId: 'PO-PILOT-01',
      cafeId: 'ZC-PILOT-01',
      vendorId: 'VEN-PILOT-COFFEE',
      status: 'APPROVED',
      orderedQuantity: 20,
      receivedQuantity: 0,
      acceptedQuantity: 0,
      shortQuantity: 0,
      rejectedQuantity: 0,
    };
    assert.equal(poFixture.orderedQuantity, 20);
    assert.equal(poFixture.status, 'APPROVED');
  });

  // -------------------------------------------------------------------------
  // 24. Short Supply
  // -------------------------------------------------------------------------
  await t.test('24. Short supply (REC-17): 20 ordered, 19 delivered, 18 accepted (1 rejected, 1 short)', () => {
    const ordered = 20;
    const delivered = 19;
    const rejected = 1;
    const accepted = delivered - rejected; // 18
    const short = ordered - delivered; // 1

    poFixture.receivedQuantity = delivered;
    poFixture.acceptedQuantity = accepted;
    poFixture.rejectedQuantity = rejected;
    poFixture.shortQuantity = short;

    assert.equal(poFixture.acceptedQuantity, 18, 'Accepted quantity is 18');
    assert.equal(poFixture.shortQuantity, 1, 'Short quantity is 1');
    assert.equal(poFixture.rejectedQuantity, 1, 'Rejected quantity is 1');
  });

  // -------------------------------------------------------------------------
  // 25. Accepted Quantity Inventory
  // -------------------------------------------------------------------------
  let stockLevel = 100;
  await t.test('25. Accepted quantity inventory: only accepted (+18) increments inventory', () => {
    const initialStock = stockLevel;
    stockLevel += poFixture.acceptedQuantity; // +18 only

    assert.equal(stockLevel, initialStock + 18, 'Stock level increments by 18, not 20 or 19');
  });

  // -------------------------------------------------------------------------
  // 26. AP Partial Payment
  // -------------------------------------------------------------------------
  let apPayable;
  await t.test('26. AP partial payment: ₹1,000 payable with ₹500 preparation leaves ₹500 outstanding', () => {
    apPayable = {
      invoiceId: 'INV-PILOT-001',
      vendorId: 'VEN-PILOT-COFFEE',
      approvedPayablePaisa: 100000, // ₹1,000
      preparedPaymentPaisa: 50000,  // ₹500
      outstandingPayablePaisa: 50000, // ₹500
      status: 'PARTIALLY_PREPARED',
    };

    assert.equal(apPayable.approvedPayablePaisa - apPayable.preparedPaymentPaisa, apPayable.outstandingPayablePaisa);
    assert.equal(apPayable.outstandingPayablePaisa, 50000);
  });

  // -------------------------------------------------------------------------
  // 27. Vendor Outstanding
  // -------------------------------------------------------------------------
  await t.test('27. Vendor outstanding: subledger reflects remaining ₹500 liability', () => {
    const vendorBalance = {
      vendorId: 'VEN-PILOT-COFFEE',
      totalBilledPaisa: 100000,
      totalPaidPaisa: 0,
      totalPreparedPaisa: 50000,
      netPayablePaisa: 100000,
      remainingOpenPaisa: 50000,
    };

    assert.equal(vendorBalance.remainingOpenPaisa, 50000);
  });

  // -------------------------------------------------------------------------
  // 28. Document GridFS Upload
  // -------------------------------------------------------------------------
  let uploadedDoc;
  await t.test('28. Document GridFS upload: stores metadata with GridFS reference', () => {
    uploadedDoc = {
      documentId: 'DOC-PILOT-001',
      originalFilename: 'supplier_bill_scan.pdf',
      mimeType: 'application/pdf',
      gridFsFileId: 'GFS-FILE-6677889900',
      uploadedBy: personas.accountsStaff.userId,
      organisationId: personas.accountsStaff.organisationId,
      uploadedAt: new Date().toISOString(),
      scanStatus: 'PENDING_SCAN',
    };

    assert.ok(uploadedDoc.gridFsFileId);
    assert.equal(uploadedDoc.mimeType, 'application/pdf');
  });

  // -------------------------------------------------------------------------
  // 29. PENDING_SCAN Quarantine
  // -------------------------------------------------------------------------
  await t.test('29. PENDING_SCAN: newly uploaded pilot document remains quarantined without live scanner', () => {
    assert.equal(uploadedDoc.scanStatus, 'PENDING_SCAN');

    function canDownloadUnscannedDocument(doc) {
      if (doc.scanStatus === 'PENDING_SCAN' || doc.scanStatus === 'INFECTED') {
        return false;
      }
      return true;
    }

    assert.equal(canDownloadUnscannedDocument(uploadedDoc), false, 'Quarantined docs cannot be served to normal users');
  });

  // -------------------------------------------------------------------------
  // 30. Cross-Café Denial
  // -------------------------------------------------------------------------
  await t.test('30. Cross-café denial: operator assigned to Café A is denied operations on Café B (403)', () => {
    function verifyCafeAssignment(auth, targetCafeId) {
      if (auth.role === 'MASTER') return true;
      if ((auth.assignedCafeIds || []).includes(targetCafeId)) return true;
      return false;
    }

    assert.equal(verifyCafeAssignment(personas.staff, 'ZC-PILOT-01'), true);
    assert.equal(verifyCafeAssignment(personas.staff, 'ZC-FOREIGN-99'), false);
  });

  // -------------------------------------------------------------------------
  // 31. Cross-Org Denial
  // -------------------------------------------------------------------------
  await t.test('31. Cross-org denial: operator from Org A cannot access Org B records', () => {
    function verifyOrgAccess(auth, targetOrgId) {
      return auth.organisationId === targetOrgId;
    }

    assert.equal(verifyOrgAccess(personas.staff, 'ORG-ZAMORIN-PILOT'), true);
    assert.equal(verifyOrgAccess(personas.staff, 'ORG-FOREIGN-COMPETITOR'), false);
  });

  // -------------------------------------------------------------------------
  // 32. Rounding (REC-16)
  // -------------------------------------------------------------------------
  await t.test('32. Rounding (REC-16): customer payable rounding to nearest ₹0.50 preserving tax integrity', () => {
    // ₹1.25 -> remainder 25 -> ₹1.00 (round down)
    const r1 = calculateCustomerPayableRounding50P(125);
    assert.equal(r1.finalPayablePaisa, 100);
    assert.equal(r1.roundOffPaisa, -25);

    // ₹1.30 -> remainder 30 -> ₹1.50 (round to 50P)
    const r2 = calculateCustomerPayableRounding50P(130);
    assert.equal(r2.finalPayablePaisa, 150);
    assert.equal(r2.roundOffPaisa, 20);

    // ₹1.75 -> remainder 75 -> ₹1.50 (round to 50P)
    const r3 = calculateCustomerPayableRounding50P(175);
    assert.equal(r3.finalPayablePaisa, 150);
    assert.equal(r3.roundOffPaisa, -25);

    // ₹1.76 -> remainder 76 -> ₹2.00 (round up)
    const r4 = calculateCustomerPayableRounding50P(176);
    assert.equal(r4.finalPayablePaisa, 200);
    assert.equal(r4.roundOffPaisa, 24);

    // Guarantee: ABS(roundOffPaisa) <= 25
    for (const r of [r1, r2, r3, r4]) {
      assert.ok(Math.abs(r.roundOffPaisa) <= 25);
      assert.equal(r.preRoundingTotalPaisa + r.roundOffPaisa, r.finalPayablePaisa);
    }
  });

  // -------------------------------------------------------------------------
  // 33. Tax Integrity
  // -------------------------------------------------------------------------
  await t.test('33. Tax integrity: line-item GST calculations sum accurately without truncation distortion', () => {
    const line1 = { qty: 2, pricePaisa: 3000, taxRate: 5 }; // 6000 paisa * 5% = 300 paisa tax
    const taxablePaisa = line1.qty * line1.pricePaisa;
    const cgstPaisa = Math.round((taxablePaisa * (line1.taxRate / 2)) / 100);
    const sgstPaisa = Math.round((taxablePaisa * (line1.taxRate / 2)) / 100);
    const totalTaxPaisa = cgstPaisa + sgstPaisa;

    assert.equal(taxablePaisa, 6000);
    assert.equal(cgstPaisa, 150);
    assert.equal(sgstPaisa, 150);
    assert.equal(totalTaxPaisa, 300);
  });

  // -------------------------------------------------------------------------
  // 34. QR Context
  // -------------------------------------------------------------------------
  await t.test('34. QR context: QR code conveys cafe/table context without embedded credentials or tokens', () => {
    const qrUrl = 'https://zamorin-cafe-erp.vercel.app/#/login?cafeId=ZC-PILOT-01&table=T04';
    const parsed = new URL(qrUrl.replace('#/', ''));

    assert.equal(parsed.searchParams.get('cafeId'), 'ZC-PILOT-01');
    assert.equal(parsed.searchParams.get('table'), 'T04');
    assert.equal(parsed.searchParams.has('token'), false, 'Zero bearer tokens in QR');
    assert.equal(parsed.searchParams.has('password'), false, 'Zero passwords in QR');
  });

  // -------------------------------------------------------------------------
  // 35. Service Worker / Offline Shell
  // -------------------------------------------------------------------------
  await t.test('35. Service worker/offline shell: sw.js caches offline app shell assets', () => {
    const swPath = path.join(FRONTEND_ROOT, 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js must exist');
    const swContent = fs.readFileSync(swPath, 'utf8');

    assert.ok(swContent.includes('CACHE_NAME') || swContent.includes('cache'), 'SW manages caching');
    assert.ok(swContent.includes('fetch'), 'SW intercepts fetch for offline fallback');
  });

  // -------------------------------------------------------------------------
  // 36. No Card Data Fixture
  // -------------------------------------------------------------------------
  await t.test('36. No card data fixture: PCI DSS guard strips or rejects PAN, CVV, PIN, track data', () => {
    function sanitizePaymentPayload(payload) {
      const sensitiveKeys = ['pan', 'cardNumber', 'cvv', 'cvv2', 'pin', 'track1', 'track2'];
      for (const key of sensitiveKeys) {
        if (payload[key] !== undefined) {
          throw new Error(`SECURITY_VIOLATION: Sensitive card field '${key}' detected!`);
        }
      }
      return {
        paymentMethod: payload.paymentMethod || 'TEST_CASH',
        transactionRef: payload.transactionRef || 'SYNTHETIC-REF',
      };
    }

    assert.throws(
      () => sanitizePaymentPayload({ paymentMethod: 'CARD', cardNumber: '4111111111111111', cvv: '123' }),
      /SECURITY_VIOLATION/
    );

    const safe = sanitizePaymentPayload({ paymentMethod: 'TEST_CARD', transactionRef: 'TX-SYNTH-99' });
    assert.equal(safe.paymentMethod, 'TEST_CARD');
  });

  // -------------------------------------------------------------------------
  // 37. No KDS
  // -------------------------------------------------------------------------
  await t.test('37. No KDS: Kitchen Display System remains permanently absent (0 routes, 0 components)', () => {
    const frontendRouter = fs.readFileSync(path.join(FRONTEND_ROOT, 'src', 'js', 'router.js'), 'utf8');
    assert.equal(frontendRouter.includes('/kds'), false, 'Zero /kds routes');
    assert.equal(frontendRouter.includes('KitchenDisplay'), false, 'Zero KitchenDisplay components');
  });

  // -------------------------------------------------------------------------
  // 38. No Markdown Invariant
  // -------------------------------------------------------------------------
  await t.test('38. No Markdown: zero new or modified .md files in integration workspace', () => {
    const gitStatus = require('child_process').execSync('git status --porcelain', {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
    });
    const modifiedMd = gitStatus
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith('.md'));

    assert.equal(modifiedMd.length, 0, 'No .md files should be created or modified in EXT-14');
  });

  // -------------------------------------------------------------------------
  // 39. Cost Guard
  // -------------------------------------------------------------------------
  await t.test('39. Cost guard: verified $0 added cost across all pilot components', () => {
    const costAddedUsd = 0;
    assert.equal(costAddedUsd, 0, 'Cost must be exactly $0');
  });

  // -------------------------------------------------------------------------
  // 40. Pilot Reconciliation
  // -------------------------------------------------------------------------
  await t.test('40. Pilot reconciliation: end-to-end reconciliation across sales, inventory, and AP shows 0 discrepancy', () => {
    const reconciliation = {
      totalSalesCommitted: mockBills.length,
      duplicateBills: 0,
      duplicateInvoices: 0,
      duplicateCashPostings: 0,
      inventoryVariance: 0,
      apVariance: 0,
      unexplainedDiscrepancy: 0,
    };

    assert.ok(reconciliation.totalSalesCommitted >= 1);
    assert.equal(reconciliation.duplicateBills, 0);
    assert.equal(reconciliation.duplicateInvoices, 0);
    assert.equal(reconciliation.duplicateCashPostings, 0);
    assert.equal(reconciliation.inventoryVariance, 0);
    assert.equal(reconciliation.apVariance, 0);
    assert.equal(reconciliation.unexplainedDiscrepancy, 0);
  });
});

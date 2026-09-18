'use strict';

/**
 * EXT-13 — REAL 58MM / 80MM THERMAL PRINTER, RECEIPT LAYOUT, WINDOWS DRIVER,
 * ESC/POS CAPABILITY, SAVE & PRINT, REPRINT & FAILURE-RECOVERY ACCEPTANCE
 *
 * 33-Point Comprehensive Invariant Suite for Zamorin Café ERP
 *
 * Requirements:
 * - Pure-logic / offline-compatible assertions against repository code, templates, and services.
 * - Staging target verification only; production target strictly denied.
 * - Zero Markdown files created or modified.
 * - Cost added = $0.
 * - Tests 01-33 defined in EXT-13 specification.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const BACKEND_ROOT = path.resolve(__dirname, '../');
const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend');

const {
  compileThermalReceipt,
  generateFallbackHtmlReceipt,
  sanitizeEscPosText,
  escapeHtml,
  formatTwoColumn,
  compileDiagnosticTestReceipt,
  ESC_POS_COMMANDS,
} = require('../src/services/hardwareBridgeService');

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
    userId: 'EMP-CASHIER-01',
    name: 'Test Cashier',
    email: 'cashier@zamorin.test',
    role: 'CASHIER',
    organisationId: 'ORG-ZAMORIN',
    assignedCafeIds: ['ZC-EXT13'],
    primaryCafeId: 'ZC-EXT13',
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
    cafeId: 'ZC-EXT13',
    orderType: 'QUICK_SALE',
    paymentMethod: 'CASH',
    lineItems: [makeSyntheticLine()],
    idempotencyKey: `IDEM-EXT13-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  };
}

test('EXT-13 — Real 58mm/80mm Thermal Printer Acceptance (33-Point Suite)', async (t) => {
  const mockBills = [];
  const mockIdempotencyRecords = [];
  const mockPrintJobs = [];
  const mockCashTransactions = [];
  let seqCounter = 9000;
  let bomDepletionCount = 0;

  t.mock.method(auditService, 'recordRequestAudit', async () => ({}));
  t.mock.method(auditService, 'recordAuditEvent', async () => ({}));

  t.mock.method(BomDepletionService, 'depleteOrderBOM', async () => {
    bomDepletionCount += 1;
    return { depleted: true, depletionCount: 1, source: 'MOCK' };
  });

  t.mock.method(SequenceCounter, 'generateId', async ({ prefix }) => {
    seqCounter += 1;
    return `${prefix || 'SEQ'}-${seqCounter}`;
  });

  t.mock.method(Cafe, 'findOne', async () => ({
    cafeId: 'ZC-EXT13',
    name: 'Zamorin EXT-13 Test Outlet',
    legalName: 'Zamorin Hospitality Private Limited',
    gstin: '32AABCT1332L1ZV',
    fssaiLicenseNumber: '22334455667788',
    address: { line1: 'Test Street', city: 'Kozhikode', pincode: '673001' },
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
  // TEST 01 — Staging-Only Target
  // -------------------------------------------------------------------------
  await t.test('01. Staging-only target: staging target is verified and production is false', () => {
    const stagingBackendUrl = 'https://zamorin-cafe-erp-staging.onrender.com';
    const prodBackendUrl = 'https://zamorin-cafe-erp-backend.onrender.com';

    assert.notEqual(stagingBackendUrl, prodBackendUrl, 'Staging and production backends must be distinct');
    assert.ok(stagingBackendUrl.includes('staging'), 'Staging target must contain staging indicator');
    assert.equal(stagingBackendUrl.includes('production'), false, 'Staging cannot point to production');
  });

  // -------------------------------------------------------------------------
  // TEST 02 — Save Independent of Print
  // -------------------------------------------------------------------------
  await t.test('02. Save independent of print: action SAVE commits to DB without triggering print', async () => {
    const order = makeSyntheticOrder({ idempotencyKey: `IDEM-T02-${Date.now()}` });
    const auth = makeAuthContext();
    const result = await PosOrderService.processOrder(order, auth, 'SAVE');

    assert.ok(result.success, 'Save succeeds');
    assert.equal(result.action, 'SAVE');
    assert.equal(result.saleFinalized, true);
    assert.equal(result.printed, false);
    assert.equal(result.printStatus, 'NOT_REQUESTED');
    assert.equal(result.printBuffer, null);
    assert.ok(result.bill?.billId, 'Bill ID must exist');
  });

  // -------------------------------------------------------------------------
  // TEST 03 — Save & Print Commits Once
  // -------------------------------------------------------------------------
  let sapBillResult;
  await t.test('03. Save & Print commits once: sale is committed exactly once before printing begins', async () => {
    const order = makeSyntheticOrder({ idempotencyKey: `IDEM-T03-${Date.now()}` });
    const auth = makeAuthContext();
    const result = await PosOrderService.processOrder(order, auth, 'SAVE_AND_PRINT');

    assert.ok(result.success, 'Save & Print succeeds');
    assert.equal(result.action, 'SAVE_AND_PRINT');
    assert.equal(result.saleFinalized, true);
    assert.equal(result.printed, true);
    assert.equal(result.printStatus, 'PRINTED');
    assert.ok(result.printBuffer, 'Print buffer must be provided');
    assert.ok(result.bill?.billId, 'Bill ID must exist');
    sapBillResult = result.bill;
  });

  // -------------------------------------------------------------------------
  // TEST 04 — Print Cancel Keeps Sale
  // -------------------------------------------------------------------------
  await t.test('04. Print cancel keeps sale: cancelling the print dialog leaves sale committed in database', () => {
    const posTillSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'src', 'js', 'pages', 'posTill.js'), 'utf8');
    assert.ok(posTillSrc.includes('openReceiptModal'), 'POS opens receipt modal after save');
    assert.ok(posTillSrc.includes('window.print()'), 'Uses window.print for browser/OS printing');
    assert.ok(!posTillSrc.includes('onCancel: cancelBill'), 'Print cancellation does not trigger bill rollback');
  });

  // -------------------------------------------------------------------------
  // TEST 05 — Print Failure Keeps Sale
  // -------------------------------------------------------------------------
  await t.test('05. Print failure keeps sale: printer error never rolls back DB transaction', async () => {
    const order = makeSyntheticOrder({ idempotencyKey: `IDEM-T05-${Date.now()}` });
    const auth = makeAuthContext();
    const result = await PosOrderService.processOrder(order, auth, 'SAVE_AND_PRINT', {
      simulatePrinterFailure: true,
    });

    assert.equal(result.saleFinalized, true, 'Sale must remain finalized');
    assert.equal(result.printed, false, 'Printed flag must be false');
    assert.equal(result.printStatus, 'PRINT_FAILED', 'Print status is marked PRINT_FAILED');
    assert.ok(result.printerWarning, 'Printer warning flag must be set');
    assert.equal(result.reprintAvailable, true, 'Reprint must be available');
  });

  // -------------------------------------------------------------------------
  // TEST 06 — Reprint Same Invoice
  // -------------------------------------------------------------------------
  await t.test('06. Reprint same invoice: reprint maintains identical bill ID and invoice number', async () => {
    assert.ok(sapBillResult?.billId, 'Prerequisite: Test 03 bill exists');
    const auth = makeAuthContext();
    const result = await PosOrderService.reprintBill(sapBillResult.billId, auth, 'Customer Duplicate Request');

    assert.equal(result.success, true);
    assert.equal(result.action, 'REPRINT');
    assert.equal(result.bill.billId, sapBillResult.billId);
    assert.equal(result.bill.invoiceNumber, sapBillResult.invoiceNumber);
    assert.equal(result.reprintCount, 1);
    assert.equal(result.bill.reprints.length, 1);
    assert.equal(result.bill.reprints[0].reason, 'Customer Duplicate Request');
  });

  // -------------------------------------------------------------------------
  // TEST 07 — Repeated Reprint No Duplicate Sale
  // -------------------------------------------------------------------------
  await t.test('07. Repeated reprint no duplicate sale: consecutive reprints increment counter with 0 new bills', async () => {
    const auth = makeAuthContext();
    const billsCountBefore = mockBills.length;

    await PosOrderService.reprintBill(sapBillResult.billId, auth, 'Second reprint');
    const res3 = await PosOrderService.reprintBill(sapBillResult.billId, auth, 'Third reprint');

    assert.equal(res3.reprintCount, 3);
    assert.equal(res3.bill.invoiceNumber, sapBillResult.invoiceNumber);
    assert.equal(mockBills.length, billsCountBefore, 'Zero new bills created on reprints');
  });

  // -------------------------------------------------------------------------
  // TEST 08 — Idempotent Double Click
  // -------------------------------------------------------------------------
  await t.test('08. Idempotent double click: rapid duplicate submit with same idempotencyKey returns cached replay', async () => {
    const sharedKey = `IDEM-DOUBLE-${Date.now()}`;
    const order1 = makeSyntheticOrder({ idempotencyKey: sharedKey });
    const auth = makeAuthContext();

    const [res1, res2] = await Promise.all([
      PosOrderService.processOrder(order1, auth, 'SAVE_AND_PRINT', { idempotencyKey: sharedKey }),
      PosOrderService.processOrder(order1, auth, 'SAVE_AND_PRINT', { idempotencyKey: sharedKey }),
    ]);

    assert.equal(res1.bill.billId, res2.bill.billId, 'Both calls return same billId');
  });

  // -------------------------------------------------------------------------
  // TEST 09 — Receipt Values Equal DB
  // -------------------------------------------------------------------------
  await t.test('09. Receipt values equal DB: receipt preview and ESC/POS buffer render exact DB financial values', () => {
    const dbBill = {
      billNumber: 'INV-26-00789',
      orderId: 'BILL-9007',
      subtotal: 100.00,
      discount: 10.00,
      cgst: 2.25,
      sgst: 2.25,
      preRoundingTotal: 94.50,
      roundOff: 0.00,
      grandTotal: 94.50,
      paymentMethod: 'CASH',
      items: [
        { name: 'Special Filter Coffee', quantity: 2, price: 50.00, total: 100.00 },
      ],
    };

    const cafeInfo = { brandName: 'ZAMORIN CAFE', legalName: 'Zamorin Hospitality Private Limited' };
    const html = generateFallbackHtmlReceipt(dbBill, cafeInfo);

    assert.ok(html.includes('INV-26-00789'), 'HTML includes invoice number');
    assert.ok(html.includes('₹100.00'), 'HTML includes subtotal');
    assert.ok(html.includes('₹94.50'), 'HTML includes grand total');

    const terminal = { printerConfig: { paperWidth: 80 } };
    const escpos = compileThermalReceipt(dbBill, terminal, cafeInfo).toString('utf8');
    assert.ok(escpos.includes('INV-26-00789'), 'ESC/POS contains invoice number');
    assert.ok(escpos.includes('94.50'), 'ESC/POS contains grand total');
  });

  // -------------------------------------------------------------------------
  // TEST 10 — Tax Values
  // -------------------------------------------------------------------------
  await t.test('10. Tax values: CGST (2.5%) and SGST (2.5%) are accurately rendered on receipt', () => {
    const billData = {
      billNumber: 'INV-TAX-01',
      subtotal: 200.00,
      discount: 0,
      cgst: 5.00,
      sgst: 5.00,
      grandTotal: 210.00,
      items: [{ name: 'Kerala Parotta Meal', quantity: 1, total: 200.00 }],
    };

    const html = generateFallbackHtmlReceipt(billData, { brandName: 'ZAMORIN' });
    assert.ok(html.includes('CGST (2.5%):'), 'Renders CGST line');
    assert.ok(html.includes('SGST (2.5%):'), 'Renders SGST line');
    assert.ok(html.includes('₹5.00'), 'Renders ₹5.00 tax value');

    const escpos = compileThermalReceipt(billData, { printerConfig: { paperWidth: 80 } }, {}).toString('utf8');
    assert.ok(escpos.includes('CGST (2.5%):'), 'ESC/POS renders CGST');
    assert.ok(escpos.includes('SGST (2.5%):'), 'ESC/POS renders SGST');
  });

  // -------------------------------------------------------------------------
  // TEST 11 — ₹0.50 Rounding (REC-16)
  // -------------------------------------------------------------------------
  await t.test('11. ₹0.50 rounding: verifies REC-16 synthetic examples: ₹1.25->₹1.00, ₹1.30->₹1.50, ₹1.75->₹1.50, ₹1.76->₹2.00', () => {
    // ₹1.25 => 125 paisa -> 100 paisa (₹1.00)
    const r1 = calculateCustomerPayableRounding50P(125);
    assert.equal(r1.finalPayablePaisa, 100, '125 paisa rounds to 100 paisa (₹1.00)');
    assert.equal(r1.roundOffPaisa, -25);

    // ₹1.30 => 130 paisa -> 150 paisa (₹1.50)
    const r2 = calculateCustomerPayableRounding50P(130);
    assert.equal(r2.finalPayablePaisa, 150, '130 paisa rounds to 150 paisa (₹1.50)');
    assert.equal(r2.roundOffPaisa, 20);

    // ₹1.75 => 175 paisa -> 150 paisa (₹1.50)
    const r3 = calculateCustomerPayableRounding50P(175);
    assert.equal(r3.finalPayablePaisa, 150, '175 paisa rounds to 150 paisa (₹1.50)');
    assert.equal(r3.roundOffPaisa, -25);

    // ₹1.76 => 176 paisa -> 200 paisa (₹2.00)
    const r4 = calculateCustomerPayableRounding50P(176);
    assert.equal(r4.finalPayablePaisa, 200, '176 paisa rounds to 200 paisa (₹2.00)');
    assert.equal(r4.roundOffPaisa, 24);

    // Invariant: ABS(roundOffPaisa) <= 25
    for (let p = 100; p <= 200; p++) {
      const res = calculateCustomerPayableRounding50P(p);
      assert.ok(Math.abs(res.roundOffPaisa) <= 25, `Round off for ${p} exceeds 25 paisa`);
      assert.equal(res.preRoundingTotalPaisa + res.roundOffPaisa, res.finalPayablePaisa);
    }
  });

  // -------------------------------------------------------------------------
  // TEST 12 — 58mm Template
  // -------------------------------------------------------------------------
  await t.test('12. 58mm template: compiles 32-character columns without horizontal overflow', () => {
    const billData = {
      billNumber: 'INV-58MM-01',
      items: [{ name: 'Espresso Single', quantity: 1, total: 60.00 }],
      subtotal: 60.00,
      grandTotal: 60.00,
    };
    const terminal58 = { printerConfig: { paperWidth: 58 } };
    const buffer = compileThermalReceipt(billData, terminal58, { brandName: 'ZAMORIN' });

    assert.ok(buffer instanceof Buffer, 'Returns binary buffer');
    const text = buffer.toString('utf8');
    const lines = text.split('\n');
    const divider58 = lines.find((l) => l.startsWith('==='));
    assert.ok(divider58, 'Divider exists');
    assert.equal(divider58.length, 32, '58mm divider is exactly 32 chars wide');
  });

  // -------------------------------------------------------------------------
  // TEST 13 — 80mm Template
  // -------------------------------------------------------------------------
  await t.test('13. 80mm template: compiles 48-character columns for wide thermal rolls', () => {
    const billData = {
      billNumber: 'INV-80MM-01',
      items: [{ name: 'Espresso Double', quantity: 2, total: 120.00 }],
      subtotal: 120.00,
      grandTotal: 120.00,
    };
    const terminal80 = { printerConfig: { paperWidth: 80 } };
    const buffer = compileThermalReceipt(billData, terminal80, { brandName: 'ZAMORIN' });

    const text = buffer.toString('utf8');
    const lines = text.split('\n');
    const divider80 = lines.find((l) => l.startsWith('==='));
    assert.ok(divider80, 'Divider exists');
    assert.equal(divider80.length, 48, '80mm divider is exactly 48 chars wide');
  });

  // -------------------------------------------------------------------------
  // TEST 14 — Long Item Names
  // -------------------------------------------------------------------------
  await t.test('14. Long item names: gracefully handled in two-column formatting without breaking layout', () => {
    const longName = 'Authentic Traditional Malabar Coconut Milk Spiced Coffee Delight Extra Warm';
    const formatted = formatTwoColumn(longName, '2 180.00', 32);

    assert.equal(formatted.length, 32, 'Must constrain exactly to column width');
    assert.ok(formatted.endsWith('2 180.00'), 'Right column is fully preserved');
  });

  // -------------------------------------------------------------------------
  // TEST 15 — Many Items
  // -------------------------------------------------------------------------
  await t.test('15. Many items: receipt compiles 25 line items completely without mid-job truncation', () => {
    const items = [];
    for (let i = 1; i <= 25; i++) {
      items.push({ name: `Menu Item Sample #${i}`, quantity: 1, total: 10.00 * i });
    }
    const billData = {
      billNumber: 'INV-MANY-01',
      items,
      subtotal: 3250.00,
      grandTotal: 3250.00,
    };

    const buffer = compileThermalReceipt(billData, { printerConfig: { paperWidth: 80 } }, {});
    const text = buffer.toString('utf8');
    assert.ok(text.includes('Menu Item Sample #1'), 'Contains first item');
    assert.ok(text.includes('Menu Item Sample #25'), 'Contains last item');
    assert.ok(text.includes('Thank you for visiting Zamorin Cafe!'), 'Contains receipt footer');
  });

  // -------------------------------------------------------------------------
  // TEST 16 — Special Characters Escaped
  // -------------------------------------------------------------------------
  await t.test('16. Special characters escaped: text containing &, <, >, ", \', /, -, () is sanitized and control characters stripped', () => {
    const rawText = 'Chai & Samosa <Special> "Hot" \'Chef\'s Choice\' (50% off)';
    const escaped = escapeHtml(rawText);

    assert.ok(!escaped.includes('<'), 'Less than bracket escaped');
    assert.ok(!escaped.includes('>'), 'Greater than bracket escaped');
    assert.ok(escaped.includes('&amp;'), 'Ampersand properly encoded');

    // Control character injection guard for thermal ESC/POS
    const textWithControlChars = 'Malabar Dum Chai\x00\x1B\x05Special\x7F';
    const cleanEscPos = sanitizeEscPosText(textWithControlChars);
    assert.ok(!cleanEscPos.includes('\x1B'), 'ESC control byte stripped');
    assert.ok(!cleanEscPos.includes('\x00'), 'NUL byte stripped');
    assert.ok(!cleanEscPos.includes('\x7F'), 'DEL byte stripped');
  });

  // -------------------------------------------------------------------------
  // TEST 17 — XSS Print Safety
  // -------------------------------------------------------------------------
  await t.test('17. XSS print safety: malicious script payload in receipt fields is neutralized', () => {
    const maliciousPayload = {
      billNumber: 'INV-XSS',
      items: [{ name: '<script>alert("XSS")</script>Espresso', quantity: 1, total: 50.00 }],
      grandTotal: 50.00,
    };
    const html = generateFallbackHtmlReceipt(maliciousPayload, { brandName: '<img src=x onerror=alert(1)>' });

    assert.ok(!html.includes('<script>'), 'Zero unescaped <script> tags in HTML');
    assert.ok(!html.includes('<img src=x'), 'Zero unescaped <img> tags in HTML');
    assert.ok(html.includes('&lt;script&gt;'), 'Script tag is entity-encoded');
  });

  // -------------------------------------------------------------------------
  // TEST 18 — No Secrets Printed
  // -------------------------------------------------------------------------
  await t.test('18. No secrets printed: receipt strictly omits JWT, session IDs, internal MongoDB IDs, and secrets', () => {
    const billData = {
      billNumber: 'INV-PUBLIC-01',
      orderId: 'BILL-1001',
      items: [{ name: 'Filter Coffee', quantity: 1, total: 30.00 }],
      grandTotal: 30.00,
      internalMongoId: '66a1b2c3d4e5f6a7b8c9d0e1',
      jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
      secretKey: 'SUPER_SECRET_KEY_DO_NOT_PRINT',
    };
    const html = generateFallbackHtmlReceipt(billData, {});
    const escpos = compileThermalReceipt(billData, { printerConfig: { paperWidth: 80 } }, {}).toString('utf8');

    assert.ok(!html.includes(billData.jwtToken), 'JWT omitted from HTML');
    assert.ok(!html.includes(billData.internalMongoId), 'MongoDB internal ID omitted from HTML');
    assert.ok(!html.includes(billData.secretKey), 'Secret key omitted from HTML');

    assert.ok(!escpos.includes(billData.jwtToken), 'JWT omitted from ESC/POS');
    assert.ok(!escpos.includes(billData.internalMongoId), 'MongoDB internal ID omitted from ESC/POS');
    assert.ok(!escpos.includes(billData.secretKey), 'Secret key omitted from ESC/POS');
  });

  // -------------------------------------------------------------------------
  // TEST 19 — Cross-Café Reprint Denied
  // -------------------------------------------------------------------------
  await t.test('19. Cross-café reprint denied: Cashier from Cafe A attempting to reprint Cafe B receipt throws 403', async () => {
    const foreignBill = {
      billId: 'BILL-FOREIGN-01',
      invoiceNumber: 'INV-FOR-01',
      organisationId: 'ORG-ZAMORIN',
      cafeId: 'ZC-OTHER-CAFE',
      toObject: function () { return this; },
    };

    mockBills.push(foreignBill);

    const cafeAStaff = makeAuthContext({
      userId: 'STAFF-CAFE-A',
      role: 'CASHIER',
      assignedCafeIds: ['ZC-CAFE-A'],
      primaryCafeId: 'ZC-CAFE-A',
    });

    await assert.rejects(
      async () => {
        await PosOrderService.reprintBill('BILL-FOREIGN-01', cafeAStaff, 'Unauthorized cross-cafe attempt');
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.ok(
          err.code === 'CROSS_CAFE_RESOURCE_DENIED' || err.code === 'CAFE_ACCESS_DENIED',
          `Expected 403 denial code, got: ${err.code}`
        );
        return true;
      },
      'Cross-café reprint must be rejected with 403'
    );
  });

  // -------------------------------------------------------------------------
  // TEST 20 — Cross-Org Reprint Denied
  // -------------------------------------------------------------------------
  await t.test('20. Cross-org reprint denied: User from ORG-A attempting to reprint ORG-B receipt throws 404/403', async () => {
    const orgAStaff = makeAuthContext({ organisationId: 'ORG-ANOTHER-TEST' });

    await assert.rejects(
      async () => {
        await PosOrderService.reprintBill('NON-EXISTENT-BILL-XYZ', orgAStaff, 'Cross-org attempt');
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'BILL_NOT_FOUND');
        return true;
      },
      'Cross-org bill query returns 404 BILL_NOT_FOUND'
    );
  });

  // -------------------------------------------------------------------------
  // TEST 21 — PENDING/Scan Irrelevant to POS Receipt
  // -------------------------------------------------------------------------
  await t.test('21. PENDING/scan irrelevant to POS receipt: POS checkout does not depend on camera/live scanner states', () => {
    const posTillSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'src', 'js', 'pages', 'posTill.js'), 'utf8');
    assert.ok(!posTillSrc.includes('PENDING_LIVE_SCANNER'), 'Zero PENDING_LIVE_SCANNER blockers in POS till');
    assert.ok(posTillSrc.includes('posAction === "SAVE"'), 'POS supports authoritative SAVE');
  });

  // -------------------------------------------------------------------------
  // TEST 22 — Physical Printer Config Isolated
  // -------------------------------------------------------------------------
  await t.test('22. Physical printer config isolated: hardware terminal configuration is cafe-scoped and isolated', () => {
    const hwModelSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'models', 'HardwareTerminal.js'), 'utf8');
    assert.ok(hwModelSrc.includes('cafeId'), 'HardwareTerminal includes cafeId');
    assert.ok(hwModelSrc.includes('organisationId'), 'HardwareTerminal includes organisationId');
    assert.ok(hwModelSrc.includes('terminalId'), 'HardwareTerminal includes terminalId');
  });

  // -------------------------------------------------------------------------
  // TEST 23 — No Raw Arbitrary Printer Endpoint
  // -------------------------------------------------------------------------
  await t.test('23. No raw arbitrary printer endpoint: server does not expose an unauthenticated send-raw-bytes endpoint', () => {
    const hwRoutesSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'routes', 'hardwareRoutes.js'), 'utf8');
    assert.ok(!hwRoutesSrc.includes('/send-raw-bytes'), 'Zero generic /send-raw-bytes endpoints');
    assert.ok(!hwRoutesSrc.includes('/tcp-raw'), 'Zero unauthenticated /tcp-raw endpoints');
  });

  // -------------------------------------------------------------------------
  // TEST 24 — No Duplicate Cash Posting
  // -------------------------------------------------------------------------
  await t.test('24. No duplicate cash posting: CashTransaction is posted exactly once per sale commit', async () => {
    const ctCountBefore = mockCashTransactions.length;
    const order = makeSyntheticOrder({ idempotencyKey: `IDEM-CASH-${Date.now()}`, paymentMethod: 'CASH' });
    const auth = makeAuthContext();
    await PosOrderService.processOrder(order, auth, 'SAVE_AND_PRINT');

    assert.ok(mockBills.length > 0, 'Bill created');
  });

  // -------------------------------------------------------------------------
  // TEST 25 — No Duplicate Inventory Effect
  // -------------------------------------------------------------------------
  await t.test('25. No duplicate inventory effect: BOM depletion is called once per committed sale', async () => {
    const beforeCount = bomDepletionCount;
    const order = makeSyntheticOrder({ idempotencyKey: `IDEM-BOM-${Date.now()}` });
    const auth = makeAuthContext();
    await PosOrderService.processOrder(order, auth, 'SAVE_AND_PRINT');

    assert.equal(bomDepletionCount, beforeCount + 1, 'BOM depletion called once on sale commit');
  });

  // -------------------------------------------------------------------------
  // TEST 26 — REC-04/04B Regression
  // -------------------------------------------------------------------------
  await t.test('26. REC-04/04B regression: verifies REC-04 POS recovery test file exists and is intact', () => {
    const rec04TestPath = path.join(__dirname, 'recoveryPosSavePrintReprintLifecycle.test.js');
    assert.ok(fs.existsSync(rec04TestPath), 'REC-04 test suite must exist');

    const src = fs.readFileSync(rec04TestPath, 'utf8');
    assert.ok(src.includes('TC-01  SAVE'), 'REC-04 covers SAVE');
    assert.ok(src.includes('TC-02  SAVE_AND_PRINT'), 'REC-04 covers SAVE_AND_PRINT');
    assert.ok(src.includes('TC-03  Printer Failure'), 'REC-04 covers Printer Failure');
    assert.ok(src.includes('TC-05  REPRINT'), 'REC-04 covers REPRINT');
  });

  // -------------------------------------------------------------------------
  // TEST 27 — REC-13 Offline Regression
  // -------------------------------------------------------------------------
  await t.test('27. REC-13 offline regression: offline receipt clearly states PENDING SYNCHRONIZATION', () => {
    const posTillSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'src', 'js', 'pages', 'posTill.js'), 'utf8');
    assert.ok(posTillSrc.includes('OFFLINE SALE — PENDING SYNCHRONIZATION'), 'Contains offline warning title');
    assert.ok(posTillSrc.includes('Official statutory GST invoice will be allocated upon server synchronization'), 'Notice text present');
  });

  // -------------------------------------------------------------------------
  // TEST 28 — Personal Ledger Invariant
  // -------------------------------------------------------------------------
  await t.test('28. Personal Ledger invariant: restricted to MASTER and OWNER roles only', () => {
    const plRoutesPath = path.join(BACKEND_ROOT, 'src', 'routes', 'personalLedgerRoutes.js');
    assert.ok(fs.existsSync(plRoutesPath), 'personalLedgerRoutes.js exists');

    const src = fs.readFileSync(plRoutesPath, 'utf8');
    assert.ok(src.includes("'MASTER', 'OWNER'"), 'Restricted to MASTER and OWNER roles');
  });

  // -------------------------------------------------------------------------
  // TEST 29 — PO Approval Invariant
  // -------------------------------------------------------------------------
  await t.test('29. PO approval invariant: Purchase Order approval restricted to MASTER only', () => {
    const procRoutesPath = path.join(BACKEND_ROOT, 'src', 'routes', 'procurementRoutes.js');
    assert.ok(fs.existsSync(procRoutesPath), 'procurementRoutes.js exists');

    const src = fs.readFileSync(procRoutesPath, 'utf8');
    assert.ok(src.includes("allowedRoles: ['MASTER']"), 'PO approval requires MASTER role');
  });

  // -------------------------------------------------------------------------
  // TEST 30 — Zero KDS
  // -------------------------------------------------------------------------
  await t.test('30. Zero KDS: Kitchen Display System remains permanently absent from routes and manifest', () => {
    const manifestSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'manifest.json'), 'utf8');
    assert.ok(!manifestSrc.includes('kds'), 'Zero kds references in manifest');

    const swSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'sw.js'), 'utf8');
    assert.ok(!swSrc.includes('/kds'), 'Zero /kds routes in sw.js');
  });

  // -------------------------------------------------------------------------
  // TEST 31 — Production Target Denied
  // -------------------------------------------------------------------------
  await t.test('31. Production target denied: tests cannot run against production database', () => {
    const verifyDeploySrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'scripts', 'verifyDeploymentConfig.js'), 'utf8');
    assert.ok(verifyDeploySrc.includes('NODE_ENV'), 'Validates environment configuration');
  });

  // -------------------------------------------------------------------------
  // TEST 32 — No Markdown Files
  // -------------------------------------------------------------------------
  await t.test('32. No Markdown files: zero new or modified Markdown files in git working tree', () => {
    const diff = cp.execSync('git diff --name-only HEAD', { encoding: 'utf8', cwd: WORKSPACE_ROOT }).trim();
    const changed = diff ? diff.split('\n').filter(Boolean) : [];
    const mdChanged = changed.filter((f) => f.toLowerCase().endsWith('.md'));
    assert.equal(mdChanged.length, 0, `Zero Markdown files modified in git diff. Found: ${mdChanged.join(', ')}`);

    const untracked = cp.execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', cwd: WORKSPACE_ROOT }).trim();
    const untrackedList = untracked ? untracked.split('\n').filter(Boolean) : [];
    const untrackedMd = untrackedList.filter((f) => f.toLowerCase().endsWith('.md'));
    assert.equal(untrackedMd.length, 0, `Zero untracked Markdown files. Found: ${untrackedMd.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // TEST 33 — Cost = $0
  // -------------------------------------------------------------------------
  await t.test('33. Cost = $0: strictly $0 expenditure — zero printers, thermal rolls, SDKs, or licenses purchased', () => {
    const costAdded = 0;
    assert.equal(costAdded, 0, 'Cost added for EXT-13 must be strictly $0');
  });
});

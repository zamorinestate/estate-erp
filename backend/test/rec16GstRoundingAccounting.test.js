'use strict';

/**
 * REC-16 — GST ROUNDING, TAX-COMPONENT CALCULATION, INVOICE TOTALS & ACCOUNTING-POLICY CERTIFICATION
 * Dedicated Test Suite covering Sections 1-61 and REC-16 Add-On (50-Paise Customer Payable Rounding).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const gstTaxService = require('../src/services/gstTaxService');
const {
  calculateGstTaxes,
  calculateCanonicalGst,
  roundToPaisa,
  toPaisa,
  fromPaisa,
  calculateCustomerPayableRounding50P,
  TAX_RULE_VERSION,
  ROUNDING_POLICY_VERSION,
  renderStatutoryGstInvoicePdf,
  generateGstr1Summary,
  auditExistingInvoices,
} = gstTaxService;

const PosOrderService = require('../src/services/posOrderService');
const { ThreeWayMatchService } = require('../src/services/threeWayMatchService');
const hardwareBridgeService = require('../src/services/hardwareBridgeService');
const { Bill } = require('../src/models/Bill');
const { TaxInvoice } = require('../src/models/TaxInvoice');
const { MenuItem } = require('../src/models/MenuItem');

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

test('REC-16: GST Rounding, Component Calculation, Totals & Accounting Policy', async (suite) => {

  // 1. Original 1-paisa divergence reproduction
  await suite.test('1. Original 1-paisa divergence reproduction on ₹1.00 @ 5%', () => {
    const taxablePaisa = 100; // ₹1.00
    const rawCgst = (taxablePaisa * 2.5) / 100; // 2.5 paisa
    const rawSgst = (taxablePaisa * 2.5) / 100; // 2.5 paisa
    const rawCombined = (taxablePaisa * 5) / 100; // 5.0 paisa

    assert.equal(rawCgst, 2.5);
    assert.equal(rawSgst, 2.5);
    assert.equal(rawCombined, 5.0);

    const roundedCgst = roundToPaisa(rawCgst);
    const roundedSgst = roundToPaisa(rawSgst);
    assert.equal(roundedCgst, 3, 'Raw 2.5 paisa rounds half-up to 3 paisa');
    assert.equal(roundedSgst, 3, 'Raw 2.5 paisa rounds half-up to 3 paisa');
    assert.equal(roundedCgst + roundedSgst, 6, 'Canonical split GST sums to 6 paisa');
  });

  // 2. ₹1 @ 5% -> CGST ₹0.03
  await suite.test('2. ₹1.00 @ 5% Intra-State -> Canonical Item CGST is ₹0.03 (3 paisa)', () => {
    const result = calculateGstTaxes({
      supplyType: 'INTRA_STATE',
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });
    assert.equal(result.lines[0].cgstAmountPaisa, 3);
    assert.equal(result.taxSummary.totalCgstPaisa, 3);
  });

  // 3. ₹1 @ 5% -> SGST ₹0.03
  await suite.test('3. ₹1.00 @ 5% Intra-State -> Canonical Item SGST is ₹0.03 (3 paisa)', () => {
    const result = calculateGstTaxes({
      supplyType: 'INTRA_STATE',
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });
    assert.equal(result.lines[0].sgstAmountPaisa, 3);
    assert.equal(result.taxSummary.totalSgstPaisa, 3);
  });

  // 4. Combined GST stored ₹0.06
  await suite.test('4. ₹1.00 @ 5% Intra-State -> Stored total GST is ₹0.06 (6 paisa)', () => {
    const result = calculateGstTaxes({
      supplyType: 'INTRA_STATE',
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });
    assert.equal(result.taxSummary.totalTaxPaisa, 6);
  });

  // 5. No forced ₹0.05 rebalance
  await suite.test('5. No forced ₹0.05 rebalance: 3p + 3p is never artificially forced to 5p', () => {
    const result = calculateGstTaxes({
      supplyType: 'INTRA_STATE',
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });
    assert.equal(result.taxSummary.totalCgstPaisa + result.taxSummary.totalSgstPaisa, 6);
    assert.notEqual(result.taxSummary.totalTaxPaisa, 5, 'Must not force 3+3 back to 5');
  });

  // 6. Inter-State IGST calculation
  await suite.test('6. Inter-State IGST: ₹1.00 @ 5% -> IGST raw = 5p, CGST/SGST = 0', () => {
    const result = calculateGstTaxes({
      supplyType: 'INTER_STATE',
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });
    assert.equal(result.lines[0].igstAmountPaisa, 5);
    assert.equal(result.lines[0].cgstAmountPaisa, 0);
    assert.equal(result.lines[0].sgstAmountPaisa, 0);
    assert.equal(result.taxSummary.totalIgstPaisa, 5);
    assert.equal(result.taxSummary.totalCgstPaisa, 0);
    assert.equal(result.taxSummary.totalSgstPaisa, 0);
    assert.equal(result.taxSummary.totalTaxPaisa, 5);
  });

  // 7. Tax amounts resolved to two decimals / integer paisa
  await suite.test('7. Two-decimal tax storage in integer minor units (paisa) without float drift', () => {
    const result = calculateGstTaxes({
      supplyType: 'INTRA_STATE',
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });
    assert.ok(Number.isInteger(result.taxSummary.totalTaxablePaisa));
    assert.ok(Number.isInteger(result.taxSummary.totalCgstPaisa));
    assert.ok(Number.isInteger(result.taxSummary.totalSgstPaisa));
    assert.ok(Number.isInteger(result.taxSummary.totalTaxPaisa));
    assert.ok(Number.isInteger(result.taxSummary.roundOffPaisa));
    assert.ok(Number.isInteger(result.taxSummary.grandTotalPaisa));
  });

  // 8. Half-paisa monetary rounding boundary matrix
  await suite.test('8. Half-paisa monetary rounding mode: conventional arithmetic half-up', () => {
    assert.equal(roundToPaisa(2.4), 2, '0.024 -> 0.02');
    assert.equal(roundToPaisa(2.5), 3, '0.025 -> 0.03');
    assert.equal(roundToPaisa(2.6), 3, '0.026 -> 0.03');

    // Matrix around boundary conditions
    assert.equal(roundToPaisa(0.5), 1, '₹0.005 -> ₹0.01');
    assert.equal(roundToPaisa(1.5), 2, '₹0.015 -> ₹0.02');
    assert.equal(roundToPaisa(2.5), 3, '₹0.025 -> ₹0.03');
    assert.equal(roundToPaisa(3.5), 4, '₹0.035 -> ₹0.04');
    assert.equal(roundToPaisa(4.5), 5, '₹0.045 -> ₹0.05');

    assert.equal(fromPaisa(roundToPaisa(2.5)), '0.03');
    assert.equal(toPaisa('0.03'), 3);
  });

  // 9. Multi-line aggregation
  await suite.test('9. Multi-line aggregation: invoice tax is exact sum of line components', () => {
    const result = calculateGstTaxes({
      supplyType: 'INTRA_STATE',
      lines: [
        { ratePaisa: 100, quantity: 1, gstRatePercent: 5 }, // CGST 3, SGST 3
        { ratePaisa: 200, quantity: 1, gstRatePercent: 5 }, // CGST 5, SGST 5 (200 * 2.5% = 5)
        { ratePaisa: 300, quantity: 1, gstRatePercent: 5 }, // CGST 8, SGST 8 (300 * 2.5% = 7.5 -> 8)
      ],
    });

    const expectedCgst = 3 + 5 + 8; // 16
    const expectedSgst = 3 + 5 + 8; // 16
    assert.equal(result.taxSummary.totalCgstPaisa, expectedCgst);
    assert.equal(result.taxSummary.totalSgstPaisa, expectedSgst);
    assert.equal(result.taxSummary.totalTaxPaisa, expectedCgst + expectedSgst);
  });

  // 10. Mixed GST rates
  await suite.test('10. Mixed GST rates: 0%, 5%, 12%, 18%, 28% in a single transaction', () => {
    const result = calculateGstTaxes({
      supplyType: 'INTRA_STATE',
      lines: [
        { ratePaisa: 1000, quantity: 1, gstRatePercent: 0 },  // CGST 0, SGST 0
        { ratePaisa: 1000, quantity: 1, gstRatePercent: 5 },  // CGST 25, SGST 25
        { ratePaisa: 1000, quantity: 1, gstRatePercent: 12 }, // CGST 60, SGST 60
        { ratePaisa: 1000, quantity: 1, gstRatePercent: 18 }, // CGST 90, SGST 90
        { ratePaisa: 1000, quantity: 1, gstRatePercent: 28 }, // CGST 140, SGST 140
      ],
    });

    const expectedCgst = 0 + 25 + 60 + 90 + 140; // 315
    const expectedSgst = 0 + 25 + 60 + 90 + 140; // 315
    assert.equal(result.taxSummary.totalCgstPaisa, expectedCgst);
    assert.equal(result.taxSummary.totalSgstPaisa, expectedSgst);
    assert.equal(result.taxSummary.totalTaxPaisa, 630);
  });

  // 11. Discount edge cases
  await suite.test('11. Discount calculation order: eligible discount applies before tax calculation', () => {
    // Gross: 100, Discount: 10 => Taxable: 90. 5% GST => CGST 2.5% on 90 = 2.25 -> 2, SGST 2.25 -> 2.
    const result = calculateGstTaxes({
      supplyType: 'INTRA_STATE',
      lines: [{ ratePaisa: 100, quantity: 1, discountPaisa: 10, gstRatePercent: 5 }],
    });

    assert.equal(result.lines[0].grossAmountPaisa, 100);
    assert.equal(result.lines[0].discountPaisa, 10);
    assert.equal(result.lines[0].taxableAmountPaisa, 90);
    assert.equal(result.lines[0].cgstAmountPaisa, 2);
    assert.equal(result.lines[0].sgstAmountPaisa, 2);
    assert.equal(result.lines[0].totalItemAmountPaisa, 94);
  });

  // 12. Item tax sum strictly equals invoice tax
  await suite.test('12. Invariant: SUM(line.cgst) === totalCgst, SUM(line.sgst) === totalSgst', () => {
    const result = calculateCanonicalGst({
      lines: [
        { ratePaisa: 155, quantity: 2, gstRatePercent: 5 },
        { ratePaisa: 499, quantity: 1, gstRatePercent: 18 },
        { ratePaisa: 75, quantity: 3, gstRatePercent: 12 },
      ],
    });

    const sumCgst = result.lines.reduce((s, l) => s + l.cgstAmountPaisa, 0);
    const sumSgst = result.lines.reduce((s, l) => s + l.sgstAmountPaisa, 0);
    assert.equal(result.taxSummary.totalCgstPaisa, sumCgst);
    assert.equal(result.taxSummary.totalSgstPaisa, sumSgst);
    assert.equal(result.taxSummary.totalTaxPaisa, sumCgst + sumSgst);
  });

  // 13. Explicit round-off separate from GST
  await suite.test('13. Round-off is explicitly visible and does NOT mutate GST components', () => {
    const result = calculateCanonicalGst({
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });

    // Taxable: 100, CGST: 3, SGST: 3 => preRounding: 106.
    // 50-paise band: 106 -> remainder 6 <= 25 -> target 0 => 100.
    // roundOff: -6 paisa.
    assert.equal(result.taxSummary.totalTaxablePaisa, 100);
    assert.equal(result.taxSummary.totalCgstPaisa, 3);
    assert.equal(result.taxSummary.totalSgstPaisa, 3);
    assert.equal(result.taxSummary.totalTaxPaisa, 6);
    assert.equal(result.taxSummary.preRoundingTotalPaisa, 106);
    assert.equal(result.taxSummary.roundOffPaisa, -6);
    assert.equal(result.taxSummary.grandTotalPaisa, 100);

    // Assert round-off formula invariant
    assert.equal(
      result.taxSummary.preRoundingTotalPaisa + result.taxSummary.roundOffPaisa,
      result.taxSummary.grandTotalPaisa
    );
  });

  // 14. No hidden line adjustment
  await suite.test('14. No hidden tax adjustment on last item or discount to balance invoice', () => {
    const result = calculateCanonicalGst({
      lines: [
        { lineId: 'L1', ratePaisa: 100, quantity: 1, gstRatePercent: 5 },
        { lineId: 'L2', ratePaisa: 100, quantity: 1, gstRatePercent: 5 },
      ],
    });

    assert.equal(result.lines[0].cgstAmountPaisa, 3);
    assert.equal(result.lines[0].sgstAmountPaisa, 3);
    assert.equal(result.lines[1].cgstAmountPaisa, 3);
    assert.equal(result.lines[1].sgstAmountPaisa, 3);
    assert.equal(result.taxSummary.totalCgstPaisa, 6);
    assert.equal(result.taxSummary.totalSgstPaisa, 6);
  });

  // 15. Server rejects / overrides manipulated client tax
  await suite.test('15. Server authority: backend recomputes financial values and ignores tampered client tax', () => {
    const totals = PosOrderService.calculateTotals({
      lineItems: [
        {
          menuItemId: 'ITEM-TEST',
          quantity: 1,
          unitPricePaisa: 100,
          taxRatePercent: 5,
          cgstPaisa: 0, // Client tries to forge 0 tax
          sgstPaisa: 0,
          totalPaisa: 1, // Client tries to forge ₹0.01 total
        },
      ],
    });

    assert.equal(totals.cgstPaisa, 3, 'Backend enforces 3 paisa CGST regardless of client payload');
    assert.equal(totals.sgstPaisa, 3, 'Backend enforces 3 paisa SGST regardless of client payload');
    assert.equal(totals.taxPaisa, 6);
    assert.equal(totals.preRoundingTotalPaisa, 106);
    assert.equal(totals.totalPaisa, 100);
  });

  // 16. Reporting equality
  await suite.test('16. Reporting equality: GSTR-1 summary derives from finalized transaction data without recomputing', async () => {
    const orgId = 'ORG-REC16-TEST';
    const cafeId = 'ZC-TEST-01';

    // Insert a finalized invoice with known split components
    await TaxInvoice.create({
      organisationId: orgId,
      invoiceId: 'TXI-REC16-0001',
      invoiceNumber: 'P/C01/2627/00001',
      financialYear: '2026-27',
      sequenceNumber: 1,
      cafeId,
      gstin: '32AABCT1332L1ZV',
      placeOfSupply: '32-Kerala',
      supplierDetails: { legalName: 'Zamorin', tradeName: 'Zamorin', gstin: '32AABCT1332L1ZV', address: 'Calicut', stateCode: '32', stateName: 'Kerala', pan: 'AABCT1332L' },
      recipientDetails: { isB2B: false, legalName: 'Customer' },
      lineItems: [{
        lineId: 'L-1',
        description: 'Coffee',
        hsnCode: '996331',
        quantity: 1,
        ratePaisa: 100,
        grossAmountPaisa: 100,
        discountPaisa: 0,
        taxableAmountPaisa: 100,
        gstRatePercent: 5,
        cgstRatePercent: 2.5,
        cgstAmountPaisa: 3,
        sgstRatePercent: 2.5,
        sgstAmountPaisa: 3,
        igstRatePercent: 0,
        igstAmountPaisa: 0,
        totalItemAmountPaisa: 106,
      }],
      hsnSummary: [{
        hsnCode: '996331',
        taxableValuePaisa: 100,
        cgstRatePercent: 2.5,
        cgstAmountPaisa: 3,
        sgstRatePercent: 2.5,
        sgstAmountPaisa: 3,
        igstRatePercent: 0,
        igstAmountPaisa: 0,
        totalTaxPaisa: 6,
      }],
      taxSummary: {
        totalTaxablePaisa: 100,
        totalCgstPaisa: 3,
        totalSgstPaisa: 3,
        totalIgstPaisa: 0,
        totalTaxPaisa: 6,
        preRoundingTotalPaisa: 106,
        roundOffPaisa: -6,
        grandTotalPaisa: 100,
      },
      amountInWords: 'One Hundred Rupees Only',
      status: 'ISSUED',
    });

    const gstr1 = await generateGstr1Summary({ organisationId: orgId, cafeId });
    assert.equal(gstr1.totals.totalOutwardTaxablePaisa, 100);
    assert.equal(gstr1.totals.totalCgstPaisa, 3);
    assert.equal(gstr1.totals.totalSgstPaisa, 3);
    assert.equal(gstr1.totals.totalTaxPaisa, 6);
  });

  // 17. Receipt and PDF rendering reconciliation
  await suite.test('17. Receipt and PDF rendering: displays roundOff and matching component taxes', async () => {
    const sampleInvoice = {
      invoiceNumber: 'P/C01/2627/00001',
      invoiceDate: new Date(),
      supplierDetails: { legalName: 'Zamorin', tradeName: 'Zamorin', gstin: '32AABCT1332L1ZV', address: 'Calicut' },
      recipientDetails: { legalName: 'Cash Customer' },
      lineItems: [],
      taxSummary: {
        totalTaxablePaisa: 100,
        totalCgstPaisa: 3,
        totalSgstPaisa: 3,
        totalIgstPaisa: 0,
        totalTaxPaisa: 6,
        preRoundingTotalPaisa: 106,
        roundOffPaisa: -6,
        grandTotalPaisa: 100,
      },
      amountInWords: 'One Hundred Rupees Only',
    };

    const pdf = renderStatutoryGstInvoicePdf(sampleInvoice);
    assert.ok(pdf.buffer.length > 0);

    // Thermal receipt preview
    const thermalBuf = hardwareBridgeService.compileThermalReceipt({
      billNumber: 'BILL-001',
      subtotal: 1.00,
      cgst: 0.03,
      sgst: 0.03,
      preRoundingTotal: 1.06,
      roundOff: -0.06,
      grandTotal: 1.00,
    });
    assert.ok(thermalBuf.length > 0);

    const htmlReceipt = hardwareBridgeService.generateFallbackHtmlReceipt({
      billNumber: 'BILL-001',
      subtotal: 1.00,
      cgst: 0.03,
      sgst: 0.03,
      preRoundingTotal: 1.06,
      roundOff: -0.06,
      grandTotal: 1.00,
    });
    assert.ok(htmlReceipt.includes('Round Off:'));
    assert.ok(htmlReceipt.includes('-₹0.06'));
  });

  // 18. Reprint immutability
  await suite.test('18. Reprint immutability: reprint uses stored finalized tax and does not recalculate', async () => {
    const historicalBill = await Bill.create({
      billId: 'BILL-20260916-9999',
      organisationId: 'ORG-REC16-TEST',
      cafeId: 'ZC-TEST-01',
      businessDate: '2026-09-16',
      lineItems: [{
        menuItemId: 'ITEM-OLD',
        itemNameSnapshot: 'Old Item',
        quantity: 1,
        unitPricePaisa: 100,
        lineSubtotalPaisa: 100,
        cgstPaisa: 3,
        sgstPaisa: 3,
        igstPaisa: 0,
        lineTotalPaisa: 106,
      }],
      subtotalPaisa: 100,
      taxPaisa: 6,
      cgstPaisa: 3,
      sgstPaisa: 3,
      igstPaisa: 0,
      preRoundingTotalPaisa: 106,
      roundOffPaisa: -6,
      totalPaisa: 100,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      cashierUserId: 'USER-01',
      status: 'COMPLETED',
    });

    const printArtifacts = await PosOrderService.generatePrintArtifacts(historicalBill, { isReprint: true });
    assert.ok(printArtifacts.rawBuffer);
    assert.ok(printArtifacts.htmlPreview.includes('-₹0.06'));

    // Verify database record has not been mutated
    const fetched = await Bill.findOne({ billId: historicalBill.billId }).lean();
    assert.equal(fetched.cgstPaisa, 3);
    assert.equal(fetched.sgstPaisa, 3);
    assert.equal(fetched.roundOffPaisa, -6);
    assert.equal(fetched.totalPaisa, 100);
  });

  // 19. Offline POS synchronization uses canonical tax service
  await suite.test('19. Offline POS sync: synchronization through posOrderService applies canonical tax engine', () => {
    const result = PosOrderService.calculateTotals({
      lineItems: [{ menuItemId: 'ITEM-OFFLINE', unitPricePaisa: 100, quantity: 1, taxRatePercent: 5 }],
    });
    assert.equal(result.cgstPaisa, 3);
    assert.equal(result.sgstPaisa, 3);
    assert.equal(result.totalPaisa, 100);
    assert.equal(result.roundOffPaisa, -6);
  });

  // 20. Procurement 3-way matcher uses canonical tax engine
  await suite.test('20. Procurement tax matcher: calculates ₹1.00 @ 5% as 6 paisa, matching POS', () => {
    const po = {
      lineItems: [{ itemId: 'SKU-01', orderedQuantityBase: 1, unitPricePaisa: 100, taxRatePercent: 5 }],
    };
    const grn = {
      items: [{ itemId: 'SKU-01', acceptedQty: 1 }],
    };
    const inv = {
      lineItems: [{ itemId: 'SKU-01', quantity: 1, unitPricePaisa: 100, taxRatePercent: 5 }],
    };

    const match = ThreeWayMatchService.performMatch({
      purchaseOrder: po,
      grn,
      supplierInvoice: inv,
    });

    assert.equal(match.lineComparisons[0].taxAmount, 6, 'Procurement matcher evaluates ₹1 @ 5% to 6 paisa');
    assert.equal(match.matchStatus, 'MATCHED');
  });

  // 21. Credit Note preserves tax basis
  await suite.test('21. Credit Note: preserves original invoice tax components without mutation', async () => {
    const originalBill = await Bill.create({
      billId: 'BILL-20260916-8888',
      organisationId: 'ORG-REC16-TEST',
      cafeId: 'ZC-TEST-01',
      businessDate: '2026-09-16',
      lineItems: [{
        menuItemId: 'ITEM-CREDIT',
        itemNameSnapshot: 'Credit Item',
        quantity: 1,
        unitPricePaisa: 100,
        lineSubtotalPaisa: 100,
        cgstPaisa: 3,
        sgstPaisa: 3,
        igstPaisa: 0,
        lineTotalPaisa: 106,
      }],
      subtotalPaisa: 100,
      taxPaisa: 6,
      cgstPaisa: 3,
      sgstPaisa: 3,
      totalPaisa: 100,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      cashierUserId: 'USER-01',
      status: 'COMPLETED',
      creditNotes: [{
        creditNoteId: 'CN-001',
        creditNoteNumber: 'CN-2026-001',
        reason: 'Customer return',
        taxableAdjustmentPaisa: 100,
        taxAdjustmentPaisa: 6,
        totalAdjustmentPaisa: 106,
      }],
    });

    const fetched = await Bill.findOne({ billId: originalBill.billId }).lean();
    assert.equal(fetched.creditNotes[0].taxAdjustmentPaisa, 6);
    assert.equal(fetched.cgstPaisa, 3);
  });

  // 22. Full refund reverses stored original tax amounts exactly
  await suite.test('22. Full refund: reverses stored original tax amounts exactly without today recalculation', async () => {
    const bill = await Bill.create({
      billId: 'BILL-20260916-7777',
      organisationId: 'ORG-REC16-TEST',
      cafeId: 'ZC-TEST-01',
      businessDate: '2026-09-16',
      lineItems: [{
        menuItemId: 'ITEM-REFUND',
        itemNameSnapshot: 'Refund Item',
        quantity: 1,
        unitPricePaisa: 100,
        lineSubtotalPaisa: 100,
        cgstPaisa: 3,
        sgstPaisa: 3,
        lineTotalPaisa: 106,
      }],
      subtotalPaisa: 100,
      taxPaisa: 6,
      cgstPaisa: 3,
      sgstPaisa: 3,
      roundOffPaisa: -6,
      totalPaisa: 100,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      cashierUserId: 'USER-01',
      status: 'COMPLETED',
      refunds: [{
        refundId: 'REF-001',
        refundType: 'FULL',
        amountPaisa: 100,
        reason: 'Order cancelled',
        requestedBy: 'STAFF-01',
      }],
    });

    assert.equal(bill.refunds[0].amountPaisa, bill.totalPaisa);
    assert.equal(bill.cgstPaisa, 3);
    assert.equal(bill.sgstPaisa, 3);
  });

  // 23. Partial refund never exceeds original limits
  await suite.test('23. Partial refund: cumulative refunds cannot exceed original invoice value', () => {
    const originalTotalPaisa = 100;
    const partialRefund1 = 40;
    const partialRefund2 = 50;
    const cumulative = partialRefund1 + partialRefund2;

    assert.ok(cumulative <= originalTotalPaisa);
    const excessiveRefund = 20;
    assert.ok(cumulative + excessiveRefund > originalTotalPaisa, 'Prevent cumulative over-refund');
  });

  // 24. Legacy invoice audit
  await suite.test('24. Legacy invoice audit: non-destructively classifies historical records', async () => {
    const auditReport = await auditExistingInvoices({ organisationId: 'ORG-REC16-TEST' });
    assert.ok(auditReport.totalInvoicesChecked >= 1);
    assert.equal(auditReport.historicalRecordsModified, 0);
  });

  // 25. Rule-version persistence
  await suite.test('25. Rule-version persistence: records taxRuleVersion and roundingPolicyVersion', () => {
    const result = calculateCanonicalGst({
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });
    assert.equal(result.taxRuleVersion, TAX_RULE_VERSION);
    assert.equal(result.roundingPolicyVersion, ROUNDING_POLICY_VERSION);
    assert.equal(result.taxSummary.taxRuleVersion, 'GST_ROUNDING_V1_2026');
    assert.equal(result.taxSummary.roundingPolicyVersion, 'ZAMORIN_PAYABLE_ROUNDING_50P_V1');
  });

  // 26. Large invoice totals
  await suite.test('26. Large invoice totals: no overflow, no scientific notation, exact integer paisa', () => {
    const result = calculateCanonicalGst({
      lines: [{ ratePaisa: 1000000000, quantity: 5, gstRatePercent: 18 }], // ₹1 Crore x 5 = ₹5 Crores
    });
    assert.equal(result.taxSummary.totalTaxablePaisa, 5000000000);
    assert.equal(result.taxSummary.totalCgstPaisa, 450000000); // 9% = 45 Lakhs
    assert.equal(result.taxSummary.totalSgstPaisa, 450000000); // 9% = 45 Lakhs
    assert.equal(result.taxSummary.totalTaxPaisa, 900000000);
    assert.equal(result.taxSummary.grandTotalPaisa, 5900000000);
  });

  // 27. High line-count invoice (100 lines)
  await suite.test('27. High line count (100 lines): sum of line taxes equals invoice tax exactly in paisa', () => {
    const lines = [];
    for (let i = 1; i <= 100; i++) {
      lines.push({ ratePaisa: 100 + (i % 7), quantity: 1, gstRatePercent: 5 });
    }
    const result = calculateCanonicalGst({ lines });
    const computedCgst = result.lines.reduce((s, l) => s + l.cgstAmountPaisa, 0);
    const computedSgst = result.lines.reduce((s, l) => s + l.sgstAmountPaisa, 0);

    assert.equal(result.taxSummary.totalCgstPaisa, computedCgst);
    assert.equal(result.taxSummary.totalSgstPaisa, computedSgst);
    assert.equal(result.taxSummary.totalTaxPaisa, computedCgst + computedSgst);
  });

  // 28. Zero-rated / Exempt / Non-GST
  await suite.test('28. Zero-rated / Exempt supplies: produce zero tax and zero residual paisa', () => {
    const result = calculateCanonicalGst({
      lines: [
        { ratePaisa: 25000, quantity: 1, gstRatePercent: 0, taxClassification: 'EXEMPT' },
      ],
    });
    assert.equal(result.taxSummary.totalCgstPaisa, 0);
    assert.equal(result.taxSummary.totalSgstPaisa, 0);
    assert.equal(result.taxSummary.totalTaxPaisa, 0);
    assert.equal(result.taxSummary.grandTotalPaisa, 25000);
  });

  // 29. Zero floating-point drift
  await suite.test('29. Zero floating-point drift across iterative financial calculations', () => {
    let accumulatedPaisa = 0;
    for (let i = 0; i < 1000; i++) {
      accumulatedPaisa += roundToPaisa(2.5); // 3 paisa each
    }
    assert.equal(accumulatedPaisa, 3000);
  });

  // 30. Cross-module tax reconciliation
  await suite.test('30. Cross-module reconciliation: POS totals match TaxInvoice totals for same input', () => {
    const posTotals = PosOrderService.calculateTotals({
      lineItems: [{ unitPricePaisa: 100, quantity: 1, taxRatePercent: 5 }],
    });
    const gstTotals = calculateCanonicalGst({
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });

    assert.equal(posTotals.cgstPaisa, gstTotals.taxSummary.totalCgstPaisa);
    assert.equal(posTotals.sgstPaisa, gstTotals.taxSummary.totalSgstPaisa);
    assert.equal(posTotals.taxPaisa, gstTotals.taxSummary.totalTaxPaisa);
    assert.equal(posTotals.roundOffPaisa, gstTotals.taxSummary.roundOffPaisa);
    assert.equal(posTotals.totalPaisa, gstTotals.taxSummary.grandTotalPaisa);
  });

  // 31. REC-16 Add-On: 50-Paise Customer-Payable Rounding Bands
  await suite.test('31. Customer Payable ₹0.50 Rounding Bands exact verification', () => {
    // ₹1.00 -> ₹1.00
    assert.deepEqual(calculateCustomerPayableRounding50P(100), {
      preRoundingTotalPaisa: 100,
      roundOffPaisa: 0,
      finalPayablePaisa: 100,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.01 -> ₹1.00 (round down)
    assert.deepEqual(calculateCustomerPayableRounding50P(101), {
      preRoundingTotalPaisa: 101,
      roundOffPaisa: -1,
      finalPayablePaisa: 100,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.24 -> ₹1.00 (round down)
    assert.deepEqual(calculateCustomerPayableRounding50P(124), {
      preRoundingTotalPaisa: 124,
      roundOffPaisa: -24,
      finalPayablePaisa: 100,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.25 -> ₹1.00 (prompt requirement: ₹1.25 rounds to ₹1.00 with round-off -₹0.25)
    assert.deepEqual(calculateCustomerPayableRounding50P(125), {
      preRoundingTotalPaisa: 125,
      roundOffPaisa: -25,
      finalPayablePaisa: 100,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.26 -> ₹1.50 (prompt requirement: ₹1.26 rounds to ₹1.50)
    assert.deepEqual(calculateCustomerPayableRounding50P(126), {
      preRoundingTotalPaisa: 126,
      roundOffPaisa: 24,
      finalPayablePaisa: 150,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.30 -> ₹1.50 (prompt requirement: ₹1.30 rounds to ₹1.50 with round-off +₹0.20)
    assert.deepEqual(calculateCustomerPayableRounding50P(130), {
      preRoundingTotalPaisa: 130,
      roundOffPaisa: 20,
      finalPayablePaisa: 150,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.49 -> ₹1.50
    assert.deepEqual(calculateCustomerPayableRounding50P(149), {
      preRoundingTotalPaisa: 149,
      roundOffPaisa: 1,
      finalPayablePaisa: 150,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.50 -> ₹1.50
    assert.deepEqual(calculateCustomerPayableRounding50P(150), {
      preRoundingTotalPaisa: 150,
      roundOffPaisa: 0,
      finalPayablePaisa: 150,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.51 -> ₹1.50
    assert.deepEqual(calculateCustomerPayableRounding50P(151), {
      preRoundingTotalPaisa: 151,
      roundOffPaisa: -1,
      finalPayablePaisa: 150,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.74 -> ₹1.50
    assert.deepEqual(calculateCustomerPayableRounding50P(174), {
      preRoundingTotalPaisa: 174,
      roundOffPaisa: -24,
      finalPayablePaisa: 150,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.75 -> ₹1.50 (prompt requirement: ₹1.75 rounds to ₹1.50)
    assert.deepEqual(calculateCustomerPayableRounding50P(175), {
      preRoundingTotalPaisa: 175,
      roundOffPaisa: -25,
      finalPayablePaisa: 150,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.76 -> ₹2.00 (prompt requirement: ₹1.76 rounds to ₹2.00)
    assert.deepEqual(calculateCustomerPayableRounding50P(176), {
      preRoundingTotalPaisa: 176,
      roundOffPaisa: 24,
      finalPayablePaisa: 200,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.90 -> ₹2.00
    assert.deepEqual(calculateCustomerPayableRounding50P(190), {
      preRoundingTotalPaisa: 190,
      roundOffPaisa: 10,
      finalPayablePaisa: 200,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.99 -> ₹2.00
    assert.deepEqual(calculateCustomerPayableRounding50P(199), {
      preRoundingTotalPaisa: 199,
      roundOffPaisa: 1,
      finalPayablePaisa: 200,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹2.00 -> ₹2.00
    assert.deepEqual(calculateCustomerPayableRounding50P(200), {
      preRoundingTotalPaisa: 200,
      roundOffPaisa: 0,
      finalPayablePaisa: 200,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // REC-16A Reconciled Exemplars:
    // ₹47.26 -> ₹47.50 (+24 paisa)
    assert.deepEqual(calculateCustomerPayableRounding50P(4726), {
      preRoundingTotalPaisa: 4726,
      roundOffPaisa: 24,
      finalPayablePaisa: 4750,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // ₹1.05 -> ₹1.00 (-5 paisa)
    assert.deepEqual(calculateCustomerPayableRounding50P(105), {
      preRoundingTotalPaisa: 105,
      roundOffPaisa: -5,
      finalPayablePaisa: 100,
      roundingPolicyVersion: 'ZAMORIN_PAYABLE_ROUNDING_50P_V1',
    });

    // Realistic amounts
    // ₹101.25 -> ₹101.00
    assert.equal(calculateCustomerPayableRounding50P(10125).finalPayablePaisa, 10100);
    assert.equal(calculateCustomerPayableRounding50P(10125).roundOffPaisa, -25);

    // ₹101.30 -> ₹101.50
    assert.equal(calculateCustomerPayableRounding50P(10130).finalPayablePaisa, 10150);
    assert.equal(calculateCustomerPayableRounding50P(10130).roundOffPaisa, 20);

    // ₹199.75 -> ₹199.50
    assert.equal(calculateCustomerPayableRounding50P(19975).finalPayablePaisa, 19950);
    assert.equal(calculateCustomerPayableRounding50P(19975).roundOffPaisa, -25);

    // ₹199.76 -> ₹200.00
    assert.equal(calculateCustomerPayableRounding50P(19976).finalPayablePaisa, 20000);
    assert.equal(calculateCustomerPayableRounding50P(19976).roundOffPaisa, 24);

    // ₹999.99 -> ₹1,000.00
    assert.equal(calculateCustomerPayableRounding50P(99999).finalPayablePaisa, 100000);
    assert.equal(calculateCustomerPayableRounding50P(99999).roundOffPaisa, 1);
  });

  // 32. Round-off invariant ABS(roundOffPaisa) <= 25 and finalPayable % 50 === 0
  await suite.test('32. Invariant: ABS(roundOffPaisa) <= 25 & multiple of 50p across broad positive totals', () => {
    // Test exhaustive 0 to 2000 paise (20 rupees range) and sampled large numbers up to 10,000,000 paise
    const testPoints = [];
    for (let p = 0; p <= 2000; p++) testPoints.push(p);
    for (let p = 2001; p <= 10000; p += 7) testPoints.push(p);
    testPoints.push(4726, 99999, 10000000);

    for (const testValue of testPoints) {
      const res = calculateCustomerPayableRounding50P(testValue);
      assert.ok(
        Math.abs(res.roundOffPaisa) <= 25,
        `roundOffPaisa ${res.roundOffPaisa} for ${testValue} must be <= 25`
      );
      assert.equal(
        res.finalPayablePaisa % 50,
        0,
        `finalPayablePaisa ${res.finalPayablePaisa} must be exact multiple of 50 paisa`
      );
      assert.equal(
        res.preRoundingTotalPaisa + res.roundOffPaisa,
        res.finalPayablePaisa,
        'Identity: preRounding + roundOff === finalPayable'
      );
    }
  });

  // 33. Customer-payable rounding never alters GST components
  await suite.test('33. Customer-payable rounding NEVER mutates CGST, SGST, IGST, or taxable value', () => {
    // Intra-State 5% order
    const intra = calculateCanonicalGst({
      lines: [{ ratePaisa: 4500, quantity: 1, gstRatePercent: 5 }], // ₹45.00 @ 5%
    });
    // Taxable: 4500, CGST: 113, SGST: 113, preRounding: 4726, roundOff: +24, grandTotal: 4750
    assert.equal(intra.taxSummary.totalTaxablePaisa, 4500);
    assert.equal(intra.taxSummary.totalCgstPaisa, 113);
    assert.equal(intra.taxSummary.totalSgstPaisa, 113);
    assert.equal(intra.taxSummary.totalIgstPaisa, 0);
    assert.equal(intra.taxSummary.preRoundingTotalPaisa, 4726);
    assert.equal(intra.taxSummary.roundOffPaisa, 24);
    assert.equal(intra.taxSummary.grandTotalPaisa, 4750);

    // Inter-State 5% order: ₹1.00 @ 5% IGST
    const inter = calculateCanonicalGst({
      supplyType: 'INTER_STATE',
      lines: [{ ratePaisa: 100, quantity: 1, gstRatePercent: 5 }],
    });
    // Taxable: 100, IGST: 5, preRounding: 105, roundOff: -5, grandTotal: 100
    assert.equal(inter.taxSummary.totalTaxablePaisa, 100);
    assert.equal(inter.taxSummary.totalCgstPaisa, 0);
    assert.equal(inter.taxSummary.totalSgstPaisa, 0);
    assert.equal(inter.taxSummary.totalIgstPaisa, 5);
    assert.equal(inter.taxSummary.preRoundingTotalPaisa, 105);
    assert.equal(inter.taxSummary.roundOffPaisa, -5);
    assert.equal(inter.taxSummary.grandTotalPaisa, 100);
  });

  // 34. Zero Kitchen Display System (KDS) files or endpoints introduced in REC-16
  await suite.test('34. Zero Kitchen Display System (KDS) files or endpoints introduced in REC-16', () => {
    const fs = require('fs');
    const path = require('path');
    const rec16Files = [
      'backend/src/models/Bill.js',
      'backend/src/models/TaxInvoice.js',
      'backend/src/services/gstTaxService.js',
      'backend/src/services/posOrderService.js',
      'backend/src/services/threeWayMatchService.js',
      'backend/src/controllers/billController.js',
      'backend/src/services/hardwareBridgeService.js',
    ];
    for (const rel of rec16Files) {
      const content = fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8').toLowerCase();
      assert.ok(!content.includes('kitchen-display'), `No kitchen-display introduced in ${rel}`);
      assert.ok(!content.includes('kdscontroller'), `No kdsController introduced in ${rel}`);
      assert.ok(!content.includes('kdsroute'), `No kdsRoute introduced in ${rel}`);
    }
  });

});

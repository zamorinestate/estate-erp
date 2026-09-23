'use strict';

/**
 * VENDOR LEDGER & ACCOUNTS PAYABLE CONTROLLER
 *
 * REST Controller providing endpoints for:
 * - Subledger queries and statement extraction
 * - AP handoff and bill creation
 * - Payment processing, partial payments and reversals
 * - Advances and credit notes
 * - Accounts Payable aging and GST 180-day compliance
 */

const vendorLedgerService = require('../services/vendorLedgerService');
const { APInvoice } = require('../models/APInvoice');
const { Vendor } = require('../models/Vendor');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { resolveEffectiveCafeScope, assertResourceCafeOwnership } = require('../utils/cafeScope');

function normalizeId(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function assertFinanceRoleAccess(request, requiredLevel = 'READ') {
  const role = request.auth?.role;
  if (!role) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
  }

  const capabilities = request.auth?.capabilities || [];
  const hasAccountsRead =
    capabilities.includes('VENDOR_AP_VIEW') ||
    capabilities.includes('VENDOR_LEDGER_VIEW') ||
    capabilities.includes('VENDOR_AP_AGING_VIEW') ||
    capabilities.includes('FINANCE:READ');
  const hasAccountsWrite =
    capabilities.includes('VENDOR_AP_MATCH') ||
    capabilities.includes('VENDOR_AP_PREPARE_PAYMENT') ||
    capabilities.includes('FINANCE:WRITE');

  if (role === 'STAFF') {
    if (requiredLevel === 'READ' && !hasAccountsRead && !hasAccountsWrite) {
      throw new ApiError(403, 'FORBIDDEN_ROLE', 'Staff is strictly denied financial and vendor ledger access without explicit Accounts capability.');
    }
    if (requiredLevel === 'WRITE' && !hasAccountsWrite) {
      throw new ApiError(403, 'FORBIDDEN_ROLE', 'Staff requires explicit Accounts write capability (e.g. VENDOR_AP_MATCH) to perform this action.');
    }
  }

  if (requiredLevel === 'WRITE' || requiredLevel === 'PAYMENT' || requiredLevel === 'REVERSAL') {
    if (role === 'OWNER') {
      throw new ApiError(403, 'FORBIDDEN_MUTATION', 'Owner is strictly read-only for financial mutations.');
    }
    if (requiredLevel === 'PAYMENT' || requiredLevel === 'REVERSAL') {
      if (role !== 'MASTER') {
        throw new ApiError(403, 'FORBIDDEN_ROLE', 'Only Master has authority to release or reverse vendor payments.');
      }
    }
  }
}

function assertCafeAccess(request, cafeId) {
  if (!cafeId || cafeId === 'ORGANISATION_WIDE' || cafeId === 'GLOBAL') return;
  const role = request.auth.role;
  if (role === 'MASTER') return;

  const assigned = (request.auth.assignedCafeIds || []).map((c) => c.toUpperCase());
  const target = cafeId.trim().toUpperCase();

  if (role === 'OWNER') {
    if (assigned.length > 0 && !assigned.includes(target)) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner is not authorized for the requested café.');
    }
    return;
  }

  if (!assigned.includes(target)) {
    throw new ApiError(403, 'CAFE_ACCESS_DENIED', 'You do not have access to this café.');
  }
}

/**
 * GET /api/v1/finance/vendor-ledger/vendors/:vendorId
 */
const getVendorLedger = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'READ');
  const { organisationId } = request.auth;
  const vendorId = normalizeId(request.params.vendorId);
  const { cafeId, startDate, endDate, entryType, limit, skip } = request.query;

  if (cafeId) assertCafeAccess(request, cafeId);

  const result = await vendorLedgerService.getVendorLedger({
    organisationId,
    vendorId,
    cafeId,
    startDate,
    endDate,
    entryType,
    limit,
    skip,
  });

  return response.status(200).json({
    success: true,
    data: result,
    correlationId: request.correlationId || null,
  });
});

/**
 * GET /api/v1/finance/vendor-ledger/vendors/:vendorId/statement
 */
const getVendorStatement = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'READ');
  const { organisationId } = request.auth;
  const vendorId = normalizeId(request.params.vendorId);
  const { cafeId, startDate, endDate } = request.query;

  if (cafeId) assertCafeAccess(request, cafeId);

  const ledgerData = await vendorLedgerService.getVendorLedger({
    organisationId,
    vendorId,
    cafeId,
    startDate,
    endDate,
    limit: 1000,
  });

  const vendor = await Vendor.findOne({ organisationId, vendorId }).lean();
  let totalBilled = 0;
  let totalPaid = 0;
  let totalCredits = 0;
  let totalHolds = 0;

  for (const e of ledgerData.entries || []) {
    totalBilled += Number(e.creditPaisa || 0);
    totalPaid += Number(e.paidPaisa || 0);
    if (e.entryType === 'CREDIT_NOTE') totalCredits += Number(e.debitPaisa || 0);
    totalHolds += Number(e.heldPaisa || 0);
  }

  const statement = {
    vendorId,
    vendorName: vendor ? vendor.name : vendorId,
    startDate: startDate || 'ALL',
    endDate: endDate || 'LATEST',
    currency: 'INR',
    lifetimePurchasesPaisa: vendor?.financialSummary?.lifetimeApprovedPayablePaisa || 0,
    lifetimePaidPaisa: vendor?.financialSummary?.lifetimePaidPaisa || 0,
    currentOutstandingPaisa: vendor?.financialSummary?.currentOutstandingPayablePaisa || 0,
    periodBilledPaisa: totalBilled,
    periodPaidPaisa: totalPaid,
    periodCreditsPaisa: totalCredits,
    periodHoldsPaisa: totalHolds,
    closingBalancePaisa: ledgerData.entries?.slice(-1)[0]?.runningBalancePaisa || 0,
    transactions: ledgerData.entries,
  };

  return response.status(200).json({
    success: true,
    data: statement,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/finance/vendor-ledger/vendors/:vendorId/opening-balance
 */
const setOpeningBalance = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'WRITE');
  if (request.auth.role !== 'MASTER') {
    throw new ApiError(403, 'FORBIDDEN_ROLE', 'Only Master has authority to set vendor opening balances.');
  }

  const { organisationId } = request.auth;
  const vendorId = normalizeId(request.params.vendorId);
  const { amountPaisa, isCredit = true, effectiveDate, reason } = request.body;

  const entry = await vendorLedgerService.setOpeningBalance({
    organisationId,
    vendorId,
    amountPaisa,
    isCredit,
    effectiveDate,
    reason,
    auth: request.auth,
  });

  return response.status(201).json({
    success: true,
    data: entry,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/finance/vendor-ledger/bills/from-po/:purchaseOrderId
 * Hand off finalized PO/GRN to Accounts Payable.
 */
const postBillFromPo = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'WRITE');
  const { organisationId } = request.auth;
  const purchaseOrderId = normalizeId(request.params.purchaseOrderId);
  const { supplierInvoiceNumber, invoiceDate, dueDate, claimedAmountPaisa, claimedTaxPaisa, notes } = request.body;

  const result = await vendorLedgerService.postVendorBillFromReceipt({
    organisationId,
    purchaseOrderId,
    supplierInvoiceNumber,
    invoiceDate,
    dueDate,
    claimedAmountPaisa,
    claimedTaxPaisa,
    notes,
    auth: request.auth,
  });

  const billObj = result.apInvoice?.toObject ? result.apInvoice.toObject() : result.apInvoice;
  const acceptedQty = (billObj?.lineItems || []).reduce((s, li) => s + (Number(li.acceptedQuantity) || 0), 0);

  return response.status(201).json({
    success: true,
    data: {
      ...result,
      bill: {
        ...billObj,
        acceptedQty,
      },
      invoice: result.apInvoice,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * GET /api/v1/finance/vendor-ledger/ap/queue
 * Accounts Payable work queue with canonical review buckets.
 */
const getApQueue = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'READ');
  const { organisationId } = request.auth;
  const { cafeId, status } = request.query;

  if (cafeId) assertCafeAccess(request, cafeId);

  const filter = { organisationId };
  if (cafeId && cafeId !== 'ORGANISATION_WIDE' && cafeId !== 'GLOBAL') {
    filter.cafeId = cafeId.trim().toUpperCase();
  }
  if (status) {
    filter.paymentStatus = status;
  }

  const invoices = await APInvoice.find(filter).sort({ dueDate: 1 }).lean();

  const queueSummary = {
    totalCount: invoices.length,
    awaitingPaymentCount: invoices.filter((i) => ['DUE', 'NOT_DUE'].includes(i.paymentStatus)).length,
    partiallyPaidCount: invoices.filter((i) => i.paymentStatus === 'PARTIALLY_PAID').length,
    onHoldDisputedCount: invoices.filter((i) => ['ON_HOLD', 'DISPUTED'].includes(i.paymentStatus)).length,
    paidCount: invoices.filter((i) => i.paymentStatus === 'PAID').length,
    totalOutstandingPaisa: invoices.reduce((s, i) => s + (i.outstandingPayableAmountPaisa || 0), 0),
    totalHeldPaisa: invoices.reduce((s, i) => s + (i.heldDisputedAmountPaisa || 0), 0),
  };

  return response.status(200).json({
    success: true,
    data: {
      summary: queueSummary,
      invoices,
      queue: invoices,
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/finance/vendor-ledger/payments
 * Record full or partial vendor payment with allocation.
 */
const recordPayment = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'PAYMENT');
  const { organisationId } = request.auth;
  const {
    vendorId,
    paymentAmountPaisa,
    allocations,
    paymentMethod,
    reference,
    bankAccountId,
    notes,
    idempotencyKey: rawIdem,
  } = request.body;

  const idempotencyKey = normalizeId(rawIdem || request.headers?.['idempotency-key']);

  const result = await vendorLedgerService.recordVendorPayment({
    organisationId,
    vendorId,
    paymentAmountPaisa,
    allocations,
    paymentMethod,
    reference,
    bankAccountId,
    notes,
    idempotencyKey,
    auth: request.auth,
  });

  return response.status(200).json({
    success: true,
    data: result,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/finance/vendor-ledger/payments/:paymentId/reverse
 */
const reversePayment = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'REVERSAL');
  const { organisationId } = request.auth;
  const paymentId = normalizeId(request.params.paymentId);
  const { reason } = request.body;

  const result = await vendorLedgerService.reversePayment({
    organisationId,
    paymentId,
    reason,
    auth: request.auth,
  });

  return response.status(200).json({
    success: true,
    data: result,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/finance/vendor-ledger/advances
 */
const recordAdvance = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'PAYMENT');
  const { organisationId } = request.auth;
  const { vendorId, amountPaisa, cafeId, paymentMethod, reference, notes, idempotencyKey } = request.body;

  const result = await vendorLedgerService.recordVendorAdvance({
    organisationId,
    vendorId,
    amountPaisa,
    cafeId,
    paymentMethod,
    reference,
    notes,
    idempotencyKey,
    auth: request.auth,
  });

  return response.status(201).json({
    success: true,
    data: result,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/finance/vendor-ledger/advances/apply
 */
const applyAdvance = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'PAYMENT');
  const { organisationId } = request.auth;
  const { vendorId, invoiceId, amountToApplyPaisa, notes } = request.body;

  const result = await vendorLedgerService.applyVendorAdvance({
    organisationId,
    vendorId,
    invoiceId,
    amountToApplyPaisa,
    notes,
    auth: request.auth,
  });

  return response.status(200).json({
    success: true,
    data: result,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/finance/vendor-ledger/credits/apply
 */
const applyCreditNote = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'WRITE');
  const { organisationId } = request.auth;
  const { vendorId, invoiceId, creditNoteId, amountPaisa, reason } = request.body;

  const result = await vendorLedgerService.applyVendorCreditNote({
    organisationId,
    vendorId,
    invoiceId,
    creditNoteId,
    amountPaisa,
    reason,
    auth: request.auth,
  });

  return response.status(200).json({
    success: true,
    data: result,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/finance/vendor-ledger/bills/:invoiceId/holds/release
 */
const releasePaymentHold = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'PAYMENT');
  const { organisationId } = request.auth;
  const invoiceId = normalizeId(request.params.invoiceId);
  const { holdCode, releaseReason } = request.body;

  const result = await vendorLedgerService.releasePaymentHold({
    organisationId,
    invoiceId,
    holdCode,
    releaseReason,
    auth: request.auth,
  });

  return response.status(200).json({
    success: true,
    data: result,
    correlationId: request.correlationId || null,
  });
});

/**
 * GET /api/v1/finance/vendor-ledger/reports/aging
 */
const getApAgingReport = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'READ');
  const { organisationId } = request.auth;
  const { cafeId, asOfDate } = request.query;

  if (cafeId) assertCafeAccess(request, cafeId);

  const report = await vendorLedgerService.getAccountsPayableAging({
    organisationId,
    cafeId,
    asOfDate,
  });

  return response.status(200).json({
    success: true,
    data: report,
    correlationId: request.correlationId || null,
  });
});

/**
 * GET /api/v1/finance/vendor-ledger/reports/gst-180-days
 */
const getGstMonitoringReport = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'READ');
  const { organisationId } = request.auth;
  const { asOfDate } = request.query;

  const report = await vendorLedgerService.getGst180DayMonitoring({
    organisationId,
    asOfDate,
  });

  return response.status(200).json({
    success: true,
    data: report,
    correlationId: request.correlationId || null,
  });
});

/**
 * POST /api/v1/finance/vendor-ledger/vendors/:vendorId/rebuild-summary
 */
const rebuildVendorSummary = asyncHandler(async (request, response) => {
  assertFinanceRoleAccess(request, 'WRITE');
  const { organisationId } = request.auth;
  const vendorId = normalizeId(request.params.vendorId);

  const result = await vendorLedgerService.rebuildVendorFinancialSummary({
    organisationId,
    vendorId,
  });

  return response.status(200).json({
    success: true,
    data: result,
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  getVendorLedger,
  getVendorStatement,
  setOpeningBalance,
  postBillFromPo,
  getApQueue,
  recordPayment,
  reversePayment,
  recordAdvance,
  applyAdvance,
  applyCreditNote,
  releasePaymentHold,
  getApAgingReport,
  getGstMonitoringReport,
  rebuildVendorSummary,
};

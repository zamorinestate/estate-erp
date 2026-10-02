'use strict';

/**
 * POS CONTROLLER (SCREEN 005 / PRIMARY MASTER PROGRAMME STAGE 06)
 *
 * Exposes authoritative POS API endpoints:
 *  - POST /api/v1/pos/orders/commit (Save, Print, Save & Print with idempotency)
 *  - POST /api/v1/pos/orders/preview (Real-time calculations & receipt preview)
 *  - POST /api/v1/pos/orders/:billId/print (Print existing committed bill)
 *  - POST /api/v1/pos/orders/:billId/reprint (Reprint with copy counter & watermark)
 *  - GET  /api/v1/pos/orders/active/:cafeId (Fetch active open tickets)
 */

const { PosOrderService } = require('../services/posOrderService');
const { PosReconciliationService } = require('../services/posReconciliationService');
const { Bill } = require('../models/Bill');
const { IdempotencyRecord } = require('../models/IdempotencyRecord');
const { MenuItem } = require('../models/MenuItem');
const { OutletOffering } = require('../models/OutletOffering');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { assertResourceCafeOwnership, resolveEffectiveCafeScope } = require('../utils/cafeScope');
const { assertCanonicalMasterState } = require('../utils/cafeScope');

function normalizeId(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function assertCafeAccess(request, cafeId) {
  const normCafeId = normalizeId(cafeId);
  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (effectiveCafe && normCafeId && normCafeId !== effectiveCafe) {
    throw new ApiError(
      403,
      'CROSS_CAFE_RESOURCE_DENIED',
      'Cross-café access is denied. You are not authorized for the requested café.'
    );
  }
  if (request.auth.role === 'MASTER' || request.auth.role === 'OWNER') return;
  if (!request.auth.assignedCafeIds || !request.auth.assignedCafeIds.map(normalizeId).includes(normCafeId)) {
    throw new ApiError(
      403,
      'CAFE_ACCESS_DENIED',
      'You do not have access to this café.'
    );
  }
}

/**
 * POST /api/v1/pos/orders/commit
 * Executes Save, Print, or Save & Print pipeline.
 */
const commitOrder = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { action = 'SAVE_AND_PRINT', ...orderPayload } = request.body || {};
  const cafeId = normalizeId(orderPayload.cafeId || request.auth.primaryCafeId || request.auth.assignedCafeIds?.[0]);

  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required to process POS transactions.');
  }

  assertCafeAccess(request, cafeId);

  const idempotencyKey = request.body.idempotencyKey || request.headers['x-idempotency-key'] || null;

  const result = await PosOrderService.processOrder(
    { ...orderPayload, cafeId, idempotencyKey },
    request.auth,
    action,
    {
      idempotencyKey,
      simulatePrinterFailure: Boolean(request.body.simulatePrinterFailure),
    }
  );

  return response.status(200).json(result);
});

/**
 * POST /api/v1/pos/orders/preview
 * Returns computed taxes, totals, and receipt HTML markup without persisting to DB.
 */
const previewOrder = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const orderPayload = request.body || {};
  const cafeId = normalizeId(orderPayload.cafeId || request.auth.primaryCafeId || request.auth.assignedCafeIds?.[0]);

  if (cafeId) {
    assertCafeAccess(request, cafeId);
  }

  const result = await PosOrderService.previewReceipt(orderPayload, request.auth);
  return response.status(200).json(result);
});

/**
 * POST /api/v1/pos/orders/:billId/print
 * Generates thermal print buffer for an existing committed bill.
 */
const printOrder = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const billId = normalizeId(request.params.billId);
  const result = await PosOrderService.printCommittedBill(billId, request.auth);
  return response.status(200).json(result);
});

/**
 * POST /api/v1/pos/orders/:billId/reprint
 * Generates an authorized reprint with copy counter and watermark.
 */
const reprintOrder = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const billId = normalizeId(request.params.billId);
  const { reason = 'Customer Request' } = request.body || {};
  const result = await PosOrderService.reprintBill(billId, request.auth, reason);
  return response.status(200).json(result);
});

/**
 * GET /api/v1/pos/orders/active/:cafeId
 * Retrieves active/open bills/tickets for a café.
 */
const getActiveOrders = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const cafeId = normalizeId(request.params.cafeId);
  assertCafeAccess(request, cafeId);

  const bills = await Bill.find({
    organisationId: request.auth.organisationId,
    cafeId,
    status: { $in: ['OPEN', 'HELD'] },
  }).sort({ createdAt: -1 }).lean();

  return response.status(200).json({
    success: true,
    count: bills.length,
    data: bills,
  });
});

/**
 * GET /api/v1/pos/orders/last/:cafeId
 * Retrieves the most recent finalized bill for a café, enabling browser-refresh resilient reprint (CTL-05).
 */
const getLastCommittedBill = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const cafeId = normalizeId(request.params.cafeId || request.query.cafeId || request.auth.primaryCafeId || request.auth.assignedCafeIds?.[0]);
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required to retrieve the last receipt.');
  }

  assertCafeAccess(request, cafeId);

  const bill = await Bill.findOne({
    organisationId: request.auth.organisationId,
    cafeId,
    status: { $in: ['COMPLETED', 'PARTIALLY_REFUNDED'] },
  }).sort({ createdAt: -1 }).lean();

  if (!bill) {
    throw new ApiError(404, 'NO_RECENT_BILLS', 'No recent finalized bill found for this café.');
  }

  const billData = bill;
  return response.status(200).json({
    success: true,
    data: billData,
    bill: billData,
  });
});

/**
 * GET /api/v1/pos/orders/status/:transactionId
 * REC-04B: Resolves transaction status by exact transaction identity (idempotencyKey or saleAttemptId).
 * Safe recovery after unknown network outcomes without relying on "Reprint Last".
 */
const getOrderStatusByIdempotency = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const transactionId = String(request.params.transactionId || '').trim();
  if (!transactionId) {
    throw new ApiError(400, 'TRANSACTION_ID_REQUIRED', 'transactionId (idempotencyKey or saleAttemptId) is required.');
  }

  const orgId = request.auth?.organisationId || 'ORG-ZAMORIN';
  const cafeId = request.query.cafeId ? normalizeId(request.query.cafeId) : null;

  const billQuery = {
    organisationId: orgId,
    $or: [{ correlationId: transactionId }, { saleAttemptId: transactionId }],
  };
  if (cafeId) billQuery.cafeId = cafeId;

  const bill = await Bill.findOne(billQuery);
  if (bill) {
    const billData = typeof bill.toObject === 'function' ? bill.toObject() : bill;
    return response.status(200).json({
      success: true,
      status: 'COMPLETED',
      saleFinalized: true,
      transactionId,
      billId: billData.billId,
      invoiceNumber: billData.invoiceNumber,
      bill: billData,
      data: billData,
      message: 'Transaction completed successfully.',
    });
  }

  const recordQuery = {
    organisationId: orgId,
    $or: [{ idempotencyKey: transactionId }, { saleAttemptId: transactionId }],
  };
  if (cafeId) recordQuery.cafeId = cafeId;

  const record = await IdempotencyRecord.findOne(recordQuery);
  if (record) {
    if (record.status === 'COMPLETED') {
      return response.status(200).json({
        success: true,
        status: 'COMPLETED',
        saleFinalized: true,
        transactionId,
        billId: record.billId,
        invoiceNumber: record.invoiceNumber,
        bill: record.responseSnapshot?.bill || record.responseSnapshot?.data || null,
        data: record.responseSnapshot,
        message: 'Transaction completed successfully (from IdempotencyRecord).',
      });
    }

    if (record.status === 'PROCESSING') {
      return response.status(200).json({
        success: true,
        status: 'PROCESSING',
        saleFinalized: false,
        transactionId,
        message: 'Transaction is currently processing.',
      });
    }

    return response.status(200).json({
      success: false,
      status: 'FAILED',
      saleFinalized: false,
      transactionId,
      error: record.errorDetails,
      message: 'Transaction failed prior to finalization.',
    });
  }

  return response.status(200).json({
    success: true,
    status: 'NOT_RECEIVED',
    saleFinalized: false,
    transactionId,
    message: 'No transaction found for this identity. Safe to retry with same transaction identity.',
  });
});

/**
 * GET /api/v1/pos/reconciliation/pending
 * REC-04B: Lists pending and manual-review reconciliation jobs for operational visibility.
 */
const getPendingReconciliations = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const role = (request.auth?.role || '').toUpperCase();
  if (role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to view reconciliation queues.');
  }
  const { cafeId, status } = request.query;
  const result = await PosReconciliationService.getPendingReconciliations({
    organisationId: request.auth.organisationId,
    cafeId,
    status,
  });
  return response.status(200).json(result);
});

/**
 * POST /api/v1/pos/reconciliation/:jobId/retry
 * REC-04B: Explicitly retries a reconciliation job with exactly-once safety.
 */
const retryReconciliation = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const role = (request.auth?.role || '').toUpperCase();
  if (role === 'STAFF') {
    throw new ApiError(403, 'AUTHORIZATION_DENIED', 'Staff users are not authorized to retry reconciliation jobs.');
  }
  const jobId = normalizeId(request.params.jobId);
  const result = await PosReconciliationService.retryJob(jobId, request.auth);
  return response.status(200).json(result);
});

/**
 * POST /api/v1/pos/offline-sync
 * REC-13: Replays queued offline POS transactions through the canonical PosOrderService pipeline.
 */
const syncOfflineOrders = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const { organisationId, userId } = request.auth;
  const cafeId = normalizeId(request.body?.cafeId || request.query?.cafeId || request.auth?.primaryCafeId || '');
  const { transactions, deviceId, operatorSessionId } = request.body || {};

  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Transactions array is required for offline sync.');
  }

  const OfflineSyncService = require('../services/offlineSyncService');
  const syncResult = await OfflineSyncService.syncBatch({
    organisationId,
    cafeId,
    deviceId: deviceId || request.deviceContext?.deviceId || '',
    userId,
    operatorSessionId,
    transactions,
  });

  return response.status(200).json({
    success: true,
    message: `Processed ${transactions.length} offline transactions.`,
    data: syncResult,
    correlationId: request.correlationId || null,
  });
});

/**
 * GET /api/v1/pos/offline-reviews/pending
 * REC-13A / REC-13B: Lists pending offline review items scoped by cafe and authorization.
 * Role-enforced: Only Assigned CAFE_ADMIN and MASTER are permitted.
 * OWNER and STAFF are strictly barred (Segregation of Duties).
 */
const getPendingOfflineReviews = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const role = (request.auth?.role || '').toUpperCase();
  if (role === 'OWNER') {
    throw new ApiError(
      403,
      'AUTHORIZATION_DENIED',
      'Owner does not possess offline POS review authorization (Segregation of Duties).'
    );
  }
  if (role === 'STAFF') {
    throw new ApiError(
      403,
      'AUTHORIZATION_DENIED',
      'Staff users are not authorized to view or manage offline queue reviews.'
    );
  }
  if (!['CAFE_ADMIN', 'MASTER'].includes(role)) {
    throw new ApiError(
      403,
      'AUTHORIZATION_DENIED',
      `Role ${role} is not authorized for offline queue review.`
    );
  }

  const { organisationId } = request.auth;
  const cafeId = normalizeId(request.query?.cafeId || request.params?.cafeId || '');

  const OfflineSyncService = require('../services/offlineSyncService');
  const items = await OfflineSyncService.getPendingReviews({
    organisationId,
    cafeId: cafeId || null,
    authUser: request.auth,
  });

  return response.status(200).json({
    success: true,
    count: items.length,
    data: items,
  });
});

/**
 * POST /api/v1/pos/offline-reviews/:reviewId/review
 * REC-13A / REC-13B: Executes authorized review decision (APPROVE_AND_FINALIZE, REJECT, ESCALATE).
 * Role-enforced: Only Assigned CAFE_ADMIN and MASTER are permitted.
 * OWNER and STAFF are strictly barred (Segregation of Duties).
 */
const reviewOfflineOrder = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const role = (request.auth?.role || '').toUpperCase();
  if (role === 'OWNER') {
    throw new ApiError(
      403,
      'AUTHORIZATION_DENIED',
      'Owner does not possess offline POS review authorization (Segregation of Duties).'
    );
  }
  if (role === 'STAFF') {
    throw new ApiError(
      403,
      'AUTHORIZATION_DENIED',
      'Staff users are not authorized to perform offline queue governance review.'
    );
  }
  if (!['CAFE_ADMIN', 'MASTER'].includes(role)) {
    throw new ApiError(
      403,
      'AUTHORIZATION_DENIED',
      `Role ${role} is not authorized for offline queue review.`
    );
  }

  const { reviewId } = request.params;
  const { action, reason } = request.body || {};

  const OfflineSyncService = require('../services/offlineSyncService');
  const result = await OfflineSyncService.reviewItem({
    reviewId,
    action,
    reason,
    authContext: request.auth,
  });

  return response.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * GET /api/v1/pos/catalog/:cafeId
 * Canonical POS Menu Pipeline (§28)
 * Menu/Product Master -> Cafe assignment -> availability/publication ->
 * POS channel eligibility -> category mapping -> active status -> cafe scope -> price
 */
const getPosCatalog = asyncHandler(async (request, response) => {
  assertCanonicalMasterState(request.auth);
  const cafeId = normalizeId(request.params.cafeId);
  if (!cafeId) {
    throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is required to fetch POS catalogue.');
  }

  assertCafeAccess(request, cafeId);

  const organisationId = request.auth?.organisationId || 'ZAMORIN';

  // 1. Fetch active menu items eligible for CAFE/SHARED concept
  const rawItems = await MenuItem.find({
    organisationId,
    status: 'ACTIVE',
    conceptEligibility: { $in: ['CAFE', 'SHARED'] },
  }).sort({ category: 1, name: 1 }).lean();

  const menuItems = Array.isArray(rawItems) ? rawItems : [];

  // 2. Fetch outlet-specific offerings if any exist for this cafe
  const rawOfferings = await OutletOffering.find({
    organisationId,
    outletId: cafeId,
  }).lean();

  const offerings = Array.isArray(rawOfferings) ? rawOfferings : [];
  const offeringMap = new Map();
  for (const off of offerings) {
    offeringMap.set(normalizeId(off.menuItemId), off);
  }

  const hasOfferingsConfigured = offerings.length > 0;
  const now = new Date();

  // 3. Map to POS catalogue items
  const catalogItems = [];

  for (const item of menuItems) {
    const itemId = normalizeId(item.menuItemId);
    const offering = offeringMap.get(itemId);

    // If the cafe has specific offerings configured, enforce cafe assignment & enablement
    if (hasOfferingsConfigured) {
      if (!offering) continue; // Not assigned to this cafe
      if (offering.isEnabled === false) continue; // Explicitly disabled for cafe
      if (offering.channels && offering.channels.pos === false) continue; // Disabled for POS channel
    }

    // Availability / Sold out check
    let isAvailable = item.status === 'ACTIVE';
    if (offering) {
      if (offering.isAvailable === false) {
        if (!offering.soldOutUntil || new Date(offering.soldOutUntil) > now) {
          isAvailable = false;
        }
      }
    }

    // Authoritative pricing: local override if set, else item master price
    const effectivePricePaisa = (offering && offering.localPricePaisaOverride != null)
      ? offering.localPricePaisaOverride
      : (item.currentPricePaisa ?? (item.pricePaisa ?? 0));

    // Category mapping to POS UI categories
    let posCategory = 'Savouries & Mains';
    const cat = String(item.category || '').toUpperCase();
    const nameLower = String(item.name || '').toLowerCase();

    if (cat === 'COFFEE' || cat === 'TEA' || cat === 'BEVERAGES_OTHER') {
      if (nameLower.includes('cold') || nameLower.includes('iced') || nameLower.includes('brew')) {
        posCategory = 'Cold Brews';
      } else {
        posCategory = 'Hot Coffees';
      }
    } else if (cat === 'BAKERY') {
      posCategory = 'Bakery & Viennoiserie';
    } else if (cat === 'DESSERTS') {
      posCategory = 'Desserts';
    } else if (['SNACKS', 'STARTERS', 'SOUPS', 'SALADS', 'MAIN_COURSE', 'SIDES'].includes(cat)) {
      posCategory = 'Savouries & Mains';
    }

    catalogItems.push({
      id: item.menuItemId,
      code: item.itemCode || item.plu || item.menuItemId,
      name: item.name,
      category: posCategory,
      rawCategory: item.category,
      price: Number((effectivePricePaisa / 100).toFixed(2)),
      pricePaisa: effectivePricePaisa,
      foodType: (item.dietaryTags || []).includes('NON_VEG') ? 'Non-Veg' : 'Veg',
      hasModifiers: Array.isArray(item.variants) && item.variants.length > 0,
      isAvailable,
      description: item.description || '',
    });
  }

  return response.status(200).json({
    cafeId,
    items: catalogItems,
    total: catalogItems.length,
  });
});

module.exports = {
  commitOrder,
  previewOrder,
  printOrder,
  reprintOrder,
  getActiveOrders,
  getLastCommittedBill,
  getOrderStatusByIdempotency,
  getPendingReconciliations,
  retryReconciliation,
  syncOfflineOrders,
  getPendingOfflineReviews,
  reviewOfflineOrder,
  getPosCatalog,
};



'use strict';

/**
 * POS ORDER SERVICE (SCREEN 005 / PRIMARY MASTER PROGRAMME STAGE 06)
 *
 * Implements the authoritative Point-Of-Sale transaction pipeline:
 *  - Explicit Actions: SAVE, PRINT, SAVE_AND_PRINT, REPRINT, PREVIEW
 *  - Standard Transaction Flow:
 *      Create Order -> Calculate -> Validate -> Save Transaction ->
 *      Generate Official Receipt/Invoice ID -> Print -> Open Cash Drawer (if cash) -> Update Local State
 *  - High-concurrency deduplication & 60-minute Idempotency Cache
 *  - Concurrency Lock: Burst requests with same idempotency key resolve to exact same transaction without duplicate deductions
 *  - Safe Printer Failure Resilience: Uncaught printer errors do NOT rollback DB commits;
 *    returns committed bill + printerWarning: 'PRINTER_OFFLINE' + reprintAvailable: true
 *  - Failed Save Protection: If validation or DB save fails, receipt generation and drawer kick are aborted
 *  - Authorized Reprint with '*** REPRINT (Copy #N) ***' header & audit logging
 *  - Real-time Receipt Preview before database commit
 */

const { Bill, BILL_STATUSES, PAYMENT_METHODS } = require('../models/Bill');
const { MenuItem } = require('../models/MenuItem');
const { Cafe } = require('../models/Cafe');
const { RegisterSession } = require('../models/RegisterSession');
const { CashTransaction } = require('../models/CashTransaction');
const { SequenceCounter } = require('../models/SequenceCounter');
const { IdempotencyRecord } = require('../models/IdempotencyRecord');
const { PrintJob } = require('../models/PrintJob');
const { OperatorSession } = require('../models/OperatorSession');
const { DeviceRegistration } = require('../models/DeviceRegistration');
const { BomDepletionService } = require('./bomDepletionService');
const {
  allocateInvoiceNumber,
  roundToPaisa,
  calculateCustomerPayableRounding50P,
  TAX_RULE_VERSION,
  ROUNDING_POLICY_VERSION,
} = require('./gstTaxService');
const { PosReconciliationService } = require('./posReconciliationService');
const crypto = require('node:crypto');
const { ApiError } = require('../utils/ApiError');
const auditService = require('./auditService');
const {
  PRINT_ATTESTATION_VERSION,
  ATTESTATION_ALGORITHM,
  PRINT_ACK_CHALLENGE_TTL_MS,
  createChallenge,
  buildPrintAckPayload,
  verifyPrintAckSignature,
  publicKeyThumbprint,
} = require('./deviceAttestationService');
const {
  compileThermalReceipt,
  generateFallbackHtmlReceipt,
  buildDrawerKickBuffer,
} = require('./hardwareBridgeService');

// In-memory idempotency cache (TTL: 60 minutes) — fast path read cache
const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;
const idempotencyCache = new Map();

// In-memory lock map for in-flight requests in the local Node process.
// NOTE (REC-04B): Classified strictly as LOCAL_PROCESS_OPTIMIZATION_ONLY.
// The authoritative correctness barrier across processes/instances lives in MongoDB:
// unique indexes on IdempotencyRecord and Bill, plus atomic database state transitions.
const activeIdempotencyLocks = new Map();

function cleanExpiredIdempotency() {
  const now = Date.now();
  for (const [key, value] of idempotencyCache.entries()) {
    if (value.expiresAt <= now) {
      idempotencyCache.delete(key);
    }
  }
}

// Clean up expired cache entries periodically
setInterval(cleanExpiredIdempotency, 5 * 60 * 1000).unref();

function normalizeId(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function assertCafeAccess(authContext = {}, cafeId) {
  const normCafeId = normalizeId(cafeId);
  if (!normCafeId) return;

  const role = normalizeId(authContext.role);
  if (role === 'OWNER') {
    throw new ApiError(
      403,
      'AUTHORIZATION_DENIED',
      'Owner role is read-only for POS and cannot execute operational POS actions.'
    );
  }

  if (role === 'MASTER') {
    if (authContext.isPrimaryMaster === true) return;
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      'Primary Master authority is required for MASTER POS access.'
    );
  }

  const assigned = Array.isArray(authContext.assignedCafeIds)
    ? authContext.assignedCafeIds.map(normalizeId)
    : authContext.primaryCafeId ? [normalizeId(authContext.primaryCafeId)] : [];

  if (!assigned.includes(normCafeId)) {
    throw new ApiError(
      403,
      'CROSS_CAFE_RESOURCE_DENIED',
      'Cross-café access is denied. You are not authorized for the requested café.'
    );
  }
}

function requireOrganisationId(authContext = {}) {
  const organisationId = normalizeId(authContext.organisationId);
  if (!organisationId) {
    throw new ApiError(
      401,
      'ORGANISATION_CONTEXT_REQUIRED',
      'Authenticated organisation context is required for POS transactions.'
    );
  }
  return organisationId;
}

function createPrintJobId(jobType = 'RECEIPT') {
  const normalizedType = normalizeId(jobType);
  const tag = normalizedType === 'REPRINT' ? 'REP' : 'PRT';
  return `PJ-${tag}-${crypto.randomUUID().toUpperCase()}`;
}

function resolveDispatchDeviceId(authContext = {}, cafeId) {
  const device = authContext.deviceContext || {};
  const deviceId = normalizeId(device.deviceId);
  const boundCafeId = normalizeId(device.boundCafeId);
  const targetCafeId = normalizeId(cafeId);

  if (
    deviceId &&
    deviceId !== 'UNKNOWN_PERSONAL_DEVICE' &&
    normalizeId(device.deviceClass) === 'CAFE_OWNED' &&
    normalizeId(device.status) === 'ACTIVE' &&
    boundCafeId &&
    boundCafeId === targetCafeId
  ) {
    return deviceId;
  }

  return null;
}

function hasCashTender(billData = {}) {
  return normalizeId(billData.paymentMethod) === 'CASH' ||
    (Array.isArray(billData.tenders) && billData.tenders.some((t) => normalizeId(t.paymentMethod) === 'CASH'));
}

async function resolveAttestationBinding(authContext = {}, cafeId) {
  const deviceId = resolveDispatchDeviceId(authContext, cafeId);
  if (!deviceId) {
    return {
      required: false,
      supported: false,
      platform: null,
      unavailableReason: 'DEVICE_NOT_BOUND',
      challenge: null,
      challengeIssuedAt: null,
      challengeExpiresAt: null,
      challengeIssuedAtEpochMs: null,
      challengeExpiresAtEpochMs: null,
      keyThumbprint: null,
      keyProvider: null,
      keyHardwareBackedVerified: false,
      keyHardwareSecurityLevel: 'UNKNOWN',
      algorithm: null,
    };
  }

  const registration = await DeviceRegistration.findOne({
    deviceId,
    organisationId: requireOrganisationId(authContext),
    assignedCafeId: normalizeId(cafeId),
    status: 'ACTIVE',
  }).lean();

  const platform = normalizeId(registration?.platform || 'UNKNOWN');
  const supported = platform === 'ANDROID';
  const signingProvider = normalizeId(registration?.signingKeyProvider || 'UNKNOWN');
  const signingCapable = Boolean(
    supported &&
    signingProvider === 'ANDROID_KEYSTORE' &&
    registration?.publicSigningKey &&
    normalizeId(registration.signingKeyAlgorithm) === ATTESTATION_ALGORITHM
  );

  if (!signingCapable) {
    return {
      required: false,
      supported,
      platform,
      unavailableReason: supported
        ? (
            signingProvider !== 'ANDROID_KEYSTORE'
              ? 'DEVICE_SIGNING_PROVIDER_UNTRUSTED'
              : 'DEVICE_SIGNING_KEY_UNAVAILABLE'
          )
        : 'PLATFORM_PRINT_ATTESTOR_UNAVAILABLE',
      challenge: null,
      challengeIssuedAt: null,
      challengeExpiresAt: null,
      challengeIssuedAtEpochMs: null,
      challengeExpiresAtEpochMs: null,
      keyThumbprint: null,
      keyProvider: null,
      keyHardwareBackedVerified: false,
      keyHardwareSecurityLevel: 'UNKNOWN',
      algorithm: null,
    };
  }

  const challengeIssuedAt = new Date();
  const challengeExpiresAt = new Date(challengeIssuedAt.getTime() + PRINT_ACK_CHALLENGE_TTL_MS);

  return {
    required: true,
    supported: true,
    platform,
    unavailableReason: null,
    challenge: createChallenge(),
    challengeIssuedAt,
    challengeExpiresAt,
    challengeIssuedAtEpochMs: challengeIssuedAt.getTime(),
    challengeExpiresAtEpochMs: challengeExpiresAt.getTime(),
    keyThumbprint:
      registration.signingKeyThumbprint ||
      publicKeyThumbprint(registration.publicSigningKey),
    keyProvider: signingProvider,
    keyHardwareBackedVerified: registration.signingKeyHardwareBackedVerified === true,
    keyHardwareSecurityLevel: normalizeId(registration.signingKeyHardwareSecurityLevel || 'UNKNOWN'),
    algorithm: ATTESTATION_ALGORITHM,
  };
}

const SETTLEMENT_TENDER_METHODS = new Set([
  'CASH',
  'UPI',
  'CARD',
  'CREDIT',
  'COMPLIMENTARY',
  'STAFF_MEAL',
]);

function computeRequestFingerprint(orderPayload = {}) {
  const normItems = (orderPayload.lineItems || []).map((li) => ({
    menuItemId: normalizeId(li.menuItemId),
    quantity: Math.max(1, Math.floor(Number(li.quantity) || 1)),
    modifiers: li.modifiers || {},
  })).sort((a, b) => a.menuItemId.localeCompare(b.menuItemId));

  const norm = {
    cafeId: normalizeId(orderPayload.cafeId),
    orderType: String(orderPayload.orderType || orderPayload.serviceMode || 'QUICK_SALE').trim().toUpperCase(),
    tableNumber: String(orderPayload.tableNumber || '').trim(),
    paymentMethod: normalizeId(orderPayload.paymentMethod || 'CASH'),
    discountPaisa: Math.round(Number(orderPayload.discountPaisa || 0)),
    lineItems: normItems,
  };
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

function getIstBusinessDate(date = new Date(), cutoffHour = 4) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    const hour = getPart('hour');

    const d = new Date(date.getTime());
    if (cutoffHour > 0 && hour < cutoffHour) {
      d.setTime(d.getTime() - 24 * 60 * 60 * 1000);
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (_) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

class PosOrderService {
  /**
   * Calculates financial totals, taxes (CGST/SGST/IGST), line items, and discounts in paisa.
   */
  static calculateTotals({
    lineItems = [],
    discountPaisa = 0,
    isInterState = false,
  } = {}) {
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      throw new ApiError(400, 'LINE_ITEMS_REQUIRED', 'At least one line item is required.');
    }

    let calculatedSubtotalPaisa = 0;
    let calculatedCgstPaisa = 0;
    let calculatedSgstPaisa = 0;
    let calculatedIgstPaisa = 0;
    let lineItemsDiscountSum = 0;

    const processedLineItems = lineItems.map((item, index) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const baseUnitPrice = Math.max(0, Math.round(Number(item.unitPricePaisa ?? item.pricePaisa ?? (item.price != null ? item.price * 100 : 0))));
      const modifierPrice = Math.max(0, Math.round(Number(item.modifiers?.modifierPricePaisa || 0)));
      const effectiveUnitPrice = baseUnitPrice + modifierPrice;

      const lineSubtotalPaisa = effectiveUnitPrice * quantity;
      calculatedSubtotalPaisa += lineSubtotalPaisa;

      const itemDiscount = Math.max(0, Math.min(lineSubtotalPaisa, Math.round(Number(item.discountPaisa || 0))));
      lineItemsDiscountSum += itemDiscount;

      const lineTaxablePaisa = Math.max(0, lineSubtotalPaisa - itemDiscount);
      const taxRatePercent = typeof item.taxRatePercent === 'number' ? item.taxRatePercent : 5;

      let cgstPaisa = 0;
      let sgstPaisa = 0;
      let igstPaisa = 0;

      if (isInterState) {
        igstPaisa = roundToPaisa((lineTaxablePaisa * taxRatePercent) / 100);
      } else {
        const halfRate = taxRatePercent / 2;
        cgstPaisa = roundToPaisa((lineTaxablePaisa * halfRate) / 100);
        sgstPaisa = roundToPaisa((lineTaxablePaisa * halfRate) / 100);
      }

      calculatedCgstPaisa += cgstPaisa;
      calculatedSgstPaisa += sgstPaisa;
      calculatedIgstPaisa += igstPaisa;

      const lineTotalPaisa = lineTaxablePaisa + cgstPaisa + sgstPaisa + igstPaisa;

      return {
        menuItemId: normalizeId(item.menuItemId || `ITEM-${index + 1}`),
        itemNameSnapshot: String(item.itemNameSnapshot || item.name || `Item ${index + 1}`).trim(),
        quantity,
        unitPricePaisa: effectiveUnitPrice,
        modifiers: item.modifiers || {},
        itemNotes: String(item.itemNotes || item.notes || '').trim(),
        taxRatePercent,
        taxClassification: item.taxClassification || 'GST_5',
        discountPaisa: itemDiscount,
        lineSubtotalPaisa,
        cgstPaisa,
        sgstPaisa,
        igstPaisa,
        lineTotalPaisa,
      };
    });

    const orderLevelDiscount = Math.max(0, Math.round(Number(discountPaisa || 0)));
    const totalDiscountPaisa = Math.min(
      calculatedSubtotalPaisa,
      lineItemsDiscountSum + orderLevelDiscount
    );

    const taxPaisa = calculatedCgstPaisa + calculatedSgstPaisa + calculatedIgstPaisa;
    const taxablePaisa = Math.max(0, calculatedSubtotalPaisa - totalDiscountPaisa);
    const preRoundingTotalPaisa = Math.max(0, taxablePaisa + taxPaisa);

    // REC-16 Add-On: Canonical ₹0.50 Customer-Payable Rounding
    const payable = calculateCustomerPayableRounding50P(preRoundingTotalPaisa);
    const grandTotalPaisa = payable.finalPayablePaisa;
    const roundOffPaisa = payable.roundOffPaisa;

    return {
      subtotalPaisa: calculatedSubtotalPaisa,
      discountPaisa: totalDiscountPaisa,
      taxablePaisa,
      taxPaisa,
      cgstPaisa: calculatedCgstPaisa,
      sgstPaisa: calculatedSgstPaisa,
      igstPaisa: calculatedIgstPaisa,
      preRoundingTotalPaisa,
      roundOffPaisa,
      totalPaisa: grandTotalPaisa,
      lineItems: processedLineItems,
      taxRuleVersion: TAX_RULE_VERSION,
      roundingPolicyVersion: ROUNDING_POLICY_VERSION,
    };
  }

  /**
   * Validates order payload before database commitment.
   */
  static validateOrderPayload(orderData = {}) {
    if (!orderData.cafeId) {
      throw new ApiError(400, 'CAFE_ID_REQUIRED', 'cafeId is mandatory for POS transactions.');
    }

    if (!Array.isArray(orderData.lineItems) || orderData.lineItems.length === 0) {
      throw new ApiError(400, 'LINE_ITEMS_REQUIRED', 'At least one line item is required.');
    }

    for (const [idx, it] of orderData.lineItems.entries()) {
      if (!it.menuItemId && !it.itemNameSnapshot && !it.name) {
        throw new ApiError(400, 'INVALID_ITEM', `Line item at index ${idx} is missing menuItemId or name.`);
      }
      if (it.quantity != null && (Number(it.quantity) < 1 || !Number.isInteger(Number(it.quantity)))) {
        throw new ApiError(400, 'INVALID_QUANTITY', `Line item ${it.menuItemId || idx} must have an integer quantity >= 1.`);
      }
    }

    if (orderData.paymentMethod && !PAYMENT_METHODS.includes(orderData.paymentMethod)) {
      throw new ApiError(400, 'INVALID_PAYMENT_METHOD', `Unsupported payment method: ${orderData.paymentMethod}.`);
    }

    return true;
  }

  /**
   * Generates a non-persisted preview of an order, computing totals and rendering receipt HTML.
   */
  static async previewReceipt(orderPayload = {}, authContext = {}, cafeContext = null) {
    this.validateOrderPayload(orderPayload);
    const totals = this.calculateTotals({
      lineItems: orderPayload.lineItems,
      discountPaisa: orderPayload.discountPaisa || 0,
      isInterState: Boolean(orderPayload.isInterState),
    });

    const cafeInfo = cafeContext || {
      brandName: 'Zamorin Café',
      legalName: 'Zamorin Hospitality Private Limited',
      gstin: '29AABCT1332L1ZV',
      fssai: '11223344556677',
      address: 'Koramangala, Bengaluru - 560095',
      phone: '+91 80 2555 1234',
    };

    const formattedItems = totals.lineItems.map((li) => ({
      name: li.itemNameSnapshot,
      quantity: li.quantity,
      price: li.unitPricePaisa / 100,
      total: li.lineTotalPaisa / 100,
      notes: li.itemNotes,
    }));

    const previewData = {
      orderId: 'PREVIEW-ONLY',
      billNumber: 'PREVIEW-ONLY',
      date: getIstBusinessDate(),
      time: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }),
      orderType: orderPayload.orderType || 'QUICK_SALE',
      tableNumber: orderPayload.tableNumber || '',
      cashierName: authContext.name || authContext.userId || 'Cashier',
      items: formattedItems,
      subtotal: totals.subtotalPaisa / 100,
      discount: totals.discountPaisa / 100,
      cgst: totals.cgstPaisa / 100,
      sgst: totals.sgstPaisa / 100,
      preRoundingTotal: (totals.preRoundingTotalPaisa || totals.totalPaisa) / 100,
      roundOff: (totals.roundOffPaisa || 0) / 100,
      grandTotal: totals.totalPaisa / 100,
      paymentMethod: orderPayload.paymentMethod || 'CASH',
      upiQrString: orderPayload.upiQrString || `upi://pay?pa=zamorincafe@icici&pn=Zamorin%20Cafe&am=${(totals.totalPaisa / 100).toFixed(2)}&cu=INR`,
    };

    const htmlReceipt = generateFallbackHtmlReceipt(previewData, cafeInfo);

    return {
      success: true,
      action: 'PREVIEW',
      preview: true,
      totals,
      receiptPreviewHtml: htmlReceipt,
      htmlPreview: htmlReceipt,
      formattedSummary: {
        itemCount: totals.lineItems.length,
        subtotalPaisa: totals.subtotalPaisa,
        discountPaisa: totals.discountPaisa,
        taxPaisa: totals.taxPaisa,
        totalPaisa: totals.totalPaisa,
      },
    };
  }

  static async previewOrder(orderPayload = {}, authContext = {}, cafeContext = null) {
    return this.previewReceipt(orderPayload, authContext, cafeContext);
  }

  /**
   * Main POS pipeline for processing orders with explicit actions:
   *  'SAVE', 'PRINT', 'SAVE_AND_PRINT', 'REPRINT', 'PREVIEW'
   */
  static async processOrder(orderPayload = {}, authContext = {}, action = 'SAVE_AND_PRINT', options = {}) {
    const normAction = String(action || 'SAVE_AND_PRINT').trim().toUpperCase();

    // 1. Preview action: Non-persisted preview
    if (normAction === 'PREVIEW') {
      return this.previewReceipt(orderPayload, authContext, options.cafeInfo);
    }

    // 2. Print action on existing bill
    if (normAction === 'PRINT') {
      const targetBillId = normalizeId(orderPayload.billId || options.billId);
      if (!targetBillId) {
        throw new ApiError(400, 'BILL_ID_REQUIRED', 'billId is required to print an existing order.');
      }
      return this.printCommittedBill(targetBillId, authContext, options);
    }

    // 3. Reprint action on existing bill
    if (normAction === 'REPRINT') {
      const targetBillId = normalizeId(orderPayload.billId || options.billId);
      if (!targetBillId) {
        throw new ApiError(400, 'BILL_ID_REQUIRED', 'billId is required to reprint an existing order.');
      }
      return this.reprintBill(targetBillId, authContext, orderPayload.reason || options.reason || 'Customer Request', options);
    }

    // 4. Save or Save & Print actions: requires idempotency check & DB commitment
    if (normAction !== 'SAVE' && normAction !== 'SAVE_AND_PRINT') {
      throw new ApiError(400, 'INVALID_ACTION', `Unsupported POS action: ${action}. Must be SAVE, PRINT, SAVE_AND_PRINT, REPRINT, or PREVIEW.`);
    }

    const cafeId = normalizeId(orderPayload.cafeId);
    const orgId = requireOrganisationId(authContext);
    assertCafeAccess(authContext, cafeId);
    const idempotencyKey = String(orderPayload.idempotencyKey || options.idempotencyKey || '').trim();

    const saleAttemptId = String(
      orderPayload.saleAttemptId ||
      orderPayload.clientOfflineId ||
      (idempotencyKey ? `ATT-${idempotencyKey}` : '')
    ).trim() || null;
    orderPayload.saleAttemptId = saleAttemptId;

    // Check Concurrency / Idempotency Cache
    if (idempotencyKey || saleAttemptId) {
      const lockIdentifier = idempotencyKey || saleAttemptId;
      const cacheKey = `${orgId}:${cafeId}:${lockIdentifier}`;
      const currentFingerprint = computeRequestFingerprint(orderPayload);

      // 1. Memory cache check (instant, synchronous — local process optimization only)
      const cached = idempotencyCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (cached.fingerprint && cached.fingerprint !== currentFingerprint) {
          throw new ApiError(
            409,
            'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
            'The idempotency key was previously submitted with a different transaction payload.'
          );
        }
        return {
          ...cached.response,
          isIdempotentReplay: true,
          correlationId: idempotencyKey,
          saleAttemptId,
        };
      }

      // 2. Concurrency lock check (LOCAL_PROCESS_OPTIMIZATION_ONLY: if another request is in flight in this process, await it)
      if (activeIdempotencyLocks.has(cacheKey)) {
        const inFlightResult = await activeIdempotencyLocks.get(cacheKey);
        return {
          ...inFlightResult,
          isIdempotentReplay: true,
          correlationId: idempotencyKey,
          saleAttemptId,
        };
      }

      // 3. Synchronously acquire lock for this key in local process before ANY async operations
      let resolveLock;
      let rejectLock;
      const lockPromise = new Promise((resolve, reject) => {
        resolveLock = resolve;
        rejectLock = reject;
      });
      // Attach noop error handler to prevent unhandledRejection if no other request awaits this lock
      lockPromise.catch(() => {});
      activeIdempotencyLocks.set(cacheKey, lockPromise);

      try {
        // 4. Authoritative Database Check: check IdempotencyRecord
        if (idempotencyKey) {
          try {
            const existingRecord = await IdempotencyRecord.findOne({
              organisationId: orgId,
              cafeId,
              idempotencyKey,
            });

            if (existingRecord) {
              if (existingRecord.requestFingerprint && existingRecord.requestFingerprint !== currentFingerprint) {
                throw new ApiError(
                  409,
                  'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
                  'The idempotency key was previously submitted with a different transaction payload.'
                );
              }
              if (existingRecord.status === 'COMPLETED' && existingRecord.responseSnapshot) {
                idempotencyCache.set(cacheKey, {
                  response: existingRecord.responseSnapshot,
                  fingerprint: currentFingerprint,
                  expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
                });
                const replayData = {
                  ...existingRecord.responseSnapshot,
                  isIdempotentReplay: true,
                  correlationId: idempotencyKey,
                  saleAttemptId: existingRecord.saleAttemptId || saleAttemptId,
                };
                resolveLock(replayData);
                return replayData;
              }
            }
          } catch (err) {
            if (err.statusCode === 409) throw err;
          }
        }

        // 5. Authoritative Database Check: check Bill by correlationId or saleAttemptId
        const billQuery = { organisationId: orgId, cafeId };
        const queryConditions = [];
        if (idempotencyKey) queryConditions.push({ correlationId: idempotencyKey });
        if (saleAttemptId) queryConditions.push({ saleAttemptId });

        if (queryConditions.length > 0) {
          billQuery.$or = queryConditions;
          const existingBill = await Bill.findOne(billQuery);

          if (existingBill) {
            const billData = typeof existingBill.toObject === 'function' ? existingBill.toObject() : existingBill;
            const responseData = {
              success: true,
              action: normAction,
              saleFinalized: true,
              message: 'Order already committed (Idempotent response).',
              data: billData,
              bill: billData,
              printed: billData.printStatus === 'PRINTED',
              printStatus: billData.printStatus || 'NOT_REQUESTED',
              isIdempotentReplay: true,
              correlationId: idempotencyKey || existingBill.correlationId,
              saleAttemptId: existingBill.saleAttemptId || saleAttemptId,
            };
            idempotencyCache.set(cacheKey, {
              response: responseData,
              fingerprint: currentFingerprint,
              expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
            });
            resolveLock(responseData);
            return responseData;
          }
        }

        // 6. Database Atomic Lock: register IdempotencyRecord with unique index protection
        if (idempotencyKey) {
          try {
            const pendingRecord = new IdempotencyRecord({
              organisationId: orgId,
              cafeId,
              idempotencyKey,
              saleAttemptId,
              requestFingerprint: currentFingerprint,
              status: 'PROCESSING',
            });
            await pendingRecord.save();
          } catch (dbErr) {
            if (dbErr.code === 11000 || String(dbErr.message || '').includes('duplicate key')) {
              const winner = await IdempotencyRecord.findOne({ organisationId: orgId, cafeId, idempotencyKey });
              if (winner) {
                if (winner.requestFingerprint && winner.requestFingerprint !== currentFingerprint) {
                  const conflictErr = new ApiError(
                    409,
                    'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
                    'The idempotency key was previously submitted with a different transaction payload.'
                  );
                  throw conflictErr;
                }
                if (winner.status === 'COMPLETED' && winner.responseSnapshot) {
                  const replayData = {
                    ...winner.responseSnapshot,
                    isIdempotentReplay: true,
                    correlationId: idempotencyKey,
                    saleAttemptId: winner.saleAttemptId || saleAttemptId,
                  };
                  resolveLock(replayData);
                  return replayData;
                }
                // If winner is PROCESSING in another process/worker, poll database until complete
                let pollWinner = winner;
                for (let attempt = 0; attempt < 25; attempt++) {
                  await new Promise((r) => setTimeout(r, 100));
                  pollWinner = await IdempotencyRecord.findOne({ organisationId: orgId, cafeId, idempotencyKey });
                  if (pollWinner?.status === 'COMPLETED' && pollWinner.responseSnapshot) {
                    const replayData = {
                      ...pollWinner.responseSnapshot,
                      isIdempotentReplay: true,
                      correlationId: idempotencyKey,
                      saleAttemptId: pollWinner.saleAttemptId || saleAttemptId,
                    };
                    resolveLock(replayData);
                    return replayData;
                  }
                }
              }
            }
          }
        }

        // 7. Execute order commit
        const result = await this.executeOrderCommit(orderPayload, authContext, normAction, options);

        if (idempotencyKey) {
          try {
            await IdempotencyRecord.findOneAndUpdate(
              { organisationId: orgId, cafeId, idempotencyKey },
              {
                status: 'COMPLETED',
                billId: result.bill?.billId,
                invoiceNumber: result.bill?.invoiceNumber,
                saleAttemptId,
                finalizedAt: new Date(),
                responseSnapshot: result,
              },
              { upsert: true }
            );
          } catch {}
        }

        idempotencyCache.set(cacheKey, {
          response: result,
          fingerprint: currentFingerprint,
          expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
        });
        resolveLock(result);
        return result;
      } catch (err) {
        if (idempotencyKey) {
          try {
            await IdempotencyRecord.deleteOne({ organisationId: orgId, cafeId, idempotencyKey, status: 'PROCESSING' });
          } catch {}
        }
        rejectLock(err);
        throw err;
      } finally {
        activeIdempotencyLocks.delete(cacheKey);
      }
    }

    // No idempotency key provided: execute directly
    return this.executeOrderCommit(orderPayload, authContext, normAction, options);
  }

  /**
   * Internal execution of database commit followed by printer execution.
   */
  static async executeOrderCommit(orderPayload = {}, authContext = {}, action = 'SAVE_AND_PRINT', options = {}) {
    // 1. Validation (Failed Save Protection: if this fails, NO print receipt or drawer pulse is emitted)
    this.validateOrderPayload(orderPayload);

    const cafeId = normalizeId(orderPayload.cafeId);
    const orgId = requireOrganisationId(authContext);
    assertCafeAccess(authContext, cafeId);
    let cutoffHour = 4;

    // REC-13: Validate café operational status before financial commit
    if (cafeId) {
      try {
        const cafeDoc = await Cafe.findOne({ organisationId: orgId, cafeId });
        if (cafeDoc && typeof cafeDoc.businessDayCutoffHour === 'number') {
          cutoffHour = cafeDoc.businessDayCutoffHour;
        }
        if (cafeDoc && ['TEMPORARILY_CLOSED', 'CLOSED', 'SUSPENDED', 'UNDER_REVIEW', 'ARCHIVED'].includes(cafeDoc.status)) {
          throw new ApiError(
            409,
            'CAFE_SUSPENDED_OR_CLOSED',
            `Café ${cafeId} is currently ${cafeDoc.status}. Operational transactions cannot be finalized into a suspended café.`
          );
        }
      } catch (cafeErr) {
        if (cafeErr.statusCode === 409) throw cafeErr;
      }
    }

    const businessDate = orderPayload.businessDate || getIstBusinessDate(new Date(), cutoffHour);
    const datePart = businessDate.replace(/-/g, '');

    // REC-13: Validate catalog pricing version if supplied
    if (orderPayload.catalogVersion && String(orderPayload.catalogVersion).toUpperCase().startsWith('EXPIRED')) {
      throw new ApiError(
        409,
        'CATALOG_VERSION_CONFLICT',
        `Catalog version ${orderPayload.catalogVersion} has expired. Transaction requires authorized conflict review.`
      );
    }

    // 2. Resolve every financial line item from the canonical server catalog.
    // Client-supplied price, tax, item name or catalog existence is never an
    // authoritative input for a committed POS sale.
    const itemIds = (orderPayload.lineItems || [])
      .map((li) => normalizeId(li.menuItemId))
      .filter(Boolean);

    if (itemIds.length !== (orderPayload.lineItems || []).length) {
      throw new ApiError(
        400,
        'POS_CATALOG_ITEM_ID_REQUIRED',
        'Every committed POS line item must reference a canonical menuItemId.'
      );
    }

    let itemsList;
    try {
      const foundItems = await MenuItem.find({
        organisationId: orgId,
        menuItemId: { $in: [...new Set(itemIds)] },
      });
      itemsList = foundItems && typeof foundItems.lean === 'function'
        ? await foundItems.lean()
        : foundItems;
    } catch (catalogError) {
      throw new ApiError(
        503,
        'POS_CATALOG_UNAVAILABLE',
        'The canonical POS catalog could not be verified. The sale was not committed.'
      );
    }

    const itemMap = {};
    if (Array.isArray(itemsList)) {
      for (const item of itemsList) {
        const id = normalizeId(item?.menuItemId);
        if (id) itemMap[id] = item;
      }
    }

    // REC-13 / REC-04B: Server Catalog Financial Authority.
    const enrichedItems = orderPayload.lineItems.map((li) => {
      const menuItemId = normalizeId(li.menuItemId);
      const catalogItem = itemMap[menuItemId];

      if (!catalogItem) {
        throw new ApiError(
          409,
          'POS_CATALOG_ITEM_NOT_FOUND',
          `Menu item ${menuItemId} does not exist in the canonical organisation catalog.`
        );
      }

      const lifecycleStatus = normalizeId(catalogItem.status || 'ACTIVE');
      if (lifecycleStatus !== 'ACTIVE') {
        throw new ApiError(
          409,
          'POS_CATALOG_ITEM_UNAVAILABLE',
          `Menu item ${menuItemId} is not active for POS sale.`
        );
      }

      const availableCafeIds = Array.isArray(catalogItem.availableCafeIds)
        ? catalogItem.availableCafeIds.filter(Boolean).map(normalizeId)
        : [];
      if (availableCafeIds.length > 0 && !availableCafeIds.includes(cafeId)) {
        throw new ApiError(
          409,
          'POS_CATALOG_ITEM_NOT_AVAILABLE_AT_CAFE',
          `Menu item ${menuItemId} is not available at café ${cafeId}.`
        );
      }

      const authoritativeUnitPrice = Number(catalogItem.currentPricePaisa);
      if (!Number.isInteger(authoritativeUnitPrice) || authoritativeUnitPrice < 0) {
        throw new ApiError(
          503,
          'POS_CATALOG_PRICE_INVALID',
          `Menu item ${menuItemId} does not have a valid canonical price.`
        );
      }

      const authoritativeTaxRate =
        Number.isFinite(Number(catalogItem.taxRatePercent))
          ? Number(catalogItem.taxRatePercent)
          : 5;

      const explicitTaxClassification = normalizeId(catalogItem.taxClassification || '');
      const taxClassification =
        ['GST_5', 'GST_12', 'GST_18', 'GST_28', 'EXEMPT', 'NIL'].includes(explicitTaxClassification)
          ? explicitTaxClassification
          : ([5, 12, 18, 28].includes(authoritativeTaxRate)
              ? `GST_${authoritativeTaxRate}`
              : (authoritativeTaxRate === 0 ? 'NIL' : 'GST_5'));

      return {
        ...li,
        menuItemId,
        itemNameSnapshot: catalogItem.name || catalogItem.receiptName || catalogItem.posShortName || menuItemId,
        unitPricePaisa: authoritativeUnitPrice,
        taxRatePercent: authoritativeTaxRate,
        taxClassification,
      };
    });

    // 3. Calculate Totals
    const totals = this.calculateTotals({
      lineItems: enrichedItems,
      discountPaisa: orderPayload.discountPaisa || 0,
      isInterState: Boolean(orderPayload.isInterState),
    });

    // 4. Generate Official Receipt and Statutory GST Invoice Number (Rule 46(b) <= 16 chars)
    let billId = null;
    let invoiceNumber = null;

    try {
      billId = await SequenceCounter.generateId({
        organisationId: orgId,
        sequenceKey: `BILL_${datePart}`,
        prefix: `BILL-${datePart}`,
        minimumDigits: 4,
      });
    } catch (sequenceError) {
      if (process.env.NODE_ENV === 'production') {
        throw new ApiError(
          503,
          'POS_SEQUENCE_UNAVAILABLE',
          'Unable to allocate a canonical POS bill number. The sale was not committed.'
        );
      }
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      billId = `BILL-${datePart}-${randSuffix}`;
    }

    try {
      const invoiceAlloc = await allocateInvoiceNumber({
        organisationId: orgId,
        cafeId,
        financialYear: orderPayload.financialYear || '2026-27',
        statutorySeriesCode: 'P',
        seriesPrefix: 'P',
      });
      invoiceNumber = invoiceAlloc.invoiceNumber;
    } catch (invoiceError) {
      if (process.env.NODE_ENV === 'production') {
        throw new ApiError(
          503,
          'POS_INVOICE_SEQUENCE_UNAVAILABLE',
          'Unable to allocate the canonical tax invoice number. The sale was not committed.'
        );
      }
      const compactBranch = cafeId.replace(/[^A-Za-z0-9]/g, '').slice(-4).padStart(2, '0');
      const seqTail = billId.split('-').pop();
      invoiceNumber = `P/${compactBranch}/2627/${seqTail}`.slice(0, 16);
    }

    // 5. Canonical settlement: every financial side effect derives from the same
    // validated tender allocation persisted on the Bill.
    const requestedPaymentMethod = normalizeId(orderPayload.paymentMethod || 'CASH') || 'CASH';
    const isImmediateCompletion = orderPayload.isImmediateCompletion !== false;
    const initialStatus = isImmediateCompletion ? 'COMPLETED' : 'OPEN';
    const paymentStatus = isImmediateCompletion ? 'PAID' : 'UNPAID';

    const tenders = Array.isArray(orderPayload.tenders) && orderPayload.tenders.length > 0
      ? orderPayload.tenders.map((t) => ({
          paymentMethod: normalizeId(t.paymentMethod || requestedPaymentMethod),
          amountPaisa: Math.round(Number(t.amountPaisa || 0)),
          status: 'COMPLETED',
          provider: t.provider || '',
          paymentReference: t.paymentReference || '',
          upiReference: t.upiReference || '',
          maskedCard: t.maskedCard || '',
          transactionTimestamp: new Date(),
        }))
      : isImmediateCompletion
        ? [
            {
              paymentMethod: requestedPaymentMethod,
              amountPaisa: totals.totalPaisa,
              status: 'COMPLETED',
              provider: orderPayload.provider || '',
              paymentReference: orderPayload.paymentReference || '',
              upiReference: orderPayload.upiReference || '',
              transactionTimestamp: new Date(),
            },
          ]
        : [];

    if (isImmediateCompletion) {
      if (tenders.length === 0) {
        throw new ApiError(400, 'PAYMENT_TENDER_REQUIRED', 'A completed sale requires at least one payment tender.');
      }
      for (const tender of tenders) {
        if (!SETTLEMENT_TENDER_METHODS.has(tender.paymentMethod)) {
          throw new ApiError(
            400,
            'INVALID_TENDER_PAYMENT_METHOD',
            `Tender payment method ${tender.paymentMethod || 'UNKNOWN'} is not a settlement method.`
          );
        }
        if (!Number.isInteger(tender.amountPaisa) || tender.amountPaisa <= 0) {
          throw new ApiError(400, 'INVALID_TENDER_AMOUNT', 'Each completed payment tender must have a positive integer amountPaisa.');
        }
      }
      const tenderTotalPaisa = tenders.reduce((sum, tender) => sum + tender.amountPaisa, 0);
      if (tenderTotalPaisa !== totals.totalPaisa) {
        throw new ApiError(
          409,
          'PAYMENT_SETTLEMENT_MISMATCH',
          `Tender total ${tenderTotalPaisa} does not equal bill total ${totals.totalPaisa} paisa.`
        );
      }
    }

    const distinctTenderMethods = [...new Set(tenders.map((t) => t.paymentMethod))];
    const paymentMethod = isImmediateCompletion
      ? (distinctTenderMethods.length > 1 ? 'MIXED' : (distinctTenderMethods[0] || requestedPaymentMethod))
      : requestedPaymentMethod;
    const cashPaidPaisa = tenders
      .filter((t) => t.paymentMethod === 'CASH')
      .reduce((sum, t) => sum + t.amountPaisa, 0);
    const upiPaidPaisa = tenders
      .filter((t) => t.paymentMethod === 'UPI')
      .reduce((sum, t) => sum + t.amountPaisa, 0);
    const cardPaidPaisa = tenders
      .filter((t) => t.paymentMethod === 'CARD')
      .reduce((sum, t) => sum + t.amountPaisa, 0);
    const isTraining = Boolean(orderPayload.isTraining || options.isTraining);
    const registerSessionId = normalizeId(orderPayload.registerSessionId || '');
    const registerId = normalizeId(orderPayload.registerId || '');

    if (registerSessionId && !registerId) {
      throw new ApiError(
        400,
        'REGISTER_ID_REQUIRED',
        'registerId is required whenever registerSessionId is supplied.'
      );
    }

    if (!isTraining && registerSessionId) {
      const scopedSession = await RegisterSession.findOne({
        registerSessionId,
        organisationId: orgId,
        cafeId,
        registerId,
        status: 'OPEN',
      });
      if (!scopedSession) {
        throw new ApiError(
          409,
          'REGISTER_SESSION_SCOPE_MISMATCH',
          'The supplied register session is not open in the authenticated organisation/café/register scope.'
        );
      }
    }

    const idempotencyKey = String(orderPayload.idempotencyKey || options.idempotencyKey || '').trim();

    // 6. Persist to MongoDB (Atomicity Guaranteed)
    const billDoc = new Bill({
      billId,
      invoiceNumber,
      organisationId: orgId,
      cafeId,
      orderType: orderPayload.orderType || 'QUICK_SALE',
      serviceMode: orderPayload.serviceMode || orderPayload.orderType || 'QUICK_SALE',
      guestCovers: Math.max(1, Number(orderPayload.guestCovers || 1)),
      tableNumber: String(orderPayload.tableNumber || '').trim(),
      tableToken: String(orderPayload.tableToken || '').trim(),
      customerName: String(orderPayload.customerName || '').trim(),
      customerPhone: String(orderPayload.customerPhone || '').trim(),
      b2bCustomerGstin: normalizeId(orderPayload.b2bCustomerGstin || ''),
      b2bCustomerLegalName: String(orderPayload.b2bCustomerLegalName || '').trim(),
      registerId,
      registerSessionId,
      financialYear: orderPayload.financialYear || '2026-2027',
      lineItems: totals.lineItems,
      subtotalPaisa: totals.subtotalPaisa,
      discountPaisa: totals.discountPaisa,
      taxPaisa: totals.taxPaisa,
      cgstPaisa: totals.cgstPaisa,
      sgstPaisa: totals.sgstPaisa,
      igstPaisa: totals.igstPaisa,
      preRoundingTotalPaisa: totals.preRoundingTotalPaisa || totals.totalPaisa,
      roundOffPaisa: totals.roundOffPaisa || 0,
      totalPaisa: totals.totalPaisa,
      taxRuleVersion: totals.taxRuleVersion || TAX_RULE_VERSION,
      roundingPolicyVersion: totals.roundingPolicyVersion || ROUNDING_POLICY_VERSION,
      paymentMethod,
      paymentStatus,
      status: initialStatus,
      tenders,
      reprints: [],
      refunds: [],
      isTraining,
      printStatus: action === 'SAVE_AND_PRINT' ? 'PRINT_PENDING' : 'NOT_REQUESTED',
      printJobs: [],
      businessDate,
      cashierUserId:
        options.originatingCashierUserId ||
        authContext.userId ||
        'CASHIER-01',
      correlationId: idempotencyKey || null,
      saleAttemptId: orderPayload.saleAttemptId || null,
      isOfflineReplay: Boolean(orderPayload.isOfflineReplay || options.isOfflineReplay),
      clientOfflineId: orderPayload.clientOfflineId || null,
      offlineCreatedAt: orderPayload.offlineCreatedAt ? new Date(orderPayload.offlineCreatedAt) : null,
      reviewedByUserId: orderPayload.reviewedByUserId || options.reviewedByUserId || null,
      reviewedByRole: orderPayload.reviewedByRole || options.reviewedByRole || null,
      reviewReason: orderPayload.reviewReason || options.reviewReason || null,
      reviewId: orderPayload.reviewId || options.reviewId || null,
    });

    try {
      await billDoc.save();
    } catch (saveErr) {
      if (saveErr.code === 11000 || String(saveErr.message || '').includes('duplicate key')) {
        // Multi-process / concurrent collision guard: look up existing bill by saleAttemptId or correlationId
        const existingAttemptBill = await Bill.findOne({
          organisationId: orgId,
          cafeId,
          ...(orderPayload.saleAttemptId ? { saleAttemptId: orderPayload.saleAttemptId } : { correlationId: idempotencyKey }),
        });
        if (existingAttemptBill) {
          const billData = typeof existingAttemptBill.toObject === 'function' ? existingAttemptBill.toObject() : existingAttemptBill;
          return {
            success: true,
            action,
            saleFinalized: true,
            message: 'Order already committed (Sale attempt deduplicated).',
            data: billData,
            bill: billData,
            printed: billData.printStatus === 'PRINTED',
            printStatus: billData.printStatus || 'NOT_REQUESTED',
            isIdempotentReplay: true,
            correlationId: existingAttemptBill.correlationId || idempotencyKey,
            saleAttemptId: existingAttemptBill.saleAttemptId || orderPayload.saleAttemptId,
          };
        }
      }
      throw saveErr;
    }

    // 6.5. Inventory Depletion via FEFO — Executed exactly once per committed sale (Skipped in Isolated Training Mode)
    if (!billDoc.isTraining) {
      try {
        const bomResult = await BomDepletionService.depleteOrderBOM({
          organisationId: orgId,
          cafeId,
          lineItems: totals.lineItems,
          billId,
          referenceType: 'POS_SALE',
          userId: authContext.userId || 'CASHIER-01',
          businessDate,
        });
        // Mark successful depletion on bill
        const deplStatus = bomResult?.alreadyDepleted ? 'ALREADY_DEPLETED' : 'DEPLETED';
        try {
          billDoc.bomDepletionStatus = deplStatus;
          await billDoc.save();
        } catch { /* non-fatal */ }
      } catch (invErr) {
        console.warn('[POS] BOM depletion failed for bill', billId, invErr?.message);
        try {
          billDoc.bomDepletionStatus = 'FAILED';
          billDoc.bomDepletionError = String(invErr?.message || 'UNKNOWN').slice(0, 250);
          await billDoc.save();
        } catch { /* non-fatal */ }

        try {
          await PosReconciliationService.recordReconciliationFailure({
            organisationId: orgId,
            cafeId,
            billId,
            invoiceNumber,
            effectType: 'BOM_DEPLETION',
            error: invErr,
            expectedAmount: 0,
            payloadSnapshot: { lineItems: totals.lineItems, businessDate },
          });
        } catch (recErr) {
          console.error('[POS] Failed to record BOM reconciliation job for bill', billId, recErr?.message);
        }
      }
    } else {
      billDoc.bomDepletionStatus = 'TRAINING_MODE_SKIPPED';
      await billDoc.save().catch(() => {});
    }

    // 7. Post-save operations: Register Session & Cash Book (Skipped in Isolated Training Mode)
    if (!billDoc.isTraining && registerSessionId) {
      try {
        const registerUpdate = {
          $inc: {
            orderCount: 1,
            totalSalesPaisa: totals.totalPaisa,
            totalCashSalesPaisa: cashPaidPaisa,
            totalUpiSalesPaisa: upiPaidPaisa,
            totalCardSalesPaisa: cardPaidPaisa,
          },
          $addToSet: { settledBillIds: billId },
        };
        if (cashPaidPaisa > 0) {
          registerUpdate.$push = {
            cashEvents: {
              eventType: 'CASH_SALE',
              amountPaisa: cashPaidPaisa,
              reason: `Bill ${billId}`,
              actorId: authContext.userId,
              reference: billId,
              timestamp: new Date(),
            },
          };
        }

        const updatedSession = await RegisterSession.findOneAndUpdate(
          {
            registerSessionId,
            organisationId: orgId,
            cafeId,
            registerId,
            status: 'OPEN',
            settledBillIds: { $ne: billId },
          },
          registerUpdate,
          { new: true }
        );

        if (!updatedSession) {
          const alreadySettled = await RegisterSession.findOne({
            registerSessionId,
            organisationId: orgId,
            cafeId,
            registerId,
            status: 'OPEN',
            settledBillIds: billId,
          });
          if (!alreadySettled) {
            throw new ApiError(
              409,
              'REGISTER_SESSION_SETTLEMENT_CONFLICT',
              'The committed bill could not be applied to its scoped register session.'
            );
          }
        }
      } catch (err) {
        console.error('Failed to update register session for bill', billId, err);
        try {
          await PosReconciliationService.recordReconciliationFailure({
            organisationId: orgId,
            cafeId,
            billId,
            invoiceNumber,
            effectType: 'REGISTER_SESSION',
            error: err,
            expectedAmount: totals.totalPaisa,
            payloadSnapshot: {
              registerSessionId,
              registerId,
              totalSalesPaisa: totals.totalPaisa,
              cashPaidPaisa,
              upiPaidPaisa,
              cardPaidPaisa,
              cashierUserId:
                options.originatingCashierUserId ||
                authContext.userId,
              businessDate,
            },
          });
        } catch (recErr) {
          console.error('[POS] Failed to record Register Session reconciliation job for bill', billId, recErr?.message);
        }
      }
    }

    if (isImmediateCompletion && cashPaidPaisa > 0) {
      try {
        const ctSeqId = await SequenceCounter.generateId({
          organisationId: orgId,
          sequenceKey: `CASH_TX_${datePart}`,
          prefix: `CT-${datePart}`,
          minimumDigits: 4,
        });

        const cashTx = new CashTransaction({
          cashTransactionId: ctSeqId,
          organisationId: orgId,
          cafeId,
          businessDate,
          transactionType: 'CASH_IN',
          direction: 'IN',
          category: 'POS_SALE',
          amount: Math.max(0.01, cashPaidPaisa / 100),
          paymentMethod: 'CASH',
          status: 'POSTED',
          description: `POS Sale Receipt #${invoiceNumber}`,
          referenceType: 'BILL',
          referenceId: billId,
          recordedBy: authContext.userId,
          createdBy: authContext.userId,
        });

        await cashTx.save();
      } catch (err) {
        console.error('Failed to auto-post cash transaction for bill', billId, err);
        // REC-04B: Mandatory durable reconciliation job for failed Cash Ledger posting
        try {
          await PosReconciliationService.recordReconciliationFailure({
            organisationId: orgId,
            cafeId,
            billId,
            invoiceNumber,
            effectType: 'CASH_LEDGER',
            error: err,
            expectedAmount: Math.max(0.01, cashPaidPaisa / 100),
            payloadSnapshot: {
              amount: Math.max(0.01, cashPaidPaisa / 100),
              invoiceNumber,
              businessDate,
              cashierUserId:
                options.originatingCashierUserId ||
                authContext.userId,
            },
          });
        } catch (recErr) {
          console.error('[POS] Failed to record Cash Ledger reconciliation job for bill', billId, recErr?.message);
        }
      }
    }

    // 8. Audit Logging
    try {
      await auditService.recordRequestAudit({
        request: {
          auth: authContext,
          correlationId: idempotencyKey || null,
        },
        module: 'POS_BILLING',
        action: 'CREATE_BILL',
        entityType: 'BILL',
        entityId: billId,
        after: {
          billId,
          invoiceNumber,
          cafeId,
          totalPaisa: totals.totalPaisa,
          status: billDoc.status,
          paymentMethod,
        },
        result: 'SUCCESS',
        riskClassification: 'LOW',
      });
    } catch {
      // Audit non-fatal
    }

    const savedBillData = typeof billDoc.toObject === 'function' ? billDoc.toObject() : billDoc;

    // 9. If action is SAVE, return immediately without printing
    if (action === 'SAVE') {
      return {
        success: true,
        action: 'SAVE',
        saleFinalized: true,
        message: 'Order saved successfully.',
        bill: savedBillData,
        data: savedBillData,
        printed: false,
        printStatus: 'NOT_REQUESTED',
        printBuffer: null,
      };
    }

    // 10. If action is SAVE_AND_PRINT: compile receipt and handle printer failure safely
    // Safe Printer Failure Resilience: DB commit is NEVER rolled back if printer fails!
    const printJobId = createPrintJobId('RECEIPT');
    try {
      if (options.simulatePrinterFailure) {
        throw new Error('Simulated printer hardware timeout / disconnect.');
      }

      const printResult = await this.generatePrintArtifacts(savedBillData, {
        ...options,
        allowDrawerKick: true,
      });
      const dispatchedDeviceId = resolveDispatchDeviceId(authContext, cafeId);
      const attestationBinding = await resolveAttestationBinding(authContext, cafeId);
      const drawerKickRequested = printResult.drawerKickIncluded === true;

      let printTrackingPersisted = false;
      let billPrintStatePersisted = false;
      const printTrackingWarnings = [];

      try {
        const pj = new PrintJob({
          printJobId,
          organisationId: orgId,
          cafeId,
          billId,
          invoiceNumber,
          jobType: 'RECEIPT',
          status: 'DISPATCHED',
          requestedBy: authContext.userId || 'CASHIER',
          dispatchedDeviceId,
          ackChallenge: attestationBinding.challenge,
          ackChallengeIssuedAt: attestationBinding.challengeIssuedAt,
          ackChallengeExpiresAt: attestationBinding.challengeExpiresAt,
          attestationVersion: PRINT_ATTESTATION_VERSION,
          payloadSha256: printResult.payloadSha256,
          payloadBytes: printResult.payloadBytes,
          printerTarget: 'DEFAULT_THERMAL',
          attestationRequired: attestationBinding.required,
          attestationKeyThumbprint: attestationBinding.keyThumbprint,
          attestationKeyProvider: attestationBinding.keyProvider,
          attestationKeyHardwareBackedVerified: attestationBinding.keyHardwareBackedVerified,
          attestationKeyHardwareSecurityLevel: attestationBinding.keyHardwareSecurityLevel,
          drawerKickRequested,
          drawerKickStatus: drawerKickRequested ? 'REQUESTED' : 'NOT_REQUESTED',
          printBufferBase64: printResult.printBufferBase64,
          htmlPreview: printResult.htmlPreview,
        });
        await pj.save();
        printTrackingPersisted = true;
      } catch (trackingErr) {
        printTrackingWarnings.push('PRINT_JOB_PERSISTENCE_FAILED');
        console.error('[POS Print] Failed to persist dispatched PrintJob', printJobId, trackingErr);
      }

      const printDispatchAuthorized = printTrackingPersisted === true;

      try {
        billDoc.printStatus = printDispatchAuthorized ? 'PRINT_DISPATCHED' : 'PRINT_PENDING';
        billDoc.printJobs = billDoc.printJobs || [];
        if (printDispatchAuthorized) {
          billDoc.printJobs.push({
            printJobId,
            jobType: 'RECEIPT',
            status: 'DISPATCHED',
            dispatchedAt: new Date(),
            dispatchedDeviceId,
            attestationRequired: attestationBinding.required,
            attestationVersion: PRINT_ATTESTATION_VERSION,
            attestationKeyThumbprint: attestationBinding.keyThumbprint,
            attestationKeyProvider: attestationBinding.keyProvider,
            attestationKeyHardwareBackedVerified: attestationBinding.keyHardwareBackedVerified,
            attestationKeyHardwareSecurityLevel: attestationBinding.keyHardwareSecurityLevel,
            payloadSha256: printResult.payloadSha256,
            payloadBytes: printResult.payloadBytes,
            printerTarget: 'DEFAULT_THERMAL',
            transportMode: 'UNBOUND',
            evidenceLevel: 'NONE',
            contentBindingVerified: false,
            printerIdentityVerified: false,
            drawerKickRequested,
            drawerKickStatus: drawerKickRequested ? 'REQUESTED' : 'NOT_REQUESTED',
          });
        }
        await billDoc.save();
        savedBillData.printStatus = billDoc.printStatus;
        billPrintStatePersisted = true;
      } catch (billPrintErr) {
        printTrackingWarnings.push('BILL_PRINT_STATE_PERSISTENCE_FAILED');
        console.error('[POS Print] Failed to persist bill print dispatch state', billId, billPrintErr);
      }

      return {
        success: true,
        action: 'SAVE_AND_PRINT',
        saleFinalized: true,
        message: printDispatchAuthorized
          ? 'Order saved and receipt dispatch is durably tracked.'
          : 'Order saved, but automatic receipt dispatch was withheld because durable print tracking is unavailable.',
        bill: savedBillData,
        data: savedBillData,
        printed: false,
        printDispatched: printDispatchAuthorized,
        printDispatchAuthorized,
        printStatus: printDispatchAuthorized ? 'PRINT_DISPATCHED' : 'PRINT_PENDING',
        printJobId: printDispatchAuthorized ? printJobId : null,
        printTrackingPersisted,
        billPrintStatePersisted,
        printTrackingWarning: printTrackingWarnings[0] || null,
        printTrackingWarnings,
        printDispatchBlockedReason: printDispatchAuthorized ? null : 'PRINT_JOB_PERSISTENCE_FAILED',
        reprintAvailable: !printDispatchAuthorized,
        dispatchedDeviceId: printDispatchAuthorized ? dispatchedDeviceId : null,
        deviceAcknowledgementRequired: printDispatchAuthorized && attestationBinding.required,
        deviceAcknowledgementSupported: attestationBinding.supported,
        deviceAcknowledgementPlatform: attestationBinding.platform,
        deviceAcknowledgementUnavailableReason: attestationBinding.unavailableReason,
        cryptographicAttestationRequired: printDispatchAuthorized && attestationBinding.required,
        attestationAlgorithm: printDispatchAuthorized ? attestationBinding.algorithm : null,
        attestationKeyThumbprint: printDispatchAuthorized ? attestationBinding.keyThumbprint : null,
        attestationKeyProvider: printDispatchAuthorized ? attestationBinding.keyProvider : null,
        attestationKeyHardwareBackedVerified: printDispatchAuthorized && attestationBinding.keyHardwareBackedVerified === true,
        attestationKeyHardwareSecurityLevel: printDispatchAuthorized ? attestationBinding.keyHardwareSecurityLevel : 'UNKNOWN',
        ackChallenge: printDispatchAuthorized ? attestationBinding.challenge : null,
        ackChallengeIssuedAt: printDispatchAuthorized ? attestationBinding.challengeIssuedAt : null,
        ackChallengeExpiresAt: printDispatchAuthorized ? attestationBinding.challengeExpiresAt : null,
        attestationContext: printDispatchAuthorized && attestationBinding.required ? {
          version: PRINT_ATTESTATION_VERSION,
          algorithm: ATTESTATION_ALGORITHM,
          organisationId: orgId,
          cafeId,
          deviceId: dispatchedDeviceId,
          printJobId,
          challenge: attestationBinding.challenge,
          challengeIssuedAtEpochMs: attestationBinding.challengeIssuedAtEpochMs,
          challengeExpiresAtEpochMs: attestationBinding.challengeExpiresAtEpochMs,
          expectedPayloadSha256: printResult.payloadSha256,
          expectedPayloadBytes: printResult.payloadBytes,
          printerTarget: 'DEFAULT_THERMAL',
        } : null,
        drawerKickRequested,
        drawerKickStatus: drawerKickRequested ? 'REQUESTED' : 'NOT_REQUESTED',
        printBuffer: printDispatchAuthorized ? printResult.printBufferBase64 : null,
        htmlPreview: printResult.htmlPreview,
        rawBuffer: printDispatchAuthorized ? printResult.rawBuffer : null,
      };
    } catch (printerErr) {
      // THE TRANSACTION REMAINS COMMITTED!
      try {
        const pj = new PrintJob({
          printJobId,
          organisationId: orgId,
          cafeId,
          billId,
          invoiceNumber,
          jobType: 'RECEIPT',
          status: 'FAILED',
          failureCode: 'PRINTER_OFFLINE',
          failureReason: printerErr.message,
          requestedBy: authContext.userId || 'CASHIER',
        });
        await pj.save();
        billDoc.printStatus = 'PRINT_FAILED';
        billDoc.printJobs = billDoc.printJobs || [];
        billDoc.printJobs.push({
          printJobId,
          jobType: 'RECEIPT',
          status: 'FAILED',
          failureCode: 'PRINTER_OFFLINE',
        });
        await billDoc.save();
      } catch (trackingErr) {
        console.error('[POS Print] Failed to persist printer-failure audit state', printJobId, trackingErr);
      }

      return {
        success: true,
        action: 'SAVE_AND_PRINT',
        saleFinalized: true,
        message: 'Order committed to database, but receipt printer failed.',
        bill: savedBillData,
        data: savedBillData,
        printed: false,
        printStatus: 'PRINT_FAILED',
        printerWarning: 'PRINTER_OFFLINE',
        printerError: printerErr.message || 'Thermal printer communication error.',
        reprintAvailable: true,
      };
    }
  }

  /**
   * Helper to compile ESC/POS binary buffer, drawer kick, and HTML preview.
   */
  static async generatePrintArtifacts(billData = {}, options = {}) {
    let cafeInfo = options.cafeInfo;
    if (!cafeInfo && billData.cafeId) {
      try {
        const foundCafe = await Cafe.findOne({
          organisationId: billData.organisationId,
          cafeId: billData.cafeId,
        });
        if (foundCafe) {
          const cafeObj = typeof foundCafe.toObject === 'function' ? foundCafe.toObject() : foundCafe;
          cafeInfo = {
            brandName: cafeObj.name || 'ZAMORIN CAFE',
            legalName: cafeObj.legalName || 'Zamorin Hospitality Private Limited',
            gstin: cafeObj.gstin || '29AABCT1332L1ZV',
            fssai: cafeObj.fssaiLicenseNumber || cafeObj.fssai || '11223344556677',
            address: cafeObj.address?.line1 ? `${cafeObj.address.line1}, ${cafeObj.address.city || ''} - ${cafeObj.address.pincode || ''}` : 'Koramangala, Bengaluru',
            phone: cafeObj.contactPhone || '+91 80 2555 1234',
          };
        }
      } catch {
        // Fallback default info
      }
    }

    if (!cafeInfo) {
      cafeInfo = {
        brandName: 'ZAMORIN CAFE',
        legalName: 'Zamorin Hospitality Private Limited',
        gstin: '29AABCT1332L1ZV',
        fssai: '11223344556677',
        address: 'Koramangala, Bengaluru - 560095',
        phone: '+91 80 2555 1234',
      };
    }

    const items = (billData.lineItems || []).map((li) => ({
      name: li.itemNameSnapshot || li.name || 'Item',
      quantity: li.quantity || 1,
      price: (li.unitPricePaisa || 0) / 100,
      total: (li.lineTotalPaisa || (li.unitPricePaisa * li.quantity) || 0) / 100,
      notes: li.itemNotes || '',
    }));

    const orderDataForPrinter = {
      orderId: billData.billId,
      billNumber: billData.invoiceNumber || billData.billId,
      date: billData.businessDate || getIstBusinessDate(),
      time: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }),
      orderType: billData.orderType || billData.serviceMode || 'QUICK_SALE',
      tableNumber: billData.tableNumber || '',
      cashierName: billData.cashierUserId || 'Cashier',
      items,
      subtotal: (billData.subtotalPaisa || 0) / 100,
      discount: (billData.discountPaisa || 0) / 100,
      cgst: (billData.cgstPaisa || 0) / 100,
      sgst: (billData.sgstPaisa || 0) / 100,
      preRoundingTotal: (billData.preRoundingTotalPaisa || billData.totalPaisa || 0) / 100,
      roundOff: (billData.roundOffPaisa || 0) / 100,
      grandTotal: (billData.totalPaisa || 0) / 100,
      paymentMethod: billData.paymentMethod || 'CASH',
      isReprint: Boolean(options.isReprint),
      reprintCount: options.reprintCount || (billData.reprints ? billData.reprints.length : 0),
      isVoid: billData.status === 'VOIDED',
      triggerDrawerKick: options.allowDrawerKick === true && hasCashTender(billData),
      upiQrString: billData.upiPaymentIntent?.upiString || `upi://pay?pa=zamorin@icici&pn=Zamorin%20Cafe&am=${((billData.totalPaisa || 0) / 100).toFixed(2)}&tr=${billData.billId}`,
    };

    const terminalConfig = options.terminalConfig || {
      printerConfig: { paperWidth: 80, cutType: 'PARTIAL' },
      drawerConfig: { enabled: true, pin: 2 },
    };

    const escPosBuffer = compileThermalReceipt(orderDataForPrinter, terminalConfig, cafeInfo);
    const htmlReceipt = generateFallbackHtmlReceipt(orderDataForPrinter, cafeInfo);

    return {
      rawBuffer: escPosBuffer,
      printBufferBase64: escPosBuffer.toString('base64'),
      payloadSha256: crypto.createHash('sha256').update(escPosBuffer).digest('hex'),
      payloadBytes: escPosBuffer.length,
      htmlPreview: htmlReceipt,
      drawerKickIncluded: orderDataForPrinter.triggerDrawerKick === true,
    };
  }

  /**
   * REC-04C: Accepts a terminal print result only from the exact active café-owned
   * device that received the dispatched print job. Browser print dialogs are not
   * eligible to self-assert physical completion.
   */
  static async acknowledgePrintJob(printJobId, authContext = {}, acknowledgement = {}) {
    const orgId = requireOrganisationId(authContext);
    const normPrintJobId = normalizeId(printJobId);
    const ackStatus = normalizeId(acknowledgement.status);
    const allowedStatuses = new Set(['PRINTED', 'FAILED', 'CANCELLED']);

    if (!normPrintJobId) {
      throw new ApiError(400, 'PRINT_JOB_ID_REQUIRED', 'printJobId is required.');
    }
    if (!allowedStatuses.has(ackStatus)) {
      throw new ApiError(
        400,
        'INVALID_PRINT_ACK_STATUS',
        'Print acknowledgement status must be PRINTED, FAILED, or CANCELLED.'
      );
    }

    const device = authContext.deviceContext || {};
    const deviceId = normalizeId(device.deviceId);
    const boundCafeId = normalizeId(device.boundCafeId);
    if (
      !deviceId ||
      deviceId === 'UNKNOWN_PERSONAL_DEVICE' ||
      normalizeId(device.deviceClass) !== 'CAFE_OWNED' ||
      normalizeId(device.status) !== 'ACTIVE' ||
      !boundCafeId
    ) {
      throw new ApiError(
        403,
        'PRINT_DEVICE_TRUST_REQUIRED',
        'Physical print acknowledgement requires an active café-owned device.'
      );
    }

    const operatorSessionId = normalizeId(authContext.operatorSessionId);
    if (!operatorSessionId) {
      throw new ApiError(
        403,
        'ACTIVE_OPERATOR_SESSION_REQUIRED',
        'Physical print acknowledgement requires an active operator session bound to this device.'
      );
    }

    const operatorSession = await OperatorSession.findOne({
      operatorSessionId,
      organisationId: orgId,
      cafeId: boundCafeId,
      deviceId,
      operatorUserId: normalizeId(authContext.userId),
      status: 'ACTIVE',
    }).lean();

    if (!operatorSession) {
      throw new ApiError(
        403,
        'OPERATOR_SESSION_DEVICE_MISMATCH',
        'The active operator session could not be verified for this user, café, and device.'
      );
    }

    const job = await PrintJob.findOne({
      organisationId: orgId,
      printJobId: normPrintJobId,
    });
    if (!job) {
      throw new ApiError(404, 'PRINT_JOB_NOT_FOUND', 'Print job does not exist in the authenticated organisation.');
    }

    const jobCafeId = normalizeId(job.cafeId);
    if (jobCafeId !== boundCafeId) {
      throw new ApiError(
        403,
        'CROSS_CAFE_PRINT_ACK_DENIED',
        'The acknowledging device is not bound to the print job café.'
      );
    }

    const dispatchedDeviceId = normalizeId(job.dispatchedDeviceId);
    if (!dispatchedDeviceId) {
      throw new ApiError(
        409,
        'PRINT_JOB_NOT_DEVICE_BOUND',
        'This print job was not dispatched to a verifiable café-owned device and cannot be marked physically complete.'
      );
    }
    if (dispatchedDeviceId !== deviceId) {
      throw new ApiError(
        403,
        'PRINT_JOB_DEVICE_MISMATCH',
        'Only the device that received this print job may acknowledge its physical result.'
      );
    }

    const requestedDrawerStatus = acknowledgement.drawerKickStatus
      ? normalizeId(acknowledgement.drawerKickStatus)
      : null;
    if (requestedDrawerStatus) {
      const allowedDrawerStatuses = new Set(['ACKNOWLEDGED', 'FAILED', 'UNKNOWN']);
      if (!job.drawerKickRequested) {
        throw new ApiError(
          409,
          'DRAWER_ACK_NOT_APPLICABLE',
          'This print job did not request a cash drawer kick.'
        );
      }
      if (!allowedDrawerStatuses.has(requestedDrawerStatus)) {
        throw new ApiError(
          400,
          'INVALID_DRAWER_ACK_STATUS',
          'drawerKickStatus must be ACKNOWLEDGED, FAILED, or UNKNOWN.'
        );
      }
    }

    const resolvedFailureCode =
      ackStatus === 'FAILED'
        ? normalizeId(acknowledgement.failureCode || 'DEVICE_PRINT_FAILED')
        : ackStatus === 'CANCELLED'
          ? normalizeId(acknowledgement.failureCode || 'PRINT_CANCELLED')
          : 'NONE';
    const resolvedFailureReason =
      ackStatus === 'FAILED'
        ? String(acknowledgement.failureReason || 'Physical print device reported failure.').slice(0, 500)
        : ackStatus === 'CANCELLED'
          ? String(acknowledgement.failureReason || 'Physical print job was cancelled.').slice(0, 500)
          : '';

    const currentStatus = normalizeId(job.status);
    const terminalStatuses = new Set(['PRINTED', 'FAILED', 'CANCELLED']);
    const isContentBoundJob =
      normalizeId(job.attestationVersion) === PRINT_ATTESTATION_VERSION ||
      Boolean(job.payloadSha256);
    let attestationProof = null;
    let attestationProvider = null;
    let transportEvidence = null;

    if (isContentBoundJob && job.attestationRequired !== true) {
      throw new ApiError(
        409,
        'PRINT_ATTESTATION_REQUIRED',
        'Content-bound REC-04E print jobs cannot be terminally acknowledged without enrolled cryptographic device attestation.'
      );
    }

    if (
      job.attestationRequired &&
      !terminalStatuses.has(currentStatus) &&
      job.ackChallengeExpiresAt &&
      new Date(job.ackChallengeExpiresAt).getTime() <= Date.now()
    ) {
      throw new ApiError(409, 'PRINT_ACK_CHALLENGE_EXPIRED', 'The print acknowledgement challenge expired before a terminal result was received.');
    }

    if (job.attestationRequired) {
      const registration = await DeviceRegistration.findOne({
        deviceId,
        organisationId: orgId,
        assignedCafeId: jobCafeId,
        status: 'ACTIVE',
      }).lean();

      if (
        !registration?.publicSigningKey ||
        normalizeId(registration.signingKeyAlgorithm) !== ATTESTATION_ALGORITHM
      ) {
        throw new ApiError(
          403,
          'DEVICE_ATTESTATION_KEY_UNAVAILABLE',
          'The enrolled device signing key is unavailable or no longer valid.'
        );
      }

      const liveProvider = normalizeId(registration.signingKeyProvider || 'UNKNOWN');
      attestationProvider = liveProvider;

      if (isContentBoundJob && liveProvider !== 'ANDROID_KEYSTORE') {
        throw new ApiError(
          409,
          'DEVICE_ATTESTATION_PROVIDER_UNTRUSTED',
          'REC-04E print acknowledgement requires the enrolled Android Keystore signing provider.'
        );
      }

      const expectedProvider = normalizeId(job.attestationKeyProvider || '');
      if (expectedProvider && expectedProvider !== liveProvider) {
        throw new ApiError(
          409,
          'DEVICE_ATTESTATION_PROVIDER_CHANGED',
          'The enrolled device signing provider changed after this print job was dispatched.'
        );
      }

      const suppliedProvider = normalizeId(acknowledgement.attestation?.provider || '');
      if (suppliedProvider && suppliedProvider !== liveProvider) {
        throw new ApiError(
          403,
          'DEVICE_ATTESTATION_PROVIDER_MISMATCH',
          'The acknowledgement reported a signing provider that does not match the enrolled device.'
        );
      }

      const liveKeyThumbprint =
        registration.signingKeyThumbprint ||
        publicKeyThumbprint(registration.publicSigningKey);
      if (
        job.attestationKeyThumbprint &&
        String(job.attestationKeyThumbprint).toLowerCase() !== String(liveKeyThumbprint).toLowerCase()
      ) {
        throw new ApiError(
          409,
          'DEVICE_ATTESTATION_KEY_CHANGED',
          'The enrolled device signing key changed after this print job was dispatched.'
        );
      }

      const suppliedThumbprint = acknowledgement.attestation?.keyThumbprint;
      if (
        suppliedThumbprint &&
        String(suppliedThumbprint).toLowerCase() !== String(liveKeyThumbprint).toLowerCase()
      ) {
        throw new ApiError(
          403,
          'DEVICE_ATTESTATION_KEY_MISMATCH',
          'The acknowledgement was signed by an unexpected device key.'
        );
      }

      const isContentBoundEnvelope = Boolean(job.payloadSha256);
      if (isContentBoundEnvelope) {
        const attestation = acknowledgement.attestation || {};
        const signedProvider = normalizeId(attestation.provider || '');
        const transportMode = normalizeId(attestation.transportMode || '');
        const evidenceLevel = normalizeId(attestation.evidenceLevel || '');
        const contentBindingVerified = attestation.contentBindingVerified === true;
        const printerIdentityVerified = attestation.printerIdentityVerified === true;
        const platformJobId = String(attestation.platformJobId || '').trim();
        const printerIdentity = String(attestation.printerIdentity || '').trim();

        if (!transportMode || !evidenceLevel || !platformJobId || !signedProvider) {
          throw new ApiError(400, 'PRINT_TRANSPORT_EVIDENCE_REQUIRED', 'REC-04E acknowledgement requires signing provider, transportMode, evidenceLevel, and platformJobId.');
        }
        if (signedProvider !== 'ANDROID_KEYSTORE') {
          throw new ApiError(
            409,
            'ANDROID_SIGNING_PROVIDER_OVERCLAIM',
            'Android system-print acknowledgement must be signed by the enrolled Android Keystore provider.'
          );
        }

        // REC-04E currently has exactly one implemented purpose-bound native
        // transport attestor: Android's application-owned system print job.
        // Do not let an enrolled key invent a stronger or unknown transport.
        if (transportMode !== 'ANDROID_SYSTEM_PRINT') {
          throw new ApiError(
            409,
            'UNSUPPORTED_PRINT_TRANSPORT_MODE',
            'No purpose-bound attestor is implemented for the supplied print transport mode.'
          );
        }

        const expectedAndroidEvidence =
          ackStatus === 'PRINTED' ? 'SPOOLER_COMPLETION' : 'SPOOLER_TERMINAL_STATE';
        const expectedAndroidDrawerStatus =
          job.drawerKickRequested ? 'UNKNOWN' : 'UNCHANGED';
        if (
          (requestedDrawerStatus || 'UNCHANGED') !== expectedAndroidDrawerStatus
        ) {
          throw new ApiError(
            409,
            'ANDROID_DRAWER_EVIDENCE_OVERCLAIM',
            'Android system print cannot claim cash-drawer actuation; requested drawer evidence must remain UNKNOWN until hardware acknowledgement exists.'
          );
        }
        if (
          evidenceLevel !== expectedAndroidEvidence ||
          contentBindingVerified ||
          printerIdentityVerified
        ) {
          throw new ApiError(
            409,
            'ANDROID_PRINT_EVIDENCE_OVERCLAIM',
            'Android system print may report only its actual spooler terminal evidence and cannot claim exact-byte delivery or independently verified printer identity.'
          );
        }

        transportEvidence = {
          transportMode,
          platformJobId,
          evidenceLevel,
          contentBindingVerified,
          printerIdentity: printerIdentity || null,
          printerIdentityVerified,
        };
      }

      const signedPayload = buildPrintAckPayload({
        organisationId: orgId,
        cafeId: jobCafeId,
        deviceId,
        printJobId: normPrintJobId,
        challenge: job.ackChallenge,
        status: ackStatus,
        drawerKickStatus: requestedDrawerStatus || 'UNCHANGED',
        failureCode: resolvedFailureCode,
        failureReason: resolvedFailureReason,
        expectedPayloadSha256: job.payloadSha256 || null,
        expectedPayloadBytes: job.payloadBytes || null,
        printerTarget: job.printerTarget || 'DEFAULT_THERMAL',
        transportMode: transportEvidence?.transportMode || 'UNBOUND',
        platformJobId: transportEvidence?.platformJobId || '',
        evidenceLevel: transportEvidence?.evidenceLevel || 'NONE',
        contentBindingVerified: transportEvidence?.contentBindingVerified === true,
        printerIdentity: transportEvidence?.printerIdentity || '',
        printerIdentityVerified: transportEvidence?.printerIdentityVerified === true,
      });

      attestationProof = verifyPrintAckSignature({
        publicSigningKey: registration.publicSigningKey,
        signatureBase64Url: acknowledgement.attestation?.signature,
        payload: signedPayload,
      });

      if (
        String(attestationProof.keyThumbprint).toLowerCase() !== String(liveKeyThumbprint).toLowerCase()
      ) {
        throw new ApiError(
          403,
          'DEVICE_ATTESTATION_KEY_MISMATCH',
          'Verified acknowledgement key does not match the enrolled device key.'
        );
      }
    }

    if (terminalStatuses.has(currentStatus) && currentStatus !== ackStatus) {
      throw new ApiError(
        409,
        'PRINT_JOB_TERMINAL_STATE_CONFLICT',
        `Print job is already finalized as ${currentStatus} and cannot transition to ${ackStatus}.`
      );
    }
    if (!terminalStatuses.has(currentStatus) && currentStatus !== 'DISPATCHED') {
      throw new ApiError(
        409,
        'INVALID_PRINT_JOB_TRANSITION',
        `Print job in state ${currentStatus || 'UNKNOWN'} cannot be acknowledged as ${ackStatus}.`
      );
    }

    const now = new Date();
    const statusChanged = currentStatus !== ackStatus;

    if (!statusChanged) {
      const storedDrawerStatus = normalizeId(job.drawerKickStatus || 'NOT_REQUESTED');
      const storedPrinterIdentity = String(job.actualPrinterId || '').trim();
      if (
        (requestedDrawerStatus && requestedDrawerStatus !== storedDrawerStatus) ||
        (transportEvidence && (
          normalizeId(job.transportMode || 'UNBOUND') !== transportEvidence.transportMode ||
          String(job.platformJobId || '').trim() !== transportEvidence.platformJobId ||
          normalizeId(job.evidenceLevel || 'NONE') !== transportEvidence.evidenceLevel ||
          job.contentBindingVerified === true !== transportEvidence.contentBindingVerified ||
          storedPrinterIdentity !== String(transportEvidence.printerIdentity || '').trim() ||
          job.printerIdentityVerified === true !== transportEvidence.printerIdentityVerified
        ))
      ) {
        throw new ApiError(
          409,
          'PRINT_ACK_REPLAY_EVIDENCE_MISMATCH',
          'A finalized print job may only be retried with the same terminal evidence.'
        );
      }
    }

    if (statusChanged) {
      if (requestedDrawerStatus) {
        job.drawerKickStatus = requestedDrawerStatus;
      }
      job.status = ackStatus;
      job.acknowledgedByDeviceId = deviceId;
      job.acknowledgedAt = now;
      job.completedAt = now;
      if (job.attestationRequired) job.ackChallengeConsumedAt = now;
      if (transportEvidence) {
        job.transportMode = transportEvidence.transportMode;
        job.platformJobId = transportEvidence.platformJobId;
        job.evidenceLevel = transportEvidence.evidenceLevel;
        job.contentBindingVerified = transportEvidence.contentBindingVerified;
        job.actualPrinterId = transportEvidence.printerIdentity;
        job.printerIdentityVerified = transportEvidence.printerIdentityVerified;
      }

      if (ackStatus === 'FAILED' || ackStatus === 'CANCELLED') {
        job.failureCode = resolvedFailureCode;
        job.failureReason = resolvedFailureReason;
      } else {
        job.failureCode = null;
        job.failureReason = null;
      }
    }

    if (statusChanged && attestationProof) {
      job.attestationVerifiedAt = now;
      job.ackSignatureHash = attestationProof.signatureHash;
      if (!job.attestationKeyProvider && attestationProvider) {
        job.attestationKeyProvider = attestationProvider;
      }
    }

    if (statusChanged) {
      await job.save();
    }

    if (statusChanged && attestationProof) {
      await DeviceRegistration.updateOne(
        {
          deviceId,
          organisationId: orgId,
          assignedCafeId: jobCafeId,
          status: 'ACTIVE',
        },
        {
          $set: {
            signingKeyLastVerifiedAt: now,
            'metadata.lastAttestationKeyThumbprint': attestationProof.keyThumbprint,
          },
        }
      );
    }

    const bill = await Bill.findOne({
      organisationId: orgId,
      cafeId: jobCafeId,
      billId: normalizeId(job.billId),
    });
    if (statusChanged && bill) {
      bill.printJobs = Array.isArray(bill.printJobs) ? bill.printJobs : [];
      let billPrintJob = bill.printJobs.find((entry) =>
        normalizeId(entry.printJobId) === normPrintJobId
      );

      if (!billPrintJob) {
        bill.printJobs.push({
          printJobId: normPrintJobId,
          jobType: job.jobType,
          status: ackStatus,
          dispatchedAt: job.requestedAt || job.createdAt || now,
          dispatchedDeviceId,
          acknowledgedByDeviceId: deviceId,
          acknowledgedAt: now,
          attestationRequired: Boolean(job.attestationRequired),
          attestationVersion: job.attestationVersion || null,
          attestationKeyThumbprint: job.attestationKeyThumbprint || null,
          attestationKeyProvider: job.attestationKeyProvider || null,
          attestationKeyHardwareBackedVerified: job.attestationKeyHardwareBackedVerified === true,
          attestationKeyHardwareSecurityLevel: job.attestationKeyHardwareSecurityLevel || 'UNKNOWN',
          attestationVerifiedAt: job.attestationVerifiedAt || null,
          ackSignatureHash: job.ackSignatureHash || null,
          payloadSha256: job.payloadSha256 || null,
          payloadBytes: job.payloadBytes || null,
          printerTarget: job.printerTarget || 'DEFAULT_THERMAL',
          transportMode: job.transportMode || 'UNBOUND',
          platformJobId: job.platformJobId || null,
          evidenceLevel: job.evidenceLevel || 'NONE',
          contentBindingVerified: job.contentBindingVerified === true,
          actualPrinterId: job.actualPrinterId || null,
          printerIdentityVerified: job.printerIdentityVerified === true,
          completedAt: now,
          failureCode: job.failureCode || null,
          drawerKickRequested: Boolean(job.drawerKickRequested),
          drawerKickStatus: job.drawerKickStatus || 'NOT_REQUESTED',
        });
      } else {
        billPrintJob.status = ackStatus;
        billPrintJob.acknowledgedByDeviceId = deviceId;
        billPrintJob.acknowledgedAt = now;
        billPrintJob.attestationRequired = Boolean(job.attestationRequired);
        billPrintJob.attestationVersion = job.attestationVersion || null;
        billPrintJob.attestationKeyThumbprint = job.attestationKeyThumbprint || null;
        billPrintJob.attestationKeyProvider = job.attestationKeyProvider || null;
        billPrintJob.attestationKeyHardwareBackedVerified = job.attestationKeyHardwareBackedVerified === true;
        billPrintJob.attestationKeyHardwareSecurityLevel = job.attestationKeyHardwareSecurityLevel || 'UNKNOWN';
        billPrintJob.attestationVerifiedAt = job.attestationVerifiedAt || null;
        billPrintJob.ackSignatureHash = job.ackSignatureHash || null;
        billPrintJob.payloadSha256 = job.payloadSha256 || null;
        billPrintJob.payloadBytes = job.payloadBytes || null;
        billPrintJob.printerTarget = job.printerTarget || 'DEFAULT_THERMAL';
        billPrintJob.transportMode = job.transportMode || 'UNBOUND';
        billPrintJob.platformJobId = job.platformJobId || null;
        billPrintJob.evidenceLevel = job.evidenceLevel || 'NONE';
        billPrintJob.contentBindingVerified = job.contentBindingVerified === true;
        billPrintJob.actualPrinterId = job.actualPrinterId || null;
        billPrintJob.printerIdentityVerified = job.printerIdentityVerified === true;
        billPrintJob.completedAt = now;
        billPrintJob.failureCode = job.failureCode || null;
        billPrintJob.drawerKickStatus = job.drawerKickStatus || 'NOT_REQUESTED';
      }

      if (normalizeId(job.jobType) === 'RECEIPT') {
        bill.printStatus =
          ackStatus === 'PRINTED'
            ? 'PRINTED'
            : ackStatus === 'CANCELLED'
              ? 'PRINT_CANCELLED'
              : 'PRINT_FAILED';
      }
      await bill.save();
    }

    try {
      await auditService.recordAuditEvent({
        organisationId: orgId,
        cafeId: jobCafeId,
        actorUserId: authContext.userId || 'DEVICE',
        actorRole: authContext.role || 'STAFF',
        module: 'POS_PRINTING',
        action: 'PRINT_JOB_ACKNOWLEDGED',
        entityType: 'PRINT_JOB',
        entityId: normPrintJobId,
        result: ackStatus === 'PRINTED' ? 'SUCCESS' : 'FAILED',
        reason: acknowledgement.failureReason || `Device acknowledged print job as ${ackStatus}.`,
        metadata: {
          printJobId: normPrintJobId,
          billId: job.billId,
          jobType: job.jobType,
          deviceId,
          status: ackStatus,
          drawerKickRequested: Boolean(job.drawerKickRequested),
          drawerKickStatus: job.drawerKickStatus || 'NOT_REQUESTED',
          attestationRequired: Boolean(job.attestationRequired),
          attestationVersion: job.attestationVersion || null,
          attestationVerified: Boolean(attestationProof),
          signatureVerified: Boolean(attestationProof),
          hardwareBackedKeyVerified: job.attestationKeyHardwareBackedVerified === true,
          attestationKeyThumbprint: job.attestationKeyThumbprint || null,
          attestationKeyProvider: job.attestationKeyProvider || null,
          attestationKeyHardwareBackedVerified: job.attestationKeyHardwareBackedVerified === true,
          attestationKeyHardwareSecurityLevel: job.attestationKeyHardwareSecurityLevel || 'UNKNOWN',
          ackSignatureHash: job.ackSignatureHash || null,
          payloadSha256: job.payloadSha256 || null,
          payloadBytes: job.payloadBytes || null,
          printerTarget: job.printerTarget || 'DEFAULT_THERMAL',
          transportMode: job.transportMode || 'UNBOUND',
          platformJobId: job.platformJobId || null,
          evidenceLevel: job.evidenceLevel || 'NONE',
          contentBindingVerified: job.contentBindingVerified === true,
          actualPrinterId: job.actualPrinterId || null,
          printerIdentityVerified: job.printerIdentityVerified === true,
          idempotentReplay: !statusChanged,
        },
      });
    } catch {}

    return {
      success: true,
      printJobId: normPrintJobId,
      billId: job.billId,
      jobType: job.jobType,
      status: job.status,
      printed: job.status === 'PRINTED',
      acknowledgedByDeviceId: job.acknowledgedByDeviceId,
      acknowledgedAt: job.acknowledgedAt,
      drawerKickRequested: Boolean(job.drawerKickRequested),
      drawerKickStatus: job.drawerKickStatus || 'NOT_REQUESTED',
      attestationRequired: Boolean(job.attestationRequired),
      attestationVersion: job.attestationVersion || null,
      attestationVerified: Boolean(attestationProof),
      signatureVerified: Boolean(attestationProof),
      hardwareBackedKeyVerified: job.attestationKeyHardwareBackedVerified === true,
      attestationKeyThumbprint: job.attestationKeyThumbprint || null,
      attestationKeyProvider: job.attestationKeyProvider || null,
      attestationKeyHardwareBackedVerified: job.attestationKeyHardwareBackedVerified === true,
      attestationKeyHardwareSecurityLevel: job.attestationKeyHardwareSecurityLevel || 'UNKNOWN',
      payloadSha256: job.payloadSha256 || null,
      payloadBytes: job.payloadBytes || null,
      printerTarget: job.printerTarget || 'DEFAULT_THERMAL',
      transportMode: job.transportMode || 'UNBOUND',
      platformJobId: job.platformJobId || null,
      evidenceLevel: job.evidenceLevel || 'NONE',
      contentBindingVerified: job.contentBindingVerified === true,
      actualPrinterId: job.actualPrinterId || null,
      printerIdentityVerified: job.printerIdentityVerified === true,
      idempotentReplay: !statusChanged,
    };
  }

  /**
   * Prints an existing committed bill without mutating financial state.
   */
  static async printCommittedBill(billId, authContext = {}, options = {}) {
    const normBillId = normalizeId(billId);
    const bill = await Bill.findOne({
      $or: [{ billId: normBillId }, { invoiceNumber: normBillId }],
      organisationId: requireOrganisationId(authContext),
    });

    if (!bill) {
      throw new ApiError(404, 'BILL_NOT_FOUND', `Bill ${billId} does not exist.`);
    }

    assertCafeAccess(authContext, bill.cafeId);

    const billData = typeof bill.toObject === 'function' ? bill.toObject() : bill;
    const printResult = await this.generatePrintArtifacts(billData, {
      ...options,
      allowDrawerKick: false,
    });
    const dispatchedDeviceId = resolveDispatchDeviceId(authContext, bill.cafeId);
    const attestationBinding = await resolveAttestationBinding(authContext, bill.cafeId);

    const printJobId = createPrintJobId('RECEIPT');
    let printTrackingPersisted = false;
    let printTrackingWarning = null;
    try {
      const pj = new PrintJob({
        printJobId,
        organisationId: bill.organisationId,
        cafeId: bill.cafeId,
        billId: bill.billId,
        invoiceNumber: bill.invoiceNumber,
        jobType: 'RECEIPT',
        status: 'DISPATCHED',
        requestedBy: authContext.userId || 'STAFF',
        dispatchedDeviceId,
        ackChallenge: attestationBinding.challenge,
        ackChallengeIssuedAt: attestationBinding.challengeIssuedAt,
        ackChallengeExpiresAt: attestationBinding.challengeExpiresAt,
        attestationVersion: PRINT_ATTESTATION_VERSION,
        payloadSha256: printResult.payloadSha256,
        payloadBytes: printResult.payloadBytes,
        printerTarget: 'DEFAULT_THERMAL',
        attestationRequired: attestationBinding.required,
        attestationKeyThumbprint: attestationBinding.keyThumbprint,
        attestationKeyProvider: attestationBinding.keyProvider,
        attestationKeyHardwareBackedVerified: attestationBinding.keyHardwareBackedVerified,
        attestationKeyHardwareSecurityLevel: attestationBinding.keyHardwareSecurityLevel,
        drawerKickRequested: false,
        drawerKickStatus: 'NOT_REQUESTED',
        printBufferBase64: printResult.printBufferBase64,
        htmlPreview: printResult.htmlPreview,
      });
      await pj.save();
      printTrackingPersisted = true;
    } catch (trackingErr) {
      printTrackingWarning = 'PRINT_JOB_PERSISTENCE_FAILED';
      console.error('[POS Print] Failed to persist standalone PrintJob', printJobId, trackingErr);
    }

    if (!printTrackingPersisted) {
      throw new ApiError(
        503,
        'PRINT_TRACKING_UNAVAILABLE',
        'Receipt dispatch was withheld because durable print tracking could not be established. Retry the print request.'
      );
    }

    return {
      success: true,
      action: 'PRINT',
      bill: billData,
      printed: false,
      printDispatched: true,
      printDispatchAuthorized: true,
      printStatus: 'PRINT_DISPATCHED',
      printJobId,
      printTrackingPersisted,
      printTrackingWarning,
      dispatchedDeviceId,
      deviceAcknowledgementRequired: attestationBinding.required,
      deviceAcknowledgementSupported: attestationBinding.supported,
      deviceAcknowledgementPlatform: attestationBinding.platform,
      deviceAcknowledgementUnavailableReason: attestationBinding.unavailableReason,
      cryptographicAttestationRequired: attestationBinding.required,
      attestationAlgorithm: attestationBinding.algorithm,
      attestationKeyThumbprint: attestationBinding.keyThumbprint,
      attestationKeyProvider: attestationBinding.keyProvider,
      attestationKeyHardwareBackedVerified: attestationBinding.keyHardwareBackedVerified === true,
      attestationKeyHardwareSecurityLevel: attestationBinding.keyHardwareSecurityLevel,
      ackChallenge: attestationBinding.challenge,
      ackChallengeIssuedAt: attestationBinding.challengeIssuedAt,
      ackChallengeExpiresAt: attestationBinding.challengeExpiresAt,
      attestationContext: attestationBinding.required ? {
        version: PRINT_ATTESTATION_VERSION,
        algorithm: ATTESTATION_ALGORITHM,
        organisationId: normalizeId(bill.organisationId),
        cafeId: normalizeId(bill.cafeId),
        deviceId: dispatchedDeviceId,
        printJobId,
        challenge: attestationBinding.challenge,
        challengeIssuedAtEpochMs: attestationBinding.challengeIssuedAtEpochMs,
        challengeExpiresAtEpochMs: attestationBinding.challengeExpiresAtEpochMs,
        expectedPayloadSha256: printResult.payloadSha256,
        expectedPayloadBytes: printResult.payloadBytes,
        printerTarget: 'DEFAULT_THERMAL',
      } : null,
      drawerKickRequested: false,
      drawerKickStatus: 'NOT_REQUESTED',
      printBuffer: printResult.printBufferBase64,
      htmlPreview: printResult.htmlPreview,
      rawBuffer: printResult.rawBuffer,
    };
  }

  /**
   * Generates a supervisor-authorized reprint with explicit 'REPRINT' watermark & audit trail.
   */
  static async reprintBill(billId, authContext = {}, reason = 'Customer Request', options = {}) {
    const normBillId = normalizeId(billId);
    const bill = await Bill.findOne({
      $or: [{ billId: normBillId }, { invoiceNumber: normBillId }],
      organisationId: requireOrganisationId(authContext),
    });

    if (!bill) {
      throw new ApiError(404, 'BILL_NOT_FOUND', `Bill ${billId} does not exist.`);
    }

    assertCafeAccess(authContext, bill.cafeId);

    const cleanReason = String(reason || 'Customer Request').trim();
    if (!cleanReason) {
      throw new ApiError(400, 'REPRINT_REASON_REQUIRED', 'Reprint reason is mandatory.');
    }

    bill.reprints = Array.isArray(bill.reprints) ? bill.reprints : [];
    const nextReprintCount = bill.reprints.length + 1;
    const billDataBeforeReprint = typeof bill.toObject === 'function' ? bill.toObject() : bill;
    const printResult = await this.generatePrintArtifacts(billDataBeforeReprint, {
      ...options,
      isReprint: true,
      reprintCount: nextReprintCount,
      allowDrawerKick: false,
    });
    const dispatchedDeviceId = resolveDispatchDeviceId(authContext, bill.cafeId);
    const attestationBinding = await resolveAttestationBinding(authContext, bill.cafeId);

    const printJobId = createPrintJobId('REPRINT');
    let printTrackingPersisted = false;
    let printTrackingWarning = null;
    let persistedPrintJob = null;
    try {
      const pj = new PrintJob({
        printJobId,
        organisationId: bill.organisationId,
        cafeId: bill.cafeId,
        billId: bill.billId,
        invoiceNumber: bill.invoiceNumber,
        jobType: 'REPRINT',
        status: 'DISPATCHED',
        requestedBy: authContext.userId || 'STAFF',
        dispatchedDeviceId,
        ackChallenge: attestationBinding.challenge,
        ackChallengeIssuedAt: attestationBinding.challengeIssuedAt,
        ackChallengeExpiresAt: attestationBinding.challengeExpiresAt,
        attestationVersion: PRINT_ATTESTATION_VERSION,
        payloadSha256: printResult.payloadSha256,
        payloadBytes: printResult.payloadBytes,
        printerTarget: 'DEFAULT_THERMAL',
        attestationRequired: attestationBinding.required,
        attestationKeyThumbprint: attestationBinding.keyThumbprint,
        attestationKeyProvider: attestationBinding.keyProvider,
        attestationKeyHardwareBackedVerified: attestationBinding.keyHardwareBackedVerified,
        attestationKeyHardwareSecurityLevel: attestationBinding.keyHardwareSecurityLevel,
        drawerKickRequested: false,
        drawerKickStatus: 'NOT_REQUESTED',
        printBufferBase64: printResult.printBufferBase64,
        htmlPreview: printResult.htmlPreview,
      });
      await pj.save();
      persistedPrintJob = pj;
      printTrackingPersisted = true;
    } catch (trackingErr) {
      printTrackingWarning = 'PRINT_JOB_PERSISTENCE_FAILED';
      console.error('[POS Print] Failed to persist reprint PrintJob', printJobId, trackingErr);
    }

    if (!printTrackingPersisted) {
      throw new ApiError(
        503,
        'PRINT_TRACKING_UNAVAILABLE',
        'Reprint dispatch was withheld because durable print tracking could not be established. Retry the reprint request.'
      );
    }

    bill.reprints.push({
      reprintedBy: authContext.userId || 'STAFF',
      reprintedAt: new Date(),
      reason: cleanReason,
    });

    try {
      await bill.save();
    } catch (reprintStateErr) {
      if (persistedPrintJob) {
        try {
          persistedPrintJob.status = 'CANCELLED';
          persistedPrintJob.failureCode = 'REPRINT_STATE_PERSISTENCE_FAILED';
          persistedPrintJob.failureReason = reprintStateErr?.message || 'Reprint state persistence failed.';
          persistedPrintJob.completedAt = new Date();
          await persistedPrintJob.save();
        } catch (_) {}
      }
      throw new ApiError(
        503,
        'REPRINT_STATE_PERSISTENCE_FAILED',
        'Reprint dispatch was withheld because the audited reprint state could not be persisted.'
      );
    }

    try {
      await auditService.recordRequestAudit({
        request: {
          auth: authContext,
        },
        module: 'BILLS_RECEIPTS',
        action: 'REPRINT_RECEIPT',
        entityType: 'BILL',
        entityId: bill.billId,
        after: {
          billId: bill.billId,
          invoiceNumber: bill.invoiceNumber,
          reprintCount: bill.reprints.length,
          reason: cleanReason,
        },
        result: 'SUCCESS',
        riskClassification: 'LOW',
      });
    } catch {
      // Audit delivery is non-fatal after durable print tracking and reprint state exist.
    }

    const billData = typeof bill.toObject === 'function' ? bill.toObject() : bill;

    return {
      success: true,
      action: 'REPRINT',
      message: `Receipt reprint dispatch is durably tracked (Request #${bill.reprints.length}).`,
      bill: billData,
      isReprint: true,
      reprintCount: bill.reprints.length,
      printed: false,
      printDispatched: true,
      printDispatchAuthorized: true,
      printStatus: 'PRINT_DISPATCHED',
      printJobId,
      printTrackingPersisted,
      printTrackingWarning,
      dispatchedDeviceId,
      deviceAcknowledgementRequired: attestationBinding.required,
      deviceAcknowledgementSupported: attestationBinding.supported,
      deviceAcknowledgementPlatform: attestationBinding.platform,
      deviceAcknowledgementUnavailableReason: attestationBinding.unavailableReason,
      cryptographicAttestationRequired: attestationBinding.required,
      attestationAlgorithm: attestationBinding.algorithm,
      attestationKeyThumbprint: attestationBinding.keyThumbprint,
      attestationKeyProvider: attestationBinding.keyProvider,
      attestationKeyHardwareBackedVerified: attestationBinding.keyHardwareBackedVerified === true,
      attestationKeyHardwareSecurityLevel: attestationBinding.keyHardwareSecurityLevel,
      ackChallenge: attestationBinding.challenge,
      ackChallengeIssuedAt: attestationBinding.challengeIssuedAt,
      ackChallengeExpiresAt: attestationBinding.challengeExpiresAt,
      attestationContext: attestationBinding.required ? {
        version: PRINT_ATTESTATION_VERSION,
        algorithm: ATTESTATION_ALGORITHM,
        organisationId: normalizeId(bill.organisationId),
        cafeId: normalizeId(bill.cafeId),
        deviceId: dispatchedDeviceId,
        printJobId,
        challenge: attestationBinding.challenge,
        challengeIssuedAtEpochMs: attestationBinding.challengeIssuedAtEpochMs,
        challengeExpiresAtEpochMs: attestationBinding.challengeExpiresAtEpochMs,
        expectedPayloadSha256: printResult.payloadSha256,
        expectedPayloadBytes: printResult.payloadBytes,
        printerTarget: 'DEFAULT_THERMAL',
      } : null,
      drawerKickRequested: false,
      drawerKickStatus: 'NOT_REQUESTED',
      printBuffer: printResult.printBufferBase64,
      htmlPreview: printResult.htmlPreview,
      rawBuffer: printResult.rawBuffer,
    };
  }

  static getIstBusinessDate(date = new Date(), cutoffHour = 4) {
    return getIstBusinessDate(date, cutoffHour);
  }
}

module.exports = PosOrderService;
module.exports.PosOrderService = PosOrderService;
module.exports.getIstBusinessDate = getIstBusinessDate;


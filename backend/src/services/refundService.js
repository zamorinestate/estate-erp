'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — CANONICAL FINANCIAL REFUND BUSINESS SERVICE
 * ============================================================================
 * Single authoritative source of truth for bill refund business logic across
 * POS, Billing, Service Recovery Complaints, and External API channels.
 *
 * Responsibilities:
 * - Bill lookup and strict multi-tenant organisation & café perimeter verification
 * - Voided bill rejection and refund eligibility enforcement
 * - Atomic remaining refundable calculation & optimistic concurrency protection
 * - Idempotency key evaluation (network and client retry protection)
 * - Collision-resistant canonical refund ID generation
 * - Single authoritative mutation of bill.refunds, bill.refundedTotalPaisa, and status
 * - Audit logging linkage
 * - Delegation and monetary limit checking
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const BillModule = require('../models/Bill');
const Bill = BillModule.Bill || BillModule;
const { ApiError } = require('../utils/ApiError');
const { recordRequestAudit } = require('./auditService');
const ownerGovernanceDelegationService = require('./ownerGovernanceDelegationService');

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'SPLIT', 'OTHER'];

function normalizeId(id) {
  if (!id) return '';
  const str = typeof id === 'object' && id._id ? id._id.toString() : id.toString();
  return str.trim().toUpperCase();
}

class RefundService {
  /**
   * Process a canonical refund on a bill.
   *
   * @param {Object} context - Execution context
   * @param {string} context.organisationId - Multi-tenant organisation ID
   * @param {string} [context.cafeId] - Café ID (optional if inferred from bill)
   * @param {Object} context.user - Requesting / authenticated user object
   * @param {string} context.user.userId - Actor user ID
   * @param {string} context.user.role - Actor role
   * @param {Object} [context.request] - Express request object for audit logging and café access check
   * @param {string} [context.channel='POS'] - Channel calling refund ('POS', 'COMPLAINT_SERVICE_RECOVERY', etc.)
   * @param {string} [context.complaintId] - Associated complaint ID if service recovery
   *
   * @param {Object} payload - Refund request payload
   * @param {string} payload.billId - Target bill ID, invoice number, or ObjectId
   * @param {string} [payload.refundType='FULL'] - 'FULL' | 'PARTIAL' | 'AMOUNT_BASED'
   * @param {number} [payload.amountPaisa] - Explicit refund amount in paisa
   * @param {number} [payload.amount] - Refund amount in rupees (converted to paisa)
   * @param {string} payload.reason - Justification text (min 3 chars)
   * @param {string} [payload.tender] - Refund payment method
   * @param {string} [payload.idempotencyKey] - Client/complaint idempotency key
   *
   * @returns {Promise<{ bill: Object, refund: Object, isIdempotentReplay: boolean }>}
   */
  async processBillRefund(context, payload) {
    const { organisationId, user, request, channel = 'POS', complaintId = null } = context;

    if (!organisationId) {
      throw new ApiError(400, 'ORGANISATION_ID_REQUIRED', 'Organisation ID is required.');
    }

    const {
      billId,
      refundType = 'FULL',
      amountPaisa,
      amount,
      reason,
      tender,
      idempotencyKey
    } = payload;

    if (!billId) {
      throw new ApiError(400, 'BILL_ID_REQUIRED', 'A valid billId is required.');
    }

    const reasonText = typeof reason === 'string' ? reason.trim() : '';
    if (reasonText.length < 3) {
      throw new ApiError(400, 'REASON_REQUIRED', 'A valid justification (minimum 3 characters) is required to process a refund.');
    }

    // Role Barrier: In POS channel, Owner role is barred from direct cashier mutations (Segregation of Duties)
    if (channel === 'POS' && user?.role === 'OWNER') {
      throw new ApiError(
        403,
        'REFUND_FORBIDDEN',
        'Owner does not possess POS refund mutation authority.'
      );
    }

    // Normalize billId string
    const normBillId = normalizeId(billId);
    const isObjectId = normBillId.length === 24 && /^[0-9a-fA-F]{24}$/.test(normBillId);

    // Lookup bill with strict organisation scoping
    const queryClauses = [{ billId: normBillId }, { invoiceNumber: normBillId }];
    if (isObjectId) {
      queryClauses.push({ _id: normBillId });
    }

    const orgFilter = {
      $or: queryClauses,
      $and: [
        { $or: [{ organisationId }, { organisationId: organisationId.toString() }] }
      ]
    };

    const bill = await Bill.findOne(orgFilter);

    if (!bill) {
      throw new ApiError(404, 'NOT_FOUND', 'Bill not found.');
    }

    // Verify café scope match if context specified cafeId — return 404 NOT_FOUND to avoid cross-cafe resource existence leakage
    const billCafeId = normalizeId(bill.cafeId);
    if (context.cafeId && billCafeId && billCafeId !== normalizeId(context.cafeId)) {
      throw new ApiError(404, 'NOT_FOUND', 'Bill not found.');
    }

    // Perform request-based cafe access assertions if request is present
    if (request && typeof request.auth === 'object') {
      const auth = request.auth;
      if (auth.role !== 'MASTER' && auth.role !== 'OWNER') {
        const assigned = Array.isArray(auth.assignedCafeIds) ? auth.assignedCafeIds.map(normalizeId) : [];
        if (billCafeId && assigned.length > 0 && !assigned.includes(billCafeId)) {
          throw new ApiError(403, 'CAFE_ACCESS_DENIED', 'You do not have access to this café.');
        }
      }
    }

    // Validate Delegated Authority if delegate user is acting
    if (user && user.role !== 'PRIMARY_MASTER' && user.role !== 'OWNER' && user.userId) {
      try {
        const isDelegated = await ownerGovernanceDelegationService.checkDelegatedAuthority(organisationId, {
          userId: user.userId,
          cafeId: bill.cafeId,
          actionPermission: 'AUTHORISE_SERVICE_RECOVERY_REFUND',
          module: 'REFUND',
          monetaryAmount: amount || (amountPaisa ? amountPaisa / 100 : undefined)
        });
        if (isDelegated && !isDelegated.isAuthorized && isDelegated.reason?.includes('AMOUNT_EXCEEDS_DELEGATED_LIMIT')) {
          throw new ApiError(403, 'DELEGATED_LIMIT_EXCEEDED', isDelegated.reason);
        }
      } catch (delErr) {
        if (delErr.statusCode === 403 || delErr.code === 'DELEGATED_LIMIT_EXCEEDED') {
          throw delErr;
        }
      }
    }

    // Invariant: Voided bills can never be refunded
    if (bill.status === 'VOIDED' || bill.billStatus === 'VOIDED') {
      throw new ApiError(400, 'CANNOT_REFUND_VOIDED', 'CANNOT_REFUND_VOIDED_BILL: Cannot refund a voided bill.');
    }

    // Idempotency Check: If same idempotencyKey was already completed on this bill, return existing refund
    if (idempotencyKey && Array.isArray(bill.refunds)) {
      const existing = bill.refunds.find(r => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return {
          bill: bill.toObject ? bill.toObject() : bill,
          refund: existing,
          isIdempotentReplay: true
        };
      }
    }

    const currentRefundedPaisa = Number(bill.refundedTotalPaisa) || 0;
    const billTotalPaisa = Number(bill.totalPaisa) || (bill.totalPayablePaisa ? Number(bill.totalPayablePaisa) : Math.round((bill.grandTotal || 0) * 100));
    const remainingRefundablePaisa = Math.max(0, billTotalPaisa - currentRefundedPaisa);

    if (remainingRefundablePaisa <= 0) {
      throw new ApiError(400, 'NOTHING_TO_REFUND', 'BILL_ALREADY_FULLY_REFUNDED: This bill has already been fully refunded.');
    }

    let requestedPaisa = remainingRefundablePaisa;
    if (refundType === 'PARTIAL' || refundType === 'AMOUNT_BASED') {
      requestedPaisa = Math.round(Number(amountPaisa) || (amount ? Number(amount) * 100 : 0));
      if (requestedPaisa <= 0 || requestedPaisa > remainingRefundablePaisa) {
        throw new ApiError(
          400,
          'INVALID_REFUND_AMOUNT',
          `REFUND_AMOUNT_EXCEEDS_BILL_TOTAL: Refund amount must be between ₹0.01 and ₹${(remainingRefundablePaisa / 100).toFixed(2)}.`
        );
      }
    }

    // Concurrency-safe, collision-resistant unique refund identifier
    const uniqueEntropy = crypto.randomBytes(4).toString('hex').toUpperCase();
    const refundId = `REF-${Date.now()}-${uniqueEntropy}`;
    const refundReference = `RREF-${Date.now()}-${uniqueEntropy}`;

    const refundEntry = {
      refundId,
      refundType: requestedPaisa >= remainingRefundablePaisa && currentRefundedPaisa === 0 ? 'FULL' : 'PARTIAL',
      amountPaisa: requestedPaisa,
      amount: requestedPaisa / 100,
      reason: reasonText,
      requestedBy: user?.userId || 'SYSTEM',
      approvedBy: user?.userId || 'SYSTEM',
      tender: tender && PAYMENT_METHODS.includes(tender.toUpperCase()) ? tender.toUpperCase() : (bill.paymentMethod || 'CASH'),
      refundReference,
      status: 'COMPLETED',
      channel,
      complaintId,
      idempotencyKey: idempotencyKey || null,
      createdAt: new Date()
    };

    // Concurrency Protection: Use atomic optimistic lock condition ensuring bill.refundedTotalPaisa has not changed
    const newRefundedPaisa = currentRefundedPaisa + requestedPaisa;
    const newStatus = newRefundedPaisa >= billTotalPaisa ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    let updateResult = null;

    if (mongoose.connection && mongoose.connection.readyState === 1 && typeof Bill.findOneAndUpdate === 'function' && bill._id) {
      updateResult = await Bill.findOneAndUpdate(
        {
          _id: bill._id,
          refundedTotalPaisa: currentRefundedPaisa // Optimistic concurrency lock
        },
        {
          $push: { refunds: refundEntry },
          $set: {
            refundedTotalPaisa: newRefundedPaisa,
            status: newStatus,
            paymentStatus: newStatus,
            billStatus: newStatus
          }
        },
        { new: true }
      );

      if (!updateResult) {
        // Concurrency collision occurred (another concurrent refund modified refundedTotalPaisa)
        const exists = await Bill.findById(bill._id);
        if (exists) {
          throw new ApiError(409, 'CONCURRENT_REFUND_COLLISION', 'A concurrent refund modified this bill. Please refresh and retry.');
        }
      }
    }

    // Unit test mock or fallback execution
    if (!updateResult) {
      if (!Array.isArray(bill.refunds)) {
        bill.refunds = [];
      }
      bill.refunds.push(refundEntry);
      bill.refundedTotalPaisa = newRefundedPaisa;
      bill.status = newStatus;
      bill.paymentStatus = newStatus;
      bill.billStatus = newStatus;
      if (typeof bill.save === 'function') {
        await bill.save();
      }
      updateResult = bill;
    }

    // Record audit trail if request object provided
    if (request && typeof recordRequestAudit === 'function') {
      try {
        await recordRequestAudit({
          request,
          module: 'BILLS_RECEIPTS',
          action: 'REFUND_BILL',
          entityType: 'BILL',
          entityId: bill.billId || (bill._id ? bill._id.toString() : 'UNKNOWN'),
          after: { refundId, amountPaisa: requestedPaisa, status: newStatus, reason: reasonText },
          reason: reasonText,
          result: 'SUCCESS',
          riskClassification: 'HIGH',
        });
      } catch (auditErr) {
        // Non-blocking audit logging warning
      }
    }

    return {
      bill: updateResult.toObject ? updateResult.toObject() : updateResult,
      refund: refundEntry,
      isIdempotentReplay: false
    };
  }
}

const refundService = new RefundService();
module.exports = refundService;
module.exports.RefundService = RefundService;
module.exports.refundService = refundService;

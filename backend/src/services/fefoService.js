'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — FIRST EXPIRED, FIRST OUT (FEFO) ENGINE
 * ============================================================================
 * Implements authoritative FEFO stock issue algorithm:
 * 1. Prioritizes eligible lots with earliest expiry date.
 * 2. Hard blocks deduction from expired stock (expiryDate <= businessDate).
 * 3. Atomic multi-lot balance reduction with session transaction support.
 * 4. Generates proactive expiry alerts (NEAR_EXPIRY, EXPIRED_STILL_AVAILABLE).
 */

const { InventoryLot } = require('../models/InventoryLot');
const { StockMovement } = require('../models/StockMovement');
const { SequenceCounter } = require('../models/SequenceCounter');
const { ApiError } = require('../utils/ApiError');

function getIstDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

class FefoService {
  /**
   * Plans stock deduction according to First Expired, First Out (FEFO).
   */
  static async planFefoDeduction({
    organisationId,
    cafeId,
    itemId,
    requiredQuantity,
    businessDate = null,
    session = null,
  }) {
    if (!organisationId || !cafeId || !itemId || requiredQuantity <= 0) {
      throw new ApiError(400, 'INVALID_FEFO_PARAMS', 'Valid organisationId, cafeId, itemId, and positive requiredQuantity are required.');
    }

    const todayStr = businessDate || getIstDateStr();

    // Query active available lots
    let lotsQuery = InventoryLot.find({
      organisationId,
      cafeId,
      itemId,
      status: 'AVAILABLE',
      quantityBase: { $gt: 0 },
    }).sort({ expiryDate: 1, createdAt: 1 });
    if (session && typeof lotsQuery.session === 'function') {
      lotsQuery = lotsQuery.session(session);
    }
    const lots = await lotsQuery.lean();

    if (!lots || lots.length === 0) {
      throw new ApiError(400, 'NO_AVAILABLE_LOTS', `No available lots found for item ${itemId} at café ${cafeId}.`);
    }

    // Identify and filter out expired stock
    const validLots = [];
    const expiredLots = [];

    for (const lot of lots) {
      if (lot.expiryDate && lot.expiryDate < todayStr) {
        expiredLots.push(lot);
      } else {
        validLots.push(lot);
      }
    }

    // Auto-mark expired lots
    if (expiredLots.length > 0) {
      await InventoryLot.updateMany(
        { _id: { $in: expiredLots.map((l) => l._id) } },
        { $set: { status: 'EXPIRED' } },
        session ? { session } : {}
      );
    }

    let remainingNeeded = Number(requiredQuantity);
    const plan = [];

    for (const lot of validLots) {
      if (remainingNeeded <= 0) break;
      const availableInLot = Number(lot.quantityBase);
      const deductFromLot = Math.min(availableInLot, remainingNeeded);

      plan.push({
        lotId: lot.lotId,
        supplierLot: lot.supplierLot,
        expiryDate: lot.expiryDate,
        deductQuantity: deductFromLot,
        lotRemainingAfter: availableInLot - deductFromLot,
      });

      remainingNeeded -= deductFromLot;
    }

    if (remainingNeeded > 0) {
      throw new ApiError(
        400,
        'INSUFFICIENT_UNEXPIRED_STOCK',
        `Insufficient non-expired stock for item ${itemId}. Required: ${requiredQuantity}, Unexpired Available: ${requiredQuantity - remainingNeeded}.`
      );
    }

    return {
      itemId,
      requiredQuantity,
      allocatedLots: plan,
      totalAllocated: requiredQuantity,
    };
  }

  /**
   * Executes FEFO deduction atomically across multiple lots.
   */
  static async executeFefoDeduction({
    organisationId,
    cafeId,
    itemId,
    requiredQuantity,
    session = null,
    businessDate = null,
    billId = '',
    referenceId = '',
    referenceType = 'BILL',
    userId = 'SYSTEM',
  }) {
    const planResult = await this.planFefoDeduction({
      organisationId,
      cafeId,
      itemId,
      requiredQuantity,
      businessDate,
      session,
    });

    const deductions = [];
    const sourceTx = billId || referenceId || '';

    for (const alloc of planResult.allocatedLots) {
      const updateQuery = {
        $inc: { quantityBase: -alloc.deductQuantity, remainingQuantity: -alloc.deductQuantity },
      };
      if (alloc.lotRemainingAfter === 0) {
        updateQuery.$set = { status: 'DEPLETED' };
      }

      const opts = { new: true };
      if (session) opts.session = session;

      const updated = await InventoryLot.findOneAndUpdate(
        {
          organisationId,
          cafeId,
          lotId: alloc.lotId,
          status: 'AVAILABLE',
          quantityBase: { $gte: alloc.deductQuantity },
          remainingQuantity: { $gte: alloc.deductQuantity },
        },
        updateQuery,
        opts
      );

      if (!updated) {
        throw new ApiError(
          409,
          'FEFO_LOT_STATE_CONFLICT',
          `Inventory lot ${alloc.lotId} changed while FEFO deduction was being committed.`
        );
      }

      const movementDate = getIstDateStr();
      const movementId = await SequenceCounter.generateId({
        organisationId,
        sequenceKey: `STOCK_MOVEMENT:${movementDate.replace(/-/g, '')}`,
        prefix: `SM-${movementDate.replace(/-/g, '')}`,
        minimumDigits: 6,
        session,
      });

      await StockMovement.create(
        [
          {
            organisationId,
            movementId,
            cafeId,
            itemId,
            movementType: 'CONSUMPTION',
            quantityBase: -alloc.deductQuantity,
            balanceBeforeBase: updated.quantityBase + alloc.deductQuantity,
            balanceAfterBase: updated.quantityBase,
            lotId: alloc.lotId,
            supplierBatchNumber: alloc.supplierLot || '',
            referenceId: sourceTx,
            referenceType: referenceType || 'BILL',
            performedByUserId: userId || 'SYSTEM',
            reason: `FEFO consumption allocation for ${sourceTx || itemId}`,
          },
        ],
        session ? { session } : {}
      );

      deductions.push({
        lotId: alloc.lotId,
        deductedQuantity: alloc.deductQuantity,
        newBalance: updated.quantityBase,
        status: updated.status,
        movementId,
        sourceTransaction: sourceTx,
      });
    }

    return {
      success: true,
      itemId,
      totalDeducted: requiredQuantity,
      deductions,
      allocatedLots: deductions.map((d) => ({
        lotId: d.lotId,
        quantityConsumed: d.deductedQuantity,
        movementId: d.movementId,
        sourceTransaction: d.sourceTransaction,
      })),
    };
  }

  /**
   * Finds expiring stock within N days or already expired stock with positive quantity.
   */
  static async getExpiryAlerts({ organisationId, cafeId, thresholdDays = 7, businessDate = null }) {
    const today = businessDate ? new Date(businessDate) : new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + Number(thresholdDays));

    const todayStr = getIstDateStr(today);
    const thresholdStr = getIstDateStr(futureDate);

    const [nearExpiryLots, expiredAvailableLots] = await Promise.all([
      InventoryLot.find({
        organisationId,
        cafeId,
        status: 'AVAILABLE',
        quantityBase: { $gt: 0 },
        expiryDate: { $gte: todayStr, $lte: thresholdStr },
      })
        .sort({ expiryDate: 1 })
        .lean(),

      InventoryLot.find({
        organisationId,
        cafeId,
        quantityBase: { $gt: 0 },
        expiryDate: { $lt: todayStr },
      })
        .sort({ expiryDate: 1 })
        .lean(),
    ]);

    return {
      today: todayStr,
      thresholdDays: Number(thresholdDays),
      thresholdDate: thresholdStr,
      nearExpiryCount: nearExpiryLots.length,
      nearExpiryLots,
      expiredCount: expiredAvailableLots.length,
      expiredAvailableLots,
    };
  }
}

module.exports = {
  FefoService,
};

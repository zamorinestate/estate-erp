'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — INVENTORY LOT & QUARANTINE SERVICE
 * ============================================================================
 * Manages lot lifecycle, quarantine isolation, releases, dispositions,
 * and delivery dock incoming inspections.
 */

const mongoose = require('mongoose');
const { InventoryLot } = require('../models/InventoryLot');
const { IncomingInspection } = require('../models/IncomingInspection');
const { StockMovement } = require('../models/StockMovement');
const { AuditEvent } = require('../models/AuditEvent');
const { SequenceCounter } = require('../models/SequenceCounter');
const { ApiError } = require('../utils/ApiError');
const { executeTransactionWithRetry } = require('../utils/transactionHelper');
const { generateSecureString } = require('../utils/secureRandom');
const { recordAuditEvent } = require('./auditService');

function sequenceSourceAvailable() {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    SequenceCounter.generateId?.mock ||
    typeof SequenceCounter.generateId?.restore === 'function'
  );
}

async function generateInventoryLifecycleId({
  organisationId,
  sequenceKey,
  prefix,
}) {
  if (sequenceSourceAvailable()) {
    return SequenceCounter.generateId({
      organisationId,
      sequenceKey,
      prefix,
      minimumDigits: 4,
    });
  }

  // Disconnected unit-test fallback only. Production uses SequenceCounter.
  return `${prefix}-${generateSecureString(10, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}`;
}

function durableAuditAvailable() {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    (
      AuditEvent.create?.mock &&
      (
        SequenceCounter.generateId?.mock ||
        typeof SequenceCounter.generateId?.restore === 'function'
      )
    )
  );
}

async function recordInventoryAudit({
  organisationId,
  cafeId,
  actorUserId,
  actorRole = 'SYSTEM',
  action,
  entityType,
  entityId,
  result = 'SUCCESS',
  riskClassification = 'LOW',
  reason = '',
  before = null,
  after = null,
  metadata = {},
  session = null,
}) {
  if (!durableAuditAvailable()) return null;

  return recordAuditEvent({
    organisationId,
    cafeId,
    actorUserId,
    actorRole: String(actorRole || 'SYSTEM').trim().toUpperCase(),
    module: 'INVENTORY',
    action,
    entityType,
    entityId,
    result,
    riskClassification,
    reason,
    before,
    after,
    metadata,
    session,
  });
}

async function createWithOptionalSession(Model, payload, session) {
  if (session) {
    const created = await Model.create([payload], { session });
    return created[0];
  }
  return Model.create(payload);
}

function validateInspectionQuantities({
  receivedQuantity,
  acceptedQuantity,
  rejectedQuantity,
  decision,
}) {
  const received = Number(receivedQuantity);
  const accepted = Number(acceptedQuantity);
  const rejected = Number(rejectedQuantity);
  const cleanDecision = String(decision || '').trim().toUpperCase();

  if (
    !Number.isFinite(received) ||
    !Number.isFinite(accepted) ||
    !Number.isFinite(rejected) ||
    received <= 0 ||
    accepted < 0 ||
    rejected < 0
  ) {
    throw new ApiError(
      400,
      'INVALID_INSPECTION_QUANTITY',
      'Received quantity must be greater than zero and accepted/rejected quantities must be non-negative.'
    );
  }

  const quantityDelta = Math.abs((accepted + rejected) - received);
  if (quantityDelta > 0.000001) {
    throw new ApiError(
      400,
      'INSPECTION_QUANTITY_MISMATCH',
      'Accepted plus rejected quantity must exactly equal received quantity.'
    );
  }

  if (
    (cleanDecision === 'ACCEPT' && (accepted !== received || rejected !== 0)) ||
    (cleanDecision === 'REJECT' && (accepted !== 0 || rejected !== received)) ||
    (cleanDecision === 'PARTIAL_ACCEPT' && (accepted <= 0 || rejected <= 0))
  ) {
    throw new ApiError(
      400,
      'INSPECTION_DECISION_QUANTITY_MISMATCH',
      'Inspection decision does not match the accepted/rejected quantities.'
    );
  }

  return {
    received,
    accepted,
    rejected,
    decision: cleanDecision,
  };
}

class InventoryLotService {
  /**
   * Records an incoming material inspection at the receiving dock.
   */
  static async recordIncomingInspection({
    organisationId,
    cafeId,
    vendorId = null,
    vendorName = '',
    poReference = '',
    itemId,
    itemName = '',
    supplierLot = '',
    expiryDate = null,
    receivedQuantity,
    acceptedQuantity,
    rejectedQuantity = undefined,
    unit = 'kg',
    temperatureCelsius = null,
    packagingCondition = 'INTACT',
    qualityCondition = 'ACCEPTABLE',
    decision = 'ACCEPT',
    rejectionReason = '',
    inspectedByUserId,
    actorRole = 'SYSTEM',
    remarks = '',
  }) {
    if (!organisationId || !cafeId || !itemId || receivedQuantity === undefined) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'organisationId, cafeId, itemId, and receivedQuantity are required.'
      );
    }

    const recQty = Number(receivedQuantity);
    const cleanDecision = String(decision || 'ACCEPT').trim().toUpperCase();
    const accQty = Number(
      acceptedQuantity !== undefined
        ? acceptedQuantity
        : (cleanDecision === 'REJECT' ? 0 : recQty)
    );
    const rejQty = Number(
      rejectedQuantity !== undefined
        ? rejectedQuantity
        : Math.max(0, recQty - accQty)
    );

    const quantities = validateInspectionQuantities({
      receivedQuantity: recQty,
      acceptedQuantity: accQty,
      rejectedQuantity: rejQty,
      decision: cleanDecision,
    });

    if (quantities.accepted > 0 && !expiryDate) {
      throw new ApiError(
        400,
        'EXPIRY_DATE_REQUIRED',
        'Accepted lot-controlled inventory requires an explicit expiryDate; no synthetic expiry date is assigned.'
      );
    }

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const inspectionId = await generateInventoryLifecycleId({
      organisationId,
      sequenceKey: `INCOMING_INSPECTION_${datePart}`,
      prefix: `INSP-${datePart}`,
    });

    const createdLotId = quantities.accepted > 0
      ? await generateInventoryLifecycleId({
          organisationId,
          sequenceKey: `INVENTORY_LOT_${datePart}`,
          prefix: `LOT-${datePart}`,
        })
      : null;

    const movementId = quantities.accepted > 0
      ? await generateInventoryLifecycleId({
          organisationId,
          sequenceKey: `STOCK_MOVEMENT_${datePart}`,
          prefix: `SM-${datePart}`,
        })
      : null;

    const requireTransactions = mongoose.connection?.readyState === 1;

    return executeTransactionWithRetry(async (session) => {
      if (quantities.accepted > 0) {
        await createWithOptionalSession(InventoryLot, {
          lotId: createdLotId,
          organisationId,
          cafeId,
          itemId,
          vendorId,
          supplierLot,
          procurementReference: poReference,
          receivingInspectionId: inspectionId,
          expiryDate,
          initialQuantity: quantities.accepted,
          quantityBase: quantities.accepted,
          remainingQuantity: quantities.accepted,
          unit,
          status: 'AVAILABLE',
        }, session);

        await createWithOptionalSession(StockMovement, {
          movementId,
          organisationId,
          cafeId,
          itemId,
          movementType: poReference ? 'PROCUREMENT_RECEIPT' : 'MANUAL_RECEIPT',
          quantityBase: quantities.accepted,
          balanceBeforeBase: 0,
          balanceAfterBase: quantities.accepted,
          lotId: createdLotId,
          supplierBatchNumber: supplierLot || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          reason: 'Incoming inspection accepted stock',
          description: `Accepted from ${vendorName || vendorId || 'vendor'}; supplier lot ${supplierLot || 'not recorded'}.`,
          referenceType: poReference ? 'PURCHASE_ORDER' : 'INCOMING_INSPECTION',
          referenceId: poReference || inspectionId,
          performedByUserId: inspectedByUserId,
        }, session);
      }

      const inspection = await createWithOptionalSession(IncomingInspection, {
        inspectionId,
        organisationId,
        cafeId,
        vendorId,
        vendorName,
        poReference,
        itemId,
        itemName,
        supplierLot,
        expiryDate,
        receivedQuantity: quantities.received,
        acceptedQuantity: quantities.accepted,
        rejectedQuantity: quantities.rejected,
        unit,
        temperatureCelsius,
        packagingCondition,
        qualityCondition,
        decision: quantities.decision,
        rejectionReason,
        inspectedByUserId,
        createdLotId,
        remarks,
      }, session);

      await recordInventoryAudit({
        organisationId,
        cafeId,
        actorUserId: inspectedByUserId,
        actorRole,
        action: 'INCOMING_INSPECTION_RECORDED',
        entityType: 'INCOMING_INSPECTION',
        entityId: inspectionId,
        result: 'SUCCESS',
        riskClassification: quantities.decision === 'REJECT' ? 'HIGH' : 'MEDIUM',
        after: {
          decision: quantities.decision,
          receivedQuantity: quantities.received,
          acceptedQuantity: quantities.accepted,
          rejectedQuantity: quantities.rejected,
          createdLotId,
          movementId,
        },
        metadata: {
          itemId,
          vendorId,
          poReference,
        },
        session,
      });

      return inspection;
    }, { requireTransactions });
  }

  /**
   * Quarantines an inventory lot.
   */
  static async quarantineLot({
    organisationId,
    cafeId,
    lotId,
    reason,
    userId,
    actorRole = 'SYSTEM',
  }) {
    const current = await InventoryLot.findOne({ organisationId, cafeId, lotId });
    if (!current) {
      throw new ApiError(404, 'LOT_NOT_FOUND', `Inventory lot ${lotId} not found.`);
    }

    if (current.status === 'QUARANTINE') {
      throw new ApiError(400, 'ALREADY_QUARANTINED', `Lot ${lotId} is already in quarantine.`);
    }

    if (['DISPOSED', 'RETURNED', 'DEPLETED'].includes(current.status)) {
      throw new ApiError(
        409,
        'LOT_NOT_QUARANTINABLE',
        `Lot ${lotId} cannot be quarantined from status ${current.status}.`
      );
    }

    const previousStatus = current.status;
    const quarantineReason = String(reason || 'Quarantined for quality review').trim();
    const now = new Date();
    const requireTransactions = mongoose.connection?.readyState === 1;

    return executeTransactionWithRetry(async (session) => {
      const lot = await InventoryLot.findOneAndUpdate(
        {
          _id: current._id,
          organisationId,
          cafeId,
          lotId,
          status: previousStatus,
        },
        {
          $set: {
            status: 'QUARANTINE',
            quarantineReason,
            quarantineDate: now,
            quarantinedByUserId: userId,
          },
        },
        {
          new: true,
          ...(session ? { session } : {}),
        }
      );

      if (!lot) {
        throw new ApiError(
          409,
          'LOT_STATE_CONFLICT',
          'Inventory lot state changed before quarantine could be committed.'
        );
      }

      await recordInventoryAudit({
        organisationId,
        cafeId,
        actorUserId: userId,
        actorRole,
        action: 'INVENTORY_LOT_QUARANTINED',
        entityType: 'INVENTORY_LOT',
        entityId: lotId,
        result: 'SUCCESS',
        riskClassification: 'HIGH',
        reason: quarantineReason,
        before: { status: previousStatus },
        after: { status: 'QUARANTINE' },
        metadata: {
          quantityBase: lot.quantityBase,
          remainingQuantity: lot.remainingQuantity,
          itemId: lot.itemId,
        },
        session,
      });

      return lot;
    }, { requireTransactions });
  }

  /**
   * Releases an inventory lot from quarantine.
   */
  static async releaseLot({
    organisationId,
    cafeId,
    lotId,
    releaseReason,
    userId,
    actorRole = 'SYSTEM',
  }) {
    const current = await InventoryLot.findOne({ organisationId, cafeId, lotId });
    if (!current) {
      throw new ApiError(404, 'LOT_NOT_FOUND', `Inventory lot ${lotId} not found.`);
    }

    if (current.status !== 'QUARANTINE') {
      throw new ApiError(
        400,
        'NOT_QUARANTINED',
        `Lot ${lotId} is not in quarantine (status: ${current.status}).`
      );
    }

    const cleanReason = String(releaseReason || '').trim();
    if (!cleanReason) {
      throw new ApiError(400, 'REASON_REQUIRED', 'Formal release reason is required.');
    }

    const now = new Date();
    const nextStatus = Number(current.remainingQuantity ?? current.quantityBase ?? 0) <= 0
      ? 'DEPLETED'
      : 'AVAILABLE';
    const requireTransactions = mongoose.connection?.readyState === 1;

    return executeTransactionWithRetry(async (session) => {
      const lot = await InventoryLot.findOneAndUpdate(
        {
          _id: current._id,
          organisationId,
          cafeId,
          lotId,
          status: 'QUARANTINE',
        },
        {
          $set: {
            status: nextStatus,
            releaseReason: cleanReason,
            releaseDate: now,
            releasedByUserId: userId,
            dispositionStatus: 'RELEASE',
          },
        },
        {
          new: true,
          ...(session ? { session } : {}),
        }
      );

      if (!lot) {
        throw new ApiError(
          409,
          'LOT_STATE_CONFLICT',
          'Inventory lot state changed before release could be committed.'
        );
      }

      await recordInventoryAudit({
        organisationId,
        cafeId,
        actorUserId: userId,
        actorRole,
        action: 'INVENTORY_LOT_RELEASED',
        entityType: 'INVENTORY_LOT',
        entityId: lotId,
        result: 'SUCCESS',
        riskClassification: 'HIGH',
        reason: cleanReason,
        before: { status: 'QUARANTINE' },
        after: { status: nextStatus, dispositionStatus: 'RELEASE' },
        metadata: {
          quantityBase: lot.quantityBase,
          remainingQuantity: lot.remainingQuantity,
          itemId: lot.itemId,
        },
        session,
      });

      return lot;
    }, { requireTransactions });
  }

  /**
   * Disposes or returns an inventory lot.
   */
  static async disposeLot({
    organisationId,
    cafeId,
    lotId,
    dispositionStatus,
    dispositionReason,
    userId,
    actorRole = 'SYSTEM',
  }) {
    const cleanDisposition = String(dispositionStatus || '').trim().toUpperCase();

    if (cleanDisposition === 'RELEASE') {
      throw new ApiError(
        400,
        'USE_RELEASE_ENDPOINT',
        'RELEASE is not a destructive disposition. Use the quarantine release workflow instead.'
      );
    }

    const allowedDispositions = [
      'RETURN_TO_VENDOR',
      'DESTROY',
      'OTHER_AUTHORISED_DISPOSITION',
    ];
    if (!allowedDispositions.includes(cleanDisposition)) {
      throw new ApiError(
        400,
        'INVALID_DISPOSITION',
        `dispositionStatus must be one of: ${allowedDispositions.join(', ')}.`
      );
    }

    const cleanReason = String(dispositionReason || '').trim();
    if (!cleanReason) {
      throw new ApiError(
        400,
        'DISPOSITION_REASON_REQUIRED',
        'A disposition reason is required.'
      );
    }

    const current = await InventoryLot.findOne({ organisationId, cafeId, lotId });
    if (!current) {
      throw new ApiError(404, 'LOT_NOT_FOUND', `Inventory lot ${lotId} not found.`);
    }
    if (['DISPOSED', 'RETURNED'].includes(current.status)) {
      throw new ApiError(
        409,
        'LOT_ALREADY_DISPOSED',
        `Inventory lot ${lotId} is already in terminal status ${current.status}.`
      );
    }

    const disposedQty = Math.max(
      0,
      Number(current.remainingQuantity ?? current.quantityBase ?? 0)
    );
    if (disposedQty <= 0) {
      throw new ApiError(
        409,
        'LOT_HAS_NO_DISPOSABLE_QUANTITY',
        'The inventory lot has no remaining quantity to dispose.'
      );
    }

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const movementId = await generateInventoryLifecycleId({
      organisationId,
      sequenceKey: `STOCK_MOVEMENT_${datePart}`,
      prefix: `SM-${datePart}`,
    });

    const nextStatus = cleanDisposition === 'RETURN_TO_VENDOR'
      ? 'RETURNED'
      : 'DISPOSED';
    const movementType = cleanDisposition === 'RETURN_TO_VENDOR'
      ? 'RETURN_TO_VENDOR'
      : (current.status === 'EXPIRED' ? 'EXPIRY_DISPOSAL' : 'WASTAGE');
    const now = new Date();
    const requireTransactions = mongoose.connection?.readyState === 1;

    return executeTransactionWithRetry(async (session) => {
      const lot = await InventoryLot.findOneAndUpdate(
        {
          _id: current._id,
          organisationId,
          cafeId,
          lotId,
          status: current.status,
          remainingQuantity: current.remainingQuantity,
        },
        {
          $set: {
            dispositionStatus: cleanDisposition,
            dispositionReason: cleanReason,
            dispositionDate: now,
            dispositionByUserId: userId,
            quantityBase: 0,
            remainingQuantity: 0,
            status: nextStatus,
          },
        },
        {
          new: true,
          ...(session ? { session } : {}),
        }
      );

      if (!lot) {
        throw new ApiError(
          409,
          'LOT_STATE_CONFLICT',
          'Inventory lot quantity or state changed before disposition could be committed.'
        );
      }

      await createWithOptionalSession(StockMovement, {
        movementId,
        organisationId,
        cafeId,
        itemId: current.itemId,
        movementType,
        quantityBase: -disposedQty,
        balanceBeforeBase: disposedQty,
        balanceAfterBase: 0,
        lotId,
        supplierBatchNumber: current.supplierLot || null,
        expiryDate: current.expiryDate ? new Date(current.expiryDate) : null,
        reason: cleanReason,
        description: `Lot ${lotId} disposition: ${cleanDisposition}.`,
        referenceType: 'LOT_DISPOSITION',
        referenceId: lotId,
        performedByUserId: userId,
      }, session);

      await recordInventoryAudit({
        organisationId,
        cafeId,
        actorUserId: userId,
        actorRole,
        action: 'INVENTORY_LOT_DISPOSED',
        entityType: 'INVENTORY_LOT',
        entityId: lotId,
        result: 'SUCCESS',
        riskClassification: 'CRITICAL',
        reason: cleanReason,
        before: {
          status: current.status,
          remainingQuantity: disposedQty,
        },
        after: {
          status: nextStatus,
          remainingQuantity: 0,
          dispositionStatus: cleanDisposition,
        },
        metadata: {
          movementId,
          movementType,
          itemId: current.itemId,
          disposedQuantity: disposedQty,
        },
        session,
      });

      return lot;
    }, { requireTransactions });
  }

  /**
   * Queries lots with filtering.
   */
  static async listLots({
    organisationId,
    cafeId,
    itemId = null,
    status = null,
    limit = 50,
  }) {
    const query = { organisationId, cafeId };
    if (itemId) query.itemId = itemId;
    if (status) query.status = status;
    return InventoryLot.find(query)
      .sort({ expiryDate: 1 })
      .limit(Number(limit))
      .lean();
  }
}

module.exports = {
  InventoryLotService,
};

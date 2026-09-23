'use strict';

/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — OFFLINE SYNC RECONCILIATION SERVICE (REC-13 / R02-09)
 * ============================================================================
 * Ingests offline transactions generated during network outages or degraded
 * operating mode. Guarantees:
 * - Deterministic idempotency via client-generated saleAttemptId & idempotencyKey
 * - High-risk operation detection (large offline refunds, extreme discounts)
 * - Safe replay strictly through canonical PosOrderService (REC-04B pipeline)
 * - Strict café governance (suspended/closed cafés routed to CONFLICT_REVIEW_REQUIRED)
 * - Server catalog pricing authority (tampered local prices recomputed canonically)
 * - Zero KDS (Kitchen Display System is removed / NOT_APPLICABLE)
 * - Audit logging with IS_OFFLINE_REPLAY flag
 */

const { Bill } = require('../models/Bill');
const { Cafe } = require('../models/Cafe');
const { DeviceRegistration } = require('../models/DeviceRegistration');
const { OperatorSession } = require('../models/OperatorSession');
const { User } = require('../models/User');
const { PosOfflineReviewItem } = require('../models/PosOfflineReviewItem');
const { OfflineRiskConfigService } = require('./offlineRiskConfigService');
const auditService = require('./auditService');
const PosOrderService = require('./posOrderService');

const OFFLINE_POLICY_CLASSES = {
  ONLINE_REQUIRED: 'ONLINE_REQUIRED',
  LOCAL_DRAFT_ALLOWED: 'LOCAL_DRAFT_ALLOWED',
  SAFE_QUEUE_ALLOWED: 'SAFE_QUEUE_ALLOWED',
  PAYMENT_PROVIDER_DEPENDENT: 'PAYMENT_PROVIDER_DEPENDENT',
};

class OfflineSyncService {
  /**
   * Resolves the offline risk policy class for a given operational mutation.
   * Enforces that high-risk financial operations and electronic provider payments
   * strictly require active online connectivity.
   */
  static resolveOperationPolicy(operation = {}) {
    const opType = String(operation.operationType || operation.type || '').toUpperCase();
    const status = String(operation.status || '').toUpperCase();
    const paymentMethod = String(operation.paymentMethod || operation.paymentMode || '').toUpperCase();
    const orderType = String(operation.orderType || operation.serviceMode || '').toUpperCase();

    // 1. High-risk financial and administrative mutations strictly require online server confirmation
    const isHighRiskMutation =
      operation.isRefund === true ||
      ['REFUND', 'CASH_REVERSAL', 'REVERSAL', 'DEVICE_REVOCATION', 'PERMISSION_MUTATION', 'APPROVAL', 'STOCK_CORRECTION'].includes(opType) ||
      ['REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED', 'PAYMENT_REVERSED'].includes(status) ||
      orderType === 'REVERSAL';

    if (isHighRiskMutation) {
      return OFFLINE_POLICY_CLASSES.ONLINE_REQUIRED;
    }

    // 2. Electronic payments depend on third-party payment providers.
    // In Zamorin ERP's current implementation, electronic provider-dependent payment = ONLINE_REQUIRED.
    if (['CARD', 'UPI', 'PAYMENT_GATEWAY', 'NETBANKING', 'WALLET'].includes(paymentMethod)) {
      return OFFLINE_POLICY_CLASSES.PAYMENT_PROVIDER_DEPENDENT;
    }

    // 3. Local drafts (saved carts, offline inspection drafts)
    if (operation.isDraft === true || status === 'DRAFT' || opType === 'LOCAL_DRAFT') {
      return OFFLINE_POLICY_CLASSES.LOCAL_DRAFT_ALLOWED;
    }

    // 4. Safe offline POS sales (CASH or standard orders)
    if (paymentMethod === 'CASH' || ['QUICK_SALE', 'DINE_IN', 'TAKEAWAY'].includes(orderType)) {
      return OFFLINE_POLICY_CLASSES.SAFE_QUEUE_ALLOWED;
    }

    // Default: No fallback to queue-all. Unknown operations require online.
    return OFFLINE_POLICY_CLASSES.ONLINE_REQUIRED;
  }

  /**
   * Replays a batch of offline transactions collected on a POS or terminal device.
   * Performs DeviceRegistration check, OperatorSession validation, actor authorization,
   * idempotency deduplication, and risk policy enforcement before persistence.
   * Strictly uses PosOrderService (REC-04B) for canonical single-commit execution.
   */
  static async syncBatch({
    organisationId,
    cafeId,
    deviceId = '',
    userId = '',
    operatorSessionId = '',
    transactions = [],
  }) {
    if (!organisationId || !cafeId) {
      throw new Error('OrganisationId and CafeId are required for offline sync replay.');
    }

    const cleanOrg = organisationId.trim().toUpperCase();
    const cleanCafe = cafeId.trim().toUpperCase();

    // Check Café operational status for governance compliance
    let cafeDoc = null;
    try {
      cafeDoc = await Cafe.findOne({ organisationId: cleanOrg, cafeId: cleanCafe }).lean();
    } catch (_) {}

    const isCafeSuspendedOrClosed =
      cafeDoc && ['TEMPORARILY_CLOSED', 'CLOSED', 'SUSPENDED', 'UNDER_REVIEW', 'ARCHIVED'].includes(cafeDoc.status);

    // 1. Device Registration Validation
    if (deviceId) {
      const device = await DeviceRegistration.findOne({
        organisationId: cleanOrg,
        deviceId: deviceId.trim(),
      }).lean();

      if (device) {
        if (['REVOKED', 'SUSPENDED', 'LOST', 'RETIRED'].includes(device.status)) {
          throw new Error(`Device ${deviceId} registration is ${device.status}. Offline replay denied.`);
        }
        if (device.assignedCafeId && device.assignedCafeId !== cleanCafe) {
          throw new Error(`Device ${deviceId} is assigned to café ${device.assignedCafeId}, cannot replay for café ${cleanCafe}.`);
        }
      }
    }

    // 2. Operator Session Validation
    let isSessionExpiredOrEnded = false;
    if (operatorSessionId) {
      const session = await OperatorSession.findOne({
        organisationId: cleanOrg,
        operatorSessionId: operatorSessionId.trim(),
      }).lean();

      if (!session) {
        throw new Error(`Operator session ${operatorSessionId} not found.`);
      }
      if (session.status === 'EXPIRED' || session.status === 'ENDED' || session.endedAt) {
        isSessionExpiredOrEnded = true;
      }
      if (session.cafeId && session.cafeId !== cleanCafe) {
        throw new Error(`Operator session ${operatorSessionId} belongs to café ${session.cafeId}, not authorized for ${cleanCafe}.`);
      }
      if (userId && session.operatorUserId && session.operatorUserId !== userId) {
        throw new Error(`Operator mismatch: session belongs to ${session.operatorUserId}, replay attempted by ${userId}.`);
      }
    }

    const riskConfig = await OfflineRiskConfigService.getEffectiveRiskConfig({
      organisationId: cleanOrg,
      cafeId: cleanCafe,
    });
    const maxDiscountPercent = riskConfig.maxDiscountPercent;
    const highValueAmountPaise = riskConfig.highValueAmountPaise;

    const results = {
      totalReceived: transactions.length,
      syncedCount: 0,
      duplicateCount: 0,
      flaggedCount: 0,
      rejectedCount: 0,
      conflictCount: 0,
      items: [],
    };

    for (const tx of transactions) {
      const clientOfflineId = tx.clientOfflineId || tx.saleAttemptId || tx.offlineId || tx.id;
      if (!clientOfflineId) {
        results.rejectedCount++;
        results.items.push({
          clientOfflineId: null,
          status: 'REJECTED',
          reason: 'Missing clientOfflineId for idempotency tracking.',
        });
        continue;
      }

      // Cross-café verification: transaction must match destination cafe
      const txCafe = (tx.cafeId || cleanCafe).trim().toUpperCase();
      if (txCafe !== cleanCafe) {
        results.rejectedCount++;
        results.items.push({
          clientOfflineId,
          status: 'REJECTED',
          reason: `Cross-café isolation violation: transaction belongs to ${txCafe}, not ${cleanCafe}.`,
        });
        continue;
      }

      // Governance: Café suspended before sync
      if (isCafeSuspendedOrClosed) {
        results.conflictCount++;
        results.items.push({
          clientOfflineId,
          status: 'CONFLICT_REVIEW_REQUIRED',
          reason: `Café ${cleanCafe} is ${cafeDoc.status}. Offline sales cannot finalize into a suspended café. Evidence preserved for review.`,
          capturedAt: tx.capturedAtClient || tx.offlineCreatedAt,
        });
        continue;
      }

      // 3. Idempotency Verification: has this offline bill already been replayed?
      const duplicateConditions = [{ clientOfflineId }];
      if (tx.saleAttemptId) {
        duplicateConditions.push({ saleAttemptId: tx.saleAttemptId });
      }
      if (tx.idempotencyKey) {
        duplicateConditions.push({ correlationId: tx.idempotencyKey });
      }
      if (tx.billId) {
        duplicateConditions.push({ billId: tx.billId });
      }
      const existing = await Bill.findOne({
        organisationId: cleanOrg,
        $or: duplicateConditions,
      }).lean();

      if (existing) {
        results.duplicateCount++;
        results.items.push({
          clientOfflineId,
          billId: existing.billId,
          invoiceNumber: existing.invoiceNumber,
          status: 'ALREADY_SYNCED',
          totalPaisa: existing.totalPaisa,
          replayedAt: existing.createdAt,
        });
        continue;
      }

      // 4. Offline Risk Policy Resolution
      const policy = this.resolveOperationPolicy(tx);

      if (policy === OFFLINE_POLICY_CLASSES.ONLINE_REQUIRED) {
        results.rejectedCount++;
        results.items.push({
          clientOfflineId,
          status: 'REJECTED',
          policy,
          reason: `High-risk operation (${tx.operationType || tx.status || 'FINANCIAL_MUTATION'}) requires online server authorization. Offline queueing and replay prohibited.`,
        });
        continue;
      }

      if (policy === OFFLINE_POLICY_CLASSES.PAYMENT_PROVIDER_DEPENDENT) {
        results.rejectedCount++;
        results.items.push({
          clientOfflineId,
          status: 'REJECTED',
          policy,
          reason: `Electronic payment method (${tx.paymentMethod}) requires online payment provider authorization. Offline processing is prohibited.`,
        });
        continue;
      }

      if (policy === OFFLINE_POLICY_CLASSES.LOCAL_DRAFT_ALLOWED) {
        results.items.push({
          clientOfflineId,
          status: 'DRAFT_SAVED',
          policy,
          reason: 'Local draft stored without financial posting.',
        });
        continue;
      }

      // 5. Safe Queue Processing (SAFE_QUEUE_ALLOWED) via PosOrderService (REC-04B)
      const totalPaisa = Number(tx.totalPaisa) || 0;
      const discountPaisa = Number(tx.discountPaisa) || 0;
      const subtotalPaisa = Number(tx.subtotalPaisa) || totalPaisa;
      const isExtremeDiscount = subtotalPaisa > 0 && ((discountPaisa / subtotalPaisa) * 100 > maxDiscountPercent);
      const isLargeOfflineAmount = totalPaisa > highValueAmountPaise;

      let syncFlag = 'CLEAN';
      let flagReason = '';

      if (isExtremeDiscount) {
        syncFlag = 'FLAGGED_FOR_AUDIT';
        flagReason = `Offline discount exceeded configured ${maxDiscountPercent}% threshold.`;
      } else if (isLargeOfflineAmount) {
        syncFlag = 'FLAGGED_FOR_AUDIT';
        flagReason = `Offline bill total exceeded configured ₹${(highValueAmountPaise / 100).toLocaleString('en-IN')} ceiling.`;
      }

      // 4.5. REC-13A Governance: Disabled/Terminated Operator Authorization Validation
      const originatingUserId = (tx.originatingUserId || tx.cashierUserId || userId || '').trim().toUpperCase();
      let isOperatorDisabled = false;
      let disabledReason = '';
      if (originatingUserId && originatingUserId !== 'OFFLINE_CASHIER') {
        try {
          const userDoc = await User.findOne({
            organisationId: cleanOrg,
            userId: originatingUserId,
          }).lean();

          if (userDoc) {
            const accStatus = String(userDoc.accountStatus || '').toUpperCase();
            const lifeStatus = String(userDoc.lifecycleStatus || '').toUpperCase();
            const empStatus = String(userDoc.employmentStatus || '').toUpperCase();

            if (['DISABLED', 'TERMINATED', 'SUSPENDED', 'DEACTIVATED', 'ARCHIVED', 'LOCKED'].includes(accStatus) ||
                ['TERMINATED', 'SEPARATED', 'SUSPENDED', 'RETIRED'].includes(lifeStatus) ||
                ['EXITED', 'ARCHIVED'].includes(empStatus)) {
              isOperatorDisabled = true;
              disabledReason = `Originating cashier ${originatingUserId} is no longer active (account: ${accStatus}, lifecycle: ${lifeStatus}, employment: ${empStatus}). Autonomous finalization prohibited; requires authorized review.`;
            }
          }
        } catch (_) {}
      }

      if (isOperatorDisabled) {
        results.conflictCount++;

        // Persist or update PosOfflineReviewItem preserving complete client evidence
        const saleAttemptId = tx.saleAttemptId || clientOfflineId;
        const idempotencyKey = tx.idempotencyKey || `OFFLINE-IDEM-${clientOfflineId}`;
        const capturedAtClient = tx.capturedAtClient ? new Date(tx.capturedAtClient) : (tx.offlineCreatedAt ? new Date(tx.offlineCreatedAt) : new Date());
        const totalPaisa = Number(tx.totalPaisa) || 0;

        try {
          const reviewId = `REV-${saleAttemptId}`;
          await PosOfflineReviewItem.findOneAndUpdate(
            { organisationId: cleanOrg, cafeId: cleanCafe, saleAttemptId },
            {
              reviewId,
              saleAttemptId,
              idempotencyKey,
              clientOfflineId,
              organisationId: cleanOrg,
              cafeId: cleanCafe,
              originatingUserId,
              originatingShiftId: tx.shiftId || tx.originatingShiftId || null,
              originatingDeviceId: tx.originatingDeviceId || deviceId || '',
              capturedAtClient,
              serverReceivedAt: new Date(),
              catalogVersion: tx.catalogVersion || null,
              totalPaisa,
              paymentMethod: tx.paymentMethod || 'CASH',
              reviewReason: disabledReason,
              status: 'PENDING_REVIEW',
              payloadSnapshot: tx,
            },
            { upsert: true, returnDocument: 'after' }
          );

          // Emit Audit Event
          try {
            await auditService.recordAuditEvent({
              organisationId: cleanOrg,
              cafeId: cleanCafe,
              actorUserId: originatingUserId,
              actorRole: 'STAFF',
              module: 'POS_OFFLINE_SYNC',
              action: 'OFFLINE_POS_OPERATOR_DISABLED',
              entityType: 'POS_OFFLINE_REVIEW_ITEM',
              entityId: reviewId,
              reason: disabledReason,
              result: 'SUCCESS',
              riskClassification: 'HIGH',
              correlationId: idempotencyKey,
              metadata: {
                saleAttemptId,
                clientOfflineId,
                totalPaisa,
                capturedAtClient,
              },
            });
          } catch (_) {}
        } catch (revErr) {
          console.error('[OfflineSyncService] Failed to persist review item:', revErr.message);
        }

        results.items.push({
          clientOfflineId,
          status: 'CONFLICT_REVIEW_REQUIRED',
          reviewStatus: 'PENDING_REVIEW',
          reason: disabledReason,
          saleAttemptId,
          idempotencyKey,
          capturedAt: capturedAtClient,
        });
        continue;
      }

      // Format line items for PosOrderService
      const mappedLineItems = (Array.isArray(tx.lineItems) && tx.lineItems.length > 0
        ? tx.lineItems
        : [{ menuItemId: 'ITEM-OFFLINE', itemNameSnapshot: 'Offline Sale Item', quantity: 1, unitPricePaisa: totalPaisa }]
      ).map((item, idx) => {
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        const price = Math.max(0, Math.round(Number(item.unitPricePaisa ?? item.pricePaisa ?? (item.price != null ? item.price * 100 : 0))));
        return {
          menuItemId: item.menuItemId || item.itemId || item.id || `ITEM-OFFLINE-${idx + 1}`,
          itemNameSnapshot: item.itemNameSnapshot || item.name || 'Offline Sale Item',
          quantity: qty,
          unitPricePaisa: price,
          modifiers: item.modifiers || {},
          itemNotes: item.itemNotes || item.notes || (isSessionExpiredOrEnded ? 'LATE_OFFLINE_SYNC' : ''),
          taxRatePercent: typeof item.taxRatePercent === 'number' ? item.taxRatePercent : 5,
          taxClassification: item.taxClassification || 'GST_5',
          discountPaisa: Math.max(0, Math.round(Number(item.discountPaisa || 0))),
        };
      });

      const idempotencyKey = tx.idempotencyKey || `OFFLINE-IDEM-${clientOfflineId}`;
      const saleAttemptId = tx.saleAttemptId || clientOfflineId;

      const orderPayload = {
        action: 'SAVE',
        cafeId: cleanCafe,
        orderType: tx.orderType || 'QUICK_SALE',
        serviceMode: tx.serviceMode || tx.orderType || 'QUICK_SALE',
        tableNumber: tx.tableNumber || '',
        tableToken: tx.tableToken || '',
        guestCovers: Math.max(1, Number(tx.guestCovers) || 1),
        discountPaisa,
        paymentMethod: tx.paymentMethod || tx.paymentMode || 'CASH',
        registerId: tx.registerId || 'REG-01',
        registerSessionId: tx.registerSessionId || operatorSessionId || '',
        idempotencyKey,
        saleAttemptId,
        clientOfflineId,
        offlineCreatedAt: tx.offlineCreatedAt ? new Date(tx.offlineCreatedAt) : (tx.capturedAtClient ? new Date(tx.capturedAtClient) : new Date()),
        catalogVersion: tx.catalogVersion || null,
        lineItems: mappedLineItems,
        tenders: tx.tenders || [
          {
            paymentMethod: tx.paymentMethod || 'CASH',
            amountPaisa: totalPaisa,
            provider: 'CASH_REGISTER',
            paymentReference: tx.paymentReference || `CASH-${clientOfflineId}`,
          },
        ],
        isImmediateCompletion: true,
        isOfflineReplay: true,
      };

      const authContext = {
        organisationId: cleanOrg,
        cafeId: cleanCafe,
        userId: tx.originatingUserId || tx.cashierUserId || userId || 'OFFLINE_CASHIER',
        role: 'STAFF',
      };

      try {
        const orderResult = await PosOrderService.processOrder(orderPayload, authContext, 'SAVE', {
          isOfflineReplay: true,
          clientOfflineId,
        });

        const finalizedBill = orderResult.bill || orderResult.data;
        const finalBillId = finalizedBill?.billId || orderResult.billId;
        const finalInvoice = finalizedBill?.invoiceNumber || orderResult.invoiceNumber;
        const finalTotal = finalizedBill?.totalPaisa || orderResult.totalPaisa || totalPaisa;

        if (orderResult.isIdempotentReplay) {
          results.duplicateCount++;
          results.items.push({
            clientOfflineId,
            billId: finalBillId,
            invoiceNumber: finalInvoice,
            status: 'ALREADY_SYNCED',
            totalPaisa: finalTotal,
            isIdempotentReplay: true,
          });
        } else {
          results.syncedCount++;
          if (syncFlag === 'FLAGGED_FOR_AUDIT') {
            results.flaggedCount++;
          }

          results.items.push({
            clientOfflineId,
            billId: finalBillId,
            invoiceNumber: finalInvoice,
            status: syncFlag === 'FLAGGED_FOR_AUDIT' ? 'SYNCED_WITH_FLAG' : 'SYNCED',
            syncFlag,
            flagReason,
            totalPaisa: finalTotal,
            bomDepletionStatus: finalizedBill?.bomDepletionStatus || 'DEPLETED',
          });
        }
      } catch (err) {
        if (err.statusCode === 409) {
          results.conflictCount++;
          results.items.push({
            clientOfflineId,
            status: 'CONFLICT_REVIEW_REQUIRED',
            reason: err.message,
            errorCode: err.errorCode || 'CONFLICT',
          });
        } else {
          results.rejectedCount++;
          results.items.push({
            clientOfflineId,
            status: 'RETRYABLE_FAILURE',
            reason: err.message,
            errorCode: err.errorCode || 'SYNC_ERROR',
          });
        }
      }
    }

    return results;
  }

  /**
   * REC-13A / REC-13B: Retrieves pending offline review items scoped by organisation and café.
   * Enforces Policy A: Only Assigned CAFE_ADMIN and MASTER are permitted.
   * OWNER and STAFF are strictly barred with 403 AUTHORIZATION_DENIED (Segregation of Duties).
   */
  static async getPendingReviews({ organisationId, cafeId = null, authUser }) {
    const cleanOrg = (organisationId || authUser?.organisationId || 'ORG-ZAMORIN').trim().toUpperCase();
    const role = (authUser?.role || '').toUpperCase();

    // Policy A / Segregation of Duties: Owner and Staff are barred from POS review operations
    if (role === 'OWNER') {
      const err = new Error('Owner does not possess offline POS review authorization (Segregation of Duties).');
      err.statusCode = 403;
      err.errorCode = 'AUTHORIZATION_DENIED';
      err.code = 'AUTHORIZATION_DENIED';
      throw err;
    }

    if (role === 'STAFF') {
      const err = new Error('Staff users are not authorized to view or manage offline queue reviews.');
      err.statusCode = 403;
      err.errorCode = 'AUTHORIZATION_DENIED';
      err.code = 'AUTHORIZATION_DENIED';
      throw err;
    }

    if (!['CAFE_ADMIN', 'MASTER'].includes(role)) {
      const err = new Error(`Role ${role} is not authorized for offline queue review.`);
      err.statusCode = 403;
      err.errorCode = 'AUTHORIZATION_DENIED';
      err.code = 'AUTHORIZATION_DENIED';
      throw err;
    }

    const query = { organisationId: cleanOrg, status: 'PENDING_REVIEW' };

    if (role === 'CAFE_ADMIN') {
      const assignedCafes = [
        ...(authUser?.assignedCafeIds || []),
        authUser?.primaryCafeId || authUser?.cafeId,
      ].filter(Boolean).map((c) => String(c).trim().toUpperCase());

      if (assignedCafes.length === 0) {
        const err = new Error('Café Admin has no assigned cafés.');
        err.statusCode = 403;
        err.errorCode = 'CAFE_ACCESS_DENIED';
        err.code = 'CAFE_ACCESS_DENIED';
        throw err;
      }

      if (cafeId) {
        const cleanCafe = String(cafeId).trim().toUpperCase();
        if (!assignedCafes.includes(cleanCafe)) {
          const err = new Error('You do not have access to this café.');
          err.statusCode = 403;
          err.errorCode = 'CAFE_ACCESS_DENIED';
          err.code = 'CAFE_ACCESS_DENIED';
          throw err;
        }
        query.cafeId = cleanCafe;
      } else {
        query.cafeId = { $in: assignedCafes };
      }
    } else if (cafeId) {
      query.cafeId = String(cafeId).trim().toUpperCase();
    }

    return PosOfflineReviewItem.find(query).sort({ capturedAtClient: 1 }).lean();
  }

  /**
   * REC-13A / REC-13B: Executes authorized review of an offline-captured transaction.
   * Actions: APPROVE_AND_FINALIZE, REJECT, ESCALATE.
   *
   * Enforces:
   * - Strict Policy A authorization: Assigned CAFE_ADMIN, MASTER (OWNER and STAFF strictly denied with 403)
   * - Cross-café denial (Foreign Café Admin denied with 403)
   * - Re-checks reviewer current status and role against database at execution time
   * - Atomic transition (PENDING_REVIEW -> APPROVING -> APPROVED_FINALIZED) to prevent race conditions
   * - Separation of originating cashier identity vs reviewer identity
   * - Idempotent replay: approving an already finalized review returns existing bill
   */
  static async reviewItem({
    reviewId,
    action,
    reason = '',
    authContext,
  }) {
    if (!reviewId) {
      const err = new Error('reviewId is required for review.');
      err.statusCode = 400;
      throw err;
    }

    const normAction = String(action || '').trim().toUpperCase();
    if (!['APPROVE_AND_FINALIZE', 'REJECT', 'ESCALATE'].includes(normAction)) {
      const err = new Error(`Invalid review action: ${action}. Must be APPROVE_AND_FINALIZE, REJECT, or ESCALATE.`);
      err.statusCode = 400;
      throw err;
    }

    const reviewerRole = (authContext?.role || '').toUpperCase();
    const reviewerUserId = (authContext?.userId || '').trim().toUpperCase();
    const reviewedByRole = reviewerRole;
    const reviewedByUserId = reviewerUserId;
    const cleanOrg = (authContext?.organisationId || 'ORG-ZAMORIN').trim().toUpperCase();

    // 1. Initial Role Governance Check (Policy A: Owner and Staff are strictly barred)
    if (reviewerRole === 'OWNER') {
      const err = new Error('Owner does not possess offline POS review authorization (Segregation of Duties).');
      err.statusCode = 403;
      err.errorCode = 'AUTHORIZATION_DENIED';
      err.code = 'AUTHORIZATION_DENIED';
      throw err;
    }

    if (reviewerRole === 'STAFF') {
      const err = new Error('Staff users are not authorized to perform offline queue governance review.');
      err.statusCode = 403;
      err.errorCode = 'AUTHORIZATION_DENIED';
      err.code = 'AUTHORIZATION_DENIED';
      throw err;
    }

    if (!['CAFE_ADMIN', 'MASTER'].includes(reviewerRole)) {
      const err = new Error(`Role ${reviewerRole} is not authorized for offline queue review.`);
      err.statusCode = 403;
      err.errorCode = 'AUTHORIZATION_DENIED';
      err.code = 'AUTHORIZATION_DENIED';
      throw err;
    }

    // 2. Lookup Review Item
    const reviewItem = await PosOfflineReviewItem.findOne({
      organisationId: cleanOrg,
      $or: [{ reviewId }, { saleAttemptId: reviewId }],
    });

    if (!reviewItem) {
      const err = new Error(`Offline review item ${reviewId} not found.`);
      err.statusCode = 404;
      err.errorCode = 'NOT_FOUND';
      err.code = 'NOT_FOUND';
      throw err;
    }

    const itemCafeId = reviewItem.cafeId;

    // 3. Cross-Café Scoping Check & Execution-Time Re-Authorization (Section 7)
    // Validate caller authority against canonical database records
    const canonicalReviewer = await User.findOne({
      userId: reviewerUserId,
      organisationId: cleanOrg,
    }).lean();

    if (canonicalReviewer) {
      const accountStatus = String(canonicalReviewer.accountStatus || canonicalReviewer.status || 'ACTIVE').toUpperCase();
      if (['DISABLED', 'TERMINATED', 'SUSPENDED', 'DEACTIVATED', 'ARCHIVED', 'LOCKED', 'EXITED'].includes(accountStatus)) {
        const err = new Error(`Reviewer account ${reviewerUserId} is currently ${accountStatus}. Execution denied.`);
        err.statusCode = 403;
        err.errorCode = 'AUTHORIZATION_DENIED';
        err.code = 'AUTHORIZATION_DENIED';
        throw err;
      }

      const activeRole = String(canonicalReviewer.role || '').toUpperCase();
      if (activeRole === 'OWNER') {
        const err = new Error('Owner role does not possess offline POS review authorization (Segregation of Duties).');
        err.statusCode = 403;
        err.errorCode = 'AUTHORIZATION_DENIED';
        err.code = 'AUTHORIZATION_DENIED';
        throw err;
      }

      if (activeRole === 'STAFF' || !['CAFE_ADMIN', 'MASTER'].includes(activeRole)) {
        const err = new Error(`Current role ${activeRole} is not authorized for offline review execution.`);
        err.statusCode = 403;
        err.errorCode = 'AUTHORIZATION_DENIED';
        err.code = 'AUTHORIZATION_DENIED';
        throw err;
      }

      if (activeRole === 'CAFE_ADMIN') {
        const liveAssignedCafes = [
          ...(canonicalReviewer.assignedCafeIds || []),
          canonicalReviewer.primaryCafeId || canonicalReviewer.cafeId,
        ].filter(Boolean).map((c) => String(c).trim().toUpperCase());

        if (!liveAssignedCafes.includes(itemCafeId)) {
          const err = new Error(`Café Admin ${reviewerUserId} is not assigned to café ${itemCafeId}. Authorization revoked.`);
          err.statusCode = 403;
          err.errorCode = 'CAFE_ACCESS_DENIED';
          err.code = 'CAFE_ACCESS_DENIED';
          throw err;
        }
      }
    } else if (reviewerRole === 'CAFE_ADMIN') {
      const assignedCafes = [
        ...(authContext?.assignedCafeIds || []),
        authContext?.primaryCafeId || authContext?.cafeId,
      ].filter(Boolean).map((c) => String(c).trim().toUpperCase());

      if (!assignedCafes.includes(itemCafeId)) {
        const err = new Error(`Café Admin ${reviewerUserId} is not authorized for café ${itemCafeId}.`);
        err.statusCode = 403;
        err.errorCode = 'CAFE_ACCESS_DENIED';
        err.code = 'CAFE_ACCESS_DENIED';
        throw err;
      }
    }

    // 4. Idempotency Guard: if already finalized or rejected
    if (reviewItem.status === 'APPROVED_FINALIZED') {
      return {
        success: true,
        isIdempotentReplay: true,
        reviewStatus: 'APPROVED_FINALIZED',
        message: 'Offline transaction was already reviewed, approved, and finalized.',
        reviewId: reviewItem.reviewId,
        billId: reviewItem.finalizedBillId,
        invoiceNumber: reviewItem.finalizedInvoiceNumber,
        originatingUserId: reviewItem.originatingUserId,
        reviewedByUserId: reviewItem.reviewedByUserId,
      };
    }

    if (reviewItem.status === 'REJECTED') {
      return {
        success: true,
        isIdempotentReplay: true,
        reviewStatus: 'REJECTED',
        message: 'Offline transaction was previously rejected.',
        reviewId: reviewItem.reviewId,
        originatingUserId: reviewItem.originatingUserId,
        reviewedByUserId: reviewItem.reviewedByUserId,
      };
    }

    // 6. Review Item State Race & Atomic Transition (Section 8)
    const nextStatus = normAction === 'APPROVE_AND_FINALIZE' ? 'APPROVING' : (normAction === 'REJECT' ? 'REJECTED' : 'ESCALATED');
    const lockedItem = await PosOfflineReviewItem.findOneAndUpdate(
      {
        _id: reviewItem._id,
        status: 'PENDING_REVIEW',
      },
      {
        $set: {
          status: nextStatus,
          reviewedByUserId,
          reviewedByRole: reviewerRole,
          reviewedAt: new Date(),
          reviewDecision: normAction,
          reviewNotes: reason || '',
        },
      },
      { returnDocument: 'after' }
    );

    if (!lockedItem) {
      // Race: item was already claimed, approving, or finalized concurrently
      const freshItem = await PosOfflineReviewItem.findById(reviewItem._id).lean();
      if (freshItem?.status === 'APPROVED_FINALIZED') {
        return {
          success: true,
          isIdempotentReplay: true,
          reviewStatus: 'APPROVED_FINALIZED',
          message: 'Offline transaction was already reviewed, approved, and finalized.',
          reviewId: freshItem.reviewId,
          billId: freshItem.finalizedBillId,
          invoiceNumber: freshItem.finalizedInvoiceNumber,
          originatingUserId: freshItem.originatingUserId,
          reviewedByUserId: freshItem.reviewedByUserId,
        };
      }
      const err = new Error(`Concurrent review conflict: item is currently in status ${freshItem?.status}.`);
      err.statusCode = 409;
      err.errorCode = 'REVIEW_STATE_CONFLICT';
      err.code = 'REVIEW_STATE_CONFLICT';
      throw err;
    }

    // 7. Execute Action
    if (normAction === 'REJECT') {
      if (!reason || !reason.trim()) {
        // Rollback state lock
        await PosOfflineReviewItem.findByIdAndUpdate(reviewItem._id, { $set: { status: 'PENDING_REVIEW' } });
        const err = new Error('A rejection reason is mandatory when rejecting an offline transaction.');
        err.statusCode = 400;
        throw err;
      }

      // Audit Rejection
      try {
        await auditService.recordAuditEvent({
          organisationId: cleanOrg,
          cafeId: itemCafeId,
          actorUserId: reviewerUserId,
          actorRole: reviewerRole,
          module: 'POS_OFFLINE_SYNC',
          action: 'OFFLINE_POS_REVIEW_REJECTED',
          entityType: 'POS_OFFLINE_REVIEW_ITEM',
          entityId: reviewItem.reviewId,
          reason: reason.trim(),
          result: 'SUCCESS',
          riskClassification: 'HIGH',
          correlationId: reviewItem.idempotencyKey,
          metadata: {
            saleAttemptId: reviewItem.saleAttemptId,
            originatingUserId: reviewItem.originatingUserId,
            totalPaisa: reviewItem.totalPaisa,
          },
        });
      } catch (_) {}

      return {
        success: true,
        reviewStatus: 'REJECTED',
        message: 'Offline transaction was rejected. Evidence preserved for audit.',
        reviewId: reviewItem.reviewId,
        originatingUserId: reviewItem.originatingUserId,
        reviewedByUserId: reviewerUserId,
      };
    }

    if (normAction === 'ESCALATE') {
      try {
        await auditService.recordAuditEvent({
          organisationId: cleanOrg,
          cafeId: itemCafeId,
          actorUserId: reviewerUserId,
          actorRole: reviewerRole,
          module: 'POS_OFFLINE_SYNC',
          action: 'OFFLINE_POS_REVIEW_ESCALATED',
          entityType: 'POS_OFFLINE_REVIEW_ITEM',
          entityId: reviewItem.reviewId,
          reason: reason.trim() || 'Escalated to Master governance.',
          result: 'SUCCESS',
          riskClassification: 'MEDIUM',
          correlationId: reviewItem.idempotencyKey,
        });
      } catch (_) {}

      return {
        success: true,
        reviewStatus: 'ESCALATED',
        message: 'Offline transaction escalated to Master oversight.',
        reviewId: reviewItem.reviewId,
      };
    }

    // 8. Action: APPROVE_AND_FINALIZE
    try {
      const tx = reviewItem.payloadSnapshot || {};
      const totalPaisa = reviewItem.totalPaisa;
      const mappedLineItems = (Array.isArray(tx.lineItems) && tx.lineItems.length > 0
        ? tx.lineItems
        : [{ menuItemId: 'ITEM-OFFLINE', itemNameSnapshot: 'Offline Sale Item', quantity: 1, unitPricePaisa: totalPaisa }]
      ).map((item, idx) => {
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        const price = Math.max(0, Math.round(Number(item.unitPricePaisa ?? item.pricePaisa ?? (item.price != null ? item.price * 100 : 0))));
        return {
          menuItemId: item.menuItemId || item.itemId || item.id || `ITEM-OFFLINE-${idx + 1}`,
          itemNameSnapshot: item.itemNameSnapshot || item.name || 'Offline Sale Item',
          quantity: qty,
          unitPricePaisa: price,
          modifiers: item.modifiers || {},
          itemNotes: item.itemNotes || item.notes || `REVIEWED_BY_${reviewerUserId}`,
          taxRatePercent: typeof item.taxRatePercent === 'number' ? item.taxRatePercent : 5,
          taxClassification: item.taxClassification || 'GST_5',
          discountPaisa: Math.max(0, Math.round(Number(item.discountPaisa || 0))),
        };
      });

      const orderPayload = {
        action: 'SAVE',
        cafeId: itemCafeId,
        orderType: tx.orderType || 'QUICK_SALE',
        serviceMode: tx.serviceMode || tx.orderType || 'QUICK_SALE',
        tableNumber: tx.tableNumber || '',
        tableToken: tx.tableToken || '',
        guestCovers: Math.max(1, Number(tx.guestCovers) || 1),
        discountPaisa: Math.max(0, Number(tx.discountPaisa) || 0),
        paymentMethod: tx.paymentMethod || 'CASH',
        registerId: tx.registerId || 'REG-01',
        registerSessionId: tx.registerSessionId || tx.shiftId || '',
        idempotencyKey: reviewItem.idempotencyKey,
        saleAttemptId: reviewItem.saleAttemptId,
        clientOfflineId: reviewItem.clientOfflineId,
        offlineCreatedAt: reviewItem.capturedAtClient,
        catalogVersion: reviewItem.catalogVersion,
        lineItems: mappedLineItems,
        tenders: tx.tenders || [
          {
            paymentMethod: tx.paymentMethod || 'CASH',
            amountPaisa: totalPaisa,
            provider: 'CASH_REGISTER',
            paymentReference: tx.paymentReference || `CASH-${reviewItem.clientOfflineId}`,
          },
        ],
        isImmediateCompletion: true,
        isOfflineReplay: true,
        reviewedByUserId,
        reviewedByRole,
        reviewReason: reason || 'Authorized review approval',
        reviewId: reviewItem.reviewId,
      };

      // Keep original cashier as the originating identity
      const commitAuthContext = {
        organisationId: cleanOrg,
        cafeId: itemCafeId,
        userId: reviewItem.originatingUserId,
        role: 'STAFF',
      };

      const commitResult = await PosOrderService.processOrder(
        orderPayload,
        commitAuthContext,
        'SAVE',
        {
          isOfflineReplay: true,
          clientOfflineId: reviewItem.clientOfflineId,
          reviewedByUserId,
          reviewedByRole,
          reviewReason: reason,
          reviewId: reviewItem.reviewId,
        }
      );

      const finalizedBill = commitResult.bill || commitResult.data;
      const billId = finalizedBill?.billId || commitResult.billId;
      const invoiceNumber = finalizedBill?.invoiceNumber || commitResult.invoiceNumber;

      lockedItem.status = 'APPROVED_FINALIZED';
      lockedItem.reviewDecision = 'APPROVE_AND_FINALIZE';
      lockedItem.reviewedByUserId = reviewerUserId;
      lockedItem.reviewedByRole = reviewerRole;
      lockedItem.reviewNotes = reason.trim() || 'Approved by authorized reviewer';
      lockedItem.reviewedAt = new Date();
      lockedItem.finalizedBillId = billId;
      lockedItem.finalizedInvoiceNumber = invoiceNumber;
      await lockedItem.save();

      // Audit Approval
      try {
        await auditService.recordAuditEvent({
          organisationId: cleanOrg,
          cafeId: itemCafeId,
          actorUserId: reviewerUserId,
          actorRole: reviewerRole,
          module: 'POS_OFFLINE_SYNC',
          action: 'OFFLINE_POS_REVIEW_APPROVED',
          entityType: 'POS_OFFLINE_REVIEW_ITEM',
          entityId: reviewItem.reviewId,
          reason: reason.trim() || 'Approved by authorized reviewer',
          result: 'SUCCESS',
          riskClassification: 'HIGH',
          correlationId: reviewItem.idempotencyKey,
          metadata: {
            saleAttemptId: reviewItem.saleAttemptId,
            originatingUserId: reviewItem.originatingUserId,
            reviewerUserId,
            billId,
            invoiceNumber,
            totalPaisa: reviewItem.totalPaisa,
          },
        });
      } catch (_) {}

      return {
        success: true,
        reviewStatus: 'APPROVED_FINALIZED',
        message: 'Offline transaction approved and finalized into official bill.',
        reviewId: reviewItem.reviewId,
        billId,
        invoiceNumber,
        originatingUserId: reviewItem.originatingUserId,
        reviewedByUserId,
        finalizedAt: lockedItem.reviewedAt,
        bomDepletionStatus: finalizedBill?.bomDepletionStatus || 'DEPLETED',
      };
    } catch (commitErr) {
      // Revert lock if commit failed before bill creation
      await PosOfflineReviewItem.findByIdAndUpdate(reviewItem._id, {
        $set: { status: 'PENDING_REVIEW' }
      });
      throw commitErr;
    }
  }
}

OfflineSyncService.OFFLINE_POLICY_CLASSES = OFFLINE_POLICY_CLASSES;

module.exports = OfflineSyncService;
module.exports.OFFLINE_POLICY_CLASSES = OFFLINE_POLICY_CLASSES;


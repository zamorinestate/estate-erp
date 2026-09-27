'use strict';

/**
 * APPROVAL CONTROLLER
 */

const mongoose = require('mongoose');

const {
  Approval,
  APPROVAL_STATUSES,
} = require('../models/Approval');

const {
  SequenceCounter,
} = require('../models/SequenceCounter');

const {
  asyncHandler,
} = require('../utils/asyncHandler');

const {
  ApiError,
} = require('../utils/ApiError');

const {
  recordRequestAudit,
} = require('../services/auditService');

const { LeaveRequest } = require('../models/LeaveRequest');
const { Expense } = require('../models/Expense');
const { PurchaseOrder } = require('../models/PurchaseOrder');
const { StaffLoanAdvance } = require('../models/StaffLoanAdvance');
const { ShiftChangeRequest } = require('../models/ShiftChangeRequest');
const { ProfileChangeRequest } = require('../models/ProfileChangeRequest');
const { AttendanceCorrectionRequest } = require('../models/AttendanceCorrectionRequest');
const { Attendance } = require('../modules/attendance/Attendance');
const { Notification } = require('../models/Notification');
const { NotificationOutbox } = require('../models/NotificationOutbox');
const { User } = require('../models/User');
const { reconcileLeaveToAttendance } = require('../services/leaveReconciliationService');

async function sendNotificationAndOutbox({
  organisationId,
  recipientUserId,
  recipientRole = 'STAFF',
  eventType,
  category = 'OPERATIONS',
  title,
  message,
  deepLink = '',
  correlationId = null,
  actorUserId = 'SYSTEM',
  sourceModule = 'APPROVALS',
  sourceEntityType = 'APPROVAL',
  sourceEntityId = null,
  deduplicationKey = null,
}) {
  try {
    const user = await User.findOne({ organisationId, userId: recipientUserId }).select('email name role').lean();
    const recipientEmail = user?.email || `${String(recipientUserId).toLowerCase()}@zamorincafe.com`;
    const recipientName = user?.name || recipientUserId;
    const finalRole = user?.role || recipientRole;

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const notifId = await SequenceCounter.generateId({
      organisationId,
      sequenceKey: `NOTIFICATION_${todayStr}`,
      prefix: `NT-${todayStr}`,
      minimumDigits: 4,
    });
    const finalCorrelationId = correlationId || notifId;
    const finalEntityId = sourceEntityId || notifId;
    const finalDedupKey = deduplicationKey || `${recipientUserId}:${eventType}:${finalEntityId}`;

    await Notification.create({
      notificationId: notifId,
      organisationId,
      eventType,
      category,
      recipientUserId,
      recipientRole: finalRole,
      recipientEmail,
      title,
      message,
      priority: 'NORMAL',
      channels: ['IN_APP'],
      deepLink,
      sourceModule,
      sourceEntityType,
      sourceEntityId: finalEntityId,
      deduplicationKey: finalDedupKey,
      correlationId: finalCorrelationId,
      createdBy: actorUserId,
      status: 'DELIVERED',
      deliveredAt: new Date(),
    });

    const outboxId = await SequenceCounter.generateId({
      organisationId,
      sequenceKey: `NOTIFICATION_OUTBOX_${todayStr}`,
      prefix: `OUT-${todayStr}`,
      minimumDigits: 4,
    });
    await NotificationOutbox.create({
      outboxId,
      organisationId,
      eventType,
      recipientUserId,
      recipientEmail,
      recipientName,
      recipientRole: finalRole,
      templateId: 'GENERAL_APPROVAL_DECISION',
      subject: title,
      renderedSubject: title,
      renderedBody: message,
      renderedBodyPlain: message,
      correlationId: finalCorrelationId,
      idempotencyKey: finalDedupKey,
      channels: ['EMAIL'],
      status: 'QUEUED',
      nextAttemptAt: new Date(),
    });
  } catch (err) {
    console.warn(`[APPROVAL_NOTIF_WARN] Could not emit notification to ${recipientUserId}:`, err.message);
  }
}

function normalizeId(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

const listApprovals = asyncHandler(async (request, response) => {
  const page = parsePositiveInteger(request.query.page, 1, 1000);
  const limit = parsePositiveInteger(request.query.limit, 25, 100);
  const skip = (page - 1) * limit;

  const filter = { organisationId: request.auth.organisationId };
  const { status } = request.query;

  if (status && APPROVAL_STATUSES.includes(status.toUpperCase())) {
    filter.status = status.toUpperCase();
  }

  if (!['MASTER', 'OWNER'].includes(request.auth.role)) {
    const assigned = Array.isArray(request.auth.assignedCafeIds)
      ? request.auth.assignedCafeIds
      : (request.auth.assignedCafeIds ? [request.auth.assignedCafeIds] : []);
    filter.cafeId = { $in: assigned };
  }

  const [approvals, total] = await Promise.all([
    Approval.find(filter)
      .select('-__v -version')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Approval.countDocuments(filter),
  ]);

  return response.status(200).json({
    success: true,
    data: {
      approvals,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
    correlationId: request.correlationId || null,
  });
});

/**
 * Entity types whose approval decisions are absolutely restricted to MASTER.
 * These workflows have their own canonical controllers (expenseController,
 * attendanceController, etc.) that enforce MASTER-only decisions.
 * Allowing OWNER or CAFE_ADMIN to decide a generic Approval record tagged
 * with these types would create an audit-trail pollution risk.
 */
const PROTECTED_ENTITY_TYPES = new Set([
  'EXPENSE',
  'OVERTIME',
  'OVERTIME_DECISION',
  'PAYROLL',
  'PAYROLL_RUN',
  'PERSONAL_LEDGER',
  'USER_ADMINISTRATION',
]);

const decideApproval = asyncHandler(async (request, response) => {
  const approvalId = normalizeId(request.params.approvalId);
  const { decision, reason } = request.body; // APPROVED or REJECTED

  const targetDecision = normalizeId(decision);
  if (!['APPROVED', 'REJECTED'].includes(targetDecision)) {
    throw new ApiError(400, 'INVALID_DECISION', 'Decision must be APPROVED or REJECTED.');
  }

  const approval = await Approval.findOne({
    approvalId,
    organisationId: request.auth.organisationId,
  });

  if (!approval) {
    throw new ApiError(404, 'NOT_FOUND', 'Approval request not found.');
  }

  const assigned = Array.isArray(request.auth.assignedCafeIds)
    ? request.auth.assignedCafeIds
    : (request.auth.assignedCafeIds ? [request.auth.assignedCafeIds] : []);
  if (request.auth.role === 'CAFE_ADMIN' && (!approval.cafeId || !assigned.includes(approval.cafeId))) {
    throw new ApiError(
      403,
      'CAFE_ACCESS_DENIED',
      'You do not have access to decide this approval.'
    );
  }

  // Security: block non-MASTER roles from deciding approvals that belong to
  // MASTER-only protected workflows. These must be decided through their
  // canonical controller endpoints, not the generic approval route.
  if (
    PROTECTED_ENTITY_TYPES.has(approval.entityType) &&
    request.auth.role !== 'MASTER'
  ) {
    throw new ApiError(
      403,
      'PROTECTED_ENTITY_TYPE',
      `Approvals of type ${approval.entityType} must be decided through the ` +
      `canonical workflow endpoint by MASTER only. Use the appropriate module route.`
    );
  }

  // For protected entity types, Normal Master is also blocked — only Primary Master
  // has final authority over sensitive approval categories.
  if (
    PROTECTED_ENTITY_TYPES.has(approval.entityType) &&
    request.auth.role === 'MASTER' &&
    !request.auth.isPrimaryMaster
  ) {
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      `Deciding approvals of type ${approval.entityType} requires Primary Master authority.`
    );
  }

  if (approval.status !== 'PENDING') {
    throw new ApiError(409, 'ALREADY_DECIDED', `Approval request is already ${approval.status}.`);
  }

  approval.status = targetDecision;
  approval.decidedByUserId = request.auth.userId;
  approval.decisionReason = typeof reason === 'string' ? reason.trim() : '';
  approval.decidedAt = new Date();

  await approval.save();

  if (approval.entityType === 'LEAVE' || approval.entityType === 'LEAVE_REQUEST' || approval.entityType === 'LEAVE_CANCELLATION') {
    try {
      const leaveRequest = await LeaveRequest.findOne({
        organisationId: request.auth.organisationId,
        $or: [{ leaveId: approval.entityId }, { requestId: approval.entityId }],
      });
      if (leaveRequest) {
        const isCancellation = approval.entityType === 'LEAVE_CANCELLATION';
        if (isCancellation) {
          leaveRequest.status = targetDecision === 'APPROVED' ? 'CANCELLED' : 'APPROVED';
          leaveRequest.cancellationDecision = targetDecision;
          leaveRequest.cancellationDecidedBy = request.auth.userId;
          leaveRequest.cancellationDecidedAt = new Date();
        } else {
          leaveRequest.status = targetDecision;
          leaveRequest.approvedBy = request.auth.userId;
          leaveRequest.approvedAt = new Date();
        }
        leaveRequest.decisionReason = typeof reason === 'string' ? reason.trim() : '';
        await leaveRequest.save();

        const reconcileAction = isCancellation
          ? (targetDecision === 'APPROVED' ? 'CANCEL' : 'NONE')
          : (targetDecision === 'APPROVED' ? 'APPROVE' : 'REJECT');

        if (reconcileAction !== 'NONE') {
          await reconcileLeaveToAttendance({
            organisationId: request.auth.organisationId,
            leaveRequest,
            action: reconcileAction,
            actorUserId: request.auth.userId,
          });
        }

        // Emit Employee Notification
        const eventType = isCancellation
          ? (targetDecision === 'APPROVED' ? 'LEAVE_CANCELLATION_APPROVED' : 'LEAVE_CANCELLATION_REJECTED')
          : (targetDecision === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED');

        const resolvedEntityId = leaveRequest.leaveId || approval.entityId;
        await sendNotificationAndOutbox({
          organisationId: request.auth.organisationId,
          recipientUserId: leaveRequest.userId,
          recipientRole: 'STAFF',
          eventType,
          category: 'OPERATIONS',
          title: `Leave ${isCancellation ? 'Cancellation ' : ''}${targetDecision}`,
          message: `Your leave request for ${leaveRequest.startDate} to ${leaveRequest.endDate} was ${targetDecision.toLowerCase()}.${leaveRequest.decisionReason ? ' Reason: ' + leaveRequest.decisionReason : ''}`,
          deepLink: `#staff-leave?requestId=${resolvedEntityId}`,
          correlationId: request.correlationId,
          actorUserId: request.auth.userId,
          sourceModule: 'LEAVE',
          sourceEntityType: 'LEAVE_REQUEST',
          sourceEntityId: resolvedEntityId,
          deduplicationKey: `${leaveRequest.userId}:${eventType}:${resolvedEntityId}`,
        });
      }
    } catch (_) {}
  }

  // 2. EXPENSE APPROVAL DISPATCHER
  if (approval.entityType === 'EXPENSE') {
    try {
      const isObjectId = mongoose.Types.ObjectId.isValid(approval.entityId) && /^[0-9a-fA-F]{24}$/.test(approval.entityId);
      const expenseFilter = { organisationId: request.auth.organisationId };
      if (isObjectId) {
        expenseFilter.$or = [{ expenseId: approval.entityId }, { _id: approval.entityId }];
      } else {
        expenseFilter.expenseId = approval.entityId;
      }
      const expense = await Expense.findOne(expenseFilter);
      if (expense) {
        expense.status = targetDecision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
        expense.decisionAt = new Date();
        expense.decisionBy = request.auth.userId;
        expense.decisionReason = typeof reason === 'string' ? reason.trim() : '';
        if (targetDecision === 'APPROVED') {
          expense.approvalSnapshot = {
            version: (expense.approvalSnapshot?.version || 0) + 1,
            approvedAt: new Date(),
            approvedBy: request.auth.userId,
            approvedAmountPaisa: expense.totalPaisa,
            reason: expense.decisionReason,
          };
          expense.financeHandoff = {
            status: 'AWAITING_FINANCE',
            sentAt: new Date(),
            postingStatus: 'PENDING',
            paymentStatus: 'UNPAID',
          };
        }
        await expense.save();

        const recipientId = expense.preparerUserId || expense.ownerUserId || approval.requestingUserId;
        const expEvent = targetDecision === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED';
        await sendNotificationAndOutbox({
          organisationId: request.auth.organisationId,
          recipientUserId: recipientId,
          recipientRole: 'CAFE_ADMIN',
          eventType: expEvent,
          category: 'FINANCE',
          title: `Expense ${expense.expenseId} ${targetDecision}`,
          message: `Your expense claim for ₹${((expense.totalPaisa || 0) / 100).toFixed(2)} (${expense.purpose || expense.category}) was ${targetDecision.toLowerCase()}.${expense.decisionReason ? ' Reason: ' + expense.decisionReason : ''}`,
          deepLink: `#expenses?expenseId=${expense.expenseId}`,
          correlationId: request.correlationId,
          actorUserId: request.auth.userId,
          sourceModule: 'EXPENSE',
          sourceEntityType: 'EXPENSE',
          sourceEntityId: expense.expenseId,
          deduplicationKey: `${recipientId}:${expEvent}:${expense.expenseId}`,
        });
      }
    } catch (err) {
      console.warn(`[EXPENSE_SYNC_WARN] ${err.message}`);
    }
  }

  // 3. PURCHASE ORDER / PROCUREMENT APPROVAL DISPATCHER
  if (approval.entityType === 'PURCHASE_ORDER' || approval.entityType === 'PROCUREMENT') {
    try {
      const order = await PurchaseOrder.findOne({
        organisationId: request.auth.organisationId,
        purchaseOrderId: approval.entityId,
      });
      if (order) {
        if (targetDecision === 'APPROVED') {
          order.status = 'APPROVED';
          order.needsReapproval = false;
          order.masterApproval = {
            approvedAt: new Date(),
            approvedByUserId: request.auth.userId,
            approvalNotes: typeof reason === 'string' ? reason.trim() : 'Approved by Master via Approvals Workbench',
          };
          const allLinesFulfilled = (order.lineItems || []).every(
            (l) => (Number(l.acceptedReceivedQty) || 0) >= (Number(l.orderedQuantityBase) || 0)
          );
          if (allLinesFulfilled && order.grnReceipts?.length > 0) {
            order.receivingStatus = 'POSTED_TO_INVENTORY';
            order.status = 'CLOSED';
          } else if (order.grnReceipts?.length > 0) {
            order.receivingStatus = 'PARTIALLY_RECEIVED';
          }
        } else {
          order.status = 'CANCELLED';
          order.rejectionReason = typeof reason === 'string' ? reason.trim() : '';
        }
        order.lastModifiedByUserId = request.auth.userId;
        await order.save();

        const recipientId = order.createdByUserId || order.lastModifiedByUserId || approval.requestingUserId;
        const poEvent = targetDecision === 'APPROVED' ? 'PURCHASE_ORDER_APPROVED' : 'PURCHASE_ORDER_REJECTED';
        await sendNotificationAndOutbox({
          organisationId: request.auth.organisationId,
          recipientUserId: recipientId,
          recipientRole: 'CAFE_ADMIN',
          eventType: poEvent,
          category: 'OPERATIONS',
          title: `Purchase Order ${order.purchaseOrderId} ${targetDecision}`,
          message: `Purchase Order ${order.purchaseOrderId} (${order.cafeId}) was ${targetDecision.toLowerCase()} by Master.${reason ? ' Note: ' + reason : ''}`,
          deepLink: `#procurement?orderId=${order.purchaseOrderId}`,
          correlationId: request.correlationId,
          actorUserId: request.auth.userId,
          sourceModule: 'PROCUREMENT',
          sourceEntityType: 'PURCHASE_ORDER',
          sourceEntityId: order.purchaseOrderId,
          deduplicationKey: `${recipientId}:${poEvent}:${order.purchaseOrderId}`,
        });
      }
    } catch (err) {
      console.warn(`[PO_SYNC_WARN] ${err.message}`);
    }
  }

  // 4. LOAN & SALARY ADVANCE APPROVAL DISPATCHER
  if (approval.entityType === 'LOAN_ADVANCE' || approval.entityType === 'LOAN' || approval.entityType === 'SALARY_ADVANCE') {
    try {
      const loan = await StaffLoanAdvance.findOne({
        organisationId: request.auth.organisationId,
        loanAdvanceId: approval.entityId,
      });
      if (loan) {
        if (targetDecision === 'APPROVED') {
          loan.status = 'DISBURSEMENT_PENDING';
          loan.approvedAt = new Date();
          loan.approvedByUserId = request.auth.userId;
          loan.approvedAmountPaise = loan.requestedAmountPaise;
        } else {
          loan.status = 'REJECTED';
          loan.rejectionReason = typeof reason === 'string' ? reason.trim() : '';
          loan.rejectedAt = new Date();
          loan.rejectedByUserId = request.auth.userId;
        }
        await loan.save();

        const advType = loan.requestType === 'SALARY_ADVANCE' ? 'SALARY_ADVANCE' : 'LOAN';
        const advEvent = advType === 'SALARY_ADVANCE'
          ? (targetDecision === 'APPROVED' ? 'SALARY_ADVANCE_APPROVED' : 'SALARY_ADVANCE_REJECTED')
          : (targetDecision === 'APPROVED' ? 'LOAN_APPROVED' : 'LOAN_REJECTED');
        const loanRecipient = loan.employeeUserId || approval.requestingUserId;
        await sendNotificationAndOutbox({
          organisationId: request.auth.organisationId,
          recipientUserId: loanRecipient,
          recipientRole: 'STAFF',
          eventType: advEvent,
          category: 'PAYROLL',
          title: `Loan/Advance Request ${loan.loanAdvanceId} ${targetDecision}`,
          message: `Your ${loan.requestType || 'Loan'} request for ₹${(((loan.requestedAmountPaise || loan.principalPaise) || 0) / 100).toFixed(2)} was ${targetDecision.toLowerCase()}.${reason ? ' Reason: ' + reason : ''}`,
          deepLink: `#staff-loans-advances?id=${loan.loanAdvanceId}`,
          correlationId: request.correlationId,
          actorUserId: request.auth.userId,
          sourceModule: 'LOANS_ADVANCES',
          sourceEntityType: advType,
          sourceEntityId: loan.loanAdvanceId,
          deduplicationKey: `${loanRecipient}:${advEvent}:${loan.loanAdvanceId}`,
        });
      }
    } catch (err) {
      console.warn(`[LOAN_SYNC_WARN] ${err.message}`);
    }
  }

  // 5. SHIFT CHANGE APPROVAL DISPATCHER
  if (approval.entityType === 'SHIFT_CHANGE' || approval.entityType === 'SHIFT_CHANGE_REQUEST') {
    try {
      const shiftRequest = await ShiftChangeRequest.findOne({
        organisationId: request.auth.organisationId,
        requestId: approval.entityId,
      });
      if (shiftRequest) {
        shiftRequest.status = targetDecision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
        shiftRequest.reviewedByUserId = request.auth.userId;
        shiftRequest.reviewedAt = new Date();
        shiftRequest.reviewNotes = typeof reason === 'string' ? reason.trim() : '';
        await shiftRequest.save();

        const shiftEvent = targetDecision === 'APPROVED' ? 'SHIFT_CHANGE_APPROVED' : 'SHIFT_CHANGE_REJECTED';
        const shiftRecipient = shiftRequest.employeeUserId || approval.requestingUserId;
        await sendNotificationAndOutbox({
          organisationId: request.auth.organisationId,
          recipientUserId: shiftRecipient,
          recipientRole: 'STAFF',
          eventType: shiftEvent,
          category: 'OPERATIONS',
          title: `Shift Change Request ${shiftRequest.requestId} ${targetDecision}`,
          message: `Your shift change request for ${shiftRequest.requestedDate} was ${targetDecision.toLowerCase()}.${reason ? ' Notes: ' + reason : ''}`,
          deepLink: `#staff-attendance`,
          correlationId: request.correlationId,
          actorUserId: request.auth.userId,
          sourceModule: 'OPERATIONS',
          sourceEntityType: 'SHIFT_CHANGE_REQUEST',
          sourceEntityId: shiftRequest.requestId,
          deduplicationKey: `${shiftRecipient}:${shiftEvent}:${shiftRequest.requestId}`,
        });
      }
    } catch (err) {
      console.warn(`[SHIFT_SYNC_WARN] ${err.message}`);
    }
  }

  // 6. PROFILE CHANGE APPROVAL DISPATCHER
  if (approval.entityType === 'PROFILE_CHANGE') {
    try {
      const pcr = await ProfileChangeRequest.findOne({
        organisationId: request.auth.organisationId,
        requestId: approval.entityId,
      });
      if (pcr) {
        pcr.status = targetDecision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
        pcr.reviewedByUserId = request.auth.userId;
        pcr.reviewedAt = new Date();
        pcr.reviewNotes = typeof reason === 'string' ? reason.trim() : '';
        await pcr.save();

        if (targetDecision === 'APPROVED' && pcr.proposedValues && typeof pcr.proposedValues === 'object') {
          const user = await User.findOne({ organisationId: request.auth.organisationId, userId: pcr.userId });
          if (user) {
            Object.assign(user, pcr.proposedValues);
            user.updatedAt = new Date();
            await user.save();
          }
        }

        const pcrEvent = targetDecision === 'APPROVED' ? 'PROFILE_CHANGE_APPROVED' : 'PROFILE_CHANGE_REJECTED';
        const pcrRecipient = pcr.userId || approval.requestingUserId;
        await sendNotificationAndOutbox({
          organisationId: request.auth.organisationId,
          recipientUserId: pcrRecipient,
          recipientRole: 'STAFF',
          eventType: pcrEvent,
          category: 'OPERATIONS',
          title: `Profile Change Request ${pcr.requestId} ${targetDecision}`,
          message: `Your profile change request (${pcr.requestType}) was ${targetDecision.toLowerCase()}.${reason ? ' Reason: ' + reason : ''}`,
          deepLink: `#employee-profile`,
          correlationId: request.correlationId,
          actorUserId: request.auth.userId,
          sourceModule: 'SETTINGS',
          sourceEntityType: 'PROFILE_CHANGE_REQUEST',
          sourceEntityId: pcr.requestId,
          deduplicationKey: `${pcrRecipient}:${pcrEvent}:${pcr.requestId}`,
        });
      }
    } catch (err) {
      console.warn(`[PROFILE_SYNC_WARN] ${err.message}`);
    }
  }

  // 7. ATTENDANCE CORRECTION APPROVAL DISPATCHER
  if (approval.entityType === 'ATTENDANCE_CORRECTION') {
    try {
      const correctionRequest = await AttendanceCorrectionRequest.findOne({
        organisationId: request.auth.organisationId,
        $or: [{ correctionRequestId: approval.entityId }, { requestId: approval.entityId }],
      });
      if (correctionRequest) {
        correctionRequest.status = targetDecision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
        correctionRequest.reviewedBy = request.auth.userId;
        correctionRequest.reviewedByUserId = request.auth.userId;
        correctionRequest.reviewedAt = new Date();
        correctionRequest.reviewReason = typeof reason === 'string' ? reason.trim() : '';
        correctionRequest.reviewRemarks = typeof reason === 'string' ? reason.trim() : '';
        await correctionRequest.save();

        if (targetDecision === 'APPROVED') {
          let attendance = null;
          if (correctionRequest.attendanceId) {
            attendance = await Attendance.findOne({
              attendanceId: correctionRequest.attendanceId,
              organisationId: request.auth.organisationId,
            });
          }

          if (!attendance && correctionRequest.userId && correctionRequest.businessDate) {
            attendance = await Attendance.findOne({
              organisationId: request.auth.organisationId,
              userId: correctionRequest.userId,
              businessDate: correctionRequest.businessDate,
            });
          }

          if (attendance) {
            if (correctionRequest.requestedCheckInAt) attendance.checkInAt = correctionRequest.requestedCheckInAt;
            if (correctionRequest.requestedCheckOutAt) attendance.checkOutAt = correctionRequest.requestedCheckOutAt;
            if (correctionRequest.requestedBreakMinutes !== undefined) attendance.breakMinutes = correctionRequest.requestedBreakMinutes;
            attendance.status = attendance.checkOutAt ? 'CHECKED_OUT' : 'CHECKED_IN';
            attendance.isManualEntry = true;
            attendance.isCorrection = true;
            attendance.correctionRequired = false;
            attendance.correctionReason = `Approved by Master via Approvals: ${correctionRequest.reason || ''}`;
            attendance.updatedBy = request.auth.userId;
            await attendance.save();
          }
        }

        const corrEvent = targetDecision === 'APPROVED' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED';
        const corrRecipient = correctionRequest.userId || approval.requestingUserId;
        const corrId = correctionRequest.requestId || correctionRequest.correctionRequestId || approval.entityId;
        await sendNotificationAndOutbox({
          organisationId: request.auth.organisationId,
          recipientUserId: corrRecipient,
          recipientRole: 'STAFF',
          eventType: corrEvent,
          category: 'OPERATIONS',
          title: `Attendance Correction ${corrId} ${targetDecision}`,
          message: `Your attendance correction request for ${correctionRequest.businessDate} was ${targetDecision.toLowerCase()}.${reason ? ' Reason: ' + reason : ''}`,
          deepLink: `#staff-attendance`,
          correlationId: request.correlationId,
          actorUserId: request.auth.userId,
          sourceModule: 'ATTENDANCE',
          sourceEntityType: 'ATTENDANCE_CORRECTION',
          sourceEntityId: corrId,
          deduplicationKey: `${corrRecipient}:${corrEvent}:${corrId}`,
        });
      }
    } catch (err) {
      console.warn(`[ATTENDANCE_CORRECTION_SYNC_WARN] ${err.message}`);
    }
  }

  await recordRequestAudit({
    request,
    module: 'APPROVALS',
    action: 'DECIDE_APPROVAL',
    entityType: 'APPROVAL',
    entityId: approvalId,
    after: { status: targetDecision, reason: approval.decisionReason },
    result: 'SUCCESS',
    riskClassification: 'MEDIUM',
  });

  return response.status(200).json({
    success: true,
    data: { approval: approval.toObject() },
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  listApprovals,
  decideApproval,
};

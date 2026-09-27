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


function approvalTargetMissing(entityType, entityId) {
  return new ApiError(
    409,
    'APPROVAL_TARGET_NOT_FOUND',
    `The target record for approval ${entityType} / ${entityId} no longer exists. No decision was committed.`
  );
}

async function applyApprovalEntityDecision({
  approval,
  targetDecision,
  reasonText,
  auth,
  session,
}) {
  const organisationId = auth.organisationId;
  const actorUserId = auth.userId;
  const notifications = [];

  if (['LEAVE', 'LEAVE_REQUEST', 'LEAVE_CANCELLATION'].includes(approval.entityType)) {
    const leaveRequest = await LeaveRequest.findOne({
      organisationId,
      $or: [{ leaveId: approval.entityId }, { requestId: approval.entityId }],
    }).session(session);
    if (!leaveRequest) throw approvalTargetMissing(approval.entityType, approval.entityId);

    const isCancellation = approval.entityType === 'LEAVE_CANCELLATION';
    if (isCancellation) {
      leaveRequest.status = targetDecision === 'APPROVED' ? 'CANCELLED' : 'APPROVED';
      leaveRequest.cancellationDecision = targetDecision;
      leaveRequest.cancellationDecidedBy = actorUserId;
      leaveRequest.cancellationDecidedAt = new Date();
    } else {
      leaveRequest.status = targetDecision;
      leaveRequest.approvedBy = actorUserId;
      leaveRequest.approvedAt = new Date();
    }
    leaveRequest.decisionReason = reasonText;
    await leaveRequest.save({ session });

    const reconcileAction = isCancellation
      ? (targetDecision === 'APPROVED' ? 'CANCEL' : 'NONE')
      : (targetDecision === 'APPROVED' ? 'APPROVE' : 'REJECT');

    if (reconcileAction !== 'NONE') {
      await reconcileLeaveToAttendance({
        organisationId,
        leaveRequest,
        action: reconcileAction,
        actorUserId,
        session,
        skipAudit: true,
      });
    }

    const eventType = isCancellation
      ? (targetDecision === 'APPROVED' ? 'LEAVE_CANCELLATION_APPROVED' : 'LEAVE_CANCELLATION_REJECTED')
      : (targetDecision === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED');
    const resolvedEntityId = leaveRequest.leaveId || approval.entityId;
    notifications.push({
      recipientUserId: leaveRequest.userId,
      recipientRole: 'STAFF',
      eventType,
      category: 'OPERATIONS',
      title: `Leave ${isCancellation ? 'Cancellation ' : ''}${targetDecision}`,
      message: `Your leave request for ${leaveRequest.startDate} to ${leaveRequest.endDate} was ${targetDecision.toLowerCase()}.${reasonText ? ' Reason: ' + reasonText : ''}`,
      deepLink: `#staff-leave?requestId=${resolvedEntityId}`,
      sourceModule: 'LEAVE',
      sourceEntityType: 'LEAVE_REQUEST',
      sourceEntityId: resolvedEntityId,
      deduplicationKey: `${leaveRequest.userId}:${eventType}:${resolvedEntityId}`,
    });
    return notifications;
  }

  if (approval.entityType === 'EXPENSE') {
    const isObjectId = mongoose.Types.ObjectId.isValid(approval.entityId) && /^[0-9a-fA-F]{24}$/.test(approval.entityId);
    const expenseFilter = { organisationId };
    if (isObjectId) expenseFilter.$or = [{ expenseId: approval.entityId }, { _id: approval.entityId }];
    else expenseFilter.expenseId = approval.entityId;

    const expense = await Expense.findOne(expenseFilter).session(session);
    if (!expense) throw approvalTargetMissing(approval.entityType, approval.entityId);

    expense.status = targetDecision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    expense.decisionAt = new Date();
    expense.decisionBy = actorUserId;
    expense.decisionReason = reasonText;
    if (targetDecision === 'APPROVED') {
      expense.approvalSnapshot = {
        version: (expense.approvalSnapshot?.version || 0) + 1,
        approvedAt: new Date(),
        approvedBy: actorUserId,
        approvedAmountPaisa: expense.totalPaisa,
        reason: reasonText,
      };
      expense.financeHandoff = {
        status: 'AWAITING_FINANCE',
        sentAt: new Date(),
        postingStatus: 'PENDING',
        paymentStatus: 'UNPAID',
      };
    }
    await expense.save({ session });

    const recipientId = expense.preparerUserId || expense.ownerUserId || approval.requestingUserId;
    const eventType = targetDecision === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED';
    notifications.push({
      recipientUserId: recipientId,
      recipientRole: 'CAFE_ADMIN',
      eventType,
      category: 'FINANCE',
      title: `Expense ${expense.expenseId} ${targetDecision}`,
      message: `Your expense claim for ₹${((expense.totalPaisa || 0) / 100).toFixed(2)} (${expense.purpose || expense.category}) was ${targetDecision.toLowerCase()}.${reasonText ? ' Reason: ' + reasonText : ''}`,
      deepLink: `#expenses?expenseId=${expense.expenseId}`,
      sourceModule: 'EXPENSE',
      sourceEntityType: 'EXPENSE',
      sourceEntityId: expense.expenseId,
      deduplicationKey: `${recipientId}:${eventType}:${expense.expenseId}`,
    });
    return notifications;
  }

  if (approval.entityType === 'PURCHASE_ORDER' || approval.entityType === 'PROCUREMENT') {
    const order = await PurchaseOrder.findOne({
      organisationId,
      purchaseOrderId: approval.entityId,
    }).session(session);
    if (!order) throw approvalTargetMissing(approval.entityType, approval.entityId);

    if (targetDecision === 'APPROVED') {
      order.status = 'APPROVED';
      order.needsReapproval = false;
      order.masterApproval = {
        approvedAt: new Date(),
        approvedByUserId: actorUserId,
        approvalNotes: reasonText || 'Approved by Primary Master via Approvals Workbench',
      };
      const allLinesFulfilled = (order.lineItems || []).every(
        (line) => (Number(line.acceptedReceivedQty) || 0) >= (Number(line.orderedQuantityBase) || 0)
      );
      if (allLinesFulfilled && order.grnReceipts?.length > 0) {
        order.receivingStatus = 'POSTED_TO_INVENTORY';
        order.status = 'CLOSED';
      } else if (order.grnReceipts?.length > 0) {
        order.receivingStatus = 'PARTIALLY_RECEIVED';
      }
    } else {
      order.status = 'CANCELLED';
      order.rejectionReason = reasonText;
    }
    order.lastModifiedByUserId = actorUserId;
    await order.save({ session });

    const recipientId = order.createdByUserId || approval.requestingUserId;
    const eventType = targetDecision === 'APPROVED' ? 'PURCHASE_ORDER_APPROVED' : 'PURCHASE_ORDER_REJECTED';
    notifications.push({
      recipientUserId: recipientId,
      recipientRole: 'CAFE_ADMIN',
      eventType,
      category: 'OPERATIONS',
      title: `Purchase Order ${order.purchaseOrderId} ${targetDecision}`,
      message: `Purchase Order ${order.purchaseOrderId} (${order.cafeId}) was ${targetDecision.toLowerCase()} by Primary Master.${reasonText ? ' Note: ' + reasonText : ''}`,
      deepLink: `#procurement?orderId=${order.purchaseOrderId}`,
      sourceModule: 'PROCUREMENT',
      sourceEntityType: 'PURCHASE_ORDER',
      sourceEntityId: order.purchaseOrderId,
      deduplicationKey: `${recipientId}:${eventType}:${order.purchaseOrderId}`,
    });
    return notifications;
  }

  if (['LOAN_ADVANCE', 'LOAN', 'SALARY_ADVANCE'].includes(approval.entityType)) {
    const loan = await StaffLoanAdvance.findOne({
      organisationId,
      loanAdvanceId: approval.entityId,
    }).session(session);
    if (!loan) throw approvalTargetMissing(approval.entityType, approval.entityId);

    if (targetDecision === 'APPROVED') {
      loan.status = 'DISBURSEMENT_PENDING';
      loan.approvedAt = new Date();
      loan.approvedByUserId = actorUserId;
      loan.approvedAmountPaise = loan.requestedAmountPaise;
    } else {
      loan.status = 'REJECTED';
      loan.rejectionReason = reasonText;
      loan.rejectedAt = new Date();
      loan.rejectedByUserId = actorUserId;
    }
    await loan.save({ session });

    const advType = loan.requestType === 'SALARY_ADVANCE' ? 'SALARY_ADVANCE' : 'LOAN';
    const eventType = advType === 'SALARY_ADVANCE'
      ? (targetDecision === 'APPROVED' ? 'SALARY_ADVANCE_APPROVED' : 'SALARY_ADVANCE_REJECTED')
      : (targetDecision === 'APPROVED' ? 'LOAN_APPROVED' : 'LOAN_REJECTED');
    const recipientId = loan.employeeUserId || approval.requestingUserId;
    notifications.push({
      recipientUserId: recipientId,
      recipientRole: 'STAFF',
      eventType,
      category: 'PAYROLL',
      title: `Loan/Advance Request ${loan.loanAdvanceId} ${targetDecision}`,
      message: `Your ${loan.requestType || 'Loan'} request for ₹${(((loan.requestedAmountPaise || loan.principalPaise) || 0) / 100).toFixed(2)} was ${targetDecision.toLowerCase()}.${reasonText ? ' Reason: ' + reasonText : ''}`,
      deepLink: `#staff-loans-advances?id=${loan.loanAdvanceId}`,
      sourceModule: 'LOANS_ADVANCES',
      sourceEntityType: advType,
      sourceEntityId: loan.loanAdvanceId,
      deduplicationKey: `${recipientId}:${eventType}:${loan.loanAdvanceId}`,
    });
    return notifications;
  }

  if (approval.entityType === 'SHIFT_CHANGE' || approval.entityType === 'SHIFT_CHANGE_REQUEST') {
    const shiftRequest = await ShiftChangeRequest.findOne({
      organisationId,
      requestId: approval.entityId,
    }).session(session);
    if (!shiftRequest) throw approvalTargetMissing(approval.entityType, approval.entityId);

    shiftRequest.status = targetDecision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    shiftRequest.reviewedByUserId = actorUserId;
    shiftRequest.reviewedAt = new Date();
    shiftRequest.reviewNotes = reasonText;
    await shiftRequest.save({ session });

    const eventType = targetDecision === 'APPROVED' ? 'SHIFT_CHANGE_APPROVED' : 'SHIFT_CHANGE_REJECTED';
    const recipientId = shiftRequest.employeeUserId || approval.requestingUserId;
    notifications.push({
      recipientUserId: recipientId,
      recipientRole: 'STAFF',
      eventType,
      category: 'OPERATIONS',
      title: `Shift Change Request ${shiftRequest.requestId} ${targetDecision}`,
      message: `Your shift change request for ${shiftRequest.requestedDate} was ${targetDecision.toLowerCase()}.${reasonText ? ' Notes: ' + reasonText : ''}`,
      deepLink: '#staff-attendance',
      sourceModule: 'OPERATIONS',
      sourceEntityType: 'SHIFT_CHANGE_REQUEST',
      sourceEntityId: shiftRequest.requestId,
      deduplicationKey: `${recipientId}:${eventType}:${shiftRequest.requestId}`,
    });
    return notifications;
  }

  if (approval.entityType === 'PROFILE_CHANGE') {
    const pcr = await ProfileChangeRequest.findOne({
      organisationId,
      requestId: approval.entityId,
    }).session(session);
    if (!pcr) throw approvalTargetMissing(approval.entityType, approval.entityId);

    pcr.status = targetDecision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    pcr.reviewedByUserId = actorUserId;
    pcr.reviewedAt = new Date();
    pcr.reviewNotes = reasonText;
    await pcr.save({ session });

    if (targetDecision === 'APPROVED' && pcr.proposedValues && typeof pcr.proposedValues === 'object') {
      const user = await User.findOne({ organisationId, userId: pcr.userId }).session(session);
      if (!user) throw approvalTargetMissing('USER', pcr.userId);
      Object.assign(user, pcr.proposedValues);
      user.updatedAt = new Date();
      await user.save({ session });
    }

    const eventType = targetDecision === 'APPROVED' ? 'PROFILE_CHANGE_APPROVED' : 'PROFILE_CHANGE_REJECTED';
    const recipientId = pcr.userId || approval.requestingUserId;
    notifications.push({
      recipientUserId: recipientId,
      recipientRole: 'STAFF',
      eventType,
      category: 'OPERATIONS',
      title: `Profile Change Request ${pcr.requestId} ${targetDecision}`,
      message: `Your profile change request (${pcr.requestType}) was ${targetDecision.toLowerCase()}.${reasonText ? ' Reason: ' + reasonText : ''}`,
      deepLink: '#employee-profile',
      sourceModule: 'SETTINGS',
      sourceEntityType: 'PROFILE_CHANGE_REQUEST',
      sourceEntityId: pcr.requestId,
      deduplicationKey: `${recipientId}:${eventType}:${pcr.requestId}`,
    });
    return notifications;
  }

  if (approval.entityType === 'ATTENDANCE_CORRECTION') {
    const correctionRequest = await AttendanceCorrectionRequest.findOne({
      organisationId,
      $or: [{ correctionRequestId: approval.entityId }, { requestId: approval.entityId }],
    }).session(session);
    if (!correctionRequest) throw approvalTargetMissing(approval.entityType, approval.entityId);

    correctionRequest.status = targetDecision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    correctionRequest.reviewedBy = actorUserId;
    correctionRequest.reviewedByUserId = actorUserId;
    correctionRequest.reviewedAt = new Date();
    correctionRequest.reviewReason = reasonText;
    correctionRequest.reviewRemarks = reasonText;
    await correctionRequest.save({ session });

    if (targetDecision === 'APPROVED') {
      let attendance = null;
      if (correctionRequest.attendanceId) {
        attendance = await Attendance.findOne({
          attendanceId: correctionRequest.attendanceId,
          organisationId,
        }).session(session);
      }
      if (!attendance && correctionRequest.userId && correctionRequest.businessDate) {
        attendance = await Attendance.findOne({
          organisationId,
          userId: correctionRequest.userId,
          businessDate: correctionRequest.businessDate,
        }).session(session);
      }
      if (!attendance) throw approvalTargetMissing('ATTENDANCE', approval.entityId);

      if (correctionRequest.requestedCheckInAt) attendance.checkInAt = correctionRequest.requestedCheckInAt;
      if (correctionRequest.requestedCheckOutAt) attendance.checkOutAt = correctionRequest.requestedCheckOutAt;
      if (correctionRequest.requestedBreakMinutes !== undefined) attendance.breakMinutes = correctionRequest.requestedBreakMinutes;
      attendance.status = attendance.checkOutAt ? 'CHECKED_OUT' : 'CHECKED_IN';
      attendance.isManualEntry = true;
      attendance.isCorrection = true;
      attendance.correctionRequired = false;
      attendance.correctionReason = `Approved by Primary Master via Approvals: ${correctionRequest.reason || ''}`;
      attendance.updatedBy = actorUserId;
      await attendance.save({ session });
    }

    const eventType = targetDecision === 'APPROVED'
      ? 'ATTENDANCE_CORRECTION_APPROVED'
      : 'ATTENDANCE_CORRECTION_REJECTED';
    const recipientId = correctionRequest.userId || approval.requestingUserId;
    const correctionId = correctionRequest.requestId || correctionRequest.correctionRequestId || approval.entityId;
    notifications.push({
      recipientUserId: recipientId,
      recipientRole: 'STAFF',
      eventType,
      category: 'OPERATIONS',
      title: `Attendance Correction ${correctionId} ${targetDecision}`,
      message: `Your attendance correction request for ${correctionRequest.businessDate} was ${targetDecision.toLowerCase()}.${reasonText ? ' Reason: ' + reasonText : ''}`,
      deepLink: '#staff-attendance',
      sourceModule: 'ATTENDANCE',
      sourceEntityType: 'ATTENDANCE_CORRECTION',
      sourceEntityId: correctionId,
      deduplicationKey: `${recipientId}:${eventType}:${correctionId}`,
    });
    return notifications;
  }

  return notifications;
}

const decideApproval = asyncHandler(async (request, response) => {
  const approvalId = normalizeId(request.params.approvalId);
  const targetDecision = normalizeId(request.body?.decision);
  const reasonText = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';

  if (!['APPROVED', 'REJECTED'].includes(targetDecision)) {
    throw new ApiError(400, 'INVALID_DECISION', 'Decision must be APPROVED or REJECTED.');
  }

  const currentApproval = await Approval.findOne({
    approvalId,
    organisationId: request.auth.organisationId,
  }).lean();

  if (!currentApproval) {
    throw new ApiError(404, 'NOT_FOUND', 'Approval request not found.');
  }

  const assigned = Array.isArray(request.auth.assignedCafeIds)
    ? request.auth.assignedCafeIds
    : (request.auth.assignedCafeIds ? [request.auth.assignedCafeIds] : []);

  if (request.auth.role === 'CAFE_ADMIN' && (!currentApproval.cafeId || !assigned.includes(currentApproval.cafeId))) {
    throw new ApiError(403, 'CAFE_ACCESS_DENIED', 'You do not have access to decide this approval.');
  }

  if (PROTECTED_ENTITY_TYPES.has(currentApproval.entityType) && request.auth.role !== 'MASTER') {
    throw new ApiError(
      403,
      'PROTECTED_ENTITY_TYPE',
      `Approvals of type ${currentApproval.entityType} require Primary Master authority.`
    );
  }

  if (
    PROTECTED_ENTITY_TYPES.has(currentApproval.entityType) &&
    request.auth.role === 'MASTER' &&
    !request.auth.isPrimaryMaster
  ) {
    throw new ApiError(
      403,
      'PRIMARY_MASTER_AUTHORITY_REQUIRED',
      `Deciding approvals of type ${currentApproval.entityType} requires Primary Master authority.`
    );
  }

  let decidedApproval = null;
  let notifications = [];
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const approval = await Approval.findOne({
        approvalId,
        organisationId: request.auth.organisationId,
      }).session(session);

      if (!approval) throw new ApiError(404, 'NOT_FOUND', 'Approval request not found.');
      if (approval.status !== 'PENDING') {
        throw new ApiError(409, 'ALREADY_DECIDED', `Approval request is already ${approval.status}.`);
      }

      approval.status = targetDecision;
      approval.decidedByUserId = request.auth.userId;
      approval.decisionReason = reasonText;
      approval.decidedAt = new Date();

      notifications = await applyApprovalEntityDecision({
        approval,
        targetDecision,
        reasonText,
        auth: request.auth,
        session,
      });

      await approval.save({ session });
      decidedApproval = approval.toObject();
    }, {
      readPreference: 'primary',
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      maxCommitTimeMS: 10000,
    });
  } finally {
    await session.endSession();
  }

  for (const notification of notifications) {
    await sendNotificationAndOutbox({
      organisationId: request.auth.organisationId,
      ...notification,
      correlationId: request.correlationId,
      actorUserId: request.auth.userId,
    });
  }

  await recordRequestAudit({
    request,
    module: 'APPROVALS',
    action: 'DECIDE_APPROVAL',
    entityType: 'APPROVAL',
    entityId: approvalId,
    after: { status: targetDecision, reason: reasonText },
    result: 'SUCCESS',
    riskClassification: 'MEDIUM',
  });

  return response.status(200).json({
    success: true,
    data: { approval: decidedApproval },
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  listApprovals,
  decideApproval,
};

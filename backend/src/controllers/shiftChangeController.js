'use strict';

const { ShiftChangeRequest, SHIFT_CHANGE_STATUSES } = require('../models/ShiftChangeRequest');
const { ShiftRoster } = require('../models/ShiftRoster');
const { NotificationOutbox } = require('../models/NotificationOutbox');
const { Notification } = require('../models/Notification');
const { User } = require('../models/User');
const { Approval } = require('../models/Approval');
const { SequenceCounter } = require('../models/SequenceCounter');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordRequestAudit } = require('../services/auditService');

// 1. Employee: Submit Shift Change Request
const createSelfShiftChangeRequest = asyncHandler(async (request, response) => {
  const { organisationId, userId, name } = request.auth;
  const {
    requestedDate,
    endDate = null,
    currentShift = '',
    requestedShift,
    reason,
    notes = '',
    cafeId = null,
  } = request.body || {};

  if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(requestedDate).trim())) {
    throw new ApiError(400, 'INVALID_DATE', 'Requested date must be in YYYY-MM-DD format.');
  }

  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate).trim())) {
    throw new ApiError(400, 'INVALID_END_DATE', 'End date must be in YYYY-MM-DD format.');
  }

  if (!requestedShift || !String(requestedShift).trim()) {
    throw new ApiError(400, 'REQUESTED_SHIFT_REQUIRED', 'Requested shift is required.');
  }

  if (!reason || !String(reason).trim()) {
    throw new ApiError(400, 'REASON_REQUIRED', 'A reason for the shift change request is required.');
  }

  // Resolve cafeId if not passed in body
  let effectiveCafeId = cafeId;
  if (!effectiveCafeId) {
    const userDoc = await User.findOne({ userId, organisationId }).select('cafeId primaryCafeId assignedCafeIds').lean();
    effectiveCafeId = userDoc?.primaryCafeId || userDoc?.cafeId || userDoc?.assignedCafeIds?.[0] || 'ZC-0001';
  }

  const dateStr = new Date().getFullYear();
  const randSeq = Math.floor(1000 + Math.random() * 9000);
  const requestId = `SCR-${dateStr}-${randSeq}`;

  const shiftRequest = await ShiftChangeRequest.create({
    requestId,
    organisationId,
    employeeUserId: userId,
    employeeName: name || userId,
    cafeId: effectiveCafeId,
    requestedDate: String(requestedDate).trim(),
    endDate: endDate ? String(endDate).trim() : null,
    currentShift: String(currentShift || '').trim(),
    requestedShift: String(requestedShift).trim(),
    reason: String(reason).trim(),
    notes: String(notes || '').trim(),
    status: 'SUBMITTED',
  });

  try {
    let approvalId;
    try {
      approvalId = await SequenceCounter.generateId({
        organisationId,
        sequenceKey: 'APPROVAL',
        prefix: 'APP',
        minimumDigits: 5,
      });
    } catch {
      const approvalCount = await Approval.countDocuments({ organisationId });
      approvalId = `APP-${String(approvalCount + Math.floor(1000 + Math.random() * 9000)).padStart(5, '0')}`;
    }

    await Approval.create({
      approvalId,
      organisationId,
      cafeId: effectiveCafeId,
      entityType: 'SHIFT_CHANGE',
      entityId: shiftRequest.requestId,
      requestingUserId: userId,
      actionRequired: `Shift Change: ${shiftRequest.requestedDate} (${shiftRequest.currentShift || 'Current'} -> ${shiftRequest.requestedShift})`,
      amountPaisa: 0,
      status: 'PENDING',
    });

    const masterUsers = await User.find({ organisationId, role: 'MASTER', accountStatus: 'ACTIVE' }).select('userId email').lean();
    const recipientIds = new Set(masterUsers.map((m) => m.userId));
    recipientIds.add('MU-0001');

    const notifDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (const masterId of recipientIds) {
      const mUser = masterUsers.find((m) => m.userId === masterId);
      const notifId = `NT-${notifDateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      await Notification.create({
        notificationId: notifId,
        organisationId,
        cafeId: effectiveCafeId || 'ALL',
        eventType: 'SHIFT_CHANGE_REQUESTED',
        category: 'OPERATIONS',
        recipientUserId: masterId,
        recipientRole: 'MASTER',
        recipientEmail: mUser?.email || 'pradeeshk331@gmail.com',
        title: `🔄 Shift Change Request: ${userId}`,
        message: `${name || userId} requested shift change for ${requestedDate} (${currentShift || 'Current'} -> ${requestedShift}). Reason: ${reason}`,
        priority: 'NORMAL',
        channels: ['IN_APP'],
        deepLink: `#approvals`,
        sourceModule: 'ATTENDANCE',
        sourceEntityType: 'SHIFT_CHANGE',
        sourceEntityId: shiftRequest.requestId,
        deduplicationKey: `SCR_${shiftRequest.requestId}_${Date.now()}_${masterId}`,
        correlationId: request.correlationId || `CORR-SCR-${shiftRequest.requestId}-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'DELIVERED',
        deliveredAt: new Date(),
        createdBy: userId,
      });
    }
  } catch (err) {
    console.warn(`[SHIFT_CHANGE_APPROVAL_HOOK_WARN] ${err.message}`);
  }

  try {
    await recordRequestAudit({
      request,
      module: 'ATTENDANCE',
      action: 'SHIFT_CHANGE_REQUEST_CREATE',
      entityType: 'SHIFT_CHANGE_REQUEST',
      entityId: requestId,
      metadata: { requestedDate, requestedShift, reason },
      result: 'SUCCESS',
    });
  } catch (e) {}

  return response.status(201).json({
    success: true,
    message: 'Shift change request submitted successfully.',
    data: { request: shiftRequest, shiftRequest },
    correlationId: request.correlationId || null,
  });
});

// 2. Employee: List Own Shift Change Requests
const listSelfShiftChangeRequests = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { status, limit = 50, offset = 0 } = request.query;

  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const filter = { organisationId, employeeUserId: userId };
  if (status && SHIFT_CHANGE_STATUSES.includes(status)) {
    filter.status = status;
  }

  const [requests, total] = await Promise.all([
    ShiftChangeRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .lean(),
    ShiftChangeRequest.countDocuments(filter),
  ]);

  return response.status(200).json({
    success: true,
    data: { requests, total },
    correlationId: request.correlationId || null,
  });
});

// 3. Employee: Get My Shifts / Schedule
const getMyShiftsSchedule = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { startDate, endDate } = request.query;

  const rosterFilter = {
    organisationId,
    status: { $in: ['PUBLISHED', 'LOCKED'] },
    'assignments.userId': userId,
  };

  if (startDate || endDate) {
    if (startDate && endDate) {
      rosterFilter.rosterPeriodStart = { $lte: endDate };
      rosterFilter.rosterPeriodEnd = { $gte: startDate };
    } else if (startDate) {
      rosterFilter.rosterPeriodEnd = { $gte: startDate };
    } else if (endDate) {
      rosterFilter.rosterPeriodStart = { $lte: endDate };
    }
  }

  const rosters = await ShiftRoster.find(rosterFilter).lean();

  const mySchedule = [];
  for (const roster of rosters) {
    for (const assignment of roster.assignments || []) {
      if (assignment.userId === userId) {
        if (startDate && assignment.date < startDate) continue;
        if (endDate && assignment.date > endDate) continue;
        mySchedule.push({
          rosterId: roster.rosterId,
          cafeId: roster.cafeId,
          ...assignment,
        });
      }
    }
  }

  mySchedule.sort((a, b) => a.date.localeCompare(b.date));

  return response.status(200).json({
    success: true,
    data: { schedule: mySchedule, count: mySchedule.length },
    correlationId: request.correlationId || null,
  });
});

// 4. Org / Management: List Shift Change Requests
const listOrgShiftChangeRequests = asyncHandler(async (request, response) => {
  const { organisationId } = request.auth;
  const { status, cafeId, employeeUserId, limit = 50, offset = 0 } = request.query;

  const filter = { organisationId };
  if (status && SHIFT_CHANGE_STATUSES.includes(status)) {
    filter.status = status;
  }
  if (cafeId) filter.cafeId = cafeId;
  if (employeeUserId) filter.employeeUserId = employeeUserId;

  const [requests, total] = await Promise.all([
    ShiftChangeRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Math.min(Number(limit), 100))
      .lean(),
    ShiftChangeRequest.countDocuments(filter),
  ]);

  return response.status(200).json({
    success: true,
    data: { requests, total },
    correlationId: request.correlationId || null,
  });
});

// 5. Org / Management: Review Shift Change Request
const reviewShiftChangeRequest = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { requestId } = request.params;
  const { status, reviewNotes = '' } = request.body || {};

  if (!status || !SHIFT_CHANGE_STATUSES.includes(status)) {
    throw new ApiError(400, 'INVALID_STATUS', `Status must be one of: ${SHIFT_CHANGE_STATUSES.join(', ')}`);
  }

  const shiftRequest = await ShiftChangeRequest.findOne({ requestId, organisationId });
  if (!shiftRequest) {
    throw new ApiError(404, 'NOT_FOUND', 'Shift change request not found.');
  }

  shiftRequest.status = status;
  shiftRequest.reviewNotes = String(reviewNotes || '').trim();
  shiftRequest.reviewedByUserId = userId;
  shiftRequest.reviewedAt = new Date();
  await shiftRequest.save();

  // Sync Approval record
  try {
    const approvalStatus = status === 'APPROVED' ? 'APPROVED' : (status === 'REJECTED' ? 'REJECTED' : 'PENDING');
    await Approval.updateOne(
      { organisationId, entityId: requestId, status: 'PENDING' },
      {
        $set: {
          status: approvalStatus,
          decidedByUserId: userId,
          decisionReason: String(reviewNotes || '').trim(),
          decidedAt: new Date(),
        },
      }
    );
  } catch (_) {}

  // Create canonical notification to employee
  try {
    const recipientUser = await User.findOne({ organisationId, userId: shiftRequest.employeeUserId }).select('email role').lean();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const notifId = `NT-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
    const eventType = status === 'APPROVED' ? 'SHIFT_CHANGE_APPROVED' : 'SHIFT_CHANGE_REJECTED';
    await Notification.create({
      notificationId: notifId,
      organisationId,
      cafeId: shiftRequest.cafeId,
      eventType,
      category: 'OPERATIONS',
      recipientUserId: shiftRequest.employeeUserId,
      recipientRole: recipientUser?.role || 'STAFF',
      recipientEmail: recipientUser?.email || `${String(shiftRequest.employeeUserId).toLowerCase()}@zamorincafe.com`,
      title: `Shift Change Request ${status}`,
      message: `Your shift change request for ${shiftRequest.requestedDate} was ${status.toLowerCase()}.${reviewNotes ? ' Notes: ' + reviewNotes : ''}`,
      priority: 'NORMAL',
      channels: ['IN_APP'],
      deepLink: `#staff-attendance`,
      sourceModule: 'ATTENDANCE',
      sourceEntityType: 'SHIFT_CHANGE',
      sourceEntityId: shiftRequest.requestId,
      createdBy: userId,
    });
  } catch (e) {
    console.warn(`[SHIFT_CHANGE_NOTIF_WARN] ${e.message}`);
  }

  try {
    await recordRequestAudit({
      request,
      module: 'ATTENDANCE',
      action: 'SHIFT_CHANGE_REQUEST_REVIEW',
      entityType: 'SHIFT_CHANGE_REQUEST',
      entityId: requestId,
      metadata: { newStatus: status, reviewerUserId: userId },
      result: 'SUCCESS',
    });
  } catch (e) {}

  return response.status(200).json({
    success: true,
    message: `Shift change request ${requestId} has been updated to ${status}.`,
    data: { request: shiftRequest },
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  createSelfShiftChangeRequest,
  listSelfShiftChangeRequests,
  getMyShiftsSchedule,
  listOrgShiftChangeRequests,
  reviewShiftChangeRequest,
};

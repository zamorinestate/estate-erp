'use strict';

const { PayrollQuery, PAYROLL_QUERY_CATEGORIES, PAYROLL_QUERY_STATUSES } = require('../models/PayrollQuery');
const { NotificationOutbox } = require('../models/NotificationOutbox');
const { Notification } = require('../models/Notification');
const { User } = require('../models/User');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordRequestAudit } = require('../services/auditService');
const { SequenceCounter } = require('../models/SequenceCounter');

// 1. Employee Self-Service: Submit Payroll Query
const createSelfPayrollQuery = asyncHandler(async (request, response) => {
  const { organisationId, userId, name } = request.auth;
  const {
    payslipId = null,
    periodKey = null,
    category = 'GENERAL_SALARY',
    subject,
    description,
  } = request.body || {};

  if (!subject || !String(subject).trim()) {
    throw new ApiError(400, 'SUBJECT_REQUIRED', 'A subject for the payroll inquiry is required.');
  }

  if (!description || !String(description).trim()) {
    throw new ApiError(400, 'DESCRIPTION_REQUIRED', 'A detailed description of the inquiry is required.');
  }

  if (category && !PAYROLL_QUERY_CATEGORIES.includes(category)) {
    throw new ApiError(400, 'INVALID_CATEGORY', `Category must be one of: ${PAYROLL_QUERY_CATEGORIES.join(', ')}`);
  }

  const dateStr = new Date().getFullYear();
  const queryId = await SequenceCounter.generateId({
    organisationId,
    sequenceKey: `PAYROLL_QUERY_${dateStr}`,
    prefix: `PQ-${dateStr}`,
    minimumDigits: 4,
  });

  const query = await PayrollQuery.create({
    queryId,
    organisationId,
    employeeUserId: userId,
    employeeName: name || userId,
    payslipId: payslipId ? String(payslipId).trim() : null,
    periodKey: periodKey ? String(periodKey).trim() : null,
    category,
    subject: String(subject).trim(),
    description: String(description).trim(),
    status: 'SUBMITTED',
  });

  try {
    await recordRequestAudit({
      request,
      module: 'PAYROLL',
      action: 'PAYROLL_QUERY_SUBMIT',
      entityType: 'PAYROLL_QUERY',
      entityId: queryId,
      metadata: { userId, category, periodKey, payslipId },
      result: 'SUCCESS',
    });
  } catch (e) {}

  return response.status(201).json({
    success: true,
    message: 'Payroll inquiry submitted successfully and routed to payroll authority.',
    data: { query },
    correlationId: request.correlationId || null,
  });
});

// 2. Employee Self-Service: List My Payroll Queries
const listSelfPayrollQueries = asyncHandler(async (request, response) => {
  const { organisationId, userId } = request.auth;
  const { status, category, limit = 50 } = request.query;

  const filter = {
    organisationId,
    employeeUserId: userId,
  };

  if (status && status !== 'ALL') {
    filter.status = status;
  }
  if (category && category !== 'ALL') {
    filter.category = category;
  }

  const queries = await PayrollQuery.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, parseInt(limit, 10) || 50)))
    .lean();

  return response.status(200).json({
    success: true,
    data: { queries },
    correlationId: request.correlationId || null,
  });
});

// 3. Management: List Organisation Payroll Queries
const listOrgPayrollQueries = asyncHandler(async (request, response) => {
  const { organisationId, role, isPrimaryMaster } = request.auth;
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Only Master or Owner can view payroll queries.');
  }

  const { status, employeeUserId, page = 1, limit = 20 } = request.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const filter = { organisationId };
  if (status && status !== 'ALL') filter.status = status;
  if (employeeUserId && employeeUserId.trim()) filter.employeeUserId = employeeUserId.trim().toUpperCase();

  const [total, queries] = await Promise.all([
    PayrollQuery.countDocuments(filter),
    PayrollQuery.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
  ]);

  return response.status(200).json({
    success: true,
    data: {
      queries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    correlationId: request.correlationId || null,
  });
});

// 4. Management: Review & Resolve Payroll Query
const reviewPayrollQuery = asyncHandler(async (request, response) => {
  const { organisationId, userId, role } = request.auth;
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Only Master or Owner can resolve payroll queries.');
  }

  const queryId = request.params.queryId?.trim().toUpperCase();
  const { status, resolution = '' } = request.body || {};

  if (!status || !PAYROLL_QUERY_STATUSES.includes(status)) {
    throw new ApiError(400, 'INVALID_STATUS', `Status must be one of: ${PAYROLL_QUERY_STATUSES.join(', ')}`);
  }

  const query = await PayrollQuery.findOne({ organisationId, queryId });
  if (!query) {
    throw new ApiError(404, 'NOT_FOUND', `Payroll query ${queryId} not found.`);
  }

  query.status = status;
  query.reviewerUserId = userId;
  if (resolution) query.resolution = resolution.trim();
  if (status === 'RESOLVED' || status === 'REJECTED' || status === 'CLOSED') {
    query.resolvedAt = new Date();
  }
  await query.save();

  // Emit Notification to Staff
  try {
    const user = await User.findOne({ organisationId, userId: query.employeeUserId }).select('email name').lean();
    if (user) {
      const outboxDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const outboxId = await SequenceCounter.generateId({
        organisationId,
        sequenceKey: `NOTIFICATION_OUTBOX_${outboxDate}`,
        prefix: `OUT-${outboxDate}`,
        minimumDigits: 5,
      });
      await NotificationOutbox.create({
        outboxId,
        organisationId,
        eventType: 'PAYROLL_QUERY_UPDATE',
        recipientUserId: query.employeeUserId,
        recipientEmail: user.email,
        recipientName: user.name,
        recipientRole: 'STAFF',
        templateId: 'PAYROLL_QUERY_RESOLUTION',
        subject: `Update on Payroll Inquiry ${query.queryId}: ${status}`,
        renderedSubject: `Update on Payroll Inquiry ${query.queryId}: ${status}`,
        renderedBody: `Your payroll inquiry regarding "${query.subject}" has been updated to ${status}. Notes: ${resolution || 'None'}`,
        status: 'QUEUED',
        nextAttemptAt: new Date(),
      });

      const inAppDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const inAppId = await SequenceCounter.generateId({
        organisationId,
        sequenceKey: `NOTIFICATION_${inAppDate}`,
        prefix: `NT-${inAppDate}`,
        minimumDigits: 5,
      });
      await Notification.create({
        notificationId: inAppId,
        organisationId,
        eventType: 'PAYROLL_QUERY_UPDATE',
        category: 'OPERATIONS',
        recipientUserId: query.employeeUserId,
        recipientRole: 'STAFF',
        recipientEmail: user.email,
        title: `Payroll Inquiry ${query.queryId} ${status}`,
        message: `Your inquiry has been updated to ${status}. Details: ${resolution || 'Review complete.'}`,
        priority: 'NORMAL',
        channels: ['IN_APP'],
        deepLink: '#staff-payslips?tab=queries',
      });
    }
  } catch (notifErr) {}

  try {
    await recordRequestAudit({
      request,
      module: 'PAYROLL',
      action: 'PAYROLL_QUERY_REVIEW',
      entityType: 'PAYROLL_QUERY',
      entityId: queryId,
      metadata: { reviewerUserId: userId, newStatus: status, resolution },
      result: 'SUCCESS',
    });
  } catch (e) {}

  return response.status(200).json({
    success: true,
    message: `Payroll query ${queryId} status updated to ${status}.`,
    data: { query },
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  createSelfPayrollQuery,
  listSelfPayrollQueries,
  listOrgPayrollQueries,
  reviewPayrollQuery,
};

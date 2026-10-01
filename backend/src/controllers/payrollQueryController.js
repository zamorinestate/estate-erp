'use strict';

const { PayrollQuery, PAYROLL_QUERY_CATEGORIES, PAYROLL_QUERY_STATUSES } = require('../models/PayrollQuery');
const { NotificationOutbox } = require('../models/NotificationOutbox');
const { Notification } = require('../models/Notification');
const { User } = require('../models/User');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordRequestAudit } = require('../services/auditService');
const { SequenceCounter } = require('../models/SequenceCounter');
const { executeTransactionWithRetry } = require('../utils/transactionHelper');

// 1. Employee Self-Service: Submit Payroll Query
const createSelfPayrollQuery = asyncHandler(async (request, response) => {
  const {
    organisationId,
    userId,
    name,
    primaryCafeId = null,
    assignedCafeIds = [],
  } = request.auth;

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

  const cafeId = String(
    primaryCafeId ||
    (Array.isArray(assignedCafeIds) ? assignedCafeIds[0] : '') ||
    ''
  ).trim().toUpperCase();

  if (!cafeId) {
    throw new ApiError(
      409,
      'PAYROLL_QUERY_CAFE_SCOPE_REQUIRED',
      'Payroll inquiry cannot be submitted until the employee has an authoritative café assignment.'
    );
  }

  let createdQuery = null;

  await executeTransactionWithRetry(async (session) => {
    const dateStr = new Date().getFullYear();
    const queryId = await SequenceCounter.generateId({
      organisationId,
      sequenceKey: `PAYROLL_QUERY_${dateStr}`,
      prefix: `PQ-${dateStr}`,
      minimumDigits: 4,
      session,
    });

    const query = new PayrollQuery({
      queryId,
      organisationId,
      cafeId,
      employeeUserId: userId,
      employeeName: name || userId,
      payslipId: payslipId ? String(payslipId).trim() : null,
      periodKey: periodKey ? String(periodKey).trim() : null,
      category,
      subject: String(subject).trim(),
      description: String(description).trim(),
      status: 'SUBMITTED',
    });

    await query.save(session ? { session } : undefined);

    try {
      await recordRequestAudit({
        request,
        module: 'PAYROLL',
        action: 'PAYROLL_QUERY_SUBMIT',
        entityType: 'PAYROLL_QUERY',
        entityId: queryId,
        cafeId,
        after: {
          queryId,
          cafeId,
          employeeUserId: userId,
          status: 'SUBMITTED',
          category,
          periodKey,
          payslipId,
        },
        metadata: { userId, category, periodKey, payslipId, cafeId },
        result: 'SUCCESS',
        riskClassification: 'MEDIUM',
      }, { session });
    } catch (auditError) {
      if (!session) {
        const compensation = await PayrollQuery.deleteOne({
          _id: query._id,
          organisationId,
          queryId,
          status: 'SUBMITTED',
        });

        if (!compensation || compensation.deletedCount !== 1) {
          throw new ApiError(
            503,
            'PAYROLL_QUERY_AUDIT_COMPENSATION_FAILED',
            'Payroll inquiry audit failed and the newly created query could not be safely compensated.'
          );
        }
      }
      throw auditError;
    }

    createdQuery = query;
  });

  return response.status(201).json({
    success: true,
    message: 'Payroll inquiry submitted successfully and routed to payroll authority.',
    data: { query: createdQuery },
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
  const {
    organisationId,
    role,
    isPrimaryMaster,
    assignedCafeIds = [],
  } = request.auth;

  if (role === 'MASTER' && isPrimaryMaster !== true) {
    throw new ApiError(403, 'PRIMARY_MASTER_AUTHORITY_REQUIRED', 'Only the Primary Master may use Master payroll-query authority.');
  }
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Only Primary Master or Owner can view payroll queries.');
  }

  const { status, employeeUserId, page = 1, limit = 20 } = request.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const filter = { organisationId };

  if (role === 'OWNER') {
    const ownerCafeIds = (assignedCafeIds || [])
      .map((id) => String(id || '').trim().toUpperCase())
      .filter(Boolean);

    if (ownerCafeIds.length === 0) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner has no assigned café scope for payroll queries.');
    }
    filter.cafeId = { $in: ownerCafeIds };
  }

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
  const {
    organisationId,
    userId,
    role,
    isPrimaryMaster,
    assignedCafeIds = [],
  } = request.auth;

  if (role === 'MASTER' && isPrimaryMaster !== true) {
    throw new ApiError(403, 'PRIMARY_MASTER_AUTHORITY_REQUIRED', 'Only the Primary Master may use Master payroll-query authority.');
  }
  if (role !== 'MASTER' && role !== 'OWNER') {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Only Primary Master or Owner can resolve payroll queries.');
  }

  const queryId = request.params.queryId?.trim().toUpperCase();
  const { status, resolution = '' } = request.body || {};

  if (!status || !PAYROLL_QUERY_STATUSES.includes(status)) {
    throw new ApiError(400, 'INVALID_STATUS', `Status must be one of: ${PAYROLL_QUERY_STATUSES.join(', ')}`);
  }

  const scopeFilter = {
    organisationId,
    queryId,
  };

  if (role === 'OWNER') {
    const ownerCafeIds = (assignedCafeIds || [])
      .map((id) => String(id || '').trim().toUpperCase())
      .filter(Boolean);

    if (ownerCafeIds.length === 0) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner has no assigned café scope for payroll queries.');
    }
    scopeFilter.cafeId = { $in: ownerCafeIds };
  }

  const query = await PayrollQuery.findOne(scopeFilter);
  if (!query) {
    throw new ApiError(404, 'NOT_FOUND', `Payroll query ${queryId} not found in the authorized scope.`);
  }

  const before = {
    status: query.status,
    reviewerUserId: query.reviewerUserId || null,
    resolution: query.resolution || '',
    resolvedAt: query.resolvedAt || null,
  };

  let updatedQuery = null;

  await executeTransactionWithRetry(async (session) => {
    const nextResolvedAt =
      ['RESOLVED', 'REJECTED', 'CLOSED'].includes(status)
        ? new Date()
        : null;

    const updateFilter = {
      _id: query._id,
      organisationId,
      queryId,
      status: before.status,
    };
    if (role === 'OWNER') {
      updateFilter.cafeId = scopeFilter.cafeId;
    }

    const update = {
      $set: {
        status,
        reviewerUserId: userId,
        resolution: resolution ? resolution.trim() : '',
        resolvedAt: nextResolvedAt,
      },
    };

    const changed = await PayrollQuery.findOneAndUpdate(
      updateFilter,
      update,
      {
        new: true,
        ...(session ? { session } : {}),
      }
    );

    if (!changed) {
      throw new ApiError(
        409,
        'PAYROLL_QUERY_STATE_CONFLICT',
        'Payroll query changed while the review decision was being applied.'
      );
    }

    try {
      await recordRequestAudit({
        request,
        module: 'PAYROLL',
        action: 'PAYROLL_QUERY_REVIEW',
        entityType: 'PAYROLL_QUERY',
        entityId: queryId,
        cafeId: changed.cafeId || null,
        before,
        after: {
          status: changed.status,
          reviewerUserId: changed.reviewerUserId,
          resolution: changed.resolution,
          resolvedAt: changed.resolvedAt,
        },
        metadata: {
          reviewerUserId: userId,
          newStatus: status,
          cafeId: changed.cafeId || null,
        },
        result: 'SUCCESS',
        riskClassification: 'MEDIUM',
      }, { session });
    } catch (auditError) {
      if (!session) {
        const rollback = await PayrollQuery.findOneAndUpdate(
          {
            _id: changed._id,
            organisationId,
            queryId,
            status,
            reviewerUserId: userId,
          },
          {
            $set: {
              status: before.status,
              reviewerUserId: before.reviewerUserId,
              resolution: before.resolution,
              resolvedAt: before.resolvedAt,
            },
          },
          { new: true }
        );

        if (!rollback) {
          throw new ApiError(
            503,
            'PAYROLL_QUERY_AUDIT_ROLLBACK_FAILED',
            'Payroll query review audit failed and the state change could not be safely rolled back.'
          );
        }
      }
      throw auditError;
    }

    updatedQuery = changed;
  });

  // Notification delivery is post-commit and intentionally non-authoritative.
  try {
    const user = await User.findOne({
      organisationId,
      userId: updatedQuery.employeeUserId,
    }).select('email name').lean();

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
        recipientUserId: updatedQuery.employeeUserId,
        recipientEmail: user.email,
        recipientName: user.name,
        recipientRole: 'STAFF',
        templateId: 'PAYROLL_QUERY_RESOLUTION',
        subject: `Update on Payroll Inquiry ${updatedQuery.queryId}: ${status}`,
        renderedSubject: `Update on Payroll Inquiry ${updatedQuery.queryId}: ${status}`,
        renderedBody: `Your payroll inquiry regarding "${updatedQuery.subject}" has been updated to ${status}. Notes: ${resolution || 'None'}`,
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
        cafeId: updatedQuery.cafeId || null,
        eventType: 'PAYROLL_QUERY_UPDATE',
        category: 'OPERATIONS',
        recipientUserId: updatedQuery.employeeUserId,
        recipientRole: 'STAFF',
        recipientEmail: user.email,
        title: `Payroll Inquiry ${updatedQuery.queryId} ${status}`,
        message: `Your inquiry has been updated to ${status}. Details: ${resolution || 'Review complete.'}`,
        priority: 'NORMAL',
        channels: ['IN_APP'],
        deepLink: '#staff-payslips?tab=queries',
        sourceModule: 'PAYROLL',
        sourceEntityType: 'PAYROLL_QUERY',
        sourceEntityId: updatedQuery.queryId,
        createdBy: userId,
        status: 'DELIVERED',
        deliveredAt: new Date(),
      });
    }
  } catch (notifErr) {
    console.warn(`[PAYROLL_QUERY_NOTIFICATION_WARN] ${notifErr.message}`);
  }

  return response.status(200).json({
    success: true,
    message: `Payroll query ${queryId} status updated to ${status}.`,
    data: { query: updatedQuery },
    correlationId: request.correlationId || null,
  });
});

module.exports = {
  createSelfPayrollQuery,
  listSelfPayrollQueries,
  listOrgPayrollQueries,
  reviewPayrollQuery,
};

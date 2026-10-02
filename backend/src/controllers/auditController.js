'use strict';

const {
  AuditEvent,
  AUDIT_RESULTS,
  RISK_CLASSIFICATIONS,
} = require('../models/AuditEvent');

const {
  asyncHandler,
} = require('../utils/asyncHandler');

const {
  ApiError,
} = require('../utils/ApiError');
const { assertCanonicalMasterState } = require('../utils/cafeScope');

function normalizeIdentifier(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function requireMaster(request) {
  assertCanonicalMasterState(request.auth);
  if (request.auth.role !== 'MASTER') {
    throw new ApiError(
      403,
      'MASTER_ACCESS_REQUIRED',
      'Only the MASTER role may access the audit log.'
    );
  }
}

function parsePositiveInteger(
  value,
  fallback,
  maximum
) {
  const parsedValue =
    Number.parseInt(value, 10);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 1
  ) {
    return fallback;
  }

  return Math.min(
    parsedValue,
    maximum
  );
}

function parseDate(value, fieldName) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    throw new ApiError(
      400,
      'INVALID_DATE_FILTER',
      `${fieldName} must be a valid date.`
    );
  }

  return parsedDate;
}

function buildAuditFilter(request) {
  const filter = {
    organisationId:
      request.auth.organisationId,
  };

  const identifierFilters = {
    cafeId: request.query.cafeId,
    actorUserId:
      request.query.actorUserId,
    module: request.query.module,
    action: request.query.action,
    entityType:
      request.query.entityType,
    entityId:
      request.query.entityId,
  };

  Object.entries(
    identifierFilters
  ).forEach(([field, value]) => {
    const normalizedValue =
      normalizeIdentifier(value);

    if (normalizedValue) {
      filter[field] =
        normalizedValue;
    }
  });

  const result =
    normalizeIdentifier(
      request.query.result
    );

  if (result) {
    if (
      !AUDIT_RESULTS.includes(result)
    ) {
      throw new ApiError(
        400,
        'INVALID_AUDIT_RESULT',
        'The requested audit result is invalid.'
      );
    }

    filter.result = result;
  }

  const riskClassification =
    normalizeIdentifier(
      request.query.riskClassification
    );

  if (riskClassification) {
    if (
      !RISK_CLASSIFICATIONS.includes(
        riskClassification
      )
    ) {
      throw new ApiError(
        400,
        'INVALID_RISK_CLASSIFICATION',
        'The requested risk classification is invalid.'
      );
    }

    filter.riskClassification =
      riskClassification;
  }

  const fromDate = parseDate(
    request.query.fromDate,
    'fromDate'
  );

  const toDate = parseDate(
    request.query.toDate,
    'toDate'
  );

  if (fromDate || toDate) {
    filter.serverTimestamp = {};

    if (fromDate) {
      filter.serverTimestamp.$gte =
        fromDate;
    }

    if (toDate) {
      filter.serverTimestamp.$lte =
        toDate;
    }
  }

  if (
    fromDate &&
    toDate &&
    fromDate > toDate
  ) {
    throw new ApiError(
      400,
      'INVALID_DATE_RANGE',
      'fromDate cannot be later than toDate.'
    );
  }

  return filter;
}

const listAuditEvents = asyncHandler(
  async (request, response) => {
  assertCanonicalMasterState(request.auth);
    requireMaster(request);

    const page =
      parsePositiveInteger(
        request.query.page,
        1,
        100000
      );

    const limit =
      parsePositiveInteger(
        request.query.limit,
        25,
        100
      );

    const filter =
      buildAuditFilter(request);

    const skip =
      (page - 1) * limit;

    const [
      auditEvents,
      total,
    ] = await Promise.all([
      AuditEvent.find(filter)
        .sort({
          serverTimestamp: -1,
          auditEventId: -1,
        })
        .skip(skip)
        .limit(limit),

      AuditEvent.countDocuments(
        filter
      ),
    ]);

    return response.status(200).json({
      success: true,
      data: {
        auditEvents,
        pagination: {
          page,
          limit,
          total,
          totalPages:
            Math.ceil(total / limit),
        },
      },
      correlationId:
        request.correlationId || null,
    });
  }
);

const getAuditEvent = asyncHandler(
  async (request, response) => {
  assertCanonicalMasterState(request.auth);
    requireMaster(request);

    const auditEventId =
      normalizeIdentifier(
        request.params.auditEventId
      );

    if (!auditEventId) {
      throw new ApiError(
        400,
        'AUDIT_EVENT_ID_REQUIRED',
        'An audit event ID is required.'
      );
    }

    const auditEvent =
      await AuditEvent.findOne({
        organisationId:
          request.auth.organisationId,
        auditEventId,
      });

    if (!auditEvent) {
      throw new ApiError(
        404,
        'AUDIT_EVENT_NOT_FOUND',
        'The audit event was not found.'
      );
    }

    return response.status(200).json({
      success: true,
      data: {
        auditEvent,
      },
      correlationId:
        request.correlationId || null,
    });
  }
);

module.exports = {
  listAuditEvents,
  getAuditEvent,
};
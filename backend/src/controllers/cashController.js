'use strict';

const {
  CashTransaction,
  CASH_TRANSACTION_TYPES,
  CASH_TRANSACTION_STATUSES,
} = require('../models/CashTransaction');

const {
  Cafe,
} = require('../models/Cafe');

const {
  SequenceCounter,
} = require('../models/SequenceCounter');

const {
  asyncHandler,
} = require('../utils/asyncHandler');

const {
  ApiError,
} = require('../utils/ApiError');

const { resolveEffectiveCafeScope, assertResourceCafeOwnership, assertCanonicalMasterState } = require('../utils/cafeScope');
const auditService = require('../services/auditService');

const PAYMENT_METHODS = [
  'CASH',
  'CARD',
  'UPI',
  'BANK_TRANSFER',
  'WALLET',
  'CREDIT',
];

const INWARD_TRANSACTION_TYPES = [
  'OPENING_BALANCE',
  'CASH_IN',
  'PAID_IN',
  'CASH_TRANSFER_IN',
];

const OUTWARD_TRANSACTION_TYPES = [
  'CASH_OUT',
  'PAID_OUT',
  'BANK_DEPOSIT',
  'CASH_TRANSFER_OUT',
];

function normalizeIdentifier(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function getIstBusinessDate(date = new Date()) {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }
  ).format(date);
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

function ensureCafeAccess(
  request,
  cafeId
) {
  assertCanonicalMasterState(request.auth);
  if (!cafeId) return;
  const cleanCafe = cafeId.trim().toUpperCase();
  const role = request?.auth?.role;
  const rawWorkspace = request?.headers?.['x-workspace'] || request?.auth?.workspaceMode || '';
  const workspaceMode = String(rawWorkspace).trim().toUpperCase();
  if (role === 'MASTER' && request?.auth?.isPrimaryMaster === true && workspaceMode !== 'CAFE_OPERATIONS') return;
  if (role === 'OWNER') {
    const assignedCafeIds = (request?.auth?.assignedCafeIds || []).map((c) => String(c).trim().toUpperCase());
    if (assignedCafeIds.length === 0 || !assignedCafeIds.includes(cleanCafe)) {
      throw new ApiError(
        403,
        'CROSS_CAFE_RESOURCE_DENIED',
        'Cross-café access is denied. You are not authorized for the requested café.'
      );
    }
    return;
  }
  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (effectiveCafe && effectiveCafe !== cleanCafe) {
    throw new ApiError(
      403,
      'CROSS_CAFE_RESOURCE_DENIED',
      'Cross-café access is denied. You are not authorized for the requested café.'
    );
  }
}

function requireCashEntryRole(request) {
  assertCanonicalMasterState(request.auth);
  if (
    ![
      'MASTER',
      'CAFE_ADMIN',
    ].includes(request.auth.role)
  ) {
    throw new ApiError(
      403,
      'CASH_ENTRY_ACCESS_DENIED',
      'Only MASTER and Café Admin roles may record cash transactions.'
    );
  }
}

function requireMaster(request) {
  assertCanonicalMasterState(request.auth);
  if (request.auth.role !== 'MASTER' || request.auth.isPrimaryMaster !== true) {
    throw new ApiError(
      403,
      'MASTER_ACCESS_REQUIRED',
      'Only the Primary MASTER role may reverse cash transactions.'
    );
  }
}

async function validateActiveCafe(
  request,
  cafeId
) {
  ensureCafeAccess(
    request,
    cafeId
  );

  const cafe = await Cafe.findOne({
    organisationId:
      request.auth.organisationId,
    cafeId,
    status: 'ACTIVE',
    archivedAt: null,
  });

  if (!cafe) {
    throw new ApiError(
      404,
      'ACTIVE_CAFE_NOT_FOUND',
      'An active café was not found.'
    );
  }

  return cafe;
}

function resolveDirection(
  transactionType,
  requestedDirection
) {
  if (
    INWARD_TRANSACTION_TYPES.includes(
      transactionType
    )
  ) {
    return 'IN';
  }

  if (
    OUTWARD_TRANSACTION_TYPES.includes(
      transactionType
    )
  ) {
    return 'OUT';
  }

  const direction =
    normalizeIdentifier(
      requestedDirection
    );

  if (
    transactionType ===
      'CLOSING_ADJUSTMENT' &&
    ['IN', 'OUT'].includes(direction)
  ) {
    return direction;
  }

  throw new ApiError(
    400,
    'TRANSACTION_DIRECTION_REQUIRED',
    'A valid IN or OUT direction is required for this transaction type.'
  );
}

function buildCashFilter(request) {
  assertCanonicalMasterState(request.auth);
  const filter = {
    organisationId:
      request.auth.organisationId,
  };

  if (request.auth.role === 'STAFF') {
    throw new ApiError(
      403,
      'CASH_BOOK_ACCESS_DENIED',
      'Staff users cannot access the Cash Book.'
    );
  }

  const effectiveCafe = resolveEffectiveCafeScope(request);
  if (effectiveCafe) {
    filter.cafeId = effectiveCafe;
  } else if (
    request.auth.role !==
    'MASTER'
  ) {
    if (request.auth.role === 'OWNER' && (!request.auth.assignedCafeIds || request.auth.assignedCafeIds.length === 0)) {
      throw new ApiError(403, 'CROSS_CAFE_RESOURCE_DENIED', 'Owner has no authorized café assignments.');
    }
    filter.cafeId = {
      $in:
        request.auth.assignedCafeIds ||
        [],
    };
  }

  const cafeId =
    normalizeIdentifier(
      request.query.cafeId
    );

  if (!effectiveCafe && cafeId && cafeId !== 'ALL') {
    ensureCafeAccess(
      request,
      cafeId
    );

    filter.cafeId = cafeId;
  }

  const businessDate =
    typeof request.query.businessDate ===
      'string'
      ? request.query.businessDate.trim()
      : '';

  if (businessDate) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        businessDate
      )
    ) {
      throw new ApiError(
        400,
        'INVALID_BUSINESS_DATE',
        'businessDate must use YYYY-MM-DD format.'
      );
    }

    filter.businessDate =
      businessDate;
  }

  const transactionType =
    normalizeIdentifier(
      request.query.transactionType
    );

  if (transactionType) {
    if (
      !CASH_TRANSACTION_TYPES.includes(
        transactionType
      )
    ) {
      throw new ApiError(
        400,
        'INVALID_CASH_TRANSACTION_TYPE',
        'The cash transaction type is invalid.'
      );
    }

    filter.transactionType =
      transactionType;
  }

  const status =
    normalizeIdentifier(
      request.query.status
    );

  if (status) {
    if (
      !CASH_TRANSACTION_STATUSES.includes(
        status
      )
    ) {
      throw new ApiError(
        400,
        'INVALID_CASH_TRANSACTION_STATUS',
        'The cash transaction status is invalid.'
      );
    }

    filter.status = status;
  }

  const direction =
    normalizeIdentifier(
      request.query.direction
    );

  if (direction) {
    if (
      !['IN', 'OUT'].includes(
        direction
      )
    ) {
      throw new ApiError(
        400,
        'INVALID_CASH_DIRECTION',
        'Cash direction must be IN or OUT.'
      );
    }

    filter.direction = direction;
  }

  return filter;
}

const listCashTransactions =
  asyncHandler(
    async (request, response) => {
      assertCanonicalMasterState(request.auth);
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
        buildCashFilter(request);

      const skip =
        (page - 1) * limit;

      const [
        cashTransactions,
        total,
      ] = await Promise.all([
        CashTransaction.find(filter)
          .sort({
            recordedAt: -1,
            cashTransactionId: -1,
          })
          .skip(skip)
          .limit(limit),

        CashTransaction.countDocuments(
          filter
        ),
      ]);

      return response.status(200).json({
        success: true,
        data: {
          cashTransactions,
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

const getCashTransaction =
  asyncHandler(
    async (request, response) => {
      assertCanonicalMasterState(request.auth);
      const cashTransactionId =
        normalizeIdentifier(
          request.params.cashTransactionId
        );

      const cashTransaction =
        await CashTransaction.findOne({
          organisationId:
            request.auth.organisationId,
          cashTransactionId,
        });

      if (!cashTransaction) {
        throw new ApiError(
          404,
          'CASH_TRANSACTION_NOT_FOUND',
          'The cash transaction was not found.'
        );
      }

      ensureCafeAccess(
        request,
        cashTransaction.cafeId
      );

      if (
        request.auth.role === 'STAFF'
      ) {
        throw new ApiError(
          403,
          'CASH_BOOK_ACCESS_DENIED',
          'Staff users cannot access the Cash Book.'
        );
      }

      return response.status(200).json({
        success: true,
        data: {
          cashTransaction,
        },
        correlationId:
          request.correlationId || null,
      });
    }
  );

const createCashTransaction =
  asyncHandler(
    async (request, response) => {
      requireCashEntryRole(request);

      const cafeId =
        normalizeIdentifier(
          request.body?.cafeId
        );

      const transactionType =
        normalizeIdentifier(
          request.body?.transactionType
        );

      const category =
        normalizeIdentifier(
          request.body?.category
        );

      const amount =
        Number(request.body?.amount);

      const paymentMethod =
        normalizeIdentifier(
          request.body?.paymentMethod ||
          'CASH'
        );

      if (!cafeId) {
        throw new ApiError(
          400,
          'CAFE_ID_REQUIRED',
          'A café ID is required.'
        );
      }

      if (
        !CASH_TRANSACTION_TYPES.includes(
          transactionType
        )
      ) {
        throw new ApiError(
          400,
          'INVALID_CASH_TRANSACTION_TYPE',
          'A valid cash transaction type is required.'
        );
      }

      if (!category) {
        throw new ApiError(
          400,
          'CASH_CATEGORY_REQUIRED',
          'A cash transaction category is required.'
        );
      }

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new ApiError(
          400,
          'INVALID_CASH_AMOUNT',
          'The cash amount must be greater than zero.'
        );
      }

      if (
        !PAYMENT_METHODS.includes(
          paymentMethod
        )
      ) {
        throw new ApiError(
          400,
          'INVALID_PAYMENT_METHOD',
          'The payment method is invalid.'
        );
      }

      await validateActiveCafe(
        request,
        cafeId
      );

      const direction =
        resolveDirection(
          transactionType,
          request.body?.direction
        );

      const now = new Date();

      const businessDate =
        getIstBusinessDate(now);

      const datePart =
        businessDate.replaceAll(
          '-',
          ''
        );

      const cashTransactionId =
        await SequenceCounter.generateId({
          organisationId:
            request.auth.organisationId,
          sequenceKey:
            `CASH_TRANSACTION_${datePart}`,
          prefix:
            `CT-${datePart}`,
          minimumDigits: 4,
        });

      const cashTransaction =
        await CashTransaction.create({
          cashTransactionId,
          organisationId:
            request.auth.organisationId,
          cafeId,
          businessDate,
          transactionType,
          direction,
          category,
          amount,
          currency: 'INR',
          paymentMethod,
          referenceType:
            normalizeIdentifier(
              request.body?.referenceType
            ) || null,
          referenceId:
            normalizeIdentifier(
              request.body?.referenceId
            ) || null,
          description:
            typeof request.body
              ?.description === 'string'
              ? request.body.description.trim()
              : '',
          notes:
            typeof request.body?.notes ===
              'string'
              ? request.body.notes.trim()
              : '',
          status: 'POSTED',
          recordedAt: now,
          recordedBy:
            request.auth.userId,
          timezone: 'Asia/Kolkata',
          createdBy:
            request.auth.userId,
          updatedBy:
            request.auth.userId,
        });

      return response.status(201).json({
        success: true,
        message:
          'Cash transaction recorded successfully.',
        data: {
          cashTransaction,
        },
        correlationId:
          request.correlationId || null,
      });
    }
  );

const getCashSummary =
  asyncHandler(
    async (request, response) => {
      const filter =
        buildCashFilter(request);

      filter.status = 'POSTED';

      const summary =
        await CashTransaction.aggregate([
          {
            $match: filter,
          },
          {
            $group: {
              _id: '$direction',
              amount: {
                $sum: '$amount',
              },
              count: {
                $sum: 1,
              },
            },
          },
        ]);

      const totals = {
        cashIn: 0,
        cashOut: 0,
        netCashFlow: 0,
        transactionCount: 0,
      };

      summary.forEach((item) => {
        totals.transactionCount +=
          item.count;

        if (item._id === 'IN') {
          totals.cashIn =
            item.amount;
        }

        if (item._id === 'OUT') {
          totals.cashOut =
            item.amount;
        }
      });

      totals.netCashFlow =
        totals.cashIn -
        totals.cashOut;

      return response.status(200).json({
        success: true,
        data: {
          currency: 'INR',
          totals,
        },
        correlationId:
          request.correlationId || null,
      });
    }
  );

const reverseCashTransaction =
  asyncHandler(
    async (request, response) => {
      requireMaster(request);

      const cashTransactionId =
        normalizeIdentifier(
          request.params.cashTransactionId
        );

      const reason =
        typeof request.body?.reason ===
          'string'
          ? request.body.reason.trim()
          : '';

      if (!reason) {
        throw new ApiError(
          400,
          'REVERSAL_REASON_REQUIRED',
          'A reversal reason is required.'
        );
      }

      const cashTransaction =
        await CashTransaction.findOne({
          organisationId:
            request.auth.organisationId,
          cashTransactionId,
        });

      if (!cashTransaction) {
        throw new ApiError(
          404,
          'CASH_TRANSACTION_NOT_FOUND',
          'The cash transaction was not found.'
        );
      }

      ensureCafeAccess(
        request,
        cashTransaction.cafeId
      );

      if (
        cashTransaction.status ===
        'REVERSED'
      ) {
        throw new ApiError(
          409,
          'CASH_TRANSACTION_ALREADY_REVERSED',
          'The cash transaction has already been reversed.'
        );
      }

      const now = new Date();
      const businessDate =
        getIstBusinessDate(now);
      const datePart =
        businessDate.replaceAll(
          '-',
          ''
        );

      const reversalTransactionId =
        await SequenceCounter.generateId({
          organisationId:
            request.auth.organisationId,
          sequenceKey:
            `CASH_REVERSAL_${datePart}`,
          prefix:
            `CR-${datePart}`,
          minimumDigits: 4,
        });

      await cashTransaction.reverse({
        userId:
          request.auth.userId,
        reason,
        reversalTransactionId,
      });

      await auditService.recordAuditEvent({
        organisationId:
          request.auth.organisationId,
        cafeId:
          cashTransaction.cafeId,
        actorId:
          request.auth.userId,
        action:
          'CASH_TRANSACTION_REVERSED',
        entityType:
          'CASH_TRANSACTION',
        entityId:
          cashTransaction.cashTransactionId,
        details: {
          originalTransactionId:
            cashTransaction.cashTransactionId,
          reversalTransactionId,
          amount:
            cashTransaction.amount,
          direction:
            cashTransaction.direction,
          reason,
          reversedAt:
            cashTransaction.reversedAt,
        },
      });

      return response.status(200).json({
        success: true,
        message:
          'Cash transaction reversed successfully.',
        data: {
          cashTransaction,
          reversalTransactionId,
        },
        correlationId:
          request.correlationId || null,
      });
    }
  );

module.exports = {
  listCashTransactions,
  getCashTransaction,
  createCashTransaction,
  getCashSummary,
  reverseCashTransaction,
};
